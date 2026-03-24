let currentEquipmentId = '';

function getNowDateTimeString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

async function loadEquipmentInfo() {
  const equipmentId = getQueryParam('equipment_id');
  currentEquipmentId = equipmentId;
  showGlobalLoading();

  if (!equipmentId) {
    showMessage('equipment_id가 없습니다.', 'error');
    return;
  }

  qs('#backToDetailBtn').href = `equipment-detail.html?id=${encodeURIComponent(equipmentId)}`;
  qs('#checked_at').value = getNowDateTimeString();

  try {
    const result = await apiGet('getEquipment', { id: equipmentId });
    const item = result.data;

    qs('#equipment_id').value = item.equipment_id || '';
    qs('#equipment_name').value = item.equipment_name || '';
    qs('#department_at_check').value = item.department || '';
    qs('#location_at_check').value = item.location || '';
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function handleSubmitInventory(event) {
  event.preventDefault();
  clearMessage();

  const submitBtn = qs('#submitBtn');

  const payload = {
    equipment_id: qs('#equipment_id').value.trim(),
    checked_at: qs('#checked_at').value.trim(),
    checked_by: qs('#checked_by').value.trim(),
    department_at_check: qs('#department_at_check').value.trim(),
    location_at_check: qs('#location_at_check').value.trim(),
    condition_status: qs('#condition_status').value,
    qr_scan_yn: qs('#qr_scan_yn').value,
    memo: qs('#memo').value.trim()
  };

  if (!payload.equipment_id) {
    showMessage('장비번호가 없습니다.', 'error');
    return;
  }

  if (!payload.checked_at) {
    showMessage('점검일시를 입력하세요.', 'error');
    qs('#checked_at').focus();
    return;
  }

  if (!payload.checked_by) {
    showMessage('점검자를 입력하세요.', 'error');
    qs('#checked_by').focus();
    return;
  }

  try {
    setLoading(submitBtn, true, '저장 중...');
    await apiPost('createInventoryLog', payload);
    alert('재고조사 이력이 등록되었습니다.');
    location.href = `equipment-detail.html?id=${encodeURIComponent(payload.equipment_id)}`;
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setLoading(submitBtn, false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  qs('#inventoryForm').addEventListener('submit', handleSubmitInventory);
  loadEquipmentInfo();
});
