import { useEffect, useState } from 'react';
import * as Birds from '../game/birds.js';
import { resetProgress } from '../progress.js';

export default function MenuScreen({ onPlay }) {
  const [ready, setReady] = useState(Birds.isReady());
  const [tick, setTick] = useState(0); // для перерисовки после сброса

  useEffect(() => { Birds.load().then(() => setReady(true)); }, []);

  return (
    <section className="screen" key={tick}>
      <h1 className="title">ANGRY <span className="accent">SWINE</span></h1>
      <p className="subtitle">Друзья летают в копов агентства СВИНЬ</p>

      {ready && (
        <div className="roster">
          {Birds.names().map((name, i) => {
            const b = Birds.get(i);
            return (
              <span className="roster-item" key={name}>
                <img src={b.url} alt={name} />
                <b>{name}</b>
              </span>
            );
          })}
        </div>
      )}

      <div className="menu-buttons">
        <button className="btn big" onClick={onPlay}>▶ Играть</button>
        <button className="btn ghost" onClick={() => { resetProgress(); setTick((t) => t + 1); }}>
          🗑 Сбросить прогресс
        </button>
      </div>
    </section>
  );
}
