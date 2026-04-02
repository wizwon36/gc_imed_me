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

  function getLoginUrl() {
    return `${CONFIG.SITE_BASE_URL}/index.html`;
  }

  function getPortalUrl() {
    return `${CONFIG.SITE_BASE_URL}/portal.html`;
  }

  function getChangePasswordUrl() {
    return `${CONFIG.SITE_BASE_URL}/pages/auth/change-password.html`;
  }

  function saveSession(user) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...user,
        loginAt: Date.now()
      })
    );
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
    if (!user) return;

    if (String(user.first_login || 'N').toUpperCase() === 'Y') {
      location.replace(getChangePasswordUrl());
      return;
    }

    location.replace(getPortalUrl());
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
      const result = await apiPost('login', { user_email, password });

      if (!result?.success) {
        throw new Error(result?.message || '로그인에 실패했습니다.');
      }

      saveSession(result.user || {});

      if (String(result.user?.first_login || 'N').toUpperCase() === 'Y') {
        location.replace(getChangePasswordUrl());
        return;
      }

      location.replace(getPortalUrl());
    } catch (error) {
      await hideGlobalLoading(true);
      setMessage(error.message || '로그인 실패', 'error');
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
    const path = location.pathname.replace(/\/+$/, '');
    const siteBasePath = new URL(CONFIG.SITE_BASE_URL, location.origin).pathname.replace(/\/+$/, '');

    const isLoginPage =
      path === '' ||
      path === '/' ||
      path === siteBasePath ||
      path === `${siteBasePath}/index.html` ||
      location.pathname.endsWith('/index.html');

    window.addEventListener('pageshow', () => {
      const user = getSession();

      if (isLoginPage) {
        if (user) {
          if (String(user.first_login || 'N').toUpperCase() === 'Y') {
            location.replace(getChangePasswordUrl());
            return;
          }
          location.replace(getPortalUrl());
        }
        return;
      }

      if (!user) {
        location.replace(getLoginUrl());
        return;
      }

      const isChangePasswordPage = location.pathname.includes('/pages/auth/change-password.html');
      if (!isChangePasswordPage && String(user.first_login || 'N').toUpperCase() === 'Y') {
        location.replace(getChangePasswordUrl());
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;

      const user = getSession();

      if (isLoginPage) {
        if (user) {
          if (String(user.first_login || 'N').toUpperCase() === 'Y') {
            location.replace(getChangePasswordUrl());
            return;
          }
          location.replace(getPortalUrl());
        }
        return;
      }

      if (!user) {
        location.replace(getLoginUrl());
        return;
      }

      const isChangePasswordPage = location.pathname.includes('/pages/auth/change-password.html');
      if (!isChangePasswordPage && String(user.first_login || 'N').toUpperCase() === 'Y') {
        location.replace(getChangePasswordUrl());
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
