document.addEventListener('DOMContentLoaded', async () => {
  const nameEl = document.getElementById('portalUserName');
  const subEl = document.getElementById('portalUserSub');
  const gridEl = document.getElementById('portalAppGrid');
  const emptyEl = document.getElementById('portalEmpty');
  const favSectionEl = document.getElementById('portalFavoritesSection');
  const favGridEl = document.getElementById('portalFavoritesGrid');
  const adminSectionEl = document.getElementById('portalAdminAppsSection');
  const adminGridEl = document.getElementById('portalAdminAppGrid');
  const logoutBtn = document.getElementById('logoutBtn');

  logoutBtn?.addEventListener('click', () => {
    try {
      showGlobalLoading('로그아웃 중...');
    } catch (e) {}
    window.auth.logout();
  });

  const user = window.auth?.getSession?.();
  if (!user) {
    alert('로그인 세션이 만료되었습니다.\n다시 로그인해 주세요.');
    location.replace(`${CONFIG.SITE_BASE_URL}/index.html`);
    return;
  }

  if (nameEl) {
    nameEl.textContent = user.name || user.email || '사용자';
  }

  if (subEl) {
    const clinicName = user.clinic_name || '';
    const teamName = user.team_name || '';
    const dept = user.department || ((clinicName && teamName) ? `${clinicName} / ${teamName}` : '소속 없음');
    const role = user.role || 'user';
    subEl.textContent = `${dept} / ${role}`;
  }

  const isAdmin = String(user.role || '').trim().toLowerCase() === 'admin';

  const startedAt = Date.now();

  try {
    showGlobalLoading('앱 목록 불러오는 중...');

    // 단일 진실 소스화(2026-06) — 11개 앱의 이름/설명/아이콘/URL/표시순서를
    // 여기 APP_MAP에 하드코딩하고 있었는데, 같은 정보가 users.html의 정적
    // 라디오 버튼 마크업과 user_app_permissions DB의 CHECK 제약에도 각각
    // 따로 하드코딩되어 있어 앱 하나 추가할 때마다 3곳을 사람이 맞춰
    // 고쳐야 했다. app_registry 테이블(GAS의 getAppRegistry API)을 단일
    // 진실 소스로 두고 동적으로 가져온다 — 이제 앱 추가는 그 테이블에
    // 행 하나 넣는 것으로 끝나고, 이 파일은 손댈 필요가 없다.
    const [registryResult, permissionResult] = await Promise.all([
      apiGet('getAppRegistry', { request_user_email: user.email }),
      apiGet('getUserPermissions', { user_email: user.email, request_user_email: user.email })
    ]);

    const appList = Array.isArray(registryResult.data) ? registryResult.data : [];
    // app_registry는 이미 sort_order로 정렬되어 내려오므로 그 순서를 그대로 표시 순서로 사용

    const permissions = Array.isArray(permissionResult.data) ? [...permissionResult.data] : [];

    // 관리자 전용 앱 자동 추가 (admin_auto_grant=true인 앱은 admin 역할이면 항상 접근 가능)
    if (isAdmin) {
      appList
        .filter(app => app.admin_auto_grant)
        .forEach(app => {
          if (!permissions.some(item => item.app_id === app.app_id)) {
            permissions.push({ app_id: app.app_id, permission: 'admin', active: 'Y' });
          }
        });
    }

    // support / support_admin 은 권한 기반으로만 노출 (강제 노출 제거)

    const grantedAppIds = new Set(
      permissions
        .filter(item => item && item.app_id && String(item.active || 'Y').trim().toUpperCase() === 'Y')
        .map(item => item.app_id)
    );

    // 카드 비활성 표시(2026-06) — 권한이 없는 앱은 기존엔 화면에서 완전히
    // 안 보였는데, 그러면 사용자가 어떤 앱이 있는지조차 몰라 권한 요청을
    // 할 수 없었다. admin_auto_grant=false인 일반 앱(의료장비/사인물/
    // 정도관리/업무일정/월마감/통계/규정/수정요청)은 권한이 없어도 카드를
    // 보여주되 클릭은 막는다(비활성). admin_auto_grant=true인 관리자 전용
    // 4개(사용자관리/시스템로그/수정요청관리/공지사항관리)는 기존처럼 권한
    // 없으면 완전히 숨긴다 — 일반 사용자에게 관리 기능 존재 자체를 노출하지 않기 위함.
    //
    // 컴팩트 재설계(2026-06) — 앱이 11개를 넘어가며 한 줄짜리 큰 카드가
    // 화면을 너무 많이 차지했다. 노션 스타일의 작은 정사각형 카드(아이콘
    // 칩 + 제목만, 설명문 생략)로 바꾸고, admin_auto_grant 플래그를 그대로
    // "업무 도구" / "관리자" 두 섹션 구분에 재사용한다(별도 category 컬럼
    // 추가 없이 기존 데이터로 충분). 즐겨찾기는 서버에 사용자별 테이블을
    // 새로 두지 않고 localStorage로 가볍게 구현한다.
    const workApps = appList.filter(app => !app.admin_auto_grant);
    const adminApps = appList.filter(app => app.admin_auto_grant);

    const visibleWorkApps = workApps; // 업무 도구는 권한 없어도 비활성 카드로 항상 노출
    const visibleAdminApps = adminApps.filter(app => grantedAppIds.has(app.app_id) || isAdmin);

    function isAppGranted(app) {
      return isAdmin || grantedAppIds.has(app.app_id);
    }

    function buildAppCard(app, options = {}) {
      const granted = isAppGranted(app);
      const muted = options.muted ? ' portal-app-card-compact--muted' : '';

      if (!granted) {
        return `
          <div class="portal-app-card-compact portal-app-card-compact--disabled" title="권한이 없습니다. 관리자에게 권한을 요청해 주세요.">
            <div class="portal-app-card-compact__icon">${escapeHtml(app.app_icon)}</div>
            <span class="portal-app-card-compact__title">${escapeHtml(app.app_name)}</span>
          </div>
        `;
      }

      return `
        <a class="portal-app-card-compact${muted}" href="${CONFIG.SITE_BASE_URL}${app.app_url}" data-app-id="${escapeHtml(app.app_id)}">
          <button type="button" class="portal-app-card-compact__fav" data-fav-toggle="${escapeHtml(app.app_id)}" aria-label="즐겨찾기 토글">★</button>
          <div class="portal-app-card-compact__icon">${escapeHtml(app.app_icon)}</div>
          <span class="portal-app-card-compact__title">${escapeHtml(app.app_name)}</span>
        </a>
      `;
    }

    if (!visibleWorkApps.length && !visibleAdminApps.length) {
      if (gridEl) gridEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      await delayUntilMinimum(startedAt, 400);
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    if (gridEl) {
      gridEl.innerHTML = visibleWorkApps.map(app => buildAppCard(app)).join('');
    }

    if (adminGridEl && adminSectionEl) {
      if (visibleAdminApps.length) {
        adminSectionEl.style.display = '';
        adminGridEl.innerHTML = visibleAdminApps.map(app => buildAppCard(app, { muted: true })).join('');
      } else {
        adminSectionEl.style.display = 'none';
      }
    }

    // 즐겨찾기(localStorage) — 클릭 가능한 앱(granted) 중 즐겨찾기로
    // 등록된 것만 모아 별도 섹션 맨 위에 보여준다.
    renderFavoritesSection([...workApps, ...adminApps].filter(isAppGranted));
    bindFavoriteToggles();

    await delayUntilMinimum(startedAt, 400);

    // 공지사항은 앱 카드와 독립적인 영역이라 실패해도 앱 카드 표시에
    // 영향을 주지 않도록 별도로 감싼다.
    try {
      await loadPortalNotices(user.email);
    } catch (noticeError) {
      console.error('공지사항을 불러오지 못했습니다.', noticeError);
    }
  } catch (error) {
    if (gridEl) {
      gridEl.innerHTML = `
        <div class="portal-error-box">
          ${escapeHtml(error.message || '앱 목록을 불러오지 못했습니다.')}
        </div>
      `;
    }
  } finally {
    try {
      hideGlobalLoading();
    } catch (e) {}
  }
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function delayUntilMinimum(startedAt, minimumMs) {
  const elapsed = Date.now() - startedAt;
  const remain = Math.max(0, minimumMs - elapsed);
  if (remain > 0) {
    await delay(remain);
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

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    try {
      hideGlobalLoading();
    } catch (e) {}
  }
});

// ─────────────────────────────────────────────
// 공지사항(2026-06)
// ─────────────────────────────────────────────

const NOTICE_DISMISS_STORAGE_KEY = 'portal_notice_dismissed';

/**
 * "오늘 하루 안 보임" 상태를 localStorage에 보관한다. 서버에 사용자별
 * 상태 테이블을 두지 않는 가벼운 방식 — 날짜가 바뀌면 자동으로 무효화된다.
 * 형태: { [notice_id]: 'yyyy-mm-dd' }
 */
function getDismissedNoticeMap() {
  try {
    return JSON.parse(localStorage.getItem(NOTICE_DISMISS_STORAGE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function todayDateString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isDismissedToday(noticeId) {
  const map = getDismissedNoticeMap();
  return map[noticeId] === todayDateString();
}

function dismissNoticeForToday(noticeId) {
  const map = getDismissedNoticeMap();
  map[noticeId] = todayDateString();
  try {
    localStorage.setItem(NOTICE_DISMISS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {}
}

async function loadPortalNotices(userEmail) {
  const sectionEl = document.getElementById('portalNoticeSection');
  const gridEl = document.getElementById('portalNoticeGrid');
  if (!sectionEl || !gridEl) return;

  const result = await apiGet('getActiveNotices', { request_user_email: userEmail });
  const allNotices = Array.isArray(result.data) ? result.data : [];
  const notices = allNotices.filter(n => !isDismissedToday(n.notice_id));

  if (!notices.length) {
    sectionEl.style.display = 'none';
    return;
  }

  sectionEl.style.display = '';
  gridEl.innerHTML = notices.map(n => `
    <div class="portal-notice-card${n.is_pinned ? ' portal-notice-card--pinned' : ''}" data-notice-id="${escapeHtml(n.notice_id)}">
      ${n.is_pinned ? '<span class="portal-notice-pin">📌 고정</span>' : ''}
      <button type="button" class="portal-notice-close" data-close-notice="${escapeHtml(n.notice_id)}" aria-label="오늘 하루 안 보임">×</button>
      <div class="portal-notice-card__title" data-open-notice="${escapeHtml(n.notice_id)}">${escapeHtml(n.title)}</div>
      <div class="portal-notice-card__date">${escapeHtml(n.created_at.slice(0, 10))}</div>
    </div>
  `).join('');

  gridEl.querySelectorAll('[data-open-notice]').forEach(el => {
    el.addEventListener('click', () => {
      const notice = notices.find(n => n.notice_id === el.dataset.openNotice);
      if (notice) openNoticeModal(notice);
    });
  });

  gridEl.querySelectorAll('[data-close-notice]').forEach(el => {
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      const noticeId = el.dataset.closeNotice;
      dismissNoticeForToday(noticeId);
      const card = gridEl.querySelector(`[data-notice-id="${noticeId}"]`);
      if (card) card.remove();
      if (!gridEl.querySelector('.portal-notice-card')) {
        sectionEl.style.display = 'none';
      }
    });
  });
}

function openNoticeModal(notice) {
  const modal = document.getElementById('noticeDetailModal');
  const titleEl = document.getElementById('noticeModalTitle');
  const contentEl = document.getElementById('noticeModalContent');
  if (!modal || !titleEl || !contentEl) return;

  titleEl.textContent = notice.title;
  // 공지 내용은 관리자(admin)만 작성 가능한 신뢰된 입력이지만, 그래도
  // 줄바꿈만 허용하고 나머지는 escapeHtml로 이스케이프해 XSS를 방지한다.
  contentEl.innerHTML = escapeHtml(notice.content).replace(/\n/g, '<br>');
  modal.style.display = '';
}

function closeNoticeModal() {
  const modal = document.getElementById('noticeDetailModal');
  if (modal) modal.style.display = 'none';
}

document.getElementById('noticeModalCloseBtn')?.addEventListener('click', closeNoticeModal);
document.getElementById('noticeModalBackdrop')?.addEventListener('click', closeNoticeModal);

// ─────────────────────────────────────────────
// 즐겨찾기(2026-06)
// ─────────────────────────────────────────────

const FAVORITE_APPS_STORAGE_KEY = 'portal_favorite_apps';

function getFavoriteAppIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITE_APPS_STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function setFavoriteAppIds(ids) {
  try {
    localStorage.setItem(FAVORITE_APPS_STORAGE_KEY, JSON.stringify(ids));
  } catch (e) {}
}

function isFavoriteApp(appId) {
  return getFavoriteAppIds().includes(appId);
}

function toggleFavoriteApp(appId) {
  const ids = getFavoriteAppIds();
  const idx = ids.indexOf(appId);
  if (idx > -1) {
    ids.splice(idx, 1);
  } else {
    ids.push(appId);
  }
  setFavoriteAppIds(ids);
}

/**
 * grantedApps(클릭 가능한 앱 전체) 중 즐겨찾기로 등록된 것만 모아
 * portalFavoritesSection에 렌더링한다. 즐겨찾기가 비어 있으면 섹션 자체를
 * 숨긴다.
 */
function renderFavoritesSection(grantedApps) {
  const sectionEl = document.getElementById('portalFavoritesSection');
  const gridEl = document.getElementById('portalFavoritesGrid');
  if (!sectionEl || !gridEl) return;

  const favoriteIds = getFavoriteAppIds();
  const favoriteApps = grantedApps.filter(app => favoriteIds.includes(app.app_id));

  if (!favoriteApps.length) {
    sectionEl.style.display = 'none';
    gridEl.innerHTML = '';
    return;
  }

  sectionEl.style.display = '';
  gridEl.innerHTML = favoriteApps.map(app => `
    <a class="portal-app-card-compact" href="${CONFIG.SITE_BASE_URL}${app.app_url}" data-app-id="${escapeHtml(app.app_id)}">
      <button type="button" class="portal-app-card-compact__fav portal-app-card-compact__fav--active" data-fav-toggle="${escapeHtml(app.app_id)}" aria-label="즐겨찾기 해제">★</button>
      <div class="portal-app-card-compact__icon">${escapeHtml(app.app_icon)}</div>
      <span class="portal-app-card-compact__title">${escapeHtml(app.app_name)}</span>
    </a>
  `).join('');
}

/**
 * 이벤트 위임(2026-06) — 처음엔 그리드를 다시 그릴 때마다
 * querySelectorAll('[data-fav-toggle]').forEach(... addEventListener ...)로
 * 매번 새 리스너를 추가했는데, innerHTML로 그려진 새 버튼에는 리스너가
 * 없는 게 아니라 같은 버튼이 여러 번 다시 그려질 때마다(즐겨찾기 토글 →
 * 재렌더링 → 그 안의 버튼에 또 바인딩) 핸들러가 계속 누적되는 구조적
 * 결함이 있었다. document에 한 번만 위임 리스너를 걸어 해결한다.
 */
let favoriteTogglesBound = false;
function bindFavoriteToggles() {
  if (favoriteTogglesBound) return;
  favoriteTogglesBound = true;

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-fav-toggle]');
    if (!btn) return;

    event.preventDefault();
    event.stopPropagation();
    const appId = btn.dataset.favToggle;
    toggleFavoriteApp(appId);
    btn.classList.toggle('portal-app-card-compact__fav--active', isFavoriteApp(appId));

    const grantedApps = [
      ...document.querySelectorAll('#portalAppGrid a[data-app-id], #portalAdminAppGrid a[data-app-id]')
    ].map(el => ({
      app_id: el.dataset.appId,
      app_icon: el.querySelector('.portal-app-card-compact__icon')?.textContent || '',
      app_name: el.querySelector('.portal-app-card-compact__title')?.textContent || '',
      app_url: el.getAttribute('href').replace(CONFIG.SITE_BASE_URL, '')
    }));
    renderFavoritesSection(grantedApps);
  });
}
