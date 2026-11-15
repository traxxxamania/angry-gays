import { MATERIALS, PHYSICS, SLINGSHOT, WORLD } from "./config.js";

const { Bodies, Body, Query, Sleeping } = window.Matter;

function calculateLaunchVelocity(position) {
  return {
    x: (SLINGSHOT.anchor.x - position.x) * SLINGSHOT.launchSpeed,
    y: (SLINGSHOT.anchor.y - position.y) * SLINGSHOT.launchSpeed,
  };
}

export function createSlingshot(canvas, { getBird, getCamera, getWorld, onLaunch }) {
  let isDragging = false;
  let pointerId = null;
  let pullPosition = { ...SLINGSHOT.anchor };
  const trajectoryProbe = Bodies.circle(0, 0, SLINGSHOT.birdRadius, { isSensor: true });

  const pointerToWorld = (event) => {
    const bounds = canvas.getBoundingClientRect();
    const camera = getCamera();
    return {
      x: event.clientX - bounds.left + camera.x,
      y: event.clientY - bounds.top + camera.y,
    };
  };

  const clampPull = (point) => {
    const dx = point.x - SLINGSHOT.anchor.x;
    const dy = point.y - SLINGSHOT.anchor.y;
    const distance = Math.hypot(dx, dy);
    const scale = distance > SLINGSHOT.maxPullDistance ? SLINGSHOT.maxPullDistance / distance : 1;
    return {
      x: SLINGSHOT.anchor.x + dx * scale,
      y: SLINGSHOT.anchor.y + dy * scale,
    };
  };

  const moveBird = (point) => {
    const bird = getBird();
    if (!bird) return;
    pullPosition = clampPull(point);
    Body.setPosition(bird, pullPosition);
    Body.setAngle(bird, 0);
  };

  const handlePointerDown = (event) => {
    const bird = getBird();
    if (!bird || isDragging) return;
    const point = pointerToWorld(event);
    if (Math.hypot(point.x - bird.position.x, point.y - bird.position.y) > SLINGSHOT.birdRadius + 25) return;

    isDragging = true;
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    moveBird(point);
    event.preventDefault();
  };

  const handlePointerMove = (event) => {
    if (!isDragging || event.pointerId !== pointerId) return;
    moveBird(pointerToWorld(event));
    event.preventDefault();
  };

  const finishDrag = (event) => {
    if (!isDragging || (event && event.pointerId !== pointerId)) return;
    if (event) moveBird(pointerToWorld(event));
    isDragging = false;
    pointerId = null;

    const bird = getBird();
    if (!bird) return;
    const velocity = calculateLaunchVelocity(pullPosition);
    const pullDistance = Math.hypot(velocity.x, velocity.y) / SLINGSHOT.launchSpeed;
    if (pullDistance < SLINGSHOT.minPullDistance) {
      Body.setPosition(bird, SLINGSHOT.anchor);
      pullPosition = { ...SLINGSHOT.anchor };
      return;
    }

    Body.setStatic(bird, false);
    Sleeping.set(bird, false);
    Body.setVelocity(bird, velocity);
    Body.setAngularVelocity(bird, 0);
    onLaunch(bird);
  };

  const cancelDrag = (event) => {
    if (!isDragging || event.pointerId !== pointerId) return;
    isDragging = false;
    pointerId = null;
    pullPosition = { ...SLINGSHOT.anchor };
    const bird = getBird();
    if (bird) Body.setPosition(bird, SLINGSHOT.anchor);
  };

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", cancelDrag);

  function drawBands(context, front = false) {
    const bird = getBird();
    const forkLeft = { x: SLINGSHOT.anchor.x - 29, y: SLINGSHOT.anchor.y - 31 };
    const forkRight = { x: SLINGSHOT.anchor.x + 29, y: SLINGSHOT.anchor.y - 31 };
    const getBandEnd = (fork) => {
      if (!bird) return SLINGSHOT.anchor;
      const dx = bird.position.x - fork.x;
      const dy = bird.position.y - fork.y;
      const distance = Math.hypot(dx, dy) || 1;
      const inset = (bird.circleRadius ?? SLINGSHOT.birdRadius) * 0.88;
      return { x: bird.position.x - (dx / distance) * inset, y: bird.position.y - (dy / distance) * inset };
    };

    context.save();
    context.lineCap = "round";
    if (front) {
      const end = getBandEnd(forkRight);
      context.strokeStyle = "#382b27";
      context.lineWidth = 7;
      context.beginPath();
      context.moveTo(forkRight.x, forkRight.y);
      context.lineTo(end.x, end.y);
      context.stroke();
      context.strokeStyle = "#b48a70";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(forkRight.x, forkRight.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    } else {
      const end = getBandEnd(forkLeft);
      context.strokeStyle = "#382b27";
      context.lineWidth = 7;
      context.beginPath();
      context.moveTo(forkLeft.x, forkLeft.y);
      context.lineTo(end.x, end.y);
      context.stroke();

      context.strokeStyle = "#b48a70";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(forkLeft.x, forkLeft.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }

    if (!front) {
      context.lineCap = "round";
      context.strokeStyle = "#563b30";
      context.lineWidth = 23;
      context.beginPath();
      context.moveTo(SLINGSHOT.anchor.x, SLINGSHOT.anchor.y + 76);
      context.lineTo(SLINGSHOT.anchor.x, SLINGSHOT.anchor.y + 9);
      context.moveTo(SLINGSHOT.anchor.x, SLINGSHOT.anchor.y + 18);
      context.lineTo(forkLeft.x, forkLeft.y);
      context.moveTo(SLINGSHOT.anchor.x, SLINGSHOT.anchor.y + 18);
      context.lineTo(forkRight.x, forkRight.y);
      context.stroke();

      context.strokeStyle = "#a97550";
      context.lineWidth = 13;
      context.beginPath();
      context.moveTo(SLINGSHOT.anchor.x - 2, SLINGSHOT.anchor.y + 69);
      context.lineTo(SLINGSHOT.anchor.x - 2, SLINGSHOT.anchor.y + 12);
      context.moveTo(SLINGSHOT.anchor.x - 1, SLINGSHOT.anchor.y + 17);
      context.lineTo(forkLeft.x + 1, forkLeft.y + 2);
      context.moveTo(SLINGSHOT.anchor.x + 1, SLINGSHOT.anchor.y + 17);
      context.lineTo(forkRight.x - 1, forkRight.y + 2);
      context.stroke();

      context.strokeStyle = "#694637";
      context.lineWidth = 19;
      context.beginPath();
      context.moveTo(SLINGSHOT.anchor.x - 20, SLINGSHOT.anchor.y + 77);
      context.lineTo(SLINGSHOT.anchor.x + 20, SLINGSHOT.anchor.y + 77);
      context.stroke();
      context.strokeStyle = "#bd8a5f";
      context.lineWidth = 8;
      context.beginPath();
      context.moveTo(SLINGSHOT.anchor.x - 14, SLINGSHOT.anchor.y + 75);
      context.lineTo(SLINGSHOT.anchor.x + 14, SLINGSHOT.anchor.y + 75);
      context.stroke();
    }
    context.restore();
  }

  function drawTrajectory(context) {
    const bird = getBird();
    if (!isDragging || !bird) return;

    let x = bird.position.x;
    let y = bird.position.y;
    const initialVelocity = calculateLaunchVelocity(bird.position);
    let velocityX = initialVelocity.x;
    let velocityY = initialVelocity.y;
    const delta = PHYSICS.fixedDelta;
    const gravityStepX = PHYSICS.gravity.x * PHYSICS.gravity.scale * delta * delta;
    const gravityStepY = PHYSICS.gravity.y * PHYSICS.gravity.scale * delta * delta;
    const airFactor = 1 - MATERIALS.bird.frictionAir * (delta / (1000 / 60));
    const world = getWorld();
    const obstacles = world
      ? window.Matter.Composite.allBodies(world).filter((body) => body.id !== bird.id && body.gameData?.materialId !== "bird")
      : [];
    const points = [{ x, y }];
    let hitObstacle = false;

    for (let step = 0; step < SLINGSHOT.trajectorySteps; step += 1) {
      velocityX = velocityX * airFactor + gravityStepX;
      velocityY = velocityY * airFactor + gravityStepY;
      x += velocityX;
      y += velocityY;
      if (y > WORLD.height + bird.circleRadius || x > WORLD.width || x < -bird.circleRadius) break;
      points.push({ x, y });

      Body.setPosition(trajectoryProbe, { x, y }, false);
      if (obstacles.length && Query.collides(trajectoryProbe, obstacles).length) {
        hitObstacle = true;
        break;
      }
    }

    context.save();
    context.fillStyle = "rgb(255 255 255 / 74%)";
    for (let index = SLINGSHOT.trajectoryDotEvery; index < points.length; index += SLINGSHOT.trajectoryDotEvery) {
      const point = points[index];
      const radius = index < 24 ? 2.6 : 1.8;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
    }

    const end = points[points.length - 1];
    const previous = points[Math.max(0, points.length - 3)];
    if (points.length > 1) {
      const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
      context.save();
      context.translate(end.x, end.y);
      context.rotate(angle);
      context.fillStyle = "#d6ef72";
      context.strokeStyle = "#26353a";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(11, 0);
      context.lineTo(-6, -6);
      context.lineTo(-2, 0);
      context.lineTo(-6, 6);
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();
    }

    if (hitObstacle) {
      context.beginPath();
      context.arc(end.x, end.y, 10, 0, Math.PI * 2);
      context.strokeStyle = "rgb(255 173 105 / 90%)";
      context.lineWidth = 2;
      context.stroke();
    }
    context.restore();
  }

  return {
    drawBands,
    drawTrajectory,
    reset() {
      isDragging = false;
      pointerId = null;
      pullPosition = { ...SLINGSHOT.anchor };
    },
    dispose() {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", finishDrag);
      canvas.removeEventListener("pointercancel", cancelDrag);
    },
  };
}
