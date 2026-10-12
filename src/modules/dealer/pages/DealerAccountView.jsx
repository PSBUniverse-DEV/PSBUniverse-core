"use client";

import { useState } from "react";
import { Button } from "react-bootstrap";

const FIELDS = [
  ["Dealer code", "dealer_code"],
  ["Contact person", "contact_person"],
  ["Email", "email"],
  ["Phone", "phone"],
  ["Mobile", "mobile"],
  ["Address line 1", "address_line1"],
  ["Address line 2", "address_line2"],
  ["City", "city"],
  ["State", "state"],
  ["ZIP code", "postal_code"],
  ["Country", "country"],
];

export default function DealerAccountView({ dealer, username }) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/dealer/logout", { method: "POST" });
    } finally {
      window.location.assign("/dealer/login");
    }
  }

  return (
    <main className="container py-4" style={{ maxWidth: 820 }}>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h3 mb-1">{dealer?.dealer_name || "Dealer account"}</h1>
          <p className="text-muted mb-0">Signed in as {username}</p>
        </div>
        <Button variant="outline-primary" size="sm" onClick={handleLogout} disabled={signingOut}>
          {signingOut ? "Signing out..." : "Logout"}
        </Button>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="h6 mb-3">Account details</h2>
          <dl className="row mb-0">
            {FIELDS.map(([label, key]) => (
              <div className="col-12 col-md-6 mb-2" key={key}>
                <dt className="small text-muted fw-normal">{label}</dt>
                <dd className="mb-0">{String(dealer?.[key] ?? "").trim() || "--"}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </main>
  );
}
