/**
 * External message error detector client.
 *
 * Sends batched error strings to the configured detector URL and maps responses
 * to one of the canonical categories. If the remote endpoint is unavailable or
 * returns an unexpected payload (e.g. HTML shell), we fall back to a small
 * local classifier so the command center keeps working.
 */

const DETECTOR_URL =
  process.env.DETECTOR_URL || "https://tg-rho-dun.vercel.app/";

/** Canonical categories required by the dashboard contract. */
const CATEGORIES = [
  "AUTHENTICATION_ERROR",
  "RATE_LIMIT_ERROR",
  "INVALID_NUMBER",
  "DELIVERY_FAILED",
  "NETWORK_ERROR",
  "UNKNOWN_ERROR",
];

/**
 * Normalize any string to a valid category; unknown values become UNKNOWN_ERROR.
 * @param {string} raw
 * @returns {string}
 */
function normalizeCategory(raw) {
  if (typeof raw !== "string") return "UNKNOWN_ERROR";
  const upper = raw.trim().toUpperCase();
  return CATEGORIES.includes(upper) ? upper : "UNKNOWN_ERROR";
}

/**
 * Lightweight local fallback when the remote detector cannot be used.
 * Keyword-based — keeps integration simple without extra dependencies.
 * @param {string} errorText
 * @returns {string}
 */
function classifyLocally(errorText) {
  const t = (errorText || "").toLowerCase();
  if (
    /auth|credential|token|unauthori[sz]ed|401|forbidden|403|invalid.?key|api.?key/.test(
      t
    )
  ) {
    return "AUTHENTICATION_ERROR";
  }
  if (/rate|limit|429|throttl|quota|too many/.test(t)) {
    return "RATE_LIMIT_ERROR";
  }
  if (
    /invalid.?number|bad.?number|invalid.?phone|phone.?format|malformed|e\.164|not a valid phone/.test(
      t
    )
  ) {
    return "INVALID_NUMBER";
  }
  if (/deliver|rejected|carrier|undeliverable|blocked|spam/.test(t)) {
    return "DELIVERY_FAILED";
  }
  if (/network|timeout|econnreset|enotfound|dns|socket|unreachable|5\d\d/.test(t)) {
    return "NETWORK_ERROR";
  }
  return "UNKNOWN_ERROR";
}

/**
 * Try to extract a category map from various possible API response shapes.
 * @param {unknown} body Parsed JSON from the detector
 * @param {string[]} errorTexts Original batch (for index alignment)
 * @returns {Map<string, string>|null} errorText -> category, or null to use fallback
 */
function parseDetectorResponse(body, errorTexts) {
  if (!body || typeof body !== "object") return null;

  // Shape: { results: [{ category, text? }, ...] }
  if (Array.isArray(body.results)) {
    const map = new Map();
    body.results.forEach((row, i) => {
      const cat = normalizeCategory(row?.category ?? row?.type ?? row?.code);
      const key = row?.text ?? row?.error ?? errorTexts[i];
      if (key) map.set(String(key), cat);
    });
    if (map.size > 0) return map;
  }

  // Shape: { classifications: { "original text": "CATEGORY" } }
  if (body.classifications && typeof body.classifications === "object") {
    const map = new Map();
    for (const [k, v] of Object.entries(body.classifications)) {
      map.set(k, normalizeCategory(String(v)));
    }
    if (map.size > 0) return map;
  }

  // Shape: { categories: ["X", "Y"] } same order as request
  if (Array.isArray(body.categories) && body.categories.length === errorTexts.length) {
    const map = new Map();
    errorTexts.forEach((text, i) => {
      map.set(text, normalizeCategory(String(body.categories[i])));
    });
    return map;
  }

  // Shape: single combined result for the whole batch
  if (body.category || body.normalized?.category) {
    const cat = normalizeCategory(body.category ?? body.normalized?.category);
    const map = new Map();
    errorTexts.forEach((t) => map.set(t, cat));
    return map;
  }

  return null;
}

/**
 * POST a batch of error texts to the external detector and return a map
 * errorText -> category. Falls back to local classification per string on failure.
 *
 * @param {string[]} errorTexts Unique error strings in this batch (order preserved)
 * @returns {Promise<Map<string, string>>}
 */
async function classifyBatch(errorTexts) {
  const list = errorTexts.filter((t) => typeof t === "string" && t.length > 0);
  if (list.length === 0) return new Map();

  let parsed = null;
  try {
    const res = await fetch(DETECTOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        errors: list,
        batch: true,
        source: "failed-message-command-center",
      }),
    });

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await res.json();
      parsed = parseDetectorResponse(body, list);
    }
  } catch {
    // Network failure — handled below with local fallback
  }

  const map = parsed ?? new Map();
  for (const text of list) {
    if (!map.has(text)) {
      map.set(text, classifyLocally(text));
    }
  }
  return map;
}

module.exports = {
  DETECTOR_URL,
  CATEGORIES,
  classifyBatch,
  classifyLocally,
  normalizeCategory,
};
