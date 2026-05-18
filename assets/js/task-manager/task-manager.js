/**
 * task-manager.js
 * 업무일정 관리 앱 — 주간 업무 / 주간일지 / 팀원 현황
 */

(function () {
  'use strict';

  // ── 상수 ────────────────────────────────────────────────────
  const CATEGORY_LABELS = {
    PURCHASE:  '구매',
    STRATEGY:  '전략기획',
    OPERATION: '운영',
    FACILITY:  '시설',
    SAFETY:    '안전보건',
    MARKETING: '홍보마케팅',
    ETC:       '기타'
  };

  const STATUS_LABELS = {
    TODO:        '예정',
    IN_PROGRESS: '진행중',
    DONE:        '완료'
  };

  const DOW_KR = ['일', '월', '화', '수', '목', '금', '토'];

  // ── 상태 ────────────────────────────────────────────────────
  let currentUser = null;
  let isManager   = false;
  let isAdmin     = false;

  // 주간 업무 탭
  let weeklyWeekStart = '';
  let weeklyTasks     = [];

  // 주간일지 탭
  let journalWeekStart    = '';
  let currentJournal      = null;
  let currentJournalTasks = null;
  let autosaveTimer       = null;
  let journalDirty        = false;

  // 팀 탭
  let teamWeekStart  = '';
  let _lastTeamData  = [];

  // 캘린더 팝업
  let calendarPopupMonth = '';   // 'yyyy-MM' 형태

  // 모달
  let editingTaskId   = null;

  // ── 초기화 ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    currentUser = window.auth?.getSession?.();
    if (!currentUser) {
      alert('로그인 세션이 만료되었습니다.');
      location.replace(`${CONFIG.SITE_BASE_URL}/index.html`);
      return;
    }

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      window.auth.logout();
    });

    try {
      showGlobalLoading('권한 확인 중...');

      const permResult = await apiGet('getUserAppPermission', {
        user_email:         currentUser.email,
        app_id:             'task_manager',
        request_user_email: currentUser.email
      });

      const role = String(currentUser.role || '').toLowerCase();
      isAdmin = role === 'admin';

      const perm = permResult.data;
      if (!isAdmin && !perm) {
        document.getElementById('permissionDenied').style.display = '';
        return;
      }

      isManager = isAdmin || (perm && perm.permission === 'manager');

      document.getElementById('appBody').style.display = '';

      if (isManager) {
        document.getElementById('tabTeam').style.display = '';
      }

      const todayStr      = formatDateStr(new Date());
      weeklyWeekStart     = getWeekStart(todayStr);
      journalWeekStart    = weeklyWeekStart;
      teamWeekStart       = weeklyWeekStart;
      calendarPopupMonth  = weeklyWeekStart.substring(0, 7);

      bindEvents();
      updateSharedWeekNav();
      await loadWeeklyTasks();

      if (isManager) {
        loadTeamJournals();
      }

    } catch (err) {
      showMessage(err.message || '초기화에 실패했습니다.', 'error');
    } finally {
      hideGlobalLoading();
    }
  });

  // ── 이벤트 바인딩 ────────────────────────────────────────────
  function bindEvents() {
    // 탭
    document.querySelectorAll('.task-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 주간 업무 — 주 이동
    // ── 공통 주차 네비게이터 ───────────────────────────────────
    document.getElementById('prevWeekBtn')?.addEventListener('click', () => {
      navigateWeek(-1);
    });
    document.getElementById('nextWeekBtn')?.addEventListener('click', () => {
      navigateWeek(1);
    });
    document.getElementById('todayBtn')?.addEventListener('click', () => {
      navigateWeekTo(getWeekStart(formatDateStr(new Date())));
    });

    // 날짜 범위 버튼 → 캘린더 팝업 토글
    document.getElementById('weekNavRangeBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCalendarPopup();
    });

    // 캘린더 팝업 월 이동
    document.getElementById('wcpPrevMonth')?.addEventListener('click', () => {
      calendarPopupMonth = offsetMonth(calendarPopupMonth, -1);
      renderCalendarPopup();
    });
    document.getElementById('wcpNextMonth')?.addEventListener('click', () => {
      calendarPopupMonth = offsetMonth(calendarPopupMonth, 1);
      renderCalendarPopup();
    });

    // 팝업 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
      const nav = document.getElementById('sharedWeekNav');
      if (nav && !nav.contains(e.target)) {
        document.getElementById('weekCalendarPopup')?.classList.remove('open');
      }
    });

    // 모달
    document.getElementById('taskModalClose')?.addEventListener('click', closeTaskModal);
    document.getElementById('taskModalCancelBtn')?.addEventListener('click', closeTaskModal);
    document.getElementById('taskModalSaveBtn')?.addEventListener('click', saveTask);
    document.getElementById('taskModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('taskModal')) closeTaskModal();
    });

    // 우선순위 & 상태 선택 UI
    document.querySelectorAll('.priority-option').forEach(label => {
      label.addEventListener('click', () => updatePriorityUI(label.querySelector('input').value));
    });
    document.querySelectorAll('.status-option').forEach(label => {
      label.addEventListener('click', () => updateStatusUI(label.querySelector('input').value));
    });

    // 일지 버튼
    document.getElementById('journalSaveBtn')?.addEventListener('click', () => saveJournal(false));
    document.getElementById('journalSubmitBtn')?.addEventListener('click', submitJournal);
    document.getElementById('journalCloseBtn')?.addEventListener('click', closeJournal);

    // 일지 자동 저장 (입력 후 2.5초 디바운스)
    ['journalSummary','journalAchievements','journalNextPlan','journalIssues',
     'attendanceThisWeek','attendanceNextWeek'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', onJournalInput);
    });

    // 팀원 일지 모달
    document.getElementById('memberJournalClose')?.addEventListener('click', closeMemberModal);
    document.getElementById('memberJournalDismissBtn')?.addEventListener('click', closeMemberModal);

    // 통합 보기 모달
    document.getElementById('mergeViewBtn')?.addEventListener('click', openMergeView);

    // 업무일지 생성 버튼
    document.getElementById('generateJournalBtn')?.addEventListener('click', handleGenerateJournal);
    document.getElementById('mergeViewClose')?.addEventListener('click', closeMergeView);
    document.getElementById('mergeViewDismissBtn')?.addEventListener('click', closeMergeView);
    document.getElementById('mergeViewModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('mergeViewModal')) closeMergeView();
    });
  }

  // ── 탭 전환 ─────────────────────────────────────────────────
  function switchTab(tab) {
    document.querySelectorAll('.task-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('panelWeekly').style.display  = tab === 'weekly'  ? '' : 'none';
    document.getElementById('panelJournal').style.display = tab === 'journal' ? '' : 'none';
    document.getElementById('panelTeam').style.display    = tab === 'team'    ? '' : 'none';

    // 탭 전환 즉시 공통 네비게이터 레이블 갱신
    updateSharedWeekNav();

    if (tab === 'journal') {
      if (currentJournal && currentJournal._fromGenerate) {
        delete currentJournal._fromGenerate;
      } else {
        journalWeekStart = weeklyWeekStart;
        loadJournal();
      }
    }
    if (tab === 'team' && isManager) loadTeamJournals();
  }

  // ── 날짜 유틸 ────────────────────────────────────────────────
  function formatDateStr(d) {
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function getWeekStart(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - d.getDay());
    return formatDateStr(d);
  }

  function getWeekEnd(weekStart) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return formatDateStr(d);
  }

  function offsetWeek(weekStart, delta) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + delta * 7);
    return formatDateStr(d);
  }

  function offsetMonth(yyyyMM, delta) {
    const [y, m] = yyyyMM.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function formatWeekRange(weekStart) {
    const weekEnd = getWeekEnd(weekStart);
    const s = weekStart.substring(5).replace('-', '/');
    const e = weekEnd.substring(5).replace('-', '/');
    return `${weekStart.substring(0, 4)}년 ${s} ~ ${e}`;
  }

  function isThisWeek(weekStart) {
    return weekStart === getWeekStart(formatDateStr(new Date()));
  }

  // ── 공통 네비게이터: 주 이동 ─────────────────────────────────
  function getCurrentTabWeekStart() {
    const activeTab = document.querySelector('.task-tab-btn.active')?.dataset?.tab;
    if (activeTab === 'journal') return journalWeekStart;
    if (activeTab === 'team')    return teamWeekStart;
    return weeklyWeekStart;
  }

  function navigateWeek(delta) {
    const activeTab = document.querySelector('.task-tab-btn.active')?.dataset?.tab;
    if (activeTab === 'journal') {
      journalWeekStart = offsetWeek(journalWeekStart, delta);
      loadJournal();
    } else if (activeTab === 'team') {
      teamWeekStart = offsetWeek(teamWeekStart, delta);
      loadTeamJournals();
    } else {
      weeklyWeekStart = offsetWeek(weeklyWeekStart, delta);
      loadWeeklyTasks();
    }
    updateSharedWeekNav();
  }

  function navigateWeekTo(weekStart) {
    const activeTab = document.querySelector('.task-tab-btn.active')?.dataset?.tab;
    if (activeTab === 'journal') {
      journalWeekStart = weekStart;
      loadJournal();
    } else if (activeTab === 'team') {
      teamWeekStart = weekStart;
      loadTeamJournals();
    } else {
      weeklyWeekStart = weekStart;
      loadWeeklyTasks();
    }
    updateSharedWeekNav();
  }

  // 공통 네비게이터 레이블 갱신
  function updateSharedWeekNav() {
    const ws = getCurrentTabWeekStart();
    const rangeEl = document.getElementById('weekRangeLabel');
    const subEl   = document.getElementById('weekSubLabel');
    if (rangeEl) rangeEl.textContent = formatWeekRange(ws);
    if (subEl)   subEl.textContent   = isThisWeek(ws) ? '이번 주' : '';
  }

  // ── 월 캘린더 팝업 ───────────────────────────────────────────
  function toggleCalendarPopup() {
    const popup = document.getElementById('weekCalendarPopup');
    if (!popup) return;
    if (popup.classList.contains('open')) {
      popup.classList.remove('open');
    } else {
      // 현재 탭의 주차 기준으로 팝업 달력 초기화
      const ws = getCurrentTabWeekStart();
      calendarPopupMonth = ws.substring(0, 7); // 'yyyy-MM'
      renderCalendarPopup();
      popup.classList.add('open');
    }
  }

  function renderCalendarPopup() {
    const [year, month] = calendarPopupMonth.split('-').map(Number);
    const titleEl = document.getElementById('wcpMonthTitle');
    const gridEl  = document.getElementById('wcpGrid');
    if (!titleEl || !gridEl) return;

    titleEl.textContent = `${year}년 ${month}월`;

    const todayStr       = formatDateStr(new Date());
    const currentWS      = getCurrentTabWeekStart();

    // 해당 월 1일의 요일 (0=일)
    const firstDay = new Date(year, month - 1, 1).getDay();
    // 해당 월 마지막 날
    const lastDate = new Date(year, month, 0).getDate();

    // 캘린더 시작일: 1일 기준 이전 일요일
    const startDate = new Date(year, month - 1, 1 - firstDay);

    // 6주 * 7일 = 42칸
    const totalCells = 42;
    let html = '';
    let weekStartDate = null;

    for (let i = 0; i < totalCells; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const ds  = formatDateStr(d);
      const dow = d.getDay();

      // 일요일마다 주 행 시작
      if (dow === 0) {
        weekStartDate = ds;
        const isSelected = weekStartDate === currentWS;
        html += `<div class="wcp-week-row${isSelected ? ' is-selected' : ''}" data-week="${weekStartDate}">`;
      }

      const isCurrentMonth = (d.getMonth() + 1) === month;
      const isToday        = ds === todayStr;
      const isSun          = dow === 0;
      const isSat          = dow === 6;

      const cls = [
        'wcp-day',
        !isCurrentMonth ? 'is-other-month' : '',
        isToday         ? 'is-today'        : '',
        isSun           ? 'is-sunday'       : '',
        isSat           ? 'is-saturday'     : ''
      ].filter(Boolean).join(' ');

      html += `<span class="${cls}">${d.getDate()}</span>`;

      // 토요일마다 주 행 닫기
      if (dow === 6) html += `</div>`;
    }

    gridEl.innerHTML = html;

    // 주 행 클릭 이벤트
    gridEl.querySelectorAll('.wcp-week-row').forEach(row => {
      row.addEventListener('click', () => {
        const ws = row.dataset.week;
        document.getElementById('weekCalendarPopup').classList.remove('open');
        navigateWeekTo(ws);
        calendarPopupMonth = ws.substring(0, 7);
      });
    });
  }

  function getDaysOfWeek(weekStart) {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart + 'T00:00:00');
      d.setDate(d.getDate() + i);
      return formatDateStr(d);
    });
  }

  // ── 주간 업무 로드 ───────────────────────────────────────────
  // ── 업무일지 생성 (주간업무 → 일지 자동 작성) ───────────────
  async function handleGenerateJournal() {
    const todayWeekStart = getWeekStart(formatDateStr(new Date()));
    const isPastWeek     = weeklyWeekStart < todayWeekStart;

    if (isPastWeek) {
      showMessage('지난 주차의 업무일지는 생성할 수 없습니다.', 'error');
      return;
    }

    showGlobalLoading('업무일지를 생성하는 중...');
    try {
      // 이번주 일지 + 업무 목록, 다음주 업무 목록 병렬 로드
      const nextWeekStart = offsetWeek(weeklyWeekStart, 1);

      const [thisRes, nextRes] = await Promise.all([
        apiGet('journalGetOrCreate', {
          request_user_email: currentUser.email,
          week_start:         weeklyWeekStart
        }),
        apiGet('taskGetItems', {
          request_user_email: currentUser.email,
          week_start:         nextWeekStart
        })
      ]);

      const journal      = thisRes.data.journal;
      const serverTasks  = thisRes.data.tasks;
      const thisItems    = serverTasks.items || [];
      const nextItems    = nextRes.data      || [];

      // 기존 일지에 내용이 있으면 덮어쓰기 확인
      const isExisting = !!journal.created_at &&
                         (journal.summary || journal.achievements || journal.next_plan);

      if (isExisting) {
        if (journal.status === 'CLOSED') {
          showMessage('이미 마감된 업무일지는 덮어쓸 수 없습니다.', 'error');
          hideGlobalLoading();
          return;
        }
        const labelMap = { DRAFT: '작성중', SUBMITTED: '제출됨' };
        hideGlobalLoading();
        const confirmed = confirm(
          `이 주차(${weeklyWeekStart})에 이미 [${labelMap[journal.status] || journal.status}] 상태의 업무일지가 있습니다.\n` +
          `현재 등록된 업무 목록으로 내용을 덮어쓸까요?`
        );
        if (!confirmed) return;
        showGlobalLoading('업무일지를 생성하는 중...');
      }

      // ── 주간업무요약: 이번주 업무를 일별로 그룹화 (상태 표시)
      const summary = buildDailyGroupedText(thisItems, weeklyWeekStart, true);

      // ── 금주 성과: 이번주 완료 업무 ──────────────────────────
      const doneItems = thisItems.filter(t => t.status === 'DONE');
      const achievements = doneItems.length > 0
        ? doneItems.map(t => {
            const catLabel = CATEGORY_LABELS[t.category] || t.category || '기타';
            const line = '• [' + catLabel + '] ' + t.title;
            return t.description && t.description.trim()
              ? line + '\n       └ ' + t.description.trim()
              : line;
          }).join('\n')
        : '';

      // ── 차주업무계획: 다음주 업무를 일별로 그룹화 (상태 미표시)
      const nextPlan = buildDailyGroupedText(nextItems, nextWeekStart, false);

      // 저장
      await apiPost('journalUpdate', {
        request_user_email:  currentUser.email,
        journal_id:          journal.journal_id,
        summary:             summary,
        achievements:        achievements,
        next_plan:           nextPlan,
        issues:              journal.issues || ''
      });

      journalWeekStart    = weeklyWeekStart;
      currentJournal      = Object.assign({}, journal, {
        summary:       summary,
        achievements:  achievements,
        next_plan:     nextPlan,
        issues:        journal.issues || '',
        _fromGenerate: true
      });
      currentJournalTasks = serverTasks;

      switchTab('journal');
      renderJournal();
      renderJournalTaskSummary();
      showMessage('업무일지가 생성되었습니다.', 'success');

    } catch (err) {
      showMessage(err.message || '업무일지 생성에 실패했습니다.', 'error');
    } finally {
      hideGlobalLoading();
    }
  }

  /**
   * 업무 목록을 일별로 그룹화한 텍스트 생성
   * @param {Array}   items      - 업무 항목 배열
   * @param {string}  weekStart  - 해당 주 시작일 (yyyy-MM-dd)
   * 날짜 헤더 + 들여쓰기 구조로 통일 (이번주/다음주 동일 포맷)
   * 출력 예시:
   *   [05/19 월]
   *     🔴 [구매] 제목 (완료)
   *     🟡 [운영] 제목 (진행중)
   *
   *   [05/20 화]
   *     🟢 [시설] 제목 (예정)
   */
  function buildDailyGroupedText(items, weekStart, showStatus) {
    if (!items || items.length === 0) return '';

    const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토'];
    const PRI_ORDER = ['HIGH', 'MEDIUM', 'LOW'];
    const PRI_LABEL = { HIGH: '[ 중요도 높음 ]', MEDIUM: '[ 중요도 보통 ]', LOW: '[ 중요도 낮음 ]' };
    const lines     = [];

    // 날짜별 그룹화
    const dayMap = {};
    items.forEach(function(t) {
      const d = t.task_date || '';
      if (!dayMap[d]) dayMap[d] = [];
      dayMap[d].push(t);
    });

    const sortedDates = Object.keys(dayMap).sort();

    sortedDates.forEach(function(dateStr, dateIdx) {
      const dayItems = dayMap[dateStr];
      const d        = new Date(dateStr + 'T00:00:00');
      const dow      = d.getDay();
      const mmdd     = dateStr.substring(5).replace('-', '/');

      // 날짜 헤더
      lines.push('[' + mmdd + ' ' + DOW_LABEL[dow] + ']');

      // 중요도별 그룹화
      const priMap = { HIGH: [], MEDIUM: [], LOW: [] };
      dayItems.forEach(function(t) {
        const p = (t.priority || 'MEDIUM').toUpperCase();
        if (priMap[p]) priMap[p].push(t);
        else priMap['MEDIUM'].push(t);
      });

      PRI_ORDER.forEach(function(pri) {
        const group = priMap[pri];
        if (!group.length) return;

        lines.push('  ' + PRI_LABEL[pri]);

        group.forEach(function(t, itemIdx) {
          const catLabel     = CATEGORY_LABELS[t.category] || t.category || '기타';
          const statusLabel  = t.status === 'DONE'        ? '완료'
                             : t.status === 'IN_PROGRESS' ? '진행중' : '예정';
          const statusSuffix = showStatus ? ' (' + statusLabel + ')' : '';
          const num          = String(itemIdx + 1) + '.';

          lines.push('    ' + num + ' [' + catLabel + '] ' + t.title + statusSuffix);
          if (t.description && t.description.trim()) {
            lines.push('        └ ' + t.description.trim());
          }
        });
      });

      if (dateIdx < sortedDates.length - 1) lines.push('');
    });

    return lines.join('\n');
  }

  // ── 주간업무 로드 ────────────────────────────────────────────
  async function loadWeeklyTasks() {
    updateSharedWeekNav();

    // 즉시 로딩 스피너 표시
    document.getElementById('weekTimeline').innerHTML = `
      <div class="task-empty">
        <div class="task-loading-spinner"></div>
        <div class="task-empty-text">업무를 불러오는 중...</div>
      </div>`;
    weeklyTasks = [];
    updateWeeklySummary();

    try {
      const res = await apiGet('taskGetItems', {
        request_user_email: currentUser.email,
        week_start:         weeklyWeekStart
      });

      weeklyTasks = res.data || [];
      renderWeekTimeline();
      updateWeeklySummary();

    } catch (err) {
      showMessage(err.message || '업무 목록을 불러오지 못했습니다.', 'error');
      document.getElementById('weekTimeline').innerHTML = `
        <div class="task-empty task-empty--error">
          <div class="task-empty-icon">⚠️</div>
          <div class="task-empty-text">불러오기 실패. 다시 시도해 주세요.</div>
        </div>`;
    }
  }

  function updateWeeklySummary() {
    const total  = weeklyTasks.length;
    const done   = weeklyTasks.filter(t => t.status === 'DONE').length;
    const inProg = weeklyTasks.filter(t => t.status === 'IN_PROGRESS').length;
    const high   = weeklyTasks.filter(t => t.priority === 'HIGH').length;
    const pct    = total ? Math.round(done / total * 100) : 0;

    document.getElementById('summTotal').textContent      = total;
    document.getElementById('summDone').textContent       = done;
    document.getElementById('summInProgress').textContent = inProg;
    document.getElementById('summHigh').textContent       = high;
    document.getElementById('progressBar').style.width    = `${pct}%`;
  }

  function renderWeekTimeline() {
    const days     = getDaysOfWeek(weeklyWeekStart);
    const todayStr = formatDateStr(new Date());
    const container = document.getElementById('weekTimeline');

    container.innerHTML = days.map(dateStr => {
      const d      = new Date(dateStr + 'T00:00:00');
      const dayNum = d.getDate();
      const dow    = d.getDay();
      const isToday = dateStr === todayStr;
      const isSun   = dow === 0;
      const isSat   = dow === 6;

      const dayTasks = weeklyTasks.filter(t => t.task_date === dateStr);

      const chips = dayTasks.slice(0, 3).map(t => {
        const cls = t.priority === 'HIGH' ? 'chip-high' : t.priority === 'LOW' ? 'chip-low' : 'chip-medium';
        return `<span class="day-chip ${cls}" onclick="TASK_APP.openEditModal('${esc(t.task_id)}')">${esc(t.title)}</span>`;
      }).join('');

      const moreChips = dayTasks.length > 3
        ? `<span class="day-chip chip-medium" style="cursor:default;">+${dayTasks.length - 3}개</span>`
        : '';

      const taskItems = dayTasks.map(t => renderTaskItem(t)).join('');

      const headClasses = ['day-row-head',
        isToday ? 'is-today'    : '',
        isSun   ? 'is-sunday'   : '',
        isSat   ? 'is-saturday' : ''
      ].filter(Boolean).join(' ');

      return `
        <div class="day-row">
          <div class="${headClasses}" onclick="TASK_APP.toggleDay('day-tasks-${dateStr}')">
            <div class="day-label">
              <div class="day-date">
                <span class="day-date-num">${dayNum}</span>
                <span class="day-date-dow">${DOW_KR[dow]}</span>
              </div>
              <div class="day-task-chips">
                ${chips}${moreChips}
                ${dayTasks.length === 0 ? '<span style="font-size:12px;color:var(--text-muted);">업무 없음</span>' : ''}
              </div>
            </div>
            <div class="day-row-add">
              <button class="day-add-btn" onclick="event.stopPropagation();TASK_APP.openAddModal('${dateStr}')">
                + 추가
              </button>
            </div>
          </div>
          <div class="day-tasks" id="day-tasks-${dateStr}" style="${isToday || dayTasks.length > 0 ? '' : 'display:none;'}">
            ${taskItems || `<div class="task-empty" style="padding:16px;"><span style="font-size:12px;color:var(--text-muted);">등록된 업무가 없습니다.</span></div>`}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderTaskItem(t) {
    const priorityCls = t.priority === 'HIGH' ? 'priority-high' : t.priority === 'LOW' ? 'priority-low' : 'priority-medium';
    const statusCls   = t.status === 'DONE' ? 'badge-status-done' : t.status === 'IN_PROGRESS' ? 'badge-status-inprogress' : 'badge-status-todo';
    const isDone      = t.status === 'DONE';

    return `
      <div class="task-item${isDone ? ' is-done' : ''}" onclick="TASK_APP.openEditModal('${esc(t.task_id)}')">
        <span class="task-priority-dot ${priorityCls}"></span>
        <div class="task-item-body">
          <div class="task-item-title">${esc(t.title)}</div>
          <div class="task-item-meta">
            <span class="task-badge badge-category">${esc(CATEGORY_LABELS[t.category] || t.category)}</span>
            <span class="task-badge ${statusCls}">${esc(STATUS_LABELS[t.status] || t.status)}</span>
            ${t.description ? `<span style="font-size:11px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.description)}</span>` : ''}
          </div>
        </div>
        <div class="task-item-actions" onclick="event.stopPropagation();">
          <button class="task-icon-btn" title="상태 토글" onclick="TASK_APP.toggleTaskStatus('${esc(t.task_id)}')">
            ${t.status === 'DONE' ? '↩' : '✓'}
          </button>
          <button class="task-icon-btn danger" title="삭제" onclick="TASK_APP.deleteTask('${esc(t.task_id)}')">
            🗑
          </button>
        </div>
      </div>
    `;
  }

  // ── 주간일지 로드 ────────────────────────────────────────────
  async function loadJournal() {
    updateSharedWeekNav();
    clearAutosave();

    // ── 일지 카드 전체 로딩 오버레이 표시 ──────────────────────
    document.getElementById('journalLoading')?.classList.add('active');

    // 버튼·배지·텍스트 초기화
    document.getElementById('autosaveText').textContent = '불러오는 중...';
    document.getElementById('journalSaveBtn').style.display   = 'none';
    document.getElementById('journalSubmitBtn').style.display = 'none';
    document.getElementById('journalCloseBtn').style.display  = 'none';
    const badgeEl = document.getElementById('journalStatusBadge');
    badgeEl.className   = 'journal-status-badge journal-status-draft';
    badgeEl.textContent = '-';
    document.getElementById('journalStatusText').textContent =
      `${journalWeekStart} ~ ${getWeekEnd(journalWeekStart)}`;

    try {
      const res = await apiGet('journalGet', {
        request_user_email: currentUser.email,
        week_start:         journalWeekStart
      });

      currentJournal      = res.data.journal;
      currentJournalTasks = res.data.tasks;

      renderJournal();
      renderJournalTaskSummary();

    } catch (err) {
      showMessage(err.message || '일지를 불러오지 못했습니다.', 'error');
      document.getElementById('autosaveText').textContent = '불러오기 실패';
    } finally {
      document.getElementById('journalLoading')?.classList.remove('active');
    }
  }

  function renderJournal() {
    const todayWeekStart = getWeekStart(formatDateStr(new Date()));
    const isPastWeek     = journalWeekStart < todayWeekStart;

    if (!currentJournal) {
      // 과거 주에 일지가 없는 경우 — 빈 상태 표시
      const badgeEl = document.getElementById('journalStatusBadge');
      badgeEl.className = 'journal-status-badge journal-status-draft';
      badgeEl.textContent = '-';

      const weekEnd = getWeekEnd(journalWeekStart);
      document.getElementById('journalStatusText').textContent = `${journalWeekStart} ~ ${weekEnd}`;

      document.getElementById('journalSaveBtn').style.display   = 'none';
      document.getElementById('journalSubmitBtn').style.display = 'none';
      document.getElementById('journalCloseBtn').style.display  = 'none';

      ['attendanceThisWeek','attendanceNextWeek','journalSummary',
       'journalAchievements','journalNextPlan','journalIssues'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.value = ''; el.disabled = true; el.placeholder = '업무일지를 먼저 생성해 주세요.'; }
      });

      document.getElementById('autosaveText').textContent = isPastWeek
        ? '해당 주에 작성된 일지가 없습니다.'
        : '주간업무 탭에서 [업무일지 생성] 버튼을 눌러 주세요.';
      return;
    }

    const j      = currentJournal;
    const status   = j.status || 'DRAFT';
    const isClosed = status === 'CLOSED';

    // 상태 배지
    const badgeEl = document.getElementById('journalStatusBadge');
    badgeEl.className = 'journal-status-badge';
    if (status === 'SUBMITTED') {
      badgeEl.classList.add('journal-status-submitted');
      badgeEl.textContent = '제출됨';
    } else if (status === 'CLOSED') {
      badgeEl.classList.add('journal-status-closed');
      badgeEl.textContent = '마감됨';
    } else {
      badgeEl.classList.add('journal-status-draft');
      badgeEl.textContent = '작성중';
    }

    // 부제목
    const weekEnd = getWeekEnd(journalWeekStart);
    document.getElementById('journalStatusText').textContent =
      `${journalWeekStart} ~ ${weekEnd}` +
      (j.submitted_at ? ` · 제출: ${j.submitted_at.substring(0, 10)}` : '');

    // 버튼 표시
    const saveBtn   = document.getElementById('journalSaveBtn');
    const submitBtn = document.getElementById('journalSubmitBtn');
    const closeBtn  = document.getElementById('journalCloseBtn');

    saveBtn.style.display   = isClosed ? 'none' : '';
    submitBtn.style.display = isClosed || status === 'SUBMITTED' ? 'none' : '';
    closeBtn.style.display  = isManager && !isClosed ? '' : 'none';

    // 필드 채우기 — currentJournal에 세팅된 값을 그대로 표시
    // (handleGenerateJournal에서 저장 후 직접 세팅하므로 별도 자동채우기 로직 불필요)
    setField('attendanceThisWeek', j.attendance_this_week, isClosed);
    setField('attendanceNextWeek', j.attendance_next_week, isClosed);
    setField('journalSummary',      j.summary,      isClosed);
    setField('journalAchievements', j.achievements, isClosed);
    setField('journalNextPlan',     j.next_plan,    isClosed);
    setField('journalIssues',       j.issues,       isClosed);

    updateAutosaveStatus('');
    journalDirty = false;
  }

  function setField(id, value, disabled) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value    = value || '';
    el.disabled = !!disabled;
  }

  function renderJournalTaskSummary() {
    if (!currentJournalTasks) return;

    const s   = currentJournalTasks.summary || { total: 0, done: 0, in_progress: 0, todo: 0, high: 0 };
    const pct = s.total ? Math.round(s.done / s.total * 100) : 0;

    document.getElementById('journalTaskSummary').innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:600;color:var(--navy);">전체 ${s.total}건</span>
        <span style="font-size:12px;color:#16a34a;">✓ 완료 ${s.done}</span>
        <span style="font-size:12px;color:#d97706;">⏳ 진행중 ${s.in_progress}</span>
        <span style="font-size:12px;color:#dc2626;">🔴 높은중요도 ${s.high}</span>
        <div style="flex:1;min-width:80px;height:6px;background:#dbeafe;border-radius:999px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#0369a1,#38bdf8);border-radius:999px;"></div>
        </div>
        <span style="font-size:12px;color:var(--text-muted);">${pct}%</span>
      </div>
    `;

    const items = currentJournalTasks.items || [];
    if (!items.length) {
      document.getElementById('journalTaskList').textContent = '이번 주 등록된 업무가 없습니다.';
      return;
    }

    // 카테고리별 그룹
    const grouped = {};
    items.forEach(t => {
      const cat = CATEGORY_LABELS[t.category] || t.category || '기타';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(t);
    });

    const html = Object.keys(grouped).map(cat => {
      const taskHtml = grouped[cat].map(t => {
        const priorityColor = t.priority === 'HIGH' ? '#dc2626' : t.priority === 'LOW' ? '#16a34a' : '#d97706';
        const statusBadge = t.status === 'DONE'
          ? '<span style="font-size:10px;color:#15803d;background:#dcfce7;padding:1px 6px;border-radius:4px;">완료</span>'
          : t.status === 'IN_PROGRESS'
          ? '<span style="font-size:10px;color:#854d0e;background:#fef9c3;padding:1px 6px;border-radius:4px;">진행중</span>'
          : '<span style="font-size:10px;color:#475569;background:#f1f5f9;padding:1px 6px;border-radius:4px;">예정</span>';
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f3f8;">
            <span style="width:7px;height:7px;border-radius:50%;background:${priorityColor};flex-shrink:0;"></span>
            <span style="flex:1;font-size:12px;color:var(--text-primary);">${esc(t.title)}</span>
            <span style="font-size:11px;color:var(--text-muted);">${t.task_date ? t.task_date.substring(5) : ''}</span>
            ${statusBadge}
          </div>
        `;
      }).join('');
      return `
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:#0369a1;margin-bottom:4px;">${esc(cat)}</div>
          ${taskHtml}
        </div>
      `;
    }).join('');

    document.getElementById('journalTaskList').innerHTML = html;
  }

  // ── 일지 입력/저장 ───────────────────────────────────────────
  function onJournalInput() {
    journalDirty = true;
    updateAutosaveStatus('saving');
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => saveJournal(true), 2500);
  }

  function clearAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    journalDirty  = false;
  }

  function updateAutosaveStatus(status) {
    const dot  = document.getElementById('autosaveDot');
    const text = document.getElementById('autosaveText');
    if (!dot || !text) return;

    dot.className = 'autosave-dot' + (status ? ' ' + status : '');

    if      (status === 'saving') text.textContent = '저장 중...';
    else if (status === 'saved')  text.textContent = '저장됨';
    else if (status === 'error')  text.textContent = '저장 실패';
    else                          text.textContent = currentJournal?.updated_at
      ? '마지막 저장: ' + currentJournal.updated_at.substring(11, 16) : '-';
  }

  async function saveJournal(isAuto = false) {
    if (!currentJournal) return;

    const payload = {
      request_user_email:   currentUser.email,
      journal_id:           currentJournal.journal_id,
      attendance_this_week: document.getElementById('attendanceThisWeek').value,
      attendance_next_week: document.getElementById('attendanceNextWeek').value,
      summary:              document.getElementById('journalSummary').value,
      achievements:         document.getElementById('journalAchievements').value,
      next_plan:            document.getElementById('journalNextPlan').value,
      issues:               document.getElementById('journalIssues').value
    };

    try {
      updateAutosaveStatus('saving');
      const res = await apiPost('journalUpdate', payload);
      currentJournal.updated_at = res.data?.updated_at || '';
      journalDirty = false;
      updateAutosaveStatus('saved');
      if (!isAuto) showMessage('일지가 저장되었습니다.', 'success');
    } catch (err) {
      updateAutosaveStatus('error');
      if (!isAuto) showMessage(err.message || '저장에 실패했습니다.', 'error');
    }
  }

  async function submitJournal() {
    if (!currentJournal) return;
    if (!confirm('일지를 제출하시겠습니까?\n제출 후에도 팀장이 마감하기 전까지 수정할 수 있습니다.')) return;

    await saveJournal(true);

    try {
      showGlobalLoading('제출 중...');
      await apiPost('journalSubmit', {
        request_user_email: currentUser.email,
        journal_id:         currentJournal.journal_id
      });
      showMessage('일지가 제출되었습니다.', 'success');
      await loadJournal();
    } catch (err) {
      showMessage(err.message || '제출에 실패했습니다.', 'error');
    } finally {
      hideGlobalLoading();
    }
  }

  async function closeJournal() {
    if (!currentJournal) return;
    if (!confirm('일지를 마감하시겠습니까?\n마감 후에는 수정할 수 없습니다.')) return;

    try {
      showGlobalLoading('마감 중...');
      await apiPost('journalClose', {
        request_user_email: currentUser.email,
        journal_id:         currentJournal.journal_id
      });
      showMessage('일지가 마감되었습니다.', 'success');
      await loadJournal();
    } catch (err) {
      showMessage(err.message || '마감에 실패했습니다.', 'error');
    } finally {
      hideGlobalLoading();
    }
  }

  // ── 팀원 현황 로드 ────────────────────────────────────────────
  async function loadTeamJournals() {
    updateSharedWeekNav();
    document.getElementById('teamWeekLabel').textContent =
      `${teamWeekStart} ~ ${getWeekEnd(teamWeekStart)}`;

    try {
      const res = await apiGet('journalListByTeam', {
        request_user_email: currentUser.email,
        week_start:         teamWeekStart
      });
      renderTeamGrid(res.data || []);
    } catch (err) {
      document.getElementById('teamJournalGrid').innerHTML =
        `<div class="task-empty" style="grid-column:1/-1;"><div class="task-empty-icon">⚠️</div><div class="task-empty-text">${esc(err.message)}</div></div>`;
    }
  }

  function renderTeamGrid(members) {
    _lastTeamData = members || [];  // 통합 보기용 캐시
    const grid = document.getElementById('teamJournalGrid');

    if (!members.length) {
      grid.innerHTML = `<div class="task-empty" style="grid-column:1/-1;"><div class="task-empty-icon">👥</div><div class="task-empty-text">팀원이 없습니다.</div></div>`;
      return;
    }

    grid.innerHTML = members.map(m => {
      const s       = m.task_summary || {};
      const pct     = s.total ? Math.round((s.done || 0) / s.total * 100) : 0;
      const jStatus = m.journal ? m.journal.status : null;

      const statusBadge = !m.journal
        ? `<span style="font-size:10px;background:#fef2f2;color:#b91c1c;padding:2px 6px;border-radius:4px;">미작성</span>`
        : jStatus === 'CLOSED'
        ? `<span style="font-size:10px;background:#dcfce7;color:#166534;padding:2px 6px;border-radius:4px;">마감</span>`
        : jStatus === 'SUBMITTED'
        ? `<span style="font-size:10px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;">제출</span>`
        : `<span style="font-size:10px;background:#f1f5f9;color:#64748b;padding:2px 6px;border-radius:4px;">작성중</span>`;

      const initial = (m.user_name || '?').charAt(0);

      return `
        <div class="team-member-card" onclick="TASK_APP.openMemberJournal(${JSON.stringify(JSON.stringify(m))})">
          <div class="team-member-card-head">
            <div class="member-avatar">${esc(initial)}</div>
            <div>
              <div class="member-info-name">${esc(m.user_name)}</div>
              <div class="member-info-dept">${esc(m.team_name || m.department || '')}</div>
            </div>
            ${m.is_manager ? '<span class="manager-crown" title="팀장">👑</span>' : ''}
            <div style="margin-left:auto;">${statusBadge}</div>
          </div>
          <div class="team-member-card-body">
            <div class="member-task-mini">
              <div class="mini-bar">
                <div class="mini-bar-fill" style="width:${pct}%;"></div>
              </div>
              <span class="member-task-count">
                ${s.done || 0}/${s.total || 0} 완료
                ${s.high ? `<span style="color:#dc2626;">·🔴${s.high}</span>` : ''}
              </span>
            </div>
            ${m.journal?.attendance_this_week ? `<div style="font-size:11px;color:var(--text-muted);">근태: ${esc(m.journal.attendance_this_week)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // ── 팀원 일지 모달 ────────────────────────────────────────────
  window.TASK_APP = window.TASK_APP || {};

  window.TASK_APP.openMemberJournal = function(memberJsonStr) {
    const m = JSON.parse(memberJsonStr);

    document.getElementById('memberJournalTitle').textContent = `${m.user_name} — 주간일지`;

    const closeActionBtn = document.getElementById('memberJournalCloseActionBtn');
    closeActionBtn.style.display =
      (isManager && m.journal && m.journal.status !== 'CLOSED') ? '' : 'none';

    const j     = m.journal;
    const tasks = m.task_summary || {};
    let html    = '';

    if (!j) {
      html = `<div class="task-empty"><div class="task-empty-icon">📝</div><div class="task-empty-text">아직 일지를 작성하지 않았습니다.</div></div>`;
    } else {
      const fields = [
        { icon: '📊', label: '업무 현황',         value: `전체 ${tasks.total||0}건 / 완료 ${tasks.done||0}건 / 높은중요도 ${tasks.high||0}건` },
        { icon: '🗓️', label: '이번 주 근태',       value: j.attendance_this_week || '-' },
        { icon: '🗓️', label: '다음 주 근태 예정',  value: j.attendance_next_week || '-' },
        { icon: '📋', label: '주간 요약',          value: j.summary       || '-' },
        { icon: '🏆', label: '성과 및 완료',       value: j.achievements  || '-' },
        { icon: '🎯', label: '차주 계획',          value: j.next_plan     || '-' },
        { icon: '⚠️', label: '이슈/건의',          value: j.issues        || '-' }
      ];

      html = fields.map(f => `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">${f.icon} ${esc(f.label)}</div>
          <div style="font-size:13px;color:var(--text-primary);white-space:pre-wrap;line-height:1.6;background:#f8fafc;padding:10px 14px;border-radius:10px;border:1px solid var(--border-soft);">${esc(f.value)}</div>
        </div>
      `).join('');

      if (j.submitted_at) {
        html += `<div style="font-size:11px;color:var(--text-muted);text-align:right;">제출: ${j.submitted_at.substring(0,16)}</div>`;
      }
    }

    document.getElementById('memberJournalBody').innerHTML = html;

    closeActionBtn.onclick = async () => {
      if (!m.journal) return;
      if (!confirm(`${m.user_name}님의 일지를 마감하시겠습니까?`)) return;
      try {
        showGlobalLoading('마감 중...');
        await apiPost('journalClose', {
          request_user_email: currentUser.email,
          journal_id:         m.journal.journal_id
        });
        showMessage('마감되었습니다.', 'success');
        closeMemberModal();
        loadTeamJournals();
      } catch (err) {
        showMessage(err.message, 'error');
      } finally {
        hideGlobalLoading();
      }
    };

    document.getElementById('memberJournalModal').classList.add('open');
  };

  function closeMemberModal() {
    document.getElementById('memberJournalModal').classList.remove('open');
  }

  // ── 통합 보기 ────────────────────────────────────────────────

  function openMergeView() {
    const weekEnd = getWeekEnd(teamWeekStart);
    document.getElementById('mergeViewTitle').textContent =
      `팀원 주간일지 통합 보기 · ${teamWeekStart} ~ ${weekEnd}`;

    const members = _lastTeamData;
    const body    = document.getElementById('mergeViewBody');

    if (!members.length) {
      body.innerHTML = `<div class="task-empty" style="padding:40px 0;"><div class="task-empty-icon">👥</div><div class="task-empty-text">팀원 데이터가 없습니다.</div></div>`;
      document.getElementById('mergeViewModal').classList.add('open');
      return;
    }

    const FIELDS = [
      { key: 'attendance_this_week', label: '이번 주 근태' },
      { key: 'attendance_next_week', label: '다음 주 근태 예정' },
      { key: 'summary',             label: '주간 업무 요약' },
      { key: 'achievements',        label: '금주 성과 및 완료' },
      { key: 'next_plan',           label: '차주 업무 계획' },
      { key: 'issues',              label: '이슈 / 건의사항' }
    ];

    const statusColor = { CLOSED: '#166534', SUBMITTED: '#1e40af', DRAFT: '#64748b' };
    const statusBg    = { CLOSED: '#dcfce7', SUBMITTED: '#dbeafe', DRAFT: '#f1f5f9' };
    const statusLabel = { CLOSED: '마감', SUBMITTED: '제출', DRAFT: '작성중' };

    let html = '';

    members.forEach((m, idx) => {
      const j      = m.journal;
      const s      = m.task_summary || {};
      const pct    = s.total ? Math.round((s.done || 0) / s.total * 100) : 0;
      const status = j ? (j.status || 'DRAFT') : null;
      const initial = (m.user_name || '?').charAt(0);

      const badgeStyle = status
        ? `background:${statusBg[status]};color:${statusColor[status]};`
        : 'background:#fef2f2;color:#b91c1c;';
      const badgeText = status ? statusLabel[status] : '미작성';

      html += `
        <div style="padding:22px 24px;${idx > 0 ? 'border-top:2px solid #e0e7f2;' : ''}">

          <!-- 멤버 헤더 -->
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <div style="width:40px;height:40px;border-radius:50%;background:#e0f2fe;color:#0369a1;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${esc(initial)}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:15px;font-weight:700;color:var(--text-primary);">${esc(m.user_name)}${m.is_manager ? ' 👑' : ''}</div>
              <div style="font-size:12px;color:var(--text-muted);">${esc(m.team_name || m.department || '')}</div>
            </div>
            <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;${badgeStyle}">${badgeText}</span>
          </div>

          <!-- 업무 현황 바 -->
          <div style="background:#f8fafc;border-radius:10px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span style="font-size:12px;font-weight:600;color:var(--text-secondary);">업무 현황</span>
            <span style="font-size:12px;color:#1e293b;">전체 ${s.total||0}건</span>
            <span style="font-size:12px;color:#16a34a;">✓ 완료 ${s.done||0}</span>
            <span style="font-size:12px;color:#d97706;">⏳ 진행중 ${s.in_progress||0}</span>
            ${s.high ? `<span style="font-size:12px;color:#dc2626;">🔴 높은중요도 ${s.high}</span>` : ''}
            <div style="flex:1;min-width:60px;height:5px;background:#dbeafe;border-radius:999px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#0369a1,#38bdf8);border-radius:999px;"></div>
            </div>
            <span style="font-size:11px;color:var(--text-muted);">${pct}%</span>
          </div>

          ${!j ? `
            <div style="font-size:13px;color:#94a3b8;text-align:center;padding:16px 0;">아직 일지를 작성하지 않았습니다.</div>
          ` : FIELDS.map(f => {
              const val = j[f.key] || '';
              if (!val) return '';
              return `
                <div style="margin-bottom:12px;">
                  <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em;">${esc(f.label)}</div>
                  <div style="font-size:13px;color:var(--text-primary);white-space:pre-wrap;line-height:1.65;background:#f8fafc;padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;">${esc(val)}</div>
                </div>
              `;
            }).join('')}

          ${j?.submitted_at ? `<div style="font-size:11px;color:var(--text-muted);text-align:right;margin-top:4px;">제출: ${j.submitted_at.substring(0,16)}</div>` : ''}
        </div>
      `;
    });

    body.innerHTML = html;
    document.getElementById('mergeViewModal').classList.add('open');
  }

  function closeMergeView() {
    document.getElementById('mergeViewModal').classList.remove('open');
  }

  // ── 업무 모달 ────────────────────────────────────────────────
  window.TASK_APP.openAddModal = function(dateStr) {
    editingTaskId = null;
    document.getElementById('taskModalTitle').textContent = '업무 등록';
    document.getElementById('modalTaskDate').value        = dateStr;
    document.getElementById('modalCategory').value        = '';
    document.getElementById('modalTitle').value           = '';
    document.getElementById('modalDescription').value     = '';
    updatePriorityUI('MEDIUM');
    updateStatusUI('TODO');
    openTaskModal();
  };

  window.TASK_APP.openEditModal = function(taskId) {
    const task = weeklyTasks.find(t => t.task_id === taskId);
    if (!task) return;

    editingTaskId = taskId;
    document.getElementById('taskModalTitle').textContent = '업무 수정';
    document.getElementById('modalTaskDate').value        = task.task_date   || '';
    document.getElementById('modalCategory').value        = task.category    || '';
    document.getElementById('modalTitle').value           = task.title       || '';
    document.getElementById('modalDescription').value     = task.description || '';
    updatePriorityUI(task.priority || 'MEDIUM');
    updateStatusUI(task.status    || 'TODO');
    openTaskModal();
  };

  window.TASK_APP.toggleDay = function(dayTasksId) {
    const el = document.getElementById(dayTasksId);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? '' : 'none';
  };

  window.TASK_APP.toggleTaskStatus = async function(taskId) {
    const task = weeklyTasks.find(t => t.task_id === taskId);
    if (!task) return;

    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';

    try {
      await apiPost('taskUpdateItem', {
        request_user_email: currentUser.email,
        task_id:            taskId,
        status:             newStatus
      });
      task.status = newStatus;
      renderWeekTimeline();
      updateWeeklySummary();
    } catch (err) {
      showMessage(err.message || '상태 변경에 실패했습니다.', 'error');
    }
  };

  window.TASK_APP.deleteTask = async function(taskId) {
    const task = weeklyTasks.find(t => t.task_id === taskId);
    if (!task) return;
    if (!confirm(`"${task.title}" 업무를 삭제하시겠습니까?`)) return;

    try {
      await apiPost('taskDeleteItem', {
        request_user_email: currentUser.email,
        task_id:            taskId
      });
      weeklyTasks = weeklyTasks.filter(t => t.task_id !== taskId);
      renderWeekTimeline();
      updateWeeklySummary();
      showMessage('삭제되었습니다.', 'success');
    } catch (err) {
      showMessage(err.message || '삭제에 실패했습니다.', 'error');
    }
  };

  function openTaskModal() {
    document.getElementById('taskModal').classList.add('open');
  }

  function closeTaskModal() {
    document.getElementById('taskModal').classList.remove('open');
    editingTaskId = null;
  }

  async function saveTask() {
    const taskDate    = document.getElementById('modalTaskDate').value.trim();
    const category    = document.getElementById('modalCategory').value.trim();
    const title       = document.getElementById('modalTitle').value.trim();
    const description = document.getElementById('modalDescription').value.trim();
    const priority    = document.querySelector('input[name="priority"]:checked')?.value || 'MEDIUM';
    const status      = document.querySelector('input[name="status"]:checked')?.value   || 'TODO';

    if (!taskDate)  { alert('업무일을 입력하세요.');    return; }
    if (!category)  { alert('업무 구분을 선택하세요.'); return; }
    if (!title)     { alert('업무 제목을 입력하세요.'); return; }

    const payload = {
      request_user_email: currentUser.email,
      task_date:    taskDate,
      category:     category,
      title:        title,
      description:  description,
      priority:     priority,
      status:       status
    };

    const saveBtn = document.getElementById('taskModalSaveBtn');

    try {
      setTaskModalLoading(true, editingTaskId ? '수정 중...' : '저장 중...');

      if (editingTaskId) {
        payload.task_id = editingTaskId;
        await apiPost('taskUpdateItem', payload);
        const idx = weeklyTasks.findIndex(t => t.task_id === editingTaskId);
        if (idx !== -1) weeklyTasks[idx] = Object.assign({}, weeklyTasks[idx], payload);
        showMessage('업무가 수정되었습니다.', 'success');
      } else {
        const res = await apiPost('taskCreateItem', payload);
        weeklyTasks.push(res.data);
        showMessage('업무가 등록되었습니다.', 'success');
      }

      closeTaskModal();
      renderWeekTimeline();
      updateWeeklySummary();

    } catch (err) {
      showMessage(err.message || '저장에 실패했습니다.', 'error');
    } finally {
      setTaskModalLoading(false);
    }
  }

  function setTaskModalLoading(active, text) {
    const overlay  = document.getElementById('taskModalLoading');
    const textEl   = document.getElementById('taskModalLoadingText');
    const saveBtn  = document.getElementById('taskModalSaveBtn');
    const cancelBtn = document.getElementById('taskModalCancelBtn');
    const closeBtn  = document.getElementById('taskModalClose');
    if (!overlay) return;
    if (active) {
      if (textEl) textEl.textContent = text || '저장 중...';
      overlay.classList.add('active');
      if (saveBtn)   saveBtn.disabled  = true;
      if (cancelBtn) cancelBtn.disabled = true;
      if (closeBtn)  closeBtn.disabled  = true;
    } else {
      overlay.classList.remove('active');
      if (saveBtn)   saveBtn.disabled  = false;
      if (cancelBtn) cancelBtn.disabled = false;
      if (closeBtn)  closeBtn.disabled  = false;
    }
  }

  // ── 우선순위 / 상태 UI ────────────────────────────────────────
  function updatePriorityUI(value) {
    const map = { HIGH: 'priHigh', MEDIUM: 'priMedium', LOW: 'priLow' };
    Object.entries(map).forEach(([v, id]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = 'priority-option' + (v === value ? ` selected-${v.toLowerCase()}` : '');
    });
    const radio = document.querySelector(`input[name="priority"][value="${value}"]`);
    if (radio) radio.checked = true;
  }

  function updateStatusUI(value) {
    const map    = { TODO: 'stTodo', IN_PROGRESS: 'stInProgress', DONE: 'stDone' };
    const clsMap = { TODO: 'todo', IN_PROGRESS: 'inprogress', DONE: 'done' };
    Object.entries(map).forEach(([v, id]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = 'status-option' + (v === value ? ` selected-${clsMap[v]}` : '');
    });
    const radio = document.querySelector(`input[name="status"][value="${value}"]`);
    if (radio) radio.checked = true;
  }

  // ── 메시지 ────────────────────────────────────────────────────
  function showMessage(msg, type = 'info') {
    const el = document.getElementById('messageBox');
    if (!el) return;
    el.textContent = msg;
    el.className   = `message-box is-${type}`;
    el.style.display = '';
    clearTimeout(el.__timer);
    el.__timer = setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  // ── XSS 방어 ──────────────────────────────────────────────────
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

})();
