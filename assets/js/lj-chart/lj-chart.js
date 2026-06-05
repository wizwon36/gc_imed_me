/**
 * 21_LJChartService.gs
 * L-J 정도관리 차트 — 그룹 / 검사 항목 / QC 데이터 CRUD
 *
 * [lj_items 시트 컬럼]
 *   item_id | group_id | item_name | item_type | clinic_code | clinic_name |
 *   team_code | team_name | unit | mean | sd | decimal_places |
 *   preset | expected_value | memo |
 *   created_by | created_at | updated_at | deleted_yn
 *
 *   ※ lj_items 시트에 decimal_places 컬럼 추가 필요 (sd 컬럼 바로 뒤)
 *   ※ lj_items_backup 시트에도 decimal_places 컬럼 추가 필요
 */

// ── decimal_places 헬퍼 ───────────────────────────────────────
// 0~4 정수, 기본값 4
function parseLJDecimalPlaces_(val) {
  if (val === '' || val === null || val === undefined) return 3;
  const n = parseInt(val, 10);
  if (isNaN(n)) return 4;
  return Math.min(Math.max(n, 0), 4);
}

// ─────────────────────────────────────────────────────────────
// 그룹 (lj_groups) — 기존과 동일
// ─────────────────────────────────────────────────────────────

function ljGetGroups_(params) {
  const requestUserEmail = normalizeString_(params.request_user_email);
  const userRow = ensureActiveUser_(requestUserEmail);
  ensureLJPermission_(requestUserEmail);
  const role = normalizeString_(userRow.role).toLowerCase();
  const isAdmin = role === 'admin';
  const myTeamCode = isAdmin ? '' : normalizeString_(userRow.team_code);
  const rows = getAllValuesAsObjects_(CONFIG.SHEETS.LJ_GROUPS);
  const active = rows.filter(function(row) {
    if (String(row.deleted_yn || 'N').trim().toUpperCase() === 'Y') return false;
    if (myTeamCode && normalizeString_(row.team_code) !== myTeamCode) return false;
    return true;
  });
  active.sort(function(a, b) { return String(a.created_at || '').localeCompare(String(b.created_at || '')); });
  return { success: true, count: active.length, data: active.map(buildLJGroupDto_) };
}

function ljCreateGroup_(payload) {
  const requestUserEmail = normalizeString_(payload.request_user_email);
  const userRow = ensureActiveUser_(requestUserEmail);
  ensureLJPermission_(requestUserEmail);
  if (isEmpty_(payload.group_name)) throw new Error('그룹명은 필수입니다.');
  return withScriptLock_(function() {
    const clinicCode = normalizeString_(payload.clinic_code) || normalizeString_(userRow.clinic_code);
    const teamCode   = normalizeString_(payload.team_code)   || normalizeString_(userRow.team_code);
    const org = resolveOrgFields_(clinicCode, teamCode, {
      clinic_name: normalizeString_(userRow.clinic_name),
      team_name:   normalizeString_(userRow.team_name),
      department:  normalizeString_(userRow.department)
    });
    if (isEmpty_(org.team_code)) throw new Error('팀 정보가 없습니다.');
    const groupId = generateUniqueId_('LJG');
    const now = getCurrentDateTime_();
    const row = {
      group_id: groupId, group_name: normalizeString_(payload.group_name),
      memo: normalizeString_(payload.memo),
      clinic_code: org.clinic_code, clinic_name: org.clinic_name,
      team_code: org.team_code, team_name: org.team_name,
      created_by: requestUserEmail, created_at: now, updated_at: now, deleted_yn: 'N'
    };
    appendObjectRow_(CONFIG.SHEETS.LJ_GROUPS, row);
    writeLog_({ action_type: 'CREATE', target_type: 'LJ_GROUP', target_id: groupId,
      action_detail: '그룹 등록: ' + row.group_name, action_user: requestUserEmail });
    return { success: true, message: '그룹이 등록되었습니다.', data: buildLJGroupDto_(row) };
  });
}

function ljUpdateGroup_(payload) {
  const requestUserEmail = normalizeString_(payload.request_user_email);
  ensureActiveUser_(requestUserEmail); ensureLJPermission_(requestUserEmail);
  const groupId = normalizeString_(payload.group_id);
  if (isEmpty_(groupId)) throw new Error('group_id는 필수입니다.');
  if (isEmpty_(payload.group_name)) throw new Error('그룹명은 필수입니다.');
  return withScriptLock_(function() {
    const found = findRowByColumnValue_(CONFIG.SHEETS.LJ_GROUPS, 'group_id', groupId);
    if (!found) throw new Error('그룹을 찾을 수 없습니다.');
    const current = rowToObject_(found.headers, found.rowValues);
    if (String(current.deleted_yn || 'N').trim().toUpperCase() === 'Y') throw new Error('삭제된 그룹입니다.');
    const now = getCurrentDateTime_();
    const updateData = { group_name: normalizeString_(payload.group_name), memo: normalizeString_(payload.memo), updated_at: now };
    updateRowByRowIndex_(CONFIG.SHEETS.LJ_GROUPS, found.rowIndex, updateData);
    writeLog_({ action_type: 'UPDATE', target_type: 'LJ_GROUP', target_id: groupId,
      action_detail: '그룹 수정: ' + updateData.group_name, action_user: requestUserEmail });
    return { success: true, message: '그룹이 수정되었습니다.' };
  });
}

function ljDeleteGroup_(payload) {
  const requestUserEmail = normalizeString_(payload.request_user_email);
  ensureActiveUser_(requestUserEmail); ensureLJPermission_(requestUserEmail);
  const groupId = normalizeString_(payload.group_id);
  if (isEmpty_(groupId)) throw new Error('group_id는 필수입니다.');
  return withScriptLock_(function() {
    const found = findRowByColumnValue_(CONFIG.SHEETS.LJ_GROUPS, 'group_id', groupId);
    if (!found) throw new Error('그룹을 찾을 수 없습니다.');
    const now = getCurrentDateTime_();
    updateRowByRowIndex_(CONFIG.SHEETS.LJ_GROUPS, found.rowIndex, { deleted_yn: 'Y', updated_at: now });
    ljUnlinkItemsByGroupId_(groupId, now);
    writeLog_({ action_type: 'DELETE', target_type: 'LJ_GROUP', target_id: groupId,
      action_detail: '그룹 삭제 (하위 항목 그룹 해제)', action_user: requestUserEmail });
    return { success: true, message: '그룹이 삭제되었습니다. 하위 항목은 미분류로 이동되었습니다.' };
  });
}

// ─────────────────────────────────────────────────────────────
// 검사 항목 (lj_items) — decimal_places 추가
// ─────────────────────────────────────────────────────────────

function ljGetItems_(params) {
  const requestUserEmail = normalizeString_(params.request_user_email);
  const userRow = ensureActiveUser_(requestUserEmail);
  ensureLJPermission_(requestUserEmail);
  const role = normalizeString_(userRow.role).toLowerCase();
  const isAdmin = role === 'admin';
  const myTeamCode = isAdmin ? '' : normalizeString_(userRow.team_code);
  const filterGroupId = normalizeString_(params.group_id || '');
  const rows = getAllValuesAsObjects_(CONFIG.SHEETS.LJ_ITEMS);
  let active = rows.filter(function(row) {
    if (String(row.deleted_yn || 'N').trim().toUpperCase() === 'Y') return false;
    if (myTeamCode && normalizeString_(row.team_code) !== myTeamCode) return false;
    if (filterGroupId && normalizeString_(row.group_id) !== filterGroupId) return false;
    return true;
  });
  active.sort(function(a, b) { return String(a.created_at || '').localeCompare(String(b.created_at || '')); });
  return { success: true, count: active.length, data: active.map(buildLJItemDto_) };
}

function ljCreateItem_(payload) {
  const requestUserEmail = normalizeString_(payload.request_user_email);
  const userRow = ensureActiveUser_(requestUserEmail);
  ensureLJPermission_(requestUserEmail);
  validateLJItemPayload_(payload);
  return withScriptLock_(function() {
    const clinicCode = normalizeString_(payload.clinic_code) || normalizeString_(userRow.clinic_code);
    const teamCode   = normalizeString_(payload.team_code)   || normalizeString_(userRow.team_code);
    const org = resolveOrgFields_(clinicCode, teamCode, {
      clinic_name: normalizeString_(userRow.clinic_name),
      team_name:   normalizeString_(userRow.team_name),
      department:  normalizeString_(userRow.department)
    });
    if (isEmpty_(org.team_code)) throw new Error('팀 정보가 없습니다.');
    const groupId = normalizeString_(payload.group_id || '');
    if (!isEmpty_(groupId)) {
      const groupFound = findRowByColumnValue_(CONFIG.SHEETS.LJ_GROUPS, 'group_id', groupId);
      if (!groupFound) throw new Error('존재하지 않는 그룹입니다.');
    }
    const itemId = generateUniqueId_('LJI');
    const now    = getCurrentDateTime_();
    const row = {
      item_id:        itemId,
      group_id:       groupId,
      item_name:      normalizeString_(payload.item_name),
      item_type:      normalizeString_(payload.item_type) || 'quantitative',
      clinic_code:    org.clinic_code,
      clinic_name:    org.clinic_name,
      team_code:      org.team_code,
      team_name:      org.team_name,
      unit:           normalizeString_(payload.unit),
      mean:           payload.mean !== '' ? Number(payload.mean) : '',
      sd:             payload.sd   !== '' ? Number(payload.sd)   : '',
      decimal_places: parseLJDecimalPlaces_(payload.decimal_places),  // ← 추가
      preset:         normalizeString_(payload.preset),
      expected_value: normalizeString_(payload.expected_value),
      memo:           normalizeString_(payload.memo),
      created_by:     requestUserEmail,
      created_at:     now,
      updated_at:     now,
      deleted_yn:     'N'
    };
    appendObjectRow_(CONFIG.SHEETS.LJ_ITEMS, row);
    writeLog_({ action_type: 'CREATE', target_type: 'LJ_ITEM', target_id: itemId,
      action_detail: '검사 항목 등록: ' + row.item_name, action_user: requestUserEmail });
    return { success: true, message: '검사 항목이 등록되었습니다.', data: buildLJItemDto_(row) };
  });
}

function ljUpdateItem_(payload) {
  const requestUserEmail = normalizeString_(payload.request_user_email);
  ensureActiveUser_(requestUserEmail); ensureLJPermission_(requestUserEmail);
  const itemId = normalizeString_(payload.item_id);
  if (isEmpty_(itemId)) throw new Error('item_id는 필수입니다.');
  validateLJItemPayload_(payload);
  return withScriptLock_(function() {
    const found = findRowByColumnValue_(CONFIG.SHEETS.LJ_ITEMS, 'item_id', itemId);
    if (!found) throw new Error('검사 항목을 찾을 수 없습니다.');
    const current = rowToObject_(found.headers, found.rowValues);
    if (String(current.deleted_yn || 'N').trim().toUpperCase() === 'Y') throw new Error('삭제된 항목입니다.');
    const groupId = normalizeString_(payload.group_id !== undefined ? payload.group_id : current.group_id || '');
    if (!isEmpty_(groupId)) {
      const groupFound = findRowByColumnValue_(CONFIG.SHEETS.LJ_GROUPS, 'group_id', groupId);
      if (!groupFound) throw new Error('존재하지 않는 그룹입니다.');
      const groupRow = rowToObject_(groupFound.headers, groupFound.rowValues);
      const itemTeamCode  = normalizeString_(payload.team_code  || current.team_code  || '');
      const groupTeamCode = normalizeString_(groupRow.team_code || '');
      if (!isEmpty_(itemTeamCode) && !isEmpty_(groupTeamCode) && itemTeamCode !== groupTeamCode) {
        throw new Error('항목과 그룹의 소속 팀이 다릅니다.');
      }
    }
    // decimal_places: payload에 있으면 갱신, 없으면 기존 값 유지
    const decimalPlaces = payload.decimal_places !== undefined
      ? parseLJDecimalPlaces_(payload.decimal_places)
      : parseLJDecimalPlaces_(current.decimal_places);
    const now = getCurrentDateTime_();
    const updateData = {
      group_id:       groupId,
      item_name:      normalizeString_(payload.item_name),
      item_type:      normalizeString_(payload.item_type) || 'quantitative',
      unit:           normalizeString_(payload.unit),
      mean:           payload.mean !== '' ? Number(payload.mean) : '',
      sd:             payload.sd   !== '' ? Number(payload.sd)   : '',
      decimal_places: decimalPlaces,  // ← 추가
      preset:         normalizeString_(payload.preset),
      expected_value: normalizeString_(payload.expected_value),
      memo:           normalizeString_(payload.memo),
      clinic_code:    normalizeString_(payload.clinic_code) || normalizeString_(current.clinic_code),
      clinic_name:    normalizeString_(payload.clinic_name) || normalizeString_(current.clinic_name),
      team_code:      normalizeString_(payload.team_code)   || normalizeString_(current.team_code),
      team_name:      normalizeString_(payload.team_name)   || normalizeString_(current.team_name),
      updated_at:     now
    };
    backupRowBeforeChange_(CONFIG.SHEETS.LJ_ITEMS_BACKUP, found.headers, found.rowValues, 'UPDATE', requestUserEmail);
    updateRowByRowIndex_(CONFIG.SHEETS.LJ_ITEMS, found.rowIndex, updateData);
    const ljItemDiff = buildDiffLog_(current, updateData);
    writeLog_({ action_type: 'UPDATE', target_type: 'LJ_ITEM', target_id: itemId,
      action_detail: '검사 항목 수정: ' + normalizeString_(payload.item_name), action_user: requestUserEmail,
      before_data: ljItemDiff ? ljItemDiff.before : null, after_data: ljItemDiff ? ljItemDiff.after : null });
    return { success: true, message: '검사 항목이 수정되었습니다.' };
  });
}

function ljDeleteItem_(payload) {
  const requestUserEmail = normalizeString_(payload.request_user_email);
  ensureActiveUser_(requestUserEmail); ensureLJPermission_(requestUserEmail);
  const itemId = normalizeString_(payload.item_id);
  if (isEmpty_(itemId)) throw new Error('item_id는 필수입니다.');
  return withScriptLock_(function() {
    const found = findRowByColumnValue_(CONFIG.SHEETS.LJ_ITEMS, 'item_id', itemId);
    if (!found) throw new Error('검사 항목을 찾을 수 없습니다.');
    const now = getCurrentDateTime_();
    backupRowBeforeChange_(CONFIG.SHEETS.LJ_ITEMS_BACKUP, found.headers, found.rowValues, 'DELETE', requestUserEmail);
    updateRowByRowIndex_(CONFIG.SHEETS.LJ_ITEMS, found.rowIndex, { deleted_yn: 'Y', updated_at: now });
    ljDeleteEntriesByItemId_(itemId, now);
    writeLog_({ action_type: 'DELETE', target_type: 'LJ_ITEM', target_id: itemId,
      action_detail: '검사 항목 삭제', action_user: requestUserEmail });
    return { success: true, message: '검사 항목이 삭제되었습니다.' };
  });
}

// ─────────────────────────────────────────────────────────────
// QC 데이터 (lj_entries) — 기존과 동일
// ─────────────────────────────────────────────────────────────

function ljGetEntries_(params) {
  const requestUserEmail = normalizeString_(params.request_user_email);
  ensureActiveUser_(requestUserEmail); ensureLJPermission_(requestUserEmail);
  const itemId = normalizeString_(params.item_id);
  if (isEmpty_(itemId)) throw new Error('item_id는 필수입니다.');
  const rawFrom = params.date_from;
  const rawTo   = params.date_to;
  const isFullRange = (rawFrom === '' && rawTo === '');
  var dateFrom = '', dateTo = '';
  if (!isFullRange) {
    var today = new Date();
    var todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    dateFrom = rawFrom ? normalizeString_(rawFrom).substring(0, 10)
      : Utilities.formatDate(new Date(today.setDate(today.getDate() - 30)), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    dateTo = rawTo ? normalizeString_(rawTo).substring(0, 10) : todayStr;
  }
  const rows = getAllValuesAsObjects_(CONFIG.SHEETS.LJ_ENTRIES);
  const filtered = rows.filter(function(row) {
    if (normalizeString_(row.item_id) !== itemId) return false;
    if (String(row.deleted_yn || 'N').trim().toUpperCase() === 'Y') return false;
    if (!isFullRange) {
      var rowDate = normalizeLJDate_(row.date);
      if (!rowDate || rowDate < dateFrom || rowDate > dateTo) return false;
    }
    return true;
  });
  filtered.sort(function(a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
  return { success: true, count: filtered.length, data: filtered.map(buildLJEntryDto_) };
}

function ljCreateEntry_(payload) {
  const requestUserEmail = normalizeString_(payload.request_user_email);
  ensureActiveUser_(requestUserEmail); ensureLJPermission_(requestUserEmail);
  validateLJEntryPayload_(payload);
  return withScriptLock_(function() {
    const itemFound = findRowByColumnValue_(CONFIG.SHEETS.LJ_ITEMS, 'item_id', normalizeString_(payload.item_id));
    if (!itemFound) throw new Error('존재하지 않는 검사 항목입니다.');
    const entryId = generateUniqueId_('LJE');
    const now = getCurrentDateTime_();
    const row = {
      entry_id: entryId, item_id: normalizeString_(payload.item_id),
      date: normalizeString_(payload.date), value: normalizeString_(String(payload.value)),
      memo: normalizeString_(payload.memo), created_by: requestUserEmail, created_at: now, deleted_yn: 'N'
    };
    appendObjectRow_(CONFIG.SHEETS.LJ_ENTRIES, row);
    writeLog_({ action_type: 'CREATE', target_type: 'LJ_ENTRY', target_id: entryId,
      action_detail: 'QC 데이터 등록 (item_id: ' + row.item_id + ', date: ' + row.date + ', value: ' + row.value + ')',
      action_user: requestUserEmail });
    return { success: true, message: '데이터가 등록되었습니다.', data: buildLJEntryDto_(row) };
  });
}

function ljDeleteEntry_(payload) {
  const requestUserEmail = normalizeString_(payload.request_user_email);
  ensureActiveUser_(requestUserEmail); ensureLJPermission_(requestUserEmail);
  const entryId = normalizeString_(payload.entry_id);
  if (isEmpty_(entryId)) throw new Error('entry_id는 필수입니다.');
  return withScriptLock_(function() {
    const found = findRowByColumnValue_(CONFIG.SHEETS.LJ_ENTRIES, 'entry_id', entryId);
    if (!found) throw new Error('데이터를 찾을 수 없습니다.');
    const current = rowToObject_(found.headers, found.rowValues);
    updateRowByRowIndex_(CONFIG.SHEETS.LJ_ENTRIES, found.rowIndex, { deleted_yn: 'Y' });
    writeLog_({ action_type: 'DELETE', target_type: 'LJ_ENTRY', target_id: entryId,
      action_detail: 'QC 데이터 삭제 (item_id: ' + normalizeString_(current.item_id) + ', date: ' + normalizeString_(String(current.date || '')) + ')',
      action_user: requestUserEmail });
    return { success: true, message: '데이터가 삭제되었습니다.' };
  });
}

// ─────────────────────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────────────────────

function normalizeLJDate_(rawDate) {
  if (!rawDate) return '';
  if (rawDate instanceof Date) return Utilities.formatDate(rawDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = normalizeString_(rawDate);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  try { var d = new Date(s); if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch(e) {}
  return '';
}

function ljUnlinkItemsByGroupId_(groupId, now) {
  const sheet = getSheet_(CONFIG.SHEETS.LJ_ITEMS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0];
  const groupIdIdx = headers.indexOf('group_id');
  const deletedIdx = headers.indexOf('deleted_yn');
  if (groupIdIdx === -1) return;
  for (var i = 1; i < values.length; i++) {
    if (normalizeString_(String(values[i][groupIdIdx] || '')) !== groupId) continue;
    if (deletedIdx !== -1 && String(values[i][deletedIdx] || 'N').trim().toUpperCase() === 'Y') continue;
    sheet.getRange(i + 1, groupIdIdx + 1).setValue('');
  }
  clearSheetRuntimeCache_(CONFIG.SHEETS.LJ_ITEMS);
}

function ljDeleteEntriesByItemId_(itemId, now) {
  const sheet = getSheet_(CONFIG.SHEETS.LJ_ENTRIES);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0];
  const itemIdIdx  = headers.indexOf('item_id');
  const deletedIdx = headers.indexOf('deleted_yn');
  if (itemIdIdx === -1 || deletedIdx === -1) return;
  for (var i = 1; i < values.length; i++) {
    if (normalizeString_(String(values[i][itemIdIdx] || '')) !== itemId) continue;
    if (String(values[i][deletedIdx] || 'N').trim().toUpperCase() === 'Y') continue;
    sheet.getRange(i + 1, deletedIdx + 1).setValue('Y');
  }
  clearSheetRuntimeCache_(CONFIG.SHEETS.LJ_ENTRIES);
}

function ensureLJPermission_(userEmail) {
  const found = findRowByColumnValue_(CONFIG.SHEETS.USERS, 'user_email', userEmail);
  if (!found) throw new Error('사용자를 찾을 수 없습니다.');
  const user = rowToObject_(found.headers, found.rowValues);
  const role = normalizeString_(user.role).toLowerCase();
  if (role === 'admin') return;
  const permissions = getActivePermissionsByEmail_(userEmail);
  const hasAccess = permissions.some(function(p) { return normalizeString_(p.app_id) === 'lj_chart'; });
  if (!hasAccess) throw new Error('L-J 정도관리 차트에 접근할 권한이 없습니다.');
}

function validateLJItemPayload_(payload) {
  if (isEmpty_(payload.item_name)) throw new Error('검사 항목명은 필수입니다.');
  const itemType = normalizeString_(payload.item_type) || 'quantitative';
  if (itemType === 'qualitative') {
    if (isEmpty_(payload.preset))         throw new Error('결과값 프리셋은 필수입니다.');
    if (isEmpty_(payload.expected_value)) throw new Error('기대 결과값은 필수입니다.');
  } else {
    if (isEmpty_(payload.unit)) throw new Error('단위는 필수입니다.');
    if (isEmpty_(payload.mean)) throw new Error('목표 평균(mean)은 필수입니다.');
    if (isEmpty_(payload.sd))   throw new Error('표준편차(sd)는 필수입니다.');
    const mean = Number(payload.mean), sd = Number(payload.sd);
    if (isNaN(mean))          throw new Error('목표 평균은 숫자여야 합니다.');
    if (isNaN(sd) || sd <= 0) throw new Error('표준편차는 0보다 큰 숫자여야 합니다.');
  }
}

function validateLJEntryPayload_(payload) {
  if (isEmpty_(payload.item_id)) throw new Error('item_id는 필수입니다.');
  if (isEmpty_(payload.date))    throw new Error('측정일은 필수입니다.');
  if (isEmpty_(payload.value))   throw new Error('측정값은 필수입니다.');
}

function buildLJGroupDto_(row) {
  return {
    group_id: normalizeString_(row.group_id), group_name: normalizeString_(row.group_name),
    memo: normalizeString_(row.memo), clinic_code: normalizeString_(row.clinic_code),
    clinic_name: normalizeString_(row.clinic_name), team_code: normalizeString_(row.team_code),
    team_name: normalizeString_(row.team_name), created_by: normalizeString_(row.created_by),
    created_at: formatSheetTimestamp_(row.created_at), updated_at: formatSheetTimestamp_(row.updated_at)
  };
}

function buildLJItemDto_(row) {
  const org = resolveOrgFields_(row.clinic_code, row.team_code,
    { clinic_name: row.clinic_name, team_name: row.team_name });
  return {
    item_id:        normalizeString_(row.item_id),
    group_id:       normalizeString_(row.group_id || ''),
    item_name:      normalizeString_(row.item_name),
    item_type:      normalizeString_(row.item_type) || 'quantitative',
    unit:           normalizeString_(row.unit),
    mean:           row.mean !== '' ? Number(row.mean || 0) : '',
    sd:             row.sd   !== '' ? Number(row.sd   || 0) : '',
    decimal_places: parseLJDecimalPlaces_(row.decimal_places),  // ← 추가
    preset:         normalizeString_(row.preset),
    expected_value: normalizeString_(row.expected_value),
    memo:           normalizeString_(row.memo),
    clinic_code:    org.clinic_code, clinic_name: org.clinic_name,
    team_code:      org.team_code,   team_name:   org.team_name,
    department:     org.department,
    created_by:     normalizeString_(row.created_by),
    created_at:     formatSheetTimestamp_(row.created_at),
    updated_at:     formatSheetTimestamp_(row.updated_at)
  };
}

function buildLJEntryDto_(row) {
  var rawDate = row.date, dateStr = '';
  if (rawDate instanceof Date) {
    dateStr = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } else {
    var s = normalizeString_(rawDate);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) { dateStr = s.substring(0, 10); }
    else if (s) { try { var d = new Date(s); dateStr = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch(e) { dateStr = s; } }
  }
  return {
    entry_id: normalizeString_(row.entry_id), item_id: normalizeString_(row.item_id),
    date: dateStr, value: normalizeString_(String(row.value != null ? row.value : '')),
    memo: normalizeString_(row.memo), created_by: normalizeString_(row.created_by),
    created_at: formatSheetTimestamp_(row.created_at)
  };
}
