// src/pages/LoginPage.js

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destino = location.state?.from?.pathname || '/admin/resultados';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await login(username, password);
      navigate(destino, { replace: true });
    } catch (err) {
      const detalle = err.response?.data?.detail;
      setError(detalle || 'No se pudo iniciar sesión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1 className="login-titulo">Lotería del Risaralda</h1>
        <p className="login-subtitulo">Iniciar sesión</p>

        <label className="login-label" htmlFor="username">Usuario</label>
        <input
          id="username"
          className="login-input"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
        />

        <label className="login-label" htmlFor="password">Contraseña</label>
        <input
          id="password"
          className="login-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="login-error">{error}</p>}

        <button className="login-boton" type="submit" disabled={enviando}>
          {enviando ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}