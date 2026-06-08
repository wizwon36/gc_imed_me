/**
 * closing.js
 * GC녹십자아이메드 월마감 자동화 앱
 *
 * 기능
 *  - Raw 입고 / 사용현황 엑셀 업로드 → GC케어 / 아이메드 자동 분류
 *  - 산출물 6종 엑셀 다운로드 (ExcelJS 서식 완전 적용)
 *  - 거래처 마스터 관리 (API 연동 → 서버 저장)
 */

'use strict';

// ═══════════════════════════════════════════════════════════
// 0. 진입점
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  try {
    showGlobalLoading('월마감 앱 초기화 중...');

    // 로그인 체크
    const user = window.auth?.getSession?.();
    if (!user) { location.replace(`${CONFIG.SITE_BASE_URL}/index.html`); return; }

    // 로그아웃
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      window.auth?.logout?.();
      location.replace(`${CONFIG.SITE_BASE_URL}/index.html`);
    });

    // 마감월 초기값: 전월 자동 설정
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yy = prevMonth.getFullYear();
    const mm = String(prevMonth.getMonth() + 1).padStart(2, '0');
    document.getElementById('inputMonth').value = `${yy}-${mm}`;

    // 지점명 드롭다운: ORG_CLINIC 로드 후 소속 의원 기본 선택
    await loadBranchOptions(user);

    // 권한 체크 (closing: view 이상)
    const ok = await window.appPermission?.requirePermission?.('closing', ['admin', 'edit', 'view']);
    if (ok === false) {
      document.getElementById('permissionDenied').style.display = '';
      return;
    }

    // 관리자 여부 저장
    const isAdmin = String(user?.role || '').trim().toLowerCase() === 'admin';
    const editPerm = await window.appPermission?.getPermission?.('closing');
    App.canEdit = isAdmin || ['admin', 'edit'].includes(editPerm);

    document.getElementById('appBody').style.display = '';

    // 거래처·자재 데이터 로드 (처리 시작 전 반드시 완료되어야 함)
    await Promise.all([
      loadVendorsFromServer().catch(() => {}),
      loadItemsFromServer().catch(() => {}),
    ]);

  } catch (e) {
    showMessage('앱 초기화 중 오류가 발생했습니다: ' + e.message, 'error');
  } finally {
    await hideGlobalLoading();
  }
});

// ═══════════════════════════════════════════════════════════
// 1. 앱 상태
// ═══════════════════════════════════════════════════════════
const App = {
  canEdit: false,
  ipgoRaw: null,
  usageRaw: null,
  ipgoData: [],
  usageData: [],
  R: {},             // 처리 결과
  vendors: [],       // 거래처 마스터 (서버에서 로드)
  items: [],         // 자재코드 마스터 (서버에서 로드)
  vendorsDirty: false,
  itemsDirty: false,
};

// ═══════════════════════════════════════════════════════════
// 2. 탭 전환
// ═══════════════════════════════════════════════════════════
function switchTab(tab) {
  ['closing', 'vendor', 'item'].forEach(t => {
    document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`)
      ?.classList.toggle('active', t === tab);
    document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}Content`)
      ?.classList.toggle('active', t === tab);
  });
  if (tab === 'vendor') {
    if (App.vendors.length) {
      renderVendorTable();
    } else {
      showGlobalLoading('거래처 정보 로드 중...');
      loadVendorsFromServer()
        .then(() => renderVendorTable())
        .finally(() => hideGlobalLoading());
    }
  }
  if (tab === 'item') {
    if (App.items.length) {
      renderItemTable();
    } else {
      showGlobalLoading('자재코드 로드 중...');
      loadItemsFromServer()
        .then(() => renderItemTable())
        .finally(() => hideGlobalLoading());
    }
    initStockInitUI();
    initUsageInitUI();
  }
}

// ═══════════════════════════════════════════════════════════
// 3. 파일 업로드
// ═══════════════════════════════════════════════════════════
function dragOver(e, id) { e.preventDefault(); document.getElementById(id).classList.add('dragover'); }
function dragLeave(id)   { document.getElementById(id).classList.remove('dragover'); }
function dropFile(e, type) {
  e.preventDefault();
  document.getElementById('zone-' + type).classList.remove('dragover');
  if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0], type);
}
function handleFile(input, type) {
  if (input.files[0]) processFile(input.files[0], type);
}
function processFile(file, type) {
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, { type: 'array' });
    App[type + 'Raw'] = { wb, name: file.name };
    document.getElementById('zone-' + type).classList.add('uploaded');
    document.getElementById('status-' + type).textContent = '✓ ' + file.name;
    if (App.ipgoRaw && App.usageRaw) {
      document.getElementById('btnNext1').disabled = false;
    }
  };
  reader.readAsArrayBuffer(file);
}

// ═══════════════════════════════════════════════════════════
// 4. 스텝 내비게이션
// ═══════════════════════════════════════════════════════════
function goStep(n) {
  [1, 2, 3, 4].forEach(i => {
    document.getElementById('sec' + i)?.classList.toggle('active', i === n);
    const el = document.getElementById('step' + i);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < n) el.classList.add('done');
    else if (i === n) el.classList.add('active');
    el.querySelector('.cl-step-num').textContent = i < n ? '✓' : i;
  });
}
function startProcessing() {
  goStep(3);
  setTimeout(runProcessing, 200);
}

// ═══════════════════════════════════════════════════════════
// 5. 로그 / 진행
// ═══════════════════════════════════════════════════════════
function clog(msg, cls = 'info') {
  const box = document.getElementById('logBox');
  if (!box) return;
  const t = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  box.innerHTML += `<div class="cl-log-line ${cls}"><span class="cl-log-time">[${t}]</span>${msg}</div>`;
  box.scrollTop = box.scrollHeight;
}
function prog(pct, label) {
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressLabel').textContent = label;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════
// 6. 파싱
// ═══════════════════════════════════════════════════════════
function toN(v) { const n = parseFloat(String(v || 0).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
const sumF = (arr, k) => arr.reduce((s, r) => s + toN(r[k]), 0);

function parseIpgo(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let hr = 0;
  for (let i = 0; i < all.length; i++) {
    if (String(all[i][0]).trim() === 'No.') { hr = i; break; }
  }
  const hdrs = all[hr].map(h => String(h).trim());
  const data = [];
  for (let i = hr + 1; i < all.length; i++) {
    const row = all[i];
    if (!String(row[0]).trim() || isNaN(parseInt(row[0]))) continue;
    const obj = {};
    hdrs.forEach((h, idx) => { obj[h] = row[idx]; });
    const t = String(obj['자재구분'] || '').trim();
    obj['구분'] = (t === '소모품' || t === '시약') ? 'GC케어' : '아이메드';
    data.push(obj);
  }
  return data;
}

function parseUsage(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let hr = 1;
  for (let i = 0; i < all.length; i++) {
    if (String(all[i][0]).trim() === '부서명' || String(all[i][1]).trim() === '부서명') { hr = i; break; }
  }
  const hdrs = all[hr].map(h => String(h).trim());
  // 자재코드 컬럼 인덱스 찾기
  const codeIdx = hdrs.findIndex(h => h === '자재코드');
  const data = [];
  for (let i = hr + 1; i < all.length; i++) {
    const row = all[i];
    const col0 = String(row[0] || '').trim();
    const col1 = String(row[1] || '').trim();
    // 빈 행 스킵
    if (!col0 && !col1) continue;
    // 합계 행 스킵: 자재코드가 없으면 합계/소계 행
    if (codeIdx >= 0 && !String(row[codeIdx] || '').trim()) continue;
    const obj = {};
    hdrs.forEach((h, idx) => { if (h) obj[h] = row[idx]; });
    data.push(obj);
  }
  return data;
}

// ═══════════════════════════════════════════════════════════
// 7. 집계 헬퍼
// ═══════════════════════════════════════════════════════════
function byVendor(data) {
  const m = {};
  data.forEach(r => {
    const v = String(r['공급업체'] || '').trim(); if (!v) return;
    if (!m[v]) m[v] = { 공급업체: v, 공급가액: 0, 부가세: 0, 합계금액: 0 };
    m[v].공급가액 += toN(r['공급가액']); m[v].부가세 += toN(r['부가세']); m[v].합계금액 += toN(r['합계금액']);
  });
  return Object.values(m).sort((a, b) => b.공급가액 - a.공급가액);
}
function byDeptIpgo(data) {
  const m = {};
  data.forEach(r => {
    const k = String(r['의뢰부서'] || '').trim() + '||' + String(r['자재구분'] || '').trim();
    if (!m[k]) m[k] = { 의뢰부서: String(r['의뢰부서'] || '').trim(), 자재구분: String(r['자재구분'] || '').trim(), 공급가액: 0, 부가세: 0, 합계금액: 0 };
    m[k].공급가액 += toN(r['공급가액']); m[k].부가세 += toN(r['부가세']); m[k].합계금액 += toN(r['합계금액']);
  });
  return Object.values(m);
}

// 입고 + 사용 데이터의 부서 합집합으로 구성 (입고 없는 부서도 포함)
function byDeptIpgoFull(ipgoData, usageData) {
  const m = {};

  // 사용 데이터에서 부서+자재구분 목록 확보 (금액 0으로 초기화)
  usageData.forEach(r => {
    const dept = String(r['부서명'] || '').trim();
    const type = String(r['자재구분'] || '').trim();
    if (!dept) return;
    const k = dept + '||' + type;
    if (!m[k]) m[k] = { 의뢰부서: dept, 자재구분: type, 공급가액: 0, 부가세: 0, 합계금액: 0 };
  });

  // 입고 데이터로 금액 채우기
  ipgoData.forEach(r => {
    const dept = String(r['의뢰부서'] || '').trim();
    const type = String(r['자재구분'] || '').trim();
    if (!dept) return;
    const k = dept + '||' + type;
    if (!m[k]) m[k] = { 의뢰부서: dept, 자재구분: type, 공급가액: 0, 부가세: 0, 합계금액: 0 };
    m[k].공급가액 += toN(r['공급가액']);
    m[k].부가세   += toN(r['부가세']);
    m[k].합계금액 += toN(r['합계금액']);
  });

  return Object.values(m);
}
function byDeptUsage(data) {
  const m = {};
  data.forEach(r => {
    const k = String(r['부서명'] || '').trim() + '||' + String(r['자재구분'] || '').trim();
    if (!m[k]) m[k] = { 부서명: String(r['부서명'] || '').trim(), 자재구분: String(r['자재구분'] || '').trim(), 사용공급가: 0, 사용부가세: 0, 사용합계: 0 };
    m[k].사용공급가 += toN(r['사용공급가']); m[k].사용부가세 += toN(r['사용부가세']); m[k].사용합계 += toN(r['사용합계']);
  });
  return Object.values(m);
}

// 5% 가산 요약: 행별 ROUNDUP 후 부서별 합산 (합산 후 ROUNDUP과 다름)
function byDeptUsage5pct(data) {
  const m = {};
  data.forEach(r => {
    const k = String(r['부서명'] || '').trim() + '||' + String(r['자재구분'] || '').trim();
    if (!m[k]) m[k] = { 부서명: String(r['부서명'] || '').trim(), 자재구분: String(r['자재구분'] || '').trim(), 사용공급가: 0, 사용부가세: 0, 사용합계: 0 };
    const sup5 = Math.ceil(toN(r['사용공급가']) * 1.05);
    const vat5 = Math.ceil(toN(r['사용부가세']) * 1.05);
    m[k].사용공급가 += sup5;
    m[k].사용부가세 += vat5;
    m[k].사용합계  += sup5 + vat5;  // 계5% = 공5% + 부5%
  });
  return Object.values(m);
}
function byItem(data, codeKey, nameKey, qtyKey, amtKey) {
  const m = {};
  data.forEach(r => {
    const code = String(r[codeKey] || '').trim(); if (!code) return;
    if (!m[code]) m[code] = { 코드: code, 명: String(r[nameKey] || ''), 구분: String(r['자재구분'] || ''), 수량: 0, 금액: 0 };
    m[code].수량 += toN(r[qtyKey]); m[code].금액 += toN(r[amtKey]);
  });
  return Object.values(m);
}

// ═══════════════════════════════════════════════════════════
// 8. 메인 처리
// ═══════════════════════════════════════════════════════════
async function runProcessing() {
  const branch  = document.getElementById('inputBranch').value.trim() || '서울숲';
  const ym      = document.getElementById('inputMonth').value;
  const [y, m]  = ym.split('-');
  const mi      = parseInt(m);
  const cc      = document.getElementById('inputCC').value.trim();
  const account = '11301101'; // 계정코드 고정값

  try {
    clog('처리를 시작합니다...', 'info'); await sleep(150);
    prog(10, '입고 데이터 파싱 중...');
    const ipgoData  = parseIpgo(App.ipgoRaw.wb);
    App.ipgoData    = ipgoData;
    clog(`입고 ${ipgoData.length}건 파싱 완료 (소계행 자동 제거)`, 'ok');

    await sleep(150); prog(22, '사용현황 파싱 중...');
    const usageData = parseUsage(App.usageRaw.wb);
    App.usageData   = usageData;
    clog(`사용현황 ${usageData.length}건 파싱 완료`, 'ok');

    await sleep(150); prog(38, 'GC케어 / 아이메드 분류 중...');
    const gcIpgo    = ipgoData.filter(r => r['구분'] === 'GC케어');
    const imedIpgo  = ipgoData.filter(r => r['구분'] === '아이메드');
    const usageSiyak   = usageData.filter(r => String(r['자재구분'] || '').trim() === '시약');
    const usageSomoum  = usageData.filter(r => String(r['자재구분'] || '').trim() === '소모품');
    const usageGC   = [...usageSiyak, ...usageSomoum];
    const usageImed = usageData.filter(r => String(r['자재구분'] || '').trim() === '의약품');
    clog(`입고 GC케어:${gcIpgo.length}건 / 아이메드:${imedIpgo.length}건`, 'ok');
    clog(`사용 GC케어(시약+소모품):${usageGC.length}건 / 아이메드(의약품):${usageImed.length}건`, 'ok');

    await sleep(150); prog(55, '집계 중...');
    const gcVendors        = byVendor(gcIpgo);
    const imedVendors      = byVendor(imedIpgo);
    const gcDepts          = byDeptIpgoFull(gcIpgo, usageGC);
    const imedDepts        = byDeptIpgoFull(imedIpgo, usageImed);
    const itemIpgoPivot    = byItem(ipgoData, '자재코드', '자재명', '수량', '공급가액')
                              .filter(it => !String(it.코드).startsWith('6'));  // 의약품 제외
    const itemUsagePivot   = byItem(usageGC, '자재코드', '자재명', '사용수량(입)', '사용공급가');
    const siyakPivot       = byDeptUsage(usageSiyak);
    const siyakPivot5      = byDeptUsage5pct(usageSiyak);
    const imedSiSoPivot5   = byDeptUsage5pct(usageGC);
    const imedSiSoPivot    = byDeptUsage(usageGC);
    const imedDrugPivot    = byDeptUsage(usageImed);
    clog('집계 완료', 'ok');

    await sleep(150); prog(70, 'SAP 양식 생성 중...');
    // 거래처 맵 (서버 데이터 우선)
    const vendorMap = {};
    App.vendors.forEach(v => { vendorMap[v.vendor_name] = v; });

    const sapRows = gcIpgo.map(r => {
      const vm = vendorMap[String(r['공급업체'] || '').trim()] || {};
      return {
        거래처:    String(r['공급업체'] || ''),
        사업자번호: vm.biz_no       || '',
        공급가액:  toN(r['공급가액']),
        기준일:    String(r['입고일자'] || ''),
        적요:     `(${branch})${r['의뢰부서']}${r['자재명']}${r['수량']}`,
        지급일:   vm.credit_days   != null ? vm.credit_days : 90,
        결제방법:  vm.pay_method   || '현금결제',
        계정:     '11301101',   // 계정코드 고정값
        전표번호:  '',
      };
    });
    clog(`SAP 양식 ${sapRows.length}건 생성`, 'ok');

    await sleep(150); prog(85, '수불 집계 중...');

    // item_master 기반으로 초기 map 구성 (사용 상태만)
    const subulMap = {};
    const activeItems = App.items.filter(it => String(it.item_status || '사용').trim() === '사용');
    if (activeItems.length) {
      activeItems.forEach(it => {
        subulMap[it.item_code] = {
          code: it.item_code, name: it.item_name,
          type: it.item_type, 기초: 0, 증가: 0, 감소: 0
        };
      });
      clog(`자재 마스터 ${activeItems.length}건 기준으로 수불 구성`, 'ok');
    } else {
      clog('자재 마스터 미등록 — 입고/사용 데이터 기준으로 수불 구성', 'warn');
    }

    // 사용 집계
    usageData.forEach(r => {
      const code = String(r['자재코드'] || '').trim(); if (!code) return;
      if (!subulMap[code]) subulMap[code] = { code, name: String(r['자재명'] || ''), type: String(r['자재구분'] || ''), 기초: 0, 증가: 0, 감소: toN(r['사용공급가']) };
      else subulMap[code].감소 += toN(r['사용공급가']);
    });
    // 입고 집계
    ipgoData.forEach(r => {
      const code = String(r['자재코드'] || '').trim(); if (!code) return;
      if (!subulMap[code]) subulMap[code] = { code, name: String(r['자재명'] || ''), type: String(r['자재구분'] || ''), 기초: 0, 증가: toN(r['공급가액']), 감소: 0 };
      else subulMap[code].증가 += toN(r['공급가액']);
    });

    // 입고 파일에 자재 마스터 미등록 품목 경고
    let unregItems = [];
    if (activeItems.length) {
      const itemCodeSet = new Set(activeItems.map(it => it.item_code));
      unregItems = [...new Set(ipgoData.map(r => ({
        code: String(r['자재코드'] || '').trim(),
        name: String(r['자재명']   || '').trim(),
        type: String(r['자재구분'] || '').trim(),
      })).filter(r => r.code && !itemCodeSet.has(r.code))
        .map(r => JSON.stringify(r)))
      ].map(s => JSON.parse(s));
      if (unregItems.length) clog(`⚠ 자재 마스터 미등록 품목 ${unregItems.length}건`, 'warn');
    }

    // 전월 기말 → 기초값 세팅
    const prevYm = (() => {
      const d = new Date(parseInt(y), mi - 2, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();
    clog(`전월(${prevYm}) 기초 재고 로드 중...`, 'info');
    const prevStock = await loadPrevStock(prevYm, branch);
    if (prevStock.length) {
      prevStock.forEach(s => {
        const code = String(s.item_code || '').trim(); if (!code) return;
        if (subulMap[code]) {
          subulMap[code].기초    = toN(s.closing_amount);
          subulMap[code].기초수량 = toN(s.closing_qty);   // 소수점 그대로 유지
        } else {
          subulMap[code] = { code, name: s.item_name || '', type: s.item_type || '',
            기초: toN(s.closing_amount), 기초수량: toN(s.closing_qty), 증가: 0, 감소: 0 };
        }
      });
      clog(`전월 기초 재고 ${prevStock.length}건 반영`, 'ok');
    } else {
      clog('전월 확정 데이터 없음 — 기초값 0으로 처리', 'warn');
    }

    // 미등록 거래처 경고
    const unregVendors = [...new Set(gcIpgo.map(r => String(r['공급업체'] || '').trim()).filter(v => v && !vendorMap[v]))];
    if (unregVendors.length) clog(`⚠ 거래처 관리 미등록: ${unregVendors.join(', ')}`, 'warn');

    App.R = { gcIpgo, imedIpgo, gcVendors, imedVendors, gcDepts, imedDepts,
              itemIpgoPivot, itemUsagePivot, usageGC, usageImed, usageSiyak, usageSomoum,
              siyakPivot, siyakPivot5, imedSiSoPivot, imedSiSoPivot5, imedDrugPivot,
              sapRows, subulMap, vendorMap, unregItems, unregVendors, y, m: mi, branch, cc, account };

    clog('모든 처리 완료!', 'ok');
    await sleep(300); prog(100, '완료!');
    await sleep(400);

    goStep(4);
    renderResults();

  } catch (err) {
    clog('처리 중 오류: ' + err.message, 'err');
    showMessage('처리 중 오류가 발생했습니다: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// 9. 결과 렌더링
// ═══════════════════════════════════════════════════════════
function renderResults() {
  const R = App.R;
  const gcT  = R.gcVendors.reduce((s, v) => s + v.합계금액, 0);
  const imT  = R.imedVendors.reduce((s, v) => s + v.합계금액, 0);

  document.getElementById('summaryGrid').innerHTML = `
    <div class="cl-stat">
      <div class="cl-stat-label">총 입고 건수</div>
      <div class="cl-stat-val">${(R.gcIpgo.length + R.imedIpgo.length).toLocaleString()}</div>
      <div class="cl-stat-sub">GC케어 ${R.gcIpgo.length} / 아이메드 ${R.imedIpgo.length}</div>
    </div>
    <div class="cl-stat">
      <div class="cl-stat-label">전체 입고금액</div>
      <div class="cl-stat-val">${Math.round(gcT + imT).toLocaleString()}원</div>
      <div class="cl-stat-sub">합계금액 기준</div>
    </div>
    <div class="cl-stat" style="border-left:3px solid #0e7c3a;">
      <div class="cl-stat-label" style="color:#0e7c3a;">GC케어 입고</div>
      <div class="cl-stat-val" style="color:#0e7c3a;">${Math.round(gcT).toLocaleString()}원</div>
      <div class="cl-stat-sub">소모품·시약 ${R.gcVendors.length}개 거래처</div>
    </div>
    <div class="cl-stat" style="border-left:3px solid #b45309;">
      <div class="cl-stat-label" style="color:#b45309;">아이메드 입고</div>
      <div class="cl-stat-val" style="color:#b45309;">${Math.round(imT).toLocaleString()}원</div>
      <div class="cl-stat-sub">의약품 ${R.imedVendors.length}개 거래처</div>
    </div>
  `;

  renderPreview();

  // 미등록 거래처 에러 카드
  const vendorErrCard = document.getElementById('unregVendorsCard');
  if (vendorErrCard) {
    if (R.unregVendors && R.unregVendors.length > 0) {
      vendorErrCard.style.display = '';
      document.getElementById('unregVendorsBody').innerHTML = `
        <p style="font-size:12px;color:#92400e;margin-bottom:10px;">
          아래 거래처는 <strong>거래처 관리</strong>에 등록되지 않았습니다.
          결재 시트에 사업자번호·결제방법·결제기일이 비어있으며 노란색으로 표시됩니다.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${R.unregVendors.map(v =>
            `<span style="background:#fff;border:1px solid #fde68a;border-radius:5px;padding:4px 10px;font-size:12px;font-weight:600;">${escHtml(v)}</span>`
          ).join('')}
        </div>`;
    } else {
      vendorErrCard.style.display = 'none';
    }
  }

  // 미등록 품목 에러 카드
  const errCard = document.getElementById('unregItemsCard');
  if (errCard) {
    if (R.unregItems && R.unregItems.length > 0) {
      errCard.style.display = '';
      document.getElementById('unregItemsBody').innerHTML = `
        <p style="font-size:12px;color:#92400e;margin-bottom:10px;">
          아래 품목은 자재코드 마스터에 등록되지 않았습니다.
          수불 집계표에 포함되어 있으나 <strong>자재코드 관리 탭에서 등록</strong> 후 재처리를 권장합니다.
        </p>
        <div class="cl-preview-wrap">
          <table class="cl-preview">
            <thead><tr><th>자재코드</th><th>자재명</th><th>구분</th></tr></thead>
            <tbody>${R.unregItems.map(it => `
              <tr>
                <td style="font-family:monospace;font-size:12px;">${escHtml(it.code)}</td>
                <td>${escHtml(it.name)}</td>
                <td>${escHtml(it.type)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } else {
      errCard.style.display = 'none';
    }
  }
  const btn = document.getElementById('btnClosingConfirm');
  const statusEl = document.getElementById('closingConfirmStatus');
  if (btn) {
    btn.disabled = false;
    btn.textContent = '✅ 마감 확정';
    btn.style.background = '#1d4ed8';
  }
  if (statusEl) statusEl.textContent = '';

  document.getElementById('downloadGrid').innerHTML = `
    <div class="cl-dl-card both" onclick="dlIpgo()">
      <span class="cl-dl-tag both">공통</span>
      <div class="cl-dl-name">입고 (편집본)</div>
      <div class="cl-dl-sheets">거래처 요약 · 입고원본 · GC케어 입고분 · 원가집계표 요약 · GC케어 마감요약 · 아이메드 입고분 · 아이메드 마감요약</div>
      <button class="btn" style="margin-top:6px;font-size:12px;padding:5px 12px;">⬇ 다운로드</button>
    </div>
    <div class="cl-dl-card both" onclick="dlUsage()">
      <span class="cl-dl-tag both">공통</span>
      <div class="cl-dl-name">사용현황 (편집본)</div>
      <div class="cl-dl-sheets">사용원본 · 시약,소모품 · 원가집계표 요약 · 소모품 · 시약 · 시약 마감요약 · 시약5% · 의약품 · 아이메드 마감요약(시,소) · 아이메드 마감요약(의약품)</div>
      <button class="btn" style="margin-top:6px;font-size:12px;padding:5px 12px;">⬇ 다운로드</button>
    </div>
    <div class="cl-dl-card gc" onclick="dlGCReport()">
      <span class="cl-dl-tag gc">GC케어</span>
      <div class="cl-dl-name">거래처 구매 내역 및 원재료 보고</div>
      <div class="cl-dl-sheets">결재 · 부서별 금액 · 원재료비 · 연간 원재료비</div>
      <button class="btn" style="margin-top:6px;font-size:12px;padding:5px 12px;">⬇ 다운로드</button>
    </div>
    <div class="cl-dl-card imed" onclick="dlImedReport()">
      <span class="cl-dl-tag imed">아이메드</span>
      <div class="cl-dl-name">거래처 구매 내역 및 원재료 보고</div>
      <div class="cl-dl-sheets">결재 · 부서별 금액 · 원재료비 · 연간 원재료비</div>
      <button class="btn" style="margin-top:6px;font-size:12px;padding:5px 12px;">⬇ 다운로드</button>
    </div>
    <div class="cl-dl-card gc" onclick="dlSAP()">
      <span class="cl-dl-tag gc">GC케어</span>
      <div class="cl-dl-name">GC케어 입고분 SAP 입력 양식</div>
      <div class="cl-dl-sheets">SAP 전표 입력 (거래처 관리 자동 반영) · 거래처 관리 시트</div>
      <button class="btn" style="margin-top:6px;font-size:12px;padding:5px 12px;">⬇ 다운로드</button>
    </div>
    <div class="cl-dl-card imed" onclick="dlSubul()">
      <span class="cl-dl-tag imed">아이메드→GC케어 제출</span>
      <div class="cl-dl-name">★ 아이메드 수불 집계표 ★</div>
      <div class="cl-dl-sheets">품목별 기초·증가·감소·기말 원가집계표</div>
      <button class="btn" style="margin-top:6px;font-size:12px;padding:5px 12px;">⬇ 다운로드</button>
    </div>
  `;
}

function renderPreview() {
  const filter = document.getElementById('previewFilter').value;
  let data = App.ipgoData;
  if (filter !== 'all') data = data.filter(r => r['구분'] === filter);
  const show = data.slice(0, 15);
  const cols = ['공급업체', '자재구분', '자재명', '입고일자', '수량', '공급가액', '부가세', '합계금액', '의뢰부서', '구분'];
  let html = '<table class="cl-preview"><thead><tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  show.forEach(r => {
    const tag = r['구분'] === 'GC케어' ? '<span class="cl-tag-gc">GC케어</span>' : '<span class="cl-tag-imed">아이메드</span>';
    html += `<tr>
      <td>${r['공급업체'] || ''}</td>
      <td>${r['자재구분'] || ''}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;">${r['자재명'] || ''}</td>
      <td>${r['입고일자'] || ''}</td>
      <td class="num">${toN(r['수량']).toLocaleString()}</td>
      <td class="num">${toN(r['공급가액']).toLocaleString()}</td>
      <td class="num">${toN(r['부가세']).toLocaleString()}</td>
      <td class="num">${toN(r['합계금액']).toLocaleString()}</td>
      <td>${r['의뢰부서'] || ''}</td>
      <td>${tag}</td>
    </tr>`;
  });
  if (data.length > 15) html += `<tr><td colspan="${cols.length}" class="more">외 ${data.length - 15}건 더 있음</td></tr>`;
  html += '</tbody></table>';
  document.getElementById('previewTable').innerHTML = html;
}

function restart() {
  App.ipgoRaw = null; App.usageRaw = null;
  App.ipgoData = []; App.usageData = []; App.R = {};
  ['ipgo', 'usage'].forEach(t => {
    document.getElementById('status-' + t).textContent = '';
    document.getElementById('zone-' + t).classList.remove('uploaded');
    // file input 초기화 (같은 파일 재선택 시 onchange 재발동)
    const inp = document.querySelector(`input[onchange*="${t}"]`);
    if (inp) inp.value = '';
  });
  document.getElementById('btnNext1').disabled = true;
  document.getElementById('logBox').innerHTML = '';
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressPct').textContent = '0%';
  document.getElementById('progressLabel').textContent = '';
  // 4단계 카드 초기화
  const confirmCard = document.getElementById('unregItemsCard');
  if (confirmCard) confirmCard.style.display = 'none';
  const vendorCard = document.getElementById('unregVendorsCard');
  if (vendorCard) vendorCard.style.display = 'none';
  const confirmBtn = document.getElementById('btnClosingConfirm');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = '✅ 마감 확정';
    confirmBtn.style.background = '#1d4ed8';
  }
  goStep(1);
}

// ═══════════════════════════════════════════════════════════
// 10. ExcelJS 서식 상수
// ═══════════════════════════════════════════════════════════
const F = {
  base:  { name: 'Calibri', size: 10 },
  bold:  { name: 'Calibri', size: 10, bold: true },
  hdr:   { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
  total: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
  title: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
  red:   { name: 'Calibri', size: 10, color: { argb: 'FFC00000' } },
  redb:  { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFC00000' } },
};
const FILL = {
  hdr:    { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8DB4E2' } },  // 중간 파란 (엑셀 기본 테마)
  total:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } },  // 진한 파란
  subtot: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } },  // 아주 연한 파란
  odd:    { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },  // 흰색
  even:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF5FB' } },  // 아주 연한 파란
  gc:     { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } },  // 연한 초록 (GC케어)
  imed:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },  // 연한 노랑 (아이메드)
  title:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17375E' } },  // 진한 네이비
  warn:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } },  // 노란 경고
};
const BORDER_THIN = {
  top: { style: 'thin', color: { argb: 'FFB8CCE4' } },
  left: { style: 'thin', color: { argb: 'FFB8CCE4' } },
  bottom: { style: 'thin', color: { argb: 'FFB8CCE4' } },
  right: { style: 'thin', color: { argb: 'FFB8CCE4' } },
};
const BORDER_TOTAL = {
  top: { style: 'medium', color: { argb: 'FF4F81BD' } },
  left: { style: 'medium', color: { argb: 'FF4F81BD' } },
  bottom: { style: 'medium', color: { argb: 'FF4F81BD' } },
  right: { style: 'medium', color: { argb: 'FF4F81BD' } },
};
const NUM_FMT = '#,##0';
const AL = (h, v) => ({ horizontal: h || 'left', vertical: v || 'center', wrapText: false });

// ── 셀 스타일 헬퍼 ────────────────────────────────────────
function sc(cell, { value, font, fill, alignment, border, numFmt } = {}) {
  if (value !== undefined) cell.value = value;
  if (font)      cell.font      = font;
  if (fill)      cell.fill      = fill;
  if (alignment) cell.alignment = alignment;
  if (border)    cell.border    = border;
  if (numFmt)    cell.numFmt    = numFmt;
}
function hdrCell(ws, r, c, v, span = 1) {
  const cell = ws.getCell(r, c);
  sc(cell, { value: v, font: F.hdr, fill: FILL.hdr, alignment: AL('center'), border: BORDER_THIN });
  if (span > 1) ws.mergeCells(r, c, r, c + span - 1);
  ws.getRow(r).height = 18;
}
function numCell(ws, r, c, v, fill, bold = false) {
  const nv = Math.round(toN(v));
  const cell = ws.getCell(r, c);
  sc(cell, {
    value: nv,  // 0도 표기
    font: nv < 0 ? (bold ? F.redb : F.red) : (bold ? F.total : F.base),
    fill: fill || FILL.odd,
    alignment: AL('right'),
    border: BORDER_THIN,
    numFmt: NUM_FMT,
  });
}
function txtCell(ws, r, c, v, fill, bold = false, center = false) {
  sc(ws.getCell(r, c), {
    value: v || null,
    font: bold ? F.bold : F.base,
    fill: fill || FILL.odd,
    alignment: AL(center ? 'center' : 'left'),
    border: BORDER_THIN,
  });
}
function titleRow(ws, r, c, v, span, rowH = 22) {
  const cell = ws.getCell(r, c);
  sc(cell, { value: v, font: F.title, fill: FILL.title, alignment: AL('center', 'center'), border: BORDER_THIN });
  if (span > 1) ws.mergeCells(r, c, r, c + span - 1);
  ws.getRow(r).height = rowH;
}
function totalRow(ws, r, numCols, numVals, textCols, textVals) {
  numCols.forEach((c, i) => {
    const cell = ws.getCell(r, c);
    sc(cell, { value: Math.round(toN(numVals[i])) || null, font: F.total, fill: FILL.total, alignment: AL('right'), border: BORDER_TOTAL, numFmt: NUM_FMT });
  });
  textCols.forEach((c, i) => {
    sc(ws.getCell(r, c), { value: textVals[i] || null, font: F.total, fill: FILL.total, alignment: AL('center'), border: BORDER_TOTAL });
  });
  ws.getRow(r).height = 18;
}
function subtotRow(ws, r, textCols, textVals, numCols, numVals) {
  textCols.forEach((c, i) => sc(ws.getCell(r, c), { value: textVals[i] || null, font: F.bold, fill: FILL.subtot, alignment: AL('center'), border: BORDER_THIN }));
  numCols.forEach((c, i) => { const cell = ws.getCell(r, c); sc(cell, { value: Math.round(toN(numVals[i])) || null, font: F.bold, fill: FILL.subtot, alignment: AL('right'), border: BORDER_THIN, numFmt: NUM_FMT }); });
  ws.getRow(r).height = 18;
}
function cw(ws, arr) { arr.forEach(([c, w]) => ws.getColumn(c).width = w); }

// ── 데이터 시트 공통 ──────────────────────────────────────
function writeDataSheet(ws, headers, rows, numCols, colWidths, sumCols) {
  const hasSumRow = sumCols && sumCols.length > 0;
  const hdrRow    = hasSumRow ? 2 : 1;
  const dataStart = hdrRow + 1;
  const numSet    = new Set(numCols);

  // 헤더
  headers.forEach((h, i) => hdrCell(ws, hdrRow, i + 1, h));

  // 데이터 (먼저 쓰면서 열합계 누적)
  const colTotals = {};
  rows.forEach((row, ri) => {
    const r    = dataStart + ri;
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    row.forEach((v, ci) => {
      const c = ci + 1;
      if (numSet.has(c)) {
        const rounded = Math.round(toN(v));
        if (hasSumRow && sumCols.includes(c)) {
          colTotals[c] = (colTotals[c] || 0) + rounded;
        }
        // 빈셀도 0 표기
        const cell = ws.getCell(r, c);
        cell.value = rounded;
        cell.font  = F.base;
        cell.fill  = fill;
        cell.alignment = AL('right');
        cell.border = BORDER_THIN;
        cell.numFmt = NUM_FMT;
      } else {
        txtCell(ws, r, c, v, fill);
      }
    });
    ws.getRow(r).height = 18;
  });

  // 1행: 반올림된 셀값의 합산
  if (hasSumRow) {
    sumCols.forEach(c => {
      const total = colTotals[c] || 0;
      if (!total) return;
      const cell  = ws.getCell(1, c);
      cell.value  = total;
      cell.font   = F.bold;
      cell.numFmt = NUM_FMT;
      cell.alignment = AL('right');
    });
    ws.getRow(1).height = 18;
  }

  colWidths.forEach((w, i) => ws.getColumn(i + 1).width = w);
  ws.views = [{ state: 'frozen', ySplit: hdrRow }];
}

// ── 피벗: 거래처 ──────────────────────────────────────────
function writePivotVendor(ws, gcVendors, imedVendors) {
  [[1, '구분'], [2, '공급업체'], [3, '합계 : 공급가액'], [4, '합계 : 부가세'], [5, '합계 : 합계금액']]
    .forEach(([c, v]) => hdrCell(ws, 1, c, v));
  let r = 2;
  let firstGC = true;
  gcVendors.forEach(v => {
    const fill = FILL.gc;
    txtCell(ws, r, 1, firstGC ? 'GC케어' : null, fill, firstGC);
    txtCell(ws, r, 2, v.공급업체, fill);
    [3, 4, 5].forEach((c, i) => numCell(ws, r, c, [v.공급가액, v.부가세, v.합계금액][i], fill));
    ws.getRow(r).height = 18; r++; firstGC = false;
  });
  const gcS = [sumF(gcVendors, '공급가액'), sumF(gcVendors, '부가세'), sumF(gcVendors, '합계금액')];
  subtotRow(ws, r, [1, 2], ['GC케어 요약', null], [3, 4, 5], gcS); r++;
  let firstIM = true;
  imedVendors.forEach(v => {
    const fill = FILL.imed;
    txtCell(ws, r, 1, firstIM ? '아이메드' : null, fill, firstIM);
    txtCell(ws, r, 2, v.공급업체, fill);
    [3, 4, 5].forEach((c, i) => numCell(ws, r, c, [v.공급가액, v.부가세, v.합계금액][i], fill));
    ws.getRow(r).height = 18; r++; firstIM = false;
  });
  const imS = [sumF(imedVendors, '공급가액'), sumF(imedVendors, '부가세'), sumF(imedVendors, '합계금액')];
  subtotRow(ws, r, [1, 2], ['아이메드 요약', null], [3, 4, 5], imS); r++;
  totalRow(ws, r, [3, 4, 5], [gcS[0] + imS[0], gcS[1] + imS[1], gcS[2] + imS[2]], [1, 2], ['총합계', null]);
  cw(ws, [[1, 14], [2, 22], [3, 18], [4, 16], [5, 18]]);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── 피벗: 부서/자재구분 ───────────────────────────────────
function writePivotDept(ws, data) {
  [[1, '의뢰부서'], [2, '자재구분'], [3, '합계 : 공급가액'], [4, '합계 : 부가세'], [5, '합계 : 합계금액']]
    .forEach(([c, v]) => hdrCell(ws, 1, c, v));

  const sorted = [...data].sort((a, b) => a.의뢰부서.localeCompare(b.의뢰부서, 'ko'));

  let r = 2, prev = null, groupStartRow = 2;
  sorted.forEach((d, ri) => {
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    const isNewGroup = d.의뢰부서 !== prev;

    // 이전 그룹 병합 + 정렬
    if (isNewGroup && prev !== null) {
      if (r - 1 > groupStartRow) ws.mergeCells(groupStartRow, 1, r - 1, 1);
      ws.getCell(groupStartRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    if (isNewGroup) groupStartRow = r;

    txtCell(ws, r, 1, isNewGroup ? d.의뢰부서 : null, fill, true);
    txtCell(ws, r, 2, d.자재구분, fill);
    [3, 4, 5].forEach((c, i) => numCell(ws, r, c, [d.공급가액, d.부가세, d.합계금액][i], fill));
    ws.getRow(r).height = 18; r++; prev = d.의뢰부서;
  });

  // 마지막 그룹 병합 + 정렬
  if (r - 1 > groupStartRow) ws.mergeCells(groupStartRow, 1, r - 1, 1);
  ws.getCell(groupStartRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  totalRow(ws, r, [3, 4, 5], [sumF(sorted, '공급가액'), sumF(sorted, '부가세'), sumF(sorted, '합계금액')], [1, 2], ['총합계', null]);
  cw(ws, [[1, 16], [2, 10], [3, 18], [4, 16], [5, 18]]);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── 피벗: 품목별 ──────────────────────────────────────────
function writePivotItem(ws, data, isUsage = false) {
  const q = isUsage ? '합계 : 사용수량(입)' : '합계 : 수량';
  const a = isUsage ? '합계 : 사용공급가' : '합계 : 공급가액';
  [[1, '자재코드'], [2, '자재명'], [3, q], [4, a]].forEach(([c, v]) => hdrCell(ws, 1, c, v));
  let r = 2;
  data.forEach((d, ri) => {
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    txtCell(ws, r, 1, d.코드, fill); txtCell(ws, r, 2, d.명, fill);
    numCell(ws, r, 3, d.수량, fill); numCell(ws, r, 4, d.금액, fill);
    ws.getRow(r).height = 18; r++;
  });
  totalRow(ws, r, [3, 4], [sumF(data, '수량'), sumF(data, '금액')], [1, 2], ['총합계', null]);
  cw(ws, [[1, 14], [2, 45], [3, 16], [4, 16]]);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── 피벗: 사용현황 부서별 ─────────────────────────────────
// 주의: 5% 시트는 byDeptUsage5pct로 이미 계산된 데이터를 넘겨야 함
function writePivotUsageDept(ws, data, cols3) {
  [[1, '부서명'], [2, '자재구분'], [3, cols3[0]], [4, cols3[1]], [5, cols3[2]]]
    .forEach(([c, v]) => hdrCell(ws, 1, c, v));

  const sorted = [...data].sort((a, b) => a.부서명.localeCompare(b.부서명, 'ko'));

  // 행 데이터 쓰면서 합계 누적 (반올림 후 합산)
  let r = 2, prev = null, groupStartRow = 2;
  const totals = { sup: 0, vat: 0, tot: 0 };
  sorted.forEach((d, ri) => {
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    const isNewGroup = d.부서명 !== prev;

    if (isNewGroup && prev !== null) {
      if (r - 1 > groupStartRow) ws.mergeCells(groupStartRow, 1, r - 1, 1);
      ws.getCell(groupStartRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    if (isNewGroup) groupStartRow = r;

    txtCell(ws, r, 1, isNewGroup ? d.부서명 : null, fill, true);
    txtCell(ws, r, 2, d.자재구분, fill);
    const supV = d.사용공급가;
    const vatV = d.사용부가세;
    const totV = d.사용합계;
    totals.sup += Math.round(supV);
    totals.vat += Math.round(vatV);
    totals.tot += Math.round(totV);
    numCell(ws, r, 3, supV, fill);
    numCell(ws, r, 4, vatV, fill);
    numCell(ws, r, 5, totV, fill);
    ws.getRow(r).height = 18; r++; prev = d.부서명;
  });

  if (r - 1 > groupStartRow) ws.mergeCells(groupStartRow, 1, r - 1, 1);
  ws.getCell(groupStartRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  totalRow(ws, r, [3, 4, 5], [totals.sup, totals.vat, totals.tot], [1, 2], ['총합계', null]);
  cw(ws, [[1, 16], [2, 10], [3, 18], [4, 16], [5, 18]]);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── 결재 시트 ─────────────────────────────────────────────
function writeKyuljai(ws, year, month, label, vendors, vendorMap) {
  const ym = `${year}/${String(month).padStart(2, '0')}/01 ~ ${year}/${String(month).padStart(2, '0')}/31`;

  // 1행: 제목 (A1~I3 병합, 가운데 정렬)
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${year}년 ${month}월 ${label} 마감내역`;
  titleCell.font      = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF000000' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(1, 1, 3, 9);
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 14;
  ws.getRow(3).height = 14;

  // 4행: 기준일
  const c4 = ws.getCell(4, 6); c4.value = `기준: ${ym}`; c4.font = F.base; c4.alignment = AL('right');
  ws.mergeCells(4, 6, 4, 9);
  ws.getRow(4).height = 18;
  [['순번', 1], ['공급업체', 2], ['사업자등록번호', 3], ['구매총액', 4], ['결제방법', 7], ['결제기일', 8], ['비고', 9]]
    .forEach(([v, c]) => hdrCell(ws, 5, c, v));
  ['', '', '', '공급가액', '부가세액', '합계금액', '', '', ''].forEach((v, i) => {
    const cell = ws.getCell(6, i + 1);
    cell.font = F.hdr; cell.fill = FILL.hdr; cell.alignment = AL('center'); cell.border = BORDER_THIN;
    if (v) cell.value = v;
  });
  [1, 2, 3, 7, 8, 9].forEach(c => ws.mergeCells(5, c, 6, c));
  ws.mergeCells(5, 4, 5, 6);
  ws.getRow(5).height = 18; ws.getRow(6).height = 18;
  let r = 7;
  vendors.forEach((v, i) => {
    const fill = i % 2 === 0 ? FILL.odd : FILL.even;
    const vm   = (vendorMap && vendorMap[v.공급업체]) || null;
    const isUnreg = !vm;
    const rowFill = isUnreg ? FILL.warn : fill;

    const bizNo     = vm ? vm.biz_no      : '';
    const payMethod = vm ? vm.pay_method  : '';
    const credit    = vm ? vm.credit_days : '';

    txtCell(ws, r, 1, i + 1, rowFill, false, true);
    txtCell(ws, r, 2, v.공급업체 + (isUnreg ? ' ⚠ 거래처 미등록' : ''), rowFill, isUnreg);
    txtCell(ws, r, 3, bizNo,     rowFill, false, true);
    numCell(ws, r, 4, v.공급가액, rowFill);
    numCell(ws, r, 5, v.부가세,   rowFill);
    numCell(ws, r, 6, v.합계금액, rowFill);
    txtCell(ws, r, 7, payMethod, rowFill, false, true);
    txtCell(ws, r, 8, credit,    rowFill, false, true);
    txtCell(ws, r, 9, '',        rowFill);
    ws.getRow(r).height = 18; r++;
  });
  ws.mergeCells(r, 1, r, 3);
  totalRow(ws, r, [4, 5, 6], [sumF(vendors, '공급가액'), sumF(vendors, '부가세'), sumF(vendors, '합계금액')],
    [1, 7, 8, 9], ['총합계', '', '', '']);
  cw(ws, [[1, 8], [2, 22], [3, 16], [4, 16], [5, 14], [6, 16], [7, 10], [8, 10], [9, 12]]);
  ws.views = [{ state: 'frozen', ySplit: 6 }];
}

// ── 부서별 금액 시트 ─────────────────────────────────────
function writeDeptAmount(ws, month, depts) {
  // 1행: 제목 (A~E 병합)
  ws.mergeCells(1, 1, 1, 5);
  const tc = ws.getCell(1, 1);
  tc.value = `${month}월 부서별 구매 내역`;
  tc.font      = { name: 'Calibri', size: 14, bold: true };
  tc.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // 2행: (단위 : 원) 우측
  ws.getCell(2, 5).value = '(단위 : 원)';
  ws.getCell(2, 5).font = F.base;
  ws.getCell(2, 5).alignment = AL('right');
  ws.getRow(2).height = 16;

  // 3행: 헤더
  [[1,'의뢰부서'],[2,'상태'],[3,'합계: 공급가액'],[4,'합계: 부가세'],[5,'합계: 합계금액']]
    .forEach(([c, v]) => hdrCell(ws, 3, c, v));
  ws.getRow(3).height = 18;

  // 정렬
  const sorted = [...depts].sort((a, b) => {
    const dc = a.의뢰부서.localeCompare(b.의뢰부서, 'ko');
    return dc !== 0 ? dc : a.자재구분.localeCompare(b.자재구분, 'ko');
  });

  // 부서별 그룹핑
  const groups = [];
  sorted.forEach(d => {
    const last = groups[groups.length - 1];
    if (last && last.name === d.의뢰부서) last.items.push(d);
    else groups.push({ name: d.의뢰부서, items: [d] });
  });

  let r = 4;
  groups.forEach((g, gi) => {
    const groupStart = r;
    g.items.forEach((d, di) => {
      const fill = gi % 2 === 0 ? FILL.odd : FILL.even;
      txtCell(ws, r, 1, di === 0 ? d.의뢰부서 : null, fill, di === 0);
      txtCell(ws, r, 2, d.자재구분, fill);
      numCell(ws, r, 3, d.공급가액, fill);
      numCell(ws, r, 4, d.부가세,   fill);
      numCell(ws, r, 5, d.합계금액, fill);
      ws.getRow(r).height = 18; r++;
    });
    // 의뢰부서 셀 병합
    if (r - 1 > groupStart) ws.mergeCells(groupStart, 1, r - 1, 1);
    ws.getCell(groupStart, 1).alignment = { horizontal: 'center', vertical: 'middle' };

    // 부서 요약 행 — mergeCells 먼저, 그 다음 값 직접 쓰기
    ws.mergeCells(r, 1, r, 2);
    const sc1 = ws.getCell(r, 1);
    sc1.value = g.name; sc1.font = F.bold; sc1.fill = FILL.subtot;
    sc1.alignment = { horizontal: 'center', vertical: 'middle' };
    sc1.border = BORDER_THIN;
    [3,4,5].forEach((c, i) => {
      const vals = [sumF(g.items,'공급가액'), sumF(g.items,'부가세'), sumF(g.items,'합계금액')];
      const cell = ws.getCell(r, c);
      cell.value = Math.round(vals[i]); cell.font = F.bold; cell.fill = FILL.subtot;
      cell.alignment = AL('right'); cell.border = BORDER_THIN; cell.numFmt = NUM_FMT;
    });
    ws.getRow(r).height = 18; r++;
  });

  // 전체 합계 행
  ws.mergeCells(r, 1, r, 2);
  const totCell = ws.getCell(r, 1);
  totCell.value = '합  계'; totCell.font = F.bold; totCell.fill = FILL.subtot;
  totCell.alignment = { horizontal: 'center', vertical: 'middle' };
  totCell.border = BORDER_THIN;
  [3,4,5].forEach((c,i) => {
    const vals = [sumF(sorted,'공급가액'), sumF(sorted,'부가세'), sumF(sorted,'합계금액')];
    const cell = ws.getCell(r, c);
    cell.value = Math.round(vals[i]); cell.font = F.bold; cell.fill = FILL.subtot;
    cell.alignment = AL('right'); cell.border = BORDER_THIN; cell.numFmt = NUM_FMT;
  });
  ws.getRow(r).height = 18; r++;

  // 총합계 - 원재료 / 소모품
  const 원재료 = sorted.filter(d => d.자재구분 === '시약' || d.자재구분 === '의약품');
  const 소모품 = sorted.filter(d => d.자재구분 === '소모품');
  [['원재료', 원재료], ['소모품', 소모품]].forEach(([label, data]) => {
    ws.mergeCells(r, 1, r, 2);
    const lc = ws.getCell(r, 1);
    lc.value = label; lc.font = F.total; lc.fill = FILL.total;
    lc.alignment = { horizontal: 'center', vertical: 'middle' };
    lc.border = BORDER_TOTAL;
    [3,4,5].forEach((c,i) => {
      const vals = [sumF(data,'공급가액'), sumF(data,'부가세'), sumF(data,'합계금액')];
      const cell = ws.getCell(r, c);
      cell.value = Math.round(vals[i]); cell.font = F.total; cell.fill = FILL.total;
      cell.alignment = AL('right'); cell.border = BORDER_TOTAL; cell.numFmt = NUM_FMT;
    });
    ws.getRow(r).height = 18; r++;
  });

  cw(ws, [[1,20],[2,10],[3,18],[4,16],[5,18]]);
  ws.views = [{ state: 'frozen', ySplit: 3 }];
}

// ── 사용현황 5% 시트 ─────────────────────────────────────
function writeUsageWith5pct(ws, headers, rows, numCols, colWidths) {
  const sumSet = new Set(numCols);

  // 2행: 헤더
  headers.forEach((h, i) => hdrCell(ws, 2, i + 1, h));

  // 3행~: 데이터 (먼저 쓰고 열합계 계산)
  const colTotals = {};
  rows.forEach((row, ri) => {
    const r    = ri + 3;
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    row.forEach((v, ci) => {
      const c = ci + 1;
      if (sumSet.has(c)) {
        const rounded = Math.round(toN(v));
        colTotals[c] = (colTotals[c] || 0) + rounded;
        // 빈셀도 0 표기
        const cell = ws.getCell(r, c);
        cell.value = rounded;
        cell.font  = F.base;
        cell.fill  = fill;
        cell.alignment = AL('right');
        cell.border = BORDER_THIN;
        cell.numFmt = NUM_FMT;
      } else {
        txtCell(ws, r, c, v, fill);
      }
    });
    ws.getRow(r).height = 18;
  });

  // 1행: 반올림된 셀값의 합산 (엑셀 표시값과 일치)
  sumSet.forEach(c => {
    const total = colTotals[c] || 0;
    if (!total) return;
    const cell  = ws.getCell(1, c);
    cell.value  = total;
    cell.font   = F.bold;
    cell.numFmt = NUM_FMT;
    cell.alignment = AL('right');
  });
  ws.getRow(1).height = 18;

  colWidths.forEach((w, i) => ws.getColumn(i + 1).width = w);
  ws.views = [{ state: 'frozen', ySplit: 2 }];
}

// ── SAP 시트 ─────────────────────────────────────────────
function writeSAP(ws, year, month, branch, sapRows, totalSup, cc, account, vendorMap) {
  ws.getCell(2, 4).value = account; ws.getCell(2, 4).font = F.bold;
  ws.getCell(2, 7).value = totalSup; ws.getCell(2, 7).font = F.bold; ws.getCell(2, 7).numFmt = NUM_FMT;
  ws.getCell(2, 10).value = '양식 기준'; ws.getCell(2, 10).font = F.base;
  ws.getCell(2, 12).value = cc; ws.getCell(2, 12).font = F.base;
  ws.getRow(2).height = 18;
  ['', '거래처', '사업자 번호', '계정', '', '', '공급가액', '', '기준일', '적요', '', 'CC', '지급일', '전표번호']
    .forEach((v, i) => { if (v) hdrCell(ws, 3, i + 1, v); });
  ws.getRow(3).height = 18;
  sapRows.forEach((r, ri) => {
    const row = ri + 4;
    const isUnreg = vendorMap && !vendorMap[r.거래처];
    const fill = isUnreg ? FILL.warn : (ri % 2 === 0 ? FILL.odd : FILL.even);
    txtCell(ws, row, 2, r.거래처, fill);
    txtCell(ws, row, 3, r.사업자번호 || '', fill);
    txtCell(ws, row, 4, r.계정 || account, fill, false, true);
    numCell(ws, row, 7, r.공급가액, fill);
    txtCell(ws, row, 9, r.기준일, fill, false, true);
    txtCell(ws, row, 10, r.적요, fill);
    txtCell(ws, row, 12, cc, fill, false, true);
    txtCell(ws, row, 13, r.지급일, fill, false, true);
    txtCell(ws, row, 14, r.전표번호 || '', fill);
    ws.getRow(row).height = 18;
  });
  cw(ws, [[1, 4], [2, 18], [3, 14], [4, 12], [5, 4], [6, 4], [7, 16], [8, 4], [9, 12], [10, 52], [11, 4], [12, 12], [13, 8], [14, 14]]);
  ws.views = [{ state: 'frozen', ySplit: 3 }];
}

// ── 거래처 관리 시트 ─────────────────────────────────────
function writeVendorMasterSheet(ws, vendors) {
  [['거래처명', 1], ['사업자등록번호', 2], ['여신기간(일)', 3], ['결제방법', 4]]
    .forEach(([v, c]) => hdrCell(ws, 1, c, v));
  vendors.forEach((v, ri) => {
    const r = ri + 2;
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    txtCell(ws, r, 1, v.vendor_name, fill);
    txtCell(ws, r, 2, v.biz_no, fill);
    numCell(ws, r, 3, v.credit_days, fill);
    txtCell(ws, r, 4, v.pay_method, fill, false, true);
    ws.getRow(r).height = 18;
  });
  cw(ws, [[1, 24], [2, 16], [3, 12], [4, 12]]);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── 수불 집계표 ───────────────────────────────────────────
function writeSubul(ws, year, month, branch, items) {
  titleRow(ws, 1, 1, '원가집계표', 13, 22);
  txtCell(ws, 2, 1, '회사명 : GC케어', null, true);
  txtCell(ws, 2, 14, '-VAT', null, false, true);
  [['품목코드', 1], ['품목명', 2], ['구분', 3], ['기초', 4], ['증가', 7], ['감소', 9], ['기말', 11]]
    .forEach(([v, c]) => hdrCell(ws, 3, c, v));
  ws.mergeCells(3, 4, 3, 6); ws.mergeCells(3, 7, 3, 8); ws.mergeCells(3, 9, 3, 10); ws.mergeCells(3, 11, 3, 13);
  ['', '', '', '수량', '단가', '금액', '수량', '금액', '수량', '금액', '수량', '단가', '금액']
    .forEach((v, i) => { const cell = ws.getCell(4, i + 1); cell.font = F.hdr; cell.fill = FILL.hdr; cell.alignment = AL('center'); cell.border = BORDER_THIN; if (v) cell.value = v; });
  [1, 2, 3].forEach(c => ws.mergeCells(3, c, 4, c));
  ws.getRow(3).height = 18; ws.getRow(4).height = 18;

  // 1. 자재코드 오름차순 → 구분 오름차순 정렬
  // 2. 기초·증가·감소 모두 0이면 제외
  const sorted = [...items]
    .filter(it => (it.기초 || 0) !== 0 || it.증가 !== 0 || it.감소 !== 0)
    .sort((a, b) => {
      const codeA = String(a.code || ''), codeB = String(b.code || '');
      if (codeA !== codeB) return codeA.localeCompare(codeB, 'ko');
      return String(a.type || '').localeCompare(String(b.type || ''), 'ko');
    });

  let r = 5;
  sorted.forEach((it, ri) => {
    const fill   = ri % 2 === 0 ? FILL.odd : FILL.even;
    const 기초   = it.기초 || 0;
    const 기초수량 = Math.round(it.기초수량 || 0);
    const 기말   = 기초 + it.증가 - it.감소;
    // 기말 수량 = 기초수량 + 증가수량 - 감소수량 (수량은 미집계이므로 기초수량 기반만 표기)
    const 기말수량 = 기초수량; // 당월 입고/사용 수량은 Raw에 없으므로 기초 그대로

    txtCell(ws, r, 1, it.code, fill);
    txtCell(ws, r, 2, it.name, fill);
    txtCell(ws, r, 3, it.type, fill, false, true);
    if (기초   !== 0) numCell(ws, r, 6,  기초,     fill);
    if (기초수량 !== 0) numCell(ws, r, 4,  기초수량,  fill);
    if (it.증가 !== 0) numCell(ws, r, 8,  it.증가,  fill);
    if (it.감소 !== 0) numCell(ws, r, 10, it.감소,  fill);
    numCell(ws, r, 13, 기말, fill);
    if (기말수량 !== 0) numCell(ws, r, 11, 기말수량, fill);
    ws.getRow(r).height = 18; r++;
  });

  const t기초 = sorted.reduce((s, it) => s + (it.기초 || 0), 0);
  const tI    = sorted.reduce((s, it) => s + it.증가, 0);
  const tD    = sorted.reduce((s, it) => s + it.감소, 0);
  ws.mergeCells(r, 1, r, 3);
  totalRow(ws, r, [6, 8, 10, 13], [t기초, tI, tD, t기초 + tI - tD], [1], ['총합계']);
  cw(ws, [[1, 14], [2, 42], [3, 8], [4, 8], [5, 8], [6, 12], [7, 8], [8, 14], [9, 8], [10, 14], [11, 8], [12, 8], [13, 14]]);
  ws.views = [{ state: 'frozen', ySplit: 4 }];
}

// ═══════════════════════════════════════════════════════════
// 11. 다운로드 함수
// ═══════════════════════════════════════════════════════════
function newWb() { return new ExcelJS.Workbook(); }
async function saveWb(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

async function dlIpgo() {
  try {
    showGlobalLoading('입고 편집본 생성 중...');
    const R = App.R; const wb = newWb();
    const ic = ['공급업체', '구매번호', '자재구분', '자재코드', '자재명', '상태', '입고일자', '수량', '단가', '공급가액', '부가세', '합계금액', '규격', '산출단위', '입고단위', '의뢰부서', '구분'];
    const iw = [16, 14, 8, 12, 40, 8, 12, 8, 12, 14, 12, 14, 10, 8, 8, 14, 10];
    const in_ = [8, 9, 10, 11, 12];
    writePivotVendor(wb.addWorksheet('거래처 요약'), R.gcVendors, R.imedVendors);
    writeDataSheet(wb.addWorksheet('입고원본'), ic, [...R.gcIpgo, ...R.imedIpgo].map(d => ic.map(c => d[c] || '')), in_, iw);
    writeDataSheet(wb.addWorksheet('GC케어 입고분'), ic, R.gcIpgo.map(d => ic.map(c => d[c] || '')), in_, iw);
    writePivotItem(wb.addWorksheet('원가집계표 요약'), R.itemIpgoPivot, false);
    writePivotDept(wb.addWorksheet('GC케어 마감요약'), R.gcDepts);
    writeDataSheet(wb.addWorksheet('아이메드 입고분'), ic, R.imedIpgo.map(d => ic.map(c => d[c] || '')), in_, iw);
    writePivotDept(wb.addWorksheet('아이메드 마감요약'), R.imedDepts);
    await saveWb(wb, `${R.y.slice(2)}년 ${R.m}월 입고 - ${R.branch}.xlsx`);
  } finally {
    await hideGlobalLoading();
  }
}

async function dlUsage() {
  try {
    showGlobalLoading('사용현황 편집본 생성 중...');
    const R = App.R; const wb = newWb();
    const uc  = ['부서명', '자재구분', '자재코드', '자재명', '구매번호', '사용일자', '사용수량(입)', '사용수량(산)', '사용공급가', '사용부가세', '사용합계', '공급업체', '규격'];
    const uw  = [14, 8, 12, 40, 14, 12, 10, 10, 14, 12, 14, 16, 10];
    const un  = [7, 8, 9, 10, 11];
    // 사용원본/의약품: 1행 합계 컬럼 = 사용공급가(9), 사용부가세(10), 사용합계(11)
    const uSumCols = [9, 10, 11];

    const uc5 = ['부서명', '자재구분', '자재코드', '자재명', '구매번호', '사용일자', '사용수량(입)', '사용수량(산)', '사용공급가', '공5%', '사용부가세', '부5%', '사용합계', '계5%', '공급업체', '규격'];
    const uw5 = [14, 8, 12, 40, 14, 12, 10, 10, 14, 12, 12, 10, 14, 12, 16, 10];
    const un5 = [7, 8, 9, 10, 11, 12, 13, 14];
    const roundUp = v => Math.ceil(toN(v) * 1.05);  // ROUNDUP(*1.05, 0)
    const make5 = d => {
      const sup5 = roundUp(d['사용공급가']);
      const vat5 = roundUp(d['사용부가세']);
      return [d['부서명'], d['자재구분'], d['자재코드'], d['자재명'], d['구매번호'], d['사용일자'],
        toN(d['사용수량(입)']), toN(d['사용수량(산)']),
        toN(d['사용공급가']), sup5,
        toN(d['사용부가세']), vat5,
        toN(d['사용합계']), sup5 + vat5,  // 계5% = 공5% + 부5%
        d['공급업체'], d['규격']];
    };

    // 사용원본: 1행에 합계
    writeDataSheet(wb.addWorksheet('사용원본'), uc, App.usageData.map(d => uc.map(c => d[c] || '')), un, uw, uSumCols);
    // 시약·소모품/소모품/시약: 1행에 합계 (공급가9, 공5%10, 부가세11, 부5%12, 합계13, 계5%14)
    writeUsageWith5pct(wb.addWorksheet('시약, 소모품'), uc5, R.usageGC.map(make5), un5, uw5);
    writePivotItem(wb.addWorksheet('원가집계표 요약'), R.itemUsagePivot, true);
    writeUsageWith5pct(wb.addWorksheet('소모품'), uc5, R.usageSomoum.map(make5), un5, uw5);
    writeUsageWith5pct(wb.addWorksheet('시약'), uc5, R.usageSiyak.map(make5), un5, uw5);
    writePivotUsageDept(wb.addWorksheet('시약 마감요약'),      R.siyakPivot,     ['합계 : 사용공급가', '합계 : 사용부가세', '합계 : 사용합계'], false);
    writePivotUsageDept(wb.addWorksheet('시약5%'),            R.siyakPivot5,    ['합계 : 공5%',       '합계 : 부5%',       '합계 : 계5%'],    false);
    writeDataSheet(wb.addWorksheet('의약품'), uc, R.usageImed.map(d => uc.map(c => d[c] || '')), un, uw, uSumCols);
    writePivotUsageDept(wb.addWorksheet('아이메드 마감요약(시, 소)'), R.imedSiSoPivot5, ['합계 : 공5%',       '합계 : 부5%',       '합계 : 계5%'],    false);
    writePivotUsageDept(wb.addWorksheet('아이메드 마감요약(의약품)'), R.imedDrugPivot,  ['합계 : 사용공급가', '합계 : 사용부가세', '합계 : 사용합계'], false);
    await saveWb(wb, `${R.y.slice(2)}년 ${R.m}월 사용현황 - ${R.branch}.xlsx`);
  } finally {
    await hideGlobalLoading();
  }
}

async function dlReport(label, vendors, depts, filename) {
  const R = App.R; const wb = newWb();
  writeKyuljai(wb.addWorksheet(`${R.m}월결재`), R.y, R.m, label, vendors, R.vendorMap);
  writeDeptAmount(wb.addWorksheet(`${R.m}월 부서별 금액`), R.m, depts);

  const user = window.auth?.getSession?.();
  const prevDate = new Date(parseInt(R.y), R.m - 2, 1);
  const prevYm   = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevStockData = await loadPrevStock(prevYm, R.branch);
  writeWonjaeryo(wb.addWorksheet(`원재료비 ${R.y.slice(2)}년 ${R.m}월`), R, prevStockData, label);

  // 연간 사용 데이터 로드 (DB 전체) + 당월 추가
  const yearUsage = await loadYearUsage(null, R.branch, user);
  writeWonjaeryoYear(wb.addWorksheet(`${R.y}년도 원재료비`), R, yearUsage, label);

  await saveWb(wb, filename);
}
async function dlGCReport() {
  try {
    showGlobalLoading('GC케어 보고서 생성 중...');
    const R = App.R;
    await dlReport('시약 및 소모품', R.gcVendors, R.gcDepts, `${R.y.slice(2)}년 ${R.m}월 거래처 구매 내역 및 원재료 보고 - GC케어 - ${R.branch}.xlsx`);
  } finally {
    await hideGlobalLoading();
  }
}
async function dlImedReport() {
  try {
    showGlobalLoading('아이메드 보고서 생성 중...');
    const R = App.R;
    await dlReport('원재료 및 소모품', R.imedVendors, R.imedDepts, `${R.y.slice(2)}년 ${R.m}월 거래처 구매 내역 및 원재료 보고 - 아이메드 - ${R.branch}.xlsx`);
  } finally {
    await hideGlobalLoading();
  }
}

async function dlSAP() {
  try {
    showGlobalLoading('SAP 입력 양식 생성 중...');
    const R = App.R; const wb = newWb();
    const totalSup = R.gcIpgo.reduce((s, r) => s + toN(r['공급가액']), 0);
    writeSAP(wb.addWorksheet(`GC케어 SAP 입고 - ${R.y.slice(2)}년 ${R.m}월 - ${R.branch}`),
      R.y, R.m, R.branch, R.sapRows, totalSup, R.cc, R.account, R.vendorMap);
    writeVendorMasterSheet(wb.addWorksheet('거래처 관리'), App.vendors);
    await saveWb(wb, `${R.y.slice(2)}년 ${R.m}월 GC케어 입고분 SAP 입력 양식 - ${R.branch}.xlsx`);
  } finally {
    await hideGlobalLoading();
  }
}

async function dlSubul() {
  try {
    showGlobalLoading('수불 집계표 생성 중...');
    const R = App.R; const wb = newWb();
    writeSubul(wb.addWorksheet(`원가집계표-${R.y.slice(2)}년 ${R.m}월 ${R.branch}`),
      R.y, R.m, R.branch, Object.values(R.subulMap));
    await saveWb(wb, `★ ${R.y.slice(2)}년도 ${R.m}월 아이메드 수불 - GC케어 제출용 ★ ${R.branch}.xlsx`);
  } finally {
    await hideGlobalLoading();
  }
}

async function downloadAll() {
  try {
    showGlobalLoading('전체 산출물 생성 중...');
    const R = App.R; 
    // 스피너는 유지한 채 순차 생성
    const wb1 = newWb();
    const ic = ['공급업체', '구매번호', '자재구분', '자재코드', '자재명', '상태', '입고일자', '수량', '단가', '공급가액', '부가세', '합계금액', '규격', '산출단위', '입고단위', '의뢰부서', '구분'];
    const iw = [16, 14, 8, 12, 40, 8, 12, 8, 12, 14, 12, 14, 10, 8, 8, 14, 10];
    const in_ = [8, 9, 10, 11, 12];
    writePivotVendor(wb1.addWorksheet('거래처 요약'), R.gcVendors, R.imedVendors);
    writeDataSheet(wb1.addWorksheet('입고원본'), ic, [...R.gcIpgo, ...R.imedIpgo].map(d => ic.map(c => d[c] || '')), in_, iw);
    writeDataSheet(wb1.addWorksheet('GC케어 입고분'), ic, R.gcIpgo.map(d => ic.map(c => d[c] || '')), in_, iw);
    writePivotItem(wb1.addWorksheet('원가집계표 요약'), R.itemIpgoPivot, false);
    writePivotDept(wb1.addWorksheet('GC케어 마감요약'), R.gcDepts);
    writeDataSheet(wb1.addWorksheet('아이메드 입고분'), ic, R.imedIpgo.map(d => ic.map(c => d[c] || '')), in_, iw);
    writePivotDept(wb1.addWorksheet('아이메드 마감요약'), R.imedDepts);
    await saveWb(wb1, `${R.y.slice(2)}년 ${R.m}월 입고 - ${R.branch}.xlsx`);
    await sleep(200);

    // 나머지는 개별 함수 재사용 (각 함수 내부 스피너는 hideGlobalLoading 하지 않도록 플래그 없이 직접 호출)
    await hideGlobalLoading();
    await dlUsage();   await sleep(200);
    await dlGCReport(); await sleep(200);
    await dlImedReport(); await sleep(200);
    await dlSAP();     await sleep(200);
    await dlSubul();
  } catch(e) {
    await hideGlobalLoading();
    showMessage('전체 다운로드 중 오류: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// 12. 지점명 드롭다운 (ORG_CLINIC)
// ═══════════════════════════════════════════════════════════
async function loadBranchOptions(user) {
  const sel = document.getElementById('inputBranch');
  if (!sel) return;

  let clinics = [];
  try {
    const res = await apiGet('getCodes', {
      request_user_email: user?.email,
      code_group: 'ORG_CLINIC',
    });
    const data = res.data || res || [];
    clinics = Array.isArray(data)
      ? data
          .filter(c => String(c.use_yn || 'Y').toUpperCase() === 'Y')
          .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
          .map(c => ({ value: c.code_name, label: c.code_name }))
      : [];
  } catch (e) {
    clinics = [];
  }

  // API 실패 또는 목록 없으면 소속 의원만 표시
  if (!clinics.length) {
    const fallback = user?.clinic_name || user?.org_name || '서울숲의원';
    clinics = [{ value: fallback, label: fallback }];
  }

  // 소속 의원 기본 선택
  const defaultBranch = user?.clinic_name || clinics[0]?.value || '';
  sel.innerHTML = clinics.map(c =>
    `<option value="${c.value}"${c.value === defaultBranch ? ' selected' : ''}>${c.label}</option>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════
// 13. 수불 기초 재고 (closing_stock API 연동)
// ═══════════════════════════════════════════════════════════

// 전월 기말 재고 로드 → subulMap 기초값으로 세팅
async function loadPrevStock(ym, branch) {
  try {
    const user = window.auth?.getSession?.();
    const res  = await apiGet('closingGetStock', {
      request_user_email: user?.email,
      ym,
      branch,
    });
    const data = Array.isArray(res.data) ? res.data : [];
    clog(`전월 재고 API 응답: ym=${ym}, branch=${branch}, 결과=${data.length}건`, data.length ? 'ok' : 'warn');
    if (!data.length) clog(`전월 재고 없음 — 요청 파라미터 확인: ym="${ym}" branch="${branch}"`, 'warn');
    return data;
  } catch (e) {
    clog(`전월 재고 로드 오류: ${e.message}`, 'error');
    return [];
  }
}

// 당월 부서별 사용 집계 (마감 확정 시 저장용)
function buildDeptUsageForMonthly(R) {
  const m = {};
  // GC케어: 시약 + 소모품
  [...R.usageSiyak, ...R.usageSomoum].forEach(r => {
    const dept = String(r['부서명'] || '').trim(); if (!dept) return;
    const type = String(r['자재구분'] || '').trim();
    const k = dept + '||' + type;
    if (!m[k]) m[k] = { dept, item_type: type, usage_amount: 0 };
    m[k].usage_amount += toN(r['사용공급가']);
  });
  // 아이메드: 의약품
  R.usageImed.forEach(r => {
    const dept = String(r['부서명'] || '').trim(); if (!dept) return;
    const type = String(r['자재구분'] || '').trim();
    const k = dept + '||' + type;
    if (!m[k]) m[k] = { dept, item_type: type, usage_amount: 0 };
    m[k].usage_amount += toN(r['사용공급가']);
  });
  return Object.values(m).map(v => ({
    ...v,
    usage_amount: Math.round(v.usage_amount),
  }));
}

// 연도별 사용 데이터 조회
async function loadYearUsage(year, branch, user) {
  try {
    const res = await apiGet('closingGetUsageMonthly', {
      request_user_email: user?.email,
      year,
      branch,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    return [];
  }
}
// 연도 전체 closing_stock 조회
async function loadYearStock(year, branch, user) {
  try {
    const res = await apiGet('closingGetStock', {
      request_user_email: user?.email,
      year,
      branch,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    return [];
  }
}

// ── 3번째 시트: 원재료비 월별 ─────────────────────────────
function writeWonjaeryo(ws, R, prevStockData, label) {
  const isGC = label.includes('시약');  // GC케어=시약, 아이메드=원재료

  // 제목 (A1~F1 병합)
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${R.m}월 원재료비 - ${R.branch} 납품`;
  titleCell.font = { name: 'Calibri', size: 13, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(1, 1, 1, 6); ws.getRow(1).height = 24;

  // (단위:원/ -VAT) — F2
  const unitCell = ws.getCell(2, 6);
  unitCell.value = '(단위:원/ -VAT)'; unitCell.font = F.base; unitCell.alignment = AL('right');
  ws.getRow(2).height = 16;

  // 헤더
  [['구분', 1], ['기초재고', 2], ['당기매입', 3], ['당기사용', 4], ['기말재고', 5], ['비고', 6]]
    .forEach(([v, c]) => hdrCell(ws, 3, c, v));
  ws.getRow(3).height = 18;

  // 기초재고: 부서별, 시약(GC케어) 또는 의약품(아이메드)만
  const targetType = isGC ? '시약' : '의약품';
  const prevDeptStock = {};
  prevStockData
    .filter(s => !s.item_type || s.item_type === targetType)
    .forEach(s => {
      const dept = s.dept || '';
      const type = s.item_type || targetType;
      if (!prevDeptStock[dept + '||' + type]) prevDeptStock[dept + '||' + type] = 0;
      prevDeptStock[dept + '||' + type] += toN(s.closing_amount);
    });
  clog(`기초재고 집계: ${JSON.stringify(Object.keys(prevDeptStock))}`, 'info');

  // 당기매입: 입고 데이터 부서별 집계 — 시약만
  const ipgoData  = isGC ? R.gcIpgo.filter(r => String(r['자재구분']||'').trim() === '시약')
                         : R.imedIpgo.filter(r => String(r['자재구분']||'').trim() === '의약품');
  const usageData = isGC ? R.usageSiyak : R.usageImed;

  const deptIpgo = {};
  ipgoData.forEach(r => {
    const dept = String(r['의뢰부서'] || '').trim(); if (!dept) return;
    const type = String(r['자재구분'] || '').trim();
    const k = dept + '||' + type;
    if (!deptIpgo[k]) deptIpgo[k] = { dept, type, amt: 0 };
    deptIpgo[k].amt += toN(r['공급가액']);
  });

  // 당기사용: 사용현황 부서별 집계
  const deptUsage = {};
  usageData.forEach(r => {
    const dept = String(r['부서명'] || '').trim(); if (!dept) return;
    const type = String(r['자재구분'] || '').trim();
    const k = dept + '||' + type;
    if (!deptUsage[k]) deptUsage[k] = { dept, type, amt: 0 };
    deptUsage[k].amt += toN(r['사용공급가']);
  });

  // 부서 목록 (입고+사용 합집합, 가나다순)
  const deptKeys = [...new Set([
    ...Object.keys(deptIpgo),
    ...Object.keys(deptUsage),
    ...Object.keys(prevDeptStock),
  ])].sort((a, b) => a.localeCompare(b, 'ko'));

  let r = 4;
  let totBase = 0, totBuy = 0, totUse = 0, totEnd = 0;

  deptKeys.forEach((k, ri) => {
    const fill  = ri % 2 === 0 ? FILL.odd : FILL.even;
    const parts = k.split('||');
    const dept  = parts[0], type = parts[1];
    const base  = toN(prevDeptStock[k]);
    const buy   = toN(deptIpgo[k]?.amt);
    const use   = toN(deptUsage[k]?.amt);
    const end   = base + buy - use;

    totBase += Math.round(base);
    totBuy  += Math.round(buy);
    totUse  += Math.round(use);
    totEnd  += Math.round(end);

    txtCell(ws, r, 1, dept, fill);
    numCell(ws, r, 2, base, fill);
    numCell(ws, r, 3, buy,  fill);
    numCell(ws, r, 4, use,  fill);
    numCell(ws, r, 5, end,  fill);
    txtCell(ws, r, 6, `${dept} - ${type}`, fill);
    ws.getRow(r).height = 18; r++;
  });

  // 계 행
  subtotRow(ws, r, [1], ['계'], [2, 3, 4, 5], [totBase, totBuy, totUse, totEnd]);
  // 비고 셀(F열)도 소계 색으로 채우기
  const bigoCell = ws.getCell(r, 6);
  bigoCell.fill   = FILL.subtot;
  bigoCell.border = BORDER_THIN;
  ws.getRow(r).height = 18;

  cw(ws, [[1, 20], [2, 16], [3, 16], [4, 16], [5, 16], [6, 24]]);
  ws.views = [{ state: 'frozen', ySplit: 3 }];
}

// ── 4번째 시트: 연간 원재료비 ────────────────────────────
function writeWonjaeryoYear(ws, R, yearUsage, label) {
  const isGC       = label.includes('시약');
  const targetType = isGC ? '시약' : '의약품';  // 시약만 / 의약품만

  // DB 데이터를 연도별 → dept||type → 월별 맵으로 변환
  const yearMap = {};  // key: year, value: { dept||type: { m01..m12 } }
  yearUsage
    .filter(u => u.item_type === targetType)
    .forEach(u => {
      const parts = (u.ym || '').split('-');
      const yr  = parts[0];
      const mon = parts[1];
      if (!yr || !mon) return;
      const k = (u.dept || '') + '||' + u.item_type;
      if (!yearMap[yr]) yearMap[yr] = {};
      if (!yearMap[yr][k]) yearMap[yr][k] = { dept: u.dept, type: u.item_type };
      yearMap[yr][k]['m' + mon] = (yearMap[yr][k]['m' + mon] || 0) + Math.round(u.usage_amount / 1000);
    });

  // 당월 데이터도 추가 (미확정 시 대비)
  const curMon = String(R.m).padStart(2, '0');
  const curYr  = R.y;
  buildDeptUsageForMonthly(R)
    .filter(u => u.item_type === targetType)
    .forEach(u => {
      const k = (u.dept || '') + '||' + u.item_type;
      if (!yearMap[curYr]) yearMap[curYr] = {};
      if (!yearMap[curYr][k]) yearMap[curYr][k] = { dept: u.dept, type: u.item_type };
      if (!yearMap[curYr][k]['m' + curMon]) {
        yearMap[curYr][k]['m' + curMon] = Math.round(u.usage_amount / 1000);
      }
    });

  const years  = Object.keys(yearMap).sort((a, b) => b.localeCompare(a));  // 최신연도 먼저
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];

  let r = 1;
  years.forEach(yr => {
    const data = yearMap[yr];
    const deptKeys = Object.keys(data).sort((a, b) => a.localeCompare(b, 'ko'));

    // 연도 제목 행
    ws.getCell(r, 1).value = `■ ${yr}년도 원재료비`;
    ws.getCell(r, 1).font  = { name: 'Calibri', size: 12, bold: true };
    ws.mergeCells(r, 1, r, 16);
    ws.getCell(r, 16).value = '(단위 : 천원)';
    ws.getCell(r, 16).font  = F.base;
    ws.getCell(r, 16).alignment = AL('right');
    ws.getRow(r).height = 22; r++;

    // 헤더
    ['구   분', '기초', '1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월','기말','비고']
      .forEach((v, i) => hdrCell(ws, r, i + 1, v));
    ws.getRow(r).height = 18; r++;

    const colTotals = {};
    deptKeys.forEach((k, ri) => {
      const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
      const d    = data[k];
      txtCell(ws, r, 1, d.dept || '', fill);
      numCell(ws, r, 2, 0, fill);  // 기초
      months.forEach((mon, mi) => {
        const v = d['m' + mon] || 0;
        colTotals[mi + 3] = (colTotals[mi + 3] || 0) + v;
        numCell(ws, r, mi + 3, v, fill);
      });
      numCell(ws, r, 15, 0, fill);  // 기말
      txtCell(ws, r, 16, `${d.dept} - ${d.type}`, fill);
      ws.getRow(r).height = 18; r++;
    });

    // 소계
    subtotRow(ws, r, [1], ['소  계'],
      [2, ...months.map((_, i) => i + 3), 15],
      [0, ...months.map((_, i) => colTotals[i + 3] || 0), 0]
    );
    // 소계 비고 셀 색상
    const sc = ws.getCell(r, 16);
    sc.fill = FILL.subtot; sc.border = BORDER_THIN;
    ws.getRow(r).height = 18; r++;

    r++;  // 연도 블록 사이 빈 행
  });

  const colWidths = [[1, 22], [2, 10]];
  months.forEach((_, i) => colWidths.push([i + 3, 9]));
  colWidths.push([15, 10], [16, 22]);
  cw(ws, colWidths);
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 0 }];
}

  // 제목
  ws.getCell(1, 1).value = `■ ${R.y}년도 원재료비`;
  ws.getCell(1, 1).font = { name: 'Calibri', size: 12, bold: true };
  ws.getCell(1, 16).value = '(단위 : 천원)';
  ws.getCell(1, 16).font = F.base;
  ws.getCell(1, 16).alignment = AL('right');
  ws.mergeCells(1, 1, 1, 16); ws.getRow(1).height = 22;

// 마감 확정: 현재 subulMap 기말값 → DB 저장
async function confirmClosing() {
  const R   = App.R;
  const btn = document.getElementById('btnClosingConfirm');
  const statusEl = document.getElementById('closingConfirmStatus');
  const ym  = `${R.y}-${String(R.m).padStart(2, '0')}`;
  const prevDate = new Date(parseInt(R.y), R.m - 2, 1);
  const prevYm   = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  // 이미 확정된 데이터 있는지 체크 (branch 기준)
  try {
    showGlobalLoading('기존 확정 데이터 확인 중...');
    const user = window.auth?.getSession?.();
    const res  = await apiGet('closingGetStock', {
      request_user_email: user?.email,
      ym,
      branch: R.branch,
    });
    await hideGlobalLoading();

    const exists = Array.isArray(res.data) && res.data.length > 0;
    if (exists) {
      const confirmed = confirm(
        `${R.branch} ${R.y}년 ${R.m}월 마감 확정 데이터가 이미 존재합니다.\n덮어쓰시겠습니까?`
      );
      if (!confirmed) return;
    }
  } catch (e) {
    await hideGlobalLoading();
  }

  try {
    showGlobalLoading('마감 확정 저장 중...');
    const user  = window.auth?.getSession?.();

    // 품목코드 기준으로 기말 저장 (부서별 집계는 시트 생성 시 Raw에서 계산)
    const items = Object.values(R.subulMap).map(it => ({
      dept:           '',
      item_code:      it.code,
      item_name:      it.name,
      item_type:      it.type,
      closing_qty:    (it.기초수량 || 0),
      closing_amount: Math.round((it.기초 || 0) + it.증가 - it.감소),
    }));

    await apiPost('closingSaveStock', {
      request_user_email: user?.email,
      branch: R.branch,
      ym,
      items,
    });

    // 당월 부서별 사용 데이터 저장 (4번째 시트용)
    const usageItems = buildDeptUsageForMonthly(R);
    await apiPost('closingSaveUsageMonthly', {
      request_user_email: user?.email,
      branch: R.branch,
      ym,
      items: usageItems,
    });

    btn.disabled    = true;
    btn.textContent = '✓ 확정 완료';
    btn.style.background = '#0e7c3a';
    const now = new Date().toLocaleString('ko-KR');
    statusEl.textContent = `✓ ${R.branch} ${R.y}년 ${R.m}월 마감이 확정됐습니다. (${now})`;
    showMessage(`${R.branch} ${R.y}년 ${R.m}월 마감이 확정됐습니다. 품목 ${items.length}건 저장됨.`, 'success');
  } catch (e) {
    showMessage('마감 확정 중 오류: ' + e.message, 'error');
  } finally {
    await hideGlobalLoading();
  }
}

// ═══════════════════════════════════════════════════════════
// 14. 거래처 관리 (API 연동)
// ═══════════════════════════════════════════════════════════
async function loadVendorsFromServer() {
  try {
    const user = window.auth?.getSession?.();
    const res  = await apiGet('closingGetVendors', { request_user_email: user?.email });
    App.vendors = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    // 서버 오류 시 빈 배열 유지, 조용히 처리
    App.vendors = [];
  }
}

function renderVendorTable() {
  const tbody = document.getElementById('vendorTbody');
  if (!tbody) return;

  if (!App.vendors.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">등록된 거래처가 없습니다. [+ 행 추가] 또는 [엑셀 업로드]를 이용하세요.</td></tr>`;
    return;
  }

  tbody.innerHTML = App.vendors.map((v, i) => `
    <tr>
      <td><input type="text" value="${escHtml(v.vendor_name || '')}" data-idx="${i}" data-field="vendor_name" onchange="vendorEdit(this)"></td>
      <td><input type="text" value="${escHtml(v.biz_no || '')}" data-idx="${i}" data-field="biz_no" onchange="vendorEdit(this)"></td>
      <td style="text-align:center;"><input type="number" value="${v.credit_days ?? 90}" data-idx="${i}" data-field="credit_days" min="0" style="width:70px;text-align:center;" onchange="vendorEdit(this)"></td>
      <td style="text-align:center;">
        <select data-idx="${i}" data-field="pay_method" onchange="vendorEdit(this)">
          <option ${v.pay_method === '현금결제' ? 'selected' : ''}>현금결제</option>
          <option ${v.pay_method === '어음결제' ? 'selected' : ''}>어음결제</option>
          <option ${v.pay_method === '카드결제' ? 'selected' : ''}>카드결제</option>
        </select>
      </td>
      <td style="text-align:center;"><button onclick="deleteVendor(${i})" style="background:none;border:none;cursor:pointer;color:#c0392b;font-size:16px;" title="삭제">🗑</button></td>
    </tr>
  `).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function vendorEdit(el) {
  const idx   = parseInt(el.dataset.idx);
  const field = el.dataset.field;
  const val   = field === 'credit_days' ? (parseInt(el.value) || 0) : el.value;
  App.vendors[idx][field] = val;
  App.vendorsDirty = true;
}

function addVendorRow() {
  App.vendors.push({ vendor_name: '', biz_no: '', credit_days: 90, pay_method: '현금결제' });
  App.vendorsDirty = true;
  renderVendorTable();
  const lastRow = document.getElementById('vendorTbody').lastElementChild;
  lastRow?.querySelector('input')?.focus();
}

// ═══════════════════════════════════════════════════════════
// 13. 거래처 엑셀 업로드
// ═══════════════════════════════════════════════════════════

// 템플릿 다운로드
function downloadVendorTemplate() {
  const wb = XLSX.utils.book_new();
  const headers = ['거래처명 *', '사업자등록번호 *', '여신기간(일)', '결제방법'];
  const sample  = [
    ['GC메디아이', '2018155688', 90, '현금결제'],
    ['녹십자MS(주)', '1358167475', 90, '현금결제'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  // 컬럼 너비
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, '거래처마스터');
  XLSX.writeFile(wb, '거래처마스터_템플릿.xlsx');
}

// 엑셀 파일 선택 시 파싱 → 미리보기
let _uploadedVendorRows = [];

async function handleVendorExcel(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = ''; // 같은 파일 재선택 허용

  try {
    showGlobalLoading('파일을 분석하는 중...');
    _uploadedVendorRows = await parseVendorExcel(file);
    renderVendorUploadPreview(_uploadedVendorRows);
  } catch (err) {
    showMessage('파일 읽기 오류: ' + err.message, 'error');
  } finally {
    await hideGlobalLoading();
  }
}

function parseVendorExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const raw  = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!raw.length) { reject(new Error('데이터가 없습니다.')); return; }

        // 헤더 정규화 (* 제거, 공백 trim)
        const rows = raw.map((rawRow, idx) => {
          const norm = {};
          Object.entries(rawRow).forEach(([k, v]) => {
            norm[k.replace(/\s*\*$/, '').trim()] = String(v || '').trim();
          });
          const errors = [];
          if (!norm['거래처명'])       errors.push('거래처명 누락');
          if (!norm['사업자등록번호']) errors.push('사업자등록번호 누락');
          return {
            _row:       idx + 2,
            _errors:    errors,
            vendor_name:  norm['거래처명']       || '',
            biz_no:       norm['사업자등록번호'] || '',
            credit_days:  parseInt(norm['여신기간(일)']) || 90,
            pay_method:   norm['결제방법']       || '현금결제',
          };
        });
        resolve(rows);
      } catch (err) {
        reject(new Error('엑셀 파일을 읽지 못했습니다: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsArrayBuffer(file);
  });
}

function renderVendorUploadPreview(rows) {
  const preview  = document.getElementById('vendorUploadPreview');
  const table    = document.getElementById('vendorUploadTable');
  const countEl  = document.getElementById('vendorUploadCount');
  const errorEl  = document.getElementById('vendorUploadError');
  const applyBtn = document.getElementById('btnApplyUpload');
  if (!preview || !table) return;

  // 기존 거래처 맵 (신규/업데이트 구분용)
  const existingMap = {};
  App.vendors.forEach(v => { existingMap[v.vendor_name] = true; });

  const errRows  = rows.filter(r => r._errors.length > 0);
  const newCount = rows.filter(r => !r._errors.length && !existingMap[r.vendor_name]).length;
  const updCount = rows.filter(r => !r._errors.length &&  existingMap[r.vendor_name]).length;

  countEl.textContent = `총 ${rows.length}건 (신규 ${newCount} / 업데이트 ${updCount})`;
  errorEl.textContent = errRows.length ? `오류 ${errRows.length}건 — 수정 후 다시 업로드해 주세요.` : '';
  if (applyBtn) applyBtn.style.display = errRows.length ? 'none' : '';

  const cols = ['거래처명', '사업자등록번호', '여신기간(일)', '결제방법'];
  const thead = `<thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}<th>구분</th><th>검증</th></tr></thead>`;
  const tbody = `<tbody>${rows.map(r => {
    const hasErr = r._errors.length > 0;
    const isNew  = !existingMap[r.vendor_name];
    const badge  = hasErr ? '' : isNew
      ? `<span style="background:#e8effd;color:#1a56db;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;">신규</span>`
      : `<span style="background:#f0fdf4;color:#0e7c3a;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;">업데이트</span>`;
    return `<tr style="${hasErr ? 'background:#fff5f5;' : ''}">
      <td>${escHtml(r.vendor_name)}</td>
      <td>${escHtml(r.biz_no)}</td>
      <td class="num">${r.credit_days}</td>
      <td>${escHtml(r.pay_method)}</td>
      <td style="text-align:center;">${badge}</td>
      <td>${hasErr ? `<span style="color:#c0392b;font-size:11px;">${escHtml(r._errors.join(', '))}</span>` : '✓'}</td>
    </tr>`;
  }).join('')}</tbody>`;

  table.innerHTML = thead + tbody;
  preview.style.display = '';
  preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function applyVendorUpload() {
  const validRows = _uploadedVendorRows.filter(r => r._errors.length === 0);

  // 기존 데이터를 거래처명 기준 맵으로 변환
  const existingMap = {};
  App.vendors.forEach(v => { existingMap[v.vendor_name] = v; });

  let updated = 0, added = 0;

  validRows.forEach(({ vendor_name, biz_no, credit_days, pay_method }) => {
    if (existingMap[vendor_name]) {
      // 기존 거래처 → 업데이트
      existingMap[vendor_name] = { ...existingMap[vendor_name], biz_no, credit_days, pay_method };
      updated++;
    } else {
      // 신규 거래처 → 추가
      existingMap[vendor_name] = { vendor_name, biz_no, credit_days, pay_method };
      added++;
    }
  });

  App.vendors = Object.values(existingMap);
  App.vendorsDirty = true;
  cancelVendorUpload();
  renderVendorTable();

  const msg = [];
  if (updated) msg.push(`${updated}건 업데이트`);
  if (added)   msg.push(`${added}건 신규 추가`);
  showMessage(msg.join(', ') + ' 됐습니다. 저장 버튼을 눌러 반영하세요.', 'success');
}

function cancelVendorUpload() {
  _uploadedVendorRows = [];
  const preview = document.getElementById('vendorUploadPreview');
  if (preview) preview.style.display = 'none';
}

function deleteVendor(i) {
  App.vendors.splice(i, 1);
  App.vendorsDirty = true;
  renderVendorTable();
}

async function saveVendors() {
  if (!App.canEdit) { showMessage('저장 권한이 없습니다.', 'error'); return; }

  const btn = document.getElementById('btnSaveVendors');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    showGlobalLoading('거래처 정보 저장 중...');
    const user = window.auth?.getSession?.();
    await apiPost('closingSaveVendors', {
      request_user_email: user?.email,
      vendors: App.vendors,
    });
    App.vendorsDirty = false;
    showMessage('거래처 정보가 저장됐습니다.', 'success');
    btn.textContent = '✓ 저장됨';
    setTimeout(() => { btn.textContent = '💾 저장'; btn.disabled = false; }, 2000);
  } catch (e) {
    showMessage('저장 중 오류: ' + e.message, 'error');
    btn.textContent = '💾 저장';
    btn.disabled = false;
  } finally {
    await hideGlobalLoading();
  }
}

// ═══════════════════════════════════════════════════════════
// 15. 자재코드 관리 (API 연동)
// ═══════════════════════════════════════════════════════════

async function loadItemsFromServer() {
  try {
    const user = window.auth?.getSession?.();
    const res  = await apiGet('closingGetItems', { request_user_email: user?.email });
    App.items = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    App.items = [];
  }
}

// ── 자재코드 테이블 (검색 + 페이지네이션) ─────────────────
const ITEM_PAGE_SIZE = 20;
let _itemCurrentPage = 1;
let _itemFiltered    = [];

// 탭 진입 / 데이터 로드 완료 시 호출 → 요약 통계 + 첫 페이지 렌더
function renderItemTable() {
  _updateItemSummary();
  _itemCurrentPage = 1;
  _applyItemFilter();
}

// 검색/필터 변경 시
function onItemSearch() {
  _itemCurrentPage = 1;
  _applyItemFilter();
}

// 통계 카드 업데이트
function _updateItemSummary() {
  const all = App.items;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('itemCntTotal',   all.length);
  set('itemCntSiyak',   all.filter(i => i.item_type === '시약').length);
  set('itemCntSomoum',  all.filter(i => i.item_type === '소모품').length);
  set('itemCntUiyak',   all.filter(i => i.item_type === '의약품').length);
  set('itemCntDisused', all.filter(i => (i.item_status || '사용') === '폐기').length);
}

// 필터 적용 → _itemFiltered 갱신 → 현재 페이지 렌더
function _applyItemFilter() {
  const keyword      = (document.getElementById('itemSearchInput')?.value || '').trim().toLowerCase();
  const typeFilter   = document.getElementById('itemFilterType')?.value   || 'all';
  const statusFilter = document.getElementById('itemFilterStatus')?.value || 'all';

  _itemFiltered = App.items.filter(it => {
    if (typeFilter   !== 'all' && it.item_type !== typeFilter) return false;
    if (statusFilter !== 'all' && (it.item_status || '사용') !== statusFilter) return false;
    if (keyword) {
      const codeMatch = it.item_code.toLowerCase().includes(keyword);
      const nameMatch = it.item_name.toLowerCase().includes(keyword);
      if (!codeMatch && !nameMatch) return false;
    }
    return true;
  });

  const resultEl = document.getElementById('itemSearchResult');
  if (resultEl) resultEl.textContent = keyword || typeFilter !== 'all' || statusFilter !== 'all'
    ? `검색 결과 ${_itemFiltered.length}건`
    : '';

  _renderItemPage(_itemCurrentPage);
  _renderItemPagination();
}

// 현재 페이지 테이블 렌더
function _renderItemPage(page) {
  _itemCurrentPage = page;
  const tbody = document.getElementById('itemTbody');
  if (!tbody) return;

  if (!_itemFiltered.length) {
    tbody.innerHTML = App.items.length === 0
      ? `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">등록된 자재가 없습니다. 자재관리 파일을 업로드해 주세요.</td></tr>`
      : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">검색 결과가 없습니다.</td></tr>`;
    return;
  }

  const start = (page - 1) * ITEM_PAGE_SIZE;
  const pageData = _itemFiltered.slice(start, start + ITEM_PAGE_SIZE);

  tbody.innerHTML = pageData.map((it, i) => {
    const typeColor = it.item_type === '시약' ? '#0e7c3a' : it.item_type === '의약품' ? '#b45309' : '#1a56db';
    const typeBg    = it.item_type === '시약' ? '#e6f4ec' : it.item_type === '의약품' ? '#fef3e2' : '#e8effd';
    const isDisused = (it.item_status || '사용') === '폐기';
    const rowFill   = (start + i) % 2 === 0 ? '' : 'background:#f8fafc;';
    const fmtPrice  = v => v ? Number(v).toLocaleString() : '-';
    return `<tr style="${isDisused ? 'opacity:.45;' : rowFill}">
      <td style="font-family:monospace;font-size:12px;">${escHtml(it.item_code)}</td>
      <td>${escHtml(it.item_name)}</td>
      <td style="text-align:center;">
        <span style="background:${typeBg};color:${typeColor};font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;">
          ${escHtml(it.item_type)}
        </span>
      </td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;font-size:12px;">${fmtPrice(it.purchase_price)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;font-size:12px;">${fmtPrice(it.calc_price)}</td>
      <td style="text-align:center;">
        <select data-code="${escHtml(it.item_code)}" onchange="itemStatusEdit(this)"
          style="border:1px solid var(--border-input);border-radius:5px;padding:3px 6px;font-size:12px;">
          <option ${(it.item_status||'사용')==='사용'?'selected':''}>사용</option>
          <option ${(it.item_status||'사용')==='폐기'?'selected':''}>폐기</option>
        </select>
      </td>
      <td style="text-align:center;">
        <button onclick="deleteItem('${escHtml(it.item_code)}')"
          style="background:none;border:none;cursor:pointer;color:#c0392b;font-size:16px;" title="삭제">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

// 페이지네이션 버튼 렌더
function _renderItemPagination() {
  const wrap = document.getElementById('itemPagination');
  if (!wrap) return;

  const total     = _itemFiltered.length;
  const totalPages = Math.ceil(total / ITEM_PAGE_SIZE);

  if (totalPages <= 1) { wrap.innerHTML = ''; return; }

  const cur = _itemCurrentPage;
  const btnStyle = (active) =>
    `style="padding:5px 11px;border-radius:5px;border:1px solid ${active ? '#1a56db' : 'var(--border)'};
     background:${active ? '#1a56db' : '#fff'};color:${active ? '#fff' : 'var(--text-primary)'};
     font-size:12px;font-weight:${active ? '700' : '400'};cursor:pointer;"`;

  // 표시할 페이지 범위 계산 (현재 페이지 기준 최대 10개)
  const half = 5;
  let rangeStart = Math.max(1, cur - half);
  let rangeEnd   = Math.min(totalPages, rangeStart + 9);
  if (rangeEnd - rangeStart < 9) rangeStart = Math.max(1, rangeEnd - 9);
  const pages = [];
  for (let p = rangeStart; p <= rangeEnd; p++) pages.push(p);

  let html = '';
  // 이전
  html += `<button onclick="_renderItemPage(${cur - 1});_renderItemPagination()"
    ${cur === 1 ? 'disabled' : ''} ${btnStyle(false)}>‹</button>`;
  // 첫 페이지
  if (pages[0] > 1) {
    html += `<button onclick="_renderItemPage(1);_renderItemPagination()" ${btnStyle(false)}>1</button>`;
    if (pages[0] > 2) html += `<span style="padding:0 4px;color:var(--text-muted);">…</span>`;
  }
  // 페이지 번호 (최대 10개)
  pages.forEach(p => {
    html += `<button onclick="_renderItemPage(${p});_renderItemPagination()" ${btnStyle(p === cur)}>${p}</button>`;
  });
  // 마지막 페이지
  if (pages[pages.length - 1] < totalPages) {
    if (pages[pages.length - 1] < totalPages - 1) html += `<span style="padding:0 4px;color:var(--text-muted);">…</span>`;
    html += `<button onclick="_renderItemPage(${totalPages});_renderItemPagination()" ${btnStyle(false)}>${totalPages}</button>`;
  }
  // 다음
  html += `<button onclick="_renderItemPage(${cur + 1});_renderItemPagination()"
    ${cur === totalPages ? 'disabled' : ''} ${btnStyle(false)}>›</button>`;

  // 페이지 정보
  const start = (cur - 1) * ITEM_PAGE_SIZE + 1;
  const end   = Math.min(cur * ITEM_PAGE_SIZE, total);
  html += `<span style="font-size:12px;color:var(--text-muted);margin-left:8px;">${start}–${end} / ${total}건</span>`;

  wrap.innerHTML = html;
}

function itemStatusEdit(sel) {
  const code = sel.dataset.code;
  const it   = App.items.find(i => i.item_code === code);
  if (it) { it.item_status = sel.value; App.itemsDirty = true; }
}

function deleteItem(code) {
  App.items = App.items.filter(i => i.item_code !== code);
  App.itemsDirty = true;
  renderItemTable();
}

async function saveItems() {
  if (!App.canEdit) { showMessage('저장 권한이 없습니다.', 'error'); return; }
  const btn = document.getElementById('btnSaveItems');
  btn.disabled = true; btn.textContent = '저장 중...';
  try {
    showGlobalLoading('자재코드 저장 중...');
    const user = window.auth?.getSession?.();
    await apiPost('closingSaveItems', {
      request_user_email: user?.email,
      items: App.items,
    });
    App.itemsDirty = false;
    showMessage(`자재코드 ${App.items.length}건이 저장됐습니다.`, 'success');
    btn.textContent = '✓ 저장됨';
    setTimeout(() => { btn.textContent = '💾 저장'; btn.disabled = false; }, 2000);
  } catch (e) {
    showMessage('저장 중 오류: ' + e.message, 'error');
    btn.textContent = '💾 저장'; btn.disabled = false;
  } finally {
    await hideGlobalLoading();
  }
}

// ── 자재관리 파일 업로드 ──────────────────────────────────
let _uploadedItemRows = [];

async function handleItemExcel(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  try {
    showGlobalLoading('자재관리 파일 분석 중...');
    _uploadedItemRows = await parseItemExcel(file);
    renderItemUploadPreview(_uploadedItemRows);
  } catch (err) {
    showMessage('파일 읽기 오류: ' + err.message, 'error');
  } finally {
    await hideGlobalLoading();
  }
}

function parseItemExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb  = XLSX.read(e.target.result, { type: 'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!raw.length) { reject(new Error('데이터가 없습니다.')); return; }

        const rows = raw.map((r, idx) => {
          const errors = [];
          const code = String(r['자재코드'] || '').trim();
          const name = String(r['자재명']   || '').trim();
          const type = String(r['구분']     || '').trim();
          if (!code) errors.push('자재코드 누락');
          if (!name) errors.push('자재명 누락');
          if (!['시약','소모품','의약품'].includes(type)) errors.push(`구분 오류(${type||'없음'})`);
          const toPrice = v => {
            const n = parseFloat(String(v || '').replace(/,/g, ''));
            return isNaN(n) ? 0 : n;
          };
          return {
            _row: idx + 2, _errors: errors,
            item_code:      code,
            item_name:      name,
            item_type:      type,
            item_status:    String(r['상태'] || '사용').trim(),
            purchase_price: toPrice(r['입고단가']),
            calc_price:     toPrice(r['산출단가']),
          };
        });
        resolve(rows);
      } catch (err) {
        reject(new Error('파일을 읽지 못했습니다: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsArrayBuffer(file);
  });
}

function renderItemUploadPreview(rows) {
  const preview  = document.getElementById('itemUploadPreview');
  const table    = document.getElementById('itemUploadTable');
  const countEl  = document.getElementById('itemUploadCount');
  const errorEl  = document.getElementById('itemUploadError');
  const statEl   = document.getElementById('itemUploadStat');
  const applyBtn = document.getElementById('btnApplyItemUpload');
  if (!preview || !table) return;

  const existingMap = {};
  App.items.forEach(it => { existingMap[it.item_code] = true; });

  const errRows  = rows.filter(r => r._errors.length > 0);
  const newCount = rows.filter(r => !r._errors.length && !existingMap[r.item_code]).length;
  const updCount = rows.filter(r => !r._errors.length &&  existingMap[r.item_code]).length;

  countEl.textContent = `총 ${rows.length}건 (신규 ${newCount} / 업데이트 ${updCount})`;
  errorEl.textContent = errRows.length ? `오류 ${errRows.length}건` : '';
  if (statEl) {
    const valid = rows.filter(r => !r._errors.length);
    statEl.textContent =
      `시약 ${valid.filter(r=>r.item_type==='시약').length} · ` +
      `소모품 ${valid.filter(r=>r.item_type==='소모품').length} · ` +
      `의약품 ${valid.filter(r=>r.item_type==='의약품').length}`;
  }
  if (applyBtn) applyBtn.style.display = errRows.length ? 'none' : '';

  const show = rows.slice(0, 20);
  const thead = `<thead><tr><th>자재코드</th><th>자재명</th><th>구분</th><th>상태</th><th>구분</th><th>검증</th></tr></thead>`;
  const tbody = `<tbody>${show.map(r => {
    const hasErr = r._errors.length > 0;
    const isNew  = !existingMap[r.item_code];
    const badge  = hasErr ? '' : isNew
      ? `<span style="background:#e8effd;color:#1a56db;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;">신규</span>`
      : `<span style="background:#f0fdf4;color:#0e7c3a;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;">업데이트</span>`;
    return `<tr style="${hasErr?'background:#fff5f5;':''}">
      <td style="font-family:monospace;font-size:12px;">${escHtml(r.item_code)}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${escHtml(r.item_name)}</td>
      <td>${escHtml(r.item_type)}</td>
      <td>${escHtml(r.item_status)}</td>
      <td style="text-align:center;">${badge}</td>
      <td>${hasErr?`<span style="color:#c0392b;font-size:11px;">${escHtml(r._errors.join(', '))}</span>`:'✓'}</td>
    </tr>`;
  }).join('')}
  ${rows.length > 20 ? `<tr><td colspan="6" class="cl-preview more">외 ${rows.length-20}건 더 있음</td></tr>` : ''}
  </tbody>`;

  table.innerHTML = thead + tbody;
  preview.style.display = '';
  preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function applyItemUpload() {
  const validRows = _uploadedItemRows.filter(r => r._errors.length === 0);
  const existingMap = {};
  App.items.forEach(it => { existingMap[it.item_code] = it; });

  let updated = 0, added = 0;
  validRows.forEach(({ item_code, item_name, item_type, item_status, purchase_price, calc_price }) => {
    if (existingMap[item_code]) {
      existingMap[item_code] = { ...existingMap[item_code], item_name, item_type, item_status, purchase_price, calc_price };
      updated++;
    } else {
      existingMap[item_code] = { item_code, item_name, item_type, item_status, purchase_price, calc_price };
      added++;
    }
  });

  App.items = Object.values(existingMap);
  App.itemsDirty = true;
  cancelItemUpload();
  renderItemTable();

  const msg = [];
  if (updated) msg.push(`${updated}건 업데이트`);
  if (added)   msg.push(`${added}건 신규 추가`);
  showMessage(msg.join(', ') + ' 됐습니다. 저장 버튼을 눌러 반영하세요.', 'success');
}

function cancelItemUpload() {
  _uploadedItemRows = [];
  const preview = document.getElementById('itemUploadPreview');
  if (preview) preview.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
// 16. 초기 재고 업로드 (수불부 파일 → closing_stock 저장)
// ═══════════════════════════════════════════════════════════
let _stockInitWb     = null;  // 업로드된 워크북
let _stockInitParsed = [];    // 파싱된 기말 재고

// 탭 진입 시 지점 드롭다운 동기화
function initStockInitUI() {
  // 지점 드롭다운 → inputBranch와 동일 옵션
  const src = document.getElementById('inputBranch');
  const tgt = document.getElementById('stockInitBranch');
  if (src && tgt) {
    tgt.innerHTML = src.innerHTML;
    tgt.value     = src.value;
  }
  // 저장 연월 기본값: 전월
  const el = document.getElementById('stockInitYm');
  if (el && !el.value) {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    el.value = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  }
}

// 수불부 파일 업로드 → 시트 목록 팝업
async function handleStockInitFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';

  try {
    showGlobalLoading('수불부 파일 읽는 중...');
    const buf = await file.arrayBuffer();
    _stockInitWb = XLSX.read(buf, { type: 'array' });

    // 시트 목록 드롭다운 업데이트
    const sel = document.getElementById('stockInitSheet');
    sel.innerHTML = _stockInitWb.SheetNames.map((s, i) =>
      `<option value="${i}">${s}</option>`
    ).join('');

    // 첫 번째 시트 자동 파싱
    parseStockInitSheet(0);
  } catch (e) {
    showMessage('파일 읽기 오류: ' + e.message, 'error');
  } finally {
    await hideGlobalLoading();
  }

  // 시트 선택 변경 시 재파싱
  document.getElementById('stockInitSheet').onchange = function() {
    parseStockInitSheet(parseInt(this.value));
  };
}

// 특정 시트 파싱 → 기말 수량·금액 추출
function parseStockInitSheet(sheetIdx) {
  if (!_stockInitWb) return;
  const ws  = _stockInitWb.Sheets[_stockInitWb.SheetNames[sheetIdx]];
  const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // 4행(index 4)부터 데이터, 0=품목코드, 1=품목명, 2=구분
  // 기말: 10=수량, 12=금액
  const rows = [];
  for (let i = 4; i < all.length; i++) {
    const row  = all[i];
    const code = String(row[0] || '').trim();
    if (!code || code === '총합계' || code === '누계') continue;

    const qty = parseFloat(String(row[10] || '0').replace(/,/g, '')) || 0;
    const amt = parseFloat(String(row[12] || '0').replace(/,/g, '')) || 0;

    // 기말 수량 또는 금액이 있는 품목만
    if (qty === 0 && amt === 0) continue;

    rows.push({
      item_code:      code,
      item_name:      String(row[1] || '').trim(),
      item_type:      String(row[2] || '').trim(),
      closing_qty:    qty,
      closing_amount: amt,
    });
  }

  _stockInitParsed = rows;
  renderStockInitPreview(rows);
}

function renderStockInitPreview(rows) {
  const preview = document.getElementById('stockInitPreview');
  const table   = document.getElementById('stockInitTable');
  const countEl = document.getElementById('stockInitCount');
  if (!preview || !table) return;

  countEl.textContent = `${rows.length}건`;

  if (!rows.length) {
    table.innerHTML = `<thead><tr><th colspan="5">기말 재고가 있는 품목이 없습니다.</th></tr></thead>`;
    preview.style.display = '';
    return;
  }

  const thead = `<thead><tr>
    <th>자재코드</th><th>자재명</th><th>구분</th>
    <th style="text-align:right;">기말 수량</th>
    <th style="text-align:right;">기말 금액</th>
  </tr></thead>`;
  const tbody = `<tbody>${rows.map((r, i) => `
    <tr style="${i % 2 ? 'background:#f8fafc;' : ''}">
      <td style="font-family:monospace;font-size:12px;">${escHtml(r.item_code)}</td>
      <td>${escHtml(r.item_name)}</td>
      <td style="text-align:center;">${escHtml(r.item_type)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;">${Math.round(r.closing_qty).toLocaleString()}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;">${Math.round(r.closing_amount).toLocaleString()}</td>
    </tr>`).join('')}
  </tbody>`;

  table.innerHTML = thead + tbody;
  preview.style.display = '';
  preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function saveStockInit() {
  if (!_stockInitParsed.length) { showMessage('저장할 데이터가 없습니다.', 'error'); return; }

  const ym     = document.getElementById('stockInitYm')?.value;
  const branch = document.getElementById('stockInitBranch')?.value;
  if (!ym)     { showMessage('저장 연월을 선택해 주세요.', 'error'); return; }
  if (!branch) { showMessage('지점명을 선택해 주세요.', 'error'); return; }

  const btn = document.getElementById('btnSaveStockInit');

  try {
    showGlobalLoading(`${branch} ${ym} 초기 재고 저장 중...`);
    btn.disabled = true;

    // 기존 데이터 있는지 확인
    const user = window.auth?.getSession?.();
    const existing = await apiGet('closingGetStock', {
      request_user_email: user?.email,
      ym, branch,
    });
    await hideGlobalLoading();

    if (Array.isArray(existing.data) && existing.data.length > 0) {
      const ok = confirm(
        `${branch} ${ym} 확정 데이터가 이미 존재합니다.\n덮어쓰시겠습니까?`
      );
      if (!ok) { btn.disabled = false; return; }
    }

    showGlobalLoading('저장 중...');
    await apiPost('closingSaveStock', {
      request_user_email: user?.email,
      branch, ym,
      items: _stockInitParsed,
    });

    showMessage(`${branch} ${ym} 초기 재고 ${_stockInitParsed.length}건이 저장됐습니다.`, 'success');
    cancelStockInit();
  } catch (e) {
    showMessage('저장 중 오류: ' + e.message, 'error');
  } finally {
    await hideGlobalLoading();
    btn.disabled = false;
  }
}

function cancelStockInit() {
  _stockInitWb     = null;
  _stockInitParsed = [];
  const preview = document.getElementById('stockInitPreview');
  if (preview) preview.style.display = 'none';
  const sel = document.getElementById('stockInitSheet');
  if (sel) sel.innerHTML = '<option value="">파일 업로드 후 선택</option>';
  const fi = document.getElementById('stockInitFileInput');
  if (fi) fi.value = '';
}

// ═══════════════════════════════════════════════════════════
// 연간 원재료비 초기 데이터 업로드
// ═══════════════════════════════════════════════════════════
let _usageInitParsed = [];

function initUsageInitUI() {
  // 지점 드롭다운 동기화
  const src = document.getElementById('inputBranch');
  const tgt = document.getElementById('usageInitBranch');
  if (src && tgt) { tgt.innerHTML = src.innerHTML; tgt.value = src.value; }
}

async function handleUsageInitFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';

  const branch = document.getElementById('usageInitBranch')?.value?.trim();
  if (!branch) { showMessage('지점명을 선택해 주세요.', 'error'); return; }

  try {
    showGlobalLoading('파일 분석 중...');
    _usageInitParsed = await parseUsageInitFile(file);
    renderUsageInitPreview(_usageInitParsed);
  } catch (e) {
    showMessage('파일 읽기 오류: ' + e.message, 'error');
  } finally {
    await hideGlobalLoading();
  }
}

// 기존 보고 파일의 4번째 시트(연간 원재료비) 파싱 - 모든 연도 블록 자동 인식
function parseUsageInitFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        // 연간 원재료비 시트 찾기 (마지막 시트 또는 연도 포함 시트)
        const sheetName = wb.SheetNames.find(s =>
          s.includes('원재료비') && (s.includes('년도') || s.includes('연간'))
        ) || wb.SheetNames[wb.SheetNames.length - 1];

        const ws  = wb.Sheets[sheetName];
        const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const rows = [];
        let currentYear = null;

        all.forEach(row => {
          const col0 = String(row[0] || '').trim();

          // 연도 블록 감지 (■ 2026년도 원재료비)
          const yearMatch = col0.match(/(\d{4})년도\s*원재료비/);
          if (yearMatch) {
            currentYear = yearMatch[1];
            return;
          }

          // 연도 블록 없으면 스킵
          if (!currentYear) return;

          // 비고(15열)에서 부서명 - 자재구분 파싱 (이게 핵심 판별 기준)
          const bigo = String(row[15] || '').trim();
          if (!bigo || !bigo.includes('-')) return;

          const parts = bigo.split('-').map(s => s.trim());
          const dept  = parts[0];
          const itype = parts[1];
          if (!dept || !itype) return;

          // 월별 값 파싱 (2~13열: 1월~12월, 천원 단위)
          const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
          months.forEach((mon, mi) => {
            const raw = String(row[mi + 2] || '').replace(/,/g, '').trim();
            const val = parseFloat(raw) || 0;
            if (!val) return;
            rows.push({
              ym:           `${currentYear}-${mon}`,
              dept,
              item_type:    itype,
              usage_amount: Math.round(val),  // 파일 값이 이미 원 단위
            });
          });
        });

        if (!rows.length) {
          reject(new Error('데이터를 찾을 수 없습니다. 연간 원재료비 시트가 있는 파일인지 확인해 주세요.'));
          return;
        }
        resolve(rows);
      } catch (err) {
        reject(new Error('파일 읽기 실패: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsArrayBuffer(file);
  });
}

function renderUsageInitPreview(rows) {
  const preview  = document.getElementById('usageInitPreview');
  const table    = document.getElementById('usageInitTable');
  const countEl  = document.getElementById('usageInitCount');
  if (!preview || !table) return;

  // 월별 요약
  const byYm = {};
  rows.forEach(r => {
    if (!byYm[r.ym]) byYm[r.ym] = {};
    const k = r.dept + ' - ' + r.item_type;
    byYm[r.ym][k] = (byYm[r.ym][k] || 0) + r.usage_amount;
  });

  const yms = Object.keys(byYm).sort();
  const deptKeys = [...new Set(rows.map(r => r.dept + ' - ' + r.item_type))].sort();

  countEl.textContent = `${yms.length}개월 / ${deptKeys.length}개 부서·구분`;

  // 파일 구분 표시
  const typeInfo = document.getElementById('usageInitTypeInfo');
  if (typeInfo) {
    const types = [...new Set(_usageInitParsed.map(r => r.item_type))].join(', ');
    const isGC   = types.includes('시약') || types.includes('소모품');
    const isImed = types.includes('의약품');
    const label  = isGC && isImed ? 'GC케어 + 아이메드' : isGC ? 'GC케어 (시약·소모품)' : '아이메드 (의약품)';
    typeInfo.textContent = `파일 구분: ${label}`;
  }

  const thead = `<thead><tr><th>연월</th>${deptKeys.map(k => `<th>${escHtml(k)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${yms.map((ym, i) => `
    <tr style="${i % 2 ? 'background:#f8fafc;' : ''}">
      <td style="font-weight:600;">${ym}</td>
      ${deptKeys.map(k => `<td class="num">${((byYm[ym][k] || 0) / 1000).toLocaleString()}</td>`).join('')}
    </tr>`).join('')}
  </tbody>`;

  table.innerHTML = thead + tbody;
  preview.style.display = '';
  preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function saveUsageInit() {
  if (!_usageInitParsed.length) { showMessage('저장할 데이터가 없습니다.', 'error'); return; }

  const year   = document.getElementById('usageInitYear')?.value?.trim();
  const branch = document.getElementById('usageInitBranch')?.value?.trim();
  const btn    = document.getElementById('btnSaveUsageInit');

  // 연월별로 그룹핑해서 저장
  const byYm = {};
  _usageInitParsed.forEach(r => {
    if (!byYm[r.ym]) byYm[r.ym] = [];
    byYm[r.ym].push({ dept: r.dept, item_type: r.item_type, usage_amount: r.usage_amount });
  });

  btn.disabled = true;
  try {
    showGlobalLoading('데이터 저장 중...');
    const user = window.auth?.getSession?.();
    for (const ym of Object.keys(byYm).sort()) {
      await apiPost('closingSaveUsageMonthly', {
        request_user_email: user?.email,
        branch,
        ym,
        items: byYm[ym],
      });
    }
    showMessage(`${Object.keys(byYm).length}개월 데이터가 저장됐습니다.`, 'success');
    cancelUsageInit();
  } catch (e) {
    showMessage('저장 중 오류: ' + e.message, 'error');
  } finally {
    await hideGlobalLoading();
    btn.disabled = false;
  }
}

function cancelUsageInit() {
  _usageInitParsed = [];
  const preview = document.getElementById('usageInitPreview');
  if (preview) preview.style.display = 'none';
  const fi = document.getElementById('usageInitFileInput');
  if (fi) fi.value = '';
}
