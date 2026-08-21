import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router";
import { LayoutDashboard, Dumbbell, CalendarRange, Library, Settings, LogIn, Activity } from "lucide-react";
import { cn } from "./lib/utils";
import React, { useState } from "react";
import exercisesData from "./fixtures/exercises.json";
import workoutsData from "./fixtures/workouts.json";
import plansData from "./fixtures/plans.json";
import WorkoutBuilder from "./ui/pages/WorkoutBuilder";
import PlanBuilder from "./ui/pages/PlanBuilder";

function Navigation() {
  const location = useLocation();
  const navItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Workouts", path: "/workouts", icon: Dumbbell },
    { name: "Plans", path: "/plans", icon: CalendarRange },
    { name: "Exercise Library", path: "/library/exercises", icon: Library },
    { name: "Protocol Library", path: "/library/protocols", icon: Activity },
  ];

  return (
    <nav className="flex flex-col gap-2 p-4 border-r border-hv-border bg-hv-surface-1 w-64 h-full hidden md:flex">
      <div className="mb-8 px-2 text-xl font-semibold text-hv-text">
        Workout Studio
      </div>
      {navItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
            location.pathname === item.path
              ? "bg-hv-primary text-white"
              : "text-hv-text-muted hover:bg-hv-surface-2 hover:text-hv-text"
          )}
        >
          <item.icon className="w-5 h-5" />
          <span>{item.name}</span>
        </Link>
      ))}
      <div className="mt-auto">
        <Link
          to="/account"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
            location.pathname === "/account"
              ? "bg-hv-primary text-white"
              : "text-hv-text-muted hover:bg-hv-surface-2 hover:text-hv-text"
          )}
        >
          <Settings className="w-5 h-5" />
          <span>Account</span>
        </Link>
      </div>
    </nav>
  );
}

// Pages placeholders
function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-hv-surface-1 border border-hv-border p-4 rounded-lg">
          <h2 className="font-semibold text-hv-text-muted mb-2">Recent Workouts</h2>
          <div className="text-2xl font-bold">{workoutsData.length}</div>
        </div>
        <div className="bg-hv-surface-1 border border-hv-border p-4 rounded-lg">
          <h2 className="font-semibold text-hv-text-muted mb-2">Active Plans</h2>
          <div className="text-2xl font-bold">{plansData.length}</div>
        </div>
      </div>
    </div>
  );
}

function WorkoutsList() {
  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Workouts</h1>
        <Link to="/workouts/new" className="bg-hv-primary text-white px-4 py-2 rounded-md hover:bg-hv-primary-hover font-medium">
          Create Workout
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {workoutsData.map(workout => (
          <div key={workout.workoutId} className="bg-hv-surface-1 border border-hv-border p-4 rounded-lg flex flex-col cursor-pointer hover:border-hv-primary transition-colors">
            <h2 className="font-semibold mb-1">{workout.title}</h2>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs bg-hv-surface-2 px-2 py-1 rounded text-hv-text-muted uppercase tracking-wider font-semibold">
                {workout.discipline}
              </span>
              <span className="text-xs text-hv-text-muted">
                {Math.round((workout.estimatedDurationSeconds || 0) / 60)} min
              </span>
            </div>
            <p className="text-sm text-hv-text-muted line-clamp-2 mt-auto">
              {workout.description || "No description provided."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlansList() {
  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Plans</h1>
        <Link to="/plans/new" className="bg-hv-primary text-white px-4 py-2 rounded-md hover:bg-hv-primary-hover font-medium">
          Create Plan
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plansData.map(plan => (
          <div key={plan.planId} className="bg-hv-surface-1 border border-hv-border p-4 rounded-lg cursor-pointer hover:border-hv-primary transition-colors">
            <h2 className="font-semibold mb-2">{plan.title}</h2>
            <p className="text-sm text-hv-text-muted mb-4">{plan.description}</p>
            <div className="text-xs text-hv-text-muted bg-hv-surface-2 inline-block px-2 py-1 rounded">
              {plan.weeks.length} {plan.weeks.length === 1 ? 'week' : 'weeks'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExerciseLibrary() {
  const [search, setSearch] = React.useState("");
  
  const filtered = exercisesData.filter(ex => 
    ex.name.toLowerCase().includes(search.toLowerCase()) ||
    ex.aliases.some(a => a.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-8 h-full flex flex-col">
      <h1 className="text-2xl font-bold mb-6">Exercise Library</h1>
      <input 
        type="text" 
        placeholder="Search exercises..." 
        className="w-full max-w-md bg-hv-surface-1 border border-hv-border rounded-md px-4 py-2 mb-6 focus:outline-none focus:border-hv-primary text-hv-text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto">
        {filtered.map(ex => (
          <div key={ex.exerciseId} className="bg-hv-surface-1 border border-hv-border p-4 rounded-lg flex flex-col">
            <h3 className="font-semibold mb-1">{ex.name}</h3>
            <div className="text-sm text-hv-text-muted mb-3 flex-grow">{ex.category}</div>
            <div className="flex gap-2 flex-wrap">
              {ex.equipment.map(eq => (
                <span key={eq} className="text-xs bg-hv-surface-2 px-2 py-1 rounded text-hv-text-muted">
                  {eq}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-hv-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-hv-surface-1 border border-hv-border rounded-xl p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">HumanV1 Workout Studio</h1>
          <p className="text-hv-text-muted mb-8">Sign in to design and manage your workouts and plans.</p>
          <button 
            onClick={() => setIsAuthenticated(true)}
            className="w-full bg-hv-primary hover:bg-hv-primary-hover text-white rounded-md py-3 font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-hv-bg text-hv-text overflow-hidden">
        <Navigation />
        <main className="flex-1 overflow-y-auto relative">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/workouts" element={<WorkoutsList />} />
            <Route path="/workouts/new" element={<WorkoutBuilder />} />
            <Route path="/plans" element={<PlansList />} />
            <Route path="/plans/new" element={<PlanBuilder />} />
            <Route path="/library/exercises" element={<ExerciseLibrary />} />
            <Route path="/account" element={<div className="p-8">Account Settings Placeholder</div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
