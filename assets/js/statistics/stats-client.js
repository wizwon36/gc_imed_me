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
  const { branch, ymFrom, ymTo, itemType, dept, vendor } = filters || {};
  if (branch)   query = query.eq('branch', branch);
  if (ymFrom)   query = query.gte('ym', ymFrom);
  if (ymTo)     query = query.lte('ym', ymTo);
  if (itemType) query = query.eq('item_type', itemType);
  if (dept)     query = query.eq('dept', dept);
  if (vendor)   query = query.eq('vendor_name', vendor);
  return query;
}

// ═══════════════════════════════════════════════════════════
// 1. 거래처별 통계 (purchase_records 기반)
// ═══════════════════════════════════════════════════════════
async function getVendorStats(filters) {
  const rows = await fetchAllRows_('purchase_records', q => applyFilters_(q, filters));

  const grouped = {};
  rows.forEach(r => {
    const key = r.vendor_name || '(미확인)';
    if (!grouped[key]) {
      grouped[key] = { vendor_name: key, total_amount: 0, supply_amount: 0, vat_amount: 0, item_count: 0, record_count: 0 };
    }
    grouped[key].total_amount  += Number(r.total_amount)  || 0;
    grouped[key].supply_amount += Number(r.supply_amount) || 0;
    grouped[key].vat_amount    += Number(r.vat_amount)    || 0;
    grouped[key].item_count    += 1;
    grouped[key].record_count  += 1;
  });

  return Object.values(grouped).sort((a, b) => b.total_amount - a.total_amount);
}

// ═══════════════════════════════════════════════════════════
// 2. 부서별 통계 (usage_records 기반)
// ═══════════════════════════════════════════════════════════
async function getDeptStats(filters) {
  const rows = await fetchAllRows_('usage_records', q => applyFilters_(q, filters));

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

  return Object.values(grouped).sort((a, b) => b.usage_total - a.usage_total);
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
};
