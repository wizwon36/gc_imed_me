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

function showGlobalLoading(text = '불러오는 중...') {
  const overlay = qs('#globalLoading');
  if (!overlay) return;

  const textEl = qs('#globalLoadingText');
  if (textEl) textEl.textContent = text;

  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
}

function hideGlobalLoading() {
  const overlay = qs('#globalLoading');
  if (!overlay) return;

  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
}

// ============================
// 상태 레이블 / 클래스 (공통)
// ============================

function statusLabel(status) {
  const map = {
    IN_USE: '사용중',
    REPAIRING: '수리중',
    INSPECTING: '점검중',
    STORED: '보관',
    DISPOSED: '폐기'
  };
  return map[status] || status || '';
}

function statusClass(status) {
  const map = {
    IN_USE: 'is-in-use',
    REPAIRING: 'is-repairing',
    INSPECTING: 'is-inspecting',
    STORED: 'is-stored',
    DISPOSED: 'is-disposed'
  };
  return map[status] || '';
}

function historyTypeLabel(type) {
  const map = {
    REPAIR: '수리',
    REGULAR_CHECK: '정기점검',
    LEGAL_INSPECTION: '법정검사',
    PREVENTIVE: '예방점검',
    ETC: '기타'
  };
  return map[type] || type || '';
}

function resultStatusLabel(type) {
  const map = {
    DONE: '완료',
    IN_PROGRESS: '진행중',
    HOLD: '보류'
  };
  return map[type] || type || '';
}

function conditionStatusLabel(type) {
  const map = {
    NORMAL: '정상',
    NEED_REPAIR: '수리필요',
    LOCATION_MISMATCH: '위치불일치',
    MISSING: '분실의심',
    DISPOSAL_TARGET: '폐기대상'
  };
  return map[type] || type || '';
}

function safeText(value, fallback = '-') {
  return escapeHtml(value || fallback);
}
