const DASHBOARD_SESSION_KEY = 'gc_imed_dashboard_v1';
const DASHBOARD_SESSION_TTL = 1000 * 60 * 5;

let DASHBOARD_BOOTSTRAPPED = false;
let DASHBOARD_PERMISSION = { canView: false, canEdit: false, canDelete: false };

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

function formatDisplayDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const dateOnlyMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (dateOnlyMatch) {
    return dateOnlyMatch[1];
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return raw;
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

async function getEquipmentPermissionContext() {
  const user = window.auth?.getSession?.() || null;
  if (!user || !user.email) {
    return { canView: false, canEdit: false, canDelete: false };
  }

  const role = String(user.role || '').trim().toLowerCase();
  if (role === 'admin') {
    return { canView: true, canEdit: true, canDelete: true };
  }

  try {
    const result = await apiGet('getUserAppPermission', {
      user_email: user.email,
      app_id: 'equipment',
      request_user_email: user.email
    });

    const permission = String(result?.data?.permission || '').trim().toLowerCase();

    return {
      canView: ['view', 'edit', 'admin'].includes(permission),
      canEdit: ['edit', 'admin'].includes(permission),
      canDelete: false
    };
  } catch (error) {
    return { canView: false, canEdit: false, canDelete: false };
  }
}

function applyDashboardPermissionUi() {
  const createAction = dq('#dashboardCreateEquipmentAction');
  if (createAction) {
    createAction.style.display = DASHBOARD_PERMISSION.canEdit ? '' : 'none';
  }
}

function renderDashboardSkeleton() {
  const ids = [
    '#recentEquipmentList',
    '#recentHistoryList',
    '#maintenanceAlertList',
    '#departmentSummaryList'
  ];

  ids.forEach(function (selector) {
    const el = dq(selector);
    if (!el) return;
    el.innerHTML = '<div class="empty-box">불러오는 중...</div>';
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
    <div class="dashboard-list-item">
      <div class="dashboard-list-main">
        <div class="dashboard-list-title-row">
          <strong class="dashboard-list-title">${textSafe(item.title || '-')}</strong>
          ${item.badge || ''}
        </div>
        <div class="dashboard-list-desc">${textSafe(item.desc || '-')}</div>
        ${item.meta ? `<div class="dashboard-list-meta">${textSafe(item.meta)}</div>` : ''}
      </div>
      ${(item.side || item.sideSub) ? `
        <div class="dashboard-list-side">
          ${item.side ? `<div class="dashboard-list-side-main">${textSafe(item.side)}</div>` : ''}
          ${item.sideSub ? `<div class="dashboard-list-side-sub">${textSafe(item.sideSub)}</div>` : ''}
        </div>
      ` : ''}
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
    container.innerHTML = '<div class="empty-box">최근 등록 장비가 없습니다.</div>';
    return;
  }

  container.innerHTML = list.map(function (item) {
    const safeId = String(item.equipment_id || '').replace(/'/g, "\\'");
    return `
      <button type="button" class="dashboard-link-item" onclick="goToDetail('${safeId}')">
        ${buildDashboardListItemHtml({
          title: item.equipment_name || '-',
          desc: `${item.department || '-'} · ${item.model_name || '-'}`,
          meta: item.equipment_id || '',
          side: formatDisplayDate(item.created_at),
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
    container.innerHTML = '<div class="empty-box">최근 이력이 없습니다.</div>';
    return;
  }

  container.innerHTML = list.map(function (item) {
    const safeId = String(item.equipment_id || '').replace(/'/g, "\\'");
    return `
      <button type="button" class="dashboard-link-item" onclick="goToDetail('${safeId}')">
        ${buildDashboardListItemHtml({
          title: item.equipment_name || '-',
          desc: item.description || '-',
          meta: `${historyTypeLabelLocal(item.history_type || '')} · ${item.department || '-'}`,
          side: formatDisplayDate(item.work_date),
          sideSub: item.result_status ? resultStatusLabelLocal(item.result_status) : ''
        })}
      </button>
    `;
  }).join('');
}

function renderMaintenanceAlerts(items) {
  const container = dq('#maintenanceAlertList');
  const emptyEl = dq('#maintenanceAlertEmpty');
  if (!container) return;

  const list = (Array.isArray(items) ? items : [])
    .filter(function (item) {
      const dday = Number(item?.dday);
      return Number.isFinite(dday) && dday <= 60;
    })
    .sort(function (a, b) {
      return Number(a.dday || 0) - Number(b.dday || 0);
    });

  if (!list.length) {
    container.innerHTML = '';
    container.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  container.style.display = 'grid';
  if (emptyEl) emptyEl.style.display = 'none';

  container.innerHTML = list.map(function (item) {
    const dday = Number(item.dday || 0);
    const ddayText =
      dday < 0 ? `D+${Math.abs(dday)}`
      : dday === 0 ? 'D-DAY'
      : `D-${dday}`;

    const badgeClass =
      dday < 0
        ? 'dashboard-dday-badge is-overdue'
        : dday <= 30
        ? 'dashboard-dday-badge'
        : 'dashboard-dday-badge is-normal';

    return `
      <a class="dashboard-maintenance-item" href="detail.html?id=${encodeURIComponent(item.equipment_id || '')}">
        <div class="dashboard-maintenance-main">
          <div class="dashboard-maintenance-title">${textSafe(item.equipment_name || '-')}</div>
          <div class="dashboard-maintenance-desc">유지보수 만료일 ${textSafe(formatDisplayDate(item.maintenance_end_date))}</div>
          <div class="dashboard-maintenance-meta">
            <span class="dashboard-meta-chip">${textSafe(item.model_name || '-')}</span>
            <span class="dashboard-meta-chip">${textSafe(item.department || '-')}</span>
          </div>
        </div>
        <div class="dashboard-maintenance-side">
          <span class="${badgeClass}">${textSafe(ddayText)}</span>
        </div>
      </a>
    `;
  }).join('');
}

function renderDepartmentSummary(items) {
  const container = dq('#departmentSummaryList');
  if (!container) return;

  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    container.innerHTML = '<div class="empty-box">데이터가 없습니다.</div>';
    return;
  }

  container.innerHTML = list.map(function (item) {
    return `
      <div class="dashboard-summary-item">
        <div class="dashboard-summary-dept">${textSafe(item.department || '-')}</div>
        <div class="dashboard-summary-label">현재 등록 장비 수</div>
        <div class="dashboard-summary-count">${formatNumberLocal(item.count || 0)}대</div>
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

    DASHBOARD_PERMISSION = await getEquipmentPermissionContext();
    if (!DASHBOARD_PERMISSION.canView) {
      throw new Error('장비 메뉴 접근 권한이 없습니다.');
    }

    applyDashboardPermissionUi();
    await loadDashboard();
  } catch (error) {
    if (typeof showMessage === 'function') {
      showMessage(error.message || '대시보드를 불러오는 중 오류가 발생했습니다.', 'error');
    } else {
      console.error(error);
    }
  } finally {
    if (typeof hideGlobalLoading === 'function') {
      hideGlobalLoading();
    }
  }
});
