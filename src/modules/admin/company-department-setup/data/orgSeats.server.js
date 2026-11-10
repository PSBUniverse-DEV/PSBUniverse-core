// Seats = rows in psb_m_userposition (who sits in which position). 
// Shared by Organization Setup and User Master Setup. This is NOT a
// "use server" file: it is only imported by server action files, so the
// browser can't call it directly.

function idKey(value) {
  return String(value ?? "").trim();
}

/**
 * For each user: keep their main seat on an active position (if the main
 * seat is gone or its position is inactive, their highest active seat takes
 * over), then copy that seat's company, department and position name onto
 * psb_s_user (comp_id, dept_id, position). A user with no active seat gets
 * those three fields cleared.
 */
export async function refreshUserSeats(supabase, userIds) {
  const ids = [...new Set((userIds || []).map(idKey).filter(Boolean))];
  for (const userId of ids) {
    const { data: seats, error: seatsError } = await supabase.from("psb_m_userposition")
      .select("position_id, is_primary").eq("user_id", userId).eq("is_active", true);
    if (seatsError) throw new Error(seatsError.message);

    const positionIds = (seats || []).map((s) => s.position_id);
    let positions = [];
    if (positionIds.length) {
      const { data, error } = await supabase.from("psb_s_position")
        .select("position_id, comp_id, dept_id, position_name, is_active, chart_level, display_order")
        .in("position_id", positionIds);
      if (error) throw new Error(error.message);
      positions = data || [];
    }
    const positionById = new Map(positions.map((p) => [idKey(p.position_id), p]));

    // A seat only counts when its position, company and department (if any) are all active.
    const compIds = [...new Set(positions.map((p) => p.comp_id).filter((v) => v != null))];
    const deptIds = [...new Set(positions.map((p) => p.dept_id).filter((v) => v != null))];
    const [compRes, deptRes] = await Promise.all([
      compIds.length
        ? supabase.from("psb_s_company").select("comp_id, is_active").in("comp_id", compIds)
        : Promise.resolve({ data: [], error: null }),
      deptIds.length
        ? supabase.from("psb_s_department").select("dept_id, is_active").in("dept_id", deptIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (compRes.error || deptRes.error) throw new Error((compRes.error || deptRes.error).message);
    const activeCompIds = new Set((compRes.data || []).filter((c) => c.is_active !== false).map((c) => idKey(c.comp_id)));
    const activeDeptIds = new Set((deptRes.data || []).filter((d) => d.is_active !== false).map((d) => idKey(d.dept_id)));
    const isOpen = (p) => Boolean(p?.is_active)
      && activeCompIds.has(idKey(p.comp_id))
      && (p.dept_id == null || activeDeptIds.has(idKey(p.dept_id)));

    // Active seats on active positions, highest rank first (rank order from psb_s_rank).
    const rankIds = [...new Set(positions.map((p) => p.chart_level).filter((v) => v != null))];
    const { data: rankRows, error: rankError } = rankIds.length
      ? await supabase.from("psb_s_rank").select("rank_id, rank_order").in("rank_id", rankIds)
      : { data: [], error: null };
    if (rankError) throw new Error(rankError.message);
    const rankOrderOf = new Map((rankRows || []).map((r) => [idKey(r.rank_id), Number(r.rank_order) || 0]));
    const rankOf = (p) => rankOrderOf.get(idKey(p?.chart_level)) ?? Number.MAX_SAFE_INTEGER;
    const usable = (seats || [])
      .filter((s) => isOpen(positionById.get(idKey(s.position_id))))
      .sort((a, b) => {
        const pa = positionById.get(idKey(a.position_id));
        const pb = positionById.get(idKey(b.position_id));
        return rankOf(pa) - rankOf(pb) || (pa.display_order ?? 0) - (pb.display_order ?? 0);
      });

    let main = usable.find((s) => s.is_primary) || null;
    if (!main && usable.length) {
      main = usable[0];
      // Only one main seat per user: clear the old one first, then set the new one.
      const { error: clearError } = await supabase.from("psb_m_userposition")
        .update({ is_primary: false }).eq("user_id", userId).eq("is_primary", true);
      if (clearError) throw new Error(clearError.message);
      const { error: setError } = await supabase.from("psb_m_userposition")
        .update({ is_primary: true }).eq("user_id", userId).eq("position_id", main.position_id);
      if (setError) throw new Error(setError.message);
    }

    const mainPosition = main ? positionById.get(idKey(main.position_id)) : null;
    const { error: userError } = await supabase.from("psb_s_user").update({
      comp_id: mainPosition?.comp_id ?? null,
      dept_id: mainPosition?.dept_id ?? null,
      position: mainPosition?.position_name ?? null,
    }).eq("user_id", userId);
    if (userError) throw new Error(userError.message);
  }
}
