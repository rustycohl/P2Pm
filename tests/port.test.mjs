import assert from "node:assert/strict";
import test from "node:test";
import { runSelfTest } from "../site/self-test.mjs";

test("P2Pm independent port self-test", async () => {
  const report = await runSelfTest();
  assert.equal(report.pass, true, JSON.stringify(report, null, 2));
});
