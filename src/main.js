import { CAMERA, GAME, MATERIALS, PHYSICS, SLINGSHOT, WORLD } from "./config.js";
import { createBird, createLevel, getMaterial } from "./level.js";
import { createPhysics } from "./physics.js";
import { createSlingshot } from "./slingshot.js";

const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const shotsLabel = document.querySelector("#shots-label");
const shotsIndicator = document.querySelector("#shots-indicator");
const shotPips = [...shotsIndicator.querySelectorAll(".ammo-pip")];
const targetsLabel = document.querySelector("#targets-label");
const targetsIndicator = document.querySelector("#targets-indicator");
const targetPips = [...targetsIndicator.querySelectorAll(".target-pip")];
const statusLabel = document.querySelector("#status-label");
const restartButton = document.querySelector("#restart-button");
const startOverlay = document.querySelector("#start-overlay");
const startButton = document.querySelector("#start-button");
const resultOverlay = document.querySelector("#result-overlay");
const resultTitle = document.querySelector("#result-title");
const resultSubtitle = document.querySelector("#result-subtitle");
const resultButton = document.querySelector("#result-button");

const camera = { x: 0, y: 0 };
let physics;
let activeBird = null;
let shotsLeft = GAME.shotsPerLevel;
let totalTargets = 0;
let fired = false;
let levelComplete = false;
let settleTime = 0;
let reloadTime = 0;
let accumulator = 0;
let previousFrameTime = 0;
let slingshot;
const debris = [];
let timeMs = 0;

const STARS = Array.from({ length: 120 }, () => ({
  x: Math.random(),
  y: Math.random() * 0.62,
  r: 0.5 + Math.random() * 1.5,
  phase: Math.random() * Math.PI * 2,
}));

function resizeCanvas() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function homeCameraY(height) {
  return Math.max(0, Math.min(WORLD.height - height, WORLD.groundY + 80 - height));
}

function countTargetsRemaining() {
  if (!physics) return totalTargets;
  return window.Matter.Composite.allBodies(physics.world)
    .filter((body) => body.gameData?.materialId === "target" && !body.gameData.destroyed).length;
}

function updateHud(message, state = "ready") {
  const shotsText = String(shotsLeft);
  const shotsAriaLabel = `Осталось бросков: ${shotsLeft} из ${GAME.shotsPerLevel}`;
  if (shotsLabel.textContent !== shotsText) shotsLabel.textContent = shotsText;
  if (shotsLabel.getAttribute("aria-label") !== shotsAriaLabel) shotsLabel.setAttribute("aria-label", shotsAriaLabel);
  shotPips.forEach((pip) => {
    pip.classList.toggle("is-spent", Number(pip.dataset.index) >= shotsLeft);
  });
  const targetsRemaining = countTargetsRemaining();
  const targetsText = String(targetsRemaining);
  const targetsAriaLabel = `Осталось целей: ${targetsRemaining} из ${totalTargets}`;
  if (targetsLabel.textContent !== targetsText) targetsLabel.textContent = targetsText;
  if (targetsLabel.getAttribute("aria-label") !== targetsAriaLabel) targetsLabel.setAttribute("aria-label", targetsAriaLabel);
  targetPips.forEach((pip) => {
    pip.classList.toggle("is-spent", Number(pip.dataset.index) >= targetsRemaining);
  });
  if (message) {
    statusLabel.querySelector(".status-text").textContent = message;
    statusLabel.dataset.state = state;
  }
}

function startGame() {
  startOverlay.hidden = true;
}

function showResult(won) {
  resultOverlay.dataset.state = won ? "won" : "lost";
  resultTitle.textContent = won ? "Все цели сбиты!" : "Броски закончились";
  resultSubtitle.textContent = won
    ? "Отличный выстрел. Нажми «Сыграть ещё», чтобы пройти заново."
    : "Не всё получилось сбить. Нажми «Сыграть ещё» и попробуй снова.";
  resultOverlay.hidden = false;
}

function loadBird() {
  if (shotsLeft <= 0 || activeBird || levelComplete) return;
  activeBird = createBird(physics.world, SLINGSHOT.anchor.x, SLINGSHOT.anchor.y, SLINGSHOT.birdRadius);
  fired = false;
  settleTime = 0;
  updateHud("Натяните рогатку — стрелка покажет полёт и первое столкновение");
}

function handleLaunch() {
  fired = true;
  settleTime = 0;
  shotsLeft -= 1;
  updateHud("Снаряд в полёте", "flight");
}

function resetGame() {
  if (physics) physics.dispose();
  if (slingshot) slingshot.reset();
  physics = createPhysics();
  totalTargets = createLevel(physics.world).targetCount;
  activeBird = null;
  shotsLeft = GAME.shotsPerLevel;
  fired = false;
  levelComplete = false;
  settleTime = 0;
  reloadTime = 0;
  accumulator = 0;
  debris.length = 0;
  camera.x = 0;
  camera.y = homeCameraY(viewport().height);
  resultOverlay.hidden = true;
  loadBird();
}

function updateCamera(delta) {
  const { width, height } = viewport();
  let targetX = 0;
  let targetY = homeCameraY(height);
  let blend = CAMERA.returnLerp;

  if (activeBird && fired) {
    targetX = activeBird.position.x - width * CAMERA.followScreenX;
    targetY = activeBird.position.y - height * CAMERA.followScreenY;
    blend = CAMERA.followLerp;
  }

  targetX = Math.max(0, Math.min(WORLD.width - width, targetX));
  targetY = Math.max(0, Math.min(WORLD.height - height, targetY));
  const frameBlend = 1 - Math.pow(1 - blend, delta / (1000 / 60));
  camera.x += (targetX - camera.x) * frameBlend;
  camera.y += (targetY - camera.y) * frameBlend;
}

function updateProjectileLifecycle(delta) {
  if (!activeBird || !fired) return;

  const speed = Math.hypot(activeBird.velocity.x, activeBird.velocity.y);
  const outsideLevel = activeBird.position.x > WORLD.width + 250
    || activeBird.position.y > WORLD.height + 250
    || activeBird.position.x < -250;
  settleTime = speed < GAME.settleSpeed || outsideLevel ? settleTime + delta : 0;

  if (settleTime < GAME.settleDuration) return;

  window.Matter.Composite.remove(physics.world, activeBird, true);
  activeBird = null;
  fired = false;
  reloadTime = 0;
  levelComplete = totalTargets > 0 && countTargetsRemaining() === 0;
  const message = levelComplete
    ? "Все цели сбиты — победа! Нажмите R, чтобы сыграть ещё раз"
    : shotsLeft > 0 ? "Камера возвращается к рогатке" : "Броски закончились — нажмите R";
  const state = levelComplete ? "won" : shotsLeft > 0 ? "returning" : "done";
  updateHud(message, state);
  if (levelComplete) showResult(true);
  else if (shotsLeft <= 0) showResult(false);
}

function maybeReload(delta) {
  if (activeBird || shotsLeft <= 0 || levelComplete) return;
  const cameraReturned = camera.x < 12 && Math.abs(camera.y - homeCameraY(viewport().height)) < 12;
  if (!cameraReturned) return;
  reloadTime += delta;
  if (reloadTime >= GAME.reloadDelay) {
    reloadTime = 0;
    loadBird();
  }
}

function drawBackground(width, height) {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#0d1430");
  sky.addColorStop(0.45, "#1c2a55");
  sky.addColorStop(0.78, "#2e4a63");
  sky.addColorStop(1, "#3c5d63");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#e9f4ff";
  for (let i = 0; i < STARS.length; i += 1) {
    const star = STARS[i];
    const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(timeMs * 0.0012 + star.phase));
    context.globalAlpha = twinkle * 0.9;
    context.beginPath();
    context.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  const moonX = width - Math.max(120, width * 0.14) - camera.x * 0.02;
  const moonY = Math.max(70, height * 0.16) - camera.y * 0.03;
  const moonR = Math.min(44, width * 0.05);
  const moonGlow = context.createRadialGradient(moonX, moonY, moonR * 0.4, moonX, moonY, moonR * 3.2);
  moonGlow.addColorStop(0, "rgb(244 240 214 / 38%)");
  moonGlow.addColorStop(1, "rgb(244 240 214 / 0%)");
  context.fillStyle = moonGlow;
  context.beginPath();
  context.arc(moonX, moonY, moonR * 3.2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f0ecd4";
  context.beginPath();
  context.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgb(180 186 214 / 34%)";
  context.beginPath();
  context.arc(moonX - moonR * 0.34, moonY - moonR * 0.24, moonR * 0.16, 0, Math.PI * 2);
  context.arc(moonX + moonR * 0.24, moonY + moonR * 0.3, moonR * 0.12, 0, Math.PI * 2);
  context.fill();

  const vignette = context.createRadialGradient(
    width / 2,
    height * 0.44,
    Math.min(width, height) * 0.42,
    width / 2,
    height * 0.5,
    Math.max(width, height) * 0.78,
  );
  vignette.addColorStop(0, "rgb(0 0 0 / 0%)");
  vignette.addColorStop(1, "rgb(0 0 0 / 34%)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawGround(body) {
  const { min, max } = body.bounds;
  const width = max.x - min.x;
  const height = max.y - min.y;
  const grassHeight = Math.min(30, height * 0.32);

  const soil = context.createLinearGradient(0, min.y, 0, max.y);
  soil.addColorStop(0, "#5f9159");
  soil.addColorStop(0.14, "#44673f");
  soil.addColorStop(0.5, "#3a4632");
  soil.addColorStop(1, "#272c21");
  context.fillStyle = soil;
  context.fillRect(min.x, min.y, width, height);

  context.fillStyle = "#7cbb6e";
  context.fillRect(min.x, min.y, width, Math.max(5, grassHeight * 0.3));
  context.fillStyle = "rgb(124 187 110 / 42%)";
  context.fillRect(min.x, min.y + grassHeight * 0.32, width, Math.max(3, grassHeight * 0.2));

  context.fillStyle = "rgb(0 0 0 / 14%)";
  for (let i = 0; i < 40; i += 1) {
    const a = Math.sin(i * 127.1) * 43758.5453;
    const r = a - Math.floor(a);
    const px = min.x + r * width;
    const py = min.y + grassHeight + (Math.sin(i * 311.7) * 0.5 + 0.5) * (height - grassHeight);
    context.beginPath();
    context.arc(px, py, 2 + r * 4, 0, Math.PI * 2);
    context.fill();
  }
}

function drawBody(body) {
  const data = body.gameData;
  if (data?.destroyed) return;
  const material = getMaterial(body);
  const damageRatio = data?.destructible ? 1 - data.hp / data.initialHp : 0;
  const damaged = damageRatio >= 0.35;
  const fill = damaged ? material.damagedColor : material.color;
  context.save();
  if (data?.materialId === "ground") {
    drawGround(body);
    context.restore();
    return;
  }
  context.fillStyle = fill;
  context.strokeStyle = "rgb(18 28 35 / 58%)";
  context.lineWidth = 2;

  if (body.circleRadius) {
    if (data?.materialId === "bird") {
      drawBird(body, material.color);
      context.restore();
      return;
    }
    context.beginPath();
    context.arc(body.position.x, body.position.y, body.circleRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (data?.materialId === "target") {
      context.fillStyle = "rgb(255 255 255 / 42%)";
      context.beginPath();
      context.arc(body.position.x - body.circleRadius * 0.3, body.position.y - body.circleRadius * 0.35, body.circleRadius * 0.22, 0, Math.PI * 2);
      context.fill();
    } else if (data?.materialId === "bird") {
      context.fillStyle = "#f3d3a0";
      context.beginPath();
      context.arc(body.position.x + 6, body.position.y - 3, 3, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    context.beginPath();
    body.vertices.forEach((vertex, index) => {
      if (index === 0) context.moveTo(vertex.x, vertex.y);
      else context.lineTo(vertex.x, vertex.y);
    });
    context.closePath();
    context.fill();
    context.stroke();
  }

  if (damageRatio >= 0.25) drawDamageCracks(body, damageRatio);
  context.restore();
}

function drawDamageCracks(body, damageRatio) {
  const cosine = Math.cos(body.angle);
  const sine = Math.sin(body.angle);
  const localVertices = body.vertices.map((vertex) => {
    const x = vertex.x - body.position.x;
    const y = vertex.y - body.position.y;
    return { x: x * cosine + y * sine, y: -x * sine + y * cosine };
  });
  const halfWidth = Math.max(...localVertices.map((vertex) => vertex.x)) / 2
    - Math.min(...localVertices.map((vertex) => vertex.x)) / 2;
  const halfHeight = Math.max(...localVertices.map((vertex) => vertex.y)) / 2
    - Math.min(...localVertices.map((vertex) => vertex.y)) / 2;
  const isGlass = body.gameData?.materialId === "glass";

  context.save();
  context.translate(body.position.x, body.position.y);
  context.rotate(body.angle);
  context.strokeStyle = isGlass ? "rgb(245 255 255 / 88%)" : "rgb(53 35 28 / 82%)";
  context.lineWidth = isGlass ? 1.6 : 2.2;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(-halfWidth * 0.58, -halfHeight * 0.48);
  context.lineTo(-halfWidth * 0.14, -halfHeight * 0.08);
  context.lineTo(halfWidth * 0.04, -halfHeight * 0.2);
  context.lineTo(halfWidth * 0.2, halfHeight * 0.16);
  context.lineTo(halfWidth * 0.56, halfHeight * 0.48);
  if (damageRatio >= 0.65) {
    context.moveTo(-halfWidth * 0.5, halfHeight * 0.35);
    context.lineTo(-halfWidth * 0.14, halfHeight * 0.14);
    context.lineTo(halfWidth * 0.08, halfHeight * 0.4);
  }
  context.stroke();
  context.restore();
}

function spawnBreakup(event) {
  const material = MATERIALS[event.materialId] ?? MATERIALS.wood;
  const count = Math.max(6, Math.min(12, Math.round((event.width + event.height) / 30)));
  const inheritedSpeed = Math.min(6, Math.hypot(event.velocity.x, event.velocity.y) * 0.18);
  const colors = event.materialId === "glass"
    ? ["#d7f7fa", "#f5ffff", material.color]
    : [material.color, material.damagedColor, "#51463d"];

  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const kick = 1.5 + Math.random() * 3.6 + inheritedSpeed * 0.12;
    const life = 520 + Math.random() * 420;
    debris.push({
      materialId: event.materialId,
      x: event.x + (Math.random() - 0.5) * event.width * 0.45,
      y: event.y + (Math.random() - 0.5) * event.height * 0.45,
      vx: event.velocity.x * 0.16 + Math.cos(angle) * kick,
      vy: event.velocity.y * 0.16 + Math.sin(angle) * kick - 0.8,
      size: 2.5 + Math.random() * 4,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.28,
      frictionAir: 0.985,
      color: colors[Math.floor(Math.random() * colors.length)],
      life,
      initialLife: life,
    });
  }
}

function updateDebris() {
  const gravityX = PHYSICS.gravity.x * PHYSICS.gravity.scale * PHYSICS.fixedDelta ** 2;
  const gravityY = PHYSICS.gravity.y * PHYSICS.gravity.scale * PHYSICS.fixedDelta ** 2;
  for (let index = debris.length - 1; index >= 0; index -= 1) {
    const particle = debris[index];
    particle.vx = particle.vx * particle.frictionAir + gravityX;
    particle.vy = particle.vy * particle.frictionAir + gravityY;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.rotation += particle.spin;
    particle.life -= PHYSICS.fixedDelta;
    if (particle.life <= 0) debris.splice(index, 1);
  }
}

function drawDebris() {
  for (const particle of debris) {
    context.save();
    context.globalAlpha = Math.min(1, particle.life / (particle.initialLife * 0.3));
    context.translate(particle.x, particle.y);
    context.rotate(particle.rotation);
    context.fillStyle = particle.color;
    if (particle.materialId === "glass") {
      context.beginPath();
      context.moveTo(0, -particle.size);
      context.lineTo(particle.size * 0.7, particle.size * 0.8);
      context.lineTo(-particle.size * 0.55, particle.size * 0.55);
      context.closePath();
      context.fill();
    } else {
      context.fillRect(-particle.size, -particle.size * 0.55, particle.size * 2, particle.size * 1.1);
    }
    context.restore();
  }
}

function drawBird(body, color) {
  const speed = Math.hypot(body.velocity.x, body.velocity.y);
  const angle = speed > 1 ? Math.atan2(body.velocity.y, body.velocity.x) : 0;
  context.save();
  context.translate(body.position.x, body.position.y);
  context.rotate(angle);

  context.fillStyle = "#b83e36";
  context.beginPath();
  context.moveTo(-15, 1);
  context.lineTo(-26, -7);
  context.lineTo(-23, 1);
  context.lineTo(-27, 8);
  context.closePath();
  context.fill();

  context.fillStyle = color;
  context.strokeStyle = "#7c302b";
  context.lineWidth = 2.5;
  context.beginPath();
  context.arc(0, 0, SLINGSHOT.birdRadius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = "#f2d46d";
  context.strokeStyle = "#a87a36";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(15, -1);
  context.lineTo(27, 3);
  context.lineTo(15, 7);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#fff8e9";
  context.beginPath();
  context.arc(5, -7, 4.7, 0, Math.PI * 2);
  context.arc(12, -5, 4, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#20272a";
  context.beginPath();
  context.arc(6.5, -6, 1.8, 0, Math.PI * 2);
  context.arc(13, -4, 1.6, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "#542a27";
  context.lineWidth = 2.4;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(1, -14);
  context.lineTo(8, -13);
  context.moveTo(9, -12);
  context.lineTo(15, -11);
  context.stroke();
  context.restore();
}

function render() {
  const { width, height } = viewport();
  context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  drawBackground(width, height);

  context.save();
  context.translate(-camera.x, -camera.y);
  slingshot.drawBands(context, false);
  const bodies = window.Matter.Composite.allBodies(physics.world);
  for (const body of bodies) drawBody(body);
  drawDebris();
  slingshot.drawTrajectory(context);
  slingshot.drawBands(context, true);
  context.restore();
  document.documentElement.dataset.gameReady = "true";
}

function frame(timestamp) {
  if (!previousFrameTime) previousFrameTime = timestamp;
  timeMs = timestamp;
  const elapsed = Math.min(timestamp - previousFrameTime, PHYSICS.maxFrameDelta);
  previousFrameTime = timestamp;
  accumulator += elapsed;

  let subSteps = 0;
  while (accumulator >= PHYSICS.fixedDelta && subSteps < PHYSICS.maxSubSteps) {
    physics.step(PHYSICS.fixedDelta);
    updateDebris();
    accumulator -= PHYSICS.fixedDelta;
    subSteps += 1;
  }
  for (const event of physics.takeBreakEvents()) spawnBreakup(event);

  updateProjectileLifecycle(elapsed);
  updateCamera(elapsed);
  maybeReload(elapsed);
  updateHud();
  render();
  requestAnimationFrame(frame);
}

slingshot = createSlingshot(canvas, {
  getBird: () => activeBird && !fired ? activeBird : null,
  getCamera: () => camera,
  getWorld: () => physics?.world,
  onLaunch: handleLaunch,
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", resetGame);
resultButton.addEventListener("click", resetGame);
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (!startOverlay.hidden && (key === "enter" || key === " " || key === "r")) {
    startGame();
    return;
  }
  if (key === "r") resetGame();
});
window.addEventListener("resize", resizeCanvas);

resizeCanvas();
resetGame();
requestAnimationFrame(frame);
