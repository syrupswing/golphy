import React from 'react';
import type { HoleInfo, Player, Score } from '../types/index.ts';
import './ScoreTable.scss';

interface ScoreTableProps {
  players: Player[];
  scores: Score[];
  totalHoles: number;
  parValues: number[];
  holeDetails?: HoleInfo[];
  courseName?: string;
  setLabels?: string[];
  onScoreUpdate?: (playerId: string, hole: number, strokes: number) => void;
}

const PLAYER_COLUMN_MIN_WIDTH = 44;
const PLAYER_COLUMN_MAX_WIDTH = 280;
const PLAYER_COLUMN_DEFAULT_WIDTH = 140;
const PLAYER_COLUMN_WIDTH_STORAGE_KEY = 'golphy-player-column-width';
const SCORE_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const EXTENDED_SCORE_OPTIONS = [11, 12, 13, 14, 15] as const;

interface ActiveScoreDialog {
  playerId: string;
  playerName: string;
  hole: number;
  par: number;
  currentScore: number | null;
}

function OverflowFadeText({ text, className }: { text: string; className: string }) {
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const [isOverflowed, setIsOverflowed] = React.useState(false);

  React.useEffect(() => {
    const element = textRef.current;
    if (!element) {
      return;
    }

    const checkOverflow = () => {
      setIsOverflowed(element.scrollWidth > element.clientWidth + 1);
    };

    checkOverflow();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(checkOverflow);
      observer.observe(element);

      if (element.parentElement) {
        observer.observe(element.parentElement);
      }

      return () => observer.disconnect();
    }

    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [text]);

  return (
    <span
      ref={textRef}
      className={`${className}${isOverflowed ? ' is-overflowed' : ''}`}
      title={text}
    >
      {text}
    </span>
  );
}

export default function ScoreTable({ players, scores, totalHoles, parValues, holeDetails, courseName, setLabels, onScoreUpdate }: ScoreTableProps) {
  const [hasHorizontalScrollOffset, setHasHorizontalScrollOffset] = React.useState(false);
  const [playerColumnWidth, setPlayerColumnWidth] = React.useState(() => {
    try {
      const storedWidth = window.localStorage.getItem(PLAYER_COLUMN_WIDTH_STORAGE_KEY);
      if (!storedWidth) {
        return PLAYER_COLUMN_DEFAULT_WIDTH;
      }

      const parsedWidth = Number(storedWidth);
      if (Number.isNaN(parsedWidth)) {
        return PLAYER_COLUMN_DEFAULT_WIDTH;
      }

      return Math.min(PLAYER_COLUMN_MAX_WIDTH, Math.max(PLAYER_COLUMN_MIN_WIDTH, parsedWidth));
    } catch {
      return PLAYER_COLUMN_DEFAULT_WIDTH;
    }
  });
  const [isResizingPlayerColumn, setIsResizingPlayerColumn] = React.useState(false);
  const [activeScoreDialog, setActiveScoreDialog] = React.useState<ActiveScoreDialog | null>(null);
  const [showLowScoreOption, setShowLowScoreOption] = React.useState(false);
  const [showExtendedScoreOptions, setShowExtendedScoreOptions] = React.useState(false);
  const activeResizeHandleRef = React.useRef<HTMLButtonElement | null>(null);

  const handleTableScroll = (event: React.UIEvent<HTMLDivElement>) => {
    setHasHorizontalScrollOffset(event.currentTarget.scrollLeft > 0);
  };

  const clampPlayerColumnWidth = (width: number) =>
    Math.min(PLAYER_COLUMN_MAX_WIDTH, Math.max(PLAYER_COLUMN_MIN_WIDTH, width));

  React.useEffect(() => {
    try {
      window.localStorage.setItem(PLAYER_COLUMN_WIDTH_STORAGE_KEY, String(playerColumnWidth));
    } catch {
      // Ignore storage failures and keep the current in-memory width.
    }
  }, [playerColumnWidth]);

  const handlePlayerColumnResizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();

    const resizeHandle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = playerColumnWidth;
    const pointerId = event.pointerId;

    resizeHandle.setPointerCapture(pointerId);
    activeResizeHandleRef.current = resizeHandle;
    setIsResizingPlayerColumn(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }

      moveEvent.preventDefault();

      const nextWidth = clampPlayerColumnWidth(startWidth + (moveEvent.clientX - startX));
      setPlayerColumnWidth(nextWidth);
    };

    const stopResize = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) {
        return;
      }

      const activeHandle = activeResizeHandleRef.current;
      if (activeHandle && activeHandle.hasPointerCapture(pointerId)) {
        activeHandle.releasePointerCapture(pointerId);
      }

      activeResizeHandleRef.current = null;
      setIsResizingPlayerColumn(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  };

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

  const getHoleDetail = (hole: number): HoleInfo | undefined => holeDetails?.[hole - 1];

  const getSegmentYards = (start: number, end: number): number | null => {
    const segment = Array.from({ length: end - start + 1 }, (_, index) => getHoleDetail(start + index));
    if (!segment.some((hole) => hole?.yards !== undefined)) {
      return null;
    }

    return segment.reduce((sum, hole) => sum + (hole?.yards ?? 0), 0);
  };

  const getTotalYards = (): number | null => {
    if (!holeDetails?.some((hole) => hole?.yards !== undefined)) {
      return null;
    }

    return holeDetails.reduce((sum, hole) => sum + (hole.yards ?? 0), 0);
  };

  const hasYardValues = Boolean(holeDetails?.some((hole) => hole?.yards !== undefined));
  const hasHandicapValues = Boolean(holeDetails?.some((hole) => hole?.handicap !== undefined));

  const getTotalPar = (): number => {
    return parValues.reduce((sum, par) => sum + par, 0);
  };

  const getSetLabelForHole = (hole: number): string | null => {
    const setIndex = Math.floor((hole - 1) / 9);
    const label = setLabels?.[setIndex]?.trim() || holeGroups[setIndex]?.label;

    if (!label || totalHoles <= 9) {
      return null;
    }

    return label;
  };

  React.useEffect(() => {
    if (!activeScoreDialog) {
      return;
    }

    setShowLowScoreOption(activeScoreDialog.currentScore === 1);
    setShowExtendedScoreOptions(
      activeScoreDialog.currentScore !== null && activeScoreDialog.currentScore > SCORE_OPTIONS[SCORE_OPTIONS.length - 1]
    );

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveScoreDialog(null);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [activeScoreDialog]);

  const handleScoreChange = (playerId: string, hole: number, value: string | number) => {
    if (!onScoreUpdate) return;

    if (value === '' || value === '0' || value === 0) {
      // Delete the score by passing 0
      onScoreUpdate(playerId, hole, 0);
    } else {
      const numValue = typeof value === 'number' ? value : parseInt(value);
      if (!isNaN(numValue) && numValue > 0) {
        onScoreUpdate(playerId, hole, numValue);
      }
    }
  };

  const openScoreDialog = (playerId: string, playerName: string, hole: number, par: number) => {
    setActiveScoreDialog({
      playerId,
      playerName,
      hole,
      par,
      currentScore: getScore(playerId, hole),
    });
  };

  const applyScoreSelection = (strokes: number) => {
    if (!activeScoreDialog) {
      return;
    }

    handleScoreChange(activeScoreDialog.playerId, activeScoreDialog.hole, strokes);
    setActiveScoreDialog(null);
  };

  const clearScoreSelection = () => {
    if (!activeScoreDialog) {
      return;
    }

    handleScoreChange(activeScoreDialog.playerId, activeScoreDialog.hole, 0);
    setActiveScoreDialog(null);
  };

  const renderHoleCell = (playerId: string, playerName: string, hole: number, par: number) => {
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
        <button
          type="button"
          className="score-entry-btn"
          onClick={() => openScoreDialog(playerId, playerName, hole, par)}
          aria-label={`${playerName}, hole ${hole}, ${score ?? 'no score'}, par ${par}`}
        >
          <span className="score-text">{displayScore}</span>
        </button>
      </td>
    );
  };

  return (
    <div className="score-table-container">
      {courseName && <h2 className="course-name-heading">{courseName}</h2>}
      <div
        className={`table-wrapper${hasHorizontalScrollOffset ? ' is-scrolled-x' : ''}${isResizingPlayerColumn ? ' is-resizing-col' : ''}`}
        onScroll={handleTableScroll}
      >
        <table
          className="score-table"
          style={{ '--player-column-width': `${playerColumnWidth}px` } as React.CSSProperties}
        >
          <thead>
            <tr className="set-row">
              <th className="player-header set-sticky-cell">
                <div className="player-header-content">
                  <OverflowFadeText text={courseName || 'Scorecard'} className="player-header-label" />
                </div>
              </th>
              {holeGroups.map((group, index) => (
                <React.Fragment key={`set-${group.label}`}>
                  <th colSpan={group.holes.length + 1} className="set-header">
                    <OverflowFadeText
                      text={setLabels?.[index]?.trim() || group.label}
                      className="set-header-label"
                    />
                  </th>
                </React.Fragment>
              ))}
              <th className="total-header grand-total-header">Round</th>
            </tr>
            <tr>
              <th className="player-header">
                <div className="player-header-content">
                  <OverflowFadeText text="PLAYER" className="player-header-label" />
                  <button
                    type="button"
                    className="player-column-resizer"
                    onPointerDown={handlePlayerColumnResizeStart}
                    aria-label="Resize player column"
                    title="Drag to resize player column"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      fill="currentColor"
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M8 15a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 1 0v13a.5.5 0 0 1-.5.5M.146 8.354a.5.5 0 0 1 0-.708l2-2a.5.5 0 1 1 .708.708L1.707 7.5H5.5a.5.5 0 0 1 0 1H1.707l1.147 1.146a.5.5 0 0 1-.708.708zM10 8a.5.5 0 0 1 .5-.5h3.793l-1.147-1.146a.5.5 0 0 1 .708-.708l2 2a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708-.708L14.293 8.5H10.5A.5.5 0 0 1 10 8" />
                    </svg>
                  </button>
                </div>
              </th>
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
              <td className="label-cell">
                <OverflowFadeText text="PAR" className="label-text" />
              </td>
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
            {hasYardValues && (
              <tr className="detail-row">
                <td className="label-cell">
                  <OverflowFadeText text="Yards" className="label-text" />
                </td>
                {holeGroups.map((group) => (
                  <React.Fragment key={`yards-${group.label}`}>
                    {group.holes.map((hole) => (
                      <td key={hole} className="detail-cell">{getHoleDetail(hole)?.yards ?? ''}</td>
                    ))}
                    <td className="total-cell">{getSegmentYards(group.start, group.end) ?? ''}</td>
                  </React.Fragment>
                ))}
                <td className="total-cell">{getTotalYards() ?? ''}</td>
              </tr>
            )}
            {hasHandicapValues && (
              <tr className="detail-row">
                <td className="label-cell">
                  <OverflowFadeText text="HCP" className="label-text" />
                </td>
                {holeGroups.map((group) => (
                  <React.Fragment key={`hcp-${group.label}`}>
                    {group.holes.map((hole) => (
                      <td key={hole} className="detail-cell">{getHoleDetail(hole)?.handicap ?? ''}</td>
                    ))}
                    <td className="total-cell"></td>
                  </React.Fragment>
                ))}
                <td className="total-cell"></td>
              </tr>
            )}
            {players.map(player => (
              <tr key={player.id} className="player-row">
                <td className="player-cell">
                  <div className="player-info">
                    <OverflowFadeText text={player.name} className="player-name" />
                  </div>
                </td>
                {holeGroups.map((group) => (
                  <React.Fragment key={`player-${player.id}-${group.label}`}>
                    {group.holes.map((hole) => (
                      <React.Fragment key={hole}>
                        {renderHoleCell(player.id, player.name, hole, parValues[hole - 1] ?? 4)}
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
      {activeScoreDialog && (
        <div className="score-dialog-backdrop" role="presentation" onClick={() => setActiveScoreDialog(null)}>
          <div
            className="score-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Choose a score"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="score-dialog-header">
              <div className="score-dialog-heading-group">
                <strong>
                  Hole {activeScoreDialog.hole}
                  {getSetLabelForHole(activeScoreDialog.hole) ? ` · ${getSetLabelForHole(activeScoreDialog.hole)}` : ''}
                </strong>
                <span>{activeScoreDialog.playerName}</span>
              </div>
              <button
                type="button"
                className="score-dialog-close-btn"
                aria-label="Close score picker"
                onClick={() => setActiveScoreDialog(null)}
              >
                X
              </button>
            </div>
            <div className="score-dialog-edge-action">
              <button
                type="button"
                className={`score-edge-toggle${showLowScoreOption ? ' active' : ''}`}
                aria-label="Show score below 2"
                onClick={() => setShowLowScoreOption((prev) => !prev)}
              >
                -
              </button>
            </div>
            {showLowScoreOption && (
              <div className="score-dialog-edge-action revealed-score-action">
                <button
                  type="button"
                  className={`score-option-btn edge-option${activeScoreDialog.currentScore === 1 ? ' selected' : ''}${activeScoreDialog.par === 1 ? ' par-option' : ''}`}
                  onClick={() => applyScoreSelection(1)}
                >
                  <span className="score-option-value">1</span>
                  <span className="score-option-label">{activeScoreDialog.par === 1 ? 'Par' : ''}</span>
                </button>
              </div>
            )}
            <div className="score-dialog-grid">
              {SCORE_OPTIONS.map((value) => {
                const isPar = value === activeScoreDialog.par;
                const isSelected = value === activeScoreDialog.currentScore;

                return (
                  <button
                    key={value}
                    type="button"
                    className={`score-option-btn${isPar ? ' par-option' : ''}${isSelected ? ' selected' : ''}`}
                    onClick={() => applyScoreSelection(value)}
                  >
                    <span className="score-option-value">{value}</span>
                    <span className="score-option-label">{isPar ? 'Par' : ''}</span>
                  </button>
                );
              })}
            </div>
            <div className="score-dialog-edge-action">
              <button
                type="button"
                className={`score-edge-toggle${showExtendedScoreOptions ? ' active' : ''}`}
                aria-label="Show scores above 10"
                onClick={() => setShowExtendedScoreOptions((prev) => !prev)}
              >
                +
              </button>
            </div>
            {showExtendedScoreOptions && (
              <div className="score-dialog-grid extended-grid">
                {EXTENDED_SCORE_OPTIONS.map((value) => {
                  const isPar = value === activeScoreDialog.par;
                  const isSelected = value === activeScoreDialog.currentScore;

                  return (
                    <button
                      key={value}
                      type="button"
                      className={`score-option-btn${isPar ? ' par-option' : ''}${isSelected ? ' selected' : ''}`}
                      onClick={() => applyScoreSelection(value)}
                    >
                      <span className="score-option-value">{value}</span>
                      <span className="score-option-label">{isPar ? 'Par' : ''}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="score-dialog-actions">
              <button type="button" className="score-dialog-btn danger" onClick={clearScoreSelection}>
                Clear score
              </button>
            </div>
          </div>
        </div>
      )}
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
