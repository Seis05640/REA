import { spawn } from "node:child_process";
import { access, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, clipboard, dialog, ipcMain } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let selectedTarget;
let activeProcess;
let latestEvidence;
let closeNoticeOpen = false;

const sendProgress = (message) => {
  if (mainWindow !== undefined && !mainWindow.isDestroyed())
    mainWindow.webContents.send("rea:progress", message);
};

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 850,
    minHeight: 640,
    backgroundColor: "#0b1118",
    title: "REA",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== pathToFileURL(path.join(__dirname, "index.html")).href)
      event.preventDefault();
  });
  mainWindow.on("close", (event) => {
    if (activeProcess === undefined || closeNoticeOpen) return;
    event.preventDefault();
    closeNoticeOpen = true;
    void dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Inspection in progress",
        message: "Let the current inspection finish before closing REA.",
        buttons: ["Keep REA open"],
        defaultId: 0,
      })
      .finally(() => {
        closeNoticeOpen = false;
      });
  });

  await mainWindow.loadFile(path.join(__dirname, "index.html"));
};

ipcMain.handle("rea:choose-target", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose an app or artifact to inspect",
    properties: ["openFile", "openDirectory"],
    treatPackageAsDirectory: true,
    filters: [{ name: "All files", extensions: ["*"] }],
  });
  if (result.canceled || result.filePaths[0] === undefined)
    return { canceled: true };

  selectedTarget = result.filePaths[0];
  latestEvidence = undefined;
  return { canceled: false, path: selectedTarget };
});

ipcMain.handle("rea:inspect-selected", async () => {
  if (activeProcess !== undefined)
    throw new Error("An inspection is already running.");
  if (selectedTarget === undefined)
    throw new Error("Choose a file or app folder first.");

  const target = selectedTarget;
  const details = await stat(target);
  if (!details.isFile() && !details.isDirectory())
    throw new Error("The selected target is not a regular file or directory.");

  const packageRoot = app.isPackaged
    ? path.join(path.dirname(app.getAppPath()), "app.asar.unpacked")
    : app.getAppPath();
  const cliEntry = path.join(packageRoot, "scripts", "rea.mjs");
  await access(cliEntry);
  sendProgress("Starting REA inspection…");

  const result = await new Promise((resolve, reject) => {
    const nodeExecutable = app.isPackaged
      ? path.join(
          process.resourcesPath,
          "node-runtime",
          process.platform === "win32" ? "node.exe" : "node",
        )
      : path.join(
          app.getAppPath(),
          "node_modules",
          "node",
          "bin",
          process.platform === "win32" ? "node.exe" : "node",
        );
    const child = spawn(
      nodeExecutable,
      [cliEntry, "inspect-artifact", target, "--json"],
      {
        cwd: app.getPath("userData"),
        env: process.env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    activeProcess = child;

    let stdout = "";
    let stderr = "";
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      activeProcess = undefined;
      reject(error);
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (chunk.trim().length > 0) sendProgress("REA is examining the target…");
    });
    child.once("error", (error) => {
      rejectOnce(new Error(`Could not start REA: ${error.message}`));
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      activeProcess = undefined;
      settled = true;
      const output = stdout.trim();
      if (output.length > 0) {
        try {
          JSON.parse(output);
        } catch (error) {
          reject(
            new Error(
              `REA returned invalid JSON: ${error.message}${stderr.trim().length > 0 ? `\n${stderr.trim()}` : ""}`,
            ),
          );
          return;
        }
      }

      if (code !== 0 || output.length === 0) {
        const reason =
          stderr.trim() ||
          `REA exited with ${signal === null ? `code ${code}` : `signal ${signal}`}.`;
        reject(new Error(output.length > 0 ? `${reason}\n${output}` : reason));
        return;
      }
      latestEvidence = stdout;
      resolve({ target, output: stdout, warning: stderr.trim() });
    });
  });

  sendProgress("Inspection complete.");
  return result;
});

ipcMain.handle("rea:copy-evidence", async () => {
  if (latestEvidence === undefined)
    throw new Error("There is no inspection result to copy.");
  clipboard.writeText(latestEvidence);
});

ipcMain.handle("rea:save-evidence", async () => {
  if (latestEvidence === undefined)
    throw new Error("There is no inspection result to save.");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save REA evidence",
    defaultPath: "rea-evidence.json",
    filters: [{ name: "JSON evidence", extensions: ["json"] }],
  });
  if (result.canceled || result.filePath === undefined)
    return { canceled: true };
  await writeFile(result.filePath, latestEvidence, {
    encoding: "utf8",
    flag: "w",
  });
  return { canceled: false, path: result.filePath };
});

app
  .whenReady()
  .then(async () => {
    await createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  })
  .catch((error) => {
    dialog.showErrorBox("REA could not start", error.message);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
