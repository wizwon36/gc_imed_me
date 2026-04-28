(function () {
  let allItems = [];
  let currentItem = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const user = window.auth?.requireAuth?.();
    if (!user) return;

    // 관리자만 접근
    if (String(user.role || '').trim().toLowerCase() !== 'admin') {
      alert('관리자만 접근할 수 있습니다.');
      location.replace(`${CONFIG.SITE_BASE_URL}/portal.html`);
      return;
    }

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

    document.getElementById('filterKeyword')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('filterBtn')?.click();
    });

    document.getElementById('modalBackdrop')?.addEventListener('click', closeModal);
    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  });

  // ── 메타 로드 ─────────────────────────────────────────────────────
  async function loadMeta() {
    const result = await apiGet('getSupportAppList');
    const apps   = result?.data?.apps || [];

    const appSel = document.getElementById('filterApp');
    apps.forEach(function (a) {
      const opt = document.createElement('option');
      opt.value       = a.app_id;
      opt.textContent = a.app_name;
      appSel.appendChild(opt);
    });
  }

  // ── 목록 로드 ─────────────────────────────────────────────────────
  async function loadList() {
    const user    = window.auth?.getSession?.() || {};
    const email   = user.user_email || user.email || '';
    const appId   = document.getElementById('filterApp')?.value    || '';
    const status  = document.getElementById('filterStatus')?.value || '';
    const keyword = document.getElementById('filterKeyword')?.value?.trim() || '';

    const params = { request_user_email: email };
    if (appId)   params.app_id  = appId;
    if (status)  params.status  = status;
    if (keyword) params.keyword = keyword;

    const result = await apiGet('listSupportRequests', params);
    allItems = result?.data || [];
    renderStat(allItems);
    renderList(allItems);
  }

  // ── 통계 바 ───────────────────────────────────────────────────────
  function renderStat(items) {
    const counts = { PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, REJECTED: 0 };
    items.forEach(function (item) { if (counts[item.status] !== undefined) counts[item.status]++; });

    const labels = { PENDING:'접수', IN_PROGRESS:'처리중', COMPLETED:'완료', REJECTED:'반려' };
    const bar = document.getElementById('statBar');
    if (!bar) return;

    bar.innerHTML = Object.keys(counts).map(function (s) {
      return `<div class="support-stat-chip" data-status="${s}">
        ${escapeHtml(labels[s])}
        <span class="support-stat-chip-count">${counts[s]}</span>
      </div>`;
    }).join('');

    bar.querySelectorAll('.support-stat-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        const statusSel = document.getElementById('filterStatus');
        if (statusSel) statusSel.value = this.dataset.status;
        document.getElementById('filterBtn')?.click();
      });
    });
  }

  // ── 목록 렌더 ─────────────────────────────────────────────────────
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
      return `
        <div class="support-card is-${item.status.toLowerCase()}" data-id="${escapeHtml(item.request_id)}">
          <div class="support-card-top">
            <span class="support-badge support-badge--app">${escapeHtml(item.app_name)}</span>
            <span class="support-badge support-badge--cat">${escapeHtml(item.category_label)}</span>
            <span class="support-badge support-badge--${item.status}">${escapeHtml(item.status_label)}</span>
            <span class="support-card-title">${escapeHtml(item.title)}</span>
          </div>
          <div class="support-card-preview">${escapeHtml(item.content)}</div>
          <div class="support-card-meta">
            요청자: ${escapeHtml(item.created_by)} · ${escapeHtml(item.created_at)}
            ${item.reply ? ' · 💬 답변 있음' : ''}
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.support-card').forEach(function (card) {
      card.addEventListener('click', function () {
        openModal(this.dataset.id);
      });
    });
  }

  // ── 모달 열기 ─────────────────────────────────────────────────────
  async function openModal(requestId) {
    try {
      const user  = window.auth?.getSession?.() || {};
      const email = user.user_email || user.email || '';
      showGlobalLoading('불러오는 중...');
      const result = await apiGet('getSupportRequest', { request_id: requestId, request_user_email: email });
      currentItem = result.data;
      renderModal(currentItem);
    } catch (err) {
      showMessage(err.message || '상세 정보를 불러오지 못했습니다.', 'error');
    } finally {
      hideGlobalLoading();
    }
  }

  function renderModal(item) {
    const modal   = document.getElementById('processModal');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl  = document.getElementById('modalBody');
    const footerEl = document.getElementById('modalFooter');

    if (titleEl) titleEl.textContent = item.title;

    const fileHtml = Array.isArray(item.file_ids) && item.file_ids.length
      ? `<div class="support-detail-row">
           <div class="support-detail-label">첨부파일</div>
           <div class="support-detail-value">${item.file_ids.length}개 파일 첨부됨</div>
         </div>` : '';

    const existingReplyHtml = item.reply ? `
      <div class="support-existing-reply">
        <div class="support-existing-reply-label">💬 기존 답변 (${escapeHtml(item.replied_at)})</div>
        <div class="support-existing-reply-text">${escapeHtml(item.reply)}</div>
      </div>` : '';

    bodyEl.innerHTML = `
      <div class="support-detail-row">
        <div class="support-detail-label">카테고리 / 유형</div>
        <div class="support-detail-value">
          <span class="support-badge support-badge--app">${escapeHtml(item.app_name)}</span>
          <span class="support-badge support-badge--cat" style="margin-left:6px;">${escapeHtml(item.category_label)}</span>
        </div>
      </div>
      <div class="support-detail-row">
        <div class="support-detail-label">요청자</div>
        <div class="support-detail-value">${escapeHtml(item.created_by)} · ${escapeHtml(item.created_at)}</div>
      </div>
      <div class="support-detail-row">
        <div class="support-detail-label">현재 상태</div>
        <div class="support-detail-value">
          <span class="support-badge support-badge--${item.status}">${escapeHtml(item.status_label)}</span>
        </div>
      </div>
      <div class="support-detail-row">
        <div class="support-detail-label">요청 내용</div>
        <div class="support-detail-content">${escapeHtml(item.content)}</div>
      </div>
      ${fileHtml}
      ${existingReplyHtml}
    `;

    footerEl.innerHTML = `
      <div class="support-process-form">
        <div>
          <div class="support-process-label">처리 상태 변경</div>
          <select id="processStatus" class="support-process-select">
            <option value="PENDING"     ${item.status === 'PENDING'     ? 'selected' : ''}>접수</option>
            <option value="IN_PROGRESS" ${item.status === 'IN_PROGRESS' ? 'selected' : ''}>처리중</option>
            <option value="COMPLETED"   ${item.status === 'COMPLETED'   ? 'selected' : ''}>완료</option>
            <option value="REJECTED"    ${item.status === 'REJECTED'    ? 'selected' : ''}>반려</option>
          </select>
        </div>
        <div>
          <div class="support-process-label">답변 내용</div>
          <textarea id="processReply" class="support-process-textarea" placeholder="처리 결과나 안내 메시지를 입력하세요. (완료/반려 시 요청자에게 메일 발송)">${escapeHtml(item.reply || '')}</textarea>
        </div>
        <div class="support-process-actions">
          <button type="button" id="processSubmitBtn" class="btn btn-primary" style="min-width:100px;">저장</button>
          <button type="button" id="processCancelBtn" class="btn">닫기</button>
        </div>
      </div>
    `;

    document.getElementById('processSubmitBtn')?.addEventListener('click', handleProcess);
    document.getElementById('processCancelBtn')?.addEventListener('click', closeModal);

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  // ── 처리 저장 ─────────────────────────────────────────────────────
  async function handleProcess() {
    if (!currentItem) return;

    const user   = window.auth?.getSession?.() || {};
    const email  = user.user_email || user.email || '';
    const status = document.getElementById('processStatus')?.value || '';
    const reply  = document.getElementById('processReply')?.value?.trim() || '';

    if (!status) { alert('처리 상태를 선택해 주세요.'); return; }

    const isCompleted = status === 'COMPLETED' || status === 'REJECTED';
    if (isCompleted && !reply) {
      if (!confirm('답변 내용 없이 저장하시겠습니까?\n완료/반려 상태는 답변 작성을 권장합니다.')) return;
    }

    const submitBtn = document.getElementById('processSubmitBtn');
    try {
      setLoading(submitBtn, true, '저장 중...');
      showGlobalLoading('처리 중...');

      await apiPost('updateSupportRequest', {
        request_id:         currentItem.request_id,
        status:             status,
        reply:              reply,
        request_user_email: email
      });

      closeModal();
      showMessage('처리 상태가 업데이트되었습니다.', 'success');
      setTimeout(async () => {
        try {
          showGlobalLoading('목록 새로고침 중...');
          await loadList();
        } finally {
          hideGlobalLoading();
        }
      }, 600);
    } catch (err) {
      await hideGlobalLoading();
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(submitBtn, false);
    }
  }

  function closeModal() {
    const modal = document.getElementById('processModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    currentItem = null;
  }
})();
