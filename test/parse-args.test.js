const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs } = require("../lib");

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
});
