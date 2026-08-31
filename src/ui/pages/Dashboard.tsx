import React, { useState, useEffect } from "react";
import { Link } from "react-router";
import { HumanIdentity } from "../../domain/identity";

export default function Dashboard({ identity }: { identity: HumanIdentity }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <p className="text-hv-text-muted">Welcome to your workspace, {identity.displayName}.</p>
    </div>
  );
}
