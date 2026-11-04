/* main.js — экраны, меню, прогресс, пауза, состав «птиц-друзей». */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var PROG_KEY = ['a','g','g','a','m','e','.','p','r','o','g'].join(''); // прогресс/рекорды

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PROG_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(PROG_KEY, JSON.stringify(p)); } catch (e) { /* без сохранения играем */ }
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

  /* ================= состав ================= */
  function renderRoster() {
    var el = $('roster');
    el.innerHTML = '';
    var names = window.Birds.names();
    names.forEach(function (name, i) {
      var face = window.Birds.get(i);
      var item = document.createElement('span');
      item.className = 'roster-item';
      var img = document.createElement('img');
      img.src = face.canvas.toDataURL();
      img.alt = name;
      item.appendChild(img);
      var t = document.createElement('b');
      t.textContent = name;
      item.appendChild(t);
      el.appendChild(item);
    });
  }

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
    ['overlay-win', 'overlay-fail', 'overlay-pause'].forEach(function (o) { $(o).classList.add('hidden'); });
    var prog = loadProgress();
    var best = prog[i] ? prog[i].best : 0;
    $('hud-high').textContent = 'Highscore: ' + best;
    $('hud-score').textContent = 'Score: 0';
    window.Game.start(i, {
      onScore: function (s) { $('hud-score').textContent = 'Score: ' + s; },
      onWin: function (score, stars) {
        var prog2 = loadProgress();
        var old = prog2[i] || { stars: 0, best: 0 };
        prog2[i] = { stars: Math.max(old.stars, stars), best: Math.max(old.best, score) };
        saveProgress(prog2);
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

  /* ================= пауза ================= */
  $('btn-pause').addEventListener('click', function () {
    if (!window.Game.paused && !window.Game.ending) {
      window.Game.setPaused(true);
      $('overlay-pause').classList.remove('hidden');
    }
  });
  $('btn-resume').addEventListener('click', function () {
    window.Game.setPaused(false);
    $('overlay-pause').classList.add('hidden');
  });
  $('btn-restart-p').addEventListener('click', function () {
    $('overlay-pause').classList.add('hidden');
    window.Game.setPaused(false);
    window.Game.restart();
  });
  $('btn-menu-p').addEventListener('click', function () {
    $('overlay-pause').classList.add('hidden');
    window.Game.destroy();
    show('screen-menu');
  });

  /* ================= меню ================= */
  $('btn-play').addEventListener('click', function () { renderLevels(); show('screen-levels'); });
  $('btn-menu').addEventListener('click', function () { renderRoster(); show('screen-menu'); });
  $('btn-retry').addEventListener('click', function () { $('overlay-win').classList.add('hidden'); window.Game.restart(); });
  $('btn-retry2').addEventListener('click', function () { $('overlay-fail').classList.add('hidden'); window.Game.restart(); });
  $('btn-menu-f').addEventListener('click', function () { window.Game.destroy(); show('screen-menu'); });
  $('btn-next').addEventListener('click', function () {
    var n = window.Game.levelIdx + 1;
    if (n < window.LEVELS.length) startLevel(n);
  });
  $('btn-reset-progress').addEventListener('click', function () {
    localStorage.removeItem(PROG_KEY);
    renderLevels();
  });

  /* ================= старт ================= */
  $('btn-play').disabled = true;
  window.Birds.load(function () {
    $('btn-play').disabled = false;
    renderRoster();
  });
  show('screen-menu');
})();
