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

export interface GameState {
  players: Player[];
  scores: Score[];
  currentHole: number;
  totalHoles: number;
  alias?: string;
  parValues?: number[];
  scorecardId?: string;
  scorecardName?: string;
}
