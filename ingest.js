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
 * Resolve which JSON file to ingest: explicit path, then DATA_FILE (cwd-relative), else sample file.
 * @param {string | undefined} explicitPath
 */
function resolveDataPath(explicitPath) {
  if (explicitPath) return explicitPath;
  const fromEnv = process.env.DATA_FILE;
  if (fromEnv && String(fromEnv).trim()) {
    return path.resolve(process.cwd(), fromEnv);
  }
  return DEFAULT_DATA_FILE;
}

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
 * Ingest logs from a JSON file, flush detector batch, build dashboard payload.
 *
 * @param {{ dataPath?: string, useBackgroundFlush?: boolean }} [options]
 *   dataPath — JSON file path; if omitted, uses env DATA_FILE (relative to cwd) or exampleTestData.json
 *   useBackgroundFlush — if true, start the 30s interval (still does one immediate flush at end)
 */
async function runIngest(options = {}) {
  const dataPath = resolveDataPath(options.dataPath);
  const useBackgroundFlush = options.useBackgroundFlush !== false;

  console.log("Reading logs from:", dataPath);

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
  console.log("totalSent:", dashboard.totalSent);
  console.log("totalFailed:", dashboard.totalFailed);
  console.log("failureRate:", dashboard.failureRate);
  sendDashboard(dashboard);

  if (useBackgroundFlush) {
    stopFlushLoop();
  }

  return dashboard;
}

module.exports = {
  runIngest,
  resolveDataPath,
  DEFAULT_DATA_FILE,
  extractLogs,
};

if (require.main === module) {
  const customPath = process.argv[2];
  const dataPath = customPath
    ? path.resolve(process.cwd(), customPath)
    : undefined;
  runIngest({ dataPath }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
