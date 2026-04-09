let currentEquipmentId = '';
let currentEquipment = null;
let currentHistoryId = '';
let currentHistory = null;
let isEditMode = false;

function normalizeText(value) {
  return String(value || '').trim();
}

function getCurrentUserSafe() {
  return window.auth?.getSession?.() || {};
}

function formatDateInputValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const directMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (directMatch) return raw;

  const datePartMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (datePartMatch) {
    return `${datePartMatch[1]}-${datePartMatch[2]}-${datePartMatch[3]}`;
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return '';
}

function getTodayYmd() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatNumberWithComma(value) {
  const raw = String(value || '').replace(/[^\d]/g, '');
  if (!raw) return '';
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function unformatNumber(value) {
  return String(value || '').replace(/[^\d.-]/g, '');
}

function bindCurrencyInput(selector) {
  const el = qs(selector);
  if (!el) return;

  el.addEventListener('input', function() {
    this.value = formatNumberWithComma(this.value);
    requestAnimationFrame(() => {
      try {
        this.setSelectionRange(this.value.length, this.value.length);
      } catch (e) {}
    });
  });

  el.addEventListener('blur', function() {
    this.value = formatNumberWithComma(this.value);
  });
}

function setPageMode() {
  const titleEl = document.querySelector('.page-title');
  const descEl = document.querySelector('.page-desc');
  const submitBtn = qs('#submitButton');
  const submitBtnText = qs('#submitButtonText');

  if (isEditMode) {
    if (titleEl) titleEl.textContent = '이력 수정';
    if (descEl) descEl.textContent = '등록된 수리 및 점검 이력을 수정합니다.';
    if (submitBtnText) {
      submitBtnText.textContent = '수정 저장';
    } else if (submitBtn) {
      submitBtn.textContent = '수정 저장';
    }
  } else {
    if (titleEl) titleEl.textContent = '이력 등록';
    if (descEl) descEl.textContent = '수리 및 점검 이력을 기록합니다.';
    if (submitBtnText) {
      submitBtnText.textContent = '이력 등록';
    } else if (submitBtn) {
      submitBtn.textContent = '이력 등록';
    }
  }
}

function setEquipmentInfo(item) {
  const data = item || {};
  qs('#equipment_id').value = data.equipment_id || '';
  qs('#equipment_name').value = data.equipment_name || '';
  qs('#request_department').value =
    data.department_display ||
    data.department ||
    '';
}

async function loadEquipmentContext() {
  const user = getCurrentUserSafe();

  currentEquipmentId = getQueryParam('equipment_id') || getQueryParam('id') || currentEquipmentId;
  if (!currentEquipmentId) {
    throw new Error('장비 ID가 없습니다.');
  }

  const result = await apiGet('getEquipment', {
    id: currentEquipmentId,
    request_user_email: user.email || user.user_email || ''
  });

  currentEquipment = result.data || {};
  setEquipmentInfo(currentEquipment);
}

async function loadHistoryIfEditMode() {
  currentHistoryId = getQueryParam('history_id');
  isEditMode = !!currentHistoryId;
  setPageMode();

  if (!isEditMode) return;

  const user = getCurrentUserSafe();

  const result = await apiGet('getHistory', {
    history_id: currentHistoryId,
    request_user_email: user.email || user.user_email || ''
  });

  currentHistory = result.data || {};

  if (!currentEquipmentId) {
    currentEquipmentId = currentHistory.equipment_id || '';
  }

  fillHistoryForm(currentHistory);
}

function fillHistoryForm(item) {
  if (!item) return;

  currentHistory = item;

  qs('#history_type').value = item.history_type || '';
  qs('#request_department').value =
    item.request_department_display ||
    item.request_department ||
    currentEquipment?.department_display ||
    currentEquipment?.department ||
    '';

  qs('#requester').value = item.requester || '';
  qs('#work_date').value = formatDateInputValue(item.work_date);
  qs('#amount').value = item.amount === null || item.amount === undefined
    ? ''
    : formatNumberWithComma(item.amount);
  qs('#vendor_name').value = item.vendor_name || '';
  qs('#description').value = item.description || '';
  qs('#result_status').value = item.result_status || '';
  qs('#next_action_date').value = formatDateInputValue(item.next_action_date);
  qs('#update_equipment_status').value = '';
}

function applyHistoryFormDefaults() {
  if (!isEditMode) {
    const workDateEl = qs('#work_date');
    if (workDateEl && !workDateEl.value) {
      workDateEl.value = getTodayYmd();
    }

    if (qs('#request_department') && !qs('#request_department').value) {
      qs('#request_department').value =
        currentEquipment?.department_display ||
        currentEquipment?.department ||
        '';
    }
  }
}

function buildHistoryPayload() {
  const currentUser = getCurrentUserSafe();
  const actor = currentUser.email || currentUser.user_email || currentUser.name || 'system';

  const fallbackOrg = {
    request_clinic_code:
      (isEditMode ? currentHistory?.request_clinic_code : '') ||
      currentEquipment?.clinic_code ||
      '',
    request_clinic_name:
      (isEditMode ? currentHistory?.request_clinic_name : '') ||
      currentEquipment?.clinic_name ||
      '',
    request_team_code:
      (isEditMode ? currentHistory?.request_team_code : '') ||
      currentEquipment?.team_code ||
      '',
    request_team_name:
      (isEditMode ? currentHistory?.request_team_name : '') ||
      currentEquipment?.team_name ||
      '',
    request_department:
      (isEditMode
        ? (currentHistory?.request_department_display || currentHistory?.request_department)
        : '') ||
      currentEquipment?.department_display ||
      currentEquipment?.department ||
      normalizeText(qs('#request_department')?.value)
  };

  const payload = {
    equipment_id: normalizeText(qs('#equipment_id')?.value),
    history_type: normalizeText(qs('#history_type')?.value),
    requester: normalizeText(qs('#requester')?.value),
    work_date: normalizeText(qs('#work_date')?.value),
    amount: unformatNumber(qs('#amount')?.value),
    vendor_name: normalizeText(qs('#vendor_name')?.value),
    description: normalizeText(qs('#description')?.value),
    result_status: normalizeText(qs('#result_status')?.value),
    next_action_date: normalizeText(qs('#next_action_date')?.value),
    created_by: actor,
    updated_by: actor,
    update_equipment_status: normalizeText(qs('#update_equipment_status')?.value),

    request_clinic_code: fallbackOrg.request_clinic_code,
    request_clinic_name: fallbackOrg.request_clinic_name,
    request_team_code: fallbackOrg.request_team_code,
    request_team_name: fallbackOrg.request_team_name,
    request_department: fallbackOrg.request_department
  };

  if (isEditMode && currentHistoryId) {
    payload.history_id = currentHistoryId;
  }

  return payload;
}

function validateHistoryForm(payload) {
  if (!payload.equipment_id) {
    showMessage('대상 장비 정보가 없습니다.', 'error');
    return false;
  }

  if (!payload.history_type) {
    showMessage('이력 유형을 선택하세요.', 'error');
    qs('#history_type')?.focus();
    return false;
  }

  if (!payload.work_date) {
    showMessage('처리일자를 입력하세요.', 'error');
    qs('#work_date')?.focus();
    return false;
  }

  if (!payload.description) {
    showMessage('처리 내용을 입력하세요.', 'error');
    qs('#description')?.focus();
    return false;
  }

  return true;
}

async function handleSubmit(event) {
  event.preventDefault();
  clearMessage();

  const submitBtn = qs('#submitButton');
  const payload = buildHistoryPayload();

  if (!validateHistoryForm(payload)) return;

  try {
    setLoading(submitBtn, true, isEditMode ? '수정 중...' : '저장 중...');
    showGlobalLoading(isEditMode ? '이력을 수정하는 중...' : '이력을 등록하는 중...');

    if (isEditMode) {
      await apiPost('updateHistory', payload);
      alert('이력이 수정되었습니다.');
    } else {
      await apiPost('createHistory', payload);
      alert('이력이 등록되었습니다.');
    }

    if (payload.equipment_id) {
      location.href = `detail.html?id=${encodeURIComponent(payload.equipment_id)}`;
    } else {
      history.back();
    }
  } catch (error) {
    showMessage(error.message || '이력 저장 중 오류가 발생했습니다.', 'error');
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
    setPageMode();

    await loadHistoryIfEditMode();
    await loadEquipmentContext();

    bindCurrencyInput('#amount');
    applyHistoryFormDefaults();

    document.querySelector('#historyForm')?.addEventListener('submit', handleSubmit);
  } catch (error) {
    showMessage(error.message || '초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});
