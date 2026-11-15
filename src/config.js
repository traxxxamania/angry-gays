export const WORLD = Object.freeze({
  width: 3000,
  height: 900,
  groundY: 760,
});

export const PHYSICS = Object.freeze({
  gravity: Object.freeze({ x: 0, y: 1, scale: 0.0015 }),
  positionIterations: 12,
  velocityIterations: 10,
  constraintIterations: 4,
  fixedDelta: 1000 / 60,
  integrationSubSteps: 3,
  sleepThreshold: 120,
  maxFrameDelta: 100,
  maxSubSteps: 6,
  minDamageSpeed: 90,
  damagePerImpulse: 0.016,
});

export const SLINGSHOT = Object.freeze({
  anchor: Object.freeze({ x: 245, y: 630 }),
  maxPullDistance: 145,
  launchSpeed: 0.22,
  birdRadius: 20,
  minPullDistance: 9,
  trajectorySteps: 120,
  trajectoryDotEvery: 2,
});

export const CAMERA = Object.freeze({
  followLerp: 0.085,
  returnLerp: 0.075,
  followScreenX: 0.34,
  followScreenY: 0.56,
});

export const GAME = Object.freeze({
  shotsPerLevel: 3,
  settleSpeed: 0.55,
  settleDuration: 1050,
  reloadDelay: 250,
});

export const MATERIALS = Object.freeze({
  glass: Object.freeze({
    label: "Стекло",
    density: 0.00115,
    friction: 0.42,
    frictionStatic: 0.55,
    frictionAir: 0.006,
    restitution: 0.06,
    minImpactSpeed: 120,
    hp: 42,
    damageMultiplier: 1.35,
    color: "#80d9e8",
    damagedColor: "#c77878",
  }),
  wood: Object.freeze({
    label: "Дерево",
    density: 0.00135,
    friction: 0.68,
    frictionStatic: 0.82,
    frictionAir: 0.004,
    restitution: 0.04,
    minImpactSpeed: 175,
    hp: 115,
    damageMultiplier: 1,
    color: "#c8894c",
    damagedColor: "#bd6658",
  }),
  stone: Object.freeze({
    label: "Камень",
    density: 0.0031,
    friction: 0.82,
    frictionStatic: 0.95,
    frictionAir: 0.003,
    restitution: 0.015,
    minImpactSpeed: 270,
    hp: 280,
    damageMultiplier: 0.68,
    color: "#8e9ba7",
    damagedColor: "#a56868",
  }),
  target: Object.freeze({
    label: "Цель",
    density: 0.0021,
    friction: 0.68,
    frictionStatic: 0.84,
    frictionAir: 0.003,
    restitution: 0.035,
    minImpactSpeed: 115,
    hp: 55,
    damageMultiplier: 1.3,
    color: "#76bd75",
    damagedColor: "#c56e63",
  }),
  bird: Object.freeze({
    label: "Снаряд",
    density: 0.004,
    friction: 0.48,
    frictionStatic: 0.62,
    frictionAir: 0.0018,
    restitution: 0.18,
    color: "#df594d",
  }),
  ground: Object.freeze({
    label: "Земля",
    density: 0.001,
    friction: 0.9,
    frictionStatic: 1,
    frictionAir: 0,
    restitution: 0,
    color: "#536b57",
  }),
});
