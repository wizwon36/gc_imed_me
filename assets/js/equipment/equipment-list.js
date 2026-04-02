const equipmentListState = {
  user: null,
  page: 1,
  pageSize: 20,
  totalCount: 0,
  totalPages: 1,
  loading: false
};

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

function syncFilterInputsFromState() {
  setFormValueSafe('keyword', getCurrentFilters().keyword);
  setFormValueSafe('clinic_code', getCurrentFilters().clinic_code);
  setFormValueSafe('status', getCurrentFilters().status);
  setFormValueSafe('manufacturer', getCurrentFilters().manufacturer);
}

function setFormValueSafe(id, value) {
  const el = qs(`#${id}`);
  if (!el) return;
  el.value = value == null ? '' : value;
}

function getCurrentFilters() {
  return {
    keyword: getFormValueSafe('keyword'),
    clinic_code: getFormValueSafe('clinic_code'),
    team_code: getFormValueSafe('team_code'),
    status: getFormValueSafe('status'),
    manufacturer: getFormValueSafe('manufacturer')
  };
}

function getFormValueSafe(id) {
  const el = qs(`#${id}`);
  return el ? String(el.value || '').trim() : '';
}

function fillStatusFilterOptions() {
  const el = qs('#status');
  if (!el) return;

  el.innerHTML = `
    <option value="">전체 상태</option>
    <option value="IN_USE">사용중</option>
    <option value="REPAIRING">수리중</option>
    <option value="INSPECTING">점검중</option>
    <option value="STORED">보관</option>
    <option value="DISPOSED">폐기</option>
  `;
}

function fillPageSizeOptions() {
  const el = qs('#page_size');
  if (!el) return;

  el.innerHTML = `
    <option value="10">10개</option>
    <option value="20">20개</option>
    <option value="50">50개</option>
    <option value="100">100개</option>
  `;

  el.value = String(equipmentListState.pageSize);
}

function renderListSummary() {
  const summaryEl = qs('#listSummary');
  if (!summaryEl) return;

  const total = formatNumber(equipmentListState.totalCount || 0);
  const page = formatNumber(equipmentListState.page || 1);
  const totalPages = formatNumber(equipmentListState.totalPages || 1);

  summaryEl.textContent = `총 ${total}건 · ${page} / ${totalPages} 페이지`;
}

function buildEquipmentCard(item) {
  return `
    <article class="equipment-card">
      <div class="equipment-card-head">
        <div class="equipment-card-title-wrap">
          <h3 class="equipment-card-title">${safeText(item.equipment_name || '-')}</h3>
          <div class="equipment-card-sub">${safeText(item.equipment_id || '')}</div>
        </div>
        <span class="status-badge ${statusClass(item.status || '')}">
          ${statusLabel(item.status || '')}
        </span>
      </div>

      <div class="equipment-card-grid">
        <div class="equipment-card-row">
          <span class="equipment-card-label">모델명</span>
          <span class="equipment-card-value">${safeText(item.model_name || '-')}</span>
        </div>
        <div class="equipment-card-row">
          <span class="equipment-card-label">부서</span>
          <span class="equipment-card-value">${safeText(item.department || '-')}</span>
        </div>
        <div class="equipment-card-row">
          <span class="equipment-card-label">제조사</span>
          <span class="equipment-card-value">${safeText(item.manufacturer || '-')}</span>
        </div>
        <div class="equipment-card-row">
          <span class="equipment-card-label">시리얼</span>
          <span class="equipment-card-value">${safeText(item.serial_no || '-')}</span>
        </div>
        <div class="equipment-card-row">
          <span class="equipment-card-label">위치</span>
          <span class="equipment-card-value">${safeText(item.location || '-')}</span>
        </div>
        <div class="equipment-card-row">
          <span class="equipment-card-label">유지보수 종료</span>
          <span class="equipment-card-value">${safeText(item.maintenance_end_date || '-')}</span>
        </div>
      </div>

      <div class="equipment-card-actions">
        <a class="btn-secondary" href="detail.html?id=${encodeURIComponent(item.equipment_id)}">상세보기</a>
        <a class="btn-primary" href="form.html?id=${encodeURIComponent(item.equipment_id)}">수정</a>
      </div>
    </article>
  `;
}

function renderEquipmentList(items = []) {
  const container = qs('#equipmentList');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<div class="empty-box">조회된 장비가 없습니다.</div>`;
    return;
  }

  container.innerHTML = items.map(buildEquipmentCard).join('');
}

function renderPagination() {
  const container = qs('#paginationArea');
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

  qsa('#paginationArea .pagination-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextPage = Number(btn.dataset.page || page);
      if (!nextPage || nextPage === equipmentListState.page) return;
      loadEquipmentList(nextPage);
    });
  });
}

async function loadEquipmentList(nextPage = equipmentListState.page) {
  if (equipmentListState.loading) return;

  equipmentListState.loading = true;
  clearMessage();

  try {
    showGlobalLoading('장비 목록을 불러오는 중...');

    const filters = getCurrentFilters();
    equipmentListState.page = nextPage;

    const result = await apiGet('listEquipments', {
      request_user_email: equipmentListState.user.email || '',
      keyword: filters.keyword,
      clinic_code: filters.clinic_code,
      team_code: filters.team_code,
      status: filters.status,
      manufacturer: filters.manufacturer,
      page: equipmentListState.page,
      page_size: equipmentListState.pageSize
    });

    equipmentListState.totalCount = Number(result.total_count || result.count || 0);
    equipmentListState.totalPages = Number(result.total_pages || 1);
    equipmentListState.page = Number(result.page || 1);

    renderEquipmentList(Array.isArray(result.data) ? result.data : []);
    renderListSummary();
    renderPagination();

    setListQueryParams({
      ...filters,
      page: equipmentListState.page,
      page_size: equipmentListState.pageSize
    });
  } catch (error) {
    showMessage(error.message || '장비 목록을 불러오는 중 오류가 발생했습니다.', 'error');
  } finally {
    equipmentListState.loading = false;
    await hideGlobalLoading(true);
  }
}

async function initListFilters() {
  const query = getListQueryParams();

  equipmentListState.page = query.page > 0 ? query.page : 1;
  equipmentListState.pageSize = query.page_size > 0 ? query.page_size : 20;

  fillStatusFilterOptions();
  fillPageSizeOptions();

  await window.OrgService.bindClinicTeam(qs('#clinic_code'), qs('#team_code'), {
    initialClinicCode: query.clinic_code || '',
    initialTeamCode: query.team_code || ''
  });

  setFormValueSafe('keyword', query.keyword || '');
  setFormValueSafe('status', query.status || '');
  setFormValueSafe('manufacturer', query.manufacturer || '');
  setFormValueSafe('page_size', String(equipmentListState.pageSize));
}

function bindListEvents() {
  const searchForm = qs('#searchForm');
  if (searchForm) {
    searchForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await loadEquipmentList(1);
    });
  }

  const resetBtn = qs('#resetFilterBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      setFormValueSafe('keyword', '');
      setFormValueSafe('clinic_code', '');
      setFormValueSafe('team_code', '');
      setFormValueSafe('status', '');
      setFormValueSafe('manufacturer', '');
      await window.OrgService.fillTeamSelect(qs('#team_code'), '', {
        includeEmpty: true,
        emptyLabel: '전체 팀',
        selectedValue: ''
      });
      await loadEquipmentList(1);
    });
  }

  const pageSizeEl = qs('#page_size');
  if (pageSizeEl) {
    pageSizeEl.addEventListener('change', async () => {
      equipmentListState.pageSize = Number(pageSizeEl.value || 20) || 20;
      await loadEquipmentList(1);
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  showGlobalLoading('장비 목록 화면을 준비하는 중...');

  try {
    equipmentListState.user = window.auth.requireAuth();
    if (!equipmentListState.user) return;

    await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
    await initListFilters();
    bindListEvents();
    await loadEquipmentList(equipmentListState.page);
  } catch (error) {
    showMessage(error.message || '화면 초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    await hideGlobalLoading(true);
  }
});
