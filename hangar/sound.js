// Procedural sound for the enclosed hangar (WebAudio, no files). Same interface as src/audio.js
// (toggle / update(power, motion, sawSpeed) / burst(kind)) plus hall-specific cues:
//  - a long dark convolution reverb (≈200 m steel hall) that everything is sent through,
//  - room tone: HVAC rumble + mains hum, random distant work sounds (spanners, air tools, metal ticks),
//  - lift motor / hydraulics bound to the lifts, PA chime, weld crackle, muffled thunder through the hill.
export class HangarSound {
  constructor() { this.on = false; this.ctx = null; this.next = 2; }
  init() {
    if (this.ctx) return;
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = 0;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 4;
    this.master.connect(comp).connect(C.destination);
    // hall reverb: decaying filtered noise impulse, 5.5 s, darker in the tail
    const len = Math.floor(C.sampleRate * 5.5), ir = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) { const t = i / len; lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.42 * t); d[i] = lp * Math.pow(1 - t, 2.6) * (i < 400 ? i / 400 : 1); }
    }
    this.verb = C.createConvolver(); this.verb.buffer = ir;
    const wet = C.createGain(); wet.gain.value = 0.55; this.verb.connect(wet).connect(this.master);
    this.dry = C.createGain(); this.dry.gain.value = 0.8; this.dry.connect(this.master);
    this.bus = C.createGain(); this.bus.connect(this.dry); this.bus.connect(this.verb);           // dry + hall
    this.far = C.createGain(); this.far.gain.value = 0.9; this.far.connect(this.verb);            // distant sounds: hall only
    const nb = C.createBuffer(1, C.sampleRate * 2, C.sampleRate), nd = nb.getChannelData(0);
    let b = 0; for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; b = 0.985 * b + 0.015 * w; nd[i] = w * 0.4 + b * 3; }
    this.noise = nb;
    const loop = (f, q, g, type = 'lowpass', to = this.bus) => {
      const s = C.createBufferSource(); s.buffer = nb; s.loop = true;
      const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const gn = C.createGain(); gn.gain.value = g; s.connect(fl).connect(gn).connect(to); s.start(); return gn;
    };
    // room tone: ventilation rumble, a band of airflow, mains hum
    loop(90, 0.7, 0.22); loop(380, 0.5, 0.035, 'bandpass');
    const hum = C.createGain(); hum.gain.value = 0.012; hum.connect(this.bus);
    for (const f of [50, 100, 150]) { const o = C.createOscillator(); o.frequency.value = f; const g = C.createGain(); g.gain.value = f === 50 ? 1 : 0.4; o.connect(g).connect(hum); o.start(); }
    // reactor (low, resonates in the hall)
    this.react = C.createGain(); this.react.gain.value = 0; this.reactF = C.createBiquadFilter(); this.reactF.type = 'lowpass'; this.reactF.frequency.value = 160; this.reactF.Q.value = 4;
    for (const [f, t] of [[38, 'sawtooth'], [38.6, 'sawtooth'], [76, 'triangle']]) { const o = C.createOscillator(); o.type = t; o.frequency.value = f; o.connect(this.reactF); o.start(); }
    this.reactF.connect(this.react).connect(this.bus);
    // servo (machine motion) and saw
    this.servo = C.createGain(); this.servo.gain.value = 0; this.servoO = C.createOscillator(); this.servoO.type = 'sawtooth'; this.servoO.frequency.value = 80;
    const sbp = C.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 380; sbp.Q.value = 3; this.servoO.connect(sbp).connect(this.servo).connect(this.bus); this.servoO.start();
    this.saw = C.createGain(); this.saw.gain.value = 0; this.sawO = C.createOscillator(); this.sawO.type = 'square'; this.sawO.frequency.value = 60;
    const sb = C.createBiquadFilter(); sb.type = 'bandpass'; sb.frequency.value = 1200; sb.Q.value = 1.5; this.sawO.connect(sb).connect(this.saw).connect(this.bus); this.sawO.start();
    // lift motor (whine follows speed) and hydraulics (bridge / decks)
    this.motor = C.createGain(); this.motor.gain.value = 0; this.motorO = C.createOscillator(); this.motorO.type = 'sawtooth'; this.motorO.frequency.value = 110;
    const mlp = C.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 700; this.motorO.connect(mlp).connect(this.motor).connect(this.bus); this.motorO.start();
    this.hyd = loop(1800, 0.8, 0, 'bandpass');
    this.lastLift = 0; this.lastHyd = 0;
  }
  toggle() {
    this.init(); this.on = !this.on;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx.currentTime, 0.3);
    return this.on;
  }
  // power 0..1 reactor, motion 0..1 machine servos, sawSpeed rad/s; extra: { lift: 0..1 cage speed, hyd: 0..1 bridge/deck speed }
  update(power, motion, sawSpeed, extra = {}) {
    if (!this.ctx || !this.on) return;
    const C = this.ctx, t = C.currentTime;
    this.react.gain.setTargetAtTime(0.05 + power * 0.12, t, 0.3); this.reactF.frequency.setTargetAtTime(110 + power * 220, t, 0.4);
    this.servo.gain.setTargetAtTime(Math.min(0.1, motion * 0.8), t, 0.08); this.servoO.frequency.setTargetAtTime(60 + motion * 700, t, 0.1);
    this.saw.gain.setTargetAtTime(Math.min(0.08, sawSpeed / 15 * 0.08), t, 0.2); this.sawO.frequency.setTargetAtTime(30 + sawSpeed * 14, t, 0.2);
    const lift = extra.lift || 0, hyd = extra.hyd || 0;
    this.motor.gain.setTargetAtTime(lift * 0.07, t, 0.15); this.motorO.frequency.setTargetAtTime(90 + lift * 260, t, 0.2);
    this.hyd.gain.setTargetAtTime(hyd * 0.05, t, 0.1);
    if ((this.lastLift > 0.05) !== (lift > 0.05)) this.burst('cable');          // cable 'clunk' at start / stop
    if (this.lastHyd > 0.05 && hyd <= 0.05) this.burst('latch');                 // deck / bridge locks home
    this.lastLift = lift; this.lastHyd = hyd;
    // distant work sounds, sparse and random
    this.next -= 1 / 60;
    if (this.next <= 0) { this.next = 2.5 + Math.random() * 6; this.burst(['spanner', 'airtool', 'tick', 'spanner'][(Math.random() * 4) | 0], true); }
  }
  _noise(t, f, q, g, dur, to, type = 'bandpass') {
    const C = this.ctx, s = C.createBufferSource(); s.buffer = this.noise;
    const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const gn = C.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl).connect(gn).connect(to); s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }
  _tone(t, f0, f1, g, dur, to, type = 'sine') {
    const C = this.ctx, o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gn = C.createGain(); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(gn).connect(to); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(kind, distant = false) {
    if (!this.ctx || !this.on) return;
    const C = this.ctx, t = C.currentTime, to = distant ? this.far : this.bus;
    if (kind === 'spanner') { for (let i = 0; i < 2; i++) { this._tone(t + i * 0.09, 2600 + Math.random() * 900, 2200, 0.05, 0.5, to, 'triangle'); this._noise(t + i * 0.09, 3200, 4, 0.06, 0.08, to); } }
    else if (kind === 'airtool') { const n = 4 + (Math.random() * 6 | 0); for (let i = 0; i < n; i++) this._noise(t + i * 0.07, 900, 2, 0.08, 0.05, to); }
    else if (kind === 'tick') this._noise(t, 4200, 8, 0.05, 0.04, to);
    else if (kind === 'cable') { this._tone(t, 70, 45, 0.25, 0.4, this.bus); this._noise(t, 600, 3, 0.1, 0.15, this.bus); }
    else if (kind === 'latch') { this._tone(t, 180, 90, 0.2, 0.18, this.bus, 'square'); this._noise(t, 2400, 5, 0.12, 0.06, this.bus); }
    else if (kind === 'hiss') this._noise(t, 3000, 0.7, 0.09, 0.9, this.bus, 'highpass');
    else if (kind === 'clank') { this._tone(t, 90, 38, 0.32, 0.6, this.bus); this._noise(t, 1800, 3, 0.16, 0.12, this.bus); }
    else if (kind === 'boom') { this._tone(t, 42, 22, 0.45, 3.4, this.far); this._noise(t + 0.05, 120, 1, 0.3, 3.2, this.far, 'lowpass'); }   // thunder through the hill
    else if (kind === 'scan') this._tone(t, 1600, 300, 0.04, 2.4, this.bus);
    else if (kind === 'sync') { this._tone(t, 220, 880, 0.05, 3.2, this.bus, 'triangle'); this._tone(t + 0.4, 330, 1320, 0.03, 2.8, this.bus); }
    else if (kind === 'weld') { for (let i = 0; i < 8; i++) this._noise(t + Math.random() * 0.4, 5000 + Math.random() * 3000, 3, 0.05, 0.03, this.far); }
    else if (kind === 'pa') { this._tone(t, 523, 520, 0.08, 0.9, this.far); this._tone(t + 0.45, 392, 390, 0.08, 1.2, this.far); }     // two-note hall chime
  }
}
