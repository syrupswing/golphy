import type { LeaderboardView } from '../tournaments/leaderboard';
import './TournamentLeaderboard.scss';

interface TournamentLeaderboardProps {
  board: LeaderboardView | null;
  emptyMessage?: string;
}

const formatToPar = (value: number | null): string => {
  if (value === null) return '';
  return String(Math.abs(value));
};

const toParClass = (value: number | null): string => {
  if (value === null) return '';
  return value < 0 ? ' is-under' : ' is-over';
};

const valueClass = (value: number | string): string => {
  if (typeof value !== 'number') return '';
  return value < 0 ? ' is-under' : ' is-over';
};

export default function TournamentLeaderboard({ board, emptyMessage }: TournamentLeaderboardProps) {
  if (!board || board.rows.length === 0) {
    return (
      <div className="masters-board">
        <p className="masters-board-empty">{emptyMessage || 'No scores to show yet.'}</p>
      </div>
    );
  }

  return (
    <div className="masters-board">
      <div className="masters-board-head">
        <h2>Leaders</h2>
        {board.subtitle && <p>{board.subtitle}</p>}
      </div>

      <div className="masters-board-scroll">
        {board.kind === 'standings' ? (
          <table className="masters-board-table">
            <thead>
              <tr>
                <th className="masters-label">{board.subtitle?.startsWith('Team') ? 'Team' : 'Player'}</th>
                {board.columns.map((column) => (
                  <th key={column} className="masters-total">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row) => (
                <tr key={row.id}>
                  <td className="masters-name">
                    <span className="masters-name-text">{row.name}</span>
                  </td>
                  {row.values.map((value, index) => (
                    <td key={board.columns[index]} className={`masters-total${valueClass(value)}`}>
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <HoleTable board={board} />
        )}
      </div>
    </div>
  );
}

function HoleTable({ board }: { board: Extract<LeaderboardView, { kind: 'holes' }> }) {
  const holes = board.pars.map((_, index) => index + 1);

  return (
    <table className="masters-board-table">
      <thead>
        <tr>
          <th className="masters-label">Hole</th>
          {holes.map((hole) => (
            <th key={hole} className="masters-hole">
              {hole}
            </th>
          ))}
          <th className="masters-total" rowSpan={2}>
            Total
          </th>
        </tr>
        <tr>
          <th className="masters-label">Par</th>
          {board.pars.map((par, index) => (
            <th key={holes[index]} className="masters-hole">
              {par}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {board.rows.map((row) => (
          <tr key={row.id}>
            <td className="masters-name">
              <span className="masters-name-text">{row.name}</span>
              {row.detail && <span className="masters-name-detail">{row.detail}</span>}
            </td>
            {row.toPar.map((value, index) => (
              <td key={holes[index]} className={`masters-score${toParClass(value)}`}>
                {formatToPar(value)}
              </td>
            ))}
            <td className={`masters-total${toParClass(row.total)}`}>{formatToPar(row.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
