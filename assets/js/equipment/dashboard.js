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

  const exportAction = dq('#dashboardExportBtn');
  if (exportAction) {
    exportAction.style.display = DASHBOARD_PERMISSION.canEdit ? '' : 'none';
    exportAction.addEventListener('click', exportAllEquipmentsExcel);
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
  const showDept = options.showDept !== false;
  const showDate = options.showDate !== false;
  const showStatus = options.showStatus === true;

  const rows = list.map(function (item) {
    const title = textSafe(item.equipment_name || '-');
    const dateText = textSafe(formatDisplayDate(item[options.dateField]));
    const model = textSafe(item.model_name || '-');
    const deptRaw = item.department_display || item.department || '-';
    const dept = textSafe(deptRaw);
    const deptMobile = dept.replace(' / ', '<br>');
    const id = encodeURIComponent(item.equipment_id || '');

    let sideHtml = '';
    if (hasSide) {
      sideHtml = `<td class="dash-tbl-cell dash-tbl-cell--side">${options.sideRenderer(item) || ''}</td>`;
    }

    let statusHtml = '';
    if (showStatus) {
      const st = item.status || '';
      const stLabel = st === 'IN_USE' ? '사용중'
        : st === 'REPAIRING' ? '수리중'
        : st === 'INSPECTING' ? '점검중'
        : st === 'STORED' ? '보관'
        : st === 'DISPOSED' ? '폐기' : (st || '-');
      const stClass = st === 'IN_USE' ? 'status-badge is-in-use'
        : st === 'REPAIRING' ? 'status-badge is-repairing'
        : st === 'INSPECTING' ? 'status-badge is-inspecting'
        : st === 'STORED' ? 'status-badge is-stored'
        : st === 'DISPOSED' ? 'status-badge is-disposed' : 'status-badge';
      statusHtml = `<td class="dash-tbl-cell dash-tbl-cell--status"><span class="${stClass}">${textSafe(stLabel)}</span></td>`;
    }

    return `
      <tr class="dash-tbl-row" onclick="location.href='detail.html?id=${id}'" style="cursor:pointer;">
        <td class="dash-tbl-cell dash-tbl-cell--name">
          <div class="dash-tbl-name">${title}</div>
          <div class="dash-tbl-sub">${model}</div>
        </td>
        ${showDept ? `<td class="dash-tbl-cell dash-tbl-cell--dept">
          <span class="dept-pc">${dept}</span>
          <span class="dept-mobile">${deptMobile}</span>
        </td>` : ''}
        ${showDate ? `<td class="dash-tbl-cell dash-tbl-cell--date">${dateText}</td>` : ''}
        ${statusHtml}
        ${sideHtml}
      </tr>
    `;
  }).join('');

  const deptHeader = showDept ? '<th class="dash-tbl-th dash-tbl-th--dept">부서</th>' : '';
  const dateHeader = showDate ? `<th class="dash-tbl-th dash-tbl-th--date">${textSafe(options.dateLabel)}</th>` : '';
  const statusHeader = showStatus ? '<th class="dash-tbl-th dash-tbl-th--status">상태</th>' : '';
  const sideHeader = hasSide ? '<th class="dash-tbl-th dash-tbl-th--side"></th>' : '';

  container.innerHTML = `
    <table class="dash-tbl">
      <thead>
        <tr>
          <th class="dash-tbl-th dash-tbl-th--name">장비명</th>
          ${deptHeader}
          ${dateHeader}
          ${statusHeader}
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
    dateLabel: '',
    showDept: true,
    showDate: false,   // 날짜 제거 — D-Day 뱃지로 충분
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
    dateLabel: '수리일',
    showDept: false,
    showDate: true,
    showStatus: true
  });
}

function renderRecentRegisteredList(items) {
  renderRecordList('#recentRegisteredList', '#recentRegisteredEmpty', items, {
    dateField: 'created_at',
    dateLabel: '등록일',
    showDept: false,   // 부서 제거 — 공간 확보
    showDate: true
  });
}

function renderDashboardData(summary) {
  renderKpis(summary || {});
  renderMaintenanceAlerts(summary?.maintenance_alerts || []);
  renderRecentRepairList(summary?.recent_repairs || []);
  renderRecentRegisteredList(summary?.recent_registrations || []);
  renderDeptChart(summary?.department_summary || []);
  renderHeatmap(summary?.department_summary || []);
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

function renderDeptChart(data) {
  const wrap  = document.getElementById('deptChartWrap');
  const empty = document.getElementById('deptChartEmpty');
  if (!wrap) return;

  if (!data || data.length === 0) { if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';

  const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
  const total  = data.reduce((s, d) => s + Number(d.count || 0), 0);
  if (total === 0) { if (empty) empty.style.display = ''; return; }

  const rows = data.map(function (d, i) {
    const count  = Number(d.count || 0);
    const pct    = Math.round((count / total) * 100);
    const color  = COLORS[i % COLORS.length];
    const name   = textSafe(d.department_display || d.department || '-');
    const barPct = Math.max(pct, 8);
    return `
      <div class="dept-cbar-row">
        <div class="dept-cbar-label" title="${name}">${name}</div>
        <div class="dept-cbar-track">
          <div class="dept-cbar-fill" style="width:${barPct}%;background:${color};">
            <span class="dept-cbar-inline">${count}대&nbsp;&nbsp;${pct}%</span>
          </div>
        </div>
      </div>`;
  }).join('');

  wrap.innerHTML = `<div class="dept-cbar-list">${rows}</div>`;
}

function renderHeatmap(data) {
  const wrap  = document.getElementById('heatmapWrap');
  const empty = document.getElementById('heatmapEmpty');
  if (!wrap) return;

  if (!data || data.length === 0) { if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';

  const COLS = [
    { key: 'in_use',     label: '사용중', bg: '#dbeafe', fg: '#1d4ed8' },
    { key: 'repairing',  label: '수리중', bg: '#fee2e2', fg: '#dc2626' },
    { key: 'inspecting', label: '점검중', bg: '#fef9c3', fg: '#ca8a04' },
    { key: 'stored',     label: '보관',   bg: '#dcfce7', fg: '#16a34a' }
  ];

  const headerCells = COLS.map(c => `<div class="hm-th">${c.label}</div>`).join('');

  const dataRows = data.map(function (dept) {
    const name  = textSafe(dept.department_display || dept.department || '-');
    const cells = COLS.map(function (c) {
      const val = Number(dept[c.key] || 0);
      return val === 0
        ? `<div class="hm-cell hm-cell--empty">—</div>`
        : `<div class="hm-cell" style="background:${c.bg};color:${c.fg};">${val}</div>`;
    }).join('');
    return `<div class="hm-row"><div class="hm-dept" title="${name}">${name}</div>${cells}</div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="hm-table">
      <div class="hm-header-row"><div class="hm-dept-th"></div>${headerCells}</div>
      ${dataRows}
    </div>`;
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
    if (!firstCard) return scrollEl.offsetWidth || 1;
    return firstCard.offsetWidth;
  }

  function getSortedCards() {
    const cards = Array.from(scrollEl.querySelectorAll('.dashboard-panel--portal'));
    return cards.sort(function (a, b) {
      return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
    });
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

  // 초기 dot은 항상 0번 — 레이아웃 완성 후 한 번 더 보정
  setActive(0);
  requestAnimationFrame(function () {
    requestAnimationFrame(updateActiveByScroll);
  });
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

// ─────────────────────────────────────────────
// 장비대장 전체 엑셀 다운로드
// ─────────────────────────────────────────────
async function exportAllEquipmentsExcel() {
  const btn = document.getElementById('dashboardExportBtn');

  if (!window.XLSX) {
    if (typeof showMessage === 'function') showMessage('엑셀 라이브러리를 불러오지 못했습니다.', 'error');
    return;
  }

  try {
    if (btn) { btn.disabled = true; btn.querySelector('.dashboard-action-desc').textContent = '다운로드 중...'; }
    if (typeof showGlobalLoading === 'function') showGlobalLoading('장비 데이터를 불러오는 중...');

    const userEmail = getCurrentUserEmail();
    const result = await apiGet('exportEquipments', { request_user_email: userEmail });
    const data = Array.isArray(result.data) ? result.data : [];

    if (!data.length) {
      if (typeof showMessage === 'function') showMessage('다운로드할 데이터가 없습니다.', 'error');
      return;
    }

    const statusMap = { IN_USE: '사용중', REPAIRING: '수리중', INSPECTING: '점검중', STORED: '보관', DISPOSED: '폐기' };
    const toStatus   = v => statusMap[String(v || '').trim()] || (v || '');
    const toDateOnly = v => v ? String(v).substring(0, 10) : '';

    const headers = [
      '장비번호', '장비명', '모델명', '제조사', '시리얼번호',
      '사용부서', '의원', '팀', '현재위치', '현재상태',
      '담당자', '연락처', '구매처', '취득가액',
      '취득일자', '제조일자', '유지보수종료일', '현재사용자', '비고', '등록일시'
    ];

    // 컬럼 유형 (0-based index)
    const COL_NUM  = new Set([13]);         // 취득가액
    const COL_DATE = new Set([14, 15, 16]); // 취득일자, 제조일자, 유지보수종료일

    const rows = data.map(item => [
      item.equipment_id || '', item.equipment_name || '', item.model_name || '',
      item.manufacturer || '', item.serial_no || '', item.department || '',
      item.clinic_name || '', item.team_name || '', item.location || '',
      toStatus(item.status), item.manager_name || '', item.manager_phone || '',
      item.vendor || '',
      (item.acquisition_cost !== '' && item.acquisition_cost != null) ? Number(item.acquisition_cost) : '',
      toDateOnly(item.purchase_date), toDateOnly(item.manufacture_date), toDateOnly(item.maintenance_end_date),
      item.current_user || '', item.memo || '', item.created_at || ''
    ]);

    // ── 스타일 정의 ──────────────────────────────────────────────
    const FONT_BASE   = { name: '맑은 고딕', sz: 10 };
    const FONT_HEADER = { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: '1F3864' } };
    const FILL_HEADER = { patternType: 'solid', fgColor: { rgb: 'B8CCE4' } };
    const BORDER = {
      top:    { style: 'thin', color: { rgb: 'BFBFBF' } },
      bottom: { style: 'thin', color: { rgb: 'BFBFBF' } },
      left:   { style: 'thin', color: { rgb: 'BFBFBF' } },
      right:  { style: 'thin', color: { rgb: 'BFBFBF' } }
    };
    const ALIGN_LEFT   = { horizontal: 'left',   vertical: 'center' };
    const ALIGN_CENTER = { horizontal: 'center', vertical: 'center' };
    const ALIGN_RIGHT  = { horizontal: 'right',  vertical: 'center' };
    const FMT_NUM  = '#,##0';
    const FMT_DATE = 'yyyy-mm-dd';

    // ── 워크시트 수동 생성 ───────────────────────────────────────
    const ws = {};
    const totalCols = headers.length;
    const totalRows = rows.length + 1;

    // 헤더 행
    headers.forEach(function(h, c) {
      const addr = window.XLSX.utils.encode_cell({ r: 0, c });
      ws[addr] = {
        v: h, t: 's',
        s: { font: FONT_HEADER, fill: FILL_HEADER, border: BORDER, alignment: ALIGN_CENTER }
      };
    });

    // 데이터 행
    rows.forEach(function(row, r) {
      row.forEach(function(val, c) {
        const addr  = window.XLSX.utils.encode_cell({ r: r + 1, c });
        const isNum  = COL_NUM.has(c);
        const isDate = COL_DATE.has(c);

        const cell = {
          v: val,
          t: isNum && val !== '' ? 'n' : 's',
          s: {
            font:      FONT_BASE,
            border:    BORDER,
            alignment: isNum ? ALIGN_RIGHT : isDate ? ALIGN_CENTER : ALIGN_LEFT
          }
        };

        if (isNum && val !== '') { cell.z = FMT_NUM;  cell.s.numFmt = FMT_NUM;  }
        if (isDate && val)       { cell.z = FMT_DATE; cell.s.numFmt = FMT_DATE; }

        ws[addr] = cell;
      });
    });

    ws['!ref']  = window.XLSX.utils.encode_range({ r: 0, c: 0 }, { r: totalRows - 1, c: totalCols - 1 });
    ws['!cols'] = [
      {wch:14},{wch:20},{wch:16},{wch:14},{wch:16},
      {wch:20},{wch:12},{wch:12},{wch:12},{wch:8},
      {wch:10},{wch:14},{wch:14},{wch:12},
      {wch:12},{wch:12},{wch:14},{wch:10},{wch:20},{wch:18}
    ];
    ws['!rows'] = Array(totalRows).fill({ hpt: 18 });

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, '장비대장');

    const now = new Date();
    const dateStr = now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0');
    window.XLSX.writeFile(wb, '장비대장_' + dateStr + '.xlsx');

  } catch (error) {
    if (typeof showMessage === 'function') showMessage(error.message || '엑셀 다운로드 중 오류가 발생했습니다.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.querySelector('.dashboard-action-desc').textContent = '전체 장비 다운로드'; }
    if (typeof hideGlobalLoading === 'function') hideGlobalLoading(true);
  }
}
