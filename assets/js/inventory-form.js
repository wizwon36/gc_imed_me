let CURRENT_EQUIPMENT_PERMISSION = null;
let currentEquipmentId = '';

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth.requireAuth();
  if (!user) return;

  const ok = await window.appPermission.requirePermission('equipment', ['edit', 'admin']);
  if (!ok) return;

  CURRENT_EQUIPMENT_PERMISSION = await window.appPermission.getPermission('equipment');

  initInventoryFormPage();
});

function getCurrentUser() {
  return window.auth?.getSession?.() || null;
}

function canEditEquipment() {
  return CURRENT_EQUIPMENT_PERMISSION === 'edit' || CURRENT_EQUIPMENT_PERMISSION === 'admin';
}

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

function applyInventoryPermission() {
  const form = qs('#inventoryForm');
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

    showMessage('재고조사 등록 권한이 없습니다.', 'error');
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
  qs('#checked_at').value = getNowDateTimeString();

  const user = getCurrentUser();
  if (user?.name) {
    qs('#checked_by').value = user.name;
  } else if (user?.email) {
    qs('#checked_by').value = user.email;
  }

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

function buildInventoryPayload() {
  return {
    equipment_id: qs('#equipment_id').value.trim(),
    checked_at: qs('#checked_at').value.trim(),
    checked_by: qs('#checked_by').value.trim(),
    department_at_check: qs('#department_at_check').value.trim(),
    location_at_check: qs('#location_at_check').value.trim(),
    condition_status: qs('#condition_status').value,
    qr_scan_yn: qs('#qr_scan_yn').value,
    memo: qs('#memo').value.trim()
  };
}

function validateInventoryPayload(payload) {
  if (!payload.equipment_id) {
    showMessage('장비번호가 없습니다.', 'error');
    return false;
  }

  if (!payload.checked_at) {
    showMessage('점검일시를 입력하세요.', 'error');
    qs('#checked_at').focus();
    return false;
  }

  if (!payload.checked_by) {
    showMessage('점검자를 입력하세요.', 'error');
    qs('#checked_by').focus();
    return false;
  }

  return true;
}

async function handleSubmitInventory(event) {
  event.preventDefault();
  clearMessage();

  if (!canEditEquipment()) {
    showMessage('재고조사 등록 권한이 없습니다.', 'error');
    return;
  }

  const submitBtn = qs('#submitBtn');
  const payload = buildInventoryPayload();

  if (!validateInventoryPayload(payload)) return;

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

function initInventoryFormPage() {
  qs('#inventoryForm')?.addEventListener('submit', handleSubmitInventory);
  applyInventoryPermission();
  loadEquipmentInfo();
}
