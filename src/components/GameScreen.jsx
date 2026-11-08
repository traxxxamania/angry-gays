import { useEffect, useRef, useState } from 'react';
import GameEngine from '../game/engine.js';
import * as Birds from '../game/birds.js';
import { LEVELS } from '../game/levels.js';
import { bestOf, recordWin } from '../progress.js';

export default function GameScreen({ levelIdx, onExit, onRestart, onNext }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const scoreRef = useRef(null);
  const engineRef = useRef(null);
  const [result, setResult] = useState(null); // {type:'win'|'fail', score, stars}
  const [paused, setPaused] = useState(false);
  const [birdsReady, setBirdsReady] = useState(Birds.isReady());

  // выбор птиц происходит прямо в игре
  const level = LEVELS[levelIdx];
  const [remaining, setRemaining] = useState(level.birds);
  const [used, setUsed] = useState(() => new Set()); // индексы использованных друзей
  const [active, setActive] = useState(null);         // индекс друга, заряженного в рогатку

  // подгонка canvas под окно (16:9)
  useEffect(() => {
    function fit() {
      const c = canvasRef.current, w = wrapRef.current;
      if (!c || !w) return;
      const s = Math.min(w.clientWidth / 1600, w.clientHeight / 900);
      c.style.width = (1600 * s) + 'px';
      c.style.height = (900 * s) + 'px';
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // жизненный цикл движка: новый engine на уровень/рестарт
  useEffect(() => {
    if (!birdsReady) { Birds.load().then(() => setBirdsReady(true)); return; }
    const engine = new GameEngine(canvasRef.current, levelIdx, {
      onScore: (s) => { if (scoreRef.current) scoreRef.current.textContent = 'Score: ' + s; },
      onWin: (score, stars) => { recordWin(levelIdx, stars, score); setResult({ type: 'win', score, stars }); },
      onLose: (score) => setResult({ type: 'fail', score }),
      onBirdDone: () => setActive(null)
    });
    engineRef.current = engine;
    if (import.meta.env.DEV) window.__game = engine;
    return () => { engine.destroy(); engineRef.current = null; };
  }, [levelIdx, birdsReady]);

  const pickBird = (i) => {
    const engine = engineRef.current;
    if (!engine || result || paused) return;
    if (used.has(i) || remaining <= 0 || active !== null) return;
    if (engine.loadBird(i)) {
      setUsed((prev) => new Set(prev).add(i));
      setRemaining((r) => r - 1);
      setActive(i);
    }
  };

  const doPause = () => {
    if (result) return;
    setPaused(true);
    engineRef.current && engineRef.current.setPaused(true);
  };
  const doResume = () => {
    setPaused(false);
    engineRef.current && engineRef.current.setPaused(false);
  };
  const isLast = levelIdx >= LEVELS.length - 1;

  return (
    <section className="screen game">
      <div id="hud">
        <button className="hud-btn" onClick={doPause} title="Пауза">❚❚</button>
        <div className="hud-score-box">
          <div className="hud-high">Highscore: {bestOf(levelIdx)}</div>
          <div className="hud-score" ref={scoreRef}>Score: 0</div>
        </div>
      </div>

      <div className="bird-panel">
        <div className="bird-panel-count">Птиц осталось: {remaining}</div>
        <div className="bird-row">
          {birdsReady && Birds.names().map((name, i) => {
            const b = Birds.get(i);
            const isUsed = used.has(i);
            const isActive = active === i;
            const canPick = !isUsed && active === null && remaining > 0 && !result && !paused;
            return (
              <button
                key={name}
                type="button"
                className={'friend-btn' + (isActive ? ' active' : '') + (isUsed ? ' used' : '')}
                disabled={!canPick}
                onClick={() => pickBird(i)}
                title={isUsed ? 'Использован' : 'Зарядить ' + name}
              >
                <img src={b && b.url} alt={name} />
                <b>{name}</b>
              </button>
            );
          })}
        </div>
      </div>

      <div className="canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} width="1600" height="900" />
      </div>

      {paused && !result && (
        <div className="overlay">
          <h2 className="ov-title">Пауза</h2>
          <div className="ov-buttons col">
            <button className="btn big" onClick={doResume}>▶ Продолжить</button>
            <button className="btn" onClick={() => { setPaused(false); onRestart(); }}>↻ Заново</button>
            <button className="btn ghost" onClick={onExit}>☰ К уровням</button>
          </div>
        </div>
      )}

      {result && result.type === 'win' && (
        <div className="overlay">
          <h2 className="ov-title win">Уровень пройден!</h2>
          <div className="stars">
            {Array.from({ length: 3 }, (_, s) => (
              <span key={s} className={s < result.stars ? '' : 'off'}>{s < result.stars ? '★' : '☆'}</span>
            ))}
          </div>
          <div className="ov-score">Очки: {result.score}</div>
          <div className="ov-buttons">
            <button className="btn" onClick={() => { setResult(null); onRestart(); }}>↻ Повтор</button>
            {!isLast && <button className="btn big" onClick={onNext}>Дальше →</button>}
          </div>
        </div>
      )}

      {result && result.type === 'fail' && (
        <div className="overlay">
          <h2 className="ov-title fail">Друзья кончились…</h2>
          <div className="ov-buttons">
            <button className="btn ghost" onClick={onExit}>☰ К уровням</button>
            <button className="btn big" onClick={() => { setResult(null); onRestart(); }}>↻ Ещё раз</button>
          </div>
        </div>
      )}
    </section>
  );
}
