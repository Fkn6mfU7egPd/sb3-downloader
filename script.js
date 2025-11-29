import { downloadProject } from "./downloader.js";

const button = document.getElementById("download_button");
const projectid_input = document.getElementById("projectid");
const token_input = document.getElementById("token");
const total_download_size = document.getElementById("total-download");
const progress = document.getElementById("progress");
const download = document.getElementById("download_link");

const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  if (bytes < 1024 ** 1) return `${bytes} Bytes`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
};

button.addEventListener("click", async () => {
  const matches = projectid_input.value.match(/\d+/);
  const projectId = matches ? matches[0] : null;
  if (!projectId) {
    progress.textContent = "Please enter a valid project ID or URL.";
    return;
  }

  progress.textContent = `Starting download: ${projectId}`;
  projectid_input.disabled = true;
  button.disabled = true;
  button.textContent = "ダウンロード中...";
  download.textContent = "";
  try {
    const file = await downloadProject(projectId, (message) => {
      progress.textContent = message;
    }, formatFileSize, token_input.value, size => {
      total_download_size.textContent = "Total download size: " + size;
    });
    const url = URL.createObjectURL(file.content);
    download.href = url;
    download.download = file.filename;
    download.textContent = "Download";
  } catch (e) {
    progress.textContent = `An error occurred: ${e.message}`;
  }
  projectid_input.disabled = false;
  button.disabled = false;
  button.textContent = "ダウンロード";
});