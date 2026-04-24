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
  var qrSize = 84; // 90x48: box 94px - padding 10px

  if (!qrArea) return;

  if (sizeClass === 'size-70x40') qrSize = 64; // box 72px - padding 8px
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

    if (!isEquipmentClinicAllowed(user)) {
      showMessage('현재 의료장비 관리는 서울숲의원만 사용 가능합니다. 다른 의원은 순차적으로 오픈될 예정입니다.', 'error');
      return;
    }

    var ok = await window.appPermission.requirePermission('equipment', ['view', 'edit', 'admin']);
    if (!ok) return;

    var sizeSelect = qs('#labelSizeSelect');
    var printBtn = qs('#printBtn');
    var equipmentId  = getQueryParam('equipment_id');
    var equipmentIds = getQueryParam('equipment_ids'); // 일괄 출력
    var sizeParam    = getQueryParam('size');

    // 일괄 출력 모드
    if (equipmentIds) {
      var ids = equipmentIds.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      if (sizeParam && sizeSelect) sizeSelect.value = sizeParam;
      var sizeClass = sizeSelect ? sizeSelect.value : 'size-90x48';
      await loadBulkLabelData(ids, sizeClass, user);

      if (sizeSelect) {
        sizeSelect.addEventListener('change', function() {
          loadBulkLabelData(ids, sizeSelect.value, user);
        });
      }
      if (printBtn) printBtn.addEventListener('click', function() { window.print(); });
      return;
    }

    // 단건 출력 모드 (기존)
    if (sizeSelect) {
      sizeSelect.addEventListener('change', function () {
        if (equipmentId) refreshLabelPreview(equipmentId);
      });
    }
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
    await loadLabelData();

  } catch (error) {
    showMessage(error.message || '화면을 불러오는 중 오류가 발생했습니다.', 'error');
  } finally {
    await hideGlobalLoading();
  }
});

// 일괄 라벨 로딩
async function loadBulkLabelData(ids, sizeClass, user) {
  var previewWrap = qs('#labelPreviewWrap') || qs('.label-preview-section');
  var userEmail = user.email || user.user_email || '';

  // 단건 미리보기 영역 숨김
  var singlePreview = qs('#labelPreviewWrap');
  if (singlePreview) singlePreview.style.display = 'none';

  // 일괄 컨테이너 생성 또는 재활용
  var bulkWrap = document.getElementById('bulkLabelWrap');
  if (!bulkWrap) {
    bulkWrap = document.createElement('div');
    bulkWrap.id = 'bulkLabelWrap';
    bulkWrap.className = 'bulk-label-wrap';
    var mainContent = qs('.label-print-main') || qs('.page-shell') || document.body;
    mainContent.appendChild(bulkWrap);
  }
  bulkWrap.innerHTML = '<div class="empty-box">라벨을 불러오는 중...</div>';

  try {
    showGlobalLoading('라벨 정보를 불러오는 중...');
    var items = [];
    for (var i = 0; i < ids.length; i++) {
      var result = await apiGet('getEquipment', { id: ids[i], request_user_email: userEmail });
      if (result && result.data) items.push(result.data);
    }

    if (!items.length) {
      bulkWrap.innerHTML = '<div class="empty-box">불러올 장비 정보가 없습니다.</div>';
      return;
    }

    var labelsHtml = items.map(function(item) {
      return buildLabelHtml(item, sizeClass);
    }).join('');

    bulkWrap.innerHTML = '<div class="bulk-label-grid">' + labelsHtml + '</div>';

    // QR 코드 생성
    items.forEach(function(item) {
      var qrEl = document.getElementById('qrBulk-' + item.equipment_id);
      if (qrEl && item.qr_value) {
        var qrSize = sizeClass === 'size-70x40' ? 64 : 84;
        new QRCode(qrEl, { text: item.qr_value, width: qrSize, height: qrSize });
      }
    });

    // 건수 표시
    var pageTitle = qs('.page-title');
    if (pageTitle) pageTitle.textContent = 'QR 포함 장비 라벨 (' + items.length + '건)';

  } catch (err) {
    bulkWrap.innerHTML = '<div class="empty-box">' + (err.message || '오류가 발생했습니다.') + '</div>';
  } finally {
    hideGlobalLoading();
  }
}

// 라벨 HTML 빌더 (일괄용)
function buildLabelHtml(item, sizeClass) {
  return (
    '<div class="device-label ' + sizeClass + ' bulk-label-item">' +
      '<div class="label-content-panel">' +
        '<div class="label-hospital">녹십자아이메드 의료장비 관리시스템</div>' +
        '<h2 class="label-title">' + escapeHtml(item.equipment_name || '-') + '</h2>' +
        '<div class="label-info-block">' +
          '<div class="label-row label-row-emphasis">' +
            '<div class="label-key">관리번호</div>' +
            '<div class="label-value label-value-id">' + escapeHtml(item.equipment_id || '-') + '</div>' +
          '</div>' +
          '<div class="label-row">' +
            '<div class="label-key">모델명</div>' +
            '<div class="label-value">' + escapeHtml(item.model_name || '-') + '</div>' +
          '</div>' +
          '<div class="label-row">' +
            '<div class="label-key">사용부서</div>' +
            '<div class="label-value">' + escapeHtml(item.department || '-') + '</div>' +
          '</div>' +
          (sizeClass !== 'size-70x40' ? (
          '<div class="label-row">' +
            '<div class="label-key">위치</div>' +
            '<div class="label-value">' + escapeHtml(item.location || '-') + '</div>' +
          '</div>') : '') +
        '</div>' +
      '</div>' +
      '<div class="qr-panel">' +
        '<div class="label-qr-box" id="qrBulk-' + escapeHtml(item.equipment_id || '') + '"></div>' +
      '</div>' +
    '</div>'
  );
}
