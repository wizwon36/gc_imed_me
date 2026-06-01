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
    const table  = figure.querySelector('table');
    const figcap = figure.querySelector('figcaption');
    if (!table) { figure.remove(); return; }

    const wrap = doc.createElement('div');
    wrap.className = 'pr-table-wrap';

    // figcaption → pr-table-caption 복구
    if (figcap) {
      const cap = doc.createElement('p');
      cap.className   = 'pr-table-caption';
      cap.textContent = figcap.textContent;
      wrap.appendChild(cap);
    } else {
      // figure 바로 앞 p 태그가 캡션이면 wrap 안으로 이동
      const prevEl = figure.previousElementSibling;
      if (prevEl && prevEl.tagName === 'P' && /^\[표/.test(prevEl.textContent.trim())) {
        const cap = doc.createElement('p');
        cap.className   = 'pr-table-caption';
        cap.textContent = prevEl.textContent;
        wrap.appendChild(cap);
        prevEl.remove();
      }
    }

    wrap.appendChild(table);
    figure.parentNode.insertBefore(wrap, figure);
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
      return contentDiv ? unwrapTableWraps(contentDiv.innerHTML) : '';
    }

    // 소섹션
    const contentDiv = el.querySelector('.pr-subsection-content');
    if (contentDiv) return unwrapTableWraps(contentDiv.innerHTML);
    let html = '';
    el.childNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.classList.contains('pr-subsection-header')) return;
      if (node.classList.contains('pr-section-updated-info')) return;
      html += node.outerHTML || '';
    });
    return unwrapTableWraps(html);
  }

  // CKEditor에 넘기기 전 pr-table-wrap 래퍼 제거 (table만 남김)
  // → CKEditor가 figure.table로 변환하고, 저장 시 다시 pr-table-wrap으로 복구
  function unwrapTableWraps(html) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');

    // pr-table-wrap 안의 table을 꺼내고 wrap 제거
    doc.querySelectorAll('.pr-table-wrap').forEach(wrap => {
      const table   = wrap.querySelector('table');
      const caption = wrap.querySelector('.pr-table-caption');
      if (!table) return;

      // caption이 있으면 p태그로 table 앞에 삽입
      if (caption) {
        const p = doc.createElement('p');
        p.textContent = caption.textContent;
        wrap.parentNode.insertBefore(p, wrap);
      }
      // table을 wrap 위치로 올리기
      wrap.parentNode.insertBefore(table, wrap);
      wrap.remove();
    });

    return doc.body.innerHTML;
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

    // pr-print-only 클래스로 화면에서 숨긴 채 삽입
    cover.classList.add('pr-print-only');
    toc.classList.add('pr-print-only');
    header.classList.add('pr-print-only');

    const content = document.querySelector('.pr-content');
    content.insertBefore(header, content.firstChild);
    content.insertBefore(toc,    content.firstChild);
    content.insertBefore(cover,  content.firstChild);

    // 이미지 로드 완료 후 인쇄 (로고 출력 보장)
    const imgs = cover.querySelectorAll('img');
    const imgLoadPromises = Array.from(imgs).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.onload  = resolve;
        img.onerror = resolve;
      });
    });

    Promise.all(imgLoadPromises).then(() => {
      window.print();
      // 인쇄 후 제거
      cover.remove();
      toc.remove();
      header.remove();
    });
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
      <span class="pr-cover-gc-logo"><img src="data:image/jpeg;base64,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" alt="GC녹십자아이메드 로고" /></span>
    </div>
  `;
  return div;
}

function buildTocPage() {
  const div = document.createElement('div');
  div.className = 'pr-print-toc';

  let html = '<div class="pr-print-toc-title">CONTENTS</div>';

  // 대섹션과 소섹션 순회 (편집 버튼 텍스트 제외)
  document.querySelectorAll('.pr-section').forEach(section => {
    const h1 = section.querySelector('.pr-h1');
    if (!h1) return;

    // 편집 버튼 제외한 순수 제목 텍스트만 추출
    const h1Clone = h1.cloneNode(true);
    h1Clone.querySelectorAll('.pr-edit-btn, .pr-edit-btn--section, button').forEach(el => el.remove());
    const h1Text = h1Clone.textContent.trim();

    html += `
      <div class="pr-toc-entry pr-toc-entry--h1">
        <span>${h1Text}</span>
        <span class="pr-toc-entry-dots"></span>
      </div>`;

    section.querySelectorAll('.pr-subsection').forEach(sub => {
      const header = sub.querySelector('.pr-subsection-header');
      const h2 = sub.querySelector('.pr-h2');
      if (!h2) return;
      const h2Clone = h2.cloneNode(true);
      h2Clone.querySelectorAll('button').forEach(el => el.remove());
      const h2Text = h2Clone.textContent.trim();
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
