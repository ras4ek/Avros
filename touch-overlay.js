/* Avros — видимые тапы/свайпы в комнате (файл отдельно от index.html).
   Подключить: добавить строку <script src="touch-overlay.js"></script> в index.html
   или вставить IIFE ниже в консоль Chrome при открытом Avros.
   После вставки: ⊙ — тап, ⇨ — прокрутка. */
(function () {
  if (document.getElementById('tfx-layer')) return;
  var style = document.createElement('style');
  style.textContent = '.tfx{position:fixed;left:0;top:0;pointer-events:none;z-index:9999;font-size:36px;font-weight:800;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.8);line-height:1;transform:translate3d(-50%,-50%,0);animation:tfx 2s ease-out both}@keyframes tfx{10%{transform:translate3d(-50%,-50%,0) scale(1.2)}100%{transform:translate3d(-50%,-50%,0) scale(1.5);opacity:0}}';
  document.head.appendChild(style);
  var layer = document.createElement('div'); layer.id = 'tfx-layer'; document.body.appendChild(layer);
  var wrap = document.getElementById('wrap'); if (!wrap) return;
  var sx, sy, drag = false;
  function put(x, y, t) {
    var m = document.createElement('div'); m.className = 'tfx'; m.textContent = t;
    m.style.left = x + 'px'; m.style.top = y + 'px';
    layer.appendChild(m);
    setTimeout(function () { m.remove(); }, 2200);
  }
  wrap.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; drag = true; setTimeout(function () { if (drag) put(sx, sy, '⊙'); }, 300); });
  wrap.addEventListener('pointermove', function (e) { if (!drag) return; if (Math.hypot(e.clientX - sx, e.clientY - sy) >= 25) { drag = false; put(e.clientX, e.clientY, '⇨'); } });
  wrap.addEventListener('pointerup', function (e) { drag = false; put(e.clientX, e.clientY, '⊙'); });
})();
