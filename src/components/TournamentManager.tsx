import { useEffect, useState } from 'react';
import type {
  PlayerProfile,
  PlayerTier,
  TierAssignmentMode,
  Tournament,
  TournamentEntry,
  TournamentFormat,
  TournamentSession,
} from '../types/index.ts';
import {
  makeEntryId,
  REQUIRED_TIER_COUNTS,
  TEAM_SIZE,
} from '../firebase/tournaments';
import type { TournamentInput } from '../firebase/tournaments';
import './TournamentManager.scss';

interface TournamentManagerProps {
  mode: 'add' | 'edit';
  tournaments: Tournament[];
  initialTournamentId?: string;
  onCancel?: () => void;
  playerProfiles: PlayerProfile[];
  isSaving: boolean;
  onCreate: (input: TournamentInput) => Promise<boolean>;
  onUpdate: (id: string, input: TournamentInput) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const getPlayerName = (profile: PlayerProfile) =>
  profile.nickname?.trim() || `${profile.firstName} ${profile.lastName}`;

const makeEmptyEntry = (): TournamentEntry => ({
  id: makeEntryId(),
  name: '',
  playerIds: [],
  playerTiers: {},
});

export default function TournamentManager({
  mode,
  tournaments,
  initialTournamentId,
  onCancel,
  playerProfiles,
  isSaving,
  onCreate,
  onUpdate,
  onDelete,
}: TournamentManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('individual');
  const [tierMode, setTierMode] = useState<TierAssignmentMode>('auto');
  const [entries, setEntries] = useState<TournamentEntry[]>([makeEmptyEntry()]);
  const [sessions, setSessions] = useState<TournamentSession[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(mode === 'add');

  const getHandicap = (playerId: string): number =>
    playerProfiles.find((profile) => profile.id === playerId)?.handicap ?? Number.MAX_SAFE_INTEGER;

  // The lowest handicaps on a team play as the A players.
  const assignTiersByHandicap = (playerIds: string[]): Record<string, PlayerTier> => {
    const ranked = [...playerIds].sort((left, right) => getHandicap(left) - getHandicap(right));
    const tiers: Record<string, PlayerTier> = {};

    ranked.forEach((playerId, position) => {
      tiers[playerId] = position < REQUIRED_TIER_COUNTS.A ? 'A' : 'B';
    });

    return tiers;
  };

  const countTier = (entry: TournamentEntry, tier: PlayerTier): number =>
    entry.playerIds.filter((playerId) => entry.playerTiers?.[playerId] === tier).length;

  useEffect(() => {
    if (mode !== 'edit' || editingId || !initialTournamentId) {
      return;
    }

    const initialTournament = tournaments.find((tournament) => tournament.id === initialTournamentId);
    if (!initialTournament) {
      return;
    }

    openTournamentForEditing(initialTournament);
  }, [mode, editingId, initialTournamentId, tournaments]);

  // Manual mode keeps existing picks and only slots newcomers into whichever tier has room.
  const resolveTiers = (
    playerIds: string[],
    existing: Record<string, PlayerTier> = {}
  ): Record<string, PlayerTier> => {
    if (tierMode === 'auto') {
      return assignTiersByHandicap(playerIds);
    }

    const tiers: Record<string, PlayerTier> = {};
    let aCount = playerIds.filter((playerId) => existing[playerId] === 'A').length;

    playerIds.forEach((playerId) => {
      if (existing[playerId]) {
        tiers[playerId] = existing[playerId];
        return;
      }

      if (aCount < REQUIRED_TIER_COUNTS.A) {
        tiers[playerId] = 'A';
        aCount += 1;
      } else {
        tiers[playerId] = 'B';
      }
    });

    return tiers;
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setFormat('individual');
    setTierMode('auto');
    setEntries([makeEmptyEntry()]);
    setSessions([]);
    setIsFormOpen(mode === 'add');
  };

  const openTournamentForEditing = (tournament: Tournament) => {
    setEditingId(tournament.id);
    setName(tournament.name);
    setFormat(tournament.format);
    setTierMode(tournament.tierMode ?? 'auto');
    setEntries(
      tournament.entries.length
        ? tournament.entries.map((entry) => ({
            ...entry,
            playerIds: [...entry.playerIds],
            playerTiers: { ...(entry.playerTiers ?? {}) },
          }))
        : [makeEmptyEntry()]
    );
    setSessions(
      (tournament.sessions ?? tournament.rounds ?? []).map((round) => ({
        ...round,
        matchups: round.matchups.map((matchup) => ({
          ...matchup,
          sides: matchup.sides.map((side) => ({
            ...side,
            playerIds: [...side.playerIds],
            scores: [...side.scores],
          })),
        })),
      }))
    );
    setIsFormOpen(true);
  };

  const handleFormatChange = (nextFormat: TournamentFormat) => {
    setFormat(nextFormat);

    if (nextFormat === 'individual') {
      // Individual play is one player per entry, so flatten any team groupings.
      const playerIds = entries.flatMap((entry) => entry.playerIds);
      setEntries(
        playerIds.length
          ? playerIds.map((playerId) => ({
              id: makeEntryId(),
              name: '',
              playerIds: [playerId],
              playerTiers: {},
            }))
          : [makeEmptyEntry()]
      );
      return;
    }

    setEntries((prev) =>
      prev.map((entry) => ({
        ...entry,
        playerTiers: resolveTiers(entry.playerIds, entry.playerTiers ?? {}),
      }))
    );
  };

  const handleTierModeChange = (nextMode: TierAssignmentMode) => {
    setTierMode(nextMode);

    if (nextMode === 'auto') {
      setEntries((prev) =>
        prev.map((entry) => ({ ...entry, playerTiers: assignTiersByHandicap(entry.playerIds) }))
      );
    }
  };

  const addEntry = () => {
    setEntries((prev) => [...prev, makeEmptyEntry()]);
  };

  const removeEntry = (entryId: string) => {
    setEntries((prev) => (prev.length <= 1 ? prev : prev.filter((entry) => entry.id !== entryId)));
  };

  const updateEntryName = (entryId: string, value: string) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === entryId ? { ...entry, name: value } : entry))
    );
  };

  const togglePlayerInEntry = (entryId: string, playerId: string) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) {
          // A player belongs to a single entry, so drop them from any other one.
          if (!entry.playerIds.includes(playerId)) {
            return entry;
          }

          const playerIds = entry.playerIds.filter((id) => id !== playerId);
          return {
            ...entry,
            playerIds,
            playerTiers: format === 'team' ? resolveTiers(playerIds, entry.playerTiers ?? {}) : {},
          };
        }

        const isSelected = entry.playerIds.includes(playerId);
        let playerIds: string[];

        if (isSelected) {
          playerIds = entry.playerIds.filter((id) => id !== playerId);
        } else if (format === 'individual') {
          playerIds = [playerId];
        } else if (entry.playerIds.length >= TEAM_SIZE) {
          return entry;
        } else {
          playerIds = [...entry.playerIds, playerId];
        }

        return {
          ...entry,
          playerIds,
          playerTiers: format === 'team' ? resolveTiers(playerIds, entry.playerTiers ?? {}) : {},
        };
      })
    );
  };

  const setPlayerTier = (entryId: string, playerId: string, tier: PlayerTier) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? { ...entry, playerTiers: { ...(entry.playerTiers ?? {}), [playerId]: tier } }
          : entry
      )
    );
  };

  const autoAssignTiers = (entryId: string) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? { ...entry, playerTiers: assignTiersByHandicap(entry.playerIds) }
          : entry
      )
    );
  };

  const handleSave = async () => {
    const input: TournamentInput = { name, format, tierMode, entries, sessions };
    const saved =
      editingId !== null ? await onUpdate(editingId, input) : await onCreate(input);

    if (saved) {
      resetForm();
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;

    const typedId = window.prompt(
      'To delete this tournament, enter or paste its database ID exactly:'
    );

    if (typedId === null) {
      return;
    }

    if (typedId.trim() !== editingId) {
      window.alert('Tournament ID did not match. Delete canceled.');
      return;
    }

    if (!window.confirm('Delete this tournament? This cannot be undone.')) return;

    const deleted = await onDelete(editingId);
    if (deleted) {
      resetForm();
    }
  };

  return (
    <div className="tournament-manager">
      {mode === 'edit' && (
        <div className="tournament-list">
          {tournaments.length === 0 ? (
            <p className="tournament-empty">No tournaments yet.</p>
          ) : (
            tournaments.map((tournament) => (
              <button
                key={tournament.id}
                type="button"
                className={`tournament-item${editingId === tournament.id ? ' selected' : ''}`}
                onClick={() => openTournamentForEditing(tournament)}
              >
                <span className="tournament-item-name">{tournament.name}</span>
                <span className="tournament-item-meta">
                  {tournament.format === 'team' ? 'Team' : 'Individual'} ·{' '}
                  {tournament.entries.length}{' '}
                  {tournament.format === 'team'
                    ? `team${tournament.entries.length === 1 ? '' : 's'}`
                    : `player${tournament.entries.length === 1 ? '' : 's'}`}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {isFormOpen && (
        <div className="tournament-form">
          <div className="tournament-field">
            <label htmlFor="tournament-name">Tournament name</label>
            <input
              id="tournament-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Summer club championship"
              maxLength={60}
            />
          </div>

          <div className="tournament-field">
            <label>Format</label>
            <div className="tournament-format-toggle">
              <button
                type="button"
                className={format === 'individual' ? 'active' : ''}
                onClick={() => handleFormatChange('individual')}
              >
                Individual
              </button>
              <button
                type="button"
                className={format === 'team' ? 'active' : ''}
                onClick={() => handleFormatChange('team')}
              >
                Teams
              </button>
            </div>
          </div>

          <div className="tournament-field">
            <label>{format === 'team' ? 'Teams' : 'Players'}</label>

            {format === 'team' && (
              <div className="tournament-tier-mode">
                <span>A and B players</span>
                <div className="tournament-format-toggle">
                  <button
                    type="button"
                    className={tierMode === 'auto' ? 'active' : ''}
                    onClick={() => handleTierModeChange('auto')}
                  >
                    By handicap
                  </button>
                  <button
                    type="button"
                    className={tierMode === 'manual' ? 'active' : ''}
                    onClick={() => handleTierModeChange('manual')}
                  >
                    Manual
                  </button>
                </div>
              </div>
            )}

            {playerProfiles.length === 0 && (
              <p className="tournament-empty">Add player profiles first, then build your entries.</p>
            )}

            {entries.map((entry, index) => (
              <div key={entry.id} className="tournament-entry">
                <div className="tournament-entry-header">
                  {format === 'team' ? (
                    <input
                      type="text"
                      value={entry.name}
                      onChange={(e) => updateEntryName(entry.id, e.target.value)}
                      placeholder={`Team ${index + 1} name`}
                      maxLength={40}
                      aria-label={`Team ${index + 1} name`}
                    />
                  ) : (
                    <span className="tournament-entry-label">Player {index + 1}</span>
                  )}

                  {entries.length > 1 && (
                    <button
                      type="button"
                      className="tournament-entry-remove"
                      onClick={() => removeEntry(entry.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="tournament-player-options">
                  {playerProfiles.map((profile) => {
                    const isSelected = entry.playerIds.includes(profile.id);
                    const isTeamFull = format === 'team' && entry.playerIds.length >= TEAM_SIZE;

                    return (
                      <button
                        key={profile.id}
                        type="button"
                        className={`tournament-player-chip${isSelected ? ' selected' : ''}`}
                        onClick={() => togglePlayerInEntry(entry.id, profile.id)}
                        disabled={!isSelected && isTeamFull}
                      >
                        {getPlayerName(profile)}
                        <span className="tournament-player-hcp">{profile.handicap}</span>
                      </button>
                    );
                  })}
                </div>

                {format === 'team' && entry.playerIds.length > 0 && (
                  <div className="tournament-tiers">
                    <div className="tournament-tier-summary">
                      <span
                        className={
                          countTier(entry, 'A') === REQUIRED_TIER_COUNTS.A ? 'is-met' : 'is-short'
                        }
                      >
                        A {countTier(entry, 'A')}/{REQUIRED_TIER_COUNTS.A}
                      </span>
                      <span
                        className={
                          countTier(entry, 'B') === REQUIRED_TIER_COUNTS.B ? 'is-met' : 'is-short'
                        }
                      >
                        B {countTier(entry, 'B')}/{REQUIRED_TIER_COUNTS.B}
                      </span>
                      <button type="button" onClick={() => autoAssignTiers(entry.id)}>
                        Auto-assign by handicap
                      </button>                    </div>

                    {[...entry.playerIds]
                      .sort((left, right) => getHandicap(left) - getHandicap(right))
                      .map((playerId) => {
                        const profile = playerProfiles.find((p) => p.id === playerId);
                        const tier = entry.playerTiers?.[playerId] ?? 'B';

                        return (
                          <div key={playerId} className="tournament-tier-row">
                            <span className="tournament-tier-name">
                              {profile ? getPlayerName(profile) : 'Unknown player'}
                              <span className="tournament-player-hcp">{profile?.handicap ?? '—'}</span>
                            </span>
                            <div className="tournament-tier-toggle">
                              {(['A', 'B'] as PlayerTier[]).map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  className={tier === option ? 'active' : ''}
                                  onClick={() => setPlayerTier(entry.id, playerId, option)}
                                  aria-label={`Set ${profile ? getPlayerName(profile) : 'player'} as ${option} player`}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            ))}

            <button type="button" className="tournament-add-entry" onClick={addEntry}>
              {format === 'team' ? 'Add team' : 'Add player'}
            </button>
          </div>

          <p className="tournament-empty">
            Session setup is temporarily hidden while scoring flows are being rebuilt.
          </p>

          <div className="tournament-actions">
            <button
              type="button"
              className="tournament-save"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : editingId ? 'Save changes' : 'Create tournament'}
            </button>

            {editingId && (
              <button
                type="button"
                className="tournament-delete"
                onClick={handleDelete}
                disabled={isSaving}
              >
                Delete
              </button>
            )}

            {mode === 'edit' && (
              <button
                type="button"
                className="tournament-cancel"
                onClick={() => {
                  resetForm();
                  onCancel?.();
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
