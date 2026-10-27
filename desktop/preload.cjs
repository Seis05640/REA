// oxlint-disable-next-line typescript/no-var-requires -- Electron requires a CommonJS preload with sandbox enabled.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rea", {
  chooseTarget: () => ipcRenderer.invoke("rea:choose-target"),
  inspectSelected: () => ipcRenderer.invoke("rea:inspect-selected"),
  copyEvidence: () => ipcRenderer.invoke("rea:copy-evidence"),
  saveEvidence: () => ipcRenderer.invoke("rea:save-evidence"),
  onProgress: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("rea:progress", listener);
    return () => ipcRenderer.removeListener("rea:progress", listener);
  },
});
