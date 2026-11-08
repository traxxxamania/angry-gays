/* birds.js — лица друзей как птички. Фото из public/birds/*.webp рисуются
 * целиком в исходной форме (прямоугольник/квадрат, без закругления и обрезки)
 * на canvas и используются вместо обычных птиц. */

const FILES = [
  ['/birds/angrygay.webp', 'Angry'],
  ['/birds/ivangay.webp', 'Ivan'],
  ['/birds/ochkarikgay.webp', 'Очкарик'],
  ['/birds/sigmagay.webp', 'Sigma'],
  ['/birds/smatrgay.webp', 'Сматр']
];

const sprites = [];   // { name, canvas, url }
let readyFlag = false;
let loadPromise = null;

function fullSprite(img, name) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  return { name, canvas: c, url: c.toDataURL() };
}

function fallback(name) {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#f4c542';
  x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff';
  x.beginPath(); x.arc(S * 0.38, S * 0.42, 26, 0, 7); x.fill();
  x.beginPath(); x.arc(S * 0.62, S * 0.42, 26, 0, 7); x.fill();
  x.fillStyle = '#111';
  x.beginPath(); x.arc(S * 0.4, S * 0.44, 10, 0, 7); x.fill();
  x.beginPath(); x.arc(S * 0.6, S * 0.44, 10, 0, 7); x.fill();
  x.fillStyle = '#e8770a';
  x.beginPath(); x.moveTo(S * 0.4, S * 0.6); x.lineTo(S * 0.6, S * 0.6); x.lineTo(S * 0.5, S * 0.78); x.closePath(); x.fill();
  return { name, canvas: c, url: c.toDataURL() };
}

export function load() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve) => {
    let pending = FILES.length;
    FILES.forEach((f, i) => {
      const img = new Image();
      const done = (sprite) => {
        sprites[i] = sprite;
        if (--pending === 0) { readyFlag = true; resolve(sprites); }
      };
      img.onload = () => done(fullSprite(img, f[1]));
      img.onerror = () => done(fallback(f[1]));
      img.src = f[0];
    });
  });
  return loadPromise;
}

export function get(i) {
  if (!sprites.length) return null;
  return sprites[((i % sprites.length) + sprites.length) % sprites.length];
}

export function names() { return sprites.map((s) => s.name); }
export function isReady() { return readyFlag; }
