import React from 'react';
import type { Player, Score } from '../types/index.ts';
import './ScoreTable.scss';

interface ScoreTableProps {
  players: Player[];
  scores: Score[];
  totalHoles: number;
  parValues: number[];
  courseName?: string;
  onScoreUpdate?: (playerId: string, hole: number, strokes: number) => void;
}

export default function ScoreTable({ players, scores, totalHoles, parValues, courseName, onScoreUpdate }: ScoreTableProps) {
  const holeGroups = Array.from({ length: Math.ceil(totalHoles / 9) }, (_, index) => {
    const start = index * 9 + 1;
    const end = Math.min(start + 8, totalHoles);
    const holes = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);

    return {
      start,
      end,
      holes,
      label: index === 0 ? 'OUT' : index === 1 ? 'IN' : `SET ${index + 1}`,
    };
  });

  const getScore = (playerId: string, hole: number): number | null => {
    const score = scores.find(s => s.playerId === playerId && s.hole === hole);
    return score ? score.strokes : null;
  };

  const getHoleScore = (playerId: string, hole: number): number => {
    const score = getScore(playerId, hole);
    return score || 0;
  };

  const getSegmentScore = (playerId: string, start: number, end: number): number => {
    let total = 0;
    for (let i = start; i <= end; i++) {
      total += getHoleScore(playerId, i);
    }
    return total;
  };

  const getTotalScore = (playerId: string): number => {
    return getSegmentScore(playerId, 1, totalHoles);
  };

  const getSegmentPar = (start: number, end: number): number => {
    return parValues.slice(start - 1, end).reduce((sum, par) => sum + par, 0);
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
          onFocus={(e) => e.target.select()}
          placeholder=""
          min="1"
          max="20"
        />
      </td>
    );
  };

  return (
    <div className="score-table-container">
      {courseName && <h2 className="course-name-heading">{courseName}</h2>}
      <div className="table-wrapper">
        <table className="score-table">
          <thead>
            <tr>
              <th className="player-header">PLAYER</th>
              {holeGroups.map((group) => (
                <React.Fragment key={group.label}>
                  {group.holes.map((hole) => (
                    <th key={hole} className="hole-header">{hole}</th>
                  ))}
                  <th className="total-header">{group.label}</th>
                </React.Fragment>
              ))}
              <th className="total-header">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr className="par-row">
              <td className="label-cell">PAR</td>
              {holeGroups.map((group) => (
                <React.Fragment key={`par-${group.label}`}>
                  {group.holes.map((hole) => (
                    <td key={hole} className="par-cell">{parValues[hole - 1] ?? 4}</td>
                  ))}
                  <td className="total-cell">{getSegmentPar(group.start, group.end)}</td>
                </React.Fragment>
              ))}
              <td className="total-cell">{getTotalPar()}</td>
            </tr>
            {players.map(player => (
              <tr key={player.id} className="player-row">
                <td className="player-cell">
                  <div className="player-info">
                    <span className="player-name">{player.name}</span>
                  </div>
                </td>
                {holeGroups.map((group) => (
                  <React.Fragment key={`player-${player.id}-${group.label}`}>
                    {group.holes.map((hole) => (
                      <React.Fragment key={hole}>
                        {renderHoleCell(player.id, hole, parValues[hole - 1] ?? 4)}
                      </React.Fragment>
                    ))}
                    <td className="total-cell">
                      <span className="score-text">{getSegmentScore(player.id, group.start, group.end) || ''}</span>
                    </td>
                  </React.Fragment>
                ))}
                <td className="total-cell bold"><span className="score-text">{getTotalScore(player.id) || ''}</span></td>
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
