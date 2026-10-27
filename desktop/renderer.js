const browseButton = document.querySelector("#browse-button");
const inspectButton = document.querySelector("#inspect-button");
const copyButton = document.querySelector("#copy-button");
const saveButton = document.querySelector("#save-button");
const targetName = document.querySelector("#target-name");
const targetPath = document.querySelector("#target-path");
const emptyState = document.querySelector("#empty-state");
const resultPanel = document.querySelector("#result-panel");
const errorPanel = document.querySelector("#error-panel");
const resultTarget = document.querySelector("#result-target");
const evidenceOutput = document.querySelector("#evidence-output code");
const resultWarning = document.querySelector("#result-warning");
const statusMessage = document.querySelector("#status-message");

let selectedTarget;
let hasEvidence = false;

const setBusy = (busy) => {
  browseButton.disabled = busy;
  inspectButton.disabled = busy || selectedTarget === undefined;
  copyButton.disabled = busy || !hasEvidence;
  saveButton.disabled = busy || !hasEvidence;
  inspectButton.classList.toggle("busy", busy);
  inspectButton.querySelector("span:first-child").textContent = busy
    ? "Inspecting…"
    : "Inspect artifact";
};

const showError = (error, hideResult = true) => {
  errorPanel.textContent =
    error instanceof Error ? error.message : String(error);
  errorPanel.classList.remove("hidden");
  if (hideResult) {
    resultPanel.classList.add("hidden");
    emptyState.classList.add("hidden");
  }
};

browseButton.addEventListener("click", async () => {
  errorPanel.classList.add("hidden");
  try {
    const choice = await window.rea.chooseTarget();
    if (choice.canceled) return;
    selectedTarget = choice.path;
    hasEvidence = false;
    const parts = selectedTarget.split(/[\\/]/u);
    targetName.textContent = parts.at(-1) || selectedTarget;
    targetPath.textContent = selectedTarget;
    setBusy(false);
    emptyState.classList.remove("hidden");
    resultPanel.classList.add("hidden");
    statusMessage.textContent = "";
  } catch (error) {
    showError(error, false);
  }
});

inspectButton.addEventListener("click", async () => {
  if (selectedTarget === undefined) return;
  errorPanel.classList.add("hidden");
  resultPanel.classList.add("hidden");
  emptyState.classList.add("hidden");
  hasEvidence = false;
  setBusy(true);
  statusMessage.textContent = "Starting local inspection…";

  try {
    const result = await window.rea.inspectSelected();
    resultTarget.textContent = result.target;
    evidenceOutput.textContent = result.output;
    resultWarning.textContent = result.warning;
    resultWarning.classList.toggle("hidden", result.warning.length === 0);
    resultPanel.classList.remove("hidden");
    hasEvidence = true;
    statusMessage.textContent =
      "Inspection complete. Evidence is available below.";
  } catch (error) {
    showError(error, false);
    statusMessage.textContent = "Inspection could not be completed.";
  } finally {
    setBusy(false);
  }
});

copyButton.addEventListener("click", async () => {
  try {
    await window.rea.copyEvidence();
    statusMessage.textContent = "Evidence JSON copied to the clipboard.";
  } catch (error) {
    showError(error, false);
  }
});

saveButton.addEventListener("click", async () => {
  try {
    const result = await window.rea.saveEvidence();
    if (!result.canceled)
      statusMessage.textContent = `Evidence saved to ${result.path}`;
  } catch (error) {
    showError(error, false);
  }
});

window.rea.onProgress((message) => {
  statusMessage.textContent = message;
});
