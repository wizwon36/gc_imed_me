let formMode = 'create';
let currentEquipmentId = '';

function fillEquipmentForm(item) {
  qs('#equipment_name').value = item.equipment_name || '';
  qs('#model_name').value = item.model_name || '';
  qs('#department').value = item.department || '';
  qs('#manufacturer').value = item.manufacturer || '';
  qs('#manufacture_date').value = item.manufacture_date || '';
  qs('#serial_no').value = item.serial_no || '';
  qs('#vendor').value = item.vendor || '';
  qs('#manager_name').value = item.manager_name || '';
  qs('#manager_phone').value = item.manager_phone || '';
  qs('#acquisition_cost').value = item.acquisition_cost || '';
  qs('#maintenance_end_date').value = item.maintenance_end_date || '';
  qs('#status').value = item.status || 'IN_USE';
  qs('#location').value = item.location || '';
  qs('#current_user').value = item.current_user || '';
  qs('#memo').value = item.memo || '';
}

function applyEditModeUi() {
  qs('#formTopline').textContent = '의료장비 수정';
  qs('#formTitle').textContent = '장비 기본정보 수정';
  qs('#formSubtext').textContent = '기존 장비 정보를 수정하고 다시 저장합니다.';
  qs('#submitBtn').textContent = '수정 저장';
}

async function loadEditDataIfNeeded() {
  const mode = getQueryParam('mode');
  const id = getQueryParam('id');
  showGlobalLoading();

  if (mode !== 'edit' || !id) {
    formMode = 'create';
    return;
  }

  formMode = 'edit';
  currentEquipmentId = id;
  applyEditModeUi();

  try {
    const result = await apiGet('getEquipment', { id });
    fillEquipmentForm(result.data);
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    hideGlobalLoading();
  }
}

function buildPayload() {
  return {
    equipment_name: qs('#equipment_name').value.trim(),
    model_name: qs('#model_name').value.trim(),
    department: qs('#department').value.trim(),
    manufacturer: qs('#manufacturer').value.trim(),
    manufacture_date: qs('#manufacture_date').value,
    serial_no: qs('#serial_no').value.trim(),
    vendor: qs('#vendor').value.trim(),
    manager_name: qs('#manager_name').value.trim(),
    manager_phone: qs('#manager_phone').value.trim(),
    acquisition_cost: qs('#acquisition_cost').value,
    maintenance_end_date: qs('#maintenance_end_date').value,
    status: qs('#status').value,
    location: qs('#location').value.trim(),
    current_user: qs('#current_user').value.trim(),
    memo: qs('#memo').value.trim()
  };
}

function validateEquipmentForm(payload) {
  if (!payload.equipment_name) {
    showMessage('장비명을 입력하세요.', 'error');
    qs('#equipment_name').focus();
    return false;
  }

  if (!payload.model_name) {
    showMessage('모델명을 입력하세요.', 'error');
    qs('#model_name').focus();
    return false;
  }

  if (!payload.serial_no) {
    showMessage('시리얼번호를 입력하세요.', 'error');
    qs('#serial_no').focus();
    return false;
  }

  return true;
}

async function handleCreate(payload) {
  const result = await apiPost('createEquipment', {
    ...payload,
    created_by: 'admin@hospital.com'
  });

  showMessage(`${result.message} (${result.data.equipment_id})`, 'success');

  setTimeout(() => {
    goToDetail(result.data.equipment_id);
  }, 500);
}

async function handleUpdate(payload) {
  await apiPost('updateEquipment', {
    equipment_id: currentEquipmentId,
    ...payload,
    updated_by: 'admin@hospital.com'
  });

  showMessage('장비 정보가 수정되었습니다.', 'success');

  setTimeout(() => {
    goToDetail(currentEquipmentId);
  }, 500);
}

async function handleSubmitEquipment(event) {
  event.preventDefault();
  clearMessage();

  const submitBtn = qs('#submitBtn');
  const payload = buildPayload();

  if (!validateEquipmentForm(payload)) return;

  try {
    setLoading(submitBtn, true, formMode === 'edit' ? '수정 중...' : '저장 중...');

    if (formMode === 'edit') {
      await handleUpdate(payload);
    } else {
      await handleCreate(payload);
    }
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setLoading(submitBtn, false);
    if (formMode === 'edit') {
      qs('#submitBtn').textContent = '수정 저장';
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  qs('#equipmentForm').addEventListener('submit', handleSubmitEquipment);
  await loadEditDataIfNeeded();
});
