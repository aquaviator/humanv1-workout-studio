import React, { useState, useEffect } from "react";
import { Link } from "react-router";
import { HumanIdentity } from "../../domain/identity";
import { Plan } from "../../domain/types";
import { draftRepository } from "../../repositories/DraftRepository";

export default function PlansList({ identity }: { identity: HumanIdentity }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    draftRepository.listPlanDrafts(identity.humanUserId).then(setPlans);
  }, [identity.humanUserId]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Plans</h1>
        <Link to="/plans/new" className="bg-hv-primary text-white px-4 py-2 rounded-md hover:bg-hv-primary-hover font-medium">
          Create Plan
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plans.map(plan => (
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
