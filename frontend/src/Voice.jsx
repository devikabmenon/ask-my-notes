import { useState, useRef } from "react";

// Backend WebSocket for the Gemini Live voice assistant.
const WS_URL = "ws://localhost:8000/voice";

// Gemini Live expects:
//   - microphone audio: 16-bit PCM, 16000 Hz (we send this)
//   - Gemini audio out: 16-bit PCM, 24000 Hz (we play this)
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

// Turn a Float32 sample (-1..1) into 16-bit PCM.
function floatTo16Bit(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

// If the browser mic is not exactly 16kHz, do a simple resample.
function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const newLength = Math.floor(input.length / ratio);
  const out = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    out[i] = input[Math.floor(i * ratio)];
  }
  return out;
}

export default function Voice() {
  const [talking, setTalking] = useState(false);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");

  // These hold live objects so we can clean them up later.
  const wsRef = useRef(null);
  const micContextRef = useRef(null);
  const micStreamRef = useRef(null);
  const micNodeRef = useRef(null);
  const playContextRef = useRef(null);
  const sourcesRef = useRef([]);      // currently playing audio sources
  const nextPlayTimeRef = useRef(0);  // when to play the next chunk

  function stopPlayback() {
    sourcesRef.current.forEach((src) => {
      try { src.stop(); } catch { /* already stopped */ }
    });
    sourcesRef.current = [];
    nextPlayTimeRef.current = 0;
  }

  // Play a chunk of Gemini audio (16-bit PCM at 24000 Hz).
  function playAudio(arrayBuffer) {
    const ctx = playContextRef.current;
    if (!ctx) return;

    const int16 = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x8000;
    }

    const audioBuffer = ctx.createBuffer(1, float32.length, OUTPUT_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + audioBuffer.duration;

    sourcesRef.current.push(source);
    source.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((s) => s !== source);
    };
  }

  async function startTalking() {
    setError("");
    setCaption("");

    try {
      // 1. Open the WebSocket to the backend.
      const ws = new WebSocket(WS_URL);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onmessage = (event) => {
        // Text messages are JSON (captions, interruptions, done).
        if (typeof event.data === "string") {
          const msg = JSON.parse(event.data);

          if (msg.type === "caption") {
            setCaption((old) => old + msg.text);
          } else if (msg.type === "interrupted") {
            stopPlayback();
            setCaption((old) => old + " [interrupted]");
          } else if (msg.type === "done") {
            // Gemini finished speaking; nothing to do but wait for more.
          } else if (msg.type === "error") {
            setError(msg.text || "Voice error");
          }
        } else {
          // Binary message = Gemini audio, play it.
          playAudio(event.data);
        }
      };

      ws.onerror = () => setError("Could not connect to the voice backend.");
      ws.onclose = () => {};

      // 2. Set up playback audio context (must happen after a user click).
      const playCtx = new AudioContext({ sampleRate: OUTPUT_RATE });
      playContextRef.current = playCtx;

      // 3. Ask for microphone access and start capturing.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const micCtx = new AudioContext({ sampleRate: INPUT_RATE });
      micContextRef.current = micCtx;

      await micCtx.audioWorklet.addModule("/mic-processor.js");

      const source = micCtx.createMediaStreamSource(stream);
      const micNode = new AudioWorkletNode(micCtx, "mic-processor");
      micNodeRef.current = micNode;

      micNode.port.onmessage = (event) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const samples = event.data; // Float32 at micCtx.sampleRate
        const at16k = resample(samples, micCtx.sampleRate, INPUT_RATE);
        const pcm16 = floatTo16Bit(at16k);

        ws.send(pcm16.buffer);
      };

      source.connect(micNode);
      // Connect to a silent gain so the node keeps processing.
      const silent = micCtx.createGain();
      silent.gain.value = 0;
      micNode.connect(silent);
      silent.connect(micCtx.destination);

      setTalking(true);
    } catch (err) {
      setError(err.message || "Microphone permission was denied.");
      cleanup();
    }
  }

  function cleanup() {
    // Stop microphone
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (micNodeRef.current) {
      micNodeRef.current.disconnect();
      micNodeRef.current = null;
    }
    if (micContextRef.current) {
      micContextRef.current.close();
      micContextRef.current = null;
    }

    // Stop playback
    stopPlayback();
    if (playContextRef.current) {
      playContextRef.current.close();
      playContextRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setTalking(false);
  }

  function stopTalking() {
    cleanup();
  }

  return (
    <div className="voice-page">
      <div className="voice-card">
        <div className={`voice-orb ${talking ? "live" : ""}`}>✦</div>

        <span className="eyebrow">LIVE VOICE ASSISTANT</span>
        <h1>Talk to your <span>notes.</span></h1>
        <p className="voice-sub">
          Ask questions out loud and hear answers about your uploaded notes.
        </p>

        {!talking && (
          <button className="talk-button" onClick={startTalking}>
            🎙️ Start talking
          </button>
        )}

        {talking && (
          <>
            <button className="talk-button stop" onClick={stopTalking}>
              ■ Stop
            </button>
            <div className="voice-status">
              <span className="status-dot"></span>
              Listening… speak now
            </div>
          </>
        )}

        {error && <div className="voice-error">{error}</div>}

        {caption && (
          <div className="voice-caption">
            <span className="caption-label">GEMINI</span>
            <p>{caption}</p>
          </div>
        )}
      </div>
    </div>
  );
}