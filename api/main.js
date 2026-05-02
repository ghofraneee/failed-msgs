const { runIngestAndPost } = require("../kpiPipeline");

module.exports = async (req, res) => {
  try {
    const customPath = req.body?.dataPath;

    const result = await runIngestAndPost(
      customPath ? { dataPath: customPath } : {}
    );

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
