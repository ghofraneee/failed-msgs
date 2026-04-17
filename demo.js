/**
 * Demo script: loads example test data, feeds the error processor, flushes the batch,
 * and prints the dashboard JSON line. Safe to run alongside the 30s background flush.
 */

const fs = require("fs");
const path = require("path");
const {
  processLog,
  flushPending,
  startFlushLoop,
  stopFlushLoop,
  getCountersSnapshot,
  resetState,
  DEFAULT_INTERVAL_MS,
} = require("./errorProcessor");
const { buildDashboardPayload, sendDashboard } = require("./dashboardSender");

const DEFAULT_DATA_FILE = path.join(__dirname, "exampleTestData.json");

/**
 * Normalize file contents: supports either `{ logs: [...] }` or a bare array.
 * @param {unknown} parsed
 * @returns {{ logs: Array<{ status: string, errorText?: string }> }}
 */
function extractLogs(parsed) {
  if (Array.isArray(parsed)) {
    return { logs: parsed };
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.logs)) {
    return { logs: parsed.logs };
  }
  throw new Error("Test data must be an array of logs or { logs: [...] }");
}

/**
 * Run the demo: ingest all logs, flush detector batch once, print dashboard.
 *
 * @param {{ dataPath?: string, useBackgroundFlush?: boolean }} [options]
 *   dataPath — JSON file path (default: exampleTestData.json next to this file)
 *   useBackgroundFlush — if true, start the 30s interval (still does one immediate flush at end)
 */
async function runDemo(options = {}) {
  const dataPath = options.dataPath || DEFAULT_DATA_FILE;
  const useBackgroundFlush = options.useBackgroundFlush !== false;

  const raw = fs.readFileSync(dataPath, "utf8");
  const { logs } = extractLogs(JSON.parse(raw));

  resetState();

  if (useBackgroundFlush) {
    startFlushLoop(DEFAULT_INTERVAL_MS);
  }

  for (const log of logs) {
    processLog(log);
  }

  await flushPending();

  const snapshot = getCountersSnapshot();
  const dashboard = buildDashboardPayload(snapshot);
  sendDashboard(dashboard);

  if (useBackgroundFlush) {
    stopFlushLoop();
  }

  return dashboard;
}

module.exports = {
  runDemo,
  DEFAULT_DATA_FILE,
  extractLogs,
};

if (require.main === module) {
  const customPath = process.argv[2];
  const dataPath = customPath
    ? path.resolve(process.cwd(), customPath)
    : DEFAULT_DATA_FILE;
  runDemo({ dataPath }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
