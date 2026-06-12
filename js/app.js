let currentDC = '猫小胖';
let currentWorld = '';
let searchCache = {};
const HISTORY_KEY = 'universalis_search_history';
const MAX_HISTORY = 10;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadDCSelector();
  await loadCnDCCards();
  await loadStats();
  await loadAboutPage();
  setupNavHighlight();
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const navLink = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (navLink) navLink.classList.add('active');
  if (page === 'search') { document.getElementById('searchInput')?.focus(); renderSearchHistory(); }
  window.scrollTo({ top: 0 });
}

function setupNavHighlight() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function(e) {
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      this.classList.add('active');
    });
  });
}

function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

function saveSearchHistory(query) {
  const h = getSearchHistory().filter(s => s !== query);
  h.unshift(query);
  if (h.length > MAX_HISTORY) h.length = MAX_HISTORY;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

function renderSearchHistory() {
  const el = document.getElementById('searchHistory');
  const h = getSearchHistory();
  if (!h.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="history-header"><span>搜索历史</span><button class="history-clear" onclick="clearSearchHistory()">清空</button></div>`
    + h.map(s => `<span class="history-tag" onclick="doSearch('${s.replace(/'/g, "\\'")}')">${escapeHtml(s)}<span class="remove" onclick="event.stopPropagation();removeSearchHistory('${s.replace(/'/g, "\\'")}')">×</span></span>`).join('');
}

function clearSearchHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderSearchHistory();
}

function removeSearchHistory(query) {
  const h = getSearchHistory().filter(s => s !== query);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  renderSearchHistory();
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

function formatGil(num) {
  if (num == null) return '-';
  return num.toLocaleString('zh-CN') + ' G';
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = typeof ts === 'number' && ts > 1e15 ? new Date(ts / 1000) : new Date(ts);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hh}:${mm}`;
}

async function loadDCSelector() {
  const dcSelect = document.getElementById('dcSelect');
  const worldSelect = document.getElementById('worldSelect');
  const dcs = await getCnDataCenters();
  dcSelect.innerHTML = '';
  for (const dc of dcs) {
    const opt = document.createElement('option');
    opt.value = dc.name;
    opt.textContent = dc.name;
    dcSelect.appendChild(opt);
  }
  currentDC = dcs[0]?.name || '猫小胖';
  dcSelect.value = currentDC;
  await loadWorldSelector(currentDC);
}

async function loadWorldSelector(dcName) {
  const worldSelect = document.getElementById('worldSelect');
  worldSelect.innerHTML = '<option value="">全大区</option>';
  const dcs = await getDataCenters();
  const dc = dcs.find(d => d.name === dcName);
  if (!dc) return;
  const worlds = await getWorlds();
  for (const wid of dc.worlds) {
    const wname = worlds[wid];
    if (!wname) continue;
    const opt = document.createElement('option');
    opt.value = wname;
    opt.textContent = wname;
    worldSelect.appendChild(opt);
  }
}

async function changeDC(val) {
  currentDC = val;
  currentWorld = '';
  await loadWorldSelector(val);
}

function changeWorld(val) {
  currentWorld = val;
}

async function loadStats() {
  const dcs = await getCnDataCenters();
  const cnWorlds = await getCnWorlds();
  document.querySelector('#statDataCenters .stat-number').textContent = dcs.length;
  document.querySelector('#statWorlds .stat-number').textContent = Object.keys(cnWorlds).length;
  document.querySelector('#statItems .stat-number').textContent = '50,000+';
}

async function loadCnDCCards() {
  const container = document.getElementById('dcCards');
  container.innerHTML = '';
  const dcs = await getCnDataCenters();
  const worlds = await getWorlds();
  for (const dc of dcs) {
    const card = document.createElement('div');
    card.className = 'dc-card';
    const worldNames = dc.worlds.map(id => worlds[id] || `#${id}`).filter(Boolean);
    card.innerHTML = `
      <h3>${dc.name}</h3>
      <div class="dc-worlds">
        ${worldNames.map(w => `<span class="dc-world-tag">${w}</span>`).join('')}
      </div>
    `;
    card.querySelector('h3').addEventListener('click', () => {
      currentDC = dc.name;
      document.getElementById('dcSelect').value = dc.name;
      loadWorldSelector(dc.name);
      showToast(`已切换到 ${dc.name}`);
    });
    card.querySelector('h3').style.cursor = 'pointer';
    card.querySelector('h3').style.color = 'var(--accent)';
    container.appendChild(card);
  }
}

async function doSearch(query) {
  query = query.trim();
  if (!query) return;
  navigateTo('search');
  saveSearchHistory(query);
  const resultsDiv = document.getElementById('searchResults');
  resultsDiv.innerHTML = '<div class="loading">搜索中...</div>';
  try {
    const results = await searchItems(query);
    if (!results.length) {
      resultsDiv.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)">没有找到相关物品，请尝试其他关键词</div>';
      return;
    }
    resultsDiv.innerHTML = '';
    for (const item of results) {
      const card = document.createElement('div');
      card.className = 'item-result';
      const iconUrl = item.Icon ? iconPathToUrl(item.Icon) : '';
      card.innerHTML = `
        <img class="item-icon" src="${iconUrl}" alt="" onerror="this.style.display='none'">
        <div class="item-result-info">
          <div class="item-result-name">${item.Name}</div>
          <div class="item-result-category">ID: ${item.ID}</div>
        </div>
      `;
      card.addEventListener('click', () => showItemDetail(item.ID, item.Name));
      resultsDiv.appendChild(card);
    }
  } catch (e) {
    resultsDiv.innerHTML = `<div style="text-align:center;padding:40px;color:var(--accent-red)">搜索失败: ${e.message}</div>`;
  }
}

function browseCategory(catId) {
  navigateTo('categories');
  loadCategoryItems(catId);
}

async function loadCategoryItems(catId) {
  const container = document.getElementById('categoryItems');
  container.innerHTML = '<div class="loading">加载中...</div>';
  try {
    const items = await searchItemsByCategory(catId, 100);
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)">该分类暂未加载到物品</div>';
      return;
    }
    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'item-result';
      const iconUrl = item.Icon ? iconPathToUrl(item.Icon) : '';
      card.innerHTML = `
        <img class="item-icon" src="${iconUrl}" alt="" onerror="this.style.display='none'">
        <div class="item-result-info">
          <div class="item-result-name">${item.Name}</div>
          <div class="item-result-category">ID: ${item.ID}</div>
        </div>
      `;
      card.addEventListener('click', () => showItemDetail(item.ID, item.Name));
      container.appendChild(card);
    }
  } catch (e) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--accent-red)">加载失败: ${e.message}</div>`;
  }
}

async function showItemDetail(itemId, itemName) {
  navigateTo('item');
  const container = document.getElementById('itemDetail');
  container.innerHTML = '<div class="loading">加载市场数据...</div>';
  try {
    const targetDC = currentDC || '猫小胖';
    const [itemInfo, marketData] = await Promise.all([
      getItemInfo(itemId),
      getMarketData(targetDC, itemId),
    ]);
    renderItemDetail(container, itemId, itemName, itemInfo, marketData);
  } catch (e) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--accent-red)">加载失败: ${e.message}</div>`;
  }
}

function renderItemDetail(container, itemId, itemName, itemInfo, marketData) {
  const iconUrl = itemInfo?.Icon ? iconPathToUrl(itemInfo.Icon) : '';
  const catName = itemInfo?.ItemSearchCategory?.Name || '未分类';
  const dcName = marketData?.dcName || currentDC;

  const listings = marketData?.listings || [];
  const history = marketData?.recentHistory || [];
  const minPrice = marketData?.minPriceNQ ?? marketData?.minPrice ?? 0;
  const avgPrice = marketData?.currentAveragePriceNQ ?? marketData?.currentAveragePrice ?? 0;
  const maxPrice = marketData?.maxPriceNQ ?? marketData?.maxPrice ?? 0;
  const saleVel = marketData?.nqSaleVelocity ?? marketData?.regularSaleVelocity ?? 0;
  const unitsForSale = marketData?.unitsForSale ?? 0;
  const unitsSold = marketData?.unitsSold ?? 0;

  container.innerHTML = `
    <div class="item-header">
      <img class="item-header-icon" src="${iconUrl}" alt="" onerror="this.style.display='none'">
      <div class="item-header-info">
        <div class="item-header-name">${itemName}</div>
        <div class="item-header-category">${catName} · ${dcName} · ID: ${itemId}</div>
      </div>
    </div>

    <div class="price-summary">
      <div class="price-box"><div class="label">最低价</div><div class="value green">${formatGil(minPrice)}</div></div>
      <div class="price-box"><div class="label">平均价</div><div class="value">${formatGil(Math.round(avgPrice))}</div></div>
      <div class="price-box"><div class="label">最高价</div><div class="value red">${formatGil(maxPrice)}</div></div>
      <div class="price-box"><div class="label">日销量</div><div class="value gold">${saleVel.toFixed(1)}</div></div>
      <div class="price-box"><div class="label">在售</div><div class="value">${unitsForSale}</div></div>
      <div class="price-box"><div class="label">已售</div><div class="value">${unitsSold}</div></div>
    </div>

    <div class="data-section-title">在售列表 <span class="count-badge">${listings.length} 条</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>价格</th><th>数量</th><th>品质</th><th>服务器</th><th>雇员</th>
        </tr></thead>
        <tbody>
          ${listings.length ? listings.map(l => `
            <tr>
              <td>${formatGil(l.pricePerUnit)}</td>
              <td>${l.quantity}</td>
              <td>${l.hq ? '<span class="hq-badge">HQ</span>' : 'NQ'}</td>
              <td>${l.worldName || '-'}</td>
              <td>${l.retainerName || '-'}</td>
            </tr>
          `).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary)">暂无在售信息</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="data-section-title">成交记录 <span class="count-badge">${history.length} 条</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>价格</th><th>数量</th><th>品质</th><th>服务器</th><th>买家</th><th>时间</th>
        </tr></thead>
        <tbody>
          ${history.length ? history.map(h => `
            <tr>
              <td>${formatGil(h.pricePerUnit)}</td>
              <td>${h.quantity}</td>
              <td>${h.hq ? '<span class="hq-badge">HQ</span>' : 'NQ'}</td>
              <td>${h.worldName || '-'}</td>
              <td>${h.buyerName || '-'}</td>
              <td>${formatTime(h.timestamp)}</td>
            </tr>
          `).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">暂无成交记录</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  if (history.length >= 2) {
    renderPriceChart(container, history);
  }
}

function renderPriceChart(container, history) {
  const sorted = [...history].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const chartDiv = document.createElement('div');
  chartDiv.innerHTML = `
    <div class="data-section-title">价格走势</div>
    <div id="priceChart" style="height:200px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--border-radius);padding:16px;position:relative;"></div>
  `;
  container.appendChild(chartDiv);

  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  const chartEl = document.getElementById('priceChart');
  chartEl.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = chartEl.clientWidth * 2;
  canvas.height = chartEl.clientHeight * 2;
  canvas.style.width = chartEl.clientWidth + 'px';
  canvas.style.height = chartEl.clientHeight + 'px';
  ctx.scale(2, 2);

  const w = chartEl.clientWidth;
  const h = chartEl.clientHeight;
  const pad = { top: 20, bottom: 30, left: 60, right: 20 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  const prices = sorted.map(x => x.pricePerUnit);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    const val = max - (range / 4) * i;
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatGil(Math.round(val)), pad.left - 8, y + 4);
  }

  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < sorted.length; i++) {
    const x = pad.left + (i / Math.max(sorted.length - 1, 1)) * chartW;
    const y = pad.top + chartH - ((sorted[i].pricePerUnit - min) / range) * chartH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  for (let i = 0; i < sorted.length; i++) {
    const x = pad.left + (i / Math.max(sorted.length - 1, 1)) * chartW;
    const y = pad.top + chartH - ((sorted[i].pricePerUnit - min) / range) * chartH;
    ctx.fillStyle = sorted[i].hq ? '#d29922' : '#58a6ff';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function loadAboutPage() {
  const list = document.getElementById('aboutDcList');
  if (!list) return;
  const dcs = await getCnDataCenters();
  const worlds = await getWorlds();
  list.innerHTML = '';
  for (const dc of dcs) {
    const li = document.createElement('li');
    const worldNames = dc.worlds.map(id => worlds[id] || `#${id}`).filter(Boolean);
    li.textContent = `${dc.name}（${worldNames.join('、')}）`;
    list.appendChild(li);
  }
}
