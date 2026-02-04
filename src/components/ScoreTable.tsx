import React from 'react';
import type { Player, Score } from '../types/index.ts';
import './ScoreTable.scss';

interface ScoreTableProps {
  players: Player[];
  scores: Score[];
  totalHoles: number;
  parValues: number[];
  onScoreUpdate?: (playerId: string, hole: number, strokes: number) => void;
}

export default function ScoreTable({ players, scores, totalHoles, parValues, onScoreUpdate }: ScoreTableProps) {
  const getScore = (playerId: string, hole: number): number | null => {
    const score = scores.find(s => s.playerId === playerId && s.hole === hole);
    return score ? score.strokes : null;
  };

  const getHoleScore = (playerId: string, hole: number): number => {
    const score = getScore(playerId, hole);
    return score || 0;
  };

  const getOutScore = (playerId: string): number => {
    let total = 0;
    for (let i = 1; i <= 9; i++) {
      total += getHoleScore(playerId, i);
    }
    return total;
  };

  const getInScore = (playerId: string): number => {
    let total = 0;
    for (let i = 10; i <= totalHoles; i++) {
      total += getHoleScore(playerId, i);
    }
    return total;
  };

  const getTotalScore = (playerId: string): number => {
    return getOutScore(playerId) + getInScore(playerId);
  };

  const getOutPar = (): number => {
    return parValues.slice(0, 9).reduce((sum, par) => sum + par, 0);
  };

  const getInPar = (): number => {
    return parValues.slice(9, 18).reduce((sum, par) => sum + par, 0);
  };

  const getTotalPar = (): number => {
    return parValues.reduce((sum, par) => sum + par, 0);
  };

  const handleScoreChange = (playerId: string, hole: number, value: string) => {
    if (!onScoreUpdate) return;
    
    if (value === '' || value === '0') {
      // Delete the score by passing 0
      onScoreUpdate(playerId, hole, 0);
    } else {
      const numValue = parseInt(value);
      if (!isNaN(numValue) && numValue > 0) {
        onScoreUpdate(playerId, hole, numValue);
      }
    }
  };

  const renderHoleCell = (playerId: string, hole: number, par: number) => {
    const score = getScore(playerId, hole);
    const displayScore = score || '';

    let className = 'score-cell';
    if (score === null) {
      className += ' empty';
    } else if (score === par - 2 || score < par - 2) {
      className += ' eagle';
    } else if (score === par - 1) {
      className += ' birdie';
    } else if (score === par) {
      className += ' par';
    } else if (score === par + 1) {
      className += ' bogey';
    } else if (score > par + 1) {
      className += ' double-bogey';
    }

    return (
      <td className={className}>
        <span className="score-text">{displayScore}</span>
        <input
          type="number"
          inputMode="numeric"
          className="score-input"
          value={displayScore}
          onChange={(e) => handleScoreChange(playerId, hole, e.target.value)}
          placeholder=""
          min="1"
          max="20"
        />
      </td>
    );
  };

  return (
    <div className="score-table-container">
      <div className="table-wrapper">
        <table className="score-table">
          <thead>
            <tr>
              <th className="player-header">PLAYER</th>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(hole => (
                <th key={hole} className="hole-header">{hole}</th>
              ))}
              <th className="total-header">OUT</th>
              {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(hole => (
                <th key={hole} className="hole-header">{hole}</th>
              ))}
              <th className="total-header">IN</th>
              <th className="total-header">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr className="par-row">
              <td className="label-cell">PAR</td>
              {parValues.slice(0, 9).map((par, idx) => (
                <td key={idx} className="par-cell">{par}</td>
              ))}
              <td className="total-cell">{getOutPar()}</td>
              {parValues.slice(9, 18).map((par, idx) => (
                <td key={idx} className="par-cell">{par}</td>
              ))}
              <td className="total-cell">{getInPar()}</td>
              <td className="total-cell">{getTotalPar()}</td>
            </tr>
            {players.map(player => (
              <tr key={player.id} className="player-row">
                <td className="player-cell">
                  <div className="player-info">
                    <span className="player-name">{player.name}</span>
                  </div>
                </td>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(hole => 
                  <React.Fragment key={hole}>
                    {renderHoleCell(player.id, hole, parValues[hole - 1])}
                  </React.Fragment>
                )}
                <td className="total-cell"><span className="score-text">{getOutScore(player.id) || '-'}</span></td>
                {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(hole => 
                  <React.Fragment key={hole}>
                    {renderHoleCell(player.id, hole, parValues[hole - 1])}
                  </React.Fragment>
                )}
                <td className="total-cell"><span className="score-text">{getInScore(player.id) || '-'}</span></td>
                <td className="total-cell bold"><span className="score-text">{getTotalScore(player.id) || '-'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend">
        <div className="legend-item">
          <span className="legend-color eagle"></span>
          <span>Eagle (-2)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color birdie"></span>
          <span>Birdie (-1)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color par"></span>
          <span>Par</span>
        </div>
        <div className="legend-item">
          <span className="legend-color bogey"></span>
          <span>Bogey (+1)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color double-bogey"></span>
          <span>Double+ (+2)</span>
        </div>
      </div>
    </div>
  );
}
