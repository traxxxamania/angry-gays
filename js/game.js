/* game.js — движок: рогатка, физика (Matter.js), разрушаемые постройки, враги-копы. */
(function (global) {
  'use strict';

  var M = global.Matter;
  var W = 1600, H = 900, GY = 820;
  var SLING = { x: 250, y: 660 };          // точка покоя птицы
  var DRAG_MAX = 135;
  var LAUNCH_K = 0.21;
  var BIRD_R = 30;

  var MATS = {
    wood:   { hp: 60,  density: 0.0012, friction: 0.6 },
    ice:    { hp: 30,  density: 0.0009, friction: 0.15 },
    stone:  { hp: 140, density: 0.0022, friction: 0.7 },
    powder: { hp: 10,  density: 0.0011, friction: 0.6 }
  };

  var enemyIdCounter = 0;

  /* =============== движок =============== */
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
      this.meta = {};                 // body.id -> {kind,...}
      this.particles = [];
      this.score = 0;
      this.shake = 0;
      this.time = 0;
      this.ending = false;
      this.aliveEnemies = 0;
      this.birdSprite = new Image();
      this.birdSpriteReady = false;
      this.currentBird = null;        // {body, state:'sling'|'fly', rest:0}
      this.drag = null;
      this.raf = null;
      this.lastT = 0;

      // спрайт птицы (лицо пользователя или дефолт)
      global.Face.getBirdSpriteURL(function (url) {
        self.birdSprite.onload = function () { self.birdSpriteReady = true; };
        self.birdSprite.src = url;
      });

      // земля
      add(this, M.Bodies.rectangle(W / 2, GY + 60, W * 2, 120, {
        isStatic: true, friction: 0.8, label: 'ground'
      }));

      // постройка
      level.blocks.forEach(function (b) { spawnBlock(self, b); });
      level.enemies.forEach(function (e) { spawnEnemy(self, e); });
      this.totalBlocks = level.blocks.length;

      // птицы
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
    }
  };

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

  function spawnEnemy(g, e) {
    var body = M.Bodies.circle(e.x, e.y, 28, {
      density: 0.001, friction: 0.5, restitution: 0.1
    });
    body.agMeta = {
      kind: 'enemy', hp: 30, flash: 0, dead: false,
      face: (enemyIdCounter++ % 2) ? 'tough' : 'nerd',
      spawnY: e.y
    };
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
    if (g.queue <= 0) {
      finish(g, false);
      return;
    }
    g.queue--;
    var body = M.Bodies.circle(SLING.x, SLING.y, BIRD_R, {
      density: 0.0012, friction: 0.4, restitution: 0.25
    });
    body.agMeta = { kind: 'bird', dead: false };
    add(g, body);
    M.Body.setStatic(body, true); // статик через setStatic, чтобы setStatic(false) корректно вернул массы
    g.meta[body.id] = body.agMeta;
    g.currentBird = { body: body, state: 'sling', rest: 0 };
    if (g.hooks.onBirds) g.hooks.onBirds(g.queue + 1);
  }

  /* =============== ввод =============== */
  function toWorld(g, e) {
    var r = g.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }

  function bindInput(g) {
    var c = g.canvas;
    function down(e) {
      if (g.ending || !g.currentBird || g.currentBird.state !== 'sling') return;
      var p = toWorld(g, e), b = g.currentBird.body;
      if (M.Vector.magnitude(M.Vector.sub(p, b.position)) < 110) {
        g.drag = true;
        startDrag(g, p);
        e.preventDefault();
      }
    }
    function move(e) {
      if (!g.drag) return;
      moveDrag(g, toWorld(g, e));
      e.preventDefault();
    }
    function up(e) {
      if (!g.drag) return;
      g.drag = null;
      release(g);
      e.preventDefault();
    }
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    g._input = { c: c, down: down, move: move, up: up };
  }

  function startDrag(g, p) { clampDrag(g, p); }
  function moveDrag(g, p) { clampDrag(g, p); }

  function clampDrag(g, p) {
    var a = { x: SLING.x, y: SLING.y };
    var d = M.Vector.sub(p, a);
    if (M.Vector.magnitude(d) > DRAG_MAX) d = M.Vector.mult(M.Vector.normalise(d), DRAG_MAX);
    M.Body.setPosition(g.currentBird.body, M.Vector.add(a, d));
  }

  function release(g) {
    var b = g.currentBird.body;
    var v = M.Vector.sub({ x: SLING.x, y: SLING.y }, b.position);
    var sp = M.Vector.magnitude(v);
    g.predict = null;
    if (sp < 6) { M.Body.setPosition(b, { x: SLING.x, y: SLING.y }); return; } // слишком слабо — отмена
    M.Body.setStatic(b, false);
    M.Body.setVelocity(b, { x: v.x * LAUNCH_K, y: v.y * LAUNCH_K });
    M.Body.setAngularVelocity(b, 0.12);
    g.currentBird.state = 'fly';
    g.currentBird.flyTime = 0;
  }

  /* прогноз траектории: симуляция на «черновом» движке */
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
      if (tmp.position.y > GY || tmp.position.x > W + 100) break;
    }
    M.Engine.clear(e);
    return pts;
  }

  /* =============== урон и разрушение =============== */
  function handleCollisions(g, ev) {
    ev.pairs.forEach(function (pair) {
      damageTouch(g, pair.bodyA, pair.bodyB);
      damageTouch(g, pair.bodyB, pair.bodyA);
    });
  }

  function relSpeed(a, b) {
    return M.Vector.magnitude(M.Vector.sub(a.velocity, b.velocity));
  }

  function damageTouch(g, self, other) {
    var ms = self.agMeta, mo = other.agMeta;
    if (!ms || ms.dead) return;
    if (other.label === 'ground') {
      // падение на землю: копам больно с высоты
      if (ms.kind === 'enemy' && self.speed > 9 && g.time > 1) hit(g, self, ms, self.speed * 3);
      return;
    }
    if (!mo || mo.dead) return;
    if (g.time < 1 && mo.kind === 'block' && ms.kind !== 'bird') return; // защита от саморазбора на старте
    var rv = relSpeed(self, other);
    if (rv < 2.2) return;

    if (ms.kind === 'bird' && mo.kind === 'block') hit(g, other, mo, rv * self.mass * 2.0);
    else if (ms.kind === 'bird' && mo.kind === 'enemy') hit(g, other, mo, rv * self.mass * 2.4);
    else if (ms.kind === 'block' && mo.kind === 'enemy') hit(g, other, mo, rv * self.mass * 1.1);
    else if (ms.kind === 'block' && mo.kind === 'block') {
      if (rv > 8) { hit(g, other, mo, rv * Math.min(self.mass, other.mass) * 0.35); hit(g, self, ms, rv * Math.min(self.mass, other.mass) * 0.35); }
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
      addScore(g, pos, 5000, '✕ Коп повален!');
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

    addScore(g, pos, 500, null);
    poof(g, pos, meta.mat === 'ice' ? '#b3e5fc' : meta.mat === 'wood' ? '#a1662f' : '#9e9e9e', 10);
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
      var power = (1 - dist / R);
      var dir = dist > 1 ? M.Vector.normalise(d) : { x: 0, y: -1 };
      if (b.isSleeping) M.Sleeping.set(b, false);
      M.Body.applyForce(b, b.position, {
        x: dir.x * power * b.mass * 0.12,
        y: (dir.y * power - power * 0.6) * b.mass * 0.12
      });
      var m = b.agMeta;
      if (m && !m.dead && m.kind !== 'bird') { // птицу взрыв не убивает — она сама доживёт до конца полёта
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
      } else if (g.hooks.onLose) {
        g.hooks.onLose(g.score);
      }
    }, won ? 900 : 1400);
  }

  function addScore(g, pos, v, text) {
    g.score += v;
    g.particles.push({ text: '+' + v, x: pos.x, y: pos.y - 40, vx: 0, vy: -0.8, life: 1.4, color: '#ffd54f', size: 26 });
    poof(g, pos, '#ffffff', 6);
  }

  function poof(g, pos, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
      g.particles.push({
        x: pos.x, y: pos.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5,
        life: 0.5 + Math.random() * 0.5, color: color, size: 3 + Math.random() * 5
      });
    }
  }

  /* =============== главный цикл =============== */
  function loop(g) {
    g.raf = requestAnimationFrame(function frame(t) {
      var dt = Math.min(40, t - g.lastT) / 1000;
      g.lastT = t;
      step(g, dt);
      g.raf = requestAnimationFrame(frame);
    });
  }

  function step(g, dt) {
    g.time += dt;
    M.Engine.update(g.engine, 1000 / 60);

    // птица в полёте
    var cb = g.currentBird;
    if (cb && cb.state === 'fly') {
      cb.flyTime += dt;
      var b = cb.body;
      if (b.speed < 0.35 && b.angularSpeed < 0.05) { cb.rest += dt; } else cb.rest = 0;
      var oob = b.position.x < -200 || b.position.x > W + 200 || b.position.y > H + 200;
      if (cb.rest > 0.9 || oob || cb.flyTime > 12) nextBird(g);
    }

    // тела улетают за мир — чистим
    M.Composite.allBodies(g.world).forEach(function (b) {
      if (b.isStatic || !b.agMeta || b.agMeta.dead) return;
      if (b.position.y > H + 300 || b.position.x < -400 || b.position.x > W + 400) {
        if (b.agMeta.kind === 'enemy') { g.aliveEnemies--; if (g.aliveEnemies <= 0) finish(g, true); }
        b.agMeta.dead = true;
        M.Composite.remove(g.world, b);
      }
    });

    // flash-таймеры
    Object.keys(g.meta).forEach(function (id) {
      var m = g.meta[id];
      if (m.flash > 0) m.flash -= dt;
    });

    // частицы
    for (var i = g.particles.length - 1; i >= 0; i--) {
      var p = g.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= dt;
      if (p.life <= 0) g.particles.splice(i, 1);
    }

    g.shake = Math.max(0, g.shake - dt * 2.2);

    // прогноз траектории при затяжке
    if (g.drag && g.currentBird) g.predict = computePrediction(g);

    draw(g);
  }

  /* =============== отрисовка =============== */
  function draw(g) {
    var ctx = g.ctx;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (g.shake > 0) {
      ctx.translate((Math.random() - .5) * 14 * g.shake, (Math.random() - .5) * 14 * g.shake);
    }

    drawSky(ctx);
    drawGround(ctx);
    drawQueueBirds(ctx, g);
    drawSlingBase(ctx);

    // резинка (задняя)
    var cb = g.currentBird;
    if (cb && cb.state === 'sling') {
      band(ctx, { x: SLING.x + 14, y: SLING.y - 12 }, cb.body.position, 7);
    }

    // блоки
    M.Composite.allBodies(g.world).forEach(function (b) {
      var m = b.agMeta;
      if (!m || m.dead) return;
      if (m.kind === 'block') drawBlock(ctx, b, m);
    });
    // враги
    M.Composite.allBodies(g.world).forEach(function (b) {
      var m = b.agMeta;
      if (m && !m.dead && m.kind === 'enemy') drawEnemy(ctx, b, m);
    });

    // точки траектории
    if (g.drag && g.predict) {
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      g.predict.forEach(function (p, i) {
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, 5 - i * 0.07), 0, Math.PI * 2); ctx.fill();
      });
    }

    // птица на рогатке/в полёте
    if (cb && !cb.body.agMeta.dead) drawBird(ctx, cb.body, g);

    // резинка (передняя)
    if (cb && cb.state === 'sling') {
      band(ctx, { x: SLING.x - 14, y: SLING.y - 12 }, cb.body.position, 7);
    }

    // частицы
    g.particles.forEach(function (p) {
      if (p.text) {
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.font = 'bold ' + p.size + 'px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    });

    ctx.restore();
    if (g.hooks.onScore) g.hooks.onScore(g.score);
  }

  function drawSky(ctx) {
    var sky = ctx.createLinearGradient(0, 0, 0, GY);
    sky.addColorStop(0, '#7ec0ff'); sky.addColorStop(0.7, '#cfeaff'); sky.addColorStop(1, '#eaf6ff');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GY);
    // солнце
    ctx.fillStyle = '#fff7c2';
    ctx.beginPath(); ctx.arc(140, 120, 54, 0, Math.PI * 2); ctx.fill();
    // облака
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    cloud(ctx, 520, 150, 1); cloud(ctx, 950, 100, .8); cloud(ctx, 1320, 210, 1.1);
    // холмы
    ctx.fillStyle = '#b9d77f';
    hill(ctx, 300, GY, 520, 150); hill(ctx, 1250, GY, 700, 190);
    ctx.fillStyle = '#a2c467';
    hill(ctx, 800, GY, 600, 110);
  }
  function cloud(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 28 * s, 0, Math.PI * 2);
    ctx.arc(x + 34 * s, y + 6 * s, 22 * s, 0, Math.PI * 2);
    ctx.arc(x - 34 * s, y + 8 * s, 20 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  function hill(ctx, x, base, w, h) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, base);
    ctx.quadraticCurveTo(x, base - h * 2, x + w / 2, base);
    ctx.fill();
  }

  function drawGround(ctx) {
    var gr = ctx.createLinearGradient(0, GY, 0, H);
    gr.addColorStop(0, '#7cb342'); gr.addColorStop(0.14, '#65983a'); gr.addColorStop(0.16, '#8d6e63'); gr.addColorStop(1, '#5d4037');
    ctx.fillStyle = gr; ctx.fillRect(0, GY, W, H - GY);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (var x = 20; x < W; x += 90) ctx.fillRect(x, GY + 4, 34, 3);
  }

  function drawSlingBase(ctx) {
    ctx.strokeStyle = '#6b4a2b';
    ctx.lineCap = 'round';
    ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(SLING.x, GY); ctx.lineTo(SLING.x, SLING.y + 26); ctx.stroke();
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(SLING.x - 14, SLING.y - 12); ctx.lineTo(SLING.x - 2, SLING.y + 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(SLING.x + 14, SLING.y - 12); ctx.lineTo(SLING.x + 2, SLING.y + 30); ctx.stroke();
  }

  function band(ctx, from, to, w) {
    ctx.strokeStyle = '#4e342e'; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  }

  function drawQueueBirds(ctx, g) {
    for (var i = 0; i < g.queue; i++) {
      var x = 90 + i * 78, y = GY - 30;
      if (g.birdSpriteReady) {
        ctx.save(); ctx.translate(x, y); ctx.scale(0.5, 0.5); ctx.rotate(-0.2 + i * 0.1);
        ctx.drawImage(g.birdSprite, -128, -128);
        ctx.restore();
      } else {
        ctx.fillStyle = '#f4c542';
        ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawBird(ctx, body, g) {
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    if (g.birdSpriteReady) {
      ctx.drawImage(g.birdSprite, -74, -74, 148, 148);
    } else {
      ctx.fillStyle = '#f4c542';
      ctx.beginPath(); ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawBlock(ctx, body, m) {
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    var w = m.w, h = m.h, x = -w / 2, y = -h / 2;

    if (m.mat === 'wood')      ctx.fillStyle = '#a1662f';
    else if (m.mat === 'ice')  ctx.fillStyle = 'rgba(160,220,250,.82)';
    else if (m.mat === 'stone') ctx.fillStyle = '#8d8d8d';
    else ctx.fillStyle = '#b5533c'; // powder

    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

    if (m.mat === 'wood') {
      ctx.strokeStyle = 'rgba(80,45,10,.55)'; ctx.lineWidth = 2;
      if (w > h) for (var i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x, y + h * i / 4); ctx.lineTo(x + w, y + h * i / 4); ctx.stroke(); }
      else for (var j = 1; j < 4; j++) { ctx.beginPath(); ctx.moveTo(x + w * j / 4, y); ctx.lineTo(x + w * j / 4, y + h); ctx.stroke(); }
    } else if (m.mat === 'ice') {
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w * .2, y + 4); ctx.lineTo(x + w * .1, y + h - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w * .55, y + 4); ctx.lineTo(x + w * .45, y + h - 4); ctx.stroke();
    } else if (m.mat === 'stone') {
      ctx.strokeStyle = 'rgba(50,50,50,.4)'; ctx.lineWidth = 2;
      for (var by = y + h / 4; by < y + h; by += h / 4) { ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + w, by); ctx.stroke(); }
    } else {
      // powder
      ctx.fillStyle = '#ffe8b0'; ctx.font = 'bold ' + Math.min(22, h * .3) + 'px Segoe UI';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TNT', 0, 0);
      ctx.strokeStyle = '#7a3524'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x + w, y + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + h - 8); ctx.lineTo(x + w, y + h - 8); ctx.stroke();
    }

    if (m.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (m.flash * 2.5) + ')';
      ctx.fillRect(x, y, w, h);
    }
    // трещины по остаточному hp
    var max = MATS[m.mat].hp;
    if (m.hp < max * 0.55) {
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w * .15, y + h * .2); ctx.lineTo(x + w * .4, y + h * .5); ctx.lineTo(x + w * .3, y + h * .8); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemy(ctx, body, m) {
    var x = 0, y = 0, r = 28;
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle * 0.5);

    // свинка-коп: зелёная голова
    var g = ctx.createRadialGradient(-r * .3, -r * .3, r * .2, 0, 0, r);
    g.addColorStop(0, '#9ccc65'); g.addColorStop(1, '#6a9a3b');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(30,50,10,.6)'; ctx.lineWidth = 2; ctx.stroke();

    // пятачок
    ctx.fillStyle = '#c5e1a5';
    ctx.beginPath(); ctx.ellipse(x, y + r * .35, r * .42, r * .3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#33691e';
    ctx.beginPath(); ctx.arc(x - r * .16, y + r * .35, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * .16, y + r * .35, 2.6, 0, Math.PI * 2); ctx.fill();

    // уши
    ctx.fillStyle = '#6a9a3b';
    tri(ctx, x - r * .8, y - r * .55, x - r * .35, y - r * .9, x - r * .3, y - r * .4);
    tri(ctx, x + r * .8, y - r * .55, x + r * .35, y - r * .9, x + r * .3, y - r * .4);

    // фуражка
    ctx.fillStyle = '#1a3d6d';
    ctx.beginPath();
    ctx.arc(x, y - r * .55, r * .8, Math.PI, 0);
    ctx.lineTo(x + r * .8, y - r * .45); ctx.lineTo(x - r * .8, y - r * .45);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0f2c50';
    ctx.fillRect(x - r * .85, y - r * .52, r * 1.7, r * .18);
    ctx.fillStyle = '#ffd700';
    star(ctx, x, y - r * .82, 6, 5);

    // глаза/очки — характер
    if (m.face === 'tough') {
      ctx.strokeStyle = '#1b3a10'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - r * .6, y - r * .18); ctx.lineTo(x - r * .18, y - r * .05); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + r * .6, y - r * .18); ctx.lineTo(x + r * .18, y - r * .05); ctx.stroke();
      eye(ctx, x - r * .32, y + r * .02); eye(ctx, x + r * .32, y + r * .02);
    } else {
      ctx.fillStyle = '#102030';
      rr(ctx, x - r * .62, y - r * .16, r * .55, r * .3, 4); rr(ctx, x + r * .07, y - r * .16, r * .55, r * .3, 4);
      ctx.strokeStyle = '#102030'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - r * .07, y - r * .02); ctx.lineTo(x + r * .07, y - r * .02); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc(x - r * .38, y - r * .06, 3, 0, Math.PI * 2); ctx.fill();
    }

    if (m.flash > 0) {
      ctx.fillStyle = 'rgba(255,60,60,' + Math.min(.6, m.flash * 3) + ')';
      ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function tri(ctx, x1, y1, x2, y2, x3, y3) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
  }
  function eye(ctx, x, y) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + 1, y + 1, 2.2, 0, Math.PI * 2); ctx.fill();
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
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
  }
})(window);
