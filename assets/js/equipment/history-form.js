let currentEquipmentId = '';
let currentEquipment = null;

function normalizeText(value) {
  return String(value || '').trim();
}

function getCurrentUserSafe() {
  if (window.auth && typeof window.auth.getSession === 'function') {
    return window.auth.getSession() || {};
  }
  return {};
}

function extractDepartmentListFromOrgService() {
  if (!window.OrgService) return [];

  if (typeof window.OrgService.getOrgData === 'function') {
    const data = window.OrgService.getOrgData();
    if (Array.isArray(data)) {
      return data
        .map(function(item) {
          return item.department || item.department_name || item.name || '';
        })
        .filter(function(item) {
          return normalizeText(item);
        });
    }
  }

  if (typeof window.OrgService.getOrgConfig === 'function') {
    const config = window.OrgService.getOrgConfig();
    if (Array.isArray(config)) {
      return config
        .map(function(item) {
          return item.department || item.department_name || item.name || '';
        })
        .filter(function(item) {
          return normalizeText(item);
        });
    }
  }

  if (Array.isArray(window.OrgService.departments)) {
    return window.OrgService.departments
      .map(function(item) {
        if (typeof item === 'string') return item;
        return item.department || item.department_name || item.name || '';
      })
      .filter(function(item) {
        return normalizeText(item);
      });
  }

  return [];
}

function setDepartmentOptions(departments, selectedValue) {
  const deptEl = qs('#request_department');
  if (!deptEl) return;

  const selected = normalizeText(selectedValue);
  const seen = {};
  const unique = [];

  deptEl.innerHTML = '<option value="">선택하세요</option>';

  departments.forEach(function(name) {
    const text = normalizeText(name);
    if (!text) return;
    if (seen[text]) return;
    seen[text] = true;
    unique.push(text);
  });

  unique.forEach(function(name) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    deptEl.appendChild(option);
  });

  if (selected && !seen[selected]) {
    const fallback = document.createElement('option');
    fallback.value = selected;
    fallback.textContent = selected;
    deptEl.appendChild(fallback);
  }

  deptEl.value = selected || '';
}

async function initHistoryDepartmentSelector(item) {
  const equipmentDepartment = normalizeText(item && item.department);
  let departmentList = [];

  if (window.OrgService && typeof window.OrgService.preload === 'function') {
    await window.OrgService.preload();
  }

  departmentList = extractDepartmentListFromOrgService();

  // 목록이 없더라도 현재 장비 부서는 선택 가능하게 유지
  if (!departmentList.length && equipmentDepartment) {
    departmentList = [equipmentDepartment];
  }

  setDepartmentOptions(departmentList, equipmentDepartment);
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

  if (qs('#backToDetailBtn')) {
    qs('#backToDetailBtn').href = `detail.html?id=${encodeURIComponent(equipmentId)}`;
  }

  const user = getCurrentUserSafe();

  try {
    const result = await apiGet('getEquipment', {
      id: equipmentId,
      request_user_email: user.email || ''
    });

    const item = result.data || {};
    currentEquipment = item;

    qs('#equipment_id').value = item.equipment_id || '';
    qs('#equipment_name').value = item.equipment_name || '';

    await initHistoryDepartmentSelector(item);
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function buildHistoryPayload() {
  const currentUser = getCurrentUserSafe();

  return {
    equipment_id: qs('#equipment_id').value.trim(),
    history_type: qs('#history_type').value,

    request_clinic_code: normalizeText(currentEquipment && currentEquipment.clinic_code),
    request_clinic_name: normalizeText(currentEquipment && currentEquipment.clinic_name),
    request_team_code: normalizeText(currentEquipment && currentEquipment.team_code),
    request_team_name: normalizeText(currentEquipment && currentEquipment.team_name),
    request_department: qs('#request_department').value,

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

  if (!payload.request_department) {
    showMessage('요청부서를 선택하세요.', 'error');
    qs('#request_department').focus();
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
    const user = window.auth.requireAuth();
    if (!user) return;

    const ok = await window.appPermission.requirePermission('equipment', ['edit', 'admin']);
    if (!ok) return;

    qs('#historyForm').addEventListener('submit', handleSubmitHistory);

    if (window.OrgService && typeof window.OrgService.preload === 'function') {
      await window.OrgService.preload();
    }

    await loadEquipmentInfo();
  } catch (error) {
    showMessage(error.message || '이력 등록 화면을 불러오는 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});
