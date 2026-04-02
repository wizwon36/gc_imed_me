function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return document.querySelectorAll(selector);
}

function getQueryParam(name) {
  const params = new URLSearchParams(location.search);
  return params.get(name);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toLocaleString('ko-KR');
}

function nl2br(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function showMessage(message, type = 'info') {
  const box = qs('#messageBox');
  if (!box) {
    alert(message);
    return;
  }

  box.className = `message-box ${type}`;
  box.textContent = message;
  box.style.display = 'block';
}

function clearMessage() {
  const box = qs('#messageBox');
  if (!box) return;

  box.style.display = 'none';
  box.textContent = '';
  box.className = 'message-box';
}

function setLoading(button, isLoading, loadingText = '처리 중...') {
  if (!button) return;

  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || '저장';
  }
}

function goToDetail(equipmentId) {
  location.href = `detail.html?id=${encodeURIComponent(equipmentId)}`;
}

let GLOBAL_LOADING_COUNT = 0;
let GLOBAL_LOADING_OPENED_AT = 0;
const GLOBAL_LOADING_MIN_MS = 350;

function showGlobalLoading(text = '불러오는 중...') {
  const overlay = qs('#globalLoading');
  if (!overlay) return;

  const textEl = qs('#globalLoadingText');
  if (textEl) {
    textEl.textContent = text;
  }

  GLOBAL_LOADING_COUNT += 1;

  if (!overlay.classList.contains('is-open')) {
    GLOBAL_LOADING_OPENED_AT = Date.now();
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }
}

async function hideGlobalLoading(force = false) {
  const overlay = qs('#globalLoading');
  if (!overlay) return;

  if (force) {
    GLOBAL_LOADING_COUNT = 0;
  } else {
    GLOBAL_LOADING_COUNT = Math.max(0, GLOBAL_LOADING_COUNT - 1);
  }

  if (GLOBAL_LOADING_COUNT > 0) {
    return;
  }

  const elapsed = Date.now() - GLOBAL_LOADING_OPENED_AT;
  const remaining = Math.max(0, GLOBAL_LOADING_MIN_MS - elapsed);

  if (remaining > 0) {
    await new Promise(resolve => setTimeout(resolve, remaining));
  }

  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
}

async function withGlobalLoading(task, text = '불러오는 중...') {
  showGlobalLoading(text);
  try {
    return await task();
  } finally {
    await hideGlobalLoading();
  }
}

if (typeof window.statusLabel !== 'function') {
  window.statusLabel = function (status) {
    const map = {
      IN_USE: '사용중',
      REPAIRING: '수리중',
      INSPECTING: '점검중',
      STORED: '보관중',
      DISPOSED: '폐기'
    };
    return map[String(status || '').trim()] || String(status || '-') || '-';
  };
}

if (typeof window.statusClass !== 'function') {
  window.statusClass = function (status) {
    const value = String(status || '').trim().toUpperCase();

    switch (value) {
      case 'IN_USE':
        return 'is-in-use';
      case 'REPAIRING':
        return 'is-repairing';
      case 'INSPECTING':
        return 'is-inspecting';
      case 'STORED':
        return 'is-stored';
      case 'DISPOSED':
        return 'is-disposed';
      default:
        return '';
    }
  };
}

if (typeof window.safeText !== 'function') {
  window.safeText = function (value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  };
}
