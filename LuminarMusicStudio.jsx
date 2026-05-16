import { useState, useRef, useEffect, useCallback } from "react";

const STEPS = 16;

const INSTRUMENTS = [
  { name: "Kick",     color: "#ff6b6b", type: "kick" },
  { name: "Snare",    color: "#ffd93d", type: "snare" },
  { name: "Hi-Hat",   color: "#6bcb77", type: "hihat" },
  { name: "Open Hat", color: "#4d96ff", type: "openhat" },
  { name: "Clap",     color: "#c77dff", type: "clap" },
  { name: "Tom",      color: "#ff9f1c", type: "tom" },
  { name: "808",      color: "#ff6bc8", type: "808" },
  { name: "Perc",     color: "#6bffd9", type: "perc" },
  { name: "Shaker",   color: "#ffb86b", type: "shaker" },
  { name: "Bass",     color: "#a0ff6b", type: "bass" },
  { name: "Guitar",   color: "#6b8fff", type: "guitar" },
  { name: "Melody",   color: "#ff6b6b", type: "melody" },
];

const initGrid = () => INSTRUMENTS.map(() => Array(STEPS).fill(false));

export default function LuminarMusicStudio() {
  const [darkMode, setDarkMode] = useState(true);
  const [tab, setTab] = useState("beats");
  const [grid, setGrid] = useState(initGrid());
  const [bpm, setBpm] = useState(120);
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [volumes, setVolumes] = useState(INSTRUMENTS.map(() => 0.7));
  const [muted, setMuted] = useState(INSTRUMENTS.map(() => false));
  const [hfKey, setHfKey] = useState(() => { try { return localStorage.getItem("hf_key") || ""; } catch { return ""; } });
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [notification, setNotification] = useState(null);
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  const [showLandscapeHint, setShowLandscapeHint] = useState(false);

  // DAW state
  const [dawTracks, setDawTracks] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [dawDuration, setDawDuration] = useState(30);

  // AI state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLyrics, setAiLyrics] = useState("");
  const [aiStyle, setAiStyle] = useState("");
  const [aiMode, setAiMode] = useState("beats");
  const [sgLoading, setSgLoading] = useState(false);
  const [drLoading, setDrLoading] = useState(false);
  const [sgResult, setSgResult] = useState(null);
  const [drResult, setDrResult] = useState(null);

  // Cover art state
  const [coverImg, setCoverImg] = useState(null);
  const [trackName, setTrackName] = useState("Untitled Track");
  const [artistName, setArtistName] = useState("Artist");
  const [coverText, setCoverText] = useState("");
  const [showExplicit, setShowExplicit] = useState(false);

  const audioCtxRef = useRef(null);
  const intervalRef = useRef(null);
  const stepRef = useRef(0);
  const fileInputRef = useRef(null);
  const coverCanvasRef = useRef(null);
  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => { window.removeEventListener("resize", check); window.removeEventListener("orientationchange", check); };
  }, []);

  useEffect(() => {
    if (tab === "beats" && !isLandscape) setShowLandscapeHint(true);
    else setShowLandscapeHint(false);
  }, [tab, isLandscape]);

  // Redraw cover canvas whenever any cover state changes
  useEffect(() => {
    const canvas = coverCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 300, 300);
    const drawContent = () => {
      // Overlay
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 220, 300, 80);
      // Track name
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px monospace";
      ctx.fillText(trackName, 16, 248);
      // Artist
      ctx.font = "14px monospace";
      ctx.fillStyle = "#aaaaaa";
      ctx.fillText(artistName, 16, 270);
      // Tagline
      if (coverText) { ctx.fillStyle = "#ff6b6b"; ctx.font = "11px monospace"; ctx.fillText(coverText, 16, 290); }
      // Explicit badge
      if (showExplicit) {
        const bx = 300 - 48, by = 8, bw = 40, bh = 20;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = "#000000";
        ctx.font = "bold 10px monospace";
        ctx.fillText("E", bx + 4, by + 14);
        ctx.font = "7px monospace";
        ctx.fillText("EXPLICIT", bx + 14, by + 14);
      }
    };
    if (coverImg) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, 300, 300); drawContent(); };
      img.src = coverImg;
    } else {
      ctx.fillStyle = "#0d0d1a";
      ctx.fillRect(0, 0, 300, 300);
      const grad = ctx.createLinearGradient(0, 0, 300, 300);
      grad.addColorStop(0, "rgba(100,50,255,0.4)");
      grad.addColorStop(1, "rgba(255,100,100,0.2)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 300, 300);
      drawContent();
    }
  }, [coverImg, trackName, artistName, coverText, showExplicit, tab]);

  const notify = (msg, type = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const getCtx = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtxRef.current;
  };

  const playSound = useCallback((inst, vol = 0.7) => {
    const ctx = getCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(vol, t);
    const osc = ctx.createOscillator();
    osc.connect(gain);
    switch (inst.type) {
      case "kick":
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t); osc.stop(t + 0.5); break;
      case "snare": {
        const noise = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noise.buffer = buf;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(vol * 0.6, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        noise.connect(ng); ng.connect(ctx.destination); noise.start(t);
        osc.frequency.value = 200;
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.start(t); osc.stop(t + 0.1); break;
      }
      case "hihat": {
        const noise = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noise.buffer = buf;
        const hpf = ctx.createBiquadFilter();
        hpf.type = "highpass"; hpf.frequency.value = 8000;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(vol * 0.4, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        noise.connect(hpf); hpf.connect(ng); ng.connect(ctx.destination); noise.start(t);
        osc.disconnect(); break;
      }
      case "openhat": {
        const noise = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noise.buffer = buf;
        const hpf = ctx.createBiquadFilter();
        hpf.type = "highpass"; hpf.frequency.value = 7000;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(vol * 0.35, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        noise.connect(hpf); hpf.connect(ng); ng.connect(ctx.destination); noise.start(t);
        osc.disconnect(); break;
      }
      case "clap": {
        [0, 0.01, 0.02].forEach(offset => {
          const n = ctx.createBufferSource();
          const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          n.buffer = buf;
          const ng = ctx.createGain();
          ng.gain.setValueAtTime(vol * 0.5, t + offset);
          ng.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.1);
          n.connect(ng); ng.connect(ctx.destination); n.start(t + offset);
        });
        osc.disconnect(); break;
      }
      case "tom":
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t); osc.stop(t + 0.3); break;
      case "808":
        osc.type = "sine";
        osc.frequency.setValueAtTime(55, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        osc.start(t); osc.stop(t + 0.8); break;
      case "perc":
        osc.type = "triangle";
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t); osc.stop(t + 0.15); break;
      case "shaker": {
        const noise = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
        noise.buffer = buf;
        const bpf = ctx.createBiquadFilter();
        bpf.type = "bandpass"; bpf.frequency.value = 5000; bpf.Q.value = 0.5;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(vol * 0.5, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        noise.connect(bpf); bpf.connect(ng); ng.connect(ctx.destination); noise.start(t);
        osc.disconnect(); break;
      }
      case "bass":
        osc.type = "sawtooth";
        osc.frequency.value = 80;
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t); osc.stop(t + 0.4); break;
      case "guitar": {
        const freq = 196;
        const bufSize = Math.round(ctx.sampleRate / freq);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass"; filter.frequency.value = 2000;
        gain.gain.setValueAtTime(vol * 0.8, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        src.connect(filter); filter.connect(gain);
        src.start(t); src.stop(t + 1.2); break;
      }
      case "melody":
        osc.type = "sine";
        osc.frequency.value = 440;
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t); osc.stop(t + 0.3); break;
      default:
        osc.frequency.value = 440;
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t); osc.stop(t + 0.2);
    }
  }, []);

  useEffect(() => {
    if (playing) {
      const interval = (60 / bpm / 4) * 1000;
      intervalRef.current = setInterval(() => {
        const step = stepRef.current;
        setCurrentStep(step);
        grid.forEach((track, ti) => {
          if (track[step] && !muted[ti]) playSound(INSTRUMENTS[ti], volumes[ti]);
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

  const toggleCell = (ti, si) => setGrid(g => g.map((row, r) => r === ti ? row.map((v, c) => c === si ? !v : v) : row));
  const clearGrid = () => setGrid(initGrid());

  const addDawTrack = (url, name, type = "recorded", duration = 5) => {
    const id = Date.now();
    const color = type === "recorded" ? "#ff6b6b" : type === "ai" ? "#4d96ff" : "#6bcb77";
    setDawTracks(t => [...t, { id, name, url, color, type, clips: [{ id: id + 1, start: 0, duration, url, name }] }]);
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
        addDawTrack(url, `Take ${dawTracks.length + 1}`, "recorded", 5);
        notify("Recording added to timeline!", "success");
      };
      mediaRecRef.current.start();
      setRecording(true);
    } catch { notify("Mic access denied", "error"); }
  };

  const stopRecording = () => { mediaRecRef.current?.stop(); setRecording(false); };

  const importAudio = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { notify("File too large (max 10MB)", "error"); return; }
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      addDawTrack(url, file.name.replace(/\.[^/.]+$/, ""), "imported", Math.min(audio.duration, 60));
      notify("Imported: " + file.name, "success");
    };
  };

  const deleteTrack = (id) => setDawTracks(t => t.filter(x => x.id !== id));

  const duplicateClip = (trackId, clip) => {
    setDawTracks(t => t.map(track => track.id === trackId ? {
      ...track, clips: [...track.clips, { ...clip, id: Date.now(), start: clip.start + clip.duration + 0.5 }]
    } : track));
  };

  const moveClip = (trackId, clipId, newStart) => {
    setDawTracks(t => t.map(track => track.id === trackId ? {
      ...track, clips: track.clips.map(c => c.id === clipId ? { ...c, start: Math.max(0, newStart) } : c)
    } : track));
  };

  const exportMix = () => {
    if (dawTracks.length === 0) { notify("No tracks to export", "warn"); return; }
    notify("Right-click any clip's audio player and save", "info");
  };

  const saveKey = (key) => { setHfKey(key); try { localStorage.setItem("hf_key", key); } catch {} };

  const analyzePrompt = (prompt) => {
    const p = prompt.toLowerCase();
    const is = (...words) => words.some(w => p.includes(w));
    return {
      bpm: is("trap","drill","dark") ? 140 : is("lofi","chill","slow") ? 75 : is("house","dance","edm") ? 128 : is("boom bap","hip hop","rap") ? 90 : 110,
      kick: is("trap","drill") ? [0,4,6,8,12,14] : is("house","edm") ? [0,4,8,12] : is("lofi","boom bap") ? [0,6,12] : [0,8],
      snare: is("trap","drill") ? [4,12,14] : is("lofi") ? [6,14] : [4,12],
      hihat: is("trap","drill") ? [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] : is("lofi","chill") ? [0,4,8,12] : [0,2,4,6,8,10,12,14],
      bass: is("trap","808") ? "deep" : is("lofi") ? "warm" : "tight",
      reverb: is("lofi","dreamy","ambient") ? 0.6 : is("trap","dark") ? 0.2 : 0.1,
      swing: is("lofi","jazz","boom bap") ? 0.15 : 0,
    };
  };

  const generateBeatWithWebAudio = async (prompt, duration = 8) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const cfg = analyzePrompt(prompt);
    const stepDur = (60 / cfg.bpm) / 4;
    const totalSteps = Math.floor(duration / stepDur);
    const dest = ctx.createMediaStreamDestination();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(dest);

    const makeReverb = async (ctx, amt) => {
      const conv = ctx.createConvolver();
      const len = ctx.sampleRate * 1.5;
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2) * amt;
      }
      conv.buffer = buf;
      return conv;
    };

    const reverb = await makeReverb(ctx, cfg.reverb);
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = cfg.reverb;
    reverb.connect(reverbGain);
    reverbGain.connect(masterGain);

    const playKick = (t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(masterGain);
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
      gain.gain.setValueAtTime(1.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t); osc.stop(t + 0.3);
    };

    const playSnare = (t) => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/d.length, 1.5);
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass"; filter.frequency.value = 2500; filter.Q.value = 0.8;
      src.buffer = buf;
      src.connect(filter); filter.connect(gain); gain.connect(masterGain);
      gain.gain.setValueAtTime(0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      src.start(t);
    };

    const playHihat = (t, open = false) => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * (open ? 0.3 : 0.05), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random()*2-1;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass"; filter.frequency.value = 8000;
      src.buffer = buf;
      src.connect(filter); filter.connect(gain); gain.connect(masterGain);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.3 : 0.05));
      src.start(t);
    };

    const play808 = (t, note = 60) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const freq = 440 * Math.pow(2, (note - 69) / 12);
      osc.type = cfg.bass === "deep" ? "sine" : "triangle";
      osc.frequency.setValueAtTime(freq * 2, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
      osc.connect(gain); gain.connect(masterGain);
      if (cfg.reverb > 0.3) { osc.connect(reverb); }
      gain.gain.setValueAtTime(0.9, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.start(t); osc.stop(t + 0.55);
    };

    const bassNotes = [36, 36, 38, 36, 33, 36, 38, 40];
    for (let step = 0; step < totalSteps; step++) {
      const swing = step % 2 === 1 ? cfg.swing * stepDur : 0;
      const t = ctx.currentTime + 0.1 + step * stepDur + swing;
      const beat = step % 16;
      if (cfg.kick.includes(beat)) playKick(t);
      if (cfg.snare.includes(beat)) playSnare(t);
      if (cfg.hihat.includes(beat)) playHihat(t);
      if (beat % 4 === 0) play808(t, bassNotes[Math.floor(step/4) % bassNotes.length]);
    }

    const recorder = new MediaRecorder(dest.stream);
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    const result = await new Promise((res) => {
      recorder.onstop = () => res(new Blob(chunks, { type: "audio/webm" }));
      recorder.start();
      setTimeout(() => recorder.stop(), duration * 1000 + 500);
    });
    ctx.close();
    return URL.createObjectURL(result);
  };

  const generateSongGeneration = async () => {
    const input = aiMode === "beats" ? aiPrompt : `${aiStyle} ${aiLyrics}`;
    if (!input.trim()) { notify("Enter a prompt", "warn"); return; }
    setSgLoading(true); setSgResult(null);
    try {
      notify("Generating beat from prompt...", "info");
      const url = await generateBeatWithWebAudio(input, 8);
      setSgResult(url);
      notify("Beat generated!", "success");
    } catch (e) { notify("Generation failed: " + e.message, "error"); }
    setSgLoading(false);
  };

  const generateDiffRhythm = async () => {
    const input = aiMode === "beats" ? aiPrompt : `${aiStyle} ${aiLyrics}`;
    if (!input.trim()) { notify("Enter a prompt", "warn"); return; }
    setDrLoading(true); setDrResult(null);
    try {
      notify("Generating rhythm pattern...", "info");
      const url = await generateBeatWithWebAudio(input, 12);
      setDrResult(url);
      notify("Rhythm ready!", "success");
    } catch (e) { notify("Generation failed: " + e.message, "error"); }
    setDrLoading(false);
  };

  const addAiToTimeline = (url, model) => {
    addDawTrack(url, `AI · ${model}`, "ai", 15);
    setTab("daw");
    notify("Added to timeline!", "success");
  };

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

  // Styles
  const dark = darkMode;
  const bg = dark ? "#080812" : "#e8e8f0";
  const surfaceBorder = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
  const text = dark ? "#e0e0ff" : "#1a1a2e";
  const subtext = dark ? "#777" : "#888";
  const accent = "#7c4dff";
  const accentLight = dark ? "#c0a0ff" : "#5a2ddd";
  const neumorphShadow = dark ? "none" : "6px 6px 12px #c8c8d8, -6px -6px 12px #ffffff";
  const glassBg = dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.85)";

  const cardStyle = {
    background: dark ? glassBg : "rgba(255,255,255,0.8)",
    borderRadius: 14,
    border: `1px solid ${surfaceBorder}`,
    padding: 16,
    backdropFilter: dark ? "blur(12px)" : "none",
    boxShadow: dark ? "0 4px 24px rgba(0,0,0,0.3)" : neumorphShadow,
  };

  const btnStyle = (color = accent, active = false) => ({
    background: dark
      ? active ? `rgba(${hexToRgb(color)},0.3)` : `rgba(${hexToRgb(color)},0.15)`
      : active ? `rgba(${hexToRgb(color)},0.2)` : `rgba(${hexToRgb(color)},0.1)`,
    border: `1px solid rgba(${hexToRgb(color)},${active ? 0.7 : 0.4})`,
    color: dark ? lighten(color) : color,
    borderRadius: 8,
    padding: "9px 18px",
    cursor: "pointer",
    fontSize: 11,
    letterSpacing: 1.5,
    fontFamily: "'Courier New', monospace",
    transition: "all 0.15s",
    boxShadow: dark ? "none" : active ? `inset 2px 2px 5px rgba(0,0,0,0.1)` : neumorphShadow,
  });

  const inputStyle = {
    width: "100%",
    background: dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.9)",
    border: `1px solid ${surfaceBorder}`,
    borderRadius: 8,
    padding: "10px 14px",
    color: text,
    fontSize: 13,
    outline: "none",
    fontFamily: "'Courier New', monospace",
    boxSizing: "border-box",
    boxShadow: dark ? "none" : "inset 2px 2px 5px rgba(0,0,0,0.08)",
  };

  const tabs = [
    { id: "beats", label: "Beats", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="8" width="4" height="8" rx="1"/><rect x="9" y="4" width="4" height="16" rx="1"/><rect x="16" y="10" width="4" height="6" rx="1"/></svg> },
    { id: "daw", label: "Studio", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="7" cy="6" r="2" fill="currentColor"/><circle cx="14" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/></svg> },
    { id: "ai", label: "AI", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg> },
    { id: "cover", label: "Cover", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
  ];

  return (
    <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'Courier New', monospace", position: "relative", overflow: "hidden", transition: "all 0.3s" }}>
      {dark && <>
        <div style={{ position: "fixed", top: "-15%", left: "-10%", width: "45vw", height: "45vw", background: "radial-gradient(circle, rgba(124,77,255,0.1) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
        <div style={{ position: "fixed", bottom: "-20%", right: "-5%", width: "35vw", height: "35vw", background: "radial-gradient(circle, rgba(255,100,180,0.06) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
      </>}

      {notification && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, background: notification.type === "success" ? "rgba(107,203,119,0.15)" : notification.type === "error" ? "rgba(255,100,100,0.15)" : "rgba(100,100,255,0.15)", border: `1px solid ${notification.type === "success" ? "#6bcb77" : notification.type === "error" ? "#ff6b6b" : "#6464ff"}`, borderRadius: 10, padding: "10px 18px", fontSize: 12, backdropFilter: "blur(10px)", color: text, maxWidth: 260 }}>
          {notification.msg}
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1, maxWidth: 960, margin: "0 auto", padding: "20px 14px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 6, color: accent, marginBottom: 3 }}>LUMINAR</div>
            <div style={{ fontSize: 20, fontWeight: "bold", letterSpacing: 3 }}>MUSIC STUDIO</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setDarkMode(!dark)} style={{ ...btnStyle(accent), padding: "8px 12px" }}>
              {dark
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              }
            </button>

          </div>
        </div>

        {showKeyInput && (
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: subtext, letterSpacing: 2, marginBottom: 8 }}>HUGGING FACE API KEY</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="password" value={hfKey} onChange={e => setHfKey(e.target.value)} placeholder="hf_..." style={{ ...inputStyle }} />
              <button onClick={() => { saveKey(hfKey); setShowKeyInput(false); notify("Key saved!", "success"); }} style={{ ...btnStyle("#6bcb77"), whiteSpace: "nowrap" }}>SAVE</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 18, background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)", borderRadius: 12, padding: 4, boxShadow: dark ? "none" : "inset 2px 2px 6px rgba(0,0,0,0.1)" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "10px 0", background: tab === t.id ? (dark ? "rgba(124,77,255,0.25)" : "rgba(255,255,255,0.9)") : "transparent", border: tab === t.id ? `1px solid rgba(124,77,255,0.5)` : "1px solid transparent", borderRadius: 9, color: tab === t.id ? accentLight : subtext, cursor: "pointer", fontSize: 10, letterSpacing: 1.5, transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: tab === t.id && !dark ? "2px 2px 8px rgba(0,0,0,0.12)" : "none" }}>
              {t.icon}{t.label.toUpperCase()}
            </button>
          ))}
        </div>

        {/* BEAT MAKER */}
        {tab === "beats" && (
          <div>
            {showLandscapeHint && (
              <div style={{ ...cardStyle, marginBottom: 14, display: "flex", alignItems: "center", gap: 10, background: "rgba(124,77,255,0.12)", borderColor: "rgba(124,77,255,0.4)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c0a0ff" strokeWidth="2"><path d="M7.5 21H3v-4.5M21 16.5V21h-4.5M16.5 3H21v4.5M3 7.5V3h4.5"/></svg>
                <span style={{ fontSize: 11, color: accentLight, letterSpacing: 1 }}>ROTATE TO LANDSCAPE FOR BEST EXPERIENCE</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <button onClick={() => setPlaying(!playing)} style={{ ...btnStyle(playing ? "#ff6b6b" : "#6bcb77", true), display: "flex", alignItems: "center", gap: 8 }}>
                {playing
                  ? <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="6" height="16"/><rect x="14" y="4" width="6" height="16"/></svg> STOP</>
                  : <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> PLAY</>
                }
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 160 }}>
                <span style={{ fontSize: 10, color: subtext, letterSpacing: 1 }}>BPM</span>
                <input type="range" min={60} max={200} value={bpm} onChange={e => setBpm(Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
                <span style={{ fontSize: 14, color: accentLight, minWidth: 32, textAlign: "right" }}>{bpm}</span>
              </div>
              <button onClick={clearGrid} style={{ ...btnStyle("#888") }}>CLEAR</button>
            </div>

            <div style={{ ...cardStyle, overflowX: "auto" }}>
              <div style={{ minWidth: isLandscape ? "auto" : 640 }}>
                <div style={{ display: "flex", marginBottom: 6, paddingLeft: 72 }}>
                  {Array(STEPS).fill(0).map((_, i) => (
                    <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 8, color: i % 4 === 0 ? accentLight : subtext, minWidth: 0 }}>{i % 4 === 0 ? i + 1 : ""}</div>
                  ))}
                </div>
                {INSTRUMENTS.map((inst, ti) => (
                  <div key={inst.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: ti < INSTRUMENTS.length - 1 ? 7 : 0 }}>
                    <div style={{ width: 64, fontSize: 9, color: inst.color, letterSpacing: 1, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
                      <button onClick={() => playSound(inst, volumes[ti])} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: inst.color, display: "flex", alignItems: "center" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                      </button>
                      {inst.name.toUpperCase()}
                    </div>
                    <div style={{ display: "flex", gap: 3, flex: 1 }}>
                      {Array(STEPS).fill(0).map((_, si) => (
                        <button key={si} onClick={() => toggleCell(ti, si)} style={{ flex: 1, height: 28, borderRadius: 4, border: "none", cursor: "pointer", minWidth: 0, background: currentStep === si ? (grid[ti][si] ? inst.color : dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)") : grid[ti][si] ? inst.color : dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)", transition: "background 0.05s", opacity: muted[ti] ? 0.25 : 1, boxShadow: grid[ti][si] && currentStep === si ? `0 0 6px ${inst.color}` : "none", borderLeft: si % 4 === 0 ? `1px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` : "none" }} />
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                      <input type="range" min={0} max={1} step={0.05} value={volumes[ti]} onChange={e => setVolumes(v => v.map((x, i) => i === ti ? Number(e.target.value) : x))} style={{ width: 44, accentColor: inst.color }} />
                      <button onClick={() => setMuted(m => m.map((x, i) => i === ti ? !x : x))} style={{ background: muted[ti] ? "rgba(255,100,100,0.2)" : dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", border: `1px solid ${muted[ti] ? "#ff6b6b" : surfaceBorder}`, color: muted[ti] ? "#ff6b6b" : subtext, borderRadius: 4, width: 24, height: 24, cursor: "pointer", fontSize: 8, letterSpacing: 0.5, padding: 0 }}>M</button>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 3, marginTop: 8, paddingLeft: 72 }}>
                  {Array(STEPS).fill(0).map((_, i) => (
                    <div key={i} style={{ flex: 1, height: 2, borderRadius: 2, background: currentStep === i ? accentLight : i % 4 === 0 ? (dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)") : (dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"), transition: "background 0.05s", minWidth: 0 }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DAW / STUDIO */}
        {tab === "daw" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={recording ? stopRecording : startRecording} style={{ ...btnStyle(recording ? "#ff6b6b" : "#c77dff", recording), display: "flex", alignItems: "center", gap: 7 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>
                {recording ? "STOP REC" : "RECORD"}
              </button>
              <button onClick={() => fileInputRef.current?.click()} style={{ ...btnStyle("#4d96ff"), display: "flex", alignItems: "center", gap: 7 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                IMPORT
              </button>
              <input ref={fileInputRef} type="file" accept="audio/*" onChange={importAudio} style={{ display: "none" }} />
              <button onClick={exportMix} style={{ ...btnStyle("#6bcb77"), display: "flex", alignItems: "center", gap: 7 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                EXPORT
              </button>
              {recording && (
                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                  {[16, 24, 20, 28, 18, 22].map((h, i) => (
                    <div key={i} style={{ width: 3, height: h, borderRadius: 2, background: "#ff6b6b" }} />
                  ))}
                </div>
              )}
            </div>

            <div style={{ ...cardStyle, overflowX: "auto" }}>
              {dawTracks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 20px", color: subtext }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.3, marginBottom: 12 }}><path d="M3 6h18M3 12h18M3 18h18"/></svg>
                  <div style={{ fontSize: 12, letterSpacing: 2 }}>NO TRACKS YET</div>
                  <div style={{ fontSize: 10, marginTop: 6 }}>Record, import, or add AI audio above</div>
                </div>
              ) : (
                <div style={{ minWidth: 500 }}>
                  <div style={{ display: "flex", paddingLeft: 80, marginBottom: 6, borderBottom: `1px solid ${surfaceBorder}`, paddingBottom: 6 }}>
                    {Array(Math.ceil(dawDuration / 5)).fill(0).map((_, i) => (
                      <div key={i} style={{ flex: 1, fontSize: 9, color: subtext, textAlign: "left" }}>{i * 5}s</div>
                    ))}
                  </div>
                  {dawTracks.map((track) => (
                    <div key={track.id} style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8 }}>
                      <div style={{ width: 72, flexShrink: 0 }}>
                        <div style={{ fontSize: 9, color: track.color, letterSpacing: 1, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.name.toUpperCase()}</div>
                        <div style={{ display: "flex", gap: 3 }}>
                          <button onClick={() => deleteTrack(track.id)} style={{ background: "rgba(255,100,100,0.1)", border: "1px solid rgba(255,100,100,0.3)", color: "#ff6b6b", borderRadius: 3, padding: "2px 5px", cursor: "pointer", fontSize: 8 }}>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                          </button>
                        </div>
                      </div>
                      <div style={{ flex: 1, height: 52, background: dark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.05)", borderRadius: 6, position: "relative", overflow: "hidden" }}>
                        {track.clips.map(clip => {
                          const leftPct = (clip.start / dawDuration) * 100;
                          const widthPct = (clip.duration / dawDuration) * 100;
                          return (
                            <div key={clip.id} onClick={() => setSelectedClip(selectedClip?.id === clip.id ? null : { ...clip, trackId: track.id })} style={{ position: "absolute", left: `${leftPct}%`, width: `${widthPct}%`, height: "100%", background: `${track.color}33`, border: `1px solid ${track.color}88`, borderRadius: 5, cursor: "pointer", boxShadow: selectedClip?.id === clip.id ? `0 0 10px ${track.color}66` : "none", transition: "box-shadow 0.15s" }}>
                              <div style={{ position: "absolute", inset: 4, display: "flex", alignItems: "center", gap: 1, overflow: "hidden" }}>
                                {Array(24).fill(0).map((_, i) => (
                                  <div key={i} style={{ width: 2, borderRadius: 1, background: track.color, opacity: 0.7, height: `${30 + Math.sin(i * 0.8) * 20 + Math.cos(i * 1.3) * 15}%` }} />
                                ))}
                              </div>
                              <div style={{ position: "absolute", bottom: 3, left: 5, fontSize: 8, color: track.color, letterSpacing: 0.5 }}>{clip.name}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedClip && (
              <div style={{ ...cardStyle, marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: subtext, letterSpacing: 1 }}>SELECTED: {selectedClip.name}</span>
                <audio controls src={selectedClip.url} style={{ height: 30, flex: 1, minWidth: 120 }} />
                <button onClick={() => duplicateClip(selectedClip.trackId, selectedClip)} style={{ ...btnStyle("#ffd93d"), padding: "6px 12px" }}>DUPE</button>
                <button onClick={() => { setDawTracks(t => t.map(tr => tr.id === selectedClip.trackId ? { ...tr, clips: tr.clips.filter(c => c.id !== selectedClip.id) } : tr)); setSelectedClip(null); }} style={{ ...btnStyle("#ff6b6b"), padding: "6px 12px" }}>DEL</button>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: subtext }}>POS</span>
                  <input type="range" min={0} max={dawDuration - (selectedClip.duration || 5)} step={0.5} value={selectedClip.start} onChange={e => { const v = Number(e.target.value); moveClip(selectedClip.trackId, selectedClip.id, v); setSelectedClip(s => ({ ...s, start: v })); }} style={{ width: 80, accentColor: accent }} />
                  <span style={{ fontSize: 9, color: accentLight }}>{selectedClip.start.toFixed(1)}s</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI STUDIO */}
        {tab === "ai" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...cardStyle, display: "flex", gap: 4, padding: 6 }}>
              {["beats", "song"].map(m => (
                <button key={m} onClick={() => setAiMode(m)} style={{ flex: 1, ...btnStyle(accent, aiMode === m), padding: "8px 0" }}>
                  {m === "beats" ? "BEAT MODE" : "SONG MODE"}
                </button>
              ))}
            </div>
            <div style={cardStyle}>
              {aiMode === "beats" ? (
                <>
                  <div style={{ fontSize: 10, color: subtext, letterSpacing: 2, marginBottom: 10 }}>DESCRIBE YOUR BEAT</div>
                  <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="lo-fi hip hop 90bpm chill vibes with vinyl crackle..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                </>
              ) : (
                <>
                  <div style={{ fontSize: 10, color: subtext, letterSpacing: 2, marginBottom: 10 }}>LYRICS</div>
                  <textarea value={aiLyrics} onChange={e => setAiLyrics(e.target.value)} placeholder="Paste your lyrics here..." rows={4} style={{ ...inputStyle, resize: "vertical", marginBottom: 10 }} />
                  <div style={{ fontSize: 10, color: subtext, letterSpacing: 2, marginBottom: 8 }}>STYLE / GENRE</div>
                  <input value={aiStyle} onChange={e => setAiStyle(e.target.value)} placeholder="afrobeats, emotional, 90bpm..." style={{ ...inputStyle }} />
                </>
              )}
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 10, color: "#4d96ff", letterSpacing: 2, marginBottom: 10 }}>① MUSICGEN LARGE · facebook</div>
              <button onClick={generateSongGeneration} disabled={sgLoading} style={{ ...btnStyle("#4d96ff", sgLoading), width: "100%", opacity: sgLoading ? 0.6 : 1 }}>
                {sgLoading ? "GENERATING..." : "GENERATE"}
              </button>
              {sgLoading && <div style={{ textAlign: "center", fontSize: 10, color: subtext, marginTop: 8 }}>This may take 30–60s on free tier...</div>}
              {sgResult && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, color: "#6bcb77", letterSpacing: 1, marginBottom: 8 }}>✓ READY</div>
                  <audio controls src={sgResult} style={{ width: "100%" }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <a href={sgResult} download="musicgen.wav" style={{ flex: 1, ...btnStyle("#6bcb77"), textDecoration: "none", textAlign: "center", display: "block" }}>↓ DOWNLOAD</a>
                    <button onClick={() => addAiToTimeline(sgResult, "MusicGen")} style={{ flex: 1, ...btnStyle("#c77dff") }}>+ TIMELINE</button>
                  </div>
                </div>
              )}
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 10, color: "#c77dff", letterSpacing: 2, marginBottom: 10 }}>② DIFFRHYTHM · ASLP-lab</div>
              <button onClick={generateDiffRhythm} disabled={drLoading} style={{ ...btnStyle("#c77dff", drLoading), width: "100%", opacity: drLoading ? 0.6 : 1 }}>
                {drLoading ? "GENERATING..." : "GENERATE"}
              </button>
              {drLoading && <div style={{ textAlign: "center", fontSize: 10, color: subtext, marginTop: 8 }}>This may take 60–120s on free tier...</div>}
              {drResult && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, color: "#6bcb77", letterSpacing: 1, marginBottom: 8 }}>✓ READY</div>
                  <audio controls src={drResult} style={{ width: "100%" }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <a href={drResult} download="diffrhythm.wav" style={{ flex: 1, ...btnStyle("#6bcb77"), textDecoration: "none", textAlign: "center", display: "block" }}>↓ DOWNLOAD</a>
                    <button onClick={() => addAiToTimeline(drResult, "DiffRhythm")} style={{ flex: 1, ...btnStyle("#c77dff") }}>+ TIMELINE</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* COVER ART */}
        {tab === "cover" && (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div style={{ flex: "0 0 300px" }}>
              <canvas ref={coverCanvasRef} width={300} height={300} style={{ borderRadius: 12, border: `1px solid ${surfaceBorder}`, display: "block", boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.4)" : neumorphShadow }} />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <label style={{ flex: 1, ...btnStyle(accent), textAlign: "center", display: "block", cursor: "pointer" }}>
                  ↑ IMPORT
                  <input type="file" accept="image/*" onChange={handleCoverImg} style={{ display: "none" }} />
                </label>
                <button onClick={exportCover} style={{ flex: 1, ...btnStyle("#6bcb77") }}>↓ EXPORT</button>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 10, color: subtext, letterSpacing: 2, marginBottom: 10 }}>TRACK INFO</div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: subtext, letterSpacing: 1, marginBottom: 6 }}>TRACK NAME</div>
                  <input value={trackName} onChange={e => setTrackName(e.target.value)} style={{ ...inputStyle }} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: subtext, letterSpacing: 1, marginBottom: 6 }}>ARTIST NAME</div>
                  <input value={artistName} onChange={e => setArtistName(e.target.value)} style={{ ...inputStyle }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: subtext, letterSpacing: 1, marginBottom: 6 }}>TAGLINE / LABEL</div>
                  <input value={coverText} onChange={e => setCoverText(e.target.value)} placeholder="optional..." style={{ ...inputStyle }} />
                </div>
                {/* Explicit toggle */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderRadius: 8, border: `1px solid ${surfaceBorder}`, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: text, letterSpacing: 1 }}>EXPLICIT BADGE</div>
                    <div style={{ fontSize: 9, color: subtext, marginTop: 2 }}>Adds E · EXPLICIT stamp to cover</div>
                  </div>
                  <button onClick={() => setShowExplicit(!showExplicit)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: showExplicit ? "#ff6b6b" : dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)", transition: "all 0.2s", position: "relative" }}>
                    <div style={{ position: "absolute", top: 2, left: showExplicit ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "all 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
                  </button>
                </div>
                <button onClick={() => notify("Cover saved to canvas — hit Export to download!", "success")} style={{ width: "100%", ...btnStyle(accent, true), padding: "12px 0", letterSpacing: 2 }}>
                  SAVE TO LIBRARY
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : "124,77,255";
}
function lighten(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!r) return hex;
  return `rgb(${Math.min(255,parseInt(r[1],16)+60)},${Math.min(255,parseInt(r[2],16)+60)},${Math.min(255,parseInt(r[3],16)+60)})`;
}
