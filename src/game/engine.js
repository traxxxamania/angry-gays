/* engine.js — движок: рогатка, физика (Matter.js), разрушаемые постройки,
 * свинки-копы, птички-друзья. Класс GameEngine живёт внутри canvas в React. */
import Matter from 'matter-js';
import { buildLevel } from './levels.js';
import * as Birds from './birds.js';

const M = Matter;
const W = 1600, H = 900, GY = 820;
const SLING = { x: 250, y: 660 };
const DRAG_MAX = 135;
const LAUNCH_K = 0.16;         // сила рогатки: макс. скорость = DRAG_MAX*K ≈ 21.6 px/шаг
const BIRD_R = 30;
const FIXED_STEP = 1000 / 60;  // 16.7 мс — фиксированный шаг физики (≤ 33 мс)
const ENEMY_FALL_SPEED = 4;    // порог скорости (px/шаг): выше него падение наносит урон свинке
const ENEMY_FALL_DMG = 4;      // множитель урона от падения: dmg = speed * K

const MATS = {
  wood:   { hp: 60,  density: 0.0012, friction: 0.3 },
  ice:    { hp: 15,  density: 0.0005, friction: 0.05 },   // лёд ломается легко, малая плотность
  stone:  { hp: 110, density: 0.0022, friction: 0.35 },
  powder: { hp: 10,  density: 0.0011, friction: 0.3 }
};

const ACCS = ['cap', 'helmet', 'straw', 'bunny'];
let enemySeq = 0;

export default class GameEngine {
  constructor(canvas, levelIdx, hooks = {}) {
    this.hooks = hooks;
    this.levelIdx = levelIdx;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = buildLevel(levelIdx);

    this.engine = M.Engine.create();
    this.engine.gravity.scale = 0.0003; // земная гравитация ~9.8 м/с²
    this.world = this.engine.world;
    this.meta = {};
    this.particles = [];
    this.score = 0;
    this.shake = 0;
    this.time = 0;
    this.ending = false;
    this.paused = false;
    this.aliveEnemies = 0;
    this.currentBird = null;
    this.drag = null;
    this.predict = null;
    this.raf = null;
    this.lastT = 0;
    this.acc = 0;
    this.decor = makeDecor();
    this._endTimer = null;

    // рельеф (насыпи)
    (this.level.terrain || []).forEach((t) => {
      const body = M.Bodies.rectangle(t.x, t.y, t.w, t.h, { isStatic: true, friction: 0.3, label: 'ground' });
      body.agTerrain = true;
      M.Composite.add(this.world, body);
    });

    // земля
    M.Composite.add(this.world, M.Bodies.rectangle(W / 2, GY + 60, W * 2, 120, {
      isStatic: true, friction: 0.3, label: 'ground'
    }));

    this.level.blocks.forEach((b) => this._spawnBlock(b));
    this.level.enemies.forEach((e) => this._spawnEnemy(e, e.acc || ACCS[(enemySeq++) % ACCS.length]));
    this.totalBlocks = this.level.blocks.length;

    this.queue = this.level.birds;

    M.Events.on(this.engine, 'collisionStart', (ev) => this._collisions(ev));
    this._bindInput();
    this.lastT = performance.now();
    this._loop();
  }

  setPaused(v) { this.paused = v; }

  destroy() {
    if (this._endTimer) { clearTimeout(this._endTimer); this._endTimer = null; }
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this._input) {
      const { c, down, move, up } = this._input;
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      this._input = null;
    }
    if (this.engine) M.World.clear(this.world, false);
    this.raf = null;
  }

  /* =============== сущности =============== */
  _spawnBlock(b) {
    const m = MATS[b.mat];
    const body = M.Bodies.rectangle(b.x, b.y, b.w, b.h, {
      density: m.density, friction: m.friction, restitution: 0.05
    });
    body.agMeta = { kind: 'block', mat: b.mat, hp: m.hp, w: b.w, h: b.h, flash: 0, dead: false };
    M.Composite.add(this.world, body);
    this.meta[body.id] = body.agMeta;
    return body;
  }

  _spawnEnemy(e, acc) {
    const body = M.Bodies.circle(e.x, e.y, 28, { density: 0.001, friction: 0.5, restitution: 0.1 });
    body.agMeta = { kind: 'enemy', hp: 12, flash: 0, dead: false, acc };
    M.Composite.add(this.world, body);
    this.meta[body.id] = body.agMeta;
    this.aliveEnemies++;
    return body;
  }

  // Зарядить друга (по индексу) в рогатку. Вызывается из React по клику на панель.
  loadBird(faceIndex) {
    if (this.ending || this.paused || this.currentBird || this.queue <= 0) return false;
    this.queue--;
    const face = Birds.get(faceIndex);
    const body = M.Bodies.circle(SLING.x, SLING.y, BIRD_R, {
      density: 0.0012, friction: 0.4, restitution: 0.05, frictionAir: 0.001
    });
    body.agMeta = { kind: 'bird', dead: false, face };
    M.Composite.add(this.world, body);
    M.Body.setStatic(body, true);
    this.meta[body.id] = body.agMeta;
    this.currentBird = { body, state: 'sling', rest: 0, face };
    if (this.hooks.onBirds) this.hooks.onBirds(this.queue, face);
    return true;
  }

  // Птица завершила полёт: рогатка пустеет, ждём выбора следующего друга.
  _birdDone() {
    if (this.currentBird) M.Composite.remove(this.world, this.currentBird.body);
    this.currentBird = null;
    if (this.ending) return;
    if (this.queue <= 0) { this._finish(false); return; }
    if (this.hooks.onBirdDone) this.hooks.onBirdDone();
  }

  /* =============== ввод =============== */
  _bindInput() {
    const c = this.canvas;
    const toWorld = (e) => {
      const r = c.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
    };
    const down = (e) => {
      if (this.ending || this.paused || !this.currentBird || this.currentBird.state !== 'sling') return;
      const p = toWorld(e), b = this.currentBird.body;
      if (M.Vector.magnitude(M.Vector.sub(p, b.position)) < 110) { this.drag = true; this._clampDrag(p); e.preventDefault(); }
    };
    const move = (e) => { if (this.drag) { this._clampDrag(toWorld(e)); e.preventDefault(); } };
    const up = (e) => { if (this.drag) { this.drag = null; this._release(); e.preventDefault(); } };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    this._input = { c, down, move, up };
  }

  _clampDrag(p) {
    const a = { x: SLING.x, y: SLING.y };
    let d = M.Vector.sub(p, a);
    if (M.Vector.magnitude(d) > DRAG_MAX) d = M.Vector.mult(M.Vector.normalise(d), DRAG_MAX);
    M.Body.setPosition(this.currentBird.body, M.Vector.add(a, d));
  }

  _release() {
    const b = this.currentBird.body;
    const v = M.Vector.sub({ x: SLING.x, y: SLING.y }, b.position);
    this.predict = null;
    if (M.Vector.magnitude(v) < 6) { M.Body.setPosition(b, { x: SLING.x, y: SLING.y }); return; }
    M.Body.setStatic(b, false);
    M.Body.setVelocity(b, { x: v.x * LAUNCH_K, y: v.y * LAUNCH_K });
    M.Body.setAngularVelocity(b, 0.12);
    this.currentBird.state = 'fly';
    this.currentBird.flyTime = 0;
  }

  _prediction() {
    const b = this.currentBird.body;
    const v = M.Vector.sub({ x: SLING.x, y: SLING.y }, b.position);
    if (M.Vector.magnitude(v) < 6) return null;
    const e = M.Engine.create();
    e.gravity.scale = 0.0003;
    const tmp = M.Bodies.circle(0, 0, BIRD_R, { density: 0.0012, frictionAir: 0.001 });
    M.Body.setPosition(tmp, { x: b.position.x, y: b.position.y });
    M.Body.setVelocity(tmp, { x: v.x * LAUNCH_K, y: v.y * LAUNCH_K });
    M.Composite.add(e.world, tmp);
    const pts = [];
    for (let i = 0; i < 90; i++) {
      M.Engine.update(e, 1000 / 60);
      if (i % 5 === 0) pts.push({ x: tmp.position.x, y: tmp.position.y });
      if (tmp.position.y > GY - 10 || tmp.position.x > W + 100) break;
    }
    M.Engine.clear(e);
    return pts;
  }

  /* =============== урон =============== */
  _collisions(ev) {
    ev.pairs.forEach((pair) => { this._touch(pair.bodyA, pair.bodyB); this._touch(pair.bodyB, pair.bodyA); });
  }

  _touch(self, other) {
    const ms = self.agMeta, mo = other.agMeta;
    if (!ms || ms.dead) return;
    if (other.label === 'ground') {
      if (ms.kind === 'enemy' && self.speed > ENEMY_FALL_SPEED && this.time > 1)
        this._hit(self, ms, self.speed * ENEMY_FALL_DMG);
      return;
    }
    if (!mo || mo.dead) return;
    if (this.time < 1 && mo.kind === 'block' && ms.kind !== 'bird') return;
    const rv = M.Vector.magnitude(M.Vector.sub(self.velocity, other.velocity));
    if (rv < 2.2) return;

    if (ms.kind === 'bird' && mo.kind === 'block') this._hit(other, mo, rv * self.mass * 2.0);
    else if (ms.kind === 'bird' && mo.kind === 'enemy') this._hit(other, mo, rv * self.mass * 2.4);
    else if (ms.kind === 'block' && mo.kind === 'enemy') this._hit(other, mo, rv * self.mass * 1.1);
    else if (ms.kind === 'block' && mo.kind === 'block') {
      if (rv > 8) {
        this._hit(other, mo, rv * Math.min(self.mass, other.mass) * 0.35);
        this._hit(self, ms, rv * Math.min(self.mass, other.mass) * 0.35);
      }
    } else if (ms.kind === 'enemy' && mo.kind === 'block') {
      if (rv > 8) this._hit(other, mo, rv * self.mass * 0.9);
      // свинка получает урон от удара о блок на скорости (падение)
      if (self.speed > ENEMY_FALL_SPEED && this.time > 1) this._hit(self, ms, self.speed * ENEMY_FALL_DMG);
    }
  }

  _hit(body, meta, dmg) {
    if (meta.dead || dmg <= 0) return;
    meta.hp -= dmg;
    meta.flash = 0.18;
    if (meta.hp <= 0) this._destroy(body, meta);
  }

  _destroy(body, meta) {
    if (meta.dead) return;
    meta.dead = true;
    const pos = body.position;

    if (meta.kind === 'enemy') {
      this.aliveEnemies--;
      this._addScore(pos, 5000);
      this._poof(pos, '#8bc34a', 22);
      M.Composite.remove(this.world, body);
      if (this.aliveEnemies <= 0) this._finish(true);
      return;
    }
    if (meta.mat === 'powder') {
      this._explode(pos);
      M.Composite.remove(this.world, body);
      return;
    }
    this._addScore(pos, 500);
    this._poof(pos, meta.mat === 'ice' ? '#b3e5fc' : meta.mat === 'wood' ? '#c97b3c' : '#b9bcc0', 10);
    M.Composite.remove(this.world, body);
  }

  _explode(center) {
    this.shake = 1;
    this._poof(center, '#ff9800', 40);
    this._poof(center, '#616161', 25);
    const R = 260;
    M.Composite.allBodies(this.world).forEach((b) => {
      if (b.isStatic) return;
      const d = M.Vector.sub(b.position, center);
      const dist = M.Vector.magnitude(d);
      if (dist > R) return;
      const power = 1 - dist / R;
      const dir = dist > 1 ? M.Vector.normalise(d) : { x: 0, y: -1 };
      if (b.isSleeping) M.Sleeping.set(b, false);
      M.Body.applyForce(b, b.position, {
        x: dir.x * power * b.mass * 0.12,
        y: (dir.y * power - power * 0.6) * b.mass * 0.12
      });
      const m = b.agMeta;
      if (m && !m.dead && m.kind !== 'bird') {
        if (dist < 110) this._destroy(b, m);
        else this._hit(b, m, power * 90);
      }
    });
    if (this.aliveEnemies <= 0 && !this.ending) this._finish(true);
  }

  _finish(won) {
    if (this.ending) return;
    this.ending = true;
    this._endTimer = setTimeout(() => {
      if (won) {
        const bonus = this.queue * 10000;
        this.score += bonus;
        const s1 = this.level.enemies.length * 5000;
        const stars = this.score >= s1 + 20000 ? 3 : this.score >= s1 + 10000 ? 2 : 1;
        if (this.hooks.onWin) this.hooks.onWin(this.score, stars, bonus);
      } else if (this.hooks.onLose) this.hooks.onLose(this.score);
    }, won ? 900 : 1400);
  }

  /* хелперы для автотестов (dev-сценарии) */
  debugLaunch(x, y, vx, vy) {
    const cb = this.currentBird;
    if (!cb) return false;
    M.Body.setStatic(cb.body, false);
    M.Body.setPosition(cb.body, { x, y });
    M.Body.setVelocity(cb.body, { x: vx, y: vy });
    cb.state = 'fly';
    cb.flyTime = 0;
    return true;
  }
  debugStep(n) {
    for (let i = 0; i < (n || 1); i++) M.Engine.update(this.engine, 1000 / 60);
  }
  debugEnemies() {
    return M.Composite.allBodies(this.world).filter((b) => b.agMeta && b.agMeta.kind === 'enemy' && !b.agMeta.dead);
  }

  _addScore(pos, v) {
    this.score += v;
    this.particles.push({ text: '+' + v, x: pos.x, y: pos.y - 40, vx: 0, vy: -0.8, life: 1.4, color: '#ffd54f', size: 26 });
    this._poof(pos, '#ffffff', 6);
  }

  _poof(pos, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
      this.particles.push({
        x: pos.x, y: pos.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5,
        life: 0.5 + Math.random() * 0.5, color, size: 3 + Math.random() * 5
      });
    }
  }

  /* =============== цикл =============== */
  _loop() {
    this.raf = requestAnimationFrame((t) => {
      let ms = t - this.lastT;
      this.lastT = t;
      if (ms > 100) ms = 100; // пропуск пауз (переключение вкладки)
      if (!this.paused) {
        this.acc += ms;
        let n = 0;
        // фиксированный шаг физики (≤33 мс) — не зависит от 60/120/144 Гц
        while (this.acc >= FIXED_STEP && n < 4) {
          this._step(FIXED_STEP / 1000);
          this.acc -= FIXED_STEP;
          n++;
        }
        if (n === 4) this.acc = 0; // сброс накопившегося отставания
      } else {
        this.acc = 0;
      }
      this._draw();
      if (this.raf !== null) this._loop();
    });
  }

  _step(dt) {
    this.time += dt;
    M.Engine.update(this.engine, FIXED_STEP);

    const cb = this.currentBird;
    if (cb && cb.state === 'fly') {
      cb.flyTime += dt;
      const b = cb.body;
      // птица летит «носом» по траектории: выравниваем угол по направлению скорости
      M.Body.setAngle(b, Math.atan2(b.velocity.y, b.velocity.x));
      if (b.speed < 0.35 && b.angularSpeed < 0.05) cb.rest += dt; else cb.rest = 0;
      const oob = b.position.x < -200 || b.position.x > W + 200 || b.position.y > H + 200;
      if (cb.rest > 0.9 || oob || cb.flyTime > 12) this._birdDone();
    }

    M.Composite.allBodies(this.world).forEach((b) => {
      if (b.isStatic || !b.agMeta || b.agMeta.dead) return;
      if (b.position.y > H + 300 || b.position.x < -400 || b.position.x > W + 400) {
        if (b.agMeta.kind === 'enemy') { this.aliveEnemies--; if (this.aliveEnemies <= 0 && !this.ending) this._finish(true); }
        b.agMeta.dead = true;
        M.Composite.remove(this.world, b);
      }
    });

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    Object.keys(this.meta).forEach((id) => {
      const m = this.meta[id];
      if (m.flash > 0) m.flash -= dt;
    });

    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (this.drag && this.currentBird) this.predict = this._prediction();
  }

  /* =============== отрисовка =============== */
  _draw() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - .5) * 14 * this.shake, (Math.random() - .5) * 14 * this.shake);

    drawSky(ctx, this.decor);
    drawGround(ctx, this.decor);
    drawTerrain(ctx, this.world);
    drawSlingBase(ctx);

    const cb = this.currentBird;
    if (cb && cb.state === 'sling') band(ctx, { x: SLING.x + 15, y: SLING.y - 14 }, cb.body.position, 8);

    M.Composite.allBodies(this.world).forEach((b) => {
      const m = b.agMeta;
      if (m && !m.dead && m.kind === 'block') drawBlock(ctx, b, m);
    });
    M.Composite.allBodies(this.world).forEach((b) => {
      const m = b.agMeta;
      if (m && !m.dead && m.kind === 'enemy') drawEnemy(ctx, b, m);
    });

    if (this.drag && this.predict) {
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      this.predict.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.5, 6 - i * 0.08), 0, Math.PI * 2); ctx.fill();
      });
    }

    if (cb && !cb.body.agMeta.dead) drawBird(ctx, cb.body);
    if (cb && cb.state === 'sling') band(ctx, { x: SLING.x - 15, y: SLING.y - 14 }, cb.body.position, 8);

    this.particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      if (p.text) {
        ctx.font = 'bold ' + p.size + 'px Comic Sans MS, Segoe UI';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 4;
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    ctx.restore();
    if (this.hooks.onScore) this.hooks.onScore(this.score);
  }
}

/* =============== декорации =============== */
function makeDecor() {
  const d = { clouds: [], hills: [], tufts: [], stones: [], silhouettes: [] };
  for (let i = 0; i < 4; i++) d.clouds.push({ x: 150 + i * 400 + Math.random() * 120, y: 70 + Math.random() * 130, s: 0.8 + Math.random() * 0.9 });
  for (let i = 0; i < 5; i++) d.hills.push({ x: 120 + i * 340 + Math.random() * 100, w: 380 + Math.random() * 260, h: 70 + Math.random() * 60 });
  for (let i = 0; i < 46; i++) d.tufts.push({ x: Math.random() * W, y: GY + Math.random() * 8, h: 8 + Math.random() * 14, lean: Math.random() * 2 - 1 });
  for (let i = 0; i < 26; i++) d.stones.push({ x: Math.random() * W, y: GY + 46 + Math.random() * 44, r: 6 + Math.random() * 10 });
  for (let i = 0; i < 7; i++) d.silhouettes.push({ x: Math.random() * W, y: 430 + Math.random() * 180, s: 0.5 + Math.random() * 0.8 });
  return d;
}

/* =============== фон/рельеф =============== */
function drawSky(ctx, decor) {
  const sky = ctx.createLinearGradient(0, 0, 0, GY);
  sky.addColorStop(0, '#67b9ea'); sky.addColorStop(.55, '#9fd4f2'); sky.addColorStop(1, '#dcf1fb');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GY);

  // солнце с ореолом
  drawSun(ctx, 1360, 140);

  ctx.fillStyle = 'rgba(255,255,255,.28)';
  wave(ctx, 260, 42);

  ctx.fillStyle = 'rgba(190,220,240,.8)';
  decor.silhouettes.forEach((s) => birdSil(ctx, s.x, s.y, s.s));

  ctx.fillStyle = '#ffffff';
  decor.clouds.forEach((c) => puff(ctx, c.x, c.y, c.s));

  ctx.fillStyle = '#b5de68';
  decor.hills.forEach((h) => hill(ctx, h.x, GY - 34, h.w, h.h));
  ctx.fillStyle = '#98cc52';
  decor.hills.forEach((h) => hill(ctx, h.x + 60, GY - 10, h.w * .8, h.h * .6));
}
function wave(ctx, y, a) {
  ctx.beginPath(); ctx.moveTo(0, y);
  for (let x = 0; x <= W; x += 80) ctx.quadraticCurveTo(x + 40, y - a, x + 80, y);
  ctx.lineTo(W, 0); ctx.lineTo(0, 0); ctx.fill();
}
function drawSun(ctx, x, y) {
  // ореол
  const halo = ctx.createRadialGradient(x, y, 24, x, y, 170);
  halo.addColorStop(0, 'rgba(255,246,190,.95)');
  halo.addColorStop(.4, 'rgba(255,233,140,.55)');
  halo.addColorStop(1, 'rgba(255,233,140,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(x, y, 170, 0, Math.PI * 2); ctx.fill();
  // диск солнца
  ctx.fillStyle = '#fff7cd';
  ctx.beginPath(); ctx.arc(x, y, 44, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe98a';
  ctx.beginPath(); ctx.arc(x, y, 35, 0, Math.PI * 2); ctx.fill();
}
function birdSil(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.quadraticCurveTo(14, -16, 30, -8);
  ctx.quadraticCurveTo(24, 2, 30, 12); ctx.quadraticCurveTo(12, 8, 0, 0);
  ctx.fill();
  ctx.restore();
}
function puff(ctx, x, y, s) {
  ctx.beginPath();
  ctx.arc(x, y, 34 * s, 0, Math.PI * 2);
  ctx.arc(x + 40 * s, y + 8 * s, 26 * s, 0, Math.PI * 2);
  ctx.arc(x - 40 * s, y + 10 * s, 24 * s, 0, Math.PI * 2);
  ctx.arc(x + 8 * s, y - 20 * s, 24 * s, 0, Math.PI * 2);
  ctx.fill();
}
function hill(ctx, x, base, w, h) {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, base + 40);
  ctx.quadraticCurveTo(x, base - h * 2, x + w / 2, base + 40);
  ctx.fill();
}

function drawGround(ctx, decor) {
  const gr = ctx.createLinearGradient(0, GY, 0, GY + 26);
  gr.addColorStop(0, '#7fc13c'); gr.addColorStop(1, '#5c9626');
  ctx.fillStyle = gr; ctx.fillRect(0, GY, W, 26);
  const dr = ctx.createLinearGradient(0, GY + 26, 0, H);
  dr.addColorStop(0, '#6b4423'); dr.addColorStop(1, '#4a2e17');
  ctx.fillStyle = dr; ctx.fillRect(0, GY + 26, W, H - GY - 26);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  decor.stones.forEach((s) => {
    ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * .6, .3, 0, Math.PI * 2); ctx.fill();
  });
  ctx.strokeStyle = '#4e8b1f'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  decor.tufts.forEach((t) => {
    ctx.beginPath();
    ctx.moveTo(t.x, t.y + 6); ctx.quadraticCurveTo(t.x + t.lean * 4, t.y - t.h / 2, t.x + t.lean * 9, t.y - t.h);
    ctx.stroke();
  });
  ctx.fillStyle = '#2b5aa6';
  ctx.fillRect(0, H - 26, W, 26);
  ctx.fillStyle = '#3f74c9';
  for (let x = 14; x < W; x += 46) { ctx.beginPath(); ctx.arc(x, H - 14, 9, 0, Math.PI * 2); ctx.fill(); }
}

function drawTerrain(ctx, world) {
  M.Composite.allBodies(world).forEach((b) => {
    if (!b.agTerrain) return;
    const verts = b.vertices;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    const top = Math.min(...verts.map((v) => v.y));
    const bot = Math.max(...verts.map((v) => v.y));
    const grd = ctx.createLinearGradient(0, top, 0, bot);
    grd.addColorStop(0, '#6b4423'); grd.addColorStop(1, '#3f2814');
    ctx.fillStyle = grd; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#7fc13c';
    ctx.fillRect(verts[3].x, top, verts[2].x - verts[3].x, 14);
    ctx.fillStyle = '#5c9626';
    ctx.fillRect(verts[3].x, top + 14, verts[2].x - verts[3].x, 5);
  });
}

function drawSlingBase(ctx) {
  ctx.strokeStyle = '#7a4a22'; ctx.lineCap = 'round';
  ctx.lineWidth = 15;
  ctx.beginPath(); ctx.moveTo(SLING.x, GY + 4); ctx.lineTo(SLING.x, SLING.y + 26); ctx.stroke();
  ctx.lineWidth = 11; ctx.strokeStyle = '#8a5a2b';
  ctx.beginPath(); ctx.moveTo(SLING.x - 15, SLING.y - 14); ctx.lineTo(SLING.x - 1, SLING.y + 32); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(SLING.x + 15, SLING.y - 14); ctx.lineTo(SLING.x + 1, SLING.y + 32); ctx.stroke();
}
function band(ctx, from, to, w) {
  ctx.strokeStyle = '#4e342e'; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
}

/* =============== птички-друзья =============== */
function drawBird(ctx, body) {
  drawFaceSprite(ctx, body.agMeta.face, body.position.x, body.position.y, BIRD_R * 2.5, body.angle);
}
function drawFaceSprite(ctx, face, x, y, size, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (face && face.canvas) {
    const w = face.canvas.width, h = face.canvas.height;
    const s = Math.min(size / w, size / h);
    ctx.drawImage(face.canvas, -w * s / 2, -h * s / 2, w * s, h * s);
  } else {
    ctx.fillStyle = '#f4c542';
    ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* =============== блоки =============== */
function drawBlock(ctx, body, m) {
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
  const w = m.w, h = m.h, x = -w / 2, y = -h / 2;
  const r = Math.min(8, w / 4, h / 4);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();

  if (m.mat === 'wood') {
    const wg = ctx.createLinearGradient(x, y, x, y + h);
    wg.addColorStop(0, '#e09a45'); wg.addColorStop(1, '#c37a2c');
    ctx.fillStyle = wg; ctx.fill();
    ctx.strokeStyle = '#3d2714'; ctx.lineWidth = 5; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(122,74,26,.55)'; ctx.lineWidth = 2.5;
    if (w > h) {
      const step = Math.max(26, h / 3);
      for (let yy = y + step; yy < y + h; yy += step) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
    }
    ctx.restore();
  } else if (m.mat === 'ice') {
    ctx.fillStyle = 'rgba(177,227,255,.62)'; ctx.fill();
    ctx.strokeStyle = '#224e6b'; ctx.lineWidth = 5; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x + w * .25, y - 4); ctx.lineTo(x - 4, y + h * .5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w * .6, y - 4); ctx.lineTo(x + w * .3, y + h + 4); ctx.stroke();
    ctx.restore();
  } else if (m.mat === 'stone') {
    ctx.fillStyle = '#c6cace'; ctx.fill();
    ctx.strokeStyle = '#3a3d42'; ctx.lineWidth = 5; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(90,98,105,.5)'; ctx.lineWidth = 2.5;
    for (let by = y + h / 3; by < y + h; by += h / 3) { ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + w, by); ctx.stroke(); }
    ctx.fillStyle = 'rgba(90,98,105,.45)';
    for (let bx = x + 14; bx < x + w - 14; bx += 34) ctx.fillRect(bx, y + 8, 10, 10);
    ctx.restore();
  } else {
    ctx.fillStyle = '#c0533b'; ctx.fill();
    ctx.strokeStyle = '#3c1610'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#ffe8b0'; ctx.font = 'bold ' + Math.min(22, h * .3) + 'px Comic Sans MS';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TNT', 0, 0);
  }

  if (m.flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (m.flash * 2.5) + ')';
    ctx.fillRect(x, y, w, h);
  }
  const max = MATS[m.mat].hp;
  if (m.hp < max * .55 && m.hp > 0) {
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + w * .15, y + h * .2); ctx.lineTo(x + w * .4, y + h * .5); ctx.lineTo(x + w * .3, y + h * .8); ctx.stroke();
  }
  ctx.restore();
}

/* =============== свинки-копы =============== */
function drawEnemy(ctx, body, m) {
  const r = 28;
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle * 0.5);

  const grd = ctx.createRadialGradient(-r * .3, -r * .3, r * .2, 0, 0, r);
  grd.addColorStop(0, '#b5e06e'); grd.addColorStop(1, '#77b23c');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#243805'; ctx.lineWidth = 5; ctx.stroke();

  // пятачок
  ctx.fillStyle = '#d3ecab';
  ctx.beginPath(); ctx.ellipse(0, r * .35, r * .42, r * .3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4c7a1e';
  ctx.beginPath(); ctx.arc(-r * .16, r * .35, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r * .16, r * .35, 2.6, 0, Math.PI * 2); ctx.fill();

  // уши
  ctx.fillStyle = '#77b23c';
  tri(ctx, -r * .82, -r * .5, -r * .4, -r * .92, -r * .28, -r * .42);
  tri(ctx, r * .82, -r * .5, r * .4, -r * .92, r * .28, -r * .42);

  if (m.acc === 'cap') {
    ctx.fillStyle = '#1a3d6d';
    ctx.beginPath(); ctx.arc(0, -r * .55, r * .8, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0f2c50'; ctx.fillRect(-r * .85, -r * .55, r * 1.7, r * .18);
    ctx.fillStyle = '#ffd700'; star(ctx, 0, -r * .82, 6, 5);
  } else if (m.acc === 'helmet') {
    ctx.fillStyle = '#9aa0a6';
    ctx.beginPath(); ctx.arc(0, -r * .35, r * .9, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c8cdd2'; ctx.fillRect(-r * .12, -r * 1.15, r * .24, r * .55);
    ctx.strokeStyle = '#6f757b'; ctx.lineWidth = 2; ctx.stroke();
  } else if (m.acc === 'straw') {
    ctx.fillStyle = '#e8c558';
    ctx.beginPath(); ctx.ellipse(0, -r * .78, r * 1.15, r * .3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -r * .8, r * .62, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d6452f'; ctx.fillRect(-r * .62, -r * .86, r * 1.24, r * .16);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(r * .5, -r * .95, 4.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * .58, -r * 1.05, 4.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * .66, -r * .95, 4.5, 0, 7); ctx.fill();
  } else if (m.acc === 'bunny') {
    ctx.fillStyle = '#f8f3ff';
    ear(ctx, -r * .35, -r * .95, -.35, 1);
    ear(ctx, r * .35, -r * .95, .35, 1);
    ctx.fillStyle = '#f3b8c9';
    ear(ctx, -r * .35, -r * .95, -.35, .45);
    ear(ctx, r * .35, -r * .95, .35, .45);
  }

  eye(ctx, -r * .32, -r * .05); eye(ctx, r * .32, -r * .05);

  if (m.flash > 0) {
    ctx.fillStyle = 'rgba(255,60,60,' + Math.min(.6, m.flash * 3) + ')';
    ctx.beginPath(); ctx.arc(0, 0, r + 1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function ear(ctx, x, y, lean, k) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(lean);
  ctx.beginPath(); ctx.ellipse(0, -12, 7 * k, 16 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function tri(ctx, x1, y1, x2, y2, x3, y3) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
}
function eye(ctx, x, y) {
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + 1, y + 1, 2.3, 0, Math.PI * 2); ctx.fill();
}
function star(ctx, x, y, r, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? r * .45 : r;
    const a = Math.PI / points * i - Math.PI / 2;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fill();
}
