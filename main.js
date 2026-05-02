const { runIngestAndPost } = require("./kpiPipeline");

async function main() {
  try {
    const customPath = process.argv[2];
    await runIngestAndPost(
      customPath ? { dataPath: customPath } : {}
    );
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}

main();
