import React from 'react';
import type { HoleInfo, MatchupConfig, Player, Score } from '../types/index.ts';
import './ScoreTable.scss';

interface ScoreTableProps {
  players: Player[];
  scores: Score[];
  totalHoles: number;
  parValues: number[];
  roundTitle?: string;
  tournamentName?: string;
  onTournamentLinkClick?: () => void;
  holeDetails?: HoleInfo[];
  courseName?: string;
  setLabels?: string[];
  matchup?: MatchupConfig;
  onScoreUpdate?: (playerId: string, hole: number, strokes: number) => void;
}

const isSinglesMatchPlayFormat = (format: string | undefined): boolean =>
  format === 'match-play' || format === 'singles';

const applyRoundRule = (value: number, rounding: 'nearest' | 'up' | 'down'): number => {
  if (rounding === 'up') {
    return Math.ceil(value);
  }

  if (rounding === 'down') {
    return Math.floor(value);
  }

  return Math.round(value);
};

const prorateHandicapByHoles = (baseHandicap: number, holes: number): number => {
  const normalizedHoles = Number.isFinite(holes) && holes > 0 ? holes : 18;
  return baseHandicap * (normalizedHoles / 18);
};

const isHeadToHeadSideFormat = (format: string | undefined): boolean =>
  Boolean(format) && format !== 'stroke';

const isSharedScoreSideFormat = (format: string | undefined): boolean =>
  format === 'scramble' || format === 'foursomes';

const PLAYER_COLUMN_MIN_WIDTH = 44;
const PLAYER_COLUMN_MAX_WIDTH = 280;
const PLAYER_COLUMN_DEFAULT_WIDTH = 140;
const PLAYER_COLUMN_WIDTH_STORAGE_KEY = 'golphy-player-column-width';
const SCORE_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const EXTENDED_SCORE_OPTIONS = [11, 12, 13, 14, 15] as const;

interface ActiveScoreDialog {
  playerIds: string[];
  playerName: string;
  hole: number;
  par: number;
  currentScore: number | null;
}

interface ScoreRow {
  id: string;
  label: string;
  playerIds: string[];
  primaryPlayerId: string;
  sideIndex?: 0 | 1;
  teamName?: string;
  handicap?: number;
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

function MatchChevron({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      className="match-chevron"
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points={direction === 'up' ? '3,10 8,5 13,10' : '3,6 8,11 13,6'} />
    </svg>
  );
}

export default function ScoreTable({ players, scores, totalHoles, parValues, roundTitle, tournamentName, onTournamentLinkClick, holeDetails, courseName, setLabels, matchup, onScoreUpdate }: ScoreTableProps) {
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

  const playerTeamNames = React.useMemo((): Record<string, string> => {
    if (!matchup?.teams?.length) {
      return {};
    }

    const teamNamesByPlayer: Record<string, string> = {};

    matchup.teams.forEach((team) => {
      const teamName = team.name.trim();
      if (!teamName) {
        return;
      }

      team.playerIds.forEach((playerId) => {
        teamNamesByPlayer[playerId] = teamName;
      });
    });

    return teamNamesByPlayer;
  }, [matchup]);

  const isLikelyTournamentRound = React.useMemo((): boolean => {
    if (!matchup?.teams?.length) {
      return false;
    }

    return matchup.teams.some((team) => {
      const teamName = team.name.trim().toLowerCase();
      if (!teamName) {
        return false;
      }

      if (team.playerIds.length !== 1) {
        return true;
      }

      const player = players.find((candidate) => candidate.id === team.playerIds[0]);
      if (!player) {
        return true;
      }

      return teamName !== player.name.trim().toLowerCase();
    });
  }, [matchup, players]);

  const matchupSides = React.useMemo(() => {
    const activeMatchup = matchup;
    if (!activeMatchup || !isHeadToHeadSideFormat(activeMatchup.format) || activeMatchup.teams.length < 2) {
      return null;
    }

    const topPlayerIds = activeMatchup.teams[0].playerIds.filter(Boolean);
    const bottomPlayerIds = activeMatchup.teams[1].playerIds.filter(Boolean);
    if (topPlayerIds.length === 0 || bottomPlayerIds.length === 0) {
      return null;
    }

    return {
      format: activeMatchup.format,
      topPlayerIds,
      bottomPlayerIds,
      splitAfterId: topPlayerIds.at(-1) ?? topPlayerIds[0],
    };
  }, [matchup]);

  const isSinglesHeadToHead =
    matchupSides !== null &&
    isSinglesMatchPlayFormat(matchupSides.format) &&
    matchupSides.topPlayerIds.length === 1 &&
    matchupSides.bottomPlayerIds.length === 1;

  const isTeamScrambleHeadToHead =
    matchupSides !== null &&
    matchupSides.format === 'scramble' &&
    matchupSides.topPlayerIds.length >= 2 &&
    matchupSides.bottomPlayerIds.length >= 2 &&
    matchup?.handicapRule?.type === 'scramble-pair-percentage';

  const isMatchPlay =
    Boolean(matchupSides) &&
    (matchup?.scoringMode ? matchup.scoringMode === 'match' : true) &&
    (matchup?.resultMode ? matchup.resultMode === 'holes' : true);

  // Strokes go to the higher handicap player, allocated to the hardest holes by stroke index.
  const matchPlayStrokes = React.useMemo((): { playerId: string; byHole: Record<number, number> } | null => {
    if (!isSinglesHeadToHead || !matchupSides) {
      return null;
    }

    const playerAId = matchupSides.topPlayerIds[0];
    const playerBId = matchupSides.bottomPlayerIds[0];
    const handicapA = players.find((player) => player.id === playerAId)?.handicap;
    const handicapB = players.find((player) => player.id === playerBId)?.handicap;

    if (!Number.isFinite(handicapA) || !Number.isFinite(handicapB)) {
      return null;
    }

    const playingHandicapA = Math.round(prorateHandicapByHoles(handicapA as number, totalHoles));
    const playingHandicapB = Math.round(prorateHandicapByHoles(handicapB as number, totalHoles));
    const difference = Math.abs(playingHandicapA - playingHandicapB);
    if (difference <= 0) {
      return null;
    }

    const rankedHoles = Array.from({ length: totalHoles }, (_, index) => ({
      hole: index + 1,
      strokeIndex: holeDetails?.[index]?.handicap,
    })).filter((entry): entry is { hole: number; strokeIndex: number } =>
      Number.isFinite(entry.strokeIndex)
    );

    if (rankedHoles.length === 0) {
      return null;
    }

    const base = Math.floor(difference / rankedHoles.length);
    const remainder = difference % rankedHoles.length;
    const byHole: Record<number, number> = {};

    rankedHoles.forEach(({ hole, strokeIndex }) => {
      const strokes = base + (strokeIndex <= remainder ? 1 : 0);
      if (strokes > 0) {
        byHole[hole] = strokes;
      }
    });

    return {
      playerId: playingHandicapA > playingHandicapB ? playerAId : playerBId,
      byHole,
    };
  }, [holeDetails, isSinglesHeadToHead, matchupSides, players, totalHoles]);

  const getStrokesGiven = (playerId: string, hole: number): number =>
    matchPlayStrokes?.playerId === playerId ? matchPlayStrokes.byHole[hole] ?? 0 : 0;

  const scrambleSideStrokes = React.useMemo((): {
    sideHandicaps: [number, number];
    bySide: [Record<number, number>, Record<number, number>];
    details: [
      {
        playerNames: [string, string];
        playerHandicaps: [number, number];
        weightedLow: number;
        weightedHigh: number;
        rawTeamHandicap: number;
        effectiveTeamHandicap: number;
      },
      {
        playerNames: [string, string];
        playerHandicaps: [number, number];
        weightedLow: number;
        weightedHigh: number;
        rawTeamHandicap: number;
        effectiveTeamHandicap: number;
      }
    ];
  } | null => {
    if (!isTeamScrambleHeadToHead || !matchupSides || !matchup?.handicapRule) {
      return null;
    }

    const handicapRule = matchup.handicapRule;

    const resolveSideDetails = (playerIds: string[]) => {
      const rankedPlayers = playerIds
        .map((id) => players.find((player) => player.id === id))
        .filter((player): player is Player => player !== undefined && Number.isFinite(player.handicap))
        .sort((a, b) => (a.handicap as number) - (b.handicap as number));

      if (rankedPlayers.length < 2) {
        return null;
      }

      const lowPlayer = rankedPlayers[0];
      const highPlayer = rankedPlayers[1];
      const low = lowPlayer.handicap as number;
      const high = highPlayer.handicap as number;
      const weightedLow = low * handicapRule.lowPercentage;
      const weightedHigh = high * handicapRule.highPercentage;
      const rawTeamHandicap = weightedLow + weightedHigh;
      const effectiveTeamHandicap = handicapRule.prorateByHoles !== false
        ? prorateHandicapByHoles(rawTeamHandicap, totalHoles)
        : rawTeamHandicap;
      const roundedTeamHandicap = applyRoundRule(effectiveTeamHandicap, handicapRule.rounding);

      return {
        roundedTeamHandicap,
        detail: {
          playerNames: [lowPlayer.name, highPlayer.name] as [string, string],
          playerHandicaps: [low, high] as [number, number],
          weightedLow,
          weightedHigh,
          rawTeamHandicap,
          effectiveTeamHandicap,
        },
      };
    };

    const topDetails = resolveSideDetails(matchupSides.topPlayerIds);
    const bottomDetails = resolveSideDetails(matchupSides.bottomPlayerIds);

    if (!topDetails || !bottomDetails) {
      return null;
    }

    const topHandicap = topDetails.roundedTeamHandicap;
    const bottomHandicap = bottomDetails.roundedTeamHandicap;

    const allowances: [number, number] = [0, 0];
    if (topHandicap > bottomHandicap) {
      allowances[0] = topHandicap - bottomHandicap;
    } else if (bottomHandicap > topHandicap) {
      allowances[1] = bottomHandicap - topHandicap;
    }

    const rankedHoles = Array.from({ length: totalHoles }, (_, index) => ({
      hole: index + 1,
      strokeIndex: holeDetails?.[index]?.handicap,
    }));

    const sortedHoles =
      rankedHoles.every((hole) => Number.isFinite(hole.strokeIndex))
        ? [...rankedHoles].sort((left, right) => (left.strokeIndex as number) - (right.strokeIndex as number))
        : rankedHoles;

    const allocate = (strokes: number): Record<number, number> => {
      const byHole: Record<number, number> = {};
      if (strokes <= 0 || sortedHoles.length === 0) {
        return byHole;
      }

      const cycles = Math.floor(strokes / sortedHoles.length);
      const remainder = strokes % sortedHoles.length;

      sortedHoles.forEach((hole, index) => {
        const count = cycles + (index < remainder ? 1 : 0);
        if (count > 0) {
          byHole[hole.hole] = count;
        }
      });

      return byHole;
    };

    return {
      sideHandicaps: [topHandicap, bottomHandicap],
      bySide: [allocate(allowances[0]), allocate(allowances[1])],
      details: [topDetails.detail, bottomDetails.detail],
    };
  }, [holeDetails, isTeamScrambleHeadToHead, matchup, matchupSides, players, totalHoles]);

  const getSideStrokesGiven = (sideIndex: 0 | 1, hole: number): number =>
    scrambleSideStrokes?.bySide[sideIndex][hole] ?? 0;

  const getNetScore = (playerId: string, hole: number): number | null => {
    const gross = getScore(playerId, hole);
    return gross ? gross - getStrokesGiven(playerId, hole) : null;
  };

  const playerSideIndex = React.useMemo((): Record<string, 0 | 1> => {
    if (!matchupSides) {
      return {};
    }

    const sideByPlayer: Record<string, 0 | 1> = {};
    matchupSides.topPlayerIds.forEach((playerId) => {
      sideByPlayer[playerId] = 0;
    });
    matchupSides.bottomPlayerIds.forEach((playerId) => {
      sideByPlayer[playerId] = 1;
    });

    return sideByPlayer;
  }, [matchupSides]);

  const useSharedTeamRows = React.useMemo(() => {
    if (!matchupSides || !matchup) {
      return false;
    }

    if (matchup.ownBall === false) {
      return true;
    }

    if (matchup.ownBall === true) {
      return false;
    }

    return isSharedScoreSideFormat(matchupSides.format);
  }, [matchup, matchupSides]);

  const scoreRows = React.useMemo<ScoreRow[]>(() => {
    if (useSharedTeamRows && matchup?.teams?.length) {
      return matchup.teams
        .filter((team) => team.playerIds.length > 0)
        .map((team, index) => {
          const participantNames = team.playerIds.map((playerId) => {
            const player = players.find((candidate) => candidate.id === playerId);
            return player?.name ?? playerId;
          });

          return {
            id: team.id,
            label: participantNames.join(' / '),
            playerIds: team.playerIds,
            primaryPlayerId: team.playerIds[0],
            sideIndex: index === 0 || index === 1 ? index : undefined,
            teamName: team.name,
          };
        });
    }

    return players.map((player) => ({
      id: player.id,
      label: player.name,
      playerIds: [player.id],
      primaryPlayerId: player.id,
      sideIndex: playerSideIndex[player.id],
      teamName: playerTeamNames[player.id],
      handicap: player.handicap,
    }));
  }, [matchup?.teams, playerTeamNames, players, useSharedTeamRows]);

  const getComparableScore = (playerId: string, hole: number): number | null => {
    if (isSinglesHeadToHead) {
      return getNetScore(playerId, hole);
    }

    const gross = getScore(playerId, hole);
    return gross ?? null;
  };

  const getSideHoleScore = (sideIndex: 0 | 1, hole: number): number | null => {
    if (!matchupSides) {
      return null;
    }

    const playerIds = sideIndex === 0 ? matchupSides.topPlayerIds : matchupSides.bottomPlayerIds;
    const sideScores = playerIds
      .map((playerId) => getComparableScore(playerId, hole))
      .filter((score): score is number => score !== null);

    if (sideScores.length === 0) {
      return null;
    }

    if (matchupSides.format === 'four-ball' || matchupSides.format === 'scramble') {
      const gross = Math.min(...sideScores);
      if (matchupSides.format === 'scramble' && scrambleSideStrokes) {
        return gross - getSideStrokesGiven(sideIndex, hole);
      }

      return gross;
    }

    // Foursomes should only have one side score entered; if multiple are filled,
    // use the best one so accidental duplicate entries do not skew the hole result.
    if (matchupSides.format === 'foursomes') {
      return Math.min(...sideScores);
    }

    return sideScores[0];
  };

  const isHoleComplete = (hole: number): boolean =>
    getSideHoleScore(0, hole) !== null && getSideHoleScore(1, hole) !== null;

  // Positive means the player above the match row is up.
  const getMatchDeltaThroughHole = (hole: number): number | null => {
    if (!matchupSides) {
      return null;
    }

    let delta = 0;
    let holesCounted = 0;

    for (let played = 1; played <= hole; played += 1) {
      const top = getSideHoleScore(0, played);
      const bottom = getSideHoleScore(1, played);
      if (top === null || bottom === null) {
        continue;
      }

      holesCounted += 1;
      if (top < bottom) delta += 1;
      else if (bottom < top) delta -= 1;
    }

    return holesCounted > 0 ? delta : null;
  };

  const renderMatchStatus = (hole: number, throughLatest = false) => {
    if (!throughLatest && !isHoleComplete(hole)) {
      return null;
    }

    const delta = getMatchDeltaThroughHole(hole);
    if (delta === null) {
      return null;
    }

    if (delta === 0) {
      return <span className="match-status">AS</span>;
    }

    return (
      <span className={`match-status ${delta > 0 ? 'is-up' : 'is-down'}`}>
        <MatchChevron direction={delta > 0 ? 'up' : 'down'} />
        {Math.abs(delta)}
      </span>
    );
  };

  const renderMatchScoreRow = () => (
    <tr className="match-score-row">
      <td className="label-cell">
        <OverflowFadeText text="Match" className="label-text" />
      </td>
      {holeGroups.map((group) => (
        <React.Fragment key={`match-${group.label}`}>
          {group.holes.map((hole) => (
            <td key={hole} className="match-cell">{renderMatchStatus(hole)}</td>
          ))}
          <td className="total-cell">{renderMatchStatus(group.end, true)}</td>
        </React.Fragment>
      ))}
      <td className="total-cell">{renderMatchStatus(totalHoles, true)}</td>
    </tr>
  );

  const getMatchPlayOutcome = (playerId: string, hole: number): 'won' | 'lost' | 'halved' | null => {
    const sideIndex = playerSideIndex[playerId];
    if (sideIndex === undefined) {
      return null;
    }

    const ownScore = getSideHoleScore(sideIndex, hole);
    const opponentScore = getSideHoleScore(sideIndex === 0 ? 1 : 0, hole);
    if (ownScore === null || opponentScore === null) {
      return null;
    }

    if (ownScore < opponentScore) return 'won';
    if (ownScore > opponentScore) return 'lost';
    return 'halved';
  };

  const getRowScore = (row: ScoreRow, hole: number): number | null => {
    for (const playerId of row.playerIds) {
      const value = getScore(playerId, hole);
      if (value !== null) {
        return value;
      }
    }

    return null;
  };

  const getRowStrokesGiven = (row: ScoreRow, hole: number): number => {
    const teamStrokesGiven =
      scrambleSideStrokes && row.sideIndex !== undefined
        ? getSideStrokesGiven(row.sideIndex, hole)
        : 0;

    return isSinglesHeadToHead ? getStrokesGiven(row.primaryPlayerId, hole) : teamStrokesGiven;
  };

  const getRowNetScore = (row: ScoreRow, hole: number): number | null => {
    const gross = getRowScore(row, hole);
    if (gross === null) {
      return null;
    }

    return gross - getRowStrokesGiven(row, hole);
  };

  const getRowHoleScoreValue = (row: ScoreRow, hole: number): number => getRowScore(row, hole) ?? 0;

  const getRowSegmentScore = (row: ScoreRow, start: number, end: number): number => {
    let total = 0;
    for (let hole = start; hole <= end; hole += 1) {
      total += getRowHoleScoreValue(row, hole);
    }
    return total;
  };

  const getRowSegmentNetScore = (row: ScoreRow, start: number, end: number): number => {
    let total = 0;
    for (let hole = start; hole <= end; hole += 1) {
      const net = getRowNetScore(row, hole);
      if (net !== null) {
        total += net;
      }
    }
    return total;
  };

  const rowHasAnyScoredHandicapHole = (row: ScoreRow): boolean => {
    if (isMatchPlay) {
      return false;
    }

    for (let hole = 1; hole <= totalHoles; hole += 1) {
      const gross = getRowScore(row, hole);
      if (gross !== null && getRowStrokesGiven(row, hole) > 0) {
        return true;
      }
    }

    return false;
  };

  const getRowTotalScore = (row: ScoreRow): number => getRowSegmentScore(row, 1, totalHoles);

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

  const handleRowScoreChange = (playerIds: string[], hole: number, value: string | number) => {
    if (!onScoreUpdate) {
      return;
    }

    playerIds.forEach((playerId) => {
      handleScoreChange(playerId, hole, value);
    });
  };

  const openScoreDialog = (playerIds: string[], playerName: string, hole: number, par: number) => {
    setActiveScoreDialog({
      playerIds,
      playerName,
      hole,
      par,
      currentScore: getScore(playerIds[0], hole),
    });
  };

  const applyScoreSelection = (strokes: number) => {
    if (!activeScoreDialog) {
      return;
    }

    handleRowScoreChange(activeScoreDialog.playerIds, activeScoreDialog.hole, strokes);
    setActiveScoreDialog(null);
  };

  const clearScoreSelection = () => {
    if (!activeScoreDialog) {
      return;
    }

    handleRowScoreChange(activeScoreDialog.playerIds, activeScoreDialog.hole, 0);
    setActiveScoreDialog(null);
  };

  const renderHoleCell = (row: ScoreRow, hole: number, par: number) => {
    const score = getRowScore(row, hole);
    const displayScore = score || '';
    const matchPlayOutcome = isMatchPlay ? getMatchPlayOutcome(row.primaryPlayerId, hole) : null;
    const strokesGiven = getRowStrokesGiven(row, hole);
    const netScore = score === null ? null : score - strokesGiven;
    const showNetScore = !isMatchPlay && score !== null && strokesGiven > 0;
    const markedScore = showNetScore ? netScore : score;

    let className = 'score-cell';
    if (score === null) {
      className += ' empty';
    }

    if (showNetScore) {
      className += ' has-net-stack';
    }

    if (isMatchPlay) {
      className += ' match-play';
      if (matchPlayOutcome) {
        className += ` hole-${matchPlayOutcome}`;
      }
    } else if (markedScore !== null) {
      if (markedScore <= par - 2) {
        className += ' eagle';
      } else if (markedScore === par - 1) {
        className += ' birdie';
      } else if (markedScore === par) {
        className += ' par';
      } else if (markedScore === par + 1) {
        className += ' bogey';
      } else {
        className += ' double-bogey';
      }
    }

    const outcomeLabel =
      matchPlayOutcome === 'won'
        ? ', hole won'
        : matchPlayOutcome === 'lost'
          ? ', hole lost'
          : matchPlayOutcome === 'halved'
            ? ', hole halved'
            : '';

    const strokesLabel = strokesGiven > 0 ? `, ${strokesGiven} stroke${strokesGiven > 1 ? 's' : ''} given` : '';
    const netLabel = showNetScore && netScore !== null ? `, net ${netScore}` : '';

    return (
      <td className={className}>
        {strokesGiven > 0 && (
          <span className="stroke-dots" aria-hidden="true">
            {Array.from({ length: strokesGiven }, (_, index) => (
              <span key={index} className="stroke-dot" />
            ))}
          </span>
        )}
        <button
          type="button"
          className="score-entry-btn"
          onClick={() => openScoreDialog(row.playerIds, row.label, hole, par)}
          aria-label={`${row.label}, hole ${hole}, ${score ?? 'no score'}, par ${par}${outcomeLabel}${strokesLabel}${netLabel}`}
        >
          {showNetScore && netScore !== null ? (
            <span className="score-net-wrapper">
              <span className="score-text net">{netScore}</span>
              <span className="score-text gross is-net-adjusted">{score}</span>
            </span>
          ) : (
            <span className="score-text">{displayScore}</span>
          )}
        </button>
      </td>
    );
  };

  return (
    <div className="score-table-container">
      {roundTitle && <h2 className="course-name-heading">{roundTitle}</h2>}
      {tournamentName && (
        <div className="round-tournament-row">
          {onTournamentLinkClick && (
            <button
              type="button"
              className="round-tournament-back-btn"
              onClick={onTournamentLinkClick}
              aria-label="Back to tournament"
              title="Back to tournament"
            >
              <i className="bi bi-chevron-left" aria-hidden="true" />
            </button>
          )}
          <p className="round-tournament-name">{tournamentName}</p>
        </div>
      )}
      {scrambleSideStrokes && matchup?.teams?.length && (
        <>
          <p className="matchup-handicap-note">
            Team handicap: {scrambleSideStrokes.sideHandicaps[0]} vs {scrambleSideStrokes.sideHandicaps[1]}.{' '}
            {(() => {
              const side0Total = Object.values(scrambleSideStrokes.bySide[0]).reduce((sum, value) => sum + value, 0);
              const side1Total = Object.values(scrambleSideStrokes.bySide[1]).reduce((sum, value) => sum + value, 0);

              if (side0Total > 0) {
                const teamName = matchup.teams[0]?.name || 'Top side';
                return `${teamName} receives ${side0Total} stroke${side0Total === 1 ? '' : 's'}.`;
              }

              if (side1Total > 0) {
                const teamName = matchup.teams[1]?.name || 'Bottom side';
                return `${teamName} receives ${side1Total} stroke${side1Total === 1 ? '' : 's'}.`;
              }

              return 'No strokes given.';
            })()}
          </p>
          <details className="matchup-handicap-disclosure">
            <summary>Show handicap calculation details</summary>
            <div className="matchup-handicap-breakdown">
              {([0, 1] as const).map((sideIndex) => {
                const detail = scrambleSideStrokes.details[sideIndex];
                const teamName = matchup.teams[sideIndex]?.name || `Side ${sideIndex + 1}`;

                return (
                  <div key={teamName} className="matchup-handicap-side-detail">
                    <strong>{teamName}</strong>
                    <span>
                      Low handicap player: {detail.playerNames[0]} ({detail.playerHandicaps[0]}) x {matchup.handicapRule?.lowPercentage ?? 0}
                      {' '}= {detail.weightedLow.toFixed(2)}
                    </span>
                    <span>
                      High handicap player: {detail.playerNames[1]} ({detail.playerHandicaps[1]}) x {matchup.handicapRule?.highPercentage ?? 0}
                      {' '}= {detail.weightedHigh.toFixed(2)}
                    </span>
                    <span>Raw team handicap: {detail.rawTeamHandicap.toFixed(2)}</span>
                    {matchup.handicapRule?.prorateByHoles !== false && (
                      <span>Prorated for {totalHoles} holes: {detail.effectiveTeamHandicap.toFixed(2)}</span>
                    )}
                    <span>Rounded team handicap: {scrambleSideStrokes.sideHandicaps[sideIndex]}</span>
                  </div>
                );
              })}
            </div>
          </details>
        </>
      )}
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
                  <OverflowFadeText text="HOLE" className="player-header-label" />
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
            {scoreRows.map((row, rowIndex) => (
              <React.Fragment key={row.id}>
              <tr className="player-row">
                <td className="player-cell">
                  <div className="player-info">
                    <div className="player-meta">
                      <OverflowFadeText text={row.label} className="player-name" />
                      {isLikelyTournamentRound &&
                        row.teamName &&
                        row.teamName.trim().toLowerCase() !== row.label.trim().toLowerCase() && (
                          <OverflowFadeText text={row.teamName} className="player-team-name" />
                        )}
                    </div>
                    {Number.isFinite(row.handicap) && (
                      <span className="player-handicap" title={`Handicap ${row.handicap}`}>
                        {row.handicap}
                      </span>
                    )}
                  </div>
                </td>
                {(() => {
                  const showNetTotals = rowHasAnyScoredHandicapHole(row);

                  return (
                    <>
                {holeGroups.map((group) => (
                  <React.Fragment key={`player-${row.id}-${group.label}`}>
                    {group.holes.map((hole) => (
                      <React.Fragment key={hole}>
                        {renderHoleCell(row, hole, parValues[hole - 1] ?? 4)}
                      </React.Fragment>
                    ))}
                    <td className="total-cell">
                      {showNetTotals ? (
                        <span className="score-total-stack">
                          <span className="score-text gross is-net-adjusted">{getRowSegmentScore(row, group.start, group.end) || ''}</span>
                          <span className="score-text net">{getRowSegmentNetScore(row, group.start, group.end) || ''}</span>
                        </span>
                      ) : (
                        <span className="score-text">{getRowSegmentScore(row, group.start, group.end) || ''}</span>
                      )}
                    </td>
                  </React.Fragment>
                ))}
                <td className="total-cell bold">
                  {showNetTotals ? (
                    <span className="score-total-stack">
                      <span className="score-text gross is-net-adjusted">{getRowTotalScore(row) || ''}</span>
                      <span className="score-text net">{getRowSegmentNetScore(row, 1, totalHoles) || ''}</span>
                    </span>
                  ) : (
                    <span className="score-text">{getRowTotalScore(row) || ''}</span>
                  )}
                </td>
                    </>
                  );
                })()}
              </tr>
              {isMatchPlay &&
                (((useSharedTeamRows && rowIndex === 0) ||
                  (!useSharedTeamRows && matchupSides?.splitAfterId === row.primaryPlayerId))) &&
                renderMatchScoreRow()}
              </React.Fragment>
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
