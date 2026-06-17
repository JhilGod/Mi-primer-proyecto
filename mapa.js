// Función para iniciar la app
function entrar() {
    document.getElementById('login-screen').style.display = 'none';
    const mapDiv = document.getElementById('map');
    mapDiv.style.display = 'block';
    
    // Inicializar mapa de Arica
    const map = L.map('map').setView([-18.4783, -70.3126], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© Linea Map'
    }).addTo(map);

    // Intentar ubicar al usuario
    map.locate({setView: true, maxZoom: 16});
}