let CURRENT_EQUIPMENT_PERMISSION = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth.requireAuth();
  if (!user) return;

  const ok = await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
  if (!ok) return;

  CURRENT_EQUIPMENT_PERMISSION = await window.appPermission.getPermission('equipment');

  await window.appPermission.toggleByPermission(
    'equipment',
    '.js-create-equipment-btn',
    ['edit', 'admin']
  );

  initDashboardPage();
});

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

  if (text.length >= 10) {
    return text.slice(0, 10);
  }

  return text;
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
  return [...items].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
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
    container.innerHTML = `<div class="empty-box">최근 등록 장비가 없습니다.</div>`;
    return;
  }

  container.innerHTML = recentItems.map(item => `
    <button class="dashboard-list-item dashboard-list-item-compact" onclick="goToDetail('${encodeURIComponent(item.equipment_id)}')">
      <div class="dashboard-list-main">
        <div class="dashboard-list-title-row">
          <strong class="dashboard-list-title">${safeText(item.equipment_name)}</strong>
          <span class="status-badge ${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
        </div>
        <div class="dashboard-list-desc dashboard-list-desc-compact">
          ${safeText(item.department)} · ${safeText(item.model_name)}
        </div>
        <div class="dashboard-list-meta-compact">
          ${safeText(item.equipment_id)}
        </div>
      </div>
      <div class="dashboard-list-side">${compactDateText(item.created_at)}</div>
    </button>
  `).join('');
}

function renderRecentHistories(items) {
  const container = qs('#recentHistoryList');

  if (!items.length) {
    container.innerHTML = `<div class="empty-box">최근 등록된 이력이 없습니다.</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <button class="dashboard-list-item dashboard-list-item-compact" onclick="goToDetail('${encodeURIComponent(item.equipment_id)}')">
      <div class="dashboard-list-main">
        <div class="dashboard-list-title-row">
          <strong class="dashboard-list-title">${safeText(item.equipment_name)}</strong>
          <span class="dashboard-mini-chip">${escapeHtml(historyTypeLabel(item.history_type))}</span>
        </div>
        <div class="dashboard-list-desc dashboard-list-desc-compact">
          ${safeText(item.department)} · ${safeText(item.model_name)}
        </div>
        <div class="dashboard-list-meta-compact">
          ${safeText(item.description, '설명 없음')}
        </div>
      </div>
      <div class="dashboard-list-side">
        <div>${compactDateText(item.work_date)}</div>
        <div class="dashboard-list-side-sub">${escapeHtml(resultStatusLabel(item.result_status))}</div>
      </div>
    </button>
  `).join('');
}

function renderMaintenanceAlerts(items) {
  const container = qs('#maintenanceAlertList');

  const alertItems = items
    .map(item => {
      const date = parseDateSafe(item.maintenance_end_date);
      if (!date) return null;
      return {
        ...item,
        dday: daysBetweenToday(date)
      };
    })
    .filter(Boolean)
    .filter(item => item.dday <= 90)
    .sort((a, b) => a.dday - b.dday)
    .slice(0, 5);

  if (!alertItems.length) {
    container.innerHTML = `<div class="empty-box">90일 이내 종료 예정 장비가 없습니다.</div>`;
    return;
  }

  container.innerHTML = alertItems.map(item => `
    <button class="dashboard-list-item" onclick="goToDetail('${encodeURIComponent(item.equipment_id)}')">
      <div class="dashboard-list-main">
        <div class="dashboard-list-title-row">
          <strong class="dashboard-list-title">${safeText(item.equipment_name)}</strong>
          <span class="dashboard-dday-badge ${item.dday < 0 ? 'is-over' : item.dday <= 30 ? 'is-soon' : 'is-normal'}">
            ${item.dday < 0 ? `D+${Math.abs(item.dday)}` : `D-${item.dday}`}
          </span>
        </div>
        <div class="dashboard-list-desc">
          ${safeText(item.department)} · ${safeText(item.model_name)}
        </div>
      </div>
      <div class="dashboard-list-side">${safeText(item.maintenance_end_date)}</div>
    </button>
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
    container.innerHTML = `<div class="empty-box">부서별 데이터가 없습니다.</div>`;
    return;
  }

  container.innerHTML = sorted.map(item => `
    <div class="dashboard-rank-item">
      <div class="dashboard-rank-left">
        <div class="dashboard-rank-title">${escapeHtml(item.department)}</div>
        <div class="dashboard-rank-desc">등록 장비 수</div>
      </div>
      <div class="dashboard-rank-count">${formatNumber(item.count)}대</div>
    </div>
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

    qs('#recentEquipmentList').innerHTML = `<div class="empty-box">데이터를 불러오지 못했습니다.</div>`;
    qs('#recentHistoryList').innerHTML = `<div class="empty-box">데이터를 불러오지 못했습니다.</div>`;
    qs('#maintenanceAlertList').innerHTML = `<div class="empty-box">데이터를 불러오지 못했습니다.</div>`;
    qs('#departmentSummaryList').innerHTML = `<div class="empty-box">데이터를 불러오지 못했습니다.</div>`;
  } finally {
    hideGlobalLoading();
  }
}

async function initDashboardPage() {
  document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
  });
}
