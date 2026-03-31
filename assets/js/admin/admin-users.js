let currentSessionUser = null;
let editingUserEmail = '';
let orgDataCache = {
  clinics: [],
  teams: []
};
let currentUsers = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  currentSessionUser = user;

  if (String(user.role || '').trim().toLowerCase() !== 'admin') {
    alert('관리자만 접근할 수 있습니다.');
    location.replace(`${CONFIG.SITE_BASE_URL}/portal.html`);
    return;
  }

  bindEvents();

  try {
    await initializePage();
  } catch (error) {
    setAdminMessage(error.message || '초기화 중 오류가 발생했습니다.', 'error');
  }
});

function bindEvents() {
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    window.auth.logout();
  });

  document.getElementById('saveUserBtn')?.addEventListener('click', saveUser);
  document.getElementById('cancelEditBtn')?.addEventListener('click', resetForm);
  document.getElementById('searchUsersBtn')?.addEventListener('click', () => {
    renderUserList();
  });

  document.getElementById('clinic_code')?.addEventListener('change', onFormClinicChange);
  document.getElementById('userFilterClinic')?.addEventListener('change', renderUserList);
  document.getElementById('userSearchKeyword')?.addEventListener('input', renderUserList);
  document.getElementById('userFilterActive')?.addEventListener('change', renderUserList);
  document.getElementById('userFilterRole')?.addEventListener('change', renderUserList);
}

async function initializePage() {
  await loadOrgData();
  await loadUsers();
  resetForm();
}

function getRequestUserEmail() {
  return String(currentSessionUser?.email || '').trim().toLowerCase();
}

function showGlobalLoading(text = '불러오는 중...') {
  const wrap = document.getElementById('globalLoading');
  const textEl = document.getElementById('globalLoadingText');
  if (textEl) textEl.textContent = text;
  if (wrap) wrap.setAttribute('aria-hidden', 'false');
}

function hideGlobalLoading() {
  const wrap = document.getElementById('globalLoading');
  if (wrap) wrap.setAttribute('aria-hidden', 'true');
}

function setAdminMessage(message, type = '') {
  const el = document.getElementById('adminUserMessage');
  if (!el) return;

  el.textContent = message || '';
  el.className = 'message-box';

  if (type) {
    el.classList.add(type);
  }
}

function clearAdminMessage() {
  setAdminMessage('');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalize(value) {
  return String(value || '').trim();
}

function getSelectedText(selectEl) {
  if (!selectEl) return '';
  const option = selectEl.options[selectEl.selectedIndex];
  return option ? normalize(option.textContent) : '';
}

function collectPermissions() {
  return Array.from(document.querySelectorAll('.app-permission'))
    .map((el) => {
      const appId = el.dataset.appId;
      const permission = normalize(el.value);
      if (!appId || !permission) return null;

      return {
        app_id: appId,
        permission,
        active: 'Y'
      };
    })
    .filter(Boolean);
}

function getFormData() {
  const clinicEl = document.getElementById('clinic_code');
  const teamEl = document.getElementById('team_code');

  return {
    user_email: normalize(document.getElementById('userEmail')?.value).toLowerCase(),
    user_name: normalize(document.getElementById('userName')?.value),
    clinic_code: normalize(clinicEl?.value),
    clinic_name: getSelectedText(clinicEl),
    team_code: normalize(teamEl?.value),
    team_name: getSelectedText(teamEl),
    phone: normalize(document.getElementById('phone')?.value),
    role: normalize(document.getElementById('globalRole')?.value) || 'user',
    active: normalize(document.getElementById('userActive')?.value) || 'Y',
    permissions: collectPermissions()
  };
}

function validateForm(data) {
  if (!data.user_email) {
    throw new Error('이메일을 입력해 주세요.');
  }
  if (!data.user_name) {
    throw new Error('이름을 입력해 주세요.');
  }
  if (!data.clinic_code) {
    throw new Error('의원을 선택해 주세요.');
  }
  if (!data.team_code) {
    throw new Error('팀을 선택해 주세요.');
  }
}

async function loadOrgData() {
  showGlobalLoading('조직 정보를 불러오는 중...');
  try {
    const result = await apiGet('getOrgData');
    orgDataCache = result.data || { clinics: [], teams: [] };

    populateClinicSelect(
      document.getElementById('clinic_code'),
      orgDataCache.clinics,
      '의원을 선택하세요'
    );
    populateClinicSelect(
      document.getElementById('userFilterClinic'),
      orgDataCache.clinics,
      '전체'
    );

    populateTeamSelect(document.getElementById('team_code'), [], '팀을 선택하세요');
  } finally {
    hideGlobalLoading();
  }
}

function populateClinicSelect(selectEl, clinics, placeholder) {
  if (!selectEl) return;

  const options = [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(
      (clinics || []).map((clinic) => {
        const code = normalize(clinic.code || clinic.code_value);
        const name = normalize(clinic.code_name || clinic.name);
        return `<option value="${escapeHtml(code)}">${escapeHtml(name)}</option>`;
      })
    )
    .join('');

  selectEl.innerHTML = options;
  selectEl.disabled = false;
}

function populateTeamSelect(selectEl, teams, placeholder) {
  if (!selectEl) return;

  const options = [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(
      (teams || []).map((team) => {
        const code = normalize(team.code || team.code_value);
        const name = normalize(team.code_name || team.name);
        return `<option value="${escapeHtml(code)}">${escapeHtml(name)}</option>`;
      })
    )
    .join('');

  selectEl.innerHTML = options;
  selectEl.disabled = false;
}

function getTeamsByClinicCode(clinicCode) {
  const code = normalize(clinicCode);
  if (!code) return [];

  return (orgDataCache.teams || []).filter((team) => {
    const parentClinicCode =
      normalize(team.parent_code) ||
      normalize(team.parent_code_value) ||
      normalize(team.clinic_code);
    return parentClinicCode === code;
  });
}

function onFormClinicChange() {
  const clinicCode = normalize(document.getElementById('clinic_code')?.value);
  const teams = getTeamsByClinicCode(clinicCode);
  populateTeamSelect(document.getElementById('team_code'), teams, '팀을 선택하세요');
}

async function saveUser() {
  clearAdminMessage();

  try {
    const data = getFormData();
    validateForm(data);

    const action = editingUserEmail ? 'updateUser' : 'createUser';

    showGlobalLoading(editingUserEmail ? '사용자 정보를 수정하는 중...' : '사용자를 등록하는 중...');

    const result = await apiPost(action, {
      request_user_email: getRequestUserEmail(),
      ...data
    });

    setAdminMessage(result.message || (editingUserEmail ? '사용자 정보가 수정되었습니다.' : '사용자가 등록되었습니다.'), 'success');

    await loadUsers();
    resetForm();
  } catch (error) {
    setAdminMessage(error.message || '사용자 저장 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function loadUsers() {
  const listEl = document.getElementById('userList');
  if (listEl) {
    listEl.innerHTML = `
      <div class="user-item">
        <span>불러오는 중...</span>
      </div>
    `;
  }

  showGlobalLoading('사용자 목록을 불러오는 중...');

  try {
    const result = await apiGet('listUsers', {
      request_user_email: getRequestUserEmail()
    });

    currentUsers = Array.isArray(result.data) ? result.data : [];
    renderUserList();
  } catch (error) {
    if (listEl) {
      listEl.innerHTML = `
        <div class="user-item">
          <span>${escapeHtml(error.message || '사용자 목록 조회 중 오류가 발생했습니다.')}</span>
        </div>
      `;
    }
  } finally {
    hideGlobalLoading();
  }
}

function renderUserList() {
  const listEl = document.getElementById('userList');
  const countEl = document.getElementById('userListCount');
  if (!listEl) return;

  const keyword = normalize(document.getElementById('userSearchKeyword')?.value).toLowerCase();
  const activeFilter = normalize(document.getElementById('userFilterActive')?.value);
  const roleFilter = normalize(document.getElementById('userFilterRole')?.value);
  const clinicFilter = normalize(document.getElementById('userFilterClinic')?.value);

  const filtered = currentUsers.filter((user) => {
    const matchesKeyword = !keyword || [
      user.user_name,
      user.user_email,
      user.department,
      user.clinic_name,
      user.team_name
    ].some((value) => normalize(value).toLowerCase().includes(keyword));

    const matchesActive = !activeFilter || normalize(user.active) === activeFilter;
    const matchesRole = !roleFilter || normalize(user.role) === roleFilter;
    const matchesClinic = !clinicFilter || normalize(user.clinic_code) === clinicFilter;

    return matchesKeyword && matchesActive && matchesRole && matchesClinic;
  });

  countEl.textContent = `총 ${filtered.length}명`;

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="user-item">
        <span>조건에 맞는 사용자가 없습니다.</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map((user) => {
    const activeLabel = normalize(user.active) === 'Y' ? '활성' : '비활성';
    const toggleLabel = normalize(user.active) === 'Y' ? '비활성화' : '활성화';

    return `
      <div class="user-item" data-email="${escapeHtml(user.user_email)}">
        <div class="user-item__main">
          <div><strong>${escapeHtml(user.user_name)}</strong> (${escapeHtml(user.user_email)})</div>
          <div>${escapeHtml(user.clinic_name || '')} / ${escapeHtml(user.team_name || '')}</div>
          <div>역할: ${escapeHtml(user.role || '')} · 상태: ${escapeHtml(activeLabel)}</div>
        </div>
        <div class="user-item__actions">
          <button type="button" class="admin-btn small js-edit-user" data-email="${escapeHtml(user.user_email)}">수정</button>
          <button type="button" class="admin-btn small js-reset-password" data-email="${escapeHtml(user.user_email)}">비밀번호 초기화</button>
          <button type="button" class="admin-btn small ${normalize(user.active) === 'Y' ? 'danger' : ''}" data-email="${escapeHtml(user.user_email)}" data-active="${normalize(user.active) === 'Y' ? 'N' : 'Y'}">
            ${escapeHtml(toggleLabel)}
          </button>
        </div>
      </div>
    `;
  }).join('');

  bindListEvents();
}

function bindListEvents() {
  document.querySelectorAll('.js-edit-user').forEach((btn) => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.email;
      if (email) startEditUser(email);
    });
  });

  document.querySelectorAll('.js-reset-password').forEach((btn) => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.email;
      if (email) resetUserPassword(email);
    });
  });

  document.querySelectorAll('[data-active]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.email;
      const active = btn.dataset.active;
      if (email && active) changeUserActive(email, active);
    });
  });
}

async function startEditUser(userEmail) {
  clearAdminMessage();
  showGlobalLoading('사용자 정보를 불러오는 중...');

  try {
    const result = await apiGet('getUserDetail', {
      user_email: userEmail,
      request_user_email: getRequestUserEmail()
    });

    const user = result.data?.user || {};
    const permissions = Array.isArray(result.data?.permissions) ? result.data.permissions : [];

    editingUserEmail = normalize(user.user_email).toLowerCase();

    document.getElementById('userEmail').value = user.user_email || '';
    document.getElementById('userEmail').disabled = true;
    document.getElementById('userName').value = user.user_name || '';
    document.getElementById('phone').value = user.phone || '';
    document.getElementById('globalRole').value = user.role || 'user';
    document.getElementById('userActive').value = user.active || 'Y';

    const clinicEl = document.getElementById('clinic_code');
    const teamEl = document.getElementById('team_code');

    clinicEl.value = user.clinic_code || '';
    populateTeamSelect(teamEl, getTeamsByClinicCode(user.clinic_code), '팀을 선택하세요');
    teamEl.value = user.team_code || '';

    document.querySelectorAll('.app-permission').forEach((el) => {
      el.value = '';
    });

    permissions.forEach((perm) => {
      const target = document.querySelector(`.app-permission[data-app-id="${perm.app_id}"]`);
      if (target && normalize(perm.active || 'Y') === 'Y') {
        target.value = perm.permission || '';
      }
    });

    document.getElementById('formTitle').textContent = '사용자 수정';
    document.getElementById('formDesc').textContent = '사용자 정보와 앱별 권한을 수정합니다.';
    document.getElementById('saveUserBtn').textContent = '사용자 수정';
    document.getElementById('cancelEditBtn').style.display = '';
  } catch (error) {
    setAdminMessage(error.message || '사용자 상세 조회 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

function resetForm() {
  editingUserEmail = '';

  document.getElementById('userEmail').value = '';
  document.getElementById('userEmail').disabled = false;
  document.getElementById('userName').value = '';
  document.getElementById('phone').value = '';
  document.getElementById('globalRole').value = 'user';
  document.getElementById('userActive').value = 'Y';
  document.getElementById('clinic_code').value = '';
  populateTeamSelect(document.getElementById('team_code'), [], '팀을 선택하세요');

  document.querySelectorAll('.app-permission').forEach((el) => {
    el.value = '';
  });

  document.getElementById('formTitle').textContent = '사용자 등록';
  document.getElementById('formDesc').textContent = '신규 사용자를 등록하고 앱별 권한을 부여합니다.';
  document.getElementById('saveUserBtn').textContent = '사용자 등록';
  document.getElementById('cancelEditBtn').style.display = 'none';

  clearAdminMessage();
}

async function resetUserPassword(userEmail) {
  const ok = confirm(`${userEmail} 계정의 비밀번호를 1111로 초기화하시겠습니까?`);
  if (!ok) return;

  showGlobalLoading('비밀번호를 초기화하는 중...');

  try {
    const result = await apiPost('resetUserPassword', {
      request_user_email: getRequestUserEmail(),
      user_email: userEmail
    });

    alert(result.message || '비밀번호가 초기화되었습니다.');
  } catch (error) {
    alert(error.message || '비밀번호 초기화 중 오류가 발생했습니다.');
  } finally {
    hideGlobalLoading();
  }
}

async function changeUserActive(userEmail, active) {
  const actionLabel = active === 'Y' ? '활성화' : '비활성화';
  const ok = confirm(`${userEmail} 계정을 ${actionLabel}하시겠습니까?`);
  if (!ok) return;

  showGlobalLoading(`사용자를 ${actionLabel}하는 중...`);

  try {
    const result = await apiPost('setUserActive', {
      request_user_email: getRequestUserEmail(),
      user_email: userEmail,
      active
    });

    alert(result.message || `사용자가 ${actionLabel}되었습니다.`);
    await loadUsers();
  } catch (error) {
    alert(error.message || `사용자 ${actionLabel} 중 오류가 발생했습니다.`);
  } finally {
    hideGlobalLoading();
  }
}
