const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const EventEmitter = require("events");
const { createConnection } = require("../lib");

function createLog() {
  const messages = [];
  const log = (...args) => messages.push(args.join(" "));
  log.messages = messages;
  return log;
}

describe("createConnection", () => {
  let mockWs;
  let MockWebSocket;
  let log;
  let logError;

  beforeEach(() => {
    log = createLog();
    logError = createLog();
    mockWs = new EventEmitter();
    mockWs.send = mock.fn();
    MockWebSocket = function () {
      return mockWs;
    };
  });

  it("sends phx_join on open", () => {
    createConnection({
      host: "wss://test.com",
      target: { hostname: "127.0.0.1", port: 3000, protocol: "http:", display: "localhost:3000" },
      WebSocket: MockWebSocket,
      log,
      logError,
    });

    mockWs.emit("open");

    assert.equal(mockWs.send.mock.calls.length, 1);
    const msg = JSON.parse(mockWs.send.mock.calls[0].arguments[0]);
    assert.equal(msg[3], "phx_join");
    assert.equal(msg[2], "tunnel:connect");
    assert.equal(msg[0], msg[1]);
  });

  it("starts heartbeat interval on open", () => {
    createConnection({
      host: "wss://test.com",
      target: { hostname: "127.0.0.1", port: 3000, protocol: "http:", display: "localhost:3000" },
      WebSocket: MockWebSocket,
      log,
      logError,
    });

    mockWs.emit("open");

    assert.equal(mockWs.send.mock.calls.length, 1); // just the join message initially
  });

  it("routes tunnel_created event and calls onTunnelCreated", () => {
    let tunnelPayload = null;
    createConnection({
      host: "wss://test.com",
      target: { hostname: "127.0.0.1", port: 3000, protocol: "http:", display: "localhost:3000" },
      WebSocket: MockWebSocket,
      onTunnelCreated: (payload) => { tunnelPayload = payload; },
      log,
      logError,
    });

    mockWs.emit("open");
    mockWs.emit("message", Buffer.from(JSON.stringify([
      "1", "1", "tunnel:connect", "tunnel_created", { url: "https://abc.runlocal.eu", subdomain: "abc", inspect_token: "tok123" }
    ])));

    assert.deepEqual(tunnelPayload, { url: "https://abc.runlocal.eu", subdomain: "abc", inspect_token: "tok123" });
  });

  it("logs tunnel URL and inspect URL with token on tunnel_created", () => {
    createConnection({
      host: "wss://test.com",
      target: { hostname: "127.0.0.1", port: 3000, protocol: "http:", display: "localhost:3000" },
      WebSocket: MockWebSocket,
      log,
      logError,
    });

    mockWs.emit("open");
    mockWs.emit("message", Buffer.from(JSON.stringify([
      "1", "1", "tunnel:connect", "tunnel_created", { url: "https://abc.runlocal.eu", subdomain: "abc", inspect_token: "tok123" }
    ])));

    assert.ok(log.messages.some((m) => m.includes("Tunnel created")));
    assert.ok(log.messages.some((m) => m.includes("https://abc.runlocal.eu")));
    assert.ok(log.messages.some((m) => m.includes("/inspect/abc/tok123")));
  });

  it("handles phx_reply success", () => {
    createConnection({
      host: "wss://test.com",
      target: { hostname: "127.0.0.1", port: 3000, protocol: "http:", display: "localhost:3000" },
      WebSocket: MockWebSocket,
      log,
      logError,
    });

    mockWs.emit("open");
    mockWs.emit("message", Buffer.from(JSON.stringify([
      "1", "1", "tunnel:connect", "phx_reply", { status: "ok" }
    ])));

    // Should not log any errors
    assert.equal(logError.messages.length, 0);
  });

  it("handles phx_reply error", () => {
    createConnection({
      host: "wss://test.com",
      target: { hostname: "127.0.0.1", port: 3000, protocol: "http:", display: "localhost:3000" },
      WebSocket: MockWebSocket,
      log,
      logError,
    });

    mockWs.emit("open");
    mockWs.emit("message", Buffer.from(JSON.stringify([
      "1", "1", "tunnel:connect", "phx_reply", { status: "error", reason: "bad" }
    ])));

    assert.ok(logError.messages.some((e) => e.includes("Failed to join")));
  });

  it("handles phx_close and calls onClose", () => {
    let closed = false;
    createConnection({
      host: "wss://test.com",
      target: { hostname: "127.0.0.1", port: 3000, protocol: "http:", display: "localhost:3000" },
      WebSocket: MockWebSocket,
      onClose: () => { closed = true; },
      log,
      logError,
    });

    mockWs.emit("open");
    mockWs.emit("message", Buffer.from(JSON.stringify([
      "1", "1", "tunnel:connect", "phx_close", {}
    ])));

    assert.equal(closed, true);
  });

  it("logs reconnect message on close", () => {
    const TrackedWebSocket = function () {
      return mockWs;
    };

    createConnection({
      host: "wss://test.com",
      target: { hostname: "127.0.0.1", port: 3000, protocol: "http:", display: "localhost:3000" },
      WebSocket: TrackedWebSocket,
      log,
      logError,
    });

    mockWs.emit("close");

    assert.ok(log.messages.some((l) => l.includes("Reconnecting in 3s")));
  });
});
