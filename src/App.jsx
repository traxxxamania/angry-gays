import { useState } from 'react';
import MenuScreen from './components/MenuScreen.jsx';
import LevelSelect from './components/LevelSelect.jsx';
import GameScreen from './components/GameScreen.jsx';

export default function App() {
  const [route, setRoute] = useState({ name: 'menu' });
  const startLevel = (level) => setRoute({ name: 'game', level, attempt: 0 });

  return (
    <>
      {route.name === 'menu' && (
        <MenuScreen onPlay={() => setRoute({ name: 'levels' })} />
      )}
      {route.name === 'levels' && (
        <LevelSelect onPick={startLevel} onBack={() => setRoute({ name: 'menu' })} />
      )}
      {route.name === 'game' && (
        <GameScreen
          key={route.level + '-' + route.attempt}
          levelIdx={route.level}
          onExit={() => setRoute({ name: 'levels' })}
          onRestart={() => setRoute({ name: 'game', level: route.level, attempt: route.attempt + 1 })}
          onNext={() => setRoute({ name: 'game', level: route.level + 1, attempt: 0 })}
        />
      )}
    </>
  );
}
