// ─── Retro Engine Editor v2 ───
// Production-ready tilemap editor with undo/redo, multi-map, pan/zoom,
// layer management, minimap, autosave, keyboard shortcuts, and more.

// ─── STATE ───
const MAX_UNDO = 80;

function createMap(name, cols, rows, tw, th) {
    return {
        name: name || 'Untitled',
        cols, rows,
        tileWidth: tw,
        tileHeight: th,
        layers: [
            { name: 'Layer 0', sheetHandle: 0, tiles: new Array(cols * rows).fill(0), fixed: false, visible: true, opacity: 1 }
        ]
    };
}

const state = {
    tool: 'draw',
    selectedTile: 1,
    currentLayer: 0,
    zoom: 3,
    showGrid: true,
    sheets: [],
    activeSheet: -1,
    maps: [createMap('Untitled', 40, 30, 8, 8)],
    activeMap: 0,
    panX: 0,
    panY: 0,
    // Undo/redo per map
    undoStacks: [[]],
    redoStacks: [[]],
    // Rect tool
    rectStart: null,
};

function curMap() { return state.maps[state.activeMap]; }
function curLayer() { return curMap().layers[state.currentLayer]; }
function undoStack() { return state.undoStacks[state.activeMap]; }
function redoStack() { return state.redoStacks[state.activeMap]; }

// ─── UI REFS ───
const $ = (id) => document.getElementById(id);
const UI = {
    mapTabs: $('map-tabs'),
    pickerCanvas: $('picker-canvas'),
    pickerHighlight: $('picker-highlight'),
    mapCanvas: $('map-canvas'),
    ghostCanvas: $('ghost-canvas'),
    minimapCanvas: $('minimap-canvas'),
    canvasArea: $('canvas-area'),
    sheetList: $('sheet-list'),
    layerUl: $('layer-ul'),
    fileImport: $('file-import'),
    fileOpen: $('file-open'),
    tilePreview: $('tile-preview'),
    tileIdLabel: $('tile-id-label'),
    tileSheetLabel: $('tile-sheet-label'),
    inpName: $('inp-name'),
    inpCols: $('inp-cols'),
    inpRows: $('inp-rows'),
    inpTw: $('inp-tw'),
    inpTh: $('inp-th'),
    inpZoom: $('inp-zoom'),
    zoomLabel: $('zoom-label'),
    inpLayerOpacity: $('inp-layer-opacity'),
    statTool: $('stat-tool'),
    statTile: $('stat-tile'),
    statPos: $('stat-pos'),
    statSize: $('stat-size'),
    statUndo: $('stat-undo'),
    toastContainer: $('toast-container'),
    shortcutsOverlay: $('shortcuts-overlay'),
    modalNewMap: $('modal-new-map'),
};

const mapCtx = UI.mapCanvas.getContext('2d');
const ghostCtx = UI.ghostCanvas.getContext('2d');
const pickerCtx = UI.pickerCanvas.getContext('2d');
const minimapCtx = UI.minimapCanvas.getContext('2d');
const tilePreviewCtx = UI.tilePreview.getContext('2d');

// ─── TOAST ───
function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    UI.toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

// ─── UNDO / REDO ───
function pushUndo() {
    const m = curMap();
    const snapshot = m.layers.map(l => ({ ...l, tiles: [...l.tiles] }));
    undoStack().push(snapshot);
    if (undoStack().length > MAX_UNDO) undoStack().shift();
    state.redoStacks[state.activeMap] = [];
    updateUndoStat();
}

function undo() {
    const stack = undoStack();
    if (stack.length === 0) return;
    const m = curMap();
    const current = m.layers.map(l => ({ ...l, tiles: [...l.tiles] }));
    redoStack().push(current);
    m.layers = stack.pop();
    renderAll();
    toast('Undo');
}

function redo() {
    const stack = redoStack();
    if (stack.length === 0) return;
    const m = curMap();
    const current = m.layers.map(l => ({ ...l, tiles: [...l.tiles] }));
    undoStack().push(current);
    m.layers = stack.pop();
    renderAll();
    toast('Redo');
}

function updateUndoStat() {
    UI.statUndo.textContent = `History: ${undoStack().length}`;
}

// ─── MAP TABS ───
function renderMapTabs() {
    UI.mapTabs.innerHTML = '';
    state.maps.forEach((m, i) => {
        const tab = document.createElement('button');
        tab.className = 'map-tab' + (i === state.activeMap ? ' active' : '');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = m.name;
        tab.appendChild(nameSpan);
        if (state.maps.length > 1) {
            const close = document.createElement('span');
            close.className = 'close-tab';
            close.textContent = '✕';
            close.onclick = (e) => { e.stopPropagation(); closeMap(i); };
            tab.appendChild(close);
        }
        tab.onclick = () => switchMap(i);
        UI.mapTabs.appendChild(tab);
    });
}

function switchMap(idx) {
    state.activeMap = idx;
    state.currentLayer = 0;
    state.panX = 0;
    state.panY = 0;
    syncPropsFromMap();
    renderAll();
}

function closeMap(idx) {
    if (state.maps.length <= 1) return;
    state.maps.splice(idx, 1);
    state.undoStacks.splice(idx, 1);
    state.redoStacks.splice(idx, 1);
    if (state.activeMap >= state.maps.length) state.activeMap = state.maps.length - 1;
    switchMap(state.activeMap);
}

function addNewMap(name, cols, rows, tw, th) {
    state.maps.push(createMap(name, cols, rows, tw, th));
    state.undoStacks.push([]);
    state.redoStacks.push([]);
    switchMap(state.maps.length - 1);
    toast('Map created: ' + name, 'success');
}

// ─── NEW MAP MODAL ───
function openNewMapModal() {
    UI.modalNewMap.classList.add('open');
    $('nm-name').value = 'Map ' + state.maps.length;
    $('nm-preset').value = 'custom';
}

function closeNewMapModal() {
    UI.modalNewMap.classList.remove('open');
}

// ─── SYNC PROPS ───
function syncPropsFromMap() {
    const m = curMap();
    UI.inpName.value = m.name;
    UI.inpCols.value = m.cols;
    UI.inpRows.value = m.rows;
    UI.inpTw.value = m.tileWidth;
    UI.inpTh.value = m.tileHeight;
    UI.statSize.textContent = `${m.cols}×${m.rows}`;
    updateUndoStat();
}

// ─── TOOL SWITCHING ───
const TOOL_ICONS = { draw: '✏️', erase: '🧹', fill: '🪣', pick: '🔬', rect: '▭' };
function setTool(t) {
    state.tool = t;
    state.rectStart = null;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b =>
        b.classList.toggle('active', b.dataset.tool === t)
    );
    UI.statTool.textContent = `${TOOL_ICONS[t] || ''} ${t[0].toUpperCase() + t.slice(1)}`;
}

// ─── SHEET IMPORT ───
function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        const handle = state.sheets.length;
        state.sheets.push({ name: file.name, handle, imgElement: img });
        state.activeSheet = handle;
        if (state.sheets.length === 1) {
            curMap().layers.forEach(l => { if (l.sheetHandle === 0) l.sheetHandle = handle; });
        }
        renderSheets();
        renderPicker();
        updatePickerHighlight();
        renderAll();
        toast('Sheet imported: ' + file.name, 'success');
    };
    img.src = url;
}

// ─── OPEN JSON ───
function handleOpen(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (!data.cols || !data.rows || !data.layers) throw new Error('Invalid format');
            // Hydrate visibility/opacity defaults
            data.layers.forEach(l => {
                if (l.visible === undefined) l.visible = true;
                if (l.opacity === undefined) l.opacity = 1;
            });
            data.name = data.name || file.name.replace('.json', '');
            state.maps.push(data);
            state.undoStacks.push([]);
            state.redoStacks.push([]);
            switchMap(state.maps.length - 1);
            toast('Opened: ' + data.name, 'success');
        } catch (err) {
            toast('Failed to parse JSON: ' + err.message, 'warn');
        }
    };
    reader.readAsText(file);
}

// ─── EXPORT ───
function handleExport() {
    const m = curMap();
    const exportData = {
        name: m.name,
        cols: m.cols,
        rows: m.rows,
        tile_width: m.tileWidth,
        tile_height: m.tileHeight,
        layers: m.layers.map(l => ({
            name: l.name,
            sheet_handle: l.sheetHandle,
            tiles: l.tiles,
            fixed: l.fixed,
        }))
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (m.name || 'tilemap').replace(/\s+/g, '_').toLowerCase() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported: ' + a.download, 'success');
}

// ─── MAP PROPS UPDATE ───
function updateMapProps() {
    const m = curMap();
    const newCols = Math.max(1, parseInt(UI.inpCols.value) || 1);
    const newRows = Math.max(1, parseInt(UI.inpRows.value) || 1);
    const newTw = Math.max(1, parseInt(UI.inpTw.value) || 1);
    const newTh = Math.max(1, parseInt(UI.inpTh.value) || 1);

    pushUndo();

    m.layers.forEach(l => {
        const newTiles = new Array(newCols * newRows).fill(0);
        for (let r = 0; r < Math.min(m.rows, newRows); r++) {
            for (let c = 0; c < Math.min(m.cols, newCols); c++) {
                newTiles[r * newCols + c] = l.tiles[r * m.cols + c];
            }
        }
        l.tiles = newTiles;
    });

    m.cols = newCols;
    m.rows = newRows;
    m.tileWidth = newTw;
    m.tileHeight = newTh;
    m.name = UI.inpName.value || 'Untitled';
    UI.statSize.textContent = `${m.cols}×${m.rows}`;
    renderAll();
}

// ─── RENDERING ───
function resizeMapCanvas() {
    const m = curMap();
    const rawW = m.cols * m.tileWidth;
    const rawH = m.rows * m.tileHeight;
    UI.mapCanvas.width = rawW;
    UI.mapCanvas.height = rawH;
    UI.ghostCanvas.width = rawW;
    UI.ghostCanvas.height = rawH;
}

function renderMap() {
    const m = curMap();
    const rawW = m.cols * m.tileWidth;
    const rawH = m.rows * m.tileHeight;
    const z = state.zoom;

    UI.mapCanvas.style.width = (rawW * z) + 'px';
    UI.mapCanvas.style.height = (rawH * z) + 'px';
    UI.mapCanvas.style.left = state.panX + 'px';
    UI.mapCanvas.style.top = state.panY + 'px';
    UI.ghostCanvas.style.width = (rawW * z) + 'px';
    UI.ghostCanvas.style.height = (rawH * z) + 'px';
    UI.ghostCanvas.style.left = state.panX + 'px';
    UI.ghostCanvas.style.top = state.panY + 'px';

    mapCtx.imageSmoothingEnabled = false;
    mapCtx.clearRect(0, 0, rawW, rawH);

    // Checkerboard transparency pattern
    const checkSize = Math.max(m.tileWidth, 4);
    for (let y = 0; y < rawH; y += checkSize) {
        for (let x = 0; x < rawW; x += checkSize) {
            const dark = ((x / checkSize + y / checkSize) % 2) === 0;
            mapCtx.fillStyle = dark ? '#111' : '#1a1a1a';
            mapCtx.fillRect(x, y, checkSize, checkSize);
        }
    }

    // Draw layers back to front
    m.layers.forEach(layer => {
        if (!layer.visible) return;
        const sheet = state.sheets.find(s => s.handle === layer.sheetHandle);
        if (!sheet) return;

        const img = sheet.imgElement;
        const shCols = Math.floor(img.width / m.tileWidth);
        if (shCols === 0) return;

        mapCtx.globalAlpha = layer.opacity;

        for (let r = 0; r < m.rows; r++) {
            for (let c = 0; c < m.cols; c++) {
                const tId = layer.tiles[r * m.cols + c];
                if (tId === 0) continue;

                const sIdx = tId - 1;
                const srcX = (sIdx % shCols) * m.tileWidth;
                const srcY = Math.floor(sIdx / shCols) * m.tileHeight;

                mapCtx.drawImage(img, srcX, srcY, m.tileWidth, m.tileHeight,
                    c * m.tileWidth, r * m.tileHeight, m.tileWidth, m.tileHeight);
            }
        }
        mapCtx.globalAlpha = 1;
    });

    // Grid
    if (state.showGrid) {
        mapCtx.strokeStyle = 'rgba(255,255,255,0.08)';
        mapCtx.lineWidth = 1;
        mapCtx.beginPath();
        for (let c = 0; c <= m.cols; c++) {
            mapCtx.moveTo(c * m.tileWidth + 0.5, 0);
            mapCtx.lineTo(c * m.tileWidth + 0.5, rawH);
        }
        for (let r = 0; r <= m.rows; r++) {
            mapCtx.moveTo(0, r * m.tileHeight + 0.5);
            mapCtx.lineTo(rawW, r * m.tileHeight + 0.5);
        }
        mapCtx.stroke();
    }
}

function renderMinimap() {
    const m = curMap();
    const scale = Math.min(150 / (m.cols * m.tileWidth), 100 / (m.rows * m.tileHeight), 1);
    const w = Math.ceil(m.cols * m.tileWidth * scale);
    const h = Math.ceil(m.rows * m.tileHeight * scale);
    UI.minimapCanvas.width = w;
    UI.minimapCanvas.height = h;
    minimapCtx.imageSmoothingEnabled = false;
    minimapCtx.clearRect(0, 0, w, h);
    minimapCtx.drawImage(UI.mapCanvas, 0, 0, w, h);

    // View rect
    const area = UI.canvasArea.getBoundingClientRect();
    const z = state.zoom;
    const vx = (-state.panX / z) * scale;
    const vy = (-state.panY / z) * scale;
    const vw = (area.width / z) * scale;
    const vh = (area.height / z) * scale;
    minimapCtx.strokeStyle = '#b44fff';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(vx, vy, vw, vh);
}

function renderGhost(col, row) {
    const m = curMap();
    ghostCtx.clearRect(0, 0, UI.ghostCanvas.width, UI.ghostCanvas.height);
    if (state.tool !== 'draw' && state.tool !== 'rect') return;
    if (state.activeSheet === -1) return;
    if (col < 0 || col >= m.cols || row < 0 || row >= m.rows) return;

    const sheet = state.sheets[state.activeSheet];
    if (!sheet) return;
    const img = sheet.imgElement;
    const shCols = Math.floor(img.width / m.tileWidth);
    if (shCols === 0) return;

    const sIdx = state.selectedTile - 1;
    const srcX = (sIdx % shCols) * m.tileWidth;
    const srcY = Math.floor(sIdx / shCols) * m.tileHeight;

    ghostCtx.globalAlpha = 0.5;
    ghostCtx.drawImage(img, srcX, srcY, m.tileWidth, m.tileHeight,
        col * m.tileWidth, row * m.tileHeight, m.tileWidth, m.tileHeight);
    ghostCtx.globalAlpha = 1;
}

function renderSheets() {
    UI.sheetList.innerHTML = '';
    state.sheets.forEach((s, idx) => {
        const div = document.createElement('div');
        div.className = 'sheet-item' + (idx === state.activeSheet ? ' active' : '');
        div.innerHTML = `<span class="dot"></span>${s.name}`;
        div.onclick = () => {
            state.activeSheet = idx;
            renderSheets();
            renderPicker();
            updatePickerHighlight();
            updateTilePreview();
        };
        UI.sheetList.appendChild(div);
    });
}

function renderLayers() {
    const m = curMap();
    UI.layerUl.innerHTML = '';
    m.layers.forEach((l, idx) => {
        const li = document.createElement('li');
        li.className = 'layer-item' + (idx === state.currentLayer ? ' active' : '');

        const vis = document.createElement('span');
        vis.className = 'layer-vis' + (l.visible ? '' : ' hidden');
        vis.textContent = l.visible ? '👁' : '🚫';
        vis.onclick = (e) => {
            e.stopPropagation();
            l.visible = !l.visible;
            renderLayers();
            renderMap();
            renderMinimap();
        };

        const name = document.createElement('span');
        name.className = 'layer-name';
        name.textContent = l.name;
        name.ondblclick = (e) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'text';
            input.value = l.name;
            input.style.cssText = 'background:#000;color:#fff;border:1px solid #b44fff;padding:2px 4px;font-family:inherit;font-size:12px;width:100%;border-radius:3px;';
            name.replaceWith(input);
            input.focus();
            input.select();
            const finish = () => {
                l.name = input.value || l.name;
                renderLayers();
            };
            input.onblur = finish;
            input.onkeydown = (ke) => { if (ke.key === 'Enter') input.blur(); };
        };

        const del = document.createElement('span');
        del.textContent = '🗑';
        del.style.cursor = 'pointer';
        del.style.opacity = '0.5';
        del.onclick = (e) => {
            e.stopPropagation();
            if (m.layers.length > 1) {
                pushUndo();
                m.layers.splice(idx, 1);
                state.currentLayer = Math.min(state.currentLayer, m.layers.length - 1);
                renderLayers();
                renderAll();
            }
        };

        li.onclick = () => {
            state.currentLayer = idx;
            if (state.sheets.find(s => s.handle === l.sheetHandle)) {
                state.activeSheet = l.sheetHandle;
            }
            UI.inpLayerOpacity.value = Math.round(l.opacity * 100);
            renderLayers();
            renderSheets();
            renderPicker();
            updatePickerHighlight();
        };

        li.appendChild(vis);
        li.appendChild(name);
        li.appendChild(del);
        UI.layerUl.appendChild(li);
    });
}

function renderPicker() {
    if (state.activeSheet === -1) return;
    const img = state.sheets[state.activeSheet].imgElement;
    UI.pickerCanvas.width = img.width;
    UI.pickerCanvas.height = img.height;
    pickerCtx.imageSmoothingEnabled = false;
    pickerCtx.clearRect(0, 0, img.width, img.height);
    pickerCtx.drawImage(img, 0, 0);
}

function updatePickerHighlight() {
    if (state.activeSheet === -1) {
        UI.pickerHighlight.style.display = 'none';
        return;
    }
    const m = curMap();
    const img = state.sheets[state.activeSheet].imgElement;
    const tw = m.tileWidth;
    const th = m.tileHeight;
    const cols = Math.floor(img.width / tw);
    if (cols === 0) return;

    const idx = state.selectedTile - 1;
    const col = idx % cols;
    const row = Math.floor(idx / cols);

    UI.pickerHighlight.style.display = 'block';
    UI.pickerHighlight.style.width = tw + 'px';
    UI.pickerHighlight.style.height = th + 'px';
    UI.pickerHighlight.style.left = (col * tw) + 'px';
    UI.pickerHighlight.style.top = (row * th) + 'px';
}

function updateTilePreview() {
    tilePreviewCtx.clearRect(0, 0, 32, 32);
    UI.tileIdLabel.textContent = state.selectedTile;

    if (state.activeSheet === -1) {
        UI.tileSheetLabel.textContent = '—';
        return;
    }
    const sheet = state.sheets[state.activeSheet];
    UI.tileSheetLabel.textContent = sheet.name;

    const m = curMap();
    const img = sheet.imgElement;
    const shCols = Math.floor(img.width / m.tileWidth);
    if (shCols === 0) return;
    const sIdx = state.selectedTile - 1;
    const srcX = (sIdx % shCols) * m.tileWidth;
    const srcY = Math.floor(sIdx / shCols) * m.tileHeight;
    tilePreviewCtx.imageSmoothingEnabled = false;
    tilePreviewCtx.drawImage(img, srcX, srcY, m.tileWidth, m.tileHeight, 0, 0, 32, 32);
}

function renderAll() {
    resizeMapCanvas();
    renderMap();
    renderMinimap();
    renderMapTabs();
    renderLayers();
    renderSheets();
    syncPropsFromMap();
    updateTilePreview();
    updateUndoStat();
}

// ─── MOUSE HANDLING ───
let isMouseDown = false;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let spaceHeld = false;
let drawStartedUndo = false;

function getMapCoord(e) {
    const rect = UI.mapCanvas.getBoundingClientRect();
    const z = state.zoom;
    const m = curMap();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return {
        col: Math.floor(x / (m.tileWidth * z)),
        row: Math.floor(y / (m.tileHeight * z))
    };
}

function handleMapMouseDown(e) {
    if (e.button === 1 || spaceHeld) {
        isPanning = true;
        panStart = { x: e.clientX - state.panX, y: e.clientY - state.panY };
        UI.canvasArea.style.cursor = 'grabbing';
        return;
    }
    if (e.button !== 0) return;
    isMouseDown = true;
    drawStartedUndo = false;

    const { col, row } = getMapCoord(e);
    if (state.tool === 'rect') {
        state.rectStart = { col, row };
    } else {
        applyTool(col, row);
    }
}

function handleMapMouseMove(e) {
    if (isPanning) {
        state.panX = e.clientX - panStart.x;
        state.panY = e.clientY - panStart.y;
        renderMap();
        renderMinimap();
        return;
    }

    const { col, row } = getMapCoord(e);
    const m = curMap();
    UI.statPos.textContent = `Col: ${col}  Row: ${row}`;

    renderGhost(col, row);

    if (isMouseDown && state.tool !== 'rect') {
        applyTool(col, row);
    }
}

function handleMapMouseUp(e) {
    if (isPanning) {
        isPanning = false;
        UI.canvasArea.style.cursor = 'crosshair';
        return;
    }

    if (isMouseDown && state.tool === 'rect' && state.rectStart) {
        const { col, row } = getMapCoord(e);
        applyRect(state.rectStart.col, state.rectStart.row, col, row);
        state.rectStart = null;
    }

    isMouseDown = false;
    drawStartedUndo = false;
}

function applyTool(col, row) {
    const m = curMap();
    if (col < 0 || col >= m.cols || row < 0 || row >= m.rows) return;
    const layer = curLayer();
    if (!layer.visible) return;
    const idx = row * m.cols + col;

    if (state.tool === 'draw') {
        if (layer.tiles[idx] !== state.selectedTile) {
            if (!drawStartedUndo) { pushUndo(); drawStartedUndo = true; }
            layer.tiles[idx] = state.selectedTile;
            renderMap();
            renderMinimap();
        }
    } else if (state.tool === 'erase') {
        if (layer.tiles[idx] !== 0) {
            if (!drawStartedUndo) { pushUndo(); drawStartedUndo = true; }
            layer.tiles[idx] = 0;
            renderMap();
            renderMinimap();
        }
    } else if (state.tool === 'pick') {
        if (layer.tiles[idx] !== 0) {
            state.selectedTile = layer.tiles[idx];
            UI.statTile.textContent = `Tile: ${state.selectedTile}`;
            updatePickerHighlight();
            updateTilePreview();
        }
    } else if (state.tool === 'fill') {
        const target = layer.tiles[idx];
        if (target !== state.selectedTile) {
            pushUndo();
            floodFill(layer, col, row, target, state.selectedTile);
            renderMap();
            renderMinimap();
        }
    }
}

function applyRect(c1, r1, c2, r2) {
    const m = curMap();
    const layer = curLayer();
    if (!layer.visible) return;
    const minC = Math.max(0, Math.min(c1, c2));
    const maxC = Math.min(m.cols - 1, Math.max(c1, c2));
    const minR = Math.max(0, Math.min(r1, r2));
    const maxR = Math.min(m.rows - 1, Math.max(r1, r2));

    pushUndo();
    for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
            layer.tiles[r * m.cols + c] = state.selectedTile;
        }
    }
    renderMap();
    renderMinimap();
}

function floodFill(layer, startC, startR, target, replacement) {
    const cols = curMap().cols;
    const rows = curMap().rows;
    const stack = [[startC, startR]];
    const visited = new Set();

    while (stack.length > 0) {
        const [c, r] = stack.pop();
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
        const key = r * cols + c;
        if (visited.has(key)) continue;
        visited.add(key);
        if (layer.tiles[key] !== target) continue;
        layer.tiles[key] = replacement;
        stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
}

// ─── PICKER ───
function handlePickerClick(e) {
    if (state.activeSheet === -1) return;
    const rect = UI.pickerCanvas.getBoundingClientRect();
    const m = curMap();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / m.tileWidth);
    const row = Math.floor(y / m.tileHeight);
    const img = state.sheets[state.activeSheet].imgElement;
    const cols = Math.floor(img.width / m.tileWidth);
    state.selectedTile = row * cols + col + 1;
    UI.statTile.textContent = `Tile: ${state.selectedTile}`;
    updatePickerHighlight();
    updateTilePreview();
}

// ─── LAYER ACTIONS ───
function addLayer() {
    const m = curMap();
    pushUndo();
    m.layers.push({
        name: `Layer ${m.layers.length}`,
        sheetHandle: state.activeSheet !== -1 ? state.sheets[state.activeSheet].handle : 0,
        tiles: new Array(m.cols * m.rows).fill(0),
        fixed: false,
        visible: true,
        opacity: 1,
    });
    state.currentLayer = m.layers.length - 1;
    renderLayers();
    renderAll();
}

function moveLayer(dir) {
    const m = curMap();
    const i = state.currentLayer;
    const j = i + dir;
    if (j < 0 || j >= m.layers.length) return;
    pushUndo();
    [m.layers[i], m.layers[j]] = [m.layers[j], m.layers[i]];
    state.currentLayer = j;
    renderLayers();
    renderMap();
    renderMinimap();
}

// ─── ZOOM ───
function handleWheel(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const newZoom = Math.max(1, Math.min(12, state.zoom + (e.deltaY < 0 ? 1 : -1)));
    if (newZoom !== state.zoom) {
        state.zoom = newZoom;
        UI.inpZoom.value = state.zoom;
        UI.zoomLabel.textContent = state.zoom + 'x';
        renderMap();
        renderMinimap();
    }
}

// ─── AUTOSAVE ───
function autosave() {
    try {
        const data = {
            maps: state.maps,
            activeSheet: state.activeSheet,
            activeMap: state.activeMap,
            zoom: state.zoom,
        };
        localStorage.setItem('retro-editor-autosave', JSON.stringify(data));
    } catch (_) { /* quota or private mode */ }
}

function tryLoadAutosave() {
    try {
        const raw = localStorage.getItem('retro-editor-autosave');
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (data.maps && data.maps.length > 0) {
            // Hydrate visibility/opacity defaults
            data.maps.forEach(m => {
                m.layers.forEach(l => {
                    if (l.visible === undefined) l.visible = true;
                    if (l.opacity === undefined) l.opacity = 1;
                });
            });
            state.maps = data.maps;
            state.activeMap = data.activeMap || 0;
            state.zoom = data.zoom || 3;
            state.undoStacks = data.maps.map(() => []);
            state.redoStacks = data.maps.map(() => []);
            return true;
        }
    } catch (_) { /* ignore */ }
    return false;
}

// ─── KEYBOARD SHORTCUTS ───
function handleKeyDown(e) {
    // Don't intercept when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    if (e.key === ' ') {
        e.preventDefault();
        spaceHeld = true;
        UI.canvasArea.style.cursor = 'grab';
        return;
    }

    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); return; }
        if (e.key === 'y') { e.preventDefault(); redo(); return; }
        if (e.key === 's') { e.preventDefault(); handleExport(); return; }
    }

    const shortcuts = { d: 'draw', e: 'erase', f: 'fill', i: 'pick', r: 'rect' };
    if (shortcuts[e.key]) { setTool(shortcuts[e.key]); return; }
    if (e.key === 'g') {
        state.showGrid = !state.showGrid;
        $('btn-grid').classList.toggle('active', state.showGrid);
        renderMap();
    }
    if (e.key === 'Escape') {
        UI.shortcutsOverlay.classList.remove('open');
        UI.modalNewMap.classList.remove('open');
    }
}

function handleKeyUp(e) {
    if (e.key === ' ') {
        spaceHeld = false;
        UI.canvasArea.style.cursor = 'crosshair';
    }
}

// ─── INIT ───
function init() {
    // Try loading autosave
    const hadAutosave = tryLoadAutosave();
    if (hadAutosave) toast('Restored from autosave', 'success');

    // Wire up events
    $('btn-import').onclick = () => UI.fileImport.click();
    $('btn-import2').onclick = () => UI.fileImport.click();
    UI.fileImport.onchange = handleImport;
    $('btn-open').onclick = () => UI.fileOpen.click();
    UI.fileOpen.onchange = handleOpen;
    $('btn-export').onclick = handleExport;
    $('btn-shortcuts').onclick = () => UI.shortcutsOverlay.classList.add('open');
    $('btn-new-map').onclick = openNewMapModal;
    $('nm-cancel').onclick = closeNewMapModal;
    $('nm-create').onclick = () => {
        addNewMap(
            $('nm-name').value || 'Untitled',
            parseInt($('nm-cols').value) || 40,
            parseInt($('nm-rows').value) || 30,
            parseInt($('nm-tw').value) || 8,
            parseInt($('nm-th').value) || 8
        );
        closeNewMapModal();
    };
    $('nm-preset').onchange = (e) => {
        const presets = {
            gb: [20, 18, 8, 8],
            nes: [32, 30, 8, 8],
            neogeo: [40, 28, 8, 8],
            '16': [20, 15, 16, 16],
        };
        const p = presets[e.target.value];
        if (p) {
            $('nm-cols').value = p[0];
            $('nm-rows').value = p[1];
            $('nm-tw').value = p[2];
            $('nm-th').value = p[3];
        }
    };

    // Tools
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn =>
        btn.onclick = () => setTool(btn.dataset.tool)
    );
    $('btn-grid').onclick = () => {
        state.showGrid = !state.showGrid;
        $('btn-grid').classList.toggle('active', state.showGrid);
        renderMap();
    };
    $('btn-grid').classList.toggle('active', state.showGrid);
    $('btn-undo').onclick = undo;
    $('btn-redo').onclick = redo;

    // Props
    UI.inpCols.onchange = updateMapProps;
    UI.inpRows.onchange = updateMapProps;
    UI.inpTw.onchange = updateMapProps;
    UI.inpTh.onchange = updateMapProps;
    UI.inpName.onchange = () => {
        curMap().name = UI.inpName.value || 'Untitled';
        renderMapTabs();
    };
    UI.inpZoom.oninput = (e) => {
        state.zoom = parseInt(e.target.value);
        UI.zoomLabel.textContent = state.zoom + 'x';
        renderMap();
        renderMinimap();
    };
    UI.inpLayerOpacity.oninput = (e) => {
        const l = curLayer();
        if (l) l.opacity = parseInt(e.target.value) / 100;
        renderMap();
        renderMinimap();
    };

    // Layers
    $('btn-add-layer').onclick = addLayer;
    $('btn-layer-up').onclick = () => moveLayer(-1);
    $('btn-layer-down').onclick = () => moveLayer(1);

    // Picker
    UI.pickerCanvas.onclick = handlePickerClick;

    // Map canvas events
    UI.canvasArea.addEventListener('mousedown', handleMapMouseDown);
    window.addEventListener('mousemove', handleMapMouseMove);
    window.addEventListener('mouseup', handleMapMouseUp);
    UI.canvasArea.addEventListener('wheel', handleWheel, { passive: false });

    // Keyboard
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Context menu disable on canvas
    UI.canvasArea.addEventListener('contextmenu', e => e.preventDefault());

    // Autosave every 10s
    setInterval(autosave, 10000);

    // Center pan
    const area = UI.canvasArea.getBoundingClientRect();
    state.panX = Math.round(area.width / 2 - (curMap().cols * curMap().tileWidth * state.zoom) / 2);
    state.panY = Math.round(area.height / 2 - (curMap().rows * curMap().tileHeight * state.zoom) / 2);

    renderAll();
}

init();
