export async function apiRequest(path, { method = "GET", params, body } = {}) {
  const u = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && `${v}`.length > 0) u.searchParams.set(k, String(v));
    });
  }
  const r = await fetch(u.toString(), {
    method,
    credentials: "omit",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  return r.json();
}

export function apiGet(path, params) {
  return apiRequest(path, { params });
}

export function apiPut(path, body) {
  return apiRequest(path, { method: "PUT", body });
}

export function apiPost(path, body) {
  return apiRequest(path, { method: "POST", body });
}
