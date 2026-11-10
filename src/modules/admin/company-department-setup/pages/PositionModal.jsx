"use client";

import { useMemo, useState } from "react";
import { Button, Input, Modal, toastError } from "@/shared/components/ui";
import { saveOrgPositionAction } from "../data/companyDepartmentSetup.actions.js";

// Row on the org chart, top to bottom.
const CHART_LEVELS = [
  { value: 1, label: "1 · Head" },
  { value: 2, label: "2 · Lead" },
  { value: 3, label: "3 · Team Lead" },
  { value: 4, label: "4 · Member" },
  { value: 5, label: "5 · Support" },
];
const MAX_CANDIDATES = 50;

/** "Scheduling · Team Lead", "Company Head (Texas)". */
export function positionLabel(position, departmentNameById) {
  if (!position) return "";
  const dept = position.dept_id != null ? departmentNameById.get(String(position.dept_id)) : "";
  const branch = position.branch ? ` (${position.branch})` : "";
  return `${dept ? `${dept} · ` : ""}${position.position_name || ""}${branch}`;
}

/**
 * Add / Edit Position. Saves straight away (not part of Save Batch).
 * departments: the company's saved departments; positions: the company's positions.
 */
export default function PositionModal({ company, position, departments, positions, users, onClose, onSaved }) {
  const isEdit = Boolean(position?.position_id);
  const [name, setName] = useState(position?.position_name || "");
  const [deptId, setDeptId] = useState(position?.dept_id != null ? String(position.dept_id) : "");
  const [branch, setBranch] = useState(position?.branch || "");
  const [chartLevel, setChartLevel] = useState(String(position?.chart_level ?? 4));
  const [reportsTo, setReportsTo] = useState(() => (position?.reports_to_ids || []).map((id) => String(id)));
  const [holderIds, setHolderIds] = useState(() => (position?.holders || []).map((h) => String(h.user_id)));
  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const deptNameById = useMemo(
    () => new Map((departments || []).map((d) => [String(d.dept_id), d.dept_name])), [departments]);
  const reportOptions = useMemo(() => (positions || [])
    .filter((p) => String(p.position_id) !== String(position?.position_id ?? ""))
    .map((p) => ({
      id: String(p.position_id),
      label: positionLabel(p, deptNameById),
      people: (p.holders || []).map((h) => h.full_name).join(", "),
    })), [deptNameById, position?.position_id, positions]);
  const branchSuggestions = useMemo(
    () => [...new Set((positions || []).map((p) => p.branch).filter(Boolean))], [positions]);
  const userById = useMemo(() => new Map((users || []).map((u) => [String(u.user_id), u])), [users]);
  const holderRows = holderIds.map((id) => {
    const saved = (position?.holders || []).find((h) => String(h.user_id) === id);
    return { id, name: userById.get(id)?.full_name || saved?.full_name || `User ${id}`, isMain: Boolean(saved?.is_primary) };
  });
  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users || [])
      .filter((u) => !holderIds.includes(String(u.user_id)))
      .filter((u) => !q || [u.full_name, u.username, u.email].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [holderIds, search, users]);

  const toggleReport = (id) => setReportsTo((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addHolder = (user) => {
    const id = String(user?.user_id ?? "");
    if (!id || holderIds.includes(id)) return;
    setHolderIds((prev) => [...prev, id]);
  };

  const removeHolder = (id) => {
    const key = String(id);
    setHolderIds((prev) => prev.filter((x) => String(x) !== key));
  };

  const handleSave = async () => {
    if (!name.trim()) { toastError("Position name is required."); return; }
    setIsSaving(true);
    try {
      const result = await saveOrgPositionAction({
        position_id: position?.position_id ?? null,
        comp_id: company.comp_id,
        dept_id: deptId || null,
        position_name: name,
        branch,
        chart_level: Number(chartLevel),
        reports_to_ids: reportsTo,
        user_ids: holderIds,
      });
      if (!result?.success) {
        toastError(result?.error || "Failed to save the position.");
        return;
      }
      await onSaved?.(isEdit ? "Position saved." : "Position added.");
    } catch (error) {
      toastError(error?.message || "Failed to save the position.");
    } finally {
      setIsSaving(false);
    }
  };

  const footer = (
    <>
      <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>Cancel</Button>
      <Button type="button" variant="primary" onClick={handleSave} loading={isSaving}>{isEdit ? "Save" : "Add Position"}</Button>
    </>
  );

  return (
    <Modal show onHide={isSaving ? undefined : onClose} title={isEdit ? "Edit Position" : "Add Position"} footer={footer} size="lg" backdrop="static">
      <div className="d-flex flex-column gap-3">
        <div className="small text-muted">Company: <strong>{company?.comp_name || ""}</strong></div>

        <div className="row g-2">
          <div className="col-12 col-md-6">
            <label className="form-label mb-1">Position Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter position name" autoFocus />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label mb-1">Department</label>
            <Input as="select" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">Company-level</option>
              {(departments || []).map((dept) => (
                <option key={String(dept.dept_id)} value={String(dept.dept_id)}>{dept.dept_name}</option>
              ))}
            </Input>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label mb-1">Branch</label>
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Optional branch" list="branch-options" />
            <datalist id="branch-options">
              {(branchSuggestions || []).map((value) => <option key={value} value={value} />)}
            </datalist>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label mb-1">Chart Level</label>
            <Input as="select" value={chartLevel} onChange={(e) => setChartLevel(e.target.value)}>
              {CHART_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>{level.label}</option>
              ))}
            </Input>
          </div>
        </div>

        <div className="p-2 border rounded bg-light">
          <div className="small fw-semibold mb-2">Reports to</div>
          {reportOptions.length === 0 ? (
            <div className="small text-muted">No other positions in this company yet.</div>
          ) : (
            <div className="d-flex flex-wrap gap-2">
              {reportOptions.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={reportsTo.includes(option.id) ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => toggleReport(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="d-flex flex-column gap-2">
          <label className="form-label mb-0">People</label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, username or email" />
          <div className="border rounded" style={{ maxHeight: 220, overflowY: "auto" }}>
            {matching.length === 0 ? (
              <div className="p-2 small text-muted">No users available to add.</div>
            ) : (
              matching.slice(0, MAX_CANDIDATES).map((user) => (
                <div key={String(user.user_id)} className="d-flex align-items-center justify-content-between gap-2 px-2 py-2 border-bottom">
                  <div className="small">
                    <div className="fw-semibold">{user.full_name}</div>
                    <div className="text-muted">{user.username} · {user.email}</div>
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={() => addHolder(user)}>Add</Button>
                </div>
              ))
            )}
          </div>

          {holderRows.length > 0 ? (
            <div className="border rounded p-2 d-flex flex-column gap-2">
              {holderRows.map((row) => (
                <div key={row.id} className="d-flex align-items-center justify-content-between gap-3 border rounded p-2">
                  <div className="small">
                    <span className="fw-semibold">{row.name}</span>
                    {row.isMain ? <span className="ms-2 text-warning fw-semibold">★ Main seat</span> : null}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeHolder(row.id)}>Remove</Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="small text-muted">No people assigned.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
