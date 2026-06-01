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
  const backToTop    = document.getElementById('prBackToTop');
  const searchSection = document.getElementById('prSearchSection') ||
                        document.querySelector('.pr-search-section');

  window.addEventListener('scroll', () => {
    backToTop?.classList.toggle('visible', window.scrollY > 300);
    // 검색창이 상단에 붙으면 위쪽 모서리 각지게
    if (searchSection) {
      searchSection.classList.toggle('is-stuck', window.scrollY > 10);
    }
  }, { passive: true });
  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });


  // PDF 다운로드 버튼 초기화
  initPdfDownload();
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
    // 섹션 메타 캐시 초기화
    window.__procurementMeta = window.__procurementMeta || {};

    result.data.forEach(section => {
      // 메타 캐시 저장 (편집 모달에서 되돌리기/수정자 표시에 사용)
      window.__procurementMeta[section.sec_id] = {
        previous_html: section.previous_html || '',
        previous_at:   section.previous_at   || '',
        previous_by:   section.previous_by   || '',
        updated_at:    section.updated_at     || '',
        updated_by:    section.updated_by     || ''
      };

      const el = document.getElementById(section.sec_id);
      if (!el || !section.content_html) return;

      // 대섹션 intro
      if (section.sec_id.endsWith('-intro')) {
        const contentDiv = el.querySelector('.pr-section-intro-content');
        if (contentDiv) contentDiv.innerHTML = section.content_html;
        if (section.updated_at) {
          let info = el.querySelector('.pr-section-updated-info');
          if (!info) {
            info = document.createElement('p');
            info.className = 'pr-section-updated-info';
            el.appendChild(info);
          }
          info.textContent = `최종 수정: ${section.updated_at.substring(0, 16)} · ${section.updated_by || ''}`;
        }
        return;
      }

      // 소섹션
      const header = el.querySelector('.pr-subsection-header');
      while (el.lastChild && el.lastChild !== header) {
        el.removeChild(el.lastChild);
      }
      const wrapper = document.createElement('div');
      wrapper.className = 'pr-subsection-content';
      wrapper.innerHTML = section.content_html;
      el.appendChild(wrapper);

      if (section.updated_at) {
        const info = document.createElement('p');
        info.className = 'pr-section-updated-info';
        info.textContent = `최종 수정: ${section.updated_at.substring(0, 16)} · ${section.updated_by || ''}`;
        el.appendChild(info);
      }
    });

  } catch (err) {
    // 로드 실패 시 기본 HTML 유지 (조용히 무시)
    console.warn('구매규정 섹션 로드 실패:', err.message);
  }
}

// ── HTML 클래스 복구 후처리 ──────────────────────────────────────
// CKEditor가 getData() 시 일부 클래스/속성을 변환하므로
// 저장 전 DOM 파싱으로 원래 클래스 패턴을 복구
function restoreHtmlClasses(html) {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(html, 'text/html');

  // 0. 표 앞뒤 빈 p 태그 제거 (CKEditor 자동 삽입 방지)
  doc.querySelectorAll('p').forEach(p => {
    if (p.innerHTML.trim() === '' || p.innerHTML.trim() === '<br>') {
      // 표 바로 앞뒤의 빈 p만 제거
      const prev = p.previousElementSibling;
      const next = p.nextElementSibling;
      if ((prev && (prev.tagName === 'TABLE' || prev.tagName === 'FIGURE')) ||
          (next && (next.tagName === 'TABLE' || next.tagName === 'FIGURE'))) {
        p.remove();
      }
    }
  });

  // 1. <table> → pr-table 클래스 보장
  doc.querySelectorAll('table').forEach(table => {
    if (!table.classList.contains('pr-table')) {
      table.classList.add('pr-table');
    }
    // 작은 표 (pr-table--compact) 판단: th가 4개 이상이면 compact
    const thCount = table.querySelectorAll('th').length;
    if (thCount >= 4 && !table.classList.contains('pr-table--compact')) {
      table.classList.add('pr-table--compact');
    }
  });

  // 2. <figure class="table"> → <div class="pr-table-wrap">로 래핑 복구
  doc.querySelectorAll('figure.table').forEach(figure => {
    const wrap = doc.createElement('div');
    wrap.className = 'pr-table-wrap';
    figure.parentNode.insertBefore(wrap, figure);
    // figure 안의 table을 wrap으로 이동
    const table = figure.querySelector('table');
    if (table) wrap.appendChild(table);
    figure.remove();
  });

  // 3. <ul class="pr-list"> 가 없는 ul에 pr-list 부여
  doc.querySelectorAll('ul:not(.pr-list)').forEach(ul => {
    ul.classList.add('pr-list');
  });

  // 4. h4에 pr-h3 클래스가 없으면 추가 (소제목)
  doc.querySelectorAll('h4:not(.pr-h3)').forEach(h4 => {
    h4.classList.add('pr-h3');
  });

  return doc.body.innerHTML;
}

// ── 편집 모달 (CKEditor 5 + diff 확인 + 되돌리기) ──────────────
function initEditModal() {
  const modal       = document.getElementById('prEditModal');
  const titleEl     = document.getElementById('prEditModalTitle');
  const subtitleEl  = document.getElementById('prEditModalSubtitle');
  const msgEl       = document.getElementById('prEditModalMsg');
  const msgEl2      = document.getElementById('prEditModalMsg2');
  const lastUpdEl   = document.getElementById('prEditLastUpdated');

  // Step 1
  const step1       = document.getElementById('prEditStep1');
  const footer1     = document.getElementById('prEditFooter1');
  const previewBtn  = document.getElementById('prEditPreviewBtn');
  const cancelBtn   = document.getElementById('prEditCancelBtn');

  // Step 2
  const step2       = document.getElementById('prEditStep2');
  const footer2     = document.getElementById('prEditFooter2');
  const saveBtn     = document.getElementById('prEditSaveBtn');
  const backBtn     = document.getElementById('prEditBackBtn');
  const cancelBtn2  = document.getElementById('prEditCancelBtn2');
  const revertWrap  = document.getElementById('prRevertWrap');
  const revertBtn   = document.getElementById('prRevertBtn');
  const diffBefore  = document.getElementById('prDiffBefore');
  const diffAfter   = document.getElementById('prDiffAfter');
  const closeBtn    = document.getElementById('prEditModalClose');

  let currentSecId      = null;
  let currentSecTitle   = null;
  let currentPrevHtml   = '';  // 되돌리기용 직전 HTML
  let currentOrigHtml   = '';  // diff 비교용 편집 시작 시점 HTML
  let ckEditor          = null;

  // ── 섹션 메타데이터 맵 (로드 시 채워짐) ─────────────────────
  window.__procurementMeta = window.__procurementMeta || {};

  // ── CKEditor 초기화 ────────────────────────────────────────
  async function initCKEditor(initialContent) {
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
      Link,
      Style,
      GeneralHtmlSupport,
      Alignment
    } = await import(CKEDITOR_PATH);

    // procurement.css 경로
    const cssUrl = `${CONFIG.SITE_BASE_URL}/assets/css/pages/procurement.css`;

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
          Link,
          Style,
          GeneralHtmlSupport,
          Alignment
        ],
        toolbar: {
          items: [
            'heading', 'style', '|',
            'bold', 'italic', 'underline', 'strikethrough', '|',
            'fontColor', 'fontBackgroundColor', '|',
            'bulletedList', 'numberedList', '|',
            'alignment', '|',
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
        // ── 커스텀 스타일 드롭다운 ──────────────────────────────
        style: {
          definitions: [
            // 소제목 박스 (pr-h3)
            {
              name: '소제목 박스',
              element: 'h4',
              classes: ['pr-h3']
            },
            // 콜아웃 - 안내 (파란색)
            {
              name: '콜아웃 - 안내 (파랑)',
              element: 'div',
              classes: ['pr-callout', 'pr-callout--info']
            },
            // 콜아웃 - 주의 (노란색)
            {
              name: '콜아웃 - 주의 (노랑)',
              element: 'div',
              classes: ['pr-callout', 'pr-callout--warning']
            },
            // 콜아웃 - 위험 (빨간색)
            {
              name: '콜아웃 - 위험 (빨강)',
              element: 'div',
              classes: ['pr-callout', 'pr-callout--danger']
            },
            // 정의 그리드 항목
            {
              name: '정의 항목',
              element: 'div',
              classes: ['pr-def-item']
            }
          ]
        },
        // ── GHS: pr-* 클래스를 편집기에서 보존 ─────────────────
        htmlSupport: {
          allow: [
            {
              name: /.*/,
              attributes: true,
              classes: true,
              styles: true
            }
          ]
        },
        table: {
          contentToolbar: [
            'tableColumn', 'tableRow', 'mergeTableCells',
            'tableProperties', 'tableCellProperties'
          ],
          defaultHeadings: { rows: 0, columns: 0 }
        },
        // 테이블 컬럼 리사이즈 비활성화 → 항상 100% 너비 유지
        tableColumnResize: {
          useResizingColumnsWidth: false
        },
        // 정렬: 표 셀 안에서는 tableCellProperties 사용, 일반 텍스트만 alignment 적용
        alignment: {
          options: ['left', 'center', 'right', 'justify']
        },
        // ── 편집 영역에 procurement.css 주입 ───────────────────
        // CKEditor iframe 없이 shadow DOM 방식이므로 contentsCss 대신
        // editorReady 후 직접 주입
        initialData: initialContent || ''
      }
    );

    // 편집 영역에 procurement.css 스타일 주입
    injectEditorStyles(ckEditor, cssUrl);
  }

  // CKEditor 편집 영역에 외부 CSS 주입
  function injectEditorStyles(editor, cssUrl) {
    try {
      const editable = editor.ui.view.editable.element;
      if (!editable) return;

      // 이미 주입됐으면 스킵
      if (editable.closest('.ck-editor')?.querySelector('.pr-editor-injected-css')) return;

      const link = document.createElement('link');
      link.rel  = 'stylesheet';
      link.href = cssUrl;
      link.className = 'pr-editor-injected-css';

      // CKEditor 편집 영역의 부모에 삽입
      const ckRoot = editable.closest('.ck-editor__main') || editable.parentElement;
      if (ckRoot) ckRoot.appendChild(link);

      // editable 자체에 pr-content 클래스 추가 (CSS 셀렉터 매칭용)
      editable.classList.add('pr-editor-preview');
    } catch(e) {
      console.warn('CSS 주입 실패:', e);
    }
  }

  // ── 섹션 현재 콘텐츠 추출 ─────────────────────────────────
  function getSectionContent(secId) {
    const el = document.getElementById(secId);
    if (!el) return '';

    // 대섹션 intro (-intro 접미사)
    if (secId.endsWith('-intro')) {
      const contentDiv = el.querySelector('.pr-section-intro-content');
      return contentDiv ? contentDiv.innerHTML : '';
    }

    // 소섹션
    const contentDiv = el.querySelector('.pr-subsection-content');
    if (contentDiv) return contentDiv.innerHTML;
    let html = '';
    el.childNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.classList.contains('pr-subsection-header')) return;
      if (node.classList.contains('pr-section-updated-info')) return;
      html += node.outerHTML || '';
    });
    return html;
  }

  // ── 편집 버튼 클릭 ────────────────────────────────────────
  document.querySelectorAll('.pr-edit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      currentSecId    = btn.dataset.secId;
      currentSecTitle = btn.dataset.secTitle;
      currentOrigHtml = getSectionContent(currentSecId);

      // 직전 버전 확인 (로드 시 캐싱된 메타에서)
      const meta       = window.__procurementMeta[currentSecId] || {};
      currentPrevHtml  = meta.previous_html || '';

      titleEl.textContent    = '섹션 편집';
      subtitleEl.textContent = currentSecTitle;
      lastUpdEl.textContent  = meta.updated_at
        ? `최종 수정: ${meta.updated_at.substring(0, 16)} · ${meta.updated_by || ''}`
        : '';

      showStep(1);
      openModal();

      try {
        await initCKEditor(currentOrigHtml);
      } catch (err) {
        console.error('CKEditor 초기화 실패:', err);
        showMsg(msgEl, '편집기 초기화에 실패했습니다.', 'error');
      }
    });
  });

  // ── Step1 → Step2: 변경 내용 확인 ────────────────────────
  previewBtn?.addEventListener('click', () => {
    if (!ckEditor) return;
    const newHtml = ckEditor.getData().trim();
    if (!newHtml) {
      showMsg(msgEl, '내용을 입력해 주세요.', 'error');
      return;
    }

    // diff 패널 채우기
    diffBefore.innerHTML = currentOrigHtml || '<em style="color:#999">내용 없음</em>';
    diffAfter.innerHTML  = newHtml;

    // 되돌리기 버튼: 직전 버전이 있을 때만 노출
    revertWrap.style.display = currentPrevHtml ? 'inline-flex' : 'none';

    msgEl.style.display = 'none';
    showStep(2);
  });

  // ── Step2 → Step1: 다시 편집 ─────────────────────────────
  backBtn?.addEventListener('click', () => showStep(1));

  // ── 저장 확정 ─────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    if (!currentSecId || !ckEditor) return;
    const rawHtml     = ckEditor.getData().trim();
    const contentHtml = restoreHtmlClasses(rawHtml);
    if (!contentHtml) return;

    const user = window.auth?.getSession?.();
    if (!user?.email) { showMsg(msgEl2, '로그인 세션이 만료되었습니다.', 'error'); return; }

    saveBtn.disabled    = true;
    saveBtn.textContent = '저장 중...';
    msgEl2.style.display = 'none';
    setModalLoading(true, '저장 중...');

    try {
      const result = await apiPost('updateProcurementSection', {
        request_user_email: user.email,
        sec_id:       currentSecId,
        title:        currentSecTitle,
        content_html: contentHtml
      });

      if (!result?.success) throw new Error(result?.message || '저장에 실패했습니다.');

      // DOM 반영
      applyContentToDOM(currentSecId, contentHtml, result.data?.updated_at, user.email);

      // 메타 캐시 갱신
      window.__procurementMeta[currentSecId] = {
        previous_html: currentOrigHtml,
        previous_at:   window.__procurementMeta[currentSecId]?.updated_at || '',
        previous_by:   window.__procurementMeta[currentSecId]?.updated_by || '',
        updated_at:    result.data?.updated_at || '',
        updated_by:    user.email
      };

      showMsg(msgEl2, '저장되었습니다.', 'success');
      setTimeout(closeModal, 700);

    } catch (err) {
      showMsg(msgEl2, err.message || '저장에 실패했습니다.', 'error');
    } finally {
      saveBtn.disabled    = false;
      saveBtn.textContent = '저장 확정';
      setModalLoading(false);
    }
  });

  // ── 되돌리기 ──────────────────────────────────────────────
  revertBtn?.addEventListener('click', async () => {
    if (!currentPrevHtml) return;
    if (!confirm('이전 버전으로 되돌리시겠습니까?')) return;

    const user = window.auth?.getSession?.();
    if (!user?.email) { showMsg(msgEl2, '로그인 세션이 만료되었습니다.', 'error'); return; }

    revertBtn.disabled    = true;
    revertBtn.textContent = '되돌리는 중...';
    setModalLoading(true, '이전 버전으로 되돌리는 중...');

    try {
      const result = await apiPost('revertProcurementSection', {
        request_user_email: user.email,
        sec_id: currentSecId
      });

      if (!result?.success) throw new Error(result?.message || '되돌리기에 실패했습니다.');

      applyContentToDOM(currentSecId, result.data?.content_html, result.data?.updated_at, user.email);

      // 메타 캐시 갱신
      window.__procurementMeta[currentSecId] = {
        ...window.__procurementMeta[currentSecId],
        content_html: result.data?.content_html,
        updated_at:   result.data?.updated_at || '',
        updated_by:   user.email
      };

      showMsg(msgEl2, '이전 버전으로 되돌렸습니다.', 'success');
      setTimeout(closeModal, 700);

    } catch (err) {
      showMsg(msgEl2, err.message || '되돌리기에 실패했습니다.', 'error');
    } finally {
      revertBtn.disabled    = false;
      revertBtn.textContent = '↩ 이전 버전으로 되돌리기';
      setModalLoading(false);
    }
  });

  // ── 닫기 ──────────────────────────────────────────────────
  [cancelBtn, cancelBtn2, closeBtn].forEach(el => {
    el?.addEventListener('click', closeModal);
  });
  // 백드롭 클릭으로 닫기 — mousedown 시작이 modal 자체일 때만 닫힘
  // (편집 영역에서 드래그 후 백드롭에서 마우스를 떼는 경우 방지)
  let mousedownOnBackdrop = false;
  modal?.addEventListener('mousedown', e => {
    mousedownOnBackdrop = e.target === modal;
  });
  modal?.addEventListener('click', e => {
    if (e.target === modal && mousedownOnBackdrop) closeModal();
    mousedownOnBackdrop = false;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal?.style.display !== 'none') closeModal();
  });

  // ── 헬퍼 ──────────────────────────────────────────────────
  function showStep(n) {
    step1.style.display  = n === 1 ? '' : 'none';
    footer1.style.display = n === 1 ? '' : 'none';
    step2.style.display  = n === 2 ? '' : 'none';
    footer2.style.display = n === 2 ? '' : 'none';
    msgEl.style.display  = 'none';
    msgEl2.style.display = 'none';
  }

  function openModal() {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    currentSecId    = null;
    currentSecTitle = null;
    currentOrigHtml = '';
    currentPrevHtml = '';
    showStep(1);
    if (ckEditor) ckEditor.setData('');
  }

  function applyContentToDOM(secId, html, updatedAt, updatedBy) {
    const el = document.getElementById(secId);
    if (!el) return;

    // 대섹션 intro
    if (secId.endsWith('-intro')) {
      const contentDiv = el.querySelector('.pr-section-intro-content');
      if (contentDiv) contentDiv.innerHTML = html || '';

      let infoEl = el.querySelector('.pr-section-updated-info');
      if (!infoEl) {
        infoEl = document.createElement('p');
        infoEl.className = 'pr-section-updated-info';
        el.appendChild(infoEl);
      }
      infoEl.textContent = `최종 수정: ${(updatedAt || '').substring(0, 16)} · ${updatedBy || ''}`;
      return;
    }

    // 소섹션
    let contentDiv = el.querySelector('.pr-subsection-content');
    if (!contentDiv) {
      contentDiv = document.createElement('div');
      contentDiv.className = 'pr-subsection-content';
      el.appendChild(contentDiv);
    }
    contentDiv.innerHTML = html || '';

    let infoEl = el.querySelector('.pr-section-updated-info');
    if (!infoEl) {
      infoEl = document.createElement('p');
      infoEl.className = 'pr-section-updated-info';
      el.appendChild(infoEl);
    }
    infoEl.textContent = `최종 수정: ${(updatedAt || '').substring(0, 16)} · ${updatedBy || ''}`;
  }

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent   = text;
    el.className     = 'pr-modal-msg pr-modal-msg--' + type;
    el.style.display = 'block';
  }

  // ── 모달 로딩 오버레이 ────────────────────────────────────
  function setModalLoading(on, message) {
    let overlay = modal.querySelector('.pr-modal-loading');

    if (on) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'pr-modal-loading';
        overlay.innerHTML = `
          <div class="pr-modal-loading-inner">
            <div class="pr-modal-spinner"></div>
            <span class="pr-modal-loading-text"></span>
          </div>`;
        modal.appendChild(overlay);
      }
      overlay.querySelector('.pr-modal-loading-text').textContent = message || '처리 중...';
      overlay.style.display = 'flex';
      // 푸터 버튼 전체 비활성화
      modal.querySelectorAll('.pr-modal-footer button').forEach(b => { b.disabled = true; });
    } else {
      if (overlay) overlay.style.display = 'none';
      // 푸터 버튼 활성화 복구 (개별 버튼 disabled는 각자 처리)
      modal.querySelectorAll('.pr-modal-footer button').forEach(b => { b.disabled = false; });
    }
  }
}


// ── PDF 다운로드 ──────────────────────────────────────────────
function initPdfDownload() {
  const btn = document.getElementById('prPdfDownload');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // 표지 생성
    const cover = buildCoverPage();
    // 목차 생성
    const toc = buildTocPage();
    // 인쇄용 헤더
    const header = buildPrintHeader();

    const content = document.querySelector('.pr-content');
    content.insertBefore(header, content.firstChild);
    content.insertBefore(toc,    content.firstChild);
    content.insertBefore(cover,  content.firstChild);

    window.print();

    // 인쇄 후 제거
    cover.remove();
    toc.remove();
    header.remove();
  });
}

function buildCoverPage() {
  const today = new Date();
  const ver   = document.querySelector('.pr-badge--green')?.textContent || 'Ver 6.0';
  const date  = document.querySelector('.pr-badge--blue')?.textContent  || '2023.07.01 시행';

  const div = document.createElement('div');
  div.className = 'pr-cover';
  div.innerHTML = `
    <div class="pr-cover-top">
      <span class="pr-cover-top-text">GC PROCUREMENT REGULATION</span>
    </div>
    <div class="pr-cover-body">
      <div class="pr-cover-label">Green Book</div>
      <div class="pr-cover-title">구매규정</div>
      <div class="pr-cover-subtitle">GC녹십자아이메드</div>
      <div class="pr-cover-divider"></div>
      <div class="pr-cover-meta">
        <div class="pr-cover-meta-row">
          <span class="pr-cover-meta-label">버전</span>
          <span>${ver}</span>
        </div>
        <div class="pr-cover-meta-row">
          <span class="pr-cover-meta-label">시행일</span>
          <span>${date.replace(' 시행','')}</span>
        </div>
        <div class="pr-cover-meta-row">
          <span class="pr-cover-meta-label">출력일</span>
          <span>${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}</span>
        </div>
      </div>
    </div>
    <div class="pr-cover-bottom">
      <span class="pr-cover-company">GC녹십자아이메드 MSO관리팀</span>
      <span class="pr-cover-gc-logo">+<span>GC</span></span>
    </div>
  `;
  return div;
}

function buildTocPage() {
  const div = document.createElement('div');
  div.className = 'pr-print-toc';

  let html = '<div class="pr-print-toc-title">CONTENTS</div>';

  // 대섹션과 소섹션 순회
  document.querySelectorAll('.pr-section').forEach(section => {
    const h1 = section.querySelector('.pr-h1');
    if (!h1) return;

    const h1Text = h1.textContent.trim();
    html += `
      <div class="pr-toc-entry pr-toc-entry--h1">
        <span>${h1Text}</span>
        <span class="pr-toc-entry-dots"></span>
      </div>`;

    section.querySelectorAll('.pr-subsection').forEach(sub => {
      const h2 = sub.querySelector('.pr-h2');
      if (!h2) return;
      const h2Text = h2.textContent.trim();
      html += `
        <div class="pr-toc-entry" style="padding-left:4mm;">
          <span>${h2Text}</span>
          <span class="pr-toc-entry-dots"></span>
        </div>`;
    });
  });

  div.innerHTML = html;
  return div;
}

function buildPrintHeader() {
  const div = document.createElement('div');
  div.className = 'pr-print-page-header';
  div.innerHTML = `
    <span>GC녹십자아이메드 구매규정</span>
    <span>Green Book</span>
  `;
  return div;
}

window.addEventListener('pageshow', e => {
  if (e.persisted) { try { hideGlobalLoading(); } catch(e) {} }
});
