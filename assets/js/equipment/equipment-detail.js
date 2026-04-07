let currentEquipmentId = '';
let currentEquipmentData = null;
let detailPermission = {
  canView: false,
  canEdit: false,
  canDelete: false
};

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

    const permission = String(result?.data?.permission || '').trim().toLowerCase();

    return {
      canView: ['view', 'edit', 'admin'].includes(permission),
      canEdit: ['edit', 'admin'].includes(permission),
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
    return `${yyyy}-${mm}-${dd}`;
  }

  return raw;
}

function formatDisplayDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]} ${isoMatch[2]}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mi = String(parsed.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
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
  } catch (error) {
    // ignore
  }
}

function applyActionVisibility() {
  const editBtn = qs('#editEquipmentBtn');
  const deleteBtn = qs('#deleteBtn');
  const addHistoryBtn = qs('#addHistoryBtn');
  const addInventoryBtn = qs('#addInventoryBtn');
  const printLabelBtn = qs('#printLabelBtn');

  const isDeleted = String(currentEquipmentData?.deleted_yn || 'N').trim().toUpperCase() === 'Y';

  if (editBtn) editBtn.style.display = detailPermission.canEdit && !isDeleted ? '' : 'none';
  if (deleteBtn) deleteBtn.style.display = detailPermission.canDelete ? '' : 'none';
  if (addHistoryBtn) addHistoryBtn.style.display = detailPermission.canEdit && !isDeleted ? '' : 'none';
  if (addInventoryBtn) addInventoryBtn.style.display = detailPermission.canEdit && !isDeleted ? '' : 'none';
  if (printLabelBtn) printLabelBtn.style.display = detailPermission.canView ? '' : 'none';
}

function buildEquipmentDetailUrl(equipmentId) {
  return `${CONFIG.SITE_BASE_URL}/pages/equipment/detail.html?id=${encodeURIComponent(equipmentId)}`;
}

function renderDetailSkeleton() {
  const detailInfoGrid = qs('#detailInfoGrid');
  const qrBox = qs('#qrBox');
  const qrText = qs('#qrText');

  if (detailInfoGrid) {
    detailInfoGrid.innerHTML = `
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card info-tile-wide"></div>
    `;
  }

  if (qrBox) {
    qrBox.innerHTML = `<div class="skeleton" style="width:180px;height:180px;border-radius:18px;"></div>`;
  }

  if (qrText) {
    qrText.innerHTML = `<div class="skeleton skeleton-text" style="height:36px;"></div>`;
  }
}

function renderSectionLoading(areaSelector, countSelector) {
  const area = qs(areaSelector);
  const countEl = qs(countSelector);

  if (countEl) countEl.textContent = '불러오는 중...';

  if (area) {
    area.innerHTML = `
      <div class="empty-box">
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;min-height:96px;">
          <div class="global-loading__spinner" aria-hidden="true"></div>
          <span>불러오는 중...</span>
        </div>
      </div>
    `;
  }
}

function renderSectionError(areaSelector, countSelector, message) {
  const area = qs(areaSelector);
  const countEl = qs(countSelector);

  if (countEl) countEl.textContent = '로드 실패';
  if (area) {
    area.innerHTML = `<div class="empty-box">${escapeHtml(message || '불러오기에 실패했습니다.')}</div>`;
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
    badge.className = `status-badge ${statusClass(item.status)}`;
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
    qrBox.innerHTML = `
      <div class="qr-fallback-link">
        QR 라이브러리를 불러오지 못했습니다.<br />
        아래 링크로 접근하세요.<br /><br />
        ${escapeHtml(qrValue)}
      </div>
    `;
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
    { label: '취득가액', value: safeNumber(item.acquisition_cost), isHtml: true },
    { label: '유지보수 종료일', value: formatDisplayDate(item.maintenance_end_date) },
    { label: '현재 상태', value: statusLabel(item.status) },
    { label: '현재 위치', value: item.location },
    { label: '현재 사용자', value: item.current_user },
    { label: '등록일시', value: formatDisplayDateTime(item.created_at) },
    { label: '수정일시', value: formatDisplayDateTime(item.updated_at) },
    { label: '비고', value: item.memo || '-' }
  ];

  detailInfoGrid.innerHTML = fields.map(function(field) {
    return `
      <div class="info-tile ${field.label === '비고' ? 'info-tile-wide' : ''}">
        <div class="info-tile-label">${escapeHtml(field.label)}</div>
        <div class="info-tile-value">${field.isHtml ? field.value : nl2br(field.value)}</div>
      </div>
    `;
  }).join('');
}

function renderHistories(items) {
  const area = qs('#historyArea');
  const countText = qs('#historyCountText');
  const list = Array.isArray(items) ? items : [];

  if (countText) countText.textContent = `${formatNumber(list.length)}건`;

  if (!area) return;

  if (!list.length) {
    area.innerHTML = `<div class="empty-box">등록된 이력이 없습니다.</div>`;
    return;
  }

  area.innerHTML = list.map(function(item) {
    return `
      <article class="timeline-card">
        <div class="timeline-card-head">
          <div>
            <div class="timeline-title">${escapeHtml(historyTypeLabel(item.history_type))}</div>
            <div class="timeline-date">${safeValue(formatDisplayDate(item.work_date))}</div>
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
          <div class="timeline-meta-item">
            <span class="timeline-meta-label">다음 조치일</span>
            <span class="timeline-meta-value">${safeValue(formatDisplayDate(item.next_action_date))}</span>
          </div>
        </div>

        <div class="timeline-desc">${nl2br(item.description || '-')}</div>
      </article>
    `;
  }).join('');
}

function renderInventoryLogs(items) {
  const area = qs('#inventoryArea');
  const countText = qs('#inventoryCountText');
  const list = Array.isArray(items) ? items : [];

  if (countText) countText.textContent = `${formatNumber(list.length)}건`;

  if (!area) return;

  if (!list.length) {
    area.innerHTML = `<div class="empty-box">등록된 재고조사 이력이 없습니다.</div>`;
    return;
  }

  area.innerHTML = list.map(function(item) {
    return `
      <article class="timeline-card">
        <div class="timeline-card-head">
          <div>
            <div class="timeline-title">${escapeHtml(conditionStatusLabel(item.condition_status))}</div>
            <div class="timeline-date">${safeValue(formatDisplayDate(item.checked_at))}</div>
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
    `;
  }).join('');
}

async function loadHistorySection(equipmentId, userEmail) {
  renderSectionLoading('#historyArea', '#historyCountText');

  try {
    const result = await apiGet('listHistories', {
      equipment_id: equipmentId,
      request_user_email: userEmail || ''
    });

    renderHistories(result?.data || []);
  } catch (error) {
    renderSectionError('#historyArea', '#historyCountText', error.message || '이력 정보를 불러오지 못했습니다.');
  }
}

async function loadInventorySection(equipmentId, userEmail) {
  renderSectionLoading('#inventoryArea', '#inventoryCountText');

  try {
    const result = await apiGet('listInventoryLogs', {
      equipment_id: equipmentId,
      request_user_email: userEmail || ''
    });

    renderInventoryLogs(result?.data || []);
  } catch (error) {
    renderSectionError('#inventoryArea', '#inventoryCountText', error.message || '재고조사 정보를 불러오지 못했습니다.');
  }
}

async function loadEquipmentDetail() {
  clearMessage();
  renderDetailSkeleton();
  renderSectionLoading('#historyArea', '#historyCountText');
  renderSectionLoading('#inventoryArea', '#inventoryCountText');

  const id = getQueryParam('id');
  currentEquipmentId = id;

  if (!id) {
    throw new Error('장비 ID가 없습니다.');
  }

  const user = getCurrentUser();

  const detailResult = await apiGet('getEquipment', {
    id,
    request_user_email: user?.email || ''
  });

  currentEquipmentData = detailResult.data || {};

  renderHero(currentEquipmentData);
  renderDetailInfo(currentEquipmentData);
  renderQrCode(currentEquipmentData.equipment_id);
  applyActionVisibility();

  loadHistorySection(id, user?.email || '');
  loadInventorySection(id, user?.email || '');
}

async function deleteCurrentEquipment() {
  if (!currentEquipmentId) return;
  if (!detailPermission.canDelete) {
    showMessage('삭제 권한이 없습니다.', 'error');
    return;
  }

  const user = getCurrentUser();
  const confirmed = confirm('이 장비를 삭제하시겠습니까?');
  if (!confirmed) return;

  try {
    showGlobalLoading('장비를 삭제하는 중...');
    await apiPost('deleteEquipment', {
      equipment_id: currentEquipmentId,
      request_user_email: user?.email || '',
      deleted_by: user?.email || ''
    });

    invalidateDashboardSessionCacheSafe();
    alert('삭제되었습니다.');
    location.href = 'list.html';
  } catch (error) {
    showMessage(error.message || '장비 삭제 중 오류가 발생했습니다.', 'error');
  } finally {
    if (typeof hideGlobalLoading === 'function') {
      hideGlobalLoading();
    }
  }
}

function moveToEditForm() {
  if (!currentEquipmentId || !detailPermission.canEdit) return;
  location.href = `form.html?id=${encodeURIComponent(currentEquipmentId)}&mode=edit`;
}

function moveToHistoryForm() {
  if (!currentEquipmentId || !detailPermission.canEdit) return;
  location.href = `history-form.html?equipment_id=${encodeURIComponent(currentEquipmentId)}`;
}

function moveToInventoryForm() {
  if (!currentEquipmentId || !detailPermission.canEdit) return;
  location.href = `inventory-form.html?equipment_id=${encodeURIComponent(currentEquipmentId)}`;
}

function moveToLabelPrint() {
  if (!currentEquipmentId || !detailPermission.canView) return;
  location.href = `label-print.html?equipment_id=${encodeURIComponent(currentEquipmentId)}`;
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    if (typeof showGlobalLoading === 'function') {
      showGlobalLoading('장비 기본정보를 불러오는 중...');
    }

    const user = window.auth?.requireAuth?.();
    if (!user) return;

    detailPermission = await getEquipmentPermissionContext();
    if (!detailPermission.canView) {
      throw new Error('장비 메뉴 접근 권한이 없습니다.');
    }

    const editBtn = qs('#editEquipmentBtn');
    const deleteBtn = qs('#deleteBtn');
    const addHistoryBtn = qs('#addHistoryBtn');
    const addInventoryBtn = qs('#addInventoryBtn');
    const printLabelBtn = qs('#printLabelBtn');

    if (editBtn) editBtn.addEventListener('click', moveToEditForm);
    if (deleteBtn) deleteBtn.addEventListener('click', deleteCurrentEquipment);
    if (addHistoryBtn) addHistoryBtn.addEventListener('click', moveToHistoryForm);
    if (addInventoryBtn) addInventoryBtn.addEventListener('click', moveToInventoryForm);
    if (printLabelBtn) printLabelBtn.addEventListener('click', moveToLabelPrint);

    await loadEquipmentDetail();
  } catch (error) {
    showMessage(error.message || '화면을 불러오는 중 오류가 발생했습니다.', 'error');
  } finally {
    if (typeof hideGlobalLoading === 'function') {
      hideGlobalLoading();
    }
  }
});
