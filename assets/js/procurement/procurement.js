/**
 * procurement.js
 * GC녹십자아이메드 구매규정 앱
 *
 * view  : API로 섹션 내용 로드 후 렌더링
 * admin : 편집 버튼 노출 + 인라인 편집 모달 (CKEditor 5 v43)
 */

// CKEditor ESM 파일 경로 (procurement.js 기준 상대경로)
const CKEDITOR_PATH = `${CONFIG.SITE_BASE_URL}/assets/libs/ckeditor5/ckeditor5.js`;
document.addEventListener('DOMContentLoaded', async () => {

  // ── 전역 스피너 시작 ───────────────────────────────────────
  try { showGlobalLoading('구매규정 불러오는 중...'); } catch(e) {}

  try {
    // ── 권한 체크 ───────────────────────────────────────────
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

    // ── 섹션 데이터 로드 및 렌더링 ─────────────────────────
    await loadSections();

    // admin이면 편집 버튼 노출
    if (isAdmin) {
      document.querySelectorAll('.pr-edit-btn').forEach(btn => {
        btn.style.display = 'inline-flex';
      });
      initEditModal();
    }

  } finally {
    // 권한체크 + 섹션 로드가 모두 끝난 뒤 스피너 해제
    try { hideGlobalLoading(); } catch(e) {}
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

    // 이전 하이라이트 제거
    document.querySelectorAll('.pr-highlight').forEach(el => {
      el.outerHTML = el.textContent;
    });

    const allSubsections = document.querySelectorAll('.pr-subsection');
    let matchedSubsections = 0;

    // ── 소섹션 단위 필터링 ──────────────────────────────────
    allSubsections.forEach(sub => {
      if ((sub.textContent || '').toLowerCase().includes(q.toLowerCase())) {
        sub.classList.remove('pr-subsection-hidden');
        highlightInElement(sub, q);
        matchedSubsections++;
      } else {
        sub.classList.add('pr-subsection-hidden');
      }
    });

    // ── 대섹션: 하나라도 매칭된 소섹션이 있으면 보임 ────────
    allSections.forEach(section => {
      const hasVisible = section.querySelector('.pr-subsection:not(.pr-subsection-hidden)');
      if (hasVisible) {
        section.classList.remove('pr-section-hidden');
      } else {
        section.classList.add('pr-section-hidden');
      }
    });

    searchInfo.style.display = 'block';
    if (matchedSubsections > 0) {
      searchInfo.textContent = `"${q}" 검색 결과: ${matchedSubsections}개 조항 발견`;
      searchInfo.style.color = '#1d4ed8';
    } else {
      searchInfo.textContent = `"${q}"에 해당하는 조항이 없습니다.`;
      searchInfo.style.color = '#dc2626';
    }

    // 첫 번째 매칭 소섹션으로 스크롤
    const firstMatch = document.querySelector('.pr-subsection:not(.pr-subsection-hidden)');
    if (firstMatch) {
      const top = firstMatch.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  function clearSearch() {
    document.querySelectorAll('.pr-highlight').forEach(el => {
      el.outerHTML = el.textContent;
    });
    document.querySelectorAll('.pr-subsection').forEach(s => s.classList.remove('pr-subsection-hidden'));
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

// ── 편집 모달 (CKEditor 5) ────────────────────────────────────
function initEditModal() {
  const modal      = document.getElementById('prEditModal');
  const titleEl    = document.getElementById('prEditModalTitle');
  const subtitleEl = document.getElementById('prEditModalSubtitle');
  const saveBtn    = document.getElementById('prEditSaveBtn');
  const cancelBtn  = document.getElementById('prEditCancelBtn');
  const closeBtn   = document.getElementById('prEditModalClose');
  const msgEl      = document.getElementById('prEditModalMsg');
  const lastUpdEl  = document.getElementById('prEditLastUpdated');

  let currentSecId    = null;
  let currentSecTitle = null;
  let ckEditor        = null; // CKEditor 인스턴스

  // ── CKEditor 초기화 (v43 ESM) ─────────────────────────────
  async function initCKEditor(initialContent) {
    // 이미 인스턴스가 있으면 내용만 교체
    if (ckEditor) {
      ckEditor.setData(initialContent || '');
      return;
    }

    const {
      ClassicEditor,
      Bold, Italic, Underline, Strikethrough,
      Heading,
      List, ListProperties,
      BlockQuote,
      Table, TableToolbar, TableProperties, TableCellProperties,
      HorizontalLine,
      Indent, IndentBlock,
      Undo,
      FontColor, FontBackgroundColor,
      RemoveFormat,
      SourceEditing,
      Essentials, Paragraph,
      AutoFormat,
      Link
    } = await import(CKEDITOR_PATH);

    ckEditor = await ClassicEditor.create(
      document.getElementById('prEditorArea'),
      {
        plugins: [
          Essentials, Paragraph,
          Bold, Italic, Underline, Strikethrough,
          Heading,
          List, ListProperties,
          BlockQuote,
          Table, TableToolbar, TableProperties, TableCellProperties,
          HorizontalLine,
          Indent, IndentBlock,
          Undo,
          FontColor, FontBackgroundColor,
          RemoveFormat,
          SourceEditing,
          Link
        ],
        toolbar: {
          items: [
            'heading', '|',
            'bold', 'italic', 'underline', 'strikethrough', '|',
            'fontColor', 'fontBackgroundColor', '|',
            'bulletedList', 'numberedList', '|',
            'outdent', 'indent', '|',
            'blockQuote', 'insertTable', 'horizontalLine', 'link', '|',
            'removeFormat', '|',
            'undo', 'redo', '|',
            'sourceEditing'
          ],
          shouldNotGroupWhenFull: false
        },
        heading: {
          options: [
            { model: 'paragraph', title: '본문',        class: 'ck-heading_paragraph' },
            { model: 'heading3',  view: 'h3', title: '제목 (H3)',    class: 'ck-heading_heading3' },
            { model: 'heading4',  view: 'h4', title: '소제목 (H4)',  class: 'ck-heading_heading4' }
          ]
        },
        table: {
          contentToolbar: [
            'tableColumn', 'tableRow', 'mergeTableCells',
            'tableProperties', 'tableCellProperties'
          ]
        },
        initialData: initialContent || ''
      }
    );
  }

  // ── 섹션 현재 콘텐츠 추출 ─────────────────────────────────
  function getSectionContent(secId) {
    const subsection = document.getElementById(secId);
    const contentDiv = subsection?.querySelector('.pr-subsection-content');
    if (contentDiv) return contentDiv.innerHTML;

    let html = '';
    subsection?.childNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.classList.contains('pr-subsection-header')) return;
      if (node.classList.contains('pr-section-updated-info')) return;
      html += node.outerHTML || '';
    });
    return html;
  }

  // ── 편집 버튼 클릭 → 모달 열기 ───────────────────────────
  document.querySelectorAll('.pr-edit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      currentSecId    = btn.dataset.secId;
      currentSecTitle = btn.dataset.secTitle;

      titleEl.textContent    = '섹션 편집';
      subtitleEl.textContent = currentSecTitle;
      msgEl.style.display    = 'none';
      lastUpdEl.textContent  = '';

      openModal();

      // CKEditor 초기화 (비동기)
      try {
        await initCKEditor(getSectionContent(currentSecId));
      } catch (err) {
        console.error('CKEditor 초기화 실패:', err);
        showMsg('편집기 초기화에 실패했습니다.', 'error');
      }
    });
  });

  // ── 저장 ──────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    if (!currentSecId || !ckEditor) return;

    const contentHtml = ckEditor.getData().trim();
    if (!contentHtml) {
      showMsg('내용을 입력해 주세요.', 'error');
      return;
    }

    const user = window.auth?.getSession?.();
    if (!user?.email) {
      showMsg('로그인 세션이 만료되었습니다.', 'error');
      return;
    }

    saveBtn.disabled    = true;
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

  // ── 닫기 ──────────────────────────────────────────────────
  cancelBtn?.addEventListener('click', closeModal);
  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal?.style.display !== 'none') closeModal();
  });

  function openModal() {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    currentSecId    = null;
    currentSecTitle = null;
    msgEl.style.display = 'none';
    // 에디터 내용만 비움 (인스턴스 재사용)
    if (ckEditor) ckEditor.setData('');
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
