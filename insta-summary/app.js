"use strict";

const el = (id) => document.getElementById(id);
const captionInput = el("caption");
const urlInput = el("url");
const countEl = el("count");
const googleBtn = el("googleBtn");
const deeplBtn = el("deeplBtn");
const copyBtn = el("copyBtn");
const openPostBtn = el("openPost");

// 文字数カウント
function updateCount() {
  const n = captionInput.value.length;
  countEl.textContent = `${n.toLocaleString()} 文字`;
}
captionInput.addEventListener("input", updateCount);

// 入力チェック
function getText() {
  const text = captionInput.value.trim();
  if (!text) {
    captionInput.focus();
    flash(captionInput);
    return null;
  }
  return text;
}

function flash(node) {
  node.classList.add("flash");
  setTimeout(() => node.classList.remove("flash"), 500);
}

// Google翻訳（英語→日本語）を新しいタブで開く
googleBtn.addEventListener("click", () => {
  const text = getText();
  if (!text) return;
  const url =
    "https://translate.google.com/?sl=en&tl=ja&op=translate&text=" +
    encodeURIComponent(text);
  window.open(url, "_blank", "noopener");
});

// DeepL（英語→日本語）を新しいタブで開く
deeplBtn.addEventListener("click", () => {
  const text = getText();
  if (!text) return;
  // DeepLのディープリンクはスラッシュやパイプを嫌うので無害な文字に置換
  const safe = text.replace(/\//g, " ").replace(/\|/g, " ");
  const url = "https://www.deepl.com/translator#en/ja/" + encodeURIComponent(safe);
  window.open(url, "_blank", "noopener");
});

// コピー
copyBtn.addEventListener("click", async () => {
  const text = getText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const original = copyBtn.textContent;
    copyBtn.textContent = "コピーしました ✓";
    setTimeout(() => (copyBtn.textContent = original), 1500);
  } catch {
    captionInput.select();
  }
});

// 投稿URLを開く
openPostBtn.addEventListener("click", () => {
  const url = urlInput.value.trim();
  if (!url) {
    urlInput.focus();
    flash(urlInput);
    return;
  }
  const full = /^https?:\/\//.test(url) ? url : "https://" + url;
  window.open(full, "_blank", "noopener");
});

updateCount();
