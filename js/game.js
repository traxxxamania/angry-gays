/* game.js — движок: рогатка, физика (Matter.js), разрушаемые постройки,
 * свинки-копы, птички-друзья. Визуал — как на скриншотах оригинала. */
(function (global) {
  'use strict';

  var M = global.Matter;
  var W = 1600, H = 900, GY = 820;
  var SLING = { x: 250, y: 660 };
  var DRAG_MAX = 135;
  var LAUNCH_K = 0.21;
  var BIRD_R = 30;

  var MATS = {
    wood:   { hp: 60,  density: 0.0012, friction: 0.6 },
    ice:    { hp: 30,  density: 0.0009, friction: 0.15 },  // «стекло» со скриншотов
    stone:  { hp: 140, density: 0.0022, friction: 0.7 },
    powder: { hp: 10,  density: 0.0011, friction: 0.6 }
  };

  var ACCS = ['cap', 'helmet', 'straw', 'bunny'];
  var enemySeq = 0;

  var Game = global.Game = {
    start: function (levelIdx, hooks) {
      var self = this;
      this.hooks = hooks || {};
      this.levelIdx = levelIdx;
      var level = global.buildLevel(levelIdx);
      this.level = level;
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');

      this.engine = M.Engine.create();
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
      this.spawnCount = 0;
      this.decor = makeDecor();

      // рельеф
      (level.terrain || []).forEach(function (t) {
        var body = M.Bodies.rectangle(t.x, t.y, t.w, t.h, { isStatic: true, friction: 0.8, label: 'ground' });
        body.agTerrain = true;
        add(self, body);
      });

      // земля
      add(this, M.Bodies.rectangle(W / 2, GY + 60, W * 2, 120, {
        isStatic: true, friction: 0.8, label: 'ground'
      }));

      level.blocks.forEach(function (b) { spawnBlock(self, b); });
      level.enemies.forEach(function (e, i) { spawnEnemy(self, e, e.acc || ACCS[(enemySeq++) % ACCS.length]); });
      this.totalBlocks = level.blocks.length;

      this.queue = level.birds;
      nextBird(this);

      M.Events.on(this.engine, 'collisionStart', function (ev) { handleCollisions(self, ev); });
      bindInput(this);
      this.lastT = performance.now();
      loop(this);
      return this;
    },

    destroy: function () {
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this._input) {
        var c = this._input.c;
        c.removeEventListener('pointerdown', this._input.down);
        c.removeEventListener('pointermove', this._input.move);
        c.removeEventListener('pointerup', this._input.up);
        c.removeEventListener('pointercancel', this._input.up);
        this._input = null;
      }
      if (this.engine) M.World.clear(this.world, false);
      this.raf = null;
    },

    restart: function () {
      var idx = this.levelIdx, h = this.hooks;
      this.destroy();
      this.start(idx, h);
    },

    setPaused: function (v) { this.paused = v; }
  };

  /* =============== декорации (шум один раз на уровень) =============== */
  function makeDecor() {
    var d = { clouds: [], hills: [], tufts: [], stones: [], silhouettes: [] };
    for (var i = 0; i < 4; i++) d.clouds.push({ x: 150 + i * 400 + rnd() * 120, y: 70 + rnd() * 130, s: .8 + rnd() * .9 });
    for (i = 0; i < 5; i++) d.hills.push({ x: 120 + i * 340 + rnd() * 100, w: 380 + rnd() * 260, h: 70 + rnd() * 60 });
    for (i = 0; i < 46; i++) d.tufts.push({ x: rnd() * W, y: GY + rnd() * 8, h: 8 + rnd() * 14, lean: rnd() * 2 - 1 });
    for (i = 0; i < 26; i++) d.stones.push({ x: rnd() * W, y: GY + 46 + rnd() * 44, r: 6 + rnd() * 10 });
    for (i = 0; i < 7; i++) d.silhouettes.push({ x: rnd() * W, y: 430 + rnd() * 180, s: .5 + rnd() * .8 });
    return d;
  }
  function rnd() { return Math.sin(Date.now() % 100000 + Math.random() * 1000) * 0.5 + Math.random() * 0.5; }

  /* =============== сущности =============== */
  function add(g, body) { M.Composite.add(g.world, body); return body; }

  function spawnBlock(g, b) {
    var m = MATS[b.mat];
    var body = M.Bodies.rectangle(b.x, b.y, b.w, b.h, {
      density: m.density, friction: m.friction, restitution: 0.05
    });
    body.agMeta = { kind: 'block', mat: b.mat, hp: m.hp, w: b.w, h: b.h, flash: 0, dead: false };
    add(g, body);
    g.meta[body.id] = body.agMeta;
    return body;
  }

  function spawnEnemy(g, e, acc) {
    var body = M.Bodies.circle(e.x, e.y, 28, {
      density: 0.001, friction: 0.5, restitution: 0.1
    });
    body.agMeta = { kind: 'enemy', hp: 30, flash: 0, dead: false, acc: acc };
    add(g, body);
    g.meta[body.id] = body.agMeta;
    g.aliveEnemies++;
    return body;
  }

  function nextBird(g) {
    if (g.currentBird) {
      M.Composite.remove(g.world, g.currentBird.body);
      g.currentBird = null;
    }
    if (g.ending) return;
    if (g.queue <= 0) { finish(g, false); return; }
    g.queue--;
    var face = global.Birds.get(g.spawnCount++);
    var body = M.Bodies.circle(SLING.x, SLING.y, BIRD_R, {
      density: 0.0012, friction: 0.4, restitution: 0.25
    });
    body.agMeta = { kind: 'bird', dead: false, face: face };
    add(g, body);
    g.meta[body.id] = body.agMeta;
    M.Body.setStatic(body, true);
    g.currentBird = { body: body, state: 'sling', rest: 0, face: face };
    if (g.hooks.onBirds) g.hooks.onBirds(g.queue + 1, face);
  }

  /* =============== ввод =============== */
  function toWorld(g, e) {
    var r = g.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }

  function bindInput(g) {
    var c = g.canvas;
    function down(e) {
      if (g.ending || g.paused || !g.currentBird || g.currentBird.state !== 'sling') return;
      var p = toWorld(g, e), b = g.currentBird.body;
      if (M.Vector.magnitude(M.Vector.sub(p, b.position)) < 110) {
        g.drag = true;
        clampDrag(g, p);
        e.preventDefault();
      }
    }
    function move(e) { if (g.drag) { clampDrag(g, toWorld(g, e)); e.preventDefault(); } }
    function up(e) { if (g.drag) { g.drag = null; release(g); e.preventDefault(); } }
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    g._input = { c: c, down: down, move: move, up: up };
  }

  function clampDrag(g, p) {
    var d = M.Vector.sub(p, { x: SLING.x, y: SLING.y });
    if (M.Vector.magnitude(d) > DRAG_MAX) d = M.Vector.mult(M.Vector.normalise(d), DRAG_MAX);
    M.Body.setPosition(g.currentBird.body, M.Vector.add({ x: SLING.x, y: SLING.y }, d));
  }

  function release(g) {
    var b = g.currentBird.body;
    var v = M.Vector.sub({ x: SLING.x, y: SLING.y }, b.position);
    g.predict = null;
    if (M.Vector.magnitude(v) < 6) { M.Body.setPosition(b, { x: SLING.x, y: SLING.y }); return; }
    M.Body.setStatic(b, false);
    M.Body.setVelocity(b, { x: v.x * LAUNCH_K, y: v.y * LAUNCH_K });
    M.Body.setAngularVelocity(b, 0.12);
    g.currentBird.state = 'fly';
    g.currentBird.flyTime = 0;
  }

  function computePrediction(g) {
    var b = g.currentBird.body;
    var v = M.Vector.sub({ x: SLING.x, y: SLING.y }, b.position);
    if (M.Vector.magnitude(v) < 6) return null;
    var e = M.Engine.create();
    var tmp = M.Bodies.circle(0, 0, BIRD_R, { density: 0.0012 });
    M.Body.setPosition(tmp, { x: b.position.x, y: b.position.y });
    M.Body.setVelocity(tmp, { x: v.x * LAUNCH_K, y: v.y * LAUNCH_K });
    M.Composite.add(e.world, tmp);
    var pts = [];
    for (var i = 0; i < 90; i++) {
      M.Engine.update(e, 1000 / 60);
      if (i % 5 === 0) pts.push({ x: tmp.position.x, y: tmp.position.y });
      if (tmp.position.y > GY - 10 || tmp.position.x > W + 100) break;
    }
    M.Engine.clear(e);
    return pts;
  }

  /* =============== урон =============== */
  function handleCollisions(g, ev) {
    ev.pairs.forEach(function (pair) {
      damageTouch(g, pair.bodyA, pair.bodyB);
      damageTouch(g, pair.bodyB, pair.bodyA);
    });
  }

  function relSpeed(a, b) { return M.Vector.magnitude(M.Vector.sub(a.velocity, b.velocity)); }

  function damageTouch(g, self, other) {
    var ms = self.agMeta, mo = other.agMeta;
    if (!ms || ms.dead) return;
    if (other.label === 'ground') {
      if (ms.kind === 'enemy' && self.speed > 9 && g.time > 1) hit(g, self, ms, self.speed * 3);
      return;
    }
    if (!mo || mo.dead) return;
    if (g.time < 1 && mo.kind === 'block' && ms.kind !== 'bird') return;
    var rv = relSpeed(self, other);
    if (rv < 2.2) return;

    if (ms.kind === 'bird' && mo.kind === 'block') hit(g, other, mo, rv * self.mass * 2.0);
    else if (ms.kind === 'bird' && mo.kind === 'enemy') hit(g, other, mo, rv * self.mass * 2.4);
    else if (ms.kind === 'block' && mo.kind === 'enemy') hit(g, other, mo, rv * self.mass * 1.1);
    else if (ms.kind === 'block' && mo.kind === 'block') {
      if (rv > 8) {
        hit(g, other, mo, rv * Math.min(self.mass, other.mass) * 0.35);
        hit(g, self, ms, rv * Math.min(self.mass, other.mass) * 0.35);
      }
    } else if (ms.kind === 'enemy' && mo.kind === 'block') {
      if (rv > 8) hit(g, other, mo, rv * self.mass * 0.9);
    }
  }

  function hit(g, body, meta, dmg) {
    if (meta.dead || dmg <= 0) return;
    meta.hp -= dmg;
    meta.flash = 0.18;
    if (meta.hp <= 0) destroyEntity(g, body, meta);
  }

  function destroyEntity(g, body, meta) {
    if (meta.dead) return;
    meta.dead = true;
    var pos = body.position;

    if (meta.kind === 'enemy') {
      g.aliveEnemies--;
      addScore(g, pos, 5000);
      poof(g, pos, '#8bc34a', 22);
      M.Composite.remove(g.world, body);
      if (g.aliveEnemies <= 0) finish(g, true);
      return;
    }
    if (meta.mat === 'powder') {
      explode(g, pos);
      M.Composite.remove(g.world, body);
      return;
    }
    addScore(g, pos, 500);
    poof(g, pos, meta.mat === 'ice' ? '#b3e5fc' : meta.mat === 'wood' ? '#c97b3c' : '#b9bcc0', 10);
    M.Composite.remove(g.world, body);
  }

  function explode(g, center) {
    g.shake = 1;
    poof(g, center, '#ff9800', 40);
    poof(g, center, '#616161', 25);
    var R = 260;
    M.Composite.allBodies(g.world).forEach(function (b) {
      if (b.isStatic) return;
      var d = M.Vector.sub(b.position, center);
      var dist = M.Vector.magnitude(d);
      if (dist > R) return;
      var power = 1 - dist / R;
      var dir = dist > 1 ? M.Vector.normalise(d) : { x: 0, y: -1 };
      if (b.isSleeping) M.Sleeping.set(b, false);
      M.Body.applyForce(b, b.position, {
        x: dir.x * power * b.mass * 0.12,
        y: (dir.y * power - power * 0.6) * b.mass * 0.12
      });
      var m = b.agMeta;
      if (m && !m.dead && m.kind !== 'bird') {
        if (dist < 110) destroyEntity(g, b, m);
        else hit(g, b, m, power * 90);
      }
    });
    if (g.aliveEnemies <= 0 && !g.ending) finish(g, true);
  }

  function finish(g, won) {
    if (g.ending) return;
    g.ending = true;
    setTimeout(function () {
      if (won) {
        var bonus = g.queue * 10000;
        g.score += bonus;
        var s1 = g.level.enemies.length * 5000;
        var stars = g.score >= s1 + 20000 ? 3 : g.score >= s1 + 10000 ? 2 : 1;
        if (g.hooks.onWin) g.hooks.onWin(g.score, stars, bonus);
      } else if (g.hooks.onLose) g.hooks.onLose(g.score);
    }, won ? 900 : 1400);
  }

  function addScore(g, pos, v) {
    g.score += v;
    g.particles.push({ text: '+' + v, x: pos.x, y: pos.y - 40, vx: 0, vy: -0.8, life: 1.4, color: '#ffd54f', size: 26 });
    poof(g, pos, '#ffffff', 6);
  }

  function poof(g, pos, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
      g.particles.push({
        x: pos.x, y: pos.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5,
        life: .5 + Math.random() * .5, color: color, size: 3 + Math.random() * 5
      });
    }
  }

  /* =============== цикл =============== */
  function loop(g) {
    g.raf = requestAnimationFrame(function frame(t) {
      var dt = Math.min(40, t - g.lastT) / 1000;
      g.lastT = t;
      if (!g.paused) step(g, dt);
      draw(g);
      g.raf = requestAnimationFrame(frame);
    });
  }

  function step(g, dt) {
    g.time += dt;
    M.Engine.update(g.engine, 1000 / 60);

    var cb = g.currentBird;
    if (cb && cb.state === 'fly') {
      cb.flyTime += dt;
      var b = cb.body;
      if (b.speed < 0.35 && b.angularSpeed < 0.05) cb.rest += dt; else cb.rest = 0;
      var oob = b.position.x < -200 || b.position.x > W + 200 || b.position.y > H + 200;
      if (cb.rest > 0.9 || oob || cb.flyTime > 12) nextBird(g);
    }

    M.Composite.allBodies(g.world).forEach(function (b) {
      if (b.isStatic || !b.agMeta || b.agMeta.dead) return;
      if (b.position.y > H + 300 || b.position.x < -400 || b.position.x > W + 400) {
        if (b.agMeta.kind === 'enemy') { g.aliveEnemies--; if (g.aliveEnemies <= 0 && !g.ending) finish(g, true); }
        b.agMeta.dead = true;
        M.Composite.remove(g.world, b);
      }
    });

    for (var i = g.particles.length - 1; i >= 0; i--) {
      var p = g.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= dt;
      if (p.life <= 0) g.particles.splice(i, 1);
    }
    Object.keys(g.meta).forEach(function (id) {
      var m = g.meta[id];
      if (m.flash > 0) m.flash -= dt;
    });

    g.shake = Math.max(0, g.shake - dt * 2.2);
    if (g.drag && g.currentBird) g.predict = computePrediction(g);
  }

  /* =============== отрисовка =============== */
  function draw(g) {
    var ctx = g.ctx;
    ctx.save();
    if (g.shake > 0) ctx.translate((Math.random() - .5) * 14 * g.shake, (Math.random() - .5) * 14 * g.shake);

    drawSky(ctx, g);
    drawGround(ctx, g);
    drawTerrain(ctx, g);
    drawQueueBirds(ctx, g);
    drawSlingBase(ctx);

    var cb = g.currentBird;
    if (cb && cb.state === 'sling') band(ctx, { x: SLING.x + 15, y: SLING.y - 14 }, cb.body.position, 8);

    M.Composite.allBodies(g.world).forEach(function (b) {
      var m = b.agMeta;
      if (m && !m.dead && m.kind === 'block') drawBlock(ctx, b, m);
    });
    M.Composite.allBodies(g.world).forEach(function (b) {
      var m = b.agMeta;
      if (m && !m.dead && m.kind === 'enemy') drawEnemy(ctx, b, m);
    });

    if (g.drag && g.predict) {
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      g.predict.forEach(function (p, i) {
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.5, 6 - i * 0.08), 0, Math.PI * 2); ctx.fill();
      });
    }

    if (cb && !cb.body.agMeta.dead) drawBird(ctx, cb.body, g);
    if (cb && cb.state === 'sling') band(ctx, { x: SLING.x - 15, y: SLING.y - 14 }, cb.body.position, 8);

    g.particles.forEach(function (p) {
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
    if (g.hooks.onScore) g.hooks.onScore(g.score);
  }

  /* --- фон как на скриншотах --- */
  function drawSky(ctx, g) {
    var sky = ctx.createLinearGradient(0, 0, 0, GY);
    sky.addColorStop(0, '#67b9ea'); sky.addColorStop(.55, '#9fd4f2'); sky.addColorStop(1, '#dcf1fb');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GY);

    // дальние светлые волны
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    wave(ctx, 260, 42);
    // силуэты птичек вдали
    ctx.fillStyle = 'rgba(190,220,240,.8)';
    g.decor.silhouettes.forEach(function (s) { birdSil(ctx, s.x, s.y, s.s); });

    // облака
    ctx.fillStyle = '#ffffff';
    g.decor.clouds.forEach(function (c) { puff(ctx, c.x, c.y, c.s); });

    // зелёные холмы позади
    ctx.fillStyle = '#b5de68';
    g.decor.hills.forEach(function (h) { hill(ctx, h.x, GY - 34, h.w, h.h); });
    ctx.fillStyle = '#98cc52';
    g.decor.hills.forEach(function (h) { hill(ctx, h.x + 60, GY - 10, h.w * .8, h.h * .6); });
  }
  function wave(ctx, y, a) {
    ctx.beginPath(); ctx.moveTo(0, y);
    for (var x = 0; x <= W; x += 80) ctx.quadraticCurveTo(x + 40, y - a, x + 80, y);
    ctx.lineTo(W, 0); ctx.lineTo(0, 0); ctx.fill();
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

  function drawGround(ctx, g) {
    // трава
    var gr = ctx.createLinearGradient(0, GY, 0, GY + 26);
    gr.addColorStop(0, '#7fc13c'); gr.addColorStop(1, '#5c9626');
    ctx.fillStyle = gr; ctx.fillRect(0, GY, W, 26);
    // земля
    var dr = ctx.createLinearGradient(0, GY + 26, 0, H);
    dr.addColorStop(0, '#6b4423'); dr.addColorStop(1, '#4a2e17');
    ctx.fillStyle = dr; ctx.fillRect(0, GY + 26, W, H - GY - 26);
    // крапины в земле
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    g.decor.stones.forEach(function (s) {
      ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * .6, .3, 0, Math.PI * 2); ctx.fill();
    });
    // травинки
    ctx.strokeStyle = '#4e8b1f'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    g.decor.tufts.forEach(function (t) {
      ctx.beginPath();
      ctx.moveTo(t.x, t.y + 6); ctx.quadraticCurveTo(t.x + t.lean * 4, t.y - t.h / 2, t.x + t.lean * 9, t.y - t.h);
      ctx.stroke();
    });
    // нижний сине-каменный слой как на скринах
    ctx.fillStyle = '#2b5aa6';
    ctx.fillRect(0, H - 26, W, 26);
    ctx.fillStyle = '#3f74c9';
    for (var x = 14; x < W; x += 46) { ctx.beginPath(); ctx.arc(x, H - 14, 9, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawTerrain(ctx, g) {
    M.Composite.allBodies(g.world).forEach(function (b) {
      if (!b.agTerrain) return;
      var verts = b.vertices;
      // насыпь: земля + травяная шапка
      ctx.beginPath();
      ctx.moveTo(verts[0].x, verts[0].y);
      for (var i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
      ctx.closePath();
      var top = Math.min.apply(null, verts.map(function (v) { return v.y; }));
      var bot = Math.max.apply(null, verts.map(function (v) { return v.y; }));
      var grd = ctx.createLinearGradient(0, top, 0, bot);
      grd.addColorStop(0, '#6b4423'); grd.addColorStop(1, '#3f2814');
      ctx.fillStyle = grd; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 3; ctx.stroke();
      // травяная кромка
      ctx.fillStyle = '#7fc13c';
      ctx.fillRect(verts[3].x, top, verts[2].x - verts[3].x, 14);
      ctx.fillStyle = '#5c9626';
      ctx.fillRect(verts[3].x, top + 14, verts[2].x - verts[3].x, 5);
    });
  }

  function drawSlingBase(ctx) {
    // классическая деревянная рогатка
    ctx.strokeStyle = '#7a4a22'; ctx.lineCap = 'round';
    ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(SLING.x, GY + 4); ctx.lineTo(SLING.x, SLING.y + 26); ctx.stroke();
    ctx.lineWidth = 11;
    ctx.strokeStyle = '#8a5a2b';
    ctx.beginPath(); ctx.moveTo(SLING.x - 15, SLING.y - 14); ctx.lineTo(SLING.x - 1, SLING.y + 32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(SLING.x + 15, SLING.y - 14); ctx.lineTo(SLING.x + 1, SLING.y + 32); ctx.stroke();
  }

  function band(ctx, from, to, w) {
    ctx.strokeStyle = '#4e342e'; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  }

  /* --- птички-друзья --- */
  function drawQueueBirds(ctx, g) {
    for (var i = 0; i < g.queue; i++) {
      var face = global.Birds.get(g.spawnCount + i);
      var x = 80 + i * 66, y = GY - 26;
      drawFaceSprite(ctx, face, x, y, 52, Math.sin(i * 2.3) * .12);
    }
  }

  function drawBird(ctx, body, g) {
    var face = body.agMeta.face;
    drawFaceSprite(ctx, face, body.position.x, body.position.y, BIRD_R * 2.5, body.angle);
  }

  function drawFaceSprite(ctx, face, x, y, size, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (face && face.canvas) {
      // лёгкое «пёрышко» сзади — как у птиц
      ctx.fillStyle = '#5b3a1e';
      ctx.beginPath();
      ctx.moveTo(-size * .42, 0); ctx.lineTo(-size * .68, -size * .14); ctx.lineTo(-size * .62, size * .1);
      ctx.closePath(); ctx.fill();
      ctx.drawImage(face.canvas, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = '#f4c542';
      ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* --- блоки: дерево / стекло / камень как на скринах --- */
  function drawBlock(ctx, body, m) {
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    var w = m.w, h = m.h, x = -w / 2, y = -h / 2;
    var r = Math.min(8, w / 4, h / 4);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();

    if (m.mat === 'wood') {
      var wg = ctx.createLinearGradient(x, y, x, y + h);
      wg.addColorStop(0, '#e09a45'); wg.addColorStop(1, '#c37a2c');
      ctx.fillStyle = wg; ctx.fill();
      ctx.strokeStyle = '#8a4f16'; ctx.lineWidth = 4; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(122,74,26,.55)'; ctx.lineWidth = 2.5;
      if (w > h) { var step = Math.max(26, h / 3); for (var yy = y + step; yy < y + h; yy += step) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); } }
      else { var sx = Math.max(26, w / 3); ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke(); }
      ctx.restore();
    } else if (m.mat === 'ice') {
      ctx.fillStyle = 'rgba(177,227,255,.62)'; ctx.fill();
      ctx.strokeStyle = 'rgba(122,196,238,.95)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x + w * .25, y - 4); ctx.lineTo(x - 4, y + h * .5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w * .6, y - 4); ctx.lineTo(x + w * .3, y + h + 4); ctx.stroke();
      ctx.restore();
    } else if (m.mat === 'stone') {
      ctx.fillStyle = '#c6cace'; ctx.fill();
      ctx.strokeStyle = '#8d949b'; ctx.lineWidth = 4; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(90,98,105,.5)'; ctx.lineWidth = 2.5;
      for (var by = y + h / 3; by < y + h; by += h / 3) { ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + w, by); ctx.stroke(); }
      ctx.fillStyle = 'rgba(90,98,105,.45)';
      for (var bx = x + 14; bx < x + w - 14; bx += 34) ctx.fillRect(bx, y + 8, 10, 10);
      ctx.restore();
    } else {
      ctx.fillStyle = '#c0533b'; ctx.fill();
      ctx.strokeStyle = '#7a2e1c'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#ffe8b0'; ctx.font = 'bold ' + Math.min(22, h * .3) + 'px Comic Sans MS';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TNT', 0, 0);
    }

    if (m.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (m.flash * 2.5) + ')';
      ctx.fillRect(x, y, w, h);
    }
    var max = MATS[m.mat].hp;
    if (m.hp < max * .55 && m.hp > 0) {
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w * .15, y + h * .2); ctx.lineTo(x + w * .4, y + h * .5); ctx.lineTo(x + w * .3, y + h * .8); ctx.stroke();
    }
    ctx.restore();
  }

  /* --- свинки-копы с аксессуарами (шапка/каска/соломенная/ушки) --- */
  function drawEnemy(ctx, body, m) {
    var r = 28;
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle * 0.5);

    var grd = ctx.createRadialGradient(-r * .3, -r * .3, r * .2, 0, 0, r);
    grd.addColorStop(0, '#b5e06e'); grd.addColorStop(1, '#77b23c');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,70,15,.6)'; ctx.lineWidth = 2.5; ctx.stroke();

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

    // аксессуары
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
      ctx.beginPath(); ctx.arc(r * .5, -r * .95, 4.5, 0, 7); ctx.arc(r * .58, -r * 1.05, 4.5, 0, 7); ctx.arc(r * .66, -r * .95, 4.5, 0, 7); ctx.fill();
    } else if (m.acc === 'bunny') {
      ctx.fillStyle = '#f8f3ff';
      ear(ctx, -r * .35, -r * .95, -.35);
      ear(ctx, r * .35, -r * .95, .35);
      ctx.fillStyle = '#f3b8c9';
      ear(ctx, -r * .35, -r * .95, -.35, .45);
      ear(ctx, r * .35, -r * .95, .35, .45);
    }

    // глаза
    eye(ctx, -r * .32, -r * .05); eye(ctx, r * .32, -r * .05);

    if (m.flash > 0) {
      ctx.fillStyle = 'rgba(255,60,60,' + Math.min(.6, m.flash * 3) + ')';
      ctx.beginPath(); ctx.arc(0, 0, r + 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function ear(ctx, x, y, lean, k) {
    k = k || 1;
    ctx.save(); ctx.translate(x, y); ctx.rotate(lean);
    ctx.beginPath(); ctx.ellipse(0, -12 * (k === 1 ? 1 : 1), 7 * k, 16 * k, 0, 0, Math.PI * 2); ctx.fill();
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
    for (var i = 0; i < points * 2; i++) {
      var rad = i % 2 ? r * .45 : r;
      var a = Math.PI / points * i - Math.PI / 2;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fill();
  }
})(window);
