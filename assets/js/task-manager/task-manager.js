/**
 * task-manager.js
 * 업무일정 관리 앱 — 주간 업무 / 주간일지 / 팀원 현황
 */

(function () {
  'use strict';

  // ── 상수 ────────────────────────────────────────────────────
  // 카테고리 — 앱 로드 시 서버에서 동적으로 채워짐 (하드코딩 없음)
  let CATEGORY_LABELS   = {};
  let categoryCodeGroup = 'TASK_CATEGORY';
  let categoryIsCustom  = false;

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

      // 카테고리 관리 버튼 (manager/admin 전용)
      if (isManager) {
        document.getElementById('tabTeam').style.display = '';
        document.getElementById('categoryManageBtn').style.display = '';
      }

      const todayStr      = formatDateStr(new Date());
      weeklyWeekStart     = getWeekStart(todayStr);
      journalWeekStart    = weeklyWeekStart;
      teamWeekStart       = weeklyWeekStart;
      calendarPopupMonth  = weeklyWeekStart.substring(0, 7);

      // 카테고리 먼저 로드 후 나머지 초기화
      await loadCategories();
      bindEvents();
      updateSharedWeekNav();
      await loadWeeklyTasks();

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

    // 검색
    document.getElementById('searchRunBtn')?.addEventListener('click', runSearch);
    document.getElementById('searchResetBtn')?.addEventListener('click', resetSearch);
    document.getElementById('searchKeyword')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runSearch();
    });

    // 카테고리 관리
    document.getElementById('categoryManageBtn')?.addEventListener('click', openCategoryModal);
    document.getElementById('categoryModalClose')?.addEventListener('click', closeCategoryModal);
    document.getElementById('categoryModalDone')?.addEventListener('click', closeCategoryModal);
    document.getElementById('catAddBtn')?.addEventListener('click', saveCategoryItem);

    // 단기업무 체크박스
    document.getElementById('modalSingleDay')?.addEventListener('change', (e) => {
      setSingleDay(e.target.checked);
    });
    // 시작일 변경 시 종료일 최솟값 동기화
    document.getElementById('modalStartDate')?.addEventListener('change', (e) => {
      const endEl = document.getElementById('modalEndDate');
      if (endEl && endEl.value && endEl.value < e.target.value) {
        endEl.value = e.target.value;
      }
      endEl.min = e.target.value;
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
    document.getElementById('exportJournalBtn')?.addEventListener('click', exportJournalExcel);

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
    document.getElementById('panelSearch').style.display  = tab === 'search'  ? '' : 'none';

    // 검색 탭 진입 시 카테고리 셀렉트 갱신 + 기본 날짜 설정
    if (tab === 'search') {
      updateSearchCategorySelect();
      setSearchDefaultDates();
    }

    // 검색 탭에서는 공통 네비게이터 숨김
    document.getElementById('sharedWeekNav').style.display = tab === 'search' ? 'none' : '';

    // 탭 전환 즉시 공통 네비게이터 레이블 갱신
    updateSharedWeekNav();

    if (tab === 'journal') {
      if (currentJournal && currentJournal._fromGenerate) {
        delete currentJournal._fromGenerate;
      } else {
        // 일지 탭에 한 번도 진입하지 않은 경우(초기)에만 주간업무 주차로 동기화
        // 이미 일지 탭에서 직접 다른 주로 이동한 경우 그 주차 유지
        if (!journalWeekStart || journalWeekStart === weeklyWeekStart) {
          journalWeekStart = weeklyWeekStart;
        }
        loadJournal();
      }
    }
    if (tab === 'team' && isManager) {
      showGlobalLoading('팀원 현황을 불러오는 중...');
      loadTeamJournals().finally(() => hideGlobalLoading());
    }
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
      showGlobalLoading('불러오는 중...');
      loadJournal().finally(() => hideGlobalLoading());
    } else if (activeTab === 'team') {
      teamWeekStart = offsetWeek(teamWeekStart, delta);
      showGlobalLoading('불러오는 중...');
      loadTeamJournals().finally(() => hideGlobalLoading());
    } else {
      weeklyWeekStart = offsetWeek(weeklyWeekStart, delta);
      showGlobalLoading('불러오는 중...');
      loadWeeklyTasks().finally(() => hideGlobalLoading());
    }
    updateSharedWeekNav();
  }

  function navigateWeekTo(weekStart) {
    const activeTab = document.querySelector('.task-tab-btn.active')?.dataset?.tab;
    if (activeTab === 'journal') {
      journalWeekStart = weekStart;
      showGlobalLoading('불러오는 중...');
      loadJournal().finally(() => hideGlobalLoading());
    } else if (activeTab === 'team') {
      teamWeekStart = weekStart;
      showGlobalLoading('불러오는 중...');
      loadTeamJournals().finally(() => hideGlobalLoading());
    } else {
      weeklyWeekStart = weekStart;
      showGlobalLoading('불러오는 중...');
      loadWeeklyTasks().finally(() => hideGlobalLoading());
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

        // 커스텀 모달로 확인
        const confirmed = await showOverwriteConfirm(
          weeklyWeekStart,
          labelMap[journal.status] || journal.status
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

      // 저장 — 근태 특이사항(this/next week), 이슈/건의사항은 기존 값 유지
      await apiPost('journalUpdate', {
        request_user_email:   currentUser.email,
        journal_id:           journal.journal_id,
        summary:              summary,
        achievements:         achievements,
        next_plan:            nextPlan,
        attendance_this_week: journal.attendance_this_week || '',
        attendance_next_week: journal.attendance_next_week || '',
        issues:               journal.issues || ''
      });

      journalWeekStart    = weeklyWeekStart;
      currentJournal      = Object.assign({}, journal, {
        summary:              summary,
        achievements:         achievements,
        next_plan:            nextPlan,
        attendance_this_week: journal.attendance_this_week || '',
        attendance_next_week: journal.attendance_next_week || '',
        issues:               journal.issues || '',
        _fromGenerate:        true
      });
      currentJournalTasks = serverTasks;

      switchTab('journal');
      // switchTab 내부(_fromGenerate 삭제 등) 처리 완료 후 렌더링
      Promise.resolve().then(() => {
        renderJournal();
        renderJournalTaskSummary();
        showMessage('업무일지가 생성되었습니다.', 'success');
      });

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
    const weekEnd   = getWeekEnd(weekStart);
    const lines     = [];

    // 이번 주 시작 업무 vs 이월 분리
    const thisWeekItems  = [];
    const carryOverItems = [];
    items.forEach(function(t) {
      const s = t.start_date || '';
      if (s >= weekStart && s <= weekEnd) thisWeekItems.push(t);
      else carryOverItems.push(t);
    });

    // 중요도 정렬
    const PRI_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    function sortByPri(a, b) {
      const pa = PRI_ORDER[(a.priority || 'MEDIUM').toUpperCase()] ?? 1;
      const pb = PRI_ORDER[(b.priority || 'MEDIUM').toUpperCase()] ?? 1;
      if (pa !== pb) return pa - pb;
      return (a.start_date || '').localeCompare(b.start_date || '');
    }

    // 카테고리 순서
    const CAT_ORDER = Object.keys(CATEGORY_LABELS);
    function catIndex(t) {
      const i = CAT_ORDER.indexOf(t.category || 'ETC');
      return i === -1 ? 99 : i;
    }

    // ── 1) 카테고리로 먼저 묶고, 그 안에 날짜 표기
    const catMap = {};
    const catOrder = [];
    thisWeekItems.forEach(function(t) {
      const cat = t.category || 'ETC';
      if (!catMap[cat]) { catMap[cat] = []; catOrder.push(cat); }
      catMap[cat].push(t);
    });

    // 카테고리 정의 순서로 정렬
    catOrder.sort(function(a, b) {
      return catIndex({ category: a }) - catIndex({ category: b });
    });

    catOrder.forEach(function(cat, catIdx) {
      const catLabel = CATEGORY_LABELS[cat] || cat || '기타';
      const group    = catMap[cat].slice().sort(sortByPri);

      if (catIdx > 0) lines.push('');
      lines.push('[' + catLabel + ']');

      // 날짜별 소그룹
      const dayMap = {};
      const dayOrder = [];
      group.forEach(function(t) {
        const d = t.start_date || '';
        if (!dayMap[d]) { dayMap[d] = []; dayOrder.push(d); }
        dayMap[d].push(t);
      });
      dayOrder.sort();

      dayOrder.forEach(function(dateStr) {
        const dayItems = dayMap[dateStr];
        const d        = new Date(dateStr + 'T00:00:00');
        const dow      = d.getDay();
        const mmdd     = dateStr.substring(5).replace('-', '/');

        lines.push('  ' + mmdd + ' (' + DOW_LABEL[dow] + ')');

        let num = 1;
        dayItems.forEach(function(t) {
          const priTag       = t.priority === 'HIGH' ? ' *' : '';
          const statusLabel  = t.status === 'DONE' ? '완료' : t.status === 'IN_PROGRESS' ? '진행중' : '예정';
          const statusSuffix = showStatus ? '  [' + statusLabel + ']' : '';
          const dateRange    = (t.start_date !== t.end_date)
            ? '  ' + t.start_date.substring(5).replace('-','/') + ' ~ ' + t.end_date.substring(5).replace('-','/')
            : '';

          lines.push('    ' + num + '.  ' + t.title + priTag + statusSuffix + dateRange);
          if (t.description && t.description.trim()) {
            lines.push('        └ ' + t.description.trim());
          }
          num++;
        });
      });
    });

    // ── 2) 이월 업무
    if (carryOverItems.length > 0) {
      lines.push('');
      lines.push('── 이월 업무 ──');

      const completedCarry = carryOverItems.filter(function(t) {
        return t.end_date <= weekEnd && t.status === 'DONE';
      }).sort(function(a,b){ return catIndex(a)-catIndex(b) || sortByPri(a,b); });

      const ongoingCarry = carryOverItems.filter(function(t) {
        return !(t.end_date <= weekEnd && t.status === 'DONE');
      }).sort(function(a,b){ return catIndex(a)-catIndex(b) || sortByPri(a,b); });

      if (ongoingCarry.length > 0) {
        lines.push('');
        ongoingCarry.forEach(function(t, idx) {
          const catLabel  = CATEGORY_LABELS[t.category] || t.category || '기타';
          const endLabel  = t.end_date > weekEnd ? '계속' : '진행중';
          const dateRange = t.start_date.substring(5).replace('-','/') + ' ~ ' + t.end_date.substring(5).replace('-','/');
          lines.push('  ' + String(idx+1) + '.  [' + catLabel + ']  ' + t.title + '  [' + endLabel + ']  ' + dateRange);
          if (t.description && t.description.trim()) lines.push('      └ ' + t.description.trim());
        });
      }

      if (completedCarry.length > 0) {
        if (ongoingCarry.length > 0) lines.push('');
        completedCarry.forEach(function(t, idx) {
          const catLabel  = CATEGORY_LABELS[t.category] || t.category || '기타';
          const dateRange = t.start_date.substring(5).replace('-','/') + ' ~ ' + t.end_date.substring(5).replace('-','/');
          lines.push('  ' + String(idx+1) + '.  [' + catLabel + ']  ' + t.title + '  [완료]  ' + dateRange);
          if (t.description && t.description.trim()) lines.push('      └ ' + t.description.trim());
        });
      }
    }

    return lines.join('\n');
  }


  // ── 주간업무 로드 ────────────────────────────────────────────
  async function loadWeeklyTasks() {
    updateSharedWeekNav();

    weeklyTasks = [];
    updateWeeklySummary();
    document.getElementById('weekTimeline').innerHTML = '';

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

      // 해당 날짜가 start_date ~ end_date 범위에 포함된 업무 표시
      const dayTasks = weeklyTasks.filter(t => {
        const s = t.start_date || '';
        const e = t.end_date   || s;
        return s <= dateStr && e >= dateStr;
      });

      const chips = dayTasks.slice(0, 3).map(t => {
        const cls = t.priority === 'HIGH' ? 'chip-high' : t.priority === 'LOW' ? 'chip-low' : 'chip-medium';
        return `<span class="day-chip ${cls}" onclick="TASK_APP.openEditModal('${esc(t.task_id)}')">${esc(t.title)}</span>`;
      }).join('');

      const moreChips = dayTasks.length > 3
        ? `<span class="day-chip chip-medium" style="cursor:default;">+${dayTasks.length - 3}개</span>`
        : '';

      const taskItems = dayTasks.map(t => renderTaskItem(t, dateStr)).join('');

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

  function renderTaskItem(t, dateStr) {
    const priorityCls = t.priority === 'HIGH' ? 'priority-high' : t.priority === 'LOW' ? 'priority-low' : 'priority-medium';
    const isSingleDay = !t.end_date || t.start_date === t.end_date;
    const isEndDate   = !isSingleDay && dateStr && t.end_date === dateStr;
    const isMidDate   = !isSingleDay && dateStr && t.end_date > dateStr && t.start_date < dateStr;

    // 날짜별 표시 상태 결정
    // - 단기업무: status 그대로
    // - 기간 중간 날짜: 항상 진행중
    // - 마지막 날(end_date): DONE이면 완료, 아니면 종료예정
    let displayStatus, statusCls;
    if (isMidDate) {
      displayStatus = '진행중';
      statusCls     = 'badge-status-inprogress';
    } else if (isEndDate) {
      displayStatus = t.status === 'DONE' ? '완료' : '종료예정';
      statusCls     = t.status === 'DONE' ? 'badge-status-done' : 'badge-status-inprogress';
    } else {
      displayStatus = STATUS_LABELS[t.status] || t.status;
      statusCls     = t.status === 'DONE' ? 'badge-status-done' : t.status === 'IN_PROGRESS' ? 'badge-status-inprogress' : 'badge-status-todo';
    }

    const isDone = t.status === 'DONE' && (isSingleDay || isEndDate);

    return `
      <div class="task-item${isDone ? ' is-done' : ''}" onclick="TASK_APP.openEditModal('${esc(t.task_id)}')">
        <span class="task-priority-dot ${priorityCls}"></span>
        <div class="task-item-body">
          <div class="task-item-title">${esc(t.title)}</div>
          <div class="task-item-meta">
            <span class="task-badge badge-category">${esc(CATEGORY_LABELS[t.category] || t.category)}</span>
            <span class="task-badge ${statusCls}">${esc(displayStatus)}</span>
            ${!isSingleDay
              ? `<span style="font-size:11px;color:var(--text-muted);">${esc(t.start_date ? t.start_date.substring(5) : '')} ~ ${esc(t.end_date ? t.end_date.substring(5) : '')}</span>`
              : ''}
            ${t.description ? `<span style="font-size:11px;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.description)}</span>` : ''}
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

    showGlobalLoading('업무일지를 불러오는 중...');

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
      hideGlobalLoading();
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
            <span style="font-size:11px;color:var(--text-muted);">${t.start_date && t.start_date !== t.end_date ? t.start_date.substring(5) + ' ~ ' + (t.end_date ? t.end_date.substring(5) : '') : (t.start_date ? t.start_date.substring(5) : '')}</span>
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

    // 저장됨 / 실패 시 토스트 표시
    if (status === 'saved' || status === 'error') {
      showAutosaveToast(status);
    }
  }

  function showAutosaveToast(status) {
    let toast = document.getElementById('autosaveToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'autosaveToast';
      document.body.appendChild(toast);
    }
    toast.className = 'autosave-toast autosave-toast--' + status;
    toast.textContent = status === 'saved' ? '✓  일지가 저장되었습니다.' : '✕  저장에 실패했습니다.';
    clearTimeout(toast._hideTimer);
    toast.classList.add('is-visible');
    toast._hideTimer = setTimeout(() => toast.classList.remove('is-visible'), 2500);
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

  // ── 주간업무 엑셀 다운로드 ──────────────────────────────────────
  async function exportJournalExcel() {
    if (!window.XLSX) {
      showMessage('엑셀 라이브러리를 불러오지 못했습니다.', 'error');
      return;
    }
    const btn = document.getElementById('exportJournalBtn');
    try {
      if (btn) { btn.disabled = true; btn.textContent = '다운로드 중...'; }
      showGlobalLoading('업무일지 데이터를 불러오는 중...');

      const res = await apiGet('journalListByTeam', {
        request_user_email: currentUser.email,
        week_start:         teamWeekStart
      });
      const members = res.data || [];
      if (!members.length) { showMessage('다운로드할 데이터가 없습니다.', 'error'); return; }

      const FONT_BASE   = { name: '맑은 고딕', sz: 10 };
      const FONT_TITLE  = { name: '맑은 고딕', sz: 14, bold: true, color: { rgb: 'FFFFFF' } };
      const FONT_HEADER = { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: '1F3864' } };
      const FONT_BOLD   = { name: '맑은 고딕', sz: 10, bold: true };
      const FILL_TITLE  = { patternType: 'solid', fgColor: { rgb: '1F3864' } };
      const FILL_HEADER = { patternType: 'solid', fgColor: { rgb: 'B8CCE4' } };
      const FILL_WEEK   = { patternType: 'solid', fgColor: { rgb: 'D6E4F7' } };
      const FILL_WHITE  = { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } };
      const FILL_ALT    = { patternType: 'solid', fgColor: { rgb: 'F2F7FD' } };
      const BD     = { top:{style:'thin',color:{rgb:'BFBFBF'}}, bottom:{style:'thin',color:{rgb:'BFBFBF'}}, left:{style:'thin',color:{rgb:'BFBFBF'}}, right:{style:'thin',color:{rgb:'BFBFBF'}} };
      const BD_MED = { top:{style:'medium',color:{rgb:'2E75B6'}}, bottom:{style:'medium',color:{rgb:'2E75B6'}}, left:{style:'medium',color:{rgb:'2E75B6'}}, right:{style:'medium',color:{rgb:'2E75B6'}} };
      const AL_C = { horizontal:'center', vertical:'center', wrapText:true };
      const AL_L = { horizontal:'left',   vertical:'top',    wrapText:true };

      const ws  = {};
      const wb2 = window.XLSX.utils.book_new();

      const clinicMap = {};
      members.forEach(m => {
        const c = m.clinic_name || '기타';
        if (!clinicMap[c]) clinicMap[c] = [];
        clinicMap[c].push(m);
      });
      const clinics = Object.keys(clinicMap).sort();
      const cats    = Object.entries(CATEGORY_LABELS);
      // A:구분  B~:의원별 (작성자 컬럼 제거)
      let r = 0;

      const sc = (row, col, val, s) => {
        const a = window.XLSX.utils.encode_cell({ r: row, c: col });
        ws[a] = { v: val ?? '', t: 's', s };
      };
      const mg = (rs, re, cs, ce) => {
        if (!ws['!merges']) ws['!merges'] = [];
        ws['!merges'].push({ s:{r:rs,c:cs}, e:{r:re,c:ce} });
      };

      // 1행: 제목
      sc(r, 0, 'MSO관리팀 주간 업무보고', { font:FONT_TITLE, fill:FILL_TITLE, alignment:AL_C, border:BD_MED });
      for (let c=1;c<TOTAL_COLS;c++) sc(r, c, '', { font:FONT_TITLE, fill:FILL_TITLE, alignment:AL_C, border:BD_MED });
      mg(r,r,0,TOTAL_COLS-1); r++;

      // 2행: 기간
      const weekEnd = getWeekEnd(teamWeekStart);
      const fd = d => d ? d.substring(5).replace('-','/') : '';
      const period = `${teamWeekStart.substring(0,4)}년  ${fd(teamWeekStart)} ~ ${fd(weekEnd)}`;
      sc(r, 0, period, { font:FONT_BOLD, fill:FILL_WEEK, alignment:AL_C, border:BD });
      for (let c=1;c<TOTAL_COLS;c++) sc(r, c, '', { font:FONT_BOLD, fill:FILL_WEEK, alignment:AL_C, border:BD });
      mg(r,r,0,TOTAL_COLS-1); r++;

      // 3행: 헤더 — A:카테고리 B:금주/차주 C~:의원별
      const TOTAL_COLS = 2 + clinics.length;
      sc(r, 0, '구  분', { font:FONT_HEADER, fill:FILL_HEADER, alignment:AL_C, border:BD });
      sc(r, 1, '',       { font:FONT_HEADER, fill:FILL_HEADER, alignment:AL_C, border:BD });
      clinics.forEach((cl,i) => sc(r, 2+i, cl, { font:FONT_HEADER, fill:FILL_HEADER, alignment:AL_C, border:BD }));
      mg(r, r, 0, 1);  // A~B 병합: "구  분"
      r++;

      // 카테고리별 — A열=카테고리(금주/차주 두 행 병합), B열=금주/차주, C~=의원별
      cats.forEach(([catKey, catName], ci) => {
        const fillCat  = { patternType:'solid', fgColor:{ rgb: ci % 2 === 0 ? 'EBF3FB' : 'F5F9FE' } };
        const catStart = r;

        ['summary','next_plan'].forEach((field, fi) => {
          const weekLabel = fi === 0 ? '금주' : '차주';
          const fillWeek  = fi === 0
            ? { patternType:'solid', fgColor:{ rgb:'EBF3FB' } }
            : { patternType:'solid', fgColor:{ rgb:'F5F9FE' } };

          // A열: 카테고리명 (금주 행에만 값, 차주 행은 빈칸 — 나중에 병합)
          sc(r, 0, fi === 0 ? catName : '', { font:FONT_BOLD, fill:fillCat, alignment:AL_C, border:BD });
          // B열: 금주 / 차주 라벨
          sc(r, 1, weekLabel, { font:FONT_BOLD, fill:fillWeek, alignment:AL_C, border:BD });

          clinics.forEach((cl, i) => {
            const lines = [];
            (clinicMap[cl]||[]).forEach(m => {
              if (!m.journal) return;
              const sec = extractCategorySection(m.journal[field] || '', catName);
              if (sec) { lines.push('○ ' + m.user_name); lines.push(sec); }
            });
            sc(r, 2+i, lines.join('\n'), { font:FONT_BASE, fill:fillWeek, alignment:AL_L, border:BD });
          });
          r++;
        });

        // A열 카테고리명 두 행 병합
        mg(catStart, catStart + 1, 0, 0);
      });

      // 근태 (금주/차주) — 동일 구조
      const attStart = r;
      ['금주', '차주'].forEach((label, fi) => {
        const fillWeek = fi === 0
          ? { patternType:'solid', fgColor:{ rgb:'EBF3FB' } }
          : { patternType:'solid', fgColor:{ rgb:'F5F9FE' } };
        sc(r, 0, fi === 0 ? '근태' : '', { font:FONT_BOLD, fill:{ patternType:'solid', fgColor:{ rgb:'EBF3FB' } }, alignment:AL_C, border:BD });
        sc(r, 1, label, { font:FONT_BOLD, fill:fillWeek, alignment:AL_C, border:BD });
        clinics.forEach((cl, i) => {
          const lines = [];
          (clinicMap[cl]||[]).forEach(m => {
            if (!m.journal) return;
            const val = fi === 0
              ? (m.journal.attendance_this_week || '')
              : (m.journal.attendance_next_week || '');
            if (val) { lines.push('○ ' + m.user_name); lines.push(val); }
          });
          sc(r, 2+i, lines.join('\n'), { font:FONT_BASE, fill:fillWeek, alignment:AL_L, border:BD });
        });
        r++;
      });

      // 이슈 / 건의사항 — A열 단독 (B열 포함 병합)
      const issueRow = r;
      const fillIssue = { patternType:'solid', fgColor:{ rgb:'EBF3FB' } };
      sc(r, 0, '이슈/건의', { font:FONT_BOLD, fill:fillIssue, alignment:AL_C, border:BD });
      sc(r, 1, '',          { font:FONT_BOLD, fill:fillIssue, alignment:AL_C, border:BD });
      mg(r, r, 0, 1);
      clinics.forEach((cl, i) => {
        const lines = [];
        (clinicMap[cl]||[]).forEach(m => {
          if (!m.journal || !m.journal.issues) return;
          lines.push('○ ' + m.user_name);
          lines.push(m.journal.issues);
        });
        sc(r, 2+i, lines.join('\n'), { font:FONT_BASE, fill:fillIssue, alignment:AL_L, border:BD });
      });
      r++;

      ws['!ref']  = window.XLSX.utils.encode_range({r:0,c:0},{r:r-1,c:TOTAL_COLS-1});
      ws['!cols'] = [{ wch:12 }, { wch:8 }, ...clinics.map(()=>({ wch:50 }))];
      ws['!rows'] = Array.from({ length: r }, (_, i) => i < 3 ? { hpt:22 } : { hpt:80 });
      ws['!rows'][0] = { hpt:30 };

      window.XLSX.utils.book_append_sheet(wb2, ws, '주간업무보고');
      const today = new Date();
      const ds = today.getFullYear() + String(today.getMonth()+1).padStart(2,'0') + String(today.getDate()).padStart(2,'0');
      window.XLSX.writeFile(wb2, `주간업무보고_${teamWeekStart}_${ds}.xlsx`);
      showMessage('엑셀 다운로드가 완료되었습니다.', 'success');


    } catch (err) {
      showMessage(err.message || '엑셀 다운로드 중 오류가 발생했습니다.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⬇ 엑셀 다운로드'; }
      hideGlobalLoading();
    }
  }

  function extractCategorySection(text, catName) {
    if (!text || !catName) return '';
    const lines = text.split('\n');
    let inSection = false;
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        if (trimmed.slice(1,-1).trim() === catName) { inSection = true; continue; }
        else if (inSection) break;
        continue;
      }
      if (inSection && trimmed.startsWith('──')) break;
      if (inSection && lines[i].trim()) result.push(lines[i]);
    }
    return result.join('\n').trim();
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
    document.getElementById('modalStartDate').value       = dateStr;
    document.getElementById('modalEndDate').value         = dateStr;
    document.getElementById('modalCategory').value        = '';
    document.getElementById('modalTitle').value           = '';
    document.getElementById('modalDescription').value     = '';
    setSingleDay(true);
    updatePriorityUI('MEDIUM');
    updateStatusUI('TODO');
    openTaskModal();
  };

  window.TASK_APP.openEditModal = function(taskId) {
    const task = weeklyTasks.find(t => t.task_id === taskId);
    if (!task) return;

    editingTaskId = taskId;
    document.getElementById('taskModalTitle').textContent = '업무 수정';
    document.getElementById('modalStartDate').value       = task.start_date || '';
    document.getElementById('modalEndDate').value         = task.end_date   || task.start_date || '';
    document.getElementById('modalCategory').value        = task.category   || '';
    document.getElementById('modalTitle').value           = task.title      || '';
    document.getElementById('modalDescription').value     = task.description || '';
    const isSingle = !task.end_date || task.end_date === task.start_date;
    setSingleDay(isSingle);
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
      showGlobalLoading(newStatus === 'DONE' ? '완료 처리 중...' : '되돌리는 중...');
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
    } finally {
      hideGlobalLoading();
    }
  };

  window.TASK_APP.deleteTask = async function(taskId) {
    const task = weeklyTasks.find(t => t.task_id === taskId);
    if (!task) return;
    if (!confirm(`"${task.title}" 업무를 삭제하시겠습니까?`)) return;
    try {
      showGlobalLoading('삭제 중...');
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
    } finally {
      hideGlobalLoading();
    }
  };

  function setSingleDay(single) {
    const checkbox = document.getElementById('modalSingleDay');
    const endInput = document.getElementById('modalEndDate');
    if (!checkbox || !endInput) return;
    checkbox.checked = single;
    if (single) {
      endInput.style.display = 'none';
      // 종료일을 시작일과 동일하게 맞춤
      const startVal = document.getElementById('modalStartDate')?.value || '';
      endInput.value = startVal;
    } else {
      endInput.style.display = '';
      endInput.min = document.getElementById('modalStartDate')?.value || '';
    }
  }

  function openTaskModal() {
    document.getElementById('taskModal').classList.add('open');
  }

  function closeTaskModal() {
    document.getElementById('taskModal').classList.remove('open');
    editingTaskId = null;
  }

  async function saveTask() {
    const startDate   = document.getElementById('modalStartDate').value.trim();
    const isSingle    = document.getElementById('modalSingleDay').checked;
    const endDate     = isSingle ? startDate : (document.getElementById('modalEndDate').value.trim() || startDate);
    const category    = document.getElementById('modalCategory').value.trim();
    const title       = document.getElementById('modalTitle').value.trim();
    const description = document.getElementById('modalDescription').value.trim();
    const priority    = document.querySelector('input[name="priority"]:checked')?.value || 'MEDIUM';
    const status      = document.querySelector('input[name="status"]:checked')?.value   || 'TODO';

    if (!startDate) { alert('시작일을 입력하세요.');    return; }
    if (!category)  { alert('업무 구분을 선택하세요.'); return; }
    if (!title)     { alert('업무 제목을 입력하세요.'); return; }
    if (endDate < startDate) { alert('종료일은 시작일보다 빠를 수 없습니다.'); return; }

    const payload = {
      request_user_email: currentUser.email,
      start_date:   startDate,
      end_date:     endDate,
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
        if (idx !== -1) {
          const newWeekStart = getWeekStart(startDate);
          const newWeekEnd   = getWeekEnd(newWeekStart);
          // start_date 또는 end_date 가 현재 주에 걸쳐 있으면 로컬 갱신, 아니면 제거
          const overlapsCurrentWeek = startDate <= getWeekEnd(weeklyWeekStart) &&
                                      endDate   >= weeklyWeekStart;
          if (overlapsCurrentWeek) {
            weeklyTasks[idx] = Object.assign({}, weeklyTasks[idx], payload, {
              week_start: newWeekStart,
              week_end:   newWeekEnd
            });
          } else {
            weeklyTasks.splice(idx, 1);
          }
        }
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

  // ── 덮어쓰기 확인 모달 ──────────────────────────────────────
  function showOverwriteConfirm(weekStart, statusLabel) {
    return new Promise(function(resolve) {
      document.getElementById('overwriteWeekLabel').textContent  = weekStart;
      document.getElementById('overwriteStatusLabel').textContent = statusLabel;
      document.getElementById('overwriteModal').classList.add('open');

      function onConfirm() { cleanup(); resolve(true); }
      function onCancel()  { cleanup(); resolve(false); }

      function cleanup() {
        document.getElementById('overwriteModal').classList.remove('open');
        document.getElementById('overwriteConfirmBtn').removeEventListener('click', onConfirm);
        document.getElementById('overwriteCancelBtn').removeEventListener('click', onCancel);
      }

      document.getElementById('overwriteConfirmBtn').addEventListener('click', onConfirm);
      document.getElementById('overwriteCancelBtn').addEventListener('click', onCancel);
    });
  }

  // ── 검색 ─────────────────────────────────────────────────────

  function setSearchDefaultDates() {
    const fromEl = document.getElementById('searchDateFrom');
    const toEl   = document.getElementById('searchDateTo');
    if (!fromEl || !toEl) return;
    // 이미 값이 있으면 덮어쓰지 않음
    if (fromEl.value && toEl.value) return;
    const today  = new Date();
    const from   = new Date(today);
    from.setDate(today.getDate() - 7);
    toEl.value   = formatDateStr(today);
    fromEl.value = formatDateStr(from);
  }

  function updateSearchCategorySelect() {
    const sel = document.getElementById('searchCategory');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">전체</option>' +
      Object.entries(CATEGORY_LABELS).map(([v, n]) =>
        `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(n)}</option>`
      ).join('');
  }

  // applyCategories 후 검색 셀렉트도 동기화됨 (applyCategories 내부에서 처리)

  async function runSearch() {
    const dateFrom  = document.getElementById('searchDateFrom').value.trim();
    const dateTo    = document.getElementById('searchDateTo').value.trim();
    const keyword   = document.getElementById('searchKeyword').value.trim();
    const category  = document.getElementById('searchCategory').value.trim();
    const status    = document.getElementById('searchStatus').value.trim();
    const priority  = document.getElementById('searchPriority').value.trim();

    if (!dateFrom && !dateTo && !keyword && !category && !status && !priority) {
      showMessage('검색 조건을 하나 이상 입력하세요.', 'error');
      return;
    }

    const resultList = document.getElementById('searchResultList');
    const resultHead = document.getElementById('searchResultHead');
    resultHead.style.display = 'none';
    resultList.innerHTML = `
      <div class="search-loading">
        <div class="task-loading-spinner" style="width:20px;height:20px;border-width:2px;"></div>
        검색 중...
      </div>`;

    try {
      const params = { request_user_email: currentUser.email };
      if (dateFrom)  params.date_from = dateFrom;
      if (dateTo)    params.date_to   = dateTo;
      if (keyword)   params.keyword   = keyword;
      if (category)  params.category  = category;
      if (status)    params.status    = status;
      if (priority)  params.priority  = priority;

      const res     = await apiGet('taskSearch', params);
      const results = res.data || [];

      renderSearchResults(results, keyword);

    } catch (err) {
      resultList.innerHTML = `
        <div class="task-empty task-empty--error">
          <div class="task-empty-icon">⚠️</div>
          <div class="task-empty-text">${esc(err.message || '검색에 실패했습니다.')}</div>
        </div>`;
    }
  }

  function renderSearchResults(results, keyword) {
    const resultList = document.getElementById('searchResultList');
    const resultHead = document.getElementById('searchResultHead');
    const countEl   = document.getElementById('searchResultCount');

    resultHead.style.display = '';
    countEl.innerHTML = `총 <strong>${results.length}</strong>건`;

    if (!results.length) {
      resultList.innerHTML = `
        <div class="task-empty">
          <div class="task-empty-icon">🔍</div>
          <div class="task-empty-text">검색 결과가 없습니다.</div>
        </div>`;
      return;
    }

    resultList.innerHTML = `<div style="padding:8px 22px 16px;">` +
      results.map(t => {
        const priorityCls = t.priority === 'HIGH' ? 'priority-high' : t.priority === 'LOW' ? 'priority-low' : 'priority-medium';
        const statusCls   = t.status === 'DONE' ? 'badge-status-done' : t.status === 'IN_PROGRESS' ? 'badge-status-inprogress' : 'badge-status-todo';
        const statusLabel = STATUS_LABELS[t.status] || t.status;
        const catLabel    = CATEGORY_LABELS[t.category] || t.category || '';
        const isSingle    = !t.end_date || t.start_date === t.end_date;
        const dateStr     = isSingle
          ? t.start_date.substring(5).replace('-', '/')
          : t.start_date.substring(5).replace('-','/') + ' ~ ' + t.end_date.substring(5).replace('-','/');

        const titleHtml = keyword ? highlight(t.title, keyword)      : esc(t.title);
        const descHtml  = keyword ? highlight(t.description, keyword) : esc(t.description);

        return `
          <div class="task-item" onclick="TASK_APP.openSearchItem('${esc(t.task_id)}','${esc(getWeekStart(t.start_date))}')">
            <span class="task-priority-dot ${priorityCls}"></span>
            <div class="task-item-body">
              <div class="task-item-title">${titleHtml}</div>
              <div class="task-item-meta">
                <span class="task-badge badge-category">${esc(catLabel)}</span>
                <span class="task-badge ${statusCls}">${esc(statusLabel)}</span>
                ${t.description ? `<span style="font-size:11px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${descHtml}</span>` : ''}
              </div>
            </div>
            <span class="search-item-date">${esc(dateStr)}</span>
          </div>`;
      }).join('') + `</div>`;
  }

  function highlight(text, keyword) {
    if (!text || !keyword) return esc(text);
    const escaped   = esc(text);
    const escapedKw = esc(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp('(' + escapedKw + ')', 'gi'),
      '<mark style="background:#fef08a;border-radius:2px;padding:0 1px;">$1</mark>');
  }

  function resetSearch() {
    document.getElementById('searchDateFrom').value = '';
    document.getElementById('searchDateTo').value   = '';
    document.getElementById('searchKeyword').value  = '';
    document.getElementById('searchCategory').value = '';
    document.getElementById('searchStatus').value   = '';
    document.getElementById('searchPriority').value = '';
    setSearchDefaultDates();
    document.getElementById('searchResultHead').style.display = 'none';
    document.getElementById('searchResultList').innerHTML = `
      <div class="task-empty">
        <div class="task-empty-icon">🔍</div>
        <div class="task-empty-text">검색 조건을 입력하고 검색 버튼을 눌러주세요.</div>
      </div>`;
  }

  window.TASK_APP.openSearchItem = function(taskId, weekStart) {
    // 검색 결과에서 week_start를 직접 받아 API 재호출 없이 즉시 이동
    showGlobalLoading('업무를 불러오는 중...');
    weeklyWeekStart = weekStart || getWeekStart(formatDateStr(new Date()));
    loadWeeklyTasks().then(() => {
      switchTab('weekly');
      TASK_APP.openEditModal(taskId);
    }).catch(err => {
      showMessage(err.message, 'error');
    }).finally(() => {
      hideGlobalLoading();
    });
  };

  // ── 카테고리 관리 ────────────────────────────────────────────

  async function loadCategories() {
    try {
      const res = await apiGet('taskGetCategories', {
        request_user_email: currentUser.email
      });
      applyCategories(res);
    } catch (err) {
      // 실패해도 기본값 유지
    }
  }

  function applyCategories(res) {
    if (!res || !res.data) return;
    const newLabels = {};
    res.data.forEach(function(c) {
      newLabels[c.code_value] = c.code_name;
    });
    CATEGORY_LABELS   = newLabels;
    categoryCodeGroup = res.code_group    || 'TASK_CATEGORY';
    categoryIsCustom  = res.is_team_custom || false;
    // 모달 + 검색 카테고리 셀렉트 동시 갱신
    updateCategorySelect();
    updateSearchCategorySelect();
  }

  function updateCategorySelect() {
    const sel = document.getElementById('modalCategory');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">선택하세요</option>' +
      Object.entries(CATEGORY_LABELS).map(function([v, n]) {
        return `<option value="${esc(v)}">${esc(n)}</option>`;
      }).join('');
    sel.value = currentVal;
  }

  async function openCategoryModal() {
    document.getElementById('categoryModal').classList.add('open');
    await renderCategoryList();
  }

  function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('open');
    resetCategoryForm();
  }

  async function renderCategoryList() {
    const listEl  = document.getElementById('categoryList');
    const badgeEl = document.getElementById('categorySourceBadge');
    const tipEl   = document.getElementById('categoryTip');

    listEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">불러오는 중...</div>';

    try {
      const res = await apiGet('taskGetCategories', { request_user_email: currentUser.email });
      applyCategories(res);

      badgeEl.textContent  = categoryIsCustom ? '팀 전용' : '기본 공통';
      badgeEl.className    = 'category-source-badge ' + (categoryIsCustom ? 'is-custom' : 'is-default');
      tipEl.textContent    = categoryIsCustom
        ? '팀 전용 카테고리가 적용 중입니다. 항목을 모두 삭제하면 기본 카테고리로 복원됩니다.'
        : '기본 카테고리 사용 중입니다. 항목을 추가하면 팀 전용으로 전환됩니다.';

      if (!res.data || res.data.length === 0) {
        listEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">등록된 카테고리가 없습니다.</div>';
        return;
      }

      listEl.innerHTML = res.data.map(function(c) {
        const canDelete = categoryIsCustom; // 팀 전용만 삭제 가능
        return `
          <div class="category-item">
            <span class="category-item-order">${c.sort_order}</span>
            <span class="category-item-name">${esc(c.code_name)}</span>
            <span class="category-item-code">${esc(c.code_value)}</span>
            <div class="category-item-actions">
              <button class="task-icon-btn" title="수정" onclick="TASK_APP.editCategory('${esc(c.code_value)}','${esc(c.code_name)}',${c.sort_order},'${esc(c.code_group)}')">✎</button>
              ${canDelete ? `<button class="task-icon-btn danger" title="삭제" onclick="TASK_APP.deleteCategory('${esc(c.code_value)}','${esc(c.code_name)}','${esc(c.code_group)}')">🗑</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      listEl.innerHTML = `<div style="font-size:12px;color:#dc2626;">${esc(err.message)}</div>`;
    }
  }

  function resetCategoryForm() {
    document.getElementById('catInputName').value  = '';
    document.getElementById('catInputOrder').value = '';
    document.getElementById('catEditValue').value  = '';
    document.getElementById('catEditGroup').value  = '';
    document.getElementById('catAddBtn').textContent = '추가';
  }

  window.TASK_APP.editCategory = function(codeValue, codeName, sortOrder, codeGroup) {
    document.getElementById('catInputName').value  = codeName;
    document.getElementById('catInputOrder').value = sortOrder;
    document.getElementById('catEditValue').value  = codeValue;
    document.getElementById('catEditGroup').value  = codeGroup;
    document.getElementById('catAddBtn').textContent = '수정';
    document.getElementById('catInputName').focus();
  };

  window.TASK_APP.deleteCategory = async function(codeValue, codeName, codeGroup) {
    if (!confirm(`"${codeName}" 카테고리를 삭제하시겠습니까?`)) return;
    try {
      await apiPost('taskDeleteCategory', {
        request_user_email: currentUser.email,
        code_value:         codeValue,
        code_group:         codeGroup
      });
      showMessage('카테고리가 삭제되었습니다.', 'success');
      await renderCategoryList();
    } catch (err) {
      showMessage(err.message || '삭제에 실패했습니다.', 'error');
    }
  };

  async function saveCategoryItem() {
    const name       = document.getElementById('catInputName').value.trim();
    const order      = Number(document.getElementById('catInputOrder').value) || 1;
    const editValue  = document.getElementById('catEditValue').value.trim();
    const editGroup  = document.getElementById('catEditGroup').value.trim();

    if (!name) { alert('카테고리 이름을 입력하세요.'); return; }

    // 신규 추가 시 code_value 자동 생성 (한글 → 영문 불가, 타임스탬프 기반)
    const codeValue = editValue || ('CAT_' + Date.now().toString(36).toUpperCase());

    try {
      document.getElementById('catAddBtn').disabled = true;
      await apiPost('taskSaveCategory', {
        request_user_email: currentUser.email,
        code_value:         codeValue,
        code_name:          name,
        sort_order:         order
      });
      showMessage(editValue ? '카테고리가 수정되었습니다.' : '카테고리가 추가되었습니다.', 'success');
      resetCategoryForm();
      await renderCategoryList();
      // 모달 카테고리 셀렉트 갱신
      updateCategorySelect();
    } catch (err) {
      showMessage(err.message || '저장에 실패했습니다.', 'error');
    } finally {
      document.getElementById('catAddBtn').disabled = false;
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
