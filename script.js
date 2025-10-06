const SUPABASE_URL = 'https://cbgqhsttlwgsuysrvbjv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZ3Foc3R0bHdnc3V5c3J2Ymp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzOTI5MjksImV4cCI6MjA3NDk2ODkyOX0.6KeFU8zRhTefy2icP59grhD8FEs03wCmSYj2n9jmNRc';

let map, geojsonLayer, data = [];
let charts = { top10: null, region: null, comparativa: null };

const colorPalette = [
  '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b',
  '#d97706', '#b45309', '#92400e', '#78350f', '#451a03'
];

async function init() {
  initMap();
  await loadData();
  updateVisualization();
  document.getElementById('variableSelect').addEventListener('change', updateVisualization);
}

function initMap() {
  map = L.map('map').setView([20, 0], 2);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CartoDB'
  }).addTo(map);
}

async function loadData() {
  const status = document.getElementById('status');
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/world_con_indicadores?select=*`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    
    if (!response.ok) throw new Error('Error al cargar datos');
    data = await response.json();
    status.textContent = `✅ ${data.length} países cargados exitosamente`;
    status.style.background = '#dcfce7';
    status.style.color = '#166534';
    
    updateHeaderStats();
  } catch (error) {
    status.textContent = '❌ Error: ' + error.message;
    status.style.background = '#fee2e2';
    status.style.color = '#991b1b';
  }
}

function updateHeaderStats() {
  const totalPaises = data.length;
  const poblacionTotal = data.reduce((sum, d) => sum + (d.poblacion_2024 || 0), 0);
  const pibTotal = data.reduce((sum, d) => sum + (d.pib_usd_2024 || 0), 0);
  const esperanzaVidaData = data.filter(d => d.esp_vida_2023);
  const esperanzaVida = esperanzaVidaData.length > 0 
    ? esperanzaVidaData.reduce((sum, d) => sum + d.esp_vida_2023, 0) / esperanzaVidaData.length 
    : 0;

  document.getElementById('headerTotalPaises').textContent = totalPaises;
  document.getElementById('headerPoblacionTotal').textContent = formatNumber(poblacionTotal);
  document.getElementById('headerPibTotal').textContent = '$' + formatNumber(pibTotal);
  document.getElementById('headerEsperanzaVida').textContent = esperanzaVida.toFixed(1) + ' años';
}

function formatNumber(num) {
  if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  return num.toLocaleString();
}

function updateVisualization() {
  const variable = document.getElementById('variableSelect').value;
  updateMap(variable);
  updateStats(variable);
  updateCharts(variable);
}

function updateMap(variable) {
  if (geojsonLayer) map.removeLayer(geojsonLayer);

  const values = data.map(d => d[variable]).filter(v => v != null);
  if (values.length === 0) return;
  
  const min = Math.min(...values);
  const max = Math.max(...values);

  function getColor(value) {
    if (value == null) return '#e5e7eb';
    const normalized = (value - min) / (max - min);
    const index = Math.floor(normalized * 9);
    return colorPalette[Math.min(index, 9)];
  }

  geojsonLayer = L.geoJSON(null, {
    style: feature => ({
      fillColor: getColor(feature.properties[variable]),
      weight: 1,
      opacity: 1,
      color: '#94a3b8',
      fillOpacity: 0.8
    }),
    onEachFeature: (feature, layer) => {
      const props = feature.properties;
      const value = props[variable] != null ? props[variable].toLocaleString() : 'Sin datos';
      layer.bindPopup(`
        <strong>${props.NAME}</strong><br>
        ${document.getElementById('variableSelect').selectedOptions[0].text}: ${value}
      `);
    }
  }).addTo(map);

  data.forEach(country => {
    if (country.geom) {
      try {
        const geojson = typeof country.geom === 'string' ? JSON.parse(country.geom) : country.geom;
        geojsonLayer.addData({
          type: 'Feature',
          properties: country,
          geometry: geojson
        });
      } catch (e) {
        console.error('Error parseando geometría:', e);
      }
    }
  });

  updateLegend(variable, min, max);
}

function updateLegend(variable, min, max) {
  const legend = document.getElementById('legend');
  const varName = document.getElementById('variableSelect').selectedOptions[0].text;
  let html = `<div class="legend-title">${varName}</div>`;
  
  for (let i = 9; i >= 0; i--) {
    const value = min + (max - min) * (i / 9);
    html += `
      <div class="legend-item">
        <div class="legend-color" style="background: ${colorPalette[i]}"></div>
        <span>${value.toFixed(1)}</span>
      </div>
    `;
  }
  legend.innerHTML = html;
}

function updateStats(variable) {
  const values = data.map(d => d[variable]).filter(v => v != null);
  if (values.length === 0) return;
  
  const total = data.length;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);

  document.getElementById('totalPaises').textContent = total;
  document.getElementById('promedio').textContent = avg.toFixed(2);
  document.getElementById('maximo').textContent = max.toFixed(2);
  document.getElementById('minimo').textContent = min.toFixed(2);
}

function updateCharts(variable) {
  const sorted = data
    .filter(d => d[variable] != null)
    .sort((a, b) => b[variable] - a[variable])
    .slice(0, 10);

  if (charts.top10) charts.top10.destroy();
  charts.top10 = new Chart(document.getElementById('chartTop10'), {
    type: 'bar',
    data: {
      labels: sorted.map(d => d.NAME),
      datasets: [{
        data: sorted.map(d => d[variable]),
        backgroundColor: '#3b82f6'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { font: { size: 9 } } } }
    }
  });

  if (charts.region) charts.region.destroy();
  const regions = {};
  data.forEach(d => {
    const region = d.WB_A3 ? d.WB_A3.substring(0, 2) : 'OT';
    regions[region] = (regions[region] || 0) + 1;
  });

  charts.region = new Chart(document.getElementById('chartRegion'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(regions),
      datasets: [{
        data: Object.values(regions),
        backgroundColor: colorPalette
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { font: { size: 9 } } } }
    }
  });

  if (charts.comparativa) charts.comparativa.destroy();
  const sample = data.filter(d => d[variable] != null).slice(0, 15);
  charts.comparativa = new Chart(document.getElementById('chartComparativa'), {
    type: 'line',
    data: {
      labels: sample.map(d => d.NAME),
      datasets: [{
        label: 'Valor',
        data: sample.map(d => d[variable]),
        borderColor: '#1e40af',
        backgroundColor: '#3b82f680',
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { font: { size: 8 } } } }
    }
  });
}

init();