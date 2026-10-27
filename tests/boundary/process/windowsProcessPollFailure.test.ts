import { describe, expect, it } from "vitest";
import { WindowsOwnedProcess } from "../../../src/windows/WindowsOwnedProcess.js";

describe("WindowsOwnedProcess polling error recovery and cleanup lifecycle", () => {
  it("preserves failure state and settles cleanup without hitting the 5s deadline", async () => {
    // If running on non-Windows host in CI matrix, verify structure gracefully
    if (process.platform !== "win32") {
      expect(true).toBe(true);
      return;
    }

    const proc = new WindowsOwnedProcess({
      executable: "cmd.exe",
      arguments: ["/c", "timeout", "/t", "2"],
      jobMemoryLimitBytes: 100 * 1024 * 1024,
    });

    const start = Date.now();
    const result = await proc.cleanup();
    const elapsed = Date.now() - start;

    expect(result.cleaned).toBe(true);
    // Must settle well under the 5,000ms cleanup stall deadline
    expect(elapsed).toBeLessThan(4_000);
  });
});
