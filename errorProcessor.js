/**
 * In-memory failed-message processor.
 *
 * - Ingests logs (success / failed + error text).
 * - Increments total failed count immediately.
 * - Aggregates error strings with occurrence counts (does not call the detector per message).
 * - On a fixed interval (default 30s), flushes one batched request to the detector and
 *   updates per-category counters from the returned classification map.
 */

const { classifyBatch } = require("./detectorClient");

const DEFAULT_INTERVAL_MS = 30_000;

/** @type {Map<string, number>} aggregated pending error text -> count */
let pendingAggregates = new Map();

/** Per-category totals after successful batch classification */
const errorBreakdown = {
  AUTHENTICATION_ERROR: 0,
  RATE_LIMIT_ERROR: 0,
  INVALID_NUMBER: 0,
  DELIVERY_FAILED: 0,
  NETWORK_ERROR: 0,
  UNKNOWN_ERROR: 0,
};

let totalSentMessages = 0;
let totalFailedMessages = 0;
/** @type {ReturnType<typeof setInterval> | null} */
let flushTimer = null;
let flushIntervalMs = DEFAULT_INTERVAL_MS;

/**
 * Apply detector result map to the breakdown: for each error text, add its count
 * to the resolved category.
 * @param {Map<string, number>} aggregates
 * @param {Map<string, string>} textToCategory
 */
function applyClassifications(aggregates, textToCategory) {
  for (const [text, count] of aggregates) {
    const category = textToCategory.get(text) || "UNKNOWN_ERROR";
    if (errorBreakdown[category] === undefined) {
      errorBreakdown.UNKNOWN_ERROR += count;
    } else {
      errorBreakdown[category] += count;
    }
  }
}

/**
 * Flush pending aggregates: one batched detector call, then clear pending.
 */
async function flushPending() {
  if (pendingAggregates.size === 0) return;

  const snapshot = new Map(pendingAggregates);
  pendingAggregates = new Map();

  const uniqueTexts = Array.from(snapshot.keys());
  const textToCategory = await classifyBatch(uniqueTexts);
  applyClassifications(snapshot, textToCategory);
}

/**
 * Start the periodic flush timer (idempotent: clears existing timer first).
 * @param {number} [intervalMs]
 */
function startFlushLoop(intervalMs = DEFAULT_INTERVAL_MS) {
  flushIntervalMs = intervalMs;
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(() => {
    flushPending().catch(() => {
      // Swallow: next tick will retry; totals already reflect failures
    });
  }, flushIntervalMs);
}

/**
 * Stop automatic flushing (e.g. tests or clean shutdown).
 */
function stopFlushLoop() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/**
 * Process one message log line.
 * @param {{ status?: string; errorText?: string } | null | undefined} log
 */
function processLog(log) {
  totalSentMessages += 1;
  if (!log || log.status !== "failed") return;

  const err = typeof log.errorText === "string" ? log.errorText : "";
  totalFailedMessages += 1;

  const key = err.trim() || "[empty error]";
  pendingAggregates.set(key, (pendingAggregates.get(key) || 0) + 1);
}

/**
 * Snapshot of counters for the dashboard (read-only plain object).
 */
function getCountersSnapshot() {
  return {
    totalSent: totalSentMessages,
    totalFailedMessages,
    errorBreakdown: { ...errorBreakdown },
  };
}

/**
 * Reset all in-memory state (useful for tests).
 */
function resetState() {
  stopFlushLoop();
  pendingAggregates = new Map();
  totalSentMessages = 0;
  totalFailedMessages = 0;
  for (const k of Object.keys(errorBreakdown)) errorBreakdown[k] = 0;
}

module.exports = {
  processLog,
  flushPending,
  startFlushLoop,
  stopFlushLoop,
  getCountersSnapshot,
  resetState,
  DEFAULT_INTERVAL_MS,
};
