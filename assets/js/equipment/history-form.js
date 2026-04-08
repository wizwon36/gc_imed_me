let currentEquipmentId = '';
let currentEquipment = null;
let currentHistoryId = '';
let isEditMode = false;

function normalizeText(value) {
  return String(value || '').trim();
}

function getCurrentUserSafe() {
  if (window.auth && typeof window.auth.getSession === 'function') {
    return window.auth.getSession() || {};
  }
  return {};
}

function setPageMode() {
  const titleEl = document.querySelector('.page-title');
  const descEl = document.querySelector('.page-desc');
  const submitBtn = qs('#submitBtn');

  if (isEditMode) {
    if (titleEl) titleEl.textContent = '이력 수정';
    if (descEl) descEl.textContent = '등록된 수리 및 점검 이력을 수정합니다.';
    if (submitBtn) submitBtn.textContent = '수정 저장';
  } else {
    if (titleEl) titleEl.textContent = '이력 등록';
    if (descEl) descEl.textContent = '수리 및 점검 이력을 기록합니다.';
    if (submitBtn) submitBtn.textContent = '저장';
  }
}

async function loadEquipmentInfo() {
  const equipmentId = getQueryParam('equipment_id');
  currentEquipmentId = equipmentId;

  if (!equipmentId) {
    showMessage('equipment_id가 없습니다.', 'error');
    return;
  }

  if (qs('#backToDetailBtn')) {
    qs('#backToDetailBtn').href = 'detail.html?id=' + encodeURIComponent(equipmentId);
  }

  const user = getCurrentUserSafe();

  try {
    const result = await apiGet('getEquipment', {
      id: equipmentId,
      request_user_email: user.email || ''
    });

    const item = result.data || {};
    currentEquipment = item;

    qs('#equipment_id').value = item.equipment_id || '';
    qs('#equipment_name').value = item.equipment_name || '';
    qs('#request_department').value = item.department || '';
  } catch (error) {
    showMessage(error.message || '장비 정보를 불러오지 못했습니다.', 'error');
  }
}

function fillHistoryForm(item) {
  if (!item) return;

  qs('#history_type').value = item.history_type || '';
  qs('#request_department').value = item.request_department || (currentEquipment && currentEquipment.department) || '';
  qs('#requester').value = item.requester || '';
  qs('#work_date').value = item.work_date || '';
  qs('#amount').value = item.amount === null || item.amount === undefined ? '' : item.amount;
  qs('#vendor_name').value = item.vendor_name || '';
  qs('#description').value = item.description || '';
  qs('#result_status').value = item.result_status || '';
  qs('#update_equipment_status').value = '';
}

async function loadHistoryInfoIfEditMode() {
  currentHistoryId = getQueryParam('history_id');
  isEditMode = !!currentHistoryId;
  setPageMode();

  if (!isEditMode) return;

  const user = getCurrentUserSafe();

  try {
    showGlobalLoading('이력 정보를 불러오는 중...');
    const result = await apiGet('getHistory', {
      history_id: currentHistoryId,
      request_user_email: user.email || ''
    });

    fillHistoryForm(result.data || {});
  } catch (error) {
    showMessage(error.message || '이력 정보를 불러오지 못했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function buildHistoryPayload() {
  const currentUser = getCurrentUserSafe();
  const requestDepartment = qs('#request_department').value.trim();

  const payload = {
    equipment_id: qs('#equipment_id').value.trim(),
    history_type: qs('#history_type').value,

    request_clinic_code: normalizeText(currentEquipment && currentEquipment.clinic_code),
    request_clinic_name: normalizeText(currentEquipment && currentEquipment.clinic_name),

    // 서버 검증 유지 대응
    request_team_code: requestDepartment,
    request_team_name: requestDepartment,
    request_department: requestDepartment,

    requester: qs('#requester').value.trim(),
    work_date: qs('#work_date').value,
    amount: qs('#amount').value,
    vendor_name: qs('#vendor_name').value.trim(),
    description: qs('#description').value.trim(),
    result_status: qs('#result_status').value,
    updated_by: currentUser.email || currentUser.user_email || currentUser.name || 'system',
    created_by: currentUser.email || currentUser.user_email || currentUser.name || 'system',
    update_equipment_status: qs('#update_equipment_status').value
  };

  if (isEditMode) {
    payload.history_id = currentHistoryId;
  }

  return payload;
}

function validateHistoryForm(payload) {
  if (!payload.equipment_id) {
    showMessage('장비번호가 없습니다.', 'error');
    return false;
  }

  if (!payload.history_type) {
    showMessage('이력 유형을 선택하세요.', 'error');
    qs('#history_type').focus();
    return false;
  }

  if (!payload.work_date) {
    showMessage('처리일자를 입력하세요.', 'error');
    qs('#work_date').focus();
    return false;
  }

  if (!payload.request_department) {
    showMessage('장비 부서 정보가 없습니다.', 'error');
    return false;
  }

  if (!payload.description) {
    showMessage('처리내용을 입력하세요.', 'error');
    qs('#description').focus();
    return false;
  }

  return true;
}

async function handleSubmitHistory(event) {
  event.preventDefault();
  clearMessage();

  const submitBtn = qs('#submitBtn');
  const payload = await buildHistoryPayload();

  if (!validateHistoryForm(payload)) return;

  try {
    setLoading(submitBtn, true, isEditMode ? '수정 저장 중...' : '저장 중...');
    showGlobalLoading(isEditMode ? '이력을 수정하는 중...' : '이력을 저장하는 중...');

    if (isEditMode) {
      await apiPost('updateHistory', payload);
      alert('이력이 수정되었습니다.');
    } else {
      await apiPost('createHistory', payload);
      alert('이력이 등록되었습니다.');
    }

    location.href = 'detail.html?id=' + encodeURIComponent(payload.equipment_id);
  } catch (error) {
    showMessage(error.message || (isEditMode ? '이력 수정 중 오류가 발생했습니다.' : '이력 등록 중 오류가 발생했습니다.'), 'error');
  } finally {
    hideGlobalLoading();
    setLoading(submitBtn, false);
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  showGlobalLoading('이력 등록 화면을 준비하는 중...');

  try {
    const user = window.auth.requireAuth();
    if (!user) return;

    const ok = await window.appPermission.requirePermission('equipment', ['edit', 'admin']);
    if (!ok) return;

    qs('#historyForm').addEventListener('submit', handleSubmitHistory);

    await loadEquipmentInfo();
    await loadHistoryInfoIfEditMode();
  } catch (error) {
    showMessage(error.message || '이력 화면을 불러오는 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});
