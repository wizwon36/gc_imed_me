(function () {
  const STORAGE_KEY = 'imed_portal_user';

  function setMessage(message, type = '') {
    const el = document.getElementById('authMessage');
    if (!el) return;

    el.textContent = message || '';
    el.className = 'auth-message';
    if (type) {
      el.classList.add(`is-${type}`);
    }
  }

  function saveSession(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function logout() {
    clearSession();
    location.href = 'index.html';
  }

  function requireAuth() {
    const user = getSession();
    if (!user) {
      location.href = 'index.html';
      return null;
    }
    return user;
  }

  function redirectIfLoggedIn() {
    const user = getSession();
    if (user) {
      location.href = 'portal.html';
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

    try {
      if (typeof apiPost !== 'function') {
        throw new Error('apiPost 함수가 연결되지 않았습니다.');
      }

      const result = await apiPost('login', { user_email, password });

      if (!result || !result.success) {
        setMessage(result?.message || '로그인에 실패했습니다.', 'error');
        return;
      }

      saveSession(result.user);
      setMessage('로그인되었습니다.', 'success');
      location.href = 'portal.html';
    } catch (error) {
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

  document.addEventListener('DOMContentLoaded', bindLoginPage);

  window.auth = {
    saveSession,
    getSession,
    clearSession,
    logout,
    requireAuth,
    redirectIfLoggedIn
  };
})();
