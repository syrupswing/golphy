import { useState } from 'react'
import type { Player, Score, GameState } from './types/index.ts'
import ScoreCard from './components/ScoreCard'
import ScoreTable from './components/ScoreTable'
import './styles/App.scss'
import golphyBanner from './assets/Golphy-banner.svg'

const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e'
];

// Default par values for 18 holes
const DEFAULT_PAR = [4, 3, 4, 4, 5, 3, 5, 4, 4, 4, 5, 4, 4, 5, 4, 3, 3, 4];

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    scores: [],
    currentHole: 1,
    totalHoles: 18
  });
  const [newPlayerName, setNewPlayerName] = useState('');
  const [totalHoles, setTotalHoles] = useState('18');

  const addPlayer = () => {
    if (newPlayerName.trim() && gameState.players.length < 8) {
      const newPlayer: Player = {
        id: Date.now().toString(),
        name: newPlayerName.trim(),
        color: PLAYER_COLORS[gameState.players.length]
      };
      
      setGameState(prev => ({
        ...prev,
        players: [...prev.players, newPlayer]
      }));
      setNewPlayerName('');
    }
  };

  const removePlayer = (playerId: string) => {
    setGameState(prev => ({
      ...prev,
      players: prev.players.filter(p => p.id !== playerId)
    }));
  };

  const startGame = () => {
    if (gameState.players.length > 0) {
      setGameState(prev => ({
        ...prev,
        totalHoles: parseInt(totalHoles) || 18
      }));
      setGameStarted(true);
    }
  };

  const updateScore = (playerId: string, hole: number, strokes: number) => {
    setGameState(prev => {
      const existingScoreIndex = prev.scores.findIndex(
        s => s.playerId === playerId && s.hole === hole
      );

      let newScores: Score[];
      
      // If strokes is 0, remove the score
      if (strokes === 0) {
        if (existingScoreIndex >= 0) {
          newScores = prev.scores.filter(
            s => !(s.playerId === playerId && s.hole === hole)
          );
        } else {
          newScores = prev.scores;
        }
      } else {
        // Otherwise update or add the score
        if (existingScoreIndex >= 0) {
          newScores = [...prev.scores];
          newScores[existingScoreIndex] = { playerId, hole, strokes };
        } else {
          newScores = [...prev.scores, { playerId, hole, strokes }];
        }
      }

      return { ...prev, scores: newScores };
    });
  };

  const nextHole = () => {
    if (gameState.currentHole < gameState.totalHoles) {
      setGameState(prev => ({ ...prev, currentHole: prev.currentHole + 1 }));
    }
  };

  const prevHole = () => {
    if (gameState.currentHole > 1) {
      setGameState(prev => ({ ...prev, currentHole: prev.currentHole - 1 }));
    }
  };

  if (!gameStarted) {
    return (
      <div className="app">
        <div className="header">
          <img src={golphyBanner} width="139" alt="Golphy Logo" className="logo" />
        </div>

        <div className="setup-screen">
          <h2>Setup Game</h2>
          
          <div className="input-group">
            <label>Number of Holes</label>
            <input
              type="number"
              value={totalHoles}
              onChange={(e) => setTotalHoles(e.target.value)}
              min="1"
              max="18"
            />
          </div>

          <div className="input-group">
            <label>Add Players</label>
            <div className="add-player-form">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addPlayer()}
                placeholder="Enter player name"
                maxLength={20}
              />
              <button 
                onClick={addPlayer}
                disabled={!newPlayerName.trim() || gameState.players.length >= 8}
              >
                Add
              </button>
            </div>
          </div>

          {gameState.players.length > 0 && (
            <div className="players-list">
              {gameState.players.map(player => (
                <div key={player.id} className="player-item">
                  <div 
                    className="color-indicator" 
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="player-name">{player.name}</span>
                  <button 
                    onClick={() => removePlayer(player.id)}
                    className="remove-btn"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <button 
            onClick={startGame}
            disabled={gameState.players.length === 0}
            className="start-btn"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <img src={golphyBanner} width="139" alt="Golphy Logo" className="logo" />
      </div>

      <div className="view-toggle">
        <button 
          onClick={() => setShowTable(false)}
          className={!showTable ? 'active' : ''}
        >
          Quick Entry
        </button>
        <button 
          onClick={() => setShowTable(true)}
          className={showTable ? 'active' : ''}
        >
          Full Scorecard
        </button>
      </div>

      {!showTable ? (
        <ScoreCard
          players={gameState.players}
          scores={gameState.scores}
          currentHole={gameState.currentHole}
          onScoreUpdate={updateScore}
          onNextHole={nextHole}
          onPrevHole={prevHole}
          totalHoles={gameState.totalHoles}
        />
      ) : (
        <ScoreTable
          players={gameState.players}
          scores={gameState.scores}
          totalHoles={gameState.totalHoles}
          parValues={DEFAULT_PAR}
          onScoreUpdate={updateScore}
        />
      )}
    </div>
  );
}

export default App
