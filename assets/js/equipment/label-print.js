
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

  const user = window.auth?.getSession?.() || {};

  try {
    const result = await apiGet('getEquipment', {
      id: equipmentId,
      request_user_email: user.email || ''
    });
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

document.addEventListener('DOMContentLoaded', async () => {
  showGlobalLoading('라벨 출력 화면을 준비하는 중...');

  try {
    const user = window.auth.requireAuth();
    if (!user) return;

    const ok = await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
    if (!ok) return;

    qs('#printBtn').addEventListener('click', () => window.print());
    await loadLabelData();
  } catch (error) {
    showMessage(error.message || '화면을 불러오는 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});
