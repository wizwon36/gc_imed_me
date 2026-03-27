let currentEquipmentId = '';
let currentEquipment = null;

async function initHistoryOrgSelectors(item = {}) {
  await OrgService.bindClinicTeam(
    qs('#request_clinic_code'),
    qs('#request_team_code'),
    {
      initialClinicCode: item.request_clinic_code || item.clinic_code || '',
      initialTeamCode: item.request_team_code || item.team_code || '',
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

  try {
    const result = await apiGet('getEquipment', { id: equipmentId });
    const item = result.data || {};
    currentEquipment = item;

    qs('#equipment_id').value = item.equipment_id || '';
    qs('#equipment_name').value = item.equipment_name || '';

    await initHistoryOrgSelectors(item);
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function buildHistoryPayload() {
  const clinicCode = qs('#request_clinic_code').value;
  const teamCode = qs('#request_team_code').value;
  const org = await OrgService.buildOrgPayload(clinicCode, teamCode);

  const currentUser = window.auth?.getSession?.() || {};

  return {
    equipment_id: qs('#equipment_id').value.trim(),
    history_type: qs('#history_type').value,

    request_clinic_code: org.clinic_code,
    request_clinic_name: org.clinic_name,
    request_team_code: org.team_code,
    request_team_name: org.team_name,
    request_department: org.department,

    requester: qs('#requester').value.trim(),
    work_date: qs('#work_date').value,
    amount: qs('#amount').value,
    vendor_name: qs('#vendor_name').value.trim(),
    description: qs('#description').value.trim(),
    result_status: qs('#result_status').value,
    created_by: currentUser.email || currentUser.user_email || currentUser.name || 'system',
    update_equipment_status: qs('#update_equipment_status').value
  };
}

function validateHistoryForm(payload) {
  if (!payload.equipment_id) {
    showMessage('장비번호가 없습니다.', 'error');
    return false;
  }

  if (!payload.work_date) {
    showMessage('처리일자를 입력하세요.', 'error');
    qs('#work_date').focus();
    return false;
  }

  if (!payload.request_clinic_code) {
    showMessage('요청 의원을 선택하세요.', 'error');
    qs('#request_clinic_code').focus();
    return false;
  }

  if (!payload.request_team_code) {
    showMessage('요청 팀을 선택하세요.', 'error');
    qs('#request_team_code').focus();
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
    setLoading(submitBtn, true, '저장 중...');
    showGlobalLoading('이력을 저장하는 중...');
    await apiPost('createHistory', payload);
    alert('이력이 등록되었습니다.');
    location.href = `detail.html?id=${encodeURIComponent(payload.equipment_id)}`;
  } catch (error) {
    hideGlobalLoading();
    showMessage(error.message, 'error');
  } finally {
    setLoading(submitBtn, false);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  showGlobalLoading('이력 등록 화면을 준비하는 중...');

  try {
    qs('#historyForm').addEventListener('submit', handleSubmitHistory);
    await OrgService.preload();
    await loadEquipmentInfo();
  } catch (error) {
    showMessage(error.message || '이력 등록 화면을 불러오는 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});
