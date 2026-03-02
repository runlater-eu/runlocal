const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs, buildWsUrl } = require("../lib");

describe("parseArgs", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.RUNLOCAL_HOST;
    delete process.env.RUNLOCAL_HOST;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.RUNLOCAL_HOST = originalEnv;
    } else {
      delete process.env.RUNLOCAL_HOST;
    }
  });

  it("returns default port 3000 and default host", () => {
    const result = parseArgs([]);
    assert.equal(result.port, 3000);
    assert.equal(result.host, "wss://runlocal.eu");
  });

  it("parses custom port", () => {
    const result = parseArgs(["4000"]);
    assert.equal(result.port, 4000);
  });

  it("parses --host flag", () => {
    const result = parseArgs(["3000", "--host", "wss://custom.com"]);
    assert.equal(result.port, 3000);
    assert.equal(result.host, "wss://custom.com");
  });

  it("uses RUNLOCAL_HOST env var as fallback", () => {
    process.env.RUNLOCAL_HOST = "wss://env-host.com";
    const result = parseArgs([]);
    assert.equal(result.host, "wss://env-host.com");
  });

  it("--host flag takes precedence over RUNLOCAL_HOST env var", () => {
    process.env.RUNLOCAL_HOST = "wss://env-host.com";
    const result = parseArgs(["--host", "wss://flag-host.com"]);
    assert.equal(result.host, "wss://flag-host.com");
  });

  it("returns null subdomain by default", () => {
    const result = parseArgs(["3000"]);
    assert.equal(result.subdomain, null);
  });

  it("parses --subdomain flag", () => {
    const result = parseArgs(["3000", "--subdomain", "my-api"]);
    assert.equal(result.subdomain, "my-api");
  });
});

describe("buildWsUrl", () => {
  it("includes subdomain param when provided", () => {
    const url = buildWsUrl("wss://runlocal.eu", "pk_key", "my-api");
    assert.ok(url.includes("subdomain=my-api"));
    assert.ok(url.includes("api_key=pk_key"));
  });

  it("omits subdomain param when null", () => {
    const url = buildWsUrl("wss://runlocal.eu", "pk_key", null);
    assert.ok(!url.includes("subdomain"));
    assert.ok(url.includes("api_key=pk_key"));
  });

  it("omits both api_key and subdomain when not provided", () => {
    const url = buildWsUrl("wss://runlocal.eu", null, null);
    assert.ok(!url.includes("api_key"));
    assert.ok(!url.includes("subdomain"));
    assert.ok(url.includes("vsn=2.0.0"));
  });
});
