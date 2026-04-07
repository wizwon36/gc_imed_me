const equipmentFormState = {
  mode: 'create',
  equipmentId: '',
  user: null,
  submitting: false,
  permission: {
    canView: false,
    canEdit: false
  }
};

function getEquipmentFormMode() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '';
  return {
    mode: id ? 'edit' : 'create',
    equipmentId: id
  };
}

function setFormTitle(mode) {
  const titleEl = qs('#pageTitle');
  const descEl = qs('#pageDesc');
  const submitTextEl = qs('#submitButtonText');

  if (mode === 'edit') {
    if (titleEl) titleEl.textContent = '장비 정보 수정';
    if (descEl) descEl.textContent = '기존 등록 장비 정보를 수정합니다.';
    if (submitTextEl) submitTextEl.textContent = '수정 저장';
  } else {
    if (titleEl) titleEl.textContent = '장비 등록';
    if (descEl) descEl.textContent = '신규 의료장비 정보를 등록합니다.';
    if (submitTextEl) submitTextEl.textContent = '장비 등록';
  }
}

function getFormValue(id) {
  const el = qs(`#${id}`);
  return el ? String(el.value || '').trim() : '';
}

function setFormValue(id, value) {
  const el = qs(`#${id}`);
  if (!el) return;
  el.value = value == null ? '' : value;
}

function setStatusOptions() {
  const statusEl = qs('#status');
  if (!statusEl) return;

  statusEl.innerHTML = `
    <option value="IN_USE">사용중</option>
    <option value="REPAIRING">수리중</option>
    <option value="INSPECTING">점검중</option>
    <option value="STORED">보관</option>
    <option value="DISPOSED">폐기</option>
  `;
}

async function getEquipmentPermissionContext() {
  const user = equipmentFormState.user;
  if (!user || !user.email) {
    return { canView: false, canEdit: false };
  }

  const role = String(user.role || '').trim().toLowerCase();
  if (role === 'admin') {
    return { canView: true, canEdit: true };
  }

  try {
    const result = await apiGet('getUserAppPermission', {
      user_email: user.email,
      app_id: 'equipment',
      request_user_email: user.email
    });

    const permission = String(result?.data?.permission || '').trim().toLowerCase();

    return {
      canView: ['view', 'edit', 'admin'].includes(permission),
      canEdit: ['edit', 'admin'].includes(permission)
    };
  } catch (error) {
    return { canView: false, canEdit: false };
  }
}

function updateDepartmentPreviewValue(value) {
  const departmentEl = qs('#department_preview');
  if (!departmentEl) return;
  departmentEl.value = value || '';
}

async function refreshDepartmentPreview() {
  const clinicCode = getFormValue('clinic_code');
  const teamCode = getFormValue('team_code');
  const departmentEl = qs('#department_preview');

  if (!window.OrgService || !departmentEl) return '';

  const department = await window.OrgService.updateDepartmentField(
    clinicCode,
    teamCode,
    departmentEl
  );

  return department;
}

function collectEquipmentPayload() {
  return {
    equipment_name: getFormValue('equipment_name'),
    model_name: getFormValue('model_name'),

    clinic_code: getFormValue('clinic_code'),
    clinic_name: '',
    team_code: getFormValue('team_code'),
    team_name: '',
    department: getFormValue('department_preview'),

    manufacturer: getFormValue('manufacturer'),
    manufacture_date: getFormValue('manufacture_date'),
    purchase_date: getFormValue('purchase_date'),
    serial_no: getFormValue('serial_no'),
    vendor: getFormValue('vendor'),
    manager_name: getFormValue('manager_name'),
    manager_phone: getFormValue('manager_phone'),
    acquisition_cost: getFormValue('acquisition_cost'),
    maintenance_end_date: getFormValue('maintenance_end_date'),
    status: getFormValue('status') || 'IN_USE',
    location: getFormValue('location'),
    current_user: getFormValue('current_user'),
    memo: getFormValue('memo')
  };
}

async function buildEquipmentSubmitPayload() {
  const raw = collectEquipmentPayload();

  let orgPayload = {
    clinic_code: raw.clinic_code || '',
    clinic_name: '',
    team_code: raw.team_code || '',
    team_name: '',
    department: raw.department || ''
  };

  if (window.OrgService && typeof window.OrgService.buildOrgPayload === 'function') {
    orgPayload = await window.OrgService.buildOrgPayload(raw.clinic_code, raw.team_code);
  }

  const payload = {
    ...raw,
    ...orgPayload
  };

  if (equipmentFormState.mode === 'edit') {
    payload.equipment_id = equipmentFormState.equipmentId;
    payload.updated_by = equipmentFormState.user.email || '';
  } else {
    payload.created_by = equipmentFormState.user.email || '';
  }

  return payload;
}

function validateEquipmentForm(payload) {
  if (!payload.equipment_name) throw new Error('장비명을 입력해 주세요.');
  if (!payload.model_name) throw new Error('모델명을 입력해 주세요.');
  if (!payload.serial_no) throw new Error('시리얼번호를 입력해 주세요.');
  if (!payload.clinic_code) throw new Error('의원을 선택해 주세요.');
  if (!payload.team_code) throw new Error('팀을 선택해 주세요.');

  if (payload.acquisition_cost && Number.isNaN(Number(payload.acquisition_cost))) {
    throw new Error('취득가액은 숫자로 입력해 주세요.');
  }
}

function fillEquipmentForm(data = {}) {
  setFormValue('equipment_name', data.equipment_name || '');
  setFormValue('model_name', data.model_name || '');
  setFormValue('manufacturer', data.manufacturer || '');
  setFormValue('manufacture_date', data.manufacture_date || '');
  setFormValue('purchase_date', data.purchase_date || '');
  setFormValue('serial_no', data.serial_no || '');
  setFormValue('vendor', data.vendor || '');
  setFormValue('manager_name', data.manager_name || '');
  setFormValue('manager_phone', data.manager_phone || '');
  setFormValue('acquisition_cost', data.acquisition_cost ?? '');
  setFormValue('maintenance_end_date', data.maintenance_end_date || '');
  setFormValue('status', data.status || 'IN_USE');
  setFormValue('location', data.location || '');
  setFormValue('current_user', data.current_user || '');
  setFormValue('memo', data.memo || '');
  updateDepartmentPreviewValue(data.department || '');
}

async function bindOrgSelectors(initialClinicCode, initialTeamCode, initialDepartment) {
  const clinicEl = qs('#clinic_code');
  const teamEl = qs('#team_code');
  const departmentEl = qs('#department_preview');

  if (!window.OrgService || !clinicEl || !teamEl) {
    updateDepartmentPreviewValue(initialDepartment || '');
    return;
  }

  await window.OrgService.bindClinicTeam(clinicEl, teamEl, {
    initialClinicCode: initialClinicCode || '',
    initialTeamCode: initialTeamCode || '',
    departmentEl: departmentEl
  });

  if (initialDepartment && !departmentEl.value) {
    departmentEl.value = initialDepartment;
  }
}

async function loadEquipmentDetailForEdit() {
  if (equipmentFormState.mode !== 'edit') return;

  const result = await apiGet('getEquipment', {
    id: equipmentFormState.equipmentId,
    request_user_email: equipmentFormState.user.email || ''
  });

  const data = result.data || {};

  await bindOrgSelectors(
    data.clinic_code || '',
    data.team_code || '',
    data.department || ''
  );

  fillEquipmentForm(data);
  await refreshDepartmentPreview();
}

function disableFormForNoPermission() {
  const formEl = qs('#equipmentForm');
  const submitBtn = qs('#submitButton');

  if (formEl) {
    Array.from(formEl.querySelectorAll('input, select, textarea, button')).forEach(function(el) {
      if (el.id !== 'submitButton') {
        el.disabled = true;
      }
    });
  }

  if (submitBtn) {
    submitBtn.style.display = 'none';
  }
}

async function initCreateFormDefaults() {
  await bindOrgSelectors(
    equipmentFormState.user?.clinic_code || '',
    equipmentFormState.user?.team_code || '',
    ''
  );

  setFormValue('status', 'IN_USE');
  setFormValue('manager_name', equipmentFormState.user?.name || '');
  setFormValue('manager_phone', equipmentFormState.user?.phone || '');
  await refreshDepartmentPreview();
}

async function initEquipmentFormPage() {
  equipmentFormState.user = window.auth?.requireAuth?.();
  if (!equipmentFormState.user) {
    throw new Error('로그인이 필요합니다.');
  }

  equipmentFormState.permission = await getEquipmentPermissionContext();

  if (!equipmentFormState.permission.canView) {
    throw new Error('장비 메뉴 접근 권한이 없습니다.');
  }

  if (!equipmentFormState.permission.canEdit) {
    disableFormForNoPermission();
    throw new Error('장비 등록/수정 권한이 없습니다.');
  }

  const { mode, equipmentId } = getEquipmentFormMode();
  equipmentFormState.mode = mode;
  equipmentFormState.equipmentId = equipmentId;

  setFormTitle(mode);
  setStatusOptions();

  if (mode === 'edit') {
    await loadEquipmentDetailForEdit();
  } else {
    await initCreateFormDefaults();
  }
}

async function handleEquipmentSubmit(event) {
  event.preventDefault();

  if (equipmentFormState.submitting) return;
  if (!equipmentFormState.permission.canEdit) {
    showMessage('저장 권한이 없습니다.', 'error');
    return;
  }

  clearMessage();

  try {
    equipmentFormState.submitting = true;
    showGlobalLoading(
      equipmentFormState.mode === 'edit'
        ? '장비 정보를 수정하는 중...'
        : '장비를 등록하는 중...'
    );

    const payload = await buildEquipmentSubmitPayload();
    validateEquipmentForm(payload);

    const result = equipmentFormState.mode === 'edit'
      ? await apiPost('updateEquipment', payload)
      : await apiPost('createEquipment', payload);

    showMessage(result.message || '저장되었습니다.', 'success');

    if (equipmentFormState.mode === 'edit') {
      setTimeout(function() {
        location.href = `detail.html?id=${encodeURIComponent(equipmentFormState.equipmentId)}`;
      }, 400);
    } else {
      const newId = result?.data?.equipment_id || '';
      setTimeout(function() {
        location.href = newId
          ? `detail.html?id=${encodeURIComponent(newId)}`
          : 'list.html';
      }, 400);
    }
  } catch (error) {
    showMessage(error.message || '저장 중 오류가 발생했습니다.', 'error');
  } finally {
    equipmentFormState.submitting = false;
    if (typeof hideGlobalLoading === 'function') {
      hideGlobalLoading();
    }
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    if (typeof showGlobalLoading === 'function') {
      showGlobalLoading('화면을 준비하는 중...');
    }

    const formEl = qs('#equipmentForm');
    if (formEl) {
      formEl.addEventListener('submit', handleEquipmentSubmit);
    }

    await initEquipmentFormPage();
  } catch (error) {
    showMessage(error.message || '화면 초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    if (typeof hideGlobalLoading === 'function') {
      hideGlobalLoading();
    }
  }
});
