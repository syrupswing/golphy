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

export interface GameState {
  players: Player[];
  scores: Score[];
  currentHole: number;
  totalHoles: number;
}
