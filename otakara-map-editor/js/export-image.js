  // 画像エクスポートモーダル制御 ＆ プレビュー生成

  // 選択された範囲に基づいて、ピクセル数を計算してUIに表示する
  function updateExportDimensions() {
    const range = document.querySelector('input[name="exp-range"]:checked').value;
    const bounds = getExportBounds(range);
    
    // 復元倍率の計算 (未定義の安全策を含む)
    const restoreScale = (state.originalWidth && state.mapWidth) ? (state.originalWidth / state.mapWidth) : 1.0;
    
    // 表示するサイズは、元の画像サイズに戻した時の大きさを基準にする
    const baseW = bounds.w * restoreScale;
    const baseH = bounds.h * restoreScale;

    document.getElementById('dim-scale-1').textContent = `${Math.round(baseW)} × ${Math.round(baseH)} px`;
    document.getElementById('dim-scale-2').textContent = `${Math.round(baseW * 2)} × ${Math.round(baseH * 2)} px`;
    document.getElementById('dim-scale-3').textContent = `${Math.round(baseW * 3)} × ${Math.round(baseH * 3)} px`;
    return bounds;
  }

  function checkExportSizeLimit() {
    // リネーム: exportMultiplier (エクスポート時の解像度倍率)
    const exportMultiplier = parseInt(document.querySelector('input[name="exp-scale"]:checked').value) || 2;
    const range = document.querySelector('input[name="exp-range"]:checked').value;
    const bounds = getExportBounds(range);
    
    const restoreScale = (state.originalWidth && state.mapWidth) ? (state.originalWidth / state.mapWidth) : 1.0;

    // キャンバスの最終的なサイズを計算
    const totalWidth = Math.round(bounds.w * exportMultiplier * restoreScale);
    const totalHeight = Math.round(bounds.h * exportMultiplier * restoreScale);
    
    const confirmBtn = document.getElementById('export-confirm-btn');
    const sizeWarning = document.getElementById('export-size-warning');
    // CONFIG が未定義の場合のフォールバック
    const limit = (typeof CONFIG !== 'undefined' && CONFIG.MAX_EXPORT_PIXELS) ? CONFIG.MAX_EXPORT_PIXELS : 9000;

    if (totalWidth > limit || totalHeight > limit) {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = "0.5";
      confirmBtn.style.cursor = "not-allowed";
      
      if (sizeWarning) {
        sizeWarning.textContent = `サイズが上限を超えています (${totalWidth}×${totalHeight}px / 上限: ${limit}px)`;
      }
      return false;
    } else {
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = "1";
      confirmBtn.style.cursor = "pointer";
      
      if (sizeWarning) {
        sizeWarning.textContent = "";
      }
      return true;
    }
  }

  //  範囲計算（余白を最小限にし、ベース画像サイズでの完璧な切り抜きを実現）
  function getExportBounds(range) {
    if (range === 'base-image') {
      return { x: 0, y: 0, w: state.mapWidth, h: state.mapHeight };
    } 
    else {
      if (state.labels.length === 0 && !state.showLegend) {
        return { x: 0, y: 0, w: state.mapWidth, h: state.mapHeight };
      }
      
      let minX = 0, minY = 0, maxX = state.mapWidth, maxY = state.mapHeight;
      const viewScale = state.viewScale || 1.0;
      
      state.labels.forEach(lbl => {
        // autoWidth は scale 込みの値。null の場合は MIN_WIDTH * scale で推定
        const lw = lbl.customWidth != null
          ? lbl.customWidth * viewScale
          : (lbl.autoWidth || (140 * viewScale));
        const lh = (lbl.customHeight || 44) * viewScale;
        minX = Math.min(minX, lbl.labelX, lbl.anchorX - 5);
        minY = Math.min(minY, lbl.labelY, lbl.anchorY - 5);
        maxX = Math.max(maxX, lbl.labelX + lw, lbl.anchorX + 5);
        maxY = Math.max(maxY, lbl.labelY + lh, lbl.anchorY + 5);
      });

      if (state.showLegend) {
        const lGroups = state.groups.filter(g => state.labels.some(l => l.groupId === g.id));
        if (lGroups.length > 0) {
          const legendW = 180;
          const legendH = 24 + lGroups.length * 24;
          minX = Math.min(minX, state.legendX);
          minY = Math.min(minY, state.legendY);
          maxX = Math.max(maxX, state.legendX + legendW);
          maxY = Math.max(maxY, state.legendY + legendH);
        }
      }
      
      const padding = (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PADDING) ? CONFIG.DEFAULT_PADDING : 20;
      const finalPadding = (minX > 0 && minY > 0) ? padding : 0;

      return {
        x: Math.floor(minX - finalPadding),
        y: Math.floor(minY - finalPadding),
        w: Math.ceil((maxX - minX) + finalPadding * 2),
        h: Math.ceil((maxY - minY) + finalPadding * 2)
      };
    }
  }

  function generateExportImage(callback) {
    const exportMultiplier = parseInt(document.querySelector('input[name="exp-scale"]:checked').value) || 2;
    const includeBg = document.querySelector('input[name="exp-bg"]:checked').value === 'include';
    const range = document.querySelector('input[name="exp-range"]:checked').value;

    const bounds = getExportBounds(range);

    // 復元倍率の計算：(元の画像サイズ / 編集キャンバスサイズ)
    const restoreScale = (state.originalWidth && state.mapWidth) ? (state.originalWidth / state.mapWidth) : 1.0;

    const canvas = document.createElement('canvas');
    // Canvasサイズ = 範囲 * 解像度倍率 * 復元倍率
    canvas.width = bounds.w * exportMultiplier * restoreScale;
    canvas.height = bounds.h * exportMultiplier * restoreScale;
    const ctx = canvas.getContext('2d');

    const cloneSvg = dom.mapSvg.cloneNode(true);
    
    // 背景画像の差し替え（書き出しは必ずオリジナル高画質データで行う）
    const mapImg = cloneSvg.getElementById('map-image');
    if (mapImg && state.originalMapData) {
      mapImg.setAttribute('href', state.originalMapData);
      // 画像は座標系(mapWidth/Height)の大きさで配置する。高解像度化は後段の scale(restoreScale) が担う
      mapImg.setAttribute('width', state.mapWidth);
      mapImg.setAttribute('height', state.mapHeight);
      mapImg.setAttribute('preserveAspectRatio', 'none');
    }
    
    // 現在のHTMLに読み込まれている <style> タグを丸ごとSVGにコピーする
    document.querySelectorAll('style').forEach(styleTag => {
      cloneSvg.appendChild(styleTag.cloneNode(true));
    });

    // 模様の定義（defs）をクローンして埋め込む
    const defs = document.querySelector('defs');
    if (defs) {
      cloneSvg.insertBefore(defs.cloneNode(true), cloneSvg.firstChild);
    }

    const marquee = cloneSvg.getElementById('selection-marquee');
    if (marquee) marquee.remove();
    const labelsLayer = cloneSvg.getElementById('labels-layer');
    if (labelsLayer) {
      labelsLayer.querySelectorAll('.label-group').forEach(lg => lg.classList.remove('selected', 'dimmed'));
      cloneSvg.querySelectorAll('.leader-line').forEach(line => line.classList.remove('selected', 'dimmed'));
      cloneSvg.querySelectorAll('.anchor-handle').forEach(anchor => anchor.classList.remove('dimmed'));
    }

    if (!includeBg) {
      const bgRect = cloneSvg.getElementById('canvas-background');
      if (bgRect) bgRect.setAttribute('fill', 'none');
      const bgImg = cloneSvg.getElementById('map-image');
      if (bgImg) bgImg.setAttribute('display', 'none');
    } else {
      // 背景を含める場合、広げた枠のサイズに合わせて背景四角を広げる
      const bgRect = cloneSvg.getElementById('canvas-background');
      if (bgRect) {
        bgRect.setAttribute('x', bounds.x);
        bgRect.setAttribute('y', bounds.y);
        bgRect.setAttribute('width', bounds.w);
        bgRect.setAttribute('height', bounds.h);
      }
    }

    // 復元スケールの適用：SVGの中身全体を <g> で囲んで拡大する
    const wrapperGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    wrapperGroup.setAttribute('transform', `scale(${restoreScale})`);
    
    // SVGの直下にある主要な要素（背景、レイヤー群）をラッパーに移動
    ['canvas-background', 'map-image', 'lines-layer', 'labels-layer', 'anchors-layer', 'legend-layer'].forEach(id => {
      const el = cloneSvg.getElementById(id);
      if (el) wrapperGroup.appendChild(el);
    });
    cloneSvg.appendChild(wrapperGroup);

    // viewBoxも復元スケールに合わせて拡張する
    const scaledBounds = {
      x: bounds.x * restoreScale,
      y: bounds.y * restoreScale,
      w: bounds.w * restoreScale,
      h: bounds.h * restoreScale
    };
    
    cloneSvg.setAttribute('width', scaledBounds.w);
    cloneSvg.setAttribute('height', scaledBounds.h);
    cloneSvg.setAttribute('viewBox', `${scaledBounds.x} ${scaledBounds.y} ${scaledBounds.w} ${scaledBounds.h}`);

    const svgString = new XMLSerializer().serializeToString(cloneSvg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = function () {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/png'));
      URL.revokeObjectURL(blobURL); 
    };
    image.src = blobURL;
  }

  function updatePreview() {
    if (!checkExportSizeLimit()) {
      dom.previewLoading.style.display = 'none';
      dom.exportPreviewImg.style.display = 'none';
      return;
    }

    dom.previewLoading.style.display = 'block';
    dom.exportPreviewImg.style.display = 'none';
    
    updateExportDimensions();
    
    generateExportImage((dataUrl) => {
      dom.exportPreviewImg.src = dataUrl;
      dom.exportPreviewImg.style.display = 'block';
      dom.previewLoading.style.display = 'none';
    });
  }

  dom.exportPngBtn.addEventListener('click', () => {
    // 背景画像も吹き出しもない状態での書き出しをガード
    if (!state.mapImageData && state.labels.length === 0) {
      showToast('地図画像を読み込むか、吹き出しを配置してから書き出してください');
      return;
    }
    dom.exportSettingModal.style.display = 'flex';
    updatePreview();
  });

  dom.exportModalClose.addEventListener('click', () => dom.exportSettingModal.style.display = 'none');
  document.getElementById('export-cancel-btn').addEventListener('click', () => dom.exportSettingModal.style.display = 'none');

  document.querySelectorAll('input[name="exp-bg"], input[name="exp-range"]').forEach(el => {
    el.addEventListener('change', updatePreview);
  });

  document.querySelectorAll('input[name="exp-scale"]').forEach(el => {
    el.addEventListener('change', () => {
       // 倍率変更時は再生成せずにチェックと表示のみ更新
       updateExportDimensions();
       checkExportSizeLimit();
    });
  });
  
  document.getElementById('export-confirm-btn').addEventListener('click', async () => {
    const name = await askFileName(state.projectName || '配置図', '.png');
    if (name === null) return;
    state.projectName = name;
    dom.exportSettingModal.style.display = 'none';
    showToast('画像をダウンロードしています...');
    
    generateExportImage((dataUrl) => {
      const a = document.createElement('a');
      a.download = `${name}.png`;
      a.href = dataUrl;
      a.click();
      showToast('PNG画像をダウンロードしました');
    });
  });
