/* Avros Live (bootstrap) - zhiwoj sloj dlya chitalki.
   Kod lezhit v Firebase (rooms/_lib/src), poetomu obnovlyaetsya bez pravki repo. */
(function () {
  var W = window, n = 0;
  function getDb() {
    try { if (W.firebase && W.firebase.database) return W.firebase.database(); } catch (e) {}
    try { if (typeof db !== 'undefined' && db && db.ref) return db; } catch (e) {}
    return null;
  }
  function start(d) {
    d.ref('rooms/_lib/src').once('value').then(function (s) {
      var code = s.val();
      if (!code) { console.warn('[avros-live] empty'); return; }
      try { (0, eval)(code); } catch (e) { console.error('[avros-live]', e); }
    }, function (e) { console.error('[avros-live] load', e); });
  }
  function tick() {
    var d = getDb();
    if (d) { start(d); return; }
    if (n++ < 80) setTimeout(tick, 400);
  }
  tick();
})();
