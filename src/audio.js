// Procedural sound design (WebAudio): rain bed, reactor hum, servo whine, hydraulic hiss, clamps, saw.
export class Sound {
  constructor() { this.on = false; this.ctx = null; }
  init() {
    if (this.ctx) return;
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = 0;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    this.master.connect(comp).connect(C.destination);
    const len = C.sampleRate * 2, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2; }
    this.noise = buf;
    const loop = (f, q, g, type = 'bandpass') => {
      const s = C.createBufferSource(); s.buffer = buf; s.loop = true;
      const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const gn = C.createGain(); gn.gain.value = g; s.connect(fl).connect(gn).connect(this.master); s.start();
      return gn;
    };
    this.rain = loop(2600, 0.4, 0.16); loop(500, 0.6, 0.05); loop(7000, 0.3, 0.035, 'highpass');
    // reactor hum
    this.hum = C.createGain(); this.hum.gain.value = 0.0;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 2;
    this.humF = lp;
    for (const [f, t] of [[41, 'sawtooth'], [41.7, 'sawtooth'], [82, 'triangle'], [123, 'sine']]) { const o = C.createOscillator(); o.type = t; o.frequency.value = f; o.connect(lp); o.start(); }
    lp.connect(this.hum).connect(this.master);
    // servo
    this.servo = C.createGain(); this.servo.gain.value = 0;
    this.servoO = C.createOscillator(); this.servoO.type = 'sawtooth'; this.servoO.frequency.value = 90;
    const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 3;
    this.servoO.connect(bp).connect(this.servo).connect(this.master); this.servoO.start();
    // saw
    this.saw = C.createGain(); this.saw.gain.value = 0;
    this.sawO = C.createOscillator(); this.sawO.type = 'square'; this.sawO.frequency.value = 60;
    const sb = C.createBiquadFilter(); sb.type = 'bandpass'; sb.frequency.value = 1400; sb.Q.value = 1.5;
    this.sawO.connect(sb).connect(this.saw).connect(this.master); this.sawO.start();
  }
  toggle() {
    this.init(); this.on = !this.on;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx.currentTime, 0.3);
    return this.on;
  }
  update(power, motion, sawSpeed) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    this.hum.gain.setTargetAtTime(0.03 + power * 0.08, t, 0.2);
    this.humF.frequency.setTargetAtTime(140 + power * 260, t, 0.3);
    this.servo.gain.setTargetAtTime(Math.min(0.12, motion * 0.9), t, 0.08);
    this.servoO.frequency.setTargetAtTime(70 + motion * 900, t, 0.1);
    this.saw.gain.setTargetAtTime(Math.min(0.1, sawSpeed / 15 * 0.1), t, 0.2);
    this.sawO.frequency.setTargetAtTime(30 + sawSpeed * 14, t, 0.2);
  }
  burst(kind) {
    if (!this.ctx || !this.on) return;
    const C = this.ctx, t = C.currentTime;
    if (kind === 'hiss') {
      const s = C.createBufferSource(); s.buffer = this.noise;
      const f = C.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2200;
      const g = C.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + 1);
    } else if (kind === 'clank') {
      const o = C.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
      const g = C.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.7);
      const s = C.createBufferSource(); s.buffer = this.noise; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 3;
      const g2 = C.createGain(); g2.gain.setValueAtTime(0.18, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      s.connect(f).connect(g2).connect(this.master); s.start(t, Math.random()); s.stop(t + 0.2);
    } else if (kind === 'boom') {
      const o = C.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(24, t + 2.5);
      const g = C.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.1); g.gain.exponentialRampToValueAtTime(0.001, t + 3);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 3.2);
    } else if (kind === 'scan') {
      const o = C.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(300, t + 2.5);
      const g = C.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 2.7);
    }
  }
}
