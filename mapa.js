// --- VARIABLES GLOBALES ---
let map, baseLayer, userMarker = null, currentLatLng = null;
let isDarkMode = false;
let lineasAgrupadas = {}; 
let destinoMarcadorTemp = null;
let temporizadorBusqueda = null;
let capaParaderos = L.layerGroup();
let favoritos = JSON.parse(localStorage.getItem('favs')) || [];

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

// --- 2. GESTIÓN DE PANTALLAS Y UI ---
window.entrarInvitado = function() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('map').style.display = 'block';
    document.getElementById('top-bar').classList.remove('hidden-ui');
    document.querySelector('.btn-locate').classList.remove('hidden-ui');
    initMap();
};



window.toggleTheme = function() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-theme');
    document.getElementById('btn-theme').innerText = isDarkMode ? '☀️' : '🌙';
};

// --- 3. GESTIÓN DE FAVORITOS (LOCALSTORAGE) ---
window.toggleParaderoFavorito = function(idParadero) {
    if (!idParadero) return;
    const btn = document.getElementById('btn-star-paradero');
    const index = favoritos.indexOf(idParadero);
    
    if (index === -1) {
        favoritos.push(idParadero);
        btn.innerText = "★"; 
        btn.style.color = "#f1c40f";
    } else {
        favoritos.splice(index, 1);
        btn.innerText = "☆"; 
        btn.style.color = "#888";
    }
    localStorage.setItem('favs', JSON.stringify(favoritos));
};

window.verFavoritos = function() {
    if (favoritos.length === 0) { 
        alert("Aún no tienes paraderos guardados en favoritos."); 
        return; 
    }
    alert(`Tienes ${favoritos.length} paraderos guardados en tu navegador.`);
};

// --- 4. TARIFA DINÁMICA ---
function obtenerTarifaActual(tarifaDia, tarifaNoche) {
    const horaLocal = new Date().getHours();
    const esNoche = (horaLocal >= 22 || horaLocal < 7);
    const precioDia = tarifaDia || "1000";
    const precioNoche = tarifaNoche || "1300";
    return esNoche ? `<span class="tarifa-badge noche">🌙 $${precioNoche} (Nocturna)</span>` : `<span class="tarifa-badge dia">☀️ $${precioDia} (Diurna)</span>`;
}

// --- 5. INICIALIZACIÓN DEL MAPA ---
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
    cargarParaderos();

    const gpsIcon = L.divIcon({
        className: 'user-location-icon',
        html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="6" fill="#107c91" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="10" fill="none" stroke="#107c91" stroke-width="2" stroke-dasharray="4 2"/></svg>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
    userMarker = L.marker([0, 0], { icon: gpsIcon }).addTo(map);

    map.locate({ watch: true, setView: false, enableHighAccuracy: true }); 
    map.on('locationfound', (e) => {
        currentLatLng = e.latlng;
        userMarker.setLatLng(e.latlng);
    });

    // Zoom Extremo a nivel de calle (18)
    window.centrarEnUsuario = function() {
        if (currentLatLng) map.setView(currentLatLng, 18);
    };
    
    map.on('click', function() {
        cerrarBottomSheet();
    });

    // CONTROL DE VISIBILIDAD DE AUTITOS POR ZOOM (Solo aparecen cerca, >= 16)
    if (map.getZoom() >= 16) { capaParaderos.addTo(map); }

    map.on('zoomend', function() {
        if (map.getZoom() >= 16) {
            if (!map.hasLayer(capaParaderos)) map.addLayer(capaParaderos);
        } else {
            if (map.hasLayer(capaParaderos)) map.removeLayer(capaParaderos);
        }
    });
}

// --- CONTROL DEL MENÚ LATERAL ---
window.toggleMenu = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    } else {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        renderizarListaLineasGlobal(); // Carga las líneas al abrir
    }
};

window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sidebar-content').forEach(content => content.classList.add('hidden'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.getElementById(`sidebar-${tabName}-content`).classList.remove('hidden');
};

// --- RENDERIZAR LÍNEAS CON SWITCHES ---
function renderizarListaLineasGlobal() {
    const contenedor = document.getElementById('sidebar-lineas-content');
    contenedor.innerHTML = "";

    // Iteramos sobre todas las líneas que descargamos de Firebase
    Object.keys(lineasAgrupadas).forEach(nombreLinea => {
        const info = lineasAgrupadas[nombreLinea];
        
        // Verificamos si están encendidas actualmente en el mapa
        const idaActiva = info.ida && map.hasLayer(info.ida.capa) ? 'checked' : '';
        const vueltaActiva = info.vuelta && map.hasLayer(info.vuelta.capa) ? 'checked' : '';
        
        const colorIda = info.ida ? info.ida.color : '#ccc';
        const colorVuelta = info.vuelta ? info.vuelta.color : '#ccc';

        const tarjeta = document.createElement('div');
        tarjeta.className = 'line-control-card';
        tarjeta.innerHTML = `
            <div class="line-control-header">
                🚕 ${nombreLinea}<br>
                ${obtenerTarifaActual(info.tDia, info.tNoche)}
                <hr>
            </div>
            
            ${info.ida ? `
            <div class="toggle-row">
                <div class="toggle-label">
                    <div class="color-dot" style="background-color: ${colorIda}"></div>
                    Recorrido Ida
                </div>
                <label class="switch">
                    <input type="checkbox" ${idaActiva} onchange="alternarCapaEspecifica('${nombreLinea}', 'ida', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>` : ''}

            ${info.vuelta ? `
            <div class="toggle-row">
                <div class="toggle-label">
                    <div class="color-dot" style="background-color: ${colorVuelta}"></div>
                    Recorrido Vuelta
                </div>
                <label class="switch">
                    <input type="checkbox" ${vueltaActiva} onchange="alternarCapaEspecifica('${nombreLinea}', 'vuelta', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>` : ''}
        `;
        contenedor.appendChild(tarjeta);
    });
}

// --- CONTROLADOR GRANULAR (Solo Ida o Solo Vuelta) ---
window.alternarCapaEspecifica = function(nombreBase, direccion, encender) {
    const info = lineasAgrupadas[nombreBase];
    if (!info) return;

    const objetoRuta = direccion === 'ida' ? info.ida : info.vuelta;
    if (!objetoRuta || !objetoRuta.capa) return;

    if (encender) {
        objetoRuta.capa.addTo(map);
        if (objetoRuta.flechas) objetoRuta.flechas.addTo(map);
        map.fitBounds(objetoRuta.capa.getBounds(), { padding: [40, 40] });
    } else {
        map.removeLayer(objetoRuta.capa);
        if (objetoRuta.flechas) map.removeLayer(objetoRuta.flechas);
    }
};

// Reemplazamos la acción del botón de Favoritos de la barra superior para que abra el Menú
window.verFavoritos = function() {
    toggleMenu();
    switchTab('favs');
};
// --- 6. DESCARGA DESDE FIREBASE (RUTAS GEOGRÁFICAS) ---
function descargarRutas() {
    db.collection("lineas").get().then((querySnapshot) => {
        lineasAgrupadas = {}; 
        querySnapshot.forEach((doc) => {
            const datos = doc.data();
            let nombreCrudo = datos.nombre || "Sin Nombre";
            let nombreBase = nombreCrudo.replace(/ \((Ida|Vuelta|ida|vuelta)\)/gi, "").trim();
            const cIda = datos.color_ida || datos.color || "#1e90ff";
            const cVuelta = datos.color_vuelta || datos.color || "#ba1a3a";
            
            if (!lineasAgrupadas[nombreBase]) {
                lineasAgrupadas[nombreBase] = { ida: null, vuelta: null, tDia: datos.tarifaDia || 1000, tNoche: datos.tarifaNoche || 1300 };
            }

            const crearCapaGeoJSON = (coordenadasTexto, tipoDireccion, colorEspecifico) => {
                if (!coordenadasTexto || coordenadasTexto.trim() === "") return null;
                try {
                    let coordsParseadas = typeof coordenadasTexto === 'string' ? JSON.parse(coordenadasTexto) : coordenadasTexto;
                    const featureData = {
                        "type": "Feature",
                        "properties": { "nombre": `${nombreBase} (${tipoDireccion})`, "color": colorEspecifico },
                        "geometry": { "type": "LineString", "coordinates": coordsParseadas }
                    };
                    
                    let flechas = null;
                    const capa = L.geoJSON(featureData, {
                        style: { color: colorEspecifico, weight: 6, opacity: 0.85 },
                        onEachFeature: function (feature, layer) {
                            flechas = L.polylineDecorator(layer, {
                                patterns: [{ offset: 25, repeat: 80, symbol: L.Symbol.arrowHead({ pixelSize: 14, polygon: true, pathOptions: { stroke: true, color: '#ffffff', fillColor: colorEspecifico, fillOpacity: 1, weight: 2 } }) }]
                            });
                        }
                    }).bindPopup(`<div style="text-align:center; font-family: 'Poppins', sans-serif;"><b>🚕 ${nombreBase} (${tipoDireccion})</b><br><br>${obtenerTarifaActual(datos.tarifaDia || 1000, datos.tarifaNoche || 1300)}</div>`);

                    return { capa: capa, flechas: flechas, color: colorEspecifico, visible: false, error: false };
                } catch (error) {
                    console.error(`Error de parseo en ${nombreBase}:`, error);
                    return { error: true };
                }
            };

            if (datos.ruta_ida) lineasAgrupadas[nombreBase].ida = crearCapaGeoJSON(datos.ruta_ida, "Ida", cIda);
            if (datos.ruta_vuelta) lineasAgrupadas[nombreBase].vuelta = crearCapaGeoJSON(datos.ruta_vuelta, "Vuelta", cVuelta);
            
            if (datos.coordenadas) {
                let esIda = nombreCrudo.toLowerCase().includes("ida");
                let esVuelta = nombreCrudo.toLowerCase().includes("vuelta");
                if (esIda) lineasAgrupadas[nombreBase].ida = crearCapaGeoJSON(datos.coordenadas, "Ida", cIda);
                else if (esVuelta) lineasAgrupadas[nombreBase].vuelta = crearCapaGeoJSON(datos.coordenadas, "Vuelta", cVuelta);
            }
        });
    }).catch(e => { console.error("Error conectando a Firebase (Rutas):", e); });
}

// --- 7. DESCARGA DESDE FIREBASE (PARADEROS/NODOS ESTRATÉGICOS) ---
function cargarParaderos() {
    db.collection("paraderos").get().then((querySnapshot) => {
        if(querySnapshot.empty) {
            console.log("Aún no hay paraderos en Firebase. Crea documentos en la colección 'paraderos'.");
            return;
        }
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            data.id = doc.id; // Asignamos el ID del documento para el sistema de favoritos
            crearMarcadorParadero(data);
        });
    }).catch(e => { 
        console.error("Error al cargar la colección 'paraderos':", e);
    });
}

function crearMarcadorParadero(datos) {
    if (!datos.coordenadas) return;
    
    // Icono SVG elegante
    const iconoAutito = L.divIcon({
        className: 'custom-paradero-icon',
        html: `
            <div style="background: white; border: 2px solid #1a5276; border-radius: 8px; padding: 4px; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#1a5276">
                    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                </svg>
            </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });

    const marker = L.marker([datos.coordenadas.latitude, datos.coordenadas.longitude], { icon: iconoAutito }).addTo(capaParaderos);
    
    marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        abrirBottomSheet(datos);
        map.flyTo([datos.coordenadas.latitude, datos.coordenadas.longitude], 17, { animate: true, duration: 0.8 });
    });
}

// --- 8. LÓGICA DEL BOTTOM SHEET ---
window.abrirBottomSheet = function(datos) {
    document.getElementById('bottom-sheet').classList.add('active');
    document.getElementById('sheet-title').innerText = datos.nombre || "Paradero";
    document.getElementById('sheet-subtitle').innerText = datos.direccion || "";
    
    // Configuración del botón de favoritos
    const btnFav = document.getElementById('btn-star-paradero');
    const idUnico = datos.id || datos.nombre; 
    
    btnFav.onclick = () => toggleParaderoFavorito(idUnico);
    
    if (favoritos.includes(idUnico)) {
        btnFav.innerText = "★"; 
        btnFav.style.color = "#f1c40f";
    } else {
        btnFav.innerText = "☆"; 
        btnFav.style.color = "#888";
    }
    
    // Inyección de botones de líneas
    const contenedorLineas = document.getElementById('sheet-lines');
    contenedorLineas.innerHTML = ""; 
    
    if (datos.lineasQuePasan && datos.lineasQuePasan.length > 0) {
        datos.lineasQuePasan.forEach(info => {
            let nombreLinea = typeof info === 'string' ? info : info.linea;
            let destinoFinal = typeof info === 'string' ? "Ver recorrido en el mapa" : info.destino;
            
            let colorLinea = "#444"; 
            if (lineasAgrupadas[nombreLinea] && lineasAgrupadas[nombreLinea].ida) {
                colorLinea = lineasAgrupadas[nombreLinea].ida.color;
            }
            
            const card = document.createElement('button');
            card.className = 'line-destination-card';
            
            card.innerHTML = `
                <div class="line-id" style="background-color: ${colorLinea};">🚕 ${nombreLinea}</div>
                <div class="line-dest-text">
                    <strong>Hacia destino:</strong>
                    ${destinoFinal}
                </div>
            `;
            
            card.onclick = () => alternarRutaEnMapa(nombreLinea);
            contenedorLineas.appendChild(card);
        });
    } else {
        contenedorLineas.innerHTML = "<p style='font-size:13px; color:#888; text-align:center;'>Sin información de líneas en este paradero</p>";
    }
};

window.cerrarBottomSheet = function() {
    document.getElementById('bottom-sheet').classList.remove('active');
};

// --- 10. BUSCADOR DINÁMICO (NOMINATIM) ---
window.manejarInputBusqueda = function() {
    const query = document.getElementById('global-search').value.trim();
    const cajaSugerencias = document.getElementById('search-suggestions');

    if (query.length < 3) {
        cajaSugerencias.classList.remove('active');
        return;
    }

    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(async () => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, Arica, Chile&limit=5`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.length > 0) {
                let html = '';
                data.forEach(res => {
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
            } else {
                cajaSugerencias.innerHTML = '<li class="suggestion-item" style="padding:10px;">No se encontraron lugares.</li>';
                cajaSugerencias.classList.add('active');
            }
        } catch (error) {
            console.error("Error en búsqueda:", error);
        }
    }, 600);
};

window.seleccionarSugerencia = function(lat, lng, nombre) {
    document.getElementById('global-search').value = nombre;
    document.getElementById('search-suggestions').classList.remove('active');
    irADestino(lat, lng, nombre);
};

window.irADestino = function(lat, lng, nombre) {
    const ubicacion = L.latLng(lat, lng);
    if (destinoMarcadorTemp) map.removeLayer(destinoMarcadorTemp);

    destinoMarcadorTemp = L.marker(ubicacion).addTo(map)
        .bindPopup(`<div style="font-family:'Poppins';">📍 <b>${nombre}</b></div>`)
        .openPopup();

    map.flyTo(ubicacion, 17, { animate: true, duration: 1.5 });
};