"use strict";

const STORAGE_KEY = "insta_summary_api_key";
const API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = [
  "あなたは英語のSNS（Instagram）投稿を日本語に翻訳・要約するアシスタントです。",
  "与えられた英語の投稿について、必ず次のMarkdown形式の日本語で出力してください：",
  "",
  "## 要約",
  "（投稿の要点を3〜5個の箇条書きで、日本語で簡潔に）",
  "",
  "## 日本語訳",
  "（投稿全文の自然で読みやすい日本語訳。ハッシュタグや絵文字は文脈に応じて残す）",
  "",
  "固有名詞・ブランド名・専門用語は無理に訳さず原語のままで構いません。",
  "前置きや「承知しました」などの返事は書かず、いきなり「## 要約」から始めてください。",
].join("\n");

// ---- DOM ----
const el = (id) => document.getElementById(id);
const apiKeyInput = el("apiKey");
const saveKeyBtn = el("saveKey");
const keyStatus = el("keyStatus");
const keyDetails = el("keyDetails");
const captionInput = el("caption");
const urlInput = el("url");
const useFetchInput = el("useFetch");
const modelSelect = el("model");
const runBtn = el("run");
const resultSection = el("result");
const resultBody = el("resultBody");

// ---- API key persistence ----
function loadKey() {
  const key = localStorage.getItem(STORAGE_KEY) || "";
  apiKeyInput.value = key;
  reflectKeyStatus(key);
}

function reflectKeyStatus(key) {
  if (key && key.trim()) {
    keyStatus.textContent = "設定済み";
    keyStatus.classList.add("ok");
  } else {
    keyStatus.textContent = "未設定";
    keyStatus.classList.remove("ok");
  }
}

function saveKey() {
  const key = apiKeyInput.value.trim();
  localStorage.setItem(STORAGE_KEY, key);
  reflectKeyStatus(key);
  if (key) keyDetails.removeAttribute("open");
}

saveKeyBtn.addEventListener("click", saveKey);

// ---- minimal markdown renderer (headings / bold / lists) ----
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMarkdown(md) {
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^#{2,3}\s+(.*)$/))) {
      closeList();
      html += `<h3>${inline(m[1])}</h3>`;
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inline(m[1])}</li>`;
    } else if (line === "") {
      closeList();
    } else {
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

function inline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

// ---- UI helpers ----
function showLoading(message) {
  resultSection.classList.remove("hidden");
  resultBody.innerHTML = `<div class="loading"><span class="spinner"></span><span>${escapeHtml(message)}</span></div>`;
}

function showError(message) {
  resultSection.classList.remove("hidden");
  resultBody.innerHTML = `<div class="error">${message}</div>`;
}

function showResult(markdown) {
  resultSection.classList.remove("hidden");
  resultBody.innerHTML = renderMarkdown(markdown);
}

// ---- Anthropic API call ----
async function callClaude(body, apiKey, useBeta) {
  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (useBeta) headers["anthropic-beta"] = "web-fetch-2025-09-10";

  const res = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data && data.error ? data.error.message : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function extractText(content) {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// Run the request, following pause_turn continuations (needed for web_fetch).
async function generateSummary({ apiKey, model, userText, url, useFetch }) {
  const messages = [{ role: "user", content: userText }];
  const body = {
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages,
  };
  if (useFetch && url) {
    body.tools = [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 }];
  }

  let data = await callClaude(body, apiKey, useFetch && !!url);

  let guard = 0;
  while (data.stop_reason === "pause_turn" && guard < 5) {
    guard += 1;
    messages.push({ role: "assistant", content: data.content });
    data = await callClaude({ ...body, messages }, apiKey, useFetch && !!url);
  }

  const text = extractText(data.content);
  if (!text) {
    throw new Error(
      "本文を取得できませんでした。投稿文を直接コピーして上のテキスト欄に貼り付けてください。"
    );
  }
  return text;
}

// ---- main handler ----
async function run() {
  const apiKey = (localStorage.getItem(STORAGE_KEY) || apiKeyInput.value).trim();
  const caption = captionInput.value.trim();
  const url = urlInput.value.trim();
  const useFetch = useFetchInput.checked;
  const model = modelSelect.value;

  if (!apiKey) {
    keyDetails.setAttribute("open", "");
    showError("先に Claude API キーを設定してください（上の「⚙️ Claude API キーの設定」を開いてください）。");
    return;
  }

  let userText;
  if (caption) {
    userText = `次の英語のInstagram投稿を日本語に翻訳・要約してください。\n\n---\n${caption}\n---`;
  } else if (useFetch && url) {
    userText = `次のInstagram投稿の本文を web_fetch で取得し、日本語に翻訳・要約してください。\nURL: ${url}\n\nもし取得できない場合は、その旨を日本語で伝えてください。`;
  } else {
    showError("英語の投稿文を貼り付けるか、URLを入力して「自動取得」にチェックを入れてください。");
    return;
  }

  runBtn.disabled = true;
  showLoading(useFetch && !caption ? "投稿を取得して要約しています…" : "翻訳・要約しています…");

  try {
    const summary = await generateSummary({ apiKey, model, userText, url, useFetch });
    showResult(summary);
  } catch (err) {
    showError(`エラーが発生しました: ${escapeHtml(err.message)}`);
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener("click", run);

// init
loadKey();
