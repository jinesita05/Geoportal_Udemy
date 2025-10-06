// Variables globales
const supabaseUrl = 'https://cbgqhsttlwgsuysrvbjv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZ3Foc3R0bHdnc3V5c3J2Ymp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzOTI5MjksImV4cCI6MjA3NDk2ODkyOX0.6KeFU8zRhTefy2icP59grhD8FEs03wCmSYj2n9jmNRc';

let map, currentBasemap, layerGroups = {}, barrioLayer = null;
let distanceMode = false;
let distanceMarker = null;
let distanceLines = [];
let puntosServicio = { bomberos: [], policia: [], salud: [] };

// Mapas base disponibles
const basemaps = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>'
    }),
    topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
    })
};

const capas = [
    { nombre: 'agua_potable', tipo: 'polygon', color: '#2196F3', label: 'Agua Potable', icon: 'fa-tint' },
    { nombre: 'alcantarillado', tipo: 'line', color: '#795548', label: 'Alcantarillado', icon: 'fa-road' },
    { nombre: 'barrios', tipo: 'polygon', color: '#FFC107', label: 'Barrios', icon: 'fa-map' },
    { nombre: 'bomberos_wgs84', tipo: 'point', color: '#F44336', label: 'Bomberos', icon: 'fa-fire-extinguisher' },
    { nombre: 'policia_wgs84', tipo: 'point', color: '#3F51B5', label: 'Policía', icon: 'fa-shield-alt' },
    { nombre: 'salud_wgs84', tipo: 'point', color: '#4CAF50', label: 'Salud', icon: 'fa-hospital' }
];

document.addEventListener('DOMContentLoaded', function() {
    inicializarMapa();
    inicializarCapas();
    inicializarBasemaps();
    cargarPuntosServicio();
    
    document.getElementById('search-input').addEventListener('input', function(e) {
        buscarBarrios(e.target.value);
    });
    
    document.getElementById('distance-mode-btn').addEventListener('click', toggleDistanceMode);
    
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-box')) {
            document.getElementById('search-results').style.display = 'none';
        }
    });
});

function inicializarMapa() {
    map = L.map('map').setView([-1.8312, -78.1834], 6);
    currentBasemap = basemaps.osm.addTo(map);
    map.on('click', onMapClick);
}

function inicializarBasemaps() {
    const opciones = document.querySelectorAll('.basemap-option');
    
    opciones.forEach(opcion => {
        opcion.addEventListener('click', function() {
            const tipo = this.dataset.basemap;
            
            opciones.forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            
            if (currentBasemap) {
                map.removeLayer(currentBasemap);
            }
            
            currentBasemap = basemaps[tipo].addTo(map);
        });
    });
}

function inicializarCapas() {
    const container = document.getElementById('layers-container');
    
    capas.forEach(capa => {
        const div = document.createElement('div');
        div.className = 'layer-item';
        div.innerHTML = `
            <input type="checkbox" id="layer_${capa.nombre}">
            <div class="layer-color" style="background-color: ${capa.color}"></div>
            <i class="fas ${capa.icon} layer-icon"></i>
            <span class="layer-label">${capa.label}</span>
        `;
        
        const checkbox = div.querySelector('input');
        checkbox.addEventListener('change', () => {
            toggleLayer(capa);
            actualizarLeyenda();
        });
        
        container.appendChild(div);
    });
}

function actualizarLeyenda() {
    const legendContent = document.getElementById('legend-content');
    const legend = document.getElementById('legend');
    let html = '';
    let tieneCapasActivas = false;
    
    capas.forEach(capa => {
        const checkbox = document.getElementById(`layer_${capa.nombre}`);
        if (checkbox && checkbox.checked) {
            tieneCapasActivas = true;
            let simboloClass = 'legend-symbol';
            if (capa.tipo === 'line') simboloClass += ' line';
            if (capa.tipo === 'point') simboloClass += ' point';
            
            html += `
                <div class="legend-item">
                    <div class="${simboloClass}" style="background-color: ${capa.color}"></div>
                    <span>${capa.label}</span>
                </div>
            `;
        }
    });
    
    legendContent.innerHTML = html;
    
    if (tieneCapasActivas) {
        legend.classList.add('show');
    } else {
        legend.classList.remove('show');
    }
}

async function cargarPuntosServicio() {
    const servicios = [
        { nombre: 'bomberos_wgs84', key: 'bomberos' },
        { nombre: 'policia_wgs84', key: 'policia' },
        { nombre: 'salud_wgs84', key: 'salud' }
    ];
    
    for (const servicio of servicios) {
        try {
            const response = await fetch(`${supabaseUrl}/rest/v1/${servicio.nombre}?select=gid,geom`, {
                headers: { 
                    'apikey': supabaseKey, 
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            
            const datos = await response.json();
            puntosServicio[servicio.key] = datos.map(d => {
                try {
                    const geom = typeof d.geom === 'string' ? JSON.parse(d.geom) : d.geom;
                    return { 
                        id: d.gid, 
                        coords: geom.coordinates 
                    };
                } catch (e) {
                    console.error('Error procesando geometría:', e);
                    return null;
                }
            }).filter(item => item !== null);
            
        } catch (e) {
            console.error(`Error cargando ${servicio.nombre}:`, e);
            puntosServicio[servicio.key] = [];
        }
    }
}

function toggleDistanceMode() {
    distanceMode = !distanceMode;
    const btn = document.getElementById('distance-mode-btn');
    
    if (distanceMode) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-times"></i> Desactivar Modo Medición';
        map.getContainer().style.cursor = 'crosshair';
        mostrarStatus('Haz clic en el mapa para medir distancias a servicios', '#e94560');
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-ruler-combined"></i> Modo Medición de Distancia';
        map.getContainer().style.cursor = '';
        limpiarMediciones();
        ocultarStatus();
    }
}

function onMapClick(e) {
    if (!distanceMode) return;
    
    limpiarMediciones();
    
    distanceMarker = L.marker(e.latlng, {
        icon: L.divIcon({
            className: 'distance-marker',
            html: '<div style="background: #e94560; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3);"></div>',
            iconSize: [24, 24]
        })
    }).addTo(map);
    
    calcularDistancias(e.latlng);
}

function calcularDistancias(latlng) {
    const distancias = {
        bomberos: { distancia: Infinity, coords: null },
        policia: { distancia: Infinity, coords: null },
        salud: { distancia: Infinity, coords: null }
    };
    
    for (const [tipo, puntos] of Object.entries(puntosServicio)) {
        puntos.forEach(punto => {
            if (punto && punto.coords) {
                const puntoLatLng = L.latLng(punto.coords[1], punto.coords[0]);
                const dist = latlng.distanceTo(puntoLatLng);
                
                if (dist < distancias[tipo].distancia) {
                    distancias[tipo].distancia = dist;
                    distancias[tipo].coords = puntoLatLng;
                }
            }
        });
    }
    
    const infoDiv = document.getElementById('distance-info');
    let html = '<h3><i class="fas fa-ruler-combined"></i> Distancias a Servicios</h3>';
    
    const configServicios = {
        bomberos: { color: '#F44336', icon: 'fa-fire-extinguisher', nombre: 'Bomberos' },
        policia: { color: '#3F51B5', icon: 'fa-shield-alt', nombre: 'Policía' },
        salud: { color: '#4CAF50', icon: 'fa-hospital', nombre: 'Salud' }
    };
    
    for (const [tipo, datos] of Object.entries(distancias)) {
        if (datos.coords && datos.distancia < Infinity) {
            const config = configServicios[tipo];
            
            const line = L.polyline([latlng, datos.coords], {
                color: config.color,
                weight: 3,
                opacity: 0.7,
                dashArray: '10, 10'
            }).addTo(map);
            distanceLines.push(line);
            
            html += `
                <div class="distance-item">
                    <i class="fas ${config.icon}"></i>
                    <strong>${config.nombre}</strong><br>
                    ${(datos.distancia / 1000).toFixed(2)} km (${datos.distancia.toFixed(0)} metros)
                </div>
            `;
        }
    }
    
    infoDiv.innerHTML = html;
    infoDiv.style.display = 'block';
}

function limpiarMediciones() {
    if (distanceMarker) {
        map.removeLayer(distanceMarker);
        distanceMarker = null;
    }
    
    distanceLines.forEach(line => map.removeLayer(line));
    distanceLines = [];
    
    document.getElementById('distance-info').style.display = 'none';
}

async function buscarBarrios(termino) {
    const resultsDiv = document.getElementById('search-results');
    
    if (termino.length < 2) {
        resultsDiv.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(
            `${supabaseUrl}/rest/v1/barrios?select=gid,barrio,geom&barrio=ilike.*${termino}*`, 
            {
                headers: { 
                    'apikey': supabaseKey, 
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const barrios = await response.json();
        resultsDiv.innerHTML = '';
        
        if (barrios.length > 0) {
            barrios.forEach(barrio => {
                const div = document.createElement('div');
                div.className = 'search-result';
                div.innerHTML = `<i class="fas fa-map-marker-alt"></i>${barrio.barrio}`;
                div.addEventListener('click', () => seleccionarBarrio(barrio));
                resultsDiv.appendChild(div);
            });
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.innerHTML = '<div class="search-result"><i class="fas fa-exclamation-circle"></i>No se encontraron barrios</div>';
            resultsDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error en búsqueda:', error);
        resultsDiv.innerHTML = '<div class="search-result"><i class="fas fa-exclamation-triangle"></i>Error en la búsqueda</div>';
        resultsDiv.style.display = 'block';
    }
}

async function seleccionarBarrio(barrio) {
    const searchInput = document.getElementById('search-input');
    const resultsDiv = document.getElementById('search-results');
    const infoDiv = document.getElementById('barrio-info');
    
    searchInput.value = barrio.barrio;
    resultsDiv.style.display = 'none';
    
    if (barrioLayer) {
        map.removeLayer(barrioLayer);
        barrioLayer = null;
    }
    
    infoDiv.innerHTML = '<h3><i class="fas fa-spinner loading"></i>Cargando información...</h3>';
    infoDiv.style.display = 'block';
    
    try {
        const geojson = typeof barrio.geom === 'string' ? JSON.parse(barrio.geom) : barrio.geom;
        
        barrioLayer = L.geoJSON(geojson, {
            style: { 
                color: '#FF1744', 
                weight: 4, 
                fillColor: '#FF1744', 
                fillOpacity: 0.2 
            }
        }).addTo(map);
        
        const bounds = barrioLayer.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
        
        const estadisticas = await calcularEstadisticasBarrio(barrio);
        mostrarInfoBarrio(barrio.barrio, estadisticas);
        
    } catch (error) {
        console.error('Error al mostrar barrio:', error);
        infoDiv.innerHTML = '<h3><i class="fas fa-exclamation-triangle"></i>Error al cargar información del barrio</h3>';
    }
}

async function calcularEstadisticasBarrio(barrio) {
    try {
        const response = await fetch(
            `${supabaseUrl}/rest/v1/rpc/estadisticas_barrio`, 
            {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ id_barrio: barrio.gid })
            }
        );
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const datos = await response.json();
        
        if (datos && datos.length > 0) {
            return datos[0];
        } else {
            throw new Error('No se obtuvieron datos del barrio');
        }
    } catch (error) {
        console.error('Error calculando estadísticas:', error);
        return {
            barrio: barrio.barrio,
            total_bomberos: 0,
            total_policia: 0,
            total_salud: 0,
            metros_alcantarillado: 0,
            metros_cuadrados_agua: 0
        };
    }
}

function mostrarInfoBarrio(nombreBarrio, stats) {
    const infoDiv = document.getElementById('barrio-info');
    const kmAlcantarillado = (stats.metros_alcantarillado / 1000).toFixed(2);
    const areaAgua = stats.metros_cuadrados_agua.toFixed(2);
    
    infoDiv.innerHTML = `
        <h3><i class="fas fa-map-marker-alt"></i>${nombreBarrio}</h3>
        <div class="stat">
            <i class="fas fa-road"></i>
            <span>Alcantarillado: ${kmAlcantarillado} km</span>
        </div>
        <div class="stat">
            <i class="fas fa-tint"></i>
            <span>Agua potable: ${areaAgua} m²</span>
        </div>
        <div class="stat">
            <i class="fas fa-fire-extinguisher"></i>
            <span>Bomberos: ${stats.total_bomberos}</span>
        </div>
        <div class="stat">
            <i class="fas fa-shield-alt"></i>
            <span>Policía: ${stats.total_policia}</span>
        </div>
        <div class="stat">
            <i class="fas fa-hospital"></i>
            <span>Salud: ${stats.total_salud}</span>
        </div>
    `;
    infoDiv.style.display = 'block';
}

function toggleLayer(capa) {
    const checkbox = document.getElementById(`layer_${capa.nombre}`);
    
    if (checkbox.checked) {
        cargarCapa(capa);
    } else {
        if (layerGroups[capa.nombre]) {
            map.removeLayer(layerGroups[capa.nombre]);
            delete layerGroups[capa.nombre];
        }
    }
}

async function cargarCapa(capa) {
    mostrarStatus(`<i class="fas fa-spinner loading"></i>Cargando ${capa.label}...`, '#16213e');
    
    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/${capa.nombre}?select=*`, {
            headers: { 
                'apikey': supabaseKey, 
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const datos = await response.json();
        
        if (layerGroups[capa.nombre]) {
            map.removeLayer(layerGroups[capa.nombre]);
        }
        
        const layerGroup = L.layerGroup();
        let featuresAdded = 0;
        let combinedBounds = null;
        
        datos.forEach(feature => {
            if (!feature.geom) return;
            
            try {
                const geojson = typeof feature.geom === 'string' ? JSON.parse(feature.geom) : feature.geom;
                
                const layer = L.geoJSON(geojson, {
                    style: function() {
                        return {
                            color: capa.color,
                            weight: capa.tipo === 'line' ? 3 : 2,
                            fillColor: capa.color,
                            fillOpacity: capa.tipo === 'polygon' ? 0.3 : 0
                        };
                    },
                    pointToLayer: function(feature, latlng) {
                        return L.circleMarker(latlng, {
                            radius: 6,
                            fillColor: capa.color,
                            color: '#fff',
                            weight: 1,
                            fillOpacity: 0.8
                        });
                    }
                });
                
                layer.bindPopup(function() {
                    let html = `<strong>${capa.label}</strong><br>`;
                    Object.keys(feature).forEach(function(key) {
                        if (key !== 'geom' && feature[key] !== null) {
                            html += `<b>${key}:</b> ${feature[key]}<br>`;
                        }
                    });
                    return html;
                });
                
                layerGroup.addLayer(layer);
                featuresAdded++;
                
                const featureBounds = layer.getBounds();
                if (featureBounds && featureBounds.isValid()) {
                    if (!combinedBounds) {
                        combinedBounds = featureBounds;
                    } else {
                        combinedBounds.extend(featureBounds);
                    }
                }
            } catch (e) {
                console.error('Error procesando feature:', e);
            }
        });
        
        if (featuresAdded > 0) {
            layerGroups[capa.nombre] = layerGroup;
            layerGroup.addTo(map);
            
            if (combinedBounds && combinedBounds.isValid()) {
                map.fitBounds(combinedBounds, { padding: [50, 50] });
            }
            
            mostrarStatus(`<i class="fas fa-check-circle"></i> ${capa.label} cargada (${featuresAdded} elementos)`, '#4CAF50');
            setTimeout(ocultarStatus, 3000);
        } else {
            mostrarStatus(`<i class="fas fa-exclamation-triangle"></i> ${capa.label}: no hay geometrías válidas`, '#FF9800');
            document.getElementById(`layer_${capa.nombre}`).checked = false;
        }
    } catch (error) {
        console.error('Error cargando capa:', error);
        mostrarStatus(`<i class="fas fa-exclamation-circle"></i> Error al cargar ${capa.label}`, '#F44336');
        document.getElementById(`layer_${capa.nombre}`).checked = false;
    }
}

function mostrarStatus(texto, color) {
    const status = document.getElementById('status');
    status.innerHTML = texto;
    status.style.backgroundColor = color;
    status.style.color = 'white';
    status.style.display = 'block';
}

function ocultarStatus() {
    document.getElementById('status').style.display = 'none';
}
