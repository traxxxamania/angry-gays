import { MATERIALS, PHYSICS } from "./config.js";

const { Body, Composite, Engine, Events, Sleeping } = window.Matter;

export function tagBody(body, materialId, { destructible = false } = {}) {
  const material = MATERIALS[materialId];
  body.gameData = {
    materialId,
    hp: material.hp ?? Infinity,
    initialHp: material.hp ?? Infinity,
    destructible,
    destroyed: false,
  };
  return body;
}

export function materialOptions(materialId) {
  const { density, friction, frictionStatic, frictionAir, restitution } = MATERIALS[materialId];
  return { density, friction, frictionStatic, frictionAir, restitution };
}

function velocityAt(body, point) {
  const offsetX = point.x - body.position.x;
  const offsetY = point.y - body.position.y;
  return {
    x: body.velocity.x - body.angularVelocity * offsetY,
    y: body.velocity.y + body.angularVelocity * offsetX,
  };
}

function calculateImpactImpulse(bodyA, bodyB, collision) {
  const { normal, supports, supportCount } = collision;
  const point = supportCount
    ? supports.slice(0, supportCount).reduce((sum, support) => ({ x: sum.x + support.x, y: sum.y + support.y }), { x: 0, y: 0 })
    : { x: (bodyA.position.x + bodyB.position.x) / 2, y: (bodyA.position.y + bodyB.position.y) / 2 };
  if (supportCount) {
    point.x /= supportCount;
    point.y /= supportCount;
  }

  const velocityA = velocityAt(bodyA, point);
  const velocityB = velocityAt(bodyB, point);
  const relativeX = (velocityA.x - velocityB.x) * (1000 / PHYSICS.fixedDelta);
  const relativeY = (velocityA.y - velocityB.y) * (1000 / PHYSICS.fixedDelta);
  const normalSpeed = Math.abs(relativeX * normal.x + relativeY * normal.y);
  const armA = (point.x - bodyA.position.x) * normal.y - (point.y - bodyA.position.y) * normal.x;
  const armB = (point.x - bodyB.position.x) * normal.y - (point.y - bodyB.position.y) * normal.x;
  const inverseMass = (bodyA.isStatic ? 0 : bodyA.inverseMass + armA * armA * bodyA.inverseInertia)
    + (bodyB.isStatic ? 0 : bodyB.inverseMass + armB * armB * bodyB.inverseInertia);
  const restitution = collision.pair?.restitution ?? Math.max(bodyA.restitution, bodyB.restitution);
  const impulse = inverseMass > 0 ? (normalSpeed * (1 + restitution)) / inverseMass : 0;
  return { normalSpeed, impulse };
}

function applyImpactDamage(body, impulse, normalSpeed) {
  const data = body.gameData;
  if (!data?.destructible || data.destroyed || data.hp <= 0) return;

  const material = MATERIALS[data.materialId];
  if (normalSpeed < material.minImpactSpeed) return;
  data.hp -= impulse * PHYSICS.damagePerImpulse * material.damageMultiplier;
  if (data.hp <= 0) {
    data.hp = 0;
    data.destroyed = true;
  }
}

export function createPhysics() {
  const breakEvents = [];
  const engine = Engine.create({
    enableSleeping: true,
    positionIterations: PHYSICS.positionIterations,
    velocityIterations: PHYSICS.velocityIterations,
    constraintIterations: PHYSICS.constraintIterations,
  });

  engine.gravity.x = PHYSICS.gravity.x;
  engine.gravity.y = PHYSICS.gravity.y;
  engine.gravity.scale = PHYSICS.gravity.scale;

  const onCollisionStart = ({ pairs }) => {
    for (const pair of pairs) {
      const { bodyA, bodyB } = pair;
      const { normalSpeed, impulse } = calculateImpactImpulse(bodyA, bodyB, pair.collision);
      if (normalSpeed < PHYSICS.minDamageSpeed) continue;
      applyImpactDamage(bodyA, impulse, normalSpeed);
      applyImpactDamage(bodyB, impulse, normalSpeed);
    }
  };

  const onAfterUpdate = () => {
    let removedBody = false;
    for (const body of Composite.allBodies(engine.world)) {
      if (!body.gameData?.destroyed) continue;
      breakEvents.push({
        materialId: body.gameData.materialId,
        x: body.position.x,
        y: body.position.y,
        width: body.bounds.max.x - body.bounds.min.x,
        height: body.bounds.max.y - body.bounds.min.y,
        velocity: { x: body.velocity.x, y: body.velocity.y },
      });
      Composite.remove(engine.world, body, true);
      removedBody = true;
    }

    if (removedBody) {
      for (const body of Composite.allBodies(engine.world)) {
        if (!body.isStatic && body.isSleeping) Sleeping.set(body, false);
      }
    }
  };

  Events.on(engine, "collisionStart", onCollisionStart);
  Events.on(engine, "afterUpdate", onAfterUpdate);

  return {
    engine,
    world: engine.world,
    step(delta = PHYSICS.fixedDelta) {
      Engine.update(engine, delta);
    },
    takeBreakEvents() {
      return breakEvents.splice(0);
    },
    dispose() {
      Events.off(engine, "collisionStart", onCollisionStart);
      Events.off(engine, "afterUpdate", onAfterUpdate);
      breakEvents.length = 0;
      Composite.clear(engine.world, false, true);
    },
  };
}

export function setBodyVelocity(body, velocity) {
  Body.setVelocity(body, velocity);
  Body.setAngularVelocity(body, 0);
}
