import { useEffect, useState } from 'react';
import type { PlayerProfile, Tournament } from '../types/index.ts';
import { saveTournamentRounds, subscribeToTournament } from '../firebase/tournaments';
import {
  calculateStandings,
  createEmptyRound,
  MATCHUP_FORMAT_LABELS,
  POINTS_FOR_TIE,
  POINTS_FOR_WIN,
  resolveMatchup,
} from '../tournaments/scoring';
import './TournamentDashboard.scss';

interface TournamentDashboardProps {
  tournamentId: string;
  initialTournament?: Tournament | null;
  playerProfiles: PlayerProfile[];
  clientId: string;
  onManage: () => void;
}

export default function TournamentDashboard({
  tournamentId,
  initialTournament,
  playerProfiles,
  clientId,
  onManage,
}: TournamentDashboardProps) {
  const [tournament, setTournament] = useState<Tournament | null>(initialTournament ?? null);
  const [error, setError] = useState('');
  const [isAddingRound, setIsAddingRound] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToTournament(
      tournamentId,
      (next) => {
        setTournament(next);
        setError('');
      },
      (subscriptionError) => setError(subscriptionError.message)
    );

    return unsubscribe;
  }, [tournamentId]);

  const getPlayerName = (playerId: string) => {
    const profile = playerProfiles.find((p) => p.id === playerId);
    if (!profile) return 'Unknown player';
    return profile.nickname?.trim() || `${profile.firstName} ${profile.lastName}`;
  };

  const getEntryName = (entryId: string) => {
    const entry = tournament?.entries.find((e) => e.id === entryId);
    if (!entry) return 'Unassigned';
    return entry.name.trim() || getPlayerName(entry.playerIds[0] ?? '');
  };

  const addRound = async () => {
    if (!tournament) return;

    setIsAddingRound(true);
    setError('');

    const existingRounds = tournament.rounds ?? [];
    const nextRounds = [...existingRounds, createEmptyRound(existingRounds.length)];

    try {
      // Write straight through so a round can be added mid-tournament without opening the editor.
      await saveTournamentRounds(tournamentId, nextRounds, clientId);
      setTournament({ ...tournament, rounds: nextRounds });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not add the round.');
    } finally {
      setIsAddingRound(false);
    }
  };

  if (!tournament) {
    return (
      <div className="tournament-dashboard">
        <p className="tournament-dashboard-empty">
          {error || 'Loading tournament...'}
        </p>
      </div>
    );
  }

  const standings = calculateStandings(tournament);
  const rounds = tournament.rounds ?? [];
  const totalGames = rounds.reduce((sum, round) => sum + round.matchups.length, 0);
  const confirmedGames = rounds.reduce(
    (sum, round) => sum + round.matchups.filter((matchup) => matchup.confirmed).length,
    0
  );
  const leader = standings[0];
  const isOutrightLeader = Boolean(leader && (standings[1]?.points ?? -1) < leader.points);

  return (
    <div className="tournament-dashboard">
      <div className="tournament-dashboard-header">
        <div>
          <h2>{tournament.name}</h2>
          <p>
            {tournament.entries.length} {tournament.format === 'team' ? 'teams' : 'players'} ·{' '}
            {rounds.length} round{rounds.length === 1 ? '' : 's'} · {totalGames} game
            {totalGames === 1 ? '' : 's'}
          </p>
        </div>
        <button type="button" className="tournament-dashboard-manage" onClick={onManage}>
          Manage
        </button>
      </div>
      {error && <p className="tournament-dashboard-error">{error}</p>}

      <section className="tournament-dashboard-section">
        <h3>Leaderboard</h3>

        <p className="tournament-dashboard-note">
          {confirmedGames} of {totalGames} game{totalGames === 1 ? '' : 's'} confirmed.
          {leader && confirmedGames > 0 && (
            <>
              {' '}
              {isOutrightLeader
                ? `${getEntryName(leader.entryId)} leads with ${leader.points}.`
                : `Tied at the top on ${leader.points}.`}
            </>
          )}
        </p>

        <table className="tournament-dashboard-standings">
          <thead>
            <tr>
              <th scope="col">{tournament.format === 'team' ? 'Team' : 'Player'}</th>
              <th scope="col">Pts</th>
              <th scope="col">Proj</th>
              <th scope="col">W</th>
              <th scope="col">H</th>
              <th scope="col">L</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.entryId}>
                <td>{getEntryName(row.entryId)}</td>
                <td className="is-points">{row.points}</td>
                <td className="is-projected">
                  {row.projectedPoints > row.points ? row.projectedPoints : '—'}
                </td>
                <td>{row.wins}</td>
                <td>{row.ties}</td>
                <td>{row.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {rounds.length === 0 && (
        <p className="tournament-dashboard-empty">
          No rounds yet. Add one to start scoring games.
        </p>
      )}

      {rounds.map((round) => (
        <section key={round.id} className="tournament-dashboard-section">
          <h3>
            {round.name}
            {round.roundId && <span className="tournament-dashboard-code">{round.roundId}</span>}
          </h3>

          <div className="tournament-dashboard-games">
            {round.matchups.map((matchup, index) => {
              const result = resolveMatchup(matchup);
              const status =
                result.holesPlayed === 0
                  ? 'Not started'
                  : matchup.confirmed
                    ? 'Confirmed'
                    : result.isComplete
                      ? 'Awaiting confirmation'
                      : `Thru ${result.holesPlayed}`;

              return (
                <article key={matchup.id} className="tournament-dashboard-game">
                  <header>
                    <span className="game-index">Game {index + 1}</span>
                    <span className="game-format">{MATCHUP_FORMAT_LABELS[matchup.format]}</span>
                    <span
                      className={`game-status${matchup.confirmed ? ' is-confirmed' : result.holesPlayed > 0 && !result.isComplete ? ' is-live' : ''}`}
                    >
                      {status}
                    </span>
                  </header>

                  {matchup.sides.map((side, sideIndex) => {
                    const isWinner = result.winningSideIndex === sideIndex;

                    return (
                      <div
                        key={sideIndex}
                        className={`game-side${isWinner ? ' is-winner' : ''}`}
                      >
                        <div className="game-side-names">
                          <span className="game-side-team">{getEntryName(side.entryId)}</span>
                          <span className="game-side-players">
                            {side.playerIds.length
                              ? side.playerIds.map(getPlayerName).join(' & ')
                              : 'No players yet'}
                          </span>
                        </div>
                        <div className="game-side-numbers">
                          <span className="game-side-holes">{result.holesWon[sideIndex]}</span>
                          <span className="game-side-total">{result.totals[sideIndex] || '—'}</span>
                        </div>
                      </div>
                    );
                  })}

                  <footer>
                    {result.holesPlayed === 0
                      ? 'Awaiting scores'
                      : result.isTie
                        ? `Halved · ${POINTS_FOR_TIE} point each`
                        : `${getEntryName(matchup.sides[result.winningSideIndex ?? 0].entryId)} ${result.summary} · +${POINTS_FOR_WIN}`}
                    {result.holesPlayed > 0 && !matchup.confirmed && ' (provisional)'}
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <div className="tournament-dashboard-actions">
        <button
          type="button"
          className="tournament-dashboard-add-round"
          onClick={addRound}
          disabled={isAddingRound}
        >
          {isAddingRound ? 'Adding round...' : 'Add round'}
        </button>
        <span className="tournament-dashboard-note">
          Set formats, teams and scores in Manage.
        </span>
      </div>
    </div>
  );
}
