"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";
import { refreshUserSeats } from "./orgSeats.server.js";

// ─── Private helpers ───────────────────────────────────────

function normalizeText(value, fallback = "") {
  const text = String(value ?? fallback).trim();
  return text;
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

// ─── Load data ─────────────────────────────────────────────

export async function loadCompanyDepartmentSetupData() {
  const supabase = getSupabaseAdmin();

  const [{ data: companies, error: cErr }, { data: departments, error: dErr }] =
    await Promise.all([
      supabase.from("psb_s_company").select("*").order("comp_name", { ascending: true }),
      supabase.from("psb_s_department").select("*").order("dept_name", { ascending: true }),
    ]);

  if (cErr) throw new Error(cErr.message || "Failed to fetch companies");
  if (dErr) throw new Error(dErr.message || "Failed to fetch departments");

  return {
    companies: Array.isArray(companies) ? companies : [],
    departments: Array.isArray(departments) ? departments : [],
  };
}

// ─── Company Actions ───────────────────────────────────────

export async function createCompanyAction(payload) {
  const supabase = getSupabaseAdmin();
  const compName = normalizeText(payload?.comp_name);
  if (!compName) throw new Error("Company name is required.");

  const insertPayload = {
    comp_name: compName,
    // The column is short_name; the screen calls the field comp_short_name.
    short_name: normalizeText(payload?.comp_short_name) || null,
    comp_email: normalizeText(payload?.comp_email) || null,
    comp_phone: normalizeText(payload?.comp_phone) || null,
    is_active: payload?.is_active !== undefined ? payload.is_active : true,
  };

  const { data, error } = await supabase.from("psb_s_company").insert(insertPayload).select("*").single();
  if (error) throw new Error(error.message || "Failed to create company");
  return data;
}

export async function updateCompanyAction(companyId, updates) {
  if (companyId == null || companyId === "") throw new Error("Company ID is required.");
  const supabase = getSupabaseAdmin();
  const patch = {};

  if (hasOwn(updates, "comp_name")) {
    const name = normalizeText(updates.comp_name);
    if (!name) throw new Error("Company name cannot be empty.");
    patch.comp_name = name;
  }
  if (hasOwn(updates, "comp_short_name")) patch.short_name = normalizeText(updates.comp_short_name) || null;
  if (hasOwn(updates, "comp_email")) patch.comp_email = normalizeText(updates.comp_email) || null;
  if (hasOwn(updates, "comp_phone")) patch.comp_phone = normalizeText(updates.comp_phone) || null;
  if (hasOwn(updates, "is_active")) patch.is_active = updates.is_active;
  if (Object.keys(patch).length === 0) throw new Error("No valid fields to update.");

  const { data, error } = await supabase.from("psb_s_company").update(patch).eq("comp_id", companyId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update company");
  return data;
}

export async function deactivateCompanyAction(companyId) {
  if (companyId == null || companyId === "") throw new Error("Company ID is required.");
  const supabase = getSupabaseAdmin();

  // Cascade deactivate linked departments (all in one query)
  await supabase.from("psb_s_department").update({ is_active: false }).eq("comp_id", companyId);

  const { data, error } = await supabase.from("psb_s_company").update({ is_active: false }).eq("comp_id", companyId).select("*").single();
  if (error) throw new Error(error.message || "Failed to deactivate company");
  return data;
}

export async function hardDeleteCompanyAction(companyId) {
  if (companyId == null || companyId === "") throw new Error("Company ID is required.");
  const supabase = getSupabaseAdmin();

  // Cascade delete linked departments (counted first for the reply, then deleted in one query)
  const { data: linkedDepts } = await supabase.from("psb_s_department").select("dept_id").eq("comp_id", companyId);
  if ((linkedDepts || []).length > 0) {
    await supabase.from("psb_s_department").delete().eq("comp_id", companyId);
  }

  const { error } = await supabase.from("psb_s_company").delete().eq("comp_id", companyId);
  if (error) throw new Error(error.message || "Failed to permanently delete company");
  return { companyId, deletedDepartmentCount: (linkedDepts || []).length, permanentlyDeleted: true };
}

// ─── Department Actions ────────────────────────────────────

export async function createDepartmentAction(payload) {
  const supabase = getSupabaseAdmin();
  const deptName = normalizeText(payload?.dept_name);
  if (!deptName) throw new Error("Department name is required.");
  const compId = payload?.comp_id;
  if (compId == null || compId === "") throw new Error("Company ID is required.");

  const insertPayload = {
    comp_id: compId,
    dept_name: deptName,
    // The column is short_name; the screen calls the field dept_short_name.
    short_name: normalizeText(payload?.dept_short_name) || null,
    is_active: payload?.is_active !== undefined ? payload.is_active : true,
  };

  const { data, error } = await supabase.from("psb_s_department").insert(insertPayload).select("*").single();
  if (error) throw new Error(error.message || "Failed to create department");
  return data;
}

export async function updateDepartmentAction(departmentId, updates) {
  if (departmentId == null || departmentId === "") throw new Error("Department ID is required.");
  const supabase = getSupabaseAdmin();
  const patch = {};

  if (hasOwn(updates, "dept_name")) {
    const name = normalizeText(updates.dept_name);
    if (!name) throw new Error("Department name cannot be empty.");
    patch.dept_name = name;
  }
  if (hasOwn(updates, "dept_short_name")) patch.short_name = normalizeText(updates.dept_short_name) || null;
  if (hasOwn(updates, "is_active")) patch.is_active = updates.is_active;
  if (Object.keys(patch).length === 0) throw new Error("No valid fields to update.");

  const { data, error } = await supabase.from("psb_s_department").update(patch).eq("dept_id", departmentId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update department");
  return data;
}

export async function deactivateDepartmentAction(departmentId) {
  if (departmentId == null || departmentId === "") throw new Error("Department ID is required.");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.from("psb_s_department").update({ is_active: false }).eq("dept_id", departmentId).select("*").single();
  if (error) throw new Error(error.message || "Failed to deactivate department");
  return data;
}

export async function hardDeleteDepartmentAction(departmentId) {
  if (departmentId == null || departmentId === "") throw new Error("Department ID is required.");
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("psb_s_department").delete().eq("dept_id", departmentId);
  if (error) throw new Error(error.message || "Failed to permanently delete department");
  return { departmentId, permanentlyDeleted: true };
}

// ─── Batch save ────────────────────────────────────────────

// Same prefixes as TEMP_COMPANY_PREFIX / TEMP_DEPARTMENT_PREFIX in companyDepartmentSetup.data.js.
const TEMP_COMPANY_ID_PREFIX = "tmp-company-";
const TEMP_DEPARTMENT_ID_PREFIX = "tmp-department-";

/**
 * Saves a whole staged batch in ONE call from the browser (it used to be one
 * call per change). Same step order as before: company creates → company
 * edits → company deactivations → department creates → department edits →
 * department deactivations → department deletes → company deletes. The items
 * of each step run together. Returns { companyIdMap: { tempId: newId } }.
 */
export async function saveCompanyDepartmentBatch(companyChanges, departmentChanges) {
  const companies = companyChanges || {};
  const departments = departmentChanges || {};
  const companyIdMap = {};
  const isTempCompany = (id) => String(id ?? "").startsWith(TEMP_COMPANY_ID_PREFIX);
  const isTempDepartment = (id) => String(id ?? "").startsWith(TEMP_DEPARTMENT_ID_PREFIX);
  const resolveCompanyId = (id) => companyIdMap[String(id ?? "")] ?? id;
  const deactivatedCompanySet = new Set(
    [...(companies.deactivations || []), ...(companies.hardDeletes || [])].map((id) => String(id ?? "")),
  );
  const deactivatedDepartmentSet = new Set(
    [...(departments.deactivations || []), ...(departments.hardDeletes || [])].map((id) => String(id ?? "")),
  );

  // People seated in a company or department this batch touches. Read before
  // the changes (a delete may remove their seats), refreshed after them.
  const touchedCompanyIds = [
    ...Object.keys(companies.updates || {}), ...(companies.deactivations || []), ...(companies.hardDeletes || []),
  ].filter((id) => !isTempCompany(id)).map(toIdOrNull).filter((id) => id != null);
  const touchedDepartmentIds = [
    ...Object.keys(departments.updates || {}), ...(departments.deactivations || []), ...(departments.hardDeletes || []),
  ].filter((id) => !isTempDepartment(id)).map(toIdOrNull).filter((id) => id != null);
  const seatedUserIds = await seatedUsersIn(touchedCompanyIds, touchedDepartmentIds);

  await Promise.all((companies.creates || []).map(async (entry) => {
    const created = await createCompanyAction(entry.payload);
    const id = created?.comp_id;
    if (id == null || id === "") throw new Error("Created company response is invalid.");
    companyIdMap[String(entry.tempId)] = id;
  }));

  await Promise.all(Object.entries(companies.updates || {}).map(async ([companyId, updates]) => {
    const resolved = resolveCompanyId(companyId);
    if (deactivatedCompanySet.has(String(resolved)) || isTempCompany(resolved)) return;
    if (Object.keys(updates || {}).length === 0) return;
    await updateCompanyAction(resolved, updates);
  }));

  await Promise.all((companies.deactivations || []).map(async (companyId) => {
    const resolved = resolveCompanyId(companyId);
    if (isTempCompany(resolved)) return;
    await deactivateCompanyAction(resolved);
  }));

  await Promise.all((departments.creates || []).map(async (entry) => {
    const resolved = resolveCompanyId(entry?.payload?.comp_id);
    if (!resolved || deactivatedCompanySet.has(String(resolved))) return;
    if (isTempCompany(resolved)) throw new Error("Save company batch first before saving departments for a newly created company.");
    await createDepartmentAction({ ...entry.payload, comp_id: resolved });
  }));

  await Promise.all(Object.entries(departments.updates || {}).map(async ([deptId, updates]) => {
    if (deactivatedDepartmentSet.has(String(deptId)) || isTempDepartment(deptId)) return;
    if (Object.keys(updates || {}).length === 0) return;
    await updateDepartmentAction(deptId, updates);
  }));

  await Promise.all((departments.deactivations || []).filter((id) => !isTempDepartment(id)).map((id) => deactivateDepartmentAction(id)));
  await Promise.all((departments.hardDeletes || []).filter((id) => !isTempDepartment(id)).map((id) => hardDeleteDepartmentAction(id)));

  await Promise.all((companies.hardDeletes || []).map(async (companyId) => {
    const resolved = resolveCompanyId(companyId);
    if (isTempCompany(resolved)) return;
    await hardDeleteCompanyAction(resolved);
  }));

  await refreshUserSeats(getSupabaseAdmin(), seatedUserIds);

  return { companyIdMap };
}

// User ids holding a seat in any position of these companies or departments.
async function seatedUsersIn(companyIds, departmentIds) {
  if (!companyIds.length && !departmentIds.length) return [];
  const supabase = getSupabaseAdmin();
  const filters = [];
  if (companyIds.length) filters.push(`comp_id.in.(${companyIds.join(",")})`);
  if (departmentIds.length) filters.push(`dept_id.in.(${departmentIds.join(",")})`);
  const { data: positions, error } = await supabase.from("psb_s_position").select("position_id").or(filters.join(","));
  if (error) throw new Error(error.message);
  if (!positions?.length) return [];
  const { data: seats, error: seatsError } = await supabase.from("psb_m_userposition")
    .select("user_id").in("position_id", positions.map((p) => p.position_id));
  if (seatsError) throw new Error(seatsError.message);
  return [...new Set((seats || []).map((s) => String(s.user_id)))];
}

// ─── Organization: positions ───────────────────────────────
// A position is a seat in a company (optionally in one of its departments,
// optionally at a branch). It reports to one or more positions of the same
// company (psb_m_positionreport) and is held by one or more users
// (psb_m_userposition). The org chart is drawn from these tables. Positions
// save straight away (they are not part of the company/department Save Batch).

function toIdOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function userDisplayName(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return name || user?.username || user?.email || `User ${user?.user_id}`;
}

/** Every position with its reporting lines and holders, plus active users for the people picker. */
export async function loadOrgPositionsData() {
  const supabase = getSupabaseAdmin();
  const [positionsRes, reportsRes, holdersRes, usersRes] = await Promise.all([
    supabase.from("psb_s_position").select("*")
      .order("chart_level", { ascending: true })
      .order("display_order", { ascending: true })
      .order("position_name", { ascending: true }),
    supabase.from("psb_m_positionreport").select("position_id, reports_to_position_id"),
    supabase.from("psb_m_userposition").select("user_id, position_id, is_primary").eq("is_active", true),
    supabase.from("psb_s_user").select("user_id, username, email, first_name, last_name, is_active"),
  ]);
  const failed = positionsRes.error || reportsRes.error || holdersRes.error || usersRes.error;
  if (failed) throw new Error(failed.message || "Failed to load positions.");

  const users = (usersRes.data || [])
    .filter((u) => u.is_active !== false)
    .map((u) => ({ user_id: u.user_id, full_name: userDisplayName(u), username: u.username || "", email: u.email || "" }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" }));
  // Holders may include deactivated people: show their name, marked "(inactive)".
  const nameById = new Map((usersRes.data || []).map((u) => [
    String(u.user_id),
    u.is_active === false ? `${userDisplayName(u)} (inactive)` : userDisplayName(u),
  ]));

  const positions = (positionsRes.data || []).map((p) => ({
    ...p,
    // Rows saved before "All" was blocked: "All" / "All branches" means every branch.
    branch: /^all( branches)?$/i.test(String(p.branch || "").trim()) ? null : p.branch,
    reports_to_ids: (reportsRes.data || [])
      .filter((r) => String(r.position_id) === String(p.position_id))
      .map((r) => r.reports_to_position_id),
    holders: (holdersRes.data || [])
      .filter((h) => String(h.position_id) === String(p.position_id))
      .map((h) => ({ user_id: h.user_id, full_name: nameById.get(String(h.user_id)) || `User ${h.user_id}`, is_primary: Boolean(h.is_primary) })),
  }));

  return { positions, users };
}

/**
 * Create (no position_id) or update a position, and replace its reporting
 * lines and holders.
 * input: { position_id, comp_id, dept_id, position_name, branch, chart_level, reports_to_ids[], user_ids[] }
 * Rules: the department must belong to the company; a position reports only
 * to positions of the same company, never to itself, and never in a loop.
 * A newly placed user with no main seat gets this one as main.
 */
async function saveOrgPosition(input) {
  const supabase = getSupabaseAdmin();
  const positionId = toIdOrNull(input?.position_id);
  const compId = toIdOrNull(input?.comp_id);
  const deptId = toIdOrNull(input?.dept_id);
  const name = normalizeText(input?.position_name);
  // Blank, "All" or "All branches" all mean every branch.
  const branchText = normalizeText(input?.branch);
  const branch = !branchText || /^all( branches)?$/i.test(branchText) ? null : branchText;
  const chartLevel = Math.min(Math.max(toIdOrNull(input?.chart_level) ?? 4, 1), 9);
  const reportsToIds = [...new Set((input?.reports_to_ids || []).map(toIdOrNull).filter((id) => id != null))];
  const userIds = [...new Set((input?.user_ids || []).map(toIdOrNull).filter((id) => id != null))];

  if (!compId) throw new Error("Company is required.");
  if (!name) throw new Error("Position name is required.");
  if (name.length > 100) throw new Error("Position name must be 100 characters or less.");
  if (branch && branch.length > 50) throw new Error("Branch must be 50 characters or less.");

  if (deptId) {
    const { data: dept, error } = await supabase.from("psb_s_department").select("dept_id, comp_id").eq("dept_id", deptId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!dept || String(dept.comp_id) !== String(compId)) throw new Error("That department doesn't belong to this company.");
  }

  if (reportsToIds.length) {
    if (positionId && reportsToIds.some((id) => String(id) === String(positionId))) {
      throw new Error("A position can't report to itself.");
    }
    const [{ data: targets, error: targetsError }, { data: links, error: linksError }] = await Promise.all([
      supabase.from("psb_s_position").select("position_id, comp_id").in("position_id", reportsToIds),
      supabase.from("psb_m_positionreport").select("position_id, reports_to_position_id"),
    ]);
    if (targetsError || linksError) throw new Error((targetsError || linksError).message);
    if ((targets || []).length !== reportsToIds.length || (targets || []).some((t) => String(t.comp_id) !== String(compId))) {
      throw new Error("A position can only report to positions in the same company.");
    }
    // No loop: walking up from each new manager must never reach this position.
    if (positionId) {
      const parentsOf = new Map();
      (links || []).forEach((l) => {
        if (String(l.position_id) === String(positionId)) return; // being replaced
        const key = String(l.position_id);
        parentsOf.set(key, [...(parentsOf.get(key) || []), String(l.reports_to_position_id)]);
      });
      const seen = new Set();
      const stack = reportsToIds.map(String);
      while (stack.length) {
        const current = stack.pop();
        if (current === String(positionId)) throw new Error("That would make a reporting loop.");
        if (seen.has(current)) continue;
        seen.add(current);
        stack.push(...(parentsOf.get(current) || []));
      }
    }
  }

  const now = new Date().toISOString();
  const fields = { comp_id: compId, dept_id: deptId, position_name: name, branch, chart_level: chartLevel };
  // Order inside its group (same company, department and rank): a new position,
  // or one moved to another department or rank, goes to the end of that group.
  let previous = null;
  if (positionId) {
    const { data: prevRow, error: prevError } = await supabase.from("psb_s_position")
      .select("dept_id, chart_level").eq("position_id", positionId).maybeSingle();
    if (prevError) throw new Error(prevError.message);
    previous = prevRow;
  }
  const groupChanged = !previous
    || String(previous.dept_id ?? "") !== String(deptId ?? "")
    || Number(previous.chart_level) !== chartLevel;
  if (groupChanged) fields.display_order = (await maxOrderInGroup(supabase, compId, deptId, chartLevel, positionId)) + 1;
  let savedId = positionId;
  if (positionId) {
    const { data, error } = await supabase.from("psb_s_position").update({ ...fields, updated_at: now })
      .eq("position_id", positionId).select("position_id");
    if (error) throw new Error(error.message || "Failed to save the position.");
    if (!data?.length) throw new Error("This position no longer exists. Refresh the page.");
  } else {
    const { data, error } = await supabase.from("psb_s_position").insert(fields).select("position_id").single();
    if (error) throw new Error(error.message || "Failed to create the position.");
    savedId = data.position_id;
  }

  // Reporting lines: replace.
  const { error: clearReportsError } = await supabase.from("psb_m_positionreport").delete().eq("position_id", savedId);
  if (clearReportsError) throw new Error(clearReportsError.message);
  if (reportsToIds.length) {
    const { error } = await supabase.from("psb_m_positionreport")
      .insert(reportsToIds.map((id) => ({ position_id: savedId, reports_to_position_id: id })));
    if (error) throw new Error(error.message || "Saved the position, but not its reporting lines. Save again.");
  }

  // Holders: add the new ones, remove the ones taken out.
  const { data: currentRows, error: currentError } = await supabase.from("psb_m_userposition")
    .select("user_id, is_primary").eq("position_id", savedId);
  if (currentError) throw new Error(currentError.message);
  const currentIds = (currentRows || []).map((r) => String(r.user_id));
  const toRemove = (currentRows || []).filter((r) => !userIds.some((id) => String(id) === String(r.user_id)));
  const toAdd = userIds.filter((id) => !currentIds.includes(String(id)));

  if (toRemove.length) {
    const { error } = await supabase.from("psb_m_userposition").delete()
      .eq("position_id", savedId).in("user_id", toRemove.map((r) => r.user_id));
    if (error) throw new Error(error.message);
  }
  if (toAdd.length) {
    const { data: mains } = await supabase.from("psb_m_userposition").select("user_id")
      .in("user_id", toAdd).eq("is_primary", true).eq("is_active", true);
    const hasMain = new Set((mains || []).map((m) => String(m.user_id)));
    const { error } = await supabase.from("psb_m_userposition").insert(
      toAdd.map((id) => ({ user_id: id, position_id: savedId, is_primary: !hasMain.has(String(id)) })),
    );
    if (error) throw new Error(error.message || "Saved the position, but not its people. Save again.");
  }

  const affectedUserIds = [...new Set([
    ...currentRows.map((r) => r.user_id),
    ...userIds,
  ].map((id) => String(id)).filter(Boolean))];
  await refreshUserSeats(supabase, affectedUserIds);

  return { position_id: savedId };
}

async function setOrgPositionActive(positionId, isActive) {
  const id = toIdOrNull(positionId);
  if (!id) throw new Error("Position is required.");
  const supabase = getSupabaseAdmin();
  const { data: holders } = await supabase.from("psb_m_userposition").select("user_id").eq("position_id", id);
  const { error } = await supabase.from("psb_s_position")
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() }).eq("position_id", id);
  if (error) throw new Error(error.message || "Failed to update the position.");
  await refreshUserSeats(supabase, (holders || []).map((h) => h.user_id));
  return { success: true };
}

/** Permanently delete a position; its reporting lines and seats go with it. */
async function deleteOrgPosition(positionId) {
  const id = toIdOrNull(positionId);
  if (!id) throw new Error("Position is required.");
  const supabase = getSupabaseAdmin();
  const { data: holders } = await supabase.from("psb_m_userposition").select("user_id, is_primary").eq("position_id", id);
  const { error } = await supabase.from("psb_s_position").delete().eq("position_id", id);
  if (error) throw new Error(error.message || "Failed to delete the position.");
  await refreshUserSeats(supabase, (holders || []).map((h) => h.user_id));
  return { success: true };
}

// Exported position actions return { success, error } instead of throwing:
// in production Next.js hides a thrown error's message, and these messages
// (reporting loop, wrong company…) must reach the admin.
async function toPositionResult(work, fallback) {
  try {
    const data = await work();
    return { success: true, ...(data && typeof data === "object" ? data : {}) };
  } catch (error) {
    return { success: false, error: error?.message || fallback };
  }
}

export async function saveOrgPositionAction(input) {
  return toPositionResult(() => saveOrgPosition(input), "Failed to save the position.");
}

export async function setOrgPositionActiveAction(positionId, isActive) {
  return toPositionResult(() => setOrgPositionActive(positionId, isActive), "Failed to update the position.");
}

export async function deleteOrgPositionAction(positionId) {
  return toPositionResult(() => deleteOrgPosition(positionId), "Failed to delete the position.");
}

// ─── Position order inside a group ─────────────────────────
// Group = same company, same department (or company-level) and same rank.

function orderValue(row) {
  const n = Number(row?.display_order);
  return row?.display_order == null || !Number.isFinite(n) ? Number.MAX_SAFE_INTEGER : n;
}

async function positionsInGroup(supabase, compId, deptId, chartLevel) {
  let query = supabase.from("psb_s_position").select("position_id, display_order, position_name")
    .eq("comp_id", compId).eq("chart_level", chartLevel);
  query = deptId == null ? query.is("dept_id", null) : query.eq("dept_id", deptId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  // Same order the screens use: display_order (empty last), then name.
  return (data || []).sort((a, b) => orderValue(a) - orderValue(b)
    || String(a.position_name || "").localeCompare(String(b.position_name || "")));
}

// Highest order number in a group. If any position there has no number yet
// (they sort last), the group is numbered 1..n first so a new one lands at the end.
async function maxOrderInGroup(supabase, compId, deptId, chartLevel, excludeId) {
  const rows = (await positionsInGroup(supabase, compId, deptId, chartLevel))
    .filter((r) => String(r.position_id) !== String(excludeId ?? ""));
  if (rows.some((r) => r.display_order == null)) {
    for (let i = 0; i < rows.length; i += 1) {
      if (Number(rows[i].display_order) === i + 1) continue;
      const { error } = await supabase.from("psb_s_position")
        .update({ display_order: i + 1 }).eq("position_id", rows[i].position_id);
      if (error) throw new Error(error.message || "Failed to set the order.");
    }
    return rows.length;
  }
  return rows.reduce((max, r) => Math.max(max, Number(r.display_order) || 0), 0);
}

/** Move a position one place up (-1) or down (+1) inside its group; the group is renumbered 1..n. */
async function moveOrgPosition(positionId, direction) {
  const id = toIdOrNull(positionId);
  if (!id) throw new Error("Position is required.");
  const step = Number(direction) < 0 ? -1 : 1;
  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase.from("psb_s_position")
    .select("position_id, comp_id, dept_id, chart_level").eq("position_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("This position no longer exists. Refresh the page.");

  const group = await positionsInGroup(supabase, row.comp_id, row.dept_id, row.chart_level);
  const index = group.findIndex((p) => String(p.position_id) === String(id));
  const target = index + step;
  if (index < 0 || target < 0 || target >= group.length) return { success: true };

  const ordered = [...group];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  for (let i = 0; i < ordered.length; i += 1) {
    if (Number(ordered[i].display_order) === i + 1) continue;
    const { error: updateError } = await supabase.from("psb_s_position")
      .update({ display_order: i + 1 }).eq("position_id", ordered[i].position_id);
    if (updateError) throw new Error(updateError.message || "Failed to change the order.");
  }
  return { success: true };
}

export async function moveOrgPositionAction(positionId, direction) {
  return toPositionResult(() => moveOrgPosition(positionId, direction), "Failed to change the order.");
}

