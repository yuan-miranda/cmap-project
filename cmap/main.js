const GITHUB_USER = 'yuan-miranda';
const GITHUB_REPO = 'tiles';
const GITHUB_BRANCH = 'main';

const TILE_SIZE = 512;
const RESOLUTION = 32768;
const CENTER = { x: RESOLUTION / 2, y: -RESOLUTION / 2 };

let map, tileLayer;
let intervalId = null;
let latestSha = '';
let TILE_BASE_URL = '';

const playerMarkers = {};
let followedPlayer = null;

const makeIcon = (url, extra = '') => L.icon({
    iconUrl: url,
    iconSize: [16, 16],
    iconAnchor: [0, 0],
    className: `map-icon${extra}`
});

const playerIcon = makeIcon('images/Player.png');
const playerIconOffline = makeIcon('images/Player.png', ' player-offline');
const compassIcon = makeIcon('images/Compass.png');

async function fetchLatestSha() {
    const res = await fetch(`http://143.244.173.238:5000/api/latest-sha`);
    if (!res.ok) throw new Error(`VPS API ${res.status}`);
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
    } catch { /* silent */ }
}

const HeatmapTileLayer = L.GridLayer.extend({
    options: {
        tileSize: TILE_SIZE,
        dimension: 'overworld',
        className: 'heatmap-grid',
        minNativeZoom: 0,
        maxNativeZoom: 0
    },
    createTile(coords, done) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;height:100%;overflow:hidden;';

        const img = document.createElement('img');
        img.alt = '';
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
        crs: L.CRS.Simple,
        minZoom: 0,
        maxZoom: 4,
        zoomSnap: 1,
        zoomDelta: 1,
        zoomControl: false,
        maxBounds: [[0, RESOLUTION], [-RESOLUTION, 0]],
        maxBoundsViscosity: 0.7,
        attributionControl: false,
    }).setView([savedLat, savedLng], savedZoom);

    map.on('moveend zoomend', () => {
        const c = map.getCenter();
        localStorage.setItem('mapLat', c.lat);
        localStorage.setItem('mapLng', c.lng);
        localStorage.setItem('mapZoom', map.getZoom());
    });
}

function displayCoordinates() {
    map.on('mousemove', ({ latlng }) => {
        const mc_x = Math.floor(latlng.lng - CENTER.x);
        const mc_z = -Math.floor(latlng.lat - CENTER.y);
        document.getElementById('x').textContent = mc_x;
        document.getElementById('z').textContent = mc_z;
        document.getElementById('tileX').textContent = Math.floor(mc_x / TILE_SIZE);
        document.getElementById('tileY').textContent = Math.floor(mc_z / TILE_SIZE);
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

async function fetchPlayerData() {
    try {
        const res = await fetch(`${TILE_BASE_URL}/players.json?v=${latestSha}`);
        if (!res.ok) return [];
        const all = await res.json();
        if (!all.length) return [];
        const maxTs = Math.max(...all.map(p => p.last_seen ?? 0));
        return all.map(p => ({
            ...p,
            online: (maxTs - (p.last_seen ?? 0)) <= 10
        }));
    } catch { return []; }
}

function setMarkerOnline(name, online) {
    const entry = playerMarkers[name];
    if (!entry) return;
    entry.online = online;
    entry.marker.setIcon(online ? playerIcon : playerIconOffline);
}

function updateOrAddPlayerMarker(playerName, dimension, mapX, mapY, mc_x, mc_z, online) {
    const currentDim = localStorage.getItem('dimensionType') || 'overworld';
    const entry = playerMarkers[playerName];

    if (dimension !== currentDim) {
        if (followedPlayer === playerName) {
            const select = document.getElementById('dimensionType');
            select.value = dimension;
            select.dispatchEvent(new Event('change'));
        }
        return;
    }

    if (entry) {
        entry.marker.setLatLng([mapY, mapX]);
        if (entry.online !== online) setMarkerOnline(playerName, online);
    } else {
        const marker = addMarker(
            online ? playerIcon : playerIconOffline,
            mapY, mapX, playerName,
            `${playerName}<br>x: ${mc_x}, z: ${mc_z}`
        );
        playerMarkers[playerName] = { marker, online };
        marker.on('dblclick', () => {
            followedPlayer = (followedPlayer === playerName) ? null : playerName;
            map.setView([mapY, mapX], map.getZoom(), { animate: true });
        });
    }

    if (online && followedPlayer === playerName) {
        map.setView([mapY, mapX], map.getZoom(), { animate: true });
    }
}

async function updatePlayerMarkers() {
    const data = await fetchPlayerData();
    const seen = new Set(data.map(p => p.player_name));

    for (const name of Object.keys(playerMarkers)) {
        if (!seen.has(name) && playerMarkers[name].online) {
            setMarkerOnline(name, false);
        }
    }

    for (const { player_name, x, z, dimension, online } of data) {
        updateOrAddPlayerMarker(player_name, dimension, x + CENTER.x, -z + CENTER.y, x, z, online);
    }
}

function createMapContextMenu(e) {
    e.preventDefault();

    const menu = document.getElementById('contextMenu');
    const coordRow = document.getElementById('copyCoordinatesBtn');
    const tileRow = document.getElementById('copyTileBtn');
    const centerRow = document.getElementById('centerBtn');

    const coordinates = `${document.getElementById('x').textContent}, ${document.getElementById('z').textContent}`;
    const tile = `${document.getElementById('tileX').textContent} ${document.getElementById('tileY').textContent}`;

    coordRow.querySelector('.ctx-value').textContent = coordinates;
    tileRow.querySelector('.ctx-value').textContent = tile;

    menu.style.top = `${e.pageY}px`;
    menu.style.left = `${e.pageX}px`;
    menu.classList.remove('hidden');

    function close() { menu.classList.add('hidden'); }

    coordRow.onclick = () => { navigator.clipboard.writeText(coordinates); close(); };
    tileRow.onclick = () => { navigator.clipboard.writeText(tile); close(); };
    centerRow.onclick = () => { centerToOrigin(); close(); };

    setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
}

function dimensionTypeListener() {
    const select = document.getElementById('dimensionType');

    select.addEventListener('change', async () => {
        if (map) {
            const c = map.getCenter();
            localStorage.setItem('mapLat', c.lat);
            localStorage.setItem('mapLng', c.lng);
            localStorage.setItem('mapZoom', map.getZoom());
            map.remove();
        }

        Object.keys(playerMarkers).forEach(k => delete playerMarkers[k]);
        localStorage.setItem('dimensionType', select.value);

        await resolveLatestSha();

        createMapInstance();
        addTileLayer(select.value);
        displayCoordinates();
        addMarker(compassIcon, CENTER.y, CENTER.x, 'spawn', '0, 0');

        await updatePlayerMarkers();
    });

    const saved = localStorage.getItem('dimensionType');
    if (saved) select.value = saved;
    select.dispatchEvent(new Event('change'));
}

function startInterval() {
    if (intervalId !== null) return;
    intervalId = setInterval(() => { refreshShaAndTiles(); updatePlayerMarkers(); }, 30_000);
}

function stopInterval() {
    if (intervalId === null) return;
    clearInterval(intervalId);
    intervalId = null;
}

function eventListener() {
    const mapEl = document.getElementById('map');
    mapEl.addEventListener('mousedown', e => { if (e.button === 0) { mapEl.style.cursor = 'grabbing'; stopInterval(); } });
    mapEl.addEventListener('mouseup', e => { if (e.button === 0) { mapEl.style.cursor = 'grab'; startInterval(); } });
    mapEl.addEventListener('contextmenu', createMapContextMenu);

    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
        if (e.key === 'c' || e.key === 'C') centerToOrigin();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await resolveLatestSha();
    eventListener();
    dimensionTypeListener();
    startInterval();
});