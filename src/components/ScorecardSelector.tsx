import { useState } from 'react';
import type { HoleInfo, NineHoleSet, Scorecard, StrokeIndexAllocation } from '../types/index.ts';
import './ScorecardSelector.scss';

interface ScorecardSelectorProps {
  scorecards: Scorecard[];
  selectedId: string | null;
  onSelect: (scorecard: Scorecard | null) => void;
  onCreate: (name: string, sets: NineHoleSet[], allocations: StrokeIndexAllocation[]) => Promise<void>;
  onUpdate: (
    id: string,
    name: string,
    sets: NineHoleSet[],
    allocations: StrokeIndexAllocation[]
  ) => Promise<void>;
  isSaving: boolean;
  showOptions?: boolean;
  allowBlankCourse?: boolean;
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

const getSetLabel = (set: NineHoleSet | undefined, index: number) =>
  set?.alias?.trim() || `Set ${index + 1}`;

export default function ScorecardSelector({
  scorecards,
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  isSaving,
  showOptions = true,
  allowBlankCourse = true,
  initialFormMode = 'closed',
}: ScorecardSelectorProps) {
  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>(initialFormMode);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [totalHoles, setTotalHoles] = useState<9 | 18 | 27>(18);
  const [sets, setSets] = useState<NineHoleSet[]>(makeDefaultSets(18));
  const [allocations, setAllocations] = useState<StrokeIndexAllocation[]>([]);
  const [createError, setCreateError] = useState('');

  const selectedScorecard = scorecards.find((sc) => sc.id === selectedId) ?? null;

  const closeForm = () => {
    setFormMode('closed');
    setEditingId(null);
    setNewName('');
    setTotalHoles(18);
    setSets(makeDefaultSets(18));
    setAllocations([]);
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
    setAllocations([]);
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
    setAllocations(
      (selectedScorecard.strokeIndexAllocations ?? []).map((allocation) => ({
        setIndexes: [...allocation.setIndexes],
        handicapsBySet: allocation.handicapsBySet.map((values) => [...values]),
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

  const addAllocation = () => {
    const setIndexes = sets.length > 1 ? [0, 1] : [0];
    setAllocations((prev) => [
      ...prev,
      {
        setIndexes,
        handicapsBySet: setIndexes.map(() => Array(9).fill(0)),
      },
    ]);
  };

  const removeAllocation = (allocationIndex: number) => {
    setAllocations((prev) => prev.filter((_, index) => index !== allocationIndex));
  };

  const toggleAllocationSet = (allocationIndex: number, setIndex: number) => {
    setAllocations((prev) =>
      prev.map((allocation, index) => {
        if (index !== allocationIndex) return allocation;

        const isIncluded = allocation.setIndexes.includes(setIndex);
        if (isIncluded && allocation.setIndexes.length <= 2) {
          return allocation;
        }

        const nextSetIndexes = isIncluded
          ? allocation.setIndexes.filter((value) => value !== setIndex)
          : [...allocation.setIndexes, setIndex].sort((a, b) => a - b);

        return {
          setIndexes: nextSetIndexes,
          handicapsBySet: nextSetIndexes.map((value) => {
            const previousPosition = allocation.setIndexes.indexOf(value);
            return previousPosition >= 0
              ? [...allocation.handicapsBySet[previousPosition]]
              : Array(9).fill(0);
          }),
        };
      })
    );
  };

  const handleAllocationCellChange = (
    allocationIndex: number,
    position: number,
    holeIndex: number,
    value: string
  ) => {
    const parsed = value === '' ? 0 : parseInt(value);
    if (isNaN(parsed)) return;

    setAllocations((prev) =>
      prev.map((allocation, index) => {
        if (index !== allocationIndex) return allocation;
        return {
          ...allocation,
          handicapsBySet: allocation.handicapsBySet.map((values, valuesPosition) =>
            valuesPosition === position
              ? values.map((existing, i) => (i === holeIndex ? parsed : existing))
              : values
          ),
        };
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
      await onUpdate(editingId, newName.trim(), sets, allocations);
    } else {
      await onCreate(newName.trim(), sets, allocations);
    }

    closeForm();
  };

  return (
    <div className="scorecard-selector">
      {showOptions && (
        <div className="scorecard-options">
          {allowBlankCourse && (
            <button
              type="button"
              className={`scorecard-option ${selectedId === null ? 'selected' : ''}`}
              onClick={() => onSelect(null)}
            >
              Blank default course
              <span className="scorecard-holes">Use default par values</span>
            </button>
          )}
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

          {sets.length > 1 && (
            <div className="allocation-section">
              <p className="allocation-title">Stroke index allocations</p>
              <p className="allocation-copy">
                Optional. Add one when a combination of nines uses different stroke indexes than the
                HCP values above.
              </p>

              {allocations.map((allocation, allocationIndex) => (
                <div key={allocationIndex} className="allocation-block">
                  <div className="allocation-sets">
                    {sets.map((set, setIndex) => {
                      const isIncluded = allocation.setIndexes.includes(setIndex);

                      return (
                        <label
                          key={setIndex}
                          className={`allocation-set-toggle${isIncluded ? ' selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            onChange={() => toggleAllocationSet(allocationIndex, setIndex)}
                          />
                          {getSetLabel(set, setIndex)}
                        </label>
                      );
                    })}
                  </div>

                  {allocation.setIndexes.map((setIndex, position) => (
                    <div key={setIndex} className="allocation-row">
                      <span className="allocation-row-label">
                        {getSetLabel(sets[setIndex], setIndex)}
                      </span>
                      <div className="allocation-inputs">
                        {Array.from({ length: 9 }, (_, holeIndex) => (
                          <input
                            key={holeIndex}
                            type="number"
                            inputMode="numeric"
                            aria-label={`${getSetLabel(sets[setIndex], setIndex)} hole ${holeIndex + 1} stroke index`}
                            value={allocation.handicapsBySet[position]?.[holeIndex] || ''}
                            onChange={(e) =>
                              handleAllocationCellChange(
                                allocationIndex,
                                position,
                                holeIndex,
                                e.target.value
                              )
                            }
                            placeholder="—"
                            min={1}
                            max={allocation.setIndexes.length * 9}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="allocation-remove-btn"
                    onClick={() => removeAllocation(allocationIndex)}
                  >
                    Remove allocation
                  </button>
                </div>
              ))}

              <button type="button" className="allocation-add-btn" onClick={addAllocation}>
                Add allocation
              </button>
            </div>
          )}

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

