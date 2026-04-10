let currentEquipmentId = '';
let currentEquipmentData = null;
let detailPermission = { canView: false, canEdit: false, canDelete: false };

function getCurrentUser() {
  if (window.auth && typeof window.auth.getSession === 'function') {
    return window.auth.getSession() || null;
  }
  return null;
}

async function getEquipmentPermissionContext() {
  const user = getCurrentUser();
  if (!user || !user.email) {
    return { canView: false, canEdit: false, canDelete: false };
  }

  const role = String(user.role || '').trim().toLowerCase();
  if (role === 'admin') {
    return { canView: true, canEdit: true, canDelete: true };
  }

  try {
    const result = await apiGet('getUserAppPermission', {
      user_email: user.email,
      app_id: 'equipment',
      request_user_email: user.email
    });

    const permission = String((result && result.data && result.data.permission) || '')
      .trim()
      .toLowerCase();

    return {
      canView: ['view', 'edit', 'admin'].indexOf(permission) > -1,
      canEdit: ['edit', 'admin'].indexOf(permission) > -1,
      canDelete: false
    };
  } catch (error) {
    return { canView: false, canEdit: false, canDelete: false };
  }
}

function safeValue(value) {
  return escapeHtml(value || '-');
}

function formatDisplayDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const dateOnlyMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (dateOnlyMatch) return dateOnlyMatch[1];

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  return raw;
}

function formatDisplayDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (isoMatch) {
    return isoMatch[1] + ' ' + isoMatch[2];
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mi = String(parsed.getMinutes()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + mi;
  }

  return raw;
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  return formatNumber(value);
}

function invalidateDashboardSessionCacheSafe() {
  try {
    sessionStorage.removeItem('gc_imed_dashboard_v1');
  } catch (error) {}
}

function applyActionVisibility() {
  const editBtn = qs('#editEquipmentBtn');
  const deleteBtn = qs('#deleteBtn');
  const addHistoryBtn = qs('#addHistoryBtn');
  const addInventoryBtn = qs('#addInventoryBtn');
  const printLabelBtn = qs('#printLabelBtn');

  const isDeleted =
    String((currentEquipmentData && currentEquipmentData.deleted_yn) || 'N')
      .trim()
      .toUpperCase() === 'Y';

  if (editBtn) editBtn.style.display = detailPermission.canEdit && !isDeleted ? '' : 'none';
  if (deleteBtn) deleteBtn.style.display = detailPermission.canDelete ? '' : 'none';
  if (addHistoryBtn) addHistoryBtn.style.display = detailPermission.canEdit && !isDeleted ? '' : 'none';
  if (addInventoryBtn) addInventoryBtn.style.display = detailPermission.canEdit && !isDeleted ? '' : 'none';
  if (printLabelBtn) printLabelBtn.style.display = detailPermission.canView ? '' : 'none';
}

function buildEquipmentDetailUrl(equipmentId) {
  return CONFIG.SITE_BASE_URL + '/pages/equipment/detail.html?id=' + encodeURIComponent(equipmentId);
}

function renderDetailSkeleton() {
  const detailInfoGrid = qs('#detailInfoGrid');
  const qrBox = qs('#qrBox');
  const qrText = qs('#qrText');
  const photoImg = qs('#detailPhotoImage');
  const photoEmpty = qs('#detailPhotoEmpty');

  if (detailInfoGrid) {
    detailInfoGrid.innerHTML = '';
  }

  if (qrBox) {
    qrBox.innerHTML = '';
  }

  if (qrText) {
    qrText.innerHTML = '';
  }

  if (photoImg) {
    photoImg.src = '';
    photoImg.classList.add('is-hidden');
  }

  if (photoEmpty) {
    photoEmpty.classList.remove('is-hidden');
    photoEmpty.textContent = '불러오는 중...';
  }
}

function renderSectionLoading(areaSelector, countSelector) {
  const area = qs(areaSelector);
  const countEl = qs(countSelector);

  if (countEl) countEl.textContent = '불러오는 중...';
  if (area) {
    area.innerHTML = '<div class="empty-box">불러오는 중...</div>';
  }
}

function renderSectionError(areaSelector, countSelector, message) {
  const area = qs(areaSelector);
  const countEl = qs(countSelector);

  if (countEl) countEl.textContent = '로드 실패';
  if (area) {
    area.innerHTML =
      '<div class="empty-box">' +
      escapeHtml(message || '불러오기에 실패했습니다.') +
      '</div>';
  }
}

function renderHero(item) {
  const heroEquipmentName = qs('#heroEquipmentName');
  const heroEquipmentId = qs('#heroEquipmentId');
  const badge = qs('#heroStatusBadge');

  if (heroEquipmentName) heroEquipmentName.textContent = item.equipment_name || '장비명';
  if (heroEquipmentId) heroEquipmentId.textContent = item.equipment_id || '-';

  if (badge) {
    badge.textContent = statusLabel(item.status);
    badge.className = 'status-badge ' + statusClass(item.status);
  }
}

function renderPhoto(item) {
  const imgEl = qs('#detailPhotoImage');
  const emptyEl = qs('#detailPhotoEmpty');

  if (!imgEl || !emptyEl) return;

  const inlineUrl = String((item && item.photo_inline_url) || '').trim();
  const directUrl = String((item && item.photo_url) || '').trim();
  const finalUrl = inlineUrl || directUrl;

  imgEl.onerror = function() {
    imgEl.src = '';
    imgEl.classList.add('is-hidden');
    emptyEl.classList.remove('is-hidden');
    emptyEl.textContent = '사진을 불러오지 못했습니다. 네트워크 또는 파일 접근 경로를 확인하세요.';
  };

  imgEl.onload = function() {
    emptyEl.classList.add('is-hidden');
  };

  if (finalUrl) {
    imgEl.src = finalUrl;
    imgEl.classList.remove('is-hidden');
    emptyEl.classList.add('is-hidden');
    emptyEl.textContent = '등록된 사진이 없습니다.';
  } else {
    imgEl.src = '';
    imgEl.classList.add('is-hidden');
    emptyEl.classList.remove('is-hidden');
    emptyEl.textContent = '등록된 사진이 없습니다.';
  }
}

function renderQrCode(equipmentId) {
  const qrBox = qs('#qrBox');
  const qrText = qs('#qrText');

  if (!qrBox || !qrText) return;

  const qrValue = buildEquipmentDetailUrl(equipmentId);
  qrBox.innerHTML = '';
  qrText.textContent = 'QR 스캔 시 장비 상세 페이지로 이동';
  qrText.title = qrValue;

  if (typeof QRCode === 'function') {
    new QRCode(qrBox, {
      text: qrValue,
      width: 180,
      height: 180
    });
  } else {
    qrBox.innerHTML =
      'QR 라이브러리를 불러오지 못했습니다.<br>아래 링크로 접근하세요.<br>' +
      escapeHtml(qrValue);
  }
}

function renderDetailInfo(item) {
  const detailInfoGrid = qs('#detailInfoGrid');
  if (!detailInfoGrid) return;

  const fields = [
    { label: '장비번호', value: item.equipment_id },
    { label: '장비명', value: item.equipment_name },
    { label: '모델명', value: item.model_name },
    { label: '사용부서', value: item.department },
    { label: '제조사', value: item.manufacturer },
    { label: '제조일자', value: formatDisplayDate(item.manufacture_date) },
    { label: '취득일자', value: formatDisplayDate(item.purchase_date) },
    { label: '시리얼번호', value: item.serial_no },
    { label: '구매처', value: item.vendor },
    { label: '담당자', value: item.manager_name },
    { label: '연락처', value: item.manager_phone },
    { label: '취득가액', value: safeNumber(item.acquisition_cost) },
    { label: '유지보수 종료일', value: formatDisplayDate(item.maintenance_end_date) },
    { label: '현재 상태', value: statusLabel(item.status) },
    { label: '현재 위치', value: item.location },
    { label: '현재 사용자', value: item.current_user },
    { label: '등록일시', value: formatDisplayDateTime(item.created_at) },
    { label: '수정일시', value: formatDisplayDateTime(item.updated_at) },
    { label: '비고', value: item.memo || '-' }
  ];

  detailInfoGrid.innerHTML = fields
    .map(function(field) {
      return (
        '<div class="info-tile">' +
          '<div class="info-tile-label">' + escapeHtml(field.label) + '</div>' +
          '<div class="info-tile-value">' + nl2br(field.value) + '</div>' +
        '</div>'
      );
    })
    .join('');
}

function buildHistoryActionButtons(item) {
  if (!detailPermission.canEdit) return '';

  const buttons = [];
  const historyId = item.history_id || '';
  const equipmentId = item.equipment_id || currentEquipmentId || '';

  buttons.push(
    '<button type="button" class="btn btn-light btn-sm js-edit-history" data-history-id="' +
      escapeHtml(historyId) +
      '">수정</button>'
  );

  if (String(item.history_type || '') === 'REPAIR' && String(item.result_status || '') === 'IN_PROGRESS') {
    buttons.push(
      '<button type="button" class="btn btn-primary btn-sm js-complete-history" data-history-id="' +
        escapeHtml(historyId) +
        '" data-equipment-id="' +
        escapeHtml(equipmentId) +
        '">완료 처리</button>'
    );
  }

  return '<div class="timeline-actions">' + buttons.join('') + '</div>';
}

function renderHistories(items) {
  const area = qs('#historyArea');
  const countText = qs('#historyCountText');
  const list = Array.isArray(items) ? items : [];

  if (countText) countText.textContent = formatNumber(list.length) + '건';
  if (!area) return;

  if (!list.length) {
    area.innerHTML = '<div class="empty-box">등록된 이력이 없습니다.</div>';
    return;
  }

  area.innerHTML = list.map(function(item) {
    return (
      '<div class="timeline-card">' +
        '<div class="timeline-card-head">' +
          '<div>' +
            '<div class="timeline-title">' + escapeHtml(historyTypeLabel(item.history_type)) + '</div>' +
            '<div class="timeline-date">' + safeValue(formatDisplayDate(item.work_date)) + '</div>' +
          '</div>' +
          '<div class="timeline-badge">' + escapeHtml(resultStatusLabel(item.result_status)) + '</div>' +
        '</div>' +
        '<div class="timeline-meta">' +
          '<div class="timeline-meta-item"><span class="timeline-meta-label">처리업체</span><span class="timeline-meta-value">' + safeValue(item.vendor_name) + '</span></div>' +
          '<div class="timeline-meta-item"><span class="timeline-meta-label">수리금액</span><span class="timeline-meta-value">' + safeNumber(item.amount) + '</span></div>' +
          '<div class="timeline-meta-item"><span class="timeline-meta-label">다음 조치일</span><span class="timeline-meta-value">' + safeValue(formatDisplayDate(item.next_action_date)) + '</span></div>' +
          '<div class="timeline-meta-item"><span class="timeline-meta-label">요청부서</span><span class="timeline-meta-value">' + safeValue(item.request_department) + '</span></div>' +
        '</div>' +
        '<div class="timeline-desc">' + nl2br(item.description || '-') + '</div>' +
        buildHistoryActionButtons(item) +
      '</div>'
    );
  }).join('');

  bindHistoryActionButtons();
}

function renderInventoryLogs(items) {
  const area = qs('#inventoryArea');
  const countText = qs('#inventoryCountText');
  const list = Array.isArray(items) ? items : [];

  if (countText) countText.textContent = formatNumber(list.length) + '건';
  if (!area) return;

  if (!list.length) {
    area.innerHTML = '<div class="empty-box">등록된 재고조사 이력이 없습니다.</div>';
    return;
  }

  area.innerHTML = list.map(function(item) {
    return (
      '<div class="timeline-card">' +
        '<div class="timeline-card-head">' +
          '<div>' +
            '<div class="timeline-title">' + escapeHtml(conditionStatusLabel(item.condition_status)) + '</div>' +
            '<div class="timeline-date">' +
              safeValue(formatDisplayDate(item.checked_at)) +
              ' · ' +
              safeValue(item.checked_by_name || item.checked_by) +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="timeline-meta">' +
          '<div class="timeline-meta-item"><span class="timeline-meta-label">부서</span><span class="timeline-meta-value">' + safeValue(item.department_at_check) + '</span></div>' +
          '<div class="timeline-meta-item"><span class="timeline-meta-label">위치</span><span class="timeline-meta-value">' + safeValue(item.location_at_check) + '</span></div>' +
        '</div>' +
        '<div class="timeline-desc">' + nl2br(item.memo || '-') + '</div>' +
      '</div>'
    );
  }).join('');
}

async function loadHistorySection(equipmentId, userEmail) {
  try {
    renderSectionLoading('#historyArea', '#historyCountText');

    const result = await apiGet('listHistories', {
      equipment_id: equipmentId,
      request_user_email: userEmail
    });

    renderHistories((result && result.data) || []);
  } catch (error) {
    renderSectionError('#historyArea', '#historyCountText', error.message || '이력 정보를 불러오지 못했습니다.');
  }
}

async function loadInventorySection(equipmentId, userEmail) {
  try {
    renderSectionLoading('#inventoryArea', '#inventoryCountText');

    const result = await apiGet('listInventoryLogs', {
      equipment_id: equipmentId,
      request_user_email: userEmail
    });

    renderInventoryLogs((result && result.data) || []);
  } catch (error) {
    renderSectionError('#inventoryArea', '#inventoryCountText', error.message || '재고조사 이력을 불러오지 못했습니다.');
  }
}

async function loadEquipmentCore(equipmentId, userEmail, options) {
  const opts = options || {};
  const shouldResetSkeleton = opts.resetSkeleton === true;

  if (shouldResetSkeleton) {
    renderDetailSkeleton();
  }

  const detailResult = await apiGet('getEquipment', {
    id: equipmentId,
    request_user_email: userEmail
  });

  currentEquipmentData = detailResult.data || {};

  renderHero(currentEquipmentData);
  renderPhoto(currentEquipmentData);
  renderDetailInfo(currentEquipmentData);
  renderQrCode(currentEquipmentData.equipment_id);
  applyActionVisibility();

  return currentEquipmentData;
}

async function reloadDetailSectionsOnly() {
  const user = getCurrentUser();
  const userEmail = (user && user.email) || '';
  if (!currentEquipmentId || !userEmail) return;

  await Promise.all([
    loadHistorySection(currentEquipmentId, userEmail),
    loadInventorySection(currentEquipmentId, userEmail)
  ]);
}

async function loadEquipmentDetail(options) {
  const opts = options || {};
  const forceReset = opts.forceReset === true;

  clearMessage();

  if (forceReset) {
    renderDetailSkeleton();
  }

  renderSectionLoading('#historyArea', '#historyCountText');
  renderSectionLoading('#inventoryArea', '#inventoryCountText');

  const id = getQueryParam('id') || currentEquipmentId;
  currentEquipmentId = id;

  if (!id) {
    throw new Error('장비 ID가 없습니다.');
  }

  const user = getCurrentUser();
  const userEmail = (user && user.email) || '';

  await loadEquipmentCore(id, userEmail, {
    resetSkeleton: forceReset
  });

  await Promise.all([
    loadHistorySection(id, userEmail),
    loadInventorySection(id, userEmail)
  ]);
}

function bindHistoryActionButtons() {
  document.querySelectorAll('.js-edit-history').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const historyId = this.getAttribute('data-history-id');
      if (!historyId) return;
      location.href =
        'history-form.html?equipment_id=' +
        encodeURIComponent(currentEquipmentId) +
        '&history_id=' +
        encodeURIComponent(historyId);
    });
  });

  document.querySelectorAll('.js-complete-history').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const historyId = this.getAttribute('data-history-id');
      const equipmentId = this.getAttribute('data-equipment-id') || currentEquipmentId;
      if (!historyId || !equipmentId) return;
      completeRepairHistory(historyId, equipmentId);
    });
  });
}

async function completeRepairHistory(historyId, equipmentId) {
  if (!detailPermission.canEdit) return;

  const confirmed = confirm('이 수리 이력을 완료 처리하시겠습니까? 장비 상태도 사용중으로 변경됩니다.');
  if (!confirmed) return;

  const user = getCurrentUser();
  const userEmail = (user && user.email) || '';

  try {
    showGlobalLoading('수리 이력을 완료 처리하는 중...');
    await apiPost('updateHistory', {
      history_id: historyId,
      equipment_id: equipmentId,
      result_status: 'COMPLETED',
      update_equipment_status: 'IN_USE',
      updated_by: userEmail
    });

    await loadEquipmentCore(currentEquipmentId, userEmail, { resetSkeleton: false });
    await reloadDetailSectionsOnly();
    invalidateDashboardSessionCacheSafe();
    alert('완료 처리되었습니다.');
  } catch (error) {
    showMessage(error.message || '완료 처리 중 오류가 발생했습니다.', 'error');
  } finally {
    if (typeof hideGlobalLoading === 'function') {
      hideGlobalLoading();
    }
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  const user = window.auth && typeof window.auth.requireAuth === 'function'
    ? window.auth.requireAuth()
    : null;

  if (!user) return;

  try {
    detailPermission = await getEquipmentPermissionContext();

    if (!detailPermission.canView) {
      showMessage('장비 정보를 조회할 권한이 없습니다.', 'error');
      applyActionVisibility();
      return;
    }

    await loadEquipmentDetail({ forceReset: true });

    const backBtn = qs('#backToListBtn');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        location.href = 'list.html';
      });
    }

    const editBtn = qs('#editEquipmentBtn');
    if (editBtn) {
      editBtn.addEventListener('click', function() {
        location.href = 'form.html?id=' + encodeURIComponent(currentEquipmentId);
      });
    }

    const addHistoryBtn = qs('#addHistoryBtn');
    if (addHistoryBtn) {
      addHistoryBtn.addEventListener('click', function() {
        location.href = 'history-form.html?equipment_id=' + encodeURIComponent(currentEquipmentId);
      });
    }

    const addInventoryBtn = qs('#addInventoryBtn');
    if (addInventoryBtn) {
      addInventoryBtn.addEventListener('click', function() {
        location.href = 'inventory-form.html?equipment_id=' + encodeURIComponent(currentEquipmentId);
      });
    }
  } catch (error) {
    showMessage(error.message || '상세 정보를 불러오지 못했습니다.', 'error');
  }
});
