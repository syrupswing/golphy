import type {
  BuiltInTournamentMatchupFormat,
  MatchupSide,
  PlayerProfile,
  SessionScoringMode,
  SessionHandicapRule,
  SessionLineupRule,
  SessionResultMode,
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

export const TEAM_MATCH_PLAY_SCRAMBLE_FORMAT_ID = 'team-match-play-scramble';

const BASE_SCORING_MODE: Record<BuiltInTournamentMatchupFormat, SessionScoringMode> = {
  singles: 'match',
  'four-ball': 'match',
  foursomes: 'match',
  scramble: 'match',
  stroke: 'stroke',
};

const BASE_OWN_BALL: Record<BuiltInTournamentMatchupFormat, boolean> = {
  singles: true,
  'four-ball': true,
  foursomes: false,
  scramble: false,
  stroke: true,
};

const BASE_HAS_TEAMS: Record<BuiltInTournamentMatchupFormat, boolean> = {
  singles: true,
  'four-ball': true,
  foursomes: true,
  scramble: true,
  stroke: false,
};

const BASE_RESULT_MODE: Record<BuiltInTournamentMatchupFormat, SessionResultMode> = {
  singles: 'holes',
  'four-ball': 'holes',
  foursomes: 'holes',
  scramble: 'holes',
  stroke: 'net-total',
};

const normalizePlayersPerSide = (value: unknown, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const parsed = Math.floor(value as number);
  return Math.max(1, Math.min(6, parsed));
};

const normalizeScoringMode = (
  value: unknown,
  fallback: SessionScoringMode
): SessionScoringMode => {
  if (value === 'stroke' || value === 'match' || value === 'skins') {
    return value;
  }

  return fallback;
};

const normalizeResultMode = (
  value: unknown,
  fallback: SessionResultMode
): SessionResultMode => {
  if (value === 'holes' || value === 'net-total') {
    return value;
  }

  return fallback;
};

const normalizeLineupRule = (value: unknown): SessionLineupRule => {
  if (value === 'same-tier-only') {
    return value;
  }

  return 'any';
};

const normalizePercentage = (value: unknown, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const raw = Number(value);
  const normalized = raw > 1 ? raw / 100 : raw;
  return Math.max(0, Math.min(1, normalized));
};

const normalizeHandicapRule = (value: unknown): SessionHandicapRule | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.type !== 'scramble-pair-percentage') {
    return undefined;
  }

  const rounding =
    candidate.rounding === 'up' || candidate.rounding === 'down' || candidate.rounding === 'nearest'
      ? candidate.rounding
      : 'nearest';

  return {
    type: 'scramble-pair-percentage',
    lowPercentage: normalizePercentage(candidate.lowPercentage, 0.35),
    highPercentage: normalizePercentage(candidate.highPercentage, 0.15),
    rounding,
  };
};

export const normalizeSessionFormat = (
  format: Partial<TournamentSessionFormat> & Pick<TournamentSessionFormat, 'id' | 'name' | 'baseFormat'>
): TournamentSessionFormat => {
  const fallbackPlayersPerSide = MATCHUP_FORMAT_PLAYER_COUNTS[format.baseFormat];

  return {
    id: format.id.trim(),
    name: format.name.trim(),
    baseFormat: format.baseFormat,
    scoringMode: normalizeScoringMode(format.scoringMode, BASE_SCORING_MODE[format.baseFormat]),
    useHandicaps:
      typeof format.useHandicaps === 'boolean' ? format.useHandicaps : format.baseFormat !== 'stroke',
    hasTeams: typeof format.hasTeams === 'boolean' ? format.hasTeams : BASE_HAS_TEAMS[format.baseFormat],
    ownBall: typeof format.ownBall === 'boolean' ? format.ownBall : BASE_OWN_BALL[format.baseFormat],
    playersPerSide: normalizePlayersPerSide(format.playersPerSide, fallbackPlayersPerSide),
    resultMode: normalizeResultMode(format.resultMode, BASE_RESULT_MODE[format.baseFormat]),
    lineupRule: normalizeLineupRule(format.lineupRule),
    handicapRule: normalizeHandicapRule(format.handicapRule),
  };
};

export const DEFAULT_TOURNAMENT_SESSION_FORMATS: TournamentSessionFormat[] = (
  Object.keys(MATCHUP_FORMAT_LABELS) as BuiltInTournamentMatchupFormat[]
).map((id) =>
  normalizeSessionFormat({
    id,
    name: MATCHUP_FORMAT_LABELS[id],
    baseFormat: id,
  })
).concat([
  normalizeSessionFormat({
    id: TEAM_MATCH_PLAY_SCRAMBLE_FORMAT_ID,
    name: 'Team match play scramble',
    baseFormat: 'scramble',
    scoringMode: 'match',
    useHandicaps: true,
    hasTeams: true,
    ownBall: false,
    playersPerSide: 2,
    resultMode: 'holes',
    lineupRule: 'any',
    handicapRule: {
      type: 'scramble-pair-percentage',
      lowPercentage: 0.35,
      highPercentage: 0.15,
      rounding: 'nearest',
    },
  }),
]);

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
    .map((format) => normalizeSessionFormat(format));

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
  return Math.max(1, resolved.playersPerSide);
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
  netTotals?: [number, number];
  handicapAllowances?: [number, number];
  sideHandicaps?: [number | null, number | null];
}

interface MatchupResolutionContext {
  playerProfiles?: PlayerProfile[];
  holesInMatch?: number;
}

const getHoleScore = (side: MatchupSide | undefined, hole: number): number => {
  const value = side?.scores?.[hole];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
};

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
  const normalizedHoles = Number.isFinite(holes) && holes > 0 ? holes : HOLES_PER_MATCH;
  const factor = normalizedHoles / 18;
  return baseHandicap * factor;
};

const getPlayerHandicap = (
  playerId: string,
  profiles: PlayerProfile[]
): number | null => {
  const profile = profiles.find((item) => item.id === playerId);
  if (!profile || !Number.isFinite(profile.handicap)) {
    return null;
  }

  return profile.handicap;
};

const calculateSideHandicap = (
  side: MatchupSide,
  rule: SessionHandicapRule,
  context: MatchupResolutionContext
): number | null => {
  if (rule.type !== 'scramble-pair-percentage') {
    return null;
  }

  const profiles = context.playerProfiles ?? [];
  if (!profiles.length || side.playerIds.length < 2) {
    return null;
  }

  const handicaps = side.playerIds
    .map((playerId) => getPlayerHandicap(playerId, profiles))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (handicaps.length < 2) {
    return null;
  }

  const [low, high] = handicaps;
  const baseTeamHandicap = low * rule.lowPercentage + high * rule.highPercentage;
  const proratedTeamHandicap = prorateHandicapByHoles(baseTeamHandicap, context.holesInMatch ?? HOLES_PER_MATCH);
  return applyRoundRule(proratedTeamHandicap, rule.rounding);
};

const calculateHandicapAllowances = (
  matchup: TournamentMatchup,
  format: TournamentSessionFormat,
  context: MatchupResolutionContext
): { allowances: [number, number]; sideHandicaps: [number | null, number | null] } => {
  if (!format.useHandicaps || !format.handicapRule) {
    return { allowances: [0, 0], sideHandicaps: [null, null] };
  }

  const [sideA, sideB] = matchup.sides;
  const handicapA = calculateSideHandicap(sideA, format.handicapRule, context);
  const handicapB = calculateSideHandicap(sideB, format.handicapRule, context);

  if (handicapA === null || handicapB === null) {
    return { allowances: [0, 0], sideHandicaps: [handicapA, handicapB] };
  }

  if (handicapA === handicapB) {
    return { allowances: [0, 0], sideHandicaps: [handicapA, handicapB] };
  }

  if (handicapA > handicapB) {
    return {
      allowances: [handicapA - handicapB, 0],
      sideHandicaps: [handicapA, handicapB],
    };
  }

  return {
    allowances: [0, handicapB - handicapA],
    sideHandicaps: [handicapA, handicapB],
  };
};

export const resolveMatchup = (
  matchup: TournamentMatchup,
  formatId: TournamentMatchupFormat,
  customFormats: TournamentSessionFormat[] = [],
  context: MatchupResolutionContext = {}
): MatchupResult => {
  const format = getSessionFormatDefinition(formatId, customFormats);
  const [sideA, sideB] = matchup.sides;
  const handicapMeta = calculateHandicapAllowances(matchup, format, context);
  const useHandicapByHole = format.resultMode === 'holes';
  const remainingAllowances: [number, number] = [
    handicapMeta.allowances[0],
    handicapMeta.allowances[1],
  ];
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

    const adjustedA = useHandicapByHole && remainingAllowances[0] > 0 ? scoreA - 1 : scoreA;
    const adjustedB = useHandicapByHole && remainingAllowances[1] > 0 ? scoreB - 1 : scoreB;

    if (useHandicapByHole && remainingAllowances[0] > 0) {
      remainingAllowances[0] -= 1;
    }

    if (useHandicapByHole && remainingAllowances[1] > 0) {
      remainingAllowances[1] -= 1;
    }

    if (adjustedA < adjustedB) holesWon[0] += 1;
    else if (adjustedB < adjustedA) holesWon[1] += 1;
  }

  const isComplete = holesPlayed === HOLES_PER_MATCH;
  const netTotals: [number, number] = [
    totals[0] - handicapMeta.allowances[0],
    totals[1] - handicapMeta.allowances[1],
  ];

  if (holesPlayed === 0) {
    return {
      isComplete: false,
      holesPlayed,
      holesWon,
      totals,
      winningSideIndex: null,
      isTie: false,
      summary: 'No scores yet',
      netTotals,
      handicapAllowances: handicapMeta.allowances,
      sideHandicaps: handicapMeta.sideHandicaps,
    };
  }

  const useNetTotals = format.resultMode === 'net-total' || isStrokeFormat(format.baseFormat);

  const [metricA, metricB] = useNetTotals
    ? [netTotals[1], netTotals[0]] // Lower net total wins, so invert for a shared comparison.
    : [holesWon[0], holesWon[1]];

  const isTie = metricA === metricB;
  const winningSideIndex = isTie ? null : metricA > metricB ? 0 : 1;

  const summary = useNetTotals
    ? handicapMeta.allowances[0] || handicapMeta.allowances[1]
      ? `${totals[0]} (${netTotals[0]}) v ${totals[1]} (${netTotals[1]})`
      : `${totals[0]} v ${totals[1]}`
    : isTie
      ? `All square through ${holesPlayed}`
      : `${Math.abs(holesWon[0] - holesWon[1])} up through ${holesPlayed}`;

  return {
    isComplete,
    holesPlayed,
    holesWon,
    totals,
    winningSideIndex,
    isTie,
    summary,
    netTotals,
    handicapAllowances: handicapMeta.allowances,
    sideHandicaps: handicapMeta.sideHandicaps,
  };
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

export const calculateStandings = (
  tournament: Tournament,
  options: { playerProfiles?: PlayerProfile[] } = {}
): StandingRow[] => {
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
      const result = resolveMatchup(
        matchup,
        session.format,
        tournament.sessionFormats ?? [],
        { playerProfiles: options.playerProfiles, holesInMatch: HOLES_PER_MATCH }
      );
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
