/**
 * signage-form.js
 * 사인물 / 명판 제작 신청 폼 컨트롤러
 */

// 명판 타입별 규격 (백엔드 NAMEPLATE_SIZE_MAP 과 동일하게 유지)
const NAMEPLATE_SIZES = {
  A: '높이 5cm (20cm / 16cm)',
  B: '높이 4cm (20cm / 18cm)',
  C: '높이 3cm (20cm / 18cm)',
  D: '높이 2.5cm (20cm)'
};

// 업로드된 파일 ID 저장소
const uploadedFileIds = { main: [], location: [], reference: [] };

let pendingUploads = 0;   // 업로드 진행 수
let isSubmitting = false;  // 중복 제출 방지

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  try {
    showGlobalLoading('화면을 준비하는 중...');

    // 로그인 유저 정보로 신청자 기본값 세팅
    prefillUserInfo(user);

    // 이벤트 바인딩
    bindTypeSelector();
    bindUrgentToggle();
    bindFileUploads();
    bindNameplateTypeSelector();

    // 문구 레이아웃 이미지 세팅
    const layoutImg = document.getElementById('layoutImg');
    if (layoutImg && typeof NAMEPLATE_IMAGES !== 'undefined') {
      layoutImg.src = NAMEPLATE_IMAGES.layout;
    }

    document.getElementById('signageForm').addEventListener('submit', handleSubmit);
  } catch (err) {
    showMessage(err.message || '초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});

// ─────────────────────────────────────────────
// 로그인 유저 정보 자동 입력
// ─────────────────────────────────────────────
function prefillUserInfo(user) {
  // 의원/팀: 표시용 텍스트 + hidden 코드
  const clinicNameEl = document.getElementById('clinic_name_display');
  const clinicCodeEl = document.getElementById('clinic_code');
  const teamNameEl = document.getElementById('team_name_display');
  const teamCodeEl = document.getElementById('team_code');

  if (clinicNameEl) clinicNameEl.value = user.clinic_name || '';
  if (clinicCodeEl) clinicCodeEl.value = user.clinic_code || '';
  if (teamNameEl) teamNameEl.value = user.team_name || '';
  if (teamCodeEl) teamCodeEl.value = user.team_code || '';

  // 요청자명
  const nameEl = document.getElementById('requester_name');
  if (nameEl) nameEl.value = user.name || user.user_name || '';

  // 연락처
  const phoneEl = document.getElementById('contact');
  if (phoneEl) phoneEl.value = user.phone || '';
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

  // 카드 활성화
  document.querySelectorAll('.type-card').forEach(c => c.classList.remove('is-selected'));
  document.getElementById('typeCard_' + type)?.classList.add('is-selected');

  // 공통 섹션 표시
  showEl('sectionCommon');
  showEl('formActions');

  if (type === 'SIGN') {
    showEl('sectionSign');
    hideEl('sectionNameplate');
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

  setTimeout(() => {
    document.getElementById('sectionCommon')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

// ─────────────────────────────────────────────
// 긴급 여부 토글
// ─────────────────────────────────────────────
function bindUrgentToggle() {
  document.getElementById('is_urgent')?.addEventListener('change', function () {
    const isUrgent = this.value === 'Y';
    const field = document.getElementById('urgentReasonField');
    if (field) field.style.display = isUrgent ? '' : 'none';
    setRequired('urgent_reason', isUrgent);
  });
}

// ─────────────────────────────────────────────
// 명판 타입 선택 → 디자인 이미지 + 사이즈 표시
// ─────────────────────────────────────────────
function bindNameplateTypeSelector() {
  document.querySelectorAll('input[name="nameplate_type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const type = e.target.value;

      // 카드 활성화
      document.querySelectorAll('.nameplate-type-card').forEach(c => c.classList.remove('is-selected'));
      document.getElementById('npCard_' + type)?.classList.add('is-selected');

      // 디자인 이미지 표시
      const wrap = document.getElementById('nameplateDesignWrap');
      const img = document.getElementById('nameplateDesignImg');
      const sizeText = document.getElementById('selectedSizeText');

      if (wrap && img && typeof NAMEPLATE_IMAGES !== 'undefined') {
        img.src = NAMEPLATE_IMAGES[type] || '';
        wrap.style.display = '';
      }

      if (sizeText) {
        sizeText.textContent = type + ' 타입 — ' + (NAMEPLATE_SIZES[type] || '');
      }
    });
  });
}

// ─────────────────────────────────────────────
// 파일 업로드
// ─────────────────────────────────────────────
function bindFileUploads() {
  bindFileZone('file_main', 'main', 'fileList_main', 'zone_main');
  bindFileZone('file_location', 'location', 'fileList_location', 'zone_location');
  bindFileZone('file_reference', 'reference', 'fileList_reference', 'zone_reference');
}

function bindFileZone(inputId, key, listId, zoneId) {
  const input = document.getElementById(inputId);
  const zone = document.getElementById(zoneId);
  if (!input) return;

  // 드래그 앤 드롭
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('is-dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('is-dragover');
      processFiles(Array.from(e.dataTransfer.files), key, listId);
    });
  }

  input.addEventListener('change', e => {
    processFiles(Array.from(e.target.files), key, listId);
    input.value = '';
  });
}

async function processFiles(files, key, listId) {
  const user = window.auth?.getSession?.() || {};
  const createdBy = user.email || user.user_email || '';

  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) {
      showMessage('20MB 이하 파일만 업로드 가능합니다: ' + file.name, 'error');
      continue;
    }

    pendingUploads++;
    const itemId = 'fi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const listEl = document.getElementById(listId);

    if (listEl) {
      listEl.insertAdjacentHTML('beforeend',
        `<div class="file-item is-uploading" id="${itemId}">
          <span class="file-item-name">${escapeHtml(file.name)}</span>
          <span class="file-item-status">업로드 중...</span>
        </div>`
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

      const el = document.getElementById(itemId);
      if (el) {
        el.classList.replace('is-uploading', 'is-done');
        el.querySelector('.file-item-status').textContent = '✓ 완료';
      }
    } catch (err) {
      const el = document.getElementById(itemId);
      if (el) {
        el.classList.replace('is-uploading', 'is-error');
        el.querySelector('.file-item-status').textContent = '✗ 실패';
      }
      showMessage('업로드 실패: ' + file.name, 'error');
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
  if (!payload) return;
  if (!validatePayload(payload)) return;

  const submitBtn = document.getElementById('submitBtn');
  try {
    isSubmitting = true;
    setLoading(submitBtn, true, '신청 중...');
    showGlobalLoading('사인물 신청을 처리하는 중...');

    await apiPost('createSignageRequest', payload);

    alert('신청이 완료되었습니다.\n담당자(gcsbjeong@gccorp.com)에게 알림이 전송되었습니다.');
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

    sign_size: getValue('sign_size'),
    sign_type: getValue('sign_type'),
    install_location: getValue('install_location'),
    install_env: type === 'SIGN' ? getValue('install_env') : getValue('install_env_nameplate'),

    nameplate_type: nameplateType,
    nameplate_text: getValue('nameplate_text'),

    created_by: user.email || user.user_email || ''
  };
}

// ─────────────────────────────────────────────
// 유효성 검증
// ─────────────────────────────────────────────
function validatePayload(p) {
  if (!p.clinic_code) return fail('의원 정보가 없습니다. 다시 로그인해 주세요.', null);
  if (!p.team_code) return fail('팀 정보가 없습니다. 다시 로그인해 주세요.', null);
  if (!p.requester_name) return fail('요청자명을 입력해 주세요.', 'requester_name');
  if (!p.contact) return fail('연락처를 입력해 주세요.', 'contact');
  if (!p.quantity || p.quantity < 1) return fail('수량을 1 이상 입력해 주세요.', 'quantity');
  if (!p.text_content) return fail('문구를 입력해 주세요.', 'text_content');
  if (p.is_urgent === 'Y' && !p.urgent_reason) return fail('긴급 사유를 입력해 주세요.', 'urgent_reason');
  if (!p.created_by) return fail('로그인 정보를 찾을 수 없습니다. 다시 로그인해 주세요.', null);

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
  if (focusId) document.getElementById(focusId)?.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return false;
}

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────
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
