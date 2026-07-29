import assert from "node:assert/strict";
import test from "node:test";

import {
  approveConnectionTarget,
  approveRedirectTarget,
  classifyIpAddress,
  type DnsResolver,
} from "./ip-policy.js";

test("blocks unsafe IPv4, IPv6, mapped, and alternate numeric addresses", () => {
  for (const address of [
    "127.0.0.1",
    "127.1",
    "2130706433",
    "10.0.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "224.0.0.1",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(classifyIpAddress(address).allowed, false, address);
  assert.equal(classifyIpAddress("93.184.216.34").allowed, true);
  assert.equal(
    classifyIpAddress("2606:2800:220:1:248:1893:25c8:1946").allowed,
    true,
  );
});

test("requires every DNS answer to pass and pins the checked address", async () => {
  const mixed: DnsResolver = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ];
  assert.equal(
    (await approveConnectionTarget("https://example.com", mixed)).ok,
    false,
  );

  const approved = await approveConnectionTarget(
    "https://example.com",
    async () => [{ address: "93.184.216.34", family: 4 }],
  );
  assert.equal(approved.ok, true);
  if (approved.ok) {
    assert.equal(approved.value.address, "93.184.216.34");
    assert.equal(approved.value.servername, "example.com");
  }
});

test("re-resolves redirects and can model a DNS rebinding answer", async () => {
  let call = 0;
  const changing: DnsResolver = async () => [
    call++ === 0
      ? { address: "93.184.216.34", family: 4 as const }
      : { address: "169.254.169.254", family: 4 as const },
  ];
  const initial = await approveConnectionTarget(
    "https://example.com/start",
    changing,
  );
  assert.equal(initial.ok, true);
  if (initial.ok) {
    assert.equal(
      (await approveRedirectTarget("/next", initial.value, changing)).ok,
      false,
    );
    // A transport retains the first literal rather than resolving the hostname.
    assert.equal(initial.value.address, "93.184.216.34");
  }
});
