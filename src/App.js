import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import './App.css';

// Importación de Iconos
import { FaTv, FaClipboardList, FaTicketAlt, FaTrophy, FaVial, FaFlask, FaListAlt, FaSignInAlt, FaSignOutAlt, FaFileExcel } from 'react-icons/fa';
import { MdEditDocument } from 'react-icons/md';

import { AuthProvider, useAuth } from './context/AuthContext';
import RutaProtegida from './components/RutaProtegida';

import TVPage from './pages/TVPage';
import LoginPage from './pages/LoginPage';
import ManagePlan from './pages/ManagePlan';
import ManageSorteo from './pages/ManageSorteo';
import ManageResultados from './pages/ManageResultados';
import ResultadosPage from './pages/ResultadosPage';
import IngresoTubosPage from './pages/IngresoTubosPage';
import PreSorteosPage from './pages/PreSorteosPage';
import ManagePruebas from './pages/ManagePruebas';
import ProcesarSorteoPage from './pages/ProcesarSorteoPage';

// Roles que pueden operar el sistema (crear/editar sorteos, resultados, tubos, pruebas)
const ROLES_OPERATIVOS = ['admin', 'operador'];

// Componente de menú con iconos
const NavMenu = () => {
  const { usuario, estaAutenticado, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 9999,
      padding: '10px',
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      backgroundColor: 'rgba(0,0,0,0.1)', // Un fondo muy sutil para ver los iconos al pasar el mouse
      borderRadius: '0 0 10px 0'
    }}>
      <Link to="/" title="PANTALLA TV" style={{color:'white'}}>
        <FaTv size={24} />
      </Link>

      {estaAutenticado && (
        <>
          <Link to="/admin/plan" title="GESTIONAR PLANES" style={{color:'white'}}>
            <FaClipboardList size={24} />
          </Link>

          <Link to="/admin/sorteo" title="GESTIONAR SORTEOS" style={{color:'white'}}>
            <FaTicketAlt size={24} />
          </Link>

          <Link to="/admin/tubos" title="TUBOS POR URNA" style={{color:'white'}}>
            <FaVial size={24} />
          </Link>

          <Link to="/admin/presorteos" title="PRE-SORTEOS (PRUEBAS) - CAPTURA POR VOZ" style={{color:'white'}}>
            <FaFlask size={24} />
          </Link>

          <Link to="/admin/gestion-pruebas" title="GESTIÓN DE PRUEBAS (TABLA)" style={{color:'white'}}>
            <FaListAlt size={24} />
          </Link>

          <Link to="/admin/resultados" title="REGISTRAR RESULTADOS" style={{color:'white'}}>
            <MdEditDocument size={24} />
          </Link>

          <Link to="/admin/procesar-sorteo" title="PROCESAR SORTEO (EXCEL)" style={{color:'white'}}>
            <FaFileExcel size={24} />
          </Link>
        </>
      )}

      <Link to="/tablero" title="TABLERO DE RESULTADOS" style={{color:'white'}}>
        <FaTrophy size={24} />
      </Link>

      {estaAutenticado ? (
        <button
          onClick={handleLogout}
          title={`Cerrar sesión (${usuario.username} · ${usuario.rol})`}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0 }}
        >
          <FaSignOutAlt size={24} />
        </button>
      ) : (
        <Link to="/login" title="INICIAR SESIÓN" style={{color:'white'}}>
          <FaSignInAlt size={24} />
        </Link>
      )}
    </nav>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        {/* Contenedor con control de opacidad original */}
        <div
          onMouseEnter={e => e.currentTarget.style.opacity = 0.5}
          onMouseLeave={e => e.currentTarget.style.opacity = 0.01}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 10000,
            opacity: 0.01,
            transition: 'opacity 0.3s ease' // Suaviza la aparición
          }}
        >
          <NavMenu />
        </div>

        <Routes>
          {/* --- Rutas públicas: se muestran al aire / sin login --- */}
          <Route path="/" element={<TVPage />} />
          <Route path="/tablero" element={<ResultadosPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* --- Rutas operativas: admin y operador --- */}
          <Route element={<RutaProtegida rolesPermitidos={ROLES_OPERATIVOS} />}>
            <Route path="/admin/plan" element={<ManagePlan />} />
            <Route path="/admin/sorteo" element={<ManageSorteo />} />
            <Route path="/admin/resultados" element={<ManageResultados />} />
            <Route path="/admin/tubos" element={<IngresoTubosPage />} />
            <Route path="/admin/presorteos" element={<PreSorteosPage />} />
            <Route path="/admin/procesar-sorteo" element={<ProcesarSorteoPage />} />
          </Route>

          {/* --- Ruta de solo consulta: cualquier rol autenticado --- */}
          <Route element={<RutaProtegida />}>
            <Route path="/admin/gestion-pruebas" element={<ManagePruebas />} />
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;