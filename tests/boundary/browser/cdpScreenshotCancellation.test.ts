import { describe, expect, it, onTestFinished } from "vitest";
import { CdpBrowserProvider } from "../../../src/browser/CdpBrowserProvider.js";
import { captureWebScreenshotInputSchema } from "../../../src/domain/webScreenshot.js";
import { startFakeCdpBrowser } from "../../fixtures/fakeCdpBrowser.js";

describe("CDP screenshot teardown and cancellation boundary", () => {
  it("terminates immediately upon caller abort when Page.captureScreenshot hangs", async () => {
    const browser = await startFakeCdpBrowser({
      hangOnMethod: "Page.captureScreenshot",
    });
    onTestFinished(async () => {
      await browser.close();
    });

    const controller = new AbortController();
    const provider = new CdpBrowserProvider();

    const capturePromise = provider.captureScreenshot(
      captureWebScreenshotInputSchema.parse({
        cdp_endpoint: browser.endpoint,
        allowed_origins: [browser.allowedOrigin],
        target_id: "allowed-page",
      }),
      {
        signal: controller.signal,
        progress: {
          report(update) {
            // Trigger abort as soon as frame authorization finishes
            if (update.completed === 1) {
              controller.abort();
            }
            return Promise.resolve();
          },
        },
      },
    );

    const result = await capturePromise;
    expect(result).toMatchObject({
      ok: false,
      error: {
        _tag: "AnalysisCancelledError",
        operation: "capture_web_screenshot",
      },
    });
  });
});
