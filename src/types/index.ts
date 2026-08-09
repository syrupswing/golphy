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

export type MatchupFormat = 'stroke' | 'match-play';

export interface MatchupTeam {
  id: string;
  name: string;
  playerIds: string[];
}

export interface MatchupConfig {
  format: MatchupFormat;
  teams: MatchupTeam[];
}

export interface GameState {
  players: Player[];
  scores: Score[];
  currentHole: number;
  totalHoles: number;
  alias?: string;
  parValues?: number[];
  holeDetails?: HoleInfo[];
  scorecardId?: string;
  scorecardName?: string;
  playedSetLabels?: string[];
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
  rounds: TournamentRound[];
  createdBy?: string;
}

export type TournamentMatchupFormat =
  | 'singles'
  | 'four-ball'
  | 'foursomes'
  | 'scramble'
  | 'stroke';

export interface MatchupSide {
  entryId: string;
  playerIds: string[];
  // One combined score per hole for the whole side.
  scores: number[];
}

export interface TournamentMatchup {
  id: string;
  format: TournamentMatchupFormat;
  // Only confirmed games count toward the official leaderboard.
  confirmed?: boolean;
  sides: MatchupSide[];
}

export interface TournamentRound {
  id: string;
  name: string;
  // Round code of the played Golphy round this maps to, when one exists.
  roundId?: string;
  matchups: TournamentMatchup[];
}
