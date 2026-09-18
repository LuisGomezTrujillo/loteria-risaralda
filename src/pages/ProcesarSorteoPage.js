import React, { useState } from 'react';
import ExcelJS from 'exceljs';

export default function ProcesarSorteoPage() {
  const [excelFile, setExcelFile] = useState(null);
  const [csvResultados, setCsvResultados] = useState(null);
  const [csvPruebas, setCsvPruebas] = useState(null);

  // Valores por defecto
  const DEFAULT_SORTEO = '2966';
  const DEFAULT_FECHA = '2026-09-18';

  // Campos editables para número de sorteo y fecha
  const [numSorteo, setNumSorteo] = useState(DEFAULT_SORTEO);
  const [fechaSorteo, setFechaSorteo] = useState(DEFAULT_FECHA);
  const [cargando, setCargando] = useState(false);
  
  // Mensajes de estado
  const [descargadoExito, setDescargadoExito] = useState(false);
  const [advertenciaFecha, setAdvertenciaFecha] = useState(false);

  // Validar si cambió el sorteo pero no la fecha
  const handleSorteoChange = (e) => {
    const val = e.target.value;
    setNumSorteo(val);
    if (val !== DEFAULT_SORTEO && fechaSorteo === DEFAULT_FECHA) {
      setAdvertenciaFecha(true);
    } else {
      setAdvertenciaFecha(false);
    }
  };

  const handleFechaChange = (e) => {
    setFechaSorteo(e.target.value);
    setAdvertenciaFecha(false);
  };

  // Normalizar cadenas para emparejamiento
  const normalizar = (txt) => {
    if (!txt) return '';
    return txt
      .toString()
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  };

  const dividirNumero = (numStr) => {
    const padded = String(numStr || '').trim().padStart(7, '0');
    return {
      numero: padded.slice(0, 4),
      serie: padded.slice(4)
    };
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

    return lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] || '';
      });
      return obj;
    });
  };

  const handleProcesar = async (e) => {
    e.preventDefault();
    if (!excelFile || !csvResultados || !csvPruebas) {
      alert('Por favor selecciona los 3 archivos requeridos.');
      return;
    }

    setCargando(true);
    setDescargadoExito(false);

    try {
      const textoRes = await csvResultados.text();
      const textoPruebas = await csvPruebas.text();

      const filasRes = parseCSV(textoRes);
      const filasPruebas = parseCSV(textoPruebas);

      const arrayBuffer = await excelFile.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const sheet = workbook.worksheets[0];

      // -------------------------------------------------------------
      // ACTUALIZACIÓN DE FECHA Y NÚMERO DE SORTEO
      // -------------------------------------------------------------
      if (fechaSorteo) {
        const [year, month, day] = fechaSorteo.split('-');
        const meses = [
          'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
          'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
        ];
        
        const nombreMes = meses[parseInt(month, 10) - 1];
        const diaNum = parseInt(day, 10).toString().padStart(2, '0');
        
        // Formatos de fecha
        const fechaTextoLargo = `${diaNum} DE ${nombreMes} DE ${year}`;
        const fechaFormatoCorta = `${diaNum}/${month}/${year}`;

        // 1. Actualizar título principal en celda K1
        const celdaK1 = sheet.getCell('K1');
        if (celdaK1.value) {
          let textoK1 = String(celdaK1.value);
          
          // Reemplaza el número de sorteo
          textoK1 = textoK1.replace(/SORTEO\s+\d+/i, `SORTEO ${numSorteo}`);
          
          // Reemplaza la fecha en letras (ej. "04 DE SEPTIEMBRE DE 2026")
          textoK1 = textoK1.replace(/\d{1,2}\s+DE\s+[A-Z]+\s+DE\s+\d{4}/gi, fechaTextoLargo);
          
          celdaK1.value = textoK1;
        }

        // 2. Actualizar celdas específicas de Sorteo (L19) y Fecha (P19)
        sheet.getCell('L19').value = numSorteo;
        sheet.getCell('P19').value = fechaFormatoCorta;
      }

      // -------------------------------------------------------------
      // MAPEO DE RESULTADOS GANADORES
      // -------------------------------------------------------------
      const billeteSecos = {
        'COSECHA MILLONARIA': { colNum: 'K', colSerie: 'L', filaIni: 6 },
        'DE PERLA': { colNum: 'Q', colSerie: 'R', filaIni: 6 },
        'PERLA': { colNum: 'Q', colSerie: 'R', filaIni: 6 },
        'TREBOL DE LA FORTUNA': { colNum: 'U', colSerie: 'V', filaIni: 6 },
        'TREBOL': { colNum: 'U', colSerie: 'V', filaIni: 6 }
      };

      const premiosFilaFija = {
        'PREMIO MAYOR': 21,
        'EL GORDO DE LA RISARALDA': 22,
        'ANGEL DE LA SUERTE': 23,
        'MULA MILLONARIA': 24,
        'MILAGRO MILLONARIO': 25,
        'ESCALERA MILLONARIA': 26,
        'GUACA DE ORO 3': 27,
        'GUACA DE ORO 2': 28,
        'GUACA DE ORO 1': 29,
        'COFRE DE DIAMANTES 5': 30,
        'COFRE DE DIAMANTES 4': 31,
        'COFRE DE DIAMANTES 3': 32,
        'COFRE DE DIAMANTES 2': 33,
        'COFRE DE DIAMANTES 1': 34
      };

      filasRes.forEach((fila) => {
        const premioRaw = fila['Premio'] || '';
        const numGanador = fila['Numero Ganador'] || '';
        let premioNorm = normalizar(premioRaw);
        let premioSinSeco = premioNorm.replace(/^SECO\s+/, '');

        const { numero, serie } = dividirNumero(numGanador);

        let ubicado = false;
        for (const [nombre, cfg] of Object.entries(billeteSecos)) {
          if (premioSinSeco.startsWith(nombre)) {
            const resto = premioSinSeco.replace(nombre, '').trim();
            const matchDigit = resto.match(/\d+/);
            if (matchDigit) {
              const idx = parseInt(matchDigit[0], 10);
              const filaTarget = cfg.filaIni + (idx - 1);

              sheet.getCell(`${cfg.colNum}${filaTarget}`).value = numero;
              sheet.getCell(`${cfg.colSerie}${filaTarget}`).value = serie;
              ubicado = true;
              break;
            }
          }
        }

        if (!ubicado) {
          const clave = premiosFilaFija[premioSinSeco] ? premioSinSeco : premioNorm;
          if (premiosFilaFija[clave]) {
            const filaTarget = premiosFilaFija[clave];
            sheet.getCell(`P${filaTarget}`).value = numero;
            if (clave !== 'PREMIO MAYOR') {
              sheet.getCell(`S${filaTarget}`).value = serie;
            }
          }
        }
      });

      // -------------------------------------------------------------
      // MAPEO DE PRUEBAS (NUMERO COL G, SERIE COL H)
      // -------------------------------------------------------------
      const pruebasFilaInicial = 23;
      filasPruebas.forEach((fila) => {
        const pruebaRaw = fila['Prueba'] || '';
        const numGanador = fila['Numero Ganador'] || '';

        const matchDigit = String(pruebaRaw).match(/\d+/);
        if (matchDigit) {
          const idx = parseInt(matchDigit[0], 10);
          const filaTarget = pruebasFilaInicial + (idx - 1);

          const { numero, serie } = dividirNumero(numGanador);

          sheet.getCell(`G${filaTarget}`).value = numero;
          sheet.getCell(`H${filaTarget}`).value = serie;
        }
      });

      // -------------------------------------------------------------
      // GENERACIÓN Y DESCARGA DEL EXCEL
      // -------------------------------------------------------------
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `RESULTADO_SORTEO_${numSorteo}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);

      setDescargadoExito(true);
    } catch (err) {
      console.error('Error procesando el sorteo:', err);
      alert('Ocurrió un error al procesar el archivo. Revisa el formato de los documentos.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ maxWidth: '650px', margin: '30px auto', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginTop: 0, color: '#1a2b4c' }}>🎰 Procesador de Sorteo</h2>

        {/* Notificación de descarga exitosa */}
        {descargadoExito && (
          <div style={{ padding: '12px 15px', backgroundColor: '#e6f4ea', color: '#137333', borderRadius: '8px', marginBottom: '20px', fontWeight: 'bold', border: '1px solid #ceead6' }}>
            ✅ ¡Archivo RESULTADO_SORTEO_{numSorteo}.xlsx generado y descargado con éxito!
          </div>
        )}

        <form onSubmit={handleProcesar}>
          {/* Configuración de Sorteo y Fecha */}
          <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontWeight: 'bold', display: 'block', color: '#2c3e50', marginBottom: '6px' }}>
                Número de Sorteo:
              </label>
              <input
                type="text"
                value={numSorteo}
                onChange={handleSorteoChange}
                required
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontWeight: 'bold', display: 'block', color: '#2c3e50', marginBottom: '6px' }}>
                Fecha del Sorteo:
              </label>
              <input
                type="date"
                value={fechaSorteo}
                onChange={handleFechaChange}
                required
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Advertencia si modificó número de sorteo pero dejó la fecha previa */}
          {advertenciaFecha && (
            <div style={{ padding: '10px', backgroundColor: '#fef7e0', color: '#b06000', borderRadius: '6px', marginBottom: '15px', fontSize: '13px', border: '1px solid #fce8e6' }}>
              ⚠️ Has cambiado el número de sorteo a <strong>{numSorteo}</strong>, pero la fecha sigue siendo <strong>{fechaSorteo}</strong>. Por favor verifica si deseas actualizarla.
            </div>
          )}

          <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '20px 0' }} />

          {/* Carga de Archivos con Indicadores de Estado */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontWeight: 'bold', display: 'block', color: '#2c3e50', marginBottom: '6px' }}>
              📄 1. Plantilla Excel de Sorteo (.xlsx):
            </label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => { setExcelFile(e.target.files[0] || null); setDescargadoExito(false); }}
              required
              style={{ display: 'block', width: '100%', padding: '8px', border: '1px solid #e0e0e0', borderRadius: '6px', backgroundColor: '#f9f9f9' }}
            />
            {excelFile && (
              <span style={{ color: '#137333', fontSize: '13px', fontWeight: 'bold', marginTop: '4px', display: 'block' }}>
                🟢 Cargado: {excelFile.name}
              </span>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontWeight: 'bold', display: 'block', color: '#2c3e50', marginBottom: '6px' }}>
              📊 2. CSV de Resultados Ganadores:
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => { setCsvResultados(e.target.files[0] || null); setDescargadoExito(false); }}
              required
              style={{ display: 'block', width: '100%', padding: '8px', border: '1px solid #e0e0e0', borderRadius: '6px', backgroundColor: '#f9f9f9' }}
            />
            {csvResultados && (
              <span style={{ color: '#137333', fontSize: '13px', fontWeight: 'bold', marginTop: '4px', display: 'block' }}>
                🟢 Cargado: {csvResultados.name}
              </span>
            )}
          </div>

          <div style={{ marginBottom: '25px' }}>
            <label style={{ fontWeight: 'bold', display: 'block', color: '#2c3e50', marginBottom: '6px' }}>
              🧪 3. CSV de Pruebas (Pre-sorteos):
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => { setCsvPruebas(e.target.files[0] || null); setDescargadoExito(false); }}
              required
              style={{ display: 'block', width: '100%', padding: '8px', border: '1px solid #e0e0e0', borderRadius: '6px', backgroundColor: '#f9f9f9' }}
            />
            {csvPruebas && (
              <span style={{ color: '#137333', fontSize: '13px', fontWeight: 'bold', marginTop: '4px', display: 'block' }}>
                🟢 Cargado: {csvPruebas.name}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={cargando}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: cargando ? '#ccc' : '#0066cc',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: cargando ? 'not-allowed' : 'pointer'
            }}
          >
            {cargando ? 'Procesando en el navegador...' : 'Generar y Descargar Excel'}
          </button>
        </form>
      </div>
    </div>
  );
}