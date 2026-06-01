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
      <span class="pr-cover-gc-logo"><img src="data:image/png;base64,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" alt="GC녹십자아이메드 로고" /></span>
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
