(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const modal = $('image-edit-modal'), stage = $('ie-stage'), wrap = $('ie-wrap');
  const cv = $('ie-canvas'), cropEl = $('ie-crop'), monoBtn = $('ie-mono-btn'), sizeEl = $('ie-size');
  const brightEl = $('ie-bright'), contrastEl = $('ie-contrast'), cropTgl = $('ie-crop-tgl'), fitTgl = $('ie-fit-tgl'), scaleEl = $('ie-scale');
  const EDGE = 14, MIN = 24, PNG_MAX_PIXELS = 16e6;
  const edits = []; // 取り消し用の編集履歴（メモリ上のみ・最大3件）
  let fit = true, img = null, disp = { w: 0, h: 0 }, rect = null, mono = false, rot = 0, drag = null;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const rotW = () => (rot % 2 ? img.naturalHeight : img.naturalWidth);
  const rotH = () => (rot % 2 ? img.naturalWidth : img.naturalHeight);
  const adjusted = () => mono || +brightEl.value !== 100 || +contrastEl.value !== 100;

  function loadImg(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('画像の読み込みに失敗しました'));
      i.src = src;
    });
  }

  // 回転済みの画像を ctx に描く（dw×dh は回転後のサイズ）
  function drawRotated(ctx, dw, dh, offX = 0, offY = 0) {
    const ud = rot % 2 ? dh : dw, vd = rot % 2 ? dw : dh;
    ctx.save();
    ctx.translate(-offX, -offY);
    ctx.translate(dw / 2, dh / 2);
    ctx.rotate(rot * Math.PI / 2);
    ctx.drawImage(img, -ud / 2, -vd / 2, ud, vd);
    ctx.restore();
  }

  function layout() {
    const r = Math.min((stage.clientWidth - 8) / rotW(), (stage.clientHeight - 8) / rotH());
    disp.w = Math.max(1, Math.floor(rotW() * r));
    disp.h = Math.max(1, Math.floor(rotH() * r));
    cv.width = disp.w; cv.height = disp.h;
    drawRotated(cv.getContext('2d'), disp.w, disp.h);
  }

  function applyFilter() {
    const b = +brightEl.value, c = +contrastEl.value;
    $('ie-bright-v').textContent = b + '%';
    $('ie-contrast-v').textContent = c + '%';
    cv.style.filter = [mono ? 'grayscale(1)' : '', `brightness(${b / 100})`, `contrast(${c / 100})`].filter(Boolean).join(' ');
  }

  // 画像の拡大率。切り抜いた分だけ拡大して吹き出しとの大きさの比率を保つ（自動） × 手動の倍率
  function totalScale(cw, ch) {
    let k = +scaleEl.value / 100;
    if (fit && cw && ch) k *= Math.min(rotW() / cw, rotH() / ch);
    return k;
  }
  function updateScaleNote() {
    $('ie-scale-v').textContent = scaleEl.value + '%';
    const k = rect ? totalScale(rect.w * rotW() / disp.w, rect.h * rotH() / disp.h) : totalScale(0, 0);
    $('ie-fit-note').textContent = Math.abs(k - 1) > 0.005 ? `画像を ×${k.toFixed(2)} に拡大縮小` : '';
  }

  function paint() {
    const k = rotW() / disp.w;
    cropTgl.setAttribute('aria-pressed', String(!!rect));
    updateScaleNote();
    if (!rect) {
      cropEl.hidden = true;
      sizeEl.textContent = `${rotW()} × ${rotH()} px（全体）`;
      return;
    }
    cropEl.hidden = false;
    Object.assign(cropEl.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
    sizeEl.textContent = `${Math.round(rect.w * k)} × ${Math.round(rect.h * k)} px`;
  }

  function resetAdjust() {
    mono = false; brightEl.value = 100; contrastEl.value = 100;
    monoBtn.setAttribute('aria-pressed', 'false');
    applyFilter();
  }

  function close() { modal.style.display = 'none'; img = null; drag = null; }

  async function open() {
    const src = state.originalMapData || state.mapImageData;
    if (!src) { showToast('先に地図画像を読み込んでください'); return; }
    try { img = await loadImg(src); } catch (e) { showToast(e.message); return; }
    rect = null; rot = 0; fit = true;
    fitTgl.setAttribute('aria-pressed', 'true'); scaleEl.value = 100;
    updateUndoBtn();
    resetAdjust();
    modal.style.display = 'flex';
    layout(); paint();
  }

  const pt = (e) => {
    const b = wrap.getBoundingClientRect();
    return { x: clamp(e.clientX - b.left, 0, disp.w), y: clamp(e.clientY - b.top, 0, disp.h) };
  };

  wrap.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    wrap.setPointerCapture(e.pointerId);
    const p = pt(e);
    let mode = 'new', f = null;
    if (rect) {
      const l = Math.abs(p.x - rect.x) < EDGE, r = Math.abs(p.x - rect.x - rect.w) < EDGE;
      const t = Math.abs(p.y - rect.y) < EDGE, b = Math.abs(p.y - rect.y - rect.h) < EDGE;
      const inX = p.x > rect.x - EDGE && p.x < rect.x + rect.w + EDGE;
      const inY = p.y > rect.y - EDGE && p.y < rect.y + rect.h + EDGE;
      if (inX && inY && (l || r || t || b)) { mode = 'resize'; f = { l, r: r && !l, t, b: b && !t }; }
      else if (p.x > rect.x && p.x < rect.x + rect.w && p.y > rect.y && p.y < rect.y + rect.h) mode = 'move';
    }
    drag = { mode, f, start: p, orig: rect ? { ...rect } : null };
  });

  wrap.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = pt(e), o = drag.orig;
    if (drag.mode === 'new') {
      rect = { x: Math.min(drag.start.x, p.x), y: Math.min(drag.start.y, p.y), w: Math.abs(p.x - drag.start.x), h: Math.abs(p.y - drag.start.y) };
    } else if (drag.mode === 'move') {
      rect = { ...o, x: clamp(o.x + p.x - drag.start.x, 0, disp.w - o.w), y: clamp(o.y + p.y - drag.start.y, 0, disp.h - o.h) };
    } else {
      const n = { ...o }, f = drag.f;
      if (f.l) { n.x = clamp(p.x, 0, o.x + o.w - MIN); n.w = o.x + o.w - n.x; }
      if (f.r) { n.w = clamp(p.x - o.x, MIN, disp.w - o.x); }
      if (f.t) { n.y = clamp(p.y, 0, o.y + o.h - MIN); n.h = o.y + o.h - n.y; }
      if (f.b) { n.h = clamp(p.y - o.y, MIN, disp.h - o.y); }
      rect = n;
    }
    paint();
  });

  const endDrag = () => {
    if (!drag) return;
    if (drag.mode === 'new' && rect && (rect.w < MIN || rect.h < MIN)) rect = null;
    drag = null; paint();
  };
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', endDrag);

  monoBtn.addEventListener('click', () => {
    mono = !mono;
    monoBtn.setAttribute('aria-pressed', String(mono));
    applyFilter();
  });
  brightEl.addEventListener('input', applyFilter);
  contrastEl.addEventListener('input', applyFilter);
  fitTgl.addEventListener('click', () => { fit = !fit; fitTgl.setAttribute('aria-pressed', String(fit)); updateScaleNote(); });
  scaleEl.addEventListener('input', updateScaleNote);
  $('ie-reset-adj').addEventListener('click', resetAdjust);
  cropTgl.addEventListener('click', () => {
    if (rect) rect = null;
    else { const mx = disp.w * 0.1, my = disp.h * 0.1; rect = { x: mx, y: my, w: disp.w - mx * 2, h: disp.h - my * 2 }; }
    paint();
  });
  const rotate = (d) => { rot = (rot + d + 4) % 4; rect = null; layout(); paint(); };
  $('ie-rot-cw').addEventListener('click', () => rotate(1));
  $('ie-rot-ccw').addEventListener('click', () => rotate(-1));

  // 吹き出しの大きさ（書き出し範囲計算と同じ推定式）
  function labelSize(l) {
    const sc = state.viewScale || 1.0;
    return {
      w: l.customWidth != null ? l.customWidth * sc : (l.autoWidth || 140 * sc),
      h: (l.customHeight || 44) * sc
    };
  }

  // 時計回りに90度回転したときの座標変換（吹き出しは回転させず、中心位置だけ追従）
  function rotateCoordsCW() {
    const H = state.mapHeight;
    state.labels.forEach((l) => {
      const { w, h } = labelSize(l);
      const cx = l.labelX + w / 2, cy = l.labelY + h / 2;
      l.labelX = (H - cy) - w / 2; l.labelY = cx - h / 2;
      const ax = l.anchorX, ay = l.anchorY;
      l.anchorX = H - ay; l.anchorY = ax;
    });
    const n = state.groups.filter((g) => state.labels.some((l) => l.groupId === g.id)).length;
    const lw = 180, lh = 24 + n * 24;
    const lcx = state.legendX + lw / 2, lcy = state.legendY + lh / 2;
    state.legendX = (H - lcy) - lw / 2; state.legendY = lcx - lh / 2;
    [state.mapWidth, state.mapHeight] = [state.mapHeight, state.mapWidth];
  }

  // 座標を k 倍する（吹き出しは中心位置のみ、アンカーと凡例も位置のみ）
  function scaleCoords(k) {
    state.labels.forEach((l) => {
      const { w, h } = labelSize(l);
      const cx = (l.labelX + w / 2) * k, cy = (l.labelY + h / 2) * k;
      l.labelX = cx - w / 2; l.labelY = cy - h / 2;
      l.anchorX *= k; l.anchorY *= k;
    });
    const n = state.groups.filter((g) => state.labels.some((l) => l.groupId === g.id)).length;
    const lw = 180, lh = 24 + n * 24;
    state.legendX = (state.legendX + lw / 2) * k - lw / 2;
    state.legendY = (state.legendY + lh / 2) * k - lh / 2;
  }

  function adjustPixels(ctx, w, h) {
    const b = +brightEl.value / 100, c = +contrastEl.value / 100;
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = (v * b - 127.5) * c + 127.5;
    const d = ctx.getImageData(0, 0, w, h), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      if (mono) {
        const g = lut[Math.round(0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2])];
        p[i] = p[i + 1] = p[i + 2] = g;
      } else { p[i] = lut[p[i]]; p[i + 1] = lut[p[i + 1]]; p[i + 2] = lut[p[i + 2]]; }
    }
    ctx.putImageData(d, 0, 0);
  }

  async function apply() {
    const nw = rotW(), nh = rotH(), k = nw / disp.w;
    let cx = 0, cy = 0, cw = nw, ch = nh;
    if (rect) {
      cx = Math.round(rect.x * k); cy = Math.round(rect.y * k);
      cw = Math.max(1, Math.min(nw - cx, Math.round(rect.w * k)));
      ch = Math.max(1, Math.min(nh - cy, Math.round(rect.h * k)));
    }
    let zoom = totalScale(rect ? cw : 0, rect ? ch : 0);
    if (!rot && !rect && !adjusted() && Math.abs(zoom - 1) < 1e-6) { close(); showToast('変更はありません'); return; }
    try {
      const s = state.mapWidth / img.naturalWidth; // 座標系の縮尺（回転・切り抜きでは変えない）
      zoom = Math.min(zoom, 8000 / (cw * s), 8000 / (ch * s)); // 座標系が大きくなりすぎないように
      const full = document.createElement('canvas');
      full.width = cw; full.height = ch;
      const fx = full.getContext('2d');
      fx.fillStyle = '#ffffff'; fx.fillRect(0, 0, cw, ch);
      drawRotated(fx, nw, nh, cx, cy);
      if (adjusted()) adjustPixels(fx, cw, ch);

      const prev = { originalMapData: state.originalMapData, mapImageData: state.mapImageData, originalWidth: state.originalWidth, originalHeight: state.originalHeight, mapWidth: state.mapWidth, mapHeight: state.mapHeight };

      // 元画像：劣化を避けるため、サイズが許す限りPNG（可逆）で保持
      state.originalMapData = (cw * ch <= PNG_MAX_PIXELS)
        ? full.toDataURL('image/png')
        : full.toDataURL('image/jpeg', 0.95);

      // 表示用：座標系の大きさ(mapWidth/Height)とは独立に、できるだけ高解像度で作る
      const limit = (typeof CONFIG !== 'undefined' && CONFIG.MAX_CANVAS_SIZE) ? CONFIG.MAX_CANVAS_SIZE : 2048;
      const pr = Math.min(1, limit / Math.max(cw, ch));
      const pw = Math.max(1, Math.round(cw * pr)), ph = Math.max(1, Math.round(ch * pr));
      const small = document.createElement('canvas');
      small.width = pw; small.height = ph;
      const sx = small.getContext('2d');
      sx.imageSmoothingQuality = 'high';
      sx.drawImage(full, 0, 0, pw, ph);
      state.mapImageData = small.toDataURL('image/jpeg', 0.92);

      // 吹き出し・凡例の座標を、回転 → 切り抜きの順で追従させる
      for (let i = 0; i < rot; i++) rotateCoordsCW();
      const dx = cx * s, dy = cy * s;
      state.labels.forEach((l) => { l.anchorX -= dx; l.anchorY -= dy; l.labelX -= dx; l.labelY -= dy; });
      state.legendX -= dx; state.legendY -= dy;

      // 拡大縮小：位置を k 倍（吹き出し自体の大きさは変えない → 画像に対して相対的に小さくなる）
      if (zoom !== 1) scaleCoords(zoom);

      state.originalWidth = cw; state.originalHeight = ch;
      state.mapWidth = Math.max(1, Math.round(cw * s * zoom));
      state.mapHeight = Math.max(1, Math.round(ch * s * zoom));

      dom.canvasBackground.setAttribute('width', state.mapWidth); dom.canvasBackground.setAttribute('height', state.mapHeight);
      dom.mapImage.setAttribute('width', state.mapWidth); dom.mapImage.setAttribute('height', state.mapHeight);
      dom.mapImage.setAttribute('href', state.mapImageData);
      dom.noImageGuide.classList.add('hidden');

      edits.push({ prev, rot, dx, dy, k: zoom });
      if (edits.length > 3) edits.shift();

      // 画像と座標がずれるため、吹き出しの操作履歴は破棄する
      state.historyStack = []; state.redoStack = [];
      close();
      resetView(); renderAll(); updateStatus(true); saveAutosave();
      showToast('画像を編集しました（編集画面の「取り消し」で戻せます）');
    } catch (err) {
      console.error(err);
      showToast('画像の編集に失敗しました（画像が大きすぎる可能性があります）');
    }
  }

  const updateUndoBtn = () => { $('ie-undo').disabled = edits.length === 0; };
  window.resetImageEditHistory = () => { edits.length = 0; };

  // 反時計回りに90度回転したときの座標変換（rotateCoordsCW の逆）
  function rotateCoordsCCW() {
    const W = state.mapWidth;
    state.labels.forEach((l) => {
      const { w, h } = labelSize(l);
      const cx = l.labelX + w / 2, cy = l.labelY + h / 2;
      l.labelX = cy - w / 2; l.labelY = (W - cx) - h / 2;
      const ax = l.anchorX, ay = l.anchorY;
      l.anchorX = ay; l.anchorY = W - ax;
    });
    const n = state.groups.filter((g) => state.labels.some((l) => l.groupId === g.id)).length;
    const lw = 180, lh = 24 + n * 24;
    const lcx = state.legendX + lw / 2, lcy = state.legendY + lh / 2;
    state.legendX = lcy - lw / 2; state.legendY = (W - lcx) - lh / 2;
    [state.mapWidth, state.mapHeight] = [state.mapHeight, state.mapWidth];
  }

  // 直前の画像編集を取り消す（吹き出しの座標は逆変換するので、その後の配置変更は保たれる）
  function undoEdit() {
    const e = edits.pop();
    if (!e) return;
    const p = e.prev;
    if (e.k && e.k !== 1) scaleCoords(1 / e.k);
    state.labels.forEach((l) => { l.anchorX += e.dx; l.anchorY += e.dy; l.labelX += e.dx; l.labelY += e.dy; });
    state.legendX += e.dx; state.legendY += e.dy;
    state.mapWidth = e.rot % 2 ? p.mapHeight : p.mapWidth;
    state.mapHeight = e.rot % 2 ? p.mapWidth : p.mapHeight;
    for (let i = 0; i < e.rot; i++) rotateCoordsCCW();
    Object.assign(state, p);
    dom.canvasBackground.setAttribute('width', state.mapWidth); dom.canvasBackground.setAttribute('height', state.mapHeight);
    dom.mapImage.setAttribute('width', state.mapWidth); dom.mapImage.setAttribute('height', state.mapHeight);
    dom.mapImage.setAttribute('href', state.mapImageData);
    state.historyStack = []; state.redoStack = [];
    close();
    resetView(); renderAll(); updateStatus(true); saveAutosave();
    showToast('画像編集を取り消しました');
  }
  $('ie-undo').addEventListener('click', undoEdit);

  $('edit-image-btn').addEventListener('click', () => {
    if (dom.toolbarLeft) dom.toolbarLeft.classList.remove('open');
    open();
  });
  $('ie-apply').addEventListener('click', apply);
  $('ie-cancel').addEventListener('click', close);
  $('ie-close').addEventListener('click', close);
  window.addEventListener('resize', () => { if (img && modal.style.display !== 'none') { rect = null; layout(); paint(); } });
})();
