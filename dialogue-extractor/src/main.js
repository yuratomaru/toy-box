const SPEAKER_CHAR = /^[\u3040-\u309F\u30A0-\u30FFー\u4E00-\u9FFF々]$/;

const PERSON_KEYWORDS = {
  '1': [
    '私', 'わたし', 'わたくし', 'あたし', 'あたくし', 'あたい', 'おいら',
    '俺', 'おれ', '俺様', '僕', 'ぼく', '儂', 'わし', '吾輩', '我輩',
    '余', '我', 'われ', '我々', 'われわれ',
    '僕ら', 'ぼくら', '俺ら', 'おれら',
    '私たち', 'わたしたち', '私達', 'わたくしたち', 'あたしたち',
    'うち', '自分', '小生', '拙者', '某', 'ミー'
  ],
  '2': [
    'あなた', '貴方', 'あんた', '君', 'きみ', 'お前', 'おまえ',
    'てめえ', 'テメェ', '手前', '貴様', 'きさま',
    'そちら', 'そっち', 'そなた', '御主', 'おぬし', '汝', 'なんじ',
    '貴殿', '貴公', 'お宅', 'おたく', '貴君',
    '君たち', '君達', 'お前たち', 'お前ら', 'あなたたち', '皆さん', 'みなさん', '皆様',
    // 呼びかけ語・役職・続柄など（二人称的に使われやすいもの）
    '支部長', 'エージェント', 'チルドレン', '教官', '班長', '隊長',
    '先生', '博士', 'ドクター', '所長', '部長', '課長', '社長', '委員長', '会長',
    'マスター', 'リーダー', 'ボス', '相棒', '先輩', '後輩',
    '親父', 'お袋', '父さん', '母さん', '兄さん', '姉さん', '兄貴', '姉貴',
    'じいちゃん', 'ばあちゃん', 'おじさん', 'おばさん', 'お兄さん', 'お姉さん',
    '坊主', '嬢ちゃん', '坊ちゃん', 'お嬢様'
  ],
  '3': [
    '彼', '彼女', 'あいつ', 'アイツ',
    'あの人', 'あのひと', 'あの子', 'あのこ', 'あの方',
    'この人', 'このひと', 'この子',
    'その人', 'そのひと', 'その子',
    'そいつ', 'コイツ', 'こいつ', 'そやつ', 'こやつ', 'あやつ',
    '奴', 'やつ',
    '彼ら', '彼女ら', 'あいつら',
    'みんな', '皆', '全員', '相手', '対象',
    '犯人', '被害者', '容疑者', '依頼人', '探索者', 'PC', 'NPC', 'HO'
  ]
};

// 敬称付きの名前（○○さん、○○先生 など）と、クォート/かぎ括弧で囲まれた固有名詞は
// 単語一致では拾えないため、正規表現で三人称っぽい表現として検出する。
const NAME_CHARS = '[一-龠々ぁ-んァ-ヶA-Za-z0-9ー]+';
const HONORIFIC_SUFFIXES = ['さん', 'くん', '君', 'ちゃん', '氏', '先生', '先輩', '後輩', '殿', '様', 'さま'];
const PERSON_PATTERNS = {
  '3': [
    ...HONORIFIC_SUFFIXES.map(suf => new RegExp(NAME_CHARS + suf)),
    /"[^"]+"/,        // ダブルクォーテーションで囲まれた固有名詞
    /「[^」]+」/,      // かぎ括弧で囲まれた固有名詞
    /『[^』]+』/       // 二重かぎ括弧で囲まれた固有名詞
  ]
};

let extracted = [];        // {id, speaker, body, startLine, endLine}
let manualAssign = {};     // id -> speaker name (only used when original speaker is null)
let speakerOverride = {};  // id -> speaker name (manual correction for a line that was grouped under the wrong speaker)
let speakerAlias = {};     // raw 1-char tag -> canonical display name (rename / merge)
let lineCategory = {};     // id -> '1' | '2' | '3' | '' (manual person-category override)
let selectedUnassigned = new Set(); // ids of unassigned rows checked for bulk assignment
let dragSelecting = false;   // true while mouse button held down and dragging across rows
let dragSelectValue = true;  // whether the current drag is turning selection ON or OFF
let personKeywords = JSON.parse(JSON.stringify(PERSON_KEYWORDS)); // user-editable copy of the dictionary
let speakerConfirmed = {};  // speaker key -> true when the "未確定のセリフを表示" panel is open
let lineConfirmedCats = {}; // id -> Set of '1'|'2'|'3' confirmed by clicking the example (a line can have several)

/* ---------- theme (light/dark, OS設定に追従 + 手動固定) ---------- */
const SUN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.7A8.5 8.5 0 1 1 9.3 3.5a7 7 0 0 0 11.2 11.2Z"/></svg>';

function currentIsDark() {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return true;
  if (attr === 'light') return false;
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function updateThemeButton() {
  const btn = document.getElementById('themeToggle');
  const dark = currentIsDark();
  btn.innerHTML = dark ? SUN_ICON : MOON_ICON; // 現在のモードから切り替わる「先」のアイコンを示す
  const label = dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え';
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
}

function setTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode); // 'light' | 'dark'
  updateThemeButton();
  saveState();
}

/* ---------- 永続化（localStorageに自動保存） ---------- */
const STORAGE_KEY = 'serifu-extractor-state-v1';
let saveTimer = null;

function serializeConfirmedCats(obj) {
  const out = {};
  Object.keys(obj).forEach(id => { out[id] = [...obj[id]]; });
  return out;
}
function deserializeConfirmedCats(obj) {
  const out = {};
  Object.keys(obj || {}).forEach(id => { out[id] = new Set(obj[id]); });
  return out;
}

function captureSnapshot() {
  return {
    text: document.getElementById('input').value,
    personKeywords: JSON.parse(JSON.stringify(personKeywords)),
    speakerAlias: { ...speakerAlias },
    speakerOverride: { ...speakerOverride },
    manualAssign: { ...manualAssign },
    lineCategory: { ...lineCategory },
    lineConfirmedCats: serializeConfirmedCats(lineConfirmedCats),
    speakerConfirmed: { ...speakerConfirmed }
  };
}

function applySnapshot(data) {
  document.getElementById('input').value = data.text || '';
  personKeywords = data.personKeywords ? JSON.parse(JSON.stringify(data.personKeywords)) : JSON.parse(JSON.stringify(PERSON_KEYWORDS));
  speakerAlias = { ...(data.speakerAlias || {}) };
  speakerOverride = { ...(data.speakerOverride || {}) };
  manualAssign = { ...(data.manualAssign || {}) };
  lineCategory = { ...(data.lineCategory || {}) };
  lineConfirmedCats = deserializeConfirmedCats(data.lineConfirmedCats);
  speakerConfirmed = { ...(data.speakerConfirmed || {}) };
  extracted = extractDialogues(data.text || '');
  document.getElementById('status').textContent = `${extracted.length} 件のセリフを抽出しました。`;
}

function saveState() {
  try {
    const theme = document.documentElement.getAttribute('data-theme') || '';
    const data = { ...captureSnapshot(), theme };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // ストレージが使えない環境（プライベートブラウズ等）では黙って諦める
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/* ---------- 元に戻す／やり直し（Ctrl+Z / Ctrl+Y） ---------- */
const HISTORY_LIMIT = 50;
let historyStack = [];
let historyIndex = -1;
let isRestoringHistory = false;

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (!undoBtn || !redoBtn) return;
  undoBtn.disabled = historyIndex <= 0;
  redoBtn.disabled = historyIndex >= historyStack.length - 1;
}

function pushHistory() {
  if (isRestoringHistory) return;
  const snapshot = JSON.stringify(captureSnapshot());
  // 直前と内容が同じなら積まない（確定クリックの連打などでスタックが無駄に伸びるのを防ぐ）
  if (historyIndex >= 0 && historyStack[historyIndex] === snapshot) { updateUndoRedoButtons(); return; }
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(snapshot);
  if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
  historyIndex = historyStack.length - 1;
  updateUndoRedoButtons();
}

function restoreHistoryAt(index) {
  if (index < 0 || index >= historyStack.length) return;
  isRestoringHistory = true;
  historyIndex = index;
  const data = JSON.parse(historyStack[index]);
  applySnapshot(data);
  renderDictionary();
  renderAll();
  isRestoringHistory = false;
  updateUndoRedoButtons();
}

function undo() {
  if (historyIndex <= 0) return;
  restoreHistoryAt(historyIndex - 1);
}

function redo() {
  if (historyIndex >= historyStack.length - 1) return;
  restoreHistoryAt(historyIndex + 1);
}

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const tag = document.activeElement && document.activeElement.tagName;
  const inField = tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT';
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) {
    if (inField) return; // テキスト入力中はブラウザ標準のUndoに任せる
    e.preventDefault();
    undo();
  } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
    if (inField) return;
    e.preventDefault();
    redo();
  }
});

function initFromStorage() {
  isRestoringHistory = true; // 復元中にundo履歴を汚さない
  const saved = loadState();
  if (saved && typeof saved.text === 'string') {
    if (saved.theme === 'dark' || saved.theme === 'light') {
      document.documentElement.setAttribute('data-theme', saved.theme);
    }
    applySnapshot(saved);
    document.getElementById('status').textContent = `${extracted.length} 件のセリフを抽出しました（前回の内容を復元しました）。`;
    renderDictionary();
    renderAll();
  } else {
    run();
  }
  updateThemeButton();
  isRestoringHistory = false;
  historyStack = [];
  historyIndex = -1;
  pushHistory(); // 現在の状態をUndo履歴の起点にする
}

function rawSpeakerKey(item) {
  if (speakerOverride[item.id]) return speakerOverride[item.id]; // manual per-line correction wins over everything
  if (item.speaker !== null) return item.speaker;
  if (manualAssign[item.id]) return manualAssign[item.id]; // explicit user override wins
  return item.markerSpeaker || null; // fall back to "▼キャラ名" header inference; null = still unassigned
}

function speakerKeyOf(item) {
  const raw = rawSpeakerKey(item);
  if (raw === null) return null;
  // alias applies regardless of whether the raw tag came from a 1-char tag,
  // a "▼キャラ名" marker, or a manually-typed name — all of them can be merged/renamed
  return speakerAlias[raw] || raw;
}

const MARKER_RE = /^▼\s*(.+?)\s*[:：]?\s*$/;

// 「▼太郎のセリフ」「▼太郎の台詞」のように書かれていたら、「のセリフ」部分を除いて話者名「太郎」にする
const MARKER_SUFFIX_RE = /\s*の\s*(セリフ|台詞|せりふ|ｾﾘﾌ)\s*$/;
function cleanMarkerName(name) {
  const cleaned = name.replace(MARKER_SUFFIX_RE, '').trim();
  return cleaned || name; // 「▼のセリフ」のように名前が残らない場合は元のまま
}

function extractDialogues(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const results = [];
  let i = 0, autoId = 0;
  let currentMarker = null; // name from the most recent "▼キャラ名" header line
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    const markerMatch = trimmed.match(MARKER_RE);
    if (markerMatch) {
      currentMarker = cleanMarkerName(markerMatch[1]);
      i++;
      continue;
    }

    const m = trimmed.match(/^([\u3040-\u309F\u30A0-\u30FFー\u4E00-\u9FFF々])?「(.*)$/s);
    if (!m) { currentMarker = null; i++; continue; }
    const speaker = m[1] || null;
    const markerSpeaker = speaker === null ? currentMarker : null;
    const rest = m[2];
    const closeIdx = rest.indexOf('」');

    if (closeIdx !== -1) {
      const after = rest.slice(closeIdx + 1);
      if (after.trim() === '') {
        results.push({ id: autoId++, speaker, markerSpeaker, body: rest.slice(0, closeIdx), startLine: i + 1, endLine: i + 1 });
      }
      i++;
      continue;
    }

    const bodyLines = [rest];
    let j = i + 1, closed = false, endLine = null;
    while (j < lines.length) {
      const tj = lines[j].trim();
      const idx = tj.indexOf('」');
      if (idx !== -1) {
        const afterj = tj.slice(idx + 1);
        if (afterj.trim() === '') {
          bodyLines.push(tj.slice(0, idx));
          closed = true;
          endLine = j + 1;
        }
        break;
      } else {
        bodyLines.push(lines[j]);
        j++;
      }
    }

    if (closed) {
      results.push({ id: autoId++, speaker, markerSpeaker, body: bodyLines.join('\n'), startLine: i + 1, endLine });
      i = endLine;
    } else {
      i++;
    }
  }
  return results;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitizeFilename(s) {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim() || 'セリフ';
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const EXPORT_CAT_ORDER = [
  { cat: '1', label: '一人称' },
  { cat: '2', label: '二人称' },
  { cat: '3', label: '三人称' },
  { cat: 'other', label: 'それ以外（未確定）' }
];

// クリックで確定された人称、または手動指定された人称を返す（どちらも無ければ空配列＝未確定）
function resolvedCatsOf(d) {
  if (lineConfirmedCats[d.id] && lineConfirmedCats[d.id].size > 0) return [...lineConfirmedCats[d.id]];
  if (lineCategory[d.id]) return [lineCategory[d.id]];
  return [];
}

function buildSpeakerExportText(items) {
  const buckets = { '1': [], '2': [], '3': [], other: [] };
  items.forEach(d => {
    const cats = resolvedCatsOf(d);
    const lineLabel = d.startLine === d.endLine ? `${d.startLine}行目` : `${d.startLine}〜${d.endLine}行目`;
    const entry = `（${lineLabel}）\n${d.body}`;
    if (cats.length === 0) {
      buckets.other.push(entry);
    } else {
      // 一人称と二人称の両方が確定しているセリフは、両方のセクションに載せる
      cats.forEach(c => buckets[c].push(entry));
    }
  });

  return EXPORT_CAT_ORDER
    .filter(({ cat }) => buckets[cat].length > 0)
    .map(({ cat, label }) => `■ ${label}（${buckets[cat].length}件）\n\n${buckets[cat].join('\n\n')}`)
    .join('\n\n\n');
}

function detectPersonHints(body) {
  const hints = { '1': [], '2': [], '3': [] };
  for (const cat of ['1', '2', '3']) {
    // 「彼女」のような長い語を「彼」のような短い語より先にチェックし、長い語を優先してマッチさせる
    const sortedWords = [...personKeywords[cat]].sort((a, b) => b.length - a.length);
    for (const kw of sortedWords) {
      if (body.includes(kw)) hints[cat].push(kw);
    }
    for (const re of (PERSON_PATTERNS[cat] || [])) {
      const g = new RegExp(re.source, 'g');
      let match;
      while ((match = g.exec(body)) !== null) {
        hints[cat].push(match[0]);
        if (match.index === g.lastIndex) g.lastIndex++; // 念のため無限ループ防止
      }
    }
  }
  return hints;
}

function highlightKeyword(body, keyword) {
  const escaped = escapeHtml(body);
  if (!keyword) return escaped;
  const escKw = escapeHtml(keyword);
  return escaped.split(escKw).join(`<strong>${escKw}</strong>`);
}

function renderUnassigned() {
  const section = document.getElementById('unassignedSection');
  const area = document.getElementById('unassignedArea');
  const items = extracted.filter(d => rawSpeakerKey(d) === null);

  if (items.length === 0) {
    section.style.display = 'none';
    area.innerHTML = '';
    return;
  }
  section.style.display = '';

  const existingSpeakers = [...new Set(extracted
    .map(d => speakerKeyOf(d))
    .filter(k => k !== null))];

  // stale ids (already assigned, no longer unassigned) shouldn't linger in the selection
  const validIds = new Set(items.map(d => d.id));
  [...selectedUnassigned].forEach(id => { if (!validIds.has(id)) selectedUnassigned.delete(id); });

  const options = existingSpeakers.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

  const bulkBarHtml = `<div class="bulk-bar">
      <span class="bulk-count">${selectedUnassigned.size} 件選択中</span>
      <select id="bulkAssignSelect">
        <option value="">話者を選ぶ</option>
        ${options}
        <option value="__new__">＋ 新しい話者名</option>
      </select>
      <input type="text" id="bulkNewName" placeholder="話者名" style="display:none; width:100px;">
      <button class="small" id="bulkAssignBtn" ${selectedUnassigned.size === 0 ? 'disabled' : ''}>選択した項目に一括割り当て</button>
    </div>
    <div class="select-all-row">
      <input type="checkbox" id="selectAllUnassigned" ${items.length > 0 && items.every(d => selectedUnassigned.has(d.id)) ? 'checked' : ''}>
      <label for="selectAllUnassigned">すべて選択</label>
    </div>`;

  const itemsHtml = items.map(d => {
    const lineLabel = d.startLine === d.endLine ? `${d.startLine}行目` : `${d.startLine}〜${d.endLine}行目`;
    return `<div class="unassigned-item${selectedUnassigned.has(d.id) ? ' selected' : ''}" data-id="${d.id}">
      <input type="checkbox" class="row-check" ${selectedUnassigned.has(d.id) ? 'checked' : ''} tabindex="-1">
      <span class="line-tag">${lineLabel}</span>
      <div class="body-text">${escapeHtml(d.body)}</div>
      <div class="assign-controls">
        <select class="assign-select">
          <option value="">話者を選ぶ</option>
          ${options}
          <option value="__new__">＋ 新しい話者名</option>
        </select>
        <input type="text" class="new-name" placeholder="話者名" style="display:none; width:70px;">
        <button class="small assign-btn">割り当て</button>
      </div>
    </div>`;
  }).join('');

  area.innerHTML = bulkBarHtml + itemsHtml;

  // bulk controls
  const bulkSelect = document.getElementById('bulkAssignSelect');
  const bulkInput = document.getElementById('bulkNewName');
  const bulkBtn = document.getElementById('bulkAssignBtn');
  const selectAll = document.getElementById('selectAllUnassigned');

  bulkSelect.addEventListener('change', () => {
    bulkInput.style.display = bulkSelect.value === '__new__' ? '' : 'none';
  });

  bulkBtn.addEventListener('click', () => {
    let name = bulkSelect.value;
    if (name === '__new__') name = bulkInput.value.trim();
    if (!name || selectedUnassigned.size === 0) return;
    selectedUnassigned.forEach(id => { manualAssign[id] = name; });
    selectedUnassigned.clear();
    renderAll();
  });

  selectAll.addEventListener('change', () => {
    if (selectAll.checked) items.forEach(d => selectedUnassigned.add(d.id));
    else selectedUnassigned.clear();
    renderAll();
  });

  // --- drag-select helpers (defined per-render so they can see `items`/`area` via closure) ---
  function getRowEls(id) {
    const row = area.querySelector(`.unassigned-item[data-id="${id}"]`);
    return row ? { row, check: row.querySelector('.row-check') } : null;
  }

  function updateBulkBarUI() {
    const countEl = area.querySelector('.bulk-count');
    if (countEl) countEl.textContent = `${selectedUnassigned.size} 件選択中`;
    if (bulkBtn) bulkBtn.disabled = selectedUnassigned.size === 0;
    if (selectAll) selectAll.checked = items.length > 0 && items.every(d => selectedUnassigned.has(d.id));
  }

  function applyDragValue(id, value) {
    if (value) selectedUnassigned.add(id); else selectedUnassigned.delete(id);
    const els = getRowEls(id);
    if (els) {
      els.check.checked = value;
      els.row.classList.toggle('selected', value);
    }
    updateBulkBarUI();
  }

  // per-row controls
  area.querySelectorAll('.unassigned-item').forEach(row => {
    const id = Number(row.getAttribute('data-id'));
    const check = row.querySelector('.row-check');
    const select = row.querySelector('.assign-select');
    const input = row.querySelector('.new-name');
    const btn = row.querySelector('.assign-btn');

    // clicking/dragging anywhere on the row (but not inside the assign controls)
    // toggles selection and, when dragged across rows, applies the same state to each —
    // handy for selecting a run of consecutive unlabeled lines that belong to one speaker.
    row.addEventListener('mousedown', (e) => {
      if (e.target.closest('.assign-controls')) return; // let the normal controls work
      e.preventDefault();
      dragSelecting = true;
      dragSelectValue = !selectedUnassigned.has(id);
      document.body.classList.add('dragging-select');
      applyDragValue(id, dragSelectValue);
    });
    row.addEventListener('mouseenter', () => {
      if (dragSelecting) applyDragValue(id, dragSelectValue);
    });

    select.addEventListener('change', () => {
      input.style.display = select.value === '__new__' ? '' : 'none';
    });

    btn.addEventListener('click', () => {
      let name = select.value;
      if (name === '__new__') name = input.value.trim();
      if (!name) return;
      manualAssign[id] = name;
      selectedUnassigned.delete(id);
      renderAll();
    });
  });
}

function renderDictionary() {
  const area = document.getElementById('dictSection');
  ['1', '2', '3'].forEach(cat => {
    const chipsEl = area.querySelector(`.dict-chips[data-cat="${cat}"]`);
    chipsEl.innerHTML = personKeywords[cat].map((kw, idx) =>
      `<span class="dict-chip" data-cat="${cat}" data-idx="${idx}">${escapeHtml(kw)}<button title="削除">×</button></span>`
    ).join('');
  });

  area.querySelectorAll('.dict-chip button').forEach(btn => {
    btn.addEventListener('click', () => {
      const chip = btn.closest('.dict-chip');
      const cat = chip.getAttribute('data-cat');
      const idx = Number(chip.getAttribute('data-idx'));
      personKeywords[cat].splice(idx, 1);
      renderDictionary();
      if (extracted.length) renderSpeakers();
    });
  });

  area.querySelectorAll('.dict-add').forEach(row => {
    const cat = row.getAttribute('data-cat');
    const input = row.querySelector('input[type=text]');
    const btn = row.querySelector('button');
    const addWord = () => {
      const v = input.value.trim();
      if (!v) return;
      if (!personKeywords[cat].includes(v)) personKeywords[cat].push(v);
      input.value = '';
      renderDictionary();
      if (extracted.length) renderSpeakers();
    };
    btn.addEventListener('click', addWord);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addWord(); } });
  });

  saveState();
  pushHistory();
}

document.getElementById('dictReset').addEventListener('click', () => {
  personKeywords = JSON.parse(JSON.stringify(PERSON_KEYWORDS));
  renderDictionary();
  if (extracted.length) renderSpeakers();
});

document.getElementById('dictClear').addEventListener('click', () => {
  personKeywords = { '1': [], '2': [], '3': [] };
  renderDictionary();
  if (extracted.length) renderSpeakers();
});

/* ---------- 辞書インポート（テキストファイル / 貼り付けテキストから単語を取り込む） ---------- */
const DICT_HEADER_RE = [
  { re: /^[\[【(]?\s*(一人称|1人称|1)\s*[\]】):：]?$/, cat: '1' },
  { re: /^[\[【(]?\s*(二人称|2人称|2)\s*[\]】):：]?$/, cat: '2' },
  { re: /^[\[【(]?\s*(三人称|3人称|3)\s*[\]】):：]?$/, cat: '3' }
];
const DICT_INLINE_RE = /^[\[【(]?\s*(一人称|二人称|三人称|1人称|2人称|3人称)\s*[\]】)]?\s*[:：]\s*(.+)$/;

function dictCatOf(label) {
  if (label.startsWith('一') || label.startsWith('1')) return '1';
  if (label.startsWith('二') || label.startsWith('2')) return '2';
  return '3';
}

function splitDictWords(s) {
  return s.split(/[,、，\t]+/).map(w => w.trim()).filter(Boolean);
}

function parseDictionaryImport(text) {
  const added = { '1': [], '2': [], '3': [] };
  let currentCat = null;
  let unrecognized = 0;

  const addWord = (cat, w) => {
    if (!w || personKeywords[cat].includes(w)) return;
    personKeywords[cat].push(w);
    added[cat].push(w);
  };

  text.split(/\r\n|\r|\n/).forEach(rawLine => {
    const line = rawLine.trim();
    if (!line) return;

    const inline = line.match(DICT_INLINE_RE);
    if (inline) {
      currentCat = dictCatOf(inline[1]);
      splitDictWords(inline[2]).forEach(w => addWord(currentCat, w));
      return;
    }

    const header = DICT_HEADER_RE.find(h => h.re.test(line));
    if (header) { currentCat = header.cat; return; }

    if (!currentCat) { unrecognized++; return; }
    splitDictWords(line).forEach(w => addWord(currentCat, w));
  });

  return { added, unrecognized };
}

document.getElementById('dictImportFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('dictImportText').value = reader.result;
  };
  reader.readAsText(file, 'utf-8');
});

document.getElementById('dictImportBtn').addEventListener('click', () => {
  const text = document.getElementById('dictImportText').value;
  const statusEl = document.getElementById('dictImportStatus');
  if (!text.trim()) {
    statusEl.textContent = '取り込むテキストがありません。';
    return;
  }
  const { added, unrecognized } = parseDictionaryImport(text);
  const total = added['1'].length + added['2'].length + added['3'].length;
  if (total) {
    statusEl.textContent = `一人称${added['1'].length}件・二人称${added['2'].length}件・三人称${added['3'].length}件を追加しました。` +
      (unrecognized ? `（見出しが見つからず無視した行：${unrecognized}件）` : '');
  } else {
    statusEl.textContent = '追加できる新しい単語が見つかりませんでした。' +
      (unrecognized ? '【一人称】のような見出し行があるか確認してください。' : '（すべて登録済みの単語でした）');
  }
  renderDictionary();
  if (extracted.length) renderSpeakers();
});

function renderAliasSection() {
  const section = document.getElementById('aliasSection');
  const area = document.getElementById('aliasArea');
  const rawTags = [...new Set(extracted.map(d => rawSpeakerKey(d)).filter(k => k !== null))];

  if (rawTags.length === 0) {
    section.style.display = 'none';
    area.innerHTML = '';
    return;
  }
  section.style.display = '';

  area.innerHTML = rawTags.map(tag => {
    const val = speakerAlias[tag] || tag;
    return `<div class="alias-row" data-tag="${escapeHtml(tag)}">
      <span class="alias-tag">${escapeHtml(tag)}</span>
      <span class="alias-arrow">→</span>
      <input type="text" class="alias-input" value="${escapeHtml(val)}">
    </div>`;
  }).join('');

  area.querySelectorAll('.alias-row').forEach(row => {
    const tag = row.getAttribute('data-tag');
    const input = row.querySelector('.alias-input');
    input.addEventListener('change', () => {
      const v = input.value.trim();
      if (!v || v === tag) delete speakerAlias[tag];
      else speakerAlias[tag] = v;
      renderAll();
    });
  });
}

function renderFilter() {
  const section = document.getElementById('filterSection');
  const select = document.getElementById('speakerFilter');
  const keys = [...new Set(extracted.map(d => speakerKeyOf(d)).filter(k => k !== null))];

  if (keys.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  const prevValue = select.value || 'ALL';
  select.innerHTML = `<option value="ALL">すべて表示</option>` +
    keys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
  if ([...select.options].some(o => o.value === prevValue)) {
    select.value = prevValue;
  }
}

function renderSpeakers() {
  const section = document.getElementById('speakerSection');
  const area = document.getElementById('speakerArea');
  const filterVal = document.getElementById('speakerFilter').value || 'ALL';

  const grouped = {};
  extracted.forEach(d => {
    const key = speakerKeyOf(d);
    if (key === null) return; // shown in unassigned section instead
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  });

  const keys = Object.keys(grouped);
  if (keys.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  const visibleKeys = filterVal === 'ALL' ? keys : keys.filter(k => k === filterVal);

  if (visibleKeys.length === 0) {
    area.innerHTML = '<p class="empty">該当する話者のセリフがありません。</p>';
    return;
  }

  const catSelectOptions = (id) => {
    const cur = lineCategory[id] || '';
    const opt = (v, label) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${label}</option>`;
    return opt('', '分類なし') + opt('1', '一人称') + opt('2', '二人称') + opt('3', '三人称');
  };

  const catLabel = { '1': '一人称', '2': '二人称', '3': '三人称' };

  // full list of every speaker currently known (across all cards), used to build the "move to" dropdown
  const allSpeakers = [...new Set(extracted.map(d => speakerKeyOf(d)).filter(k => k !== null))].sort((a, b) => a.localeCompare(b, 'ja'));

  const speakerMoveOptions = (currentKey) => allSpeakers.map(s =>
    `<option value="${escapeHtml(s)}" ${s === currentKey ? 'selected' : ''}>${escapeHtml(s)}</option>`
  ).join('') + `<option value="__new__">＋ 新しい話者名</option>`;

  area.innerHTML = visibleKeys.map(key => {
    const items = grouped[key];
    const allLinesHtml = items.map(d => {
      const lineLabel = d.startLine === d.endLine ? `${d.startLine}行目` : `${d.startLine}〜${d.endLine}行目`;
      const viaMarker = d.speaker === null && !manualAssign[d.id] && d.markerSpeaker;
      const confirmedCats = lineConfirmedCats[d.id] ? [...lineConfirmedCats[d.id]] : (lineCategory[d.id] ? [lineCategory[d.id]] : []);
      const confirmedBadges = confirmedCats.map(c => `<span class="confirm-mini p${c}">確定:${catLabel[c]}</span>`).join('');
      const isOverridden = !!speakerOverride[d.id];
      return `<div class="item">
        <span class="line-tag">${lineLabel}</span>
        <span class="body-text">${escapeHtml(d.body)}${viaMarker ? '<span class="marker-badge">▼から推定</span>' : ''}${isOverridden ? '<span class="override-badge">手動で話者変更済み</span>' : ''}${confirmedBadges}</span>
        <span class="speaker-move">
          <select class="speaker-move-select" data-id="${d.id}">${speakerMoveOptions(key)}</select>
          <input type="text" class="speaker-move-new" data-id="${d.id}" style="display:none;" placeholder="新しい話者名">
          ${isOverridden ? `<button class="small speaker-move-reset" data-id="${d.id}">自動判定に戻す</button>` : ''}
        </span>
      </div>`;
    }).join('');

    const hintBuckets = { '1': [], '2': [], '3': [] };
    const leftoverItems = [];
    items.forEach(d => {
      const lineLabel = d.startLine === d.endLine ? `${d.startLine}行目` : `${d.startLine}〜${d.endLine}行目`;
      const manualCat = lineCategory[d.id];
      if (manualCat === '1' || manualCat === '2' || manualCat === '3') {
        // manual assignment (from the leftover panel) takes priority over auto-detected keyword hints
        hintBuckets[manualCat].push({ id: d.id, body: d.body, keyword: null, lineLabel, manual: true });
      } else {
        const hints = detectPersonHints(d.body);
        // a line can contain both 1st- and 2nd-person expressions at once, so it may
        // legitimately show up as a candidate example under more than one category
        ['1', '2', '3'].forEach(cat => {
          if (hints[cat].length > 0) {
            hintBuckets[cat].push({ id: d.id, body: d.body, keyword: hints[cat][0], lineLabel, manual: false });
          }
        });
      }
      const confirmed = lineConfirmedCats[d.id];
      const isResolved = (confirmed && confirmed.size > 0) || !!manualCat;
      if (!isResolved) {
        leftoverItems.push({ id: d.id, body: d.body, lineLabel });
      }
    });

    const labelMap = { '1': ['一人称っぽい', 'p1'], '2': ['二人称っぽい', 'p2'], '3': ['三人称っぽい', 'p3'] };
    const hintColsHtml = ['1', '2', '3'].map(cat => {
      const [label, cls] = labelMap[cat];
      const examples = hintBuckets[cat];
      const body = examples.length
        ? examples.slice(0, 5).map(ex => {
            const isConfirmedHere = !!(lineConfirmedCats[ex.id] && lineConfirmedCats[ex.id].has(cat));
            return `<div class="hint-example${isConfirmedHere ? ' confirmed' : ''}" data-id="${ex.id}" data-cat="${cat}" title="クリックしてこの人称として確定/解除">
              ${isConfirmedHere ? '<span class="confirm-check">✓ 確定</span> ' : ''}${highlightKeyword(ex.body, ex.keyword)}${ex.manual ? '<span class="manual-badge">手動</span>' : ''}<br><span style="color:var(--ink-soft); font-size:11px;">${ex.lineLabel}</span>
            </div>`;
          }).join('')
        : '<div class="hint-none">該当なし</div>';
      return `<div class="hint-col ${cls}">
        <div class="hint-title">${label}（${examples.length}件）</div>
        ${body}
      </div>`;
    }).join('');

    const isConfirmed = !!speakerConfirmed[key];
    const leftoverHtml = isConfirmed
      ? `<div class="leftover-block">
          <div class="leftover-title">まだ確定していないセリフ（${leftoverItems.length}件）</div>
          ${leftoverItems.length
            ? leftoverItems.map(li => `<div class="item">
                <span class="line-tag">${li.lineLabel}</span>
                <span class="body-text">${escapeHtml(li.body)}</span>
                <select class="cat-select" data-id="${li.id}">${catSelectOptions(li.id)}</select>
              </div>`).join('')
            : '<p class="empty">すべてのセリフがいずれかの人称として確定されています。</p>'}
        </div>`
      : '';

    return `<div class="speaker-card" data-key="${escapeHtml(key)}">
      <div class="speaker-head">
        <span class="name">${escapeHtml(key)}</span>
        <div class="head-right">
          <span class="count">${items.length}件</span>
          <button class="speaker-bulk-download" data-key="${escapeHtml(key)}" type="button" title="このキャラのセリフを人称別にtxtファイルで保存">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/></svg>
            txtで保存
          </button>
          <button class="confirm-btn${isConfirmed ? ' confirmed' : ''}" data-key="${escapeHtml(key)}">
            ${isConfirmed ? '未確定を隠す' : '未確定のセリフを表示'}
          </button>
        </div>
      </div>
      <div class="speaker-body">
        <div class="all-lines">${allLinesHtml}</div>
        <div class="hint-columns">${hintColsHtml}</div>
        ${leftoverHtml}
      </div>
    </div>`;
  }).join('');

  area.querySelectorAll('.hint-example[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = Number(el.getAttribute('data-id'));
      const cat = el.getAttribute('data-cat');
      if (!lineConfirmedCats[id]) lineConfirmedCats[id] = new Set();
      if (lineConfirmedCats[id].has(cat)) lineConfirmedCats[id].delete(cat);
      else lineConfirmedCats[id].add(cat);
      renderSpeakers();
    });
  });

  area.querySelectorAll('.cat-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = Number(sel.getAttribute('data-id'));
      lineCategory[id] = sel.value;
      renderSpeakers();
    });
  });

  area.querySelectorAll('.speaker-move-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = Number(sel.getAttribute('data-id'));
      const input = area.querySelector(`.speaker-move-new[data-id="${id}"]`);
      if (sel.value === '__new__') {
        input.style.display = '';
        input.focus();
        return;
      }
      speakerOverride[id] = sel.value;
      renderAll();
    });
  });

  area.querySelectorAll('.speaker-move-new').forEach(input => {
    const commit = () => {
      const id = Number(input.getAttribute('data-id'));
      const v = input.value.trim();
      if (!v) return;
      speakerOverride[id] = v;
      renderAll();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    input.addEventListener('blur', commit);
  });

  area.querySelectorAll('.speaker-move-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute('data-id'));
      delete speakerOverride[id];
      renderAll();
    });
  });

  area.querySelectorAll('.speaker-bulk-download').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      const items = grouped[key];
      if (!items) return;
      downloadTextFile(`${key}_セリフ.txt`, buildSpeakerExportText(items));
    });
  });

  area.querySelectorAll('.confirm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      speakerConfirmed[key] = !speakerConfirmed[key];
      renderSpeakers();
    });
  });

  saveState();
  pushHistory();
}

function renderAll() {
  renderUnassigned();
  renderAliasSection();
  renderFilter();
  renderSpeakers();
  saveState();
  pushHistory();
}

function run() {
  const text = document.getElementById('input').value;
  extracted = extractDialogues(text);
  manualAssign = {};
  speakerOverride = {};
  speakerAlias = {};
  lineCategory = {};
  selectedUnassigned = new Set();
  speakerConfirmed = {};
  lineConfirmedCats = {};
  document.getElementById('status').textContent = `${extracted.length} 件のセリフを抽出しました。`;
  renderAll();
}

document.getElementById('extract').addEventListener('click', run);
document.getElementById('themeToggle').addEventListener('click', () => {
  setTheme(currentIsDark() ? 'light' : 'dark');
});
document.getElementById('undoBtn').addEventListener('click', undo);
document.getElementById('redoBtn').addEventListener('click', redo);
document.getElementById('input').addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveState(); pushHistory(); }, 400);
});
document.addEventListener('mouseup', () => {
  dragSelecting = false;
  document.body.classList.remove('dragging-select');
});
document.addEventListener('mouseleave', () => {
  dragSelecting = false;
  document.body.classList.remove('dragging-select');
});
document.getElementById('speakerFilter').addEventListener('change', renderSpeakers);
window.addEventListener('DOMContentLoaded', initFromStorage);
