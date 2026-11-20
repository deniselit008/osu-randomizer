const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

// Conjunto de IDs mostrados en la sesión para aleatoriedad sin repeticiones
const seenBeatmapsetIds = new Set();

const USER_AGENT = 'osu-randomizer/1.0.0 (https://github.com/electron-osu-randomizer)';

// Archivo de persistencia de datos (historial, favoritos y ajustes)
const STORE_FILE = path.join(app.getPath('userData'), 'osu-randomizer-data.json');

/**
 * Detecta la ruta estándar de osu! Songs según el sistema operativo
 */
function detectDefaultDownloadFolder() {
  const home = os.homedir();
  const candidates = [];

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    candidates.push(path.join(localAppData, 'osu!', 'Songs'));
    candidates.push('C:\\osu!\\Songs');
    candidates.push('D:\\osu!\\Songs');
  } else if (process.platform === 'linux') {
    candidates.push(path.join(home, '.local', 'share', 'osu', 'Songs'));
    candidates.push(path.join(home, '.osu', 'Songs'));
    candidates.push(path.join(home, '.var', 'app', 'sh.ppy.osu', 'data', 'osu', 'Songs'));
  }

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  return app.getPath('downloads');
}

/**
 * Carga los datos almacenados en disco
 */
function loadStoreData() {
  const defaultData = {
    settings: {
      downloadPath: detectDefaultDownloadFolder(),
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

  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        settings: { ...defaultData.settings, ...(parsed.settings || {}) },
        history: Array.isArray(parsed.history) ? parsed.history.slice(0, 50) : [],
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : []
      };
    }
  } catch (err) {
    console.error('Error al leer el archivo de almacenamiento:', err);
  }

  return defaultData;
}

/**
 * Guarda los datos en disco de forma síncrona y segura
 */
function saveStoreData(data) {
  try {
    const payload = {
      settings: data.settings || {},
      history: Array.isArray(data.history) ? data.history.slice(0, 50) : [],
      favorites: Array.isArray(data.favorites) ? data.favorites : []
    };
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error al guardar datos:', err);
    return false;
  }
}

/**
 * Limpia nombres de archivo para compatibilidad en Windows y Linux
 */
function sanitizeFilename(name) {
  return (name || 'beatmap')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .trim()
    .slice(0, 90);
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    title: 'osu! Randomizer',
    backgroundColor: '#18171C',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Manejar apertura de enlaces externos
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// -------------------------------------------------------------
// Registro de Canales IPC
// -------------------------------------------------------------

// Obtener datos iniciales
ipcMain.handle('get-store-data', async () => {
  return loadStoreData();
});

// Guardar datos
ipcMain.handle('save-store-data', async (event, data) => {
  return saveStoreData(data);
});

// Selector nativo de directorio para descargas
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar carpeta de descarga (osu! Songs o Descargas)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// Obtener carpeta por defecto del sistema
ipcMain.handle('get-default-folder', () => {
  return detectDefaultDownloadFolder();
});

// Abrir archivo .osz en osu! o launcher predeterminado
ipcMain.handle('open-in-osu', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'El archivo no existe en el disco.' };
    }
    const result = await shell.openPath(filePath);
    if (result) {
      // Si shell.openPath devuelve un string, es un mensaje de error
      return { success: false, error: result };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Abrir enlaces externos en el navegador web
ipcMain.handle('open-external', async (event, url) => {
  try {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'URL no válida.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Comprobar si un beatmap ya está descargado en la carpeta de destino
ipcMain.handle('check-beatmap-downloaded', async (event, { beatmapsetId, artist, title, downloadFolder }) => {
  try {
    const folder = downloadFolder || detectDefaultDownloadFolder();
    const safeArtist = sanitizeFilename(artist);
    const safeTitle = sanitizeFilename(title);
    const fileName = `${beatmapsetId} ${safeArtist} - ${safeTitle}.osz`;
    const fullPath = path.join(folder, fileName);

    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      if (stats.size > 1024) {
        return { exists: true, filePath: fullPath };
      }
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
});

/**
 * Consulta un mirror con timeout
 */
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Algoritmo de Aleatoriedad Real con Reintentos y Fallback
ipcMain.handle('get-random-beatmap', async (event, { chaosMode = true, filters = {} }) => {
  const maxRetries = 5;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 1. Probar API Principal: Catboy
      let url = 'https://catboy.best/api/v2/search?';
      const params = new URLSearchParams();

      if (chaosMode) {
        // En modo Caos, generar un offset aleatorio amplio (hasta 120,000)
        const randomOffset = Math.floor(Math.random() * 120000);
        params.append('offset', String(randomOffset));
      } else {
        // En modo con filtros, buscar dentro de un rango más concentrado
        const randomOffset = Math.floor(Math.random() * 4000);
        params.append('offset', String(randomOffset));

        if (filters.mode !== undefined && filters.mode !== 'all') {
          params.append('mode', String(filters.mode));
        }
        if (filters.status !== undefined && filters.status !== 'all') {
          params.append('status', String(filters.status));
        }
      }

      url += params.toString();

      let mirrorUsed = 'catboy.best';
      let data = null;

      try {
        const response = await fetchWithTimeout(url, 7000);
        if (response.ok) {
          data = await response.json();
        }
      } catch (catboyErr) {
        // Fallback a Nerinyan si Catboy falla
        mirrorUsed = 'api.nerinyan.moe';
        const fallbackUrl = `https://api.nerinyan.moe/search?q=&page=${Math.floor(Math.random() * 200)}`;
        try {
          const fbRes = await fetchWithTimeout(fallbackUrl, 7000);
          if (fbRes.ok) {
            data = await fbRes.json();
          }
        } catch (fbErr) {
          lastError = fbErr.message;
        }
      }

      if (!Array.isArray(data) || data.length === 0) {
        continue;
      }

      // Filtrar mapas ya mostrados en la sesión
      let candidates = data.filter(item => item && item.id && !seenBeatmapsetIds.has(item.id));

      // Si todos los mapas del batch ya fueron mostrados pero hay elementos,
      // permitimos reutilizar si la sesión ya vio demasiados
      if (candidates.length === 0 && data.length > 0) {
        candidates = data;
      }

      // Aplicar filtros de dificultad en cliente si no es Caos
      if (!chaosMode && candidates.length > 0) {
        const minStars = parseFloat(filters.minStars) || 0;
        const maxStars = parseFloat(filters.maxStars) || 10;
        const filterMode = filters.mode !== undefined && filters.mode !== 'all' ? parseInt(filters.mode, 10) : null;

        candidates = candidates.filter(set => {
          if (!Array.isArray(set.beatmaps) || set.beatmaps.length === 0) return false;
          return set.beatmaps.some(b => {
            const stars = b.difficulty_rating || 0;
            const modeMatches = filterMode === null || b.mode_int === filterMode;
            return modeMatches && stars >= minStars && stars <= maxStars;
          });
        });
      }

      if (candidates.length === 0) {
        continue;
      }

      // Elegir aleatoriamente uno de los candidatos válidos
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      seenBeatmapsetIds.add(chosen.id);

      return {
        success: true,
        beatmapset: chosen,
        attempt,
        mirror: mirrorUsed
      };
    } catch (err) {
      lastError = err.message;
    }
  }

  return {
    success: false,
    error: lastError || 'No se pudieron encontrar beatmaps que coincidan tras 5 intentos.'
  };
});

// Descarga en Stream con cálculo y emisión de progreso
ipcMain.handle('download-beatmap', async (event, { beatmapset, destinationFolder }) => {
  if (!beatmapset || !beatmapset.id) {
    return { success: false, error: 'Información de beatmap inválida.' };
  }

  const folder = destinationFolder || detectDefaultDownloadFolder();
  fs.mkdirSync(folder, { recursive: true });

  const safeArtist = sanitizeFilename(beatmapset.artist);
  const safeTitle = sanitizeFilename(beatmapset.title);
  const fileName = `${beatmapset.id} ${safeArtist} - ${safeTitle}.osz`;
  const filePath = path.join(folder, fileName);

  const downloadUrls = [
    `https://catboy.best/d/${beatmapset.id}`,
    `https://api.nerinyan.moe/d/${beatmapset.id}`
  ];

  let downloadedSuccess = false;
  let finalError = null;

  for (const url of downloadUrls) {
    try {
      event.sender.send('download-progress', {
        id: beatmapset.id,
        percent: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        status: 'starting',
        url
      });

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} en ${url}`);
      }

      const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
      let downloadedBytes = 0;

      const fileWriteStream = fs.createWriteStream(filePath);
      const webStream = Readable.fromWeb(response.body);

      webStream.on('data', chunk => {
        downloadedBytes += chunk.length;
        const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
        event.sender.send('download-progress', {
          id: beatmapset.id,
          percent,
          downloadedBytes,
          totalBytes,
          status: 'downloading'
        });
      });

      await pipeline(webStream, fileWriteStream);

      // Verificar que el archivo no quedó vacío
      const stats = fs.statSync(filePath);
      if (stats.size < 1000) {
        throw new Error('Archivo descargado corrupto o demasiado pequeño.');
      }

      event.sender.send('download-progress', {
        id: beatmapset.id,
        percent: 100,
        downloadedBytes: stats.size,
        totalBytes: stats.size,
        status: 'completed',
        filePath
      });

      downloadedSuccess = true;
      return { success: true, filePath };
    } catch (err) {
      finalError = err.message;
      // Limpiar archivo incompleto en caso de error
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
    }
  }

  event.sender.send('download-progress', {
    id: beatmapset.id,
    percent: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    status: 'error',
    error: finalError
  });

  return { success: false, error: finalError || 'No se pudo descargar el beatmap.' };
});

// Ciclo de vida de la aplicación
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
