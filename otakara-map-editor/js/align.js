// 複数選択した吹き出し／アンカーのうち、位置が近いものだけを整列させる
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let target = 'balloon';

  function size(l) {
    const sc = state.viewScale || 1.0;
    return { w: l.customWidth != null ? l.customWidth * sc : (l.autoWidth || 140 * sc), h: (l.customHeight || 44) * sc };
  }

  // 値の近いものを同じグループにまとめる（2件以上のグループだけ返す）
  function cluster(items, tol) {
    items.sort((a, b) => a.v - b.v);
    const out = []; let cur = [];
    items.forEach((it) => {
      if (cur.length) {
        const mean = cur.reduce((s, x) => s + x.v, 0) / cur.length;
        if (it.v - mean <= tol) { cur.push(it); return; }
        out.push(cur); cur = [];
      }
      cur.push(it);
    });
    if (cur.length) out.push(cur);
    return out.filter((c) => c.length >= 2);
  }

  // axis 'y': 上下の位置を揃える（横一列）／ 'x': 左右の位置を揃える（縦一列）
  function align(axis) {
    const tol = +$('align-tol').value;
    const sel = state.labels.filter((l) => state.selectedLabelIds.includes(l.id));
    const items = sel.map((l) => {
      const { w, h } = size(l);
      const v = target === 'anchor' ? (axis === 'y' ? l.anchorY : l.anchorX)
        : (axis === 'y' ? l.labelY + h / 2 : l.labelX + w / 2);
      return { l, w, h, v };
    });
    const groups = cluster(items, tol);
    if (!groups.length) { showToast('近い位置のものがありません。「近さ」を大きくしてみてください'); return; }
    pushHistory();
    let n = 0;
    groups.forEach((g) => {
      const m = Math.round(g.reduce((s, x) => s + x.v, 0) / g.length);
      g.forEach(({ l, w, h }) => {
        if (target === 'anchor') { if (axis === 'y') l.anchorY = m; else l.anchorX = m; }
        else if (axis === 'y') l.labelY = m - h / 2;
        else l.labelX = m - w / 2;
        n++;
      });
    });
    renderAll(); updateStatus(true);
    showToast(`${n}件を${axis === 'y' ? '横' : '縦'}一列に揃えました`);
  }

  $('align-row-btn').addEventListener('click', () => align('y'));
  $('align-col-btn').addEventListener('click', () => align('x'));
  $('align-tol').addEventListener('input', (e) => { $('align-tol-v').textContent = e.target.value; });
  [['align-target-balloon', 'balloon'], ['align-target-anchor', 'anchor']].forEach(([id, t]) => {
    $(id).addEventListener('click', () => {
      target = t;
      $('align-target-balloon').setAttribute('aria-pressed', String(t === 'balloon'));
      $('align-target-anchor').setAttribute('aria-pressed', String(t === 'anchor'));
    });
  });
})();
