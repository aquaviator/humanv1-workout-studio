import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router";
import { LayoutDashboard, Dumbbell, CalendarRange, Library, Settings, LogIn, Activity, LogOut } from "lucide-react";
import { cn } from "./lib/utils";
import React, { useState, useEffect } from "react";
import exercisesData from "./fixtures/exercises.json";
import workoutsData from "./fixtures/workouts.json";
import plansData from "./fixtures/plans.json";
import protocolsData from "./fixtures/protocols.json";
import WorkoutBuilder from "./ui/pages/WorkoutBuilder";
import PlanBuilder from "./ui/pages/PlanBuilder";
import ProtocolBuilder from "./ui/pages/ProtocolBuilder";
import { authRepository } from "./repositories/LocalAuthRepository";
import { HumanIdentity } from "./domain/identity";

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

function ProtocolLibrary() {
  const [search, setSearch] = React.useState("");
  
  const filtered = protocolsData.filter(p => 
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Protocol Library</h1>
        <Link to="/protocols/new" className="bg-hv-primary text-white px-4 py-2 rounded-md hover:bg-hv-primary-hover font-medium">
          Create Protocol
        </Link>
      </div>
      <input 
        type="text" 
        placeholder="Search protocols..." 
        className="w-full max-w-md bg-hv-surface-1 border border-hv-border rounded-md px-4 py-2 mb-6 focus:outline-none focus:border-hv-primary text-hv-text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto">
        {filtered.map(p => (
          <div key={p.protocolId} className="bg-hv-surface-1 border border-hv-border p-4 rounded-lg flex flex-col">
            <h3 className="font-semibold mb-1">{p.title}</h3>
            <div className="text-sm text-hv-text-muted mb-3 flex-grow">{p.protocolType}</div>
            <p className="text-sm text-hv-text-muted mb-3 line-clamp-3">{p.summary}</p>
            <div className="flex gap-2 flex-wrap mt-auto">
              {p.suitability.map(s => (
                <span key={s} className="text-xs bg-hv-surface-2 px-2 py-1 rounded text-hv-text-muted">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountSettings({ identity }: { identity: HumanIdentity }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Account</h1>
      <div className="bg-hv-surface-1 border border-hv-border p-6 rounded-lg max-w-md">
        <h2 className="text-xl font-semibold mb-4">Profile</h2>
        <div className="mb-4">
          <div className="text-sm text-hv-text-muted">Display Name</div>
          <div>{identity.displayName}</div>
        </div>
        <div className="mb-4">
          <div className="text-sm text-hv-text-muted">Email</div>
          <div>{identity.email}</div>
        </div>
        <div className="mb-8">
          <div className="text-sm text-hv-text-muted">User ID</div>
          <div className="text-xs font-mono bg-hv-surface-2 p-2 rounded mt-1 overflow-x-auto">{identity.humanUserId}</div>
        </div>
        
        <button 
          onClick={() => authRepository.signOut()}
          className="flex items-center gap-2 px-4 py-2 border border-hv-error text-hv-error hover:bg-hv-error hover:text-white rounded-md transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [identity, setIdentity] = useState<HumanIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = authRepository.onAuthStateChanged((user) => {
      setIdentity(user);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleSignIn = async () => {
    try {
      await authRepository.signIn();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-hv-bg flex items-center justify-center text-hv-text-muted">Loading...</div>;
  }

  if (!identity) {
    return (
      <div className="min-h-screen bg-hv-bg flex items-center justify-center p-4 text-hv-text">
        <div className="max-w-md w-full bg-hv-surface-1 border border-hv-border rounded-xl p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">HumanV1 Workout Studio</h1>
          <p className="text-hv-text-muted mb-8">Sign in to design and manage your workouts and plans.</p>
          <div className="text-xs text-hv-warning mb-4 p-2 bg-hv-surface-2 rounded border border-hv-warning/30">
            Local Development Mode
          </div>
          <button 
            onClick={handleSignIn}
            className="w-full bg-hv-primary hover:bg-hv-primary-hover text-white rounded-md py-3 font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Local Dev Identity
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
            <Route path="/workouts/new" element={<WorkoutBuilder identity={identity} />} />
            <Route path="/plans" element={<PlansList />} />
            <Route path="/plans/new" element={<PlanBuilder identity={identity} />} />
            <Route path="/library/exercises" element={<ExerciseLibrary />} />
            <Route path="/library/protocols" element={<ProtocolLibrary />} />
            <Route path="/protocols/new" element={<ProtocolBuilder identity={identity} />} />
            <Route path="/account" element={<AccountSettings identity={identity} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
