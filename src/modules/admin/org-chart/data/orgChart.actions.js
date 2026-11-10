"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

function displayName(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return name || user?.username || user?.email || `User ${user?.user_id}`;
}

/**
 * Everything the org chart needs, already filtered: active companies, and
 * active positions whose company and department (if any) are active, each
 * with its reporting lines and the active people sitting in it.
 */
export async function loadOrgChartData() {
  const supabase = getSupabaseAdmin();
  const [companiesRes, departmentsRes, positionsRes, reportsRes, seatsRes, usersRes] = await Promise.all([
    supabase.from("psb_s_company").select("comp_id, comp_name, short_name").eq("is_active", true)
      .order("comp_name", { ascending: true }),
    supabase.from("psb_s_department").select("dept_id, comp_id, dept_name").eq("is_active", true),
    supabase.from("psb_s_position").select("position_id, comp_id, dept_id, position_name, branch, chart_level, display_order")
      .eq("is_active", true)
      .order("chart_level", { ascending: true })
      .order("display_order", { ascending: true })
      .order("position_name", { ascending: true }),
    supabase.from("psb_m_positionreport").select("position_id, reports_to_position_id"),
    supabase.from("psb_m_userposition").select("user_id, position_id").eq("is_active", true),
    supabase.from("psb_s_user").select("user_id, username, email, first_name, last_name").eq("is_active", true),
  ]);
  const failed = companiesRes.error || departmentsRes.error || positionsRes.error
    || reportsRes.error || seatsRes.error || usersRes.error;
  if (failed) throw new Error(failed.message || "Failed to load the org chart.");

  const companies = (companiesRes.data || []).map((c) => ({
    comp_id: c.comp_id,
    label: c.short_name ? `${c.comp_name} (${c.short_name})` : c.comp_name,
  }));
  const companyIds = new Set(companies.map((c) => String(c.comp_id)));
  const deptById = new Map((departmentsRes.data || []).map((d) => [String(d.dept_id), d]));
  const nameByUserId = new Map((usersRes.data || []).map((u) => [String(u.user_id), displayName(u)]));

  const visible = (positionsRes.data || []).filter((p) => {
    if (!companyIds.has(String(p.comp_id))) return false;
    if (p.dept_id == null) return true;
    const dept = deptById.get(String(p.dept_id));
    return Boolean(dept) && String(dept.comp_id) === String(p.comp_id);
  });
  const visibleIds = new Set(visible.map((p) => String(p.position_id)));

  const positions = visible.map((p) => ({
    position_id: p.position_id,
    comp_id: p.comp_id,
    position_name: p.position_name || "",
    department_name: p.dept_id != null ? deptById.get(String(p.dept_id))?.dept_name || "" : "",
    branch: p.branch || "",
    chart_level: p.chart_level,
    reports_to_ids: (reportsRes.data || [])
      .filter((r) => String(r.position_id) === String(p.position_id) && visibleIds.has(String(r.reports_to_position_id)))
      .map((r) => r.reports_to_position_id),
    people: (seatsRes.data || [])
      .filter((s) => String(s.position_id) === String(p.position_id) && nameByUserId.has(String(s.user_id)))
      .map((s) => ({ user_id: s.user_id, full_name: nameByUserId.get(String(s.user_id)) }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" })),
  }));

  return { companies, positions };
}
