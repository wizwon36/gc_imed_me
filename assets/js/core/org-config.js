var __permissionSheetValuesCache = null;

function getUsersSheet_() {
  return getSheet_(CONFIG.SHEETS.USERS);
}

function getUserPermissionSheet_() {
  const sheet = getSpreadsheet_().getSheetByName('user_app_permissions');
  if (!sheet) {
    throw new Error('user_app_permissions 시트를 찾을 수 없습니다.');
  }
  return sheet;
}

function clearPermissionRuntimeCache_() {
  __permissionSheetValuesCache = null;
}

function getAllUsers_() {
  return getAllValuesAsObjects_(CONFIG.SHEETS.USERS);
}

function findUserRow_(userEmail) {
  return findRowByColumnValue_(
    CONFIG.SHEETS.USERS,
    'user_email',
    String(userEmail || '').trim().toLowerCase()
  );
}

function getPermissionSheetValues_() {
  if (__permissionSheetValuesCache) {
    return __permissionSheetValuesCache;
  }

  const sheet = getUserPermissionSheet_();
  const values = sheet.getDataRange().getValues();
  __permissionSheetValuesCache = values;
  return values;
}

function getPermissionSheetHeaderMap_() {
  const values = getPermissionSheetValues_();
  if (!values.length) {
    throw new Error('user_app_permissions 시트 헤더가 없습니다.');
  }

  const headers = values[0];
  const map = {};
  headers.forEach(function(header, idx) {
    map[String(header || '').trim()] = idx;
  });

  return map;
}

function normalizePermissionItem_(item) {
  return {
    app_id: String(item?.app_id || '').trim(),
    permission: String(item?.permission || 'view').trim(),
    active: String(item?.active || 'Y').trim().toUpperCase(),
    granted_at: getCurrentDateTime_()
  };
}

function getActivePermissionsByEmail_(email) {
  const targetEmail = String(email || '').trim().toLowerCase();
  const values = getPermissionSheetValues_();
  if (values.length < 2) return [];

  const headerMap = getPermissionSheetHeaderMap_();
  const emailIdx = headerMap.user_email ?? 0;
  const appIdIdx = headerMap.app_id ?? 1;
  const permissionIdx = headerMap.permission ?? 2;
  const activeIdx = headerMap.active ?? 3;
  const grantedAtIdx = headerMap.granted_at ?? 4;

  const result = [];

  for (let i = 1; i < values.length; i++) {
    const rowEmail = String(values[i][emailIdx] || '').trim().toLowerCase();
    const active = String(values[i][activeIdx] || '').trim().toUpperCase();

    if (rowEmail !== targetEmail) continue;
    if (active !== 'Y') continue;

    result.push({
      user_email: rowEmail,
      app_id: String(values[i][appIdIdx] || '').trim(),
      permission: String(values[i][permissionIdx] || '').trim(),
      active: active,
      granted_at: values[i][grantedAtIdx] || ''
    });
  }

  return result;
}

function appendPermissionRows_(email, permissions) {
  const permissionSheet = getUserPermissionSheet_();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const validPermissions = (Array.isArray(permissions) ? permissions : [])
    .map(normalizePermissionItem_)
    .filter(function(item) {
      return !!item.app_id;
    });

  if (validPermissions.length === 0) {
    return;
  }

  const rows = validPermissions.map(function(item) {
    return [
      normalizedEmail,
      item.app_id,
      item.permission,
      item.active,
      item.granted_at
    ];
  });

  const startRow = permissionSheet.getLastRow() + 1;
  permissionSheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  clearPermissionRuntimeCache_();
}

function deactivateUserPermissions_(email) {
  const targetEmail = String(email || '').trim().toLowerCase();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getUserPermissionSheet_();
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) {
      clearPermissionRuntimeCache_();
      return;
    }

    const headers = values[0];
    const emailIdx = headers.indexOf('user_email');
    const activeIdx = headers.indexOf('active');

    if (emailIdx === -1 || activeIdx === -1) {
      throw new Error('user_app_permissions 시트 필수 컬럼이 누락되었습니다.');
    }

    for (let i = 1; i < values.length; i++) {
      const rowEmail = String(values[i][emailIdx] || '').trim().toLowerCase();
      const active = String(values[i][activeIdx] || '').trim().toUpperCase();

      if (rowEmail === targetEmail && active === 'Y') {
        sheet.getRange(i + 1, activeIdx + 1).setValue('N');
      }
    }

    clearPermissionRuntimeCache_();
  } finally {
    lock.releaseLock();
  }
}

function replaceUserPermissions_(email, permissions) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPermissions = (Array.isArray(permissions) ? permissions : [])
    .map(normalizePermissionItem_)
    .filter(function(item) {
      return item.app_id && item.permission;
    });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    deactivateUserPermissions_(normalizedEmail);

    if (normalizedPermissions.length > 0) {
      const sheet = getUserPermissionSheet_();
      const rows = normalizedPermissions.map(function(item) {
        return [
          normalizedEmail,
          item.app_id,
          item.permission,
          item.active,
          item.granted_at
        ];
      });

      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
    }

    clearPermissionRuntimeCache_();
  } finally {
    lock.releaseLock();
  }
}

function login_(data) {
  const userEmail = String(data.user_email || '').trim().toLowerCase();
  const password = String(data.password || '').trim();

  if (!userEmail) {
    return { success: false, message: '이메일이 필요합니다.' };
  }

  if (!password) {
    return { success: false, message: '비밀번호가 필요합니다.' };
  }

  const found = findUserRow_(userEmail);
  if (!found) {
    return { success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }

  const user = rowToObject_(found.headers, found.rowValues);
  const active = String(user.active || '').trim().toUpperCase();

  if (active !== 'Y') {
    return { success: false, message: '비활성 사용자입니다.' };
  }

  const savedHash = String(user.password_hash || '').trim();
  const savedSalt = String(user.password_salt || '').trim();
  const inputHash = hashPassword_(password, savedSalt);

  if (inputHash !== savedHash) {
    return { success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }

  updateRowByRowIndex_(CONFIG.SHEETS.USERS, found.rowIndex, {
    last_login_at: getCurrentDateTime_()
  });

  return {
    success: true,
    user: {
      email: normalizeString_(user.user_email),
      name: normalizeString_(user.user_name),
      role: normalizeString_(user.role) || 'user',
      department: normalizeString_(user.department),
      clinic_code: normalizeString_(user.clinic_code),
      clinic_name: normalizeString_(user.clinic_name),
      team_code: normalizeString_(user.team_code),
      team_name: normalizeString_(user.team_name),
      phone: normalizeString_(user.phone),
      first_login: normalizeString_(user.first_login || 'N')
    }
  };
}

function generateSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function hashPassword_(password, salt) {
  const raw = String(salt || '') + String(password || '');
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );

  return digest.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function createUser_(data) {
  ensureAdminUser_(data.request_user_email);

  const email = String(data.user_email || '').trim().toLowerCase();
  const userName = String(data.user_name || '').trim();
  const role = String(data.role || 'user').trim();
  const phone = String(data.phone || '').trim();
  const active = String(data.active || 'Y').trim().toUpperCase();

  const clinicCode = normalizeString_(data.clinic_code);
  const clinicName = normalizeString_(data.clinic_name);
  const teamCode = normalizeString_(data.team_code);
  const teamName = normalizeString_(data.team_name);
  const department = buildDepartmentText_(clinicName, teamName, data.department);

  const initialPassword = '1111';

  if (!email) {
    return { success: false, message: '이메일이 필요합니다.' };
  }

  if (!userName) {
    return { success: false, message: '사용자명이 필요합니다.' };
  }

  if (!clinicCode) {
    return { success: false, message: '의원을 선택해 주세요.' };
  }

  if (!teamCode) {
    return { success: false, message: '팀을 선택해 주세요.' };
  }

  const found = findUserRow_(email);
  if (found) {
    return { success: false, message: '이미 존재하는 이메일입니다.' };
  }

  const salt = generateSalt_();
  const passwordHash = hashPassword_(initialPassword, salt);

  appendObjectRow_(CONFIG.SHEETS.USERS, {
    user_email: email,
    user_name: userName,
    role: role,
    department: department,
    phone: phone,
    active: active,
    last_login_at: '',
    created_at: getCurrentDateTime_(),
    password_hash: passwordHash,
    password_salt: salt,
    first_login: 'Y',
    clinic_code: clinicCode,
    clinic_name: clinicName,
    team_code: teamCode,
    team_name: teamName
  });

  appendPermissionRows_(email, data.permissions);

  writeLog_({
    action_type: 'CREATE',
    target_type: 'USER',
    target_id: email,
    action_detail: '사용자 등록',
    action_user: normalizeString_(data.request_user_email)
  });

  return {
    success: true,
    message: '사용자가 등록되었습니다. 초기 비밀번호는 1111입니다.'
  };
}

function changePassword_(data) {
  const userEmail = String(data.user_email || '').trim().toLowerCase();
  const currentPassword = String(data.current_password || '').trim();
  const newPassword = String(data.new_password || '').trim();

  if (!userEmail) {
    return { success: false, message: '이메일이 필요합니다.' };
  }

  if (!currentPassword) {
    return { success: false, message: '현재 비밀번호가 필요합니다.' };
  }

  if (!newPassword) {
    return { success: false, message: '새 비밀번호가 필요합니다.' };
  }

  if (newPassword.length < 4) {
    return { success: false, message: '새 비밀번호는 4자 이상이어야 합니다.' };
  }

  if (newPassword === '1111') {
    return { success: false, message: '초기 비밀번호와 동일하게 설정할 수 없습니다.' };
  }

  const found = findUserRow_(userEmail);
  if (!found) {
    return { success: false, message: '사용자를 찾을 수 없습니다.' };
  }

  const user = rowToObject_(found.headers, found.rowValues);
  const active = String(user.active || '').trim().toUpperCase();

  if (active !== 'Y') {
    return { success: false, message: '비활성 사용자입니다.' };
  }

  const currentHash = hashPassword_(currentPassword, String(user.password_salt || '').trim());
  if (currentHash !== String(user.password_hash || '').trim()) {
    return { success: false, message: '현재 비밀번호가 올바르지 않습니다.' };
  }

  const newSalt = generateSalt_();
  const newHash = hashPassword_(newPassword, newSalt);

  updateRowByRowIndex_(CONFIG.SHEETS.USERS, found.rowIndex, {
    password_hash: newHash,
    password_salt: newSalt,
    first_login: 'N',
    last_login_at: getCurrentDateTime_()
  });

  return {
    success: true,
    message: '비밀번호가 변경되었습니다.'
  };
}

function listUsers_(requestUserEmail) {
  ensureAdminUser_(requestUserEmail);

  const rows = getAllUsers_();

  const data = rows.map(function(row) {
    return {
      user_email: row.user_email || '',
      user_name: row.user_name || '',
      role: row.role || '',
      department: row.department || '',
      clinic_code: row.clinic_code || '',
      clinic_name: row.clinic_name || '',
      team_code: row.team_code || '',
      team_name: row.team_name || '',
      phone: row.phone || '',
      active: row.active || '',
      last_login_at: row.last_login_at || '',
      created_at: row.created_at || '',
      first_login: row.first_login || 'N'
    };
  });

  return { success: true, data: data };
}

function getUserPermissions_(userEmail, requestUserEmail) {
  const targetEmail = String(userEmail || '').trim().toLowerCase();
  const requesterEmail = String(requestUserEmail || '').trim().toLowerCase();

  if (!targetEmail) {
    return { success: false, message: 'user_email 파라미터가 필요합니다.' };
  }

  if (!requesterEmail) {
    return { success: false, message: 'request_user_email 파라미터가 필요합니다.' };
  }

  const requester = ensureActiveUser_(requesterEmail);
  const requesterRole = String(requester.role || '').trim().toLowerCase();

  if (requesterEmail !== targetEmail && requesterRole !== 'admin') {
    return { success: false, message: '권한이 없습니다.' };
  }

  return {
    success: true,
    data: getActivePermissionsByEmail_(targetEmail)
  };
}

function getUserAppPermission_(userEmail, appId, requestUserEmail) {
  const targetEmail = String(userEmail || '').trim().toLowerCase();
  const requesterEmail = String(requestUserEmail || '').trim().toLowerCase();
  const targetAppId = String(appId || '').trim();

  if (!targetEmail) {
    return { success: false, message: 'user_email 파라미터가 필요합니다.' };
  }

  if (!targetAppId) {
    return { success: false, message: 'app_id 파라미터가 필요합니다.' };
  }

  if (!requesterEmail) {
    return { success: false, message: 'request_user_email 파라미터가 필요합니다.' };
  }

  const requester = ensureActiveUser_(requesterEmail);
  const requesterRole = String(requester.role || '').trim().toLowerCase();

  if (requesterEmail !== targetEmail && requesterRole !== 'admin') {
    return { success: false, message: '권한이 없습니다.' };
  }

  const permissions = getActivePermissionsByEmail_(targetEmail);
  const found = permissions.find(function(item) {
    return String(item.app_id || '').trim() === targetAppId;
  });

  return {
    success: true,
    data: found || null
  };
}

function getUserDetail_(userEmail, requestUserEmail) {
  ensureAdminUser_(requestUserEmail);

  const email = String(userEmail || '').trim().toLowerCase();
  if (!email) {
    return { success: false, message: 'user_email이 필요합니다.' };
  }

  const found = findUserRow_(email);
  if (!found) {
    return { success: false, message: '사용자를 찾을 수 없습니다.' };
  }

  const user = rowToObject_(found.headers, found.rowValues);
  const permissions = getActivePermissionsByEmail_(email);

  return {
    success: true,
    data: {
      user: {
        user_email: user.user_email || '',
        user_name: user.user_name || '',
        role: user.role || 'user',
        department: user.department || '',
        clinic_code: user.clinic_code || '',
        clinic_name: user.clinic_name || '',
        team_code: user.team_code || '',
        team_name: user.team_name || '',
        phone: user.phone || '',
        active: user.active || 'Y',
        last_login_at: user.last_login_at || '',
        created_at: user.created_at || '',
        first_login: user.first_login || 'N'
      },
      permissions: permissions
    }
  };
}

function updateUser_(data) {
  ensureAdminUser_(data.request_user_email);

  const email = String(data.user_email || '').trim().toLowerCase();
  const userName = String(data.user_name || '').trim();
  const role = String(data.role || 'user').trim();
  const phone = String(data.phone || '').trim();
  const active = String(data.active || 'Y').trim().toUpperCase();
  const permissions = Array.isArray(data.permissions) ? data.permissions : [];

  const clinicCode = normalizeString_(data.clinic_code);
  const clinicName = normalizeString_(data.clinic_name);
  const teamCode = normalizeString_(data.team_code);
  const teamName = normalizeString_(data.team_name);
  const department = buildDepartmentText_(clinicName, teamName, data.department);

  if (!email) {
    return { success: false, message: 'user_email이 필요합니다.' };
  }

  if (!userName) {
    return { success: false, message: '사용자명이 필요합니다.' };
  }

  if (!clinicCode) {
    return { success: false, message: '의원을 선택해 주세요.' };
  }

  if (!teamCode) {
    return { success: false, message: '팀을 선택해 주세요.' };
  }

  const found = findUserRow_(email);
  if (!found) {
    return { success: false, message: '수정할 사용자를 찾을 수 없습니다.' };
  }

  updateRowByRowIndex_(CONFIG.SHEETS.USERS, found.rowIndex, {
    user_name: userName,
    role: role,
    department: department,
    clinic_code: clinicCode,
    clinic_name: clinicName,
    team_code: teamCode,
    team_name: teamName,
    phone: phone,
    active: active
  });

  replaceUserPermissions_(email, permissions);

  writeLog_({
    action_type: 'UPDATE',
    target_type: 'USER',
    target_id: email,
    action_detail: '사용자 정보 수정',
    action_user: normalizeString_(data.request_user_email)
  });

  return {
    success: true,
    message: '사용자 정보가 수정되었습니다.'
  };
}

function resetUserPassword_(data) {
  ensureAdminUser_(data.request_user_email);

  const userEmail = String(data.user_email || '').trim().toLowerCase();
  if (!userEmail) {
    return { success: false, message: 'user_email이 필요합니다.' };
  }

  const found = findUserRow_(userEmail);
  if (!found) {
    return { success: false, message: '사용자를 찾을 수 없습니다.' };
  }

  const newSalt = generateSalt_();
  const newHash = hashPassword_('1111', newSalt);

  updateRowByRowIndex_(CONFIG.SHEETS.USERS, found.rowIndex, {
    password_hash: newHash,
    password_salt: newSalt,
    first_login: 'Y'
  });

  writeLog_({
    action_type: 'RESET_PASSWORD',
    target_type: 'USER',
    target_id: userEmail,
    action_detail: '사용자 비밀번호 초기화',
    action_user: normalizeString_(data.request_user_email)
  });

  return {
    success: true,
    message: '비밀번호가 초기화되었습니다. 초기 비밀번호는 1111입니다.'
  };
}

function setUserActive_(data) {
  ensureAdminUser_(data.request_user_email);

  const requestUserEmail = String(data.request_user_email || '').trim().toLowerCase();
  const userEmail = String(data.user_email || '').trim().toLowerCase();
  const active = String(data.active || '').trim().toUpperCase();

  if (!userEmail) {
    return { success: false, message: 'user_email이 필요합니다.' };
  }

  if (!['Y', 'N'].includes(active)) {
    return { success: false, message: 'active 값은 Y 또는 N 이어야 합니다.' };
  }

  if (requestUserEmail === userEmail && active === 'N') {
    return { success: false, message: '본인 계정은 비활성화할 수 없습니다.' };
  }

  const found = findUserRow_(userEmail);
  if (!found) {
    return { success: false, message: '사용자를 찾을 수 없습니다.' };
  }

  updateRowByRowIndex_(CONFIG.SHEETS.USERS, found.rowIndex, {
    active: active
  });

  writeLog_({
    action_type: active === 'Y' ? 'ACTIVATE' : 'DEACTIVATE',
    target_type: 'USER',
    target_id: userEmail,
    action_detail: active === 'Y' ? '사용자 활성화' : '사용자 비활성화',
    action_user: requestUserEmail
  });

  return {
    success: true,
    message: active === 'Y'
      ? '사용자가 활성화되었습니다.'
      : '사용자가 비활성화되었습니다.'
  };
}

function ensureAdminUser_(userEmail) {
  const email = String(userEmail || '').trim().toLowerCase();

  if (!email) {
    throw new Error('요청 사용자 정보가 없습니다.');
  }

  const found = findUserRow_(email);
  if (!found) {
    throw new Error('요청 사용자를 찾을 수 없습니다.');
  }

  const user = rowToObject_(found.headers, found.rowValues);
  const active = String(user.active || '').trim().toUpperCase();
  const role = String(user.role || '').trim().toLowerCase();

  if (active !== 'Y') {
    throw new Error('비활성 사용자입니다.');
  }

  if (role !== 'admin') {
    throw new Error('관리자 권한이 없습니다.');
  }

  return user;
}
