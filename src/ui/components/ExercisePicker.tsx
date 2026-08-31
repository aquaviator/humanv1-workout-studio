import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Exercise } from '../../domain/catalogue';
import { Search, X, ChevronDown, ChevronUp, SlidersHorizontal, Plus } from 'lucide-react';

interface ExercisePickerProps {
  exercises: Exercise[];
  onSelect: (exerciseId: string, exerciseName: string) => void;
  onClose: () => void;
}

export function ExercisePicker({ exercises, onSelect, onClose }: ExercisePickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);

  // Reset visible count on search/filter
  useEffect(() => {
    setVisibleCount(20);
  }, [searchQuery, activeFilters]);

  // Normalize string for search
  const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-_]/g, ' ').replace(/[^\w\s]/gi, '').toLowerCase().trim();

  // Extract filter options from the dataset
  const filterOptions = useMemo(() => {
    const opts: Record<string, Set<string>> = {
      category: new Set(),
      equipment: new Set(),
      muscleArea: new Set(),
      primaryMuscles: new Set(),
      secondaryMuscles: new Set(),
      movementPattern: new Set(),
      environment: new Set(),
      laterality: new Set(),
      modalitySuitability: new Set(),
      technicalComplexity: new Set(),
      riskIndicators: new Set(),
    };

    exercises.forEach(ex => {
      if (ex.category) opts.category.add(ex.category);
      if (ex.equipment) ex.equipment.forEach(e => opts.equipment.add(e));
      if (ex.muscleArea) ex.muscleArea.forEach(m => opts.muscleArea.add(m));
      if (ex.primaryMuscles) ex.primaryMuscles.forEach(m => opts.primaryMuscles.add(m));
      if (ex.secondaryMuscles) ex.secondaryMuscles.forEach(m => opts.secondaryMuscles.add(m));
      if (ex.movementPattern) ex.movementPattern.forEach(m => opts.movementPattern.add(m));
      if (ex.environment) ex.environment.forEach(e => opts.environment.add(e));
      if (ex.laterality) opts.laterality.add(ex.laterality);
      if (ex.modalitySuitability) ex.modalitySuitability.forEach(m => opts.modalitySuitability.add(m));
      if (ex.technicalComplexity) opts.technicalComplexity.add(ex.technicalComplexity);
      if (ex.riskIndicators) ex.riskIndicators.forEach(r => opts.riskIndicators.add(r));
    });

    return Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, Array.from(v).sort()]));
  }, [exercises]);

  const toggleFilter = (group: string, value: string) => {
    setActiveFilters(prev => {
      const current = prev[group] || [];
      const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      if (updated.length === 0) {
        const { [group]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [group]: updated };
    });
  };

  const clearFilters = () => {
    setActiveFilters({});
    setSearchQuery('');
  };

  const filteredExercises = useMemo(() => {
    const normalizedQuery = normalize(searchQuery);
    return exercises.filter(ex => {
      // 1. Search text
      if (normalizedQuery) {
        const searchTarget = normalize([
          ex.name,
          ...(ex.aliases || []),
          ex.category,
          ...(ex.equipment || [])
        ].join(' '));
        if (!searchTarget.includes(normalizedQuery)) return false;
      }

      // 2. Filters (AND between groups, OR within group)
      for (const [group, values] of Object.entries(activeFilters)) {
        if (values.length === 0) continue;
        const exValue = ex[group as keyof Exercise];
        
        if (Array.isArray(exValue)) {
          if (!exValue.some(v => values.includes(v))) return false;
        } else if (typeof exValue === 'string') {
          if (!values.includes(exValue)) return false;
        } else {
           return false;
        }
      }

      return true;
    });
  }, [exercises, searchQuery, activeFilters]);

  // Lazy loading logic
  const observerTarget = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => prev + 20);
        }
      },
      { threshold: 1.0, rootMargin: '100px' }
    );
    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }
    return () => observer.disconnect();
  }, [filteredExercises]);

  const displayedExercises = filteredExercises.slice(0, visibleCount);

  // Group definitions
  const simpleGroups = [
    { key: 'category', label: 'Category' },
    { key: 'equipment', label: 'Equipment' },
    { key: 'muscleArea', label: 'Muscle Area' }
  ];
  
  const advancedGroups = [
    { key: 'movementPattern', label: 'Movement Pattern' },
    { key: 'primaryMuscles', label: 'Primary Muscles' },
    { key: 'secondaryMuscles', label: 'Secondary Muscles' },
    { key: 'environment', label: 'Environment' },
    { key: 'laterality', label: 'Laterality' },
    { key: 'modalitySuitability', label: 'Modality' },
    { key: 'technicalComplexity', label: 'Complexity' },
    { key: 'riskIndicators', label: 'Risk Indicators' }
  ];

  const quickCategories = ['Strength', 'Cardio', 'HIIT', 'Mobility', 'Warm-up', 'Circuit'];

  const activeFilterCount = Object.values(activeFilters).flat().length;

  return (
    <div className="w-full md:w-[28rem] border-t md:border-t-0 md:border-l border-hv-border bg-hv-surface-1 md:h-full flex flex-col absolute md:static bottom-0 left-0 right-0 h-[85vh] md:h-full z-50 shadow-xl" aria-label="Exercise Picker">
      <div className="p-4 border-b border-hv-border flex justify-between items-center bg-hv-surface-1">
        <h2 className="font-bold text-lg">Library</h2>
        <button onClick={onClose} className="text-hv-text-muted hover:text-hv-text p-1 rounded hover:bg-hv-surface-2 transition-colors" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Search & Filters */}
        <div className="p-4 border-b border-hv-border space-y-4 bg-hv-surface-1 sticky top-0 z-10">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-hv-text-muted" />
            <input 
              type="text" 
              placeholder="Search exercises, muscles, equipment..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-hv-bg border border-hv-border rounded-md text-sm focus:outline-none focus:border-hv-primary"
              aria-label="Search exercises"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-hv-text-muted hover:text-hv-text"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Categories */}
          <div className="flex flex-wrap gap-2">
            {quickCategories.map(cat => {
              const isActive = activeFilters.category?.includes(cat);
              if (!filterOptions.category.includes(cat) && !isActive) return null; // Only show if exists in catalogue
              return (
                <button
                  key={cat}
                  onClick={() => toggleFilter('category', cat)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${isActive ? 'bg-hv-primary text-white border-hv-primary' : 'bg-hv-bg border-hv-border text-hv-text-muted hover:border-hv-text'}`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="flex justify-between items-center">
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)} 
              className="text-sm text-hv-primary flex items-center gap-1 hover:underline"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {showAdvanced ? 'Hide Filters' : 'Filters'}
              {activeFilterCount > 0 && <span className="bg-hv-primary text-white text-[10px] rounded-full px-1.5 py-0.5 ml-1">{activeFilterCount}</span>}
            </button>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-hv-text-muted hover:text-hv-text">
                Clear all
              </button>
            )}
          </div>

          {/* Filters Panel */}
          {showAdvanced && (
            <div className="space-y-4 pt-2 border-t border-hv-border mt-2 max-h-60 overflow-y-auto">
              {[...simpleGroups, ...advancedGroups].map(group => {
                const options = filterOptions[group.key];
                if (!options || options.length === 0) return null;
                return (
                  <div key={group.key} className="space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-hv-text-muted">{group.label}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {options.map(opt => {
                        const isActive = activeFilters[group.key]?.includes(opt);
                        return (
                          <button
                            key={opt}
                            onClick={() => toggleFilter(group.key, opt)}
                            className={`px-2 py-0.5 text-xs rounded-sm border transition-colors ${isActive ? 'bg-hv-surface-2 border-hv-primary text-hv-primary' : 'bg-transparent border-hv-border text-hv-text hover:border-hv-text-muted'}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 p-2 bg-hv-surface-1">
          <div className="px-2 py-2 text-xs text-hv-text-muted">
            {filteredExercises.length} result{filteredExercises.length !== 1 ? 's' : ''}
          </div>
          
          {filteredExercises.length === 0 ? (
            <div className="p-6 text-center text-hv-text-muted">
              <p>No exercises found matching your criteria.</p>
              <button 
                onClick={clearFilters} 
                className="mt-4 px-4 py-2 bg-hv-surface-2 hover:bg-hv-surface-3 rounded-md text-sm transition-colors"
              >
                Clear all filters & search
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {displayedExercises.map((ex) => (
                <button
                  key={ex.exerciseId}
                  onClick={() => onSelect(ex.exerciseId, ex.name)}
                  className="w-full text-left flex items-center justify-between p-3 rounded-md hover:bg-hv-surface-2 border border-transparent hover:border-hv-border transition-colors group"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="font-semibold text-sm truncate group-hover:text-hv-primary transition-colors">{ex.name}</div>
                    <div className="text-xs text-hv-text-muted truncate flex gap-2 mt-0.5">
                      {ex.category && <span>{ex.category}</span>}
                      {ex.muscleArea && ex.muscleArea.length > 0 && (
                        <>
                          <span className="opacity-30">•</span>
                          <span>{ex.muscleArea.join(', ')}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div 
                    className="p-1.5 text-hv-text-muted hover:text-hv-primary hover:bg-hv-surface-3 rounded opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all"
                    aria-hidden="true"
                  >
                    <Plus className="w-5 h-5" />
                  </div>
                </button>
              ))}
              <div ref={observerTarget} className="h-4" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
