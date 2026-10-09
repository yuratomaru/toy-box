  function getBalloonPath(x, y, w, h, anchorX, anchorY, style, radius = 5) {
    if (style === 'comic') {
      return getComicPath(x, y, w, h, anchorX, anchorY, radius);
    } else {
      return `M ${x+radius},${y} h ${w-radius*2} a ${radius},${radius} 0 0 1 ${radius},${radius} v ${h-radius*2} a ${radius},${radius} 0 0 1 -${radius},${radius} h -${w-radius*2} a ${radius},${radius} 0 0 1 -${radius},-${radius} v -${h-radius*2} a ${radius},${radius} 0 0 1 ${radius},-${radius} Z`;
    }
  }

  function getComicPath(x, y, w, h, tx, ty, r) {
    const dx = tx - (x + w/2);
    const dy = ty - (y + h/2);
    
    let side = '';
    if (Math.abs(dy) * w > Math.abs(dx) * h) {
      side = dy > 0 ? 'bottom' : 'top';
    } else {
      side = dx > 0 ? 'right' : 'left';
    }

    const tw = 16; // ツノの付け根の幅
    let d = `M ${x+r},${y} `;

    // アンカーの座標に合わせてツノの根本（baseX, baseY）をスライドさせる計算
    // （角の丸み r とツノの幅 tw/2 を考慮し、はみ出さないように制限をかける）
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const baseX = clamp(tx, x + r + tw/2, x + w - r - tw/2);
    const baseY = clamp(ty, y + r + tw/2, y + h - r - tw/2);

    // 上辺
    if (side === 'top') {
      d += `L ${baseX - tw/2},${y} L ${tx},${ty} L ${baseX + tw/2},${y} L ${x+w-r},${y} `;
    } else {
      d += `L ${x+w-r},${y} `;
    }
    d += `a ${r},${r} 0 0 1 ${r},${r} `;

    // 右辺
    if (side === 'right') {
      d += `L ${x+w},${baseY - tw/2} L ${tx},${ty} L ${x+w},${baseY + tw/2} L ${x+w},${y+h-r} `;
    } else {
      d += `L ${x+w},${y+h-r} `;
    }
    d += `a ${r},${r} 0 0 1 -${r},${r} `;

    // 下辺
    if (side === 'bottom') {
      d += `L ${baseX + tw/2},${y+h} L ${tx},${ty} L ${baseX - tw/2},${y+h} L ${x+r},${y+h} `;
    } else {
      d += `L ${x+r},${y+h} `;
    }
    d += `a ${r},${r} 0 0 1 -${r},-${r} `;

    // 左辺
    if (side === 'left') {
      d += `L ${x},${baseY + tw/2} L ${tx},${ty} L ${x},${baseY - tw/2} L ${x},${y+r} `;
    } else {
      d += `L ${x},${y+r} `;
    }
    d += `a ${r},${r} 0 0 1 ${r},-${r} Z`;

    return d;
  }
  
  function renderLabels() {
    const currentIds = state.labels.map(l => l.id);
    dom.labelsLayer.querySelectorAll('.label-group').forEach(el => {
      if (!currentIds.includes(el.getAttribute('data-id'))) el.remove();
    });
    dom.linesLayer.querySelectorAll('.leader-line').forEach(el => {
      if (!currentIds.includes(el.getAttribute('data-id'))) el.remove();
    });
    dom.anchorsLayer.querySelectorAll('.anchor-handle').forEach(el => {
      if (!currentIds.includes(el.getAttribute('data-anchor-id'))) el.remove();
    });

    state.labels.forEach(lbl => {
      let gEl = dom.labelsLayer.querySelector(`g[data-id="${lbl.id}"]`);
      if (!gEl) {
        createLabelDOM(lbl); 
      }
      updateLabelDOM(lbl);   
    });
  }

  function createLabelDOM(lbl) {
    const gEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gEl.setAttribute('class', 'label-group');
    gEl.setAttribute('data-id', lbl.id);

    const bgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bgPath.setAttribute('class', 'label-rect');
    gEl.appendChild(bgPath);

    const patPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    patPath.setAttribute('class', 'pattern-rect');
    patPath.setAttribute('pointer-events', 'none');
    gEl.appendChild(patPath);

    const textSpace = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textSpace.setAttribute('class', 'label-text space-text');
    gEl.appendChild(textSpace);

    const textName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textName.setAttribute('class', 'label-text name-text');
    gEl.appendChild(textName);

    dom.labelsLayer.appendChild(gEl);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'leader-line');
    line.setAttribute('data-id', lbl.id);
    dom.linesLayer.appendChild(line);

    const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    anchor.setAttribute('class', 'anchor-handle');
    anchor.setAttribute('r', '6');
    anchor.setAttribute('data-anchor-id', lbl.id);
    dom.anchorsLayer.appendChild(anchor);
  }

  const BALLOON_CONFIG = {
    DEFAULT_HEIGHT: 44,
    MIN_WIDTH: 140,
    ANCHOR_RADIUS_COMIC: 4,
    ANCHOR_RADIUS_DEFAULT: 6,
    LINE_WIDTH_COMIC: 2.5,
    LINE_WIDTH_DEFAULT: 1.5
  };

  // テキスト実測キャッシュ：キー = "fontSize|text"
  const _textWidthCache = new Map();
  let _measureEl = null;

  function getMeasureEl() {
    if (_measureEl && _measureEl.isConnected) return _measureEl;
    _measureEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    _measureEl.setAttribute('class', 'label-text space-text'); // フォント設定を継承
    _measureEl.style.cssText = 'visibility:hidden; pointer-events:none; position:absolute;';
    dom.mapSvg.appendChild(_measureEl);
    return _measureEl;
  }

  function measureTextWidth(text, fontSize) {
    if (!text) return 0;
    const key = `${Math.round(fontSize * 10)}|${text}`;
    if (_textWidthCache.has(key)) return _textWidthCache.get(key);
    const el = getMeasureEl();
    el.setAttribute('font-size', `${fontSize}px`);
    el.textContent = text;
    const w = el.getComputedTextLength();
    // 0が返った場合はキャッシュしない（フォント未ロード）
    if (w > 0) _textWidthCache.set(key, w);
    return w;
  }

  function clearTextWidthCache() { _textWidthCache.clear(); }

  function updateLabelDOM(lbl) {
    const gEl = dom.labelsLayer.querySelector(`g[data-id="${lbl.id}"]`);
    const line = dom.linesLayer.querySelector(`line[data-id="${lbl.id}"]`);
    const anchor = dom.anchorsLayer.querySelector(`circle[data-anchor-id="${lbl.id}"]`);
    if (!gEl || !line || !anchor) return;

    const group = state.groups.find(g => g.id === lbl.groupId) || state.groups[0];
    const isSelected = state.selectedLabelIds.includes(lbl.id);

    const scale = state.viewScale || 1.0;

    if (typeof lbl.anchorX !== 'number' || isNaN(lbl.anchorX)) lbl.anchorX = lbl.labelX + 20;
    if (typeof lbl.anchorY !== 'number' || isNaN(lbl.anchorY)) lbl.anchorY = lbl.labelY + 20;

    // 高さを基準にフォントサイズと余白を動的計算（scale 込み）
    const baseH = (lbl.customHeight || BALLOON_CONFIG.DEFAULT_HEIGHT) * scale;
    const fontSizeSpace = Math.max(9, Math.min(32, baseH * 0.35));
    const fontSizeName  = Math.max(8, Math.min(28, baseH * 0.30));

    // 幅もフォントサイズ（scale込み）に追従させる
    const paddingX = 10;
    const spaceWMeasured = measureTextWidth(lbl.space || '', fontSizeSpace);
    const nameWMeasured  = measureTextWidth(lbl.name  || '', fontSizeName);
    const spaceW = spaceWMeasured > 0 ? spaceWMeasured : (lbl.space || '').length * fontSizeSpace * 0.95;
    const nameW  = nameWMeasured  > 0 ? nameWMeasured  : (lbl.name  || '').length * fontSizeName  * 0.95;

    const idealWidth = Math.max(
      BALLOON_CONFIG.MIN_WIDTH,
      spaceW + paddingX * 2,
      nameW  + paddingX * 2
    );
    lbl.autoWidth = idealWidth;

    const baseW = lbl.customWidth != null ? lbl.customWidth * scale : idealWidth;
    const w = baseW;
    const h = baseH;

    gEl.setAttribute('class', `label-group ${isSelected ? 'selected' : ''}`);
    gEl.setAttribute('data-group-id', lbl.groupId);
    line.setAttribute('class', `leader-line ${isSelected ? 'selected' : ''}`);
    line.setAttribute('data-group-id', lbl.groupId);
    anchor.setAttribute('data-group-id', lbl.groupId);

    const pathString = getBalloonPath(lbl.labelX, lbl.labelY, w, h, lbl.anchorX, lbl.anchorY, state.balloonStyle);

    const bgPath = gEl.querySelector('.label-rect');
    bgPath.setAttribute('d', pathString);
    bgPath.setAttribute('fill', group.color);
    bgPath.setAttribute('stroke', group.color);
    
    const lineWidth = state.balloonStyle === 'comic' ? BALLOON_CONFIG.LINE_WIDTH_COMIC : BALLOON_CONFIG.LINE_WIDTH_DEFAULT;
    bgPath.setAttribute('stroke-width', (lineWidth * scale).toString());

    const patPath = gEl.querySelector('.pattern-rect');
    if (group.pattern && group.pattern !== 'none') {
      patPath.setAttribute('d', pathString);
      patPath.setAttribute('fill', `url(#pat-${group.pattern})`);
      patPath.style.display = 'block';
    } else {
      patPath.style.display = 'none';
    }

    // テキストの更新
    // fontSizeSpace/Name はすでに scale 込みなので y 座標に scale を重ねて乗せない
    const textSpace = gEl.querySelector('.space-text');
    textSpace.setAttribute('x', lbl.labelX + paddingX);
    // 上段テキスト：上から約35%の位置（dominant-baseline=auto なので font-size 分を考慮）
    textSpace.setAttribute('y', lbl.labelY + h * 0.42);
    textSpace.setAttribute('font-size', `${fontSizeSpace}px`);
    textSpace.setAttribute('fill', group.textColor || '#ffffff');
    textSpace.textContent = lbl.space || '';

    const textName = gEl.querySelector('.name-text');
    textName.setAttribute('x', lbl.labelX + paddingX);
    // 下段テキスト：上から約75%の位置
    textName.setAttribute('y', lbl.labelY + h * 0.78);
    textName.setAttribute('font-size', `${fontSizeName}px`);
    textName.setAttribute('fill', group.textColor || '#ffffff');
    textName.textContent = lbl.name || '';

    // 引出線とアンカーの更新
    if (state.balloonStyle === 'comic') {
      line.style.display = 'none';
      anchor.classList.add('comic-anchor');
      anchor.style.removeProperty('opacity'); // インラインopacityを削除してCSSに任せる
      anchor.style.display = 'block';
      anchor.setAttribute('r', (BALLOON_CONFIG.ANCHOR_RADIUS_DEFAULT * scale * 1.5).toString());
    } else {
      line.style.display = 'block';
      line.setAttribute('x1', lbl.anchorX);
      line.setAttribute('y1', lbl.anchorY);
      line.setAttribute('x2', lbl.labelX + w / 2);
      line.setAttribute('y2', lbl.labelY + h / 2);
      line.setAttribute('stroke', group.color);
      line.setAttribute('stroke-width', (BALLOON_CONFIG.LINE_WIDTH_DEFAULT * scale).toString());
      
      anchor.classList.remove('comic-anchor');
      anchor.style.removeProperty('opacity'); // インラインopacityを削除
      anchor.style.display = 'block';
      anchor.setAttribute('r', (BALLOON_CONFIG.ANCHOR_RADIUS_DEFAULT * scale).toString());
    }
    anchor.setAttribute('cx', lbl.anchorX);
    anchor.setAttribute('cy', lbl.anchorY);
    anchor.setAttribute('fill', group.color);
  }

  function renderLegend() {
    dom.legendLayer.innerHTML = '';
    if (!state.showLegend) return;

    const visibleGroups = state.groups.filter(g => state.labels.some(l => l.groupId === g.id));
    if (!visibleGroups.length) return;

    const itemHeight = 24;
    const padding = 12;
    const boxWidth = 180;
    const boxHeight = padding * 2 + visibleGroups.length * itemHeight;

    dom.legendLayer.setAttribute('transform', `translate(${state.legendX}, ${state.legendY})`);

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('class', 'legend-bg');
    bg.setAttribute('width', boxWidth);
    bg.setAttribute('height', boxHeight);
    bg.setAttribute('fill', '#ffffff');
    dom.legendLayer.appendChild(bg);

    visibleGroups.forEach((g, i) => {
      const itemG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      itemG.setAttribute('transform', `translate(${padding}, ${padding + i * itemHeight})`);

      const colorRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      colorRect.setAttribute('width', '16');
      colorRect.setAttribute('height', '16');
      colorRect.setAttribute('fill', g.color);
      colorRect.setAttribute('rx', '3');
      itemG.appendChild(colorRect);

      if (g.pattern && g.pattern !== 'none') {
        const patRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        patRect.setAttribute('width', '16');
        patRect.setAttribute('height', '16');
        patRect.setAttribute('fill', `url(#pat-${g.pattern})`);
        patRect.setAttribute('rx', '3');
        itemG.appendChild(patRect);
      }

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('class', 'legend-item-text');
      text.setAttribute('x', '24');
      text.setAttribute('y', '13');
      text.textContent = g.name;
      itemG.appendChild(text);

      dom.legendLayer.appendChild(itemG);
    });
  }

  function renderAll() {
    renderLabels();
    renderLegend();
  }

  function renderCategoryList() {
    const editor = dom.categoryEditorBox;
    let html = '';
    
    if (!state.selectedGroupId && state.groups.length > 0) {
      state.selectedGroupId = state.groups[0].id;
    }

    const isEditorOpen = editor.classList.contains('open');

    state.groups.forEach(g => {
      const isActive = state.selectedGroupId === g.id;
      const count = state.labels.filter(l => l.groupId === g.id).length;
      const editorOpenClass = (isActive && isEditorOpen) ? 'editor-open' : '';

      html += `
        <div class="category-legend-item ${isActive ? 'active' : ''} ${editorOpenClass}" data-id="${esc(g.id)}">
          <div class="cat-meta">
            <span class="color-indicator" style="background:${esc(g.color)};"></span>
            <span>${esc(g.name)}</span>
            <span class="cat-count-badge">${count}</span>
          </div>
          <span class="category-arrow"></span>
        </div>`;
    });
    dom.categoryLegendList.innerHTML = html;

    // カテゴリ名入力中はbuildSelectOptionsを呼ばない（フォーカスが飛ぶため）
    if (document.activeElement !== dom.groupNameInput) {
      buildSelectOptions();
    }

    dom.bulkAddBtn.innerHTML = `マップにまとめて配置`;

    dom.categoryLegendList.querySelectorAll('.category-legend-item').forEach(el => {
      const id = el.getAttribute('data-id');

      el.addEventListener('mouseenter', () => {
        dom.mapSvg.querySelectorAll(`.label-group:not([data-group-id="${id}"]), .leader-line:not([data-group-id="${id}"]), .anchor-handle:not([data-group-id="${id}"])`).forEach(node => node.classList.add('dimmed'));
      });
      el.addEventListener('mouseleave', () => {
        dom.mapSvg.querySelectorAll('.dimmed').forEach(node => node.classList.remove('dimmed'));
      });

      el.addEventListener('click', () => {
        if (state.selectedGroupId === id && editor.classList.contains('open')) {
          editor.classList.remove('open');
        } else {
          state.selectedGroupId = id;
          openCategoryEditor(id);
        }
        renderCategoryList();
      });
    });
  }

  function openCategoryEditor(id) {
    const g = state.groups.find(g => g.id === id);
    if (!g) return;
    dom.groupNameInput.value = g.name;
    dom.groupColorInput.value = g.color;
    dom.groupPatternInput.value = g.pattern || 'none';
    dom.categoryEditorBox.classList.add('open');
    // 白黒印刷用模様のカスタムUIを現在値に同期
    upgradeNativeSelects();
  }

  function renderLabelList() {
    const existingItems = Array.from(dom.labelList.querySelectorAll('.label-list-item'));
    const sameStructure = existingItems.length === state.labels.length &&
      existingItems.every((el, i) => el.getAttribute('data-id') === state.labels[i].id);

    if (sameStructure) {
      // IDが同じでも内容が変わっている場合があるのでテキスト・色も更新する
      existingItems.forEach((el, i) => {
        const lbl = state.labels[i];
        const g = state.groups.find(g => g.id === lbl.groupId) || state.groups[0];
        el.classList.toggle('selected', state.selectedLabelIds.includes(lbl.id));
        const colorEl = el.querySelector('.color-indicator');
        if (colorEl) colorEl.style.background = g.color;
        const strongEl = el.querySelector('strong');
        if (strongEl) strongEl.textContent = lbl.space || '(空)';
        const spanEl = el.querySelector('span:not(.color-indicator)');
        if (spanEl) spanEl.textContent = lbl.name || '(名称未設定)';
      });
      return;
    }

    // 構造が変わった時だけ全再構築
    let html = '';
    state.labels.forEach(lbl => {
      const isSelected = state.selectedLabelIds.includes(lbl.id);
      const g = state.groups.find(g => g.id === lbl.groupId) || state.groups[0];
      html += `
        <div class="label-list-item ${isSelected ? 'selected' : ''}" data-id="${esc(lbl.id)}" tabindex="0">
          <span class="color-indicator" style="background:${esc(g.color)};"></span>
          <strong style="width:50px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(lbl.space || '(空)')}</strong>
          <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--ink-3);">${esc(lbl.name || '(名称未設定)')}</span>
        </div>`;
    });
    dom.labelList.innerHTML = html || '<div style="color:var(--ink-3);font-size:11px;text-align:center;padding:8px;">配置データはありません</div>';

    dom.labelList.querySelectorAll('.label-list-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = el.getAttribute('data-id');
        if (e.ctrlKey || e.metaKey) {
          if (state.selectedLabelIds.includes(id)) {
            state.selectedLabelIds = state.selectedLabelIds.filter(lid => lid !== id);
          } else {
            state.selectedLabelIds.push(id);
          }
        } else {
          state.selectedLabelIds = [id];
        }
        renderLabels();
        renderLabelList();
        updateEditForm();
      });

      // 上下キーで一覧内の選択を移動（DOM再生成せず差分更新するので focus が消えない）
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const items = Array.from(dom.labelList.querySelectorAll('.label-list-item'));
        const idx = items.indexOf(el);
        const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
        if (nextIdx < 0 || nextIdx >= items.length) return;
        const nextId = items[nextIdx].getAttribute('data-id');
        state.selectedLabelIds = [nextId];
        // 差分更新なのでフォーカスが維持される
        renderLabels();
        renderLabelList();
        updateEditForm();
        items[nextIdx].focus();
        items[nextIdx].scrollIntoView({ block: 'nearest' });
      });
    });
  }

  function updateEditForm() {
    if (!state.selectedLabelIds.length) {
      dom.selectedEditEmpty.style.display = 'block';
      dom.selectedEditForm.style.display = 'none';
      return;
    }
    dom.selectedEditEmpty.style.display = 'none';
    dom.selectedEditForm.style.display = 'flex';

    if (state.selectedLabelIds.length > 1) {
      dom.multiEditIndicator.style.display = 'block';
      dom.multiEditCount.textContent = state.selectedLabelIds.length;
      dom.singleEditFields.style.display = 'none';
      document.getElementById('align-block').style.display = 'flex';

      const first = state.labels.find(l => l.id === state.selectedLabelIds[0]);
      dom.sideGroupSelect.dataset.value = state.labels.every(l => !state.selectedLabelIds.includes(l.id) || l.groupId === first.groupId) ? first.groupId : '';
    } else {
      dom.multiEditIndicator.style.display = 'none';
      dom.singleEditFields.style.display = 'flex';
      document.getElementById('align-block').style.display = 'none';

      const lbl = state.labels.find(l => l.id === state.selectedLabelIds[0]);
      if (!lbl) return;
      dom.sideSpaceInput.value = lbl.space || '';
      dom.sideNameInput.value = lbl.name || '';

      const scale = state.viewScale || 1.0;
      // autoWidth は scale 込みなので、customWidth がある時だけ scale を乗せる
      const baseW = lbl.customWidth != null ? lbl.customWidth * scale : (lbl.autoWidth || BALLOON_CONFIG.MIN_WIDTH);
      const baseH = lbl.customHeight || BALLOON_CONFIG.DEFAULT_HEIGHT;
      
      dom.sideWidthInput.value = Math.round(baseW * scale);
      dom.sideHeightInput.value = Math.round(baseH * scale);

      dom.sideGroupSelect.dataset.value = lbl.groupId;
    }
    
    buildSelectOptions();
  }

  function initBulkGrid() {
    state.bulkRows = [{ space: '', name: '' }];
    renderBulkGrid();
  }

  dom.bulkGrid.addEventListener('paste', (e) => {
    e.preventDefault();

    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedText = clipboardData.getData('text');

    const lines = pastedText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return;

    const parsedData = lines.map(line => {
      const cols = line.split('\t');
      return {
        space: (cols[0] || '').trim(),
        name: (cols[1] || '').trim()
      };
    });

    let startIdx = 0;
    const activeInput = document.activeElement; 

    if (activeInput && activeInput.tagName === 'INPUT' && dom.bulkGrid.contains(activeInput)) {
      const rowDiv = activeInput.closest('.bulk-row');
      if (rowDiv) {
        startIdx = Array.from(dom.bulkGrid.children).indexOf(rowDiv);
      }
    } else {
      startIdx = Math.max(0, state.bulkRows.length - 1);
    }

    parsedData.forEach((data, i) => {
      const targetIdx = startIdx + i;
      if (targetIdx < state.bulkRows.length) {
        state.bulkRows[targetIdx].space = data.space;
        state.bulkRows[targetIdx].name = data.name;
      } else {
        state.bulkRows.push({ space: data.space, name: data.name });
      }
    });

    const lastRow = state.bulkRows[state.bulkRows.length - 1];
    if (lastRow.space !== '' || lastRow.name !== '') {
      state.bulkRows.push({ space: '', name: '' });
    }

    renderBulkGrid();
    showToast(`${parsedData.length}件のデータを貼り付けました`);
  });

  function renderBulkGrid() {
    dom.bulkGrid.innerHTML = ''; 
    state.bulkRows.forEach((row) => {
      dom.bulkGrid.appendChild(createRowElement(row));
    });
  }

  function createRowElement(row) {
    const div = document.createElement('div');
    div.className = 'bulk-row';
    div.innerHTML = `
      <input type="text" placeholder="配置・スペース" value="${esc(row.space)}" data-field="space">
      <input type="text" placeholder="サークル名" value="${esc(row.name)}" data-field="name">
      <button class="bulk-delete-btn" tabindex="-1">×</button>
    `;

    div.querySelectorAll('input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        const isCtrl = getCtrlKey(e);
        const currentIdx = Array.from(dom.bulkGrid.children).indexOf(div);
        const field = input.getAttribute('data-field');

        if (isCtrl && e.key === 'Enter') {
          e.preventDefault();
          handleBulkAdd();
          return;
        }

        if (e.key === 'Enter' && !isCtrl) {
          e.preventDefault();
          let nextRow = dom.bulkGrid.children[currentIdx + 1];
          
          if (!nextRow) {
            state.bulkRows.push({ space: '', name: '' });
            nextRow = createRowElement({ space: '', name: '' });
            dom.bulkGrid.appendChild(nextRow);
          }
          nextRow.querySelector(`input[data-field="${field}"]`).focus();
        }

        if (e.key === 'Tab') {
          if (!e.shiftKey && field === 'name') {
            e.preventDefault();
            let nextRow = dom.bulkGrid.children[currentIdx + 1];
            if (!nextRow) {
              state.bulkRows.push({ space: '', name: '' });
              nextRow = createRowElement({ space: '', name: '' });
              dom.bulkGrid.appendChild(nextRow);
            }
            nextRow.querySelector(`input[data-field="space"]`).focus();
          } 
          else if (e.shiftKey && field === 'space' && currentIdx > 0) {
            e.preventDefault();
            const prevRow = dom.bulkGrid.children[currentIdx - 1];
            prevRow.querySelector(`input[data-field="name"]`).focus();
          }
        }
      });

      input.addEventListener('input', () => {
        const field = input.getAttribute('data-field');
        const currentIdx = Array.from(dom.bulkGrid.children).indexOf(div);
        state.bulkRows[currentIdx][field] = input.value;

        if (currentIdx === state.bulkRows.length - 1 && input.value !== '') {
          state.bulkRows.push({ space: '', name: '' });
          dom.bulkGrid.appendChild(createRowElement({ space: '', name: '' }));
        }
      });
    });

    div.querySelector('.bulk-delete-btn').addEventListener('click', () => {
      const currentIdx = Array.from(dom.bulkGrid.children).indexOf(div);
      state.bulkRows.splice(currentIdx, 1);
      if (!state.bulkRows.length) state.bulkRows.push({ space: '', name: '' });
      renderBulkGrid();
    });

    return div;
  }

  // ドロップダウン生成（テンプレート文字列で一覧性MAX版）
  function renderSelectOptions(selectWrapper, onChangeCallback) {
    if (!selectWrapper) return;
    
    const currentVal = selectWrapper.dataset.value || state.groups[0]?.id;
    const currentGroup = state.groups.find(g => g.id === currentVal) || state.groups[0];
    if (!currentGroup) return;

    // 1. HTMLを一気に流し込む（コードがスッキリ！）
    selectWrapper.innerHTML = `
      <div class="custom-select-trigger" tabindex="0">
        <div class="color-indicator" style="background-color: ${esc(currentGroup.color)};"></div>
        <span class="custom-select-label">${esc(currentGroup.name)}</span>
      </div>
      <div class="custom-select-options">
        ${state.groups.map((g, i) => `
          <div class="custom-select-option ${g.id === currentVal ? 'selected' : ''}" data-value="${esc(g.id)}">
            <div class="color-indicator" style="background-color: ${esc(g.color)};"></div>
            <span class="custom-select-label">${esc(g.name)}</span>
          </div>
        `).join('')}
      </div>
    `;

    const trigger = selectWrapper.querySelector('.custom-select-trigger');
    const optionsList = selectWrapper.querySelector('.custom-select-options');
    const options = optionsList.querySelectorAll('.custom-select-option');
    let highlightedIndex = state.groups.findIndex(g => g.id === currentVal);

    // 2. 開閉と選択のロジック（CSSアニメーション対応）
    const toggleMenu = (show) => {
      const isOpen = selectWrapper.classList.contains('is-open');
      const shouldOpen = show !== undefined ? show : !isOpen;

      // 他のメニューをすべて閉じる
      document.querySelectorAll('.custom-select-wrapper.is-open, .custom-select-container.is-open')
        .forEach(el => { if (el !== selectWrapper) el.classList.remove('is-open'); });
      
      // CSSアニメーションをトリガー
      selectWrapper.classList.toggle('is-open', shouldOpen);

      if (!shouldOpen) {
        // fixed 配置をリセット
        optionsList.style.position = '';
        optionsList.style.top = '';
        optionsList.style.left = '';
        optionsList.style.width = '';
        optionsList.style.zIndex = '';
      }

      if (shouldOpen) {
        highlightedIndex = state.groups.findIndex(g => g.id === selectWrapper.dataset.value);
        updateHighlight();
        // float-category内のドロップダウンは fixed 配置でクリッピング回避
        if (selectWrapper.id === 'float-category' || selectWrapper.closest('#float-category')) {
          const rect = trigger.getBoundingClientRect();
          optionsList.style.position = 'fixed';
          optionsList.style.top = (rect.bottom + 4) + 'px';
          optionsList.style.left = rect.left + 'px';
          optionsList.style.width = Math.max(rect.width, 160) + 'px';
          optionsList.style.zIndex = '9999';
        }
      }
    };

    const updateHighlight = () => {
      options.forEach((o, i) => {
        o.style.backgroundColor = (i === highlightedIndex) ? 'var(--head-bg)' : '';
      });
    };

    const selectOption = (id, keepOpen) => {
      selectWrapper.dataset.value = id;
      const group = state.groups.find(g => g.id === id);
      if (group) {
        trigger.innerHTML = `
          <div class="color-indicator" style="background-color: ${esc(group.color)};"></div>
          <span class="custom-select-label">${esc(group.name)}</span>
        `;
      }
      
      // リスト内の水色ハイライト（selected）も新しいものに付け替える
      // buildSelectOptions再実行後も動作するよう毎回querySelectorAllで取り直す
      selectWrapper.querySelectorAll('.custom-select-option').forEach(
        opt => opt.classList.toggle('selected', opt.dataset.value === id)
      );

      if (!keepOpen) {
        toggleMenu(false);
        trigger.focus();
        // keepOpen=false（確定）の時だけコールバックを実行
        if (typeof onChangeCallback === 'function') onChangeCallback(id);
      }
      // keepOpen=true（上下キー移動中）はコールバックを呼ばない
    };

    // 3. イベントリスナー群
    trigger.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    
    options.forEach(opt => {
      opt.addEventListener('mouseenter', () => options.forEach(o => o.style.backgroundColor = ''));
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        selectOption(opt.dataset.value);
      });
    });

    trigger.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape', ' '].includes(e.key)) {
        e.stopPropagation();
      }
      const isOpen = selectWrapper.classList.contains('is-open');
      if (!isOpen) {
        if (['Enter', 'ArrowDown', ' '].includes(e.key)) { e.preventDefault(); toggleMenu(true); }
        return;
      }

      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        // buildSelectOptions再実行後も動作するよう毎回取り直す
        const currentOptions = Array.from(selectWrapper.querySelectorAll('.custom-select-option'));
        if (!currentOptions.length) return;
        if (e.key === 'Home') {
          highlightedIndex = 0;
        } else if (e.key === 'End') {
          highlightedIndex = currentOptions.length - 1;
        } else {
          const step = e.key === 'ArrowDown' ? 1 : -1;
          highlightedIndex = (highlightedIndex + step + currentOptions.length) % currentOptions.length;
        }
        currentOptions.forEach((o, i) => {
          o.style.backgroundColor = (i === highlightedIndex) ? 'var(--head-bg)' : '';
        });
        // keepOpen=true で表示だけ更新（コールバック不要）
        const group = state.groups[highlightedIndex];
        if (group) {
          selectWrapper.dataset.value = group.id;
          trigger.innerHTML = `
            <div class="color-indicator" style="background-color: ${esc(group.color)};"></div>
            <span class="custom-select-label">${esc(group.name)}</span>
          `;
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // Enterで確定：コールバックを呼ぶ
        const currentOptions = Array.from(selectWrapper.querySelectorAll('.custom-select-option'));
        const group = state.groups[highlightedIndex];
        if (group) {
          selectOption(group.id); // keepOpen=false → callback実行
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        toggleMenu(false);
        trigger.focus();
      }
    });
  }

  // 余白クリックで閉じる処理（クラスを外すだけにシンプル化）
  document.addEventListener('click', () => {
    document.querySelectorAll('.is-open').forEach(el => el.classList.remove('is-open'));
  });

  function buildSelectOptions() {
    // ラベルの所属カテゴリを一括更新する共通処理
    const updateTargetLabels = (newGroupId) => {
      pushHistory();
      state.selectedLabelIds.forEach(id => {
        const lbl = state.labels.find(l => l.id === id);
        if (lbl) lbl.groupId = newGroupId;
      });
      renderAll();
      renderCategoryList();
      renderLabelList();
      updateEditForm();
      // pushHistory の差分チェックで弾かれる場合も確実に保存・ステータス更新
      saveAutosave();
      updateStatus(true);
    };

    // 各ドロップダウンの設定リスト
    const selects = [
      { el: dom.sideGroupSelect, cb: updateTargetLabels },
      { el: dom.ctxGroupSelect, cb: updateTargetLabels },
      { el: dom.bulkGroupSelect, cb: (id) => { state.selectedGroupId = id; } },
      { 
        el: document.getElementById('float-category'), 
        cb: (id) => {
          const lblId = dom.floatingEditor.dataset.targetId;
          const lbl = state.labels.find(l => l.id === lblId);
          if (lbl) {
            pushHistory();
            lbl.groupId = id;
            renderAll();
            if (typeof renderCategoryList === 'function') renderCategoryList();
            updateFloatingEditorCategory(id);
            saveAutosave();
            updateStatus(true);
          }
        }
      }
    ];

    selects.forEach(({ el, cb }) => {
      if (el) {
        // 連続追加の所属カテゴリ表示は常に state.selectedGroupId と一致させる
        //    （カテゴリ一覧クリックや新規追加でselectedGroupIdが変わった時も追従）
        if (el === dom.bulkGroupSelect) el.dataset.value = state.selectedGroupId;
        renderSelectOptions(el, cb);
      }
    });
    upgradeNativeSelects();
  }

  function updateFloatingEditorCategory(groupId) {
    const floatCategoryContainer = document.getElementById('float-category');
    const group = state.groups.find(g => g.id === groupId);
    const trigger = floatCategoryContainer?.querySelector('.custom-select-trigger');
    
    if (trigger && group) {
      trigger.innerHTML = `
        <div class="color-indicator" style="background-color: ${esc(group.color)};"></div>
        <span class="custom-select-label">${esc(group.name)}</span>
      `;
      floatCategoryContainer.dataset.value = groupId;
    }
  }

  // 追加：普通の <select> （サイズ・スタイルなど）を「ふわっと開くUI」に自動変換する関数
  function upgradeNativeSelects() {
    const targets = [dom.globalBalloonStyleSelect, dom.viewScaleSelect, dom.groupPatternInput];
    
    targets.forEach(selectEl => {
      if (!selectEl) return;
      
      // すでに構築済みの場合は、選択状態のテキストだけ同期して終了
      if (selectEl.dataset.upgraded) {
        const wrapper = selectEl.nextElementSibling;
        const selectedOpt = selectEl.options[selectEl.selectedIndex];
        if (wrapper && selectedOpt) {
          wrapper.querySelector('.custom-select-trigger .custom-select-label').textContent = selectedOpt.text;
          wrapper.querySelectorAll('.custom-select-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.value === selectEl.value);
          });
        }
        return;
      }
      
      // 初回構築：元の select を隠し、カスタムUIを後ろに挿入する
      selectEl.style.display = 'none';
      selectEl.dataset.upgraded = 'true';
      
      const wrapper = document.createElement('div');
      wrapper.className = 'custom-select-wrapper is-plain'; // 色チップなし用のクラス
      wrapper.style.width = '100%';
      selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
      
      const optionsHTML = Array.from(selectEl.options).map((opt) => `
        <div class="custom-select-option ${opt.value === selectEl.value ? 'selected' : ''}" data-value="${esc(opt.value)}">
          <span class="custom-select-label">${esc(opt.text)}</span>
        </div>
      `).join('');
      
      const selectedOpt = selectEl.options[selectEl.selectedIndex];
      
      wrapper.innerHTML = `
        <div class="custom-select-trigger" tabindex="0">
          <span class="custom-select-label">${esc(selectedOpt ? selectedOpt.text : '')}</span>
        </div>
        <div class="custom-select-options">
          ${optionsHTML}
        </div>
      `;
      
      const trigger = wrapper.querySelector('.custom-select-trigger');
      const optionsList = wrapper.querySelector('.custom-select-options');
      const options = optionsList.querySelectorAll('.custom-select-option');
      let highlightedIndex = selectEl.selectedIndex > -1 ? selectEl.selectedIndex : 0;
      
      const toggleMenu = (show) => {
        const isOpen = wrapper.classList.contains('is-open');
        const shouldOpen = show !== undefined ? show : !isOpen;
        
        document.querySelectorAll('.custom-select-wrapper.is-open').forEach(el => { 
          if (el !== wrapper) el.classList.remove('is-open'); 
        });
        wrapper.classList.toggle('is-open', shouldOpen);
        
        if (shouldOpen) {
          highlightedIndex = Array.from(selectEl.options).findIndex(o => o.value === selectEl.value);
          options.forEach((o, i) => o.style.backgroundColor = (i === highlightedIndex) ? 'var(--head-bg)' : '');
        }
      };
      
      const selectOption = (val) => {
        selectEl.value = val; // 裏側の本当の select に値をセット
        toggleMenu(false);
        trigger.focus();
        selectEl.dispatchEvent(new Event('change')); // 元々設定されていた保存処理などを走らせる
        upgradeNativeSelects(); // UIを新しい値で同期
      };
      
      trigger.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
      options.forEach(opt => opt.addEventListener('click', (e) => { e.stopPropagation(); selectOption(opt.dataset.value); }));
      
      trigger.addEventListener('keydown', (e) => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape', ' '].includes(e.key)) {
          e.stopPropagation(); // 右ペインへのバブルを止める
        }
        if (!wrapper.classList.contains('is-open')) {
          if (['Enter', 'ArrowDown', ' '].includes(e.key)) { e.preventDefault(); toggleMenu(true); }
          return;
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          if (e.key === 'Home') {
            highlightedIndex = 0;
          } else if (e.key === 'End') {
            highlightedIndex = options.length - 1;
          } else {
            const step = e.key === 'ArrowDown' ? 1 : -1;
            highlightedIndex = (highlightedIndex + step + options.length) % options.length;
          }
          options.forEach((o, i) => o.style.backgroundColor = (i === highlightedIndex) ? 'var(--head-bg)' : '');
        } else if (e.key === 'Enter') {
          e.preventDefault(); 
          const chosen = selectEl.options[highlightedIndex];
          if (chosen) selectOption(chosen.value);
        } else if (e.key === 'Escape') {
          e.preventDefault(); toggleMenu(false); trigger.focus();
        }
      });
    });
  }

  function initCudPalette() {
    const paletteContainer = document.getElementById('cud-quick-palette');
    if (!paletteContainer) return;
    paletteContainer.innerHTML = '';
    
    CUD_PRESETS.forEach((preset) => {
      const chip = document.createElement('div');
      chip.style.width = '24px';
      chip.style.height = '24px';
      chip.style.borderRadius = '4px';
      chip.style.backgroundColor = preset.color;
      chip.style.cursor = 'pointer';
      chip.style.border = '1px solid var(--line)';
      chip.style.position = 'relative';
      chip.title = `適用: 色と模様をセット`;
      
      if (preset.pattern && preset.pattern !== 'none') {
        chip.innerHTML = `<svg width="100%" height="100%" style="position:absolute; top:0; left:0; pointer-events:none; border-radius:3px;"><rect width="100%" height="100%" fill="url(#pat-${preset.pattern})"></rect></svg>`;
      }

      chip.addEventListener('click', () => {
        pushHistory();
        const g = state.groups.find(g => g.id === state.selectedGroupId);
        if (g) {
          g.color = preset.color;
          g.textColor = preset.textColor;
          g.pattern = preset.pattern;
          
          dom.groupColorInput.value = preset.color;
          dom.groupPatternInput.value = preset.pattern;
          upgradeNativeSelects(); // 白黒印刷模様のカスタムUIを同期
          
          renderCategoryList();
          renderAll();
          showToast('色と模様を適用しました');
        }
      });
      paletteContainer.appendChild(chip);
    });
  }
