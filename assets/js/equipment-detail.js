let CURRENT_EQUIPMENT_PERMISSION = null;
let currentEquipmentId = '';
let currentEquipmentData = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth.requireAuth();
  if (!user) return;

  const ok = await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
  if (!ok) return;

  CURRENT_EQUIPMENT_PERMISSION = await window.appPermission.getPermission('equipment');

  bindDetailEvents();
  applyDetailPermission();
  loadEquipmentDetail();
});

function getCurrentUser() {
  return window.auth?.getSession?.() || null;
}

function canEditEquipment() {
  return CURRENT_EQUIPMENT_PERMISSION === 'edit' || CURRENT_EQUIPMENT_PERMISSION === 'admin';
}

function isAdminEquipment() {
  return CURRENT_EQUIPMENT_PERMISSION === 'admin';
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

function buildEquipmentDetailUrl(equipmentId) {
  return `${CONFIG.SITE_BASE_URL}/equipment-detail.html?id=${encodeURIComponent(equipmentId)}`;
}

function safeValue(value) {
  return escapeHtml(value || '-');
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  return formatNumber(value);
}

function applyDetailPermission() {
  const editBtn = qs('#editEquipmentBtn');
  const deleteBtn = qs('#deleteBtn');
  const addHistoryBtn = qs('#addHistoryBtn');
  const addInventoryBtn = qs('#addInventoryBtn');
  const printLabelBtn = qs('#printLabelBtn');

  if (editBtn) editBtn.classList.toggle('is-hidden', !canEditEquipment());
  if (addHistoryBtn) addHistoryBtn.classList.toggle('is-hidden', !canEditEquipment());
  if (addInventoryBtn) addInventoryBtn.classList.toggle('is-hidden', !canEditEquipment());

  if (deleteBtn) {
    deleteBtn.classList.toggle('is-hidden', !isAdminEquipment());
  }

  if (printLabelBtn) {
    printLabelBtn.classList.remove('is-hidden');
  }
}

function renderDetailSkeleton() {
  qs('#detailInfoGrid').innerHTML = ``;
  qs('#qrBox').innerHTML = ``;
  qs('#qrText').innerHTML = ``;
  qs('#historyArea').innerHTML = ``;
  qs('#inventoryArea').innerHTML = ``;
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
    <div class="detail-field">
      <div class="detail-field__label">${escapeHtml(field.label)}</div>
      <div class="detail-field__value">${field.isHtml ? field.value : nl2br(field.value)}</div>
    </div>
  `).join('');
}

function renderHistories(items) {
  const area = qs('#historyArea');
  qs('#historyCountText').textContent = `${formatNumber(items.length)}건`;

  if (!items.length) {
    area.innerHTML = `<div class="empty-state">등록된 이력이 없습니다.</div>`;
    return;
  }

  area.innerHTML = items.map(item => `
    <article class="history-card">
      <div class="history-card__title">${escapeHtml(historyTypeLabel(item.history_type))}</div>
      <div class="history-card__meta">${safeValue(item.work_date)}</div>
      <div class="history-card__meta">${escapeHtml(resultStatusLabel(item.result_status))}</div>
      <div class="history-card__meta">처리업체 ${safeValue(item.vendor_name)}</div>
      <div class="history-card__meta">수리금액 ${safeNumber(item.amount)}</div>
      <div class="history-card__desc">${nl2br(item.description || '-')}</div>
    </article>
  `).join('');
}

function renderInventoryLogs(items) {
  const area = qs('#inventoryArea');
  qs('#inventoryCountText').textContent = `${formatNumber(items.length)}건`;

  if (!items.length) {
    area.innerHTML = `<div class="empty-state">등록된 재고조사 이력이 없습니다.</div>`;
    return;
  }

  area.innerHTML = items.map(item => `
    <article class="history-card">
      <div class="history-card__title">${escapeHtml(conditionStatusLabel(item.condition_status))}</div>
      <div class="history-card__meta">${safeValue(item.checked_at)}</div>
      <div class="history-card__meta">${safeValue(item.checked_by)}</div>
      <div class="history-card__meta">부서 ${safeValue(item.department_at_check)}</div>
      <div class="history-card__meta">위치 ${safeValue(item.location_at_check)}</div>
      <div class="history-card__desc">${nl2br(item.memo || '-')}</div>
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
    hideGlobalLoading();
    return;
  }

  try {
    const [detailResult, historyResult, inventoryResult] = await Promise.all([
      apiGet('getEquipment', { id }),
      apiGet('listHistories', { equipment_id: id }),
      apiGet('listInventoryLogs', { equipment_id: id })
    ]);

    currentEquipmentData = detailResult.data;

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

  if (!isAdminEquipment()) {
    showMessage('삭제 권한이 없습니다.', 'error');
    return;
  }

  const confirmed = confirm('이 장비를 삭제하시겠습니까?');
  if (!confirmed) return;

  try {
    const user = getCurrentUser();

    await apiPost('deleteEquipment', {
      equipment_id: currentEquipmentId,
      deleted_by: user?.email || ''
    });

    alert('삭제되었습니다.');
    location.href = 'equipment-list.html';
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function moveToEditForm() {
  if (!currentEquipmentId) return;

  if (!canEditEquipment()) {
    showMessage('수정 권한이 없습니다.', 'error');
    return;
  }

  location.href = `equipment-form.html?id=${encodeURIComponent(currentEquipmentId)}&mode=edit`;
}

function moveToHistoryForm() {
  if (!currentEquipmentId) return;

  if (!canEditEquipment()) {
    showMessage('이력 등록 권한이 없습니다.', 'error');
    return;
  }

  location.href = `history-form.html?equipment_id=${encodeURIComponent(currentEquipmentId)}`;
}

function moveToInventoryForm() {
  if (!currentEquipmentId) return;

  if (!canEditEquipment()) {
    showMessage('재고조사 등록 권한이 없습니다.', 'error');
    return;
  }

  location.href = `inventory-form.html?equipment_id=${encodeURIComponent(currentEquipmentId)}`;
}

function moveToLabelPrint() {
  if (!currentEquipmentId) return;
  location.href = `label-print.html?equipment_id=${encodeURIComponent(currentEquipmentId)}`;
}

function bindDetailEvents() {
  qs('#editEquipmentBtn')?.addEventListener('click', moveToEditForm);
  qs('#deleteBtn')?.addEventListener('click', deleteCurrentEquipment);
  qs('#addHistoryBtn')?.addEventListener('click', moveToHistoryForm);
  qs('#addInventoryBtn')?.addEventListener('click', moveToInventoryForm);
  qs('#printLabelBtn')?.addEventListener('click', moveToLabelPrint);
}
