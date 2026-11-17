// Procedural sound: no audio files, everything is synthesised with WebAudio.
// Every call is guarded — in a headless browser or before the first gesture the
// context may not exist, and the game must keep working silently.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(g);
      g.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Sound is decoration; never let it break the game.
    }
  }

  function noise(dur, filterFreq, gain) {
    if (!ctx || muted) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const g = ctx.createGain();
      g.gain.value = gain;
      source.connect(filter);
      filter.connect(g);
      g.connect(master);
      source.start();
    } catch {
      // Sound is decoration; never let it break the game.
    }
  }

  return {
    /** Call from the first user gesture; also resumes a suspended context. */
    init() {
      if (!ensure()) return;
      try {
        if (ctx.state === 'suspended') ctx.resume();
      } catch {
        // Ignore.
      }
    },
    setMuted(value) {
      muted = value;
    },
    isMuted() {
      return muted;
    },
    /** The train's chug: a low thump, called faster as the train speeds up. */
    chug() {
      tone(70, 0.12, 'sine', 0.5, 45);
      noise(0.06, 400, 0.25);
    },
    /** A furnace delivery: two bright notes. */
    chime() {
      tone(660, 0.18, 'sine', 0.35);
      setTimeout(() => tone(990, 0.28, 'sine', 0.3), 90);
    },
    /** Rolling over coal: a soft thunk. */
    thunk() {
      tone(180, 0.1, 'triangle', 0.4, 120);
      noise(0.05, 900, 0.15);
    },
    /** A bandit ambush: a low thud. */
    thud() {
      tone(90, 0.25, 'sawtooth', 0.4, 50);
      noise(0.15, 300, 0.4);
    },
    /** Smashing a bandit while stoked: a crunch. */
    smash() {
      noise(0.18, 1200, 0.5);
      tone(220, 0.12, 'square', 0.25, 90);
    },
    /** The ember dies: a falling tone. */
    death() {
      tone(320, 0.7, 'sine', 0.4, 70);
    },
    /** A switch flips: a click. */
    click() {
      tone(1200, 0.05, 'square', 0.15);
    },
    /** The dawn breaks: a small rising arpeggio. */
    win() {
      [523, 659, 784, 1047].forEach((freq, i) => {
        setTimeout(() => tone(freq, 0.35, 'sine', 0.3), i * 130);
      });
    },
    /** A new wave: a low warning note. */
    wave() {
      tone(196, 0.4, 'triangle', 0.3, 147);
    },
  };
}
