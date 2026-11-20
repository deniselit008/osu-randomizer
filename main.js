const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Transform, Readable } = require('stream');
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
 * Verifica si un archivo es un ZIP/OSZ válido y completo comprobando sus firmas PK
 */
function isValidZipFile(filePath, expectedSize = 0) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);
    if (stats.size < 22) return false;
    if (expectedSize > 0 && stats.size !== expectedSize) return false;

    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    // Firma ZIP Local File Header (0x04034b50 -> PK\x03\x04)
    if (header.readUInt32LE(0) !== 0x04034b50) {
      fs.closeSync(fd);
      return false;
    }

    // Firma End of Central Directory (PK\x05\x06) en los últimos bytes
    const tailSize = Math.min(stats.size, 2048);
    const tail = Buffer.alloc(tailSize);
    fs.readSync(fd, tail, 0, tailSize, stats.size - tailSize);
    fs.closeSync(fd);

    return tail.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  } catch {
    return false;
  }
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

ipcMain.handle('get-store-data', async () => {
  return loadStoreData();
});

ipcMain.handle('save-store-data', async (event, data) => {
  return saveStoreData(data);
});

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

ipcMain.handle('get-default-folder', () => {
  return detectDefaultDownloadFolder();
});

ipcMain.handle('open-in-osu', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'El archivo no existe en el disco.' };
    }
    if (!isValidZipFile(filePath)) {
      return { success: false, error: 'El archivo .osz está dañado o incompleto. Vuelve a descargarlo.' };
    }
    const result = await shell.openPath(filePath);
    if (result) {
      return { success: false, error: result };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

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

ipcMain.handle('check-beatmap-downloaded', async (event, { beatmapsetId, artist, title, downloadFolder }) => {
  try {
    const folder = downloadFolder || detectDefaultDownloadFolder();
    const safeArtist = sanitizeFilename(artist);
    const safeTitle = sanitizeFilename(title);
    const fileName = `${beatmapsetId} ${safeArtist} - ${safeTitle}.osz`;
    const fullPath = path.join(folder, fileName);

    // Validar integridad real del archivo antes de considerarlo descargado
    if (isValidZipFile(fullPath)) {
      return { exists: true, filePath: fullPath };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
});

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
      let url = 'https://catboy.best/api/v2/search?';
      const params = new URLSearchParams();

      if (chaosMode) {
        const randomOffset = Math.floor(Math.random() * 120000);
        params.append('offset', String(randomOffset));
      } else {
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

      let candidates = data.filter(item => item && item.id && !seenBeatmapsetIds.has(item.id));

      if (candidates.length === 0 && data.length > 0) {
        candidates = data;
      }

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

// Descarga en Stream con Transform Stream (control estricto de backpressure y archivo temporal atómico)
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
  const tempPath = `${filePath}.downloading`;

  const downloadUrls = [
    `https://catboy.best/d/${beatmapset.id}`,
    `https://api.nerinyan.moe/d/${beatmapset.id}`
  ];

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

      // Transform stream para seguimiento del progreso sin romper backpressure
      const progressTransform = new Transform({
        transform(chunk, encoding, callback) {
          downloadedBytes += chunk.length;
          const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
          event.sender.send('download-progress', {
            id: beatmapset.id,
            percent,
            downloadedBytes,
            totalBytes,
            status: 'downloading'
          });
          callback(null, chunk);
        }
      });

      const fileWriteStream = fs.createWriteStream(tempPath);
      const webStream = Readable.fromWeb(response.body);

      // Pipeline completo y atómico
      await pipeline(webStream, progressTransform, fileWriteStream);

      // Validación estricta de integridad de datos y estructura ZIP
      if (!isValidZipFile(tempPath, totalBytes)) {
        throw new Error('La descarga se completó pero el archivo ZIP está incompleto o dañado.');
      }

      // Reemplazo atómico una vez validado al 100%
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
      fs.renameSync(tempPath, filePath);

      event.sender.send('download-progress', {
        id: beatmapset.id,
        percent: 100,
        downloadedBytes,
        totalBytes,
        status: 'completed',
        filePath
      });

      return { success: true, filePath };
    } catch (err) {
      finalError = err.message;
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
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
