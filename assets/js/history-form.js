let CURRENT_EQUIPMENT_PERMISSION = null;
let currentEquipmentId = '';

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth.requireAuth();
  if (!user) return;

  const ok = await window.appPermission.requirePermission('equipment', ['edit', 'admin']);
  if (!ok) return;

  CURRENT_EQUIPMENT_PERMISSION = await window.appPermission.getPermission('equipment');

  initHistoryFormPage();
});

function getCurrentUser() {
  return window.auth?.getSession?.() || null;
}

function canEditEquipment() {
  return CURRENT_EQUIPMENT_PERMISSION === 'edit' || CURRENT_EQUIPMENT_PERMISSION === 'admin';
}

function applyHistoryPermission() {
  const form = qs('#historyForm');
  const submitBtn = qs('#submitBtn');

  if (!form) return;

  if (!canEditEquipment()) {
    Array.from(form.elements).forEach(el => {
      if (el.id === 'submitBtn') return;
      el.disabled = true;
      if ('readOnly' in el) el.readOnly = true;
    });

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '권한 없음';
      submitBtn.title = '권한이 없습니다.';
    }

    showMessage('이력 등록 권한이 없습니다.', 'error');
  }
}

async function loadEquipmentInfo() {
  const equipmentId = getQueryParam('equipment_id');
  currentEquipmentId = equipmentId;

  showGlobalLoading();

  if (!equipmentId) {
    showMessage('equipment_id가 없습니다.', 'error');
    hideGlobalLoading();
    return;
  }

  qs('#backToDetailBtn').href = `equipment-detail.html?id=${encodeURIComponent(equipmentId)}`;

  try {
    const result = await apiGet('getEquipment', { id: equipmentId });
    const item = result.data;

    qs('#equipment_id').value = item.equipment_id || '';
    qs('#equipment_name').value = item.equipment_name || '';
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    hideGlobalLoading();
  }
}

function buildHistoryPayload() {
  const user = getCurrentUser();

  return {
    equipment_id: qs('#equipment_id').value.trim(),
    history_type: qs('#history_type').value,
    request_department: qs('#request_department').value.trim(),
    requester: qs('#requester').value.trim(),
    work_date: qs('#work_date').value,
    amount: qs('#amount').value,
    vendor_name: qs('#vendor_name').value.trim(),
    description: qs('#description').value.trim(),
    result_status: qs('#result_status').value,
    created_by: user?.email || '',
    update_equipment_status: qs('#update_equipment_status').value
  };
}

function validateHistoryPayload(payload) {
  if (!payload.equipment_id) {
    showMessage('장비번호가 없습니다.', 'error');
    return false;
  }

  if (!payload.work_date) {
    showMessage('처리일자를 입력하세요.', 'error');
    qs('#work_date').focus();
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

  if (!canEditEquipment()) {
    showMessage('이력 등록 권한이 없습니다.', 'error');
    return;
  }

  const submitBtn = qs('#submitBtn');
  const payload = buildHistoryPayload();

  if (!validateHistoryPayload(payload)) return;

  try {
    setLoading(submitBtn, true, '저장 중...');
    await apiPost('createHistory', payload);
    alert('이력이 등록되었습니다.');
    location.href = `equipment-detail.html?id=${encodeURIComponent(payload.equipment_id)}`;
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setLoading(submitBtn, false);
  }
}

function initHistoryFormPage() {
  qs('#historyForm')?.addEventListener('submit', handleSubmitHistory);
  applyHistoryPermission();
  loadEquipmentInfo();
}
