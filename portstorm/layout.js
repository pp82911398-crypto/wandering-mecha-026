// Shared layout for the outdoor port scene.
// World units: the new Jaeger is ~40 units tall, 1 unit ≈ 2.05 m.
// Ground (quay top) is y = 0. +x is seaward, +z is the pier head (the way the Jaeger faces),
// -z is inland, where the mountain hangar is cut into the cliff.

export const L = {
  unitMeters: 2.05,

  quay: { x0: -340, x1: 42, z0: -145, z1: 155, top: 0, thick: 7 },
  waterY: -3.2,

  // gate / blast door
  gate: {
    cx: 4, w: 44, h: 56, z: -145,
    frameFront: -136, frameW: 8, frameH: 66, outerW: 60,
    outerZ: -147, innerZ: -154, leafT: 2.2,
    pocket: 26,
    ramOuterY: 61, ramInnerY: 52,
  },

  // hangar volumes
  hangar: {
    tunnelW: 46, tunnelH: 56, tunnelZ0: -145, tunnelZ1: -205,
    // hall shrunk to 3/4 in plan (2026-10-22, close to the old dome bay); height kept at 96
    hallW: 112, hallH: 96, hallZ0: -205, hallZ1: -351,
    towerX: -22, towerZ: -238, towerH: 58,   // tower doubles as the boarding lift (bridge to the cockpit)
    gantryZ: -260,
  },

  // crawler / transport platform
  crawler: {
    startZ: -244, endZ: 112, startX: 4, endX: 10,
    w: 30, l: 42, deckTop: 4.4, trackW: 7.2, trackH: 2.8, trackL: 16,
  },

  // final stopping pad (flush with the quay, scaffolding on three sides)
  pad: { cx: 10, cz: 112, w: 46, d: 50, top: 0.12 },
  tower: { x: -28, z: 112, h: 47, w: 8, d: 8 },

  // three empty pads receding toward the mountain (one row along the quay)
  row: [40, -35],
  rowX: -38, rowW: 34, rowD: 38, rowTop: 2.2, rowTowerX: -62,

  helipad: { x: -62, z: 128, r: 11 },
  ship: { x: 62, z: 45, len: 70, beam: 9.4 },

  mountain: { x0: -620, x1: 200, z0: -145, z1: -920, top: 360, cliffTop: 96 },
};

// one 0..1 master timeline: hangar lights -> door -> drive -> stop
export const PH = {
  lights: [0.00, 0.10],
  door: [0.12, 0.32],
  drive: [0.32, 0.88],
  stop: [0.88, 1.00],
};

export const clamp01 = v => Math.max(0, Math.min(1, v));
export const smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); };
export const span = (t, a, b) => smooth((t - a) / Math.max(1e-6, b - a));
export const mix = (a, b, t) => a + (b - a) * t;
export const easeInOut = v => { v = clamp01(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
