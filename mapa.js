/**
 * ian-crystal github
 */

const firebaseConfig = {
  apiKey: "api_key", // no expongas tu api key sin configurar
  authDomain: "linea-map.firebaseapp.com",
  projectId: "linea-map",
  storageBucket: "linea-map.firebasestorage.app",
  messagingSenderId: "messagingSenderId",
  appId: "appId",
  measurementId: "measurementId",
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// configura tu firebase
// no permitas injecciones xss
// verifica logitud de los textos
// recomiendo cambiarse a una db de verdad, firebase aunque es mas simple tiene capacidades muy limitadas

// el codigo se acortaria mucho si usaran react
// podrian uar cloudflare para una url estetica

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidColor(color) {
  return /^#([0-9a-fA-F]{3}){1,2}$/.test(color) || /^[a-zA-Z]+$/.test(color);
}

const App = {
  map: null,
  baseLayer: null,
  userMarker: null,
  currentLatLng: null,
  isDarkMode: false,
  lineasAgrupadas: {},
  destinoMarcadorTemp: null,
  temporizadorBusqueda: null,
  mapInitialized: false,

  entrarInvitado() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("map").style.display = "block";
    document.getElementById("btn-menu").style.display = "block";
    document.getElementById("btn-theme").style.display = "block";
    document.querySelector(".btn-locate").style.display = "flex";
    if (!this.mapInitialized) {
      this.initMap();
      this.mapInitialized = true;
    }
  },

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    document.body.classList.toggle("dark-theme");
    document.getElementById("btn-theme").innerText = this.isDarkMode
      ? "☀️"
      : "🌙"; // evitaria emojis por codificacion, usaria svg
  },

  toggleSidePanel() {
    document.getElementById("side-panel").classList.toggle("active");
  },

  obtenerTarifaActual(tarifaDia = 1000, tarifaNoche = 1300) {
    const hora = new Date().getHours();
    const esNoche = hora >= 22 || hora < 7;
    const precioDia = Number(tarifaDia ?? 1000);
    const precioNoche = Number(tarifaNoche ?? 1300);

    if (esNoche) {
      return `<span class="tarifa-badge noche">🌙 $${precioNoche} (Nocturna)</span>`;
    } else {
      return `<span class="tarifa-badge dia">☀️ $${precioDia} (Diurna)</span>`;
    }
  },

  initMap() {
    const surOeste = L.latLng(-18.55, -70.35);
    const norEste = L.latLng(-18.35, -70.2);
    const limites = L.latLngBounds(surOeste, norEste);

    this.map = L.map("map", {
      center: [-18.4783, -70.3126],
      zoom: 14,
      minZoom: 13,
      maxBounds: limites,
      maxBoundsViscosity: 1.0,
      zoomControl: false,
    });

    this.baseLayer = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19 },
    ).addTo(this.map);

    this.descargarRutas();

    const gpsIcon = L.divIcon({
      className: "user-location-icon",
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    this.userMarker = L.marker([0, 0], { icon: gpsIcon }).addTo(this.map);

    this.map.locate({ watch: true, setView: false, enableHighAccuracy: true });
    this.map.on("locationfound", (e) => {
      this.currentLatLng = e.latlng;
      this.userMarker.setLatLng(e.latlng);
    });
  },

  centrarEnUsuario() {
    if (this.currentLatLng) this.map.setView(this.currentLatLng, 16);
  },

  descargarRutas() {
    const container = document.getElementById("lines-container");
    container.innerHTML = "<p style='text-align:center;'>Cargando líneas…</p>";

    db.collection("lineas")
      .get()
      .then((querySnapshot) => {
        this.lineasAgrupadas = {};

        querySnapshot.forEach((doc) => {
          const datos = doc.data();
          const nombreCrudo = datos.nombre || "Sin Nombre";
          const nombreBase = nombreCrudo
            .replace(/ \((Ida|Vuelta|ida|vuelta)\)/gi, "")
            .trim();

          const colorIda = datos.color_ida || datos.color || "#1e90ff";
          const colorVuelta = datos.color_vuelta || datos.color || "#ba1a3a";

          if (!this.lineasAgrupadas[nombreBase]) {
            this.lineasAgrupadas[nombreBase] = {
              ida: null,
              vuelta: null,
              tDia: datos.tarifaDia ?? 1000,
              tNoche: datos.tarifaNoche ?? 1300,
            };
          }

          const crearCapaGeoJSON = (
            coordenadasTexto,
            tipoDireccion,
            colorEspecifico,
          ) => {
            if (!coordenadasTexto || coordenadasTexto.trim() === "")
              return null;

            try {
              const coords = JSON.parse(coordenadasTexto);
              const featureData = {
                type: "Feature",
                properties: {
                  nombre: `${nombreBase} (${tipoDireccion})`,
                  color: colorEspecifico,
                },
                geometry: { type: "LineString", coordinates: coords },
              };

              const safeNombre = escapeHtml(nombreBase);
              const safeTarifaHtml = this.obtenerTarifaActual(
                datos.tarifaDia,
                datos.tarifaNoche,
              );

              const capaLinea = L.geoJSON(featureData, {
                style: { color: colorEspecifico, weight: 6, opacity: 0.85 },
              }).bindPopup(`
                <div style="text-align:center; font-family: 'Poppins', sans-serif;">
                  <b>🚕 ${safeNombre} (${escapeHtml(tipoDireccion)})</b><br><br>
                  ${safeTarifaHtml}
                </div>
              `);

              const flechasDecorator = L.polylineDecorator(capaLinea, {
                patterns: [
                  {
                    offset: 25,
                    repeat: 80,
                    symbol: L.Symbol.arrowHead({
                      pixelSize: 14,
                      polygon: true,
                      pathOptions: {
                        stroke: true,
                        color: "#ffffff",
                        fillColor: colorEspecifico,
                        fillOpacity: 1,
                        weight: 2,
                      },
                    }),
                  },
                ],
              });

              return {
                capa: capaLinea,
                flechas: flechasDecorator,
                color: colorEspecifico,
                visible: false,
                error: false,
              };
            } catch (error) {
              console.error(
                `Error de parseo en ${nombreBase} (${tipoDireccion}):`,
                error,
              );
              return { error: true };
            }
          };

          if (datos.ruta_ida) {
            this.lineasAgrupadas[nombreBase].ida = crearCapaGeoJSON(
              datos.ruta_ida,
              "Ida",
              colorIda,
            );
          }
          if (datos.ruta_vuelta) {
            this.lineasAgrupadas[nombreBase].vuelta = crearCapaGeoJSON(
              datos.ruta_vuelta,
              "Vuelta",
              colorVuelta,
            );
          }

          if (datos.coordenadas) {
            const esIda = nombreCrudo.toLowerCase().includes("ida");
            const esVuelta = nombreCrudo.toLowerCase().includes("vuelta");

            if (esIda && !this.lineasAgrupadas[nombreBase].ida) {
              this.lineasAgrupadas[nombreBase].ida = crearCapaGeoJSON(
                datos.coordenadas,
                "Ida",
                colorIda,
              );
            } else if (esVuelta && !this.lineasAgrupadas[nombreBase].vuelta) {
              this.lineasAgrupadas[nombreBase].vuelta = crearCapaGeoJSON(
                datos.coordenadas,
                "Vuelta",
                colorVuelta,
              );
            }
          }
        });

        this.renderizarPanel();
      })
      .catch((error) => {
        console.error("Error conectando a Firebase:", error);
        container.innerHTML =
          "<p style='text-align:center; color:red;'>Error al cargar líneas. Intenta de nuevo más tarde.</p>";
      });
  },

  renderizarPanel() {
    let html = "";
    let hayLineas = false;

    for (const [nombreLinea, info] of Object.entries(this.lineasAgrupadas)) {
      hayLineas = true;
      const safeNombre = escapeHtml(nombreLinea);
      let htmlIda = "";
      let htmlVuelta = "";

      if (info.ida && !info.ida.error) {
        const colorIdaSafe = isValidColor(info.ida.color)
          ? info.ida.color
          : "#1e90ff";
        htmlIda = `
          <div class="toggle-row">
            <span><span class="color-dot" style="background:${colorIdaSafe}"></span> Recorrido Ida</span>
            <label class="switch">
              <input type="checkbox" onchange="App.toggleCapa('${escapeHtml(nombreLinea)}', 'ida', this.checked)">
              <span class="slider round ida"></span>
            </label>
          </div>`;
      }

      if (info.vuelta && !info.vuelta.error) {
        const colorVueltaSafe = isValidColor(info.vuelta.color)
          ? info.vuelta.color
          : "#ba1a3a";
        htmlVuelta = `
          <div class="toggle-row">
            <span><span class="color-dot" style="background:${colorVueltaSafe}"></span> Recorrido Vuelta</span>
            <label class="switch">
              <input type="checkbox" onchange="App.toggleCapa('${escapeHtml(nombreLinea)}', 'vuelta', this.checked)">
              <span class="slider round vuelta"></span>
            </label>
          </div>`;
      }

      const tarifa = this.obtenerTarifaActual(info.tDia, info.tNoche);

      if (htmlIda || htmlVuelta) {
        html += `
          <div class="line-card">
            <h3 class="line-title">🚕 ${safeNombre}</h3>
            <div class="tarifa-container">${tarifa}</div>
            ${htmlIda}
            ${htmlVuelta}
          </div>`;
      }
    }

    if (!hayLineas) {
      html =
        "<p style='text-align:center; color:#666;'>No se encontraron líneas configuradas.</p>";
    }

    document.getElementById("lines-container").innerHTML = html;
  },

  toggleCapa(nombreBase, direccion, isChecked) {
    const ruta = this.lineasAgrupadas[nombreBase]?.[direccion];
    if (!ruta || !ruta.capa) return;

    if (isChecked) {
      ruta.capa.addTo(this.map);
      if (ruta.flechas) ruta.flechas.addTo(this.map);
      ruta.visible = true;
      this.map.fitBounds(ruta.capa.getBounds(), { padding: [40, 40] });
    } else {
      this.map.removeLayer(ruta.capa);
      if (ruta.flechas) this.map.removeLayer(ruta.flechas);
      ruta.visible = false;
    }
  },

  cambiarPestana(pestana) {
    const tabs = document.querySelectorAll(".tab");
    const contentDestinos = document.getElementById("tab-destinos");
    const contentLineas = document.getElementById("tab-lineas");

    tabs.forEach((t) => {
      t.classList.remove("active");
      t.classList.add("inactive");
    });
    contentDestinos.classList.remove("active");
    contentLineas.classList.remove("active");

    if (pestana === "destinos") {
      tabs[0].classList.remove("inactive");
      tabs[0].classList.add("active");
      contentDestinos.classList.add("active");
    } else {
      tabs[1].classList.remove("inactive");
      tabs[1].classList.add("active");
      contentLineas.classList.add("active");
    }
  },

  irADestino(lat, lng, nombre) {
    const ubicacion = L.latLng(lat, lng);
    if (this.destinoMarcadorTemp)
      this.map.removeLayer(this.destinoMarcadorTemp);

    const safeNombre = escapeHtml(nombre);
    this.destinoMarcadorTemp = L.marker(ubicacion)
      .addTo(this.map)
      .bindPopup(
        `<div style="font-family:'Poppins';">📍 <b>${safeNombre}</b></div>`,
      )
      .openPopup();

    this.map.flyTo(ubicacion, 16, { animate: true, duration: 1.5 });
    this.toggleSidePanel();
  },

  manejarInputBusqueda() {
    const query = document.getElementById("panel-search-input").value.trim();
    const cajaSugerencias = document.getElementById("search-suggestions");

    if (query.length < 3) {
      cajaSugerencias.classList.remove("active");
      return;
    }

    clearTimeout(this.temporizadorBusqueda);
    this.temporizadorBusqueda = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, Arica, Chile&limit=10&countrycodes=cl`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Error en la búsqueda");
        const data = await response.json();

        if (data.length > 0) {
          this.mostrarSugerenciasVisuales(data);
        } else {
          cajaSugerencias.innerHTML =
            '<li class="suggestion-item">No se encontraron lugares con ese nombre.</li>';
          cajaSugerencias.classList.add("active");
        }
      } catch (error) {
        console.error("Error en búsqueda:", error);
        cajaSugerencias.innerHTML =
          '<li class="suggestion-item">Error al buscar. Intenta de nuevo.</li>';
        cajaSugerencias.classList.add("active");
      }
    }, 600);
  },

  mostrarSugerenciasVisuales(resultados) {
    const caja = document.getElementById("search-suggestions");
    let html = "";

    resultados.forEach((res) => {
      const partes = res.display_name.split(",");
      const titulo = partes[0];
      const subtitulo = partes.slice(1, 3).join(", ").trim();

      html += `
        <li class="suggestion-item" data-lat="${res.lat}" data-lon="${res.lon}" data-nombre="${escapeHtml(titulo)}">
          <span class="suggestion-icon">📍</span>
          <b>${escapeHtml(titulo)}</b><br>
          <small style="color:#888;">${escapeHtml(subtitulo)}</small>
        </li>`;
    });

    caja.innerHTML = html;
    caja.classList.add("active");

    caja.onclick = (e) => {
      const item = e.target.closest(".suggestion-item");
      if (!item) return;
      const lat = parseFloat(item.dataset.lat);
      const lon = parseFloat(item.dataset.lon);
      const nombre = item.dataset.nombre;
      App.seleccionarSugerencia(lat, lon, nombre);
    };
  },

  seleccionarSugerencia(lat, lng, nombre) {
    document.getElementById("panel-search-input").value = nombre;
    document.getElementById("search-suggestions").classList.remove("active");
    this.irADestino(lat, lng, nombre);
  },

  forzarBusqueda() {
    this.manejarInputBusqueda();
  },
};

window.entrarInvitado = () => App.entrarInvitado();
window.toggleTheme = () => App.toggleTheme();
window.toggleSidePanel = () => App.toggleSidePanel();
window.centrarEnUsuario = () => App.centrarEnUsuario();
window.toggleCapa = (nombre, dir, check) => App.toggleCapa(nombre, dir, check);
window.cambiarPestana = (pestana) => App.cambiarPestana(pestana);
window.irADestino = (lat, lng, nombre) => App.irADestino(lat, lng, nombre);
window.manejarInputBusqueda = () => App.manejarInputBusqueda();
window.seleccionarSugerencia = (lat, lng, nombre) =>
  App.seleccionarSugerencia(lat, lng, nombre);
window.forzarBusqueda = () => App.forzarBusqueda();
