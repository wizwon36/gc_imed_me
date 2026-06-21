(function () {
  let allNotices = [];
  let editingNoticeId = null;
  let currentPage = 1;
  const PAGE_SIZE = 10;

  document.addEventListener('DOMContentLoaded', async () => {
    const user = window.auth?.requireAuth?.();
    if (!user) return;

    if (String(user.role || '').trim().toLowerCase() !== 'admin') {
      alert('관리자만 접근할 수 있습니다.');
      location.replace(`${CONFIG.SITE_BASE_URL}/portal.html`);
      return;
    }

    try {
      showGlobalLoading('목록을 불러오는 중...');
      await loadList();
    } catch (err) {
      showMessage(err.message || '목록을 불러오지 못했습니다.', 'error');
    } finally {
      hideGlobalLoading();
    }

    document.getElementById('btnNewNotice')?.addEventListener('click', () => openForm(null));
    document.getElementById('noticeFormCloseBtn')?.addEventListener('click', closeForm);
    document.getElementById('noticeCancelBtn')?.addEventListener('click', closeForm);
    document.getElementById('noticeFormBackdrop')?.addEventListener('click', closeForm);
    document.getElementById('noticeSaveBtn')?.addEventListener('click', saveNotice);

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      showGlobalLoading('로그아웃 중...');
      window.auth.logout();
    });
  });

  function getRequestUserEmail() {
    const user = window.auth?.getSession?.() || {};
    return user.email || user.user_email || '';
  }

  async function loadList() {
    clearMessage();
    const result = await apiGet('listNotices', { request_user_email: getRequestUserEmail() });
    allNotices = Array.isArray(result.data) ? result.data : [];
    currentPage = 1;
    renderTable();
  }

  function renderTable() {
    const tbody = document.getElementById('noticeTableBody');
    if (!tbody) return;

    if (!allNotices.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">등록된 공지사항이 없습니다.</td></tr>';
      renderPagination(0);
      return;
    }

    const totalPages = Math.max(1, Math.ceil(allNotices.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = allNotices.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = pageItems.map(n => {
      const period = n.end_date ? `${n.start_date} ~ ${n.end_date}` : `${n.start_date} ~ 무기한`;
      return `
        <tr>
          <td>${n.is_pinned ? '<span class="pin-badge">📌 고정</span>' : ''}</td>
          <td class="notice-title-cell" title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</td>
          <td class="notice-period-cell">${escapeHtml(period)}</td>
          <td>${escapeHtml((n.created_by || '').split('@')[0])}</td>
          <td>
            <div class="row-actions">
              <button type="button" class="btn" data-edit="${escapeHtml(n.notice_id)}">수정</button>
              <button type="button" class="btn btn--danger" data-delete="${escapeHtml(n.notice_id)}">삭제</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('[data-edit]').forEach(el => {
      el.addEventListener('click', () => {
        const notice = allNotices.find(n => n.notice_id === el.dataset.edit);
        if (notice) openForm(notice);
      });
    });

    tbody.querySelectorAll('[data-delete]').forEach(el => {
      el.addEventListener('click', () => handleDelete(el.dataset.delete));
    });

    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    const wrap = document.getElementById('noticePagination');
    if (!wrap) return;

    if (totalPages <= 1) {
      wrap.innerHTML = '';
      return;
    }

    const goTo = (page) => {
      if (page < 1 || page > totalPages || page === currentPage) return;
      currentPage = page;
      renderTable();
    };

    const buttons = [];

    buttons.push(`<button type="button" data-page="prev" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`);

    const pageNumbers = getPageNumbers(currentPage, totalPages);
    pageNumbers.forEach(p => {
      if (p === '...') {
        buttons.push('<span class="pagination-ellipsis">…</span>');
      } else {
        buttons.push(`<button type="button" data-page="${p}" class="${p === currentPage ? 'is-active' : ''}">${p}</button>`);
      }
    });

    buttons.push(`<button type="button" data-page="next" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`);

    wrap.innerHTML = buttons.join('');

    wrap.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.page;
        if (val === 'prev') goTo(currentPage - 1);
        else if (val === 'next') goTo(currentPage + 1);
        else goTo(Number(val));
      });
    });
  }

  function getPageNumbers(current, total) {
    const delta = 1;
    const range = [];
    const result = [];
    let last = null;

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      }
    }

    range.forEach(i => {
      if (last !== null && i - last > 1) result.push('...');
      result.push(i);
      last = i;
    });

    return result;
  }

  function openForm(notice) {
    editingNoticeId = notice ? notice.notice_id : null;
    document.getElementById('noticeFormTitle').textContent = notice ? '공지 수정' : '새 공지 등록';
    document.getElementById('noticeId').value = notice ? notice.notice_id : '';
    document.getElementById('noticeTitle').value = notice ? notice.title : '';
    document.getElementById('noticeContent').value = notice ? notice.content : '';
    document.getElementById('noticeStartDate').value = notice ? notice.start_date : todayStr();
    document.getElementById('noticeEndDate').value = notice && notice.end_date ? notice.end_date : '';
    document.getElementById('noticePinned').checked = !!(notice && notice.is_pinned);
    document.getElementById('noticeFormModal').style.display = '';
  }

  function closeForm() {
    document.getElementById('noticeFormModal').style.display = 'none';
    editingNoticeId = null;
  }

  function todayStr() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  async function saveNotice() {
    const title = document.getElementById('noticeTitle').value.trim();
    const content = document.getElementById('noticeContent').value.trim();
    const startDate = document.getElementById('noticeStartDate').value;
    const endDate = document.getElementById('noticeEndDate').value;
    const isPinned = document.getElementById('noticePinned').checked;

    if (!title) { alert('제목을 입력해 주세요.'); return; }
    if (!content) { alert('내용을 입력해 주세요.'); return; }
    if (!startDate) { alert('노출 시작일을 선택해 주세요.'); return; }
    if (endDate && endDate < startDate) { alert('노출 종료일은 시작일보다 빠를 수 없습니다.'); return; }

    const payload = {
      request_user_email: getRequestUserEmail(),
      title,
      content,
      start_date: startDate,
      end_date: endDate || '',
      is_pinned: isPinned
    };

    const saveBtn = document.getElementById('noticeSaveBtn');
    saveBtn.disabled = true;
    showGlobalLoading(editingNoticeId ? '수정 중...' : '등록 중...');

    try {
      if (editingNoticeId) {
        payload.notice_id = editingNoticeId;
        await apiPost('updateNotice', payload);
        showMessage('공지사항이 수정되었습니다.', 'success');
      } else {
        await apiPost('createNotice', payload);
        showMessage('공지사항이 등록되었습니다.', 'success');
      }
      closeForm();
      await loadList();
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      saveBtn.disabled = false;
      hideGlobalLoading();
    }
  }

  async function handleDelete(noticeId) {
    const notice = allNotices.find(n => n.notice_id === noticeId);
    if (!notice) return;
    if (!confirm(`'${notice.title}' 공지사항을 삭제하시겠습니까?`)) return;

    showGlobalLoading('삭제 중...');
    try {
      await apiPost('deleteNotice', { request_user_email: getRequestUserEmail(), notice_id: noticeId });
      showMessage('공지사항이 삭제되었습니다.', 'success');
      await loadList();
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      hideGlobalLoading();
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
