// Solmara — audio. WebAudio synthesis only, no audio files, no network.
// Contract (spec): createAudio() returns { engine(speed01, on), siren(on),
// shot, punch, pickup, sting, click, setMuted(bool), muted }.
// Sound starts only after the first user gesture: the AudioContext is
// created lazily on that gesture (pointerdown / keydown), and every method
// is a silent no-op until then, so calling audio before the gesture is safe.

export function createAudio() {
  let ctx = null;
  let master = null;
  let unlocked = false;
  let _muted = false;

  // Engine: one sawtooth oscillator through a low-pass filter + gain.
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  // Siren: one triangle oscillator whose frequency flips 700 <-> 950 Hz.
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let sirenHigh = false;

  function unlock() {
    if (unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = _muted ? 0 : 0.5;
      master.connect(ctx.destination);
      unlocked = true;
    } catch {
      // No audio available: every method stays a no-op.
    }
  }

  // First user gesture unlocks audio (spec requirement).
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });

  function ready() {
    if (!unlocked || !ctx) return false;
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  }

  function tone(freq, duration, type, volume, slideTo) {
    if (!ready()) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!ready()) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 3000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  const audio = {
    engine(speed01, on) {
      if (!on) {
        if (engineGain) engineGain.gain.setTargetAtTime(0, ctx ? ctx.currentTime : 0, 0.05);
        return;
      }
      if (!ready()) return;
      const speed = Math.max(0, Math.min(1, speed01 || 0));
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 900;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const t = ctx.currentTime;
      // Pitch follows speed: ~55 Hz idling to ~175 Hz flat out.
      engineOsc.frequency.setTargetAtTime(55 + 120 * speed, t, 0.08);
      engineFilter.frequency.setTargetAtTime(500 + 1400 * speed, t, 0.1);
      engineGain.gain.setTargetAtTime(0.05 + 0.09 * speed, t, 0.1);
    },

    siren(on) {
      if (!on) {
        if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
        if (sirenGain && ctx) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        return;
      }
      if (!ready()) return;
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
      }
      sirenGain.gain.setTargetAtTime(0.06, ctx.currentTime, 0.05);
      if (!sirenTimer) {
        sirenTimer = setInterval(() => {
          if (!sirenOsc || !ctx) return;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 700, ctx.currentTime, 0.03);
        }, 420);
      }
    },

    shot() { noiseBurst(0.14, 0.5, 2500); tone(160, 0.08, 'square', 0.15, 60); },
    punch() { tone(95, 0.12, 'sine', 0.5, 45); noiseBurst(0.06, 0.2, 800); },
    pickup() { tone(660, 0.12, 'sine', 0.25); setTimeout(() => tone(990, 0.18, 'sine', 0.25), 90); },
    sting() {
      tone(523, 0.16, 'triangle', 0.3);
      setTimeout(() => tone(659, 0.16, 'triangle', 0.3), 130);
      setTimeout(() => tone(784, 0.34, 'triangle', 0.32), 260);
    },
    click() { tone(880, 0.05, 'square', 0.12); },

    setMuted(value) {
      _muted = Boolean(value);
      if (master && ctx) master.gain.setTargetAtTime(_muted ? 0 : 0.5, ctx.currentTime, 0.02);
    },
  };

  Object.defineProperty(audio, 'muted', {
    get() { return _muted; },
    enumerable: true,
  });

  return audio;
}
