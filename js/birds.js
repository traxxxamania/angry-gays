/* birds.js — лица друзей как птички. Фото из birds/*.webp крутятся в круглые
 * спрайты на canvas и используются вместо обычных птиц. Сканер лица удалён. */
(function (global) {
  'use strict';

  var FILES = [
    ['birds/angrygay.webp', 'Angry'],
    ['birds/ivangay.webp', 'Ivan'],
    ['birds/ochkarikgay.webp', 'Очкарик'],
    ['birds/sigmagay.webp', 'Sigma'],
    ['birds/smatrgay.webp', 'Сматр']
  ];

  var sprites = [];   // {name, canvas}
  var ready = false;

  function circleSprite(img, name) {
    var S = 256;
    var c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d');
    var side = Math.min(img.naturalWidth, img.naturalHeight);
    x.save();
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2); x.clip();
    x.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
      8, 8, S - 16, S - 16);
    x.restore();
    // мультяшная обводка
    x.lineWidth = 10; x.strokeStyle = 'rgba(45,32,18,.9)';
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 9, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.35)';
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 18, 0, Math.PI * 2); x.stroke();
    sprites.push({ name: name, canvas: c });
  }

  function fallback(name) {
    var S = 256;
    var c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d');
    x.fillStyle = '#f4c542';
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(S * 0.38, S * 0.42, 26, 0, 7); x.arc(S * 0.62, S * 0.42, 26, 0, 7); x.fill();
    x.fillStyle = '#111';
    x.beginPath(); x.arc(S * 0.4, S * 0.44, 10, 0, 7); x.arc(S * 0.6, S * 0.44, 10, 0, 7); x.fill();
    x.fillStyle = '#e8770a';
    x.beginPath(); x.moveTo(S * 0.4, S * 0.6); x.lineTo(S * 0.6, S * 0.6); x.lineTo(S * 0.5, S * 0.78); x.closePath(); x.fill();
    sprites.push({ name: name, canvas: c });
  }

  global.Birds = {
    load: function (cb) {
      var pending = FILES.length;
      sprites = [];
      FILES.forEach(function (f, i) {
        var img = new Image();
        img.onload = function () { circleSprite(img, f[1]); if (--pending === 0) { ready = true; cb(ready); } };
        img.onerror = function () { fallback(f[1]); if (--pending === 0) { ready = true; cb(ready); } };
        img.src = f[0];
      });
    },
    get: function (i) {
      if (!sprites.length) return null;
      return sprites[((i % sprites.length) + sprites.length) % sprites.length];
    },
    names: function () { return sprites.map(function (s) { return s.name; }); },
    isReady: function () { return ready; }
  };
})(window);
