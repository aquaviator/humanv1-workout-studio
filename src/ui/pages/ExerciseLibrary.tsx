import React, { useState, useEffect, useMemo } from "react";
import { Exercise } from "../../domain/catalogue";
import { catalogueRepository } from "../../repositories/FirebaseCatalogueRepository";
import { Search, X, Filter } from "lucide-react";

type FilterGroup = Record<string, Set<string>>;

export default function ExerciseLibrary() {
  const [exercisesData, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<FilterGroup>({});
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  useEffect(() => {
    catalogueRepository.getExercises().then(setExercises);
  }, []);

  const toggleFilter = (group: string, value: string) => {
    setActiveFilters(prev => {
      const next = { ...prev };
      if (!next[group]) next[group] = new Set();
      if (next[group].has(value)) {
        next[group].delete(value);
        if (next[group].size === 0) delete next[group];
      } else {
        next[group].add(value);
      }
      return next;
    });
  };

  const clearAllFilters = () => setActiveFilters({});

  const filtered = useMemo(() => {
    let result = exercisesData;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(ex => 
        ex.name.toLowerCase().includes(q) ||
        ex.aliases.some(a => a.toLowerCase().includes(q)) ||
        ex.tags?.some(t => t.toLowerCase().includes(q))
      );
    }

    // Group Filters (AND between groups, OR within groups)
    Object.entries(activeFilters).forEach(([group, values]) => {
      if (values.size === 0) return;
      result = result.filter(ex => {
        const itemValues = Array.isArray((ex as any)[group]) ? (ex as any)[group] : [(ex as any)[group]];
        return itemValues.some((val: string) => values.has(val));
      });
    });

    return result;
  }, [exercisesData, search, activeFilters]);

  const renderFilterChips = (group: string, label: string, options: string[]) => {
    const selected = activeFilters[group] || new Set();
    const sortedOptions = [...options].sort((a, b) => {
      if (selected.has(a) && !selected.has(b)) return -1;
      if (!selected.has(a) && selected.has(b)) return 1;
      return a.localeCompare(b);
    });

    return (
      <div className="mb-4">
        <div className="text-sm font-semibold mb-2 text-hv-text-muted">{label}</div>
        <div className="flex flex-wrap gap-2">
          {sortedOptions.map(opt => {
            const isActive = selected.has(opt);
            return (
              <button
                key={opt}
                onClick={() => toggleFilter(group, opt)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  isActive 
                    ? "bg-hv-primary border-hv-primary text-white" 
                    : "bg-transparent border-hv-border text-hv-text hover:border-hv-text-muted"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const extractUnique = (key: keyof Exercise) => {
    const set = new Set<string>();
    exercisesData.forEach(ex => {
      const val = ex[key];
      if (Array.isArray(val)) val.forEach(v => set.add(v));
      else if (val && typeof val === "string") set.add(val);
    });
    return Array.from(set).filter(Boolean);
  };

  return (
    <div className="p-4 md:p-8 h-full flex flex-col relative overflow-hidden">
      <div className="flex flex-col gap-4 mb-6">
        <h1 className="text-2xl font-bold">Exercise Library</h1>
        
        <div className="flex gap-2 w-full max-w-2xl relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-hv-text-muted" />
          </div>
          <input 
            type="text" 
            placeholder="Search exercises..." 
            className="flex-1 bg-hv-surface-1 border border-hv-border rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-hv-primary text-hv-text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button 
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className={`px-4 py-2 rounded-lg border flex items-center gap-2 transition-colors ${isAdvancedOpen || Object.keys(activeFilters).length > 0 ? "bg-hv-surface-2 border-hv-primary text-hv-primary" : "bg-transparent border-hv-border hover:bg-hv-surface-1"}`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
            {Object.keys(activeFilters).length > 0 && (
              <span className="bg-hv-primary text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full ml-1">
                {Object.values(activeFilters).reduce((acc, set) => acc + set.size, 0)}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0 relative">
        <div className={`w-full max-w-xs pr-6 overflow-y-auto ${isAdvancedOpen ? 'block' : 'hidden'} lg:block absolute lg:relative z-10 bg-hv-bg lg:bg-transparent h-full`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Filters</h2>
            {Object.keys(activeFilters).length > 0 && (
              <button onClick={clearAllFilters} className="text-xs text-hv-primary hover:underline">Clear all</button>
            )}
          </div>
          
          {renderFilterChips("category", "Category", extractUnique("category"))}
          {renderFilterChips("equipment", "Equipment", extractUnique("equipment"))}
          {renderFilterChips("primaryMuscles", "Primary Muscles", extractUnique("primaryMuscles"))}
          {renderFilterChips("muscleArea", "Muscle Area", extractUnique("muscleArea"))}
          {renderFilterChips("movementPattern", "Movement Pattern", extractUnique("movementPattern"))}
          {renderFilterChips("environment", "Environment", extractUnique("environment"))}
          {renderFilterChips("laterality", "Laterality", extractUnique("laterality"))}
          {renderFilterChips("modalitySuitability", "Modality", extractUnique("modalitySuitability"))}
          {renderFilterChips("technicalComplexity", "Technical Complexity", extractUnique("technicalComplexity"))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pl-0 lg:pl-4 border-l border-transparent lg:border-hv-border">
          <div className="text-sm text-hv-text-muted mb-4">{filtered.length} result(s)</div>
          
          {filtered.length === 0 ? (
            <div className="text-center text-hv-text-muted py-12">
              <p>No exercises found matching your criteria.</p>
              <button onClick={() => { setSearch(""); clearAllFilters(); }} className="mt-4 text-hv-primary hover:underline">Clear search and filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(ex => (
                <div key={ex.exerciseId} className="bg-hv-surface-1 border border-hv-border p-4 rounded-lg flex flex-col hover:border-hv-primary transition-colors cursor-pointer">
                  <h3 className="font-semibold mb-1">{ex.name}</h3>
                  <div className="text-sm text-hv-text-muted mb-3 flex-grow">{ex.category}</div>
                  <div className="flex gap-2 flex-wrap mt-auto">
                    {ex.equipment.map(eq => (
                      <span key={eq} className="text-xs bg-hv-surface-2 px-2 py-1 rounded text-hv-text-muted border border-hv-border">
                        {eq}
                      </span>
                    ))}
                    {ex.primaryMuscles?.slice(0, 2).map(m => (
                      <span key={m} className="text-xs bg-hv-bg px-2 py-1 rounded text-hv-text-muted border border-hv-border">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
