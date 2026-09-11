import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_URL from '../config';
import { useAuth } from '../context/AuthContext';

const ManagePruebas = () => {
  const { tieneRol } = useAuth();
  const puedeEscribir = tieneRol('admin', 'operador');

  // prueba.cantidad_balotas representa el NÚMERO DE BALOTAS (bolas físicas),
  // no la cantidad de dígitos del input. Mismo mapeo que en ManageResultados:
  //  - 4 balotas -> 4 dígitos totales, SIN serie
  //  - 6 balotas -> 4 dígitos de número + 3 dígitos de serie
  //                 (5ta balota = 2 dígitos, 6ta balota = 1 dígito) = 7 dígitos totales
  const getLongitudTotal = (prueba) => {
    if (prueba.cantidad_balotas === 6) return 7; // 4 número + 3 serie
    return prueba.cantidad_balotas; // ej. 4 balotas = 4 dígitos, sin serie
  };

  const [sorteos, setSorteos] = useState([]);
  const [selectedSorteoId, setSelectedSorteoId] = useState('');

  // Datos del sorteo seleccionado
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Control de generación inicial de pruebas
  const [cantidadObjetivo, setCantidadObjetivo] = useState(5); // entre 5 y 10
  const [cantidadBalotasNuevas, setCantidadBalotasNuevas] = useState(6); // 6 o 4
  const [generando, setGenerando] = useState(false);

  // Control de inputs (Nuevo ingreso)
  const [currentInput, setCurrentInput] = useState({});

  // Control de Edición
  const [editingPruebaId, setEditingPruebaId] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    fetchSorteos();
  }, []);

  const fetchSorteos = () => {
    axios.get(`${API_URL}/sorteos/`)
      .then(res => setSorteos(res.data))
      .catch(err => console.error(err));
  };

  // Función para formatear la fecha correctamente en Colombia
  const formatearFechaCO = (fechaStr) => {
    if (!fechaStr) return '';
    const fecha = new Date(`${fechaStr}T00:00:00`);
    return fecha.toLocaleDateString('es-CO');
  };

  const loadSorteoData = async (sorteoId) => {
    if (!sorteoId) return;
    setLoading(true);
    setEditingPruebaId(null);
    try {
      // 1. Obtener info básica del Sorteo
      const sorteoRes = await axios.get(`${API_URL}/sorteos/${sorteoId}`);
      const sorteo = sorteoRes.data;

      // 2. Obtener las pruebas de este sorteo (identificadas por numero_sorteo)
      const pruebasRes = await axios.get(`${API_URL}/sorteos/${sorteo.numero_sorteo}/presorteos/`);
      const pruebas = (pruebasRes.data || [])
        .slice()
        .sort((a, b) => a.numero_prueba - b.numero_prueba)
        .map(p => ({
          ...p,
          yaJugado: !!p.numeros_ganadores,
          numeroGanador: p.numeros_ganadores || null,
        }));

      setDashboardData({ sorteo, pruebas });
    } catch (error) {
      console.error(error);
      alert("Error cargando datos del sorteo");
    } finally {
      setLoading(false);
    }
  };

  const handleSorteoChange = (e) => {
    const id = e.target.value;
    setSelectedSorteoId(id);
    setDashboardData(null);
    loadSorteoData(id);
  };

  // --- GENERAR PRUEBAS (hasta alcanzar la cantidad objetivo) ---
  const generarPruebas = async () => {
    if (!dashboardData) return;
    const { sorteo, pruebas } = dashboardData;

    const objetivo = Math.max(1, Math.min(10, parseInt(cantidadObjetivo, 10) || 0));
    const faltantes = objetivo - pruebas.length;

    if (faltantes <= 0) {
      alert(`Ya existen ${pruebas.length} pruebas para este sorteo (objetivo: ${objetivo}). Borra alguna si quieres reducir la cantidad.`);
      return;
    }

    setGenerando(true);
    try {
      for (let i = 0; i < faltantes; i++) {
        await axios.post(`${API_URL}/sorteos/${sorteo.numero_sorteo}/presorteos/`, {
          cantidad_balotas: cantidadBalotasNuevas,
        });
      }
      await loadSorteoData(selectedSorteoId);
    } catch (error) {
      alert("Error generando pruebas: " + (error.response?.data?.detail || error.message));
    } finally {
      setGenerando(false);
    }
  };

  // --- CREAR / GUARDAR RESULTADO ---
  const handleInputChange = (pruebaId, value) => {
    setCurrentInput({ ...currentInput, [pruebaId]: value });
  };

  const guardarResultado = async (prueba) => {
    const numero = currentInput[prueba.id];
    if (!numero) return alert("Ingrese un número");

    const longitudTotal = getLongitudTotal(prueba);
    if (numero.length < longitudTotal) {
      return alert(`La prueba requiere ${longitudTotal} cifras`);
    }

    try {
      await axios.put(
        `${API_URL}/sorteos/${dashboardData.sorteo.numero_sorteo}/presorteos/${prueba.numero_prueba}`,
        { numeros_ganadores: numero }
      );

      loadSorteoData(selectedSorteoId);
      setCurrentInput({ ...currentInput, [prueba.id]: '' });
    } catch (error) {
      alert("Error: " + (error.response?.data?.detail || error.message));
    }
  };

  // --- BORRAR ---
  const borrarPrueba = async (prueba) => {
    if (!window.confirm(`¿Estás seguro de borrar la Prueba ${prueba.numero_prueba}?`)) return;

    try {
      await axios.delete(
        `${API_URL}/sorteos/${dashboardData.sorteo.numero_sorteo}/presorteos/${prueba.numero_prueba}`
      );
      loadSorteoData(selectedSorteoId);
    } catch (error) {
      alert("Error borrando: " + (error.response?.data?.detail || error.message));
    }
  };

  // --- EDITAR ---
  const iniciarEdicion = (prueba) => {
    setEditingPruebaId(prueba.id);
    setEditValue(prueba.numeroGanador || '');
  };

  const cancelarEdicion = () => {
    setEditingPruebaId(null);
    setEditValue('');
  };

  const guardarEdicion = async (prueba) => {
    const longitudTotal = getLongitudTotal(prueba);
    if (editValue.length < longitudTotal) {
      return alert(`La prueba requiere ${longitudTotal} cifras`);
    }

    try {
      await axios.put(
        `${API_URL}/sorteos/${dashboardData.sorteo.numero_sorteo}/presorteos/${prueba.numero_prueba}`,
        { numeros_ganadores: editValue }
      );
      setEditingPruebaId(null);
      loadSorteoData(selectedSorteoId);
    } catch (error) {
      alert("Error editando: " + (error.response?.data?.detail || error.message));
    }
  };

  // --- EXPORTAR A CSV ---
  const exportarCSV = () => {
    if (!dashboardData || !dashboardData.pruebas) return;

    const headers = ["Prueba", "Numero Ganador", "Estado"];

    const rows = dashboardData.pruebas.map((prueba) => {
      const titulo = `"Prueba ${prueba.numero_prueba}"`;
      const numero = prueba.numeroGanador ? `"${prueba.numeroGanador}"` : '"N/A"';
      const estado = prueba.yaJugado ? '"REGISTRADO"' : '"PENDIENTE"';
      return [titulo, numero, estado].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const numSorteo = dashboardData.sorteo?.numero_sorteo || "sorteo";
    link.href = url;
    link.setAttribute("download", `Pruebas_Sorteo_${numSorteo}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- UTILIDAD DE FORMATO VISUAL ---
  const renderNumeroFormateado = (numero) => {
    if (!numero) return "";
    let principal = numero;
    let serie = "";

    if (numero.length > 4) {
      const corte = numero.length - 3;
      principal = numero.substring(0, corte);
      serie = numero.substring(corte);
    }

    return (
      <div className="result-display-container">
        <span className="result-main">{principal}</span>
        {serie && (
          <>
            <span className="result-separator">-</span>
            <span className="result-serie">{serie}</span>
          </>
        )}
      </div>
    );
  };

  // --- ORDEN: del sorteo más reciente al más antiguo (por fecha), con
  // desempate por id descendente. No muta el estado "sorteos" original.
  const sorteosOrdenados = [...sorteos].sort((a, b) => {
    const diffFecha = new Date(b.fecha) - new Date(a.fecha);
    if (diffFecha !== 0) return diffFecha;
    return b.id - a.id;
  });

  return (
    <div className="admin-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="admin-title">Gestión de Pruebas (Pre-Sorteo)</h1>
        <div>
          {dashboardData && (
            <button 
              className="btn btn-success" 
              onClick={exportarCSV}
              style={{ marginRight: '10px' }}
            >
              📥 Exportar CSV
            </button>
          )}
          <button className="btn btn-secondary" onClick={fetchSorteos}>↻ Refrescar</button>
        </div>
      </div>

      {!puedeEscribir && (
        <p style={{ textAlign: 'center', color: '#ffb347', marginBottom: '15px' }}>
          Tu usuario es de solo consulta: puedes ver las pruebas, pero no generarlas ni editarlas.
        </p>
      )}

      <div className="form-group" style={{ maxWidth: '500px' }}>
        <label>Seleccionar Sorteo Activo:</label>
        <select className="form-select" value={selectedSorteoId} onChange={handleSorteoChange}>
          <option value="">-- Seleccione Sorteo --</option>
          {sorteosOrdenados.map(s => (
            <option key={s.id} value={s.id}>
              No. {s.numero_sorteo} ({formatearFechaCO(s.fecha)})
            </option>
          ))}
        </select>
      </div>

      {loading && <p>Cargando datos...</p>}

      {dashboardData && (
        <>
          {/* --- CONTROL PARA GENERAR PRUEBAS --- */}
          {puedeEscribir && (
            <div
              className="form-group"
              style={{
                display: 'flex',
                gap: '20px',
                alignItems: 'flex-end',
                flexWrap: 'wrap',
                maxWidth: '700px',
                marginBottom: '25px',
              }}
            >
              <div>
                <label>Cantidad de pruebas (5 a 10):</label>
                <input
                  type="number"
                  className="form-input"
                  min={5}
                  max={10}
                  value={cantidadObjetivo}
                  onChange={(e) => setCantidadObjetivo(e.target.value)}
                  style={{ width: '90px' }}
                />
              </div>

              <div>
                <label>Cifras por prueba nueva:</label>
                <select
                  className="form-select"
                  value={cantidadBalotasNuevas}
                  onChange={(e) => setCantidadBalotasNuevas(parseInt(e.target.value, 10))}
                >
                  <option value={6}>6 balotas (7 cifras)</option>
                  <option value={4}>4 balotas (4 cifras)</option>
                </select>
              </div>

              <button className="btn btn-primary" onClick={generarPruebas} disabled={generando}>
                {generando ? 'Generando...' : '+ Generar Pruebas'}
              </button>
            </div>
          )}

          <h3>Sorteo No. {dashboardData.sorteo.numero_sorteo} · {dashboardData.pruebas.length} pruebas registradas</h3>

          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Prueba</th>
                <th style={{ width: '20%' }}>Estado</th>
                <th style={{ width: '30%' }}>Número - Serie</th>
                <th style={{ width: '25%' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {dashboardData.pruebas.map((prueba) => {
                const isEditing = editingPruebaId === prueba.id;

                return (
                  <tr key={prueba.id} className={prueba.yaJugado ? "row-done" : "row-pending"}>
                    <td className="td-title">
                      Prueba {prueba.numero_prueba}
                      <div style={{ fontSize: '0.75rem', color: '#999' }}>
                        ({getLongitudTotal(prueba)} cifras)
                      </div>
                    </td>

                    <td>
                      {prueba.yaJugado ? (
                        <span className="status-badge status-done">REGISTRADO</span>
                      ) : (
                        <span className="status-badge status-pending">PENDIENTE</span>
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          className="form-input input-editing"
                          autoFocus
                          maxLength={getLongitudTotal(prueba)}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />
                      ) : prueba.yaJugado ? (
                        renderNumeroFormateado(prueba.numeroGanador)
                      ) : puedeEscribir ? (
                        <input
                          type="text"
                          className="form-input"
                          style={{ textAlign: 'center', letterSpacing: '5px' }}
                          maxLength={getLongitudTotal(prueba)}
                          placeholder={"?".repeat(getLongitudTotal(prueba))}
                          value={currentInput[prueba.id] || ''}
                          onChange={(e) => handleInputChange(prueba.id, e.target.value)}
                        />
                      ) : (
                        <span style={{ color: '#666' }}>{"?".repeat(getLongitudTotal(prueba))}</span>
                      )}
                    </td>

                    <td>
                      {!puedeEscribir ? (
                        <span style={{ color: '#666', fontSize: '0.85rem' }}>Solo consulta</span>
                      ) : isEditing ? (
                        <div className="action-buttons">
                          <button className="btn btn-success btn-sm" onClick={() => guardarEdicion(prueba)}>💾</button>
                          <button className="btn btn-secondary btn-sm" onClick={cancelarEdicion}>✖</button>
                        </div>
                      ) : prueba.yaJugado ? (
                        <div className="action-buttons">
                          <button className="btn btn-primary btn-sm" onClick={() => iniciarEdicion(prueba)}>✏️ Editar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => borrarPrueba(prueba)}>🗑️ Borrar</button>
                        </div>
                      ) : (
                        <div className="action-buttons">
                          <button className="btn btn-primary" onClick={() => guardarResultado(prueba)}>
                            Guardar
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => borrarPrueba(prueba)}>🗑️</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {dashboardData.pruebas.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>
                    No hay pruebas todavía. Genera las primeras con el control de arriba.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

export default ManagePruebas;


// import React, { useState, useEffect } from 'react';
// import axios from 'axios';
// import API_URL from '../config';
// import { useAuth } from '../context/AuthContext';

// const ManagePruebas = () => {
//   const { tieneRol } = useAuth();
//   const puedeEscribir = tieneRol('admin', 'operador');

//   // prueba.cantidad_balotas representa el NÚMERO DE BALOTAS (bolas físicas),
//   // no la cantidad de dígitos del input. Mismo mapeo que en ManageResultados:
//   //  - 4 balotas -> 4 dígitos totales, SIN serie
//   //  - 6 balotas -> 4 dígitos de número + 3 dígitos de serie
//   //                 (5ta balota = 2 dígitos, 6ta balota = 1 dígito) = 7 dígitos totales
//   const getLongitudTotal = (prueba) => {
//     if (prueba.cantidad_balotas === 6) return 7; // 4 número + 3 serie
//     return prueba.cantidad_balotas; // ej. 4 balotas = 4 dígitos, sin serie
//   };

//   const [sorteos, setSorteos] = useState([]);
//   const [selectedSorteoId, setSelectedSorteoId] = useState('');

//   // Datos del sorteo seleccionado
//   const [dashboardData, setDashboardData] = useState(null);
//   const [loading, setLoading] = useState(false);

//   // Control de generación inicial de pruebas
//   const [cantidadObjetivo, setCantidadObjetivo] = useState(5); // entre 5 y 10
//   const [cantidadBalotasNuevas, setCantidadBalotasNuevas] = useState(6); // 6 o 4
//   const [generando, setGenerando] = useState(false);

//   // Control de inputs (Nuevo ingreso)
//   const [currentInput, setCurrentInput] = useState({});

//   // Control de Edición
//   const [editingPruebaId, setEditingPruebaId] = useState(null);
//   const [editValue, setEditValue] = useState('');

//   useEffect(() => {
//     fetchSorteos();
//   }, []);

//   const fetchSorteos = () => {
//     axios.get(`${API_URL}/sorteos/`)
//       .then(res => setSorteos(res.data))
//       .catch(err => console.error(err));
//   };

//   // Función para formatear la fecha correctamente en Colombia
//   const formatearFechaCO = (fechaStr) => {
//     if (!fechaStr) return '';
//     const fecha = new Date(`${fechaStr}T00:00:00`);
//     return fecha.toLocaleDateString('es-CO');
//   };

//   const loadSorteoData = async (sorteoId) => {
//     if (!sorteoId) return;
//     setLoading(true);
//     setEditingPruebaId(null);
//     try {
//       // 1. Obtener info básica del Sorteo
//       const sorteoRes = await axios.get(`${API_URL}/sorteos/${sorteoId}`);
//       const sorteo = sorteoRes.data;

//       // 2. Obtener las pruebas de este sorteo (identificadas por numero_sorteo)
//       const pruebasRes = await axios.get(`${API_URL}/sorteos/${sorteo.numero_sorteo}/presorteos/`);
//       const pruebas = (pruebasRes.data || [])
//         .slice()
//         .sort((a, b) => a.numero_prueba - b.numero_prueba)
//         .map(p => ({
//           ...p,
//           yaJugado: !!p.numeros_ganadores,
//           numeroGanador: p.numeros_ganadores || null,
//         }));

//       setDashboardData({ sorteo, pruebas });
//     } catch (error) {
//       console.error(error);
//       alert("Error cargando datos del sorteo");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleSorteoChange = (e) => {
//     const id = e.target.value;
//     setSelectedSorteoId(id);
//     setDashboardData(null);
//     loadSorteoData(id);
//   };

//   // --- GENERAR PRUEBAS (hasta alcanzar la cantidad objetivo) ---
//   const generarPruebas = async () => {
//     if (!dashboardData) return;
//     const { sorteo, pruebas } = dashboardData;

//     const objetivo = Math.max(1, Math.min(10, parseInt(cantidadObjetivo, 10) || 0));
//     const faltantes = objetivo - pruebas.length;

//     if (faltantes <= 0) {
//       alert(`Ya existen ${pruebas.length} pruebas para este sorteo (objetivo: ${objetivo}). Borra alguna si quieres reducir la cantidad.`);
//       return;
//     }

//     setGenerando(true);
//     try {
//       for (let i = 0; i < faltantes; i++) {
//         await axios.post(`${API_URL}/sorteos/${sorteo.numero_sorteo}/presorteos/`, {
//           cantidad_balotas: cantidadBalotasNuevas,
//         });
//       }
//       await loadSorteoData(selectedSorteoId);
//     } catch (error) {
//       alert("Error generando pruebas: " + (error.response?.data?.detail || error.message));
//     } finally {
//       setGenerando(false);
//     }
//   };

//   // --- CREAR / GUARDAR RESULTADO ---
//   const handleInputChange = (pruebaId, value) => {
//     setCurrentInput({ ...currentInput, [pruebaId]: value });
//   };

//   const guardarResultado = async (prueba) => {
//     const numero = currentInput[prueba.id];
//     if (!numero) return alert("Ingrese un número");

//     const longitudTotal = getLongitudTotal(prueba);
//     if (numero.length < longitudTotal) {
//       return alert(`La prueba requiere ${longitudTotal} cifras`);
//     }

//     try {
//       await axios.put(
//         `${API_URL}/sorteos/${dashboardData.sorteo.numero_sorteo}/presorteos/${prueba.numero_prueba}`,
//         { numeros_ganadores: numero }
//       );

//       loadSorteoData(selectedSorteoId);
//       setCurrentInput({ ...currentInput, [prueba.id]: '' });
//     } catch (error) {
//       alert("Error: " + (error.response?.data?.detail || error.message));
//     }
//   };

//   // --- BORRAR ---
//   const borrarPrueba = async (prueba) => {
//     if (!window.confirm(`¿Estás seguro de borrar la Prueba ${prueba.numero_prueba}?`)) return;

//     try {
//       await axios.delete(
//         `${API_URL}/sorteos/${dashboardData.sorteo.numero_sorteo}/presorteos/${prueba.numero_prueba}`
//       );
//       loadSorteoData(selectedSorteoId);
//     } catch (error) {
//       alert("Error borrando: " + (error.response?.data?.detail || error.message));
//     }
//   };

//   // --- EDITAR ---
//   const iniciarEdicion = (prueba) => {
//     setEditingPruebaId(prueba.id);
//     setEditValue(prueba.numeroGanador || '');
//   };

//   const cancelarEdicion = () => {
//     setEditingPruebaId(null);
//     setEditValue('');
//   };

//   const guardarEdicion = async (prueba) => {
//     const longitudTotal = getLongitudTotal(prueba);
//     if (editValue.length < longitudTotal) {
//       return alert(`La prueba requiere ${longitudTotal} cifras`);
//     }

//     try {
//       await axios.put(
//         `${API_URL}/sorteos/${dashboardData.sorteo.numero_sorteo}/presorteos/${prueba.numero_prueba}`,
//         { numeros_ganadores: editValue }
//       );
//       setEditingPruebaId(null);
//       loadSorteoData(selectedSorteoId);
//     } catch (error) {
//       alert("Error editando: " + (error.response?.data?.detail || error.message));
//     }
//   };

//   // --- UTILIDAD DE FORMATO VISUAL ---
//   const renderNumeroFormateado = (numero) => {
//     if (!numero) return "";
//     let principal = numero;
//     let serie = "";

//     if (numero.length > 4) {
//       const corte = numero.length - 3;
//       principal = numero.substring(0, corte);
//       serie = numero.substring(corte);
//     }

//     return (
//       <div className="result-display-container">
//         <span className="result-main">{principal}</span>
//         {serie && (
//           <>
//             <span className="result-separator">-</span>
//             <span className="result-serie">{serie}</span>
//           </>
//         )}
//       </div>
//     );
//   };

//   // --- ORDEN: del sorteo más reciente al más antiguo (por fecha), con
//   // desempate por id descendente. No muta el estado "sorteos" original.
//   const sorteosOrdenados = [...sorteos].sort((a, b) => {
//     const diffFecha = new Date(b.fecha) - new Date(a.fecha);
//     if (diffFecha !== 0) return diffFecha;
//     return b.id - a.id;
//   });

//   return (
//     <div className="admin-container">
//       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//         <h1 className="admin-title">Gestión de Pruebas (Pre-Sorteo)</h1>
//         <button className="btn btn-secondary" onClick={fetchSorteos}>↻ Refrescar</button>
//       </div>

//       {!puedeEscribir && (
//         <p style={{ textAlign: 'center', color: '#ffb347', marginBottom: '15px' }}>
//           Tu usuario es de solo consulta: puedes ver las pruebas, pero no generarlas ni editarlas.
//         </p>
//       )}

//       <div className="form-group" style={{ maxWidth: '500px' }}>
//         <label>Seleccionar Sorteo Activo:</label>
//         <select className="form-select" value={selectedSorteoId} onChange={handleSorteoChange}>
//           <option value="">-- Seleccione Sorteo --</option>
//           {sorteosOrdenados.map(s => (
//             <option key={s.id} value={s.id}>
//               No. {s.numero_sorteo} ({formatearFechaCO(s.fecha)})
//             </option>
//           ))}
//         </select>
//       </div>

//       {loading && <p>Cargando datos...</p>}

//       {dashboardData && (
//         <>
//           {/* --- CONTROL PARA GENERAR PRUEBAS --- */}
//           {puedeEscribir && (
//             <div
//               className="form-group"
//               style={{
//                 display: 'flex',
//                 gap: '20px',
//                 alignItems: 'flex-end',
//                 flexWrap: 'wrap',
//                 maxWidth: '700px',
//                 marginBottom: '25px',
//               }}
//             >
//               <div>
//                 <label>Cantidad de pruebas (5 a 10):</label>
//                 <input
//                   type="number"
//                   className="form-input"
//                   min={5}
//                   max={10}
//                   value={cantidadObjetivo}
//                   onChange={(e) => setCantidadObjetivo(e.target.value)}
//                   style={{ width: '90px' }}
//                 />
//               </div>

//               <div>
//                 <label>Cifras por prueba nueva:</label>
//                 <select
//                   className="form-select"
//                   value={cantidadBalotasNuevas}
//                   onChange={(e) => setCantidadBalotasNuevas(parseInt(e.target.value, 10))}
//                 >
//                   <option value={6}>6 balotas (7 cifras)</option>
//                   <option value={4}>4 balotas (4 cifras)</option>
//                 </select>
//               </div>

//               <button className="btn btn-primary" onClick={generarPruebas} disabled={generando}>
//                 {generando ? 'Generando...' : '+ Generar Pruebas'}
//               </button>
//             </div>
//           )}

//           <h3>Sorteo No. {dashboardData.sorteo.numero_sorteo} · {dashboardData.pruebas.length} pruebas registradas</h3>

//           <table className="admin-table">
//             <thead>
//               <tr>
//                 <th style={{ width: '25%' }}>Prueba</th>
//                 <th style={{ width: '20%' }}>Estado</th>
//                 <th style={{ width: '30%' }}>Número - Serie</th>
//                 <th style={{ width: '25%' }}>Acciones</th>
//               </tr>
//             </thead>
//             <tbody>
//               {dashboardData.pruebas.map((prueba) => {
//                 const isEditing = editingPruebaId === prueba.id;

//                 return (
//                   <tr key={prueba.id} className={prueba.yaJugado ? "row-done" : "row-pending"}>
//                     <td className="td-title">
//                       Prueba {prueba.numero_prueba}
//                       <div style={{ fontSize: '0.75rem', color: '#999' }}>
//                         ({getLongitudTotal(prueba)} cifras)
//                       </div>
//                     </td>

//                     <td>
//                       {prueba.yaJugado ? (
//                         <span className="status-badge status-done">REGISTRADO</span>
//                       ) : (
//                         <span className="status-badge status-pending">PENDIENTE</span>
//                       )}
//                     </td>

//                     <td>
//                       {isEditing ? (
//                         <input
//                           type="text"
//                           className="form-input input-editing"
//                           autoFocus
//                           maxLength={getLongitudTotal(prueba)}
//                           value={editValue}
//                           onChange={(e) => setEditValue(e.target.value)}
//                         />
//                       ) : prueba.yaJugado ? (
//                         renderNumeroFormateado(prueba.numeroGanador)
//                       ) : puedeEscribir ? (
//                         <input
//                           type="text"
//                           className="form-input"
//                           style={{ textAlign: 'center', letterSpacing: '5px' }}
//                           maxLength={getLongitudTotal(prueba)}
//                           placeholder={"?".repeat(getLongitudTotal(prueba))}
//                           value={currentInput[prueba.id] || ''}
//                           onChange={(e) => handleInputChange(prueba.id, e.target.value)}
//                         />
//                       ) : (
//                         <span style={{ color: '#666' }}>{"?".repeat(getLongitudTotal(prueba))}</span>
//                       )}
//                     </td>

//                     <td>
//                       {!puedeEscribir ? (
//                         <span style={{ color: '#666', fontSize: '0.85rem' }}>Solo consulta</span>
//                       ) : isEditing ? (
//                         <div className="action-buttons">
//                           <button className="btn btn-success btn-sm" onClick={() => guardarEdicion(prueba)}>💾</button>
//                           <button className="btn btn-secondary btn-sm" onClick={cancelarEdicion}>✖</button>
//                         </div>
//                       ) : prueba.yaJugado ? (
//                         <div className="action-buttons">
//                           <button className="btn btn-primary btn-sm" onClick={() => iniciarEdicion(prueba)}>✏️ Editar</button>
//                           <button className="btn btn-danger btn-sm" onClick={() => borrarPrueba(prueba)}>🗑️ Borrar</button>
//                         </div>
//                       ) : (
//                         <div className="action-buttons">
//                           <button className="btn btn-primary" onClick={() => guardarResultado(prueba)}>
//                             Guardar
//                           </button>
//                           <button className="btn btn-danger btn-sm" onClick={() => borrarPrueba(prueba)}>🗑️</button>
//                         </div>
//                       )}
//                     </td>
//                   </tr>
//                 );
//               })}
//               {dashboardData.pruebas.length === 0 && (
//                 <tr>
//                   <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>
//                     No hay pruebas todavía. Genera las primeras con el control de arriba.
//                   </td>
//                 </tr>
//               )}
//             </tbody>
//           </table>
//         </>
//       )}
//     </div>
//   );
// };

// export default ManagePruebas;