const equipmentListState = {
  user: null,
  page: 1,
  pageSize: 20,
  totalCount: 0,
  totalPages: 1,
  hasNext: false,
  hasPrev: false,
  loading: false,
  canEdit: false,
  isRecentMode: false
};

function el(selector) {
  return document.querySelector(selector);
}

function getListQueryParams() {
  const params = new URLSearchParams(location.search);

  return {
    keyword: params.get('keyword') || '',
    clinic_code: params.get('clinic_code') || '',
    team_code: params.get('team_code') || '',
    status: params.get('status') || '',
    manufacturer: params.get('manufacturer') || '',
    page: Number(params.get('page') || 1) || 1,
    page_size: Number(params.get('page_size') || 20) || 20
  };
}

function setListQueryParams(next) {
  const url = new URL(location.href);

  Object.entries(next).forEach(([key, value]) => {
    if (value === '' || value === null || value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  });

  history.replaceState({}, '', url.toString());
}

function setValue(id, value) {
  const target = document.getElementById(id);
  if (!target) return;
  target.value = value == null ? '' : value;
}

function getValue(id) {
  const target = document.getElementById(id);
  return target ? String(target.value || '').trim() : '';
}

function escapeHtml(value) {
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

function statusClassLocal(value) {
  const map = {
    IN_USE: 'is-in-use',
    REPAIRING: 'is-repairing',
    INSPECTING: 'is-inspecting',
    STORED: 'is-stored',
    DISPOSED: 'is-disposed'
  };
  return map[String(value || '').trim()] || '';
}

function getCurrentFilters() {
  return {
    keyword: getValue('keyword'),
    clinic_code: getValue('clinic_code'),
    team_code: getValue('team_code'),
    status: getValue('status'),
    manufacturer: getValue('manufacturer')
  };
}

function hasMeaningfulFilter(filters) {
  return Boolean(
    filters.keyword ||
    filters.clinic_code ||
    filters.team_code ||
    filters.status ||
    filters.manufacturer
  );
}

function fillStatusFilterOptions() {
  const target = document.getElementById('status');
  if (!target) return;

  target.innerHTML = `
    <option value="">전체 상태</option>
    <option value="IN_USE">사용중</option>
    <option value="REPAIRING">수리중</option>
    <option value="INSPECTING">점검중</option>
    <option value="STORED">보관</option>
    <option value="DISPOSED">폐기</option>
  `;
}

function fillPageSizeOptions() {
  const target = document.getElementById('page_size');
  if (!target) return;

  target.innerHTML = `
    <option value="10">10개</option>
    <option value="20">20개</option>
    <option value="50">50개</option>
    <option value="100">100개</option>
  `;

  target.value = String(equipmentListState.pageSize);
}

function renderListSummary() {
  const summaryEl = document.getElementById('listSummary');
  if (!summaryEl) return;

  if (equipmentListState.isRecentMode) {
    const page = formatNumberLocal(equipmentListState.page || 1);
    const size = formatNumberLocal(equipmentListState.pageSize || 20);
    summaryEl.textContent = `최근 등록 장비 ${size}건 기준 · ${page} 페이지`;
    return;
  }

  const total = formatNumberLocal(equipmentListState.totalCount || 0);
  const page = formatNumberLocal(equipmentListState.page || 1);
  const totalPages = formatNumberLocal(equipmentListState.totalPages || 1);

  summaryEl.textContent = `총 ${total}건 · ${page} / ${totalPages} 페이지`;
}

function buildEquipmentCard(item) {
  const editAction = equipmentListState.canEdit
    ? `<a class="btn btn-primary" href="form.html?id=${encodeURIComponent(item.equipment_id || '')}">수정</a>`
    : '';

  return `
    <article class="equipment-card">
      <div class="equipment-card-head">
        <div class="equipment-card-title-wrap">
          <h3 class="equipment-card-title">${escapeHtml(item.equipment_name || '-')}</h3>
          <div class="equipment-card-sub">${escapeHtml(item.equipment_id || '')}</div>
        </div>
        <span class="status-badge ${statusClassLocal(item.status || '')}">
          ${escapeHtml(statusLabelLocal(item.status || ''))}
        </span>
      </div>

      <div class="equipment-card-grid">
        <div class="equipment-card-row">
          <span class="equipment-card-label">모델명</span>
          <span class="equipment-card-value">${escapeHtml(item.model_name || '-')}</span>
        </div>
        <div class="equipment-card-row">
          <span class="equipment-card-label">부서</span>
          <span class="equipment-card-value">${escapeHtml(item.department || '-')}</span>
        </div>
        <div class="equipment-card-row">
          <span class="equipment-card-label">제조사</span>
          <span class="equipment-card-value">${escapeHtml(item.manufacturer || '-')}</span>
        </div>
        <div class="equipment-card-row">
          <span class="equipment-card-label">시리얼</span>
          <span class="equipment-card-value">${escapeHtml(item.serial_no || '-')}</span>
        </div>
        <div class="equipment-card-row">
          <span class="equipment-card-label">위치</span>
          <span class="equipment-card-value">${escapeHtml(item.location || '-')}</span>
        </div>
        <div class="equipment-card-row">
          <span class="equipment-card-label">유지보수 종료</span>
          <span class="equipment-card-value">${escapeHtml(formatDisplayDate(item.maintenance_end_date || ''))}</span>
        </div>
      </div>

      <div class="equipment-card-actions">
        <a class="btn" href="detail.html?id=${encodeURIComponent(item.equipment_id || '')}">상세</a>
        ${editAction}
      </div>
    </article>
  `;
}

function renderEquipmentList(items = []) {
  const container = document.getElementById('equipmentList');
  if (!container) return;

  if (!items.length) {
    if (equipmentListState.isRecentMode) {
      container.innerHTML = `<div class="empty-box">최근 등록 장비가 없습니다.</div>`;
    } else {
      container.innerHTML = `<div class="empty-box">조회된 장비가 없습니다.</div>`;
    }
    return;
  }

  container.innerHTML = items.map(buildEquipmentCard).join('');
}

function renderRecentPagination() {
  const container = document.getElementById('paginationArea');
  if (!container) return;

  const page = equipmentListState.page;

  container.innerHTML = `
    <button type="button" class="pagination-btn" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>이전</button>
    <button type="button" class="pagination-btn is-active" disabled>${page}</button>
    <button type="button" class="pagination-btn" data-page="${page + 1}" ${equipmentListState.hasNext ? '' : 'disabled'}>다음</button>
  `;

  container.querySelectorAll('.pagination-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nextPage = Number(btn.dataset.page || page);
      if (!nextPage || nextPage === equipmentListState.page) return;
      await loadEquipmentList(nextPage);
    });
  });
}

function renderFullPagination() {
  const container = document.getElementById('paginationArea');
  if (!container) return;

  const page = equipmentListState.page;
  const totalPages = equipmentListState.totalPages;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);

  for (let i = start; i <= end; i += 1) {
    pages.push(`
      <button type="button" class="pagination-btn ${i === page ? 'is-active' : ''}" data-page="${i}">
        ${i}
      </button>
    `);
  }

  container.innerHTML = `
    <button type="button" class="pagination-btn" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>이전</button>
    ${pages.join('')}
    <button type="button" class="pagination-btn" data-page="${Math.min(totalPages, page + 1)}" ${page >= totalPages ? 'disabled' : ''}>다음</button>
  `;

  container.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nextPage = Number(btn.dataset.page || page);
      if (!nextPage || nextPage === equipmentListState.page) return;
      await loadEquipmentList(nextPage);
    });
  });
}

function renderPagination() {
  if (equipmentListState.isRecentMode) {
    renderRecentPagination();
    return;
  }

  renderFullPagination();
}

function applyListPermissionUi() {
  const createBtn = document.getElementById('createEquipmentBtn');
  if (createBtn) {
    createBtn.style.display = equipmentListState.canEdit ? '' : 'none';
  }
}

function buildListRequestParams(filters, nextPage) {
  const hasFilter = hasMeaningfulFilter(filters);

  equipmentListState.isRecentMode = !hasFilter;

  const base = {
    request_user_email: equipmentListState.user.email || '',
    keyword: filters.keyword,
    clinic_code: filters.clinic_code,
    team_code: filters.team_code,
    status: filters.status,
    manufacturer: filters.manufacturer,
    page: nextPage,
    page_size: equipmentListState.pageSize
  };

  if (!hasFilter) {
    return {
      ...base,
      recent_only: 'Y',
      include_total: 'N'
    };
  }

  return {
    ...base,
    include_total: 'Y'
  };
}

function syncListQueryParams(filters) {
  setListQueryParams({
    ...filters,
    page: equipmentListState.page,
    page_size: equipmentListState.pageSize
  });
}

async function loadEquipmentList(nextPage = equipmentListState.page) {
  if (equipmentListState.loading) return;

  equipmentListState.loading = true;

  try {
    if (typeof clearMessage === 'function') clearMessage();
    if (typeof showGlobalLoading === 'function') {
      showGlobalLoading('장비 목록을 불러오는 중...');
    }

    const filters = getCurrentFilters();
    const requestParams = buildListRequestParams(filters, nextPage);

    equipmentListState.page = nextPage;

    const result = await apiGet('listEquipments', requestParams);

    equipmentListState.page = Number(result.page || 1);
    equipmentListState.hasNext = Boolean(result.has_next);
    equipmentListState.hasPrev = Boolean(result.has_prev);

    if (equipmentListState.isRecentMode) {
      equipmentListState.totalCount = 0;
      equipmentListState.totalPages = equipmentListState.hasNext
        ? equipmentListState.page + 1
        : equipmentListState.page;
    } else {
      equipmentListState.totalCount = Number(result.total_count || result.count || 0);
      equipmentListState.totalPages = Number(result.total_pages || 1);
    }

    renderEquipmentList(Array.isArray(result.data) ? result.data : []);
    renderListSummary();
    renderPagination();
    syncListQueryParams(filters);
  } catch (error) {
    if (typeof showMessage === 'function') {
      showMessage(error.message || '장비 목록을 불러오는 중 오류가 발생했습니다.', 'error');
    } else {
      console.error(error);
    }
  } finally {
    equipmentListState.loading = false;
    if (typeof hideGlobalLoading === 'function') {
      hideGlobalLoading();
    }
  }
}

async function initListFilters() {
  const query = getListQueryParams();

  equipmentListState.page = query.page > 0 ? query.page : 1;
  equipmentListState.pageSize = query.page_size > 0 ? query.page_size : 20;

  fillStatusFilterOptions();
  fillPageSizeOptions();

  const clinicEl = document.getElementById('clinic_code');
  const teamEl = document.getElementById('team_code');

  if (window.OrgService && clinicEl && teamEl) {
    await window.OrgService.bindClinicTeam(clinicEl, teamEl, {
      initialClinicCode: query.clinic_code || '',
      initialTeamCode: query.team_code || '',
      clinicEmptyLabel: '전체 의원',
      teamEmptyLabel: '전체 팀'
    });
  }

  setValue('keyword', query.keyword || '');
  setValue('status', query.status || '');
  setValue('manufacturer', query.manufacturer || '');
  setValue('page_size', String(equipmentListState.pageSize));
}

function bindListEvents() {
  const searchForm = document.getElementById('searchForm');
  if (searchForm) {
    searchForm.addEventListener('submit', async function(event) {
      event.preventDefault();
      await loadEquipmentList(1);
    });
  }

  const resetBtn = document.getElementById('resetFilterBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async function() {
      setValue('keyword', '');
      setValue('clinic_code', '');
      setValue('team_code', '');
      setValue('status', '');
      setValue('manufacturer', '');

      equipmentListState.pageSize = Number(getValue('page_size') || equipmentListState.pageSize || 20) || 20;
      setValue('page_size', String(equipmentListState.pageSize));

      if (window.OrgService) {
        await window.OrgService.fillTeamSelect(document.getElementById('team_code'), '', {
          includeEmpty: true,
          emptyLabel: '전체 팀',
          selectedValue: ''
        });
      }

      await loadEquipmentList(1);
    });
  }

  const pageSizeEl = document.getElementById('page_size');
  if (pageSizeEl) {
    pageSizeEl.addEventListener('change', async function() {
      equipmentListState.pageSize = Number(pageSizeEl.value || 20) || 20;
      await loadEquipmentList(1);
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (typeof showGlobalLoading === 'function') {
      showGlobalLoading('장비 목록 화면을 준비하는 중...');
    }

    equipmentListState.user = window.auth?.requireAuth?.();
    if (!equipmentListState.user) return;

    const canView = await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
    if (!canView) return;

    equipmentListState.canEdit = await window.appPermission.hasPermission('equipment', ['edit', 'admin']);

    applyListPermissionUi();
    await initListFilters();
    bindListEvents();
    await loadEquipmentList(equipmentListState.page);
  } catch (error) {
    if (typeof showMessage === 'function') {
      showMessage(error.message || '화면 초기화 중 오류가 발생했습니다.', 'error');
    } else {
      console.error(error);
    }
  } finally {
    if (typeof hideGlobalLoading === 'function') {
      hideGlobalLoading();
    }
  }
});

/* ===== list ux polish ===== */

.equipment-list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 0 2px;
}

.equipment-list-summary {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  background: #eef4ff;
  border: 1px solid #d7e5ff;
  color: #285ea8;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.pagination-btn {
  min-width: 40px;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid #d5dce7;
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.pagination-btn:hover:not(:disabled) {
  border-color: #94a3b8;
  background: #f8fafc;
}

.pagination-btn.is-active {
  background: #0b1f44;
  border-color: #0b1f44;
  color: #fff;
}

.pagination-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

@media (max-width: 768px) {
  .equipment-list-toolbar {
    margin-bottom: 12px;
  }

  .equipment-list-summary {
    width: 100%;
    min-height: 40px;
    padding: 0 12px;
    border-radius: 14px;
    font-size: 13px;
    line-height: 1.35;
  }

  .pagination-btn {
    min-height: 38px;
    border-radius: 11px;
    font-size: 13px;
  }
}
