let currentEquipmentId = '';
let isEditMode = false;
let currentEquipment = null;
let orgBinder = null;
let selectedPhotoFile = null;
let removePhotoRequested = false;

const DEFAULT_EQUIPMENT_STATUSES = [
  { value: 'IN_USE', label: '사용중' },
  { value: 'REPAIRING', label: '수리중' },
  { value: 'INSPECTING', label: '점검중' },
  { value: 'STORED', label: '보관중' },
  { value: 'DISPOSED', label: '폐기' }
];

function normalizeText(value) {
  return String(value || '').trim();
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
    const active = this === document.activeElement;
    this.value = formatNumberWithComma(this.value);

    if (active) {
      requestAnimationFrame(() => {
        try {
          this.setSelectionRange(this.value.length, this.value.length);
        } catch (e) {}
      });
    }
  });

  el.addEventListener('blur', function() {
    this.value = formatNumberWithComma(this.value);
  });
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

function getCurrentUserSafe() {
  return window.auth?.getSession?.() || {};
}

function setPageMode() {
  const titleEl = document.querySelector('.page-title');
  const descEl = document.querySelector('.page-desc');
  const submitBtn = qs('#submitButton');
  const submitBtnText = qs('#submitButtonText');

  if (isEditMode) {
    if (titleEl) titleEl.textContent = '장비 수정';
    if (descEl) descEl.textContent = '등록된 장비 정보를 수정합니다.';
    if (submitBtnText) {
      submitBtnText.textContent = '수정 저장';
    } else if (submitBtn) {
      submitBtn.textContent = '수정 저장';
    }
  } else {
    if (titleEl) titleEl.textContent = '장비 등록';
    if (descEl) descEl.textContent = '신규 의료장비 정보를 등록합니다.';
    if (submitBtnText) {
      submitBtnText.textContent = '장비 등록';
    } else if (submitBtn) {
      submitBtn.textContent = '장비 등록';
    }
  }
}

function getSelectedOrgCodes() {
  return {
    clinic_code: normalizeText(qs('#clinic_code')?.value),
    team_code: normalizeText(qs('#team_code')?.value)
  };
}

function updateDepartmentPreview() {
  const previewEl = qs('#department_preview');
  if (!previewEl) return;

  const { clinic_code, team_code } = getSelectedOrgCodes();
  previewEl.value = window.orgSelect?.getOrgDisplayText?.(clinic_code, team_code) || '';
}

function updateTeamSelectGuide() {
  const clinicSelect = qs('#clinic_code');
  const teamSelect = qs('#team_code');
  if (!teamSelect) return;

  const clinicCode = normalizeText(clinicSelect?.value);

  if (!clinicCode) {
    teamSelect.disabled = true;
    teamSelect.innerHTML = '<option value="">의원을 먼저 선택하세요</option>';
    return;
  }

  teamSelect.disabled = false;

  if (!teamSelect.options.length) {
    teamSelect.innerHTML = '<option value="">팀을 선택하세요</option>';
  } else if (teamSelect.options.length === 1 && !teamSelect.value) {
    const firstText = normalizeText(teamSelect.options[0].text);
    if (!firstText || firstText === '의원을 먼저 선택하세요') {
      teamSelect.innerHTML = '<option value="">팀을 선택하세요</option>';
    }
  }
}

function renderStatusOptions(items, selectedValue) {
  const selectEl = qs('#status');
  if (!selectEl) return;

  const list = Array.isArray(items) && items.length
    ? items.map(function(item) {
        return {
          value: normalizeText(item.code_value || item.value),
          label: normalizeText(item.code_name || item.label || item.code_value || item.value)
        };
      }).filter(function(item) { return !!item.value; })
    : DEFAULT_EQUIPMENT_STATUSES;

  const safeSelected = normalizeText(selectedValue) || 'IN_USE';

  selectEl.innerHTML =
    '<option value="">선택하세요</option>' +
    list.map(function(item) {
      const selected = item.value === safeSelected ? ' selected' : '';
      return '<option value="' + escapeHtml(item.value) + '"' + selected + '>' +
        escapeHtml(item.label) +
      '</option>';
    }).join('');

  if (!selectEl.value) selectEl.value = safeSelected;
}

async function loadStatusOptions(selectedValue) {
  try {
    const result = await apiGet('getCodes', { code_group: 'EQUIPMENT_STATUS' });
    const items = Array.isArray(result?.data) ? result.data : [];
    renderStatusOptions(items, selectedValue);
  } catch (error) {
    renderStatusOptions([], selectedValue);
  }
}

async function initializeOrgSelectors() {
  await window.orgSelect.loadOrgData();

  const clinicSelect = qs('#clinic_code');
  const teamSelect = qs('#team_code');

  window.orgSelect.fillSelectOptions(clinicSelect, window.orgSelect.getClinics(), {
    emptyText: '의원을 선택하세요'
  });

  if (teamSelect) {
    teamSelect.disabled = true;
    teamSelect.innerHTML = '<option value="">의원을 먼저 선택하세요</option>';
  }

  orgBinder = window.orgSelect.bindClinicTeamSelects({
    clinicSelect,
    teamSelect,
    onClinicChanged: function() { updateTeamSelectGuide(); updateDepartmentPreview(); },
    onTeamChanged: function() { updateTeamSelectGuide(); updateDepartmentPreview(); }
  });

  updateTeamSelectGuide();
}

function getPhotoElements() {
  return {
    input: qs('#photoInput'),
    preview: qs('#photoPreviewImage'),
    empty: qs('#photoPreviewEmpty'),
    removeBtn: qs('#removePhotoBtn'),
    fileName: qs('#photoFileName'),
    previewWrap: qs('#photoPreviewWrap'),
    existingMeta: qs('#photoExistingMeta')
  };
}

function renderPhotoPreview(src) {
  const els = getPhotoElements();
  if (!els.preview || !els.empty) return;

  els.preview.onerror = function() {
    els.preview.src = '';
    els.preview.classList.add('is-hidden');
    els.empty.classList.remove('is-hidden');
    els.empty.textContent = '사진을 불러오지 못했습니다.';
    if (els.previewWrap) els.previewWrap.classList.remove('has-image');
    if (els.existingMeta) els.existingMeta.style.display = 'none';
  };

  if (src) {
    els.preview.src = src;
    els.preview.classList.remove('is-hidden');
    els.empty.classList.add('is-hidden');
    els.empty.textContent = '등록된 사진이 없습니다.';
    if (els.previewWrap) els.previewWrap.classList.add('has-image');
  } else {
    els.preview.src = '';
    els.preview.classList.add('is-hidden');
    els.empty.classList.remove('is-hidden');
    els.empty.textContent = '등록된 사진이 없습니다.';
    if (els.previewWrap) els.previewWrap.classList.remove('has-image');
  }
}

function loadExistingPhoto(item) {
  const inlineUrl = normalizeText(item?.photo_inline_url);
  const photoUrl = normalizeText(item?.photo_url);
  const finalUrl = inlineUrl || photoUrl;
  const els = getPhotoElements();

  if (els.fileName) els.fileName.textContent = finalUrl ? '등록된 사진 있음' : '선택된 파일 없음';
  if (els.existingMeta) els.existingMeta.style.display = finalUrl ? '' : 'none';

  renderPhotoPreview(finalUrl || '');
}

function initializePhotoUi() {
  const els = getPhotoElements();
  if (!els.input) return;

  els.input.addEventListener('change', function(event) {
    const file = event.target.files && event.target.files[0];

    if (!file) {
      selectedPhotoFile = null;
      if (els.fileName) els.fileName.textContent = currentEquipment?.photo_file_id ? '등록된 사진 있음' : '선택된 파일 없음';
      if (els.existingMeta) els.existingMeta.style.display = currentEquipment?.photo_file_id ? '' : 'none';
      loadExistingPhoto(currentEquipment || {});
      return;
    }

    selectedPhotoFile = file;
    removePhotoRequested = false;

    if (els.fileName) els.fileName.textContent = file.name || '선택된 파일 없음';
    if (els.existingMeta) { els.existingMeta.style.display = ''; els.existingMeta.textContent = '새로 선택한 사진이 있습니다.'; }

    renderPhotoPreview(URL.createObjectURL(file));
  });

  els.removeBtn?.addEventListener('click', function() {
    selectedPhotoFile = null;
    removePhotoRequested = true;

    if (els.input) els.input.value = '';
    if (els.fileName) els.fileName.textContent = '선택된 파일 없음';
    if (els.existingMeta) { els.existingMeta.style.display = ''; els.existingMeta.textContent = '사진 삭제 예정'; }

    renderPhotoPreview('');
  });
}

function getImageTypeForOutput(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type === 'image/png') return 'image/jpeg';
  if (type === 'image/webp') return 'image/jpeg';
  return 'image/jpeg';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = function() { reject(new Error('파일을 읽지 못했습니다.')); };
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function() { resolve(img); };
    img.onerror = function() { reject(new Error('이미지 로드에 실패했습니다.')); };
    img.src = dataUrl;
  });
}

async function compressImageFile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImageFromDataUrl(dataUrl);

  const maxSize = 800;
  let width = img.width;
  let height = img.height;

  if (width > height && width > maxSize) {
    height = Math.round((height * maxSize) / width);
    width = maxSize;
  } else if (height >= width && height > maxSize) {
    width = Math.round((width * maxSize) / height);
    height = maxSize;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);

  const mimeType = getImageTypeForOutput(file);
  return {
    dataUrl: canvas.toDataURL(mimeType, 0.75),
    mimeType,
    fileName: file.name || 'equipment-photo.jpg'
  };
}

async function uploadPhotoIfNeeded(equipmentId) {
  const currentUser = getCurrentUserSafe();
  const requestUserEmail = currentUser.email || currentUser.user_email || '';

  if (!equipmentId) return;

  if (removePhotoRequested && currentEquipment?.photo_file_id) {
    await apiPost('deleteEquipmentPhoto', { equipment_id: equipmentId, request_user_email: requestUserEmail });
    currentEquipment.photo_file_id = '';
    currentEquipment.photo_url = '';
    currentEquipment.photo_inline_url = '';
    removePhotoRequested = false;
  }

  if (!selectedPhotoFile) {
    const els = getPhotoElements();
    if (!currentEquipment?.photo_file_id && els.existingMeta && !removePhotoRequested) {
      els.existingMeta.style.display = 'none';
    }
    return;
  }

  const compressed = await compressImageFile(selectedPhotoFile);
  const result = await apiPost('uploadEquipmentPhoto', {
    equipment_id: equipmentId,
    request_user_email: requestUserEmail,
    data_url: compressed.dataUrl,
    mime_type: compressed.mimeType,
    file_name: compressed.fileName
  });

  const uploaded = result?.data || {};
  currentEquipment = currentEquipment || {};
  currentEquipment.photo_file_id = uploaded.photo_file_id || '';
  currentEquipment.photo_url = uploaded.photo_url || '';
  currentEquipment.photo_inline_url = '';
  selectedPhotoFile = null;
  removePhotoRequested = false;

  const els = getPhotoElements();
  if (els.input) els.input.value = '';
  if (els.fileName) els.fileName.textContent = currentEquipment.photo_file_id ? '등록된 사진 있음' : '선택된 파일 없음';
  if (els.existingMeta) {
    els.existingMeta.textContent = currentEquipment.photo_file_id ? '현재 등록된 사진이 있습니다.' : '';
    els.existingMeta.style.display = currentEquipment.photo_file_id ? '' : 'none';
  }

  loadExistingPhoto(currentEquipment);
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
  qs('#acquisition_cost').value = formatNumberWithComma(
    item.acquisition_cost === null || item.acquisition_cost === undefined ? '' : item.acquisition_cost
  );
  qs('#maintenance_end_date').value = formatDateInputValue(item.maintenance_end_date);
  qs('#location').value = item.location || '';
  qs('#current_user').value = item.current_user || '';
  qs('#memo').value = item.memo || '';

  const clinicSelect = qs('#clinic_code');
  const teamSelect = qs('#team_code');

  if (clinicSelect) clinicSelect.value = item.clinic_code || '';

  if (orgBinder?.renderTeamsByClinic) {
    orgBinder.renderTeamsByClinic(item.clinic_code || '', item.team_code || '');
  } else if (teamSelect) {
    teamSelect.value = item.team_code || '';
  }

  updateTeamSelectGuide();
  renderStatusOptions([], item.status || 'IN_USE');
  updateDepartmentPreview();
  loadExistingPhoto(item);
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
    // ★ updated_at 이 currentEquipment 에 보관됨 → buildEquipmentPayload() 에서 client_updated_at 으로 전송
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
    acquisition_cost: unformatNumber(qs('#acquisition_cost')?.value),
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
    // ★ 낙관적 락: 내가 조회했을 때의 updated_at 을 서버로 전송
    // 서버가 현재 시트의 updated_at 과 비교해, 다른 사람이 먼저 수정했으면 오류를 반환합니다.
    payload.client_updated_at = normalizeText(currentEquipment?.updated_at);
  }

  return payload;
}

function validateEquipmentForm(payload) {
  if (!payload.equipment_name) { showMessage('장비명을 입력하세요.', 'error'); qs('#equipment_name')?.focus(); return false; }
  if (!payload.model_name) { showMessage('모델명을 입력하세요.', 'error'); qs('#model_name')?.focus(); return false; }
  if (!payload.serial_no) { showMessage('시리얼번호를 입력하세요.', 'error'); qs('#serial_no')?.focus(); return false; }
  if (!payload.clinic_code) { showMessage('의원을 선택하세요.', 'error'); qs('#clinic_code')?.focus(); return false; }
  if (!payload.team_code) { showMessage('팀을 선택하세요.', 'error'); qs('#team_code')?.focus(); return false; }
  if (!payload.created_by && !payload.updated_by) { showMessage('로그인 사용자 정보가 없습니다.', 'error'); return false; }
  return true;
}

/**
 * 충돌 발생 시 서버에서 최신 장비 데이터를 다시 불러옵니다.
 * currentEquipment.updated_at 이 갱신되므로 재시도 시 올바른 client_updated_at 이 전송됩니다.
 */
async function refreshCurrentEquipment() {
  if (!currentEquipmentId) return;
  try {
    const user = getCurrentUserSafe();
    const result = await apiGet('getEquipment', {
      id: currentEquipmentId,
      request_user_email: user.email || user.user_email || ''
    });
    currentEquipment = result.data || {};
  } catch (_) {
    // 갱신 실패 시 무시 — 사용자가 수동으로 새로고침 가능
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  clearMessage();

  const submitBtn = qs('#submitButton');
  const payload = buildEquipmentPayload();

  if (!validateEquipmentForm(payload)) return;

  try {
    setLoading(submitBtn, true, isEditMode ? '수정 중...' : '저장 중...');
    showGlobalLoading(isEditMode ? '장비 정보를 수정하는 중...' : '장비를 등록하는 중...');

    let equipmentId = '';

    if (isEditMode) {
      const updateResult = await apiPost('updateEquipment', payload);
      equipmentId = payload.equipment_id;
      // ★ 서버가 반환한 새 updated_at 으로 즉시 갱신
      //    alert → 뒤로가기 등으로 연속 수정 시 오래된 client_updated_at 전송 방지
      if (updateResult?.data?.updated_at && currentEquipment) {
        currentEquipment.updated_at = updateResult.data.updated_at;
      }
    } else {
      const result = await apiPost('createEquipment', payload);
      equipmentId = result?.data?.equipment_id || '';
      currentEquipment = currentEquipment || {};
      currentEquipment.equipment_id = equipmentId;
    }

    await uploadPhotoIfNeeded(equipmentId);

    alert(isEditMode ? '장비 정보가 수정되었습니다.' : '장비가 등록되었습니다.');

    if (equipmentId) {
      location.href = `detail.html?id=${encodeURIComponent(equipmentId)}`;
    } else {
      location.href = 'dashboard.html';
    }
  } catch (error) {
    const msg = error.message || '장비 저장 중 오류가 발생했습니다.';
    showMessage(msg, 'error');

    // ★ 충돌 감지 시 최신 데이터를 자동으로 다시 불러와서
    //    다음 저장 시도 때 올바른 client_updated_at 이 전송되도록 합니다.
    if (isEditMode && msg.includes('다른 사용자가 이미 수정했습니다')) {
      await refreshCurrentEquipment();
    }
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
    await initializeOrgSelectors();
    await loadStatusOptions('IN_USE');
    bindCurrencyInput('#acquisition_cost');
    initializePhotoUi();
    await loadEquipmentIfEditMode();
    updateDepartmentPreview();
    document.querySelector('#equipmentForm')?.addEventListener('submit', handleSubmit);
  } catch (error) {
    showMessage(error.message || '초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});
