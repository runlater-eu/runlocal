const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { WebSocketServer } = require("ws");
const { createConnection } = require("../lib");
const WebSocket = require("ws");

const noop = () => {};

describe("integration: full proxy round-trip", () => {
  let localServer;
  let wsServer;
  let httpServerForWs;
  let conn;
  let cleanups = [];

  afterEach(async () => {
    if (conn && conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.close();
    }
    for (const fn of cleanups) {
      await fn();
    }
    cleanups = [];
  });

  it("proxies HTTP request through WebSocket tunnel", async () => {
    localServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "hello from local", method: req.method, url: req.url }));
      });
    });

    await new Promise((resolve) => {
      localServer.listen(0, "127.0.0.1", resolve);
    });
    const localPort = localServer.address().port;
    cleanups.push(() => new Promise((resolve) => localServer.close(resolve)));

    httpServerForWs = http.createServer();
    wsServer = new WebSocketServer({ server: httpServerForWs });

    const responsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for http_response")), 5000);

      wsServer.on("connection", (clientWs) => {
        clientWs.on("message", (data) => {
          const msg = JSON.parse(data.toString());
          const [joinRef, ref, topic, event, payload] = msg;

          if (event === "phx_join") {
            clientWs.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok" }]));
            clientWs.send(JSON.stringify([joinRef, null, topic, "tunnel_created", { url: "https://test-abc.runlocal.eu" }]));

            setTimeout(() => {
              clientWs.send(JSON.stringify([
                joinRef, null, topic, "http_request", {
                  request_id: "int-req-1",
                  method: "GET",
                  path: "/api/test",
                  query_string: "key=value",
                  headers: [["accept", "application/json"]],
                  body: "",
                }
              ]));
            }, 50);
          }

          if (event === "http_response") {
            clearTimeout(timeout);
            resolve(payload);
          }
        });
      });
    });

    await new Promise((resolve) => {
      httpServerForWs.listen(0, "127.0.0.1", resolve);
    });
    const wsPort = httpServerForWs.address().port;
    cleanups.push(() => new Promise((resolve) => {
      wsServer.close();
      httpServerForWs.close(resolve);
    }));

    let tunnelCreated = false;
    conn = createConnection({
      host: `ws://127.0.0.1:${wsPort}`,
      target: { hostname: "127.0.0.1", port: localPort, protocol: "http:", display: `localhost:${localPort}` },
      WebSocket,
      onTunnelCreated: () => { tunnelCreated = true; },
      onClose: noop,
      log: noop,
      logError: noop,
    });

    const response = await responsePromise;

    assert.equal(response.request_id, "int-req-1");
    assert.equal(response.status, 200);

    const body = JSON.parse(response.body);
    assert.equal(body.message, "hello from local");
    assert.equal(body.method, "GET");
    assert.equal(body.url, "/api/test?key=value");
    assert.equal(tunnelCreated, true);

    assert.ok(Array.isArray(response.headers));
    assert.ok(response.headers.every(h => Array.isArray(h) && h.length === 2));
  });

  it("returns 502 when local server is down", async () => {
    httpServerForWs = http.createServer();
    wsServer = new WebSocketServer({ server: httpServerForWs });

    const responsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out")), 5000);

      wsServer.on("connection", (clientWs) => {
        clientWs.on("message", (data) => {
          const msg = JSON.parse(data.toString());
          const [joinRef, ref, topic, event] = msg;

          if (event === "phx_join") {
            clientWs.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok" }]));
            clientWs.send(JSON.stringify([joinRef, null, topic, "tunnel_created", { url: "https://test.runlocal.eu" }]));

            setTimeout(() => {
              clientWs.send(JSON.stringify([
                joinRef, null, topic, "http_request", {
                  request_id: "req-fail",
                  method: "GET",
                  path: "/down",
                  query_string: "",
                  headers: [],
                  body: "",
                }
              ]));
            }, 50);
          }

          if (event === "http_response") {
            clearTimeout(timeout);
            resolve(msg[4]);
          }
        });
      });
    });

    await new Promise((resolve) => {
      httpServerForWs.listen(0, "127.0.0.1", resolve);
    });
    const wsPort = httpServerForWs.address().port;
    cleanups.push(() => new Promise((resolve) => {
      wsServer.close();
      httpServerForWs.close(resolve);
    }));

    conn = createConnection({
      host: `ws://127.0.0.1:${wsPort}`,
      target: { hostname: "127.0.0.1", port: 19998, protocol: "http:", display: "localhost:19998" },
      WebSocket,
      onTunnelCreated: noop,
      onClose: noop,
      log: noop,
      logError: noop,
    });

    const response = await responsePromise;

    assert.equal(response.request_id, "req-fail");
    assert.equal(response.status, 502);
    assert.ok(response.body.includes("Could not connect to localhost:19998"));
  });
});
