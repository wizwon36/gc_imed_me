/**
 * procurement.js
 * GC녹십자아이메드 구매규정 앱
 * - 백엔드 통신 없음 (조회 전용)
 * - 권한 체크만 수행
 */
document.addEventListener('DOMContentLoaded', async () => {

  // ── 권한 체크 (백엔드 통신 없이 캐시된 세션 기반) ────────────
  const ok = await window.appPermission?.requirePermission?.('procurement', ['admin', 'manager', 'edit', 'view']);
  if (ok === false) return;

  // ── 검색 ──────────────────────────────────────────────────────
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

  // ── 목차 ──────────────────────────────────────────────────────
  const SCROLL_OFFSET = 80; // px — 상단 고정 요소 높이
  const tocLinks = document.querySelectorAll('.pr-toc-link[data-section]');

  // 활성 링크 설정 헬퍼
  function setActiveLink(id) {
    tocLinks.forEach(l => l.classList.remove('active'));
    const active = document.querySelector(`.pr-toc-link[data-section="${id}"]`);
    if (!active) return;
    active.classList.add('active');
    active.closest('.pr-toc-group')
      ?.querySelector('.pr-toc-link--h1')
      ?.classList.add('active');
  }

  // ── 목차 클릭 → 정확한 위치 이동 ─────────────────────────────
  // 클릭 중에는 Observer를 잠시 중단해서 오동작 방지
  let isScrollingByClick = false;
  let clickScrollTimer   = null;

  tocLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const id     = link.dataset.section;
      const target = document.getElementById(id);
      if (!target) return;

      // 클릭 즉시 활성화 고정
      setActiveLink(id);

      // Observer 일시 중단 (스크롤 완료까지 약 800ms)
      isScrollingByClick = true;
      clearTimeout(clickScrollTimer);
      clickScrollTimer = setTimeout(() => { isScrollingByClick = false; }, 800);

      const top = target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  // ── 자연 스크롤 시 목차 활성화 (Observer) ────────────────────
  // section + subsection 모두 감지
  // 현재 뷰포트 상단에 가장 가까운 앵커를 활성화
  const allAnchors = Array.from(
    document.querySelectorAll('.pr-section[id], .pr-subsection[id]')
  );

  function updateTocByScroll() {
    if (isScrollingByClick) return;

    const scrollTop = window.scrollY + SCROLL_OFFSET + 10;

    // 현재 스크롤 위치를 지난 앵커 중 가장 마지막(가장 아래)을 찾음
    let current = allAnchors[0];
    for (const el of allAnchors) {
      if (el.offsetTop <= scrollTop) {
        current = el;
      } else {
        break;
      }
    }

    if (current) setActiveLink(current.id);
  }

  window.addEventListener('scroll', updateTocByScroll, { passive: true });
  updateTocByScroll(); // 초기 실행

  // ── 목차 접기/펼치기 ──────────────────────────────────────────
  const tocToggle = document.getElementById('prTocToggle');
  const tocNav    = document.getElementById('prTocNav');
  const tocAside  = document.getElementById('prToc');

  tocToggle?.addEventListener('click', () => {
    const collapsed = tocAside.classList.toggle('pr-toc--collapsed');
    tocToggle.textContent = collapsed ? '▶' : '◀';
    tocNav.style.display  = collapsed ? 'none' : '';
  });

  // ── 맨 위로 버튼 ──────────────────────────────────────────────
  const backToTop = document.getElementById('prBackToTop');
  window.addEventListener('scroll', () => {
    backToTop?.classList.toggle('visible', window.scrollY > 300);
  }, { passive: true });
  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── 완료 ──────────────────────────────────────────────────────
  try { hideGlobalLoading(); } catch(e) {}
});

window.addEventListener('pageshow', e => {
  if (e.persisted) { try { hideGlobalLoading(); } catch(e) {} }
});
