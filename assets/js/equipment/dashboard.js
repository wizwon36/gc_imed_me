const DASHBOARD_SESSION_KEY = 'gc_imed_dashboard_v1';
const DASHBOARD_SESSION_TTL = 1000 * 60 * 5;
let DASHBOARD_BOOTSTRAPPED = false;

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
    sessionStorage.setItem(DASHBOARD_SESSION_KEY, JSON.stringify({
      savedAt: Date.now(),
      data
    }));
  } catch (error) {
    // 무시
  }
}

function invalidateDashboardSessionCache() {
  try {
    sessionStorage.removeItem(DASHBOARD_SESSION_KEY);
  } catch (error) {
    // 무시
  }
}

function compactDateText(value) {
  if (!value) return '-';
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function renderDashboardSkeleton() {
  const targets = [
    '#recentEquipmentList',
    '#recentHistoryList',
    '#maintenanceAlertList',
    '#departmentSummaryList'
  ];

  targets.forEach(selector => {
    const el = qs(selector);
    if (!el) return;

    el.innerHTML = `
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
    `;
  });
}

function renderKpis(kpis = {}) {
  qs('#totalCount').textContent = formatNumber(kpis.total || 0);
  qs('#inUseCount').textContent = formatNumber(kpis.in_use || 0);
  qs('#repairingCount').textContent = formatNumber(kpis.repairing || 0);
  qs('#inspectingCount').textContent = formatNumber(kpis.inspecting || 0);

  qs('#statusInUseText').textContent = `${formatNumber(kpis.in_use || 0)}대`;
  qs('#statusRepairingText').textContent = `${formatNumber(kpis.repairing || 0)}대`;
  qs('#statusInspectingText').textContent = `${formatNumber(kpis.inspecting || 0)}대`;
  qs('#statusStoredText').textContent = `${formatNumber(kpis.stored || 0)}대`;
}

function buildDashboardListItemHtml(item) {
  return `
    <div class="dashboard-list-main">
      <div class="dashboard-list-title-row">
        <strong class="dashboard-list-title">${safeText(item.title)}</strong>
        ${item.badge ? item.badge : ''}
      </div>
      <div class="dashboard-list-desc">${safeText(item.desc)}</div>
      ${item.meta ? `<div class="dashboard-list-side-sub">${safeText(item.meta)}</div>` : ''}
    </div>
    <div class="dashboard-list-side">
      <div>${safeText(item.side)}</div>
      ${item.sideSub ? `<div class="dashboard-list-side-sub">${safeText(item.sideSub)}</div>` : ''}
    </div>
  `;
}

function renderRecentEquipments(items = []) {
  const container = qs('#recentEquipmentList');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<div class="empty-box">최근 등록 장비가 없습니다.</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <button type="button" class="dashboard-list-item" onclick="goToDetail('${encodeURIComponent(item.equipment_id)}')">
      ${buildDashboardListItemHtml({
        title: item.equipment_name,
        desc: `${item.department || '-'} · ${item.model_name || '-'}`,
        meta: item.equipment_id || '',
        side: compactDateText(item.created_at),
        sideSub: statusLabel(item.status || '')
      })}
    </button>
  `).join('');
}

function renderRecentHistories(items = []) {
  const container = qs('#recentHistoryList');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<div class="empty-box">최근 이력이 없습니다.</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <button type="button" class="dashboard-list-item" onclick="goToDetail('${encodeURIComponent(item.equipment_id)}')">
      ${buildDashboardListItemHtml({
        title: item.equipment_name || '-',
        desc: item.description || '-',
        meta: `${historyTypeLabel(item.history_type || '')} · ${item.department || '-'}`,
        side: compactDateText(item.work_date),
        sideSub: item.result_status ? resultStatusLabel(item.result_status) : ''
      })}
    </button>
  `).join('');
}

function renderMaintenanceAlerts(items = []) {
  const container = qs('#maintenanceAlertList');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<div class="empty-box">유지보수 종료 예정 장비가 없습니다.</div>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const dday = Number(item.dday || 0);
    const ddayText = dday < 0 ? `D+${Math.abs(dday)}` : `D-${dday}`;
    const badgeClass = dday < 0 ? 'is-over' : (dday <= 30 ? 'is-soon' : 'is-normal');

    return `
      <button type="button" class="dashboard-list-item" onclick="goToDetail('${encodeURIComponent(item.equipment_id)}')">
        ${buildDashboardListItemHtml({
          title: item.equipment_name || '-',
          desc: item.department || '-',
          meta: item.model_name || '',
          side: compactDateText(item.maintenance_end_date),
          sideSub: ''
        })}
        <span class="dashboard-dday-badge ${badgeClass}">${ddayText}</span>
      </button>
    `;
  }).join('');
}

function renderDepartmentSummary(items = []) {
  const container = qs('#departmentSummaryList');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<div class="empty-box">데이터가 없습니다.</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="dashboard-rank-item">
      <div class="dashboard-rank-main">
        <div class="dashboard-rank-title">${safeText(item.department)}</div>
        <div class="dashboard-rank-desc">현재 등록 장비 수</div>
      </div>
      <strong class="dashboard-rank-count">${formatNumber(item.count)}대</strong>
    </div>
  `).join('');
}

function renderDashboardData(summary = {}, histories = []) {
  renderKpis(summary.kpis || {});
  renderRecentEquipments(summary.recent_equipments || []);
  renderMaintenanceAlerts(summary.maintenance_alerts || []);
  renderDepartmentSummary(summary.department_summary || []);
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
    summary: summaryResult.data || {},
    histories: historyResult.data || []
  };
}

async function loadDashboard() {
  clearMessage();
  renderDashboardSkeleton();

  const sessionCached = getDashboardSessionCache();
  if (sessionCached) {
    renderDashboardData(sessionCached.summary || {}, sessionCached.histories || []);
    return;
  }

  const { summary, histories } = await fetchDashboardData();
  renderDashboardData(summary, histories);

  setDashboardSessionCache({
    summary,
    histories
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (DASHBOARD_BOOTSTRAPPED) return;
  DASHBOARD_BOOTSTRAPPED = true;

  showGlobalLoading('대시보드를 불러오는 중...');

  try {
    const user = window.auth.requireAuth();
    if (!user) return;

    await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
    await loadDashboard();
  } catch (error) {
    showMessage(error.message || '대시보드를 불러오는 중 오류가 발생했습니다.', 'error');
  } finally {
    await hideGlobalLoading(true);
  }
});
