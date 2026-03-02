const http = require("http");

const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

function parseArgs(argv) {
  let port = 3000;
  let host = process.env.RUNLOCAL_HOST || "wss://runlocal.eu";

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--host" && argv[i + 1]) {
      host = argv[++i];
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("Usage: runlocal <port> [--host wss://your-server.com]");
      console.log("");
      console.log("Options:");
      console.log("  --host <url>  Server URL (default: wss://runlocal.eu)");
      console.log("  --help, -h    Show this help");
      console.log("");
      console.log("Environment:");
      console.log("  RUNLOCAL_HOST  Same as --host");
      process.exit(0);
    } else if (!argv[i].startsWith("-")) {
      port = parseInt(argv[i], 10);
    }
  }

  return { port, host };
}

function filterHeaders(headers) {
  const filtered = {};
  if (headers) {
    for (const [k, v] of headers) {
      if (k.toLowerCase() !== "host" && k.toLowerCase() !== "accept-encoding") {
        filtered[k] = v;
      }
    }
  }
  return filtered;
}

function buildWsUrl(host) {
  return `${host}/tunnel/websocket?vsn=2.0.0`;
}

function handleRequest(ws, joinRef, topic, payload, port, nextRef, log) {
  const { request_id, method, path, query_string, headers, body } = payload;
  const fullPath = query_string ? `${path}?${query_string}` : path;

  const timestamp = new Date().toLocaleTimeString();
  log(
    `${DIM}${timestamp}${RESET}  ${BOLD}${method}${RESET} ${fullPath}`
  );

  const reqHeaders = filterHeaders(headers);

  const options = {
    hostname: "127.0.0.1",
    port: port,
    path: fullPath,
    method: method,
    headers: reqHeaders,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const chunks = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", () => {
      const respBody = Buffer.concat(chunks).toString();
      const respHeaders = [];
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (Array.isArray(v)) {
          for (const val of v) {
            respHeaders.push([k, val]);
          }
        } else {
          respHeaders.push([k, v]);
        }
      }

      const statusColor =
        proxyRes.statusCode < 400 ? GREEN : RED;
      log(
        `${DIM}${timestamp}${RESET}  ${statusColor}${proxyRes.statusCode}${RESET} ${fullPath}`
      );

      ws.send(
        JSON.stringify([
          joinRef,
          nextRef(),
          topic,
          "http_response",
          {
            request_id,
            status: proxyRes.statusCode,
            headers: respHeaders,
            body: respBody,
          },
        ])
      );
    });
  });

  proxyReq.on("error", (err) => {
    log(
      `${DIM}${timestamp}${RESET}  ${RED}ERR${RESET} ${fullPath} — ${err.message}`
    );
    ws.send(
      JSON.stringify([
        joinRef,
        nextRef(),
        topic,
        "http_response",
        {
          request_id,
          status: 502,
          headers: [["content-type", "text/plain"]],
          body: `Could not connect to localhost:${port} — ${err.message}`,
        },
      ])
    );
  });

  if (body && body.length > 0) {
    proxyReq.write(body);
  }
  proxyReq.end();
}

function createConnection(options) {
  const {
    host,
    port,
    WebSocket,
    onTunnelCreated,
    onClose,
    log = console.log,
    logError = console.error,
  } = options;
  const wsUrl = buildWsUrl(host);

  let refCounter = 0;
  const nextRef = () => String(++refCounter);

  const ws = new WebSocket(wsUrl);
  let heartbeatTimer = null;
  let joinRef = null;

  ws.on("open", () => {
    const displayHost = host.replace(/^wss?:\/\//, "");
    log(`${DIM}Connecting to ${displayHost}...${RESET}`);
    joinRef = nextRef();
    ws.send(JSON.stringify([joinRef, joinRef, "tunnel:connect", "phx_join", {}]));

    heartbeatTimer = setInterval(() => {
      ws.send(
        JSON.stringify([null, nextRef(), "phoenix", "heartbeat", {}])
      );
    }, 30000);
    heartbeatTimer.unref();
  });

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    const [, , topic, event, payload] = msg;

    if (event === "phx_reply" && topic === "tunnel:connect") {
      if (payload.status === "ok") {
        // Join succeeded, wait for tunnel_created push
      } else {
        logError(`${RED}Failed to join: ${JSON.stringify(payload)}${RESET}`);
      }
      return;
    }

    if (event === "tunnel_created") {
      log("");
      log(`  ${GREEN}${BOLD}Tunnel created!${RESET}`);
      log(`  ${CYAN}${BOLD}${payload.url}${RESET}`);
      log("");
      log(`  ${DIM}Forwarding to localhost:${port}${RESET}`);
      log(`  ${DIM}Press Ctrl+C to stop${RESET}`);
      log("");
      if (onTunnelCreated) onTunnelCreated(payload);
      return;
    }

    if (event === "http_request") {
      handleRequest(ws, joinRef, topic, payload, port, nextRef, log);
      return;
    }

    if (event === "phx_close") {
      log(`${YELLOW}Tunnel closed by server${RESET}`);
      if (onClose) {
        onClose();
      } else {
        process.exit(0);
      }
    }
  });

  ws.on("close", () => {
    clearInterval(heartbeatTimer);
    log(`${YELLOW}Disconnected. Reconnecting in 3s...${RESET}`);
    const reconnectTimer = setTimeout(() => createConnection(options), 3000);
    reconnectTimer.unref();
  });

  ws.on("error", (err) => {
    if (err.code === "ECONNREFUSED") {
      const displayHost = host.replace(/^wss?:\/\//, "");
      logError(
        `${RED}Could not connect to ${displayHost}${RESET}`
      );
    } else {
      logError(`${RED}WebSocket error: ${err.message}${RESET}`);
    }
  });

  return { ws, getJoinRef: () => joinRef, nextRef };
}

module.exports = {
  parseArgs,
  filterHeaders,
  buildWsUrl,
  handleRequest,
  createConnection,
};
