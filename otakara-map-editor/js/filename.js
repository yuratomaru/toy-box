// 保存名の入力ダイアログ（保存のたびに毎回尋ねる）。キャンセル時は null を返す
function askFileName(defaultName, ext) {
  return new Promise((resolve) => {
    const modal = document.getElementById('filename-modal');
    const input = document.getElementById('fn-input');
    document.getElementById('fn-ext').textContent = ext;
    input.value = defaultName || '';
    modal.style.display = 'flex';
    input.focus(); input.select();
    const done = (v) => {
      modal.style.display = 'none';
      input.removeEventListener('keydown', onKey);
      ok.removeEventListener('click', onOk);
      ['fn-cancel', 'fn-close'].forEach((id) => document.getElementById(id).removeEventListener('click', onCancel));
      resolve(v);
    };
    const clean = (s) => s.replace(/[\\/:*?"<>|]/g, '_').trim().replace(/\.+$/, '');
    const onOk = () => done(clean(input.value) || clean(defaultName || '') || '配置図');
    const onCancel = () => done(null);
    const onKey = (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); onOk(); }
      else if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
    };
    const ok = document.getElementById('fn-ok');
    ok.addEventListener('click', onOk);
    ['fn-cancel', 'fn-close'].forEach((id) => document.getElementById(id).addEventListener('click', onCancel));
    input.addEventListener('keydown', onKey);
  });
}
