/* analysis.js - moved from analyse.html inline script */

let stromChart = null;

// Helper: try to find a key from candidates in an object
function findKey(obj, candidates) {
    if (!obj || typeof obj !== 'object') return null;
    for (const c of candidates) if (c in obj) return c;
    return null;
}

async function loadData() {
    try {
    const rawDate = (document.getElementById("dateInput").value || '').toString().trim();
    // Normalize date for API: accept YYYY-MM-DD or YYYYMMDD (fallback to default)
    let apiDate = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        // date input type="date" gives YYYY-MM-DD -> convert to YYYYMMDD
        apiDate = rawDate.replace(/-/g, '');
    } else if (/^\d{8}$/.test(rawDate)) {
        // already YYYYMMDD
        apiDate = rawDate;
    } else if (rawDate) {
        // try to extract digits and coerce to 8 chars
        const digs = rawDate.replace(/[^0-9]/g, '');
        apiDate = (digs + '00000000').slice(0, 8);
    } else {
        apiDate = '20251001';
    }
    const url = `/api/strompreise?date=${encodeURIComponent(apiDate)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Netzwerkfehler: ${response.status}`);
    let data = await response.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {
            console.warn('API liefert keine Daten (leeres Array). Verwende Demo-Daten. Response:', data);
            // Demo fallback: 96 intervals with a small sinusoidal price pattern
            data = Array.from({length: 96}, (_, i) => ({ position: i+1, preis: (30 + 8 * Math.sin((i/96) * Math.PI * 2)).toFixed(2) }));
        }

        // Inspect sample to detect field names
        const sample = data.slice(0, 3);
        console.log('API sample (first 3):', sample);

        const priceCandidates = ['price', 'Price_Amount', 'Price', 'value', 'price_amount', 'PriceAmount', 'preis', 'Preis'];
        const posCandidates = ['position', 'Position', 'pos', 'index', 'zeit', 'time_index'];

        const priceKey = findKey(sample[0], priceCandidates);
        const posKey = findKey(sample[0], posCandidates);

        if (!priceKey) console.warn('Kein offensichtliches Preis-Feld gefunden. Keys:', Object.keys(sample[0]));
        if (!posKey) console.warn('Kein offensichtliches Positions-Feld gefunden. Keys:', Object.keys(sample[0]));

        // Build labels: use posKey when available, else fall back to index
        const labels = data.map((d, idx) => {
            let k = null;
            if (posKey && d[posKey] != null) k = Number(d[posKey]);
            else k = idx + 1;
            if (!Number.isFinite(k)) k = idx + 1;
            const zero = Number(k) - 1;
            const hour = Math.floor(zero / 4);
            const minute = (zero % 4) * 15;
            return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        });

        // Extract prices, tolerant with commas and strings
        const rawValues = data.map(d => {
            let raw = null;
            if (priceKey && d[priceKey] != null) raw = d[priceKey];
            else if ('price' in d) raw = d.price;
            else if ('Price_Amount' in d) raw = d.Price_Amount;
            else if ('value' in d) raw = d.value;
            else if ('preis' in d) raw = d.preis;
            else if ('Preis' in d) raw = d.Preis;
            if (raw == null) return NaN;
            if (typeof raw === 'string') raw = raw.replace(/,/g, '.').replace(/[^0-9.\-+eE]/g, '');
            return Number(raw);
        });

        // numeric filter for range calc
        const numericValues = rawValues.filter(v => Number.isFinite(v));
        console.log('labels:', labels);
        console.log('rawValues:', rawValues);
        console.log('numericValues (sample):', numericValues.slice(0,10));

        if (numericValues.length === 0) {
            const firstKeys = Object.keys(data[0] || {}).join(', ');
            alert('Keine gültigen Preiswerte zum Anzeigen. Verfügbare Keys im ersten Objekt: ' + firstKeys + '\nSiehe Konsole für Details.');
            console.warn('API first object:', data[0]);
            return;
        }

        // compute y-range with padding
        const minVal = Math.min(...numericValues);
        const maxVal = Math.max(...numericValues);
        const range = maxVal - minVal;
        const padding = range === 0 ? Math.abs(maxVal) * 0.1 || 1 : range * 0.12;
        const yMin = -50;
        const yMax = maxVal + padding;

        const ctx = document.getElementById("stromChart").getContext("2d");
        if (stromChart) stromChart.destroy();

        stromChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Strompreise',
                    data: rawValues,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.18)',
                    fill: true,
                    tension: 0.12,
                    borderWidth: 2,
                    pointRadius: 2,
                    spanGaps: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: "Zeit (15-Minuten-Intervalle)" } },
                    y: { title: { display: true, text: "Preis (€/MWh)" }, min: yMin, max: yMax }
                },
                plugins: {
                    tooltip: { mode: 'index', intersect: false },
                    legend: { display: false }
                }
            }
        });

        // Ensure chart redraws on resize (debounced)
        if (window._stromChartResizeHandler) window.removeEventListener('resize', window._stromChartResizeHandler);
        window._stromChartResizeHandler = (() => {
            let t = null;
            return () => {
                if (t) clearTimeout(t);
                t = setTimeout(() => { try { if (stromChart) stromChart.resize(); } catch(e){} }, 120);
            };
        })();
        window.addEventListener('resize', window._stromChartResizeHandler);

        // update chart title with formatted date (YYYYMMDD -> DD.MM.YYYY), handle YYYY-MM-DD as well
        try {
            const t = document.getElementById('chartTitle');
            function formatDateTitle(yyyymmdd) {
                if (!/^[0-9]{8}$/.test(yyyymmdd)) return '';
                const y = yyyymmdd.slice(0,4);
                const m = yyyymmdd.slice(4,6);
                const d = yyyymmdd.slice(6,8);
                return `${d}.${m}.${y}`;
            }
            if (t) {
                const formatted = formatDateTitle(apiDate);
                if (formatted) t.textContent = `Diagramm für ${formatted}`;
                else t.textContent = `Diagramm für ${rawDate || apiDate}`;
            }
        } catch (e) { console.warn('Could not update chart title', e); }

    } catch (err) {
        console.error('Fehler beim Laden der Daten', err);
        alert('Fehler beim Laden der Daten: ' + err.message);
    }
}

// expose loadData globally so inline onclick still works
window.loadData = loadData;

// --- Dataset helpers: allow adding/removing additional lines to the existing chart ---
function _randomColorHsl(i) {
    const h = (i * 47) % 360; // varied hue
    return `hsl(${h} 70% 55%)`;
}

function _ensureLength(arr, len) {
    const out = new Array(len);
    for (let i = 0; i < len; i++) out[i] = Number.isFinite(arr && arr[i]) ? arr[i] : NaN;
    return out;
}

function addDataset(label, dataArray, color) {
    if (!stromChart) {
        console.warn('addDataset: Chart not initialized yet. Call loadData() first.');
        return;
    }
    const len = (stromChart.data && stromChart.data.labels) ? stromChart.data.labels.length : 0;
    if (!len) {
        console.warn('addDataset: Chart has no labels to align data with.');
        return;
    }
    const data = _ensureLength(dataArray, len);
    const idx = stromChart.data.datasets.length;
    const col = color || _randomColorHsl(idx);
    const ds = {
        label: label || `Series ${idx+1}`,
        data: data,
        borderColor: col,
        backgroundColor: col,
        fill: false,
        tension: 0.12,
        borderWidth: 2,
        pointRadius: 2,
        spanGaps: true
    };

    stromChart.data.datasets.push(ds);

    stromChart.update();
    }

function removeDatasetByLabel(label) {
    if (!stromChart) return;
    const ds = stromChart.data.datasets;
    const i = ds.findIndex(d => d.label === label);
    if (i === -1) { console.warn('removeDatasetByLabel: label not found:', label); return; }
    ds.splice(i, 1);
    stromChart.update();
}

function clearExtraDatasets() {
    if (!stromChart) return;
    if (stromChart.data.datasets.length <= 1) return;
    stromChart.data.datasets = stromChart.data.datasets.slice(0,1);
    stromChart.update();
}

function replacePrimaryData(newDataArray) {
    if (!stromChart) return;
    const len = (stromChart.data && stromChart.data.labels) ? stromChart.data.labels.length : 0;
    stromChart.data.datasets[0].data = _ensureLength(newDataArray, len);
    stromChart.update();
}

function comparisonDay() {
    sendLogToServer("info", "comparisonDay accessed");

    removeDatasetByLabel("Comparison Day");

    const input = document.getElementById("comparison_dateInput");
    if (!input) {
        sendLogToServer("error", "comparison_dateInput not found in DOM");
        return;
    }

    const rawDate = (document.getElementById("comparison_dateInput").value || '').toString().trim();
    sendLogToServer("info", rawDate);

    // Normalize date for API: accept YYYY-MM-DD or YYYYMMDD (fallback to default)
    let apiDate = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        // date input type="date" gives YYYY-MM-DD -> convert to YYYYMMDD
        apiDate = rawDate.replace(/-/g, '');
    } else if (/^\d{8}$/.test(rawDate)) {
        // already YYYYMMDD
        apiDate = rawDate;
    } else if (rawDate) {
        // try to extract digits and coerce to 8 chars
        const digs = rawDate.replace(/[^0-9]/g, '');
        apiDate = (digs + '00000000').slice(0, 8);
    } else {
        apiDate = '20251001';
    }

    sendLogToServer("info", apiDate);

    fetch(`/api/strompreise/comparison?date=${encodeURIComponent(apiDate)}`)
        .then(r => {
            sendLogToServer("info", "fehler Prüfung");
            if (!r.ok) throw new Error('Netzwerkfehler ' + r.status);
            return r.text();
        })
        .then( text => {
            sendLogToServer("info", "Rohantwort erhalten: " + text.slice(0, 200));
            let arr;
            try {
                arr = JSON.parse(text);
                sendLogToServer("info", "parse successful: " + arr);
            } catch (err) {
                sendLogToServer("error", "Fehler beim JSON-Parse: " + err.message);
                throw err;
            }
            sendLogToServer("info", "prüfen auf leeres Array");
            if (!Array.isArray(arr) || arr.length === 0) {
                sendLogToServer("error", "Antwort ist kein Array: " + JSON.stringify(arr));
                sendLogToServer("error", "leeres Array");
                console.warn('comparison API returned empty, falling back to client-side shift');
                const base = stromChart.data.datasets[0].data.slice();
                const shifted = makeShifted(base, 4 * 24);
                addDataset('Comparison Day', shifted, 'rgba(10, 99, 241, 0.9)');
                return;
            }
            sendLogToServer("info", "daten verarbeitung");
            const vals = arr.map(o => {
                let raw = null;
                if (o.preis != null) raw = o.preis;
                else if (o.Price_Amount != null) raw = o.Price_Amount;
                else if (o.value != null) raw = o.value;
                if (raw == null) return NaN;
                if (typeof raw === 'string') raw = raw.replace(/,/g, '.').replace(/[^0-9.\-+eE]/g, '');
                return Number(raw);
            });
            sendLogToServer("info", vals);
            addDataset('Comparison Day', vals, 'rgba(10, 99, 241, 0.9)');
        })
        .catch(err => {
            sendLogToServer("error", "catch error");
            sendLogToServer("error", err);
            console.error('Fehler beim Laden der Comparison Day:', err);
            const base = stromChart.data.datasets[0].data.slice();
            const shifted = makeShifted(base, 4 * 24);
            addDataset('Comparison Day', shifted, 'rgba(10, 99, 241, 0.9)');
        });
}

function get_avgOnDate() {
    sendLogToServer("info", "avgOnDate accessed");

    removeDatasetByLabel("AVG on Date");

    const input = document.getElementById("avgOnDate_dateInput");
    if (!input) {
        sendLogToServer("error", "avgOnDate_dateInput not found in DOM");
        return;
    }

    const rawDate = (document.getElementById("avgOnDate_dateInput").value || '').toString().trim();
    sendLogToServer("info", rawDate);

    let apiDate = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        // date input type="date" gives YYYY-MM-DD -> convert to YYYYMMDD
        apiDate = rawDate.replace(/-/g, '');
    } else if (/^\d{8}$/.test(rawDate)) {
        // already YYYYMMDD
        apiDate = rawDate;
    } else if (rawDate) {
        // try to extract digits and coerce to 8 chars
        const digs = rawDate.replace(/[^0-9]/g, '');
        apiDate = (digs + '00000000').slice(0, 8);
    } else {
        apiDate = '20251001';
    }

    sendLogToServer("info", apiDate);

    fetch(`/api/strompreise/avgOnDate?date=${encodeURIComponent(apiDate)}`)
        .then(r => {
            sendLogToServer("info", "fehler Prüfung");
            if (!r.ok) throw new Error('Netzwerkfehler ' + r.status);
            return r.json();
        })
        .then(arr => {
            sendLogToServer("info", "prüfen auf leeres Array");
            if (!Array.isArray(arr) || arr.length === 0) {
                console.warn('AVG on Date returned empty, falling back to client-side shift');
                const base = stromChart.data.datasets[0].data.slice();
                const ma = movingAverage(base, 9);
                addDataset('AVG on Date', ma, 'rgba(255,165,0,0.9)');
                return;
            }

            sendLogToServer("info", "daten verarbeitung")
            const vals = arr.map(o => {
                let raw = null;
                if (o.preis != null) raw = o.preis;
                else if (o.Price_Amount != null) raw = o.Price_Amount;
                else if (o.value != null) raw = o.value;
                if (raw == null) return NaN;
                if (typeof raw === 'string') raw = raw.replace(/,/g, '.').replace(/[^0-9.\-+eE]/g, '');
                return Number(raw);
            });
            addDataset('AVG on Date', vals, 'rgba(255,165,0,0.9)');
        })
        .catch(err => {
            console.error('Fehler beim Laden der AVG on Date:', err);

            const base = stromChart.data.datasets[0].data.slice();
            const ma = movingAverage(base, 9);
            addDataset('AVG on Date', ma, 'rgba(255,165,0,0.9)');
        });
}


// expose helpers globally
window.addDataset = addDataset;
window.removeDatasetByLabel = removeDatasetByLabel;
window.clearExtraDatasets = clearExtraDatasets;
window.replacePrimaryData = replacePrimaryData;

// init on DOM ready: set default date and load
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('dateInput');
    if (input && !input.value) {
        // set sensible default depending on input type
        if (input.type === 'date') input.value = '2025-10-01';
        else input.value = '20251001';
    }
    loadData();
    
    // wire up checkbox UI (Dayaverage, Vorjahr)
    const cbDayaverage = document.getElementById('cb_dayaverage');
    const cbLastYear = document.getElementById('cb_lastyear');
    const cbWorkweekaverage = document.getElementById('cb_workweekaverage')
    const cbWorkweekavg = document.getElementById('cb_workweekavg')

    function makeShifted(values, shift) {
        // shift array by 'shift' positions (circular), fill missing with NaN
        const len = values.length;
        const out = new Array(len).fill(NaN);
        for (let i = 0; i < len; i++) {
            const j = i - shift;
            if (j >= 0 && j < len) out[i] = Number.isFinite(values[j]) ? values[j] : NaN;
        }
        return out;
    }
    function movingAverage(values, window=5) {
        const n = values.length;
        const out = new Array(n).fill(NaN);
        for (let i = 0; i < n; i++) {
            let sum = 0, cnt = 0;
            for (let k = i - Math.floor(window/2); k <= i + Math.floor(window/2); k++) {
                if (k>=0 && k<n && Number.isFinite(values[k])) { sum += values[k]; cnt++; }
            }
            if (cnt>0) out[i] = sum / cnt;
        }
        return out;
    }

    function ensureInitAndThen(cb) {
        if (!stromChart) {
            // wait until chart is initialized
            setTimeout(() => ensureInitAndThen(cb), 80);
            return;
        }
        cb();
    }

    if (cbDayaverage) cbDayaverage.addEventListener('change', (e) => {
        ensureInitAndThen(() => {
            // normalize date from input similar to loadData
            const raw = (document.getElementById('dateInput').value || '').toString().trim();
            let apiDateLocal = '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) apiDateLocal = raw.replace(/-/g, '');
            else if (/^\d{8}$/.test(raw)) apiDateLocal = raw;
            else if (raw) apiDateLocal = (raw.replace(/[^0-9]/g, '') + '00000000').slice(0,8);
            else apiDateLocal = document.getElementById('dateInput').type === 'date' ? '20251001' : '20251001';

            if (e.target.checked) {
                fetch(`/api/strompreise/dayaverage?date=${encodeURIComponent(apiDateLocal)}`)
                    .then(r => {
                        if (!r.ok) throw new Error('Netzwerkfehler ' + r.status);
                        return r.json();
                    })
                    .then(arr => {
                        if (!Array.isArray(arr) || arr.length === 0) {
                            console.warn('Dayaverage API returned empty, falling back to client-side moving average');
                            const base = stromChart.data.datasets[0].data.slice();
                            const ma = movingAverage(base, 9);
                            addDataset('Dayaverage', ma, 'rgba(255,165,0,0.9)');
                            return;
                        }
                        // parse response objects to numeric array
                        const vals = arr.map(o => {
                            let raw = null;
                            if (o.preis != null) raw = o.preis;
                            else if (o.Price_Amount != null) raw = o.Price_Amount;
                            else if (o.value != null) raw = o.value;
                            if (raw == null) return NaN;
                            if (typeof raw === 'string') raw = raw.replace(/,/g, '.').replace(/[^0-9.\-+eE]/g, '');
                            return Number(raw);
                        });
                        addDataset('Dayaverage', vals, 'rgba(255,165,0,0.9)');
                    })
                    .catch(err => {
                        console.error('Fehler beim Laden der Dayaverage:', err);
                        // fallback to client MA
                        const base = stromChart.data.datasets[0].data.slice();
                        const ma = movingAverage(base, 9);
                        addDataset('Dayaverage', ma, 'rgba(255,165,0,0.9)');
                    });
            } else {
                removeDatasetByLabel('Dayaverage');
            }
        });
    });
    if (cbLastYear) cbLastYear.addEventListener('change', (e) => {
        ensureInitAndThen(() => {
            // normalize date from input similar to loadData
            const raw = (document.getElementById('dateInput').value || '').toString().trim();
            let apiDateLocal = '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) apiDateLocal = raw.replace(/-/g, '');
            else if (/^\d{8}$/.test(raw)) apiDateLocal = raw;
            else if (raw) apiDateLocal = (raw.replace(/[^0-9]/g, '') + '00000000').slice(0,8);
            else apiDateLocal = document.getElementById('dateInput').type === 'date' ? '20251001' : '20251001';

            if (e.target.checked) {
                fetch(`/api/strompreise/lastyear?date=${encodeURIComponent(apiDateLocal)}`)
                    .then(r => {
                        if (!r.ok) throw new Error('Netzwerkfehler ' + r.status);
                        return r.json();
                    })
                    .then(arr => {
                        if (!Array.isArray(arr) || arr.length === 0) {
                            console.warn('lastyear API returned empty, falling back to client-side shift');
                            const base = stromChart.data.datasets[0].data.slice();
                            const shifted = makeShifted(base, 4 * 24);
                            addDataset('Vorjahr', shifted, 'rgba(100,160,255,0.9)');
                            return;
                        }
                        const vals = arr.map(o => {
                            let raw = null;
                            if (o.preis != null) raw = o.preis;
                            else if (o.Price_Amount != null) raw = o.Price_Amount;
                            else if (o.value != null) raw = o.value;
                            if (raw == null) return NaN;
                            if (typeof raw === 'string') raw = raw.replace(/,/g, '.').replace(/[^0-9.\-+eE]/g, '');
                            return Number(raw);
                        });
                        addDataset('Vorjahr', vals, 'rgba(100,160,255,0.9)');
                    })
                    .catch(err => {
                        console.error('Fehler beim Laden der LastYear:', err);
                        const base = stromChart.data.datasets[0].data.slice();
                        const shifted = makeShifted(base, 4 * 24);
                        addDataset('Vorjahr', shifted, 'rgba(100,160,255,0.9)');
                    });
            } else {
                removeDatasetByLabel('Vorjahr');
            }
        });
    });
    if (cbWorkweekaverage) cbWorkweekaverage.addEventListener('change', (e) => {
        ensureInitAndThen(() => {
            if (e.target.checked) {
                fetch(`/api/strompreise/workweekaverage_position`)
                    .then(r => {
                        if (!r.ok) throw new Error('Netzwerkfehler ' + r.status);
                        return r.json();
                    })
                    .then(arr => {
                        if (!Array.isArray(arr) || arr.length === 0) {
                            console.warn('workweekaverage API returned empty, falling back to client-side shift');
                            const base = stromChart.data.datasets[0].data.slice();
                            const shifted = makeShifted(base, 4 * 24);
                            addDataset('AVG Arbeitswoche', shifted, 'rgba(43, 93, 173, 0.9)');
                            return;
                        }
                        const vals = arr.map(o => {
                            let raw = null;
                            if (o.preis != null) raw = o.preis;
                            else if (o.Price_Amount != null) raw = o.Price_Amount;
                            else if (o.value != nunll) raw = o.value;
                            if (raw == null) return NaN;
                            if (typeof raw === 'string') raw = raw.replace(/,/g, '.').replace(/[^0-9.\-+eE]/g, '');
                            return Number(raw);
                        });
                        addDataset('AVG Arbeitswoche', vals, 'rgba(43, 93, 173, 0.9)');
                    })
                    .catch(err => {
                        console.error('Fehler beim Laden der Workweekaverage:', err);
                        const base = stromChart.data.datasets[0].data.slice();
                        const shifted = makeShifted(base, 4 * 24);
                        addDataset('AVG Arbeitswoche', shifted, 'rgba(43, 93, 173, 0.9)');
                    });
            } else {
                    removeDatasetByLabel('AVG Arbeitswoche');
            }
        });
    });

    if (cbWorkweekavg) cbWorkweekavg.addEventListener('change', (e) => {
        if (e.target.checked) {
                fetch(`/api/strompreise/workweekavg`)
                    .then(r => {
                        if (!r.ok) throw new Error('Netzwerkfehler ' + r.status);
                        return r.json();
                    })
                    .then(arr => {
                        if (!Array.isArray(arr) || arr.length === 0) {
                            console.warn('Workweekavg API returned empty, falling back to client-side moving average');
                            const base = stromChart.data.datasets[0].data.slice();
                            const ma = movingAverage(base, 9);
                            addDataset('AVG Arbeitswoche', ma, 'rgba(255,165,0,0.9)');
                            return;
                        }
                        // parse response objects to numeric array
                        const vals = arr.map(o => {
                            let raw = null;
                            if (o.preis != null) raw = o.preis;
                            else if (o.Price_Amount != null) raw = o.Price_Amount;
                            else if (o.value != null) raw = o.value;
                            if (raw == null) return NaN;
                            if (typeof raw === 'string') raw = raw.replace(/,/g, '.').replace(/[^0-9.\-+eE]/g, '');
                            return Number(raw);
                        });
                        addDataset('AVG Arbeitswoche', vals, 'rgba(255,165,0,0.9)');
                    })
                    .catch(err => {
                        console.error('Fehler beim Laden der AVG Arbeitswoche:', err);
                        // fallback to client MA
                        const base = stromChart.data.datasets[0].data.slice();
                        const ma = movingAverage(base, 9);
                        addDataset('AVG Arbeitswoche', ma, 'rgba(255,165,0,0.9)');
                    });
            } else {
                removeDatasetByLabel('AVG Arbeitswoche');
            }
    });
});

function sendLogToServer(level, message) {
    fetch("/client-log", {
        method: "Post",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ level, message, timestamp: new Date().toISOString() }),
    }).catch((err) => console.error("Fehler beim Senden des Logs:", err));
}