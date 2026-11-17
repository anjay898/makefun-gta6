// Procedural sound for LOW TIDE: every sound is synthesized with WebAudio — engine
// hum that follows the car's speed, gunshots, sirens, pickups, and a low-key bass
// groove. No audio files, no network. Audio starts on the first user gesture.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: a low sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a sine that wails between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 260;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function blip(freq, duration, volume, type = 'sine') {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  // A lazy bass groove: roots of Am – F – C – G, one bar each, with a hat tick.
  const BASSLINE = [55, 43.65, 65.41, 49];
  const STEP_SECONDS = 0.22;

  function musicTick() {
    if (!ctx || muted) return;
    const bar = Math.floor(musicStep / 8) % BASSLINE.length;
    const beat = musicStep % 8;
    if (beat === 0 || beat === 4) blip(BASSLINE[bar], 0.4, 0.16, 'triangle');
    if (beat === 2 || beat === 6) blip(BASSLINE[bar] * 1.5, 0.18, 0.08, 'triangle');
    if (beat % 2 === 1) noiseBurst(0.03, 0.05, 6000);
    musicStep += 1;
  }

  return {
    /** Call from any user gesture; also starts the music loop. */
    unlock() {
      if (!ensure()) return;
      if (!musicTimer) musicTimer = setInterval(musicTick, STEP_SECONDS * 1000);
    },
    gunshot() {
      if (!ctx || muted) return;
      noiseBurst(0.14, 0.5, 2400);
      blip(140, 0.08, 0.25, 'square');
    },
    punch() {
      if (!ctx || muted) return;
      noiseBurst(0.08, 0.3, 900);
    },
    pickup() {
      if (!ctx || muted) return;
      blip(880, 0.12, 0.2);
      setTimeout(() => blip(1318, 0.16, 0.2), 90);
    },
    crash() {
      if (!ctx || muted) return;
      noiseBurst(0.3, 0.45, 700);
    },
    missionDone() {
      if (!ctx || muted) return;
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.25, 0.22), i * 110));
    },
    gameOver() {
      if (!ctx || muted) return;
      [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.35, 0.2, 'triangle'), i * 160));
    },
    /** Continuous sounds, called every frame: engine follows speed, siren follows wanted. */
    update(speed, wantedStars) {
      if (!ctx || muted) return;
      const driving = Math.abs(speed) > 5;
      engineGain.gain.setTargetAtTime(driving ? 0.05 + Math.min(0.09, Math.abs(speed) / 5000) : 0, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + Math.abs(speed) * 0.22, ctx.currentTime, 0.08);
      sirenGain.gain.setTargetAtTime(wantedStars > 0 ? 0.045 : 0, ctx.currentTime, 0.3);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
