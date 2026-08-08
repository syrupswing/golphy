export interface Player {
  id: string;
  name: string;
  color: string;
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

export interface Scorecard {
  id: string;
  name: string;
  sets: NineHoleSet[];
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
  scorecardId?: string;
  scorecardName?: string;
  playedSetLabels?: string[];
  matchup?: MatchupConfig;
}
