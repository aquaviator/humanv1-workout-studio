import React, { useState, useEffect } from "react";
import { HumanIdentity } from "../../domain/identity";
import { Entitlement } from "../../domain/entitlement";
import { entitlementRepository } from "../../repositories/FirebaseEntitlementRepository";
import { authRepository } from "../../repositories/AuthManager";
import { LogOut } from "lucide-react";

export default function AccountSettings({ identity }: { identity: HumanIdentity }) {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  useEffect(() => {
    return entitlementRepository.onEntitlementChanged(identity.humanUserId, setEntitlement);
  }, [identity.humanUserId]);

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
        <div className="mb-4">
          <div className="text-sm text-hv-text-muted">Workout Studio access</div>
          <div>{entitlement ? entitlement.state : "LOADING..."}</div>
          {entitlement?.expiresAt && <div className="text-sm text-hv-text-muted">Until {new Date(entitlement.expiresAt).toLocaleString()}</div>}
        </div>
        <div className="mb-4">
          <div className="text-sm text-hv-text-muted">Introductory access</div>
          <div>{entitlement?.introductoryState ?? "NOT REPORTED"}</div>
          {entitlement?.introductoryExpiredAt && <div className="text-sm text-hv-text-muted">Ended {new Date(entitlement.introductoryExpiredAt).toLocaleString()}</div>}
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
