let currentEquipmentId = '';
let currentEquipment = null;

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

async function initInventoryOrgSelectors(item = {}) {
  await OrgService.bindClinicTeam(
    qs('#clinic_code_at_check'),
    qs('#team_code_at_check'),
    {
      initialClinicCode: item.clinic_code_at_check || item.clinic_code || '',
      initialTeamCode: item.team_code_at_check || item.team_code || '',
      clinicEmptyLabel: '의원을 선택하세요',
      teamEmptyLabel: '팀을 선택하세요'
    }
  );
}

async function loadEquipmentInfo() {
  const equipmentId = getQueryParam('equipment_id');
  currentEquipmentId = equipmentId;

  showGlobalLoading('장비 정보를 불러오는 중...');

  if (!equipmentId) {
    hideGlobalLoading();
    showMessage('equipment_id가 없습니다.', 'error');
    return;
  }

  qs('#backToDetailBtn').href = `detail.html?id=${encodeURIComponent(equipmentId)}`;
  qs('#checked_at').value = getNowDateTimeString();

  try {
    const result = await apiGet('getEquipment', { id: equipmentId });
    const item = result.data || {};
    currentEquipment = item;

    qs('#equipment_id').value = item.equipment_id || '';
    qs('#equipment_name').value = item.equipment_name || '';
    qs('#location_at_check').value = item.location || '';

    await initInventoryOrgSelectors(item);
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function buildInventoryPayload() {
  const clinicCode = qs('#clinic_code_at_check').value;
  const teamCode = qs('#team_code_at_check').value;
  const org = await OrgService.buildOrgPayload(clinicCode, teamCode);

  return {
    equipment_id: qs('#equipment_id').value.trim(),
    checked_at: qs('#checked_at').value.trim(),
    checked_by: qs('#checked_by').value.trim(),

    clinic_code_at_check: org.clinic_code,
    clinic_name_at_check: org.clinic_name,
    team_code_at_check: org.team_code,
    team_name_at_check: org.team_name,
    department_at_check: org.department,

    location_at_check: qs('#location_at_check').value.trim(),
    condition_status: qs('#condition_status').value,
    qr_scan_yn: qs('#qr_scan_yn').value,
    memo: qs('#memo').value.trim()
  };
}

function validateInventoryForm(payload) {
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

  if (!payload.clinic_code_at_check) {
    showMessage('점검 의원을 선택하세요.', 'error');
    qs('#clinic_code_at_check').focus();
    return false;
  }

  if (!payload.team_code_at_check) {
    showMessage('점검 팀을 선택하세요.', 'error');
    qs('#team_code_at_check').focus();
    return false;
  }

  return true;
}

async function handleSubmitInventory(event) {
  event.preventDefault();
  clearMessage();

  const submitBtn = qs('#submitBtn');
  const payload = await buildInventoryPayload();

  if (!validateInventoryForm(payload)) return;

  try {
    setLoading(submitBtn, true, '저장 중...');
    showGlobalLoading('재고조사 이력을 저장하는 중...');
    await apiPost('createInventoryLog', payload);
    alert('재고조사 이력이 등록되었습니다.');
    location.href = `detail.html?id=${encodeURIComponent(payload.equipment_id)}`;
  } catch (error) {
    hideGlobalLoading();
    showMessage(error.message, 'error');
  } finally {
    setLoading(submitBtn, false);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  showGlobalLoading('재고조사 화면을 준비하는 중...');

  try {
    const user = window.auth.requireAuth();
    if (!user) return;

    const ok = await window.appPermission.requirePermission('equipment', ['edit', 'admin']);
    if (!ok) return;

    qs('#inventoryForm').addEventListener('submit', handleSubmitInventory);
    await OrgService.preload();
    await loadEquipmentInfo();
  } catch (error) {
    showMessage(error.message || '재고조사 화면을 불러오는 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});
