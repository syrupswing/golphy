import type {
  BuiltInTournamentMatchupFormat,
  HoleInfo,
  MatchupSide,
  PlayerProfile,
  Score,
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
import {
  allocateStrokesByStrokeIndex,
  applyRoundRule as handicapRounding,
  prorateHandicapByHoles,
} from './handicaps';

export const HOLES_PER_MATCH = 9;
export const HOLES_PER_GAME = HOLES_PER_MATCH;

// Sessions are built from sets of nine, so a match covers one, two or three of them.
export const SESSION_HOLE_OPTIONS = [9, 18, 27] as const;

export const normalizeSessionHoleCount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return HOLES_PER_MATCH;
  }

  const nearestSet = Math.round(parsed / HOLES_PER_MATCH) * HOLES_PER_MATCH;
  return Math.max(HOLES_PER_MATCH, Math.min(27, nearestSet));
};

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
export const TEAM_STROKE_SCRAMBLE_FORMAT_ID = 'team-stroke-scramble';
export const TEAM_SCRAMBLE_FIELD_FORMAT_ID = 'team-scramble-field';

// Placing points for a field format: 1st, 2nd, 3rd, then nothing.
export const FIELD_PLACEMENT_POINTS = [4, 2, 1];

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
    prorateByHoles: candidate.prorateByHoles !== false,
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
    name: 'Team scramble match play',
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
      prorateByHoles: true,
    },
  }),
  normalizeSessionFormat({
    id: TEAM_STROKE_SCRAMBLE_FORMAT_ID,
    name: 'Team scramble stroke play',
    baseFormat: 'scramble',
    scoringMode: 'stroke',
    useHandicaps: true,
    hasTeams: true,
    ownBall: false,
    playersPerSide: 2,
    resultMode: 'net-total',
    lineupRule: 'any',
    handicapRule: {
      type: 'scramble-pair-percentage',
      lowPercentage: 0.35,
      highPercentage: 0.15,
      rounding: 'nearest',
      prorateByHoles: false,
    },
  }),
  normalizeSessionFormat({
    id: TEAM_SCRAMBLE_FIELD_FORMAT_ID,
    name: 'Team scramble, every team for itself',
    baseFormat: 'scramble',
    scoringMode: 'stroke',
    useHandicaps: false,
    hasTeams: true,
    ownBall: false,
    playersPerSide: 4,
    resultMode: 'net-total',
    lineupRule: 'any',
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
  holesWon: number[];
  totals: number[];
  winningSideIndex: number | null;
  isTie: boolean;
  summary: string;
  // Every side sharing the leading score, so a tied stroke play field can be marked.
  winningSideIndexes: number[];
  netTotals?: number[];
  handicapAllowances?: number[];
  sideHandicaps?: (number | null)[];
}

interface MatchupResolutionContext {
  playerProfiles?: PlayerProfile[];
  holesInMatch?: number;
  // Set when side scores already have handicap strokes applied.
  scoresAreNet?: boolean;
}

const getHoleScore = (side: MatchupSide | undefined, hole: number): number => {
  const value = side?.scores?.[hole];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
};

const applyRoundRule = handicapRounding;

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
  const effectiveHandicap = rule.prorateByHoles !== false
    ? prorateHandicapByHoles(baseTeamHandicap, context.holesInMatch ?? HOLES_PER_MATCH)
    : baseTeamHandicap;
  return applyRoundRule(effectiveHandicap, rule.rounding);
};

const calculateHandicapAllowances = (
  matchup: TournamentMatchup,
  format: TournamentSessionFormat,
  context: MatchupResolutionContext
): { allowances: number[]; sideHandicaps: (number | null)[] } => {
  const rule = format.handicapRule;
  const noAllowances = matchup.sides.map(() => 0);

  if (context.scoresAreNet || !format.useHandicaps || !rule) {
    return { allowances: noAllowances, sideHandicaps: matchup.sides.map(() => null) };
  }

  const sideHandicaps = matchup.sides.map((side) => calculateSideHandicap(side, rule, context));
  const resolved = sideHandicaps.filter((value): value is number => value !== null);

  if (resolved.length !== sideHandicaps.length || resolved.length < 2) {
    return { allowances: noAllowances, sideHandicaps };
  }

  // Strokes are played off the lowest handicap in the match.
  const lowest = Math.min(...resolved);
  return {
    allowances: resolved.map((value) => value - lowest),
    sideHandicaps,
  };
};

export const resolveMatchup = (
  matchup: TournamentMatchup,
  formatId: TournamentMatchupFormat,
  customFormats: TournamentSessionFormat[] = [],
  context: MatchupResolutionContext = {}
): MatchupResult => {
  const format = getSessionFormatDefinition(formatId, customFormats);
  const sides = matchup.sides;
  const holesInMatch = normalizeSessionHoleCount(context.holesInMatch);
  const handicapMeta = calculateHandicapAllowances(matchup, format, context);
  const useHandicapByHole = format.resultMode === 'holes';
  const remainingAllowances = [...handicapMeta.allowances];
  const holesWon = sides.map(() => 0);
  const totals = sides.map(() => 0);
  let holesPlayed = 0;

  for (let hole = 0; hole < holesInMatch; hole += 1) {
    const holeScores = sides.map((side) => getHoleScore(side, hole));

    // A hole only counts once every side in the match has posted a score.
    if (!holeScores.length || holeScores.some((score) => !score)) {
      continue;
    }

    holesPlayed += 1;
    holeScores.forEach((score, sideIndex) => {
      totals[sideIndex] += score;
    });

    const adjusted = holeScores.map((score, sideIndex) => {
      if (!useHandicapByHole || remainingAllowances[sideIndex] <= 0) {
        return score;
      }

      remainingAllowances[sideIndex] -= 1;
      return score - 1;
    });

    const bestHoleScore = Math.min(...adjusted);
    if (adjusted.filter((score) => score === bestHoleScore).length === 1) {
      holesWon[adjusted.indexOf(bestHoleScore)] += 1;
    }
  }

  const isComplete = holesPlayed === holesInMatch;
  const netTotals = totals.map((total, sideIndex) => total - handicapMeta.allowances[sideIndex]);

  if (holesPlayed === 0) {
    return {
      isComplete: false,
      holesPlayed,
      holesWon,
      totals,
      winningSideIndex: null,
      isTie: false,
      summary: 'No scores yet',
      winningSideIndexes: [],
      netTotals,
      handicapAllowances: handicapMeta.allowances,
      sideHandicaps: handicapMeta.sideHandicaps,
    };
  }

  const useNetTotals = format.resultMode === 'net-total' || isStrokeFormat(format.baseFormat);

  // Lower net total wins, so invert it for a shared "higher is better" comparison.
  const metrics = useNetTotals ? netTotals.map((total) => -total) : holesWon;
  const bestMetric = Math.max(...metrics);
  const winningSideIndexes = metrics.reduce<number[]>((leaders, metric, sideIndex) => {
    if (metric === bestMetric) leaders.push(sideIndex);
    return leaders;
  }, []);

  const isTie = winningSideIndexes.length !== 1;
  const winningSideIndex = isTie ? null : winningSideIndexes[0];

  const holeLead = sides.length === 2 ? Math.abs(holesWon[0] - holesWon[1]) : 0;
  const holesRemaining = holesInMatch - holesPlayed;
  const hasAllowances = handicapMeta.allowances.some((allowance) => allowance > 0);

  const matchPlaySummary =
    sides.length !== 2
      ? holesWon.join(' v ')
      : isTie
        ? `All square thru ${holesPlayed}`
        : holeLead > holesRemaining && holesRemaining > 0
          ? `Wins ${holeLead - holesRemaining} & ${holesRemaining}`
          : isComplete
            ? `Wins ${holeLead} up`
            : `${holeLead} up thru ${holesPlayed}`;

  const summary = useNetTotals
    ? totals
        .map((total, sideIndex) =>
          hasAllowances ? `${total} (${netTotals[sideIndex]})` : `${total}`
        )
        .join(' v ')
    : matchPlaySummary;

  return {
    isComplete,
    holesPlayed,
    holesWon,
    totals,
    winningSideIndex,
    isTie,
    summary,
    winningSideIndexes,
    netTotals,
    handicapAllowances: handicapMeta.allowances,
    sideHandicaps: handicapMeta.sideHandicaps,
  };
};

export const isFieldPlacementDefinition = (format: TournamentSessionFormat): boolean => {
  if (format.id === TEAM_SCRAMBLE_FIELD_FORMAT_ID) {
    return true;
  }

  // Any team format scored as stroke play without a head-to-head handicap rule plays the field.
  return format.hasTeams && format.scoringMode === 'stroke' && !format.handicapRule;
};

export const isFieldPlacementFormat = (
  formatId: TournamentMatchupFormat,
  customFormats: TournamentSessionFormat[] = []
): boolean => isFieldPlacementDefinition(getSessionFormatDefinition(formatId, customFormats));

// Places are scored 4/2/1/0; sides sharing a place split the points for those places.
const awardPlacementPoints = (totals: (number | null)[]): number[] => {
  const scored = totals
    .map((total, sideIndex) => ({ total, sideIndex }))
    .filter((entry): entry is { total: number; sideIndex: number } => entry.total !== null);

  const points = totals.map(() => 0);
  if (scored.length === 0) {
    return points;
  }

  const ordered = [...scored].sort((left, right) => left.total - right.total);
  let place = 0;

  while (place < ordered.length) {
    const tiedTotal = ordered[place].total;
    const tied = ordered.filter((entry) => entry.total === tiedTotal);
    const sharedPoints =
      tied.reduce((sum, _entry, offset) => sum + (FIELD_PLACEMENT_POINTS[place + offset] ?? 0), 0) /
      tied.length;

    tied.forEach((entry) => {
      points[entry.sideIndex] = sharedPoints;
    });

    place += tied.length;
  }

  return points;
};

const getSegmentTotals = (
  matchup: TournamentMatchup,
  startHole: number,
  endHole: number
): (number | null)[] =>
  matchup.sides.map((side) => {
    let total = 0;

    for (let hole = startHole; hole <= endHole; hole += 1) {
      const score = getHoleScore(side, hole - 1);
      // An unfinished segment cannot be placed.
      if (!score) {
        return null;
      }

      total += score;
    }

    return total;
  });

// Every team plays the field: points are awarded for the front nine, the back nine and the total.
export const resolveFieldPlacementPoints = (
  matchup: TournamentMatchup,
  holesInMatch?: number
): number[] => {
  const holes = normalizeSessionHoleCount(holesInMatch);
  const segments: Array<[number, number]> = [];

  for (let start = 1; start + HOLES_PER_MATCH - 1 <= holes; start += HOLES_PER_MATCH) {
    segments.push([start, start + HOLES_PER_MATCH - 1]);
  }

  // A single nine is already the overall result, so it is only scored once.
  if (segments.length > 1) {
    segments.push([1, holes]);
  }

  return segments.reduce<number[]>(
    (totals, [start, end]) => {
      const points = awardPlacementPoints(getSegmentTotals(matchup, start, end));
      return totals.map((value, sideIndex) => value + points[sideIndex]);
    },
    matchup.sides.map(() => 0)
  );
};

// Kept here rather than in the Firestore module so components can build rounds without a circular import.
const createLocalId = (): string => {  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createEmptyMatchup = (holes: number = HOLES_PER_MATCH): TournamentMatchup => {
  const holeCount = normalizeSessionHoleCount(holes);

  return {
    id: createLocalId(),
    confirmed: false,
    sides: [
      { entryId: '', playerIds: [], scores: Array(holeCount).fill(0) },
      { entryId: '', playerIds: [], scores: Array(holeCount).fill(0) },
    ],
  };
};

export const createEmptySession = (existingCount: number): TournamentSession => ({
  id: createLocalId(),
  name: `Session ${existingCount + 1}`,
  format: 'singles',
  holes: HOLES_PER_MATCH,
  matchups: [],
});

export const createSessionWithConfig = (
  existingCount: number,
  name: string,
  format: TournamentMatchupFormat,
  holes: number = HOLES_PER_MATCH
): TournamentSession => ({
  id: createLocalId(),
  name: name.trim() || `Session ${existingCount + 1}`,
  format,
  holes: normalizeSessionHoleCount(holes),
  matchups: [],
});

// A side plays one result per hole: the best ball for own-ball formats, the shared ball otherwise.
export const buildSideScoresFromRound = (
  playerIds: string[],
  scores: Score[],
  holes: number
): number[] => {
  const holeCount = normalizeSessionHoleCount(holes);

  return Array.from({ length: holeCount }, (_, index) => {
    const strokes = scores
      .filter((score) => score.hole === index + 1 && playerIds.includes(score.playerId))
      .map((score) => score.strokes)
      .filter((value) => Number.isFinite(value) && value > 0);

    return strokes.length ? Math.min(...strokes) : 0;
  });
};

export interface MatchRoundScores {
  sideScores: number[][];
  sideHandicaps: (number | null)[];
  allowances: number[];
}

const resolveSideHandicap = (
  playerIds: string[],
  format: TournamentSessionFormat,
  handicapOf: (playerId: string) => number | null,
  holes: number
): number | null => {
  const rule = format.handicapRule;

  if (rule?.type === 'scramble-pair-percentage') {
    const handicaps = playerIds
      .map(handicapOf)
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right);

    if (handicaps.length < 2) {
      return null;
    }

    const [low, high] = handicaps;
    const raw = low * rule.lowPercentage + high * rule.highPercentage;
    const effective = rule.prorateByHoles !== false ? prorateHandicapByHoles(raw, holes) : raw;
    return handicapRounding(effective, rule.rounding);
  }

  // Head-to-head singles play off the difference in playing handicaps.
  if (playerIds.length === 1) {
    const handicap = handicapOf(playerIds[0]);
    return handicap === null ? null : Math.round(prorateHandicapByHoles(handicap, holes));
  }

  return null;
};

// Mirrors the scorecard: strokes come off the hardest holes, and only for the
// formats the scorecard itself strokes (head-to-head singles and paired scrambles).
export const buildMatchRoundScores = (
  matchup: TournamentMatchup,
  format: TournamentSessionFormat,
  holes: number,
  roundScores: Score[],
  holeDetails: HoleInfo[] | undefined,
  handicapOf: (playerId: string) => number | null
): MatchRoundScores => {
  const holeCount = normalizeSessionHoleCount(holes);
  const sides = matchup.sides;
  const grossScores = sides.map((side) =>
    buildSideScoresFromRound(side?.playerIds ?? [], roundScores, holeCount)
  );

  const sideHandicaps: (number | null)[] = format.useHandicaps
    ? sides.map((side) => resolveSideHandicap(side?.playerIds ?? [], format, handicapOf, holeCount))
    : sides.map(() => null);

  const allowances = sides.map(() => 0);
  const resolvedHandicaps = sideHandicaps.filter((value): value is number => value !== null);

  if (resolvedHandicaps.length === sides.length && sides.length > 1) {
    const lowest = Math.min(...resolvedHandicaps);
    resolvedHandicaps.forEach((handicap, sideIndex) => {
      allowances[sideIndex] = handicap - lowest;
    });
  }

  const byHole = allowances.map((allowance) =>
    allocateStrokesByStrokeIndex(allowance, holeDetails, holeCount)
  );

  return {
    sideScores: grossScores.map((scores, sideIndex) =>
      scores.map((gross, holeIndex) =>
        gross > 0 ? gross - (byHole[sideIndex][holeIndex + 1] ?? 0) : 0
      )
    ),
    sideHandicaps,
    allowances,
  };
};

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
  options: { playerProfiles?: PlayerProfile[]; scoresAreNet?: boolean } = {}
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
        { playerProfiles: options.playerProfiles, holesInMatch: session.holes, scoresAreNet: options.scoresAreNet }
      );
      if (result.holesPlayed === 0) {
        return;
      }

      const placementPoints = isFieldPlacementFormat(session.format, tournament.sessionFormats ?? [])
        ? resolveFieldPlacementPoints(matchup, session.holes)
        : null;

      matchup.sides.forEach((side, index) => {
        if (!side.entryId) return;

        const row = rowFor(side.entryId);
        // A stroke play field can have several sides sharing the leading score.
        const isLeader = result.winningSideIndexes.includes(index);
        const earned = placementPoints
          ? placementPoints[index]
          : isLeader
            ? result.isTie
              ? POINTS_FOR_TIE
              : POINTS_FOR_WIN
            : 0;

        row.matchesPlayed += 1;
        row.projectedPoints += earned;

        if (!matchup.confirmed) {
          return;
        }

        row.confirmedMatches += 1;
        row.points += earned;

        if (isLeader && result.isTie) row.ties += 1;
        else if (isLeader) row.wins += 1;
        else row.losses += 1;
      });
    });
  });

  return [...rows.values()].sort(
    (left, right) => right.points - left.points || right.projectedPoints - left.projectedPoints
  );
};
