import type { MatchupConfig, Player, Score } from '../types/index.ts';

interface MatchPlayStatus {
  summary: string;
  holeDelta: number;
  holesCompleted: number;
}

const getStroke = (scores: Score[], playerId: string, hole: number): number | null => {
  const score = scores.find((entry) => entry.playerId === playerId && entry.hole === hole);
  if (!score || score.strokes <= 0) {
    return null;
  }
  return score.strokes;
};

export const evaluateMatchPlayStatus = (
  matchup: MatchupConfig | undefined,
  players: Player[],
  scores: Score[],
  totalHoles: number
): MatchPlayStatus | null => {
  if (!matchup || matchup.format !== 'match-play' || matchup.teams.length < 2) {
    return null;
  }

  const teamA = matchup.teams[0];
  const teamB = matchup.teams[1];
  const playerAId = teamA.playerIds[0];
  const playerBId = teamB.playerIds[0];

  if (!playerAId || !playerBId) {
    return null;
  }

  const playerAName =
    players.find((player) => player.id === playerAId)?.name ||
    teamA.name ||
    'Player 1';
  const playerBName =
    players.find((player) => player.id === playerBId)?.name ||
    teamB.name ||
    'Player 2';

  let holeDelta = 0;
  let holesCompleted = 0;

  for (let hole = 1; hole <= totalHoles; hole += 1) {
    const strokesA = getStroke(scores, playerAId, hole);
    const strokesB = getStroke(scores, playerBId, hole);

    // A match play hole is complete only when both players have a score.
    if (strokesA === null || strokesB === null) {
      continue;
    }

    holesCompleted += 1;

    if (strokesA < strokesB) {
      holeDelta += 1;
    } else if (strokesB < strokesA) {
      holeDelta -= 1;
    }
  }

  const holesRemaining = totalHoles - holesCompleted;
  const leaderName = holeDelta > 0 ? playerAName : playerBName;
  const absDelta = Math.abs(holeDelta);

  if (holesCompleted === 0 || holeDelta === 0) {
    if (holesCompleted === 0) {
      return { summary: 'Match play: all square', holeDelta, holesCompleted };
    }
    return {
      summary: `Match play: all square through ${holesCompleted}`,
      holeDelta,
      holesCompleted,
    };
  }

  if (absDelta > holesRemaining) {
    return {
      summary: `Match play: ${leaderName} wins ${absDelta - holesRemaining} & ${holesRemaining}`,
      holeDelta,
      holesCompleted,
    };
  }

  const dormieText = holesRemaining > 0 && absDelta === holesRemaining ? ' (dormie)' : '';

  return {
    summary: `Match play: ${leaderName} ${absDelta} up through ${holesCompleted}${dormieText}`,
    holeDelta,
    holesCompleted,
  };
};
