const API_BASE = CONFIG.API_BASE_URL;

let uploadedFiles = {
  main: [],
  location: [],
  reference: []
};

// ==========================
// 초기화
// ==========================
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
});

// ==========================
// 이벤트 바인딩
// ==========================
function bindEvents() {
  document.querySelectorAll('input[name="type"]').forEach(el => {
    el.addEventListener('change', handleTypeChange);
  });

  document.getElementById('submitBtn').addEventListener('click', handleSubmit);

  // 파일 업로드
  bindFileUpload('file_main', 'main');
  bindFileUpload('file_location', 'location');
  bindFileUpload('file_reference', 'reference');
}

// ==========================
// 타입 변경 (사인물 / 명판)
// ==========================
function handleTypeChange(e) {
  const type = e.target.value;

  document.getElementById('section_sign').style.display =
    type === 'SIGN' ? 'block' : 'none';

  document.getElementById('section_nameplate').style.display =
    type === 'NAMEPLATE' ? 'block' : 'none';
}

// ==========================
// 파일 업로드
// ==========================
function bindFileUpload(inputId, targetKey) {
  const input = document.getElementById(inputId);

  input.addEventListener('change', async (e) => {
    const files = e.target.files;

    for (let file of files) {
      const base64 = await toBase64(file);

      const res = await fetch(API_BASE + '?action=uploadSignageFile', {
        method: 'POST',
        body: JSON.stringify({
          file_base64: base64,
          file_name: file.name,
          created_by: window.currentUser.email
        })
      });

      const data = await res.json();

      if (data.success) {
        uploadedFiles[targetKey].push(data.data.file_id);
      } else {
        alert('파일 업로드 실패');
      }
    }
  });
}

// base64 변환
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ==========================
// 제출
// ==========================
async function handleSubmit() {
  try {
    const payload = buildPayload();

    const res = await fetch(API_BASE + '?action=createSignageRequest', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.message);
    }

    alert('신청 완료');
    location.reload();

  } catch (err) {
    alert(err.message);
  }
}

// ==========================
// Payload 생성
// ==========================
function buildPayload() {
  const type = document.querySelector('input[name="type"]:checked')?.value;

  if (!type) throw new Error('제작 종류 선택 필수');

  return {
    type,

    requester_name: getValue('requester_name'),
    contact: getValue('contact'),

    clinic_code: getValue('clinic_code'),
    team_code: getValue('team_code'),

    quantity: Number(getValue('quantity') || 1),
    text_content: getValue('text_content'),

    urgent_yn: getValue('is_urgent') === 'Y' ? 'Y' : 'N',
    urgent_reason: getValue('urgent_reason'),

    file_ids_json: JSON.stringify(uploadedFiles.main),
    location_file_ids_json: JSON.stringify(uploadedFiles.location),
    reference_file_ids_json: JSON.stringify(uploadedFiles.reference),

    // 사인물
    sign_size: getValue('sign_size'),
    sign_type: getValue('sign_type'),
    install_location: getValue('install_location'),
    install_env: getValue('install_env'),

    // 명판
    nameplate_type: getValue('nameplate_type'),
    nameplate_text: getValue('nameplate_text'),

    created_by: window.currentUser.email
  };
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}
