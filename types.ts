
export interface WordEntity {
  id: string;
  text: string;
  position: { x: number; y: number; z: number };
  color: string;
  velocity: { x: number; y: number; z: number };
  caught: boolean;
}

export interface Particle {
  id: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  color: string;
  life: number; // 0 to 1, where 1 is new and 0 is dead
}

export interface GameState {
  score: number;
  isStarted: boolean;
  isFinished: boolean;
}
