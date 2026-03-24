let CURRENT_EQUIPMENT_PERMISSION = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  const ok = await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
  if (!ok) return;

  CURRENT_EQUIPMENT_PERMISSION = await window.appPermission.getPermission('equipment');

  bindLabelEvents();
  loadLabelData();
});

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

function buildEquipmentDetailUrl(equipmentId) {
  return `${CONFIG.SITE_BASE_URL}/equipment-detail.html?id=${encodeURIComponent(equipmentId)}`;
}

function renderLabelQr(equipmentId) {
  const qrArea = qs('#labelQr');
  const caption = qs('#labelQrCaption');
  if (!qrArea || !caption) return;

  const qrValue = buildEquipmentDetailUrl(equipmentId);
  qrArea.innerHTML = '';
  caption.textContent = qrValue;

  new QRCode(qrArea, {
    text: qrValue,
    width: 128,
    height: 128
  });
}

async function loadLabelData() {
  clearMessage();
  showGlobalLoading();

  const equipmentId = getQueryParam('equipment_id');

  if (!equipmentId) {
    showMessage('equipment_id가 없습니다.', 'error');
    hideGlobalLoading();
    return;
  }

  const backBtn = qs('#backToDetailBtn');
  if (backBtn) {
    backBtn.href = `equipment-detail.html?id=${encodeURIComponent(equipmentId)}`;
  }

  try {
    const result = await apiGet('getEquipment', { id: equipmentId });
    const item = result.data || {};

    qs('#labelEquipmentName').textContent = item.equipment_name || '-';
    qs('#labelEquipmentId').textContent = item.equipment_id || '-';
    qs('#labelModelName').textContent = item.model_name || '-';
    qs('#labelDepartment').textContent = item.department || '-';
    qs('#labelLocation').textContent = item.location || '-';
    qs('#labelStatus').textContent = statusLabel(item.status || '');

    renderLabelQr(item.equipment_id || equipmentId);
  } catch (error) {
    showMessage(error.message || '라벨 정보를 불러오지 못했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

function bindLabelEvents() {
  qs('#printBtn')?.addEventListener('click', () => {
    window.print();
  });
}
