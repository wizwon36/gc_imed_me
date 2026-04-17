/**
 * logs.js
 * 시스템 로그 조회 페이지 컨트롤러
 */

const PAGE_SIZE = 50;

let currentPage = 1;
let totalPages  = 1;
let totalCount  = 0;
let allRows     = [];   // 현재 필터 조건으로 불러온 전체 로그
let hasLoaded   = false;

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  // 관리자이거나 logs 권한이 있어야 접근 가능
  const ok = await window.appPermission?.requirePermission?.('logs', ['view', 'admin']);
  if (!ok) return;

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    showGlobalLoading('로그아웃 중...');
    window.auth.logout();
  });

  document.getElementById('searchBtn')?.addEventListener('click', () => {
    currentPage = 1;
    fetchLogs();
  });

  // 날짜 필터 기본값: 오늘 기준 최근 7일
  const today = getTodayYmd();
  const weekAgo = getDateOffsetYmd(-7);
  const fromEl = document.getElementById('filterDateFrom');
  const toEl   = document.getElementById('filterDateTo');
  if (fromEl) fromEl.value = weekAgo;
  if (toEl)   toEl.value   = today;

  // Enter 키로 조회
  ['filterKeyword','filterActionType','filterTargetType','filterDateFrom','filterDateTo']
    .forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { currentPage = 1; fetchLogs(); }
      });
    });

  document.getElementById('prevPageBtn')?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderPage(); }
  });

  document.getElementById('nextPageBtn')?.addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage++; renderPage(); }
  });
});

// ─────────────────────────────────────────────
// 데이터 조회
// ─────────────────────────────────────────────
async function fetchLogs() {
  const user = window.auth?.getSession?.();
  if (!user) return;

  const keyword    = (document.getElementById('filterKeyword')?.value   || '').trim();
  const actionType = (document.getElementById('filterActionType')?.value || '').trim();
  const targetType = (document.getElementById('filterTargetType')?.value || '').trim();
  const dateFrom   = (document.getElementById('filterDateFrom')?.value  || '').trim();
  const dateTo     = (document.getElementById('filterDateTo')?.value    || '').trim();

  // 세션에서 이메일을 최대한 안전하게 추출
  const rawEmail = String(user.user_email || user.email || user.userEmail || '').trim().toLowerCase();
  const userEmail = rawEmail.includes('@') ? rawEmail : '';
  
  if (!userEmail) {
    showMessage('로그인 세션에서 사용자 정보를 찾을 수 없습니다. 다시 로그인해 주세요.', 'error');
    return;
  }
  
  const params = {
    request_user_email: userEmail,
    keyword,
    action_type: actionType,
    target_type: targetType,
    date_from:   dateFrom,
    date_to:     dateTo,
    limit:       '200'   // ← 문자열로 명시 (숫자도 동작하지만 일관성)
  };

  const searchBtn = document.getElementById('searchBtn');

  try {
    setLoading(searchBtn, true, '조회 중...');
    showGlobalLoading('로그를 불러오는 중...');
    clearMessage();

    const result = await apiGet('listLogs', params);
    allRows = Array.isArray(result.data) ? result.data : [];
    hasLoaded = true;

    currentPage  = 1;
    totalCount   = allRows.length;
    totalPages   = totalCount === 0 ? 1 : Math.ceil(totalCount / PAGE_SIZE);

    renderPage();
  } catch (err) {
    showMessage(err.message || '로그를 불러오지 못했습니다.', 'error');
    renderEmpty('조회 중 오류가 발생했습니다.');
  } finally {
    hideGlobalLoading();
    setLoading(searchBtn, false);
  }
}

// ─────────────────────────────────────────────
// 화면 렌더링
// ─────────────────────────────────────────────
function renderPage() {
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const endIdx   = startIdx + PAGE_SIZE;
  const pageRows = allRows.slice(startIdx, endIdx);

  const countEl = document.getElementById('listCount');
  if (countEl) {
    countEl.textContent = totalCount > 0
      ? `총 ${totalCount.toLocaleString()}건 (${currentPage} / ${totalPages} 페이지)`
      : '조회된 로그가 없습니다.';
  }

  const tbody = document.getElementById('logTableBody');
  if (!tbody) return;

  if (pageRows.length === 0) {
    renderEmpty(hasLoaded ? '조건에 맞는 로그가 없습니다.' : '조건을 설정한 뒤 조회 버튼을 눌러 주세요.');
    updatePagination();
    return;
  }

  tbody.innerHTML = pageRows.map(row => buildLogRow(row)).join('');
  updatePagination();
}

function renderEmpty(message) {
  const tbody = document.getElementById('logTableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty-state">
          <div class="empty-icon">🧾</div>
          <div>${escapeHtml(message)}</div>
        </div>
      </td>
    </tr>
  `;

  const countEl = document.getElementById('listCount');
  if (countEl && hasLoaded) countEl.textContent = '조회된 로그가 없습니다.';

  updatePagination();
}

function buildLogRow(row) {
  const actionType = String(row.action_type || '').trim().toUpperCase();
  const badgeClass = getBadgeClass(actionType);

  return `
    <tr>
      <td>${safeText(row.action_time)}</td>
      <td><span class="action-badge ${badgeClass}">${escapeHtml(actionType || '-')}</span></td>
      <td><span class="target-type">${escapeHtml(row.target_type || '-')}</span></td>
      <td title="${escapeHtml(row.target_id || '')}">${escapeHtml(truncate(row.target_id, 22))}</td>
      <td class="wrap">${escapeHtml(row.action_detail || '-')}</td>
      <td>${escapeHtml(row.action_user || '-')}</td>
    </tr>
  `;
}

function getBadgeClass(actionType) {
  const known = [
    'CREATE','UPDATE','DELETE','LOGIN','UPLOAD',
    'UPLOAD_PHOTO','DELETE_PHOTO','RESET_PASSWORD','ACTIVATE','DEACTIVATE'
  ];
  return known.includes(actionType) ? actionType : 'OTHER';
}

function updatePagination() {
  const prevBtn  = document.getElementById('prevPageBtn');
  const nextBtn  = document.getElementById('nextPageBtn');
  const pageInfo = document.getElementById('pageInfo');
  const pagEl    = document.getElementById('pagination');

  if (prevBtn)  prevBtn.disabled  = currentPage <= 1;
  if (nextBtn)  nextBtn.disabled  = currentPage >= totalPages;
  if (pageInfo) pageInfo.textContent = totalCount > 0 ? `${currentPage} / ${totalPages}` : '—';
  if (pagEl)    pagEl.style.display = totalPages > 1 ? 'flex' : 'none';
}

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
function getTodayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function getDateOffsetYmd(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function truncate(value, maxLen) {
  const str = String(value || '');
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function clearMessage() {
  const box = document.getElementById('messageBox');
  if (!box) return;
  box.style.display = 'none';
  box.textContent = '';
  box.className = 'message-box';
}

function showMessage(message, type = 'error') {
  const box = document.getElementById('messageBox');
  if (!box) { alert(message); return; }
  box.className = `message-box ${type}`;
  box.textContent = message;
  box.style.display = 'block';
}
