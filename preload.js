const { contextBridge, ipcRenderer } = require('electron');

/**
 * Exposición segura de APIs al proceso Renderer mediante Context Bridge
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Almacenamiento local persistente
  getStoreData: () => ipcRenderer.invoke('get-store-data'),
  saveStoreData: (data) => ipcRenderer.invoke('save-store-data', data),

  // Manejo de carpetas
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getDefaultFolder: () => ipcRenderer.invoke('get-default-folder'),

  // Motor de Beatmaps Aleatorios
  getRandomBeatmap: (options) => ipcRenderer.invoke('get-random-beatmap', options),

  // Descarga y verificación
  downloadBeatmap: (payload) => ipcRenderer.invoke('download-beatmap', payload),
  checkBeatmapDownloaded: (payload) => ipcRenderer.invoke('check-beatmap-downloaded', payload),

  // Escucha de eventos de progreso de descarga
  onDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('download-progress', subscription);
    return () => {
      ipcRenderer.removeListener('download-progress', subscription);
    };
  },

  // Integración con el sistema (osu! launcher y navegador web)
  openInOsu: (filePath) => ipcRenderer.invoke('open-in-osu', filePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
