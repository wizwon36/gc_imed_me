(function () {
  const STORAGE_KEY = 'imed_portal_user';
  const SESSION_MAX_AGE = 8 * 60 * 60 * 1000; // 8시간

  function setMessage(message, type = '') {
    const el = document.getElementById('authMessage');
    if (!el) return;

    el.textContent = message || '';
    el.className = 'auth-message';

    if (type) {
      el.classList.add(`is-${type}`);
    }
  }
  
  function showGlobalLoading(text = '처리 중...') {
    const overlay = document.getElementById('globalLoading');
    if (!overlay) return;
  
    const textEl = document.getElementById('globalLoadingText');
    if (textEl) textEl.textContent = text;
  
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }
  
  function hideGlobalLoading() {
    const overlay = document.getElementById('globalLoading');
    if (!overlay) return;
  
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }
  
  function getLoginUrl() {
    return `${CONFIG.SITE_BASE_URL}/index.html`;
  }

  function getPortalUrl() {
    return `${CONFIG.SITE_BASE_URL}/portal.html`;
  }

  function saveSession(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...user,
      loginAt: Date.now()
    }));
  }

  function getSession() {
    try {
      const user = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!user) return null;

      if (user.loginAt && Date.now() - user.loginAt > SESSION_MAX_AGE) {
        clearSession();
        return null;
      }

      return user;
    } catch (error) {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function logout() {
    clearSession();
    history.replaceState(null, '', getLoginUrl());
    location.replace(getLoginUrl());
  }

  function requireAuth() {
    const user = getSession();

    if (!user) {
      location.replace(getLoginUrl());
      return null;
    }

    return user;
  }

  function redirectIfLoggedIn() {
    const user = getSession();

    if (user) {
      location.replace(getPortalUrl());
    }
  }

  async function login() {
    const emailEl = document.getElementById('userEmail');
    const passwordEl = document.getElementById('userPassword');
    const loginBtn = document.getElementById('loginBtn');

    if (!emailEl || !passwordEl || !loginBtn) return;

    const user_email = emailEl.value.trim();
    const password = passwordEl.value.trim();

    if (!user_email) {
      setMessage('이메일을 입력해 주세요.', 'error');
      emailEl.focus();
      return;
    }

    if (!password) {
      setMessage('비밀번호를 입력해 주세요.', 'error');
      passwordEl.focus();
      return;
    }

   setMessage('');
    loginBtn.disabled = true;
    loginBtn.textContent = '로그인 중...';
    showGlobalLoading('로그인 중...');
    
    try {
      if (typeof apiPost !== 'function') {
        throw new Error('apiPost 함수가 연결되지 않았습니다.');
      }
    
      const result = await apiPost('login', { user_email, password });
      saveSession(result.user);
      setMessage('로그인되었습니다.', 'success');
      location.replace(getPortalUrl());
    } catch (error) {
      hideGlobalLoading();
      setMessage(error.message || '로그인 중 오류가 발생했습니다.', 'error');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = '로그인';
    }
  }

  function bindLoginPage() {
    const loginBtn = document.getElementById('loginBtn');
    const emailEl = document.getElementById('userEmail');
    const passwordEl = document.getElementById('userPassword');

    if (!loginBtn || !emailEl || !passwordEl) return;

    redirectIfLoggedIn();

    loginBtn.addEventListener('click', login);

    [emailEl, passwordEl].forEach(el => {
      el.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          login();
        }
      });
    });
  }

  function bindHistoryGuard() {
    const normalizedPath = location.pathname.replace(/\/+$/, '');
    const siteBasePath = CONFIG.SITE_BASE_URL.replace(/\/+$/, '');
    const isLoginPage =
      normalizedPath === '' ||
      normalizedPath === '/' ||
      normalizedPath === siteBasePath ||
      normalizedPath === `${siteBasePath}/index.html` ||
      location.pathname.endsWith('/index.html');

    window.addEventListener('pageshow', () => {
      const user = getSession();

      if (isLoginPage) {
        if (user) {
          location.replace(getPortalUrl());
        }
        return;
      }

      if (!user) {
        location.replace(getLoginUrl());
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;

      const user = getSession();

      if (isLoginPage) {
        if (user) {
          location.replace(getPortalUrl());
        }
        return;
      }

      if (!user) {
        location.replace(getLoginUrl());
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindLoginPage();
    bindHistoryGuard();
  });

  window.auth = {
    saveSession,
    getSession,
    clearSession,
    logout,
    requireAuth,
    redirectIfLoggedIn
  };
})();
