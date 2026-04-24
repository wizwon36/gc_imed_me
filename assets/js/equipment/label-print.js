function buildEquipmentDetailUrl(equipmentId) {
  return CONFIG.SITE_BASE_URL + '/pages/equipment/public-detail.html?id=' + encodeURIComponent(equipmentId);
}

function getSelectedLabelSize() {
  var select = qs('#labelSizeSelect');
  return select ? select.value : 'size-90x48';
}

function applyLabelSize(sizeClass) {
  var label = qs('#deviceLabel');
  if (!label) return;

  label.classList.remove('size-90x48', 'size-70x40', 'size-50x30');
  label.classList.add(sizeClass);
}

function toggleRowsBySize(sizeClass) {
  var modelRow = qs('#labelRowModel');
  var deptRow = qs('#labelRowDepartment');
  var locationRow = qs('#labelRowLocation');

  if (!modelRow || !deptRow || !locationRow) return;

  modelRow.style.display = '';
  deptRow.style.display = '';
  locationRow.style.display = '';

  if (sizeClass === 'size-70x40') {
    locationRow.style.display = 'none';
  }

  if (sizeClass === 'size-50x30') {
    modelRow.style.display = 'none';
    deptRow.style.display = 'none';
    locationRow.style.display = 'none';
  }
}

function renderLabelQr(equipmentId) {
  var qrArea = qs('#labelQr');
  var qrValue = buildEquipmentDetailUrl(equipmentId);
  var sizeClass = getSelectedLabelSize();
  var qrSize = 86; // 90x48: box 98px - padding 12px

  if (!qrArea) return;

  if (sizeClass === 'size-70x40') qrSize = 66; // box 76px - padding 10px
  if (sizeClass === 'size-50x30') qrSize = 48;

  qrArea.innerHTML = '';

  new QRCode(qrArea, {
    text: qrValue,
    width: qrSize,
    height: qrSize
  });
}

function refreshLabelPreview(equipmentId) {
  var sizeClass = getSelectedLabelSize();
  applyLabelSize(sizeClass);
  toggleRowsBySize(sizeClass);
  renderLabelQr(equipmentId);
}

async function loadLabelData() {
  clearMessage();
  showGlobalLoading();

  var equipmentId = getQueryParam('equipment_id');

  if (!equipmentId) {
    showMessage('equipment_id가 없습니다.', 'error');
    await hideGlobalLoading();
    return;
  }

  var backBtn = qs('#backToDetailBtn');
  if (backBtn) {
    backBtn.href = 'detail.html?id=' + encodeURIComponent(equipmentId);
  }

  var mobileBackBtn = qs('#mobileBackBtn');
  if (mobileBackBtn) {
    mobileBackBtn.href = 'detail.html?id=' + encodeURIComponent(equipmentId);
  }

  var user = {};
  if (window.auth && typeof window.auth.getSession === 'function') {
    user = window.auth.getSession() || {};
  }

  try {
    var result = await apiGet('getEquipment', {
      id: equipmentId,
      request_user_email: user.email || ''
    });

    var item = result && result.data ? result.data : {};

    qs('#labelEquipmentName').textContent = item.equipment_name || '-';
    qs('#labelEquipmentId').textContent = item.equipment_id || '-';
    qs('#labelModelName').textContent = item.model_name || '-';
    qs('#labelDepartment').textContent = item.department || '-';
    qs('#labelLocation').textContent = item.location || '-';

    refreshLabelPreview(item.equipment_id || equipmentId);
  } catch (error) {
    showMessage(error.message || '라벨 정보를 불러오는 중 오류가 발생했습니다.', 'error');
  } finally {
    await hideGlobalLoading();
  }
}

document.addEventListener('DOMContentLoaded', async function () {
  showGlobalLoading('라벨 출력 화면을 준비하는 중...');

  try {
    var user = window.auth.requireAuth();
    if (!user) return;

    var ok = await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
    if (!ok) return;

    var sizeSelect = qs('#labelSizeSelect');
    var printBtn = qs('#printBtn');
    var equipmentId = getQueryParam('equipment_id');

    if (sizeSelect) {
      sizeSelect.addEventListener('change', function () {
        if (equipmentId) {
          refreshLabelPreview(equipmentId);
        }
      });
    }

    if (printBtn) {
      printBtn.addEventListener('click', function () {
        window.print();
      });
    }

    await loadLabelData();
  } catch (error) {
    showMessage(error.message || '화면을 불러오는 중 오류가 발생했습니다.', 'error');
  } finally {
    await hideGlobalLoading();
  }
});
