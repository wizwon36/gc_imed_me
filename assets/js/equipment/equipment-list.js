let CURRENT_EQUIPMENT_PERMISSION = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth.requireAuth();
  if (!user) return;

  const ok = await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
  if (!ok) return;

  CURRENT_EQUIPMENT_PERMISSION = await window.appPermission.getPermission('equipment');

  showGlobalLoading('조직 정보를 불러오는 중...');

  try {
    await OrgService.preload();
    await initEquipmentListPage();
  } catch (error) {
    showMessage(error.message || '화면을 불러오는 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});

async function initEquipmentListPage() {
  await initListOrgFilters();

  qs('#searchBtn').addEventListener('click', loadEquipments);
  qs('#resetBtn').addEventListener('click', resetSearchForm);

  bindFilterChips();
  bindEnterSearch();
  setActiveFilterChip('');
  applyListViewContext();

  renderInitialEmptyState(
    '검색 조건을 설정한 뒤 조회해 주세요.',
    '조회 전에는 결과 요약과 결과 목록이 표시되지 않습니다.'
  );
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

function renderEquipmentListSkeleton() {
  const list = qs('#equipmentCardList');
  if (!list) return;

  list.innerHTML = `
    <div class="equipment-card-skeleton-list">
      <div class="equipment-card-skeleton"></div>
      <div class="equipment-card-skeleton"></div>
      <div class="equipment-card-skeleton"></div>
    </div>
  `;
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

function safeText(value, fallback = '-') {
  return escapeHtml(value || fallback);
}

function toggleResultsUI(show) {
  const summaryRow = qs('#summaryRow');
  const resultSection = qs('#resultSection');
  const heroResultBadge = qs('#heroResultBadge');

  if (summaryRow) {
    summaryRow.classList.toggle('is-hidden', !show);
  }
  if (resultSection) {
    resultSection.classList.toggle('is-hidden', !show);
  }
  if (heroResultBadge) {
    heroResultBadge.classList.toggle('is-hidden', !show);
  }
}

function renderInitialEmptyState(message, description = '') {
  const list = qs('#equipmentCardList');
  if (!list) return;

  list.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-title">${escapeHtml(message)}</div>
      ${description ? `<div class="empty-state-desc">${escapeHtml(description)}</div>` : ''}
    </div>
  `;

  updateSummary([]);
  toggleResultsUI(false);
}

function renderResultEmptyState(message, description = '') {
  const list = qs('#equipmentCardList');
  if (!list) return;

  list.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-title">${escapeHtml(message)}</div>
      ${description ? `<div class="empty-state-desc">${escapeHtml(description)}</div>` : ''}
    </div>
  `;

  updateSummary([]);
  toggleResultsUI(true);
}

function updateSummary(items) {
  const total = items.length;
  const inUse = items.filter(item => item.status === 'IN_USE').length;
  const repairing = items.filter(item => item.status === 'REPAIRING').length;
  const inspecting = items.filter(item => item.status === 'INSPECTING').length;

  qs('#summaryTotal').textContent = formatNumber(total);
  qs('#summaryInUse').textContent = formatNumber(inUse);
  qs('#summaryRepairing').textContent = formatNumber(repairing);
  qs('#summaryInspecting').textContent = formatNumber(inspecting);
  qs('#resultCountText').textContent = `총 ${formatNumber(total)}건`;
}

function renderEquipmentCards(items) {
  const list = qs('#equipmentCardList');

  if (!items.length) {
    renderResultEmptyState(
      '조회 결과가 없습니다.',
      '검색 조건을 변경한 뒤 다시 조회해 주세요.'
    );
    return;
  }

  toggleResultsUI(true);

  list.innerHTML = items.map(item => `
    <article class="equipment-item-card equipment-item-card-tuned" data-id="${escapeHtml(item.equipment_id)}">
      <div class="equipment-card-top">
        <div class="equipment-title-block">
          <h3 class="equipment-title">${safeText(item.equipment_name)}</h3>
          <div class="equipment-model">${safeText(item.model_name)}</div>
        </div>

        <div class="equipment-top-right">
          <span class="status-badge ${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
          <div class="equipment-id">${safeText(item.equipment_id)}</div>
        </div>
      </div>

      <div class="equipment-meta-grid">
        <div class="equipment-meta-item">
          <span class="equipment-meta-label">의원 / 팀</span>
          <span class="equipment-meta-value">${safeText(item.department)}</span>
        </div>

        <div class="equipment-meta-item">
          <span class="equipment-meta-label">제조사</span>
          <span class="equipment-meta-value">${safeText(item.manufacturer)}</span>
        </div>

        <div class="equipment-meta-item">
          <span class="equipment-meta-label">시리얼번호</span>
          <span class="equipment-meta-value">${safeText(item.serial_no)}</span>
        </div>

        <div class="equipment-meta-item">
          <span class="equipment-meta-label">현재 위치</span>
          <span class="equipment-meta-value">${safeText(item.location)}</span>
        </div>
      </div>

      <div class="equipment-card-actions">
        <button class="btn btn-primary card-action-btn" onclick="goToDetail('${encodeURIComponent(item.equipment_id)}')">상세보기</button>
      </div>
    </article>
  `).join('');

  updateSummary(items);
}

function getListViewType() {
  const params = new URLSearchParams(window.location.search);
  return params.get('view') || 'default';
}

function applyListViewContext() {
  const view = getListViewType();

  const titleEl = qs('#listPageTitle');
  const descEl = qs('#listPageDesc');
  const chipEl = qs('#listContextChip');

  if (!titleEl || !descEl || !chipEl) return view;

  const viewMap = {
    all: {
      title: '전체 장비 목록',
      desc: '등록된 전체 장비를 조건에 맞게 검색할 수 있습니다.',
      chip: '빠른 진입 · 전체 장비'
    },
    history: {
      title: '장비 이력 확인',
      desc: '수리, 점검, 관리 이력을 확인할 장비를 검색하세요.',
      chip: '빠른 진입 · 이력 확인'
    },
    label: {
      title: '라벨 출력 대상 조회',
      desc: '라벨 출력이 필요한 장비를 검색하고 선택할 수 있습니다.',
      chip: '빠른 진입 · 라벨 출력'
    },
    default: {
      title: '장비 목록',
      desc: '장비번호, 장비명, 모델명, 의원, 팀, 상태 기준으로 빠르게 검색할 수 있습니다.',
      chip: ''
    }
  };

  const config = viewMap[view] || viewMap.default;

  titleEl.textContent = config.title;
  descEl.textContent = config.desc;

  if (config.chip) {
    chipEl.textContent = config.chip;
    chipEl.classList.remove('is-hidden');
  } else {
    chipEl.textContent = '';
    chipEl.classList.add('is-hidden');
  }

  return view;
}

async function initListOrgFilters() {
  await OrgService.bindClinicTeam(qs('#clinic_code'), qs('#team_code'), {
    clinicEmptyLabel: '전체 의원',
    teamEmptyLabel: '전체 팀'
  });
}

async function loadEquipments() {
  clearMessage();

  const params = {
    keyword: qs('#keyword').value.trim(),
    clinic_code: qs('#clinic_code').value,
    team_code: qs('#team_code').value,
    status: getSelectedStatus(),
    manufacturer: qs('#manufacturer').value.trim()
  };

  const searchBtn = qs('#searchBtn');

  try {
    toggleResultsUI(true);
    renderEquipmentListSkeleton();
    showGlobalLoading('장비를 조회하는 중...');    
    setLoading(searchBtn, true, '조회 중...');

    const result = await apiGet('listEquipments', params);
    renderEquipmentCards(result.data || []);
  } catch (error) {
    showMessage(error.message, 'error');
    renderResultEmptyState(
      '조회 중 오류가 발생했습니다.',
      '잠시 후 다시 시도해 주세요.'
    );
  } finally {
    setLoading(searchBtn, false, '조회');
    hideGlobalLoading();
  }
}

function resetSearchForm() {
  qs('#keyword').value = '';
  qs('#clinic_code').value = '';

  qs('#team_code').innerHTML = '<option value="">전체 팀</option>';
  qs('#team_code').disabled = true;
  qs('#manufacturer').value = '';

  setActiveFilterChip('');

  renderInitialEmptyState(
    '검색 조건이 초기화되었습니다.',
    '조건을 다시 입력한 뒤 조회 버튼을 눌러 주세요.'
  );
}

function getSelectedStatus() {
  const activeChip = document.querySelector('.filter-chip.active');
  return activeChip ? (activeChip.dataset.status || '') : '';
}

function setActiveFilterChip(statusValue) {
  qsa('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.status === statusValue);
  });
}

function bindFilterChips() {
  qsa('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const statusValue = chip.dataset.status || '';
      setActiveFilterChip(statusValue);
      loadEquipments();
    });
  });
}

function bindEnterSearch() {
  ['#keyword', '#clinic_code', '#team_code', '#manufacturer'].forEach(selector => {
    const el = qs(selector);
    if (!el) return;

    el.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        loadEquipments();
      }
    });
  });
}
