"use strict";

const el = (id) => document.getElementById(id);
const urlInput = el("url");
const translateUrlBtn = el("translateUrl");
const resultSection = el("result");
const resultBody = el("resultBody");
const manualSection = el("manual");
const captionInput = el("caption");
const countEl = el("count");
const translateTextBtn = el("translateText");
const googleBtn = el("googleBtn");
const deeplBtn = el("deeplBtn");

// ---------- ユーティリティ ----------
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function decodeEntities(s) {
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
}

function showLoading(message) {
  resultSection.classList.remove("hidden");
  resultBody.innerHTML =
    `<div class="loading"><span class="spinner"></span><span>${escapeHtml(message)}</span></div>`;
}

function showError(html) {
  resultSection.classList.remove("hidden");
  resultBody.innerHTML = `<div class="error">${html}</div>`;
}

function showResult(original, japanese) {
  resultSection.classList.remove("hidden");
  resultBody.innerHTML =
    `<h3>日本語訳</h3><p>${escapeHtml(japanese).replace(/\n/g, "<br>")}</p>` +
    `<h3>原文（英語）</h3><p class="orig">${escapeHtml(original).replace(/\n/g, "<br>")}</p>`;
}

function revealManual(prefill) {
  manualSection.classList.remove("hidden");
  if (prefill) captionInput.value = prefill;
  updateCount();
  manualSection.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---------- 翻訳（Google 無料エンドポイント） ----------
async function translate(text) {
  // Google翻訳の公開エンドポイント（長文はURL長制限があるため分割）
  const chunks = text.match(/[\s\S]{1,1500}/g) || [text];
  let out = "";
  for (const chunk of chunks) {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=" +
      encodeURIComponent(chunk);
    const res = await fetch(url);
    if (!res.ok) throw new Error("translate_failed");
    const data = await res.json();
    out += (data[0] || []).map((seg) => seg[0]).join("");
  }
  return out.trim();
}

// ---------- キャプション取得（CORSプロキシ経由） ----------
function buildProxies(u) {
  return [
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    "https://corsproxy.io/?url=" + encodeURIComponent(u),
  ];
}

function extractCaption(html) {
  // og:description / description メタタグからキャプションを抽出
  const patterns = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      let desc = decodeEntities(m[1]).trim();
      // 例: 「123 likes, 4 comments - user on date: "本文"」→ 引用部分を取り出す
      const quoted = desc.match(/[:：]\s*[""]([\s\S]+)[""]\s*$/);
      if (quoted && quoted[1]) return quoted[1].trim();
      const afterColon = desc.match(/:\s*([\s\S]+)$/);
      if (afterColon && afterColon[1] && afterColon[1].length > 12) {
        return afterColon[1].trim();
      }
      return desc;
    }
  }
  return null;
}

async function fetchCaption(url) {
  for (const proxy of buildProxies(url)) {
    try {
      const res = await fetch(proxy);
      if (!res.ok) continue;
      const html = await res.text();
      const cap = extractCaption(html);
      if (cap && cap.length > 0) return cap;
    } catch {
      /* 次のプロキシへ */
    }
  }
  return null;
}

// ---------- URLから翻訳 ----------
async function translateFromUrl() {
  const url = urlInput.value.trim();
  if (!url) {
    urlInput.focus();
    flash(urlInput);
    return;
  }
  const full = /^https?:\/\//.test(url) ? url : "https://" + url;

  translateUrlBtn.disabled = true;
  showLoading("投稿の本文を取得しています…");

  try {
    const caption = await fetchCaption(full);
    if (!caption) {
      showError(
        "本文を自動取得できませんでした😢<br>" +
          "Instagram側の制限のためです。下の貼り付け欄に、リールのキャプションをコピーして貼り付けてください。"
      );
      revealManual("");
      return;
    }
    showLoading("日本語に翻訳しています…");
    const ja = await translate(caption);
    showResult(caption, ja);
  } catch (e) {
    showError(
      "翻訳サービスに接続できませんでした。<br>時間をおいて再度お試しいただくか、下の欄に貼り付けて訳してください。"
    );
    revealManual("");
  } finally {
    translateUrlBtn.disabled = false;
  }
}

// ---------- 手動テキストから翻訳 ----------
async function translateFromText() {
  const text = captionInput.value.trim();
  if (!text) {
    captionInput.focus();
    flash(captionInput);
    return;
  }
  translateTextBtn.disabled = true;
  showLoading("日本語に翻訳しています…");
  try {
    const ja = await translate(text);
    showResult(text, ja);
  } catch {
    showError(
      "自動翻訳に失敗しました。「Google翻訳で開く」ボタンから翻訳してください。"
    );
  } finally {
    translateTextBtn.disabled = false;
  }
}

// ---------- 外部翻訳サービスを開く ----------
function openExternal(kind) {
  const text = captionInput.value.trim();
  if (!text) {
    captionInput.focus();
    flash(captionInput);
    return;
  }
  let url;
  if (kind === "google") {
    url =
      "https://translate.google.com/?sl=en&tl=ja&op=translate&text=" +
      encodeURIComponent(text);
  } else {
    const safe = text.replace(/\//g, " ").replace(/\|/g, " ");
    url = "https://www.deepl.com/translator#en/ja/" + encodeURIComponent(safe);
  }
  window.open(url, "_blank", "noopener");
}

// ---------- 小物 ----------
function updateCount() {
  countEl.textContent = `${captionInput.value.length.toLocaleString()} 文字`;
}
function flash(node) {
  node.classList.add("flash");
  setTimeout(() => node.classList.remove("flash"), 500);
}

// ---------- イベント ----------
translateUrlBtn.addEventListener("click", translateFromUrl);
translateTextBtn.addEventListener("click", translateFromText);
googleBtn.addEventListener("click", () => openExternal("google"));
deeplBtn.addEventListener("click", () => openExternal("deepl"));
captionInput.addEventListener("input", updateCount);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") translateFromUrl();
});

updateCount();
