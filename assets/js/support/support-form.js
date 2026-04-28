(function () {
  const MAX_SINGLE_MB    = 10;
  const MAX_TOTAL_MB     = 30;
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
      bindFileInput();
    } catch (err) {
      showMessage(err.message || '초기화 오류가 발생했습니다.', 'error');
    } finally {
      hideGlobalLoading();
    }

    document.getElementById('supportForm')?.addEventListener('submit', handleSubmit);
  });

  // ── 앱/카테고리 목록 로드 ─────────────────────────────────────────
  async function loadAppList() {
    const result = await apiGet('getSupportAppList');
    const apps       = result?.data?.apps       || [];
    const categories = result?.data?.categories || [];

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

  // ── 파일 입력 바인딩 (사인물 폼과 동일한 방식) ───────────────────
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

        uploadedFileIds.push(res.data.file_id);
        uploadedFileSizes.push(file.size);

        const el = document.getElementById(itemId);
        if (el) {
          el.classList.replace('is-uploading', 'is-done');
          el.querySelector('.signage-file-item-status').textContent = `✓ 완료 (${formatSize(file.size)})`;
        }
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

    if (!appId)    { showMessage('앱을 선택해 주세요.', 'error');        return; }
    if (!category) { showMessage('카테고리를 선택해 주세요.', 'error');  return; }
    if (!title)    { showMessage('제목을 입력해 주세요.', 'error');      return; }
    if (!content)  { showMessage('내용을 입력해 주세요.', 'error');      return; }

    const submitBtn = document.getElementById('submitBtn');
    try {
      isSubmitting = true;
      setLoading(submitBtn, true, '접수 중...');
      showGlobalLoading('수정요청을 접수하는 중...');

      await apiPost('createSupportRequest', {
        app_id:     appId,
        category:   category,
        title:      title,
        content:    content,
        file_ids:   [...uploadedFileIds],
        created_by: createdBy
      });

      alert('수정요청이 접수되었습니다.\n담당자 확인 후 처리해 드리겠습니다.');
      location.href = 'support-list.html';
    } catch (err) {
      await hideGlobalLoading(true);
      showMessage(err.message || '접수 중 오류가 발생했습니다.', 'error');
    } finally {
      isSubmitting = false;
      setLoading(submitBtn, false);
      hideGlobalLoading();
    }
  }
})();
