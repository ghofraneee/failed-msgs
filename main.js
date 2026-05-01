const path = require("path");
const { runIngest } = require("./ingest");

const customPath = process.argv[2];
const dataPath = customPath
  ? path.resolve(process.cwd(), customPath)
  : undefined;

async function main() {
  try {
    const result = await runIngest({ dataPath });

    console.log("Result:", result);

    // POST to Lovable API
    await fetch("https://clienthub.systemicdigital.io", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    });

    console.log("Sent to KPI dashboard");
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}

main();