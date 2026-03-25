let currentEquipmentId = '';

async function loadEquipmentInfo() {
  const equipmentId = getQueryParam('equipment_id');
  currentEquipmentId = equipmentId;
  showGlobalLoading();

  if (!equipmentId) {
    showMessage('equipment_id가 없습니다.', 'error');
    return;
  }

  qs('#backToDetailBtn').href = `detail.html?id=${encodeURIComponent(equipmentId)}`;

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

async function handleSubmitHistory(event) {
  event.preventDefault();
  clearMessage();

  const submitBtn = qs('#submitBtn');

  const payload = {
    equipment_id: qs('#equipment_id').value.trim(),
    history_type: qs('#history_type').value,
    request_department: qs('#request_department').value.trim(),
    requester: qs('#requester').value.trim(),
    work_date: qs('#work_date').value,
    amount: qs('#amount').value,
    vendor_name: qs('#vendor_name').value.trim(),
    description: qs('#description').value.trim(),
    result_status: qs('#result_status').value,
    created_by: 'admin@hospital.com',
    update_equipment_status: qs('#update_equipment_status').value
  };

  if (!payload.equipment_id) {
    showMessage('장비번호가 없습니다.', 'error');
    return;
  }

  if (!payload.work_date) {
    showMessage('처리일자를 입력하세요.', 'error');
    qs('#work_date').focus();
    return;
  }

  if (!payload.description) {
    showMessage('처리내용을 입력하세요.', 'error');
    qs('#description').focus();
    return;
  }

  try {
    setLoading(submitBtn, true, '저장 중...');
    await apiPost('createHistory', payload);
    alert('이력이 등록되었습니다.');
    location.href = `detail.html?id=${encodeURIComponent(payload.equipment_id)}`;
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setLoading(submitBtn, false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  qs('#historyForm').addEventListener('submit', handleSubmitHistory);
  loadEquipmentInfo();
});
