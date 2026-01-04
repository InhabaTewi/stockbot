export async function apiGet(path, params) {
  const u = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && `${v}`.length > 0) u.searchParams.set(k, String(v));
    });
  }
  const r = await fetch(u.toString(), { credentials: "omit" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  return r.json();
}
