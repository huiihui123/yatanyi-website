/**
 * 雅檀怡家私城 - 电商系统 v2.1
 * ================================
 * v2.1：API 同源自动探测 | fetch 超时 | 图片懒加载 | 搜索排序修复
 * 新增：产品详情弹窗 | 购物车侧栏 | 登录注册 | 搜索排序 | 下单+微信二维码
 */
// ★ API地址自动切换：本机/局域网走本地后端，公网部署走同源 /api
//   ★ 修复：原生产环境硬编码 https://huihui003.pythonanywhere.com/api，
//     与 cart.html/profile.html 的同源 /api 不一致（换服务器即数据源分裂）；
//     统一改为同源，与 Flask 托管保持一致的部署形态。
const API = (location.origin.includes('localhost') || location.origin.includes('127.0.0.1') || location.port === '5000')
  ? (location.origin + '/api')
  : '/api';
let currentUser = null;
try { currentUser = JSON.parse(localStorage.getItem('yatan_user') || 'null'); } catch(e) { currentUser = null; }

document.addEventListener('DOMContentLoaded', function() {
  // ====== 工具函数 ======
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }
  function throttle(fn, d) { let l=0; return function() { let n=Date.now(); if(n-l>=d){l=n;fn.apply(this,arguments);}}; }
  /** 带 12s 超时的 API 请求，防止后端卡死时前端一直转圈 */
  function fetchAPI(url, opts={}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    return fetch(API + url, {
      headers: {'Content-Type': 'application/json'},
      ...opts,
      signal: ctrl.signal
    }).finally(() => clearTimeout(timer));
  }

  // ★ 性能：首屏以下图片懒加载（有原生 loading=lazy 则补上）
  $$('img').forEach((img, i) => {
    if (i > 2 && !img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
  });

  // ====== 全局模态层 ======
  const overlay = createEl('div', {id:'globalOverlay', style:'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;justify-content:center;align-items:center;'});
  document.body.appendChild(overlay);
  // ★ BUG修复：点击遮罩（弹窗外）不再无差别关闭所有弹窗。
  //   仅当弹窗明确允许「点击外部关闭」（modal-box 带 data-outside-close="1"）时才关闭；
  //   登录/注册/找回密码等「输入型」弹窗点击外部一律不关闭，防止误触丢失已填内容。
  overlay.addEventListener('click', function(e){
    if (e.target !== overlay) return;
    const box = overlay.querySelector('.modal-box');
    if (box && box.getAttribute('data-outside-close') !== '1') return;
    closeAllModals();
  });
  function closeAllModals() { overlay.style.display='none'; overlay.innerHTML=''; }

  function showModal(html, cls, opts) {
    // opts.clickOutsideClose === false → 该弹窗点击外部不关闭（登录/注册等输入型弹窗）
    const outsideAttr = (opts && opts.clickOutsideClose === false) ? '' : ' data-outside-close="1"';
    overlay.innerHTML = `<div class="modal-box ${cls||''}"${outsideAttr} style="background:#fff;border-radius:12px;max-width:600px;width:90%;max-height:85vh;overflow-y:auto;padding:0;position:relative;animation:fadeInUp .3s;">
      <span onclick="document.getElementById('globalOverlay').style.display='none'" style="position:absolute;top:12px;right:16px;font-size:24px;cursor:pointer;z-index:10;color:#999;">&times;</span>
      ${html}</div>`;
    overlay.style.display='flex';
  }

  // ====== 需求1/3：统一确认对话框（加购物车确认 / 结算确认） ======
  // ★ 独立浮层（z-index 高于全局遮罩 9999），可叠加在详情弹窗等任何弹窗之上：
  //   点「取消」只关闭确认框、下方弹窗保持原样；点「确认」执行回调后再关闭。
  function showConfirmDialog(opts) {
    // 参数：{ title, message, icon, confirmText, cancelText, danger, onConfirm }
    const layer = createEl('div', {
      style: 'position:fixed;top:0;left:0;width:100%;height:100%;'
        + 'background:rgba(0,0,0,0.45);z-index:10000;display:flex;'
        + 'align-items:center;justify-content:center;'
    });
    // 组装确认框内容：图标 + 标题 + 说明 + 取消/确认按钮
    const html = [
      '<div style="background:#fff;border-radius:12px;max-width:400px;width:90%;padding:28px 24px;text-align:center;animation:fadeInUp .25s;box-shadow:0 12px 40px rgba(0,0,0,0.25);">'
      , '<div style="font-size:2.2rem;margin-bottom:10px;">' + (opts.icon || '❓') + '</div>'
      , '<h3 style="color:#3E2723;font-size:1.15rem;margin:0 0 ' + (opts.message ? "10px" : "22px") + ';">' + (opts.title || '') + '</h3>'
      , (opts.message ? '<p style="color:#8D6E63;font-size:0.9rem;line-height:1.7;margin-bottom:22px;word-break:break-all;">' + opts.message + '</p>' : '')
      , '<div style="display:flex;gap:12px;">'
      , '<button data-act="cancel" style="flex:1;padding:12px;background:#EFE7DF;color:#6D4C41;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">' + (opts.cancelText || '取消') + '</button>'
      , '<button data-act="confirm" style="flex:1;padding:12px;background:' + (opts.danger ? '#e74c3c' : '#8B5E3C') + ';color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">' + (opts.confirmText || '确认') + '</button>'
      , '</div>'
      , '</div>'
    ].join('');
    layer.innerHTML = html;
    document.body.appendChild(layer);
    // 事件代理：点遮罩=取消，点按钮=取消/确认
    layer.addEventListener('click', function(e) {
      if (e.target === layer) { layer.remove(); return; }            // 点击半透明遮罩 → 取消
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'cancel') { layer.remove(); return; }              // 取消按钮 → 关闭确认框
      if (act === 'confirm') {                                        // 确认按钮 → 关闭并执行回调
        layer.remove();
        if (typeof opts.onConfirm === 'function') opts.onConfirm();
      }
    });
  }

  // ====== 需求1：轻量 toast 成功/失败反馈（替代原生 alert，不打断流程） ======
  let _toastTimer = null;
  function showToastMsg(text, type) {
    // type: 'success'（绿）| 'error'（红）| 其他（深棕）
    let t = $('#globalToast');
    if (!t) {
      // 首次调用时创建悬浮提示元素（顶部居中，滑入滑出）
      t = createEl('div', {id:'globalToast', style:'position:fixed;top:24px;left:50%;transform:translateX(-50%) translateY(-90px);background:#3E2723;color:#fff;padding:12px 28px;border-radius:30px;font-size:0.95rem;z-index:10001;transition:transform .3s ease, opacity .3s ease;box-shadow:0 6px 20px rgba(0,0,0,0.3);opacity:0;pointer-events:none;'});
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.style.background = type === 'error' ? '#C62828' : (type === 'success' ? '#2E7D32' : '#3E2723');
    t.style.transform = 'translateX(-50%) translateY(0)';   // 滑入屏幕
    t.style.opacity = '1';
    clearTimeout(_toastTimer);
    // 2.2 秒后自动滑出消失
    _toastTimer = setTimeout(() => { t.style.transform = 'translateX(-50%) translateY(-90px)'; t.style.opacity = '0'; }, 2200);
  }

  // ====== 创建元素 ======
  function createEl(tag, attrs) {
    let el = document.createElement(tag);
    for (let k in attrs) {
      if (k==='style' && typeof attrs[k]==='object') Object.assign(el.style, attrs[k]);
      else if (k==='onclick') el.addEventListener('click', attrs[k]);
      else if (k==='html') el.innerHTML = attrs[k];
      else if (k==='text') el.textContent = attrs[k];
      else el[k] = attrs[k];
    }
    return el;
  }

  // ====== 1. 移动端菜单 ======
  const mb = $('#mobileMenuBtn'), nm = $('#navMenu');
  if(mb&&nm){ mb.onclick=()=>{ let x=nm.classList.toggle('active'); mb.querySelector('i').classList.toggle('fa-bars',!x); mb.querySelector('i').classList.toggle('fa-times',x); };
    nm.querySelectorAll('.nav-link').forEach(l=>l.onclick=()=>{nm.classList.remove('active');mb.querySelector('i').classList.replace('fa-times','fa-bars');});}

  // ====== 2. 滚动效果 ======
  const hdr=$('.header'), btt=$('#backToTop'), secs=$$('section[id]'), navs=$$('.nav-link');
  window.addEventListener('scroll', throttle(function(){
    let y=window.scrollY;
    if(hdr) hdr.classList.toggle('scrolled',y>80);
    if(btt) btt.style.display=y>300?'flex':'none';
    let cur=''; secs.forEach(s=>{if(y>=s.offsetTop-200) cur=s.id;});
    navs.forEach(l=>l.classList.toggle('active',l.getAttribute('href')==='#'+cur));
  },100),{passive:true});
  if(btt) btt.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});

  // ====== 3. 轮播（★ 修复：独立timer管理，避免mouse事件冲突） ======
  function createCarousel(cfg){
    let c = document.getElementById(cfg.id);
    if (!c) { console.warn('Carousel container not found:', cfg.id); return; }
    let ss = c.querySelectorAll(cfg.ss || '.carousel-slide');
    let ds = c.querySelectorAll(cfg.ds || '.carousel-dot');
    let pb = c.querySelector(cfg.pb || '.carousel-prev');
    let nb = c.querySelector(cfg.nb || '.carousel-next');
    if (!ss.length || !ds.length) { console.warn('Carousel: no slides/dots found for', cfg.id); return; }

    let cur = 0, timer = null, paused = false;
    let intv = cfg.intv || 4000;

    function show(i) {
      ss.forEach(x => x.classList.remove('active'));
      ds.forEach(x => x.classList.remove('active'));
      ss[i].classList.add('active');
      ds[i].classList.add('active');
      cur = i;
    }

    function next() { show((cur + 1) % ss.length); }
    function prev() { show((cur - 1 + ss.length) % ss.length); }
    function startTimer() { stopTimer(); if (!paused) timer = setInterval(next, intv); }
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

    if (nb) nb.onclick = function() { stopTimer(); next(); startTimer(); };
    if (pb) pb.onclick = function() { stopTimer(); prev(); startTimer(); };
    ds.forEach((d, i) => { d.onclick = function() { stopTimer(); show(i); startTimer(); }; });

    // ★ 用独立的包装div做hover检测，避免DOM变动误触发mouseleave
    let hoverZone = c.querySelector('.carousel-container,.testimonials-slider,.about-image-carousel,.hero-image-carousel');
    if (!hoverZone) hoverZone = c;
    hoverZone.addEventListener('mouseenter', function() { paused = true; stopTimer(); });
    hoverZone.addEventListener('mouseleave', function() { paused = false; startTimer(); });

    // 初始自动播放
    show(0);
    startTimer();
  }
  createCarousel({id:'heroCarousel',intv:3000});
  createCarousel({id:'aboutCarousel',intv:4000});
  createCarousel({id:'testimonials',ss:'.testimonial-card',ds:'.dot',pb:'.slider-prev',nb:'.slider-next',intv:2500});

  // ====== 4. 产品渲染（数据来自管理后台 products 表）======

  /** HTML 转义，防止产品名称/描述里的引号破坏结构 */
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ====== 浏览历史（纯前端 localStorage，零网络请求、零服务器开销）======
  const HISTORY_KEY = 'yatan_history';
  const HISTORY_MAX = 30;   // 最多保留 30 条，防止 localStorage 无限增长

  /** 记录一次产品浏览：写入本地存储（去重 + 限条数 + 异常静默） */
  function recordViewHistory(item) {
    if (!item || !item.id) return;
    try {
      let list = [];
      try { list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { list = []; }
      if (!Array.isArray(list)) list = [];
      // 同一产品去重：移除旧记录，最新浏览排最前
      list = list.filter(x => x && x.id !== item.id);
      list.unshift({ id: item.id, name: item.name, price: item.price, image: item.image, category: item.category, time: Date.now() });
      if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (e) {
      // 存储满 / 隐私模式等异常：静默忽略，绝不影响浏览体验
    }
  }

  // ★ 图片兜底占位（SVG data URI，不依赖任何外部资源；加载失败时替换，避免破图图标）
  window.__FALLBACK_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
    '<rect width="100%" height="100%" fill="#F5EFE6"/>' +
    '<text x="50%" y="50%" fill="#B8A88F" font-size="16" text-anchor="middle" dominant-baseline="middle">图片加载失败</text></svg>');

  /** 生成与静态卡片完全一致的结构（筛选/排序/详情/购物车逻辑全部复用） */
  function productCardHTML(p, idx = 0) {
    const full = Math.min(5, Math.floor(p.rating || 0));
    const half = ((p.rating || 0) - full) >= 0.45 ? 1 : 0;
    let stars = '';
    for (let i = 0; i < full; i++) stars += '<i class="fas fa-star"></i>';
    if (half) stars += '<i class="fas fa-star-half-alt"></i>';
    const tag = p.is_hot ? '<div class="product-tag new">热销</div>'
              : (p.is_new ? '<div class="product-tag new">新品</div>' : '');
    // ★ 兼容性：相对路径统一补成绝对路径（/images/...），任何部署形态都不会因相对路径失效
    const raw = (p.image_url || '').trim();
    const imgSrc = /^https?:\/\//i.test(raw) ? raw : (raw ? '/' + raw.replace(/^\/+/, '') : '');
    // ★ 性能：首屏前 4 张立即加载（高优先级），其余懒加载 + 异步解码，兼顾首屏速度与流量
    const imgAttrs = idx < 4
      ? 'fetchpriority="high" decoding="async"'
      : 'loading="lazy" decoding="async"';
    const orig = p.original_price
      ? `<span class="original-price">¥${Number(p.original_price).toLocaleString()}</span>` : '';
    return `
      <div class="product-card" data-category="${escHtml(p.category)}" data-pid="${p.id}">
        <div class="product-img">
          ${tag}
          <img src="${escHtml(imgSrc)}" alt="${escHtml(p.name)}" ${imgAttrs}
            onerror="this.onerror=null;this.src=window.__FALLBACK_IMG">
        </div>
        <div class="product-info">
          <h3>${escHtml(p.name)}</h3>
          <p class="product-desc">${escHtml(p.description || '')}</p>
          <div class="product-price">
            <span class="current-price">¥${Number(p.price).toLocaleString()}</span>
            ${orig}
          </div>
          <div class="product-rating">
            ${stars}
            <span class="rating-count">(${p.review_count || 0})</span>
          </div>
          <div class="product-actions">
            <button class="btn-cart"><i class="fas fa-shopping-cart"></i> 加入购物车</button>
            <button class="btn-detail">查看详情</button>
          </div>
        </div>
      </div>`;
  }

  /** 从后端加载产品并渲染到 .products-grid */
  async function renderProducts() {
    const grid = $('#productsGrid');
    if (!grid) return;
    try {
      const r = await fetchAPI('/products/search');
      const d = await r.json();
      if (!d.success || !d.products.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:#8D6E63;">暂无产品，请稍后再来</div>';
        return;
      }
      grid.innerHTML = d.products.map((p, i) => productCardHTML(p, i)).join('');
    } catch (e) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:#8D6E63;">产品加载失败，请刷新重试</div>';
    }
  }

  /** 产品渲染完成后绑定交互（筛选/详情/图片放大/搜索排序） */
  function bindProductUI() {

  // ====== 需求1：产品卡片「加入购物车」按钮 ======
  // ★ BUG修复：该按钮此前从未绑定任何事件（点击无反应），现接入确认对话框流程
  // 点击 → 弹出「您是否将该产品加入购物车？」确认框 → 确认后加入（数量默认为1）
  $$('.btn-cart').forEach(btn => {
    btn.onclick = function(e) {
      e.stopPropagation();   // 阻止冒泡，避免触发图片放大等父级事件
      let card = this.closest('.product-card');
      let name = card.querySelector('h3').textContent;
      // ★ 价格兼容：去掉 ¥ 与千分位逗号后转数字
      let price = parseFloat(card.querySelector('.current-price').textContent.replace(/[¥,\s]/g,''));
      let img = card.querySelector('img').src;
      // 调用统一入口 _addToCart（内部弹出确认对话框，数量传 1）
      window._addToCart(name, price, img, 1);
    };
  });
  // ====== 5. 产品筛选 ======
  $$('.filter-btn').forEach(b=>b.onclick=function(){
    $$('.filter-btn').forEach(x=>x.classList.remove('active')); this.classList.add('active');
    let f=this.dataset.filter;
    $$('.product-card').forEach(c=>c.style.display=(f==='all'||c.dataset.category===f)?'block':'none');
  });

  // ====== 6. 产品详情弹窗 + 加入购物车 ======
  $$('.btn-detail').forEach(btn => {
    btn.onclick = function(e) {
      e.stopPropagation();
      let card = this.closest('.product-card');
      let name = card.querySelector('h3').textContent;
      // ★ BUG修复：价格带千分位逗号（如 ¥3,999），直接 replace('¥','') 后拼进
      //   onclick 会把 "3,999" 拆成两个实参 → 商品以 3 元加入购物车！
      //   必须去掉逗号再转数字
      let price = parseFloat(card.querySelector('.current-price').textContent.replace(/[¥,\s]/g,''));
      let desc = card.querySelector('.product-desc').textContent;
      let img = card.querySelector('img').src;
      let cat = card.dataset.category;
      let cats = {sofa:'沙发系列',bed:'床具系列',table:'餐桌系列',storage:'储物系列'};
      // ★ BUG修复：onclick 属性用双引号包裹，JSON.stringify 产生的双引号会截断属性值，
      //   必须转义为 &quot;（浏览器解析时还原为 "）
      const jsArg = s => JSON.stringify(s).replace(/"/g, '&quot;');

      showModal(`
        <div style="padding:30px;">
          <img src="${img}" onerror="this.onerror=null;this.src=window.__FALLBACK_IMG" style="width:100%;max-height:300px;object-fit:contain;border-radius:8px;margin-bottom:20px;">
          <h2 style="color:#3E2723;margin-bottom:8px;">${name}</h2>
          <p style="color:#8D6E63;margin-bottom:12px;">${cats[cat]||cat}</p>
          <p style="color:#2C1810;line-height:1.6;margin-bottom:16px;">${desc}</p>
          <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:20px;">
            <span style="font-size:2rem;font-weight:700;color:#8B5E3C;">¥${price.toLocaleString()}</span>
          </div>
          <div style="margin-bottom:16px;">
            <label style="color:#666;margin-right:10px;">数量</label>
            <input type="number" id="modalQty" value="1" min="1" max="99" style="width:80px;padding:8px;border:1px solid #D7CCC8;border-radius:6px;text-align:center;">
          </div>
          <div style="display:flex;gap:10px;">
            <button onclick="window._addToCart(${jsArg(name)},${price},${jsArg(img)})"
              style="flex:1;padding:14px;background:#8B5E3C;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">
              <i class="fas fa-shopping-cart"></i> 加入购物车
            </button>
            <button onclick="document.getElementById('globalOverlay').style.display='none';window._buyNow(${jsArg(name)},${price},${jsArg(img)})"
              style="flex:1;padding:14px;background:#C67B4B;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">
              <i class="fas fa-bolt"></i> 立即购买
            </button>
          </div>
        </div>`, 'product-modal');

      // ★ 浏览历史：纯前端 localStorage 记录（零网络请求、零服务器开销、即时响应）
      //   存产品信息快照（名称/价格/图片），即使商品下架或删除，历史仍可正常展示
      if (card.dataset.pid) {
        recordViewHistory({ id: parseInt(card.dataset.pid), name, price, image: img, category: cat });
      }
    };
  });

  // 点击产品图片放大
  $$('.product-img img, .product-card img').forEach(img => {
    img.style.cursor = 'zoom-in';
    img.onclick = function(e) {
      e.stopPropagation();
      showModal(`<img src="${this.src}" onerror="this.onerror=null;this.src=window.__FALLBACK_IMG" style="width:100%;max-height:80vh;object-fit:contain;border-radius:8px;">`, 'image-modal');
    };
  });

  // ====== 7. 搜索框 + 排序 ======
  let searchBar = $('.product-filter');
  if (searchBar) {
    let searchBox = createEl('div', {style:'display:flex;gap:10px;align-items:center;margin-left:auto;'});
    searchBox.innerHTML = `
      <div style="position:relative;flex:1;max-width:300px;">
        <input id="searchInput" placeholder="🔍 搜索产品..." style="width:100%;padding:10px 14px;border:2px solid #D7CCC8;border-radius:30px;font-size:0.95rem;outline:none;transition:border .3s;"
          onfocus="this.style.borderColor='#8B5E3C'" onblur="this.style.borderColor='#D7CCC8'">
      </div>
      <select id="sortSelect" style="padding:10px 14px;border:2px solid #D7CCC8;border-radius:30px;font-size:0.95rem;cursor:pointer;background:#fff;">
        <option value="">默认排序</option>
        <option value="price_asc">价格从低到高</option>
        <option value="price_desc">价格从高到低</option>
        <option value="rating">评分最高</option>
      </select>`;
    searchBar.parentNode.insertBefore(searchBox, searchBar.nextSibling);

    // 搜索逻辑：节流输入 + 本地过滤排序（不额外打后端，交互更快）
    $('#searchInput').addEventListener('input', throttle(doSearch, 300));
    $('#sortSelect').addEventListener('change', doSearch);

    function doSearch() {
      let q = $('#searchInput').value.trim();
      let sortBy = $('#sortSelect').value;
      let cards = $$('.product-card');
      // 先按关键词过滤显示
      cards.forEach(c => {
        let name = c.querySelector('h3').textContent.toLowerCase();
        let visible = !q || name.includes(q.toLowerCase());
        c.style.display = visible ? 'block' : 'none';
      });
      // ★ BUG修复：原先 sortVisibleCards 形参/实参不一致，排序用错变量
      if (sortBy) sortVisibleCards(sortBy);
    }

    /** 对当前可见产品卡片按价格/评分重排 DOM */
    function sortVisibleCards(sortBy) {
      let grid = $('.products-grid');
      if (!grid) return;
      let cards = Array.from($$('.product-card')).filter(c => c.style.display !== 'none');
      cards.sort((a, b) => {
        // ★ BUG修复：价格带千分位逗号（如"¥3,999"），parseFloat("3,999")=3 排序全错
        let pa = parseFloat(a.querySelector('.current-price').textContent.replace(/[¥,\s]/g,'')) || 0;
        let pb = parseFloat(b.querySelector('.current-price').textContent.replace(/[¥,\s]/g,'')) || 0;
        let ra = a.querySelectorAll('.fas.fa-star').length;
        let rb = b.querySelectorAll('.fas.fa-star').length;
        if (sortBy === 'price_asc') return pa - pb;
        if (sortBy === 'price_desc') return pb - pa;
        if (sortBy === 'rating') return rb - ra;
        return 0;
      });
      // 用 DocumentFragment 一次插入，减少回流
      let frag = document.createDocumentFragment();
      cards.forEach(c => frag.appendChild(c));
      grid.appendChild(frag);
    }

    window.sortVisibleCards = sortVisibleCards;
  }

  // ★ 从浏览历史跳转：URL hash 形如 #product-<id> 时自动打开对应产品详情
  function openProductByHash() {
    const m = location.hash.match(/^#product-(\d+)$/);
    if (!m) return;
    const pid = parseInt(m[1]);
    const card = document.querySelector(`.product-card[data-pid="${pid}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { const btn = card.querySelector('.btn-detail'); if (btn) btn.click(); }, 350);
  }
  window.addEventListener('hashchange', openProductByHash);
  openProductByHash();

  } // bindProductUI 结束

  // ★ 先渲染产品，再绑定交互（保证动态卡片能响应筛选/详情/搜索）
  renderProducts().then(bindProductUI);

  // ====== 7. 登录/注册弹窗 ======
  // ★ BUG修复：登录/注册属「输入型」弹窗，点击弹窗外不关闭（防误触丢失已填内容），
  //   只能通过右上角 × 或登录成功/切换忘记密码来关闭。
  window._showLogin = function() {
    showModal(`
      <div style="padding:30px;">
        <h2 id="authTitle" style="text-align:center;color:#3E2723;margin-bottom:24px;">登录</h2>
        <div id="authForm">
          <div style="margin-bottom:16px;"><input id="authUser" placeholder="用户名" style="width:100%;padding:12px;border:1px solid #D7CCC8;border-radius:8px;font-size:1rem;"></div>
          <div style="margin-bottom:16px;"><input id="authPass" type="password" placeholder="密码（至少6位）" style="width:100%;padding:12px;border:1px solid #D7CCC8;border-radius:8px;font-size:1rem;"></div>
          <div id="authPhone" style="display:none;margin-bottom:16px;"><input id="authPhoneInput" placeholder="手机号（选填）" style="width:100%;padding:12px;border:1px solid #D7CCC8;border-radius:8px;font-size:1rem;"></div>
          <div id="authError" style="color:#e74c3c;font-size:0.9rem;margin-bottom:12px;display:none;"></div>
          <button id="authBtn" style="width:100%;padding:14px;background:#8B5E3C;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">登 录</button>
          <p style="text-align:center;margin-top:16px;color:#8D6E63;font-size:0.9rem;">
            <span id="authSwitch" style="color:#8B5E3C;cursor:pointer;text-decoration:underline;">没有账号？立即注册</span>
            <span style="margin:0 8px;">|</span>
            <span id="forgotPw" style="color:#e74c3c;cursor:pointer;text-decoration:underline;">忘记密码？</span>
          </p>
        </div>
      </div>`, 'auth-modal', {clickOutsideClose: false});

    let mode = 'login';
    let title = $('#authTitle'), form = $('#authForm'),
        userInp = $('#authUser'), passInp = $('#authPass'),
        phoneDiv = $('#authPhone'), phoneInp = $('#authPhoneInput'),
        errDiv = $('#authError'), btn = $('#authBtn'), sw = $('#authSwitch');

    function setMode(m) {
      mode = m;
      title.textContent = m==='login'?'登录':'注册';
      btn.textContent = m==='login'?'登 录':'注 册';
      phoneDiv.style.display = m==='register'?'block':'none';
      sw.textContent = m==='login'?'没有账号？立即注册':'已有账号？去登录';
      errDiv.style.display = 'none';
    }

    sw.onclick = () => setMode(mode==='login'?'register':'login');
    $('#forgotPw').onclick = () => { closeAllModals(); window._showForgotPassword(); };

    btn.onclick = async function() {
      let u = userInp.value.trim(), p = passInp.value.trim();
      if (!u||!p) { errDiv.textContent='请填写用户名和密码'; errDiv.style.display='block'; return; }
      if (mode==='register') {
        if (p.length<6) { errDiv.textContent='密码至少6位'; errDiv.style.display='block'; return; }
        if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) { errDiv.textContent='密码必须包含字母和数字的组合'; errDiv.style.display='block'; return; }
      }
      try {
        let ep = mode==='login'?'/auth/login':'/auth/register';
        let body = {username:u, password:p};
        if (mode==='register') body.phone = phoneInp.value.trim();
        let r = await fetchAPI(ep, {method:'POST', body:JSON.stringify(body)});
        let d = await r.json();
        if (d.success) {
          currentUser = d.user;
          localStorage.setItem('yatan_user', JSON.stringify(d.user));
          closeAllModals();
          updateUserUI();
          alert(d.message);
        } else {
          errDiv.textContent = d.message; errDiv.style.display='block';
        }
      } catch(e) { errDiv.textContent='网络错误'; errDiv.style.display='block'; }
    };
  };

  // ====== 8. 用户状态栏（顶部） ★头像替换★ ======
  let userBar = createEl('div', {style:'position:fixed;top:0;right:20px;z-index:1001;display:flex;gap:10px;align-items:center;padding:5px 0;'});
  let hdrTop = $('.header-top');
  if (hdrTop) {
    userBar.innerHTML = `<span id="userGreeting" style="font-size:0.9rem;color:#8D6E63;cursor:pointer;display:flex;align-items:center;gap:8px;"></span>
      <span id="cartIcon" style="cursor:pointer;position:relative;font-size:1.1rem;color:#8B5E3C;" title="购物车">
        🛒<span id="cartBadge" style="position:absolute;top:-8px;right:-12px;background:#e74c3c;color:#fff;border-radius:50%;width:18px;height:18px;font-size:0.7rem;display:none;align-items:center;justify-content:center;">0</span>
      </span>`;
    hdrTop.appendChild(userBar);
    updateUserUI();
    $('#cartIcon').onclick = openCart;
  }

  function updateUserUI() {
    let g = $('#userGreeting'), b = $('#cartBadge');
    if (!g) return;
    if (currentUser) {
      let av = currentUser.avatar ? `<img src="${currentUser.avatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid #8B5E3C;" onerror="this.style.display='none'">` 
        : `<span style="width:28px;height:28px;border-radius:50%;background:#8B5E3C;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:14px;">${(currentUser.nickname||currentUser.username)[0]}</span>`;
      g.innerHTML = `${av} ${currentUser.nickname||currentUser.username} | <span style="color:#e74c3c;">退出</span>`;
      g.onclick = function(e) {
        if (e.target.textContent==='退出') { 
          // ★ 安全加固：退出登录同时清除服务端会话
          fetchAPI('/auth/logout', {method:'POST'}).catch(()=>{});
          currentUser=null; localStorage.removeItem('yatan_user'); updateUserUI(); alert('已退出'); 
        }
        else location.href = '/profile.html';
      };
      loadCartBadge();
    } else {
      g.innerHTML = '👤 登录 / 注册';
      g.onclick = () => window._showLogin();
      if (b) b.style.display = 'none';
    }
  }

  async function loadCartBadge() {
    if (!currentUser) return;
    try {
      let r = await fetchAPI(`/cart?user_id=${currentUser.id}`);
      let d = await r.json();
      let b = $('#cartBadge');
      if (b && d.count > 0) { b.style.display = 'flex'; b.textContent = d.count; }
      else if (b) b.style.display = 'none';
    } catch(e) {}
  }

  // ====== 9. 购物车 → 全页跳转 ======
  function openCart() {
    if (!currentUser) { window._showLogin(); return; }
    location.href = '/cart.html';
  }

  async function loadCartSidebar() {
    if (!currentUser) return;
    try {
      let r = await fetchAPI(`/cart?user_id=${currentUser.id}`);
      let d = await r.json();
      let items = d.items || [];
      let html = `<div style="padding:24px;">
        <h2 style="color:#3E2723;margin-bottom:20px;text-align:center;">🛒 我的购物车</h2>`;
      if (items.length===0) {
        html += `<p style="text-align:center;color:#999;padding:40px 0;">购物车是空的<br>快去挑选心仪的家具吧~</p>`;
      } else {
        items.forEach(item => {
          html += `<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #EFEBE9;align-items:center;">
            <img src="${item.image_url||''}" onerror="this.onerror=null;this.src=window.__FALLBACK_IMG" style="width:60px;height:60px;object-fit:contain;border-radius:6px;background:#FDF8F0;">
            <div style="flex:1;">
              <div style="font-weight:500;color:#2C1810;">${item.product_name}</div>
              <div style="color:#8B5E3C;font-weight:700;">¥${item.product_price}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button onclick="window._updateCartQty(${item.id},${item.quantity-1})" style="width:28px;height:28px;border:1px solid #D7CCC8;border-radius:4px;background:#fff;cursor:pointer;">-</button>
              <span style="min-width:24px;text-align:center;">${item.quantity}</span>
              <button onclick="window._updateCartQty(${item.id},${item.quantity+1})" style="width:28px;height:28px;border:1px solid #D7CCC8;border-radius:4px;background:#fff;cursor:pointer;">+</button>
            </div>
            <button onclick="window._removeCartItem(${item.id})" style="color:#e74c3c;background:none;border:none;cursor:pointer;font-size:1.2rem;">🗑</button>
          </div>`;
        });
        html += `<div style="text-align:right;padding:16px 0;font-size:1.2rem;color:#3E2723;">
          合计：<span style="color:#8B5E3C;font-weight:700;font-size:1.5rem;">¥${d.total.toLocaleString()}</span></div>
          <button onclick="window._checkout()" style="width:100%;padding:14px;background:#8B5E3C;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1.1rem;margin-top:8px;">
            <i class="fas fa-credit-card"></i> 立即结算
          </button>`;
      }
      html += `</div>`;
      showModal(html, 'cart-modal');
    } catch(e) { alert('加载购物车失败'); }
  }

  window._updateCartQty = async function(cid, qty) {
    if (qty < 1) { window._removeCartItem(cid); return; }
    await fetchAPI(`/cart/${cid}`, {method:'PUT', body:JSON.stringify({quantity:qty})});
    loadCartSidebar();
    loadCartBadge();
  };

  window._removeCartItem = async function(cid) {
    await fetchAPI(`/cart/${cid}`, {method:'DELETE'});
    loadCartSidebar();
    loadCartBadge();
  };

  window._addToCart = async function(name, price, img, qty) {
    // 需求1：加入购物车前先确认；未登录则先弹出登录框
    if (!currentUser) { window._showLogin(); return; }
    // 数量：卡片按钮传入 qty=1；详情弹窗未传时读取弹窗中的数量输入框
    let quantity = qty || parseInt(($('#modalQty')||{}).value || 1);
    if (isNaN(quantity) || quantity < 1) quantity = 1;   // 兜底：非法数量一律按 1 处理
    // 弹出确认对话框（叠加在当前弹窗之上，取消不关闭下方弹窗）
    showConfirmDialog({
      icon: '🛒',
      title: '您是否将该产品加入购物车？',
      message: '商品：' + name + '　数量：' + quantity + '　价格：¥' + (price * quantity).toLocaleString(),
      confirmText: '确认加入',
      cancelText: '取消',
      onConfirm: async function() {
        try {
          let r = await fetchAPI('/cart', {method:'POST', body:JSON.stringify({user_id:currentUser.id, product_name:name, product_price:price, quantity:quantity, image_url:img})});
          let d = await r.json();
          if (d.success) {
            closeAllModals();            // 关闭详情弹窗
            loadCartBadge();             // 刷新顶部购物车角标
            showToastMsg('✅ 加入购物车成功！', 'success');   // 需求1：成功反馈（绿色 toast 不打断浏览）
          } else {
            showToastMsg(d.message, 'error');
          }
        } catch(e) { showToastMsg('网络错误，加入失败', 'error'); }
      }
    });
  };

  // ====== 10. 立即购买（需求2：跳转购物车界面，未登录无法跳转） ======
  // 流程：已登录 → 商品加入购物车 → 跳转到 /cart.html 我的购物车界面 → 用户点「去结算」
  window._buyNow = async function(name, price, img) {
    // 未登录：弹出登录框，不执行跳转（需求2要求）
    if (!currentUser) { window._showLogin(); return; }
    let qty = parseInt(($('#modalQty')||{}).value || 1);
    if (isNaN(qty) || qty < 1) qty = 1;   // 数量兜底
    try {
      // 先加入购物车
      let r = await fetchAPI('/cart', {method:'POST', body:JSON.stringify({user_id:currentUser.id, product_name:name, product_price:price, quantity:qty, image_url:img})});
      let d = await r.json();
      if (d.success) {
        closeAllModals();       // 关闭详情弹窗
        loadCartBadge();        // 刷新购物车角标
        showToastMsg('✅ 已加入购物车，正在前往购物车结算...', 'success');
        // 稍作停留让用户看到反馈，再跳转到我的购物车界面
        setTimeout(function(){ location.href = '/cart.html'; }, 700);
      } else {
        showToastMsg(d.message, 'error');
      }
    } catch(e) { showToastMsg('加入购物车失败，请重试', 'error'); }
  };

  window._checkout = async function() {
    // 未登录：先登录
    if (!currentUser) { window._showLogin(); return; }
    // 需求3：确认「前往购买」后才下单（与购物车页去结算按钮保持一致的确认流程）
    showConfirmDialog({
      icon: '💳',
      title: '您是否将确认前往购买？',
      message: '确认后将为您生成订单，并通过微信扫码联系客服完成付款。',
      confirmText: '确认购买',
      cancelText: '取消',
      onConfirm: async function() {
        try {
          let r = await fetchAPI('/orders', {method:'POST', body:JSON.stringify({user_id:currentUser.id, username:currentUser.username})});
          let d = await r.json();
          closeAllModals();
          if (d.success) {
            loadCartBadge();
            // 下单成功 → 跳转联系的微信二维码（15秒后自动关闭）
            showWechatQR(d.message, d.total);
          } else {
            showToastMsg(d.message, 'error');
          }
        } catch(e) { showToastMsg('下单失败，请重试', 'error'); }
      }
    });
  };

  function showWechatQR(msg, total) {
    let secs = 15;
    let html = `<div style="padding:30px;text-align:center;">
      <h2 style="color:#3E2723;margin-bottom:8px;">✅ ${msg}</h2>
      <p style="color:#8D6E63;margin-bottom:20px;">请扫码联系客服确认订单</p>
      <div style="background:#FDF8F0;padding:20px;border-radius:12px;display:inline-block;">
        <!-- ★ BUG修复：原引用的 images/bbb.jpg 是个人照片，改为真正的微信二维码 ytyjs.jpg -->
        <img src="images/ytyjs.jpg" style="width:200px;height:200px;object-fit:contain;" alt="微信二维码" onerror="this.src='https://via.placeholder.com/200x200/8B5E3C/fff?text=WeChat+QR'">
        <p style="color:#8B5E3C;font-weight:700;margin-top:12px;">微信扫码添加客服</p>
      </div>
      <p id="qrTimer" style="color:#e74c3c;font-size:1.2rem;margin-top:16px;">窗口将在 <b>${secs}</b> 秒后自动关闭</p>
      <button onclick="document.getElementById('globalOverlay').style.display='none'" style="margin-top:16px;padding:10px 30px;background:#D7CCC8;border:none;border-radius:8px;cursor:pointer;">手动关闭</button>
    </div>`;
    showModal(html, 'wechat-modal');
    let timerEl = $('#qrTimer');
    let timer = setInterval(() => {
      secs--;
      if (timerEl) timerEl.innerHTML = `窗口将在 <b>${secs}</b> 秒后自动关闭`;
      if (secs <= 0) { clearInterval(timer); overlay.style.display='none'; overlay.innerHTML=''; }
    }, 1000);
  };

  // ====== 11. 忘记密码流程 ======
  // ★ 阶段状态挂到 window，便于弹窗内「返回」按钮正确回调
  window._fpStage = 1;
  window._fpPhone = '';
  window._fpCode = '';

  window._showForgotPassword = function() {
    window._fpStage = 1;
    window._fpPhone = '';
    window._fpCode = '';
    window._renderForgotPassword();
  };

  window._renderForgotPassword = function() {
    let stage = window._fpStage;
    let phone = window._fpPhone;
    let html = '';
    if (stage === 1) {
      html = `<h2 style="text-align:center;color:#3E2723;margin-bottom:20px;">🔑 找回密码</h2>
        <p style="text-align:center;color:#8D6E63;margin-bottom:20px;">请输入注册时绑定的手机号</p>
        <input id="fpPhone" placeholder="请输入11位手机号" style="width:100%;padding:12px;border:1px solid #D7CCC8;border-radius:8px;margin-bottom:16px;" maxlength="11">
        <div id="fpError" style="color:#e74c3c;font-size:0.9rem;margin-bottom:12px;display:none;"></div>
        <button id="fpBtn" style="width:100%;padding:14px;background:#8B5E3C;color:#fff;border:none;border-radius:8px;cursor:pointer;">获取验证码</button>`;
    } else if (stage === 2) {
      html = `<h2 style="text-align:center;color:#3E2723;margin-bottom:20px;">📱 验证身份</h2>
        <p style="text-align:center;color:#8D6E63;margin-bottom:8px;">验证码已发送到 ${phone}</p>
        <p style="text-align:center;color:#e74c3c;margin-bottom:20px;font-size:0.85rem;">(演示环境：请查看后端控制台日志中的验证码)</p>
        <input id="fpCode" placeholder="请输入6位验证码" maxlength="6" style="width:100%;padding:12px;border:1px solid #D7CCC8;border-radius:8px;margin-bottom:16px;text-align:center;font-size:1.5rem;letter-spacing:8px;">
        <div id="fpError" style="color:#e74c3c;font-size:0.9rem;margin-bottom:12px;display:none;"></div>
        <button id="fpBtn" style="width:100%;padding:14px;background:#8B5E3C;color:#fff;border:none;border-radius:8px;cursor:pointer;">验证</button>
        <p style="text-align:center;margin-top:12px;color:#8D6E63;cursor:pointer;" id="fpBack">← 返回修改手机号</p>`;
    } else if (stage === 3) {
      html = `<h2 style="text-align:center;color:#3E2723;margin-bottom:20px;">🔒 设置新密码</h2>
        <p style="text-align:center;color:#8D6E63;margin-bottom:20px;">请设置至少6位的新密码</p>
        <input id="fpNewPw" type="password" placeholder="新密码（至少6位）" style="width:100%;padding:12px;border:1px solid #D7CCC8;border-radius:8px;margin-bottom:12px;">
        <input id="fpNewPw2" type="password" placeholder="确认新密码" style="width:100%;padding:12px;border:1px solid #D7CCC8;border-radius:8px;margin-bottom:16px;">
        <div id="fpError" style="color:#e74c3c;font-size:0.9rem;margin-bottom:12px;display:none;"></div>
        <button id="fpBtn" style="width:100%;padding:14px;background:#4CAF50;color:#fff;border:none;border-radius:8px;cursor:pointer;">重置密码</button>`;
    }
    // ★ 忘记密码同属「输入型」弹窗：不设置 data-outside-close → 点击外部不关闭，
    //   并自带 × 关闭按钮（否则无法显式关闭）
    overlay.innerHTML = `<div class="modal-box" style="max-width:420px;padding:30px;position:relative;">
      <span onclick="document.getElementById('globalOverlay').style.display='none'" style="position:absolute;top:12px;right:16px;font-size:24px;cursor:pointer;z-index:10;color:#999;">&times;</span>
      ${html}</div>`;
    overlay.style.display = 'flex';

    let back = $('#fpBack');
    if (back) back.onclick = function(){ window._fpStage = 1; window._renderForgotPassword(); };

    let btn = $('#fpBtn'), err = $('#fpError');
    if (!btn) return;
    btn.onclick = async function() {
      err.style.display = 'none';
      if (window._fpStage === 1) {
        let phoneVal = ($('#fpPhone')||{}).value?.trim();
        if (!phoneVal || phoneVal.length!==11 || !/^\d+$/.test(phoneVal)) { err.textContent='请输入正确的11位手机号'; err.style.display='block'; return; }
        let r = await fetchAPI('/auth/forgot-password', {method:'POST', body:JSON.stringify({phone: phoneVal})});
        let d = await r.json();
        if (d.success) {
          window._fpPhone = phoneVal;
          window._fpStage = 2;
          // ★ 安全修复：验证码不再从接口明文返回（生产走短信；演示看后端控制台日志）
          window._fpCode = '';
          window._renderForgotPassword();
          alert('验证码已发送（演示环境请查看后端控制台日志）');
        } else { err.textContent = d.message; err.style.display = 'block'; }
      } else if (window._fpStage === 2) {
        let inputCode = ($('#fpCode')||{}).value?.trim();
        if (!inputCode || inputCode.length!==6) { err.textContent='请输入6位验证码'; err.style.display='block'; return; }
        let r = await fetchAPI('/auth/verify-code', {method:'POST', body:JSON.stringify({phone: window._fpPhone, code:inputCode})});
        let d = await r.json();
        if (d.success) { window._fpCode = inputCode; window._fpStage = 3; window._renderForgotPassword(); }
        else { err.textContent = d.message; err.style.display = 'block'; }
      } else if (window._fpStage === 3) {
        let pw1 = ($('#fpNewPw')||{}).value?.trim(), pw2 = ($('#fpNewPw2')||{}).value?.trim();
        if (!pw1 || pw1.length<6) { err.textContent='密码至少6位'; err.style.display='block'; return; }
        if (pw1 !== pw2) { err.textContent='两次密码不一致'; err.style.display='block'; return; }
        let r = await fetchAPI('/auth/reset-password', {method:'POST', body:JSON.stringify({phone: window._fpPhone, code: window._fpCode, password:pw1})});
        let d = await r.json();
        if (d.success) {
          closeAllModals(); alert('✅ 密码重置成功！请重新登录。'); window._showLogin();
        } else { err.textContent = d.message; err.style.display = 'block'; }
      }
    };
  };

  // ====== 12. 个人主页（查看+修改资料+注销） ======
  window._showProfile = async function() {
    if (!currentUser) { window._showLogin(); return; }
    try {
      let r = await fetchAPI('/user/profile?user_id=' + currentUser.id);
      let d = await r.json();
      if (!d.success) { alert(d.message); return; }
      let u = d.user;
      // ★ 本地生成首字母头像（SVG data URI），替代被墙的 ui-avatars.com
      function _localAvatar(name) {
        const ch = encodeURIComponent(String(name || '?').trim().charAt(0).toUpperCase() || '?');
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#8B5E3C"/><text x="50" y="52" text-anchor="middle" dominant-baseline="middle" font-size="44" fill="#fff" font-family="Microsoft YaHei">' + ch + '</text></svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      }
      let av = u.avatar || _localAvatar(u.nickname || u.username);
      showModal(`
        <div style="padding:30px;">
          <div style="text-align:center;margin-bottom:24px;">
            <img src="${av}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid #8B5E3C;" id="profileAvatar" onerror="this.onerror=null;this.src='${_localAvatar(u.nickname || u.username)}'">
            <p style="color:#8D6E63;font-size:0.8rem;margin-top:8px;cursor:pointer;" onclick="let url=prompt('输入头像图片URL:');if(url){document.getElementById('profileAvatar').src=url;window._profileAvatarUrl=url;}">点击修改头像</p>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div><label style="font-size:0.8rem;color:#8D6E63;">昵称</label><input id="pfNick" value="${u.nickname||''}" style="width:100%;padding:10px;border:1px solid #D7CCC8;border-radius:6px;"></div>
            <div><label style="font-size:0.8rem;color:#8D6E63;">性别</label><select id="pfGender" style="width:100%;padding:10px;border:1px solid #D7CCC8;border-radius:6px;"><option value="">保密</option><option value="男" ${u.gender==='男'?'selected':''}>男</option><option value="女" ${u.gender==='女'?'selected':''}>女</option></select></div>
            <div><label style="font-size:0.8rem;color:#8D6E63;">年龄</label><input id="pfAge" type="number" value="${u.age||''}" min="0" max="150" style="width:100%;padding:10px;border:1px solid #D7CCC8;border-radius:6px;"></div>
            <div><label style="font-size:0.8rem;color:#8D6E63;">地区</label><input id="pfRegion" value="${u.region||''}" placeholder="如：南宁" style="width:100%;padding:10px;border:1px solid #D7CCC8;border-radius:6px;"></div>
          </div>
          <div style="margin-top:12px;"><label style="font-size:0.8rem;color:#8D6E63;">个性签名</label><input id="pfSig" value="${u.signature||''}" placeholder="写一句个性签名..." style="width:100%;padding:10px;border:1px solid #D7CCC8;border-radius:6px;"></div>
          <div style="margin-top:12px;"><label style="font-size:0.8rem;color:#8D6E63;">手机号</label><input id="pfPhone" value="${u.phone||''}" style="width:100%;padding:10px;border:1px solid #D7CCC8;border-radius:6px;"></div>
          <div style="margin-top:12px;"><label style="font-size:0.8rem;color:#8D6E63;">邮箱</label><input id="pfEmail" value="${u.email||''}" style="width:100%;padding:10px;border:1px solid #D7CCC8;border-radius:6px;"></div>
          <div style="margin-top:20px;display:flex;gap:10px;">
            <button onclick="window._saveProfile(${u.id})" style="flex:1;padding:12px;background:#4CAF50;color:#fff;border:none;border-radius:8px;cursor:pointer;">💾 保存资料</button>
            <button onclick="window._deleteAccount(${u.id})" style="padding:12px 20px;background:#e74c3c;color:#fff;border:none;border-radius:8px;cursor:pointer;">注销账户</button>
          </div>
        </div>`, 'profile-modal');
    } catch(e) { alert('加载失败'); }
  };

  window._saveProfile = async function(uid) {
    let data = {
      user_id: uid,
      nickname: ($('#pfNick')||{}).value||'',
      gender: ($('#pfGender')||{}).value||'',
      age: ($('#pfAge')||{}).value||'',
      region: ($('#pfRegion')||{}).value||'',
      signature: ($('#pfSig')||{}).value||'',
      phone: ($('#pfPhone')||{}).value||'',
      email: ($('#pfEmail')||{}).value||'',
      avatar: window._profileAvatarUrl || ''
    };
    let r = await fetchAPI('/user/profile', {method:'PUT', body:JSON.stringify(data)});
    let d = await r.json();
    if (d.success) {
      // 更新本地缓存
      Object.assign(currentUser, data);
      localStorage.setItem('yatan_user', JSON.stringify(currentUser));
      closeAllModals(); updateUserUI(); alert('✅ 资料已保存！');
    } else { alert(d.message); }
  };

  window._deleteAccount = function(uid) {
    showModal(`<div style="padding:30px;text-align:center;">
      <h2 style="color:#e74c3c;margin-bottom:16px;">⚠️ 注销账户</h2>
      <p style="color:#666;margin-bottom:8px;">· 您的个人信息将被清除</p>
      <p style="color:#666;margin-bottom:8px;">· 购物车数据将被清空</p>
      <p style="color:#666;margin-bottom:8px;">· 历史订单记录将保留（匿名化）</p>
      <p style="color:#e74c3c;margin-bottom:20px;font-weight:700;">此操作不可恢复！</p>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button onclick="document.getElementById('globalOverlay').style.display='none'" style="padding:10px 24px;background:#D7CCC8;border:none;border-radius:8px;cursor:pointer;">取消</button>
        <button id="confirmDeleteAcct" style="padding:10px 24px;background:#e74c3c;color:#fff;border:none;border-radius:8px;cursor:pointer;">确认注销</button>
      </div></div>`, 'danger-modal');
    $('#confirmDeleteAcct').onclick = async function() {
      let r = await fetchAPI('/user/account?user_id=' + uid, {method:'DELETE'});
      let d = await r.json();
      closeAllModals();
      currentUser = null; localStorage.removeItem('yatan_user'); updateUserUI();
      alert(d.message);
    };
  };

  // 订单历史
  async function loadOrders() {
    try {
      let r = await fetchAPI(`/orders?user_id=${currentUser.id}`);
      let d = await r.json();
      if (!d.orders.length) return '<p style="color:#999;text-align:center;padding:30px;">暂无订单</p>';
      return d.orders.map(o => {
        let items = typeof o.items_json==='string' ? JSON.parse(o.items_json) : o.items_json;
        let statusMap = {pending:'⏳待确认', confirmed:'✅已确认', shipped:'🚚已发货', completed:'✔已完成'};
        return `<div style="background:#FDF8F0;border-radius:8px;padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="font-weight:700;">订单 #${o.id}</span>
            <span style="color:#8B5E3C;">${statusMap[o.status]||o.status}</span>
          </div>
          <div style="font-size:0.9rem;color:#666;">${o.created_at?.substring(0,16)||''} | ¥${o.total_amount}</div>
          <div style="margin-top:8px;color:#2C1810;font-size:0.9rem;">${items.map(i=>`${i.product_name} ×${i.quantity}`).join('、')}</div>
        </div>`;
      }).join('');
    } catch(e) { return '<p style="color:#e74c3c;">加载失败</p>'; }
  }

  // ====== 12. 悬浮客服按钮 ======
  let csBtn = createEl('div', {style:'position:fixed;bottom:90px;right:30px;width:56px;height:56px;background:#8B5E3C;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:998;box-shadow:0 4px 16px rgba(139,94,60,0.4);font-size:1.3rem;transition:all .3s ease;', title:'联系客服', html:'💬', onclick:function(){
    showChatWidget();
  }});
  document.body.appendChild(csBtn);

  function showChatWidget() {
    let html = `<div style="padding:0;text-align:center;position:relative;">
      <span onclick="document.getElementById('globalOverlay').style.display='none'" style="position:absolute;top:12px;right:16px;font-size:24px;cursor:pointer;z-index:10;color:#999;">&times;</span>
      <div style="background:linear-gradient(135deg,#8B5E3C,#C67B4B);padding:30px 20px;border-radius:12px 12px 0 0;color:#fff;">
        <h3 style="margin:0;font-size:1.3rem;font-weight:600;">扫码添加微信</h3>
        <p style="margin:8px 0 0;font-size:0.9rem;opacity:0.9;">专业顾问一对一服务</p>
      </div>
      <div style="padding:30px 20px;background:#fff;">
        <div style="background:#FDF8F0;padding:20px;border-radius:12px;display:inline-block;border:2px solid #E8DDD0;">
          <!-- ★ BUG修复：原引用的 images/bbb.jpg 是个人照片，改为真正的微信二维码 ytyjs.jpg -->
          <img src="images/ytyjs.jpg" style="width:180px;height:180px;object-fit:contain;border-radius:8px;" alt="微信二维码" onerror="this.src='https://via.placeholder.com/180x180/8B5E3C/fff?text=WeChat+QR'">
        </div>
        <p style="color:#8B5E3C;font-weight:700;margin:16px 0 4px;font-size:1rem;">📱 微信扫码添加客服</p>
        <p style="color:#999;font-size:0.85rem;margin:0;">了解更多家具优惠信息</p>
      </div>
      <div style="background:#FDF8F0;padding:14px 20px;border-radius:0 0 12px 12px;color:#8B5E3C;font-size:0.85rem;">
        <i class="fas fa-phone"></i> 客服热线：15777165360
      </div>
    </div>`;
    showModal(html, 'chat-widget-modal');
  }

  // ====== 13. 表单提交（原有咨询表单） ======
  let cf = $('#consultForm');
  if (cf) {
    cf.addEventListener('submit', async function(e){
      e.preventDefault();
      let name = ($('#username')||{}).value||'', phone = ($('#phone')||{}).value||'', email = ($('#email')||{}).value||'',
          msg = ($('#message')||{}).value||'';
      // ★ BUG修复：咨询类型下拉框之前从未提交，选了也丢失
      let consultType = (($('#consultType')||{}).value||'').trim();
      if (!name||!phone) { alert('请填写姓名和联系电话'); return; }
      if (!/^1[3-9]\d{9}$/.test(phone)) { alert('请输入正确的11位手机号码'); return; }
      try {
        let r = await fetchAPI('/consult', {method:'POST', body:JSON.stringify({name,phone,email,message:msg,consult_type:consultType})});
        let d = await r.json();
        alert(d.message||'提交成功！'); if(d.success) this.reset();
      } catch(e) { alert('网络错误，请直接拨打客服电话'); }
    });
  }

  // 页脚订阅
  let ff = $('.footer-form');
  if (ff) ff.addEventListener('submit', async function(e){
    e.preventDefault();
    let ei = this.querySelector('input[type="email"]'), em = ei?ei.value.trim():'';
    if (!em||!em.includes('@')) { alert('请输入有效邮箱'); return; }
    try { let r = await fetchAPI('/subscribe', {method:'POST', body:JSON.stringify({email:em})}); let d = await r.json(); alert(d.message); if(d.success) ei.value=''; }
    catch(e) { alert('网络错误'); }
  });

  // 微信二维码弹窗（联系区域）
  (function(){
    let wb=$('#wechatBtn'), wm=$('#wechatModal'), cb=$('.close-modal');
    if(wb&&wm){ wb.onclick=()=>wm.classList.add('show'); wm.onclick=e=>{if(e.target===wm)wm.classList.remove('show');}; if(cb)cb.onclick=()=>wm.classList.remove('show'); }
  })();

  // ====== 初始化 ======
  if (currentUser) updateUserUI();
  loadCartBadge();
  // ★ BUG修复：购物车页"去登录"跳回首页时自动弹出登录框（原先标记写了没人读）
  if (localStorage.getItem('showLogin') === '1') {
    localStorage.removeItem('showLogin');
    setTimeout(() => window._showLogin(), 300);
  }
});

// ====== 表单字节限制（独立函数） ======
function checkByteLength(s) { return encodeURI(s).replace(/%[A-F\d]{2}/g,'X').length; }
function checkByteLimit(el, max) { while(checkByteLength(el.value)>max) el.value=el.value.slice(0,-1); }
