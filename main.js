const path = require("path");
const { runIngest } = require("./ingest");

module.exports = async (req, res) => {
  try {
    const customPath = req.body?.dataPath;

    const dataPath = customPath
      ? path.resolve(process.cwd(), customPath)
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

    res.status(200).json({
      success: true,
      message: "Sent to KPI dashboard",
      result,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message || "Internal Server Error",
    });
  }
};