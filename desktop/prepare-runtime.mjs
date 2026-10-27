import { chmod, copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(
  __dirname,
  "..",
  "build",
  "desktop-runtime",
);
const outputName = process.platform === "win32" ? "node.exe" : "node";
const nodeExecutable = path.resolve(
  __dirname,
  "..",
  "node_modules",
  "node",
  "bin",
  outputName,
);
const nodeLicense = path.resolve(
  __dirname,
  "..",
  "licenses",
  "Node-24.22.1-LICENSE.txt",
);

const prepare = async () => {
  await mkdir(outputDirectory, { recursive: true });
  await rm(
    path.join(outputDirectory, outputName === "node.exe" ? "node" : "node.exe"),
    { force: true },
  );
  const outputPath = path.join(outputDirectory, outputName);
  await copyFile(nodeExecutable, outputPath);
  await copyFile(nodeLicense, path.join(outputDirectory, "LICENSE"));
  if (process.platform !== "win32") await chmod(outputPath, 0o755);
  process.stdout.write(`Prepared REA's pinned Node runtime at ${outputPath}\n`);
};

prepare().catch((error) => {
  process.stderr.write(
    `Could not prepare REA's Node runtime: ${error.message}\n`,
  );
  process.exitCode = 1;
});
