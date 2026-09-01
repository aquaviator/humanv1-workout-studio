import React, { useState, useEffect } from "react";
import { Link } from "react-router";
import { HumanIdentity } from "../../domain/identity";
import { Protocol } from "../../domain/types";
import { draftRepository } from "../../repositories/DraftRepository";

export default function ProtocolLibrary({ identity }: { identity: HumanIdentity }) {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  useEffect(() => {
    draftRepository.listProtocolDrafts(identity.humanUserId).then(setProtocols);
  }, [identity.humanUserId]);

  const [search, setSearch] = useState("");
  const filtered = protocols.filter(p => 
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
