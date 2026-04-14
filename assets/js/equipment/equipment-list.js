var equipmentListState = {
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
  var params = new URLSearchParams(location.search);

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
  var url = new URL(location.href);
  var key;

  for (key in next) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;

    if (next[key] === '' || next[key] === null || next[key] === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(next[key]));
    }
  }

  history.replaceState({}, '', url.toString());
}

function setValue(id, value) {
  var target = document.getElementById(id);
  if (!target) return;
  target.value = value == null ? '' : value;
}

function getValue(id) {
  var target = document.getElementById(id);
  return target ? String(target.value || '').trim() : '';
}

function formatNumberLocal(value) {
  var num = Number(value || 0);
  return Number.isFinite(num) ? num.toLocaleString('ko-KR') : '0';
}

function formatDisplayDate(value) {
  var raw = String(value || '').trim();
  var dateOnlyMatch;
  var parsed;
  var yyyy;
  var mm;
  var dd;

  if (!raw) return '-';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  dateOnlyMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (dateOnlyMatch) {
    return dateOnlyMatch[1];
  }

  parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    yyyy = parsed.getFullYear();
    mm = String(parsed.getMonth() + 1).padStart(2, '0');
    dd = String(parsed.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  return raw;
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
  var target = document.getElementById('status');
  if (!target) return;

  target.innerHTML =
    '<option value="">전체 상태</option>' +
    '<option value="IN_USE">사용중</option>' +
    '<option value="REPAIRING">수리중</option>' +
    '<option value="INSPECTING">점검중</option>' +
    '<option value="STORED">보관</option>' +
    '<option value="DISPOSED">폐기</option>';
}

function fillPageSizeOptions() {
  var target = document.getElementById('page_size');
  if (!target) return;

  target.innerHTML =
    '<option value="10">10개</option>' +
    '<option value="20">20개</option>' +
    '<option value="50">50개</option>' +
    '<option value="100">100개</option>';

  target.value = String(equipmentListState.pageSize);
}

function renderListSummary() {
  var summaryEl = document.getElementById('listSummary');
  var total;
  var page;
  var totalPages;
  var size;

  if (!summaryEl) return;

  if (equipmentListState.isRecentMode) {
    page = formatNumberLocal(equipmentListState.page || 1);
    size = formatNumberLocal(equipmentListState.pageSize || 20);
    summaryEl.textContent = '최근 등록 장비 보기 · ' + size + '건 단위 · ' + page + '페이지';
    return;
  }

  total = formatNumberLocal(equipmentListState.totalCount || 0);
  page = formatNumberLocal(equipmentListState.page || 1);
  totalPages = formatNumberLocal(equipmentListState.totalPages || 1);

  summaryEl.textContent = '검색 결과 ' + total + '건 · ' + page + ' / ' + totalPages + ' 페이지';
}

function buildEquipmentCard(item) {
  var leftActions = '';
  var rightActions = '';

  leftActions += '<a class="btn" href="detail.html?id=' + encodeURIComponent(item.equipment_id || '') + '">상세</a>';

  if (equipmentListState.canEdit) {
    leftActions += '<a class="btn btn-primary" href="form.html?id=' + encodeURIComponent(item.equipment_id || '') + '">수정</a>';
  }

  rightActions = '<a class="btn equipment-card-label-btn" href="label-print.html?equipment_id=' + encodeURIComponent(item.equipment_id || '') + '">라벨출력</a>';

  return (
    '<article class="equipment-card">' +
      '<div class="equipment-card-head">' +
        '<div class="equipment-card-title-wrap">' +
          '<h3 class="equipment-card-title">' + escapeHtml(item.equipment_name || '-') + '</h3>' +
          '<div class="equipment-card-sub">' + escapeHtml(item.equipment_id || '') + '</div>' +
        '</div>' +
        '<span class="status-badge ' + statusClass(item.status || '') + '">' +
          escapeHtml(statusLabel(item.status || '')) +
        '</span>' +
      '</div>' +

      '<div class="equipment-card-grid">' +
        '<div class="equipment-card-row">' +
          '<span class="equipment-card-label">모델명</span>' +
          '<span class="equipment-card-value">' + escapeHtml(item.model_name || '-') + '</span>' +
        '</div>' +
        '<div class="equipment-card-row">' +
          '<span class="equipment-card-label">부서</span>' +
          '<span class="equipment-card-value">' + escapeHtml(item.department || '-') + '</span>' +
        '</div>' +
        '<div class="equipment-card-row">' +
          '<span class="equipment-card-label">제조사</span>' +
          '<span class="equipment-card-value">' + escapeHtml(item.manufacturer || '-') + '</span>' +
        '</div>' +
        '<div class="equipment-card-row">' +
          '<span class="equipment-card-label">시리얼</span>' +
          '<span class="equipment-card-value">' + escapeHtml(item.serial_no || '-') + '</span>' +
        '</div>' +
        '<div class="equipment-card-row">' +
          '<span class="equipment-card-label">위치</span>' +
          '<span class="equipment-card-value">' + escapeHtml(item.location || '-') + '</span>' +
        '</div>' +
        '<div class="equipment-card-row">' +
          '<span class="equipment-card-label">유지보수 종료</span>' +
          '<span class="equipment-card-value">' + escapeHtml(formatDisplayDate(item.maintenance_end_date || '')) + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="equipment-card-actions">' +
        '<div class="equipment-card-actions-left">' +
          leftActions +
        '</div>' +
        '<div class="equipment-card-actions-right">' +
          rightActions +
        '</div>' +
      '</div>' +
    '</article>'
  );
}

function renderEquipmentList(items) {
  var container = document.getElementById('equipmentList');
  if (!container) return;

  items = Array.isArray(items) ? items : [];

  if (!items.length) {
    if (equipmentListState.isRecentMode) {
      container.innerHTML = '<div class="empty-box">최근 등록 장비가 없습니다.</div>';
    } else {
      container.innerHTML = '<div class="empty-box">조회된 장비가 없습니다.</div>';
    }
    return;
  }

  container.innerHTML = items.map(buildEquipmentCard).join('');
}

function renderRecentPagination() {
  var container = document.getElementById('paginationArea');
  var page = equipmentListState.page;
  if (!container) return;

  container.innerHTML =
    '<button type="button" class="pagination-btn" data-page="' + Math.max(1, page - 1) + '" ' + (page <= 1 ? 'disabled' : '') + '>이전</button>' +
    '<button type="button" class="pagination-btn is-active" disabled>' + page + '</button>' +
    '<button type="button" class="pagination-btn" data-page="' + (page + 1) + '" ' + (equipmentListState.hasNext ? '' : 'disabled') + '>다음</button>';

  Array.prototype.forEach.call(container.querySelectorAll('.pagination-btn[data-page]'), function(btn) {
    btn.addEventListener('click', async function() {
      var nextPage = Number(btn.dataset.page || page);
      if (!nextPage || nextPage === equipmentListState.page) return;
      await loadEquipmentList(nextPage);
    });
  });
}

function renderFullPagination() {
  var container = document.getElementById('paginationArea');
  var page = equipmentListState.page;
  var totalPages = equipmentListState.totalPages;
  var pages = [];
  var start;
  var end;
  var i;

  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  start = Math.max(1, page - 2);
  end = Math.min(totalPages, page + 2);

  for (i = start; i <= end; i += 1) {
    pages.push(
      '<button type="button" class="pagination-btn ' + (i === page ? 'is-active' : '') + '" data-page="' + i + '">' +
        i +
      '</button>'
    );
  }

  container.innerHTML =
    '<button type="button" class="pagination-btn" data-page="' + Math.max(1, page - 1) + '" ' + (page <= 1 ? 'disabled' : '') + '>이전</button>' +
    pages.join('') +
    '<button type="button" class="pagination-btn" data-page="' + Math.min(totalPages, page + 1) + '" ' + (page >= totalPages ? 'disabled' : '') + '>다음</button>';

  Array.prototype.forEach.call(container.querySelectorAll('.pagination-btn'), function(btn) {
    btn.addEventListener('click', async function() {
      var nextPage = Number(btn.dataset.page || page);
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
  var createBtn = document.getElementById('createEquipmentBtn');
  if (createBtn) {
    createBtn.style.display = equipmentListState.canEdit ? '' : 'none';
  }
}

function buildListRequestParams(filters, nextPage) {
  var hasFilter = hasMeaningfulFilter(filters);
  var base;

  equipmentListState.isRecentMode = !hasFilter;

  base = {
    request_user_email: equipmentListState.user && equipmentListState.user.email ? equipmentListState.user.email : '',
    keyword: filters.keyword,
    clinic_code: filters.clinic_code,
    team_code: filters.team_code,
    status: filters.status,
    manufacturer: filters.manufacturer,
    page: nextPage,
    page_size: equipmentListState.pageSize
  };

  if (!hasFilter) {
    base.recent_only = 'Y';
    base.include_total = 'N';
    return base;
  }

  base.include_total = 'Y';
  return base;
}

function syncListQueryParams(filters) {
  setListQueryParams({
    keyword: filters.keyword,
    clinic_code: filters.clinic_code,
    team_code: filters.team_code,
    status: filters.status,
    manufacturer: filters.manufacturer,
    page: equipmentListState.page,
    page_size: equipmentListState.pageSize
  });
}

async function loadEquipmentList(nextPage) {
  var filters;
  var requestParams;
  var result;

  if (equipmentListState.loading) return;

  equipmentListState.loading = true;

  try {
    if (typeof clearMessage === 'function') clearMessage();
    if (typeof showGlobalLoading === 'function') {
      showGlobalLoading('장비 목록을 불러오는 중...');
    }

    filters = getCurrentFilters();
    requestParams = buildListRequestParams(filters, nextPage || equipmentListState.page);

    equipmentListState.page = nextPage || equipmentListState.page;

    result = await apiGet('listEquipments', requestParams);

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
  var query = getListQueryParams();
  var clinicEl;
  var teamEl;

  equipmentListState.page = query.page > 0 ? query.page : 1;
  equipmentListState.pageSize = query.page_size > 0 ? query.page_size : 20;

  fillStatusFilterOptions();
  fillPageSizeOptions();

  clinicEl = document.getElementById('clinic_code');
  teamEl = document.getElementById('team_code');

  if (window.orgSelect && clinicEl && teamEl) {
    await window.orgSelect.loadOrgData();
    window.orgSelect.fillSelectOptions(clinicEl, window.orgSelect.getClinics(), {
      emptyText: '전체 의원'
    });
    window.orgSelect.bindClinicTeamSelects({
      clinicSelect: clinicEl,
      teamSelect: teamEl,
      teamEmptyText: '전체 팀',
      onTeamChanged: null
    });
    if (query.clinic_code) {
      clinicEl.value = query.clinic_code;
      window.orgSelect.fillSelectOptions(
        teamEl,
        window.orgSelect.getFilteredTeams(query.clinic_code),
        { emptyText: '전체 팀' }
      );
      if (query.team_code) teamEl.value = query.team_code;
    } else {
      teamEl.innerHTML = '<option value="">의원을 먼저 선택하세요</option>';
      teamEl.disabled = true;
    }
  }

  setValue('keyword', query.keyword || '');
  setValue('status', query.status || '');
  setValue('manufacturer', query.manufacturer || '');
  setValue('page_size', String(equipmentListState.pageSize));
}

function bindListEvents() {
  var searchForm = document.getElementById('searchForm');
  var resetBtn = document.getElementById('resetFilterBtn');
  var pageSizeEl = document.getElementById('page_size');

  if (searchForm) {
    searchForm.addEventListener('submit', async function(event) {
      event.preventDefault();
      await loadEquipmentList(1);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', async function() {
      setValue('keyword', '');
      setValue('clinic_code', '');
      setValue('team_code', '');
      setValue('status', '');
      setValue('manufacturer', '');

      equipmentListState.pageSize = Number(getValue('page_size') || equipmentListState.pageSize || 20) || 20;
      setValue('page_size', String(equipmentListState.pageSize));

      if (window.orgSelect) {
        window.orgSelect.fillSelectOptions(
          document.getElementById('team_code'),
          [],
          { emptyText: '전체 팀' }
        );
      }

      await loadEquipmentList(1);
    });
  }

  if (pageSizeEl) {
    pageSizeEl.addEventListener('change', async function() {
      equipmentListState.pageSize = Number(pageSizeEl.value || 20) || 20;
      await loadEquipmentList(1);
    });
  }
}

function statusLabelForExport(value) {
  var map = {
    IN_USE: '사용중',
    REPAIRING: '수리중',
    INSPECTING: '점검중',
    STORED: '보관',
    DISPOSED: '폐기'
  };
  return map[String(value || '').trim()] || (value || '');
}

async function exportEquipmentExcel() {
  var exportBtn = document.getElementById('exportExcelBtn');

  if (!window.XLSX) {
    showMessage('엑셀 라이브러리를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    return;
  }

  var filters = getCurrentFilters();
  var userEmail = equipmentListState.user && equipmentListState.user.email
    ? equipmentListState.user.email : '';

  try {
    if (exportBtn) {
      exportBtn.disabled = true;
      exportBtn.textContent = '다운로드 중...';
    }
    showGlobalLoading('장비 데이터를 불러오는 중...');

    var result = await apiGet('exportEquipments', {
      request_user_email: userEmail,
      keyword: filters.keyword,
      clinic_code: filters.clinic_code,
      team_code: filters.team_code,
      status: filters.status,
      manufacturer: filters.manufacturer
    });

    var data = Array.isArray(result.data) ? result.data : [];

    if (!data.length) {
      showMessage('다운로드할 데이터가 없습니다.', 'error');
      return;
    }

    var headers = [
      '장비번호', '장비명', '모델명', '제조사', '시리얼번호',
      '사용부서', '의원', '팀', '현재위치', '현재상태',
      '담당자', '연락처', '구매처', '취득가액',
      '취득일자', '제조일자', '유지보수종료일', '현재사용자', '비고', '등록일시'
    ];

    var rows = data.map(function(item) {
      return [
        item.equipment_id || '',
        item.equipment_name || '',
        item.model_name || '',
        item.manufacturer || '',
        item.serial_no || '',
        item.department || '',
        item.clinic_name || '',
        item.team_name || '',
        item.location || '',
        statusLabelForExport(item.status),
        item.manager_name || '',
        item.manager_phone || '',
        item.vendor || '',
        item.acquisition_cost !== '' && item.acquisition_cost !== null && item.acquisition_cost !== undefined
          ? Number(item.acquisition_cost) : '',
        item.purchase_date || '',
        item.manufacture_date || '',
        item.maintenance_end_date || '',
        item.current_user || '',
        item.memo || '',
        item.created_at || ''
      ];
    });

    var wsData = [headers].concat(rows);
    var ws = window.XLSX.utils.aoa_to_sheet(wsData);

    // 컬럼 너비 설정
    ws['!cols'] = [
      { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
      { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
      { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 18 }
    ];

    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, '장비대장');

    var now = new Date();
    var dateStr = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    var fileName = '장비대장_' + dateStr + '.xlsx';

    window.XLSX.writeFile(wb, fileName);
  } catch (error) {
    showMessage(error.message || '엑셀 다운로드 중 오류가 발생했습니다.', 'error');
  } finally {
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.textContent = '엑셀 다운로드';
    }
    hideGlobalLoading(true);
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    if (typeof showGlobalLoading === 'function') {
      showGlobalLoading('장비 목록 화면을 준비하는 중...');
    }

    if (window.auth && typeof window.auth.requireAuth === 'function') {
      equipmentListState.user = window.auth.requireAuth();
    }

    if (!equipmentListState.user) return;

    if (window.appPermission && typeof window.appPermission.requirePermission === 'function') {
      var canView = await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
      if (!canView) return;
    }

    if (window.appPermission && typeof window.appPermission.hasPermission === 'function') {
      equipmentListState.canEdit = await window.appPermission.hasPermission('equipment', ['edit', 'admin']);
    }

    applyListPermissionUi();
    await initListFilters();
    bindListEvents();
    await loadEquipmentList(equipmentListState.page);

    var exportBtn = document.getElementById('exportExcelBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportEquipmentExcel);
    }
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
