/**
 * stats-client.js
 * Supabase 클라이언트 초기화 + 통계 조회용 쿼리 함수
 *
 * anon key로 SELECT만 수행 (RLS 정책상 쓰기 불가)
 */

'use strict';

// ★ 실제 값으로 교체 필요
const SUPABASE_URL = 'https://llfbjgsuoaaifbfftuuf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsZmJqZ3N1b2FhaWZiZmZ0dXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NTUxMTcsImV4cCI6MjA5NzIzMTExN30.5btOquOHOopWs502uMZxy0vBUzZ-xSnd22lCc-Yc-m8';

const _supabase = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!_supabase) {
  console.error('Supabase 클라이언트 로드 실패. supabase-js CDN 스크립트가 먼저 로드되어야 합니다.');
}

// ── 공통: 페이지네이션 없이 전체 행 가져오기 (Supabase는 기본 1000행 제한) ──
async function fetchAllRows_(table, buildQuery) {
  const PAGE_SIZE = 1000;
  let from = 0;
  let all = [];

  while (true) {
    let query = buildQuery(_supabase.from(table).select('*'));
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    all = all.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

// ── 필터 적용 헬퍼 ─────────────────────────────────────────
function applyFilters_(query, filters) {
  const { branch, ymFrom, ymTo, itemType, dept, vendor, vendorBizNo } = filters || {};
  if (branch)      query = query.eq('branch', branch);
  if (ymFrom)      query = query.gte('ym', ymFrom);
  if (ymTo)        query = query.lte('ym', ymTo);
  if (itemType)    query = query.eq('item_type', itemType);
  if (dept)        query = query.eq('dept', dept);
  if (vendorBizNo) query = query.eq('vendor_biz_no', vendorBizNo);
  else if (vendor) query = query.eq('vendor_name', vendor);
  return query;
}

// ── 검색구분 → 실제 컬럼명 매핑 ──────────────────────────────
function searchFieldToColumn_(type) {
  if (type === 'vendor')   return 'vendor_name';
  if (type === 'dept')     return 'dept';
  if (type === 'itemType') return 'item_type';
  return null;
}

// ── 기본 검색(구분+키워드, LIKE) + 상세검색(다중 조건, AND/OR) 클라이언트 필터링 ──
// basicSearch: { type, keyword } | null
// advancedConditions: [{ field, keyword, combinator }]  combinator는 그 조건이 "앞 조건과" 어떻게 결합되는지 (첫 행은 무시)
function applyClientSideSearch_(rows, basicSearch, advancedConditions) {
  let result = rows;

  if (basicSearch && basicSearch.keyword && basicSearch.keyword.trim()) {
    const col = searchFieldToColumn_(basicSearch.type);
    const kw = basicSearch.keyword.trim().toLowerCase();
    if (col) {
      result = result.filter(r => String(r[col] || '').toLowerCase().includes(kw));
    }
  }

  if (Array.isArray(advancedConditions) && advancedConditions.length) {
    const valid = advancedConditions.filter(c => c.field && c.keyword && c.keyword.trim());
    if (valid.length) {
      result = result.filter(row => {
        // 좌결합: 첫 조건의 결과에서 시작해, 이후 조건을 combinator(AND/OR)로 누적 결합
        let acc = null;
        valid.forEach((cond, idx) => {
          const col = searchFieldToColumn_(cond.field);
          const kw = cond.keyword.trim().toLowerCase();
          const matched = col ? String(row[col] || '').toLowerCase().includes(kw) : false;
          if (idx === 0) {
            acc = matched;
          } else if (cond.combinator === 'OR') {
            acc = acc || matched;
          } else {
            acc = acc && matched;
          }
        });
        return acc;
      });
    }
  }

  return result;
}

// ── 공통: 통계 결과로부터 요약 카드용 정보 산출 ──────────────
// rows: 정렬된 집계 결과 배열, amountKey: 합계금액 필드명
function buildSummary_(rows, amountKey, countKey) {
  const total = rows.reduce((s, r) => s + (Number(r[amountKey]) || 0), 0);
  const totalRecords = rows.reduce((s, r) => s + (Number(r[countKey]) || 0), 0);
  const groupCount = rows.length;
  const top = rows[0] || null;
  const avgPerGroup = groupCount ? total / groupCount : 0;

  return {
    total,
    totalRecords,
    groupCount,
    avgPerGroup,
    topName: top ? (top.vendor_name || top.dept || top.item_name || '') : '',
    topAmount: top ? (Number(top[amountKey]) || 0) : 0,
  };
}

// ═══════════════════════════════════════════════════════════
// 1. 거래처별 통계 (purchase_records 기반)
// 사업자번호(vendor_biz_no) 기준으로 그룹핑 — 거래처명 변경/표기 차이에도 동일 거래처로 집계
// 사업자번호가 없는 행(거래처 마스터 미등록)은 거래처명 기준으로 별도 그룹핑하고 미등록 표시
// ═══════════════════════════════════════════════════════════
async function getVendorStats(filters) {
  let rows = await fetchAllRows_('purchase_records', q => applyFilters_(q, filters));
  rows = applyClientSideSearch_(rows, filters.basicSearch, filters.advancedConditions);

  // 사업자번호 → 현재 대표 명칭(is_current=true) 매핑. 그룹에 대표가 없으면(이론상 발생 안 함, 서버에서 보정)
  // 사업자번호로 등록된 첫 거래처명을 fallback으로 사용
  const bizNoToCurrentName = {};
  const bizNoToFallbackName = {};
  (window.StatsApp?.vendors || []).forEach(v => {
    if (!v.biz_no) return;
    if (v.is_current) bizNoToCurrentName[v.biz_no] = v.vendor_name;
    if (!bizNoToFallbackName[v.biz_no]) bizNoToFallbackName[v.biz_no] = v.vendor_name;
  });

  const grouped = {};
  const allItemTypes = new Set();

  rows.forEach(r => {
    const bizNo = r.vendor_biz_no || null;
    // 사업자번호가 있으면 그걸 키로, 없으면 거래처명 기준 (미등록 거래처 임시 그룹)
    const key = bizNo ? `biz:${bizNo}` : `name:${r.vendor_name || '(미확인)'}`;
    const rawName = r.vendor_name || '(미확인)';
    const itemType = r.item_type || '미분류';
    allItemTypes.add(itemType);

    if (!grouped[key]) {
      const displayName = bizNo
        ? (bizNoToCurrentName[bizNo] || bizNoToFallbackName[bizNo] || rawName)
        : rawName;
      grouped[key] = {
        vendor_name: displayName,
        vendor_biz_no: bizNo,
        unmatched: !bizNo,
        total_amount: 0, supply_amount: 0, vat_amount: 0, item_count: 0, record_count: 0,
        breakdown: {}, // 실제 데이터에 등장한 이름별 세부 내역 (펼쳐보기용)
        byItemType: {}, // 자재구분별 합계금액 (컬럼 표시용)
      };
    }
    grouped[key].total_amount  += Number(r.total_amount)  || 0;
    grouped[key].supply_amount += Number(r.supply_amount) || 0;
    grouped[key].vat_amount    += Number(r.vat_amount)    || 0;
    grouped[key].item_count    += 1;
    grouped[key].record_count  += 1;

    if (!grouped[key].breakdown[rawName]) {
      grouped[key].breakdown[rawName] = { vendor_name: rawName, total_amount: 0, record_count: 0 };
    }
    grouped[key].breakdown[rawName].total_amount += Number(r.total_amount) || 0;
    grouped[key].breakdown[rawName].record_count += 1;

    grouped[key].byItemType[itemType] = (grouped[key].byItemType[itemType] || 0) + (Number(r.total_amount) || 0);
  });

  // breakdown을 배열로 변환 + 같은 이름이 1개뿐이면(이름 변경 이력 없음) 펼쳐볼 필요 없으니 표시
  const data = Object.values(grouped).map(g => {
    const breakdownArr = Object.values(g.breakdown).sort((a, b) => b.total_amount - a.total_amount);
    return { ...g, breakdown: breakdownArr, hasMultipleNames: breakdownArr.length > 1 };
  }).sort((a, b) => b.total_amount - a.total_amount);

  // 자재구분 정렬: 소모품/시약/의약품을 우선 노출하고, 그 외 값은 가나다순으로 뒤에 붙임
  const priorityOrder = ['소모품', '시약', '의약품'];
  const itemTypes = Array.from(allItemTypes).sort((a, b) => {
    const ai = priorityOrder.indexOf(a), bi = priorityOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, 'ko');
  });

  return { data, summary: buildSummary_(data, 'total_amount', 'record_count'), itemTypes };
}

// ═══════════════════════════════════════════════════════════
// 2. 부서별 통계 (usage_records 기반)
// ═══════════════════════════════════════════════════════════
async function getDeptStats(filters) {
  let rows = await fetchAllRows_('usage_records', q => applyFilters_(q, filters));
  rows = applyClientSideSearch_(rows, filters.basicSearch, filters.advancedConditions);

  const grouped = {};
  rows.forEach(r => {
    const key = r.dept || '(미확인)';
    if (!grouped[key]) {
      grouped[key] = { dept: key, usage_total: 0, usage_supply: 0, usage_vat: 0, record_count: 0 };
    }
    grouped[key].usage_total  += Number(r.usage_total)  || 0;
    grouped[key].usage_supply += Number(r.usage_supply) || 0;
    grouped[key].usage_vat    += Number(r.usage_vat)    || 0;
    grouped[key].record_count += 1;
  });

  const data = Object.values(grouped).sort((a, b) => b.usage_total - a.usage_total);
  return { data, summary: buildSummary_(data, 'usage_total', 'record_count') };
}

// ═══════════════════════════════════════════════════════════
// 3. 품목별 통계 (다음 단계에서 구현)
// ═══════════════════════════════════════════════════════════
async function getItemStats(filters) {
  throw new Error('품목별 통계는 아직 구현되지 않았습니다.');
}

// ═══════════════════════════════════════════════════════════
// 4. 기간(월별/연도별) 추이 통계 (다음 단계에서 구현)
// ═══════════════════════════════════════════════════════════
async function getTrendStats(filters) {
  throw new Error('기간별 추이 통계는 아직 구현되지 않았습니다.');
}

// ═══════════════════════════════════════════════════════════
// 5. 업로드 현황 조회 (연도별 업로드된 월 목록)
// ═══════════════════════════════════════════════════════════
// ── 검색 옵션용: 실제 데이터에 존재하는 부서명/자재구분 distinct 목록 ──
// 두 테이블(purchase_records, usage_records)을 합쳐서 등장하는 모든 값을 추출
async function getDistinctValues(column) {
  const PAGE_SIZE = 1000;
  const values = new Set();

  async function collectFrom(table) {
    let from = 0;
    while (true) {
      const { data, error } = await _supabase
        .from(table)
        .select(column)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      (data || []).forEach(r => { if (r[column]) values.add(r[column]); });
      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  await Promise.all([collectFrom('purchase_records'), collectFrom('usage_records')]);
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'ko'));
}

async function getUploadStatus(branch) {
  const [purchaseRows, usageRows] = await Promise.all([
    fetchAllRows_('purchase_records', q => q.eq('branch', branch)),
    fetchAllRows_('usage_records',    q => q.eq('branch', branch)),
  ]);

  // ym(YYYY-MM) 집합을 연도별로 묶기: { '2026': Set('01','02',...), ... }
  const buildYearMonthMap = (rows) => {
    const map = {};
    rows.forEach(r => {
      const ym = r.ym || '';
      const year = ym.slice(0, 4);
      const month = ym.slice(5, 7);
      if (!year || !month) return;
      if (!map[year]) map[year] = new Set();
      map[year].add(month);
    });
    return map;
  };

  const purchaseMap = buildYearMonthMap(purchaseRows);
  const usageMap    = buildYearMonthMap(usageRows);

  const allYears = [...new Set([...Object.keys(purchaseMap), ...Object.keys(usageMap)])].sort();

  return allYears.map(year => ({
    year,
    purchaseMonths: purchaseMap[year] ? [...purchaseMap[year]].sort() : [],
    usageMonths:    usageMap[year]    ? [...usageMap[year]].sort()    : [],
  }));
}

window.statsClient = {
  getVendorStats,
  getDeptStats,
  getItemStats,
  getTrendStats,
  getUploadStatus,
  getDistinctValues,
};
