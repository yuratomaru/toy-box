initBulkGrid();
    syncStateToUI();
    loadAutosave();
    applyViewBox();
    initCudPalette();

    // フォント確定後にキャッシュクリア＋再描画（getComputedTextLength の初回0対策）
    document.fonts.ready.then(() => {
      clearTextWidthCache();
      if (state.labels.length > 0) renderLabels();
    });

// Escキーで、いちばん手前のモーダルを閉じる（閉じるボタンと同じ処理）
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = Array.from(document.querySelectorAll('.modal-overlay')).filter((x) => x.style.display === 'flex').pop();
  const btn = open && open.querySelector('.modal-close-btn');
  if (btn) btn.click();
});

// フッターの「ライセンス・利用素材」ダイアログ
(() => {
  const modal = document.getElementById('license-modal');
  const open = document.getElementById('license-link');
  const close = document.getElementById('license-close');
  open.addEventListener('click', () => { modal.style.display = 'flex'; close.focus(); });
  close.addEventListener('click', () => { modal.style.display = 'none'; open.focus(); });
  modal.addEventListener('click', (e) => { if (e.target === modal) close.click(); });
})();
