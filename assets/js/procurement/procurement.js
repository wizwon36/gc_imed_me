/**
 * procurement.js
 * GC녹십자아이메드 구매규정 앱
 *
 * view  : API로 섹션 내용 로드 후 렌더링
 * admin : 편집 버튼 노출 + 인라인 편집 모달
 */
document.addEventListener('DOMContentLoaded', async () => {

  // ── 권한 체크 ─────────────────────────────────────────────
  const ok = await window.appPermission?.requirePermission?.(
    'procurement', ['admin', 'view']
  );
  if (ok === false) return;

  const user = window.auth?.getSession?.();

  // role=admin 이면 app 권한 테이블과 무관하게 편집 가능
  // 그 외에는 procurement 앱의 permission 값이 'admin'인 경우만 편집 가능
  const isGlobalAdmin = String(user?.role || '').trim().toLowerCase() === 'admin';
  const permission    = await window.appPermission?.getPermission?.('procurement');
  const isAdmin       = isGlobalAdmin || permission === 'admin';

  // ── 섹션 데이터 로드 및 렌더링 ───────────────────────────
  await loadSections();

  // admin이면 편집 버튼 노출
  if (isAdmin) {
    document.querySelectorAll('.pr-edit-btn').forEach(btn => {
      btn.style.display = 'inline-flex';
    });
    initEditModal();
  }

  // ── 검색 ──────────────────────────────────────────────────
  const searchInput = document.getElementById('prSearchInput');
  const searchClear = document.getElementById('prSearchClear');
  const searchInfo  = document.getElementById('prSearchResultInfo');
  const allSections = document.querySelectorAll('.pr-section');

  let searchTimer = null;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 200);
  });
  searchClear?.addEventListener('click', () => {
    searchInput.value = '';
    doSearch();
    searchInput.focus();
  });

  function doSearch() {
    const q = (searchInput?.value || '').trim();
    searchClear.style.display = q ? 'block' : 'none';
    if (!q) { clearSearch(); return; }

    document.querySelectorAll('.pr-highlight').forEach(el => {
      el.outerHTML = el.textContent;
    });

    let matchCount = 0;
    allSections.forEach(section => {
      if ((section.textContent || '').toLowerCase().includes(q.toLowerCase())) {
        section.classList.remove('pr-section-hidden');
        matchCount += highlightInElement(section, q);
      } else {
        section.classList.add('pr-section-hidden');
      }
    });

    searchInfo.style.display = 'block';
    if (matchCount > 0) {
      searchInfo.textContent = `"${q}" 검색 결과: ${matchCount}건 발견`;
      searchInfo.style.color = '#1d4ed8';
    } else {
      searchInfo.textContent = `"${q}"에 해당하는 내용이 없습니다.`;
      searchInfo.style.color = '#dc2626';
    }

    const firstHL = document.querySelector('.pr-highlight');
    if (firstHL) firstHL.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearSearch() {
    document.querySelectorAll('.pr-highlight').forEach(el => {
      el.outerHTML = el.textContent;
    });
    allSections.forEach(s => s.classList.remove('pr-section-hidden'));
    if (searchInfo) searchInfo.style.display = 'none';
    if (searchClear) searchClear.style.display = 'none';
  }

  function highlightInElement(el, q) {
    let count = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    const regex = new RegExp(escapeRegex(q), 'gi');
    nodes.forEach(textNode => {
      if (textNode.parentElement?.classList?.contains('pr-highlight')) return;
      const match = textNode.textContent.match(regex);
      if (match) {
        count += match.length;
        const span = document.createElement('span');
        span.innerHTML = textNode.textContent.replace(
          regex, m => `<span class="pr-highlight">${escapeHtml(m)}</span>`
        );
        textNode.parentNode.replaceChild(span, textNode);
      }
    });
    return count;
  }

  function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function escapeHtml(str)  { return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── 목차 ──────────────────────────────────────────────────
  const SCROLL_OFFSET = 80;
  const tocLinks = document.querySelectorAll('.pr-toc-link[data-section]');

  function setActiveLink(id) {
    tocLinks.forEach(l => l.classList.remove('active'));
    const active = document.querySelector(`.pr-toc-link[data-section="${id}"]`);
    if (!active) return;
    active.classList.add('active');
    active.closest('.pr-toc-group')
      ?.querySelector('.pr-toc-link--h1')
      ?.classList.add('active');
  }

  let isScrollingByClick = false;
  let clickScrollTimer   = null;

  tocLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const id     = link.dataset.section;
      const target = document.getElementById(id);
      if (!target) return;
      setActiveLink(id);
      isScrollingByClick = true;
      clearTimeout(clickScrollTimer);
      clickScrollTimer = setTimeout(() => { isScrollingByClick = false; }, 800);
      const top = target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  const allAnchors = Array.from(
    document.querySelectorAll('.pr-section[id], .pr-subsection[id]')
  );

  function updateTocByScroll() {
    if (isScrollingByClick) return;
    const scrollTop = window.scrollY + SCROLL_OFFSET + 10;
    let current = allAnchors[0];
    for (const el of allAnchors) {
      if (el.offsetTop <= scrollTop) current = el;
      else break;
    }
    if (current) setActiveLink(current.id);
  }

  window.addEventListener('scroll', updateTocByScroll, { passive: true });
  updateTocByScroll();

  // ── 목차 접기/펼치기 ─────────────────────────────────────
  const tocToggle = document.getElementById('prTocToggle');
  const tocNav    = document.getElementById('prTocNav');
  const tocAside  = document.getElementById('prToc');

  tocToggle?.addEventListener('click', () => {
    const collapsed = tocAside.classList.toggle('pr-toc--collapsed');
    tocToggle.textContent = collapsed ? '▶' : '◀';
    tocNav.style.display  = collapsed ? 'none' : '';
  });

  // ── 맨 위로 버튼 ─────────────────────────────────────────
  const backToTop = document.getElementById('prBackToTop');
  window.addEventListener('scroll', () => {
    backToTop?.classList.toggle('visible', window.scrollY > 300);
  }, { passive: true });
  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  try { hideGlobalLoading(); } catch(e) {}
});

// ── 섹션 로드 및 렌더링 ──────────────────────────────────────
async function loadSections() {
  const user = window.auth?.getSession?.();
  if (!user?.email) return;

  try {
    const result = await apiGet('getProcurementSections', {
      request_user_email: user.email
    });

    if (!result?.success || !Array.isArray(result.data)) return;
    if (result.data.length === 0) return; // 아직 저장된 내용 없음 → HTML 기본값 유지

    // 각 섹션의 content_html을 DOM에 반영
    result.data.forEach(section => {
      const subsection = document.getElementById(section.sec_id);
      if (!subsection || !section.content_html) return;

      // h3 헤더(pr-subsection-header) 는 보존하고 나머지 콘텐츠만 교체
      const header = subsection.querySelector('.pr-subsection-header');
      // header 이후 노드를 모두 제거
      while (subsection.lastChild && subsection.lastChild !== header) {
        subsection.removeChild(subsection.lastChild);
      }
      // 새 콘텐츠 삽입
      const wrapper = document.createElement('div');
      wrapper.className = 'pr-subsection-content';
      wrapper.innerHTML = section.content_html;
      subsection.appendChild(wrapper);

      // 마지막 수정 정보 표시
      if (section.updated_at) {
        const info = document.createElement('p');
        info.className = 'pr-section-updated-info';
        info.textContent = `최종 수정: ${section.updated_at.substring(0, 16)} · ${section.updated_by || ''}`;
        subsection.appendChild(info);
      }
    });

  } catch (err) {
    // 로드 실패 시 기본 HTML 유지 (조용히 무시)
    console.warn('구매규정 섹션 로드 실패:', err.message);
  }
}

// ── 편집 모달 ─────────────────────────────────────────────────
function initEditModal() {
  const modal      = document.getElementById('prEditModal');
  const titleEl    = document.getElementById('prEditModalTitle');
  const subtitleEl = document.getElementById('prEditModalSubtitle');
  const editorArea = document.getElementById('prEditorArea');
  const saveBtn    = document.getElementById('prEditSaveBtn');
  const cancelBtn  = document.getElementById('prEditCancelBtn');
  const closeBtn   = document.getElementById('prEditModalClose');
  const msgEl      = document.getElementById('prEditModalMsg');
  const lastUpdEl  = document.getElementById('prEditLastUpdated');

  let currentSecId    = null;
  let currentSecTitle = null;

  // 편집 버튼 클릭 → 모달 열기
  document.querySelectorAll('.pr-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSecId    = btn.dataset.secId;
      currentSecTitle = btn.dataset.secTitle;

      titleEl.textContent    = '섹션 편집';
      subtitleEl.textContent = currentSecTitle;
      msgEl.style.display    = 'none';
      lastUpdEl.textContent  = '';

      // 현재 렌더링된 콘텐츠를 편집기로 불러오기
      const subsection = document.getElementById(currentSecId);
      const contentDiv = subsection?.querySelector('.pr-subsection-content');

      if (contentDiv) {
        editorArea.innerHTML = contentDiv.innerHTML;
      } else {
        // pr-subsection-header 를 제외한 모든 노드의 outerHTML
        let html = '';
        subsection?.childNodes.forEach(node => {
          if (node.nodeType === 1 && node.classList.contains('pr-subsection-header')) return;
          if (node.nodeType === 1 && node.classList.contains('pr-section-updated-info')) return;
          html += node.outerHTML || node.textContent || '';
        });
        editorArea.innerHTML = html;
      }

      openModal();
    });
  });

  // 도구모음 버튼
  document.querySelectorAll('.pr-tb-btn').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault(); // 포커스 유지
      const cmd = btn.dataset.cmd || '';
      if (cmd.startsWith('formatBlock:')) {
        document.execCommand('formatBlock', false, cmd.split(':')[1]);
      } else {
        document.execCommand(cmd, false, null);
      }
      editorArea.focus();
    });
  });

  // 저장
  saveBtn?.addEventListener('click', async () => {
    if (!currentSecId) return;

    const contentHtml = editorArea.innerHTML.trim();
    if (!contentHtml) {
      showMsg('내용을 입력해 주세요.', 'error');
      return;
    }

    const user = window.auth?.getSession?.();
    if (!user?.email) {
      showMsg('로그인 세션이 만료되었습니다.', 'error');
      return;
    }

    saveBtn.disabled   = true;
    saveBtn.textContent = '저장 중...';
    msgEl.style.display = 'none';

    try {
      const result = await apiPost('updateProcurementSection', {
        request_user_email: user.email,
        sec_id:       currentSecId,
        title:        currentSecTitle,
        content_html: contentHtml
      });

      if (!result?.success) throw new Error(result?.message || '저장에 실패했습니다.');

      // DOM 즉시 반영
      const subsection = document.getElementById(currentSecId);
      let contentDiv = subsection?.querySelector('.pr-subsection-content');
      if (!contentDiv) {
        contentDiv = document.createElement('div');
        contentDiv.className = 'pr-subsection-content';
        subsection.appendChild(contentDiv);
      }
      contentDiv.innerHTML = contentHtml;

      // 수정 정보 갱신
      let infoEl = subsection?.querySelector('.pr-section-updated-info');
      if (!infoEl) {
        infoEl = document.createElement('p');
        infoEl.className = 'pr-section-updated-info';
        subsection.appendChild(infoEl);
      }
      const updatedAt = result.data?.updated_at || '';
      infoEl.textContent = `최종 수정: ${updatedAt.substring(0, 16)} · ${user.email}`;

      showMsg('저장되었습니다.', 'success');
      setTimeout(closeModal, 800);

    } catch (err) {
      showMsg(err.message || '저장에 실패했습니다.', 'error');
    } finally {
      saveBtn.disabled    = false;
      saveBtn.textContent = '저장';
    }
  });

  // 닫기
  cancelBtn?.addEventListener('click', closeModal);
  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // Esc 키
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal?.style.display !== 'none') closeModal();
  });

  function openModal() {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => editorArea.focus(), 100);
  }

  function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    currentSecId    = null;
    currentSecTitle = null;
    editorArea.innerHTML = '';
    msgEl.style.display  = 'none';
  }

  function showMsg(text, type) {
    msgEl.textContent   = text;
    msgEl.className     = 'pr-modal-msg pr-modal-msg--' + type;
    msgEl.style.display = 'block';
  }
}

window.addEventListener('pageshow', e => {
  if (e.persisted) { try { hideGlobalLoading(); } catch(e) {} }
});
