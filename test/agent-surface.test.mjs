// Guards the contributor-only agent workflows so documented, licensed skills
// cannot silently disappear or leak into the package boundary.
import { execa } from "execa";
import { expect, test } from "vitest";

test("verifies the contributor agent surface", async () => {
  const result = await execa("node", ["scripts/check-agent-surface.mjs"]);

  expect(result.stdout).toContain("Agent contributor surface verified.");
});
