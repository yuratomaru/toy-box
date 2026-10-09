  /* --------------------------
  // イベント制御用の内部状態
  ---------------------------- */
  // navigator.platform は非推奨のため userAgentData or UA文字列で統一判定
  const isMac = (navigator.userAgentData?.platform || navigator.platform || '').toUpperCase().includes('MAC');
  const getCtrlKey = (e) => isMac ? e.metaKey : e.ctrlKey;

  let dragMode = null; 
  let lastClickTime = 0;
  let lastClickId = null;
  let dragStartPos = { x: 0, y: 0 };
  let initialViewBox = { x: 0, y: 0 };
  let activeDragIds = [];
  let dragOffsetMap = new Map();
  let marqueeStartPos = { x: 0, y: 0 };
  
  // タッチ操作・長押し用
  let longPressTimer = null;
  let pointerDownCoords = { x: 0, y: 0 };
  let initialPinchDist = null;
  let initialPinchViewBox = null;

  /* --------------------------
  // 座標変換
  ---------------------------- */
  function getSVGCoords(e) {
    const pt = dom.mapSvg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = dom.mapSvg.getScreenCTM();
    if (!ctm) return { x: e.clientX, y: e.clientY };
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  /* --------------------------
  // マウス ＆ シングルタッチの処理群
  ---------------------------- */
  let _suppressEditorClose = false;

  function triggerCreateLabel(coords) {
    pushHistory();
    const id = 'l-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    state.labels.push({
      id, groupId: state.selectedGroupId || state.groups[0].id, space: '', name: '',
      anchorX: coords.x, anchorY: coords.y, labelX: coords.x + 30, labelY: coords.y - 15,
      customWidth: null, customHeight: 44, styleType: state.balloonStyle || 'default',
      _isNew: true
    });
    state.selectedLabelIds = [id];
    renderAll(); renderLabelList(); renderCategoryList(); updateEditForm();

    const margin = 60;
    const vb = state.viewBox;
    if (coords.x < vb.x + margin || coords.x > vb.x + vb.w - margin ||
        coords.y < vb.y + margin || coords.y > vb.y + vb.h - margin) {
      state.viewBox.x = coords.x - vb.w / 2;
      state.viewBox.y = coords.y - vb.h / 2;
      applyViewBox();
    }

    // 開いた直後50msはdocument pointerdownによる即時クローズを防ぐ
    _suppressEditorClose = true;
    setTimeout(() => { _suppressEditorClose = false; }, 50);

    openFloatingEditor(id);
  }

  function triggerEditLabel(id) {
    state.selectedLabelIds = [id];
    renderLabels(); renderLabelList(); updateEditForm();
    openFloatingEditor(id);
  }

  function handleBackgroundPointerDown(e, coords, isDblClick) {
    if (isDblClick) return triggerCreateLabel(coords);

    if (!e.ctrlKey && !e.metaKey) {
      state.selectedLabelIds = [];
      renderLabels(); renderLabelList(); updateEditForm();
    }

    if (state.selectMode === 'rect' || e.shiftKey) {
      dragMode = 'marquee';
      marqueeStartPos = coords;
      dom.selectionMarquee.style.display = 'block';
      dom.selectionMarquee.setAttribute('x', coords.x);
      dom.selectionMarquee.setAttribute('y', coords.y);
      dom.selectionMarquee.setAttribute('width', 0);
      dom.selectionMarquee.setAttribute('height', 0);
    } else {
      dragMode = 'pan';
      dragStartPos = { x: e.clientX, y: e.clientY };
      initialViewBox = { ...state.viewBox };
    }
  }

  function handleAnchorPointerDown(e, target, coords) {
    e.stopPropagation();
    dragMode = 'anchor';
    const id = target.getAttribute('data-anchor-id');
    activeDragIds = [id];
    const lbl = state.labels.find(l => l.id === id);
    if (lbl) {
      dragOffsetMap.set(id, { anchorDx: lbl.anchorX - coords.x, anchorDy: lbl.anchorY - coords.y });
    }
    pushHistory();
  }

  function handleLabelPointerDown(e, labelGroup, coords, isDblClick) {
    e.stopPropagation();
    const id = labelGroup.getAttribute('data-id');

    if (lastClickId === id && isDblClick) {
      triggerEditLabel(id);
      lastClickTime = 0;
      return;
    }
    lastClickId = id;

    const isCtrl = getCtrlKey(e);
    const isAlreadySelected = state.selectedLabelIds.includes(id);

    if (isCtrl) {
      if (isAlreadySelected) state.selectedLabelIds = state.selectedLabelIds.filter(lid => lid !== id);
      else state.selectedLabelIds.push(id);
    } else {
      if (!isAlreadySelected) state.selectedLabelIds = [id];
    }

    renderLabels(); renderLabelList(); updateEditForm();

    if (state.selectedLabelIds.length === 0) {
      dragMode = null;
      return;
    }

    dragMode = 'label';
    activeDragIds = [...state.selectedLabelIds]; 
    dragStartPos = coords;
    dragOffsetMap = new Map();
    activeDragIds.forEach(lid => {
      const lbl = state.labels.find(l => l.id === lid);
      if (lbl) {
        dragOffsetMap.set(lid, {
          labelDx: lbl.labelX - coords.x, labelDy: lbl.labelY - coords.y,
          anchorDx: lbl.anchorX - coords.x, anchorDy: lbl.anchorY - coords.y
        });
      }
    });
    pushHistory();
  }

  function handleLegendPointerDown(e, coords) {
    e.stopPropagation();
    dragMode = 'legend';
    dragOffsetMap.set('legend', { dx: state.legendX - coords.x, dy: state.legendY - coords.y });
    pushHistory();
  }

  /* --------------------------
  // ポインターダウン（メインリスナー）
  ---------------------------- */
  dom.mapSvg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    
    dom.mapSvg.setPointerCapture(e.pointerId);
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const coords = getSVGCoords(e);
    const target = e.target;
    closeContextMenu();

    const isTouch = (e.pointerType === 'touch' || e.pointerType === 'pen');
    const now = Date.now();
    const isDblClick = !isTouch && (now - lastClickTime < 300);
    lastClickTime = now;

    // ダブルクリック時は longPressTimer をキャンセルして誤発火防止
    clearTimeout(longPressTimer);
    if (!isDblClick) {
      pointerDownCoords = { x: e.clientX, y: e.clientY };
      longPressTimer = setTimeout(() => {
        dragMode = null;
        if (navigator.vibrate) navigator.vibrate(50);
        if (target.closest('.label-group')) {
          triggerEditLabel(target.closest('.label-group').getAttribute('data-id'));
        } else if (target === dom.mapSvg || target === dom.canvasBackground || target === dom.mapImage) {
          triggerCreateLabel(coords);
        }
      }, 500);
    }

    if (target === dom.mapSvg || target === dom.canvasBackground || target === dom.mapImage) {
      return handleBackgroundPointerDown(e, coords, isDblClick);
    }
    if (target.classList.contains('anchor-handle')) {
      return handleAnchorPointerDown(e, target, coords);
    }
    const labelGroup = target.closest('.label-group');
    if (labelGroup) {
      return handleLabelPointerDown(e, labelGroup, coords, isDblClick);
    }
    if (target.closest('#legend-layer')) {
      return handleLegendPointerDown(e, coords);
    }
  });

  /* --------------------------
  // pointermove モード別ハンドラー関数群
  ---------------------------- */
  function handlePanMove(e) {
    const dx = e.clientX - dragStartPos.x;
    const dy = e.clientY - dragStartPos.y;
    const ctm = dom.mapSvg.getScreenCTM();
    const scale = ctm ? ctm.a : 1; 
    state.viewBox.x = initialViewBox.x - (dx / scale);
    state.viewBox.y = initialViewBox.y - (dy / scale);
    applyViewBox();
  }

  function handleMarqueeMove(e, coords) {
    const x = Math.min(marqueeStartPos.x, coords.x);
    const y = Math.min(marqueeStartPos.y, coords.y);
    const w = Math.abs(coords.x - marqueeStartPos.x);
    const h = Math.abs(coords.y - marqueeStartPos.y);
    dom.selectionMarquee.setAttribute('x', x);
    dom.selectionMarquee.setAttribute('y', y);
    dom.selectionMarquee.setAttribute('width', w);
    dom.selectionMarquee.setAttribute('height', h);

    const isCtrl = getCtrlKey(e);
    const newlySelected = [];
    const scale = state.viewScale || 1.0;
    
    state.labels.forEach(lbl => {
      const lw = lbl.customWidth != null ? lbl.customWidth * scale : (lbl.autoWidth || 140 * scale); 
      const lh = (lbl.customHeight || 44) * scale;
      
      if (lbl.labelX < x + w && lbl.labelX + lw > x && lbl.labelY < y + h && lbl.labelY + lh > y) {
        newlySelected.push(lbl.id);
      }
    });

    dom.labelsLayer.querySelectorAll('.label-group').forEach(group => {
      const id = group.getAttribute('data-id');
      const willBeSelected = newlySelected.includes(id) || (isCtrl && state.selectedLabelIds.includes(id));
      if (willBeSelected) group.classList.add('selected');
      else group.classList.remove('selected');
    });
  }

  function handleLabelDragMove(e, coords) {
    activeDragIds.forEach(lid => {
      const lbl = state.labels.find(l => l.id === lid);
      const offset = dragOffsetMap.get(lid);
      if (!lbl || !offset) return;
      lbl.labelX = coords.x + offset.labelDx;
      lbl.labelY = coords.y + offset.labelDy;
      if (e.shiftKey) {
        lbl.anchorX = coords.x + offset.anchorDx;
        lbl.anchorY = coords.y + offset.anchorDy;
      }
    });
    renderLabels();
  }

  function handleAnchorDragMove(coords) {
    activeDragIds.forEach(lid => {
      const lbl = state.labels.find(l => l.id === lid);
      const offset = dragOffsetMap.get(lid);
      if (lbl && offset) {
        lbl.anchorX = coords.x + offset.anchorDx;
        lbl.anchorY = coords.y + offset.anchorDy;
      }
    });
    renderLabels();
  }

  function handleLegendDragMove(coords) {
    const offset = dragOffsetMap.get('legend');
    if (offset) {
      state.legendX = coords.x + offset.dx;
      state.legendY = coords.y + offset.dy;
      renderLegend();
    }
  }

  /* --------------------------
  // pointermove メインルーチン
  ---------------------------- */
  window.addEventListener('pointermove', (e) => {
    if (dragMode === 'pinch') return;

    if (longPressTimer) {
      const dist = Math.hypot(e.clientX - pointerDownCoords.x, e.clientY - pointerDownCoords.y);
      if (dist > 10) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    if (!dragMode) return;
    
    e.preventDefault();
    const coords = getSVGCoords(e);

    switch (dragMode) {
      case 'pan': handlePanMove(e); break;
      case 'marquee': handleMarqueeMove(e, coords); break;
      case 'label': handleLabelDragMove(e, coords); break;
      case 'anchor': handleAnchorDragMove(coords); break;
      case 'legend': handleLegendDragMove(coords); break;
    }
  });
  
  window.addEventListener('pointerup', (e) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (!dragMode) return;
    
    if (dragMode === 'marquee') {
      dom.selectionMarquee.style.display = 'none';
      const isCtrl = getCtrlKey(e);
      const newSelections = [];
      dom.labelsLayer.querySelectorAll('.label-group.selected').forEach(g => {
        newSelections.push(g.getAttribute('data-id'));
      });
      if (!isCtrl) state.selectedLabelIds = newSelections;
      else state.selectedLabelIds = [...new Set([...state.selectedLabelIds, ...newSelections])];
      
      renderLabels(); renderLabelList(); updateEditForm();
    }
    else if (dragMode !== 'pan') {
      // ドラッグ移動終了時に履歴保存（undoできるようにする）
      pushHistory();
      updateStatus(true);
      if (!state.hasShownShiftHint && dragMode === 'label' && state.selectedLabelIds.length > 0) {
        showToast('Shift+ドラッグで矢印の先（アンカー）もまとめて移動できます');
        state.hasShownShiftHint = true;
      }
    }
    dragMode = null;
    activeDragIds = [];
  });

  window.addEventListener('pointercancel', () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    dragMode = null;
  });

  /* --------------------------
  // ピンチズーム（2本指での拡大縮小）
  ---------------------------- */
  dom.mapSvg.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault(); 
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      dragMode = 'pinch';
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDist = Math.hypot(dx, dy);
      initialPinchViewBox = { ...state.viewBox };
    }
  }, { passive: false });

  dom.mapSvg.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && dragMode === 'pinch') {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDist = Math.hypot(dx, dy);
      
      const scale = initialPinchDist / currentDist;
      let newW = initialPinchViewBox.w * scale;
      let newH = initialPinchViewBox.h * scale;

      if (newW < 100) newW = 100;
      if (newH < 100) newH = 100;
      if (newW > state.mapWidth * 5) newW = state.mapWidth * 5;
      if (newH > state.mapHeight * 5) newH = state.mapHeight * 5;

      const newX = initialPinchViewBox.x + (initialPinchViewBox.w - newW) / 2;
      const newY = initialPinchViewBox.y + (initialPinchViewBox.h - newH) / 2;

      state.viewBox.w = newW;
      state.viewBox.h = newH;
      state.viewBox.x = newX;
      state.viewBox.y = newY;
      applyViewBox(); 
    }
  }, { passive: false });

  dom.mapSvg.addEventListener('touchend', (e) => {
    if (dragMode === 'pinch' && e.touches.length < 2) {
      dragMode = null;
      initialPinchDist = null;
    }
  });

  /* --------------------------
  // コンテキスト（右クリック）メニューの制御
  ---------------------------- */
  dom.mapSvg.addEventListener('contextmenu', (e) => {
    const isTouch = (e.pointerType === 'touch' || e.pointerType === 'pen' || 
                    ('ontouchstart' in window && e.sourceCapabilities?.firesTouchEvents));
    if (isTouch) { e.preventDefault(); return; }

    e.preventDefault();
    if (dragMode) return;
    const target = e.target.closest('.label-group');
    if (!target) return;

    const id = target.getAttribute('data-id');
    if (!state.selectedLabelIds.includes(id)) {
      state.selectedLabelIds = [id];
      renderLabels(); renderLabelList(); updateEditForm();
    }

    positionPopupWithinViewport(dom.customContextMenu, () => ({ left: e.clientX, top: e.clientY - 100 }));
    dom.customContextMenu.style.display = 'block';

    if (state.selectedLabelIds.length > 1) {
      dom.customContextMenu.querySelectorAll('.single-menu-item').forEach(el => el.style.display = 'none');
      // 一括編集中の件数をメニュー上部にインライン表示
      let multiLabel = dom.customContextMenu.querySelector('.ctx-multi-label');
      if (!multiLabel) {
        multiLabel = document.createElement('div');
        multiLabel.className = 'ctx-multi-label';
        multiLabel.style.cssText = 'font-size:11px;font-weight:700;color:var(--accent-color);background:var(--accent-soft);padding:6px 10px;border-radius:4px;margin-bottom:6px;';
        dom.customContextMenu.prepend(multiLabel);
      }
      multiLabel.textContent = `${state.selectedLabelIds.length}件を一括編集`;
      multiLabel.style.display = 'block';
    } else {
      const multiLabel = dom.customContextMenu.querySelector('.ctx-multi-label');
      if (multiLabel) multiLabel.style.display = 'none';
      dom.customContextMenu.querySelectorAll('.single-menu-item').forEach(el => el.style.display = '');
      
      const lbl = state.labels.find(l => l.id === id);
      if (lbl) {
        dom.ctxSpaceInput.value = lbl.space || '';
        dom.ctxNameInput.value = lbl.name || '';
        const scale = state.viewScale || 1.0;
        const baseW = lbl.customWidth != null ? lbl.customWidth * scale : (lbl.autoWidth || 140 * scale);
        const baseH = lbl.customHeight || 44;
        dom.ctxWidthInput.value = Math.round(baseW);
        dom.ctxHeightInput.value = Math.round(baseH * scale);
      }
    }
    
    const first = state.labels.find(l => l.id === state.selectedLabelIds[0]);
    dom.ctxGroupSelect.dataset.value = state.labels.every(l => !state.selectedLabelIds.includes(l.id) || l.groupId === first.groupId) ? first.groupId : '';
    buildSelectOptions();
  });

  // 【追加】画面のどこかをクリックした際に、不要なポップアップを閉じる処理
  document.addEventListener('pointerdown', (e) => {
    // セレクトボックスのドロップダウンを閉じる
    if (!e.target.closest('.custom-select-container')) {
      document.querySelectorAll('.custom-select-dropdown.show').forEach(d => d.classList.remove('show'));
    }

    if (!e.target.closest('#custom-context-menu')) {
      closeContextMenu();
    }
    if (!e.target.closest('#floating-editor') && e.target.closest('.label-group') === null) {
      if (!_suppressEditorClose) closeFloatingEditor();
    }
  });

  if (dom.floatingEditor) dom.floatingEditor.addEventListener('pointerdown', (e) => e.stopPropagation());
  if (dom.floatingCategorySelect) dom.floatingCategorySelect.addEventListener('pointerdown', (e) => e.stopPropagation());

  /* --------------------------
  // PC用マウスホイールのズーム制御
  ---------------------------- */
  dom.mapSvg.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) return; 
    e.preventDefault();

    const coords = getSVGCoords(e);
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    let newW = state.viewBox.w * zoomFactor;
    let newH = state.viewBox.h * zoomFactor;

    if (newW < 100) newW = 100;
    if (newH < 100) newH = 100;
    if (newW > state.mapWidth * 5) newW = state.mapWidth * 5;
    if (newH > state.mapHeight * 5) newH = state.mapHeight * 5;

    const actualZoomFactor = newW / state.viewBox.w;
    state.viewBox.x = coords.x - (coords.x - state.viewBox.x) * actualZoomFactor;
    state.viewBox.y = coords.y - (coords.y - state.viewBox.y) * actualZoomFactor;
    state.viewBox.w = newW;
    state.viewBox.h = newH;
    
    applyViewBox();
  }, { passive: false });

  /* --------------------------
  // ビューボックスの適用
  ---------------------------- */
  function applyViewBox() {
    dom.mapSvg.setAttribute('viewBox', `${state.viewBox.x} ${state.viewBox.y} ${state.viewBox.w} ${state.viewBox.h}`);
  }

  function resetView() {
    state.viewBox = { x: 0, y: 0, w: state.mapWidth || 1000, h: state.mapHeight || 700 };
    applyViewBox();
  }

  /* --------------------------
  // ポップアップ要素を画面内に収める共通処理
  ---------------------------- */
  const POPUP_VIEWPORT_MARGIN = 8; // 画面端からの最小マージン(px)

  // el: 表示対象の要素 / getPosition(width, height) => {left, top} を返す配置関数
  // 実寸を測ったうえで、画面外に出ないようクランプして表示する
  function positionPopupWithinViewport(el, getPosition) {
    el.style.visibility = 'hidden';
    el.style.left = '0px';
    el.style.top = '0px';

    requestAnimationFrame(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const maxLeft = Math.max(POPUP_VIEWPORT_MARGIN, window.innerWidth - w - POPUP_VIEWPORT_MARGIN);
      const maxTop = Math.max(POPUP_VIEWPORT_MARGIN, window.innerHeight - h - POPUP_VIEWPORT_MARGIN);

      let { left, top } = getPosition(w, h);

      left = Math.min(Math.max(left, POPUP_VIEWPORT_MARGIN), maxLeft);
      top = Math.min(Math.max(top, POPUP_VIEWPORT_MARGIN), maxTop);

      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.style.visibility = 'visible';
    });
  }

  /* --------------------------
  // インラインエディタ展開処理 (座標計算修正 ＆ フォーカス改善)
  ---------------------------- */
  function openFloatingEditor(id) {
    const lbl = state.labels.find(l => l.id === id);
    if (!lbl) return;

    if (window.innerWidth <= 1024 && typeof bottomSheet !== 'undefined' && bottomSheet) {
      bottomSheet.classList.remove('sheet-open'); 
      bottomSheet.classList.remove('collapsed');
    }

    dom.floatSpace.value = lbl.space || '';
    dom.floatName.value = lbl.name || '';
    dom.floatingEditor.dataset.targetId = id;

    const floatCategoryContainer = document.getElementById('float-category');
    if (floatCategoryContainer) {
      floatCategoryContainer.dataset.value = lbl.groupId;
      buildSelectOptions();
      updateFloatingEditorCategory(lbl.groupId);
    }

    let anchorPoint = null;
    const gEl = dom.labelsLayer.querySelector(`g[data-id="${id}"]`);
    if (gEl) {
      const ctm = gEl.getScreenCTM();
      if (ctm) {
        const pt = dom.mapSvg.createSVGPoint();
        const scale = state.viewScale || 1.0;
        const bw = lbl.customWidth != null ? lbl.customWidth * scale : (lbl.autoWidth || 140 * scale);
        pt.x = lbl.labelX + bw / 2;
        pt.y = lbl.labelY;
        anchorPoint = pt.matrixTransform(ctm);
      }
    }

    dom.floatingEditor.style.display = 'flex';

    positionPopupWithinViewport(dom.floatingEditor, (w, h) => {
      if (anchorPoint) {
        return { left: anchorPoint.x - w / 2, top: anchorPoint.y - h - 10 };
      }
      return { left: (window.innerWidth - w) / 2, top: (window.innerHeight - h) / 2 };
    });

    requestAnimationFrame(() => {
      dom.floatSpace.focus();
    });
  }

  // スマホ：ソフトウェアキーボード表示時にフローティングエディタが隠れないよう
  //    visualViewport の resize で位置を再調整する
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (dom.floatingEditor.style.display === 'none') return;
      // キーボードが出た後の有効領域の高さ
      const vvHeight = window.visualViewport.height;
      const editorH = dom.floatingEditor.offsetHeight;
      const currentTop = parseFloat(dom.floatingEditor.style.top) || 0;
      const margin = 8;
      // エディタ下端がキーボード上端を超えていたら押し上げる
      if (currentTop + editorH > vvHeight - margin) {
        dom.floatingEditor.style.top = Math.max(margin, vvHeight - editorH - margin) + 'px';
      }
    });
  }

  /* --------------------------
  // ボタン等のイベント群
  ---------------------------- */
  dom.modePanBtn.addEventListener('click', () => { state.selectMode = 'pan'; dom.modePanBtn.classList.add('active'); dom.modeRectBtn.classList.remove('active'); dom.mapSvg.classList.remove('rect-mode'); });
  dom.modeRectBtn.addEventListener('click', () => { state.selectMode = 'rect'; dom.modeRectBtn.classList.add('active'); dom.modePanBtn.classList.remove('active'); dom.mapSvg.classList.add('rect-mode'); });

  // 確実にサイズ変更を反映させるイベント
  dom.viewScaleSelect.addEventListener('change', (e) => {
    pushHistory();
    state.viewScale = parseFloat(e.target.value) || 1.0;
    clearTextWidthCache(); // フォントサイズが変わるのでキャッシュクリア
    state.labels.forEach(lbl => { lbl.customWidth = null; });
    updateStatus(true);
    renderAll();
    updateEditForm();
    showToast('吹き出しのサイズを変更しました');
  });

  function zoom(scaleFactor) {
    const cx = state.viewBox.x + state.viewBox.w / 2;
    const cy = state.viewBox.y + state.viewBox.h / 2;
    const newW = state.viewBox.w * scaleFactor;
    const newH = state.viewBox.h * scaleFactor;
    state.viewBox.x = cx - newW / 2;
    state.viewBox.y = cy - newH / 2;
    state.viewBox.w = newW;
    state.viewBox.h = newH;
    applyViewBox();
  }
  
  dom.zoomInBtn.addEventListener('click', () => zoom(0.8));
  dom.zoomOutBtn.addEventListener('click', () => zoom(1.2));
  dom.resetViewBtn.addEventListener('click', resetView);
    
  dom.resetAllBtn.addEventListener('click', async () => {
    if (await uiConfirm('マップ上のすべての吹き出しを削除します。\nカテゴリ設定や背景画像は残ります。\n（直後なら「元に戻す」で復元できます）', { title: '吹き出しをすべて削除', okText: '削除する', danger: true })) {
      pushHistory();
      state.labels = [];
      state.selectedLabelIds = [];
      renderAll(); renderLabelList(); updateEditForm();
      showToast('すべての吹き出しを削除しました');
    }
  });

  function closeContextMenu() {
    if (dom.customContextMenu.style.display === 'none') return;
    dom.customContextMenu.style.display = 'none';
    // 変更があれば履歴に積んで保存
    if (state.selectedLabelIds.length) {
      pushHistory();
    }
  }
  document.getElementById('ctx-delete-btn').addEventListener('click', deleteLabels);
  dom.sideDuplicateBtn.addEventListener('click', duplicateLabels);
  // 右クリックメニューの複製ボタン
  if (dom.ctxDuplicateBtn) dom.ctxDuplicateBtn.addEventListener('click', () => {
    duplicateLabels();
    closeContextMenu();
  });
  dom.sideDeleteBtn.addEventListener('click', deleteLabels);

  dom.deleteGroupBtn.addEventListener('click', () => {
    if (state.groups.length <= 1) {
      showToast('カテゴリは最低1つ必要です');
      return;
    }
    if (!dom.deleteGroupBtn.dataset.confirming) {
      const count = state.labels.filter(l => l.groupId === state.selectedGroupId).length;
      const countText = count > 0 ? `（所属する吹き出し${count}件も削除します）` : '';
      dom.deleteGroupBtn.dataset.confirming = '1';
      dom.deleteGroupBtn.textContent = `本当に削除する ${countText}`;
      dom.deleteGroupBtn.style.background = 'var(--danger-soft)';
      setTimeout(() => {
        if (dom.deleteGroupBtn.dataset.confirming) {
          delete dom.deleteGroupBtn.dataset.confirming;
          dom.deleteGroupBtn.innerHTML = ICON_TRASH + ' このカテゴリを削除';
          dom.deleteGroupBtn.style.background = '';
        }
      }, 3000);
      return;
    }
    delete dom.deleteGroupBtn.dataset.confirming;
    dom.deleteGroupBtn.innerHTML = ICON_TRASH + ' このカテゴリを削除';
    dom.deleteGroupBtn.style.background = '';
    pushHistory();
    state.labels = state.labels.filter(l => l.groupId !== state.selectedGroupId);
    state.groups = state.groups.filter(g => g.id !== state.selectedGroupId);
    state.selectedGroupId = state.groups[0].id;
    dom.categoryEditorBox.classList.remove('open');
    renderAll(); renderCategoryList(); buildSelectOptions(); updateEditForm();
    showToast('カテゴリを削除しました');
  });

  dom.undoBtn.addEventListener('click', undo);
  dom.redoBtn.addEventListener('click', redo);
  dom.toggleLegendCb.addEventListener('change', (e) => {
    pushHistory();
    state.showLegend = e.target.checked;
    renderLegend();
  });
  
  document.getElementById('close-recovery-btn').addEventListener('click', () => {
    dom.recoveryBar.classList.add('hidden');
  });

  dom.groupNameInput.addEventListener('input', (e) => {
    const g = state.groups.find(g => g.id === state.selectedGroupId);
    if (g) {
      g.name = e.target.value;
      // input中は軽い処理だけ（buildSelectOptionsはフォーカスを奪うので呼ばない）
      renderCategoryList();
      renderLegend();
    }
  });
  dom.groupNameInput.addEventListener('blur', (e) => {
    // フォーカスが外れたタイミングでドロップダウン再構築・履歴保存
    const g = state.groups.find(g => g.id === state.selectedGroupId);
    if (g) {
      pushHistory();
      buildSelectOptions();
      saveAutosave();
      updateStatus(true);
    }
  });
  dom.groupColorInput.addEventListener('input', (e) => {
    const g = state.groups.find(g => g.id === state.selectedGroupId);
    if (g) { pushHistory(); g.color = e.target.value; g.textColor = getContrastingTextColor(e.target.value); renderCategoryList(); renderAll(); buildSelectOptions(); }
  });
  dom.groupPatternInput.addEventListener('change', (e) => {
    const g = state.groups.find(g => g.id === state.selectedGroupId);
    if (g) { pushHistory(); g.pattern = e.target.value; renderCategoryList(); renderAll(); buildSelectOptions(); }
  });

  // 新規カテゴリ追加ボタンの動作
  dom.createGroupBtn.addEventListener('click', () => {
    const newGroup = createNewGroup();
    openCategoryEditor(newGroup.id); // 新カテゴリのエディタを即座に開く
    renderCategoryList();
    buildSelectOptions();
    renderLabelList();
    updateEditForm();
    showToast('新しいカテゴリを追加しました');
  });

  /* --------------------------
  // キーボードショートカット (Delete対応の強化)
  ---------------------------- */
  document.addEventListener('keydown', (e) => {
    const isCtrl = getCtrlKey(e);
    
    if (isCtrl && e.key.toLowerCase() === 'p') {
      e.preventDefault(); 
      if (dom.exportPngBtn) dom.exportPngBtn.click();
      else if (dom.exportSettingModal) {
        dom.exportSettingModal.style.display = 'flex';
        if (typeof updatePreview === 'function') updatePreview();
      }
      return; 
    }

    // 入力中の場合は無視（Backspace等もここでスキップされる）
    // カテゴリエディタが開いていてDeleteが押された場合→カテゴリ削除
    //    （入力中は除外：カテゴリ名input以外からのDelete）
    const categoryEditorOpen = dom.categoryEditorBox && dom.categoryEditorBox.classList.contains('open');
    const focusInCategoryInput = e.target === dom.groupNameInput;
    if ((e.key === 'Delete' || e.key === 'Backspace') && categoryEditorOpen 
        && state.selectedLabelIds.length === 0 && !focusInCategoryInput) {
      e.preventDefault();
      dom.deleteGroupBtn.click();
      return;
    }

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (isCtrl && e.key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (isCtrl && e.key === 'y') { e.preventDefault(); redo(); return; }

    // Escで選択解除（ドロップダウン等が開いていない場合のみ）
    if (e.key === 'Escape') {
      const anyOpen = document.querySelector('.custom-select-container.is-open, .custom-select-wrapper.is-open, .custom-select-dropdown.show');
      const ctxVisible = dom.customContextMenu.style.display !== 'none';
      const editorVisible = dom.floatingEditor.style.display !== 'none';
      if (!anyOpen && !ctxVisible && !editorVisible && state.selectedLabelIds.length > 0) {
        e.preventDefault();
        state.selectedLabelIds = [];
        renderLabels(); renderLabelList(); updateEditForm();
        showToast('選択を解除しました');
      }
      return;
    }
    
    // 確実にDelete/Backspaceを拾って削除する
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedLabelIds.length > 0) {
      e.preventDefault(); 
      deleteLabels();
    }
    
    if (isCtrl && e.key === 'd' && state.selectedLabelIds.length > 0) {
      e.preventDefault(); duplicateLabels();
    }

    // 配置済みの吹き出しを全選択
    if (isCtrl && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      state.selectedLabelIds = state.labels.map(l => l.id);
      renderLabels();
      renderLabelList();
      updateEditForm();
    }
  });

  /* --------------------------
  // スマホ用ボトムシートの制御
  ---------------------------- */
  let touchStartY = 0;
  const bottomSheet = dom.sidePanel;
  bottomSheet.addEventListener('touchstart', (e) => {
    if (e.target === bottomSheet || e.target.tagName === 'SUMMARY') {
      touchStartY = e.touches[0].clientY;
    } else { touchStartY = 0; }
  }, { passive: true });

  bottomSheet.addEventListener('touchend', (e) => {
    if (touchStartY === 0) return;
    const diff = e.changedTouches[0].clientY - touchStartY;
    if (diff > 50) bottomSheet.classList.remove('sheet-open');
    else if (diff < -50) bottomSheet.classList.add('sheet-open');
  });

  bottomSheet.addEventListener('click', (e) => {
    if (e.target === bottomSheet) bottomSheet.classList.toggle('sheet-open');
  });

  // 初回訪問時にボトムシートの存在をバウンスアニメーションで通知
  if (window.innerWidth <= 1024) {
    const BOUNCE_KEY = 'ins-map-sheet-hint-shown';
    if (!sessionStorage.getItem(BOUNCE_KEY)) {
      sessionStorage.setItem(BOUNCE_KEY, '1');
      setTimeout(() => {
        bottomSheet.classList.add('sheet-bounce-hint');
        bottomSheet.addEventListener('animationend', () => {
          bottomSheet.classList.remove('sheet-bounce-hint');
        }, { once: true });
      }, 800);
    }
  }

  // 不快なスクロールを削除
  const originalUpdateEditForm = updateEditForm;
  updateEditForm = function() {
    originalUpdateEditForm();
    if (window.innerWidth > 1024 && state.selectedLabelIds.length > 0) {
      bottomSheet.classList.add('sheet-open');
    }
  };

  /* --------------------------
  // ハンバーガーメニュー・サイドバーの制御
  ---------------------------- */
  if (dom.mobileMenuBtn) {
    dom.mobileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation(); 
      dom.toolbarLeft.classList.toggle('open');
    });
  }

  document.addEventListener('click', (e) => {
    if (!dom.toolbarLeft.contains(e.target) && e.target !== dom.mobileMenuBtn) {
      dom.toolbarLeft.classList.remove('open');
    }
  });

  dom.togglePanelBtn.addEventListener('click', () => {
    dom.sidePanel.classList.toggle('collapsed');
  });

  /* --------------------------
  // サイズ入力値の逆算保存処理
  ---------------------------- */
  function handleSizeInput(field, value) {
    const scale = state.viewScale || 1.0;
    const numValue = parseFloat(value);
    
    pushHistory();
    state.selectedLabelIds.forEach(id => {
      const lbl = state.labels.find(l => l.id === id);
      if (lbl) {
        if (isNaN(numValue) || numValue <= 0) {
          lbl[field] = null; 
        } else {
          lbl[field] = numValue / scale; 
        }
      }
    });
    renderLabels();
  }

  // キー操作の揺れを防ぐため、change（確定時）のみにバインド
  if (dom.sideWidthInput) dom.sideWidthInput.addEventListener('change', (e) => handleSizeInput('customWidth', e.target.value));
  if (dom.sideHeightInput) dom.sideHeightInput.addEventListener('change', (e) => handleSizeInput('customHeight', e.target.value));
  
  if (dom.ctxWidthInput) dom.ctxWidthInput.addEventListener('change', (e) => handleSizeInput('customWidth', e.target.value));
  if (dom.ctxHeightInput) dom.ctxHeightInput.addEventListener('change', (e) => handleSizeInput('customHeight', e.target.value));
