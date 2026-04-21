const DASHBOARD_SESSION_KEY = 'gc_imed_dashboard_v2';
const DASHBOARD_SESSION_TTL = 1000 * 60 * 5;

const DASHBOARD_PERMISSION_CACHE_KEY = 'gc_imed_dashboard_permission_v1';
const DASHBOARD_PERMISSION_CACHE_TTL = 1000 * 60 * 5;

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
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const dateOnlyMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (dateOnlyMatch) return dateOnlyMatch[1];

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return raw;
}

function getCurrentUserEmail() {
  const user = window.auth?.getSession?.() || {};
  return String(user.email || user.user_email || '').trim().toLowerCase();
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
  } catch (error) {}
}

function invalidateDashboardSessionCache() {
  try {
    sessionStorage.removeItem(DASHBOARD_SESSION_KEY);
  } catch (error) {}
}

window.invalidateDashboardSessionCache = invalidateDashboardSessionCache;

function getDashboardPermissionCache() {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_PERMISSION_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > DASHBOARD_PERMISSION_CACHE_TTL) return null;

    return parsed.data || null;
  } catch (error) {
    return null;
  }
}

function setDashboardPermissionCache(data) {
  try {
    sessionStorage.setItem(
      DASHBOARD_PERMISSION_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        data
      })
    );
  } catch (error) {}
}

function invalidateDashboardPermissionCache() {
  try {
    sessionStorage.removeItem(DASHBOARD_PERMISSION_CACHE_KEY);
  } catch (error) {}
}

async function getEquipmentPermissionContext() {
  const user = window.auth?.getSession?.() || null;
  const userEmail = getCurrentUserEmail();

  if (!user || !userEmail) {
    return { canView: false, canEdit: false, canDelete: false };
  }

  const cached = getDashboardPermissionCache();
  if (cached) {
    return cached;
  }

  const role = String(user.role || '').trim().toLowerCase();
  if (role === 'admin') {
    const adminPermission = { canView: true, canEdit: true, canDelete: true };
    setDashboardPermissionCache(adminPermission);
    return adminPermission;
  }

  try {
    const result = await apiGet('getUserAppPermission', {
      user_email: userEmail,
      app_id: 'equipment',
      request_user_email: userEmail
    });

    const permission = String(result?.data?.permission || '').trim().toLowerCase();

    const normalized = {
      canView: ['view', 'edit', 'admin'].includes(permission),
      canEdit: ['edit', 'admin'].includes(permission),
      canDelete: false
    };

    setDashboardPermissionCache(normalized);
    return normalized;
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
  ['#maintenanceAlertList', '#recentRepairList', '#recentRegisteredList'].forEach(function (selector) {
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
  if (dq('#recentRepairCount')) dq('#recentRepairCount').textContent = formatNumberLocal(kpis.recent_repairs || 0);
  if (dq('#recentRegisterCount')) dq('#recentRegisterCount').textContent = formatNumberLocal(kpis.recent_registrations || 0);
}

function renderRecordList(containerSelector, emptySelector, items, options) {
  const container = dq(containerSelector);
  const emptyEl = dq(emptySelector);
  if (!container) return;

  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    container.innerHTML = '';
    container.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  container.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  const hasSide = typeof options.sideRenderer === 'function';

  const rows = list.map(function (item) {
    const title = textSafe(item.equipment_name || '-');
    const dateText = textSafe(formatDisplayDate(item[options.dateField]));
    const model = textSafe(item.model_name || '-');
    const dept = textSafe(item.department_display || item.department || '-');
    const id = encodeURIComponent(item.equipment_id || '');

    let sideHtml = '';
    if (hasSide) {
      sideHtml = `<td class="dash-tbl-cell dash-tbl-cell--side">${options.sideRenderer(item) || ''}</td>`;
    }

    return `
      <tr class="dash-tbl-row" onclick="location.href='detail.html?id=${id}'" style="cursor:pointer;">
        <td class="dash-tbl-cell dash-tbl-cell--name">
          <div class="dash-tbl-name">${title}</div>
          <div class="dash-tbl-sub">${model}</div>
        </td>
        <td class="dash-tbl-cell dash-tbl-cell--dept">${dept}</td>
        <td class="dash-tbl-cell dash-tbl-cell--date">${dateText}</td>
        ${sideHtml}
      </tr>
    `;
  }).join('');

  const sideHeader = hasSide ? '<th class="dash-tbl-th dash-tbl-th--side"></th>' : '';

  container.innerHTML = `
    <table class="dash-tbl">
      <thead>
        <tr>
          <th class="dash-tbl-th dash-tbl-th--name">장비명</th>
          <th class="dash-tbl-th dash-tbl-th--dept">부서</th>
          <th class="dash-tbl-th dash-tbl-th--date">${textSafe(options.dateLabel)}</th>
          ${sideHeader}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderMaintenanceAlerts(items) {
  renderRecordList('#maintenanceAlertList', '#maintenanceAlertEmpty', items, {
    dateField: 'maintenance_end_date',
    dateLabel: '유지보수 만료일',
    sideRenderer: function (item) {
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
        <div class="dashboard-record-side">
          <span class="${badgeClass}">${textSafe(ddayText)}</span>
        </div>
      `;
    }
  });
}

function renderRecentRepairList(items) {
  renderRecordList('#recentRepairList', '#recentRepairEmpty', items, {
    dateField: 'work_date',
    dateLabel: '최근 수리일'
  });
}

function renderRecentRegisteredList(items) {
  renderRecordList('#recentRegisteredList', '#recentRegisteredEmpty', items, {
    dateField: 'created_at',
    dateLabel: '등록일'
  });
}

function renderDashboardData(summary) {
  renderKpis(summary || {});
  renderMaintenanceAlerts(summary?.maintenance_alerts || []);
  renderRecentRepairList(summary?.recent_repairs || []);
  renderRecentRegisteredList(summary?.recent_registrations || []);
}

async function fetchDashboardData() {
  const userEmail = getCurrentUserEmail();

  const summaryResult = await apiGet('getEquipmentDashboardSummary', {
    request_user_email: userEmail
  });

  return {
    summary: summaryResult?.data || {}
  };
}

function initPanelCarousel() {
  const scrollEl = dq('#dashboardPanelsScroll');
  const dotsWrap = dq('#dashboardPanelDots');
  if (!scrollEl || !dotsWrap) return;

  const dots = Array.from(dotsWrap.querySelectorAll('.dashboard-panel-dot'));

  function setActive(index) {
    dots.forEach(function (dot, i) {
      dot.classList.toggle('is-active', i === index);
    });
  }

  function getPanelWidth() {
    const firstCard = scrollEl.querySelector('.dashboard-panel--portal');
    const grid = scrollEl.querySelector('.dashboard-panels-grid');
    if (!firstCard || !grid) return 1;

    const styles = window.getComputedStyle(grid);
    const gap = parseFloat(styles.columnGap || styles.gap || 0);
    return firstCard.offsetWidth + gap;
  }

  function updateActiveByScroll() {
    if (window.innerWidth > 768) {
      setActive(0);
      return;
    }

    const width = getPanelWidth();
    const index = Math.round(scrollEl.scrollLeft / width);
    setActive(Math.max(0, Math.min(index, dots.length - 1)));
  }

  dots.forEach(function (dot) {
    dot.addEventListener('click', function () {
      if (window.innerWidth > 768) return;

      const index = Number(dot.dataset.index || 0);
      const width = getPanelWidth();

      scrollEl.scrollTo({
        left: width * index,
        behavior: 'smooth'
      });

      setActive(index);
    });
  });

  scrollEl.addEventListener('scroll', updateActiveByScroll, { passive: true });
  window.addEventListener('resize', updateActiveByScroll);
  updateActiveByScroll();
}

async function loadDashboard() {
  if (typeof clearMessage === 'function') clearMessage();

  renderDashboardSkeleton();

  const cached = getDashboardSessionCache();
  if (cached) {
    renderDashboardData(cached.summary || {});
    return;
  }

  const loaded = await fetchDashboardData();
  renderDashboardData(loaded.summary || {});
  setDashboardSessionCache(loaded);
}

document.addEventListener('DOMContentLoaded', async function () {
  if (DASHBOARD_BOOTSTRAPPED) return;
  DASHBOARD_BOOTSTRAPPED = true;

  try {
    if (typeof showGlobalLoading === 'function') {
      showGlobalLoading('대시보드를 불러오는 중...');
    }

    const user = window.auth?.requireAuth?.();
    if (!user) return;

    const permissionPromise = getEquipmentPermissionContext();
    const dashboardPromise = fetchDashboardData();

    DASHBOARD_PERMISSION = await permissionPromise;
    if (!DASHBOARD_PERMISSION.canView) {
      throw new Error('장비 메뉴 접근 권한이 없습니다.');
    }

    applyDashboardPermissionUi();

    const cached = getDashboardSessionCache();
    if (cached) {
      renderDashboardData(cached.summary || {});
      initPanelCarousel();
      return;
    }

    const loaded = await dashboardPromise;
    renderDashboardData(loaded.summary || {});
    setDashboardSessionCache(loaded);

    initPanelCarousel();
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
