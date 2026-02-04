import type { Player, Score } from '../types/index.ts';
import './ScoreCard.scss';

interface ScoreCardProps {
  players: Player[];
  scores: Score[];
  currentHole: number;
  onScoreUpdate: (playerId: string, hole: number, strokes: number) => void;
  onNextHole: () => void;
  onPrevHole: () => void;
  totalHoles: number;
}

export default function ScoreCard({
  players,
  scores,
  currentHole,
  onScoreUpdate,
  onNextHole,
  onPrevHole,
  totalHoles
}: ScoreCardProps) {
  const getScore = (playerId: string, hole: number): number => {
    const score = scores.find(s => s.playerId === playerId && s.hole === hole);
    return score?.strokes || 0;
  };

  const getTotalScore = (playerId: string): number => {
    return scores
      .filter(s => s.playerId === playerId)
      .reduce((total, s) => total + s.strokes, 0);
  };

  const getScoreVsPar = (playerId: string): number => {
    const total = getTotalScore(playerId);
    const holesPlayed = scores.filter(s => s.playerId === playerId).length;
    const par = holesPlayed * 4; // Assuming par 4
    return total - par;
  };

  const formatScoreVsPar = (score: number): string => {
    if (score === 0) return 'E';
    return score > 0 ? `+${score}` : `${score}`;
  };

  const handleScoreChange = (playerId: string, delta: number) => {
    const currentScore = getScore(playerId, currentHole);
    const newScore = Math.max(0, currentScore + delta);
    onScoreUpdate(playerId, currentHole, newScore);
  };

  return (
    <div className="scorecard">
      <div className="hole-navigation">
        <button 
          onClick={onPrevHole} 
          disabled={currentHole === 1}
          className="nav-btn"
        >
          ← Prev
        </button>
        <span className="hole-number">Hole {currentHole}</span>
        <button 
          onClick={onNextHole} 
          disabled={currentHole === totalHoles}
          className="nav-btn"
        >
          Next →
        </button>
      </div>

      <div className="players-scores">
        {players.map(player => {
          const score = getScore(player.id, currentHole);
          const total = getTotalScore(player.id);
          const vsPar = getScoreVsPar(player.id);
          
          return (
            <div key={player.id} className="player-score">
              <div className="player-info">
                <div 
                  className="player-color" 
                  style={{ backgroundColor: player.color }}
                />
                <div className="player-details">
                  <div className="player-name">{player.name}</div>
                  <div className="player-stats">
                    Total: {total} | {formatScoreVsPar(vsPar)}
                  </div>
                </div>
              </div>
              
              <div className="score-controls">
                <button 
                  onClick={() => handleScoreChange(player.id, -1)}
                  disabled={score === 0}
                  className="score-btn minus"
                >
                  −
                </button>
                <span className="score-display">{score || '−'}</span>
                <button 
                  onClick={() => handleScoreChange(player.id, 1)}
                  className="score-btn plus"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="leaderboard">
        <h3>Leaderboard</h3>
        <div className="leaderboard-list">
          {[...players]
            .sort((a, b) => getTotalScore(a.id) - getTotalScore(b.id))
            .map((player, index) => {
              const total = getTotalScore(player.id);
              const vsPar = getScoreVsPar(player.id);
              
              return (
                <div key={player.id} className="leaderboard-item">
                  <span className="position">{index + 1}</span>
                  <div 
                    className="player-color-small" 
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="player-name">{player.name}</span>
                  <span className="score">{total}</span>
                  <span className={`vs-par ${vsPar > 0 ? 'over' : vsPar < 0 ? 'under' : 'even'}`}>
                    {formatScoreVsPar(vsPar)}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
