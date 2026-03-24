let CURRENT_EQUIPMENT_PERMISSION = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth.requireAuth();
  if (!user) return;

  const ok = await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
  if (!ok) return;

  CURRENT_EQUIPMENT_PERMISSION = await window.appPermission.getPermission('equipment');

  applyDashboardPermission();
  await loadDashboard();
});

function canEditEquipment() {
  return CURRENT_EQUIPMENT_PERMISSION === 'edit' || CURRENT_EQUIPMENT_PERMISSION === 'admin';
}

function formatDateOnly(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateSafe(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function daysBetweenToday(targetDate) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function safeText(value, fallback = '-') {
  return escapeHtml(value || fallback);
}

function compactDateText(value) {
  if (!value) return '-';
  const text = String(value);
  if (text.length >= 10) return text.slice(0, 10);
  return text;
}

function applyDashboardPermission() {
  if (window.appPermission.toggleByPermission) {
    window.appPermission.toggleByPermission(
      'equipment',
      '.js-create-equipment-btn',
      ['edit', 'admin']
    );
  } else if (window.appPermission.disableByPermission) {
    window.appPermission.disableByPermission(
      'equipment',
      '.js-create-equipment-btn',
      ['edit', 'admin']
    );
  }

  qsa('.js-edit-only-card').forEach(el => {
    el.classList.toggle('is-hidden', !canEditEquipment());
  });
}

function renderDashboardSkeleton() {
  qs('#recentEquipmentList').innerHTML = ``;
  qs('#recentHistoryList').innerHTML = ``;
  qs('#maintenanceAlertList').innerHTML = ``;
  qs('#departmentSummaryList').innerHTML = ``;
}

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

function sortByCreatedDesc(items) {
  return [...items].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
}

function renderKpis(items) {
  const total = items.length;
  const inUse = items.filter(item => item.status === 'IN_USE').length;
  const repairing = items.filter(item => item.status === 'REPAIRING').length;
  const inspecting = items.filter(item => item.status === 'INSPECTING').length;
  const stored = items.filter(item => item.status === 'STORED').length;

  qs('#totalCount').textContent = formatNumber(total);
  qs('#inUseCount').textContent = formatNumber(inUse);
  qs('#repairingCount').textContent = formatNumber(repairing);
  qs('#inspectingCount').textContent = formatNumber(inspecting);

  qs('#statusInUseText').textContent = `${formatNumber(inUse)}대`;
  qs('#statusRepairingText').textContent = `${formatNumber(repairing)}대`;
  qs('#statusInspectingText').textContent = `${formatNumber(inspecting)}대`;
  qs('#statusStoredText').textContent = `${formatNumber(stored)}대`;
}

function renderRecentEquipments(items) {
  const container = qs('#recentEquipmentList');
  const recentItems = sortByCreatedDesc(items).slice(0, 5);

  if (!recentItems.length) {
    container.innerHTML = `<div class="empty-state">최근 등록 장비가 없습니다.</div>`;
    return;
  }

  container.innerHTML = recentItems.map(item => `
    <article class="dashboard-list-item">
      <div class="dashboard-list-item__title">
        ${safeText(item.equipment_name)}
        <span class="status-badge ${statusClass(item.status)}">
          ${escapeHtml(statusLabel(item.status))}
        </span>
      </div>
      <div class="dashboard-list-item__meta">
        ${safeText(item.department)} · ${safeText(item.model_name)}
      </div>
      <div class="dashboard-list-item__sub">
        ${safeText(item.equipment_id)} · ${compactDateText(item.created_at)}
      </div>
    </article>
  `).join('');
}

function renderRecentHistories(items) {
  const container = qs('#recentHistoryList');

  if (!items.length) {
    container.innerHTML = `<div class="empty-state">최근 등록된 이력이 없습니다.</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="dashboard-list-item">
      <div class="dashboard-list-item__title">
        ${safeText(item.equipment_name)}
        <span class="status-badge">
          ${escapeHtml(historyTypeLabel(item.history_type))}
        </span>
      </div>
      <div class="dashboard-list-item__meta">
        ${safeText(item.department)} · ${safeText(item.model_name)}
      </div>
      <div class="dashboard-list-item__sub">
        ${safeText(item.description, '설명 없음')} · ${compactDateText(item.work_date)} · ${escapeHtml(resultStatusLabel(item.result_status))}
      </div>
    </article>
  `).join('');
}

function renderMaintenanceAlerts(items) {
  const container = qs('#maintenanceAlertList');

  const alertItems = items
    .map(item => {
      const date = parseDateSafe(item.maintenance_end_date);
      if (!date) return null;
      return { ...item, dday: daysBetweenToday(date) };
    })
    .filter(Boolean)
    .filter(item => item.dday <= 90)
    .sort((a, b) => a.dday - b.dday)
    .slice(0, 5);

  if (!alertItems.length) {
    container.innerHTML = `<div class="empty-state">90일 이내 종료 예정 장비가 없습니다.</div>`;
    return;
  }

  container.innerHTML = alertItems.map(item => `
    <article class="dashboard-list-item">
      <div class="dashboard-list-item__title">
        ${safeText(item.equipment_name)}
        <span class="status-badge">${item.dday < 0 ? `D+${Math.abs(item.dday)}` : `D-${item.dday}`}</span>
      </div>
      <div class="dashboard-list-item__meta">
        ${safeText(item.department)} · ${safeText(item.model_name)}
      </div>
      <div class="dashboard-list-item__sub">
        ${safeText(item.maintenance_end_date)}
      </div>
    </article>
  `).join('');
}

function renderDepartmentSummary(items) {
  const container = qs('#departmentSummaryList');
  const map = {};

  items.forEach(item => {
    const key = (item.department || '미지정').trim() || '미지정';
    map[key] = (map[key] || 0) + 1;
  });

  const sorted = Object.entries(map)
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  if (!sorted.length) {
    container.innerHTML = `<div class="empty-state">부서별 데이터가 없습니다.</div>`;
    return;
  }

  container.innerHTML = sorted.map(item => `
    <article class="department-summary-item">
      <div class="department-summary-item__title">${escapeHtml(item.department)}</div>
      <div class="department-summary-item__meta">등록 장비 수</div>
      <div class="department-summary-item__count">${formatNumber(item.count)}대</div>
    </article>
  `).join('');
}

async function loadDashboard() {
  clearMessage();
  renderDashboardSkeleton();
  showGlobalLoading();

  try {
    const [equipmentResult, historyResult] = await Promise.all([
      apiGet('listEquipments'),
      apiGet('listRecentHistories', { limit: 5 })
    ]);

    const items = equipmentResult.data || [];
    const histories = historyResult.data || [];

    renderKpis(items);
    renderRecentEquipments(items);
    renderRecentHistories(histories);
    renderMaintenanceAlerts(items);
    renderDepartmentSummary(items);
  } catch (error) {
    showMessage(error.message, 'error');
    qs('#recentEquipmentList').innerHTML = `<div class="empty-state">데이터를 불러오지 못했습니다.</div>`;
    qs('#recentHistoryList').innerHTML = `<div class="empty-state">데이터를 불러오지 못했습니다.</div>`;
    qs('#maintenanceAlertList').innerHTML = `<div class="empty-state">데이터를 불러오지 못했습니다.</div>`;
    qs('#departmentSummaryList').innerHTML = `<div class="empty-state">데이터를 불러오지 못했습니다.</div>`;
  } finally {
    hideGlobalLoading();
  }
}
