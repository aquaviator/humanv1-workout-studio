import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, Search, Archive } from "lucide-react";
import { HumanIdentity } from "../../domain/identity";
import { PrivateExercise } from "../../domain/catalogue";
import { crossAppRepository } from "../../repositories/CrossAppRepository";

const emptyMetrics = { primary: ["repetitions"], secondary: [] as string[], optional: ["external_load"], unsupported: [] as string[] };

export default function MyExercises({ identity }: { identity: HumanIdentity }) {
  const [items, setItems] = useState<PrivateExercise[]>([]);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<PrivateExercise | null | undefined>(undefined);
  const refresh = () => crossAppRepository.listPrivateExercises(identity.humanUserId, true).then(setItems);
  useEffect(() => { void refresh(); }, [identity.humanUserId]);
  const filtered = useMemo(() => items.filter(item => (showArchived || !item.deletedAt) && `${item.name} ${item.category} ${item.equipment.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [items, query, showArchived]);
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const metrics = String(form.get("metrics") || "").split(",").map(value => value.trim()).filter(Boolean);
    await crossAppRepository.savePrivateExercise(identity.humanUserId, {
      ...(editing || {}), name: String(form.get("name")), description: String(form.get("description")), category: String(form.get("category")),
      equipment: String(form.get("equipment") || "").split(",").map(value => value.trim()).filter(Boolean),
      metricProfile: { ...emptyMetrics, primary: metrics.length ? metrics : ["repetitions"] },
    });
    setEditing(undefined); await refresh();
  };
  return <div className="p-8 max-w-6xl mx-auto">
    <div className="flex justify-between items-center mb-6"><div><h1 className="text-2xl font-bold">My Exercises</h1><p className="text-hv-text-muted">Private to your HumanV1 account. These are not governed catalogue exercises.</p></div><button onClick={() => setEditing(null)} className="bg-hv-primary text-white px-4 py-2 rounded-md flex gap-2"><Plus className="w-4"/>Create exercise</button></div>
    <div className="flex gap-3 mb-5"><label className="relative flex-1"><Search className="absolute left-3 top-3 w-4 text-hv-text-muted"/><input aria-label="Search your exercises" value={query} onChange={e => setQuery(e.target.value)} className="w-full pl-9 p-2 bg-hv-surface-1 border border-hv-border rounded-md" placeholder="Search name, movement, equipment"/></label><button onClick={() => setShowArchived(value => !value)} className="border border-hv-border px-3 rounded-md">{showArchived ? "Hide archived" : "Show archived"}</button></div>
    <div className="grid md:grid-cols-2 gap-3">{filtered.map(item => <article key={item.exerciseId} className="border border-hv-border bg-hv-surface-1 rounded-lg p-4"><div className="flex justify-between"><div><div className="flex gap-2 items-center"><h2 className="font-semibold">{item.name}</h2><span className="text-xs px-2 py-0.5 bg-hv-primary/10 text-hv-primary rounded-full">Your Exercise</span></div><p className="text-sm text-hv-text-muted">{item.category} · {item.metricProfile.primary.join(", ")}</p></div><span className="text-xs text-hv-text-muted">{item.syncState}</span></div><p className="text-sm mt-2">{item.description}</p><div className="flex gap-2 mt-4"><button onClick={() => setEditing(item)} className="text-sm text-hv-primary">Edit</button><button onClick={async () => { await crossAppRepository.setPrivateExerciseArchived(identity.humanUserId, item.exerciseId, !item.deletedAt); refresh(); }} className="text-sm flex gap-1">{item.deletedAt ? <><RotateCcw className="w-4"/>Restore</> : <><Archive className="w-4"/>Archive</>}</button></div></article>)}</div>
    {editing !== undefined && <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"><form onSubmit={save} className="bg-hv-surface-1 border border-hv-border p-6 rounded-xl w-full max-w-lg space-y-4"><h2 className="text-xl font-bold">{editing ? "Edit your exercise" : "Create your exercise"}</h2><label className="block text-sm">Name<input name="name" defaultValue={editing?.name} required className="block w-full p-2 bg-hv-bg border border-hv-border rounded"/></label><label className="block text-sm">Instructions<textarea name="description" defaultValue={editing?.description} className="block w-full p-2 bg-hv-bg border border-hv-border rounded"/></label><label className="block text-sm">Movement / category<input name="category" defaultValue={editing?.category || "Strength"} required className="block w-full p-2 bg-hv-bg border border-hv-border rounded"/></label><label className="block text-sm">Equipment (comma separated)<input name="equipment" defaultValue={editing?.equipment.join(", ")} className="block w-full p-2 bg-hv-bg border border-hv-border rounded"/></label><label className="block text-sm">Tracked metrics (comma separated)<input name="metrics" defaultValue={editing?.metricProfile.primary.join(", ") || "repetitions"} required className="block w-full p-2 bg-hv-bg border border-hv-border rounded"/></label><p className="text-xs text-hv-text-muted">Declare only capabilities this exercise genuinely supports.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(undefined)}>Cancel</button><button className="bg-hv-primary text-white px-4 py-2 rounded">Save</button></div></form></div>}
  </div>;
}
