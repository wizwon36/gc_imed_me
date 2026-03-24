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
  list.innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
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
    list.innerHTML = `<div class="empty-box">조회 결과가 없습니다.</div>`;
    updateSummary([]);
    return;
  }

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
          <span class="equipment-meta-label">사용부서</span>
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

async function loadEquipments() {
  clearMessage();
  renderEquipmentListSkeleton();
  showGlobalLoading();
  
  const params = {
    keyword: qs('#keyword').value.trim(),
    department: qs('#department').value.trim(),
    status: qs('#status').value,
    manufacturer: qs('#manufacturer').value.trim()
  };

  const searchBtn = qs('#searchBtn');

  try {
    setLoading(searchBtn, true, '조회 중...');
    const result = await apiGet('listEquipments', params);
    renderEquipmentCards(result.data || []);
  } catch (error) {
    showMessage(error.message, 'error');
    renderEquipmentCards([]);
  } finally {
    setLoading(searchBtn, false, '조회');
    hideGlobalLoading();
  }
}

function resetSearchForm() {
  qs('#keyword').value = '';
  qs('#department').value = '';
  qs('#status').value = '';
  qs('#manufacturer').value = '';
  setActiveFilterChip('');
  loadEquipments();
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
      qs('#status').value = statusValue;
      setActiveFilterChip(statusValue);
      loadEquipments();
    });
  });
}

function bindEnterSearch() {
  ['#keyword', '#department', '#manufacturer'].forEach(selector => {
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

document.addEventListener('DOMContentLoaded', () => {
  qs('#searchBtn').addEventListener('click', loadEquipments);
  qs('#resetBtn').addEventListener('click', resetSearchForm);
  qs('#status').addEventListener('change', () => {
    setActiveFilterChip(qs('#status').value);
  });

  bindFilterChips();
  bindEnterSearch();
  setActiveFilterChip('');
  loadEquipments();
});
