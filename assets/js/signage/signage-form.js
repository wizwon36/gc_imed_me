/**
 * signage-form.js
 * 사인물 / 명판 제작 신청 폼 컨트롤러
 */

// 명판 타입별 사이즈 (백엔드 NAMEPLATE_SIZE_MAP 과 동일하게 유지)
const NAMEPLATE_SIZES = {
  A: '200 × 60 mm',
  B: '250 × 80 mm',
  C: '300 × 100 mm',
  D: '400 × 120 mm'
};

// 업로드된 파일 ID 저장소
const uploadedFileIds = {
  main: [],
  location: [],
  reference: []
};

// 업로드 진행 중 카운터 (모두 완료 전 제출 차단)
let pendingUploads = 0;
let isSubmitting = false;
let orgBinder = null;

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  try {
    showGlobalLoading('화면을 준비하는 중...');
    await initOrgSelectors();
    bindTypeSelector();
    bindUrgentToggle();
    bindFileUploads();
    bindNameplateTypeSelector();
    document.getElementById('signageForm').addEventListener('submit', handleSubmit);
  } catch (err) {
    showMessage(err.message || '초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});

// ─────────────────────────────────────────────
// 조직 선택 초기화
// ─────────────────────────────────────────────
async function initOrgSelectors() {
  await window.orgSelect.loadOrgData();

  const clinicSelect = document.getElementById('clinic_code');
  const teamSelect = document.getElementById('team_code');

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
    onClinicChanged: updateDeptPreview,
    onTeamChanged: updateDeptPreview
  });
}

function updateDeptPreview() {
  const clinicCode = qs('#clinic_code')?.value || '';
  const teamCode = qs('#team_code')?.value || '';
  const preview = qs('#department_preview');
  if (preview) {
    preview.value = window.orgSelect?.getOrgDisplayText?.(clinicCode, teamCode) || '';
  }
}

// ─────────────────────────────────────────────
// 제작 종류 선택 (사인물 / 명판)
// ─────────────────────────────────────────────
function bindTypeSelector() {
  document.querySelectorAll('input[name="type"]').forEach(radio => {
    radio.addEventListener('change', handleTypeChange);
  });
}

function handleTypeChange(e) {
  const type = e.target.value;

  // 타입 카드 활성화 표시
  document.querySelectorAll('.type-card').forEach(card => card.classList.remove('is-selected'));
  const selectedCard = document.getElementById('typeCard_' + type);
  if (selectedCard) selectedCard.classList.add('is-selected');

  // 공통 섹션 표시
  showEl('sectionCommon');
  showEl('formActions');

  // 사인물/명판 분기
  if (type === 'SIGN') {
    showEl('sectionSign');
    hideEl('sectionNameplate');
    // 사인물 필드 필수 활성화
    setRequired('sign_size', true);
    setRequired('sign_type', true);
    setRequired('install_env', true);
    setRequired('install_location', true);
    setRequired('install_env_nameplate', false);
    setRequired('nameplate_text', false);
  } else {
    hideEl('sectionSign');
    showEl('sectionNameplate');
    setRequired('sign_size', false);
    setRequired('sign_type', false);
    setRequired('install_env', false);
    setRequired('install_location', false);
    setRequired('install_env_nameplate', true);
    setRequired('nameplate_text', true);
  }

  // 스크롤
  setTimeout(() => {
    document.getElementById('sectionCommon')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ─────────────────────────────────────────────
// 긴급 여부 토글
// ─────────────────────────────────────────────
function bindUrgentToggle() {
  const urgentSel = qs('#is_urgent');
  if (!urgentSel) return;

  urgentSel.addEventListener('change', () => {
    const isUrgent = urgentSel.value === 'Y';
    const field = qs('#urgentReasonField');
    if (field) field.style.display = isUrgent ? '' : 'none';
    setRequired('urgent_reason', isUrgent);
  });
}

// ─────────────────────────────────────────────
// 명판 타입 선택 → 사이즈 자동 표시
// ─────────────────────────────────────────────
function bindNameplateTypeSelector() {
  document.querySelectorAll('input[name="nameplate_type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const type = e.target.value;
      const size = NAMEPLATE_SIZES[type] || '';

      // 카드 활성화
      document.querySelectorAll('.nameplate-type-card').forEach(c => c.classList.remove('is-selected'));
      e.target.closest('.nameplate-type-card')?.classList.add('is-selected');

      // 사이즈 안내 표시
      const infoEl = qs('#namedplateSizeInfo');
      const sizeText = qs('#selectedSizeText');
      if (infoEl && sizeText) {
        sizeText.textContent = type + ' 타입 — ' + size;
        infoEl.style.display = '';
      }
    });
  });
}

// ─────────────────────────────────────────────
// 파일 업로드
// ─────────────────────────────────────────────
function bindFileUploads() {
  bindFileUpload('file_main', 'main', 'fileList_main');
  bindFileUpload('file_location', 'location', 'fileList_location');
  bindFileUpload('file_reference', 'reference', 'fileList_reference');
}

function bindFileUpload(inputId, key, listId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  // 드래그 앤 드롭
  const area = input.closest('.file-upload-area');
  if (area) {
    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('is-dragover'); });
    area.addEventListener('dragleave', () => area.classList.remove('is-dragover'));
    area.addEventListener('drop', e => {
      e.preventDefault();
      area.classList.remove('is-dragover');
      uploadFiles(Array.from(e.dataTransfer.files), key, listId);
    });
    // 클릭 시 input 트리거
    area.addEventListener('click', (e) => {
      if (e.target !== input) input.click();
    });
  }

  input.addEventListener('change', (e) => {
    uploadFiles(Array.from(e.target.files), key, listId);
    input.value = ''; // 같은 파일 재선택 가능하도록
  });
}

async function uploadFiles(files, key, listId) {
  const user = window.auth?.getSession?.() || {};
  const createdBy = user.email || user.user_email || '';

  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) {
      showMessage('파일 크기는 20MB 이하여야 합니다: ' + file.name, 'error');
      continue;
    }

    pendingUploads++;
    const listEl = document.getElementById(listId);
    const itemId = 'fileItem_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    // 업로드 진행 표시
    if (listEl) {
      listEl.insertAdjacentHTML('beforeend',
        '<div class="file-item is-uploading" id="' + itemId + '">' +
        '<span class="file-item-name">' + escapeHtml(file.name) + '</span>' +
        '<span class="file-item-status">업로드 중...</span>' +
        '</div>'
      );
    }

    try {
      const base64 = await toBase64(file);
      const res = await apiPost('uploadSignageFile', {
        file_base64: base64,
        file_name: file.name,
        created_by: createdBy
      });

      uploadedFileIds[key].push(res.data.file_id);

      const itemEl = document.getElementById(itemId);
      if (itemEl) {
        itemEl.classList.remove('is-uploading');
        itemEl.classList.add('is-done');
        itemEl.querySelector('.file-item-status').textContent = '✓ 완료';
      }
    } catch (err) {
      const itemEl = document.getElementById(itemId);
      if (itemEl) {
        itemEl.classList.remove('is-uploading');
        itemEl.classList.add('is-error');
        itemEl.querySelector('.file-item-status').textContent = '✗ 실패';
      }
      showMessage('파일 업로드 실패: ' + file.name, 'error');
    } finally {
      pendingUploads--;
    }
  }
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────
// 폼 제출
// ─────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  clearMessage();

  if (isSubmitting) return;

  if (pendingUploads > 0) {
    showMessage('파일 업로드가 진행 중입니다. 완료 후 다시 시도해 주세요.', 'error');
    return;
  }

  const payload = buildPayload();
  if (!payload) return; // 유효성 실패 시 buildPayload 내에서 showMessage 처리

  if (!validatePayload(payload)) return;

  const submitBtn = qs('#submitBtn');
  try {
    isSubmitting = true;
    setLoading(submitBtn, true, '신청 중...');
    showGlobalLoading('사인물 신청을 처리하는 중...');

    await apiPost('createSignageRequest', payload);

    alert('신청이 완료되었습니다. 담당자에게 알림이 전송되었습니다.');
    location.href = '../../portal.html';
  } catch (err) {
    showMessage(err.message || '신청 중 오류가 발생했습니다.', 'error');
    isSubmitting = false;
  } finally {
    hideGlobalLoading();
    setLoading(submitBtn, false);
  }
}

// ─────────────────────────────────────────────
// Payload 생성
// ─────────────────────────────────────────────
function buildPayload() {
  const user = window.auth?.getSession?.() || {};
  const type = document.querySelector('input[name="type"]:checked')?.value;

  if (!type) {
    showMessage('제작 종류를 선택해 주세요.', 'error');
    document.querySelector('.type-selector-grid')?.scrollIntoView({ behavior: 'smooth' });
    return null;
  }

  const nameplateType = type === 'NAMEPLATE'
    ? (document.querySelector('input[name="nameplate_type"]:checked')?.value || '')
    : '';

  return {
    type,
    clinic_code: getValue('clinic_code'),
    team_code: getValue('team_code'),
    requester_name: getValue('requester_name'),
    contact: getValue('contact'),
    quantity: Number(getValue('quantity') || 1),
    text_content: getValue('text_content'),
    is_urgent: getValue('is_urgent') || 'N',
    urgent_reason: getValue('urgent_reason'),

    file_ids: [...uploadedFileIds.main],
    location_file_ids: [...uploadedFileIds.location],
    reference_file_ids: [...uploadedFileIds.reference],

    // 사인물
    sign_size: getValue('sign_size'),
    sign_type: getValue('sign_type'),
    install_location: getValue('install_location'),
    install_env: type === 'SIGN' ? getValue('install_env') : getValue('install_env_nameplate'),

    // 명판
    nameplate_type: nameplateType,
    nameplate_text: getValue('nameplate_text'),

    created_by: user.email || user.user_email || ''
  };
}

// ─────────────────────────────────────────────
// 유효성 검증
// ─────────────────────────────────────────────
function validatePayload(p) {
  if (!p.clinic_code) return fail('의원을 선택해 주세요.', 'clinic_code');
  if (!p.team_code) return fail('팀을 선택해 주세요.', 'team_code');
  if (!p.requester_name) return fail('요청자명을 입력해 주세요.', 'requester_name');
  if (!p.contact) return fail('연락처를 입력해 주세요.', 'contact');
  if (!p.quantity || p.quantity < 1) return fail('수량을 1 이상 입력해 주세요.', 'quantity');
  if (!p.text_content) return fail('문구를 입력해 주세요.', 'text_content');
  if (p.is_urgent === 'Y' && !p.urgent_reason) return fail('긴급 사유를 입력해 주세요.', 'urgent_reason');
  if (!p.created_by) return fail('로그인 사용자 정보가 없습니다.', null);

  if (p.type === 'SIGN') {
    if (!p.sign_size) return fail('사이즈를 입력해 주세요.', 'sign_size');
    if (!p.sign_type) return fail('형태/종류를 입력해 주세요.', 'sign_type');
    if (!p.install_env) return fail('설치 환경을 선택해 주세요.', 'install_env');
    if (!p.install_location) return fail('설치 위치를 입력해 주세요.', 'install_location');
    if (uploadedFileIds.location.length === 0) return fail('설치 위치 사진을 첨부해 주세요.', null);
    if (uploadedFileIds.reference.length === 0) return fail('참고 자료(도면/레퍼런스)를 첨부해 주세요.', null);
  }

  if (p.type === 'NAMEPLATE') {
    if (!p.nameplate_type) return fail('명판 타입을 선택해 주세요.', null);
    if (!p.install_env) return fail('설치 환경을 선택해 주세요.', 'install_env_nameplate');
    if (!p.nameplate_text) return fail('명판 문구를 입력해 주세요.', 'nameplate_text');
  }

  return true;
}

function fail(msg, focusId) {
  showMessage(msg, 'error');
  if (focusId) qs('#' + focusId)?.focus();
  return false;
}

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────
function qs(selector) {
  return document.querySelector(selector);
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function showEl(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = '';
}

function hideEl(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function setRequired(id, required) {
  const el = document.getElementById(id);
  if (el) el.required = required;
}
