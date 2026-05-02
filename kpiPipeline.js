const path = require("path");
const { runIngest } = require("./ingest");

/**
 * Ingest logs, POST dashboard payload to KPI hub.
 * @param {{ dataPath?: string }} [options] dataPath — relative to cwd or absolute; omit for env/DEFAULT
 * @returns {Promise<unknown>} dashboard result from runIngest
 */
async function runIngestAndPost(options = {}) {
  const explicit = options.dataPath;
  const dataPath =
    explicit != null && String(explicit).trim() !== ""
      ? path.resolve(process.cwd(), explicit)
      : undefined;

  const result = await runIngest({ dataPath });

  console.log("Result:", result);

  await fetch("https://clienthub.systemicdigital.io", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(result),
  });

  console.log("Sent to KPI dashboard");
  return result;
}

module.exports = { runIngestAndPost };
