// Sound, synthesised with WebAudio — no audio files, no network. A quiet engine hum
// while driving, a two-tone siren that follows the nearest police car, and short blips
// for shots, pickups and mission jingles. Everything is guarded: if the browser has no
// audio, or the player has not interacted yet, every call is a silent no-op.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.22;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 820;
      const lfo = ctx.createOscillator();
      lfo.type = 'triangle';
      lfo.frequency.value = 0.55;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 170;
      lfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      lfo.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freqStart, freqEnd, duration, type, volume) {
    if (!ensure()) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), ctx.currentTime + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume || 0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.02);
    } catch {
      // Silence is always acceptable.
    }
  }

  function note(freq, delay, duration) {
    if (!ensure()) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration + 0.02);
    } catch {
      // Silence is always acceptable.
    }
  }

  return {
    ensure,
    isMuted() {
      return muted;
    },
    setMuted(next) {
      muted = next;
      if (master) master.gain.value = muted ? 0 : 0.22;
    },
    shoot(kind) {
      if (kind === 'fists') blip(220, 90, 0.08, 'square', 0.25);
      else if (kind === 'smg') blip(900, 220, 0.07, 'square', 0.4);
      else blip(1400, 180, 0.12, 'square', 0.5);
    },
    thud() {
      blip(80, 40, 0.22, 'sine', 0.7);
    },
    pickup() {
      note(660, 0, 0.12);
      note(880, 0.07, 0.18);
    },
    jingle() {
      note(523, 0, 0.16);
      note(659, 0.12, 0.16);
      note(784, 0.24, 0.22);
      note(1047, 0.36, 0.34);
    },
    click() {
      blip(1000, 700, 0.05, 'sine', 0.3);
    },
    engine(speed01, driving) {
      if (!ctx || !engineOsc) return;
      try {
        const target = driving ? 0.05 + speed01 * 0.05 : 0;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(55 + speed01 * 150, ctx.currentTime, 0.08);
      } catch {
        // Silence is always acceptable.
      }
    },
    siren(near01) {
      if (!ctx || !sirenGain) return;
      try {
        const target = near01 < 0 ? 0 : 0.045 * (1 - Math.min(1, near01));
        sirenGain.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
      } catch {
        // Silence is always acceptable.
      }
    },
  };
}
