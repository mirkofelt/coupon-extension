export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let _httpErrors = { rateLimit: 0, other: {} };

export function resetHttpErrors() {
  _httpErrors = { rateLimit: 0, other: {} };
}

export function checkHttpErrors() {
  if (_httpErrors.rateLimit > 0)
    throw Object.assign(new Error(), { reason: "rate_limited", count: _httpErrors.rateLimit });
  const firstStatus = Object.keys(_httpErrors.other)[0];
  if (firstStatus)
    throw Object.assign(new Error(), { reason: "http_error", status: parseInt(firstStatus), count: _httpErrors.other[firstStatus] });
}

export async function fetchDoc(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 429) {
        if (attempt < retries) { await sleep(3000 * (attempt + 1)); continue; }
        _httpErrors.rateLimit++;
        return null;
      }
      if (!res.ok) {
        _httpErrors.other[res.status] = (_httpErrors.other[res.status] ?? 0) + 1;
        return null;
      }
      return new DOMParser().parseFromString(await res.text(), "text/html");
    } catch {
      return null;
    }
  }
  return null;
}
