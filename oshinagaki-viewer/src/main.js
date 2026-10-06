(() => {
  'use strict';

  const STORE_KEY = 'shopping-list-viewer:v2';
  const COLS = ['space', 'circle', 'title', 'cat', 'price', 'note'];
  const COL_LABEL = { space: '配置', circle: 'サークル名', title: '頒布物', cat: '分類', price: '頒布価格', note: '備考' };
  const COL_WIDTH = { space: 96, circle: 128, title: 168, cat: 104, price: 92, note: 152 };
  const MIN_ROWS = 13;
  // 💡 巨大データによるフリーズ防止のための上限（実用上十分な余裕を持たせる）
  const MAX_ROWS = 1000;
  const MAX_COLS = 12; // 基本6列だが多少の余裕を持たせる
  const MAX_CELL_CHARS = 1000;

  const CHECK_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';

  const SAMPLE = [
    COLS.map(c => COL_LABEL[c]),
    ['1日目-X041', 'NNN出張支店',   'テディベア写真集',       'その他',    '無配', '優先順最下位'],
    ['1日目-X041', 'NNN出張支店',   '新刊セット',           'セット',    '5000', '「セット」があると優先順1位'],
    ['1日目-X041', 'NNN出張支店',   'MOCCノ全テ',           '新刊',      '3000', '「新刊」があると優先順2位'],
    ['1日目-X041', 'NNN出張支店',   '再録本',             '準新刊',    '3000', '「新刊」の前に文字が入ると優先順3位'],
    ['日曜-Y012',      '便利屋K☆', 'だれでも簡単！応急処置',        '既刊',      '1000', ''],
    ['日曜-Y012',      '便利屋K☆', 'COATL HEADS',        '新刊セット',    '2000',  'セット割あり'],
    ['東1ホール A031',      '丁屋デリバリー',   'クレープ',       '食品',      '1000',  '新刊・既刊・グッズ以外はその他カテゴリ'],
    ['Z-110',      'ラウンドテーブル',        '複製会員カード',       'グッズ',      '', '価格は当日確認'],
    ['Z-110',      'ラウンドテーブル',        'α',       '新刊',      '10000000', '頒布価格表示上限(一千万)'],
    ['B210',      '西中央特別班',      'AX完全復元模型',       'グッズ',      '20000',     ''],
    ['',      'レコーダー',   '無題',        '新刊',      '無料', '価格部分も自由に入力可能']
  ];

  const root = document.documentElement;
  const $ = (s) => document.querySelector(s);
  const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  const gridBodyEl = $('#gridBody'), gridColsEl = $('#gridCols');
  const ttl = $('#ttl'), body = $('#sheetBody'), dock = $('#dock'), sheetEl = $('#sheet');

  const state = {
    grid: SAMPLE.map(r => r.slice()),
    title: '頒布物リスト',
    view: window.innerWidth < 640 ? 'card' : 'table',
    mode: 'private',
    theme: null,
    ov: {},
    circleColW: null // 💡 プレビューのテーブルで「サークル名」列をドラッグ調整した幅(px)。未調整ならnull
  };

  function emptyGrid(rows) {
    const g = [COLS.map(c => COL_LABEL[c])];
    for (let i = 1; i < rows; i++) g.push(COLS.map(() => ''));
    return g;
  }

  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  // 💡 保存データの grid を検証・正規化する：配列でない/行が配列でない/
  //    セルが想定外の値/行数・列数が上限超過、といった壊れたデータでも
  //    アプリ全体がクラッシュしないようにする
  function sanitizeGrid(grid) {
    if (!Array.isArray(grid) || !grid.length) return null;
    const rows = grid.slice(0, MAX_ROWS).map(row => {
      const arr = Array.isArray(row) ? row : [];
      return arr.slice(0, MAX_COLS).map(cell => {
        if (typeof cell === 'string') return cell.slice(0, MAX_CELL_CHARS);
        if (cell == null) return '';
        return String(cell).slice(0, MAX_CELL_CHARS);
      });
    });
    const cols = rows.reduce((m, r) => Math.max(m, r.length), 1);
    rows.forEach(r => { while (r.length < cols) r.push(''); });
    return rows.length ? rows : null;
  }

  // 💡 保存データの ov（購入状態の上書き）を検証・正規化する
  function sanitizeOv(ov) {
    if (!isPlainObject(ov)) return {};
    const out = {};
    Object.keys(ov).forEach(k => {
      if (/^\d+$/.test(k) && typeof ov[k] === 'boolean') out[k] = ov[k];
    });
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!isPlainObject(o)) return;
      const grid = sanitizeGrid(o.grid);
      if (grid) state.grid = grid;
      if (typeof o.title === 'string') state.title = o.title.slice(0, 200);
      if (o.view === 'table' || o.view === 'card') state.view = o.view;
      if (o.theme === 'light' || o.theme === 'dark') state.theme = o.theme;
      // 💡 不正なovが保存されていた場合も、無理に復元せず安全な初期状態(空)にフォールバックする
      state.ov = sanitizeOv(o.ov);
      if (typeof o.circleColW === 'number' && Number.isFinite(o.circleColW) && o.circleColW > 0) state.circleColW = o.circleColW;
    } catch (e) { /* 読み込めなくても安全な初期状態のまま続行 */ }
  }

  // 💡 画面下部に一時的なメッセージを出す共通のトースト表示
  let toastTimer;
  function showToast(message, duration = 2600) {
    let el = document.querySelector('.save-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'save-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(toastTimer);
    requestAnimationFrame(() => el.classList.add('show'));
    toastTimer = setTimeout(() => { el.classList.remove('show'); }, duration);
  }

  // 💡 ページ内の確認ダイアログ。window.confirm は埋め込み環境（iframe等）でブロックされ
  //    常に「キャンセル」扱いになることがあるため、自前で用意する。Promise<boolean> を返す。
  function confirmDialog(message, { okLabel = 'OK', cancelLabel = 'キャンセル', danger = false } = {}) {
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML =
        '<div class="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirmMsg">' +
        '<p class="confirm-msg" id="confirmMsg"></p>' +
        '<div class="confirm-actions">' +
        '<button type="button" class="btn" data-c="cancel"></button>' +
        '<button type="button" class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-c="ok"></button>' +
        '</div></div>';
      overlay.querySelector('.confirm-msg').textContent = message;
      const cancelBtn = overlay.querySelector('[data-c="cancel"]');
      const okBtn = overlay.querySelector('[data-c="ok"]');
      cancelBtn.textContent = cancelLabel;
      okBtn.textContent = okLabel;

      function close(result) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
        else if (e.key === 'Tab') {
          // フォーカスをダイアログ内の2ボタンに閉じ込める
          e.preventDefault();
          (document.activeElement === cancelBtn ? okBtn : cancelBtn).focus();
        }
      }
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
        else if (e.target.closest('[data-c="ok"]')) close(true);
        else if (e.target.closest('[data-c="cancel"]')) close(false);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(overlay);
      cancelBtn.focus(); // 誤操作を防ぐため、既定のフォーカスは「キャンセル」側
    });
  }

  // 💡 localStorage への保存に失敗した場合（容量超過など）、画面を壊さず控えめに通知する
  let saveFailedNotified = false;
  function notifySaveFailure() {
    if (saveFailedNotified) return;
    saveFailedNotified = true;
    showToast('データをブラウザに保存できませんでした。', 4000);
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      saveFailedNotified = false; // 次に失敗した時にまた通知できるようリセット
    } catch (e) {
      notifySaveFailure();
    }
  }

  /* ---------- 入力グリッド(セルルック) ---------- */
  function ensureSize(rows, cols) {
    const r = Math.min(rows, MAX_ROWS);
    const c = cols ? Math.min(cols, MAX_COLS) : cols;
    while (state.grid.length < r) state.grid.push(COLS.map(() => ''));
    if (c) state.grid.forEach(row => { while (row.length < c) row.push(''); });
  }

  /* --------------------------
  // ↩️ 元に戻す／やり直す
  //    対象は「データ」の変更（グリッドの内容・購入チェック状態）のみ。
  //    表示形式・並び替え設定・テーマなどの見た目の設定は対象外。
  ---------------------------- */
  const HISTORY_LIMIT = 50;
  let historyStack = [];
  let redoStack = [];

  function snapshotData() {
    return JSON.stringify({ grid: state.grid, ov: state.ov });
  }
  function restoreData(snap) {
    const o = JSON.parse(snap);
    state.grid = o.grid;
    state.ov = o.ov;
  }
  // 💡 変更が起きる「前」に呼び出し、直前の状態を履歴として積む
  function pushHistory() {
    const snap = snapshotData();
    if (historyStack.length && historyStack[historyStack.length - 1] === snap) return;
    historyStack.push(snap);
    if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
  }
  function undo() {
    if (!historyStack.length) return;
    redoStack.push(snapshotData());
    restoreData(historyStack.pop());
    save();
    renderGrid();
    render();
    updateUndoRedoButtons();
    showToast('元に戻しました。');
  }
  function redo() {
    if (!redoStack.length) return;
    historyStack.push(snapshotData());
    restoreData(redoStack.pop());
    save();
    renderGrid();
    render();
    updateUndoRedoButtons();
    showToast('やり直しました。');
  }
  function updateUndoRedoButtons() {
    $('#btnUndo').disabled = historyStack.length === 0;
    $('#btnRedo').disabled = redoStack.length === 0;
  }
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  // 💡 Ctrl/Cmd+Z で元に戻す、Ctrl/Cmd+Shift+Z または Ctrl+Y でやり直す
  //    （セル編集中でもスプレッドシート的な「操作単位」の取り消しを優先し、
  //    ブラウザ標準のcontenteditable内undoより常にこちらを使う）
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  });

  /* --------------------------
  // 🔀 行の並べ替え・削除
  //    購入済み状態(state.ov)は行の「見た目の位置(idx)」をキーに保存しているため、
  //    行を動かしたり消したりする時は、既存の購入チェックが別の行に移ってしまったり
  //    消えたりしないよう、ov のキーも一緒にずらす。
  ---------------------------- */
  function remapOv(mapIdx) {
    const next = {};
    Object.keys(state.ov).forEach((k) => {
      const oldIdx = Number(k);
      const newIdx = mapIdx(oldIdx);
      if (newIdx != null) next[newIdx] = state.ov[k];
    });
    state.ov = next;
  }
  // 💡 grid上の行番号(r, ヘッダーを含む)→ buildItemsのidx(ヘッダーを除いた0始まり)への変換
  const rowToIdx = (r) => r - 1;

  function moveGridRow(r, dir) {
    const target = r + dir;
    if (r < 1 || target < 1 || target >= state.grid.length) return false;
    pushHistory();
    const tmp = state.grid[r];
    state.grid[r] = state.grid[target];
    state.grid[target] = tmp;
    const idxA = rowToIdx(r), idxB = rowToIdx(target);
    remapOv((old) => (old === idxA ? idxB : old === idxB ? idxA : old));
    save();
    renderGrid();
    render();
    return true;
  }

  function deleteGridRow(r) {
    if (r < 1 || r >= state.grid.length) return;
    pushHistory();
    if (state.grid.length <= 2) { // ヘッダーのみになるのは避け、空行に戻すだけにする
      state.grid[r] = state.grid[r].map(() => '');
    } else {
      state.grid.splice(r, 1);
    }
    const delIdx = rowToIdx(r);
    remapOv((old) => (old === delIdx ? null : old > delIdx ? old - 1 : old));
    save();
    renderGrid();
    render();
  }

  // 💡 セル編集中でも使えるキーボードショートカット（プレビュー側のボタン操作を補完）
  //    Alt+↑ / Alt+↓ : 現在の行を上下へ移動　/　Alt+Delete（またはAlt+Backspace）: 現在の行を削除
  gridBodyEl.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    const cellTd = e.target.closest('td[data-r]');
    if (!cellTd) return;
    const r = Number(cellTd.dataset.r);
    if (r < 1) return; // 見出し行は対象外
    if (e.key === 'ArrowUp') { e.preventDefault(); if (moveGridRow(r, -1)) focusCell(r - 1, Number(cellTd.dataset.c)); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (moveGridRow(r, 1)) focusCell(r + 1, Number(cellTd.dataset.c)); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteGridRow(r); }
  });
  function renderGrid() {
    const g = state.grid;
    const n = g[0].length;
    gridColsEl.innerHTML = '<col style="width:32px">' + Array.from({ length: n }, (_, i) => `<col style="width:${COL_WIDTH[COLS[i]] || 120}px">`).join('');
    gridBodyEl.innerHTML = g.map((row, r) => {
      const cells = row.map((v, c) => `<td class="cell" role="gridcell" contenteditable="true" spellcheck="false" data-r="${r}" data-c="${c}">${esc(v)}</td>`).join('');
      return `<tr><th class="rownum" scope="row">${r === 0 ? '' : r}</th>${cells}</tr>`;
    }).join('');
  }

  function focusCell(r, c) {
    ensureSize(r + 1, c + 1);
    renderGrid();
    const td = gridBodyEl.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    if (td) {
      td.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(td);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) { /* カーソル位置調整に失敗しても継続 */ }
    }
  }

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // 💡 セルにフォーカスが入った時点＝編集を始める直前の状態を履歴に積む。
  //    これにより、1文字ごとではなく「このセルへの一連の入力」単位で元に戻せる。
  gridBodyEl.addEventListener('focusin', (e) => {
    if (e.target.closest('td[data-r]')) pushHistory();
  });

  gridBodyEl.addEventListener('input', debounce((e) => {
    const td = e.target.closest('td[data-r]');
    if (!td) return;
    state.grid[Number(td.dataset.r)][Number(td.dataset.c)] = td.textContent;
    save();
    render();
  }, 150));

  gridBodyEl.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    const td = e.target.closest('td[data-r]');
    if (!td) return;
    const r = Number(td.dataset.r), c = Number(td.dataset.c);
    if (e.key === 'Enter') {
      e.preventDefault();
      state.grid[r][c] = td.textContent;
      save();
      render();
      focusCell(r + 1, c);
    } else if (e.key === 'Tab' && !e.shiftKey && c === state.grid[r].length - 1) {
      e.preventDefault();
      state.grid[r][c] = td.textContent;
      save();
      render();
      focusCell(r + 1, 0);
    }

    // 💡 矢印キーでのセル移動: グリッド末尾からさらに進もうとした場合は自動で行・列を拡張する
    //    （テキストカーソルの左右移動と衝突しないよう、キャレットが端にある時だけ移動として扱う）
    const atStart = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return true;
      const range = sel.getRangeAt(0);
      const pre = range.cloneRange();
      pre.selectNodeContents(td);
      pre.setEnd(range.startContainer, range.startOffset);
      return pre.toString().length === 0;
    };
    const atEnd = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return true;
      const range = sel.getRangeAt(0);
      const post = range.cloneRange();
      post.selectNodeContents(td);
      post.setStart(range.endContainer, range.endOffset);
      return post.toString().length === 0;
    };

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.grid[r][c] = td.textContent;
      save();
      render();
      focusCell(r + 1, c);
    } else if (e.key === 'ArrowUp' && r > 0) {
      e.preventDefault();
      state.grid[r][c] = td.textContent;
      save();
      render();
      focusCell(r - 1, c);
    } else if (e.key === 'ArrowRight' && atEnd()) {
      e.preventDefault();
      state.grid[r][c] = td.textContent;
      save();
      render();
      focusCell(r, c + 1);
    } else if (e.key === 'ArrowLeft' && atStart() && c > 0) {
      e.preventDefault();
      state.grid[r][c] = td.textContent;
      save();
      render();
      focusCell(r, c - 1);
    }
  });

  gridBodyEl.addEventListener('paste', (e) => {
    const td = e.target.closest('td[data-r]');
    if (!td) return;
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (text == null) return;
    e.preventDefault();
    if (!/[\t\r\n]/.test(text)) {
      // 💡 単一セルへの貼り付け（単なる文字入力と同じ扱い。データセット置き換えではない）
      // 💡 すでにこのセルへのfocusin時点でpushHistory済みのため、ここでは積まない
      const val = text.length > MAX_CELL_CHARS ? text.slice(0, MAX_CELL_CHARS) : text;
      // 💡 deprecated な execCommand('insertText') を Selection/Range API で置き換え
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(val));
        range.collapse(false); // カーソルを挿入テキストの末尾に移動
        sel.removeAllRanges();
        sel.addRange(range);
        // state への反映（input イベントが発火しないため手動で同期）
        const r = Number(td.dataset.r), c = Number(td.dataset.c);
        state.grid[r][c] = td.textContent;
        save();
      }
      return;
    }

    // 💡 スプレッドシート形式（タブ/改行を含む）の貼り付けは、
    //    「クリック位置を左上として、その範囲のセルだけを上書きする」操作として扱う。
    //    以前は貼り付け範囲の外側にあった行・列まで丸ごと切り詰めてしまい、
    //    「元より小さいデータを貼るとその他の列が消える」「右側に不要な空列ができる」
    //    という不具合があったため、既存データは常に保持し、必要な分だけ拡張する。
    const r0 = Number(td.dataset.r), c0 = Number(td.dataset.c);
    let lines = text.replace(/\r/g, '').split('\n');
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    let rows = lines.map(line => line.split('\t'));

    // 💡 コピー元（スプレッドシート）の選択範囲に含まれていた、末尾の空白列を除去する。
    //    これをしないと、選択範囲の右端に空セルが混ざっていただけで貼り付け後の
    //    グリッドが余分に横へ広がってしまう。
    let pasteCols = 0;
    rows.forEach(cells => { pasteCols = Math.max(pasteCols, cells.length); });
    while (pasteCols > 1 && rows.every(cells => (cells[pasteCols - 1] ?? '') === '')) pasteCols--;
    rows = rows.map(cells => cells.slice(0, pasteCols));

    // 💡 既存のグリッドサイズと貼り付け範囲のうち、大きい方に合わせる（縮小はしない）
    const newRowCount = Math.max(state.grid.length, r0 + rows.length);
    const newColCount = Math.max(state.grid[0] ? state.grid[0].length : COLS.length, c0 + pasteCols);

    // 💡 大量データによるブラウザフリーズを防止：上限を超える場合は中途半端に反映せず、
    //    理由がわかるメッセージを表示してこの貼り付けを中止する
    if (newRowCount > MAX_ROWS) {
      alert(`データが大きすぎます。最大${MAX_ROWS}行まで貼り付けできます。`);
      return;
    }
    if (newColCount > MAX_COLS) {
      alert(`列数が多すぎます。最大${MAX_COLS}列まで貼り付けできます。`);
      return;
    }
    for (const cells of rows) {
      for (const val of cells) {
        if (val.length > MAX_CELL_CHARS) {
          alert(`1つのセルに入力できる文字数の上限（${MAX_CELL_CHARS}文字）を超えています。`);
          return;
        }
      }
    }

    // 💡 グリッドを必要な分だけ拡張（既存の行・列・値はそのまま保持する）
    ensureSize(newRowCount, newColCount);
    rows.forEach((cells, dr) => {
      cells.forEach((val, dc) => {
        state.grid[r0 + dr][c0 + dc] = val;
      });
    });

    save();
    render();
    focusCell(r0, c0); // 💡 focusCell内でrenderGrid()も呼ばれ、編集グリッド側の表示も新しいサイズに更新される
  });

  // 💡 グリッドの内容をTSV形式（タブ区切り・改行区切り）でクリップボードにコピーする。
  //    この形式ならGoogleスプレッドシートやExcelにそのまま貼り付けられる。
  async function copyGridToClipboard() {
    const tsv = state.grid.map(row => row.join('\t')).join('\n');
    try {
      await navigator.clipboard.writeText(tsv);
      showToast('表の内容をコピーしました。');
    } catch (e) {
      // 💡 Clipboard APIが使えない環境（非HTTPS・権限拒否など）向けのフォールバック
      try {
        const ta = document.createElement('textarea');
        ta.value = tsv;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('表の内容をコピーしました。');
      } catch (e2) {
        showToast('コピーに失敗しました。お使いのブラウザではこの機能がご利用いただけない可能性があります。', 4000);
      }
    }
  }
  $('#btnGridCopy').addEventListener('click', copyGridToClipboard);

  function loadSample() {
    pushHistory();
    state.grid = SAMPLE.map(r => r.slice());
    state.ov = {};
    save();
    renderGrid();
    render();
    showToast('サンプルを読み込みました。');
  }
  $('#btnGridSample').addEventListener('click', loadSample);
  $('#btnGridClear').addEventListener('click', async () => {
    const ok = await confirmDialog('入力したデータをすべて消去します。\nよろしいですか？（「元に戻す」で復元できます）', { okLabel: '消去する', danger: true });
    if (!ok) return;
    pushHistory();
    state.grid = emptyGrid(MIN_ROWS);
    state.ov = {};
    save();
    renderGrid();
    render();
    showToast('データをクリアしました。');
  });

  /* ---------- データ解析 ---------- */
  const SYN = {
    space: ['配置', 'スペース', '場所', 'ブース', 'space', 'booth'],
    circle: ['サークル', '団体', '出展', 'circle'],
    title: ['頒布物', 'タイトル', '品名', '商品', '作品', '品目', 'item', 'title'],
    cat: ['分類', '種別', '種類', '区分', 'カテゴリ', 'タグ', 'category', 'tag'],
    price: ['頒布価格', 'お値段', '値段', '価格', '金額', '単価', 'price'],
    note: ['備考', 'メモ', 'ノート', 'note', 'memo']
  };
  const norm = (s) => (s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  function detectHeader(row) {
    const map = {};
    row.forEach((cell, ci) => {
      const n = norm(cell);
      if (!n) return;
      for (const f of COLS) {
        if (!(f in map) && SYN[f].some(s => n.includes(s))) { map[f] = ci; break; }
      }
    });
    return Object.keys(map).length >= 2 ? map : null;
  }
  const MAX_PRICE = 10000000; // 一千万円
  function parsePrice(raw) {
    const s = (raw || '').normalize('NFKC').replace(/[¥￥,\s円]/g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    // 💡 桁数が極端に多い入力は Number() で Infinity になり得るため、
    //    有限値かつ現実的な上限内かを確認し、異常値は無効値として扱う
    if (!Number.isFinite(n) || n > MAX_PRICE) return null;
    return n;
  }
  function splitSpace(raw) {
    const s = (raw || '').normalize('NFKC').trim();
    if (!s) return { day: '', num: '' };
    const m = s.match(/^(\d+日目|[月火水木金土日]曜日?|day\s?\d+)\s*[-‐‑–—ー・:\/\s]*\s*(.+)$/i);
    if (m && /\d/.test(m[2])) return { day: m[1], num: m[2] };
    return { day: '', num: s };
  }
  function splitSpace(raw) {
    const s = (raw || '').normalize('NFKC').trim();
    if (!s) return { day: '', num: '' };

    // 日程表記やホール表記（組み合わせ含む）をまとめて前方からマッチさせる
    const pattern = /^((?:(?:\d+日目|[月火水木金土日]曜日?|day\s?\d+|両日|全日|[東山西北南]\d*(?:ホール)?|hall\s?\d*)\s*[-‐‑–—ー・:\/\s]*)+)\s*(.+)$/i;
    const m = s.match(pattern);

    if (m && /\d/.test(m[2])) {
      // 日程/ホール表記の末尾や途中に含まれる「ホール」および区切り文字を除去
      const dayPart = m[1].replace(/ホール/g, '').replace(/[-‐‑–—ー・:\/\s]+$/, '');
      return { day: dayPart, num: m[2] };
    }
    return { day: '', num: s };
  }
  function buildItems(grid) {
    if (!grid.length) return [];
    let map = detectHeader(grid[0]);
    let data = grid;
    if (map) data = grid.slice(1);
    else { map = {}; COLS.forEach((f, i) => { map[f] = i; }); }
    const get = (r, f) => (map[f] == null ? '' : (r[map[f]] || '').trim());
    const items = [];
    data.forEach((r, i) => {
      const space = get(r, 'space');
      const { day, num } = splitSpace(space);
      const priceRaw = get(r, 'price');
      const price = parsePrice(priceRaw);
      const it = {
        idx: i,
        // 💡 購入済は入力データに含めず、常に未購入から開始（プレビューのチェックで管理）
        bought: false,
        space, day, num,
        circle: get(r, 'circle'),
        title: get(r, 'title'),
        cat: get(r, 'cat'),
        price,
        priceText: price == null ? priceRaw : '',
        note: get(r, 'note')
      };
      if (it.space || it.circle || it.title) items.push(it);
    });
    return items;
  }

  const WEEK = '月火水木金土日';
  function dayRank(d) {
    if (!d) return 99;
    const m = d.match(/\d+/);
    if (m) return Number(m[0]);
    const i = WEEK.indexOf(d[0]);
    return i < 0 ? 98 : i;
  }
  function spaceCompare(a, b) {
    if (!a.space && !b.space) return a.idx - b.idx;
    if (!a.space) return 1;
    if (!b.space) return -1;
    const d = dayRank(a.day) - dayRank(b.day);
    if (d) return d;
    return a.num.localeCompare(b.num, 'ja', { numeric: true }) || a.idx - b.idx;
  }

  // 💡 同一サークル内での頒布物の並び順優先度
  //    0: 「セット」を含む → 1: 分類が完全に「新刊」のみ → 2: 「新刊」を含むが前後に文字がある（例：準新刊）→ 3: それ以外
  function catPriority(it) {
    const c = (it.cat || '').normalize('NFKC').trim();
    if (!c) return 3;
    if (c.includes('セット')) return 0;
    if (c.includes('新刊')) return c === '新刊' ? 1 : 2;
    return 3;
  }

  function groupItems(items, catSort = false) {
    const groups = [];
    let cur = null;
    items.forEach(it => {
      const key = it.space ? it.space.trim() : null;
      if (key && cur && cur.key === key) cur.items.push(it);
      else { cur = { key, day: it.day, num: it.num, circle: it.circle, items: [it] }; groups.push(cur); }
    });
    // 💡 カテゴリ順は「並び替えを反映」で選んだ時だけ適用するオプション（既定では入力順のまま）
    if (catSort) {
      groups.forEach(g => { if (g.items.length > 1) g.items.sort((a, b) => catPriority(a) - catPriority(b)); });
    }
    return groups;
  }

  /* ---------- 描画ヘルパー ---------- */
  // escHTML (グリッド側) と esc (描画側) を統一
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yen = (n) => '¥' + n.toLocaleString('ja-JP');
  const nameOf = (it) => it.title || it.circle || '（名称未入力）';
  const effOn = (it) => (Object.prototype.hasOwnProperty.call(state.ov, it.idx) ? state.ov[it.idx] : it.bought);

  // カテゴリタグの色分け：5色の固定パレット（セット・新刊・既刊・グッズ・それ以外）
  // 「セット」は「新刊」より優先して判定する（例：「新刊セット」→セット扱い）
  const TAG_KEYWORD_MAP = [
    { cls: 't7', patterns: ['セット'] },                   // 赤紫/マゼンタ：「セット」を含む（新刊より優先）
    { cls: 't1', patterns: ['新刊'] },                     // 朱赤：「新刊」を含む
    { cls: 't2', patterns: ['既刊'] },                     // 青：「既刊」を含む
    { cls: 't3', patterns: ['グッズ', 'goods', 'グず'] },  // 緑：「グッズ」を含む
  ];
  const TAG_OTHER = 't8'; // 上記に一致しない分類はすべてこの1色（橙）に統一

  function makeTagMapper() {
    return (cat) => {
      const k = (cat || '').normalize('NFKC').trim();
      if (!k) return '';
      const matched = TAG_KEYWORD_MAP.find(({ patterns }) => patterns.some(p => k.includes(p)));
      return matched ? matched.cls : TAG_OTHER;
    };
  }
  const tagHTML = (c, cls) => `<span class="tag ${cls}"><i aria-hidden="true"></i>${esc(c)}</span>`;

  function spaceLiteHTML(sp, sizeCls) {
    const cls = 'spacev' + (sizeCls ? ' ' + sizeCls : '');
    if (!sp.key && !sp.num) return `<span class="${cls} is-empty"><span class="sp-num">配置未定</span></span>`;
    const day = sp.day ? `<span class="sp-day">${esc(sp.day)}</span>` : '';
    return `<span class="${cls}">${day}<span class="sp-num">${esc(sp.num)}</span></span>`;
  }

  function priceHTML(it) {
    if (it.price != null) return `<span class="price"><span class="yen">¥</span>${it.price.toLocaleString('ja-JP')}</span>`;
    if (it.priceText) return `<span class="price price-text">${esc(it.priceText)}</span>`;
    return '<span class="price price-none" aria-label="価格未定">—</span>';
  }

  function cbxHTML(it, on) {
    return `<button type="button" class="cbx" role="checkbox" aria-checked="${on}" aria-label="購入済み：${esc(nameOf(it))}" data-i="${it.idx}">${on ? CHECK_SVG : '<span aria-hidden="true">未</span>'}</button>`;
  }

  // 💡 1項目分の「上へ/下へ移動・削除」ボタン。プレビュー（テーブル／カード）の各項目に表示する。
  function itemActionsHTML(it) {
    const name = esc(nameOf(it));
    return `<span class="row-actions">
      <button type="button" class="row-act" data-item-act="up" data-idx="${it.idx}" title="上へ移動" aria-label="${name}を上へ移動">▲</button>
      <button type="button" class="row-act" data-item-act="down" data-idx="${it.idx}" title="下へ移動" aria-label="${name}を下へ移動">▼</button>
      <button type="button" class="row-act row-act-del" data-item-act="del" data-idx="${it.idx}" title="削除" aria-label="${name}を削除">×</button>
    </span>`;
  }

  function entryHTML(it, mode, tm) {
    const tagCls = it.cat ? tm(it.cat) : '';
    const on = mode === 'private' && effOn(it);
    const chk = mode === 'private' ? cbxHTML(it, on) : '';
    const note = it.note ? `<p class="note">${esc(it.note)}</p>` : '';
    const actions = mode === 'private' ? itemActionsHTML(it) : '';
    return `<div class="entry${on ? ' is-done' : ''}">
      <div class="entry-line">
        ${chk}
        <div class="entry-main dim">
          <h3 class="title">${esc(nameOf(it))}</h3>
          <div class="entry-sub">
            ${it.cat ? tagHTML(it.cat, tagCls) : '<span></span>'}
            ${priceHTML(it)}
          </div>
          ${note}
        </div>
        ${actions}
      </div>
    </div>`;
  }

  function groupHeadHTML(g, mode) {
    const circle = g.circle ? `<p class="ghc">${esc(g.circle)}</p>` : '';
    const count = g.items.length > 1 ? `<span class="group-count">${g.items.length}点</span>` : '';
    const spacer = mode === 'private' ? '<span class="group-head-spacer" aria-hidden="true"></span>' : '';
    return `<div class="group-head"><div class="group-head-left">${spacer}<div class="group-head-main">${spaceLiteHTML(g, 'sv-card')}${circle}</div></div>${count}</div>`;
  }

  function groupCardHTML(g, mode, tm) {
    const multi = g.items.length > 1;
    const bodyHTML = g.items.map(it => entryHTML(it, mode, tm)).join('');
    return `<li class="card${multi ? ' multi' : ''}">${groupHeadHTML(g, mode)}<div class="group-body">${bodyHTML}</div></li>`;
  }

  function rowHTML(it, mode, tm, spaceInfo, isMid, isLast) {
    const on = mode === 'private' && effOn(it);
    const tagCls = it.cat ? tm(it.cat) : '';
    const chkTd = mode === 'private' ? `<td class="c-chk">${cbxHTML(it, on)}</td>` : '';
    const meta = (it.cat || it.note)
      ? `<div class="row-meta">${it.cat ? tagHTML(it.cat, tagCls) : ''}${it.note ? `<span class="row-note">${esc(it.note)}</span>` : ''}</div>`
      : '';
    // 同一サークルが連続する場合、スペース／サークル名セルはグループ先頭行にのみ rowspan で出力し、
    // それ以外の行では省略して上下のセルが結合しているように見せる。
    // 💡 スペース・サークル名の購入済み表示（薄字）は先頭行の購入状態ではなく、
    //    グループ内の頒布物を1つでも購入したかどうか（spaceInfo.groupOn）で判定する。
    const spanAttr = spaceInfo && spaceInfo.rowspan > 1 ? ` rowspan="${spaceInfo.rowspan}"` : '';
    const groupDoneCls = spaceInfo && spaceInfo.groupOn ? ' grp-purchased' : '';
    const spaceTd = spaceInfo ? `<td class="c-space dim${groupDoneCls}"${spanAttr}>${spaceLiteHTML(it, 'sv-tbl')}</td>` : '';
    const circleTd = spaceInfo ? `<td class="c-circle dim${groupDoneCls}"${spanAttr}>${it.circle ? esc(it.circle) : ''}</td>` : '';
    const actTd = mode === 'private' ? `<td class="c-act">${itemActionsHTML(it)}</td>` : '';
    return `<tr class="entryrow${on ? ' is-done' : ''}${isMid ? ' grp-mid' : ''}${isLast ? ' grp-last' : ''}">
      ${chkTd}
      ${spaceTd}
      ${circleTd}
      <td class="c-name dim">
        <p class="title">${esc(nameOf(it))}</p>
        ${meta}
      </td>
      <td class="c-price dim">${priceHTML(it)}</td>
      ${actTd}
    </tr>`;
  }

  function tableHTML(items, mode, tm) {
    const groups = groupItems(items);
    const rows = groups.map((g, gi) => {
      const n = g.items.length;
      const isLastGroup = gi === groups.length - 1;
      // 💡 グループ内のいずれかの頒布物が購入済みなら true（スペース・サークル名の表示に使う）
      const groupOn = mode === 'private' && g.items.some(it => effOn(it));
      // grp-last = サークル境目 = 最終グループ以外のグループ最終行
      return g.items.map((it, i) => rowHTML(it, mode, tm, i === 0 ? { rowspan: n, groupOn } : null, i < n - 1, !isLastGroup && i === n - 1)).join('');
    }).join('');
    const chkTh = mode === 'private' ? '<th class="c-chk" scope="col">購入済</th>' : '';
    const actTh = mode === 'private' ? '<th class="c-act" scope="col">操作</th>' : '';
    // 💡 ユーザーがドラッグで調整した幅（state.circleColW）があれば、ブレークポイントに関わらず優先する
    const circleWStyle = state.circleColW ? ` style="--circle-w:${state.circleColW}px"` : '';
    return `<div class="tbl-wrap"><table class="tbl"${circleWStyle}>
      <thead><tr>
        ${chkTh}
        <th class="c-space" scope="col">配置</th>
        <th class="c-circle" scope="col">サークル名<span class="col-resizer" data-col-resizer="circle" role="separator" aria-orientation="vertical" aria-label="サークル名の列幅を調整" tabindex="0"></span></th>
        <th class="c-name" scope="col">頒布物</th>
        <th class="c-price" scope="col">頒布価格</th>
        ${actTh}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  function totalHTML(items, mode) {
    let total = 0, bought = 0, priced = 0, boughtN = 0;
    items.forEach(it => {
      const on = effOn(it);
      if (it.price != null) { total += it.price; priced++; if (mode === 'private' && on) bought += it.price; }
      if (mode === 'private' && on) boughtN++;
    });
    const n = items.length;
    const sub = priced === n ? `${n}品の合計` : `${n}品中 ${priced}品の合計`;
    if (mode === 'public') {
      return `<section class="total total--public" aria-label="合計金額">
        <div class="total-head"><span class="total-label">合計金額</span><span>${sub}</span></div>
        <p class="total-num"><span class="yen">¥</span>${total.toLocaleString('ja-JP')}</p>
      </section>`;
    }
    const pct = total > 0 ? Math.round((bought / total) * 100) : 0;
    return `<section class="total" aria-label="合計金額">
      <div class="total-head"><span class="total-label">合計金額</span><span>${sub}</span></div>
      <p class="total-num"><span class="yen">¥</span>${total.toLocaleString('ja-JP')}</p>
      <div class="meter" role="img" aria-label="購入済み ${pct}%"><span style="width:${pct}%"></span></div>
      <div class="legend">
        <div><div class="lg-k"><span class="mk mk-fill"></span>購入済み</div><div class="lg-v">${yen(bought)}</div></div>
        <div><div class="lg-k"><span class="mk mk-hatch"></span>残り</div><div class="lg-v">${yen(total - bought)}</div></div>
      </div>
      <div class="tally">
        <div class="tl"><span class="tl-k">購入済</span><span class="tl-v"><b>${boughtN}</b> / ${n}</span></div>
      </div>
    </section>`;
  }

  function render() {
    $('#sheetTitle').textContent = state.title.trim() || '頒布物リスト';
    const items = buildItems(state.grid);
    if (!items.length) {
      body.innerHTML = `<div class="empty"><p>表示するデータがありません</p><p>上のマス目にスプレッドシートの内容を貼り付けてください。</p><button type="button" class="btn btn-primary" data-act="sample">サンプルを読み込む</button></div>`;
      return;
    }
    const tm = makeTagMapper();
    const ordered = items; // 表示は常に入力順（並び替えは「並び替えを反映」で入力データ自体を並べ替える）
    const list = state.view === 'card'
      ? `<ul class="cards">${groupItems(ordered).map(g => groupCardHTML(g, state.mode, tm)).join('')}</ul>`
      : tableHTML(ordered, state.mode, tm);
    body.innerHTML = totalHTML(items, state.mode) + `<div id="list">${list}</div>`;
  }

  /* ---------- コントロール ---------- */
  const effTheme = () => state.theme || (mqDark.matches ? 'dark' : 'light');
  function applyTheme() {
    if (state.theme) root.setAttribute('data-theme', state.theme);
    else root.removeAttribute('data-theme');
    const dark = effTheme() === 'dark';
    // 💡 撮影モード用ドック内の文字付きボタン（ヘッダーが非表示の間の代替操作）
    document.querySelectorAll('.js-theme').forEach(b => {
      b.innerHTML = (dark ? SUN : MOON) + (dark ? 'ライトにする' : 'ダークにする');
      b.setAttribute('aria-pressed', String(dark));
    });
    // 💡 ヘッダーのアイコンのみ単一トグルボタン：文字は表示せず、
    //    現在と逆の状態への切り替えであることを aria-label / title で案内する
    const iconLabel = dark ? 'ライトモードにする' : 'ダークモードにする';
    document.querySelectorAll('.js-theme-icon').forEach(b => {
      b.innerHTML = dark ? SUN : MOON;
      b.setAttribute('aria-label', iconLabel);
      b.setAttribute('title', iconLabel);
    });
  }
  const optSortSpace = $('#optSortSpace'), optCatSort = $('#optCatSort');
  function syncControls() {
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  }

  ttl.addEventListener('input', () => { state.title = ttl.value; save(); render(); });
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.view; syncControls(); save(); render(); }));
  // 💡 「並び替えを反映」: 選んだ条件で入力データの行順そのものを一度だけ並べ替える。
  //    反映後は通常のデータと同じ扱いなので、その後の移動・削除は自由（元に戻すも可能）。
  function applySortToData() {
    const bySpace = optSortSpace.checked, byCat = optCatSort.checked;
    if (!bySpace && !byCat) { showToast('並び替えの条件を選んでください。'); return; }
    const offset = detectHeader(state.grid[0]) ? 1 : 0;
    const items = buildItems(state.grid);
    if (!items.length) { showToast('並び替えるデータがありません。'); return; }

    const ordered = bySpace ? items.slice().sort(spaceCompare) : items;
    const newItems = groupItems(ordered, byCat).flatMap(g => g.items);

    // 項目として認識されない行（空行など）は元の順序のまま末尾に残す
    const used = new Set(newItems.map(it => it.idx));
    const dataRows = state.grid.slice(offset);
    const restIdx = [];
    dataRows.forEach((_, i) => { if (!used.has(i)) restIdx.push(i); });

    const order = newItems.map(it => it.idx).concat(restIdx); // 新しい位置k → 元のdata index
    const newIdxOf = {};
    order.forEach((oldI, k) => { newIdxOf[oldI] = k; });

    pushHistory();
    state.grid = state.grid.slice(0, offset).concat(order.map(i => dataRows[i]));
    remapOv((old) => (old in newIdxOf ? newIdxOf[old] : null));
    save();
    renderGrid();
    render();
    showToast('並び替えを反映しました。（「元に戻す」で取り消せます）', 3200);
  }
  $('#btnApplySort').addEventListener('click', applySortToData);
  document.querySelectorAll('.js-theme, .js-theme-icon').forEach(b => b.addEventListener('click', () => { state.theme = effTheme() === 'dark' ? 'light' : 'dark'; applyTheme(); save(); }));
  mqDark.addEventListener('change', () => { if (!state.theme) applyTheme(); });

  body.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act="sample"]');
    if (act) { loadSample(); return; }

    // 💡 プレビュー上の「上へ/下へ移動・削除」ボタン。項目のidx→入力グリッドの行番号(idx+1)に変換して実行する
    const itemBtn = e.target.closest('[data-item-act]');
    if (itemBtn) {
      if (itemBtn.disabled) return;
      const r = Number(itemBtn.dataset.idx) + 1;
      const kind = itemBtn.dataset.itemAct;
      if (kind === 'up') moveGridRow(r, -1);
      else if (kind === 'down') moveGridRow(r, 1);
      else if (kind === 'del') deleteGridRow(r);
      return;
    }

    const b = e.target.closest('[data-i]');
    if (!b) return;
    const i = Number(b.dataset.i);
    const cur = b.getAttribute('aria-checked') === 'true';
    state.ov[i] = !cur;
    save();
    render();
    const again = body.querySelector(`[data-i="${i}"]`);
    if (again) again.focus({ preventScroll: true });
  });

  /* --------------------------
  // ↔️ プレビューテーブル：「サークル名」列の幅をドラッグ調整
  ---------------------------- */
  const COL_RESIZE_MIN = 56, COL_RESIZE_MAX = 320;
  (function setupColumnResize() {
    let dragging = null; // { startX, startW, tableEl, handleEl }

    function currentCircleW(tableEl) {
      const px = getComputedStyle(tableEl).getPropertyValue('--circle-w');
      const n = parseFloat(px);
      return Number.isFinite(n) ? n : 84;
    }
    function applyWidth(tableEl, w) {
      const clamped = Math.min(COL_RESIZE_MAX, Math.max(COL_RESIZE_MIN, Math.round(w)));
      tableEl.style.setProperty('--circle-w', clamped + 'px');
      return clamped;
    }

    body.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('[data-col-resizer="circle"]');
      if (!handle) return;
      const tableEl = handle.closest('table.tbl');
      if (!tableEl) return;
      dragging = { startX: e.clientX, startW: currentCircleW(tableEl), tableEl, handleEl: handle };
      handle.classList.add('resizing');
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    body.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const delta = e.clientX - dragging.startX;
      applyWidth(dragging.tableEl, dragging.startW + delta);
    });
    function endDrag() {
      if (!dragging) return;
      state.circleColW = currentCircleW(dragging.tableEl);
      dragging.handleEl.classList.remove('resizing');
      dragging = null;
      save();
    }
    body.addEventListener('pointerup', endDrag);
    body.addEventListener('pointercancel', endDrag);
  })();

  /* ---------- 撮影モード ---------- */
  let dockTimer;
  function showDock() {
    dock.classList.add('show');
    clearTimeout(dockTimer);
    dockTimer = setTimeout(() => dock.classList.remove('show'), 5000);
  }
  function enterCapture() {
    root.classList.add('capture');
    // 💡 撮影モード中は自動で公開用表示に切り替える（購入チェックを隠す）
    state.mode = 'public';
    render();
    window.scrollTo(0, 0);
    showDock();
    $('#btnExit').focus({ preventScroll: true });
  }
  function exitCapture() {
    root.classList.remove('capture');
    // 💡 撮影モードを抜けたら自分用表示に戻す
    state.mode = 'private';
    render();
    clearTimeout(dockTimer);
    dock.classList.remove('show');
    $('#btnCapture').focus({ preventScroll: true });
  }
  $('#btnCapture').addEventListener('click', enterCapture);
  $('#btnExit').addEventListener('click', exitCapture);
  $('#reveal').addEventListener('click', showDock);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('capture')) exitCapture(); });

  /* ---------- 画像として保存（プレビューゾーン(#sheet)のみを書き出す） ---------- */
  const btnSaveImage = $('#btnSaveImage');
  const saveImageLabel = btnSaveImage.innerHTML;
  function safeFileName(name) {
    // 💡 OS のファイル名で使えない文字を除去し、空なら既定名にフォールバック
    const trimmed = (name || '').trim().replace(/[\\/:*?"<>|]+/g, '');
    return trimmed || '頒布物リスト';
  }

  /* 💡 Canvas寸法上限のチェック
     ブラウザ・OS・端末ごとにCanvasの最大幅／高さ／面積の上限は異なり、決め打ちできない。
     そこで「実際にこれから作ろうとしているのと同じ幅・高さのCanvasを試作し、
     四隅にピクセルを描いて正しく読み戻せるか」をその場で検証する（＝実機での実測に近い）。*/
  function canvasSupportsSize(w, h) {
    if (!(w > 0) || !(h > 0)) return false;
    let c;
    try {
      c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return false;
      const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
      ctx.fillStyle = '#ff00ff';
      corners.forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
      return corners.every(([x, y]) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return d[0] === 255 && d[1] === 0 && d[2] === 255 && d[3] === 255;
      });
    } catch (e) {
      // 💡 一部ブラウザ（Safari系など）では上限超過時にCanvas生成やgetImageData自体が例外になる
      return false;
    } finally {
      // 💡 巨大なバッキングストアを速やかに解放するヒントとして0にしておく
      if (c) { c.width = 0; c.height = 0; }
    }
  }

  // 💡 希望scaleから0.25刻みで下げながら、実際にこの端末で描画・読み戻せる最大のscaleを探す。
  //    等倍(1)でも不可なら null（保存不可）を返す。
  function findSafeScale(contentW, contentH, desiredScale) {
    const scales = [];
    for (let s = desiredScale; s > 1; s -= 0.25) scales.push(Math.round(s * 100) / 100);
    scales.push(1);
    for (const s of scales) {
      if (canvasSupportsSize(Math.round(contentW * s), Math.round(contentH * s))) return s;
    }
    return null;
  }

  const fmtScale = (n) => (Math.round(n * 100) / 100).toString();

  async function saveImage() {
    if (typeof html2canvas !== 'function') {
      alert('画像化ライブラリの読み込みに失敗しました。通信環境をご確認のうえ、もう一度お試しください。');
      return;
    }

    // 💡 実際に書き出す予定の寸法（#sheetの表示サイズ×希望scale）を先に見積もり、
    //    この端末のCanvas上限内かどうかを本番実行前に確認する。
    //    ここでWebフォントの読み込み完了を先に待つのが重要：後回しにすると、
    //    測定後にフォントが差し替わって行の高さが変化し、実際にhtml2canvasが
    //    書き出すサイズとズレて「想定サイズとの一致チェック」が誤爆する原因になる。
    if (window.document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* フォント状態取得に失敗しても続行 */ }
    }
    const contentW = sheetEl.scrollWidth;
    const contentH = sheetEl.scrollHeight;
    const desiredScale = Math.max(2, window.devicePixelRatio || 1);

    let scale = desiredScale;
    if (!canvasSupportsSize(Math.round(contentW * desiredScale), Math.round(contentH * desiredScale))) {
      // 💡 希望scaleのままだとこの端末のCanvas上限を超える可能性が高い。
      //    実際に描画できる最大scaleを探し、ユーザーに確認のうえ画質を落として続行するか選んでもらう。
      const safeScale = findSafeScale(contentW, contentH, desiredScale);
      if (safeScale == null) {
        alert('リストの行数が多すぎるため、この端末では画像として保存できません。行数を減らすか、表示形式を「テーブル」に切り替えるなどしてお試しください。');
        return;
      }
      const proceed = await confirmDialog(
        `画像のサイズが大きすぎるため、この端末の上限に合わせて画質を下げます（${fmtScale(desiredScale)}倍 → ${fmtScale(safeScale)}倍）。\nこのまま保存を続けますか？`,
        { okLabel: '続ける' }
      );
      if (!proceed) return;
      scale = safeScale;
    }

    // 💡 保存中は他の操作をブロックし、ボタンにも進行中であることを示す（二重クリック対策）
    btnSaveImage.disabled = true;
    $('#btnExit').disabled = true;
    btnSaveImage.innerHTML = '画像を保存中…';
    // 💡 ドックが写り込まないよう、生成中は一旦隠す（プレビューはそのまま）
    dock.style.visibility = 'hidden';
    try {
      // 💡 #sheet の“現在の見た目”をそのまま書き出す：
      //    列幅調整（サークル名/頒布物の境目のドラッグ）やテーマ、
      //    表示モード（テーブル/カード）・並び順など、ユーザーが
      //    その時点で選んでいる状態がそのまま反映される。
      // 💡 ページがスクロールされていても#sheet全体が途中で切れないよう、
      //    現在のスクロール位置を打ち消すオプションを指定する
      const canvas = await html2canvas(sheetEl, {
        backgroundColor: getComputedStyle(sheetEl).backgroundColor || '#ffffff',
        scale,
        useCORS: true,
        scrollX: -window.scrollX,
        scrollY: -window.scrollY,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
      });

      // 💡 想定サイズとの一致チェック：
      //    Canvas上限に当たって大きく欠けていないかを検知するのが目的。
      //    html2canvasは実ブラウザとは別経路で最終寸法を確定するため、
      //    文字送りやサブピクセルの丸め等による数%程度のズレは正常発生しうる。
      //    そのため閾値は絶対px指定ではなく、相対値(5%、最低60px)の
      //    余裕を持たせ、正常なケースを誤って弾かないようにする。
      const expectedW = Math.round(contentW * scale);
      const expectedH = Math.round(contentH * scale);
      const tolW = Math.max(60, expectedW * 0.05);
      const tolH = Math.max(60, expectedH * 0.05);
      if (Math.abs(canvas.width - expectedW) > tolW || Math.abs(canvas.height - expectedH) > tolH) {
        console.error('canvas size mismatch', { expectedW, expectedH, actualW: canvas.width, actualH: canvas.height, tolW, tolH });
        alert('画像の生成結果が想定サイズと大きく異なったため、保存を中止しました（お使いの端末の制限の可能性があります）。行数を減らすか、表示形式を「テーブル」に切り替えるなどしてお試しください。');
        return;
      }

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${safeFileName(state.title)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      alert('画像の保存に失敗しました。スクリーンショットでの保存をご検討ください。');
    } finally {
      dock.style.visibility = '';
      btnSaveImage.disabled = false;
      $('#btnExit').disabled = false;
      btnSaveImage.innerHTML = saveImageLabel;
    }
  }
  btnSaveImage.addEventListener('click', saveImage);

  /* ---------- 初期化 ---------- */
  load();
  ttl.value = state.title;
  applyTheme();
  syncControls();
  renderGrid();
  render();
})();
