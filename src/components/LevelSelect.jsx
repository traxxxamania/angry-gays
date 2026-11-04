import { LEVELS } from '../game/levels.js';
import { loadProgress } from '../progress.js';

export default function LevelSelect({ onPick, onBack }) {
  const prog = loadProgress();

  return (
    <section className="screen">
      <h2 className="screen-h">Выбери операцию</h2>
      <div className="level-grid">
        {LEVELS.map((lv, i) => {
          const stars = (prog[i] && prog[i].stars) || 0;
          const unlocked = i === 0 || ((prog[i - 1] && prog[i - 1].stars) || 0) > 0;
          return (
            <div
              key={lv.name}
              className={'level-card' + (unlocked ? '' : ' locked')}
              onClick={() => unlocked && onPick(i)}
            >
              <h3>{lv.name}</h3>
              <div className="lc-stars">
                {Array.from({ length: 3 }, (_, s) => (s < stars ? '★' : '☆')).join('')}
              </div>
              <div className="lc-info">
                {unlocked ? lv.hint : '🔒 Пройди предыдущий'}
                <br />
                Птиц: {lv.birds} · Копов: {lv.build().enemies.length}
                {prog[i] ? <><br />Рекорд: {prog[i].best}</> : null}
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn ghost back" onClick={onBack}>← Меню</button>
    </section>
  );
}
