/* face.js — захват лица пользователя и сборка спрайта «птички».
 * Лицо хранится в localStorage как круглый PNG; спрайт птицы композится из лица +
 * клюв/хвост/хохолок. Всё рисуется на canvas, картинки не подгружаются. */
(function (global) {
  'use strict';

  var NS = ['a','n','g','r','y','s','w','i','n','e','.'].join(''); // префикс ключей localStorage
  var FACE_KEY = NS + 'face';        // круглый кроп лица (dataURL)
  var BIRD_KEY = NS + 'bird';        // собранный спрайт птицы (dataURL)

  /* ---------- дефолтная «птичка» (если лицо не загружено) ---------- */
  function drawDefaultBird(ctx, size) {
    var r = size * 0.36;
    var cx = size * 0.46, cy = size * 0.5;
    // тело
    ctx.fillStyle = '#f4c542';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // глаза
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.25, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.25, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.2, r * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.4, cy - r * 0.2, r * 0.12, 0, Math.PI * 2); ctx.fill();
    // клюв
    ctx.fillStyle = '#e8770a';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.25, cy + r * 0.25);
    ctx.lineTo(cx + r * 0.25, cy + r * 0.25);
    ctx.lineTo(cx, cy + r * 0.75);
    ctx.closePath(); ctx.fill();
    // хохолок
    ctx.strokeStyle = '#222'; ctx.lineWidth = size * 0.03; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx - r * 0.15, cy - r * 1.35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.15, cy - r * 1.35); ctx.stroke();
  }

  /* ---------- сборка спрайта птицы вокруг круглого лица ---------- */
  function buildBirdSprite(faceURL, cb) {
    var size = 256;
    var c = document.createElement('canvas'); c.width = c.height = size;
    var ctx = c.getContext('2d');
    var cx = size * 0.5, cy = size * 0.5, r = size * 0.40;

    function finish() { cb(c.toDataURL('image/png')); }

    function parts() {
      // хохолок поверх головы
      ctx.strokeStyle = '#c62828'; ctx.lineWidth = size * 0.035; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - r * 0.2, cy - r * 0.95); ctx.lineTo(cx - r * 0.3, cy - r * 1.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx - r * 0.05, cy - r * 1.32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + r * 0.2, cy - r * 0.95); ctx.lineTo(cx + r * 0.22, cy - r * 1.26); ctx.stroke();
      // клюв
      ctx.fillStyle = '#f9a825';
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.55, cy + r * 0.05);
      ctx.lineTo(cx + r * 1.3, cy + r * 0.28);
      ctx.lineTo(cx + r * 0.5, cy + r * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; ctx.stroke();
      // хвост
      ctx.fillStyle = '#7b1fa2';
      [[-0.85, 0.02], [-0.78, 0.18], [-0.68, 0.3]].forEach(function (p) {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.92, cy + r * 0.1);
        ctx.lineTo(cx - r * (0.92 + 0.5 * (1 - Math.abs(p[1]))) , cy + r * (p[1] * 2 - 0.15));
        ctx.lineTo(cx - r * 0.8, cy + r * (p[1] + 0.35));
        ctx.closePath(); ctx.fill();
      });
      // обводка круга лица
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = size * 0.02;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }

    if (!faceURL) {
      // дефолт: мультяшная база + клюв поверх
      drawDefaultBase(ctx, size); parts(); finish(); return;
    }
    var img = new Image();
    img.onload = function () {
      // круглая маска лица
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
      // «перьевая» кайма
      ctx.strokeStyle = '#d84315'; ctx.lineWidth = size * 0.045;
      ctx.beginPath(); ctx.arc(cx, cy, r + size * 0.015, 0, Math.PI * 2); ctx.stroke();
      parts(); finish();
    };
    img.onerror = function () { drawDefaultBase(ctx, size); parts(); finish(); };
    img.src = faceURL;
  }

  function drawDefaultBase(ctx, size) {
    var cx = size / 2, cy = size / 2, r = size * 0.4;
    var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
    g.addColorStop(0, '#ffe082'); g.addColorStop(1, '#f4a825');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // глаза
    [-1, 1].forEach(function (s) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx + s * r * 0.35, cy - r * 0.15, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(cx + s * r * 0.3, cy - r * 0.1, r * 0.11, 0, Math.PI * 2); ctx.fill();
    });
  }

  /* ---------- публичный API ---------- */
  global.Face = {
    load: function () {
      return { face: localStorage.getItem(FACE_KEY), bird: localStorage.getItem(BIRD_KEY) };
    },
    getBirdSpriteURL: function (cb) {
      var st = this.load();
      if (st.bird && currentSpriteKey(st.face)) { cb(st.bird); return; }
      buildBirdSprite(st.face, function (url) {
        try {
          localStorage.setItem(BIRD_KEY, url);
          localStorage.setItem(FACE_CACHE_KEY, st.face || '');
        } catch (e) { /* переполнение localStorage — игнорируем, спрайт в памяти есть */ }
        cachedBird = url;
        cb(url);
      });
    },
    setFace: function (faceDataURL) {
      try { localStorage.setItem(FACE_KEY, faceDataURL); } catch (e) {}
      cachedBird = null;
    },
    clearFace: function () {
      localStorage.removeItem(FACE_KEY); localStorage.removeItem(BIRD_KEY);
      localStorage.removeItem(FACE_CACHE_KEY); cachedBird = null;
    },
    hasFace: function () { return !!localStorage.getItem(FACE_KEY); }
  };

  var FACE_CACHE_KEY = NS + 'src'; // лицо, для которого собран кэшированный спрайт
  var cachedBird = null;
  function currentSpriteKey(face) { return localStorage.getItem(FACE_CACHE_KEY) === (face || ''); }

  /* ---------- FaceCropper: выбор региона лица из video/img ---------- */
  /* sourceEl — <video> или <img>. Рисует на adjust-canvas, маска-круг по центру,
   * перетаскивание панорамирует, слайдер масштабирует. capture() → dataURL круга. */
  global.FaceCropper = function (canvas, sourceEl) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var R = Math.min(W, H) * 0.36;           // радиус маски
    var scale = 1, panX = 0, panY = 0;       // масштаб от «contain»
    var dragging = false, lastX = 0, lastY = 0;
    var ready = false;

    function baseScale() {
      var sw = sourceEl.videoWidth || sourceEl.naturalWidth || sourceEl.width;
      var sh = sourceEl.videoHeight || sourceEl.naturalHeight || sourceEl.height;
      if (!sw || !sh) return 1;
      return Math.max(W / sw, H / sh);       // cover
    }
    function resetView() {
      var sw = sourceEl.videoWidth || sourceEl.naturalWidth;
      var sh = sourceEl.videoHeight || sourceEl.naturalHeight;
      var b = baseScale() * scale;
      panX = (W - sw * b) / 2;
      panY = (H - sh * b) / 2;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0f1a'; ctx.fillRect(0, 0, W, H);
      var sw = sourceEl.videoWidth || sourceEl.naturalWidth;
      var sh = sourceEl.videoHeight || sourceEl.naturalHeight;
      var b = baseScale() * scale;
      ctx.save();
      ctx.translate(panX, panY); ctx.scale(b, b);
      if (ready) ctx.drawImage(sourceEl, 0, 0);
      ctx.restore();
      // затемнение снаружи круга
      ctx.save();
      ctx.fillStyle = 'rgba(6,9,16,.78)';
      ctx.beginPath(); ctx.rect(0, 0, W, H);
      ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.restore();
      // рамка круга
      ctx.strokeStyle = '#ffb300'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]);
      ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (!ready) {
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '18px Segoe UI'; ctx.textAlign = 'center';
        ctx.fillText('лицо появится здесь', W / 2, H / 2);
      }
    }

    // pointer-события
    canvas.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.offsetX; lastY = e.offsetY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      panX += e.offsetX - lastX; panY += e.offsetY - lastY;
      lastX = e.offsetX; lastY = e.offsetY; draw();
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      canvas.addEventListener(ev, function () { dragging = false; });
    });

    this.setSource = function (el) {
      sourceEl = el; ready = true; this.ready = true; this.reset();
    };
    this.ready = false;
    this.setScaleFactor = function (f) { scale = f; draw(); };
    this.reset = function () { scale = 1; resetView(); draw(); };
    this.redraw = draw;

    this.capture = function () {
      var sw = sourceEl.videoWidth || sourceEl.naturalWidth;
      var sh = sourceEl.videoHeight || sourceEl.naturalHeight;
      var b = baseScale() * scale;
      var out = document.createElement('canvas');
      out.width = out.height = 256;
      var o = out.getContext('2d');
      o.save();
      o.beginPath(); o.arc(128, 128, 120, 0, Math.PI * 2); o.clip();
      var k = 256 / (R * 2);
      o.translate(128, 128); o.scale(k, k); o.translate(-W / 2, -H / 2);
      o.translate(panX, panY); o.scale(b, b);
      if (ready) o.drawImage(sourceEl, 0, 0);
      o.restore();
      return out.toDataURL('image/png');
    };

    draw();
  };
})(window);
