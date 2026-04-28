(function () {
  let appList = [];

  document.addEventListener('DOMContentLoaded', async () => {
    const user = window.auth?.requireAuth?.();
    if (!user) return;

    try {
      showGlobalLoading('목록을 불러오는 중...');
      await loadMeta();
      await loadList();
    } catch (err) {
      const listEl = document.getElementById('requestList');
      if (listEl) listEl.innerHTML = '';
      showMessage(err.message || '목록을 불러오지 못했습니다.', 'error');
    } finally {
      hideGlobalLoading();
    }

    document.getElementById('filterBtn')?.addEventListener('click', async () => {
      try {
        showGlobalLoading('조회 중...');
        await loadList();
      } catch (err) {
        showMessage(err.message || '조회 중 오류가 발생했습니다.', 'error');
      } finally {
        hideGlobalLoading();
      }
    });

    document.getElementById('modalBackdrop')?.addEventListener('click', closeModal);
    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  });

  async function loadMeta() {
    const result = await apiGet('getSupportAppList');
    appList = result?.data?.apps || [];

    const appSel = document.getElementById('filterApp');
    appList.forEach(function (a) {
      const opt = document.createElement('option');
      opt.value       = a.app_id;
      opt.textContent = a.app_name;
      appSel.appendChild(opt);
    });
  }

  async function loadList() {
    const user   = window.auth?.getSession?.() || {};
    const email  = user.user_email || user.email || '';

    const appId  = document.getElementById('filterApp')?.value    || '';
    const status = document.getElementById('filterStatus')?.value || '';

    const params = { request_user_email: email };
    if (appId)  params.app_id = appId;
    if (status) params.status = status;

    const result = await apiGet('listSupportRequests', params);
    renderList(result?.data || []);
  }

  function renderList(items) {
    const listEl  = document.getElementById('requestList');
    const emptyEl = document.getElementById('emptyBox');

    if (!items.length) {
      if (listEl)  listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = items.map(function (item) {
      const hasReply = item.reply && (item.status === 'COMPLETED' || item.status === 'REJECTED');
      const replyHtml = hasReply ? `
        <div class="support-card-reply">
          <div class="support-card-reply-label">💬 처리 답변</div>
          <div>${escapeHtml(item.reply)}</div>
        </div>` : '';

      return `
        <div class="support-card" data-id="${escapeHtml(item.request_id)}">
          <div class="support-card-top">
            <span class="support-badge support-badge--app">${escapeHtml(item.app_name)}</span>
            <span class="support-badge support-badge--cat">${escapeHtml(item.category_label)}</span>
            <span class="support-badge support-badge--${item.status}">${escapeHtml(item.status_label)}</span>
            <span class="support-card-title">${escapeHtml(item.title)}</span>
          </div>
          <div class="support-card-preview">${escapeHtml(item.content)}</div>
          ${replyHtml}
          <div class="support-card-meta">${escapeHtml(item.created_at)}</div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.support-card').forEach(function (card) {
      card.addEventListener('click', function () {
        openDetail(this.dataset.id);
      });
    });
  }

  async function openDetail(requestId) {
    try {
      const user  = window.auth?.getSession?.() || {};
      const email = user.user_email || user.email || '';
      showGlobalLoading('불러오는 중...');
      const result = await apiGet('getSupportRequest', { request_id: requestId, request_user_email: email });
      renderModal(result.data);
    } catch (err) {
      showMessage(err.message || '상세 정보를 불러오지 못했습니다.', 'error');
    } finally {
      hideGlobalLoading();
    }
  }

  function renderModal(item) {
    const modal   = document.getElementById('detailModal');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl  = document.getElementById('modalBody');

    if (titleEl) titleEl.textContent = item.title;

    const replyHtml = item.reply ? `
      <div class="support-reply-box">
        <div class="support-reply-box-title">💬 처리 답변 · ${escapeHtml(item.replied_at)}</div>
        <div class="support-reply-box-content">${escapeHtml(item.reply)}</div>
      </div>` : '';

    const fileHtml = Array.isArray(item.file_ids) && item.file_ids.length
      ? `<div class="support-detail-row">
           <div class="support-detail-label">첨부파일</div>
           <div class="support-detail-value">${item.file_ids.length}개 파일 첨부됨</div>
         </div>` : '';

    bodyEl.innerHTML = `
      <div class="support-detail-row">
        <div class="support-detail-label">앱 / 카테고리</div>
        <div class="support-detail-value">
          <span class="support-badge support-badge--app">${escapeHtml(item.app_name)}</span>
          <span class="support-badge support-badge--cat" style="margin-left:6px;">${escapeHtml(item.category_label)}</span>
        </div>
      </div>
      <div class="support-detail-row">
        <div class="support-detail-label">상태</div>
        <div class="support-detail-value">
          <span class="support-badge support-badge--${item.status}">${escapeHtml(item.status_label)}</span>
        </div>
      </div>
      <div class="support-detail-row">
        <div class="support-detail-label">내용</div>
        <div class="support-detail-content">${escapeHtml(item.content)}</div>
      </div>
      ${fileHtml}
      <div class="support-detail-row">
        <div class="support-detail-label">접수일시</div>
        <div class="support-detail-value">${escapeHtml(item.created_at)}</div>
      </div>
      ${replyHtml}
    `;

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const modal = document.getElementById('detailModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }
})();
