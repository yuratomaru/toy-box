// 外部由来のデータ（自動保存・ZIPインポート）を取り込む前の検証。型・色・IDを正規化する
function sanitizeProject(p) {
  const id = (v) => String(v ?? '').replace(/[^\w-]/g, '').slice(0, 64);
  const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
  const str = (v, n) => String(v ?? '').slice(0, n);
  const color = (c) => (/^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? String(c) : '#888888');
  if (Array.isArray(p.groups)) p.groups = p.groups.filter((g) => g && typeof g === 'object').map((g) => ({ ...g, id: id(g.id), name: str(g.name, 100), color: color(g.color), ...(g.pattern != null ? { pattern: id(g.pattern) } : {}) }));
  if (Array.isArray(p.labels)) {
    p.labels = p.labels.filter((l) => l && typeof l === 'object').map((l) => ({
      ...l, id: id(l.id), groupId: id(l.groupId), space: str(l.space, 100), name: str(l.name, 200),
      anchorX: num(l.anchorX), anchorY: num(l.anchorY), labelX: num(l.labelX), labelY: num(l.labelY),
      customWidth: l.customWidth == null ? null : num(l.customWidth), customHeight: l.customHeight == null ? null : num(l.customHeight)
    }));
  }
  ['legendX', 'legendY', 'mapWidth', 'mapHeight', 'viewScale'].forEach((k) => { if (k in p) p[k] = num(p[k], k === 'viewScale' ? 1 : 0); });
  if ('projectName' in p) p.projectName = str(p.projectName, 100);
  return p;
}

  const AUTOSAVE_KEY = 'otakara-map-editor:autosave:v1';

  // CUD_PRESETS をマスターデータとして一元管理
  const CUD_PRESETS = [
    { color: '#e63946', pattern: 'none',          textColor: '#ffffff' }, // 1. 赤
    { color: '#1d70b8', pattern: 'dots',          textColor: '#ffffff' }, // 2. 青
    { color: '#2a9d8f', pattern: 'stripes1',      textColor: '#ffffff' }, // 3. 緑
    { color: '#f4a261', pattern: 'stripes2',      textColor: '#2f3640' }, // 4. 橙
    { color: '#d94bb7', pattern: 'diagonal-grid', textColor: '#ffffff' }, // 5. 桃
    { color: '#1d3557', pattern: 'grid',          textColor: '#ffffff' }, // 6. 紺
    { color: '#8e44ad', pattern: 'cross',         textColor: '#ffffff' }, // 7. 紫
    { color: '#e9c46a', pattern: 'wave',          textColor: '#2f3640' }  // 8. 黄
  ];

  // 初期カテゴリはA〜Dの4つだけ生成（プリセット1〜4を使用）
  //    新規追加時は createNewGroup() が groups.length % CUD_PRESETS.length で
  //    プリセット5（桃）以降を順番に割り当てる
  const DEFAULT_GROUPS = CUD_PRESETS.slice(0, 4).map((preset, index) => ({
    id: `g-${index + 1}`,
    name: `カテゴリ ${String.fromCharCode(65 + index)}`, // A(65), B(66), C(67)...
    color: preset.color,
    textColor: preset.textColor,
    pattern: preset.pattern
  }));

  // ユーザーが触らない定数
  const CONFIG = {
    MAX_EXPORT_PIXELS: 9000,
    DEFAULT_PADDING: 20,
    MAX_CANVAS_SIZE: 2048
  };

  const state = {
    projectName: '配置図',
    dirty: false,
    selectMode: 'pan',

    viewScale: 1.0, // viewScaleからリネーム: 編集画面のズーム倍率
    mapWidth: 1000,
    mapHeight: 700,
    originalWidth: 1000,
    originalHeight: 700,

    mapImageData: null,   
    originalMapData: null,

    showLegend: false,
    legendX: 30,
    legendY: 30,
    groups: JSON.parse(JSON.stringify(DEFAULT_GROUPS)),
    selectedGroupId: 'g-1',
    labels: [],
    bulkRows: [],
    selectedLabelIds: [],
    balloonStyle: 'default',
    historyStack: [],
    redoStack: [],
    viewBox: { x: 0, y: 0, w: 1000, h: 700 },
    hasShownShiftHint: false
  };

  // 背景色の明るさに応じて、白文字か黒文字かを判定
  function getContrastingTextColor(hexColor) {
    const hex = hexColor.replace('#', '');
    if (hex.length !== 6) return '#ffffff';
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 140) ? '#2f3640' : '#ffffff';
  }

  // 自動命名ロジック (既存のアルファベットの「次」を探す)
  function getNextGroupName() {
    const defaultPrefix = 'カテゴリ ';
    let maxCharCode = 64; // 'A' の1つ前

    state.groups.forEach(g => {
      if (g.name.startsWith(defaultPrefix)) {
        const suffix = g.name.replace(defaultPrefix, '');
        if (suffix.length === 1) {
          const code = suffix.charCodeAt(0);
          if (code > maxCharCode && code <= 90) { // A〜Zの範囲
            maxCharCode = code;
          }
        }
      }
    });

    if (maxCharCode >= 90) { 
      return `カテゴリ ${state.groups.length + 1}`; // Zを超えたら数字に切り替え
    } else {
      return `${defaultPrefix}${String.fromCharCode(maxCharCode + 1)}`;
    }
  }

  // 新規カテゴリを追加する関数（色もプリセットから順番に拝借）
  function createNewGroup() {
    pushHistory();
    const newId = 'g-' + Date.now();
    
    // CUDプリセットの色をループで順番に割り当てる
    const presetIndex = state.groups.length % CUD_PRESETS.length;
    const preset = CUD_PRESETS[presetIndex];

    const newGroup = {
      id: newId,
      name: getNextGroupName(),
      color: preset.color,
      textColor: preset.textColor,
      pattern: preset.pattern
    };

    state.groups.push(newGroup);
    state.selectedGroupId = newId;
    return newGroup;
  }

  // 履歴(undo/redo)用のスナップショットを生成する共通関数
  function getHistorySnapshot() {
    return JSON.stringify({
      projectName: state.projectName,
      groups: state.groups,
      labels: state.labels,
      showLegend: state.showLegend,
      legendX: state.legendX,
      legendY: state.legendY,
      balloonStyle: state.balloonStyle,
      viewScale: state.viewScale
    });
  }

  // 履歴保存
  function pushHistory() {
    const snapshot = getHistorySnapshot();
    if (state.historyStack.length === 0 || state.historyStack[state.historyStack.length - 1] !== snapshot) {
      state.historyStack.push(snapshot);
      if (state.historyStack.length > 50) state.historyStack.shift();
      state.redoStack = [];
      updateStatus(true);
    }
  }

  function updateStatus(isDirty) {
    state.dirty = isDirty;
    if (isDirty) {
      dom.saveStatus.textContent = '変更あり（未保存）';
      dom.saveStatus.className = 'status-modified';
      saveAutosave();
    } else {
      dom.saveStatus.textContent = '保存済み';
      dom.saveStatus.className = 'status-saved';
    }
    dom.undoBtn.disabled = state.historyStack.length === 0;
    dom.redoBtn.disabled = state.redoStack.length === 0;
  }

  function undo() {
    if (!state.historyStack.length) return;
    const current = getHistorySnapshot();
    state.redoStack.push(current);
    const prev = JSON.parse(state.historyStack.pop());
    Object.assign(state, prev);
    syncStateToUI();
    renderAll();
    updateStatus(state.historyStack.length > 0);
    showToast('取り消しました');
  }

  function redo() {
    if (!state.redoStack.length) return;
    const snapshot = state.redoStack.pop();
    state.historyStack.push(getHistorySnapshot());
    Object.assign(state, JSON.parse(snapshot));
    syncStateToUI();
    renderAll();
    updateStatus(true);
    showToast('やり直しました');
  }

  function saveAutosave() {
    try {
      const data = {
        projectName: state.projectName,
        groups: state.groups,
        labels: state.labels,
        showLegend: state.showLegend,
        legendX: state.legendX,
        legendY: state.legendY,
        mapWidth: state.mapWidth,
        mapHeight: state.mapHeight,
        balloonStyle: state.balloonStyle,
        viewScale: state.viewScale
      };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
      // localStorage保存成功後は「保存済み」に更新
      // （updateStatus経由だと再帰するので直接DOMを更新）
      state.dirty = false;
      if (dom.saveStatus) {
        dom.saveStatus.textContent = '保存済み';
        dom.saveStatus.className = 'status-saved';
      }
    } catch (e) {
      console.error('Autosave failed:', e);
    }
  }

  function loadAutosave() {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const parsed = sanitizeProject(JSON.parse(saved));
        Object.assign(state, parsed);
        // 保存されていたキャンバスサイズをDOMに反映（白い四角を正しいサイズで表示）
        if (state.mapWidth && state.mapHeight) {
          dom.canvasBackground.setAttribute('width', state.mapWidth);
          dom.canvasBackground.setAttribute('height', state.mapHeight);
          dom.mapImage.setAttribute('width', state.mapWidth);
          dom.mapImage.setAttribute('height', state.mapHeight);
        }
        resetView();
        syncStateToUI();
        renderAll();
        dom.recoveryBar.classList.remove('hidden');
        dom.noImageGuide.classList.add('hidden');
      }
    } catch (e) { console.error('Load autosave failed:', e); }
  }

  function syncStateToUI() {
    dom.toggleLegendCb.checked = state.showLegend;
    
    if (dom.globalBalloonStyleSelect) {
      dom.globalBalloonStyleSelect.value = state.balloonStyle || 'default';
    }
    
    // 吹き出しのサイズ（倍率）初期値をUIにセットする処理
    if (dom.viewScaleSelect) {
      const currentScale = state.viewScale !== undefined ? state.viewScale : 1.0;
      const strVal = currentScale.toString();
      // 完全一致する option があればそれを選択
      if (Array.from(dom.viewScaleSelect.options).some(o => o.value === strVal)) {
        dom.viewScaleSelect.value = strVal;
      } else {
        // 古いオートセーブ値など一致しない場合は最も近い値の option を選ぶ
        let closest = dom.viewScaleSelect.options[0];
        let minDiff = Infinity;
        Array.from(dom.viewScaleSelect.options).forEach(o => {
          const diff = Math.abs(parseFloat(o.value) - currentScale);
          if (diff < minDiff) { minDiff = diff; closest = o; }
        });
        dom.viewScaleSelect.value = closest.value;
        state.viewScale = parseFloat(closest.value);
      }
    }

    buildSelectOptions();
    renderCategoryList();
    renderLabelList();
    updateEditForm();
  }

  /*-----------------
    データ操作・再描画
  ------------------*/

  function handleBulkAdd() {
    const valid = state.bulkRows.filter(r => r.space || r.name);
    if (!valid.length) { showToast('データを入力してください'); return; }

    pushHistory();
    const startX = state.viewBox.x + state.viewBox.w / 3;
    const startY = state.viewBox.y + state.viewBox.h / 4;

    const rowGap = 60; 

    // viewScale に統一
    if (typeof state.viewScale === 'undefined') state.viewScale = 1.0;

    const newIds = [];
    valid.forEach((row, i) => {
      const offsetY = i * rowGap;
      const id = 'l-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);

      state.labels.push({
        id,
        groupId: state.selectedGroupId,
        space: row.space,
        name: row.name,
        anchorX: startX,
        anchorY: startY + offsetY,
        labelX: startX + 40,
        labelY: startY + offsetY - 20,
        customWidth: null,  // autoWidth に任せる（renderLabels内で実測計算）
        customHeight: 44
      });
      newIds.push(id);
    });

    // 追加した全件を選択状態にする
    state.selectedLabelIds = [...newIds];

    initBulkGrid();
    renderAll();
    renderLabelList();
    renderCategoryList();
    updateEditForm();
    saveAutosave();
    updateStatus(true); // ステータスバッジを更新

    // 追加した吹き出し群がビュー内に収まるようスクロール
    const lastId = newIds[newIds.length - 1];
    const lastLbl = state.labels.find(l => l.id === lastId);
    if (lastLbl) {
      const margin = 80;
      const allNew = state.labels.filter(l => newIds.includes(l.id));
      const minY = Math.min(...allNew.map(l => l.labelY)) - margin;
      const maxY = Math.max(...allNew.map(l => l.labelY + 44)) + margin;
      const minX = Math.min(...allNew.map(l => l.labelX)) - margin;
      const maxX = Math.max(...allNew.map(l => l.labelX + 140)) + margin;
      // 現在のビューに収まっていない場合のみ移動
      if (minY < state.viewBox.y || maxY > state.viewBox.y + state.viewBox.h ||
          minX < state.viewBox.x || maxX > state.viewBox.x + state.viewBox.w) {
        state.viewBox.x = minX;
        state.viewBox.y = minY;
        applyViewBox();
      }
    }

    showToast(`${valid.length}個の吹き出しを追加しました`);
  }

  dom.bulkAddBtn.addEventListener('click', handleBulkAdd);

  // 入力系操作のdebounce保存（pushHistoryは重いのでinput終了後500msで一度だけ）
  let _saveDebounceTimer = null;
  function debouncedSave() {
    clearTimeout(_saveDebounceTimer);
    _saveDebounceTimer = setTimeout(() => {
      saveAutosave();
      updateStatus(true);
    }, 500);
  }

  function updateSelectedLabels(field, value) {
    if (!state.selectedLabelIds.length) return;
    
    state.selectedLabelIds.forEach(id => {
      const lbl = state.labels.find(l => l.id === id);
      if (lbl) {
        if (field === 'customWidth' || field === 'customHeight') {
          lbl[field] = parseInt(value) || (field === 'customWidth' ? 140 : 44);
        } else {
          lbl[field] = value;
          // テキストが変わったら customWidth をリセットして自動幅を再計算させる
          if (field === 'space' || field === 'name') lbl.customWidth = null;
        }
      }
    });
    
    renderAll();
    renderLabelList();
    renderCategoryList();
    updateEditForm();
    debouncedSave();
  }

  // 入力完了（フォーカスが外れた）タイミングでpushHistory
  ['sideSpaceInput', 'sideNameInput', 'sideWidthInput', 'sideHeightInput',
   'ctxSpaceInput', 'ctxNameInput', 'ctxWidthInput', 'ctxHeightInput'].forEach(key => {
    dom[key]?.addEventListener('change', () => {
      if (state.selectedLabelIds.length) pushHistory();
    });
  });

  dom.sideSpaceInput.addEventListener('input', (e) => updateSelectedLabels('space', e.target.value));
  dom.sideNameInput.addEventListener('input', (e) => updateSelectedLabels('name', e.target.value));
  dom.sideWidthInput.addEventListener('input', (e) => updateSelectedLabels('customWidth', e.target.value));
  dom.sideHeightInput.addEventListener('input', (e) => updateSelectedLabels('customHeight', e.target.value));

  dom.ctxSpaceInput.addEventListener('input', (e) => updateSelectedLabels('space', e.target.value));
  dom.ctxNameInput.addEventListener('input', (e) => updateSelectedLabels('name', e.target.value));
  dom.ctxWidthInput.addEventListener('input', (e) => updateSelectedLabels('customWidth', e.target.value));
  dom.ctxHeightInput.addEventListener('input', (e) => updateSelectedLabels('customHeight', e.target.value));

  function duplicateLabels() {
    if (!state.selectedLabelIds.length) return;
    pushHistory();
    const newIds = [];
    state.selectedLabelIds.forEach(id => {
      const orig = state.labels.find(l => l.id === id);
      if (orig) {
        const newId = 'l-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
        state.labels.push({
          ...orig,
          id: newId,
          space: orig.space ? orig.space + '_コピー' : '',
          anchorX: orig.anchorX + 20,
          anchorY: orig.anchorY + 20,
          labelX: orig.labelX + 20,
          labelY: orig.labelY + 20
        });
        newIds.push(newId);
      }
    });
    state.selectedLabelIds = newIds;
    renderAll();
    renderLabelList();
    renderCategoryList();
    updateEditForm();
    showToast(`${newIds.length}件を複製しました`);
  }

  function deleteLabels() {
    if (!state.selectedLabelIds.length) return;
    pushHistory();
    const count = state.selectedLabelIds.length;
    state.labels = state.labels.filter(l => !state.selectedLabelIds.includes(l.id));
    state.selectedLabelIds = [];
    renderAll();
    renderLabelList();
    renderCategoryList();
    updateEditForm();
    if (typeof closeContextMenu === 'function') closeContextMenu();
    else dom.customContextMenu.style.display = 'none';
    showToast(`${count}件を削除しました`);
  }

  function closeFloatingEditor() {
    if (dom.floatingEditor.style.display === 'none') return;
    
    const id = dom.floatingEditor.dataset.targetId;
    const lbl = state.labels.find(l => l.id === id);
    
    if (lbl) {
      const newSpace = dom.floatSpace.value;
      const newName  = dom.floatName.value;

      // 新規追加(_isNew)かつ両方空のまま閉じたら自動削除
      if (lbl._isNew && !newSpace.trim() && !newName.trim()) {
        state.historyStack.pop(); // triggerCreateLabel で積んだ履歴も取り消す
        state.labels = state.labels.filter(l => l.id !== id);
        state.selectedLabelIds = state.selectedLabelIds.filter(lid => lid !== id);
        renderAll(); renderLabelList(); renderCategoryList(); updateEditForm();
        dom.floatingEditor.style.display = 'none';
        return;
      }

      const oldSpace = lbl.space;
      const oldName  = lbl.name;
      const oldGroup = lbl.groupId;
      const floatCategoryContainer = document.getElementById('float-category');
      const newGroup = floatCategoryContainer?.dataset.value || oldGroup;
      
      if (oldSpace !== newSpace || oldName !== newName || oldGroup !== newGroup || lbl._isNew) {
        if (!lbl._isNew) pushHistory();
        lbl.space   = newSpace;
        lbl.name    = newName;
        lbl.groupId = newGroup;
        delete lbl._isNew;
        if (oldSpace !== newSpace || oldName !== newName) lbl.customWidth = null;
        renderLabels();
        renderLabelList();
        renderCategoryList();
        updateEditForm();
        saveAutosave();
        updateStatus(true); // ステータスバッジを更新
      } else {
        delete lbl._isNew;
        saveAutosave();
        updateStatus(true); // ステータスバッジを更新
      }
    }
    dom.floatingEditor.style.display = 'none';
  }

  dom.floatingEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') closeFloatingEditor();
    
    // Tab/Shift+Tab でフローティングエディタ内の3フィールドを巡回
    if (e.key === 'Tab') {
      const floatCategory = document.getElementById('float-category');
      const trigger = floatCategory?.querySelector('.custom-select-trigger');
      const focusables = [dom.floatSpace, dom.floatName, trigger].filter(Boolean);
      const currentIdx = focusables.indexOf(document.activeElement);
      if (currentIdx !== -1) {
        e.preventDefault();
        const nextIdx = e.shiftKey
          ? (currentIdx - 1 + focusables.length) % focusables.length
          : (currentIdx + 1) % focusables.length;
        focusables[nextIdx].focus();
      }
    }
  });
  
  function updateProjectName(newName) {
    state.projectName = newName;
    updateStatus(true);
  }

  dom.globalBalloonStyleSelect.addEventListener('change', (e) => {
    pushHistory();
    state.balloonStyle = e.target.value; 
    renderAll();                         
    updateStatus(true);                  
    showToast(`吹き出しのデザインを「${e.target.options[e.target.selectedIndex].text}」に変更しました`);
  });
