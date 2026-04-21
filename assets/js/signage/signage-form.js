/**
 * signage-form.js
 * 사인물 / 명판 제작 신청 폼 컨트롤러
 */

const NAMEPLATE_SIZES = {
  A: '높이 5cm (20cm / 16cm)',
  B: '높이 4cm (20cm / 18cm)',
  C: '높이 3cm (20cm / 18cm)',
  D: '높이 2.5cm (20cm)'
};

const NAMEPLATE_SUBTYPES = {
  A: ['1', '2', '3', '4'],
  B: ['1', '2', '3', '4'],
  C: ['1', '2', '3', '4'],
  D: ['1', '2', '3', '4']
};

/**
 * 레이아웃 정의
 * ㄱ : 이름 + 영문이름
 * ㄴ : 이름 + 영문이름 + 직함
 * ㄷ : 이름 + 영문이름 + 직함 + 진료과
 */
const NAMEPLATE_LAYOUTS = [
  {
    id: 'ga',
    label: 'ㄱ 형',
    shape: 'ㄱ',
    desc: '이름 · 영문이름',
    fields: ['name_kor', 'name_eng']
  },
  {
    id: 'na',
    label: 'ㄴ 형',
    shape: 'ㄴ',
    desc: '이름 · 영문이름 · 직함',
    fields: ['name_kor', 'name_eng', 'title']
  },
  {
    id: 'da',
    label: 'ㄷ 형',
    shape: 'ㄷ',
    desc: '이름 · 영문이름 · 직함 · 진료과',
    fields: ['name_kor', 'name_eng', 'title', 'dept']
  }
];

const NP_FIELD_META = {
  name_kor: { label: '이름 (한글)', placeholder: '예: 홍길동',        required: true },
  name_eng: { label: '영문 이름',   placeholder: '예: Hong Gil-dong', required: true },
  title:    { label: '직함',        placeholder: '예: MD / G.D',      required: true },
  dept:     { label: '진료과',      placeholder: '예: 내과',           required: true }
};

const MAX_SINGLE_FILE_MB = 10;
const MAX_TOTAL_FILE_MB  = 20;
const MAX_SINGLE_BYTES   = MAX_SINGLE_FILE_MB * 1024 * 1024;
const MAX_TOTAL_BYTES    = MAX_TOTAL_FILE_MB  * 1024 * 1024;

const uploadedFileIds   = { main: [], location: [], reference: [] };
const uploadedFileSizes = { main: [], location: [], reference: [] };
let pendingUploads = 0;
let isSubmitting   = false;

let currentNpType    = '';
let currentNpSubtype = '';
let currentLayout    = null;

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  try {
    showGlobalLoading('화면을 준비하는 중...');
    await window.orgSelect.loadOrgData();
    prefillUserInfo(user);
    bindTypeSelector();
    bindUrgentToggle();
    bindFileDropzones();
    bindNameplateTypeSelector();
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
  setVal('clinic_code', user.clinic_code || '');
  setVal('team_code',   user.team_code   || '');
  const clinics = window.orgSelect.getClinics();
  const teams   = window.orgSelect.getTeams();
  setVal('clinic_name_display', resolveOrgName(user.clinic_name, user.clinic_code, clinics));
  setVal('team_name_display',   resolveOrgName(user.team_name,   user.team_code,   teams));
  setVal('requester_name', user.name  || user.user_name || '');
  setVal('contact',        user.phone || '');
}

function resolveOrgName(sessionName, code, list) {
  if (sessionName && String(sessionName).trim()) return String(sessionName).trim();
  if (!code || !Array.isArray(list) || !list.length) return '';
  const found = list.find(item =>
    String(item.code_value || '').trim() === String(code || '').trim()
  );
  return found ? String(found.code_name || '').trim() : '';
}

// ─────────────────────────────────────────────
// 제작 종류 선택
// ─────────────────────────────────────────────
function bindTypeSelector() {
  document.querySelectorAll('input[name="type"]').forEach(radio => {
    radio.addEventListener('change', handleTypeChange);
  });
}

function handleTypeChange(e) {
  const type = e.target.value;
  document.querySelectorAll('.signage-type-card').forEach(c => c.classList.remove('is-selected'));
  document.getElementById('typeCard_' + type)?.classList.add('is-selected');
  showEl('sectionCommon');
  showEl('formActions');

  if (type === 'SIGN') {
    showEl('sectionSign');
    hideEl('sectionNameplate');
    setRequired('sign_size', true);
    setRequired('sign_type', true);
    setRequired('install_env', true);
    setRequired('install_location', true);
    setRequired('text_content', true);
  } else {
    hideEl('sectionSign');
    showEl('sectionNameplate');
    setRequired('sign_size', false);
    setRequired('sign_type', false);
    setRequired('install_env', false);
    setRequired('install_location', false);
    setRequired('text_content', false);
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
// 명판 타입 선택 (A~D)
// ─────────────────────────────────────────────
function bindNameplateTypeSelector() {
  document.querySelectorAll('input[name="nameplate_type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      currentNpType    = e.target.value;
      currentNpSubtype = '';
      currentLayout    = null;

      document.querySelectorAll('.signage-np-card').forEach(c => c.classList.remove('is-selected'));
      document.getElementById('npCard_' + currentNpType)?.classList.add('is-selected');

      renderSubtypeGrid(currentNpType);
      hideEl('npLayoutSection');
      hideEl('npTextSection');

      // 사이즈 텍스트
      const sizeText = document.getElementById('selectedSizeText');
      if (sizeText) {
        sizeText.textContent = currentNpType + ' 타입 — ' + (NAMEPLATE_SIZES[currentNpType] || '');
        sizeText.style.display = '';
      }

      // 타입 선택 즉시 디자인 이미지 + 미리보기 영역 표시
      const designImg   = document.getElementById('nameplateDesignImg');
      const placeholder = document.getElementById('npDesignPlaceholder');
      const layoutImg   = document.getElementById('layoutImg');
      const layoutPh    = document.getElementById('layoutPlaceholder');

      if (typeof NAMEPLATE_IMAGES !== 'undefined' && NAMEPLATE_IMAGES[currentNpType]) {
        if (designImg)   { designImg.src = NAMEPLATE_IMAGES[currentNpType]; designImg.style.display = ''; }
        if (placeholder) placeholder.style.display = 'none';
      } else {
        if (designImg)   designImg.style.display = 'none';
        if (placeholder) placeholder.style.display = '';
      }

      // 레이아웃 이미지는 타입 선택 시점에 바로 함께 표시
      if (typeof NAMEPLATE_IMAGES !== 'undefined' && NAMEPLATE_IMAGES.layout) {
        if (layoutImg) { layoutImg.src = NAMEPLATE_IMAGES.layout; layoutImg.style.display = ''; }
        if (layoutPh)  layoutPh.style.display = 'none';
      }

      showEl('npDesignPreviewArea');
    });
  });
}

// ─────────────────────────────────────────────
// 세부 디자인 그리드
// ─────────────────────────────────────────────
function renderSubtypeGrid(type) {
  const section = document.getElementById('npSubtypeSection');
  const grid    = document.getElementById('npSubtypeGrid');
  if (!section || !grid) return;

  const subtypes = NAMEPLATE_SUBTYPES[type] || [];
  grid.innerHTML = subtypes.map(sub => `
    <label class="signage-np-card" id="npSubCard_${type}_${sub}">
      <input type="radio" name="nameplate_subtype" value="${sub}" class="signage-sr-only" />
      <div class="signage-np-badge">${type}-${sub}</div>
    </label>
  `).join('');
  section.style.display = '';

  grid.querySelectorAll('input[name="nameplate_subtype"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      currentNpSubtype = e.target.value;
      currentLayout    = null;

      grid.querySelectorAll('.signage-np-card').forEach(c => c.classList.remove('is-selected'));
      document.getElementById('npSubCard_' + type + '_' + currentNpSubtype)?.classList.add('is-selected');

      renderLayoutGrid();
      hideEl('npTextSection');
    });
  });
}

// ─────────────────────────────────────────────
// 레이아웃 선택 그리드
// ─────────────────────────────────────────────
function renderLayoutGrid() {
  const section = document.getElementById('npLayoutSection');
  const grid    = document.getElementById('npLayoutGrid');
  if (!section || !grid) return;

  grid.innerHTML = NAMEPLATE_LAYOUTS.map(layout => `
    <label class="signage-layout-card" id="layoutCard_${layout.id}">
      <input type="radio" name="nameplate_layout" value="${layout.id}" class="signage-sr-only" />
      <div class="signage-layout-shape">${layout.shape}</div>
      <div class="signage-layout-label">${layout.label}</div>
      <div class="signage-layout-desc">${layout.desc}</div>
    </label>
  `).join('');
  section.style.display = '';

  grid.querySelectorAll('input[name="nameplate_layout"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const layoutId = e.target.value;
      currentLayout  = NAMEPLATE_LAYOUTS.find(l => l.id === layoutId) || null;

      grid.querySelectorAll('.signage-layout-card').forEach(c => c.classList.remove('is-selected'));
      document.getElementById('layoutCard_' + layoutId)?.classList.add('is-selected');

      renderTextFields(currentLayout);
      showEl('npTextSection');
    });
  });
}

// ─────────────────────────────────────────────
// 레이아웃 이미지 업데이트
// ─────────────────────────────────────────────
function updateLayoutImage(layoutId) {
  const layoutImg = document.getElementById('layoutImg');
  const layoutPh  = document.getElementById('layoutPlaceholder');
  if (!layoutImg) return;

  if (typeof NAMEPLATE_IMAGES !== 'undefined') {
    const src = NAMEPLATE_IMAGES['layout_' + layoutId] || NAMEPLATE_IMAGES.layout || '';
    if (src) {
      layoutImg.src = src;
      layoutImg.style.display = '';
      if (layoutPh) layoutPh.style.display = 'none';
      return;
    }
  }
  layoutImg.style.display = 'none';
  if (layoutPh) layoutPh.style.display = '';
}

// ─────────────────────────────────────────────
// 레이아웃 문구 입력 필드 렌더링
// ─────────────────────────────────────────────
function renderTextFields(layout) {
  const container = document.getElementById('npTextFields');
  if (!container || !layout) return;

  container.innerHTML = layout.fields.map(fieldKey => {
    const meta = NP_FIELD_META[fieldKey];
    if (!meta) return '';
    return `
      <label class="form-field">
        <span class="form-label ${meta.required ? 'required' : ''}">${meta.label}</span>
        <input type="text" id="np_field_${fieldKey}" class="input"
          placeholder="${meta.placeholder}"
          data-field="${fieldKey}"
          ${meta.required ? 'required' : ''} />
      </label>
    `;
  }).join('');
}

// ─────────────────────────────────────────────
// 명판 문구 조합
// ─────────────────────────────────────────────
function buildNameplateText() {
  if (!currentLayout) return '';
  const parts = currentLayout.fields.map(fieldKey => {
    const meta = NP_FIELD_META[fieldKey];
    const val  = getValue('np_field_' + fieldKey);
    return `${meta.label}: ${val}`;
  });
  return `레이아웃: ${currentLayout.label}\n` + parts.join('\n');
}

// ─────────────────────────────────────────────
// 파일 업로드
// ─────────────────────────────────────────────
function bindFileDropzones() {
  bindDrop('file_main',     'main',     'fileList_main');
  bindDrop('file_location', 'location', 'fileList_location');
}

function bindDrop(inputId, key, listId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('change', e => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      const fileNameEl = document.getElementById('fileName_' + key);
      if (fileNameEl) {
        fileNameEl.textContent = files.length === 1 ? files[0].name : files.length + '개 파일 선택됨';
      }
    }
    processFiles(files, key, listId);
    input.value = '';
  });
}

function getTotalUploadedBytes() {
  return [...uploadedFileSizes.main, ...uploadedFileSizes.location, ...uploadedFileSizes.reference]
    .reduce((acc, size) => acc + size, 0);
}

function formatFileSize(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function processFiles(files, key, listId) {
  const user      = window.auth?.getSession?.() || {};
  const createdBy = user.user_email || user.email || '';

  for (const file of files) {
    if (file.size > MAX_SINGLE_BYTES) {
      showMessage(`파일 용량 초과: "${file.name}" (${formatFileSize(file.size)}) — 개별 파일은 ${MAX_SINGLE_FILE_MB}MB 이하만 가능합니다.`, 'error');
      continue;
    }
    const currentTotal = getTotalUploadedBytes();
    if (currentTotal + file.size > MAX_TOTAL_BYTES) {
      showMessage(`전체 첨부 용량 초과 — 현재 ${formatFileSize(currentTotal)}, 최대 ${MAX_TOTAL_FILE_MB}MB`, 'error');
      continue;
    }

    pendingUploads++;
    const itemId = 'fi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const listEl = document.getElementById(listId);
    if (listEl) {
      listEl.insertAdjacentHTML('beforeend',
        `<div class="signage-file-item is-uploading" id="${itemId}">
          <span class="signage-file-item-name">${escapeHtml(file.name)}</span>
          <span class="signage-file-item-status">업로드 중...</span>
        </div>`
      );
    }

    try {
      const base64 = await toBase64(file);
      const res    = await apiPost('uploadSignageFile', { file_base64: base64, file_name: file.name, created_by: createdBy });
      uploadedFileIds[key].push(res.data.file_id);
      uploadedFileSizes[key].push(file.size);
      const el = document.getElementById(itemId);
      if (el) {
        el.classList.replace('is-uploading', 'is-done');
        el.querySelector('.signage-file-item-status').textContent = `✓ 완료 (${formatFileSize(file.size)})`;
      }
      const emptyEl = document.getElementById('previewEmpty_' + key);
      if (emptyEl) emptyEl.style.display = 'none';
    } catch (err) {
      const el = document.getElementById(itemId);
      if (el) {
        el.classList.replace('is-uploading', 'is-error');
        el.querySelector('.signage-file-item-status').textContent = '✗ 실패';
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
    reader.onload  = () => resolve(reader.result);
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
  if (pendingUploads > 0) { showMessage('파일 업로드가 진행 중입니다. 완료 후 다시 시도해 주세요.', 'error'); return; }

  const totalBytes = getTotalUploadedBytes();
  if (totalBytes > MAX_TOTAL_BYTES) { showMessage(`전체 첨부 용량(${formatFileSize(totalBytes)})이 최대 ${MAX_TOTAL_FILE_MB}MB를 초과했습니다.`, 'error'); return; }

  const payload = buildPayload();
  if (!payload) return;
  if (!validatePayload(payload)) return;

  const submitBtn = document.getElementById('submitBtn');
  try {
    isSubmitting = true;
    setLoading(submitBtn, true, '신청 중...');
    showGlobalLoading('사인물 신청을 처리하는 중...');
    await apiPost('createSignageRequest', payload);
    alert('신청이 완료되었습니다.\n담당자(gcjwchoi3@gccorp.com)에게 알림이 전송되었습니다.');
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
    document.querySelector('.signage-type-grid')?.scrollIntoView({ behavior: 'smooth' });
    return null;
  }

  let nameplateType = '';
  let nameplateText = '';
  let magnetYn      = 'N'; // 자석 부착 미사용 — 기본값 N 고정
  const draftConfirm = document.getElementById('draft_confirm')?.checked ? 'Y' : 'N';

  if (type === 'NAMEPLATE') {
    nameplateType = currentNpSubtype ? `${currentNpType}-${currentNpSubtype}` : currentNpType;
    nameplateText = buildNameplateText();
    // magnet_yn: 기본값 N 고정 (UI 미사용)
    setVal('nameplate_text', nameplateText);
  }

  const textContent = type === 'SIGN' ? getValue('text_content') : nameplateText;

  return {
    type,
    clinic_code:        getValue('clinic_code'),
    team_code:          getValue('team_code'),
    requester_name:     getValue('requester_name'),
    contact:            getValue('contact'),
    quantity:           Number(getValue('quantity') || 1),
    text_content:       textContent,
    is_urgent:          getValue('is_urgent') || 'N',
    urgent_reason:      getValue('urgent_reason'),
    draft_confirm:      draftConfirm,
    file_ids:           [...uploadedFileIds.main],
    location_file_ids:  [...uploadedFileIds.location],
    reference_file_ids: [],
    sign_size:          getValue('sign_size'),
    sign_type:          getValue('sign_type'),
    install_location:   getValue('install_location'),
    install_env:        type === 'SIGN' ? getValue('install_env') : 'INDOOR',
    nameplate_type:     nameplateType,
    nameplate_text:     nameplateText,
    magnet_yn:          magnetYn,
    created_by:         user.user_email || user.email || ''
  };
}

// ─────────────────────────────────────────────
// 유효성 검증
// ─────────────────────────────────────────────
function validatePayload(p) {
  if (!p.clinic_code)    return fail('의원 정보가 없습니다. 다시 로그인해 주세요.', null);
  if (!p.team_code)      return fail('팀 정보가 없습니다. 다시 로그인해 주세요.', null);
  if (!p.requester_name) return fail('요청자명을 입력해 주세요.', 'requester_name');
  if (!p.contact)        return fail('연락처를 입력해 주세요.', 'contact');
  if (!p.quantity || p.quantity < 1) return fail('수량을 1 이상 입력해 주세요.', 'quantity');
  if (p.is_urgent === 'Y' && !p.urgent_reason) return fail('긴급 사유를 입력해 주세요.', 'urgent_reason');
  if (!p.created_by)     return fail('로그인 정보를 찾을 수 없습니다. 다시 로그인해 주세요.', null);

  if (p.type === 'SIGN') {
    if (!p.text_content)     return fail('상세내역을 입력해 주세요.', 'text_content');
    if (!p.sign_size)        return fail('사이즈를 입력해 주세요.', 'sign_size');
    if (!p.sign_type)        return fail('형태/종류를 입력해 주세요.', 'sign_type');
    if (!p.install_env)      return fail('설치 환경을 선택해 주세요.', 'install_env');
    if (!p.install_location) return fail('설치 위치를 입력해 주세요.', 'install_location');
    if (uploadedFileIds.location.length === 0) return fail('설치 위치 사진 또는 참고자료를 첨부해 주세요.', null);
  }

  if (p.type === 'NAMEPLATE') {
    if (!currentNpType)    return fail('명판 타입을 선택해 주세요.', null);
    if (!currentNpSubtype) return fail('세부 디자인을 선택해 주세요.', null);
    if (!currentLayout)    return fail('문구 레이아웃을 선택해 주세요.', null);
    // if (!p.magnet_yn) return fail('자석 부착 여부를 선택해 주세요.', null); // 미사용

    for (const fieldKey of currentLayout.fields) {
      const meta = NP_FIELD_META[fieldKey];
      if (meta?.required && !getValue('np_field_' + fieldKey)) {
        return fail(`${meta.label}을(를) 입력해 주세요.`, 'np_field_' + fieldKey);
      }
    }
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
function getValue(id)       { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
function setVal(id, val)    { const el = document.getElementById(id); if (el) el.value = val; }
function showEl(id)         { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hideEl(id)         { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function setRequired(id, v) { const el = document.getElementById(id); if (el) el.required = v; }

// ─────────────────────────────────────────────
// 자석 카드 선택 표시 (JS 바인딩)
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('change', (e) => {
    if (e.target.name === 'magnet_yn') {
      document.querySelectorAll('.signage-magnet-card').forEach(c => c.classList.remove('is-selected'));
      e.target.closest('.signage-magnet-card')?.classList.add('is-selected');
    }
  });
});
