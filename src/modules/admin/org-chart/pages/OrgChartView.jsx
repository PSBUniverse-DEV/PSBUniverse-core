"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/shared/components/ui";
import styles from "./OrgChartView.module.css";

function initialsOf(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

function positionTitle(position) {
  return [position?.department_name, position?.position_name].filter(Boolean).join(" · ");
}

// Each position sits under its first manager on screen (highest on the chart);
// any other managers show as "Also reports to" tags. A position whose managers
// are all hidden (e.g. by the branch filter) starts its own tree.
function buildTree(positions) {
  const byId = new Map(positions.map((p) => [String(p.position_id), p]));
  const orderOf = new Map(positions.map((p, i) => [String(p.position_id), i]));
  const childrenOf = new Map();
  const roots = [];

  positions.forEach((p) => {
    const managers = (p.reports_to_ids || []).map(String).filter((id) => byId.has(id))
      .sort((a, b) => orderOf.get(a) - orderOf.get(b));
    const node = { position: p, also: managers.slice(1).map((id) => byId.get(id)) };
    if (managers.length) childrenOf.set(managers[0], [...(childrenOf.get(managers[0]) || []), node]);
    else roots.push(node);
  });

  const attach = (node, seen) => {
    const id = String(node.position.position_id);
    if (seen.has(id)) return { ...node, children: [] };
    const nextSeen = new Set(seen).add(id);
    return { ...node, children: (childrenOf.get(id) || []).map((child) => attach(child, nextSeen)) };
  };
  return roots.map((root) => attach(root, new Set()));
}

function PositionCard({ node }) {
  const p = node.position;
  return (
    <div className={`${styles.card} ${Number(p.chart_level) === 1 ? styles.cardHead : ""}`}>
      <div className={styles.positionName}>{positionTitle(p)}</div>
      {p.branch ? <div className={styles.positionMeta}>{p.branch}</div> : null}
      {p.people.length ? p.people.map((person) => (
        <div key={String(person.user_id)} className={styles.person}>
          <span className={styles.avatar} aria-hidden="true">{initialsOf(person.full_name)}</span>
          <span>{person.full_name}</span>
        </div>
      )) : <div className={styles.vacant}>Open position</div>}
      {node.also.map((manager) => (
        <span key={String(manager.position_id)} className={styles.alsoTag}>Also reports to {positionTitle(manager)}</span>
      ))}
    </div>
  );
}

function TreeLevel({ nodes, isRoot = false }) {
  return (
    <ul className={isRoot ? styles.rootList : undefined}>
      {nodes.map((node) => (
        <li key={String(node.position.position_id)}>
          <PositionCard node={node} />
          {node.children.length ? <TreeLevel nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  );
}

export default function OrgChartView({ companies = [], positions = [], initialCompanyId = null }) {
  const startId = companies.some((c) => String(c.comp_id) === String(initialCompanyId))
    ? String(initialCompanyId)
    : String(companies[0]?.comp_id ?? "");
  const [companyId, setCompanyId] = useState(startId);
  const [branch, setBranch] = useState("");

  const companyPositions = useMemo(
    () => positions.filter((p) => String(p.comp_id) === companyId),
    [positions, companyId]);
  const branches = useMemo(
    () => [...new Set(companyPositions.map((p) => p.branch).filter(Boolean))].sort(),
    [companyPositions]);
  // A position with no branch belongs to every branch.
  const tree = useMemo(
    () => buildTree(companyPositions.filter((p) => !branch || !p.branch || p.branch === branch)),
    [companyPositions, branch]);

  const chooseCompany = (id) => { setCompanyId(id); setBranch(""); };

  return (
    <main className="container-fluid py-3">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">Org Chart</h1>
          <p className="text-muted mb-0">Drawn from Organization Setup. Change positions or people there and the chart follows.</p>
        </div>
        <Link href={companyId ? `/admin/company-department-setup?company=${companyId}` : "/admin/company-department-setup"}
          className="btn btn-sm btn-outline-primary">Organization Setup</Link>
      </div>

      {companies.length === 0 ? (
        <Card><p className="text-muted mb-0">No active companies.</p></Card>
      ) : (
        <>
          <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 border-bottom mb-3">
            <ul className="nav nav-tabs border-0">
              {companies.map((c) => (
                <li key={String(c.comp_id)} className="nav-item">
                  <button type="button" className={`nav-link ${String(c.comp_id) === companyId ? "active" : ""}`}
                    onClick={() => chooseCompany(String(c.comp_id))}>{c.label}</button>
                </li>
              ))}
            </ul>
            {branches.length ? (
              <div className="d-flex align-items-center gap-1 pb-2">
                <span className="small text-muted me-1">Branch</span>
                {["", ...branches].map((b) => (
                  <Button key={b || "all"} type="button" size="sm" variant={branch === b ? "primary" : "ghost"}
                    onClick={() => setBranch(b)}>{b || "All"}</Button>
                ))}
              </div>
            ) : null}
          </div>

          <Card>
            {tree.length ? (
              <div className={styles.chart}><TreeLevel nodes={tree} isRoot /></div>
            ) : (
              <p className="text-muted mb-0">No positions yet for this company. Add them in Organization Setup.</p>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
