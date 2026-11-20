# 🎲 osu! Randomizer

> Aplicación de escritorio nativa de alto rendimiento desarrollada con **Electron**, **Node.js** y **Vanilla Web (HTML5/CSS3/ES6+)**, diseñada para descubrir, previsualizar y descargar beatmaps de osu! completamente aleatorios sin necesidad de credenciales ni OAuth.

---

## 🚀 Características Principales

1. **Motor de Aleatoriedad Real sin OAuth:**
   - Consulta el catálogo masivo de mirrors públicos de osu!:
     - **Mirror Principal:** `catboy.best` (`https://catboy.best/api/v2/search`)
     - **Mirror de Respaldo:** `nerinyan.moe` (`https://api.nerinyan.moe/search`)
   - Algoritmo de aleatoriedad con desplazamientos (*offset*) dinámicos, selección al azar dentro de lotes y hasta **5 reintentos automáticos y transparentes**.
   - Control de sesión en memoria (`Set`) para evitar mostrar beatmaps repetidos en la misma ejecución.

2. **Modo Caos vs. Filtros Personalizados:**
   - **100% Aleatorio (Sin filtros)** activado por defecto para descubrimiento total.
   - Panel de filtros opcionales:
     - **Modo de juego:** Todos, osu! standard, osu!taiko, osu!catch, osu!mania.
     - **Rango de Dificultad (Star Rating):** Mínimo y máximo configurables de `0.0★` a `10.0★+`.
     - **Estado del mapa:** Cualquiera, Ranked, Loved, Unranked/Graveyard.

3. **Tarjeta Detallada del Beatmap:**
   - Portada oficial con fallback automático ante errores de carga.
   - Título, artista, mapper, BPM, duración formateada (`mm:ss`) y espectro completo de dificultades con insignias de color según los rangos oficiales de dificultad de osu!.

4. **Reproductor de Preview de Audio Integrado:**
   - Reproducción directa de `https://b.ppy.sh/preview/{beatmapset_id}.mp3`.
   - Controles de Play/Pause, barra de progreso (*seek*) interactiva, visualizador simulado de barras y volumen persistente.
   - Detención y reinicio automático al generar un mapa nuevo.

5. **Descarga e Importación Directa (`.osz`):**
   - Descargas en *stream* con cálculo en tiempo real del progreso porcentual (`0-100%`) y bytes transferidos.
   - Selector nativo de directorio para la carpeta `Songs` de osu! (con autodetección en Windows y Linux).
   - Botón **"Abrir en osu!"** que ejecuta `shell.openPath` para asociar e importar automáticamente el beatmap en osu! stable o osu!lazer.
   - Enlace directo para abrir el set en la web oficial de osu!.

6. **Historial Local y Favoritos (Persistencia JSON sin dependencias externas):**
   - Almacenamiento seguro en `%APPDATA%/osu-randomizer/osu-randomizer-data.json` (Windows) o `~/.config/osu-randomizer/` (Linux).
   - Historial de los últimos 50 beatmaps generados y lista ilimitada de favoritos con búsqueda instantánea.

7. **Atajos de Teclado Globales:**
   - <kbd>R</kbd> o <kbd>Enter</kbd>: Generar un nuevo mapa aleatorio.
   - <kbd>Espacio</kbd>: Reproducir / Pausar el preview de audio.
   - <kbd>D</kbd>: Descargar el beatmap actual en formato `.osz`.

---

## 📁 Estructura del Proyecto

```
Osu Random/
├── package.json          # Configuración de Electron y electron-builder
├── main.js               # Proceso Principal (IPC, streams, persistencia, shell)
├── preload.js            # Context Bridge seguro (contextIsolation: true)
├── assets/
│   └── icon.png          # Icono nativo de la aplicación
├── renderer/
│   ├── index.html        # Estructura panorámica en 2 columnas
│   ├── styles.css        # Tema oscuro inspirado en osu!
│   └── app.js            # Lógica completa del cliente, audio y eventos
└── README.md             # Documentación del proyecto
```

---

## 🛠️ Instalación y Ejecución

### 1. Prerrequisitos
- Node.js LTS (v18, v20 o superior) y npm.

### 2. Instalación de dependencias
```bash
npm install
```

### 3. Ejecución en modo desarrollo
```bash
npm start
```

---

## 📦 Compilación y Empaquetado

### Compilar para Windows (.exe instalador NSIS y Portable)
```bash
npm run build:win
```
*Genera los instaladores en la carpeta `dist/`:*
- `osu! Randomizer Setup 1.0.0.exe` (Instalador con asistente)
- `osu! Randomizer 1.0.0.exe` (Ejecutable portable listo para usar)

### Compilar para Linux (.AppImage y .deb)
```bash
npm run build:linux
```
*Genera los paquetes en la carpeta `dist/`:*
- `osu!-Randomizer-1.0.0.AppImage` (Autoejecutable universal)
- `osu-randomizer_1.0.0_amd64.deb` (Paquete para Debian/Ubuntu)

### Compilar para ambas plataformas
```bash
npm run build:all
```
