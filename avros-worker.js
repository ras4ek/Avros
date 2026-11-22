/* Avros backend — Cloudflare Worker (бесплатный тариф).
   Deploy: dash.cloudflare.com → Workers & Pages → Create Worker → вставить этот файл → Deploy.
   Потом в Avros: Настройки → «Свой сервер» → вставить URL worker'а → «Сохранить и проверить».
   Проверка: https://<твой-worker>/ping  должно вернуть ok, /health — состояние источников. */

'use strict';

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-max-age': '86400'
};
const MD = 'https://api.mangadex.org';
const MDR = '&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica';
const RM_HOSTS = ['https://remanga.org/api', 'https://api.remanga.org/api'];
const RM_REF = 'https://remanga.org/';
const cache = caches.default;

addEventListener('fetch', event => {
  event.respondWith(route(event.request).catch(e => json({ error: String((e && e.message) || e) }, 502)));
});

/* ---------- базовые ответы ---------- */
function out(body, status, headers, type) {
  const h = Object.assign({}, CORS, headers || {});
  if (type) h['content-type'] = type;
  return new Response(body, { status: status || 200, headers: h });
}
function json(v, s) { return out(JSON.stringify(v), s, { 'content-type': 'application/json; charset=utf-8' }); }
function text(v, s) { return out(v, s, { 'content-type': 'text/plain; charset=utf-8' }); }
function textResponse(s) { return new Response(s, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }); }
function corsCopy(r) {
  const x = new Response(r.body, r);
  Object.keys(CORS).forEach(k => x.headers.set(k, CORS[k]));
  return x;
}

async function getCache(req, ttl, fn) {
  const key = new Request(req.url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const r = await fn();
  if (r.status === 200) {
    const copy = corsCopy(r);
    copy.headers.set('cache-control', 'public, max-age=' + ttl);
    await cache.put(key, copy.clone());
    return copy;
  }
  return corsCopy(r);
}

/* ---------- сетевой слой ---------- */
async function grab(u, ref) {
  let url;
  try { url = new URL(u); } catch (e) { throw new Error('Некорректная ссылка'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Разрешены только http/https');
  const r = await fetch(url.href, {
    headers: {
      'user-agent': UA,
      'accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8',
      'referer': ref || (url.origin + '/')
    },
    redirect: 'follow'
  });
  if (!r.ok) throw new Error('Источник ответил ' + r.status);
  return r;
}
async function apiText(u, ref) { return (await grab(u, ref)).text(); }
function stripJunk(x) {
  const k = x.indexOf('Markdown Content:');
  if (k >= 0 && x.indexOf('URL Source:') >= 0) x = x.slice(k + 17);
  x = x.trim();
  const i = x.search(/[\[{]/), j = Math.max(x.lastIndexOf('}'), x.lastIndexOf(']'));
  if (i >= 0 && j > i) {
    const s = x.slice(i, j + 1);
    try { JSON.parse(s); return s; } catch (e) {}
  }
  return x;
}
async function apiJson(u, ref) { return JSON.parse(stripJunk(await apiText(u, ref))); }
async function rmApi(path) {
  let last;
  for (const host of RM_HOSTS) {
    try { return await apiJson(host + path, RM_REF); }
    catch (e) { last = e; }
  }
  throw last || new Error('ReManga недоступен');
}
function abs(p, base) {
  try { return new URL(p, base).href.replace(/^http:/, 'https:'); } catch (e) { return ''; }
}

/* ---------- извлечение картинок с обычной страницы ---------- */
function extractImages(html, base) {
  html = html.replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const re = /["'(]([^"'()\s<>]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'()\s<>]*)?)["')]/gi;
  const seen = new Set(), all = [];
  let m;
  while ((m = re.exec(html))) {
    let u;
    try { u = new URL(m[1], base).href; } catch (e) { continue; }
    if (!/^https?:/.test(u) || seen.has(u)) continue;
    seen.add(u); all.push(u);
  }
  const dir = u => { const x = new URL(u); return x.origin + x.pathname.replace(/[^/]*$/, ''); };
  const groups = {};
  all.forEach(u => { const k = dir(u); (groups[k] = groups[k] || []).push(u); });
  const seq = /(\/|[-_])\d{1,4}\.(jpe?g|png|webp|avif)/i;
  let best = [], score = -1;
  Object.values(groups).forEach(a => {
    const s = a.length + a.filter(u => seq.test(u)).length * 2;
    if (s > score) { score = s; best = a; }
  });
  return best.map(u => u.replace(/^http:/, 'https:'));
}

/* ---------- MangaDex ---------- */
function mdTitle(m) {
  const t = m.attributes && m.attributes.title || {};
  return t.en || t.ru || t['ja-ro'] || Object.values(t)[0] || 'Без названия';
}
async function mdSearch(q) {
  const d = await apiJson(MD + '/manga?limit=20&includes[]=cover_art&order[relevance]=desc' + MDR + '&title=' + encodeURIComponent(q), MD + '/');
  return (d.data || []).map(m => {
    const c = (m.relationships || []).find(r => r.type === 'cover_art');
    return {
      id: m.id, provider: 'md', title: mdTitle(m),
      sub: [m.attributes.year, m.attributes.status].filter(Boolean).join(' · '),
      cover: c && c.attributes ? 'https://uploads.mangadex.org/covers/' + m.id + '/' + c.attributes.fileName + '.256.jpg' : ''
    };
  });
}
async function mdChapters(id) {
  let all = [], off = 0, total = 1;
  while (off < total && off < 1500) {
    const d = await apiJson(MD + '/manga/' + id + '/feed?limit=500&offset=' + off + '&order[chapter]=asc&translatedLanguage[]=ru&translatedLanguage[]=en&includeExternalUrl=0' + MDR, MD + '/');
    total = d.total || 0; off += 500; all = all.concat(d.data || []);
  }
  return all.filter(c => c.attributes && c.attributes.pages > 0 && !c.attributes.externalUrl).map(c => {
    const a = c.attributes;
    return {
      key: 'mangadex:' + c.id,
      label: 'Глава ' + (a.chapter || '?') + (a.title ? ' · ' + a.title : ''),
      sub: (a.translatedLanguage || '').toUpperCase() + ' · ' + a.pages + ' стр.',
      lang: a.translatedLanguage || ''
    };
  });
}
async function mdChapter(id, quality) {
  const d = await apiJson(MD + '/at-home/server/' + id, MD + '/');
  const h = d.chapter && d.chapter.hash, base = (d.baseUrl || '').replace(/^http:/, 'https:');
  if (!h || !base) throw new Error('MangaDex не дал адрес картинок');
  const full = quality === 'full';
  const files = full ? (d.chapter.data || []) : (d.chapter.dataSaver || d.chapter.data || []);
  const mode = full ? 'data' : 'data-saver';
  if (!files.length) throw new Error('В главе нет страниц');
  return { url: 'https://mangadex.org/chapter/' + id, images: files.map(f => base + '/' + mode + '/' + h + '/' + f) };
}

/* ---------- ReManga ---------- */
async function rmSearch(q) {
  const d = await rmApi('/search/?query=' + encodeURIComponent(q) + '&page=1&count=20&field=titles');
  return (d.content || []).map(i => {
    const im = i.img || {}, p = im.mid || im.low || im.high;
    return {
      id: i.dir, provider: 'rm', title: i.rus_name || i.main_name || i.dir,
      sub: i.rus_name && i.main_name ? i.main_name : '',
      cover: p ? abs(p, RM_REF) : ''
    };
  });
}
async function rmChapters(dir) {
  const t = await rmApi('/titles/' + encodeURIComponent(dir) + '/');
  const c = t.content || {}, br = (c.branches || [])[0];
  if (!br) return [];
  let all = [];
  for (let p = 1; p <= 10; p++) {
    const d = await rmApi('/titles/chapters/?branch_id=' + br.id + '&ordering=index&page=' + p + '&count=100&user_data=1');
    const it = d.content || [];
    all = all.concat(it);
    if (it.length < 100) break;
  }
  return all.filter(x => !x.is_paid).map(x => ({
    key: 'remanga:' + x.id,
    label: 'Том ' + x.tome + ' · Глава ' + x.chapter + (x.name ? ' · ' + x.name : ''),
    sub: '', lang: 'ru'
  }));
}
function flatPages(a) { return Array.isArray(a) ? a.flatMap(flatPages) : [a]; }
async function rmChapter(id) {
  const d = await rmApi('/titles/chapters/' + encodeURIComponent(id) + '/');
  const pages = flatPages((d.content || {}).pages || []).filter(p => p && p.link).sort((a, b) => (a.id || 0) - (b.id || 0));
  if (!pages.length) throw new Error('В главе нет страниц (возможно, она платная)');
  return { url: 'https://remanga.org/manga/chapter/' + id, images: pages.map(p => abs(p.link, RM_REF)) };
}

/* ---------- роутинг ---------- */
async function route(req) {
  if (req.method === 'OPTIONS') return out('', 204);
  const u = new URL(req.url), q = u.searchParams, p = u.pathname;

  if (p === '/ping') return text('ok');
  if (p === '/health') {
    const r = {};
    try { const d = await apiJson(MD + '/manga?limit=1', MD + '/'); r.mangadex = d.data ? 'ok' : 'empty'; }
    catch (e) { r.mangadex = String(e.message || e); }
    for (const host of RM_HOSTS) {
      try { await apiJson(host + '/search/?query=test', RM_REF); r[host] = 'ok'; break; }
      catch (e) { r[host] = String(e.message || e); }
    }
    return json(r);
  }
  if (p === '/api') {
    const url = q.get('url');
    if (!url) return json({ error: 'нужен параметр url' }, 400);
    return getCache(req, 300, () => textResponse(await apiText(url, q.get('ref'))));
  }
  if (p === '/img') {
    const url = q.get('url');
    if (!url) return json({ error: 'нужен параметр url' }, 400);
    return getCache(req, 86400, async () => {
      const r = await grab(url, q.get('ref') || RM_REF);
      return new Response(r.body, {
        status: 200,
        headers: { 'content-type': r.headers.get('content-type') || 'image/jpeg' }
      });
    });
  }
  if (p === '/search') {
    const provider = q.get('provider') === 'rm' ? 'rm' : 'md';
    const s = (q.get('q') || '').trim();
    if (!s) return json({ items: [] });
    const items = provider === 'rm' ? await rmSearch(s) : await mdSearch(s);
    return json({ items: items });
  }
  if (p === '/chapters') {
    const provider = q.get('provider') === 'rm' ? 'rm' : 'md';
    const id = (q.get('id') || '').trim();
    if (!id) return json({ error: 'нужен параметр id' }, 400);
    const chapters = provider === 'rm' ? await rmChapters(id) : await mdChapters(id);
    return json({ chapters: chapters });
  }
  if (p === '/chapter') {
    const provider = q.get('provider') === 'rm' ? 'rm' : 'md';
    const id = (q.get('id') || '').trim();
    if (!id) return json({ error: 'нужен параметр id' }, 400);
    return json(provider === 'rm' ? await rmChapter(id) : await mdChapter(id, q.get('quality')));
  }
  if (p === '/read') {
    const url = q.get('url');
    if (!url) return json({ error: 'нужен параметр url' }, 400);
    const html = await apiText(url, q.get('ref'));
    return json({ url: url, images: extractImages(html, url).slice(0, 400) });
  }
  return json({
    name: 'Avros backend',
    endpoints: ['/ping', '/health', '/api?url=...&ref=...', '/img?url=...&ref=...', '/search?provider=md|rm&q=...', '/chapters?provider=md|rm&id=...', '/chapter?provider=md|rm&id=...&quality=full', '/read?url=...']
  });
}
