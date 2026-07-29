import assert from "node:assert/strict";
import test from "node:test";

import { parseSafeUrl } from "./safe-url.js";

test("normalizes hostnames, numeric addresses, and default ports", () => {
  const result = parseSafeUrl("HTTP://EXAMPLE.COM:80/a");
  assert.equal(result.ok, true);
  if (result.ok)
    assert.deepEqual(result.value, {
      href: "http://example.com/a",
      protocol: "http:",
      hostname: "example.com",
      port: 80,
      authority: "example.com",
    });
  const loopback = parseSafeUrl("http://2130706433/");
  assert.equal(loopback.ok && loopback.value.hostname, "127.0.0.1");
  const ipv6 = parseSafeUrl("http://[::1]/");
  assert.equal(ipv6.ok && ipv6.value.hostname, "::1");
});

test("returns typed failures for malformed, credentialed, and non-http URLs", () => {
  assert.equal(parseSafeUrl("not a url").ok, false);
  const protocol = parseSafeUrl("ftp://example.com");
  assert.equal(protocol.ok, false);
  if (!protocol.ok) assert.equal(protocol.code, "unsupported-protocol");
  const credentials = parseSafeUrl("https://user:secret@example.com");
  assert.equal(credentials.ok, false);
  if (!credentials.ok)
    assert.equal(credentials.code, "credentials-not-allowed");
});
