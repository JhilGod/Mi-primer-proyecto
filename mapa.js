// --- VARIABLES GLOBALES ---
let map, baseLayer, userMarker = null, currentLatLng = null;
let isDarkMode = false;
let lineasAgrupadas = {}; 
let destinoMarcadorTemp = null;
let temporizadorBusqueda = null;

// --- 1. CONFIGURACIÓN FIREBASE REAL ---
const firebaseConfig = {
    apiKey: "AIzaSyDaourUoy1CgLslN9UxO-9DyTz3IjhRVpI",
    authDomain: "linea-map.firebaseapp.com",
    projectId: "linea-map",
    storageBucket: "linea-map.firebasestorage.app",
    messagingSenderId: "350770978437",
    appId: "1:350770978437:web:cf2ef2b5e9b4c6a33e13ec",
    measurementId: "G-LD6E7P550C"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 2. GESTIÓN DE PANTALLAS ---
window.entrarInvitado = function() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('map').style.display = 'block';
    document.getElementById('btn-menu').style.display = 'block';
    document.getElementById('btn-theme').style.display = 'block';
    document.querySelector('.btn-locate').style.display = 'flex';
    initMap();
}

// --- 3. MODO OSCURO ---
window.toggleTheme = function() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-theme');
    document.getElementById('btn-theme').innerText = isDarkMode ? '☀️' : '🌙';
};

// --- 4. PANEL LATERAL ---
window.toggleSidePanel = function() {
    document.getElementById('side-panel').classList.toggle('active');
}

// --- 5. TARIFA DINÁMICA ACTUALIZADA ---
function obtenerTarifaActual(tarifaDia, tarifaNoche) {
    const horaLocal = new Date().getHours();
    const esNoche = (horaLocal >= 22 || horaLocal < 7);
    
    const precioDia = tarifaDia || "1000";
    const precioNoche = tarifaNoche || "1300";

    if (esNoche) {
        return `<span class="tarifa-badge noche">🌙 $${precioNoche} (Tarifa Nocturna)</span>`;
    } else {
        return `<span class="tarifa-badge dia">☀️ $${precioDia} (Tarifa Diurna)</span>`;
    }
}

// --- 6. INICIALIZACIÓN DEL MAPA EN ARICA ---
function initMap() {
    const surOeste = L.latLng(-18.55, -70.35);
    const norEste = L.latLng(-18.35, -70.20);
    const limites = L.latLngBounds(surOeste, norEste);

    map = L.map('map', { 
        center: [-18.4783, -70.3126], 
        zoom: 14, 
        minZoom: 13, 
        maxBounds: limites, 
        maxBoundsViscosity: 1.0, 
        zoomControl: false 
    });
    
    baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    descargarRutas();

    const gpsIcon = L.divIcon({ className: 'user-location-icon', iconSize: [18, 18], iconAnchor: [9, 9] });
    userMarker = L.marker([0, 0], { icon: gpsIcon }).addTo(map);

    map.locate({ watch: true, setView: false, enableHighAccuracy: true }); 
    map.on('locationfound', (e) => {
        currentLatLng = e.latlng;
        userMarker.setLatLng(e.latlng);
    });

    window.centrarEnUsuario = function() {
        if (currentLatLng) map.setView(currentLatLng, 16);
    };
}

// --- 7. COHESIÓN Y DESCARGA DESDE FIREBASE ---
function descargarRutas() {
    db.collection("lineas").get().then((querySnapshot) => {
        lineasAgrupadas = {}; 

        querySnapshot.forEach((doc) => {
            const datos = doc.data();
            
            let isIda = datos.nombre.includes("(Ida)");
            let isVuelta = datos.nombre.includes("(Vuelta)");
            let nombreBase = datos.nombre.replace(" (Ida)", "").replace(" (Vuelta)", "").trim();

            if (!lineasAgrupadas[nombreBase]) {
                lineasAgrupadas[nombreBase] = { 
                    ida: null, 
                    vuelta: null, 
                    tDia: datos.tarifaDia || 1000, 
                    tNoche: datos.tarifaNoche || 1300 
                };
            }

            const featureData = {
                "type": "Feature",
                "properties": { "nombre": datos.nombre, "color": datos.color },
                "geometry": { "type": "LineString", "coordinates": JSON.parse(datos.coordenadas) }
            };
            
            const capa = L.geoJSON(featureData, {
                style: { color: datos.color, weight: 6, opacity: 0.85 }
            }).bindPopup(`
                <div style="text-align:center; font-family: 'Poppins', sans-serif;">
                    <b>🚕 ${datos.nombre}</b><br><br>
                    ${obtenerTarifaActual(datos.tarifaDia || 1000, datos.tarifaNoche || 1300)}
                </div>
            `);

            let objRuta = { capa: capa, color: datos.color, visible: false };

            if (isIda) lineasAgrupadas[nombreBase].ida = objRuta;
            else if (isVuelta) lineasAgrupadas[nombreBase].vuelta = objRuta;
        });

        renderizarPanel();

    }).catch(e => {
        console.error("Error conectando a Firebase:", e);
        document.getElementById('lines-container').innerHTML = "<p>Error al cargar las rutas.</p>";
    });
}

// --- 8. RENDERIZADO DEL PANEL LATERAL ---
function renderizarPanel() {
    let html = "";
    let hayLineas = false;

    for (const [nombreLinea, infoLinea] of Object.entries(lineasAgrupadas)) {
        hayLineas = true;
        
        let htmlIda = "";
        if (infoLinea.ida) {
            htmlIda = `
            <div class="toggle-row">
                <span><span class="color-dot" style="background:${infoLinea.ida.color}"></span> Ida</span>
                <label class="switch">
                  <input type="checkbox" onchange="toggleCapa('${nombreLinea}', 'ida', this.checked)">
                  <span class="slider round ida"></span>
                </label>
            </div>`;
        }

        let htmlVuelta = "";
        if (infoLinea.vuelta) {
            htmlVuelta = `
            <div class="toggle-row">
                <span><span class="color-dot" style="background:${infoLinea.vuelta.color}"></span> Vuelta</span>
                <label class="switch">
                  <input type="checkbox" onchange="toggleCapa('${nombreLinea}', 'vuelta', this.checked)">
                  <span class="slider round vuelta"></span>
                </label>
            </div>`;
        }

        let etiquetaTarifa = obtenerTarifaActual(infoLinea.tDia, infoLinea.tNoche);

        html += `
        <div class="line-card">
            <h3 class="line-title">🚕 ${nombreLinea}</h3>
            <div class="tarifa-container">
                ${etiquetaTarifa}
            </div>
            ${htmlIda}
            ${htmlVuelta}
        </div>`;
    }

    if (!hayLineas) {
        html = "<p style='text-align:center;'>No se encontraron líneas en la base de datos.</p>";
    }

    document.getElementById('lines-container').innerHTML = html;
}

window.toggleCapa = function(nombreBase, direccion, isChecked) {
    let ruta = lineasAgrupadas[nombreBase][direccion];
    if (isChecked) {
        ruta.capa.addTo(map);
        ruta.visible = true;
        map.fitBounds(ruta.capa.getBounds(), { padding: [40, 40] });
    } else {
        map.removeLayer(ruta.capa);
        ruta.visible = false;
    }
}

// --- 9. CONTROL DE PESTAÑAS ---
window.cambiarPestana = function(pestana) {
    const tabs = document.querySelectorAll('.tab');
    const contentDestinos = document.getElementById('tab-destinos');
    const contentLineas = document.getElementById('tab-lineas');

    tabs.forEach(t => { t.classList.remove('active'); t.classList.add('inactive'); });
    contentDestinos.classList.remove('active');
    contentLineas.classList.remove('active');

    if(pestana === 'destinos') {
        tabs[0].classList.remove('inactive'); 
        tabs[0].classList.add('active');
        contentDestinos.classList.add('active');
    } else {
        tabs[1].classList.remove('inactive'); 
        tabs[1].classList.add('active');
        contentLineas.classList.add('active');
    }
}

// --- 10. NAVEGACIÓN A HITOS EXACTOS ---
window.irADestino = function(lat, lng, nombre) {
    const ubicacion = L.latLng(lat, lng);
    if (destinoMarcadorTemp) map.removeLayer(destinoMarcadorTemp);

    destinoMarcadorTemp = L.marker(ubicacion).addTo(map)
        .bindPopup(`<div style="font-family:'Poppins';">📍 <b>${nombre}</b></div>`)
        .openPopup();

    map.flyTo(ubicacion, 16, { animate: true, duration: 1.5 });
    toggleSidePanel();
}

// --- 11. BUSCADOR DINÁMICO CON AUTOCOMPLETADO (DEBOUNCE) ---
window.manejarInputBusqueda = function() {
    const query = document.getElementById('panel-search-input').value.trim();
    const cajaSugerencias = document.getElementById('search-suggestions');

    if (query.length < 3) {
        cajaSugerencias.classList.remove('active');
        return;
    }

    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(async () => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, Arica, Chile&limit=10`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.length > 0) {
                mostrarSugerenciasVisuales(data);
            } else {
                cajaSugerencias.innerHTML = '<li class="suggestion-item">No se encontraron lugares con ese nombre.</li>';
                cajaSugerencias.classList.add('active');
            }
        } catch (error) {
            console.error("Error en búsqueda:", error);
        }
    }, 600);
};

function mostrarSugerenciasVisuales(resultados) {
    const cajaSugerencias = document.getElementById('search-suggestions');
    let html = '';
    
    resultados.forEach(res => {
        const partesNombre = res.display_name.split(',');
        const tituloPrincipal = partesNombre[0];
        const subtituloCalle = partesNombre.slice(1, 3).join(', ').trim(); 
        const tituloSeguro = tituloPrincipal.replace(/'/g, "\\'");

        html += `
            <li class="suggestion-item" onclick="seleccionarSugerencia(${res.lat}, ${res.lon}, '${tituloSeguro}')">
                <span class="suggestion-icon">📍</span>
                <b>${tituloPrincipal}</b><br>
                <small style="color:#888;">${subtituloCalle}</small>
            </li>
        `;
    });

    cajaSugerencias.innerHTML = html;
    cajaSugerencias.classList.add('active');
}

window.seleccionarSugerencia = function(lat, lng, nombre) {
    document.getElementById('panel-search-input').value = nombre;
    document.getElementById('search-suggestions').classList.remove('active');
    irADestino(lat, lng, nombre);
};

window.forzarBusqueda = function() {
    manejarInputBusqueda();
};