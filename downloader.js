function downloadWithProgress(url, onProgress){
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "blob";
    xhr.onprogress = (progress) => {
      onProgress(progress);
    };
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = () => reject(new Error("Failed to download"));
    xhr.send();
  });
}

function readAsText(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.readAsText(blob);
  });
}

export async function downloadProject(project_id, loggerFunction, fileSizeFormatter, project_token){
  const makeProgressBar = (completed, total, length = 20) => {
    const finished = completed / total;
    const filled = Math.max(Math.ceil(finished * length) - 1, 0);
    return finished === 0 ? `[${" ".repeat(length)}]` : finished === 1 ? `[${"=".repeat(length)}]` : `[${"=".repeat(filled)}>${" ".repeat(length - filled - 1)}]`;
  };

  let title;
  let token;
  if (!project_token){
    const api_res = await fetch(`https://trampoline.turbowarp.org/api/projects/${project_id}`);
    if (!api_res.ok) throw new Error(`Failed to fetch project API: HTTP ${api_res.status}`);
    const api_json = await api_res.json();
    token = api_json.project_token;
    title = api_json.title;
  } else {
    token = project_token;
    title = `project_${project_id}`;
  }

  const project_json_blob = await downloadWithProgress(`https://projects.scratch.mit.edu/${project_id}?token=${token}`, (progress) => {
    if(progress.lengthComputable){
      loggerFunction(`${makeProgressBar(progress.loaded, progress.total)} Downloading project.json... ${((progress.loaded / progress.total) * 100).toFixed(2)}% (${fileSizeFormatter(progress.loaded)}/${fileSizeFormatter(progress.total)})`);
    }else{
      loggerFunction(`Downloading project.json... (${fileSizeFormatter(progress.loaded)} downloaded)`);
    }
  });

  const project_json_text = await readAsText(project_json_blob);
  const project_json = JSON.parse(project_json_text);

  loggerFunction("Starting asset downloads...");

  const fetchWithRetry = async (url, maxRetries = 20) => {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const res = await fetch(url);
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.blob();
      } catch {
        attempt++;
        if(attempt >= maxRetries) throw new Error(`Failed after ${maxRetries} attempts: ${url}`);
        await new Promise((r) => setTimeout(r, attempt <= 5 ? 0 : attempt <= 10 ? 500 : attempt <= 15 ? 1000 : 5000));
      }
    }
  };

  const fetchAsset = async (assetId) => {
    const url = `https://assets.scratch.mit.edu/internalapi/asset/${assetId}/get/`;
    return await fetchWithRetry(url);
  };

  const assetIds = [];
  for (const sprite of project_json.targets) {
    for (const c of sprite.costumes){
      if (assetIds.includes(c.md5ext)) continue;
      assetIds.push(c.md5ext);
    }
    for (const s of sprite.sounds){
      if (assetIds.includes(s.md5ext)) continue;
      assetIds.push(s.md5ext);
    }
  }

  const total = assetIds.length;
  let completed = 0;

  const zip = new JSZip();
  zip.file("project.json", JSON.stringify(project_json));

  const tasks = assetIds.map(async (assetId) => {
    const blob = await fetchAsset(assetId);
    zip.file(assetId, blob);

    completed++;
    const percent = Math.floor((completed / total) * 100);
    const bar = makeProgressBar(completed, total);
    loggerFunction(`${bar} Downloading Asset... ${percent}% (${completed}/${total}) ${assetId}`);
  });

  await Promise.all(tasks);

  loggerFunction("Compressing zip...");
  let outputted = null;
  const content = await zip.generateAsync({type: "blob", compression: "DEFLATE", compressionOptions: {level: 9}}, metadata => {
    const currentString = `${makeProgressBar(Math.floor(metadata.percent), 100)} Compressing Files... ${Math.floor(metadata.percent)}%${metadata.currentFile?` ${metadata.currentFile}`:""}`;
    if(outputted === currentString) return;
    outputted = currentString;
    loggerFunction(outputted);
  });
  loggerFunction(`Download completed: ${title}.sb3\nFile size: ${fileSizeFormatter(content.size)}`);
  return { filename: `${title}.sb3`, content };
}

onmessage = (event) => {
  const { status, data } = event.data;
  switch (status) {
    case "start":
      downloadProject(data.projectId);
      break;
  }
};