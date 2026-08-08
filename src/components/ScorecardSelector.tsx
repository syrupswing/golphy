import { useState } from 'react';
import type { HoleInfo, NineHoleSet, Scorecard } from '../types/index.ts';
import './ScorecardSelector.scss';

interface ScorecardSelectorProps {
  scorecards: Scorecard[];
  selectedId: string | null;
  onSelect: (scorecard: Scorecard | null) => void;
  onCreate: (name: string, sets: NineHoleSet[]) => Promise<void>;
  onUpdate: (id: string, name: string, sets: NineHoleSet[]) => Promise<void>;
  isSaving: boolean;
  showOptions?: boolean;
  initialFormMode?: 'closed' | 'create';
}

const DEFAULT_PAR = 4;
const SET_COUNT_OPTIONS = [9, 18, 27] as const;

const DEFAULT_ALIASES: Record<number, string[]> = {
  9: [''],
  18: ['Front 9', 'Back 9'],
  27: ['', '', ''],
};

const makeDefaultSets = (totalHoles: number): NineHoleSet[] => {
  const setCount = totalHoles / 9;
  const aliases = DEFAULT_ALIASES[totalHoles] ?? Array(setCount).fill('');
  return aliases.map((alias) => ({
    alias: alias || undefined,
    holes: Array(9).fill(null).map(() => ({ par: DEFAULT_PAR })),
  }));
};

export default function ScorecardSelector({
  scorecards,
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  isSaving,
  showOptions = true,
  initialFormMode = 'closed',
}: ScorecardSelectorProps) {
  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>(initialFormMode);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [totalHoles, setTotalHoles] = useState<9 | 18 | 27>(18);
  const [sets, setSets] = useState<NineHoleSet[]>(makeDefaultSets(18));
  const [createError, setCreateError] = useState('');

  const selectedScorecard = scorecards.find((sc) => sc.id === selectedId) ?? null;

  const closeForm = () => {
    setFormMode('closed');
    setEditingId(null);
    setNewName('');
    setTotalHoles(18);
    setSets(makeDefaultSets(18));
    setCreateError('');
  };

  const openCreateForm = () => {
    if (formMode === 'create') {
      closeForm();
      return;
    }
    setFormMode('create');
    setEditingId(null);
    setNewName('');
    setTotalHoles(18);
    setSets(makeDefaultSets(18));
    setCreateError('');
  };

  const openEditForm = () => {
    if (!selectedScorecard) return;
    if (formMode === 'edit' && editingId === selectedScorecard.id) {
      closeForm();
      return;
    }
    setFormMode('edit');
    setEditingId(selectedScorecard.id);
    setNewName(selectedScorecard.name);
    setTotalHoles((selectedScorecard.sets.length * 9) as 9 | 18 | 27);
    setSets(
      selectedScorecard.sets.map((set) => ({
        alias: set.alias,
        holes: set.holes.map((hole) => ({ ...hole })),
      }))
    );
    setCreateError('');
  };

  const handleHoleCountChange = (count: 9 | 18 | 27) => {
    setTotalHoles(count);
    setSets((prev) => {
      const defaults = makeDefaultSets(count);
      return defaults.map((fallback, index) => prev[index] ?? fallback);
    });
  };

  const handleAliasChange = (setIndex: number, value: string) => {
    setSets((prev) =>
      prev.map((s, i) => (i === setIndex ? { ...s, alias: value || undefined } : s))
    );
  };

  const handleCellChange = (
    setIndex: number,
    holeIndex: number,
    field: keyof HoleInfo,
    value: string
  ) => {
    setSets((prev) =>
      prev.map((s, i) => {
        if (i !== setIndex) return s;
        const holes = s.holes.map((h, j) => {
          if (j !== holeIndex) return h;
          if (value === '') return { ...h, [field]: undefined };
          const num = parseInt(value);
          if (isNaN(num)) return h;
          if (field === 'par' && (num < 2 || num > 6)) return h;
          return { ...h, [field]: num };
        });
        return { ...s, holes };
      })
    );
  };

  const handleSave = async () => {
    if (!newName.trim()) {
      setCreateError('Enter a course name.');
      return;
    }
    setCreateError('');

    if (formMode === 'edit' && editingId) {
      await onUpdate(editingId, newName.trim(), sets);
    } else {
      await onCreate(newName.trim(), sets);
    }

    closeForm();
  };

  return (
    <div className="scorecard-selector">
      {showOptions && (
        <div className="scorecard-options">
          <button
            type="button"
            className={`scorecard-option ${selectedId === null ? 'selected' : ''}`}
            onClick={() => onSelect(null)}
          >
            No saved course
            <span className="scorecard-holes">Use default par values</span>
          </button>
          {scorecards.map((sc) => (
            <button
              key={sc.id}
              type="button"
              className={`scorecard-option ${selectedId === sc.id ? 'selected' : ''}`}
              onClick={() => onSelect(sc)}
            >
              {sc.name}
              <span className="scorecard-holes">{sc.sets.length * 9} holes</span>
            </button>
          ))}
          <button
            type="button"
            className={`scorecard-option add-new ${formMode === 'create' ? 'selected' : ''}`}
            onClick={openCreateForm}
          >
            + Add new course
          </button>
        </div>
      )}

      {showOptions && selectedScorecard && (
        <button type="button" className="edit-course-btn" onClick={openEditForm}>
          {formMode === 'edit' ? 'Cancel editing' : `Edit ${selectedScorecard.name}`}
        </button>
      )}

      {formMode !== 'closed' && (
        <div className="scorecard-form">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Course name"
            maxLength={60}
          />

          <div className="hole-count-toggle">
            {SET_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className={totalHoles === n ? 'active' : ''}
                onClick={() => handleHoleCountChange(n)}
              >
                {n} holes
              </button>
            ))}
          </div>

          {sets.map((set, setIndex) => {
            const startHole = setIndex * 9 + 1;
            const totalPar = set.holes.reduce((sum, h) => sum + h.par, 0);
            const totalYards = set.holes.some((h) => h.yards !== undefined)
              ? set.holes.reduce((sum, h) => sum + (h.yards ?? 0), 0)
              : null;

            return (
              <div key={setIndex} className="set-section">
                <p className="set-label">Set {setIndex + 1} (holes {startHole}-{startHole + 8})</p>
                <input
                  type="text"
                  className="set-alias-input"
                  value={set.alias ?? ''}
                  onChange={(e) => handleAliasChange(setIndex, e.target.value)}
                  placeholder={`Set name for holes ${startHole}-${startHole + 8}`}
                  maxLength={30}
                />
                <div className="set-table-wrapper">
                  <table className="set-table">
                    <thead>
                      <tr>
                        <th className="row-header"></th>
                        {set.holes.map((_, i) => (
                          <th key={i}>{startHole + i}</th>
                        ))}
                        <th className="subtotal-header">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="row-label">Par</td>
                        {set.holes.map((hole, hi) => (
                          <td key={hi} className="set-cell">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={hole.par}
                              onChange={(e) => handleCellChange(setIndex, hi, 'par', e.target.value)}
                              min={2}
                              max={6}
                            />
                          </td>
                        ))}
                        <td className="subtotal">{totalPar}</td>
                      </tr>
                      <tr>
                        <td className="row-label">Yards</td>
                        {set.holes.map((hole, hi) => (
                          <td key={hi} className="set-cell">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={hole.yards ?? ''}
                              onChange={(e) => handleCellChange(setIndex, hi, 'yards', e.target.value)}
                              placeholder="—"
                              min={0}
                            />
                          </td>
                        ))}
                        <td className="subtotal">{totalYards ?? ''}</td>
                      </tr>
                      <tr>
                        <td className="row-label">HCP</td>
                        {set.holes.map((hole, hi) => (
                          <td key={hi} className="set-cell">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={hole.handicap ?? ''}
                              onChange={(e) => handleCellChange(setIndex, hi, 'handicap', e.target.value)}
                              placeholder="—"
                              min={1}
                              max={18}
                            />
                          </td>
                        ))}
                        <td className="subtotal"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {createError && <p className="create-error">{createError}</p>}

          <button
            type="button"
            className="create-btn"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : formMode === 'edit' ? 'Save changes' : 'Save course'}
          </button>
        </div>
      )}
    </div>
  );
}

