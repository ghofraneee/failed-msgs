/**
 * Failed Message Command Center — entry point.
 *
 * Runs the demo using example test data from exampleTestData.json by default.
 * For a custom file: node main.js path/to/logs.json
 */

const path = require("path");
const { runDemo, DEFAULT_DATA_FILE } = require("./demo");

const customPath = process.argv[2];
const dataPath = customPath
  ? path.resolve(process.cwd(), customPath)
  : DEFAULT_DATA_FILE;

runDemo({ dataPath })
  .then(() => {})
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
