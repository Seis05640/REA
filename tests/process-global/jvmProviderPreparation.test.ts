import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as commands from "../../src/process/OwnedCommand.js";
import { DarwinProcessOwnershipInspectionError } from "../../src/process/DarwinProcessRunTokenReader.js";
import { ProviderCleanupError } from "../../src/domain/providerCleanupError.js";
import { VineflowerProvider } from "../../src/jvm/VineflowerProvider.js";
import { createTestTempDirectory } from "../fixtures/temporaryDirectory.js";

afterEach(() => vi.restoreAllMocks());

const fixture = async () => {
  const root = await createTestTempDirectory("rea-jvm-preparation-");
  const command = join(root, "vineflower");
  const path = join(root, "Probe.class");
  await writeFile(path, Buffer.from("cafebabe000000340001", "hex"));
  await writeFile(
    command,
    `#!${process.execPath}\nif (process.argv.includes('--help')) { console.log('=== Vineflower Decompiler 1.12.0 ==='); } else { require('node:fs').writeFileSync(require('node:path').join(process.argv.at(-1), 'Probe.java'), 'class Probe {}'); }\n`,
    { mode: 0o700 },
  );
  return {
    root,
    path,
    provider: new VineflowerProvider({
      environment: { ...process.env, REA_VINEFLOWER_COMMAND: command },
    }),
  };
};

it.each(["inspect_jvm_decompiler", "decompile_jvm_artifact"] as const)(
  "prepares ownership before either execution deadline for %s",
  async (operation) => {
    const f = await fixture();
    const caller = new AbortController();
    const prepare = vi
      .spyOn(commands, "prepareOwnedCommand")
      .mockResolvedValue();
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      const result = await f.provider.execute(
        operation === "inspect_jvm_decompiler"
          ? { operation, input: {} }
          : {
              operation,
              input: {
                path: f.path,
                output_directory: join(f.root, "sources"),
                classpath: [],
              },
            },
        { signal: caller.signal },
      );
      expect(result.ok).toBe(true);
      expect(prepare).toHaveBeenCalledWith(caller.signal);
      expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(
        timeout.mock.invocationCallOrder[0]!,
      );
    } finally {
      await f.provider.close();
    }
  },
);

it.each(["preparation", "command", "wrapped"] as const)(
  "retains and resolves the exact helper cleanup owner after %s failure",
  async (route) => {
    const f = await fixture();
    let blocked = true;
    const cleanup = new ProviderCleanupError(
      "process-ownership",
      ["controlled-helper"],
      { reason: "helper cleanup pending" },
    );
    const preparation = new DarwinProcessOwnershipInspectionError(
      "helper preparation failed",
      {
        cleanupFailure: cleanup,
        cleanupOwner: {
          async close() {
            if (blocked) throw cleanup;
            cleanup.resolveCleanup();
          },
        },
      },
    );
    vi.spyOn(commands, "prepareOwnedCommand").mockImplementation(async () => {
      if (route === "preparation") throw preparation;
    });
    vi.spyOn(commands, "runOwnedCommand").mockRejectedValue(
      route === "wrapped"
        ? new commands.OwnedCommandFailure(
            "process",
            "wrapped preparation failure",
            null,
            null,
            { preparationFailure: preparation },
          )
        : preparation,
    );
    try {
      const failed = await f.provider.execute({
        operation: "inspect_jvm_decompiler",
        input: {},
      });
      expect(failed).toMatchObject({
        ok: false,
        error: {
          operation: "inspect_jvm_decompiler",
          cleanupIncomplete: true,
          cleanupResources: ["controlled-helper"],
        },
      });
      if (failed.ok) throw new Error("Expected helper failure");
      const retried = await f.provider.close().catch((cause: unknown) => cause);
      expect(retried).toMatchObject({
        cleanupIncomplete: true,
        cleanupResources: ["controlled-helper"],
      });
      blocked = false;
      await f.provider.close();
      expect(cleanup.cleanupIncomplete).toBe(false);
      expect(failed.error.cleanupIncomplete).toBe(false);
      expect(failed.error.cleanupResources).toEqual([]);
      expect(retried).toMatchObject({
        cleanupIncomplete: false,
        cleanupResources: [],
      });
    } finally {
      blocked = false;
      await f.provider.close();
    }
  },
);
