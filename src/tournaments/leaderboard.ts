import type { GameState, Tournament, TournamentMatchup, TournamentSession } from '../types/index.ts';
import type { StandingRow } from './scoring';

export type LeaderboardScope =
  | { type: 'tournament' }
  | { type: 'session'; sessionId: string }
  | { type: 'match'; sessionId: string; matchupId: string };

export interface LeaderboardRow {
  id: string;
  name: string;
  detail?: string;
  // Strokes to par carried in from earlier sessions.
  prior: number | null;
  // Cumulative strokes to par through each hole.
  toPar: (number | null)[];
  total: number | null;
  holesPlayed: number;
}

export interface LeaderboardBoard {
  kind: 'holes';
  title: string;
  subtitle?: string;
  pars: number[];
  rows: LeaderboardRow[];
}

export interface StandingsBoardRow {
  id: string;
  name: string;
  values: Array<number | string>;
}

export interface StandingsBoard {
  kind: 'standings';
  title: string;
  subtitle?: string;
  columns: string[];
  rows: StandingsBoardRow[];
}

export type LeaderboardView = LeaderboardBoard | StandingsBoard;

const DEFAULT_PAR = 4;

export const scopeKey = (scope: LeaderboardScope): string =>
  scope.type === 'tournament'
    ? 'tournament'
    : scope.type === 'session'
      ? `session:${scope.sessionId}`
      : `match:${scope.sessionId}:${scope.matchupId}`;

export const areScopesEqual = (left: LeaderboardScope | null, right: LeaderboardScope | null): boolean =>
  Boolean(left) && Boolean(right) && scopeKey(left as LeaderboardScope) === scopeKey(right as LeaderboardScope);

const getPars = (roundState: GameState | undefined, holes: number): number[] => {
  const fromRound = roundState?.parValues?.length
    ? roundState.parValues
    : roundState?.holeDetails?.map((hole) => hole.par);

  return Array.from({ length: holes }, (_, index) => {
    const par = fromRound?.[index];
    return Number.isFinite(par) && (par as number) > 0 ? (par as number) : DEFAULT_PAR;
  });
};

const buildSideRow = (
  matchup: TournamentMatchup,
  sideIndex: number,
  pars: number[],
  holes: number,
  name: string,
  detail: string | undefined
): LeaderboardRow => {
  const side = matchup.sides[sideIndex];
  const toPar: (number | null)[] = [];
  let running = 0;
  let holesPlayed = 0;

  for (let hole = 0; hole < holes; hole += 1) {
    const strokes = side?.scores?.[hole];

    if (!Number.isFinite(strokes) || (strokes as number) <= 0) {
      toPar.push(null);
      continue;
    }

    running += (strokes as number) - (pars[hole] ?? DEFAULT_PAR);
    holesPlayed += 1;
    toPar.push(running);
  }

  return {
    id: `${matchup.id}-${side?.entryId || sideIndex}`,
    name,
    detail,
    prior: null,
    toPar,
    total: holesPlayed > 0 ? running : null,
    holesPlayed,
  };
};

// Strokes to par an entry carries in from the sessions played before the one on the board.
const buildPriorToPar = (
  priorSessions: TournamentSession[],
  roundStates: Record<string, GameState>
): Record<string, number> => {
  const prior: Record<string, number> = {};

  priorSessions.forEach((session) => {
    session.matchups.forEach((matchup) => {
      const pars = getPars(matchup.roundId ? roundStates[matchup.roundId] : undefined, session.holes);

      matchup.sides.forEach((side) => {
        if (!side.entryId) return;

        let toPar = 0;
        let played = false;

        for (let hole = 0; hole < session.holes; hole += 1) {
          const strokes = side.scores?.[hole];
          if (!Number.isFinite(strokes) || (strokes as number) <= 0) continue;

          toPar += (strokes as number) - (pars[hole] ?? DEFAULT_PAR);
          played = true;
        }

        if (played) {
          prior[side.entryId] = (prior[side.entryId] ?? 0) + toPar;
        }
      });
    });
  });

  return prior;
};

const hasAnyScore = (session: TournamentSession): boolean =>
  session.matchups.some((matchup) =>
    matchup.sides.some((side) => side.scores?.some((score) => Number.isFinite(score) && score > 0))
  );

const sortRows = (rows: LeaderboardRow[]): LeaderboardRow[] =>
  [...rows].sort((left, right) => {
    const leftTotal = left.total === null ? null : left.total + (left.prior ?? 0);
    const rightTotal = right.total === null ? null : right.total + (right.prior ?? 0);

    if (leftTotal === null && rightTotal === null) return left.name.localeCompare(right.name);
    if (leftTotal === null) return 1;
    if (rightTotal === null) return -1;
    if (leftTotal !== rightTotal) return leftTotal - rightTotal;

    return right.holesPlayed - left.holesPlayed || left.name.localeCompare(right.name);
  });

export const buildStandingsBoard = (
  tournament: Tournament,
  standings: StandingRow[],
  getEntryName: (entryId: string) => string
): StandingsBoard => ({
  kind: 'standings',
  title: tournament.name,
  subtitle: tournament.format === 'team' ? 'Team standings' : 'Player standings',
  columns: ['Pts', 'Proj', 'Played', 'W', 'H', 'L'],
  rows: standings.map((row) => ({
    id: row.entryId,
    name: getEntryName(row.entryId),
    values: [
      row.points,
      row.projectedPoints > row.points ? row.projectedPoints : '—',
      `${row.confirmedMatches}/${row.matchesPlayed}`,
      row.wins,
      row.ties,
      row.losses,
    ],
  })),
});

export const buildLeaderboard = (
  tournament: Tournament,
  sessions: TournamentSession[],
  roundStates: Record<string, GameState>,
  scope: LeaderboardScope,
  getEntryName: (entryId: string) => string
): LeaderboardBoard | null => {
  if (sessions.length === 0) {
    return null;
  }

  let boardSession: TournamentSession | undefined;
  let matchups: TournamentMatchup[] = [];
  let title = tournament.name;
  let subtitle: string | undefined;

  if (scope.type === 'match') {
    boardSession = sessions.find((session) => session.id === scope.sessionId);
    const matchup = boardSession?.matchups.find((item) => item.id === scope.matchupId);
    if (!boardSession || !matchup) return null;

    matchups = [matchup];
    title = matchup.name?.trim() || 'Match';
    subtitle = `${boardSession.name} · ${matchup.scorecardName ?? ''}`.trim().replace(/ ·\s*$/, '');
  } else if (scope.type === 'session') {
    boardSession = sessions.find((session) => session.id === scope.sessionId);
    if (!boardSession) return null;

    matchups = boardSession.matchups;
    title = boardSession.name;
    subtitle = tournament.name;
  } else {
    // The tournament board shows the session in play, with earlier sessions carried as prior scores.
    boardSession = [...sessions].reverse().find(hasAnyScore) ?? sessions[sessions.length - 1];
    matchups = boardSession.matchups;
    title = tournament.name;
    subtitle = boardSession.name;
  }

  const holes = boardSession.holes;
  const parSource = matchups.find((matchup) => matchup.roundId && roundStates[matchup.roundId]);
  const pars = getPars(parSource?.roundId ? roundStates[parSource.roundId] : undefined, holes);

  const boardSessionIndex = sessions.findIndex((session) => session.id === boardSession?.id);
  const priorToPar =
    scope.type === 'match' || scope.type === 'session' || boardSessionIndex > 0
      ? buildPriorToPar(sessions.slice(0, Math.max(0, boardSessionIndex)), roundStates)
      : {};

  const rows = matchups.flatMap((matchup) => {
    const matchupPars = getPars(matchup.roundId ? roundStates[matchup.roundId] : undefined, holes);

    return matchup.sides.map((side, sideIndex) => {
      const row = buildSideRow(
        matchup,
        sideIndex,
        matchupPars,
        holes,
        getEntryName(side.entryId),
        matchups.length > 1 ? matchup.name?.trim() || undefined : undefined
      );

      return { ...row, prior: priorToPar[side.entryId] ?? null };
    });
  });

  return {
    kind: 'holes',
    title,
    subtitle,
    pars,
    rows: sortRows(rows),
  };
};
