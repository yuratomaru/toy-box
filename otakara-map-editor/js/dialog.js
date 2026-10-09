// アプリのデザインに合わせた確認・通知ダイアログ（window.confirm / alert の代替）
function uiDialog({ title, message, okText = 'OK', cancelText = 'キャンセル', danger = false, alertOnly = false }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('dialog-modal');
    const ok = document.getElementById('dlg-ok'), cancel = document.getElementById('dlg-cancel'), close = document.getElementById('dlg-close');
    const prevFocus = document.activeElement;
    document.getElementById('dlg-title').textContent = title;
    document.getElementById('dlg-msg').textContent = message;
    ok.textContent = okText; cancel.textContent = cancelText;
    ok.classList.toggle('danger', danger);
    cancel.style.display = alertOnly ? 'none' : '';
    modal.style.display = 'flex';
    (alertOnly ? ok : cancel).focus(); // 誤操作を避けるため、確認ダイアログは「キャンセル」に初期フォーカス
    const finish = (v) => {
      modal.style.display = 'none';
      ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onNo); close.removeEventListener('click', onNo);
      modal.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(v);
    };
    const onOk = () => finish(true), onNo = () => finish(false);
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const f = [close, cancel, ok].filter((b) => b.offsetParent !== null);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    ok.addEventListener('click', onOk); cancel.addEventListener('click', onNo); close.addEventListener('click', onNo);
    modal.addEventListener('keydown', onKey);
  });
}
const uiConfirm = (message, opts = {}) => uiDialog({ title: '確認', message, ...opts });
const uiAlert = (message, opts = {}) => uiDialog({ title: 'お知らせ', message, alertOnly: true, ...opts }).then(() => undefined);
