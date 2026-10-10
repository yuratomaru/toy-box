  /* --------------------------
  // 画像リサイズ・標準化処理
  ---------------------------- */
  // CONFIG.MAX_CANVAS_SIZE (2048px) を基準に画像をリサイズし、オリジナルサイズも同時に返す
  async function resizeImage(dataUrl, targetMax = 2048) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(targetMax / img.width, targetMax / img.height);
        // 元画像がすでに指定サイズ以下の場合は縮小しないが、アスペクト比維持と軽量化のため常にキャンバスを通す
        const w = ratio < 1 ? Math.round(img.width * ratio) : img.width;
        const h = ratio < 1 ? Math.round(img.height * ratio) : img.height;
        
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.85),
          width: w,
          height: h,
          originalWidth: img.width,
          originalHeight: img.height
        });
      };
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
      img.src = dataUrl;
    });
  }

  // 地図画像の読み込みメイン処理
  function loadMapImage(file) {
    if (!file) return;
    const reader = new FileReader();
    
    reader.onload = async function (e) {
      try {
        state.originalMapData = e.target.result;
        
        // 1. 限界突破(長辺8000px超え or 25MB以上)のアップロード拒否ガード
        const imgForCheck = new Image();
        imgForCheck.onload = async () => {
          if (imgForCheck.width > 8000 || imgForCheck.height > 8000 || file.size > 25 * 1024 * 1024) {
            uiAlert('長辺8,000px以内、かつ25MB以下の画像を選択してください。', { title: '画像が大きすぎます' });
            dom.fileInput.value = ''; // リセット
            return;
          }

          // 2. 編集キャンバス用は設定値（デフォルト2048px）に標準化して軽量化
          const targetSize = (typeof CONFIG !== 'undefined' && CONFIG.MAX_CANVAS_SIZE) ? CONFIG.MAX_CANVAS_SIZE : 2048;
          const resized = await resizeImage(state.originalMapData, targetSize);

          state.mapImageData = resized.dataUrl;
          state.originalWidth = resized.originalWidth;
          state.originalHeight = resized.originalHeight;
          state.mapWidth = resized.width;
          state.mapHeight = resized.height;
          
          // DOMへのサイズ・画像反映
          dom.canvasBackground.setAttribute('width', state.mapWidth);
          dom.canvasBackground.setAttribute('height', state.mapHeight);
          dom.mapImage.setAttribute('width', state.mapWidth);
          dom.mapImage.setAttribute('height', state.mapHeight);
          dom.mapImage.setAttribute('href', state.mapImageData);
          
          dom.noImageGuide.classList.add('hidden');
          dom.recoveryBar.classList.add('hidden');
          
          resetView();
          renderAll();
          if (window.resetImageEditHistory) window.resetImageEditHistory();
          showToast('画像を最適化して読み込みました');
        };
        imgForCheck.onerror = () => { showToast('画像として読み込めませんでした（PNG / JPEG / GIF / WebP を選んでください）'); dom.fileInput.value = ''; };
        imgForCheck.src = e.target.result;
        
      } catch (err) {
        console.error("Map load error:", err);
        showToast('画像の読み込みに失敗しました');
      }
    };
    
    reader.onerror = () => {
      showToast('ファイルの読み込みに失敗しました');
    };
    
    reader.readAsDataURL(file);
  }

  /* --------------------------
  // UIイベントリスナー
  ---------------------------- */
  dom.openMapBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.fileInput.click();
  });
  dom.noImageGuide.addEventListener('click', () => dom.fileInput.click());

  dom.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (state.labels.length > 0) {
      const confirmed = await uiConfirm('新しい画像を読み込みます。現在配置されている吹き出しはそのまま残ります。', { title: '画像を読み込み直す', okText: '読み込む' });
      if (!confirmed) {
        dom.fileInput.value = '';
        return;
      }
    }
    loadMapImage(file);
  });

  // ドラッグ＆ドロップ対応
  dom.workspace.addEventListener('dragover', (e) => e.preventDefault());
  dom.workspace.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) loadMapImage(e.dataTransfer.files[0]);
  });

  /* --------------------------
  // プロジェクト保存処理 (.zip)
  ---------------------------- */
  dom.saveProjectBtn.addEventListener('click', async () => {
    if (typeof JSZip === 'undefined') { showToast('ZIPライブラリを読み込めませんでした。ネットワーク接続を確認して再読み込みしてください'); return; }
    const name = await askFileName(state.projectName || '配置図', '.zip');
    if (name === null) return;
    state.projectName = name;
    const zip = new JSZip();
    
    // プロジェクトのメタデータ（※復元用に originalWidth / originalHeight も保存データに含める）
    const meta = {
      projectName: state.projectName,
      groups: state.groups,
      labels: state.labels,
      showLegend: state.showLegend,
      legendX: state.legendX,
      legendY: state.legendY,
      mapWidth: state.mapWidth,
      mapHeight: state.mapHeight,
      originalWidth: state.originalWidth,
      originalHeight: state.originalHeight,
      viewScale: state.viewScale || 1.0,       // 吹き出しサイズを保存
      balloonStyle: state.balloonStyle || 'default' // 吹き出しスタイルを保存
    };
    zip.file("project.json", JSON.stringify(meta));

    // 背景画像は「オリジナル（高画質版）」をZIPに保存する
    const targetMapData = state.originalMapData || state.mapImageData;

    if (targetMapData && targetMapData.startsWith('data:')) {
      const parts = targetMapData.split(',');
      const base64 = parts[1];
      const mime = parts[0].split(';')[0].split(':')[1];
      let ext = 'png';
      if (mime.includes('jpeg')) ext = 'jpg';
      else if (mime.includes('gif')) ext = 'gif';
      zip.file(`map_background.${ext}`, base64, { base64: true });
    }

    const content = await zip.generateAsync({ type: "blob" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `${state.projectName || 'layout_data'}.zip`;
    a.click();
    updateStatus(false);
    showToast('データを.zipとして保存しました');
  });

  /* --------------------------
  // プロジェクト復元処理 (.zip)
  ---------------------------- */
  dom.loadProjectBtn.addEventListener('click', () => dom.projectLoadInput.click());
  dom.projectLoadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (typeof JSZip === 'undefined') { showToast('ZIPライブラリを読み込めませんでした。ネットワーク接続を確認して再読み込みしてください'); return; }

    if (!file.name.endsWith('.zip') && file.type !== 'application/zip') {
      uiAlert('.zip 形式のプロジェクトファイルを選択してください。', { title: 'ファイル形式が違います' });
      dom.projectLoadInput.value = '';
      return;
    }

    if (state.labels.length > 0) { 
      const confirmed = await uiConfirm('現在編集中のデータはすべて上書きされます。必要なら先に「データを保存」してください。', { title: 'データを読み込む', okText: '読み込む', danger: true });
      if (!confirmed) {
        dom.projectLoadInput.value = '';
        return;
      }
    }
    pushHistory(); 

    try {
      const zip = await JSZip.loadAsync(file);
      const jsonFile = zip.file("project.json");
      if (!jsonFile) throw new Error("プロジェクトデータ (project.json) が見つかりませんでした。正しいファイルか確認してください。");

      const jsonStr = await jsonFile.async("string");
      const parsed = sanitizeProject(JSON.parse(jsonStr));

      let bgDataUrl = null;
      const bgFile = zip.file(/map_background\.(png|jpg|jpeg|gif)$/i)[0];
      if (bgFile) {
        const base64 = await bgFile.async("base64");
        let mime = 'image/png';
        if (bgFile.name.endsWith('jpg') || bgFile.name.endsWith('jpeg')) mime = 'image/jpeg';
        if (bgFile.name.endsWith('gif')) mime = 'image/gif';
        bgDataUrl = `data:${mime};base64,${base64}`;
      }

      // データをstateへマージ
      // ZIP読み込み時にリセットすべき状態を先にクリア
      state.historyStack = [];
      state.redoStack = [];
      state.selectedLabelIds = [];

      Object.assign(state, {
        projectName: parsed.projectName || '配置図',
        groups: parsed.groups || state.groups,
        labels: parsed.labels || [],
        showLegend: parsed.showLegend ?? false,
        legendX: parsed.legendX ?? 30,
        legendY: parsed.legendY ?? 30,
        balloonStyle: parsed.balloonStyle || 'default',
        viewScale: parsed.viewScale || 1.0, // 保存時のサイズで復元
        mapWidth: parsed.mapWidth || state.mapWidth,
        mapHeight: parsed.mapHeight || state.mapHeight,
        originalWidth: parsed.originalWidth || state.originalWidth,
        originalHeight: parsed.originalHeight || state.originalHeight,
      });

      if (bgDataUrl) {
        // ZIPに入っていた背景はオリジナル高画質データとして保持
        state.originalMapData = bgDataUrl;

        // 読み込み時にも CONFIG.MAX_CANVAS_SIZE (2048px) を基準に標準化サイズへリサイズしてキャンバスに適用
        const targetSize = (typeof CONFIG !== 'undefined' && CONFIG.MAX_CANVAS_SIZE) ? CONFIG.MAX_CANVAS_SIZE : 2048;
        const resized = await resizeImage(bgDataUrl, targetSize);
        
        state.mapImageData = resized.dataUrl;
        // 座標系(mapWidth/Height)は保存値を優先。画像の解像度とは独立
        state.mapWidth = parsed.mapWidth || resized.width;
        state.mapHeight = parsed.mapHeight || resized.height;
        // もし古い保存データに元サイズがない場合はリサイズ前の値で補完
        state.originalWidth = parsed.originalWidth || resized.originalWidth;
        state.originalHeight = parsed.originalHeight || resized.originalHeight;
        
        dom.mapImage.setAttribute('width', state.mapWidth);
        dom.mapImage.setAttribute('height', state.mapHeight);
        dom.canvasBackground.setAttribute('width', state.mapWidth);
        dom.canvasBackground.setAttribute('height', state.mapHeight);
        dom.mapImage.setAttribute('href', state.mapImageData);
      }
      
      if (bgDataUrl || state.labels.length > 0) {
        dom.noImageGuide.classList.add('hidden');
      } else {
        dom.noImageGuide.classList.remove('hidden');
      }

      dom.recoveryBar.classList.add('hidden');
      resetView();
      syncStateToUI();
      renderAll();
      updateStatus(false);
      if (window.resetImageEditHistory) window.resetImageEditHistory();
      showToast('データを正常に読み込みました');
    } catch (err) {
      uiAlert(err.message, { title: 'データの読み込みに失敗しました' });
    } finally {
      dom.projectLoadInput.value = '';
    }
  });
