import { useState } from 'react';
import type { PlayerProfile, Tournament, TournamentEntry, TournamentFormat } from '../types/index.ts';
import { makeEntryId } from '../firebase/tournaments';
import './TournamentManager.scss';

interface TournamentManagerProps {
  mode: 'add' | 'edit';
  tournaments: Tournament[];
  playerProfiles: PlayerProfile[];
  isSaving: boolean;
  onCreate: (name: string, format: TournamentFormat, entries: TournamentEntry[]) => Promise<boolean>;
  onUpdate: (
    id: string,
    name: string,
    format: TournamentFormat,
    entries: TournamentEntry[]
  ) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const getPlayerName = (profile: PlayerProfile) =>
  profile.nickname?.trim() || `${profile.firstName} ${profile.lastName}`;

const makeEmptyEntry = (): TournamentEntry => ({
  id: makeEntryId(),
  name: '',
  playerIds: [],
});

export default function TournamentManager({
  mode,
  tournaments,
  playerProfiles,
  isSaving,
  onCreate,
  onUpdate,
  onDelete,
}: TournamentManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('individual');
  const [entries, setEntries] = useState<TournamentEntry[]>([makeEmptyEntry()]);
  const [isFormOpen, setIsFormOpen] = useState(mode === 'add');

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setFormat('individual');
    setEntries([makeEmptyEntry()]);
    setIsFormOpen(mode === 'add');
  };

  const openTournamentForEditing = (tournament: Tournament) => {
    setEditingId(tournament.id);
    setName(tournament.name);
    setFormat(tournament.format);
    setEntries(
      tournament.entries.length
        ? tournament.entries.map((entry) => ({ ...entry, playerIds: [...entry.playerIds] }))
        : [makeEmptyEntry()]
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
          ? playerIds.map((playerId) => ({ id: makeEntryId(), name: '', playerIds: [playerId] }))
          : [makeEmptyEntry()]
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
          return { ...entry, playerIds: entry.playerIds.filter((id) => id !== playerId) };
        }

        const isSelected = entry.playerIds.includes(playerId);
        if (isSelected) {
          return { ...entry, playerIds: entry.playerIds.filter((id) => id !== playerId) };
        }

        return {
          ...entry,
          playerIds: format === 'individual' ? [playerId] : [...entry.playerIds, playerId],
        };
      })
    );
  };

  const handleSave = async () => {
    const saved =
      editingId !== null
        ? await onUpdate(editingId, name, format, entries)
        : await onCreate(name, format, entries);

    if (saved) {
      resetForm();
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
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

                    return (
                      <button
                        key={profile.id}
                        type="button"
                        className={`tournament-player-chip${isSelected ? ' selected' : ''}`}
                        onClick={() => togglePlayerInEntry(entry.id, profile.id)}
                      >
                        {getPlayerName(profile)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <button type="button" className="tournament-add-entry" onClick={addEntry}>
              {format === 'team' ? 'Add team' : 'Add player'}
            </button>
          </div>

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
              <button type="button" className="tournament-cancel" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
