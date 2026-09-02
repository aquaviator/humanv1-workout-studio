import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router";
import { LayoutDashboard, Dumbbell, CalendarRange, Library, Settings, LogIn, Activity, UserRound } from "lucide-react";
import { cn } from "./lib/utils";
import React, { useState, useEffect, Suspense } from "react";
import { authRepository } from "./repositories/AuthManager";
import { HumanIdentity } from "./domain/identity";
import { Entitlement } from "./domain/entitlement";
import { entitlementRepository } from "./repositories/FirebaseEntitlementRepository";
import EntitlementGate from "./ui/components/EntitlementGate";
import { env } from "./config/env";

const WorkoutBuilder = React.lazy(() => import("./ui/pages/WorkoutBuilder"));
const PlanBuilder = React.lazy(() => import("./ui/pages/PlanBuilder"));
const ProtocolBuilder = React.lazy(() => import("./ui/pages/ProtocolBuilder"));
const Dashboard = React.lazy(() => import("./ui/pages/Dashboard"));
const WorkoutsList = React.lazy(() => import("./ui/pages/WorkoutsList"));
const PlansList = React.lazy(() => import("./ui/pages/PlansList"));
const ExerciseLibrary = React.lazy(() => import("./ui/pages/ExerciseLibrary"));
const ProtocolLibrary = React.lazy(() => import("./ui/pages/ProtocolLibrary"));
const AccountSettings = React.lazy(() => import("./ui/pages/AccountSettings"));
const ConflictCentre = React.lazy(() => import("./ui/pages/ConflictCentre"));
const MyExercises = React.lazy(() => import("./ui/pages/MyExercises"));

function Navigation() {
  const location = useLocation();
  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: Dumbbell, label: "Workouts", path: "/workouts" },
    { icon: CalendarRange, label: "Plans", path: "/plans" },
    { icon: Library, label: "Exercises", path: "/library/exercises" },
    { icon: UserRound, label: "My Exercises", path: "/my-exercises" },
    { icon: Activity, label: "Protocols", path: "/library/protocols" },
    { icon: Activity, label: "Conflicts", path: "/conflicts" },
    { icon: Settings, label: "Account", path: "/account" },
  ];

  return (
    <nav className="w-64 border-r border-hv-border bg-hv-surface-1 flex flex-col">
      <div className="p-6">
        <h2 className="text-xl font-bold tracking-tight">Workout Studio</h2>
      </div>
      <div className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                isActive 
                  ? "bg-hv-primary/10 text-hv-primary font-medium" 
                  : "text-hv-text-muted hover:text-hv-text hover:bg-hv-surface-2"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function App() {
  const [identity, setIdentity] = useState<HumanIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  useEffect(() => {
    const unsubscribe = authRepository.onAuthStateChanged((user) => {
      setIdentity(user);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    setEntitlement(null);
    if (!identity) return;
    return entitlementRepository.onEntitlementChanged(identity.humanUserId, setEntitlement);
  }, [identity]);

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
          {env.isDev && <div className="text-xs text-hv-warning mb-4 p-2 bg-hv-surface-2 rounded border border-hv-warning/30">Local Development Mode</div>}
          <button 
            onClick={handleSignIn}
            className="w-full bg-hv-primary hover:bg-hv-primary-hover text-white rounded-md py-3 font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn className="w-5 h-5" />
            {env.isDev ? 'Sign in with Local Dev Identity' : 'Sign in with Google'}
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
          <Suspense fallback={<div className="p-8 text-hv-text-muted">Loading...</div>}>
            <Routes>
              <Route path="/" element={<EntitlementGate entitlement={entitlement}><Dashboard identity={identity} /></EntitlementGate>} />
              <Route path="/workouts" element={<EntitlementGate entitlement={entitlement}><WorkoutsList identity={identity} /></EntitlementGate>} />
              <Route path="/workouts/new" element={<EntitlementGate entitlement={entitlement}><WorkoutBuilder identity={identity} /></EntitlementGate>} />
              <Route path="/workouts/:workoutId" element={<EntitlementGate entitlement={entitlement}><WorkoutBuilder identity={identity} /></EntitlementGate>} />
              <Route path="/plans" element={<EntitlementGate entitlement={entitlement}><PlansList identity={identity} /></EntitlementGate>} />
              <Route path="/plans/new" element={<EntitlementGate entitlement={entitlement}><PlanBuilder identity={identity} /></EntitlementGate>} />
              <Route path="/plans/:planId" element={<EntitlementGate entitlement={entitlement}><PlanBuilder identity={identity} /></EntitlementGate>} />
              <Route path="/library/exercises" element={<EntitlementGate entitlement={entitlement}><ExerciseLibrary /></EntitlementGate>} />
              <Route path="/my-exercises" element={<EntitlementGate entitlement={entitlement}><MyExercises identity={identity} /></EntitlementGate>} />
              <Route path="/library/protocols" element={<EntitlementGate entitlement={entitlement}><ProtocolLibrary identity={identity} /></EntitlementGate>} />
              <Route path="/protocols/new" element={<EntitlementGate entitlement={entitlement}><ProtocolBuilder identity={identity} /></EntitlementGate>} />
              <Route path="/conflicts" element={<EntitlementGate entitlement={entitlement}><ConflictCentre identity={identity} /></EntitlementGate>} />
              <Route path="/account" element={<AccountSettings identity={identity} />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </BrowserRouter>
  );
}
