let map = null;
let ambulanceMarker = null;
let hospitalMarker = null;
let routeLayer = null;
let selectedHospital = null;
let latestApiPosition = null;
let currentAmbulancePosition = null;
let locationPoller = null;
let movementTimer = null;
let started = false;
let emergencyMode = false;
let clearedCount = 0;
let signals = [];
let signalMarkers = [];
let routePoints = [];
let routeIndex = 0;
let currentRouteDistanceKm = 0;
let totalDistanceCoveredKm = 0;

const DEFAULT_POSITION = [17.3850, 78.4860];
const GREEN_SIGNAL_DISTANCE_KM = 0.3;
const YELLOW_SIGNAL_DISTANCE_KM = 0.5;
const DEFAULT_MOVEMENT_INTERVAL_MS = 250;
const EMERGENCY_MOVEMENT_INTERVAL_MS = 150;
const DEFAULT_CRUISE_SPEED_KMPH = 42;
const EMERGENCY_CRUISE_SPEED_KMPH = 68;
const SIGNAL_COUNT = 5;

function haversine(lat1, lon1, lat2, lon2) {
    const earthRadiusKm = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) {
        return;
    }

    const toast = document.createElement('div');
    toast.className = 'signal-toast';
    toast.textContent = message;
    container.appendChild(toast);

    window.setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(14px)';
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    }, 2200);

    window.setTimeout(() => {
        toast.remove();
    }, 2600);
}

function getSignalColor(state) {
    if (state === 'green') {
        return '#22c55e';
    }

    if (state === 'yellow') {
        return '#facc15';
    }

    return '#ef4444';
}

function applySignalStyle(marker, state) {
    const color = getSignalColor(state);
    marker.setStyle({
        color,
        fillColor: color,
        fillOpacity: 1,
        opacity: 1,
        radius: state === 'green' ? 11 : 10,
        weight: 3
    });
}

function clearHospitalMarker() {
    if (hospitalMarker) {
        map.removeLayer(hospitalMarker);
        hospitalMarker = null;
    }
}

function stopMovement() {
    if (movementTimer) {
        window.clearInterval(movementTimer);
        movementTimer = null;
    }
}

function updateStatus(status) {
    const statusElement = document.getElementById('trip-status');
    if (!statusElement) {
        return;
    }

    statusElement.textContent = status;
    statusElement.className = 'status-pill';

    if (status === 'Idle') {
        statusElement.classList.add('idle');
    } else if (status === 'En Route') {
        statusElement.classList.add('enroute');
    } else if (status === 'Near Destination') {
        statusElement.classList.add('near');
    } else if (status === 'Arrived') {
        statusElement.classList.add('arrived');
    } else {
        statusElement.classList.add('active');
    }
}

function updateEmergencyUI() {
    document.body.classList.toggle('emergency-active', emergencyMode);
    setText('emergency-state', emergencyMode ? 'On' : 'Off');
    setText('priority-status', emergencyMode ? 'Priority corridor' : 'Normal corridor');

    const emergencyButton = document.getElementById('emergencyBtn');
    if (emergencyButton) {
        emergencyButton.classList.toggle('active', emergencyMode);
        emergencyButton.textContent = emergencyMode ? '🚨 Emergency Mode Active' : '🚨 Emergency Mode';
    }
}

function updateStartButton() {
    const startButton = document.getElementById('startBtn');
    if (!startButton) {
        return;
    }

    if (!selectedHospital) {
        startButton.disabled = true;
        startButton.textContent = '🚑 Start Ambulance';
        startButton.classList.remove('ready', 'running');
        return;
    }

    if (started) {
        startButton.disabled = false;
        startButton.textContent = 'Running...';
        startButton.classList.remove('ready');
        startButton.classList.add('running');
        return;
    }

    startButton.disabled = false;
    startButton.textContent = '🚑 Start Ambulance';
    startButton.classList.add('ready');
    startButton.classList.remove('running');
}

function updateAnalytics(distanceKm, etaMinutes) {
    setText('analytics-signals', String(clearedCount));
    setText('distance-covered', totalDistanceCoveredKm.toFixed(2));
    setText('analytics-eta', String(etaMinutes));
    setText('admin-junctions', String(signals.length));
}

function updateCorridorProgress() {
    const totalSignals = signals.length;
    const activeSignals = signals.filter((signal) => signal.state === 'green').length;
    clearedCount = activeSignals;
    const percent = totalSignals > 0 ? Math.round((activeSignals / totalSignals) * 100) : 0;

    setText('corridor-cleared', String(activeSignals));
    setText('corridor-total', String(totalSignals));
    setText('corridor-percent', `${percent}% active`);

    const progressFill = document.getElementById('corridor-progress');
    if (progressFill) {
        progressFill.style.width = `${percent}%`;
    }

    const corridorState = document.getElementById('corridor-state');
    if (corridorState) {
        const isActive = started && activeSignals > 0;
        corridorState.textContent = isActive ? 'Corridor Active' : 'Standby';
        corridorState.classList.toggle('active', isActive);
    }
}

function updateDistanceAndEta(distanceKm, speedKmph) {
    const safeDistance = Math.max(distanceKm, 0);
    const eta = speedKmph > 0 ? Math.round((safeDistance / speedKmph) * 60) : 0;

    setText('distance', safeDistance.toFixed(2));
    setText('eta', String(eta));
    updateAnalytics(safeDistance, eta);

    if (!started) {
        updateStatus('Idle');
    } else if (safeDistance === 0) {
        updateStatus('Arrived');
    } else if (safeDistance < 1.5) {
        updateStatus('Near Destination');
    } else {
        updateStatus('En Route');
    }
}

function updateAmbulanceVisuals(position, speed) {
    currentAmbulancePosition = { lat: position.lat, lng: position.lng, speed };

    setText('lat', position.lat.toFixed(4));
    setText('lng', position.lng.toFixed(4));
    setText('speed', String(Math.round(speed)));

    if (ambulanceMarker) {
        ambulanceMarker.setLatLng([position.lat, position.lng]);
    }

    if (map) {
        map.panTo([position.lat, position.lng], { animate: true, duration: 0.6 });
    }
}

function resetSystem() {
    signals = [];
    signalMarkers.forEach((marker) => map.removeLayer(marker));
    signalMarkers = [];
    clearedCount = 0;

    if (routeLayer) {
        routeLayer.clearLayers();
    }

    routePoints = [];
    routeIndex = 0;
    currentRouteDistanceKm = 0;
    totalDistanceCoveredKm = 0;
    stopMovement();
    updateDistanceAndEta(0, 0);
    updateCorridorProgress();
    updateAnalytics(0, 0);
    updateStatus('Idle');
}

function getRemainingRouteDistanceKm() {
    if (!routePoints.length || routeIndex >= routePoints.length) {
        return 0;
    }

    let distance = 0;
    for (let index = routeIndex; index < routePoints.length - 1; index += 1) {
        const current = routePoints[index];
        const next = routePoints[index + 1];
        distance += haversine(current[0], current[1], next[0], next[1]);
    }

    return distance;
}

function generateSignals(points) {
    signals = [];
    signalMarkers.forEach((marker) => map.removeLayer(marker));
    signalMarkers = [];

    if (!points.length) {
        updateCorridorProgress();
        return;
    }

    const step = Math.max(1, Math.floor(points.length / (SIGNAL_COUNT + 1)));

    for (let index = 1; index <= SIGNAL_COUNT; index += 1) {
        const pointIndex = Math.min(index * step, points.length - 1);
        const point = points[pointIndex];
        const signal = {
            id: index,
            lat: point[0],
            lng: point[1],
            state: 'red'
        };

        signals.push(signal);

        const marker = L.circleMarker(point, {
            radius: 10,
            color: getSignalColor('red'),
            fillColor: getSignalColor('red'),
            fillOpacity: 1,
            weight: 3
        }).addTo(map);

        marker.bindPopup(`🚦 Junction ${index}`);
        signalMarkers.push(marker);
    }

    updateCorridorProgress();
    updateAnalytics(currentRouteDistanceKm, Math.round((currentRouteDistanceKm / Math.max(getCurrentSpeed(), 1)) * 60));
}

function getCurrentSpeed() {
    return emergencyMode ? EMERGENCY_CRUISE_SPEED_KMPH : DEFAULT_CRUISE_SPEED_KMPH;
}

async function drawRoute(startLat, startLng, endLat, endLng) {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Routing failed: ${response.status}`);
    }

    const data = await response.json();
    const route = data.routes && data.routes[0];

    if (!route || !route.geometry || !route.geometry.coordinates) {
        throw new Error('No route returned by OSRM');
    }

    routePoints = route.geometry.coordinates.map((coordinate) => [coordinate[1], coordinate[0]]);
    routeIndex = 0;
    currentRouteDistanceKm = (route.distance || 0) / 1000;

    routeLayer.clearLayers();
    L.polyline(routePoints, {
        color: emergencyMode ? '#ff6b6b' : '#00d4ff',
        weight: 6,
        opacity: 0.9
    }).addTo(routeLayer);

    generateSignals(routePoints);
    updateDistanceAndEta(currentRouteDistanceKm, getCurrentSpeed());
}

function updateSignals(lat, lng) {
    let stateChanged = false;

    signals.forEach((signal, index) => {
        const distance = haversine(lat, lng, signal.lat, signal.lng);
        let nextState = 'red';

        if (distance < GREEN_SIGNAL_DISTANCE_KM) {
            nextState = 'green';
        } else if (distance < YELLOW_SIGNAL_DISTANCE_KM) {
            nextState = 'yellow';
        }

        if (signal.state !== nextState) {
            signal.state = nextState;
            applySignalStyle(signalMarkers[index], nextState);
            stateChanged = true;
        }
    });

    if (stateChanged) {
        updateCorridorProgress();
        updateAnalytics(
            getRemainingRouteDistanceKm(),
            Math.round((getRemainingRouteDistanceKm() / Math.max(getCurrentSpeed(), 1)) * 60)
        );
    }
}

function restartMovementLoop() {
    if (!started || !routePoints.length) {
        return;
    }

    stopMovement();
    movementTimer = window.setInterval(moveAmbulance, emergencyMode ? EMERGENCY_MOVEMENT_INTERVAL_MS : DEFAULT_MOVEMENT_INTERVAL_MS);
}

function moveAmbulance() {
    if (!routePoints.length || routeIndex >= routePoints.length) {
        stopMovement();
        started = false;
        updateStartButton();
        updateDistanceAndEta(0, 0);
        updateStatus('Arrived');
        updateSignals(
            currentAmbulancePosition ? currentAmbulancePosition.lat : DEFAULT_POSITION[0],
            currentAmbulancePosition ? currentAmbulancePosition.lng : DEFAULT_POSITION[1]
        );
        showToast('Arriving at Hospital 🏥');
        return;
    }

    const point = routePoints[routeIndex];
    const position = { lat: point[0], lng: point[1] };

    if (routeIndex > 0) {
        const previous = routePoints[routeIndex - 1];
        totalDistanceCoveredKm += haversine(previous[0], previous[1], point[0], point[1]);
    }

    updateAmbulanceVisuals(position, getCurrentSpeed());
    updateSignals(point[0], point[1]);
    updateDistanceAndEta(getRemainingRouteDistanceKm(), getCurrentSpeed());

    routeIndex += 1;
}

async function startAmbulance() {
    if (!selectedHospital || started || !currentAmbulancePosition) {
        return;
    }

    started = true;
    updateStartButton();
    updateStatus('En Route');
    showToast('Ambulance Started 🚑');

    try {
        await drawRoute(
            currentAmbulancePosition.lat,
            currentAmbulancePosition.lng,
            selectedHospital.lat,
            selectedHospital.lng
        );

        restartMovementLoop();
        moveAmbulance();
    } catch (error) {
        started = false;
        updateStartButton();
        resetSystem();
        console.error('Route generation failed:', error);
        showToast('Unable to generate road route');
    }
}

function toggleEmergencyMode() {
    emergencyMode = !emergencyMode;
    updateEmergencyUI();

    if (routePoints.length) {
        routeLayer.clearLayers();
        L.polyline(routePoints, {
            color: emergencyMode ? '#ff6b6b' : '#00d4ff',
            weight: 6,
            opacity: 0.9
        }).addTo(routeLayer);
    }

    if (started) {
        restartMovementLoop();
        updateDistanceAndEta(getRemainingRouteDistanceKm(), getCurrentSpeed());
    }
}

function updateHospitalSelection(value) {
    clearHospitalMarker();
    started = false;
    selectedHospital = null;
    updateStartButton();
    resetSystem();

    if (!value) {
        return;
    }

    const [lat, lng] = value.split(',').map(Number);
    selectedHospital = { lat, lng };

    hospitalMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'hospital-icon',
            html: '🏥',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        })
    }).addTo(map);

    updateStartButton();
}

async function fetchLocation() {
    const response = await fetch('/api/location');
    if (!response.ok) {
        throw new Error(`Location request failed: ${response.status}`);
    }

    const data = await response.json();
    const apiPosition = {
        lat: Number(data.lat),
        lng: Number(data.lng)
    };
    const speed = Number(data.speed) || 0;

    if (!Number.isFinite(apiPosition.lat) || !Number.isFinite(apiPosition.lng)) {
        return;
    }

    latestApiPosition = apiPosition;

    if (!currentAmbulancePosition || !started) {
        updateAmbulanceVisuals(apiPosition, speed);
    }
}

function initMap() {
    if (map) {
        return;
    }

    const mapElement = document.getElementById('map');
    if (!mapElement) {
        return;
    }

    map = L.map(mapElement).setView(DEFAULT_POSITION, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    ambulanceMarker = L.marker(DEFAULT_POSITION, {
        icon: L.divIcon({
            className: 'ambulance-icon',
            html: '🚑',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        })
    }).addTo(map);

    routeLayer = L.layerGroup().addTo(map);

    currentAmbulancePosition = {
        lat: DEFAULT_POSITION[0],
        lng: DEFAULT_POSITION[1],
        speed: 0
    };

    updateCorridorProgress();
    updateStartButton();
    updateEmergencyUI();
    updateStatus('Idle');

    setTimeout(() => {
        if (map) {
            map.invalidateSize();
        }
    }, 700);
}

window.addEventListener('load', () => {
    initMap();

    if (!map) {
        return;
    }

    const hospitalSelect = document.getElementById('hospital-select');
    if (hospitalSelect) {
        hospitalSelect.addEventListener('change', (event) => {
            updateHospitalSelection(event.target.value);
        });
    }

    const startButton = document.getElementById('startBtn');
    if (startButton) {
        startButton.addEventListener('click', () => {
            startAmbulance();
        });
    }

    const emergencyButton = document.getElementById('emergencyBtn');
    if (emergencyButton) {
        emergencyButton.addEventListener('click', () => {
            toggleEmergencyMode();
        });
    }

    fetchLocation().catch((error) => {
        console.error('Initial location fetch failed:', error);
    });

    if (!locationPoller) {
        locationPoller = window.setInterval(() => {
            if (started) {
                return;
            }

            fetchLocation().catch((error) => {
                console.error('Location polling failed:', error);
            });
        }, 2000);
    }
});
