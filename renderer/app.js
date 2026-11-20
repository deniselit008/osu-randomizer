/**
 * ==========================================================================
 * osu! Randomizer - Frontend Renderer Logic
 * Arquitectura modular y segura con IPC Bridge, sin dependencias externas
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Estado local de la aplicación
  let currentBeatmap = null;
  let downloadedFilePath = null;
  let isSearching = false;
  let isDownloading = false;
  let activeTab = 'history'; // 'history' | 'favorites'

  let appData = {
    settings: {
      downloadPath: '',
      volume: 0.65,
      chaosMode: true,
      filters: {
        mode: 'all',
        status: 'all',
        minStars: 0,
        maxStars: 10
      }
    },
    history: [],
    favorites: []
  };

  // Referencias al DOM
  const btnRandom = document.getElementById('btnRandom');
  const toggleChaos = document.getElementById('toggleChaos');
  const filtersSection = document.getElementById('filtersSection');
  const modeChips = document.querySelectorAll('.mode-chips .chip');
  const filterMinStars = document.getElementById('filterMinStars');
  const filterMaxStars = document.getElementById('filterMaxStars');
  const minStarsVal = document.getElementById('minStarsVal');
  const maxStarsVal = document.getElementById('maxStarsVal');
  const starRatingDisplay = document.getElementById('starRatingDisplay');
  const filterStatus = document.getElementById('filterStatus');

  const currentDownloadPath = document.getElementById('currentDownloadPath');
  const btnChangeFolder = document.getElementById('btnChangeFolder');
  const btnResetFolder = document.getElementById('btnResetFolder');

  const tabHistory = document.getElementById('tabHistory');
  const tabFavorites = document.getElementById('tabFavorites');
  const historyCount = document.getElementById('historyCount');
  const favoritesCount = document.getElementById('favoritesCount');
  const librarySearch = document.getElementById('librarySearch');
  const libraryList = document.getElementById('libraryList');

  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');
  const loadingText = document.getElementById('loadingText');
  const beatmapCard = document.getElementById('beatmapCard');

  const cardCoverImg = document.getElementById('cardCoverImg');
  const btnToggleFavorite = document.getElementById('btnToggleFavorite');
  const favIcon = document.getElementById('favIcon');
  const btnOpenWeb = document.getElementById('btnOpenWeb');
  const mapStatusBadge = document.getElementById('mapStatusBadge');
  const mapSetIdBadge = document.getElementById('mapSetIdBadge');
  const mapTitle = document.getElementById('mapTitle');
  const mapArtist = document.getElementById('mapArtist');
  const mapCreator = document.getElementById('mapCreator');

  const mapDuration = document.getElementById('mapDuration');
  const mapBpm = document.getElementById('mapBpm');
  const mapAvgStars = document.getElementById('mapAvgStars');
  const mapDiffCount = document.getElementById('mapDiffCount');

  const previewAudio = document.getElementById('previewAudio');
  const btnAudioPlay = document.getElementById('btnAudioPlay');
  const playIcon = document.getElementById('playIcon');
  const equalizerBars = document.getElementById('equalizerBars');
  const audioCurrentTime = document.getElementById('audioCurrentTime');
  const audioTotalTime = document.getElementById('audioTotalTime');
  const audioSeekbar = document.getElementById('audioSeekbar');
  const volumeIcon = document.getElementById('volumeIcon');
  const audioVolume = document.getElementById('audioVolume');

  const diffsList = document.getElementById('diffsList');

  const btnDownload = document.getElementById('btnDownload');
  const downloadBtnText = document.getElementById('downloadBtnText');
  const btnOpenInOsu = document.getElementById('btnOpenInOsu');
  const downloadProgressContainer = document.getElementById('downloadProgressContainer');
  const downloadProgressBar = document.getElementById('downloadProgressBar');
  const downloadStatusText = document.getElementById('downloadStatusText');
  const downloadPercentText = document.getElementById('downloadPercentText');

  const toastContainer = document.getElementById('toastContainer');
  const mirrorStatusText = document.getElementById('mirrorStatusText');

  // ==========================================================================
  // Inicialización y Carga de Preferencias Persistentes
  // ==========================================================================
  async function init() {
    try {
      const stored = await window.electronAPI.getStoreData();
      if (stored) {
        appData = stored;
      }

      // Sincronizar ruta de descarga
      if (!appData.settings.downloadPath) {
        appData.settings.downloadPath = await window.electronAPI.getDefaultFolder();
      }
      currentDownloadPath.textContent = appData.settings.downloadPath;

      // Sincronizar volumen
      const vol = typeof appData.settings.volume === 'number' ? appData.settings.volume : 0.65;
      previewAudio.volume = vol;
      audioVolume.value = vol;

      // Sincronizar interruptor de modo Caos
      const isChaos = appData.settings.chaosMode !== undefined ? appData.settings.chaosMode : true;
      toggleChaos.checked = isChaos;
      updateChaosVisibility(isChaos);

      // Sincronizar filtros
      if (appData.settings.filters) {
        const { mode, status, minStars, maxStars } = appData.settings.filters;
        if (mode !== undefined) {
          modeChips.forEach(chip => {
            chip.classList.toggle('active', chip.dataset.mode === String(mode));
          });
        }
        if (status !== undefined) {
          filterStatus.value = String(status);
        }
        if (minStars !== undefined) {
          filterMinStars.value = minStars;
        }
        if (maxStars !== undefined) {
          filterMaxStars.value = maxStars;
        }
        updateStarRangeDisplay();
      }

      // Actualizar contadores y biblioteca
      updateLibraryCounters();
      renderLibrary();

      // Configurar escucha de eventos de descarga IPC
      window.electronAPI.onDownloadProgress(handleDownloadProgressEvent);

    } catch (err) {
      console.error('Error durante la inicialización:', err);
      showToast('Error al cargar la configuración inicial.', 'error');
    }
  }

  // ==========================================================================
  // Sistema de Notificaciones Toast
  // ==========================================================================
  function showToast(message, type = 'info', duration = 3200) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, duration);
  }

  // ==========================================================================
  // Manejo de Interfaz de Filtros y Caos
  // ==========================================================================
  function updateChaosVisibility(isChaos) {
    if (isChaos) {
      filtersSection.classList.add('collapsed');
    } else {
      filtersSection.classList.remove('collapsed');
    }
  }

  toggleChaos.addEventListener('change', () => {
    const isChaos = toggleChaos.checked;
    updateChaosVisibility(isChaos);
    appData.settings.chaosMode = isChaos;
    persistAppData();
    showToast(isChaos ? 'Modo 100% Aleatorio Activado' : 'Filtros Opcionales Activados', 'info', 1800);
  });

  modeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      modeChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      appData.settings.filters.mode = chip.dataset.mode;
      persistAppData();
    });
  });

  function updateStarRangeDisplay() {
    let min = parseFloat(filterMinStars.value);
    let max = parseFloat(filterMaxStars.value);

    if (min > max) {
      min = max;
      filterMinStars.value = min;
    }

    minStarsVal.textContent = `${min.toFixed(1)}★`;
    maxStarsVal.textContent = `${max.toFixed(1)}★`;
    starRatingDisplay.textContent = `${min.toFixed(1)}★ - ${max.toFixed(1)}★`;

    appData.settings.filters.minStars = min;
    appData.settings.filters.maxStars = max;
  }

  filterMinStars.addEventListener('input', () => {
    updateStarRangeDisplay();
    persistAppData();
  });

  filterMaxStars.addEventListener('input', () => {
    updateStarRangeDisplay();
    persistAppData();
  });

  filterStatus.addEventListener('change', () => {
    appData.settings.filters.status = filterStatus.value;
    persistAppData();
  });

  // Guardar datos en disco
  async function persistAppData() {
    try {
      await window.electronAPI.saveStoreData(appData);
    } catch (err) {
      console.error('Error al persistir appData:', err);
    }
  }

  // ==========================================================================
  // Configuración de Carpetas
  // ==========================================================================
  btnChangeFolder.addEventListener('click', async () => {
    const selected = await window.electronAPI.selectFolder();
    if (selected) {
      appData.settings.downloadPath = selected;
      currentDownloadPath.textContent = selected;
      await persistAppData();
      showToast('Carpeta de descarga actualizada con éxito.', 'success');
      checkCurrentBeatmapDownloadStatus();
    }
  });

  btnResetFolder.addEventListener('click', async () => {
    const defaultFolder = await window.electronAPI.getDefaultFolder();
    appData.settings.downloadPath = defaultFolder;
    currentDownloadPath.textContent = defaultFolder;
    await persistAppData();
    showToast('Carpeta restablecida a la predeterminada.', 'info');
    checkCurrentBeatmapDownloadStatus();
  });

  currentDownloadPath.addEventListener('click', () => {
    btnChangeFolder.click();
  });

  // ==========================================================================
  // Motor de Aleatoriedad y Búsqueda de Beatmaps
  // ==========================================================================
  async function generateRandomBeatmap() {
    if (isSearching) return;
    isSearching = true;

    btnRandom.disabled = true;
    btnRandom.classList.add('loading');
    btnRandom.querySelector('.btn-text').textContent = 'Buscando...';

    emptyState.classList.add('hidden');
    beatmapCard.classList.add('hidden');
    loadingState.classList.remove('hidden');

    const chaos = toggleChaos.checked;
    loadingText.textContent = chaos
      ? 'Buscando en el catálogo sin filtros...'
      : 'Buscando beatmap con tus filtros...';

    // Detener audio previo de inmediato
    resetAudioPlayer();

    try {
      const activeMode = document.querySelector('.mode-chips .chip.active')?.dataset.mode || 'all';
      const response = await window.electronAPI.getRandomBeatmap({
        chaosMode: chaos,
        filters: {
          mode: activeMode,
          status: filterStatus.value,
          minStars: parseFloat(filterMinStars.value) || 0,
          maxStars: parseFloat(filterMaxStars.value) || 10
        }
      });

      if (!response.success || !response.beatmapset) {
        throw new Error(response.error || 'No se obtuvieron resultados tras varios intentos.');
      }

      const map = response.beatmapset;
      mirrorStatusText.textContent = `Mirror: ${response.mirror || 'Catboy'}`;

      // Registrar en historial (máx 50)
      addToHistory(map);

      // Renderizar el beatmap
      renderBeatmap(map);

    } catch (err) {
      console.error('Error al generar beatmap aleatorio:', err);
      showToast(`Error al buscar: ${err.message}`, 'error', 4500);
      loadingState.classList.add('hidden');
      if (currentBeatmap) {
        beatmapCard.classList.remove('hidden');
      } else {
        emptyState.classList.remove('hidden');
      }
    } finally {
      isSearching = false;
      btnRandom.disabled = false;
      btnRandom.classList.remove('loading');
      btnRandom.querySelector('.btn-text').textContent = 'Mapa Aleatorio';
    }
  }

  btnRandom.addEventListener('click', generateRandomBeatmap);

  // ==========================================================================
  // Renderizado del Beatmap en Pantalla
  // ==========================================================================
  function renderBeatmap(beatmapset) {
    currentBeatmap = beatmapset;
    downloadedFilePath = null;

    loadingState.classList.add('hidden');
    emptyState.classList.add('hidden');
    beatmapCard.classList.remove('hidden');

    // Portada con fallback
    const coverUrl = `https://assets.ppy.sh/beatmaps/${beatmapset.id}/covers/cover.jpg`;
    cardCoverImg.onerror = () => {
      // Degenerar a fallback con degradado sutil
      cardCoverImg.src = 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><rect width="800" height="400" fill="%2324222A"/><text x="50%" y="50%" fill="%23FF66AA" font-family="sans-serif" font-size="28" font-weight="bold" text-anchor="middle">osu! Beatmap Cover</text></svg>';
    };
    cardCoverImg.src = coverUrl;

    // Título, artista y mapper
    mapTitle.textContent = beatmapset.title || 'Sin Título';
    mapArtist.textContent = beatmapset.artist || 'Artista Desconocido';
    mapCreator.textContent = beatmapset.creator || 'Desconocido';

    // Set ID y Estado
    mapSetIdBadge.textContent = `Set #${beatmapset.id}`;
    applyStatusBadge(beatmapset);

    // BPM
    const bpmVal = Math.round(beatmapset.bpm || 0);
    mapBpm.textContent = bpmVal > 0 ? bpmVal : 'Variable';

    // Dificultades ordenadas por estrellas
    const diffs = Array.isArray(beatmapset.beatmaps) ? [...beatmapset.beatmaps] : [];
    diffs.sort((a, b) => (a.difficulty_rating || 0) - (b.difficulty_rating || 0));

    // Duración máxima entre dificultades
    let maxDurationSec = 0;
    let starSum = 0;

    diffs.forEach(d => {
      const len = d.total_length || d.hit_length || 0;
      if (len > maxDurationSec) maxDurationSec = len;
      starSum += (d.difficulty_rating || 0);
    });

    mapDuration.textContent = formatDuration(maxDurationSec);
    mapDiffCount.textContent = diffs.length;

    const avgStars = diffs.length > 0 ? (starSum / diffs.length).toFixed(2) : '0.00';
    mapAvgStars.textContent = `${avgStars}★`;

    // Renderizar chips de dificultades
    renderDifficultiesList(diffs);

    // Sincronizar estado de favoritos
    updateFavoriteButtonState();

    // Comprobar si ya está descargado en disco
    checkCurrentBeatmapDownloadStatus();

    // Cargar nuevo preview de audio
    setupAudioPreview(beatmapset.id);
  }

  function applyStatusBadge(beatmapset) {
    const rawStatus = (beatmapset.status || '').toLowerCase();
    mapStatusBadge.className = 'status-pill';

    if (rawStatus === 'ranked' || rawStatus === 'approved') {
      mapStatusBadge.textContent = 'Ranked';
      mapStatusBadge.classList.add('ranked');
    } else if (rawStatus === 'loved') {
      mapStatusBadge.textContent = 'Loved';
      mapStatusBadge.classList.add('loved');
    } else if (rawStatus === 'qualified') {
      mapStatusBadge.textContent = 'Qualified';
      mapStatusBadge.classList.add('qualified');
    } else {
      mapStatusBadge.textContent = rawStatus ? rawStatus.toUpperCase() : 'UNRANKED';
      mapStatusBadge.classList.add('unranked');
    }
  }

  function formatDuration(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // ==========================================================================
  // Renderizado del Listado de Dificultades
  // ==========================================================================
  function renderDifficultiesList(diffs) {
    diffsList.innerHTML = '';

    if (diffs.length === 0) {
      diffsList.innerHTML = '<p class="library-empty-msg">No se encontraron dificultades individuales.</p>';
      return;
    }

    const modeLabels = ['osu!', 'taiko', 'catch', 'mania'];

    diffs.forEach(diff => {
      const card = document.createElement('div');
      card.className = 'diff-card';

      const modeIndex = typeof diff.mode_int === 'number' ? diff.mode_int : 0;
      const modeName = modeLabels[modeIndex] || 'osu!';
      const stars = typeof diff.difficulty_rating === 'number' ? diff.difficulty_rating : 0;
      const starClass = getStarRatingClass(stars);

      card.innerHTML = `
        <div class="diff-left">
          <span class="diff-mode-badge">${modeName}</span>
          <span class="diff-name" title="${escapeHtml(diff.version || 'Normal')}">${escapeHtml(diff.version || 'Normal')}</span>
        </div>
        <span class="star-badge ${starClass}">
          ${stars.toFixed(2)} ★
        </span>
      `;

      diffsList.appendChild(card);
    });
  }

  function getStarRatingClass(stars) {
    if (stars < 2.0) return 'star-easy';
    if (stars < 2.7) return 'star-normal';
    if (stars < 4.0) return 'star-hard';
    if (stars < 5.3) return 'star-insane';
    if (stars < 6.5) return 'star-expert';
    return 'star-master';
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================================================
  // Reproductor de Audio Preview Integrado
  // ==========================================================================
  function setupAudioPreview(beatmapsetId) {
    resetAudioPlayer();

    const previewUrl = `https://b.ppy.sh/preview/${beatmapsetId}.mp3`;
    previewAudio.src = previewUrl;
    previewAudio.load();
  }

  function resetAudioPlayer() {
    previewAudio.pause();
    previewAudio.currentTime = 0;
    previewAudio.removeAttribute('src');

    btnAudioPlay.classList.remove('playing');
    playIcon.textContent = '▶';
    equalizerBars.classList.remove('active');
    audioSeekbar.value = 0;
    audioCurrentTime.textContent = '0:00';
    audioTotalTime.textContent = '0:30';
  }

  function toggleAudioPreview() {
    if (!currentBeatmap || !previewAudio.src) return;

    if (previewAudio.paused) {
      previewAudio.play().then(() => {
        btnAudioPlay.classList.add('playing');
        playIcon.textContent = '⏸';
        equalizerBars.classList.add('active');
      }).catch(err => {
        console.warn('No se pudo reproducir el preview de audio:', err);
        showToast('Preview de audio no disponible para este beatmap.', 'info');
      });
    } else {
      previewAudio.pause();
      btnAudioPlay.classList.remove('playing');
      playIcon.textContent = '▶';
      equalizerBars.classList.remove('active');
    }
  }

  btnAudioPlay.addEventListener('click', toggleAudioPreview);

  previewAudio.addEventListener('timeupdate', () => {
    if (!isNaN(previewAudio.duration) && previewAudio.duration > 0) {
      const progress = (previewAudio.currentTime / previewAudio.duration) * 100;
      audioSeekbar.value = progress;
      audioCurrentTime.textContent = formatDuration(Math.floor(previewAudio.currentTime));
      audioTotalTime.textContent = formatDuration(Math.floor(previewAudio.duration));
    }
  });

  previewAudio.addEventListener('ended', () => {
    btnAudioPlay.classList.remove('playing');
    playIcon.textContent = '▶';
    equalizerBars.classList.remove('active');
    audioSeekbar.value = 0;
    audioCurrentTime.textContent = '0:00';
  });

  previewAudio.addEventListener('error', () => {
    btnAudioPlay.classList.remove('playing');
    playIcon.textContent = '▶';
    equalizerBars.classList.remove('active');
  });

  audioSeekbar.addEventListener('input', () => {
    if (!isNaN(previewAudio.duration) && previewAudio.duration > 0) {
      const targetTime = (audioSeekbar.value / 100) * previewAudio.duration;
      previewAudio.currentTime = targetTime;
    }
  });

  audioVolume.addEventListener('input', () => {
    const vol = parseFloat(audioVolume.value);
    previewAudio.volume = vol;
    appData.settings.volume = vol;
    persistAppData();
    updateVolumeIcon(vol);
  });

  volumeIcon.addEventListener('click', () => {
    if (previewAudio.volume > 0) {
      previewAudio.volume = 0;
      audioVolume.value = 0;
      updateVolumeIcon(0);
    } else {
      const restored = appData.settings.volume || 0.65;
      previewAudio.volume = restored;
      audioVolume.value = restored;
      updateVolumeIcon(restored);
    }
  });

  function updateVolumeIcon(vol) {
    if (vol === 0) {
      volumeIcon.textContent = '🔇';
    } else if (vol < 0.5) {
      volumeIcon.textContent = '🔉';
    } else {
      volumeIcon.textContent = '🔊';
    }
  }

  // ==========================================================================
  // Descarga e Importación Directa (.osz)
  // ==========================================================================
  async function checkCurrentBeatmapDownloadStatus() {
    if (!currentBeatmap) return;

    try {
      const res = await window.electronAPI.checkBeatmapDownloaded({
        beatmapsetId: currentBeatmap.id,
        artist: currentBeatmap.artist,
        title: currentBeatmap.title,
        downloadFolder: appData.settings.downloadPath
      });

      if (res.exists) {
        downloadedFilePath = res.filePath;
        btnOpenInOsu.classList.remove('hidden');
        downloadBtnText.textContent = 'Volver a Descargar (.osz)';
      } else {
        downloadedFilePath = null;
        btnOpenInOsu.classList.add('hidden');
        downloadBtnText.textContent = 'Descargar Beatmap (.osz)';
      }
    } catch (e) {
      console.warn('Error verificando estado de archivo:', e);
    }
  }

  async function triggerDownload() {
    if (!currentBeatmap || isDownloading) return;
    isDownloading = true;

    btnDownload.disabled = true;
    downloadProgressContainer.classList.remove('hidden');
    downloadProgressBar.style.width = '0%';
    downloadStatusText.textContent = 'Iniciando descarga...';
    downloadPercentText.textContent = '0%';

    try {
      const res = await window.electronAPI.downloadBeatmap({
        beatmapset: currentBeatmap,
        destinationFolder: appData.settings.downloadPath
      });

      if (res.success && res.filePath) {
        downloadedFilePath = res.filePath;
        btnOpenInOsu.classList.remove('hidden');
        downloadBtnText.textContent = 'Volver a Descargar (.osz)';
        showToast('¡Beatmap descargado con éxito!', 'success', 3500);
      } else {
        throw new Error(res.error || 'Error desconocido durante la descarga.');
      }
    } catch (err) {
      console.error('Error al descargar beatmap:', err);
      showToast(`Fallo en la descarga: ${err.message}`, 'error', 4500);
      downloadStatusText.textContent = 'Error al descargar.';
    } finally {
      isDownloading = false;
      btnDownload.disabled = false;
      setTimeout(() => {
        downloadProgressContainer.classList.add('hidden');
      }, 4000);
    }
  }

  btnDownload.addEventListener('click', triggerDownload);

  function handleDownloadProgressEvent(data) {
    if (!currentBeatmap || data.id !== currentBeatmap.id) return;

    if (data.status === 'downloading') {
      downloadProgressBar.style.width = `${data.percent}%`;
      downloadPercentText.textContent = `${data.percent}%`;

      const downloadedMb = (data.downloadedBytes / (1024 * 1024)).toFixed(1);
      const totalMb = data.totalBytes > 0 ? (data.totalBytes / (1024 * 1024)).toFixed(1) : '?';
      downloadStatusText.textContent = `Descargando: ${downloadedMb} MB / ${totalMb} MB`;
    } else if (data.status === 'completed') {
      downloadProgressBar.style.width = '100%';
      downloadPercentText.textContent = '100%';
      downloadStatusText.textContent = '¡Descarga completada y verificada!';
    } else if (data.status === 'error') {
      downloadStatusText.textContent = `Error: ${data.error || 'Error de conexión'}`;
    }
  }

  btnOpenInOsu.addEventListener('click', async () => {
    if (!downloadedFilePath) {
      showToast('No se encontró el archivo local para abrir.', 'error');
      return;
    }

    showToast('Importando beatmap en osu!...', 'info', 2500);
    const res = await window.electronAPI.openInOsu(downloadedFilePath);
    if (!res.success) {
      showToast(`No se pudo abrir en osu!: ${res.error}`, 'error', 4000);
    }
  });

  // Abrir en navegador oficial de osu!
  btnOpenWeb.addEventListener('click', () => {
    if (currentBeatmap && currentBeatmap.id) {
      window.electronAPI.openExternal(`https://osu.ppy.sh/beatmapsets/${currentBeatmap.id}`);
    }
  });

  // ==========================================================================
  // Historial y Favoritos (Persistencia Local)
  // ==========================================================================
  function addToHistory(beatmapset) {
    if (!beatmapset || !beatmapset.id) return;

    // Remover duplicados si ya estaba en el historial
    appData.history = appData.history.filter(item => item.id !== beatmapset.id);

    // Preparar objeto resumen
    const summary = createBeatmapSummary(beatmapset);
    appData.history.unshift(summary);

    // Limitar a los 50 más recientes
    if (appData.history.length > 50) {
      appData.history = appData.history.slice(0, 50);
    }

    persistAppData();
    updateLibraryCounters();
    if (activeTab === 'history') {
      renderLibrary();
    }
  }

  function createBeatmapSummary(set) {
    const diffs = Array.isArray(set.beatmaps) ? set.beatmaps : [];
    let maxStars = 0;
    diffs.forEach(d => {
      if ((d.difficulty_rating || 0) > maxStars) maxStars = d.difficulty_rating;
    });

    return {
      id: set.id,
      title: set.title || 'Sin Título',
      artist: set.artist || 'Desconocido',
      creator: set.creator || 'Desconocido',
      bpm: set.bpm || 0,
      maxStars: maxStars || 0,
      diffsCount: diffs.length,
      coverUrl: `https://assets.ppy.sh/beatmaps/${set.id}/covers/cover.jpg`,
      raw: set // Guardar datos completos para restaurar al hacer clic
    };
  }

  function updateFavoriteButtonState() {
    if (!currentBeatmap) return;
    const isFav = appData.favorites.some(f => f.id === currentBeatmap.id);
    favIcon.textContent = isFav ? '❤️' : '🤍';
    btnToggleFavorite.title = isFav ? 'Quitar de favoritos' : 'Guardar en favoritos';
  }

  btnToggleFavorite.addEventListener('click', () => {
    if (!currentBeatmap) return;

    const existingIndex = appData.favorites.findIndex(f => f.id === currentBeatmap.id);
    if (existingIndex >= 0) {
      appData.favorites.splice(existingIndex, 1);
      showToast('Eliminado de favoritos.', 'info', 2000);
    } else {
      const summary = createBeatmapSummary(currentBeatmap);
      appData.favorites.unshift(summary);
      showToast('¡Añadido a tus favoritos!', 'success', 2000);
    }

    persistAppData();
    updateFavoriteButtonState();
    updateLibraryCounters();
    if (activeTab === 'favorites') {
      renderLibrary();
    }
  });

  tabHistory.addEventListener('click', () => {
    activeTab = 'history';
    tabHistory.classList.add('active');
    tabFavorites.classList.remove('active');
    renderLibrary();
  });

  tabFavorites.addEventListener('click', () => {
    activeTab = 'favorites';
    tabFavorites.classList.add('active');
    tabHistory.classList.remove('active');
    renderLibrary();
  });

  librarySearch.addEventListener('input', () => {
    renderLibrary();
  });

  function updateLibraryCounters() {
    historyCount.textContent = appData.history.length;
    favoritesCount.textContent = appData.favorites.length;
  }

  function renderLibrary() {
    libraryList.innerHTML = '';
    const query = librarySearch.value.trim().toLowerCase();
    const sourceList = activeTab === 'history' ? appData.history : appData.favorites;

    const filtered = sourceList.filter(item => {
      if (!query) return true;
      const title = (item.title || '').toLowerCase();
      const artist = (item.artist || '').toLowerCase();
      const creator = (item.creator || '').toLowerCase();
      return title.includes(query) || artist.includes(query) || creator.includes(query);
    });

    if (filtered.length === 0) {
      const emptyMsg = activeTab === 'history'
        ? (query ? 'Sin resultados para la búsqueda.' : 'El historial está vacío.')
        : (query ? 'Sin favoritos que coincidan.' : 'No tienes favoritos guardados aún.');
      libraryList.innerHTML = `<p class="library-empty-msg">${emptyMsg}</p>`;
      return;
    }

    filtered.forEach(item => {
      const row = document.createElement('div');
      row.className = 'library-item';

      const starsNum = typeof item.maxStars === 'number' ? item.maxStars.toFixed(1) : '0.0';

      row.innerHTML = `
        <img class="item-thumb" src="${item.coverUrl}" alt="thumb" onerror="this.src='data:image/svg+xml;charset=UTF-8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\'><rect width=\\'40\\' height=\\'40\\' fill=\\'%232D2A35\\'/></svg>'">
        <div class="item-info">
          <span class="item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
          <span class="item-artist">${escapeHtml(item.artist)}</span>
          <div class="item-meta-row">
            <span class="item-stars">★ ${starsNum}</span>
            <span style="color: var(--text-muted)">• ${item.diffsCount || 1} diffs</span>
          </div>
        </div>
        <button class="item-remove-btn" title="Eliminar de la lista">✕</button>
      `;

      // Cargar beatmap al hacer clic en el item
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('item-remove-btn')) return;
        if (item.raw) {
          renderBeatmap(item.raw);
          showToast(`Cargado: ${item.title}`, 'info', 1600);
        }
      });

      // Botón de eliminar
      const removeBtn = row.querySelector('.item-remove-btn');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeTab === 'history') {
          appData.history = appData.history.filter(h => h.id !== item.id);
        } else {
          appData.favorites = appData.favorites.filter(f => f.id !== item.id);
          updateFavoriteButtonState();
        }
        persistAppData();
        updateLibraryCounters();
        renderLibrary();
      });

      libraryList.appendChild(row);
    });
  }

  // ==========================================================================
  // Atajos de Teclado Globales en la Ventana
  // ==========================================================================
  window.addEventListener('keydown', (e) => {
    // Ignorar si el usuario está escribiendo en campos de entrada
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
      return;
    }

    const key = e.key;

    // R o Enter: Generar nuevo beatmap aleatorio
    if (key === 'r' || key === 'R' || key === 'Enter') {
      e.preventDefault();
      generateRandomBeatmap();
      return;
    }

    // Espacio: Play / Pause del preview de audio
    if (key === ' ' || key === 'Spacebar') {
      e.preventDefault();
      toggleAudioPreview();
      return;
    }

    // D: Descargar beatmap actual
    if (key === 'd' || key === 'D') {
      e.preventDefault();
      triggerDownload();
      return;
    }
  });

  // Ejecutar arranque
  init();
});
