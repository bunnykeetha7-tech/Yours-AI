const API = "http://127.0.0.1:8000";

let currentConversation = null;
let authToken = localStorage.getItem("yours_ai_token");
let currentUser = null;
let currentConversation = null;
let authToken = localStorage.getItem("yours_ai_token");
let currentUser = null;
let generationController = null;
let searchEnabled = localStorage.getItem("yours_ai_search") === "true";
let codingMode = localStorage.getItem("yours_ai_coding") === "true";
let selectedImage = null;
let selectedImages = [];
let selectedImageDownloadUrl = null;
let visionModels = [];

const $ = id => document.getElementById(id);
const messages = $("messages");
const prompt = $("prompt");
const sendBtn = $("sendBtn");
const model = $("model");
const chatList = $("chatList");

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  let response;
  try {
    response = await fetch(`${API}${path}`, {...options, headers});
  } catch (error) {
    const message = `Network error connecting to ${API}: ${error.message}`;
    console.error(message, error);
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    if (response.status === 401) {
      authToken = null;
      currentUser = null;
      localStorage.removeItem("yours_ai_token");
      showAuth(false);
    }
    const detail = typeof data === "object" ? data.detail : data;
    const message = `HTTP ${response.status} ${response.statusText}: ${detail || "Request failed"}`;
    console.error(message, { path, response: data });
    throw new Error(message);
  }
  return data;
}

function showAuth(register = false) {
  $("authScreen").hidden = false;
  $("authName").hidden = !register;
  $("authName").required = register;
  $("authPassword").autocomplete = register ? "new-password" : "current-password";
  $("authSubmit").textContent = register ? "Create account" : "Sign in";
  $("loginTab").classList.toggle("active", !register);
  $("registerTab").classList.toggle("active", register);
}

async function submitAuth(event) {
  event.preventDefault();
  const register = $("registerTab").classList.contains("active");
  try {
    const body = register
      ? {name: $("authName").value, email: $("authEmail").value, password: $("authPassword").value}
      : {email: $("authEmail").value, password: $("authPassword").value};
    const data = await apiFetch(register ? "/auth/register" : "/auth/login", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem("yours_ai_token", authToken);
    $("authScreen").hidden = true;
    initializeApp();
  } catch (error) {
    $("authError").textContent = error.message;
  }
}

function addMessage(role, text) {
  const welcome = messages.querySelector(".welcome");
  if (welcome) welcome.remove();

  const row = document.createElement("div");
  row.className = `msg ${role}`;
  row.innerHTML = `
    <div class="avatar ${role === "user" ? "user" : "ai"}">${role === "user" ? "U" : "✦"}</div>
    <div class="bubble"></div>`;
  row.querySelector(".bubble").innerHTML = role === "ai" ? renderMarkdown(text) : escapeHtml(text);
  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
  return row;
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

function renderMarkdown(value) {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, language, code) => `<div class="code-block"><span>${language || "code"}</span><button type="button" class="copy-code" data-code="${encodeURIComponent(code)}">Copy</button><pre><code>${code}</code></pre></div>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function clearImage() {
  selectedImage = null;
  selectedImageDownloadUrl = null;
  $("imageInput").value = "";
  $("imagePreview").hidden = true;
  $("downloadImage").hidden = true;
  $("previewImage").removeAttribute("src");
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function downloadBlob(url, filename) {
  const response = await fetch(`${API}${url}`, {headers: {Authorization: `Bearer ${authToken}`} });
  if (!response.ok) throw new Error(`HTTP ${response.status}: download failed`);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await response.blob());
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadSelectedImage() {
  if (selectedImageDownloadUrl) {
    return downloadBlob(selectedImageDownloadUrl, selectedImage?.name || "image");
  }
  if (!selectedImage) return Promise.resolve();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(selectedImage);
  link.download = selectedImage.name;
  link.click();
  URL.revokeObjectURL(link.href);
  return Promise.resolve();
}

async function uploadSelectedImage() {
  const files = Array.from($("imageInput").files);
  if (!files.length) return;
  if (files.length > 4) throw new Error("You can attach up to 4 images at once.");
  const file = files[0];
  const extensions = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".svg", ".heic", ".heif", ".ico", ".avif"];
  for (const image of files) {
    const extension = `.${image.name.split(".").pop().toLowerCase()}`;
    if (!extensions.includes(extension)) throw new Error(`Unsupported image: ${image.name}`);
    if (image.size > 10 * 1024 * 1024) throw new Error(`Image exceeds the maximum 10 MB size: ${image.name}`);
  }
  selectedImages = files;
  selectedImage = file;
  $("previewImage").src = URL.createObjectURL(file);
  $("imagePreview").hidden = false;
  $("downloadImage").hidden = false;
  $("imageDetails").textContent = files.map(image => `${image.name} · ${formatBytes(image.size)}`).join(" | ");
  $("fileStatus").textContent = `${files.length} image${files.length === 1 ? "" : "s"} selected`;
  if (visionModels.length && !visionModels.includes(model.value)) {
    model.value = visionModels[0];
    $("fileStatus").textContent += ` · Using vision model ${model.value}`;
  } else if (!visionModels.length) {
    $("fileStatus").textContent += " · No vision model installed; install one with: ollama pull moondream";
  }
}

async function analyzeSelectedImage(text, bubble, userRow) {
  const uploads = [];
  for (const image of selectedImages) {
    const form = new FormData();
    form.append("file", image);
    if (currentConversation) form.append("conversation_id", currentConversation);
    uploads.push(await apiFetch("/upload/image", {method: "POST", body: form}));
  }
  const upload = uploads[0];
  selectedImageDownloadUrl = upload.download_url;
  $("downloadImage").hidden = false;
  uploads.forEach(item => {
    const originalDownload = document.createElement("button");
    originalDownload.className = "download-action";
    originalDownload.textContent = `Download ${item.filename}`;
    originalDownload.onclick = () => downloadBlob(item.download_url, item.filename);
    userRow.querySelector(".bubble").appendChild(originalDownload);
  });
  const vision = new FormData();
  uploads.forEach(item => vision.append("attachment_ids", item.id));
  vision.append("prompt", text || "Describe this image.");
  vision.append("model", model.value || "");
  if (currentConversation) vision.append("conversation_id", currentConversation);
  const data = await apiFetch("/vision/analyze", {method: "POST", body: vision});
  currentConversation = data.conversation_id;
  bubble.textContent = data.response;
  const download = document.createElement("button");
  download.className = "download-action";
  download.textContent = "Download processed image";
  download.onclick = () => downloadBlob(data.processed_download_url, `${selectedImage?.name || "image"}_analysis.png`);
  bubble.appendChild(download);
  clearImage();
  await loadChats();
}

async function createImage() {
  const text = prompt.value.trim();
  if (!text) { $("fileStatus").textContent = "Describe the image you want to create first."; return; }
  $("fileStatus").textContent = "Requesting image generation…";
  const form = new FormData(); form.append("prompt", text);
  try {
    const data = await apiFetch("/image/generate", {method: "POST", body: form});
    const response = await fetch(`${API}${data.download_url}`, {headers: {Authorization: `Bearer ${authToken}`} });
    if (!response.ok) throw new Error(`HTTP ${response.status}: unable to download generated image`);
    const imageUrl = URL.createObjectURL(await response.blob());
    const row = addMessage("ai", `Generated image: ${data.filename}`);
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = data.filename;
    image.className = "message-image";
    row.querySelector(".bubble").appendChild(image);
    $("fileStatus").innerHTML = `<a href="${imageUrl}" download="${data.filename}">Download generated image</a>`;
  } catch (error) {
    console.error("Image generation failed", error);
    $("fileStatus").textContent = error.message;
  }
}

function addTyping() {
  return addMessage("ai", "");
}

async function loadModels() {
  try {
    const data = await apiFetch("/models");
    model.innerHTML = "";
    (data.models || []).forEach(name => {
      const o = document.createElement("option");
      o.value = name; o.textContent = name;
      model.appendChild(o);
    });
    if (data.models?.includes("qwen3:4b")) model.value = "qwen3:4b";
    if (!data.models?.length) model.innerHTML = `<option value="">No Ollama model</option>`;
    try {
      const capabilities = await apiFetch("/models/capabilities");
      visionModels = (capabilities.models || []).filter(item => (item.capabilities || []).includes("vision")).map(item => item.name);
      Array.from(model.options).forEach(option => {
        if (visionModels.includes(option.value)) option.textContent = `${option.value} · vision`;
      });
    } catch (error) {
      console.error("Loading model capabilities failed", error);
    }
  } catch (error) {
    console.error("Loading models failed", error);
    model.innerHTML = `<option value="">Ollama unavailable</option>`;
  }
}

async function loadChats() {
  try {
    const data = await apiFetch("/conversations");
    chatList.innerHTML = "";
    data.forEach(c => {
      const row = document.createElement("div");
      row.className = "chat-row";
      row.innerHTML = `<button class="chat-item"></button><button class="chat-action" title="Rename">✎</button><button class="chat-action" title="Delete">×</button>`;
      row.querySelector(".chat-item").textContent = c.title;
      row.querySelector(".chat-item").onclick = () => openChat(c.id);
      row.querySelector("[title='Rename']").onclick = () => renameChat(c.id, c.title);
      row.querySelector("[title='Delete']").onclick = () => deleteChat(c.id);
      chatList.appendChild(row);
    });
  } catch (error) {
    console.error("Loading conversations failed", error);
  }
}

async function renameChat(id, title) {
  const next = window.prompt("Conversation name", title);
  if (!next?.trim()) return;
  try {
    await apiFetch(`/conversations/${id}`, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({title: next})});
    await loadChats();
  } catch (error) { alert(error.message); }
}

async function deleteChat(id) {
  if (!window.confirm("Delete this conversation?")) return;
  try {
    await apiFetch(`/conversations/${id}`, {method: "DELETE"});
    if (currentConversation === id) newChat();
    await loadChats();
  } catch (error) { alert(error.message); }
}

async function openChat(id) {
  try {
    const c = await apiFetch(`/conversations/${id}`);
    currentConversation = c.id;
    $("chatTitle").textContent = c.title;
    messages.innerHTML = "";
    c.messages.forEach(m => addMessage(m.role === "user" ? "user" : "ai", m.content));
  } catch (error) {
    console.error("Opening conversation failed", error);
  }
}

function newChat() {
  currentConversation = null;
  clearImage();
  $("chatTitle").textContent = "New chat";
  messages.innerHTML = `<div class="welcome"><div class="welcome-icon">✦</div><h2>How can I help?</h2><p>Your AI runs locally through Ollama.</p><div class="suggestions"><button data-prompt="Explain Python loops simply with examples.">Explain Python loops</button><button data-prompt="Help me plan an AI/ML project.">Plan an AI project</button><button data-prompt="Teach me SQL from beginner to advanced.">Teach me SQL</button><button data-prompt="Give me a DSA practice problem in Python.">Practice DSA</button></div></div>`;
}

async function send() {
  const text = prompt.value.trim();
  if ((!text && !selectedImages.length) || sendBtn.disabled) return;
  const requestStarted = performance.now();
  const existingConversation = currentConversation !== null;
  let firstTokenAt = null;
  const userRow = addMessage("user", text);
  selectedImages.forEach(imageFile => {
    const image = document.createElement("img");
    image.src = URL.createObjectURL(imageFile);
    image.alt = imageFile.name;
    image.className = "message-image";
    userRow.querySelector(".bubble").appendChild(image);
  });
  prompt.value = "";
  sendBtn.disabled = true;
  generationController = new AbortController();
  $("stopBtn").hidden = false;
  const typing = addTyping();
  const bubble = typing.querySelector(".bubble");
  bubble.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>`;
  try {
    if (selectedImages.length) {
      await analyzeSelectedImage(text, bubble, userRow);
      return;
    }
    const response = await fetch(`${API}/chat`, {signal: generationController.signal, method: "POST", headers: {"Content-Type": "application/json", Authorization: `Bearer ${authToken}`}, body: JSON.stringify({message: text, conversation_id: currentConversation, model: model.value || null, search_enabled: searchEnabled, coding_mode: codingMode})});
    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 401) { authToken = null; currentUser = null; localStorage.removeItem("yours_ai_token"); showAuth(false); }
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${detail}`);
    }
    if (!response.body) throw new Error("Streaming is unavailable in this browser");
    bubble.textContent = "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream: true});
      const events = buffer.split("\n\n");
      buffer = events.pop();
      for (const event of events) {
        const line = event.split("\n").find(item => item.startsWith("data: "));
        if (!line) continue;
        const data = JSON.parse(line.slice(6));
        if (data.type === "meta") currentConversation = data.conversation_id;
        if (data.type === "token") { if (firstTokenAt === null) { firstTokenAt = performance.now(); console.info(`[PERF] frontend first token: ${(firstTokenAt - requestStarted).toFixed(1)} ms`); } bubble.append(document.createTextNode(data.content)); }
        if (data.type === "error") throw new Error(data.message);
      }
      messages.scrollTop = messages.scrollHeight;
    }
    $("chatTitle").textContent = "Chat";
    if (codingMode && bubble.textContent) bubble.innerHTML = renderMarkdown(bubble.textContent);
    if (!existingConversation) await loadChats();
    console.info(`[PERF] frontend total request: ${(performance.now() - requestStarted).toFixed(1)} ms`);
  } catch (error) {
    if (error.name !== "AbortError") { console.error("Chat request failed", error); bubble.textContent = `Error: ${error.message}`; }
  } finally {
    generationController = null;
    sendBtn.disabled = false;
    $("stopBtn").hidden = true;
    prompt.focus();
  }
}

$("newChat").onclick = newChat;
$("authForm").onsubmit = submitAuth;
$("loginTab").onclick = () => showAuth(false);
$("registerTab").onclick = () => showAuth(true);
$("sendBtn").onclick = send;
$("stopBtn").onclick = () => generationController?.abort();
$("clearBtn").onclick = newChat;
$("themeBtn").onclick = () => document.body.classList.toggle("light");
$("searchBtn").onclick = () => { searchEnabled = !searchEnabled; localStorage.setItem("yours_ai_search", searchEnabled); $("searchBtn").classList.toggle("selected", searchEnabled); };
$("codingBtn").onclick = () => { codingMode = !codingMode; localStorage.setItem("yours_ai_coding", codingMode); $("codingBtn").classList.toggle("selected", codingMode); };
$("logoutBtn").onclick = () => { authToken = null; currentUser = null; localStorage.removeItem("yours_ai_token"); showAuth(false); };
$("settingsBtn").onclick = () => { $("settingsSearch").checked = searchEnabled; $("settingsCoding").checked = codingMode; $("settingsDialog").showModal(); };
$("removeImage").onclick = clearImage;
$("downloadImage").onclick = () => downloadSelectedImage().catch(error => { console.error(error); $("fileStatus").textContent = error.message; });
$("imageInput").onchange = () => uploadSelectedImage().catch(error => { console.error("Image selection failed", error); clearImage(); $("fileStatus").textContent = error.message; });
$("createImageBtn").onclick = createImage;
$("mobileMenu").onclick = () => document.querySelector(".sidebar").classList.toggle("open");

prompt.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
prompt.addEventListener("input", () => {
  prompt.style.height = "auto";
  prompt.style.height = Math.min(prompt.scrollHeight, 150) + "px";
});

document.addEventListener("click", e => {
  const b = e.target.closest("[data-prompt]");
  if (b) { prompt.value = b.dataset.prompt; prompt.focus(); }
  const copy = e.target.closest(".copy-code");
  if (copy) navigator.clipboard.writeText(decodeURIComponent(copy.dataset.code)).then(() => { copy.textContent = "Copied"; setTimeout(() => { copy.textContent = "Copy"; }, 1200); });
});

$("fileInput").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".svg", ".heic", ".heif", ".ico", ".avif"];
  const extension = `.${file.name.split(".").pop().toLowerCase()}`;
  if (file.type.startsWith("image/") || imageExtensions.includes(extension)) {
    const imageInput = $("imageInput");
    const transfer = new DataTransfer();
    transfer.items.add(file);
    imageInput.files = transfer.files;
    try {
      await uploadSelectedImage();
    } catch (error) {
      console.error("Image selection failed", error);
      clearImage();
      $("fileStatus").textContent = error.message;
    }
    e.target.value = "";
    return;
  }
  const fd = new FormData();
  fd.append("file", file);
  if (currentConversation) fd.append("conversation_id", currentConversation);
  $("fileStatus").textContent = "Uploading and extracting text…";
  try {
    const data = await apiFetch("/documents", {method:"POST", body:fd});
    $("fileStatus").textContent = `Uploaded ${data.filename} — ${data.characters.toLocaleString()} characters`;
  } catch (err) {
    console.error("Document upload failed", err);
    $("fileStatus").textContent = `Upload error: ${err.message}`;
  }
};

function initializeApp() {
  $("userInfo").textContent = `${currentUser.name} · ${currentUser.email}`;
  loadModels();
  loadChats();
}

if (authToken) {
  apiFetch("/auth/me").then(user => { currentUser = user; $("authScreen").hidden = true; initializeApp(); }).catch(() => { authToken = null; localStorage.removeItem("yours_ai_token"); showAuth(false); });
} else {
  showAuth(false);
}
