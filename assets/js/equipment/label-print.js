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
  return `${CONFIG.SITE_BASE_URL}/pages/equipment/detail.html?id=${encodeURIComponent(equipmentId)}`;
}

function renderLabelQr(equipmentId) {
  const qrArea = qs('#labelQr');
  const caption = qs('#labelQrCaption');

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
    return;
  }

  qs('#backToDetailBtn').href = `detail.html?id=${encodeURIComponent(equipmentId)}`;

  try {
    const result = await apiGet('getEquipment', { id: equipmentId });
    const item = result.data;

    qs('#labelEquipmentName').textContent = item.equipment_name || '-';
    qs('#labelEquipmentId').textContent = item.equipment_id || '-';
    qs('#labelModelName').textContent = item.model_name || '-';
    qs('#labelDepartment').textContent = item.department || '-';
    qs('#labelLocation').textContent = item.location || '-';
    qs('#labelStatus').textContent = statusLabel(item.status || '');

    renderLabelQr(item.equipment_id);
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    hideGlobalLoading();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  qs('#printBtn').addEventListener('click', () => window.print());
  loadLabelData();
});
