const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { handleRequest } = require("../lib");

function createLog() {
  const messages = [];
  const log = (...args) => messages.push(args.join(" "));
  log.messages = messages;
  return log;
}

describe("handleRequest", () => {
  let localServer;
  let localPort;
  let refCounter;
  let log;
  const nextRef = () => String(++refCounter);

  beforeEach(async () => {
    refCounter = 0;
    log = createLog();
    await new Promise((resolve) => {
      localServer = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          if (req.url === "/hello") {
            res.writeHead(200, { "content-type": "text/plain" });
            res.end("Hello World");
          } else if (req.url === "/echo") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ method: req.method, body, headers: req.headers }));
          } else if (req.url.startsWith("/query")) {
            res.writeHead(200, { "content-type": "text/plain" });
            res.end(`path: ${req.url}`);
          } else if (req.url === "/multi-header") {
            res.writeHead(200, {
              "content-type": "text/plain",
              "set-cookie": ["a=1", "b=2"],
            });
            res.end("ok");
          } else {
            res.writeHead(404);
            res.end("Not Found");
          }
        });
      });
      localServer.listen(0, "127.0.0.1", () => {
        localPort = localServer.address().port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise((resolve) => localServer.close(resolve));
  });

  it("proxies GET request and sends response via ws.send()", async () => {
    const sent = [];
    const mockWs = { send: (data) => sent.push(JSON.parse(data)) };

    handleRequest(mockWs, "1", "tunnel:connect", {
      request_id: "req1",
      method: "GET",
      path: "/hello",
      query_string: "",
      headers: [],
      body: "",
    }, localPort, nextRef, log);

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(sent.length, 1);
    const [joinRef, ref, topic, event, payload] = sent[0];
    assert.equal(joinRef, "1");
    assert.equal(topic, "tunnel:connect");
    assert.equal(event, "http_response");
    assert.equal(payload.request_id, "req1");
    assert.equal(payload.status, 200);
    assert.equal(payload.body, "Hello World");
  });

  it("proxies POST with body", async () => {
    const sent = [];
    const mockWs = { send: (data) => sent.push(JSON.parse(data)) };

    handleRequest(mockWs, "1", "tunnel:connect", {
      request_id: "req2",
      method: "POST",
      path: "/echo",
      query_string: "",
      headers: [["content-type", "application/json"]],
      body: '{"key":"value"}',
    }, localPort, nextRef, log);

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(sent.length, 1);
    const payload = sent[0][4];
    assert.equal(payload.status, 200);
    const respBody = JSON.parse(payload.body);
    assert.equal(respBody.method, "POST");
    assert.equal(respBody.body, '{"key":"value"}');
  });

  it("appends query string to path", async () => {
    const sent = [];
    const mockWs = { send: (data) => sent.push(JSON.parse(data)) };

    handleRequest(mockWs, "1", "tunnel:connect", {
      request_id: "req3",
      method: "GET",
      path: "/query",
      query_string: "foo=bar&baz=1",
      headers: [],
      body: "",
    }, localPort, nextRef, log);

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(sent.length, 1);
    const payload = sent[0][4];
    assert.equal(payload.body, "path: /query?foo=bar&baz=1");
  });

  it("converts array-valued response headers to [[k, v]] format", async () => {
    const sent = [];
    const mockWs = { send: (data) => sent.push(JSON.parse(data)) };

    handleRequest(mockWs, "1", "tunnel:connect", {
      request_id: "req4",
      method: "GET",
      path: "/multi-header",
      query_string: "",
      headers: [],
      body: "",
    }, localPort, nextRef, log);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const payload = sent[0][4];
    const setCookieHeaders = payload.headers.filter(([k]) => k === "set-cookie");
    assert.equal(setCookieHeaders.length, 2);
    assert.deepEqual(setCookieHeaders, [["set-cookie", "a=1"], ["set-cookie", "b=2"]]);
  });

  it("returns 502 when local server is unreachable", async () => {
    const sent = [];
    const mockWs = { send: (data) => sent.push(JSON.parse(data)) };

    handleRequest(mockWs, "1", "tunnel:connect", {
      request_id: "req5",
      method: "GET",
      path: "/hello",
      query_string: "",
      headers: [],
      body: "",
    }, 19999, nextRef, log);

    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(sent.length, 1);
    const [joinRef, ref, topic, event, payload] = sent[0];
    assert.equal(event, "http_response");
    assert.equal(payload.status, 502);
    assert.ok(payload.body.includes("Could not connect to localhost:19999"));
  });

  it("logs the request method and path", async () => {
    const sent = [];
    const mockWs = { send: (data) => sent.push(JSON.parse(data)) };

    handleRequest(mockWs, "1", "tunnel:connect", {
      request_id: "req7",
      method: "GET",
      path: "/hello",
      query_string: "",
      headers: [],
      body: "",
    }, localPort, nextRef, log);

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.ok(log.messages.some((m) => m.includes("GET") && m.includes("/hello")));
    assert.ok(log.messages.some((m) => m.includes("200")));
  });

  it("uses correct Phoenix protocol format", async () => {
    const sent = [];
    const mockWs = { send: (data) => sent.push(JSON.parse(data)) };

    handleRequest(mockWs, "join-1", "tunnel:connect", {
      request_id: "req6",
      method: "GET",
      path: "/hello",
      query_string: "",
      headers: [],
      body: "",
    }, localPort, nextRef, log);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const msg = sent[0];
    assert.equal(Array.isArray(msg), true);
    assert.equal(msg.length, 5);
    assert.equal(msg[0], "join-1");      // joinRef
    assert.equal(typeof msg[1], "string"); // ref
    assert.equal(msg[2], "tunnel:connect"); // topic
    assert.equal(msg[3], "http_response");  // event
    assert.equal(typeof msg[4], "object");  // payload
  });
});
