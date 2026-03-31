let currentEquipmentId = '';
let currentEquipmentData = null;

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

function conditionStatusLabel(type) {
  const map = {
    NORMAL: '정상',
    NEED_REPAIR: '수리필요',
    LOCATION_MISMATCH: '위치불일치',
    MISSING: '분실의심',
    DISPOSAL_TARGET: '폐기대상'
  };
  return map[type] || type || '';
}

function getCurrentUser() {
  if (window.auth && typeof window.auth.getSession === 'function') {
    return window.auth.getSession() || null;
  }
  return null;
}

function isAdminUser() {
  const user = getCurrentUser();
  return String(user?.role || '').trim().toLowerCase() === 'admin';
}

function applyActionVisibility() {
  const deleteBtn = qs('#deleteBtn');
  if (deleteBtn) {
    deleteBtn.style.display = isAdminUser() ? '' : 'none';
  }

  const isDeleted = String(currentEquipmentData?.deleted_yn || 'N') === 'Y';

  const editBtn = qs('#editEquipmentBtn');
  const addHistoryBtn = qs('#addHistoryBtn');
  const addInventoryBtn = qs('#addInventoryBtn');

  if (isDeleted) {
    if (editBtn) editBtn.style.display = 'none';
    if (addHistoryBtn) addHistoryBtn.style.display = 'none';
    if (addInventoryBtn) addInventoryBtn.style.display = 'none';
  }
}

function buildEquipmentDetailUrl(equipmentId) {
  return `${CONFIG.SITE_BASE_URL}/pages/equipment/detail.html?id=${encodeURIComponent(equipmentId)}`;
}

function safeValue(value) {
  return escapeHtml(value || '-');
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  return formatNumber(value);
}

function renderDetailSkeleton() {
  qs('#detailInfoGrid').innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card info-tile-wide"></div>
  `;

  qs('#qrBox').innerHTML = `<div class="skeleton" style="width:180px;height:180px;border-radius:18px;"></div>`;
  qs('#qrText').innerHTML = `<div class="skeleton skeleton-text" style="height:36px;"></div>`;

  qs('#historyArea').innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
  `;

  qs('#inventoryArea').innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
  `;
}

function renderHero(item) {
  qs('#heroEquipmentName').textContent = item.equipment_name || '장비명';
  qs('#heroEquipmentId').textContent = item.equipment_id || '-';

  const badge = qs('#heroStatusBadge');
  badge.textContent = statusLabel(item.status);
  badge.className = `status-badge ${statusClass(item.status)}`;
}

function renderQrCode(equipmentId) {
  const qrBox = qs('#qrBox');
  const qrText = qs('#qrText');

  if (!qrBox || !qrText) return;

  const qrValue = buildEquipmentDetailUrl(equipmentId);

  qrBox.innerHTML = '';
  qrText.textContent = 'QR 스캔 시 장비 상세 페이지로 이동';
  qrText.title = qrValue;

  new QRCode(qrBox, {
    text: qrValue,
    width: 180,
    height: 180
  });
}

function renderDetailInfo(item) {
  const detailInfoGrid = qs('#detailInfoGrid');

  const fields = [
    { label: '장비번호', value: item.equipment_id },
    { label: '장비명', value: item.equipment_name },
    { label: '모델명', value: item.model_name },
    { label: '사용부서', value: item.department },
    { label: '제조사', value: item.manufacturer },
    { label: '제조일자', value: item.manufacture_date },
    { label: '시리얼번호', value: item.serial_no },
    { label: '구매처', value: item.vendor },
    { label: '담당자', value: item.manager_name },
    { label: '연락처', value: item.manager_phone },
    { label: '취득가액', value: safeNumber(item.acquisition_cost), isHtml: true },
    { label: '유지보수 종료일', value: item.maintenance_end_date },
    { label: '현재 상태', value: statusLabel(item.status) },
    { label: '현재 위치', value: item.location },
    { label: '현재 사용자', value: item.current_user },
    { label: '등록일시', value: item.created_at },
    { label: '수정일시', value: item.updated_at },
    { label: '비고', value: item.memo || '-' }
  ];

  detailInfoGrid.innerHTML = fields.map(field => `
    <div class="info-tile ${field.label === '비고' ? 'info-tile-wide' : ''}">
      <div class="info-tile-label">${escapeHtml(field.label)}</div>
      <div class="info-tile-value">${field.isHtml ? field.value : nl2br(field.value)}</div>
    </div>
  `).join('');
}

function renderHistories(items) {
  const area = qs('#historyArea');
  qs('#historyCountText').textContent = `${formatNumber(items.length)}건`;

  if (!items.length) {
    area.innerHTML = `<div class="empty-box">등록된 이력이 없습니다.</div>`;
    return;
  }

  area.innerHTML = items.map(item => `
    <article class="timeline-card">
      <div class="timeline-card-head">
        <div>
          <div class="timeline-title">${escapeHtml(historyTypeLabel(item.history_type))}</div>
          <div class="timeline-date">${safeValue(item.work_date)}</div>
        </div>
        <div class="timeline-badge">${escapeHtml(resultStatusLabel(item.result_status))}</div>
      </div>

      <div class="timeline-meta">
        <div class="timeline-meta-item">
          <span class="timeline-meta-label">처리업체</span>
          <span class="timeline-meta-value">${safeValue(item.vendor_name)}</span>
        </div>
        <div class="timeline-meta-item">
          <span class="timeline-meta-label">수리금액</span>
          <span class="timeline-meta-value">${safeNumber(item.amount)}</span>
        </div>
      </div>

      <div class="timeline-desc">${nl2br(item.description || '-')}</div>
    </article>
  `).join('');
}

function renderInventoryLogs(items) {
  const area = qs('#inventoryArea');
  qs('#inventoryCountText').textContent = `${formatNumber(items.length)}건`;

  if (!items.length) {
    area.innerHTML = `<div class="empty-box">등록된 재고조사 이력이 없습니다.</div>`;
    return;
  }

  area.innerHTML = items.map(item => `
    <article class="timeline-card">
      <div class="timeline-card-head">
        <div>
          <div class="timeline-title">${escapeHtml(conditionStatusLabel(item.condition_status))}</div>
          <div class="timeline-date">${safeValue(item.checked_at)}</div>
        </div>
        <div class="timeline-badge">${safeValue(item.checked_by)}</div>
      </div>

      <div class="timeline-meta">
        <div class="timeline-meta-item">
          <span class="timeline-meta-label">부서</span>
          <span class="timeline-meta-value">${safeValue(item.department_at_check)}</span>
        </div>
        <div class="timeline-meta-item">
          <span class="timeline-meta-label">위치</span>
          <span class="timeline-meta-value">${safeValue(item.location_at_check)}</span>
        </div>
      </div>

      <div class="timeline-desc">${nl2br(item.memo || '-')}</div>
    </article>
  `).join('');
}

async function loadEquipmentDetail() {
  clearMessage();
  renderDetailSkeleton();
  showGlobalLoading();

  const id = getQueryParam('id');
  currentEquipmentId = id;

  if (!id) {
    showMessage('장비 ID가 없습니다.', 'error');
    return;
  }

  const user = getCurrentUser();

  try {
    const [detailResult, historyResult, inventoryResult] = await Promise.all([
      apiGet('getEquipment', {
        id,
        request_user_email: user?.email || ''
      }),
      apiGet('listHistories', { equipment_id: id }),
      apiGet('listInventoryLogs', { equipment_id: id })
    ]);

    currentEquipmentData = detailResult.data;
    applyActionVisibility();
    renderHero(detailResult.data);
    renderDetailInfo(detailResult.data);
    renderQrCode(detailResult.data.equipment_id);
    renderHistories(historyResult.data || []);
    renderInventoryLogs(inventoryResult.data || []);
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function deleteCurrentEquipment() {
  if (!currentEquipmentId) return;

  const user = getCurrentUser();
  if (!isAdminUser()) {
    showMessage('관리자만 장비를 삭제할 수 있습니다.', 'error');
    return;
  }

  const confirmed = confirm('이 장비를 삭제하시겠습니까?');
  if (!confirmed) return;

  try {
    await apiPost('deleteEquipment', {
      equipment_id: currentEquipmentId,
      request_user_email: user?.email || '',
      deleted_by: user?.email || ''
    });

    alert('삭제되었습니다.');
    location.href = 'list.html';
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function moveToEditForm() {
  if (!currentEquipmentId) return;
  location.href = `form.html?id=${encodeURIComponent(currentEquipmentId)}&mode=edit`;
}

function moveToHistoryForm() {
  if (!currentEquipmentId) return;
  location.href = `history-form.html?equipment_id=${encodeURIComponent(currentEquipmentId)}`;
}

function moveToInventoryForm() {
  if (!currentEquipmentId) return;
  location.href = `inventory-form.html?equipment_id=${encodeURIComponent(currentEquipmentId)}`;
}

function moveToLabelPrint() {
  if (!currentEquipmentId) return;
  location.href = `label-print.html?equipment_id=${encodeURIComponent(currentEquipmentId)}`;
}

document.addEventListener('DOMContentLoaded', () => {
  applyActionVisibility();

  qs('#editEquipmentBtn').addEventListener('click', moveToEditForm);
  qs('#deleteBtn').addEventListener('click', deleteCurrentEquipment);
  qs('#addHistoryBtn').addEventListener('click', moveToHistoryForm);
  qs('#addInventoryBtn').addEventListener('click', moveToInventoryForm);
  qs('#printLabelBtn').addEventListener('click', moveToLabelPrint);

  loadEquipmentDetail();
});
