import React from 'react';
import type { Player, Score } from '../types/index.ts';
import './ScoreTable.scss';

interface ScoreTableProps {
  players: Player[];
  scores: Score[];
  totalHoles: number;
  parValues: number[];
}

export default function ScoreTable({ players, scores, totalHoles, parValues }: ScoreTableProps) {
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

  const renderHoleCell = (playerId: string, hole: number, par: number) => {
    const score = getScore(playerId, hole);
    if (score === null) return <td className="score-cell empty">-</td>;

    let className = 'score-cell';
    if (score === par - 2) className += ' eagle';
    else if (score === par - 1) className += ' birdie';
    else if (score === par) className += ' par';
    else if (score === par + 1) className += ' bogey';
    else if (score > par + 1) className += ' double-bogey';

    return <td className={className}>{score}</td>;
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
                    <div 
                      className="player-color-indicator" 
                      style={{ backgroundColor: player.color }}
                    />
                    <span className="player-name">{player.name}</span>
                  </div>
                </td>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(hole => 
                  <React.Fragment key={hole}>
                    {renderHoleCell(player.id, hole, parValues[hole - 1])}
                  </React.Fragment>
                )}
                <td className="total-cell">{getOutScore(player.id) || '-'}</td>
                {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(hole => 
                  <React.Fragment key={hole}>
                    {renderHoleCell(player.id, hole, parValues[hole - 1])}
                  </React.Fragment>
                )}
                <td className="total-cell">{getInScore(player.id) || '-'}</td>
                <td className="total-cell bold">{getTotalScore(player.id) || '-'}</td>
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
