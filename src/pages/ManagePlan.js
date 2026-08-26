import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_URL from '../config';

const ManagePlan = () => {
  
  
  // Estados para CRUD de Planes
  const [planes, setPlanes] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  // Estados del formulario
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [premios, setPremios] = useState([]);
  
  // Estados para gestión de premios
  const [currentPremio, setCurrentPremio] = useState({ id: null, id_temporal: null, titulo: '', valor: '', cantidad_balotas: 4 });
  const [isEditingPremio, setIsEditingPremio] = useState(false);

  // 1. READ: Cargar planes al montar el componente
  useEffect(() => {
    fetchPlanes();
  }, []);

  const fetchPlanes = async () => {
    try {
      const response = await axios.get(`${API_URL}/planes/`);
      setPlanes(response.data);
    } catch (error) {
      console.error("Error cargando planes:", error);
    }
  };

  const resetForm = () => {
    setSelectedPlanId(null);
    setNombre('');
    setDescripcion('');
    setPremios([]);
    setCurrentPremio({ id: null, id_temporal: null, titulo: '', valor: '', cantidad_balotas: 4 });
    setIsEditingPremio(false);
  };

  // Preparar formulario para Editar Plan
  const handleEditPlanSetup = (plan) => {
    setSelectedPlanId(plan.id);
    setNombre(plan.nombre);
    setDescripcion(plan.descripcion || '');
    // Cargamos los premios tal cual vienen de la BD (ya traen su 'id' real)
    setPremios(plan.premios || []);
    setCurrentPremio({ id: null, id_temporal: null, titulo: '', valor: '', cantidad_balotas: 4 });
    setIsEditingPremio(false);
    window.scrollTo(0, 0);
  };

  // ELIMINAR PLAN
  const handleDeletePlan = async (planId) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este plan y todos sus premios asociados?")) return;
    
    try {
      await axios.delete(`${API_URL}/planes/${planId}`);
      alert("Plan eliminado exitosamente");
      if (selectedPlanId === planId) resetForm();
      fetchPlanes();
    } catch (error) {
      console.error("Error eliminando el plan:", error);
      if (error.response && error.response.data) {
        alert(`No se pudo eliminar: ${error.response.data.detail}`);
      } else {
        alert("Error de conexión al eliminar el plan.");
      }
    }
  };

  // IMPORTAR CSV (Solo para planes nuevos)
  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      const nuevosPremios = lines.filter(l => l.trim()).map((line, index) => {
        const columns = line.includes(';') ? line.split(';') : line.split(',');
        return {
          id_temporal: Date.now() + index,
          titulo: columns[0]?.trim(),
          valor: columns[1]?.trim(),
          cantidad_balotas: columns[2] ? parseInt(columns[2].trim()) : 4
        };
      });
      setPremios([...premios, ...nuevosPremios]);
      alert(`Importados ${nuevosPremios.length} premios.`);
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  // AGREGAR O EDITAR PREMIO INDIVIDUAL
  const handleAddOrUpdatePremio = async () => {
    if (!currentPremio.titulo || !currentPremio.valor) return alert("Complete los campos del premio");

    if (selectedPlanId) {
      // MODO EDICIÓN DE PLAN: Los cambios impactan directamente la base de datos
      try {
        if (isEditingPremio && currentPremio.id) {
          // ACTUALIZAR PREMIO EXISTENTE EN BD (PUT)
          const payload = {
            titulo: currentPremio.titulo,
            valor: currentPremio.valor,
            cantidad_balotas: parseInt(currentPremio.cantidad_balotas)
          };
          const res = await axios.put(`${API_URL}/premios/${currentPremio.id}`, payload);
          setPremios(premios.map(p => p.id === currentPremio.id ? res.data : p));
          alert("Premio actualizado en la base de datos.");
        } else {
          // AGREGAR NUEVO PREMIO A PLAN EXISTENTE (POST)
          const payload = {
            titulo: currentPremio.titulo,
            valor: currentPremio.valor,
            cantidad_balotas: parseInt(currentPremio.cantidad_balotas)
          };
          const res = await axios.post(`${API_URL}/planes/${selectedPlanId}/premios`, payload);
          setPremios([...premios, res.data]);
          alert("Premio añadido exitosamente al plan.");
        }
      } catch (error) {
        console.error("Error gestionando el premio:", error);
        alert("Hubo un error al guardar el premio en el servidor.");
      }
    } else {
      // MODO CREACIÓN DE PLAN: Los cambios son locales (en memoria) hasta que se guarda el plan completo
      if (isEditingPremio) {
        setPremios(premios.map(p => p.id_temporal === currentPremio.id_temporal ? currentPremio : p));
      } else {
        setPremios([...premios, { ...currentPremio, id_temporal: Date.now() }]);
      }
    }

    // Resetear formulario de premio
    setCurrentPremio({ id: null, id_temporal: null, titulo: '', valor: '', cantidad_balotas: 4 });
    setIsEditingPremio(false);
  };

  // ELIMINAR PREMIO INDIVIDUAL
  const handleDeletePremio = async (premio) => {
    if (selectedPlanId && premio.id) {
      // MODO EDICIÓN: Eliminar directamente del backend
      if (!window.confirm("¿Seguro que deseas eliminar permanentemente este premio?")) return;
      try {
        await axios.delete(`${API_URL}/premios/${premio.id}`);
        setPremios(premios.filter(p => p.id !== premio.id));
        alert("Premio eliminado de la base de datos.");
      } catch (error) {
        if (error.response && error.response.status === 400) {
          alert(error.response.data.detail); // Muestra error si tiene sorteos vinculados
        } else {
          alert("Error eliminando el premio.");
        }
      }
    } else {
      // MODO CREACIÓN: Eliminar de la memoria local
      setPremios(premios.filter(x => x.id_temporal !== premio.id_temporal));
    }
  };

  // GUARDAR O ACTUALIZAR EL PLAN (Nombre y Descripción)
  const handleSavePlan = async () => {
    if (!nombre.trim()) return alert("El nombre del plan es obligatorio");
    if (premios.length === 0) return alert("Debe agregar al menos un premio");

    try {
      if (selectedPlanId) {
        // ACTUALIZAR PLAN EXISTENTE (Solo modifica nombre y descripción)
        const payload = { nombre, descripcion };
        const response = await axios.put(`${API_URL}/planes/${selectedPlanId}`, payload);
        if (response.status === 200) {
          alert("Información del plan (Nombre/Descripción) actualizada correctamente.");
          resetForm();
          fetchPlanes();
        }
      } else {
        // CREAR PLAN NUEVO CON TODOS SUS PREMIOS
        const premiosLimpios = premios.map(p => ({
          titulo: p.titulo,
          valor: p.valor,
          cantidad_balotas: parseInt(p.cantidad_balotas)
        }));

        const payload = { nombre, descripcion, premios: premiosLimpios };
        const response = await axios.post(`${API_URL}/planes/`, payload);
        
        if (response.status === 200 || response.status === 201) {
          alert("Plan creado exitosamente!");
          resetForm();
          fetchPlanes();
        }
      }
    } catch (error) {
      console.error("Error guardando el plan:", error);
      alert("Error de conexión al guardar el plan.");
    }
  };

  return (
    <div className="admin-container">
      <h1 className="admin-title">Gestionar Plan de Premios</h1>

      {/* SECCIÓN READ & DELETE: Lista de Planes */}
      <div style={{ marginBottom: '30px', background: '#f9f9f9', padding: '15px', borderRadius: '8px', color: '#333' }}>
        <h3>Planes Existentes</h3>
        {planes.length === 0 ? <p>No hay planes creados.</p> : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {planes.map(plan => (
              <li key={plan.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #ccc' }}>
                <span><strong>{plan.nombre}</strong> - {plan.descripcion || 'Sin descripción'}</span>
                <div>
                  <button onClick={() => handleEditPlanSetup(plan)} className="btn btn-secondary" style={{ marginRight: '10px' }}>Editar</button>
                  <button onClick={() => handleDeletePlan(plan.id)} className="btn btn-secondary" style={{ backgroundColor: '#ff4d4d', color: 'white' }}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <hr />

      {/* SECCIÓN FORMULARIO (CREATE / UPDATE) */}
      <h2 style={{ color: 'var(--color-oro)' }}>
        {selectedPlanId ? `Editando Plan #${selectedPlanId}` : 'Crear Nuevo Plan'}
      </h2>
      
      {selectedPlanId && (
        <button onClick={resetForm} className="btn btn-secondary" style={{ marginBottom: '15px' }}>Cancelar Edición</button>
      )}

      <div className="form-group" style={{ display: 'flex', gap: '15px' }}>
        <div style={{ flex: 1 }}><label>Nombre</label><input className="form-input" value={nombre} onChange={e => setNombre(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label>Descripción</label><input className="form-input" value={descripcion} onChange={e => setDescripcion(e.target.value)} /></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0' }}>
        <h3 style={{ color: 'var(--color-oro)', margin: 0 }}>{isEditingPremio ? "📝 Editando Premio" : "✨ Agregar Premio"}</h3>
        <label className="btn btn-secondary" style={{ cursor: selectedPlanId ? 'not-allowed' : 'pointer', opacity: selectedPlanId ? 0.5 : 1 }}>
          📥 Importar CSV <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: 'none' }} disabled={selectedPlanId !== null} />
        </label>
      </div>
      
      {/* FORMULARIO DE PREMIOS (Se habilita para agregar o editar sobre la marcha) */}
      <div className="premios-grid">
        <input placeholder="Título" className="form-input" value={currentPremio.titulo} onChange={e => setCurrentPremio({...currentPremio, titulo: e.target.value})} />
        <input placeholder="Valor" className="form-input" value={currentPremio.valor} onChange={e => setCurrentPremio({...currentPremio, valor: e.target.value})} />
        <select className="form-select" value={currentPremio.cantidad_balotas} onChange={e => setCurrentPremio({...currentPremio, cantidad_balotas: parseInt(e.target.value)})}>
          <option value="4">4 Cifras</option>
          <option value="6">6 Cifras (4+2)</option>
        </select>
        <button className="btn btn-primary" onClick={handleAddOrUpdatePremio}>
          {isEditingPremio ? "OK" : "+"}
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr><th>#</th><th>Título</th><th>Valor</th><th>Cifras</th><th>Acción</th></tr>
        </thead>
        <tbody>
          {premios.map((p, i) => {
            // Usamos p.id si viene de BD, o p.id_temporal si es memoria local
            const key = p.id || p.id_temporal;
            return (
              <tr key={key}>
                <td>{i + 1}</td><td>{p.titulo}</td><td>{p.valor}</td><td>{p.cantidad_balotas}</td>
                <td>
                  <button onClick={() => { setCurrentPremio(p); setIsEditingPremio(true); window.scrollTo(0,0); }} style={{ background: 'none', color: '#ffc107', border: 'none', cursor: 'pointer' }}>✏️</button>
                  <button onClick={() => handleDeletePremio(p)} style={{ background: 'none', color: '#ff4d4d', border: 'none', cursor: 'pointer', marginLeft: '10px' }}>🗑️</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* FOOTER FIJO */}
      <div className="fixed-footer" style={{ paddingBottom: '20px', textAlign: 'center' }}>
        <button className="btn btn-primary" onClick={handleSavePlan} style={{ width: '100%', maxWidth: '800px', height: '60px', fontSize: '1.4rem' }}>
          {selectedPlanId ? 'ACTUALIZAR NOMBRE/DESCRIPCIÓN DEL PLAN' : `GUARDAR PLAN COMPLETO (${premios.length} PREMIOS)`}
        </button>
      </div>
    </div>
  );
};

export default ManagePlan;