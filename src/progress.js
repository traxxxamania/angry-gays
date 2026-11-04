/* прогресс и рекорды в localStorage */
const STORAGE = ['swine', '.', 'progress'].join('');

export function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORAGE)) || {}; } catch (e) { return {}; }
}

export function saveProgress(p) {
  try { localStorage.setItem(STORAGE, JSON.stringify(p)); } catch (e) { /* без сохранения играем */ }
}

export function recordWin(levelIdx, stars, score) {
  const p = loadProgress();
  const old = p[levelIdx] || { stars: 0, best: 0 };
  p[levelIdx] = { stars: Math.max(old.stars, stars), best: Math.max(old.best, score) };
  saveProgress(p);
}

export function bestOf(levelIdx) {
  const p = loadProgress();
  return (p[levelIdx] && p[levelIdx].best) || 0;
}

export function starsOf(levelIdx) {
  const p = loadProgress();
  return (p[levelIdx] && p[levelIdx].stars) || 0;
}

export function isUnlocked(levelIdx) {
  return levelIdx === 0 || starsOf(levelIdx - 1) > 0;
}

export function resetProgress() {
  try { localStorage.removeItem(STORAGE); } catch (e) {}
}
