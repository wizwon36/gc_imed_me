let currentEquipmentId = '';
let isEditMode = false;
let currentEquipment = null;
let orgBinder = null;

function normalizeText(value) {
  return String(value || '').trim();
}

function formatDateInputValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // 이미 yyyy-MM-dd 형태면 그대로 사용
  const directMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (directMatch) return raw;

  // yyyy-MM-dd HH:mm:ss / ISO 문자열 대응
  const datePartMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (datePartMatch) {
    return `${datePartMatch[1]}-${datePartMatch[2]}-${datePartMatch[3]}`;
  }

  // JS Date 파싱 fallback
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return '';
}

function getCurrentUserSafe() {
  return window.auth?.getSession?.() || {};
}

function setPageMode() {
  const titleEl = document.querySelector('.page-title');
  const descEl = document.querySelector('.page-desc');
  const submitBtn = qs('#submitBtn');

  if (isEditMode) {
    if (titleEl) titleEl.textContent = '장비 수정';
    if (descEl) descEl.textContent = '등록된 장비 정보를 수정합니다.';
    if (submitBtn) submitBtn.textContent = '수정 저장';
  } else {
    if (titleEl) titleEl.textContent = '장비 등록';
    if (descEl) descEl.textContent = '의료장비 정보를 등록합니다.';
    if (submitBtn) submitBtn.textContent = '저장';
  }
}

function getSelectedOrgCodes() {
  return {
    clinic_code: normalizeText(qs('#clinic_code')?.value),
    team_code: normalizeText(qs('#team_code')?.value)
  };
}

function updateDepartmentPreview() {
  const previewEl = qs('#department');
  if (!previewEl) return;

  const { clinic_code, team_code } = getSelectedOrgCodes();
  previewEl.value = window.orgSelect?.getOrgDisplayText?.(clinic_code, team_code) || '';
}

async function initializeOrgSelectors() {
  await window.orgSelect.loadOrgData();

  const clinicSelect = qs('#clinic_code');
  const teamSelect = qs('#team_code');

  window.orgSelect.fillSelectOptions(clinicSelect, window.orgSelect.getClinics(), {
    emptyText: '의원을 선택하세요'
  });

  orgBinder = window.orgSelect.bindClinicTeamSelects({
    clinicSelect,
    teamSelect,
    onTeamChanged: updateDepartmentPreview
  });
}

function fillEquipmentForm(item) {
  if (!item) return;

  qs('#equipment_name').value = item.equipment_name || '';
  qs('#model_name').value = item.model_name || '';
  qs('#manufacturer').value = item.manufacturer || '';
  qs('#manufacture_date').value = formatDateInputValue(item.manufacture_date);
  qs('#purchase_date').value = formatDateInputValue(item.purchase_date);
  qs('#serial_no').value = item.serial_no || '';
  qs('#vendor').value = item.vendor || '';
  qs('#manager_name').value = item.manager_name || '';
  qs('#manager_phone').value = item.manager_phone || '';
  qs('#acquisition_cost').value = item.acquisition_cost ?? '';
  qs('#maintenance_end_date').value = formatDateInputValue(item.maintenance_end_date)
  qs('#status').value = item.status || 'IN_USE';
  qs('#location').value = item.location || '';
  qs('#current_user').value = item.current_user || '';
  qs('#memo').value = item.memo || '';

  const clinicSelect = qs('#clinic_code');
  const teamSelect = qs('#team_code');

  if (clinicSelect) {
    clinicSelect.value = item.clinic_code || '';
  }

  if (orgBinder?.renderTeamsByClinic) {
    orgBinder.renderTeamsByClinic(item.clinic_code || '', item.team_code || '');
  } else if (teamSelect) {
    teamSelect.value = item.team_code || '';
  }

  updateDepartmentPreview();
}

async function loadEquipmentIfEditMode() {
  currentEquipmentId = getQueryParam('id');
  isEditMode = !!currentEquipmentId;
  setPageMode();

  if (!isEditMode) return;

  const user = getCurrentUserSafe();

  showGlobalLoading('장비 정보를 불러오는 중...');

  try {
    const result = await apiGet('getEquipment', {
      id: currentEquipmentId,
      request_user_email: user.email || user.user_email || ''
    });

    currentEquipment = result.data || {};
    fillEquipmentForm(currentEquipment);
  } catch (error) {
    showMessage(error.message || '장비 정보를 불러오지 못했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

function buildEquipmentPayload() {
  const currentUser = getCurrentUserSafe();
  const { clinic_code, team_code } = getSelectedOrgCodes();

  const payload = {
    equipment_name: normalizeText(qs('#equipment_name')?.value),
    model_name: normalizeText(qs('#model_name')?.value),

    clinic_code,
    team_code,

    manufacturer: normalizeText(qs('#manufacturer')?.value),
    manufacture_date: normalizeText(qs('#manufacture_date')?.value),
    purchase_date: normalizeText(qs('#purchase_date')?.value),
    serial_no: normalizeText(qs('#serial_no')?.value),
    vendor: normalizeText(qs('#vendor')?.value),
    manager_name: normalizeText(qs('#manager_name')?.value),
    manager_phone: normalizeText(qs('#manager_phone')?.value),
    acquisition_cost: normalizeText(qs('#acquisition_cost')?.value),
    maintenance_end_date: normalizeText(qs('#maintenance_end_date')?.value),
    status: normalizeText(qs('#status')?.value) || 'IN_USE',
    location: normalizeText(qs('#location')?.value),
    current_user: normalizeText(qs('#current_user')?.value),
    memo: normalizeText(qs('#memo')?.value),

    created_by: currentUser.email || currentUser.user_email || '',
    updated_by: currentUser.email || currentUser.user_email || ''
  };

  if (isEditMode) {
    payload.equipment_id = currentEquipmentId;
  }

  return payload;
}

function validateEquipmentForm(payload) {
  if (!payload.equipment_name) {
    showMessage('장비명을 입력하세요.', 'error');
    qs('#equipment_name')?.focus();
    return false;
  }

  if (!payload.model_name) {
    showMessage('모델명을 입력하세요.', 'error');
    qs('#model_name')?.focus();
    return false;
  }

  if (!payload.serial_no) {
    showMessage('시리얼번호를 입력하세요.', 'error');
    qs('#serial_no')?.focus();
    return false;
  }

  if (!payload.clinic_code) {
    showMessage('의원을 선택하세요.', 'error');
    qs('#clinic_code')?.focus();
    return false;
  }

  if (!payload.team_code) {
    showMessage('팀을 선택하세요.', 'error');
    qs('#team_code')?.focus();
    return false;
  }

  if (!payload.created_by && !payload.updated_by) {
    showMessage('로그인 사용자 정보가 없습니다.', 'error');
    return false;
  }

  return true;
}

async function handleSubmit(event) {
  event.preventDefault();
  clearMessage();

  const submitBtn = qs('#submitBtn');
  const payload = buildEquipmentPayload();

  if (!validateEquipmentForm(payload)) return;

  try {
    setLoading(submitBtn, true, isEditMode ? '수정 중...' : '저장 중...');
    showGlobalLoading(isEditMode ? '장비 정보를 수정하는 중...' : '장비를 등록하는 중...');

    if (isEditMode) {
      await apiPost('updateEquipment', payload);
      alert('장비 정보가 수정되었습니다.');
      location.href = `detail.html?id=${encodeURIComponent(payload.equipment_id)}`;
    } else {
      const result = await apiPost('createEquipment', payload);
      const equipmentId = result?.data?.equipment_id || '';
      alert('장비가 등록되었습니다.');

      if (equipmentId) {
        location.href = `detail.html?id=${encodeURIComponent(equipmentId)}`;
      } else {
        location.href = 'dashboard.html';
      }
    }
  } catch (error) {
    showMessage(error.message || '장비 저장 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
    setLoading(submitBtn, false);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  try {
    showGlobalLoading('화면을 준비하는 중...');
    await initializeOrgSelectors();
    await loadEquipmentIfEditMode();
    updateDepartmentPreview();

    document.querySelector('form')?.addEventListener('submit', handleSubmit);
  } catch (error) {
    showMessage(error.message || '초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});
