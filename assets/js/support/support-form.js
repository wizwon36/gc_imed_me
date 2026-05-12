(function () {
  const MAX_SINGLE_MB    = 10;
  const MAX_TOTAL_MB     = 20;
  const MAX_SINGLE_BYTES = MAX_SINGLE_MB * 1024 * 1024;
  const MAX_TOTAL_BYTES  = MAX_TOTAL_MB  * 1024 * 1024;

  const uploadedFileIds   = [];
  const uploadedFileSizes = [];
  let pendingUploads = 0;
  let isSubmitting   = false;

  // ── 초기화 ────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    const user = window.auth?.requireAuth?.();
    if (!user) return;

    try {
      showGlobalLoading('화면을 준비하는 중...');
      await loadAppList();
      // 스켈레톤 제거 후 실제 폼 표시
      const sk = document.getElementById('formSkeleton');
      const form = document.getElementById('supportForm');
      if (sk) sk.style.display = 'none';
      if (form) form.style.display = '';
      bindFileInput();
    } catch (err) {
      showMessage(err.message || '초기화 오류가 발생했습니다.', 'error');
    } finally {
      hideGlobalLoading();
    }

    document.getElementById('supportForm')?.addEventListener('submit', handleSubmit);
  });

  // ── 기본 앱 목록 (API 응답에 없을 경우 폴백) ──────────────────────
  const DEFAULT_APPS = [
    { app_id: 'equipment', app_name: '의료장비 관리' },
    { app_id: 'signage',   app_name: '사인물 신청'   },
    { app_id: 'lj_chart',  app_name: '정도관리 시스템' }
  ];

  // ── 카테고리/유형 목록 로드 ──────────────────────────────────────────
  async function loadAppList() {
    const result = await apiGet('getSupportAppList');
    let apps         = result?.data?.apps       || [];
    const categories = result?.data?.categories || [];

    // API 응답에 lj_chart 가 없으면 DEFAULT_APPS 에서 보완
    DEFAULT_APPS.forEach(function (def) {
      if (!apps.some(function (a) { return a.app_id === def.app_id; })) {
        apps = apps.concat([def]);
      }
    });

    const appSel = document.getElementById('appId');
    apps.forEach(function (a) {
      const opt = document.createElement('option');
      opt.value       = a.app_id;
      opt.textContent = a.app_name;
      appSel.appendChild(opt);
    });

    const catSel = document.getElementById('category');
    categories.forEach(function (c) {
      const opt = document.createElement('option');
      opt.value       = c.value;
      opt.textContent = c.label;
      catSel.appendChild(opt);
    });
  }

  // ── 파일 입력 바인딩 ─────────────────────────────────────────────
  function bindFileInput() {
    const input = document.getElementById('fileInput');
    if (!input) return;
    input.addEventListener('change', function (e) {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        const fileNameEl = document.getElementById('fileName');
        if (fileNameEl) {
          fileNameEl.textContent = files.length === 1 ? files[0].name : files.length + '개 파일 선택됨';
        }
      }
      processFiles(files);
      input.value = '';
    });
  }

  function getTotalBytes() {
    return uploadedFileSizes.reduce((a, b) => a + b, 0);
  }

  function formatSize(bytes) {
    if (bytes < 1024)        return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function processFiles(files) {
    const user      = window.auth?.getSession?.() || {};
    const createdBy = user.user_email || user.email || '';

    for (const file of files) {
      if (file.size > MAX_SINGLE_BYTES) {
        showMessage(`파일 용량 초과: "${file.name}" — 파일당 최대 ${MAX_SINGLE_MB}MB`, 'error');
        continue;
      }
      if (getTotalBytes() + file.size > MAX_TOTAL_BYTES) {
        showMessage(`전체 첨부 용량 초과 — 최대 ${MAX_TOTAL_MB}MB`, 'error');
        continue;
      }

      pendingUploads++;
      const itemId = 'fi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const listEl = document.getElementById('fileList');
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
        const res    = await apiPost('uploadSupportFile', {
          file_base64: base64,
          file_name:   file.name,
          created_by:  createdBy
        });

        const fileId   = res.data.file_id;
        const fileSize = file.size;
        uploadedFileIds.push(fileId);
        uploadedFileSizes.push(fileSize);

        const el = document.getElementById(itemId);
        if (el) {
          el.classList.replace('is-uploading', 'is-done');
          el.querySelector('.signage-file-item-status').textContent = `✓ 완료 (${formatSize(fileSize)})`;
          // 삭제 버튼 추가
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'signage-file-item-remove';
          removeBtn.textContent = '✕';
          removeBtn.title = '파일 제거';
          removeBtn.addEventListener('click', () => {
            const idx = uploadedFileIds.indexOf(fileId);
            if (idx !== -1) {
              uploadedFileIds.splice(idx, 1);
              uploadedFileSizes.splice(idx, 1);
            }
            el.remove();
          });
          el.appendChild(removeBtn);
        }
      } catch (err) {
        const el = document.getElementById(itemId);
        if (el) {
          el.classList.replace('is-uploading', 'is-error');
          el.querySelector('.signage-file-item-status').textContent = '✗ 실패';
          // 실패 아이템도 제거 가능하도록
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'signage-file-item-remove';
          removeBtn.textContent = '✕';
          removeBtn.title = '제거';
          removeBtn.addEventListener('click', () => el.remove());
          el.appendChild(removeBtn);
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

  // ── 폼 제출 ───────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    clearMessage();
    if (isSubmitting) return;

    if (pendingUploads > 0) {
      showMessage('파일 업로드가 진행 중입니다. 완료 후 다시 시도해 주세요.', 'error');
      return;
    }

    const user      = window.auth?.getSession?.() || {};
    const createdBy = user.user_email || user.email || '';

    const appId    = document.getElementById('appId')?.value?.trim()    || '';
    const category = document.getElementById('category')?.value?.trim() || '';
    const title    = document.getElementById('title')?.value?.trim()    || '';
    const content  = document.getElementById('content')?.value?.trim()  || '';

    if (!appId)    { showMessage('카테고리를 선택해 주세요.', 'error');  return; }
    if (!category) { showMessage('유형을 선택해 주세요.', 'error');      return; }
    if (!title)    { showMessage('제목을 입력해 주세요.', 'error');     return; }
    if (!content)  { showMessage('내용을 입력해 주세요.', 'error');     return; }

    const submitBtn = document.getElementById('submitBtn');
    isSubmitting = true;
    setLoading(submitBtn, true, '접수 중...');
    showGlobalLoading('수정요청을 접수하는 중...');

    try {
      await apiPost('createSupportRequest', {
        app_id:     appId,
        category:   category,
        title:      title,
        content:    content,
        file_ids:   [...uploadedFileIds],
        created_by: createdBy
      });

      await hideGlobalLoading();
      alert('수정요청이 접수되었습니다.\n담당자 확인 후 처리해 드리겠습니다.');
      location.href = 'support-list.html';

    } catch (err) {
      await hideGlobalLoading();
      showMessage(err.message || '접수 중 오류가 발생했습니다.', 'error');
      isSubmitting = false;
      setLoading(submitBtn, false);
    }
  }
})();
