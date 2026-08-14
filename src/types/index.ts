export interface Player {
  id: string;
  name: string;
  color: string;
  handicap?: number;
}

export interface Score {
  playerId: string;
  hole: number;
  strokes: number;
}

export interface HoleInfo {
  par: number;
  yards?: number;
  handicap?: number;
}

export interface NineHoleSet {
  alias?: string;
  holes: HoleInfo[];
}

// Courses often publish a different stroke index order for each pairing of nines.
export interface StrokeIndexAllocation {
  setIndexes: number[];
  handicapsBySet: number[][];
}

export interface Scorecard {
  id: string;
  name: string;
  sets: NineHoleSet[];
  strokeIndexAllocations?: StrokeIndexAllocation[];
  createdBy?: string;
  isPublic?: boolean;
}

export interface PlayerProfile {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  handicap: number;
  createdBy?: string;
  isPublic?: boolean;
}

// Legacy "match-play" rounds are treated as singles match play.
export type MatchupFormat = BuiltInTournamentMatchupFormat | 'match-play';

export interface MatchupTeam {
  id: string;
  name: string;
  playerIds: string[];
}

export interface MatchupConfig {
  format: MatchupFormat;
  sessionFormatId?: string;
  scoringMode?: SessionScoringMode;
  resultMode?: SessionResultMode;
  teams: MatchupTeam[];
  ownBall?: boolean;
  handicapRule?: {
    type: 'scramble-pair-percentage';
    lowPercentage: number;
    highPercentage: number;
    rounding: 'nearest' | 'up' | 'down';
    prorateByHoles?: boolean;
  };
}

export interface GameState {
  players: Player[];
  scores: Score[];
  currentHole: number;
  totalHoles: number;
  sessionFormatId?: string;
  alias?: string;
  parValues?: number[];
  holeDetails?: HoleInfo[];
  scorecardId?: string;
  scorecardName?: string;
  playedSetLabels?: string[];
  useHandicaps?: boolean;
  matchup?: MatchupConfig;
}

export type TournamentFormat = 'individual' | 'team';

export type PlayerTier = 'A' | 'B';

export type TierAssignmentMode = 'auto' | 'manual';

export interface TournamentEntry {
  id: string;
  name: string;
  playerIds: string[];
  playerTiers?: Record<string, PlayerTier>;
}

export interface Tournament {
  id: string;
  name: string;
  format: TournamentFormat;
  tierMode: TierAssignmentMode;
  entries: TournamentEntry[];
  sessions: TournamentSession[];
  sessionFormats?: TournamentSessionFormat[];
  // Legacy field kept for backward compatibility with older UI code.
  rounds?: TournamentSession[];
  createdBy?: string;
}

export type BuiltInTournamentMatchupFormat =
  | 'singles'
  | 'four-ball'
  | 'foursomes'
  | 'scramble'
  | 'stroke';

// Session format ids can be built-in or custom tournament-defined ids.
export type TournamentMatchupFormat = string;

export type SessionScoringMode = 'stroke' | 'match' | 'skins';

export type SessionResultMode = 'holes' | 'net-total';

export type SessionLineupRule = 'any' | 'same-tier-only';

export interface ScramblePairPercentageHandicapRule {
  type: 'scramble-pair-percentage';
  lowPercentage: number;
  highPercentage: number;
  rounding: 'nearest' | 'up' | 'down';
  prorateByHoles?: boolean;
}

export type SessionHandicapRule = ScramblePairPercentageHandicapRule;

export interface TournamentSessionFormat {
  id: string;
  name: string;
  baseFormat: BuiltInTournamentMatchupFormat;
  scoringMode: SessionScoringMode;
  useHandicaps: boolean;
  hasTeams: boolean;
  ownBall: boolean;
  playersPerSide: number;
  resultMode?: SessionResultMode;
  lineupRule?: SessionLineupRule;
  handicapRule?: SessionHandicapRule;
}

export interface MatchupSide {
  entryId: string;
  playerIds: string[];
  // One combined score per hole for the whole side.
  scores: number[];
}

export interface TournamentMatchup {
  id: string;
  // Only confirmed matches count toward the official leaderboard.
  confirmed?: boolean;
  // Code of the round this match is played in.
  roundId?: string;
  name?: string;
  scorecardName?: string;
  sides: MatchupSide[];
}

export interface TournamentSession {
  id: string;
  name: string;
  format: TournamentMatchupFormat;
  holes: number;
  matchups: TournamentMatchup[];
}

// Backward-compatible alias while we migrate module names and props.
export type TournamentRound = TournamentSession;
