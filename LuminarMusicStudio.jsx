import { useState, useRef, useEffect, useCallback } from "react";

const STEPS = 16;
const TRACKS = ["Kick", "Snare", "Hi-Hat", "Clap", "Bass", "Melody"];
const TRACK_COLORS = ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff","#ff9f1c"];

const initGrid = () => TRACKS.map(() => Array(STEPS).fill(false));

const NOTE_FREQS = {
  Kick: 60, Snare: 200, "Hi-Hat": 800, Clap: 1200, Bass: 80, Melody: 440
};

export default function LuminarMusicStudio() {
  const [tab, setTab] = useState("beats");
  const [grid, setGrid] = useState(initGrid());
  const [bpm, setBpm] = useState(120);
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiBeats, setAiBeats] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordings, setRecordings] = useState([]);
  const [coverImg, setCoverImg] = useState(null);
  const [trackName, setTrackName] = useState("Untitled Track");
  const [artistName, setArtistName] = useState("Artist");
  const [coverText, setCoverText] = useState("");
  const [stemUrl, setStemUrl] = useState("");
  const [stemLoading, setStemLoading] = useState(false);
  const [stemResult, setStemResult] = useState(null);
  const [hfKey, setHfKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [volumes, setVolumes] = useState(TRACKS.map(() => 0.7));
  const [muted, setMuted] = useState(TRACKS.map(() => false));
  const [notification, setNotification] = useState(null);

  const audioCtxRef = useRef(null);
  const intervalRef = useRef(null);
  const stepRef = useRef(0);
  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const canvasRef = useRef(null);
  const coverCanvasRef = useRef(null);

  const notify = (msg, type = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const getCtx = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtxRef.current;
  };

  const playSound = useCallback((trackIdx, vol = 0.7) => {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const freq = Object.values(NOTE_FREQS)[trackIdx];
    osc.frequency.value = freq;
    const t = ctx.currentTime;
    if (trackIdx === 0) { // Kick
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);
    } else if (trackIdx === 2) { // Hi-Hat
      osc.type = "sawtooth";
    } else if (trackIdx === 3) { // Clap
      osc.type = "square";
    }
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (trackIdx < 2 ? 0.5 : 0.2));
    osc.start(t);
    osc.stop(t + 0.5);
  }, []);

  useEffect(() => {
    if (playing) {
      const interval = (60 / bpm / 4) * 1000;
      intervalRef.current = setInterval(() => {
        const step = stepRef.current;
        setCurrentStep(step);
        grid.forEach((track, ti) => {
          if (track[step] && !muted[ti]) playSound(ti, volumes[ti]);
        });
        stepRef.current = (step + 1) % STEPS;
      }, interval);
    } else {
      clearInterval(intervalRef.current);
      setCurrentStep(-1);
      stepRef.current = 0;
    }
    return () => clearInterval(intervalRef.current);
  }, [playing, bpm, grid, volumes, muted, playSound]);

  const toggleCell = (ti, si) => {
    setGrid(g => g.map((row, r) => r === ti ? row.map((v, c) => c === si ? !v : v) : row));
  };

  const clearGrid = () => setGrid(initGrid());

  const generateAIBeats = async () => {
    if (!hfKey) { setShowKeyInput(true); return; }
    if (!aiPrompt) { notify("Enter a beat description", "warn"); return; }
    setAiLoading(true);
    try {
      const resp = await fetch("https://api-inference.huggingface.co/models/facebook/musicgen-small", {
        method: "POST",
        headers: { Authorization: `Bearer ${hfKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: aiPrompt, parameters: { max_new_tokens: 256, duration: 8 } })
      });
      if (!resp.ok) throw new Error("HF API error: " + resp.status);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setAiBeats(url);
      notify("Beat generated!", "success");
    } catch (e) {
      notify("Generation failed: " + e.message, "error");
    }
    setAiLoading(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecRef.current.ondataavailable = e => chunksRef.current.push(e.data);
      mediaRecRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setRecordings(r => [...r, { url, name: `Take ${r.length + 1}`, id: Date.now() }]);
        notify("Recording saved!", "success");
      };
      mediaRecRef.current.start();
      setRecording(true);
    } catch (e) { notify("Mic access denied", "error"); }
  };

  const stopRecording = () => {
    mediaRecRef.current?.stop();
    setRecording(false);
  };

  const deleteRecording = (id) => setRecordings(r => r.filter(x => x.id !== id));

  const handleCoverImg = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCoverImg(ev.target.result);
    reader.readAsDataURL(file);
  };

  const exportCover = () => {
    const canvas = coverCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${trackName}-cover.png`;
    link.href = canvas.toDataURL();
    link.click();
    notify("Cover exported!", "success");
  };

  useEffect(() => {
    const canvas = coverCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 300, 300);
    if (coverImg) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 300, 300);
        drawCoverText(ctx);
      };
      img.src = coverImg;
    } else {
      ctx.fillStyle = "#0d0d1a";
      ctx.fillRect(0, 0, 300, 300);
      const grad = ctx.createLinearGradient(0, 0, 300, 300);
      grad.addColorStop(0, "rgba(100,50,255,0.4)");
      grad.addColorStop(1, "rgba(255,100,100,0.2)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 300, 300);
      drawCoverText(ctx);
    }
  }, [coverImg, trackName, artistName, coverText]);

  const drawCoverText = (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 220, 300, 80);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px monospace";
    ctx.fillText(trackName, 16, 248);
    ctx.font = "14px monospace";
    ctx.fillStyle = "#aaaaaa";
    ctx.fillText(artistName, 16, 270);
    if (coverText) { ctx.fillStyle = "#ff6b6b"; ctx.font = "11px monospace"; ctx.fillText(coverText, 16, 290); }
  };

  const saveToStorage = async () => {
    try {
      const canvas = coverCanvasRef.current;
      const coverData = canvas ? canvas.toDataURL() : null;
      const record = { id: Date.now(), trackName, artistName, grid, bpm, recordings: recordings.map(r => r.name), cover: coverData, createdAt: new Date().toISOString() };
      const req = indexedDB.open("luminar_music", 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore("tracks", { keyPath: "id" });
      req.onsuccess = e => {
        const db = e.target.result;
        db.transaction("tracks", "readwrite").objectStore("tracks").add(record);
        notify("Saved to library!", "success");
      };
    } catch (e) { notify("Save failed", "error"); }
  };

  const tabs = [
    { id: "beats", label: "Beat Maker" },
    { id: "vocals", label: "Vocals" },
    { id: "ai", label: "AI Studio" },
    { id: "cover", label: "Cover Art" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#e0e0ff", fontFamily: "'Courier New', monospace", position: "relative", overflow: "hidden" }}>
      {/* BG glow */}
      <div style={{ position: "fixed", top: "-20%", left: "-10%", width: "50vw", height: "50vw", background: "radial-gradient(circle, rgba(100,50,255,0.12) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: "-20%", right: "-10%", width: "40vw", height: "40vw", background: "radial-gradient(circle, rgba(255,100,100,0.08) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* Notification */}
      {notification && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 999, background: notification.type === "success" ? "rgba(107,203,119,0.15)" : notification.type === "error" ? "rgba(255,100,100,0.15)" : "rgba(100,100,255,0.15)", border: `1px solid ${notification.type === "success" ? "#6bcb77" : notification.type === "error" ? "#ff6b6b" : "#6464ff"}`, borderRadius: 8, padding: "10px 18px", fontSize: 13, backdropFilter: "blur(10px)" }}>
          {notification.msg}
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 6, color: "#6464ff", marginBottom: 4 }}>LUMINAR</div>
            <div style={{ fontSize: 22, fontWeight: "bold", letterSpacing: 2 }}>MUSIC STUDIO</div>
          </div>
          <button onClick={() => setShowKeyInput(!showKeyInput)} style={{ background: "rgba(100,50,255,0.15)", border: "1px solid rgba(100,50,255,0.4)", color: "#a080ff", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 11, letterSpacing: 1 }}>
            {hfKey ? "🔑 HF KEY SET" : "🔑 SET HF KEY"}
          </button>
        </div>

        {showKeyInput && (
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 16, marginBottom: 20, backdropFilter: "blur(10px)" }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>HUGGING FACE API KEY</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="password" value={hfKey} onChange={e => setHfKey(e.target.value)} placeholder="hf_..." style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 12px", color: "#e0e0ff", fontSize: 13, outline: "none", fontFamily: "monospace" }} />
              <button onClick={() => { setShowKeyInput(false); notify("Key saved!", "success"); }} style={{ background: "rgba(100,50,255,0.3)", border: "1px solid rgba(100,50,255,0.5)", color: "#c0a0ff", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 12 }}>Save</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "10px 0", background: tab === t.id ? "rgba(100,50,255,0.3)" : "transparent", border: tab === t.id ? "1px solid rgba(100,50,255,0.5)" : "1px solid transparent", borderRadius: 8, color: tab === t.id ? "#c0a0ff" : "#666", cursor: "pointer", fontSize: 11, letterSpacing: 1, transition: "all 0.2s" }}>
              {t.label.toUpperCase()}
            </button>
          ))}
        </div>

        {/* BEAT MAKER */}
        {tab === "beats" && (
          <div>
            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <button onClick={() => setPlaying(!playing)} style={{ background: playing ? "rgba(255,100,100,0.2)" : "rgba(107,203,119,0.2)", border: `1px solid ${playing ? "#ff6b6b" : "#6bcb77"}`, color: playing ? "#ff6b6b" : "#6bcb77", borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontSize: 13, letterSpacing: 2, fontFamily: "monospace" }}>
                {playing ? "■ STOP" : "▶ PLAY"}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <span style={{ fontSize: 11, color: "#666", letterSpacing: 1 }}>BPM</span>
                <input type="range" min={60} max={200} value={bpm} onChange={e => setBpm(Number(e.target.value))} style={{ flex: 1, accentColor: "#6464ff" }} />
                <span style={{ fontSize: 14, color: "#c0a0ff", minWidth: 36, textAlign: "right" }}>{bpm}</span>
              </div>
              <button onClick={clearGrid} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "#888", borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontSize: 11, letterSpacing: 1 }}>CLEAR</button>
            </div>

            {/* Grid */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.07)" }}>
              {TRACKS.map((track, ti) => (
                <div key={track} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: ti < TRACKS.length - 1 ? 10 : 0 }}>
                  <div style={{ width: 60, fontSize: 10, color: TRACK_COLORS[ti], letterSpacing: 1, flexShrink: 0 }}>{track.toUpperCase()}</div>
                  <div style={{ display: "flex", gap: 4, flex: 1 }}>
                    {Array(STEPS).fill(0).map((_, si) => (
                      <button key={si} onClick={() => toggleCell(ti, si)} style={{ flex: 1, height: 32, borderRadius: 4, border: "none", cursor: "pointer", background: currentStep === si ? (grid[ti][si] ? TRACK_COLORS[ti] : "rgba(255,255,255,0.15)") : grid[ti][si] ? TRACK_COLORS[ti] : "rgba(255,255,255,0.06)", transition: "background 0.05s", opacity: muted[ti] ? 0.3 : 1, boxShadow: grid[ti][si] && currentStep === si ? `0 0 8px ${TRACK_COLORS[ti]}` : "none" }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="range" min={0} max={1} step={0.1} value={volumes[ti]} onChange={e => setVolumes(v => v.map((x, i) => i === ti ? Number(e.target.value) : x))} style={{ width: 50, accentColor: TRACK_COLORS[ti] }} />
                    <button onClick={() => setMuted(m => m.map((x, i) => i === ti ? !x : x))} style={{ background: muted[ti] ? "rgba(255,100,100,0.2)" : "rgba(255,255,255,0.07)", border: `1px solid ${muted[ti] ? "#ff6b6b" : "rgba(255,255,255,0.1)"}`, color: muted[ti] ? "#ff6b6b" : "#888", borderRadius: 4, width: 28, height: 28, cursor: "pointer", fontSize: 9, letterSpacing: 0.5 }}>M</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Step indicator */}
            <div style={{ display: "flex", gap: 4, marginTop: 8, paddingLeft: 68 }}>
              {Array(STEPS).fill(0).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: currentStep === i ? "#c0a0ff" : i % 4 === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)", transition: "background 0.05s" }} />
              ))}
            </div>
          </div>
        )}

        {/* VOCALS */}
        {tab === "vocals" && (
          <div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginBottom: 16, textAlign: "center" }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: recording ? "rgba(255,100,100,0.2)" : "rgba(100,50,255,0.2)", border: `2px solid ${recording ? "#ff6b6b" : "rgba(100,50,255,0.5)"}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", cursor: "pointer", transition: "all 0.2s", boxShadow: recording ? "0 0 30px rgba(255,100,100,0.3)" : "none" }} onClick={recording ? stopRecording : startRecording}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill={recording ? "#ff6b6b" : "#a080ff"}>
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" fill="none" stroke={recording ? "#ff6b6b" : "#a080ff"} strokeWidth="2" strokeLinecap="round" />
                  <line x1="12" y1="17" x2="12" y2="21" stroke={recording ? "#ff6b6b" : "#a080ff"} strokeWidth="2" />
                  <line x1="9" y1="21" x2="15" y2="21" stroke={recording ? "#ff6b6b" : "#a080ff"} strokeWidth="2" />
                </svg>
              </div>
              <div style={{ fontSize: 13, color: recording ? "#ff6b6b" : "#888", letterSpacing: 2 }}>{recording ? "● RECORDING... TAP TO STOP" : "TAP TO RECORD"}</div>
              {recording && <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 3 }}>{[...Array(5)].map((_, i) => (<div key={i} style={{ width: 4, borderRadius: 2, background: "#ff6b6b", animation: `wave ${0.5 + i * 0.1}s ease-in-out infinite alternate`, height: 8 + Math.random() * 24 }} />))}</div>}
            </div>

            {recordings.length > 0 && (
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 2, marginBottom: 12 }}>RECORDINGS</div>
                {recordings.map(r => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ fontSize: 12, color: "#c0a0ff", flex: 1 }}>{r.name}</div>
                    <audio controls src={r.url} style={{ height: 28, flex: 2 }} />
                    <button onClick={() => deleteRecording(r.id)} style={{ background: "rgba(255,100,100,0.15)", border: "1px solid rgba(255,100,100,0.3)", color: "#ff6b6b", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <style>{`@keyframes wave { from { transform: scaleY(0.5); } to { transform: scaleY(1.5); } }`}</style>
          </div>
        )}

        {/* AI STUDIO */}
        {tab === "ai" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Beat Generator */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 20, border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 11, color: "#6464ff", letterSpacing: 2, marginBottom: 12 }}>AI BEAT GENERATOR · MUSICGEN</div>
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="lo-fi hip hop 90bpm chill vibes..." style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 14px", color: "#e0e0ff", fontSize: 13, outline: "none", fontFamily: "monospace", boxSizing: "border-box", marginBottom: 12 }} />
              <button onClick={generateAIBeats} disabled={aiLoading} style={{ background: aiLoading ? "rgba(100,50,255,0.1)" : "rgba(100,50,255,0.25)", border: "1px solid rgba(100,50,255,0.5)", color: aiLoading ? "#666" : "#c0a0ff", borderRadius: 8, padding: "10px 24px", cursor: aiLoading ? "not-allowed" : "pointer", fontSize: 12, letterSpacing: 2, width: "100%" }}>
                {aiLoading ? "GENERATING..." : "GENERATE BEAT"}
              </button>
              {aiBeats && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: "#6bcb77", letterSpacing: 1, marginBottom: 8 }}>✓ BEAT READY</div>
                  <audio controls src={aiBeats} style={{ width: "100%" }} />
                  <a href={aiBeats} download="luminar-beat.wav" style={{ display: "block", marginTop: 8, background: "rgba(107,203,119,0.1)", border: "1px solid rgba(107,203,119,0.3)", color: "#6bcb77", borderRadius: 8, padding: "8px 0", textAlign: "center", textDecoration: "none", fontSize: 11, letterSpacing: 2 }}>↓ DOWNLOAD</a>
                </div>
              )}
            </div>

            {/* Stem Splitter */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 20, border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 11, color: "#ffd93d", letterSpacing: 2, marginBottom: 4 }}>STEM SPLITTER · DEMUCS</div>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 12 }}>Paste a direct audio URL to split into vocals/drums/bass/melody</div>
              <input value={stemUrl} onChange={e => setStemUrl(e.target.value)} placeholder="https://... (direct audio file URL)" style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 14px", color: "#e0e0ff", fontSize: 13, outline: "none", fontFamily: "monospace", boxSizing: "border-box", marginBottom: 12 }} />
              <button onClick={async () => {
                if (!hfKey) { setShowKeyInput(true); return; }
                if (!stemUrl) { notify("Enter a URL", "warn"); return; }
                setStemLoading(true);
                try {
                  const resp = await fetch("https://api-inference.huggingface.co/models/facebook/demucs", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${hfKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ inputs: stemUrl })
                  });
                  if (!resp.ok) throw new Error(resp.status);
                  const blob = await resp.blob();
                  setStemResult(URL.createObjectURL(blob));
                  notify("Stems separated!", "success");
                } catch (e) { notify("Stem split failed: " + e.message, "error"); }
                setStemLoading(false);
              }} disabled={stemLoading} style={{ background: stemLoading ? "rgba(255,200,50,0.05)" : "rgba(255,200,50,0.15)", border: "1px solid rgba(255,200,50,0.4)", color: stemLoading ? "#666" : "#ffd93d", borderRadius: 8, padding: "10px 24px", cursor: stemLoading ? "not-allowed" : "pointer", fontSize: 12, letterSpacing: 2, width: "100%" }}>
                {stemLoading ? "SPLITTING..." : "SPLIT STEMS"}
              </button>
              {stemResult && <audio controls src={stemResult} style={{ width: "100%", marginTop: 12 }} />}
            </div>
          </div>
        )}

        {/* COVER ART */}
        {tab === "cover" && (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div style={{ flex: "0 0 300px" }}>
              <canvas ref={coverCanvasRef} width={300} height={300} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", display: "block" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <label style={{ flex: 1, background: "rgba(100,50,255,0.15)", border: "1px solid rgba(100,50,255,0.4)", color: "#c0a0ff", borderRadius: 8, padding: "8px 0", cursor: "pointer", fontSize: 11, letterSpacing: 1, textAlign: "center", display: "block" }}>
                  ↑ IMPORT
                  <input type="file" accept="image/*" onChange={handleCoverImg} style={{ display: "none" }} />
                </label>
                <button onClick={exportCover} style={{ flex: 1, background: "rgba(107,203,119,0.15)", border: "1px solid rgba(107,203,119,0.4)", color: "#6bcb77", borderRadius: 8, padding: "8px 0", cursor: "pointer", fontSize: 11, letterSpacing: 1 }}>↓ EXPORT</button>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 6 }}>TRACK NAME</div>
                <input value={trackName} onChange={e => setTrackName(e.target.value)} style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 12px", color: "#e0e0ff", fontSize: 13, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 6 }}>ARTIST NAME</div>
                <input value={artistName} onChange={e => setArtistName(e.target.value)} style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 12px", color: "#e0e0ff", fontSize: 13, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 6 }}>TAGLINE / LABEL</div>
                <input value={coverText} onChange={e => setCoverText(e.target.value)} placeholder="optional..." style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 12px", color: "#e0e0ff", fontSize: 13, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
              </div>
              <button onClick={saveToStorage} style={{ marginTop: "auto", background: "rgba(100,50,255,0.2)", border: "1px solid rgba(100,50,255,0.5)", color: "#c0a0ff", borderRadius: 8, padding: "12px 0", cursor: "pointer", fontSize: 12, letterSpacing: 2 }}>
                💾 SAVE TO LIBRARY
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
