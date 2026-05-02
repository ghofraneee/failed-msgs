const fs = require("fs/promises");
const http = require("http");
const path = require("path");

const HOST = process.env.HOST || "0.0.0.0";
const explicitPort = process.env.PORT;
const userPinnedPort =
  explicitPort !== undefined &&
  String(explicitPort).trim() !== "" &&
  !Number.isNaN(Number(explicitPort));
const firstPort = userPinnedPort ? Number(explicitPort) : 3001;
let port = firstPort;
const maxBindAttempts = userPinnedPort ? 1 : 10;
let bindAttempt = 0;
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.cwd(), process.env.DATA_FILE)
  : path.join(__dirname, "exampleTestData.json");

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function extractLogs(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.logs)) {
    return parsed.logs;
  }
  return [];
}

async function loadFailedMessagesSummary() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const logs = extractLogs(parsed);
    const totalSent = logs.length;
    const failedMessages = logs.filter((log) => log && log.status === "failed");
    const totalFailed = failedMessages.length;
    const failureRate =
      totalSent === 0 ? null : (totalFailed / totalSent) * 100;
    return { totalSent, totalFailed, failureRate, failedMessages };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        totalSent: 0,
        totalFailed: 0,
        failureRate: null,
        failedMessages: [],
      };
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/api/failed-messages") {
    if (req.method !== "GET") {
      writeJson(res, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Use GET for /api/failed-messages",
      });
      return;
    }

    try {
      const summary = await loadFailedMessagesSummary();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end(JSON.stringify(summary));
    } catch (error) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end(
        JSON.stringify({
          totalSent: 0,
          totalFailed: 0,
          failureRate: null,
          failedMessages: [],
        })
      );
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/health") {
    writeJson(res, 200, { ok: true });
    return;
  }

  writeJson(res, 404, {
    error: "NOT_FOUND",
    message: `No route for ${req.method} ${requestUrl.pathname}`,
  });
});

function onListenError(err) {
  server.off("error", onListenError);
  bindAttempt += 1;
  if (err.code === "EADDRINUSE" && bindAttempt < maxBindAttempts && !userPinnedPort) {
    port += 1;
    tryListen();
    return;
  }
  if (err.code === "EADDRINUSE") {
    console.error(
      userPinnedPort
        ? `Port ${port} is already in use. Close the other process (e.g. another node server.js) or run: $env:PORT=3002; node server.js`
        : `Ports ${firstPort}–${firstPort + maxBindAttempts - 1} are all in use. Set PORT to a free port.`
    );
  } else {
    console.error(err);
  }
  process.exit(1);
}

function tryListen() {
  server.once("error", onListenError);
  server.listen(port, HOST, () => {
    server.off("error", onListenError);
    if (!userPinnedPort && port !== firstPort) {
      console.warn(
        `Port ${firstPort} was busy; listening on ${port} instead (set PORT to pin a port).`
      );
    }
    console.log(
      `Backend API ready at http://localhost:${port}/api/failed-messages`
    );
  });
}

tryListen();
