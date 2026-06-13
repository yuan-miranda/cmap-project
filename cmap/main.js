const GITHUB_USER = 'yuan-miranda';
const GITHUB_REPO = 'tiles';
const GITHUB_BRANCH = 'main';

const TILE_SIZE = 512;
const RESOLUTION = 131072;
const CENTER = { x: RESOLUTION / 2, y: -RESOLUTION / 2 };
const OFFLINE_THRESHOLD_S = 60;

let map, tileLayer;
let intervalId = null;
let latestSha = '';
let TILE_BASE_URL = '';
let pendingFollowDimensionSwitch = false;

const playerMarkers = {};
let followedPlayer = null;

const edgeIndicatorEls = {};
const EDGE_MARGIN = 32;

const makeIcon = (url, extra = '') => L.icon({
    iconUrl: url,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    className: `map-icon${extra}`
});

const makePlayerIcon = ({ online = true, followed = false } = {}) => makeIcon(
    'images/Player.png',
    `${online ? '' : ' player-offline'}${followed ? ' player-followed' : ''}`
);

const playerIcon = makePlayerIcon();
const playerIconOffline = makePlayerIcon({ online: false });
const playerIconFollowed = makePlayerIcon({ followed: true });
const playerIconOfflineFollowed = makePlayerIcon({ online: false, followed: true });
const compassIcon = makeIcon('images/Compass.png');

function getCurrentDimension() {
    return localStorage.getItem('dimensionType') || 'overworld';
}

function getPlayerIconForEntry(entry, isFollowed = false) {
    if (isFollowed) return entry.online ? playerIconFollowed : playerIconOfflineFollowed;
    return entry.online ? playerIcon : playerIconOffline;
}

function refreshPlayerMarkerAppearance(name) {
    const entry = playerMarkers[name];
    if (!entry) return;
    entry.marker.setIcon(getPlayerIconForEntry(entry, followedPlayer === name));
}

function switchDimension(dimension) {
    const select = document.getElementById('dimensionType');
    if (!select || !dimension || select.value === dimension) return false;
    pendingFollowDimensionSwitch = true;
    select.value = dimension;
    select.dispatchEvent(new Event('change'));
    return true;
}

function syncFollowedPlayerView(animate = true) {
    if (!map || !followedPlayer) return;
    const entry = playerMarkers[followedPlayer];
    if (!entry) return;
    syncCoordinateDisplayToFollowed();
    const currentDim = getCurrentDimension();
    if (entry.dimension && entry.dimension !== currentDim) {
        if (!pendingFollowDimensionSwitch) switchDimension(entry.dimension);
        return;
    }
    const target = entry.marker.getLatLng();
    if (!map.getCenter().equals(target)) {
        map.setView(target, map.getZoom(), { animate });
    }
}

async function fetchLatestSha() {
    const res = await fetch(`/api/sha`);
    if (!res.ok) throw new Error(`Proxy API ${res.status}`);
    const data = await res.json();
    return data.sha.trim();
}

async function resolveLatestSha() {
    try {
        latestSha = await fetchLatestSha();
        TILE_BASE_URL = `https://rawcdn.githack.com/${GITHUB_USER}/${GITHUB_REPO}/${latestSha}`;
    } catch {
        TILE_BASE_URL = `https://rawcdn.githack.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}`;
    }
}

async function refreshShaAndTiles() {
    try {
        const newSha = await fetchLatestSha();
        if (newSha && newSha !== latestSha) {
            latestSha = newSha;
            TILE_BASE_URL = `https://rawcdn.githack.com/${GITHUB_USER}/${GITHUB_REPO}/${newSha}`;
            addTileLayer(localStorage.getItem('dimensionType') || 'overworld');
        }
    } catch { }
}

const HeatmapTileLayer = L.GridLayer.extend({
    options: { tileSize: TILE_SIZE, dimension: 'overworld', className: 'heatmap-grid', minNativeZoom: 0, maxNativeZoom: 0 },
    createTile(coords, done) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;height:100%;overflow:hidden;';
        const img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;display:block;image-rendering:pixelated;';
        const tileX = coords.x - (CENTER.x / TILE_SIZE);
        const tileZ = coords.y + (CENTER.y / TILE_SIZE);
        img.src = `${TILE_BASE_URL}/${this.options.dimension}/tile_${tileX}_${tileZ}.png`;
        img.onload = () => done(null, wrapper);
        img.onerror = () => { img.style.display = 'none'; wrapper.style.border = 'none'; done(null, wrapper); };
        wrapper.appendChild(img);
        return wrapper;
    }
});

function addTileLayer(dimension) {
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = new HeatmapTileLayer({ dimension }).addTo(map);
}

function createMapInstance() {
    const savedLat = parseFloat(localStorage.getItem('mapLat')) || CENTER.y;
    const savedLng = parseFloat(localStorage.getItem('mapLng')) || CENTER.x;
    const savedZoom = parseFloat(localStorage.getItem('mapZoom')) || 0;
    map = L.map('map', {
        crs: L.CRS.Simple, minZoom: 0, maxZoom: 4, zoomSnap: 1, zoomDelta: 1, zoomControl: false,
        maxBounds: [[0, RESOLUTION], [-RESOLUTION, 0]], maxBoundsViscosity: 0.7, attributionControl: false,
    }).setView([savedLat, savedLng], savedZoom);
    map.on('moveend zoomend', () => {
        const c = map.getCenter();
        localStorage.setItem('mapLat', c.lat);
        localStorage.setItem('mapLng', c.lng);
        localStorage.setItem('mapZoom', map.getZoom());
        updateAllEdgeIndicators();
    });
    map.on('move zoom', updateAllEdgeIndicators);
}

function setCoordinateDisplay(mc_x, mc_z) {
    document.getElementById('x').textContent = mc_x;
    document.getElementById('z').textContent = mc_z;
    document.getElementById('tileX').textContent = Math.floor(mc_x / TILE_SIZE);
    document.getElementById('tileY').textContent = Math.floor(mc_z / TILE_SIZE);
}

function setCoordinateDisplayFromLatLng(latlng) {
    const mc_x = Math.floor(latlng.lng - CENTER.x);
    const mc_z = -Math.floor(latlng.lat - CENTER.y);
    setCoordinateDisplay(mc_x, mc_z);
}

function syncCoordinateDisplayToFollowed() {
    if (!followedPlayer) return false;
    const entry = playerMarkers[followedPlayer];
    if (!entry) return false;
    setCoordinateDisplay(entry.mc_x, entry.mc_z);
    return true;
}

function displayCoordinates() {
    map.on('mousemove', ({ latlng }) => {
        setCoordinateDisplayFromLatLng(latlng);
    });
}

function centerToOrigin() {
    if (!map) return;
    map.setView([CENTER.y, CENTER.x], map.getZoom(), { animate: true });
}

function addMarker(icon, y, x, title, text = '') {
    const marker = L.marker([y, x]).addTo(map);
    if (icon) marker.setIcon(icon);
    marker.bindPopup(text || `${x}, ${y}`);
    marker.on('add', () => { if (title && marker._icon) marker._icon.title = title; });
    return marker;
}

function isOnlineByTimestamp(last_seen) {
    if (!last_seen) return false;
    return (Date.now() / 1000 - last_seen) <= OFFLINE_THRESHOLD_S;
}

async function fetchPlayerData() {
    try {
        const res = await fetch(`/api/players`);

        if (!res.ok) return null;
        const all = await res.json();
        return all.map(p => ({ ...p, online: isOnlineByTimestamp(p.last_seen) }));
    } catch { return null; }
}

function setMarkerOnline(name, online) {
    const entry = playerMarkers[name];
    if (!entry) return;
    entry.online = online;
    refreshPlayerMarkerAppearance(name);
    updateEdgeIndicator(name);
    updatePlayerPanel();
}

function getOrCreateEdgeEl(name) {
    if (edgeIndicatorEls[name]) return edgeIndicatorEls[name];
    const el = document.createElement('div');
    el.className = 'edge-indicator';
    el.innerHTML = `<img class="edge-sprite" src="images/Player.png" alt="${name}">`;
    el.addEventListener('click', () => focusPlayer(name));
    document.getElementById('edgeIndicators').appendChild(el);
    edgeIndicatorEls[name] = el;
    return el;
}

function removeEdgeIndicator(name) {
    if (edgeIndicatorEls[name]) {
        edgeIndicatorEls[name].remove();
        delete edgeIndicatorEls[name];
    }
}

function updateEdgeIndicator(name) {
    const entry = playerMarkers[name];
    if (!entry) { removeEdgeIndicator(name); return; }
    const currentDim = getCurrentDimension();
    const differentDim = entry.dimension && entry.dimension !== currentDim;
    if (differentDim) {
        removeEdgeIndicator(name);
        return;
    }
    const mapEl = document.getElementById('map');
    const W = mapEl.clientWidth, H = mapEl.clientHeight;
    const pt = map.latLngToContainerPoint(entry.marker.getLatLng());
    const pad = 24;
    const onScreen = pt.x >= pad && pt.x <= W - pad && pt.y >= pad && pt.y <= H - pad;
    if (onScreen) {
        if (edgeIndicatorEls[name]) edgeIndicatorEls[name].classList.add('hidden');
        return;
    }
    const el = getOrCreateEdgeEl(name);
    el.classList.remove('hidden');
    el.classList.toggle('offline', !entry.online);
    const cx = W / 2, cy = H / 2;
    const dx = pt.x - cx, dy = pt.y - cy;
    const halfW = cx - EDGE_MARGIN, halfH = cy - EDGE_MARGIN;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    let ex, ey;
    if (absDx < 0.001 && absDy < 0.001) { ex = cx; ey = EDGE_MARGIN; }
    else if (absDx === 0 || halfW / absDx >= halfH / absDy) {
        ey = cy + Math.sign(dy) * halfH;
        ex = cx + (absDy > 0.001 ? dx * (halfH / absDy) : 0);
    } else {
        ex = cx + Math.sign(dx) * halfW;
        ey = cy + (absDx > 0.001 ? dy * (halfW / absDx) : 0);
    }
    el.style.left = `${Math.round(ex - 10)}px`;
    el.style.top = `${Math.round(ey - 10)}px`;
}

function updateAllEdgeIndicators() {
    for (const name of Object.keys(playerMarkers)) updateEdgeIndicator(name);
}

function focusPlayer(name) {
    const entry = playerMarkers[name];
    if (!entry) return;
    const currentDim = getCurrentDimension();
    const previousFollowed = followedPlayer;
    followedPlayer = name;
    if (previousFollowed !== followedPlayer) {
        refreshPlayerMarkerAppearance(previousFollowed);
        refreshPlayerMarkerAppearance(followedPlayer);
    }
    syncCoordinateDisplayToFollowed();
    updatePlayerPanel();
    if (entry.dimension && entry.dimension !== currentDim) {
        switchDimension(entry.dimension);
        return;
    }
    syncFollowedPlayerView(true);
}

function updatePlayerPanel() {
    const list = document.getElementById('playerPanelList');
    const countEl = document.getElementById('playerPanelCount');
    const names = Object.keys(playerMarkers);
    countEl.textContent = names.filter(n => playerMarkers[n].online).length;
    if (names.length === 0) {
        list.innerHTML = '<div class="player-panel-empty">No players loaded</div>';
        return;
    }
    names.sort((a, b) => (playerMarkers[a].online ? 0 : 1) - (playerMarkers[b].online ? 0 : 1) || a.localeCompare(b));
    const currentDim = getCurrentDimension();
    list.innerHTML = names.map(name => {
        const entry = playerMarkers[name];
        const isFollowed = followedPlayer === name;
        const diffDim = entry.dimension && entry.dimension !== currentDim;
        return `
            <div class="player-panel-item${isFollowed ? ' followed' : ''}${!entry.online ? ' offline' : ''}" data-name="${name}">
                <span class="player-panel-dot${entry.online ? ' online' : ''}"></span>
                <span class="player-panel-name">${name}</span>
                ${isFollowed ? '<span class="player-panel-following">Following</span>' : ''}
                ${diffDim ? `<span class="player-panel-dim">${entry.dimension.replace('the_', '')}</span>` : ''}
            </div>`;
    }).join('');
    list.querySelectorAll('.player-panel-item').forEach(el => {
        el.addEventListener('click', () => {
            const name = el.dataset.name;
            if (followedPlayer === name) {
                followedPlayer = null;
                refreshPlayerMarkerAppearance(name);
                if (map) setCoordinateDisplayFromLatLng(map.getCenter());
                updatePlayerPanel();
            }
            else focusPlayer(name);
        });
    });
}

function togglePlayerPanel() { document.getElementById('playerPanelDropdown').classList.toggle('hidden'); }

function updateOrAddPlayerMarker(playerName, dimension, mapX, mapY, mc_x, mc_z, online, last_seen) {
    const currentDim = getCurrentDimension();
    const entry = playerMarkers[playerName];
    if (entry) {
        entry.dimension = dimension;
        entry.last_seen = last_seen;
        entry.mc_x = mc_x;
        entry.mc_z = mc_z;
    }
    if (dimension !== currentDim) {
        if (!entry) {
            const marker = L.marker([mapY, mapX]);
            marker.bindPopup(`${playerName}<br>x: ${mc_x}, z: ${mc_z}`);
            playerMarkers[playerName] = { marker, online, mc_x, mc_z, dimension, last_seen };
        } else {
            if (entry.online !== online) {
                entry.online = online;
                refreshPlayerMarkerAppearance(playerName);
            }
        }
        refreshPlayerMarkerAppearance(playerName);
        removeEdgeIndicator(playerName);
        updatePlayerPanel();
        return;
    }
    if (entry) {
        if (!map.hasLayer(entry.marker)) entry.marker.addTo(map);
        entry.marker.setLatLng([mapY, mapX]);
        entry.marker.setPopupContent(`${playerName}<br>x: ${mc_x}, z: ${mc_z}`);
        if (entry.online !== online) setMarkerOnline(playerName, online);
    } else {
        const marker = addMarker(online ? playerIcon : playerIconOffline, mapY, mapX, playerName, `${playerName}<br>x: ${mc_x}, z: ${mc_z}`);
        playerMarkers[playerName] = { marker, online, mc_x, mc_z, dimension, last_seen };
    }
    refreshPlayerMarkerAppearance(playerName);
    updateEdgeIndicator(playerName);
    if (playerName === followedPlayer) syncCoordinateDisplayToFollowed();
}

async function updatePlayerMarkers() {
    const data = await fetchPlayerData();
    if (data === null) return;
    for (const { player_name, x, z, dimension, online, last_seen } of data) {
        updateOrAddPlayerMarker(player_name, dimension, x + CENTER.x, -z + CENTER.y, x, z, online, last_seen);
    }
    syncFollowedPlayerView(true);
    updatePlayerPanel();
    updateAllEdgeIndicators();
}

function createMapContextMenu(e) {
    e.preventDefault();
    const menu = document.getElementById('contextMenu');
    const clientX = e.originalEvent?.clientX ?? 0;
    const clientY = e.originalEvent?.clientY ?? 0;
    const mc_x = Math.floor(e.latlng.lng - CENTER.x);
    const mc_z = -Math.floor(e.latlng.lat - CENTER.y);
    const tileX = Math.floor(mc_x / TILE_SIZE);
    const tileY = Math.floor(mc_z / TILE_SIZE);

    document.getElementById('copyCoordinatesBtn').querySelector('.ctx-value').textContent = `${mc_x}, ${mc_z}`;
    document.getElementById('copyTileBtn').querySelector('.ctx-value').textContent = `${tileX} ${tileY}`;
    document.getElementById('centerBtn').querySelector('.ctx-hint').textContent = `${mc_x}, ${mc_z}`;

    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.classList.remove('hidden');
    function close() { menu.classList.add('hidden'); }
    document.getElementById('copyCoordinatesBtn').onclick = () => { navigator.clipboard.writeText(document.getElementById('copyCoordinatesBtn').querySelector('.ctx-value').textContent); close(); };
    document.getElementById('copyTileBtn').onclick = () => { navigator.clipboard.writeText(document.getElementById('copyTileBtn').querySelector('.ctx-value').textContent); close(); };
    document.getElementById('centerBtn').onclick = () => { centerToOrigin(); close(); };
    setTimeout(() => document.addEventListener('click', close, { once: true }), 0);

    const rect = menu.getBoundingClientRect();
    const margin = 8;
    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop = window.innerHeight - rect.height - margin;
    menu.style.left = `${Math.max(margin, Math.min(clientX, maxLeft))}px`;
    menu.style.top = `${Math.max(margin, Math.min(clientY, maxTop))}px`;
}

function dimensionTypeListener() {
    const select = document.getElementById('dimensionType');
    select.addEventListener('change', async () => {
        if (map) {
            localStorage.setItem('mapLat', map.getCenter().lat);
            localStorage.setItem('mapLng', map.getCenter().lng);
            localStorage.setItem('mapZoom', map.getZoom());
            map.remove();
        }
        Object.keys(edgeIndicatorEls).forEach(k => { edgeIndicatorEls[k].remove(); delete edgeIndicatorEls[k]; });
        Object.keys(playerMarkers).forEach(k => delete playerMarkers[k]);
        localStorage.setItem('dimensionType', select.value);
        await resolveLatestSha();
        createMapInstance();
        addTileLayer(select.value);
        displayCoordinates();
        setCoordinateDisplayFromLatLng(map.getCenter());
        addMarker(compassIcon, CENTER.y, CENTER.x, 'spawn', '0, 0');
        await updatePlayerMarkers();
        syncFollowedPlayerView(true);
        pendingFollowDimensionSwitch = false;
    });
    const saved = localStorage.getItem('dimensionType');
    if (saved) select.value = saved;
    select.dispatchEvent(new Event('change'));
}

function startInterval() { if (!intervalId) intervalId = setInterval(async () => { await refreshShaAndTiles(); await updatePlayerMarkers(); }, 10_000); }
function stopInterval() { clearInterval(intervalId); intervalId = null; }

function eventListener() {
    const mapEl = document.getElementById('map');
    mapEl.addEventListener('mousedown', e => { if (e.button === 0) { mapEl.style.cursor = 'grabbing'; stopInterval(); } });
    mapEl.addEventListener('mouseup', e => { if (e.button === 0) { mapEl.style.cursor = 'crosshair'; startInterval(); } });
    mapEl.addEventListener('contextmenu', createMapContextMenu);
    document.addEventListener('keydown', e => { if (!['INPUT', 'SELECT'].includes(e.target.tagName) && e.key.toLowerCase() === 'c') centerToOrigin(); });
    document.getElementById('playerPanelToggle').addEventListener('click', e => { e.stopPropagation(); togglePlayerPanel(); });
    document.addEventListener('click', e => { if (!document.getElementById('playerPanel').contains(e.target)) document.getElementById('playerPanelDropdown').classList.add('hidden'); });
}

document.addEventListener('DOMContentLoaded', async () => {
    await resolveLatestSha();
    eventListener();
    dimensionTypeListener();
    startInterval();
});