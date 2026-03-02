#!/usr/bin/env node

const WebSocket = require("ws");
const http = require("http");

const args = process.argv.slice(2);
let port = 3000;
let host = process.env.RUNLOCAL_HOST || "wss://runlocal.eu";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--host" && args[i + 1]) {
    host = args[++i];
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log("Usage: runlocal <port> [--host wss://your-server.com]");
    console.log("");
    console.log("Options:");
    console.log("  --host <url>  Server URL (default: wss://runlocal.eu)");
    console.log("  --help, -h    Show this help");
    console.log("");
    console.log("Environment:");
    console.log("  RUNLOCAL_HOST  Same as --host");
    process.exit(0);
  } else if (!args[i].startsWith("-")) {
    port = parseInt(args[i], 10);
  }
}

const PORT = port;
const HOST = host;
const WS_URL = `${HOST}/tunnel/websocket?vsn=2.0.0`;

const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

let refCounter = 0;
const nextRef = () => String(++refCounter);

function connect() {
  const ws = new WebSocket(WS_URL);
  let heartbeatTimer = null;
  let joinRef = null;

  ws.on("open", () => {
    const displayHost = HOST.replace(/^wss?:\/\//, "");
    console.log(`${DIM}Connecting to ${displayHost}...${RESET}`);
    joinRef = nextRef();
    // Phoenix Channel join message: [join_ref, ref, topic, event, payload]
    ws.send(JSON.stringify([joinRef, joinRef, "tunnel:connect", "phx_join", {}]));

    // Heartbeat every 30s
    heartbeatTimer = setInterval(() => {
      ws.send(
        JSON.stringify([null, nextRef(), "phoenix", "heartbeat", {}])
      );
    }, 30000);
  });

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    // Phoenix v2 serializer: [join_ref, ref, topic, event, payload]
    const [, , topic, event, payload] = msg;

    if (event === "phx_reply" && topic === "tunnel:connect") {
      if (payload.status === "ok") {
        // Join succeeded, wait for tunnel_created push
      } else {
        console.error(`${RED}Failed to join: ${JSON.stringify(payload)}${RESET}`);
      }
      return;
    }

    if (event === "tunnel_created") {
      console.log("");
      console.log(`  ${GREEN}${BOLD}Tunnel created!${RESET}`);
      console.log(`  ${CYAN}${BOLD}${payload.url}${RESET}`);
      console.log("");
      console.log(`  ${DIM}Forwarding to localhost:${PORT}${RESET}`);
      console.log(`  ${DIM}Press Ctrl+C to stop${RESET}`);
      console.log("");
      return;
    }

    if (event === "http_request") {
      handleRequest(ws, joinRef, topic, payload);
      return;
    }

    if (event === "phx_close") {
      console.log(`${YELLOW}Tunnel closed by server${RESET}`);
      process.exit(0);
    }
  });

  ws.on("close", () => {
    clearInterval(heartbeatTimer);
    console.log(`${YELLOW}Disconnected. Reconnecting in 3s...${RESET}`);
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    if (err.code === "ECONNREFUSED") {
      const displayHost = HOST.replace(/^wss?:\/\//, "");
      console.error(
        `${RED}Could not connect to ${displayHost}${RESET}`
      );
    } else {
      console.error(`${RED}WebSocket error: ${err.message}${RESET}`);
    }
  });
}

function handleRequest(ws, joinRef, topic, payload) {
  const { request_id, method, path, query_string, headers, body } = payload;
  const fullPath = query_string ? `${path}?${query_string}` : path;

  const timestamp = new Date().toLocaleTimeString();
  console.log(
    `${DIM}${timestamp}${RESET}  ${BOLD}${method}${RESET} ${fullPath}`
  );

  const reqHeaders = {};
  if (headers) {
    for (const [k, v] of headers) {
      // Skip host header (proxying to localhost) and accept-encoding
      // (compressed responses corrupt during string conversion)
      if (k.toLowerCase() !== "host" && k.toLowerCase() !== "accept-encoding") {
        reqHeaders[k] = v;
      }
    }
  }

  const options = {
    hostname: "127.0.0.1",
    port: PORT,
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
      console.log(
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
    console.log(
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
          body: `Could not connect to localhost:${PORT} — ${err.message}`,
        },
      ])
    );
  });

  if (body && body.length > 0) {
    proxyReq.write(body);
  }
  proxyReq.end();
}

console.log(`${BOLD}runlocal${RESET} — expose localhost:${PORT} to the internet`);
connect();
