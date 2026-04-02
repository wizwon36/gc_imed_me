function compactDateText(value) {
  if (!value) return '-';
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function renderDashboardSkeleton() {
  qs('#recentEquipmentList').innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
  `;

  qs('#recentHistoryList').innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
  `;

  qs('#maintenanceAlertList').innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
  `;

  qs('#departmentSummaryList').innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
  `;
}

function renderKpis(kpis) {
  qs('#totalCount').textContent = formatNumber(kpis.total || 0);
  qs('#inUseCount').textContent = formatNumber(kpis.in_use || 0);
  qs('#repairingCount').textContent = formatNumber(kpis.repairing || 0);
  qs('#inspectingCount').textContent = formatNumber(kpis.inspecting || 0);

  qs('#statusInUseText').textContent = `${formatNumber(kpis.in_use || 0)}대`;
  qs('#statusRepairingText').textContent = `${formatNumber(kpis.repairing || 0)}대`;
  qs('#statusInspectingText').textContent = `${formatNumber(kpis.inspecting || 0)}대`;
  qs('#statusStoredText').textContent = `${formatNumber(kpis.stored || 0)}대`;
}

function renderRecentEquipments(items) {
  const container = qs('#recentEquipmentList');

  if (!items.length) {
    container.innerHTML = `<div class="empty-box">최근 등록 장비가 없습니다.</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <button class="dashboard-list-item" onclick="goToDetail('${encodeURIComponent(item.equipment_id)}')">
      <div>
        <strong>${safeText(item.equipment_name)}</strong>
        <div>${safeText(item.department)} · ${safeText(item.model_name)}</div>
      </div>
      <div>${compactDateText(item.created_at)}</div>
    </button>
  `).join('');
}

function renderRecentHistories(items) {
  const container = qs('#recentHistoryList');

  if (!items.length) {
    container.innerHTML = `<div class="empty-box">최근 이력이 없습니다.</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <button class="dashboard-list-item" onclick="goToDetail('${encodeURIComponent(item.equipment_id)}')">
      <div>
        <strong>${safeText(item.equipment_name)}</strong>
        <div>${safeText(item.description)}</div>
      </div>
      <div>${compactDateText(item.work_date)}</div>
    </button>
  `).join('');
}

function renderMaintenanceAlerts(items) {
  const container = qs('#maintenanceAlertList');

  if (!items.length) {
    container.innerHTML = `<div class="empty-box">유지보수 예정 없음</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <button class="dashboard-list-item" onclick="goToDetail('${encodeURIComponent(item.equipment_id)}')">
      <div>
        <strong>${safeText(item.equipment_name)}</strong>
        <div>${safeText(item.department)}</div>
      </div>
      <div>D-${item.dday}</div>
    </button>
  `).join('');
}

function renderDepartmentSummary(items) {
  const container = qs('#departmentSummaryList');

  if (!items.length) {
    container.innerHTML = `<div class="empty-box">데이터 없음</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="dashboard-rank-item">
      <span>${safeText(item.department)}</span>
      <strong>${formatNumber(item.count)}대</strong>
    </div>
  `).join('');
}

async function loadDashboard() {
  clearMessage();
  renderDashboardSkeleton();
  showGlobalLoading();

  const user = window.auth?.getSession?.() || {};

  try {
    console.time('dashboard_total');

    const [summaryResult, historyResult] = await Promise.all([
      apiGet('getEquipmentDashboardSummary', {
        request_user_email: user.email || ''
      }),
      apiGet('listRecentHistories', {
        limit: 5,
        request_user_email: user.email || ''
      })
    ]);

    console.timeEnd('dashboard_total');

    const summary = summaryResult.data || {};

    renderKpis(summary.kpis || {});
    renderRecentEquipments(summary.recent_equipments || []);
    renderMaintenanceAlerts(summary.maintenance_alerts || []);
    renderDepartmentSummary(summary.department_summary || []);
    renderRecentHistories(historyResult.data || []);

  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    hideGlobalLoading();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  showGlobalLoading();

  try {
    const user = window.auth.requireAuth();
    if (!user) return;

    await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);

    await loadDashboard();
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    hideGlobalLoading();
  }
});
