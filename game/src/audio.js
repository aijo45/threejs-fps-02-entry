// Procedural sound: every effect is synthesised with WebAudio, so the game ships no
// audio files and makes no network request. The context is created on the first user
// gesture; every call before that is a silent no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      ctx = new AudioContextClass();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ frequency = 1200, duration = 0.09, gain = 0.5, type = 'lowpass', sweepTo = null, when = 0 }) {
    if (!ctx || muted) return;
    const start = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), start + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(start);
    source.stop(start + duration + 0.05);
  }

  function tone({ frequency = 440, duration = 0.08, gain = 0.25, type = 'sine', sweepTo = null, when = 0 }) {
    if (!ctx || muted) return;
    const start = ctx.currentTime + when;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (sweepTo !== null) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), start + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(amp);
    amp.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
    },
    shot(kind) {
      if (!ensure()) return;
      if (kind === 'rifle') {
        burst({ frequency: 1800, duration: 0.09, gain: 0.55, sweepTo: 300 });
        tone({ frequency: 160, duration: 0.07, gain: 0.3, type: 'square', sweepTo: 60 });
      } else if (kind === 'smg') {
        burst({ frequency: 2200, duration: 0.06, gain: 0.4, sweepTo: 400 });
      } else if (kind === 'pistol') {
        burst({ frequency: 1400, duration: 0.08, gain: 0.5, sweepTo: 250 });
        tone({ frequency: 120, duration: 0.06, gain: 0.25, type: 'square', sweepTo: 50 });
      } else {
        burst({ frequency: 900, duration: 0.1, gain: 0.3, sweepTo: 200 });
      }
    },
    dryFire() {
      if (!ensure()) return;
      tone({ frequency: 900, duration: 0.03, gain: 0.15, type: 'square' });
    },
    reload() {
      if (!ensure()) return;
      tone({ frequency: 500, duration: 0.04, gain: 0.2, type: 'square' });
      tone({ frequency: 700, duration: 0.04, gain: 0.2, type: 'square', when: 0.18 });
      tone({ frequency: 420, duration: 0.05, gain: 0.25, type: 'square', when: 0.4 });
    },
    hit(kill) {
      if (!ensure()) return;
      tone({ frequency: kill ? 1320 : 880, duration: 0.06, gain: 0.3, type: 'sine' });
      if (kill) tone({ frequency: 1760, duration: 0.09, gain: 0.25, type: 'sine', when: 0.06 });
    },
    hurt() {
      if (!ensure()) return;
      tone({ frequency: 220, duration: 0.12, gain: 0.3, type: 'sawtooth', sweepTo: 110 });
    },
    beep() {
      if (!ensure()) return;
      tone({ frequency: 1250, duration: 0.05, gain: 0.2, type: 'square' });
    },
    explosion() {
      if (!ensure()) return;
      burst({ frequency: 500, duration: 0.9, gain: 0.9, sweepTo: 60 });
      tone({ frequency: 70, duration: 0.8, gain: 0.6, type: 'sine', sweepTo: 30 });
      burst({ frequency: 3000, duration: 0.15, gain: 0.4, sweepTo: 500, when: 0.02 });
    },
    plant() {
      if (!ensure()) return;
      tone({ frequency: 660, duration: 0.08, gain: 0.25, type: 'square' });
      tone({ frequency: 990, duration: 0.1, gain: 0.25, type: 'square', when: 0.1 });
    },
    buy() {
      if (!ensure()) return;
      tone({ frequency: 880, duration: 0.06, gain: 0.2, type: 'sine' });
      tone({ frequency: 1174, duration: 0.08, gain: 0.2, type: 'sine', when: 0.07 });
    },
    round(won) {
      if (!ensure()) return;
      if (won) {
        tone({ frequency: 523, duration: 0.12, gain: 0.25, type: 'sine' });
        tone({ frequency: 659, duration: 0.12, gain: 0.25, type: 'sine', when: 0.12 });
        tone({ frequency: 784, duration: 0.2, gain: 0.25, type: 'sine', when: 0.24 });
      } else {
        tone({ frequency: 392, duration: 0.15, gain: 0.25, type: 'sine' });
        tone({ frequency: 311, duration: 0.25, gain: 0.25, type: 'sine', when: 0.15 });
      }
    },
    step() {
      if (!ensure()) return;
      burst({ frequency: 400, duration: 0.05, gain: 0.08, sweepTo: 150 });
    },
  };
}
