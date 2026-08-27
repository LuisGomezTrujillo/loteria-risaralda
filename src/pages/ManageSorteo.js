import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_URL from '../config';

const ManageSorteo = () => {
  const [sorteos, setSorteos] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Estado para el formulario (Crear/Editar)
  const [formData, setFormData] = useState({
    id: null,
    numero_sorteo: '',
    fecha: '',
    plan_id: ''
  });
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sorteosRes, planesRes] = await Promise.all([
        axios.get(`${API_URL}/sorteos/`),
        axios.get(`${API_URL}/planes/`)
      ]);
      setSorteos(sorteosRes.data);
      setPlanes(planesRes.data);
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    // Validación básica
    if (!formData.numero_sorteo || !formData.fecha || !formData.plan_id) {
      return alert("Por favor complete todos los campos");
    }

    try {
      if (isEditing) {
        await axios.put(`${API_URL}/sorteos/${formData.id}`, formData);
        alert('Sorteo actualizado correctamente');
      } else {
        await axios.post(`${API_URL}/sorteos/`, formData);
        alert('Sorteo creado correctamente');
      }
      resetForm();
      fetchData();
    } catch (error) {
      alert('Error: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Está seguro de eliminar este sorteo? Se perderán los resultados asociados.")) {
      try {
        await axios.delete(`${API_URL}/sorteos/${id}`);
        fetchData();
      } catch (error) {
        alert("Error al eliminar");
      }
    }
  };

  const prepareEdit = (sorteo) => {
    setFormData({
      id: sorteo.id,
      numero_sorteo: sorteo.numero_sorteo,
      fecha: sorteo.fecha,
      plan_id: sorteo.plan_id
    });
    setIsEditing(true);
    window.scrollTo(0, 0);
  };

  const resetForm = () => {
    setFormData({ id: null, numero_sorteo: '', fecha: '', plan_id: '' });
    setIsEditing(false);
  };

  // Función para encontrar el nombre del plan por su ID
  const getPlanName = (id) => {
    const plan = planes.find(p => p.id === id);
    return plan ? plan.nombre : `ID: ${id}`;
  };

  // FUNCIÓN AUXILIAR PARA LA TABLA (Misma lógica que TVPage para evitar error de -1 día)
  const formatearFechaTabla = (fechaStr) => {
    if (!fechaStr) return '';
    const fecha = new Date(`${fechaStr}T00:00:00`);
    return fecha.toLocaleDateString('es-CO');
  };

  // --- ORDEN: del sorteo más reciente al más antiguo (por fecha del sorteo).
  // Si dos sorteos comparten fecha, se desempata por id descendente (el más
  // recién creado primero). No se muta el estado "sorteos" original, solo se
  // ordena una copia para mostrarla en la tabla.
  const sorteosOrdenados = [...sorteos].sort((a, b) => {
    const diffFecha = new Date(b.fecha) - new Date(a.fecha);
    if (diffFecha !== 0) return diffFecha;
    return b.id - a.id;
  });

  return (
    <div className="admin-container">
      <h1 className="admin-title">{isEditing ? "Editar Sorteo" : "Programar Nuevo Sorteo"}</h1>

      {/* FORMULARIO DE CARGA */}
      <div className="premios-grid" style={{ 
        gridTemplateColumns: '1fr 1fr 1fr auto', 
        padding: '20px', 
        marginBottom: '30px' 
      }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>No. Sorteo</label>
          <input 
            type="text" 
            className="form-input"
            value={formData.numero_sorteo}
            onChange={e => setFormData({...formData, numero_sorteo: e.target.value})}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Fecha</label>
          <input 
            type="date" 
            className="form-input"
            value={formData.fecha}
            onChange={e => setFormData({...formData, fecha: e.target.value})}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Plan de Premios</label>
          <select 
            className="form-select"
            value={formData.plan_id}
            onChange={e => setFormData({...formData, plan_id: e.target.value})}
          >
            <option value="">-- Seleccione --</option>
            {planes.map(plan => (
              <option key={plan.id} value={plan.id}>{plan.nombre}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {isEditing ? "Guardar" : "Crear"}
          </button>
          {isEditing && (
            <button className="btn btn-secondary" onClick={resetForm}>X</button>
          )}
        </div>
      </div>

      <h2 className="admin-title" style={{ fontSize: '1.8rem' }}>Historial de Sorteos</h2>
      
      {loading ? (
        <p style={{textAlign: 'center', fontSize: '1.2rem'}}>Cargando sorteos...</p>
      ) : (
        <div style={{ 
          maxHeight: '500px', 
          overflowY: 'auto', 
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px' 
        }}>
          <table className="admin-table">
            <thead style={{ position: 'sticky', top: 0, background: '#1b3b80', zIndex: 5 }}>
              <tr>
                <th>No. Sorteo</th>
                <th>Fecha de Juego</th>
                <th>Plan Asociado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sorteosOrdenados.length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: 'center' }}>No hay sorteos registrados</td></tr>
              ) : (
                sorteosOrdenados.map((s) => (
                  <tr key={s.id}>
                    <td><strong style={{color: 'var(--color-oro)'}}>{s.numero_sorteo}</strong></td>
                    <td>{formatearFechaTabla(s.fecha)}</td>
                    <td>{getPlanName(s.plan_id)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        onClick={() => prepareEdit(s)} 
                        style={{ background: 'none', border: 'none', color: '#ffc107', cursor: 'pointer', fontSize: '1.2rem' }}
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button 
                        onClick={() => handleDelete(s.id)} 
                        style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '1.2rem', marginLeft: '15px' }}
                        title="Eliminar"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ManageSorteo;

// import React, { useState, useEffect } from 'react';
// import axios from 'axios';
// import API_URL from '../config';

// const ManageSorteo = () => {
//   const [sorteos, setSorteos] = useState([]);
//   const [planes, setPlanes] = useState([]);
//   const [loading, setLoading] = useState(false);
  
//   // Estado para el formulario (Crear/Editar)
//   const [formData, setFormData] = useState({
//     id: null,
//     numero_sorteo: '',
//     fecha: '',
//     plan_id: ''
//   });
//   const [isEditing, setIsEditing] = useState(false);

//   useEffect(() => {
//     fetchData();
//   }, []);

//   const fetchData = async () => {
//     setLoading(true);
//     try {
//       const [sorteosRes, planesRes] = await Promise.all([
//         axios.get(`${API_URL}/sorteos/`),
//         axios.get(`${API_URL}/planes/`)
//       ]);
//       setSorteos(sorteosRes.data);
//       setPlanes(planesRes.data);
//     } catch (err) {
//       console.error("Error cargando datos:", err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleSubmit = async () => {
//     // Validación básica
//     if (!formData.numero_sorteo || !formData.fecha || !formData.plan_id) {
//       return alert("Por favor complete todos los campos");
//     }

//     try {
//       if (isEditing) {
//         await axios.put(`${API_URL}/sorteos/${formData.id}`, formData);
//         alert('Sorteo actualizado correctamente');
//       } else {
//         await axios.post(`${API_URL}/sorteos/`, formData);
//         alert('Sorteo creado correctamente');
//       }
//       resetForm();
//       fetchData();
//     } catch (error) {
//       alert('Error: ' + (error.response?.data?.detail || error.message));
//     }
//   };

//   const handleDelete = async (id) => {
//     if (window.confirm("¿Está seguro de eliminar este sorteo? Se perderán los resultados asociados.")) {
//       try {
//         await axios.delete(`${API_URL}/sorteos/${id}`);
//         fetchData();
//       } catch (error) {
//         alert("Error al eliminar");
//       }
//     }
//   };

//   const prepareEdit = (sorteo) => {
//     setFormData({
//       id: sorteo.id,
//       numero_sorteo: sorteo.numero_sorteo,
//       fecha: sorteo.fecha,
//       plan_id: sorteo.plan_id
//     });
//     setIsEditing(true);
//     window.scrollTo(0, 0);
//   };

//   const resetForm = () => {
//     setFormData({ id: null, numero_sorteo: '', fecha: '', plan_id: '' });
//     setIsEditing(false);
//   };

//   // Función para encontrar el nombre del plan por su ID
//   const getPlanName = (id) => {
//     const plan = planes.find(p => p.id === id);
//     return plan ? plan.nombre : `ID: ${id}`;
//   };

//   // FUNCIÓN AUXILIAR PARA LA TABLA (Misma lógica que TVPage para evitar error de -1 día)
//   const formatearFechaTabla = (fechaStr) => {
//     if (!fechaStr) return '';
//     const fecha = new Date(`${fechaStr}T00:00:00`);
//     return fecha.toLocaleDateString('es-CO');
//   };

//   return (
//     <div className="admin-container">
//       <h1 className="admin-title">{isEditing ? "Editar Sorteo" : "Programar Nuevo Sorteo"}</h1>

//       {/* FORMULARIO DE CARGA */}
//       <div className="premios-grid" style={{ 
//         gridTemplateColumns: '1fr 1fr 1fr auto', 
//         padding: '20px', 
//         marginBottom: '30px' 
//       }}>
//         <div className="form-group" style={{ marginBottom: 0 }}>
//           <label>No. Sorteo</label>
//           <input 
//             type="text" 
//             className="form-input"
//             value={formData.numero_sorteo}
//             onChange={e => setFormData({...formData, numero_sorteo: e.target.value})}
//           />
//         </div>

//         <div className="form-group" style={{ marginBottom: 0 }}>
//           <label>Fecha</label>
//           <input 
//             type="date" 
//             className="form-input"
//             value={formData.fecha}
//             onChange={e => setFormData({...formData, fecha: e.target.value})}
//           />
//         </div>

//         <div className="form-group" style={{ marginBottom: 0 }}>
//           <label>Plan de Premios</label>
//           <select 
//             className="form-select"
//             value={formData.plan_id}
//             onChange={e => setFormData({...formData, plan_id: e.target.value})}
//           >
//             <option value="">-- Seleccione --</option>
//             {planes.map(plan => (
//               <option key={plan.id} value={plan.id}>{plan.nombre}</option>
//             ))}
//           </select>
//         </div>

//         <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
//           <button className="btn btn-primary" onClick={handleSubmit}>
//             {isEditing ? "Guardar" : "Crear"}
//           </button>
//           {isEditing && (
//             <button className="btn btn-secondary" onClick={resetForm}>X</button>
//           )}
//         </div>
//       </div>

//       <h2 className="admin-title" style={{ fontSize: '1.8rem' }}>Historial de Sorteos</h2>
      
//       {loading ? (
//         <p style={{textAlign: 'center', fontSize: '1.2rem'}}>Cargando sorteos...</p>
//       ) : (
//         <div style={{ 
//           maxHeight: '500px', 
//           overflowY: 'auto', 
//           border: '1px solid rgba(255,255,255,0.1)',
//           borderRadius: '8px' 
//         }}>
//           <table className="admin-table">
//             <thead style={{ position: 'sticky', top: 0, background: '#1b3b80', zIndex: 5 }}>
//               <tr>
//                 <th>No. Sorteo</th>
//                 <th>Fecha de Juego</th>
//                 <th>Plan Asociado</th>
//                 <th style={{ textAlign: 'center' }}>Acciones</th>
//               </tr>
//             </thead>
//             <tbody>
//               {sorteos.length === 0 ? (
//                 <tr><td colSpan="4" style={{ textAlign: 'center' }}>No hay sorteos registrados</td></tr>
//               ) : (
//                 sorteos.map((s) => (
//                   <tr key={s.id}>
//                     <td><strong style={{color: 'var(--color-oro)'}}>{s.numero_sorteo}</strong></td>
//                     <td>{formatearFechaTabla(s.fecha)}</td>
//                     <td>{getPlanName(s.plan_id)}</td>
//                     <td style={{ textAlign: 'center' }}>
//                       <button 
//                         onClick={() => prepareEdit(s)} 
//                         style={{ background: 'none', border: 'none', color: '#ffc107', cursor: 'pointer', fontSize: '1.2rem' }}
//                         title="Editar"
//                       >
//                         ✏️
//                       </button>
//                       <button 
//                         onClick={() => handleDelete(s.id)} 
//                         style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '1.2rem', marginLeft: '15px' }}
//                         title="Eliminar"
//                       >
//                         🗑️
//                       </button>
//                     </td>
//                   </tr>
//                 ))
//               )}
//             </tbody>
//           </table>
//         </div>
//       )}
//     </div>
//   );
// };

// export default ManageSorteo;