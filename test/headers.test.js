const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { filterHeaders } = require("../lib");

describe("filterHeaders", () => {
  it("strips host header", () => {
    const result = filterHeaders([
      ["host", "example.com"],
      ["content-type", "text/html"],
    ]);
    assert.equal(result.host, undefined);
    assert.equal(result["content-type"], "text/html");
  });

  it("strips accept-encoding header", () => {
    const result = filterHeaders([
      ["accept-encoding", "gzip, deflate"],
      ["content-type", "text/html"],
    ]);
    assert.equal(result["accept-encoding"], undefined);
    assert.equal(result["content-type"], "text/html");
  });

  it("strips headers case-insensitively", () => {
    const result = filterHeaders([
      ["Host", "example.com"],
      ["Accept-Encoding", "gzip"],
      ["X-Custom", "value"],
    ]);
    assert.equal(result.Host, undefined);
    assert.equal(result["Accept-Encoding"], undefined);
    assert.equal(result["X-Custom"], "value");
  });

  it("preserves other headers", () => {
    const result = filterHeaders([
      ["content-type", "application/json"],
      ["authorization", "Bearer token"],
      ["x-custom", "value"],
    ]);
    assert.deepEqual(result, {
      "content-type": "application/json",
      authorization: "Bearer token",
      "x-custom": "value",
    });
  });

  it("handles null headers", () => {
    const result = filterHeaders(null);
    assert.deepEqual(result, {});
  });

  it("handles undefined headers", () => {
    const result = filterHeaders(undefined);
    assert.deepEqual(result, {});
  });

  it("handles empty array", () => {
    const result = filterHeaders([]);
    assert.deepEqual(result, {});
  });
});
