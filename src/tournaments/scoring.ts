import type {
  BuiltInTournamentMatchupFormat,
  MatchupSide,
  Tournament,
  TournamentMatchup,
  TournamentMatchupFormat,
  TournamentSessionFormat,
  TournamentSession,
} from '../types/index.ts';

export const HOLES_PER_MATCH = 9;
export const HOLES_PER_GAME = HOLES_PER_MATCH;

// A won nine-hole match is worth two points; a halved match splits them.
export const POINTS_FOR_WIN = 2;
export const POINTS_FOR_TIE = 1;

export const MATCHUP_FORMAT_LABELS: Record<BuiltInTournamentMatchupFormat, string> = {
  singles: 'Singles match play',
  'four-ball': 'Four-ball (best ball)',
  foursomes: 'Foursomes (alternate shot)',
  scramble: 'Scramble',
  stroke: 'Stroke play',
};

export const MATCHUP_FORMAT_PLAYER_COUNTS: Record<BuiltInTournamentMatchupFormat, number> = {
  singles: 1,
  'four-ball': 2,
  foursomes: 2,
  scramble: 2,
  stroke: 1,
};

export const DEFAULT_TOURNAMENT_SESSION_FORMATS: TournamentSessionFormat[] = (
  Object.keys(MATCHUP_FORMAT_LABELS) as BuiltInTournamentMatchupFormat[]
).map((id) => ({
  id,
  name: MATCHUP_FORMAT_LABELS[id],
  baseFormat: id,
}));

const normalizeFormatName = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

export const getTournamentSessionFormats = (
  customFormats: TournamentSessionFormat[] = []
): TournamentSessionFormat[] => {
  const defaults = DEFAULT_TOURNAMENT_SESSION_FORMATS;
  const seenIds = new Set(defaults.map((format) => format.id));
  const seenNames = new Set(defaults.map((format) => normalizeFormatName(format.name)));

  const sanitizedCustom = customFormats
    .filter((format) => Boolean(format.id?.trim()) && Boolean(format.name?.trim()))
    .filter((format) => Boolean(MATCHUP_FORMAT_LABELS[format.baseFormat]))
    .filter((format) => {
      const id = format.id.trim();
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    })
    .filter((format) => {
      const nameKey = normalizeFormatName(format.name);
      if (seenNames.has(nameKey)) return false;
      seenNames.add(nameKey);
      return true;
    })
    .map((format) => ({
      id: format.id.trim(),
      name: format.name.trim(),
      baseFormat: format.baseFormat,
    }));

  return [...defaults, ...sanitizedCustom];
};

export const getSessionFormatDefinition = (
  formatId: TournamentMatchupFormat,
  customFormats: TournamentSessionFormat[] = []
): TournamentSessionFormat => {
  const allFormats = getTournamentSessionFormats(customFormats);
  return allFormats.find((format) => format.id === formatId) ?? allFormats[0];
};

export const getSessionFormatLabel = (
  formatId: TournamentMatchupFormat,
  customFormats: TournamentSessionFormat[] = []
): string => getSessionFormatDefinition(formatId, customFormats).name;

export const getSessionFormatPlayerCount = (
  formatId: TournamentMatchupFormat,
  customFormats: TournamentSessionFormat[] = []
): number => {
  const resolved = getSessionFormatDefinition(formatId, customFormats);
  return MATCHUP_FORMAT_PLAYER_COUNTS[resolved.baseFormat];
};

// Every format except stroke play is decided hole by hole.
const isStrokeFormat = (baseFormat: BuiltInTournamentMatchupFormat): boolean => baseFormat === 'stroke';

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

export const resolveMatchup = (
  matchup: TournamentMatchup,
  formatId: TournamentMatchupFormat,
  customFormats: TournamentSessionFormat[] = []
): MatchupResult => {
  const format = getSessionFormatDefinition(formatId, customFormats);
  const [sideA, sideB] = matchup.sides;
  const holesWon: [number, number] = [0, 0];
  const totals: [number, number] = [0, 0];
  let holesPlayed = 0;

  for (let hole = 0; hole < HOLES_PER_MATCH; hole += 1) {
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

  const isComplete = holesPlayed === HOLES_PER_MATCH;

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

  const [metricA, metricB] = isStrokeFormat(format.baseFormat)
    ? [totals[1], totals[0]] // Lower total wins, so invert for a shared comparison.
    : [holesWon[0], holesWon[1]];

  const isTie = metricA === metricB;
  const winningSideIndex = isTie ? null : metricA > metricB ? 0 : 1;

  const summary = isStrokeFormat(format.baseFormat)
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

export const createEmptyMatchup = (): TournamentMatchup => ({
  id: createLocalId(),
  confirmed: false,
  sides: [
    { entryId: '', playerIds: [], scores: Array(HOLES_PER_MATCH).fill(0) },
    { entryId: '', playerIds: [], scores: Array(HOLES_PER_MATCH).fill(0) },
  ],
});

export const createEmptySession = (existingCount: number): TournamentSession => ({
  id: createLocalId(),
  name: `Session ${existingCount + 1}`,
  format: 'singles',
  matchups: [],
});

export const createSessionWithConfig = (
  existingCount: number,
  name: string,
  format: TournamentMatchupFormat
): TournamentSession => ({
  id: createLocalId(),
  name: name.trim() || `Session ${existingCount + 1}`,
  format,
  matchups: [],
});

// Backward-compatible alias while callers migrate terminology.
export const createEmptyRound = createEmptySession;

export interface StandingRow {
  entryId: string;
  points: number;
  projectedPoints: number;
  matchesPlayed: number;
  confirmedMatches: number;
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
      matchesPlayed: 0,
      confirmedMatches: 0,
      wins: 0,
      ties: 0,
      losses: 0,
    };
    rows.set(entryId, created);
    return created;
  };

  tournament.entries.forEach((entry) => rowFor(entry.id));

  const sessions = tournament.sessions ?? tournament.rounds ?? [];

  sessions.forEach((session) => {
    session.matchups.forEach((matchup) => {
      const result = resolveMatchup(matchup, session.format, tournament.sessionFormats ?? []);
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

        row.matchesPlayed += 1;
        row.projectedPoints += earned;

        if (!matchup.confirmed) {
          return;
        }

        row.confirmedMatches += 1;
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
