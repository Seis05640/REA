#!/usr/bin/env node
// Start REA Studio locally: the job worker plus the web UI.
//   npm run studio   production server (runs `next build` first if needed)
//   npm run dev      development server with hot reload
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dev = process.argv.includes("--dev");
const host = process.env.STUDIO_HOST ?? "127.0.0.1";
const port = process.env.STUDIO_PORT ?? "4317";
const node = process.execPath;
const next = join(root, "node_modules", "next", "dist", "bin", "next");
const web = join(root, "apps", "web");
const worker = join(root, "apps", "worker", "dist", "index.js");

const run = (args, cwd) => {
  const result = spawnSync(node, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (!existsSync(worker)) {
  console.log("[studio] Building packages…");
  run([join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "packages/core"], root);
  run([join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "packages/agent"], root);
  run([join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "apps/worker"], root);
}
if (!dev && !existsSync(join(web, ".next", "BUILD_ID"))) {
  console.log("[studio] Building the web app…");
  run([next, "build"], web);
}

const children = [
  spawn(node, [worker], { cwd: root, stdio: "inherit" }),
  spawn(node, [next, dev ? "dev" : "start", "--hostname", host, "--port", port], {
    cwd: web,
    stdio: "inherit",
  }),
];
console.log(`[studio] Open http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`);

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 4_000).unref();
};
process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
for (const child of children) {
  child.once("exit", (code) => {
    if (!stopping) {
      console.error(`[studio] A process exited (code ${code}); stopping.`);
      stop(code ?? 1);
    }
  });
}
