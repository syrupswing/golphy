import type {
  MatchupSide,
  Tournament,
  TournamentMatchup,
  TournamentMatchupFormat,
  TournamentRound,
} from '../types/index.ts';

export const HOLES_PER_GAME = 9;

// A won nine-hole game is worth two points; a halved game splits them.
export const POINTS_FOR_WIN = 2;
export const POINTS_FOR_TIE = 1;

export const MATCHUP_FORMAT_LABELS: Record<TournamentMatchupFormat, string> = {
  singles: 'Singles match play',
  'four-ball': 'Four-ball (best ball)',
  foursomes: 'Foursomes (alternate shot)',
  scramble: 'Scramble',
  stroke: 'Stroke play',
};

export const MATCHUP_FORMAT_PLAYER_COUNTS: Record<TournamentMatchupFormat, number> = {
  singles: 1,
  'four-ball': 2,
  foursomes: 2,
  scramble: 2,
  stroke: 1,
};

// Every format except stroke play is decided hole by hole.
const isStrokeFormat = (format: TournamentMatchupFormat): boolean => format === 'stroke';

export interface MatchupResult {
  isComplete: boolean;
  holesPlayed: number;
  holesWon: [number, number];
  totals: [number, number];
  winningSideIndex: number | null;
  isTie: boolean;
  summary: string;
}

const getHoleScore = (side: MatchupSide | undefined, hole: number): number => {
  const value = side?.scores?.[hole];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
};

export const resolveMatchup = (matchup: TournamentMatchup): MatchupResult => {
  const [sideA, sideB] = matchup.sides;
  const holesWon: [number, number] = [0, 0];
  const totals: [number, number] = [0, 0];
  let holesPlayed = 0;

  for (let hole = 0; hole < HOLES_PER_GAME; hole += 1) {
    const scoreA = getHoleScore(sideA, hole);
    const scoreB = getHoleScore(sideB, hole);

    if (!scoreA || !scoreB) {
      continue;
    }

    holesPlayed += 1;
    totals[0] += scoreA;
    totals[1] += scoreB;

    if (scoreA < scoreB) holesWon[0] += 1;
    else if (scoreB < scoreA) holesWon[1] += 1;
  }

  const isComplete = holesPlayed === HOLES_PER_GAME;

  if (holesPlayed === 0) {
    return {
      isComplete: false,
      holesPlayed,
      holesWon,
      totals,
      winningSideIndex: null,
      isTie: false,
      summary: 'No scores yet',
    };
  }

  const [metricA, metricB] = isStrokeFormat(matchup.format)
    ? [totals[1], totals[0]] // Lower total wins, so invert for a shared comparison.
    : [holesWon[0], holesWon[1]];

  const isTie = metricA === metricB;
  const winningSideIndex = isTie ? null : metricA > metricB ? 0 : 1;

  const summary = isStrokeFormat(matchup.format)
    ? `${totals[0]} v ${totals[1]}`
    : isTie
      ? `All square through ${holesPlayed}`
      : `${Math.abs(holesWon[0] - holesWon[1])} up through ${holesPlayed}`;

  return { isComplete, holesPlayed, holesWon, totals, winningSideIndex, isTie, summary };
};

// Kept here rather than in the Firestore module so components can build rounds without a circular import.
const createLocalId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createEmptyMatchup = (
  format: TournamentMatchupFormat = 'singles'
): TournamentMatchup => ({
  id: createLocalId(),
  format,
  confirmed: false,
  sides: [
    { entryId: '', playerIds: [], scores: Array(HOLES_PER_GAME).fill(0) },
    { entryId: '', playerIds: [], scores: Array(HOLES_PER_GAME).fill(0) },
  ],
});

export const createEmptyRound = (existingCount: number): TournamentRound => ({
  id: createLocalId(),
  name: `Round ${existingCount + 1}`,
  roundId: '',
  matchups: [createEmptyMatchup()],
});

export interface StandingRow {
  entryId: string;
  points: number;
  projectedPoints: number;
  gamesPlayed: number;
  confirmedGames: number;
  wins: number;
  ties: number;
  losses: number;
}

export const calculateStandings = (tournament: Tournament): StandingRow[] => {
  const rows = new Map<string, StandingRow>();

  const rowFor = (entryId: string): StandingRow => {
    const existing = rows.get(entryId);
    if (existing) return existing;

    const created: StandingRow = {
      entryId,
      points: 0,
      projectedPoints: 0,
      gamesPlayed: 0,
      confirmedGames: 0,
      wins: 0,
      ties: 0,
      losses: 0,
    };
    rows.set(entryId, created);
    return created;
  };

  tournament.entries.forEach((entry) => rowFor(entry.id));

  tournament.rounds?.forEach((round) => {
    round.matchups.forEach((matchup) => {
      const result = resolveMatchup(matchup);
      if (result.holesPlayed === 0) {
        return;
      }

      matchup.sides.forEach((side, index) => {
        if (!side.entryId) return;

        const row = rowFor(side.entryId);
        const earned = result.isTie
          ? POINTS_FOR_TIE
          : result.winningSideIndex === index
            ? POINTS_FOR_WIN
            : 0;

        row.gamesPlayed += 1;
        row.projectedPoints += earned;

        if (!matchup.confirmed) {
          return;
        }

        row.confirmedGames += 1;
        row.points += earned;

        if (result.isTie) row.ties += 1;
        else if (result.winningSideIndex === index) row.wins += 1;
        else row.losses += 1;
      });
    });
  });

  return [...rows.values()].sort(
    (left, right) => right.points - left.points || right.projectedPoints - left.projectedPoints
  );
};
