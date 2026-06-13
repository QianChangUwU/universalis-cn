// 选模式：'direct' 直连官方, 'proxy' 走 Cloudflare Pages Functions 反代
const API_MODE = 'proxy';
const UNIVERSALIS_BASE = API_MODE === 'proxy' ? '/api/universalis' : 'https://universalis.app/api';
const XIVAPI_V2_BASE = API_MODE === 'proxy' ? '/api/xivapi' : 'https://xivapi-v2.xivcdn.com/api';

const CN_DC_NAMES = ['陆行鸟', '莫古力', '猫小胖', '豆豆柴'];

let cachedDataCenters = null;
let cachedWorlds = null;

async function apiFetch(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getDataCenters() {
  if (cachedDataCenters) return cachedDataCenters;
  const data = await apiFetch(`${UNIVERSALIS_BASE}/v3/game/data-centers`);
  cachedDataCenters = data;
  return data;
}

async function getWorlds() {
  if (cachedWorlds) return cachedWorlds;
  const data = await apiFetch(`${UNIVERSALIS_BASE}/v3/game/worlds`);
  const map = {};
  for (const w of data) map[w.id] = w.name;
  cachedWorlds = map;
  return map;
}

async function getCnDataCenters() {
  const dcs = await getDataCenters();
  return dcs.filter(dc => dc.region === '中国');
}

async function getCnWorlds() {
  const worlds = await getWorlds();
  const dcs = await getCnDataCenters();
  const cnWorldIds = new Set();
  for (const dc of dcs) for (const wid of dc.worlds) cnWorldIds.add(wid);
  const result = {};
  for (const [id, name] of Object.entries(worlds)) {
    if (cnWorldIds.has(Number(id))) result[id] = name;
  }
  return result;
}

function iconPathToUrl(iconPath) {
  if (!iconPath) return '';
  const name = iconPath.replace(/\.tex$/, '');
  return `${XIVAPI_V2_BASE}/asset?path=${encodeURIComponent(name)}.tex&format=png`;
}

function detectSearchLang(query) {
  return /[\u4e00-\u9fff]/.test(query) ? 'chs' : 'en';
}

async function searchItems(query, limit = 50, page = 1) {
  const q = `Name~"${query.replace(/"/g, '')}"`;
  const lang = detectSearchLang(query);
  const url = `${XIVAPI_V2_BASE}/search?query=${encodeURIComponent(q)}&sheets=Item&limit=${limit}&page=${page}&fields=ID,Name,Icon&language=${lang}`;
  const data = await apiFetch(url);
  const results = (data.results || []).map(r => ({
    ID: r.row_id,
    Name: r.fields.Name || '',
    Icon: r.fields.Icon ? r.fields.Icon.path_hr1 || r.fields.Icon.path : null,
  }));
  if (lang === 'en' && results.length > 0) {
    await fillChineseNames(results);
  }
  return { results, pagination: data.pagination || null };
}

async function fillChineseNames(results) {
  const ids = results.map(r => r.ID).join(',');
  try {
    const data = await apiFetch(
      `${XIVAPI_V2_BASE}/sheet/Item?rows=${ids}&fields=Name&language=chs`
    );
    const nameMap = {};
    for (const row of data.rows || []) {
      nameMap[row.row_id] = row.fields.Name;
    }
    for (const r of results) {
      if (nameMap[r.ID]) r.Name = nameMap[r.ID];
    }
  } catch {
    // fallback: keep English names
  }
}

async function getMarketData(dcName, itemId) {
  const encoded = encodeURIComponent(dcName);
  const url = `${UNIVERSALIS_BASE}/v2/${encoded}/${itemId}`;
  return apiFetch(url);
}

async function getMarketDataWorld(worldName, itemId) {
  const encoded = encodeURIComponent(worldName);
  const url = `${UNIVERSALIS_BASE}/v2/${encoded}/${itemId}`;
  return apiFetch(url);
}

async function getItemInfo(itemId) {
  try {
    const data = await apiFetch(
      `${XIVAPI_V2_BASE}/sheet/Item/${itemId}?fields=Name,Icon,ItemSearchCategory.Name&language=chs`
    );
    return {
      ID: data.row_id,
      Name: data.fields.Name || '',
      Icon: data.fields.Icon ? data.fields.Icon.path_hr1 || data.fields.Icon.path : null,
      ItemSearchCategory: {
        ID: data.fields.ItemSearchCategory?.row_id || 0,
        Name: data.fields.ItemSearchCategory?.fields?.Name || '未分类',
      },
    };
  } catch {
    return null;
  }
}


