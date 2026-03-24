async function handleSubmitEquipment(event) {
  event.preventDefault();
  clearMessage();

  const submitBtn = qs('#submitBtn');

  const payload = {
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
    memo: qs('#memo').value.trim(),
    created_by: 'admin@hospital.com'
  };

  if (!payload.equipment_name) {
    showMessage('장비명을 입력하세요.', 'error');
    qs('#equipment_name').focus();
    return;
  }

  if (!payload.model_name) {
    showMessage('모델명을 입력하세요.', 'error');
    qs('#model_name').focus();
    return;
  }

  if (!payload.serial_no) {
    showMessage('시리얼번호를 입력하세요.', 'error');
    qs('#serial_no').focus();
    return;
  }

  try {
    setLoading(submitBtn, true, '저장 중...');
    const result = await apiPost('createEquipment', payload);

    showMessage(`${result.message} (${result.data.equipment_id})`, 'success');

    setTimeout(() => {
      goToDetail(result.data.equipment_id);
    }, 500);
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setLoading(submitBtn, false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  qs('#equipmentForm').addEventListener('submit', handleSubmitEquipment);
});
