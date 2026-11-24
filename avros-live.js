/* Avros Live — общие указатели, тапы и свайпы в комнате.
   Подключается отдельным файлом, внутрь приложения не влезает:
   читает и пишет только свою ветку live/<uid> в комнате Firebase. */
(function () {
  var W = window;
  try { if (W.__avlTear) W.__avlTear(); } catch (e) {}
  W.__avlOn = true;

  var CSS = [
    '.cur,.mk{display:none!important}',
    '.avl-layer{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:22;contain:layout style}',
    '.avl-p{position:absolute;left:0;top:0;width:0;height:0;transition:transform .1s linear;will-change:transform}',
    '.avl-dot{position:absolute;left:-10px;top:-10px;width:20px;height:20px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 4px rgba(255,255,255,.15),0 6px 18px rgba(0,0,0,.55)}',
    '.avl-dot:after{content:"";position:absolute;left:-8px;top:-8px;right:-8px;bottom:-8px;border-radius:50%;border:1.5px solid rgba(255,255,255,.6);animation:avlPulse 1.9s ease-out infinite}',
    '@keyframes avlPulse{0%{transform:scale(.65);opacity:.85}75%{transform:scale(1.55);opacity:0}100%{opacity:0}}',
    '.avl-fl{left:0;top:0}',
    '.avl-tag{position:absolute;left:16px;top:-12px;padding:3px 10px;border-radius:12px;font:700 11px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.5)}',
    '.avl-p.idle{opacity:.45}',
    '.avl-p.gone{opacity:0;transition:opacity .5s}',
    '.avl-rip{position:absolute;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2px solid #fff;animation:avlRip 1s cubic-bezier(.2,.7,.3,1) forwards;pointer-events:none}',
    '@keyframes avlRip{0%{transform:scale(.3);opacity:.95}100%{transform:scale(3.4);opacity:0}}',
    '.avl-sw{position:absolute;left:0;top:0;height:4px;border-radius:4px;transform-origin:0 50%;pointer-events:none;box-shadow:0 0 14px currentColor;animation:avlFade 1.15s ease-out forwards}',
    '.avl-sw:after{content:"";position:absolute;right:-3px;top:-4px;border:6px solid transparent;border-left:11px solid currentColor}',
    '@keyframes avlFade{0%{opacity:0}18%{opacity:.95}100%{opacity:0}}',
    '.avl-rl{position:absolute;left:0;right:0;height:0;border-top:2px dashed currentColor;opacity:.55;pointer-events:none}',
    '.avl-rl span{position:absolute;right:6px;top:-22px;padding:2px 9px;border-radius:9px;font:700 10px/1.4 system-ui,sans-serif;color:#fff;white-space:nowrap;opacity:.95}',
    '.avl-live{position:fixed;left:10px;bottom:104px;display:flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;background:rgba(20,14,34,.72);border:1px solid rgba(255,255,255,.14);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;font:800 11px/1 system-ui,sans-serif;letter-spacing:.4px;z-index:41;pointer-events:none;box-shadow:0 8px 22px rgba(0,0,0,.4)}',
    '.avl-live i{width:7px;height:7px;border-radius:50%;background:#37e39b;box-shadow:0 0 10px #37e39b;animation:avlBlink 1.6s infinite}',
    '@keyframes avlBlink{0%,100%{opacity:1}50%{opacity:.25}}',
    '.avl-edge{position:fixed;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font:700 11px/1 system-ui,sans-serif;color:#fff;background:rgba(20,14,34,.86);border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 26px rgba(0,0,0,.5);z-index:42;cursor:pointer}',
    '.avl-edge.top{top:8px}.avl-edge.bot{bottom:112px}',
    '#chat .msg{border-radius:14px;padding:7px 11px;margin-bottom:7px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.06)}',
    '#chat .msg.mine{background:linear-gradient(135deg,rgba(139,108,255,.28),rgba(255,95,162,.22));border-color:rgba(255,255,255,.14)}'
  ].join('');

  var st = document.createElement('style');
  st.id = 'avl-css';
  st.textContent = CSS;
  document.head.appendChild(st);

  var layer = null, edge = null, pill = null;
  var reader = null, wrap = null, room = null, me = null;
  var state = {}, seen = {}, readEls = {};
  var timer = null;

  function g(name) { try { return eval(name); } catch (e) { return undefined; } }
  function mk(t, c) { var e = document.createElement(t); if (c) e.className = c; return e; }

  function boot() {
    reader = g('reader') || document.getElementById('reader');
    wrap = g('wrap') || document.getElementById('wrap');
    room = g('roomRef');
    me = g('uid');
    if (!reader || !wrap || !room || !me) { setTimeout(boot, 500); return; }
    if (!layer) {
      layer = mk('div', 'avl-layer');
      reader.appendChild(layer);
      pill = mk('div', 'avl-live');
      pill.innerHTML = '<i></i><span>LIVE</span>';
      document.body.appendChild(pill);
      edge = mk('div', 'avl-edge');
      edge.hidden = true;
      document.body.appendChild(edge);
      edge.addEventListener('click', function () {
        var p = edge._peer;
        if (p && typeof setPos === 'function') setPos(p.p, p.o || 0);
      });
    }
    listen();
    bindGestures();
    patchInvite();
    setInterval(checkRoom, 900);
  }

  function checkRoom() {
    var r = g('roomRef');
    if (!r || r === room) return;
    try { room.child('live').off(); } catch (e) {}
    try { room.child('users').off(); } catch (e) {}
    room = r;
    Object.keys(state).forEach(function (k) {
      if (k.indexOf(':p') >= 0 && state[k] && state[k].el) state[k].el.remove();
    });
    state = {}; seen = {};
    Object.keys(readEls).forEach(function (k) { readEls[k].remove(); delete readEls[k]; });
    if (edge) edge.hidden = true;
    listen();
  }

  function patchInvite() {
    var sc = document.getElementById('showCode');
    if (!sc || sc._avl) return;
    sc._avl = 1;
    sc.onclick = function () {
      var base;
      try {
        if (window.parent && window.parent !== window) base = window.parent.location.origin + window.parent.location.pathname;
        else base = location.origin + location.pathname;
      } catch (e) { base = location.origin + location.pathname; }
      var link = base + '?room=' + (g('roomCode') || '');
      var p = navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject();
      p.then(function () {
        if (typeof toast === 'function') toast('Ссылка-приглашение скопирована');
        else alert(link);
      }, function () { prompt('Ссылка:', link); });
    };
  }

  function px() { return reader.clientWidth || 1; }
  function py() { return reader.clientHeight || 1; }
  function at(fx, fy) { return 'translate3d(' + (fx * px()) + 'px,' + (fy * py()) + 'px,0)'; }

  function listen() {
    room.child('live').on('value', function (s) {
      var d = s.val() || {};
      Object.keys(d).forEach(function (k) {
        if (k === me) return;
        var v = d[k];
        if (!v || !v.ts || v.ts <= (seen[k] || 0)) return;
        seen[k] = v.ts;
        handle(k, v);
      });
    });
    room.child('users').on('value', function (s) {
      var p = s.val() || {};
      Object.keys(p).forEach(function (k) { p[k].uid = k; });
      state.peers = p;
      renderWho(p);
      renderReads(p);
      renderLive(p);
    });
    wrap.addEventListener('scroll', placeAll, { passive: true });
    window.addEventListener('resize', placeAll);
    if (timer) clearInterval(timer);
    timer = setInterval(function () { placeAll(); stale(); }, 700);
  }

  function colorOf(k) {
    var p = (state.peers || {})[k] || {};
    return p.color || '#8b6cff';
  }
  function nameOf(k) {
    var p = (state.peers || {})[k] || {};
    return p.name || 'Гость';
  }

  function pointer(k) {
    var c = state[k + ':p'];
    if (!c) {
      c = state[k + ':p'] = { el: mk('div', 'avl-p'), dot: mk('div', 'avl-dot'), tag: mk('div', 'avl-tag') };
      c.el.appendChild(c.dot);
      c.el.appendChild(c.tag);
      layer.appendChild(c.el);
    }
    c.el.style.display = '';
    c.el.classList.remove('gone', 'idle');
    c.dot.style.background = colorOf(k);
    c.tag.style.background = colorOf(k);
    c.tag.textContent = nameOf(k);
    return c;
  }

  function moveTo(k, fx, fy) {
    var c = pointer(k);
    c.fx = fx; c.fy = fy;
    c.el.style.transform = at(fx, fy);
    c.t = Date.now();
  }

  function handle(k, v) {
    if (typeof v.x !== 'number' || typeof v.y !== 'number') return;
    var col = colorOf(k);
    if (v.k === 'swipe' && typeof v.x2 === 'number') {
      var x1 = v.x * px(), y1 = v.y * py(), x2 = v.x2 * px(), y2 = v.y2 * py();
      var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
      if (len > 6) {
        var a = mk('div', 'avl-sw');
        a.style.width = len + 'px';
        a.style.background = 'linear-gradient(90deg,rgba(255,255,255,0),' + col + ')';
        a.style.color = col;
        a.style.transform = 'translate3d(' + x1 + 'px,' + y1 + 'px,0) rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI) + 'deg)';
        layer.appendChild(a);
        setTimeout(function () { a.remove(); }, 1200);
      }
      moveTo(k, v.x2, v.y2);
      ripple(k, v.x, v.y, col);
      return;
    }
    moveTo(k, v.x, v.y);
    ripple(k, v.x, v.y, col);
  }

  function ripple(k, fx, fy, col) {
    var r = mk('div', 'avl-rip');
    r.style.borderColor = col;
    r.style.transform = 'translate3d(' + (fx * px()) + 'px,' + (fy * py()) + 'px,0)';
    layer.appendChild(r);
    setTimeout(function () { r.remove(); }, 1050);
    var t = mk('div', 'avl-tag avl-fl');
    t.textContent = nameOf(k);
    t.style.background = col;
    t.style.transform = 'translate3d(' + (fx * px() + 14) + 'px,' + (fy * py() - 30) + 'px,0)';
    t.style.opacity = '1';
    t.style.transition = 'opacity .5s, transform .8s';
    layer.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transform += ' translateY(-14px)'; }, 700);
    setTimeout(function () { t.remove(); }, 1400);
    blip();
  }

  var ac = null;
  function blip() {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), gg = ac.createGain();
      o.frequency.value = 660; o.type = 'sine';
      gg.gain.value = 0.05;
      o.connect(gg); gg.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + 0.06);
    } catch (e) {}
  }

  function selfRipple(fx, fy) {
    var r = mk('div', 'avl-rip');
    r.style.borderColor = 'rgba(255,255,255,.85)';
    r.style.transform = 'translate3d(' + (fx * px()) + 'px,' + (fy * py()) + 'px,0)';
    layer.appendChild(r);
    setTimeout(function () { r.remove(); }, 1050);
  }

  function bindGestures() {
    var start = null, last = 0;
    function norm(e) {
      var r = reader.getBoundingClientRect();
      var x = (e.clientX - r.left) / (r.width || 1);
      var y = (e.clientY - r.top) / (r.height || 1);
      return { x: x, y: y };
    }
    wrap.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, n: norm(t), at: Date.now() };
    }, { passive: true });
    wrap.addEventListener('touchend', function (e) {
      if (!start) return;
      var t = (e.changedTouches && e.changedTouches[0]) || start;
      var dx = t.clientX - start.x, dy = t.clientY - start.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var now = Date.now();
      var a = norm(t), b = start.n;
      if (a.x < 0 || a.x > 1 || a.y < 0 || a.y > 1 || b.x < 0 || b.x > 1 || b.y < 0 || b.y > 1) { start = null; return; }
      if (now - last < 70) { start = null; return; }
      last = now;
      if (dist > 26) {
        room.child('live/' + me).set({ k: 'swipe', x: b.x, y: b.y, x2: a.x, y2: a.y, ts: now });
        selfSwipe(b, a);
      } else {
        room.child('live/' + me).set({ k: 'tap', x: a.x, y: a.y, ts: now });
        selfRipple(a.x, a.y);
      }
      start = null;
    }, { passive: true });
    wrap.addEventListener('touchcancel', function () { start = null; }, { passive: true });
  }

  function selfSwipe(b, a) {
    var x1 = b.x * px(), y1 = b.y * py(), x2 = a.x * px(), y2 = a.y * py();
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 8) return;
    var l = mk('div', 'avl-sw');
    l.style.width = len + 'px';
    l.style.background = 'linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.9))';
    l.style.color = 'rgba(255,255,255,.9)';
    l.style.transform = 'translate3d(' + x1 + 'px,' + y1 + 'px,0) rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI) + 'deg)';
    layer.appendChild(l);
    setTimeout(function () { l.remove(); }, 1200);
  }

  function renderWho(peers) {
    var keys = Object.keys(peers || {});
    if (pill) pill.querySelector('span').textContent = 'LIVE · ' + keys.length;
  }

  function renderReads(peers) {
    var list = document.querySelectorAll('#reader img');
    if (!list.length) return;
    var live = {};
    Object.keys(peers || {}).forEach(function (k) {
      var v = peers[k];
      if (k === me || !v || v.p == null || !v.n) return;
      var im = list[Math.min(v.p, list.length - 1)];
      if (!im) return;
      live[k] = 1;
      var m = readEls[k];
      if (!m) {
        m = readEls[k] = mk('div', 'avl-rl');
        var s = mk('span');
        m.appendChild(s);
        layer.appendChild(m);
      }
      m.style.color = v.color || '#8b6cff';
      m.style.top = (im.offsetTop + (v.o || 0) * im.offsetHeight) + 'px';
      var sp = m.firstChild;
      sp.style.background = v.color || '#8b6cff';
      var txt = (v.name || 'Гость') + ' · стр. ' + (v.p + 1);
      if (sp.textContent !== txt) sp.textContent = txt;
    });
    Object.keys(readEls).forEach(function (k) {
      if (!live[k]) { readEls[k].remove(); delete readEls[k]; }
    });
  }

  function renderLive(peers) {
    var best = null, bestY = 0, keys = Object.keys(peers || {});
    if (!edge) return;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], v = peers[k];
      if (k === me || !v || v.p == null || !v.n) continue;
      var list = document.querySelectorAll('#reader img');
      var im = list[Math.min(v.p, list.length - 1)];
      if (!im) continue;
      var y = im.offsetTop + (v.o || 0) * im.offsetHeight;
      var top = wrap.scrollTop, bot = top + wrap.clientHeight;
      if (y < top + 40 || y > bot - 60) {
        if (!best) { best = { k: k, p: v.p, o: v.o, y: y }; bestY = y; }
      }
    }
    if (!best) { edge.hidden = true; return; }
    var up = bestY < wrap.scrollTop;
    edge.hidden = false;
    edge.className = 'avl-edge ' + (up ? 'top' : 'bot');
    edge.textContent = (up ? '↑ ' : '↓ ') + nameOf(best.k) + ' · стр. ' + (best.p + 1);
    edge.style.borderColor = colorOf(best.k);
    edge._peer = { p: best.p, o: best.o };
  }

  function placeAll() {
    Object.keys(state).forEach(function (key) {
      if (key.indexOf(':p') < 0) return;
      var c = state[key];
      if (!c || c.fx == null) return;
      c.el.style.transform = at(c.fx, c.fy);
    });
  }

  function stale() {
    var now = Date.now();
    Object.keys(state).forEach(function (key) {
      if (key.indexOf(':p') < 0) return;
      var c = state[key];
      if (!c || !c.t) return;
      var age = now - c.t;
      c.el.classList.toggle('idle', age > 3500);
      c.el.classList.toggle('gone', age > 25000);
    });
    renderLive(state.peers || {});
  }

  W.__avlTear = function () {
    try { room.child('live').off(); } catch (e) {}
    try { room.child('users').off(); } catch (e) {}
    if (timer) clearInterval(timer);
    if (layer) layer.remove();
    if (edge) edge.remove();
    if (pill) pill.remove();
    W.__avlOn = false;
  };

  boot();
})();
