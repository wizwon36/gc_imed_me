const DASHBOARD_SESSION_KEY = 'gc_imed_dashboard_v1';
const DASHBOARD_SESSION_TTL = 1000 * 60 * 5;
let DASHBOARD_BOOTSTRAPPED = false;

function dq(selector) {
  return document.querySelector(selector);
}

function textSafe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumberLocal(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toLocaleString('ko-KR') : '0';
}

function compactDateText(value) {
  if (!value) return '-';
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function statusLabelLocal(value) {
  const map = {
    IN_USE: '사용중',
    REPAIRING: '수리중',
    INSPECTING: '점검중',
    STORED: '보관',
    DISPOSED: '폐기'
  };
  return map[String(value || '').trim()] || (value || '-');
}

function statusBadgeClassLocal(value) {
  const map = {
    IN_USE: 'is-in-use',
    REPAIRING: 'is-repairing',
    INSPECTING: 'is-inspecting',
    STORED: 'is-stored',
    DISPOSED: 'is-disposed'
  };
  return map[String(value || '').trim()] || '';
}

function historyTypeLabelLocal(value) {
  const map = {
    REPAIR: '수리',
    REGULAR_CHECK: '정기점검',
    LEGAL_INSPECTION: '법정검사',
    PREVENTIVE: '예방점검',
    ETC: '기타',
    INVENTORY: '재고조사'
  };
  return map[String(value || '').trim()] || (value || '-');
}

function resultStatusLabelLocal(value) {
  const map = {
    DONE: '완료',
    COMPLETED: '완료',
    IN_PROGRESS: '진행중',
    HOLD: '보류',
    PENDING: '대기'
  };
  return map[String(value || '').trim()] || (value || '-');
}

function getDashboardSessionCache() {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > DASHBOARD_SESSION_TTL) return null;

    return parsed.data || null;
  } catch (error) {
    return null;
  }
}

function setDashboardSessionCache(data) {
  try {
    sessionStorage.setItem(
      DASHBOARD_SESSION_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        data
      })
    );
  } catch (error) {
    // ignore
  }
}

function invalidateDashboardSessionCache() {
  try {
    sessionStorage.removeItem(DASHBOARD_SESSION_KEY);
  } catch (error) {
    // ignore
  }
}

window.invalidateDashboardSessionCache = invalidateDashboardSessionCache;

function renderDashboardSkeleton() {
  const ids = [
    '#recentEquipmentList',
    '#recentHistoryList',
    '#maintenanceAlertList',
    '#departmentSummaryList'
  ];

  ids.forEach(function(selector) {
    const el = dq(selector);
    if (!el) return;
    el.innerHTML = `<div class="empty-box">불러오는 중...</div>`;
  });
}

function renderKpis(summary) {
  const kpis = summary?.kpis || {};

  if (dq('#totalCount')) dq('#totalCount').textContent = formatNumberLocal(kpis.total || 0);
  if (dq('#inUseCount')) dq('#inUseCount').textContent = formatNumberLocal(kpis.in_use || 0);
  if (dq('#repairingCount')) dq('#repairingCount').textContent = formatNumberLocal(kpis.repairing || 0);
  if (dq('#inspectingCount')) dq('#inspectingCount').textContent = formatNumberLocal(kpis.inspecting || 0);

  if (dq('#statusInUseText')) dq('#statusInUseText').textContent = `${formatNumberLocal(kpis.in_use || 0)}대`;
  if (dq('#statusRepairingText')) dq('#statusRepairingText').textContent = `${formatNumberLocal(kpis.repairing || 0)}대`;
  if (dq('#statusInspectingText')) dq('#statusInspectingText').textContent = `${formatNumberLocal(kpis.inspecting || 0)}대`;
  if (dq('#statusStoredText')) dq('#statusStoredText').textContent = `${formatNumberLocal(kpis.stored || 0)}대`;
}

function buildDashboardListItemHtml(item) {
  return `
    <div class="dashboard-list-main">
      <div class="dashboard-list-title-row">
        <strong class="dashboard-list-title">${textSafe(item.title || '-')}</strong>
        ${item.badge || ''}
      </div>
      <div class="dashboard-list-desc">${textSafe(item.desc || '-')}</div>
      ${item.meta ? `<div class="dashboard-list-side-sub">${textSafe(item.meta)}</div>` : ''}
    </div>
    <div class="dashboard-list-side">
      ${item.side ? `<div>${textSafe(item.side)}</div>` : ''}
      ${item.sideSub ? `<div class="dashboard-list-side-sub">${textSafe(item.sideSub)}</div>` : ''}
    </div>
  `;
}

function buildStatusBadge(status) {
  const label = statusLabelLocal(status);
  const cls = statusBadgeClassLocal(status);
  return `<span class="status-badge ${cls}">${textSafe(label)}</span>`;
}

function goToDetail(id) {
  if (!id) return;
  location.href = `detail.html?id=${encodeURIComponent(id)}`;
}

window.goToDetail = goToDetail;

function renderRecentEquipments(items) {
  const container = dq('#recentEquipmentList');
  if (!container) return;

  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    container.innerHTML = `<div class="empty-box">최근 등록 장비가 없습니다.</div>`;
    return;
  }

  container.innerHTML = list.map(function(item) {
    const safeId = String(item.equipment_id || '').replace(/'/g, "\\'");
    return `
      <button type="button" class="dashboard-list-item" onclick="goToDetail('${safeId}')">
        ${buildDashboardListItemHtml({
          title: item.equipment_name || '-',
          desc: `${item.department || '-'} · ${item.model_name || '-'}`,
          meta: item.equipment_id || '',
          side: compactDateText(item.created_at),
          sideSub: '',
          badge: buildStatusBadge(item.status || '')
        })}
      </button>
    `;
  }).join('');
}

function renderRecentHistories(items) {
  const container = dq('#recentHistoryList');
  if (!container) return;

  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    container.innerHTML = `<div class="empty-box">최근 이력이 없습니다.</div>`;
    return;
  }

  container.innerHTML = list.map(function(item) {
    const safeId = String(item.equipment_id || '').replace(/'/g, "\\'");
    return `
      <button type="button" class="dashboard-list-item" onclick="goToDetail('${safeId}')">
        ${buildDashboardListItemHtml({
          title: item.equipment_name || '-',
          desc: item.description || '-',
          meta: `${historyTypeLabelLocal(item.history_type || '')} · ${item.department || '-'}`,
          side: compactDateText(item.work_date),
          sideSub: item.result_status ? resultStatusLabelLocal(item.result_status) : ''
        })}
      </button>
    `;
  }).join('');
}

function renderMaintenanceAlerts(items) {
  const container = dq('#maintenanceAlertList');
  if (!container) return;

  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    container.innerHTML = `<div class="empty-box">유지보수 종료 예정 장비가 없습니다.</div>`;
    return;
  }

  container.innerHTML = list.map(function(item) {
    const dday = Number(item.dday || 0);
    const ddayText = dday < 0 ? `D+${Math.abs(dday)}` : `D-${dday}`;
    const badgeClass = dday < 0 ? 'is-over' : (dday <= 30 ? 'is-soon' : 'is-normal');
    const safeId = String(item.equipment_id || '').replace(/'/g, "\\'");

    return `
      <button type="button" class="dashboard-list-item" onclick="goToDetail('${safeId}')">
        ${buildDashboardListItemHtml({
          title: item.equipment_name || '-',
          desc: item.department || '-',
          meta: item.model_name || '',
          side: '',
          sideSub: ''
        })}
        <span class="dashboard-dday-badge ${badgeClass}">${textSafe(ddayText)}</span>
      </button>
    `;
  }).join('');
}

function renderDepartmentSummary(items) {
  const container = dq('#departmentSummaryList');
  if (!container) return;

  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    container.innerHTML = `<div class="empty-box">데이터가 없습니다.</div>`;
    return;
  }

  container.innerHTML = list.map(function(item) {
    return `
      <div class="dashboard-rank-item">
        <div class="dashboard-rank-main">
          <div class="dashboard-rank-title">${textSafe(item.department || '-')}</div>
          <div class="dashboard-rank-desc">현재 등록 장비 수</div>
        </div>
        <strong class="dashboard-rank-count">${formatNumberLocal(item.count || 0)}대</strong>
      </div>
    `;
  }).join('');
}

function renderDashboardData(summary, histories) {
  renderKpis(summary || {});
  renderRecentEquipments(summary?.recent_equipments || []);
  renderMaintenanceAlerts(summary?.maintenance_alerts || []);
  renderDepartmentSummary(summary?.department_summary || []);
  renderRecentHistories(histories || []);
}

async function fetchDashboardData() {
  const user = window.auth?.getSession?.() || {};

  const [summaryResult, historyResult] = await Promise.all([
    apiGet('getEquipmentDashboardSummary', {
      request_user_email: user.email || ''
    }),
    apiGet('listRecentHistories', {
      limit: 5,
      request_user_email: user.email || ''
    })
  ]);

  return {
    summary: summaryResult?.data || {},
    histories: Array.isArray(historyResult?.data) ? historyResult.data : []
  };
}

async function loadDashboard() {
  if (typeof clearMessage === 'function') clearMessage();
  renderDashboardSkeleton();

  const cached = getDashboardSessionCache();
  if (cached) {
    renderDashboardData(cached.summary || {}, cached.histories || []);
    return;
  }

  const loaded = await fetchDashboardData();
  renderDashboardData(loaded.summary, loaded.histories);
  setDashboardSessionCache(loaded);
}

document.addEventListener('DOMContentLoaded', async () => {
  if (DASHBOARD_BOOTSTRAPPED) return;
  DASHBOARD_BOOTSTRAPPED = true;

  try {
    if (typeof showGlobalLoading === 'function') {
      showGlobalLoading('대시보드를 불러오는 중...');
    }

    const user = window.auth?.requireAuth?.();
    if (!user) return;

    if (window.appPermission?.requirePermission) {
      await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
    }

    await loadDashboard();
  } catch (error) {
    if (typeof showMessage === 'function') {
      showMessage(error.message || '대시보드를 불러오는 중 오류가 발생했습니다.', 'error');
    } else {
      console.error(error);
    }
  } finally {
    if (typeof hideGlobalLoading === 'function') {
      await hideGlobalLoading(true);
    }
  }
});
