import { MATERIALS, WORLD } from "./config.js";
import { materialOptions, tagBody } from "./physics.js";

const { Bodies, Composite } = window.Matter;

function addBlock(world, materialId, x, y, width, height, angle = 0) {
  const body = Bodies.rectangle(x, y, width, height, {
    ...materialOptions(materialId),
    angle,
    sleepThreshold: 120,
    chamfer: { radius: Math.min(3, width / 10, height / 10) },
  });
  tagBody(body, materialId, { destructible: true });
  Composite.add(world, body);
  return body;
}

function addTarget(world, x, y, radius = 19) {
  const body = Bodies.circle(x, y, radius, {
    ...materialOptions("target"),
    sleepThreshold: 120,
  });
  tagBody(body, "target", { destructible: true });
  Composite.add(world, body);
  return body;
}

export function createLevel(world) {
  const ground = Bodies.rectangle(
    WORLD.width / 2,
    WORLD.groundY + 48,
    WORLD.width + 500,
    96,
    { ...materialOptions("ground"), isStatic: true },
  );
  tagBody(ground, "ground");
  Composite.add(world, ground);

  const leftTower = 1430;
  addBlock(world, "stone", leftTower - 100, WORLD.groundY - 50, 42, 100);
  addBlock(world, "stone", leftTower + 100, WORLD.groundY - 50, 42, 100);
  addBlock(world, "wood", leftTower, WORLD.groundY - 110, 245, 20);
  addTarget(world, leftTower, WORLD.groundY - 20);

  addBlock(world, "glass", leftTower - 72, WORLD.groundY - 165, 30, 90);
  addBlock(world, "wood", leftTower + 72, WORLD.groundY - 165, 30, 90);
  addBlock(world, "wood", leftTower, WORLD.groundY - 220, 205, 20);
  addTarget(world, leftTower, WORLD.groundY - 249);

  addBlock(world, "wood", leftTower - 55, WORLD.groundY - 275, 28, 90);
  addBlock(world, "glass", leftTower + 55, WORLD.groundY - 275, 28, 90);
  addBlock(world, "stone", leftTower, WORLD.groundY - 330, 165, 20);
  addTarget(world, leftTower, WORLD.groundY - 359);

  const rightTower = 1840;
  addBlock(world, "stone", rightTower - 82, WORLD.groundY - 44, 38, 88);
  addBlock(world, "stone", rightTower + 82, WORLD.groundY - 44, 38, 88);
  addBlock(world, "stone", rightTower, WORLD.groundY - 100, 210, 24);
  addTarget(world, rightTower, WORLD.groundY - 131);
  addBlock(world, "wood", rightTower - 50, WORLD.groundY - 163, 28, 102);
  addBlock(world, "wood", rightTower + 50, WORLD.groundY - 163, 28, 102);
  addBlock(world, "glass", rightTower, WORLD.groundY - 223, 145, 18);
  addTarget(world, rightTower, WORLD.groundY - 248, 16);

  for (let index = 0; index < 3; index += 1) {
    addBlock(world, index === 1 ? "glass" : "wood", 2220 + index * 36, WORLD.groundY - 24, 30, 48, index % 2 ? 0.06 : -0.04);
  }

  return { targetCount: 5 };
}

export function createBird(world, x, y, radius) {
  const bird = Bodies.circle(x, y, radius, {
    ...materialOptions("bird"),
    sleepThreshold: 60,
  });
  tagBody(bird, "bird");
  window.Matter.Body.setStatic(bird, true);
  Composite.add(world, bird);
  return bird;
}

export function getMaterial(body) {
  return MATERIALS[body.gameData?.materialId] ?? MATERIALS.wood;
}
