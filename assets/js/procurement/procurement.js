/**
 * procurement.js
 * GC녹십자아이메드 구매규정 앱
 */
document.addEventListener('DOMContentLoaded', async () => {

  // ── 권한 체크 ──────────────────────────────────────────────────
  const ok = await window.appPermission?.requirePermission?.('procurement', ['admin', 'manager', 'edit', 'view']);
  if (ok === false) return;

  // ── 검색 ───────────────────────────────────────────────────────
  const searchInput  = document.getElementById('prSearchInput');
  const searchClear  = document.getElementById('prSearchClear');
  const searchInfo   = document.getElementById('prSearchResultInfo');
  const allSections  = document.querySelectorAll('.pr-section');
  const allSubsections = document.querySelectorAll('.pr-subsection');

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

    if (!q) {
      clearSearch();
      return;
    }

    // 이전 하이라이트 제거
    document.querySelectorAll('.pr-highlight').forEach(el => {
      el.outerHTML = el.textContent;
    });

    let matchCount = 0;

    allSections.forEach(section => {
      const text = section.textContent || '';
      if (text.toLowerCase().includes(q.toLowerCase())) {
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

    // 첫 번째 하이라이트로 스크롤
    const firstHL = document.querySelector('.pr-highlight');
    if (firstHL) {
      firstHL.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function clearSearch() {
    document.querySelectorAll('.pr-highlight').forEach(el => {
      el.outerHTML = el.textContent;
    });
    allSections.forEach(s => s.classList.remove('pr-section-hidden'));
    searchInfo.style.display = 'none';
    searchClear.style.display = 'none';
  }

  function highlightInElement(el, q) {
    let count = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }
    const regex = new RegExp(escapeRegex(q), 'gi');
    nodes.forEach(textNode => {
      if (textNode.parentElement?.classList?.contains('pr-highlight')) return;
      const match = textNode.textContent.match(regex);
      if (match) {
        count += match.length;
        const span = document.createElement('span');
        span.innerHTML = textNode.textContent.replace(
          regex,
          m => `<span class="pr-highlight">${escapeHtml(m)}</span>`
        );
        textNode.parentNode.replaceChild(span, textNode);
      }
    });
    return count;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── 목차 활성화 (IntersectionObserver) ───────────────────────
  const tocLinks = document.querySelectorAll('.pr-toc-link[data-section]');
  const sectionEls = {};

  tocLinks.forEach(link => {
    const id = link.dataset.section;
    const el = document.getElementById(id);
    if (el) sectionEls[id] = el;
  });

  const observerOptions = {
    root: null,
    rootMargin: '-15% 0px -70% 0px',
    threshold: 0
  };

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        tocLinks.forEach(l => l.classList.remove('active'));
        const id = entry.target.id;
        const activeLink = document.querySelector(`.pr-toc-link[data-section="${id}"]`);
        activeLink?.classList.add('active');
        // 부모 h1 link도 활성화
        const parentH1 = activeLink?.closest('.pr-toc-group')?.querySelector('.pr-toc-link--h1');
        parentH1?.classList.add('active');
      }
    });
  }, observerOptions);

  Object.values(sectionEls).forEach(el => observer.observe(el));

  // 목차 링크 클릭 → 부드럽게 이동
  tocLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const id = link.dataset.section;
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── 목차 접기/펼치기 ─────────────────────────────────────────
  const tocToggle = document.getElementById('prTocToggle');
  const tocNav    = document.getElementById('prTocNav');
  const tocAside  = document.getElementById('prToc');

  tocToggle?.addEventListener('click', () => {
    const collapsed = tocAside.classList.toggle('pr-toc--collapsed');
    tocToggle.textContent = collapsed ? '▶' : '◀';
    tocNav.style.display = collapsed ? 'none' : '';
  });

  // ── 맨 위로 버튼 ─────────────────────────────────────────────
  const backToTop = document.getElementById('prBackToTop');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      backToTop?.classList.add('visible');
    } else {
      backToTop?.classList.remove('visible');
    }
  });

  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── 로딩 완료 ─────────────────────────────────────────────────
  try { hideGlobalLoading(); } catch(e) {}
});

window.addEventListener('pageshow', e => {
  if (e.persisted) {
    try { hideGlobalLoading(); } catch(e) {}
  }
});
