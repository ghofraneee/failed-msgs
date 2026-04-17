/**
 * Dashboard payload builder.
 *
 * Turns processor counters into the required JSON shape and computes mostCommonError
 * from the category breakdown (lexicographic tie-break for equal counts).
 */

/**
 * Pick the category key with the highest count.
 * @param {Record<string, number>} breakdown
 * @returns {string}
 */
function computeMostCommonError(breakdown) {
  const entries = Object.entries(breakdown);
  if (entries.length === 0) return "UNKNOWN_ERROR";

  let best = entries[0][0];
  let bestCount = entries[0][1];

  for (let i = 1; i < entries.length; i++) {
    const [cat, n] = entries[i];
    if (n > bestCount || (n === bestCount && cat < best)) {
      best = cat;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Build the dashboard object specified by the contract.
 *
 * @param {{ totalFailedMessages: number; errorBreakdown: Record<string, number> }} snapshot From errorProcessor
 * @returns {{
 *   totalFailed: number,
 *   errorBreakdown: Record<string, number>,
 *   mostCommonError: string,
 *   timestamp: number
 * }}
 */
function buildDashboardPayload(snapshot) {
  const errorBreakdown = { ...snapshot.errorBreakdown };
  return {
    totalFailed: snapshot.totalFailedMessages,
    errorBreakdown,
    mostCommonError: computeMostCommonError(errorBreakdown),
    timestamp: Date.now(),
  };
}

/**
 * Optional hook: send dashboard JSON somewhere (stdout, HTTP, message bus).
 * Default prints one JSON line for easy piping / log aggregation.
 *
 * @param {ReturnType<typeof buildDashboardPayload>} payload
 * @param {{ destination?: 'stdout' | 'silent' }} [options]
 */
function sendDashboard(payload, options = {}) {
  const dest = options.destination || "stdout";
  if (dest === "stdout") {
    console.log(JSON.stringify(payload));
  }
}

module.exports = {
  buildDashboardPayload,
  computeMostCommonError,
  sendDashboard,
};
