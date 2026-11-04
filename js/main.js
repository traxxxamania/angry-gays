/* main.js — экраны, меню, прогресс, модалка лица. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var PROG_KEY = ['a','g','g','a','m','e','.','p','r','o','g'].join(''); // прогресс/рекорды

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PROG_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(PROG_KEY, JSON.stringify(p)); } catch (e) { /* storage недоступен — играем без сохранения */ }
  }

  function show(screenId) {
    ['screen-menu', 'screen-levels', 'screen-game'].forEach(function (id) {
      $(id).classList.toggle('active', id === screenId);
    });
    if (screenId === 'screen-game') fitCanvas();
  }

  function fitCanvas() {
    var wrap = $('canvas-wrap'), c = $('game-canvas');
    var s = Math.min(wrap.clientWidth / 1600, wrap.clientHeight / 900);
    c.style.width = (1600 * s) + 'px';
    c.style.height = (900 * s) + 'px';
  }
  window.addEventListener('resize', fitCanvas);

  /* ================= уровни ================= */
  function renderLevels() {
    var grid = $('level-grid');
    grid.innerHTML = '';
    var prog = loadProgress();
    window.LEVELS.forEach(function (lv, i) {
      var stars = prog[i] ? prog[i].stars : 0;
      var unlocked = i === 0 || (prog[i - 1] && prog[i - 1].stars > 0);
      var card = document.createElement('div');
      card.className = 'level-card' + (unlocked ? '' : ' locked');
      var starTxt = '';
      for (var s = 0; s < 3; s++) starTxt += s < stars ? '★' : '☆';
      card.innerHTML = '<h3>' + lv.name + '</h3>' +
        '<div class="lc-stars">' + starTxt + '</div>' +
        '<div class="lc-info">' + (unlocked ? lv.hint : '🔒 Пройди предыдущий') +
        '<br>Птиц: ' + lv.birds + ' · Копов: ' + lv.build().enemies.length +
        (prog[i] ? '<br>Рекорд: ' + prog[i].best : '') + '</div>';
      if (unlocked) card.addEventListener('click', function () { startLevel(i); });
      grid.appendChild(card);
    });
  }

  function startLevel(i) {
    show('screen-game');
    $('overlay-win').classList.add('hidden');
    $('overlay-fail').classList.add('hidden');
    $('hud-level-name').textContent = window.LEVELS[i].name;
    window.Game.start(i, {
      onScore: function (s) { $('hud-score').textContent = s; },
      onWin: function (score, stars) {
        var prog = loadProgress();
        var old = prog[i] || { stars: 0, best: 0 };
        prog[i] = { stars: Math.max(old.stars, stars), best: Math.max(old.best, score) };
        saveProgress(prog);
        var st = $('win-stars');
        st.innerHTML = '';
        for (var s = 0; s < 3; s++) {
          var sp = document.createElement('span');
          sp.textContent = s < stars ? '★' : '☆';
          if (s >= stars) sp.className = 'off';
          st.appendChild(sp);
        }
        $('win-score').textContent = 'Очки: ' + score;
        $('btn-next').classList.toggle('hidden', i >= window.LEVELS.length - 1);
        $('overlay-win').classList.remove('hidden');
      },
      onLose: function () { $('overlay-fail').classList.remove('hidden'); }
    });
  }

  /* ================= меню ================= */
  $('btn-play').addEventListener('click', function () { renderLevels(); show('screen-levels'); });
  $('btn-menu').addEventListener('click', function () { show('screen-menu'); });
  $('btn-hud-menu').addEventListener('click', function () { window.Game.destroy(); show('screen-menu'); });
  $('btn-hud-menu2').addEventListener('click', function () { window.Game.destroy(); show('screen-menu'); });
  $('btn-restart').addEventListener('click', function () { window.Game.restart(); });
  $('btn-retry').addEventListener('click', function () { $('overlay-win').classList.add('hidden'); window.Game.restart(); });
  $('btn-retry2').addEventListener('click', function () { $('overlay-fail').classList.add('hidden'); window.Game.restart(); });
  $('btn-next').addEventListener('click', function () {
    var n = window.Game.levelIdx + 1;
    if (n < window.LEVELS.length) startLevel(n);
  });
  $('btn-reset-progress').addEventListener('click', function () {
    localStorage.removeItem(PROG_KEY);
    renderLevels();
    updateFaceStatus();
  });

  /* ================= лицо ================= */
  var modal = $('face-modal');
  var cropper = null;
  var camStream = null;
  var captured = null; // застопренный источник (image-like)

  function openFace() {
    modal.classList.remove('hidden');
    if (!cropper) {
      cropper = new window.FaceCropper($('adjust-canvas'), document.createElement('img'));
    } else {
      cropper.redraw();
    }
    $('btn-save-face').disabled = !cropper.ready;
    updateFaceStatus();
  }
  function closeFace() {
    modal.classList.add('hidden');
    stopCamera();
  }
  function stopCamera() {
    if (camStream) { camStream.getTracks().forEach(function (t) { t.stop(); }); camStream = null; }
    $('btn-cam-on').classList.remove('hidden');
    $('btn-cam-shot').classList.add('hidden');
  }

  $('btn-face-menu').addEventListener('click', openFace);
  $('btn-close-face').addEventListener('click', closeFace);

  // табы
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var which = tab.getAttribute('data-tab');
      $('tab-camera').classList.toggle('hidden', which !== 'camera');
      $('tab-photo').classList.toggle('hidden', which !== 'photo');
    });
  });

  // камера
  $('btn-cam-on').addEventListener('click', function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Камера недоступна в этом браузере. Загрузи фото на вкладке «Фото».');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } } })
      .then(function (stream) {
        camStream = stream;
        var v = $('cam-video');
        v.srcObject = stream;
        v.onloadedmetadata = function () {
          captured = null;
          cropper.setSource(v);
          $('btn-cam-on').classList.add('hidden');
          $('btn-cam-shot').classList.remove('hidden');
          $('btn-save-face').disabled = false;
        };
      })
      .catch(function (err) {
        alert('Не получилось включить камеру: ' + err.name + '. Попробуй вкладку «Фото».');
      });
  });

  $('btn-cam-shot').addEventListener('click', function () {
    var v = $('cam-video');
    var c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    captured = c;
    stopCamera();
    cropper.setSource(c);
    $('btn-save-face').disabled = false;
  });

  // фото
  $('photo-input').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var img = new Image();
    img.onload = function () {
      captured = img;
      stopCamera();
      cropper.setSource(img);
      $('btn-cam-shot').classList.add('hidden');
      $('btn-cam-on').classList.remove('hidden');
      $('btn-save-face').disabled = false;
    };
    img.src = URL.createObjectURL(f);
  });

  $('zoom-slider').addEventListener('input', function () {
    if (cropper) cropper.setScaleFactor(this.value / 100);
  });

  $('btn-save-face').addEventListener('click', function () {
    if (!cropper || !cropper.ready) return;
    var url = cropper.capture();
    window.Face.setFace(url);
    window.Face.getBirdSpriteURL(function (birdURL) {
      $('preview-img').src = birdURL;
      $('preview-row').classList.remove('hidden');
      updateFaceStatus();
    });
  });

  $('btn-remove-face').addEventListener('click', function () {
    window.Face.clearFace();
    $('preview-row').classList.add('hidden');
    updateFaceStatus();
  });

  function updateFaceStatus() {
    var el = $('face-status');
    window.Face.getBirdSpriteURL(function (url) {
      if (window.Face.hasFace()) {
        el.innerHTML = '<img src="' + url + '">Это полетит в копов. <button class="btn ghost" style="font-size:14px;padding:6px 12px" id="btn-change-face">Сменить</button>';
        var b = $('btn-change-face');
        if (b) b.addEventListener('click', openFace);
      } else {
        el.innerHTML = '<img src="' + url + '">Лицо не загружено — полетит стандартная птичка.';
      }
    });
  }

  /* ================= старт ================= */
  updateFaceStatus();
  show('screen-menu');
})();
