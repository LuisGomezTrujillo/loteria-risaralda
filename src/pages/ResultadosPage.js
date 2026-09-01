import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import logoMoneda from '../assets/logo.png';
import textoLogo from '../assets/letras.png';
import logoMZL from '../assets/logo-mzl-blanco.png';
import API_URL from '../config';

const UPDATE_INTERVAL_MS = 2000;
const AUTO_SLIDE_DELAY_MS = 15000;

// Convierte el texto de "valor" que viene del backend (ej. "$ 40.000.000")
// en un número comparable, para poder ordenar los slides de menor a mayor
// sin tener que hardcodear los montos en el frontend.
const parseValorNumerico = (valor) => {
  if (!valor) return 0;
  const digits = String(valor).replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
};

// Estas 3 categorías se identifican por el título del premio (son roles
// estructurales del plan: el premio mayor, el "gana siempre" y el
// promocional), no por su valor. Cada una usa una plantilla visual propia,
// así que se separan del resto antes de agrupar por valor.
const esMayor = (p) => p.titulo.toLowerCase().includes('mayor');
const esGanaSiempre = (p) => p.titulo.toLowerCase().includes('gana');
const esPromocional = (p) => p.titulo.toLowerCase().includes('promocional');

const ResultadosPage = () => {
  const [todosPremios, setTodosPremios] = useState([]);
  const [sorteoInfo, setSorteoInfo] = useState({ numero: '---', fecha: '' });
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [currentSlide, setCurrentSlide] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(UPDATE_INTERVAL_MS / 1000);
  const [slideTimeRemaining, setSlideTimeRemaining] = useState(null);
  
  // Ref para el intervalo del slide para tener control total sobre él
  const slideIntervalRef = useRef(null);

  // --- FETCH DATA ---
  const fetchData = useCallback(async () => {
    try {
      const resSorteos = await axios.get(`${API_URL}/sorteos/`);
      if (resSorteos.data.length === 0) return;
      const ultimoSorteo = resSorteos.data[resSorteos.data.length - 1];
      setSorteoInfo({ numero: ultimoSorteo.numero_sorteo, fecha: ultimoSorteo.fecha });

      const resPlan = await axios.get(`${API_URL}/planes/${ultimoSorteo.plan_id}`);
      const resResultados = await axios.get(`${API_URL}/sorteos/${ultimoSorteo.numero_sorteo}/publico`);
      const resultadosJugados = resResultados.data.resultados || [];

      const merged = resPlan.data.premios.map(premio => {
        const resultado = resultadosJugados.find(r => r.premio === premio.titulo);
        return {
          id: premio.id,
          titulo: premio.titulo,
          valor: premio.valor,
          balotas: premio.cantidad_balotas,
          numero: resultado ? resultado.numero_ganador : null
        };
      });

      setTodosPremios(merged);
      setLastUpdate(new Date());
      setTimeRemaining(UPDATE_INTERVAL_MS / 1000);
    } catch (error) { console.error("Error:", error); }
  }, []);

  // Timer de refresco de API (Independiente)
  useEffect(() => {
    fetchData();
    const dInt = setInterval(fetchData, UPDATE_INTERVAL_MS);
    const tInt = setInterval(() => {
      setTimeRemaining(p => (p > 1 ? p - 1 : UPDATE_INTERVAL_MS / 1000));
    }, 1000);
    return () => { clearInterval(dInt); clearInterval(tInt); };
  }, [fetchData]);

  // --- AGRUPACIÓN AUTOMÁTICA DE SLIDES POR VALOR (datos del backend) ---
  const slides = useMemo(() => {
    const mayor = todosPremios.find(esMayor);
    const ganaSiempre = todosPremios.find(esGanaSiempre);
    const promocional = todosPremios.find(esPromocional);

    const regulares = todosPremios.filter(
      p => !esMayor(p) && !esGanaSiempre(p) && !esPromocional(p)
    );

    // Agrupa los premios "seco" que comparten el mismo valor (tal cual viene
    // del backend) en un único slide, en lugar de rangos fijos en el frontend.
    const grupos = new Map();
    regulares.forEach(p => {
      const clave = (p.valor && String(p.valor).trim()) || p.titulo;
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(p);
    });

    const slidesLista = Array.from(grupos.entries())
      .map(([valor, premios]) => ({
        type: 'lista',
        header: valor,
        // Orden según el id real del premio (el orden en que fue
        // ingresado en el plan desde el backend), no un número adivinado
        // a partir del título. Así, premios sin número en el nombre
        // (ej. "SECO ESCALERA MILLONARIA") quedan en el lugar correcto
        // respecto a los demás premios del mismo valor.
        data: [...premios].sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
      }))
      .sort((a, b) => parseValorNumerico(a.header) - parseValorNumerico(b.header));

    const slidesEspeciales = [];
    if (mayor) {
      slidesEspeciales.push({ type: 'mayor', header: mayor.valor || mayor.titulo, data: mayor });
    }
    if (ganaSiempre) {
      slidesEspeciales.push({ type: 'gana_siempre', header: ganaSiempre.valor || ganaSiempre.titulo, data: ganaSiempre });
    }
    if (promocional) {
      slidesEspeciales.push({ type: 'promocional', header: promocional.valor || promocional.titulo, data: promocional });
    }

    return [...slidesLista, ...slidesEspeciales];
  }, [todosPremios]);

  // El contenido del slide actual, cuidando que el índice siga siendo
  // válido si la cantidad de slides cambia (ej. al llegar datos nuevos).
  const content = useMemo(() => {
    return slides[currentSlide] || slides[0] || { type: 'lista', header: '', data: [] };
  }, [slides, currentSlide]);

  // --- VALIDACIÓN DE COMPLETITUD ---
  const isComplete = useMemo(() => {
    if (!content.data) return false;
    if (content.type === 'lista') {
      return content.data.length > 0 && content.data.every(p => p.numero && String(p.numero).trim() !== "");
    }
    return content.data.numero && String(content.data.numero).trim() !== "";
  }, [content]);

  // --- CONTROL DEL SLIDER (PRO) ---
  const handleNext = useCallback(() => {
    setCurrentSlide(prev => (slides.length > 0 && prev < slides.length - 1 ? prev + 1 : 0));
    setSlideTimeRemaining(null); // Reset visual inmediato
  }, [slides.length]);

  useEffect(() => {
    // 1. Limpiar cualquier intervalo previo si cambia el estado o el slide
    if (slideIntervalRef.current) clearInterval(slideIntervalRef.current);
    
    // 2. Si no está completo, nos aseguramos de que el timer visual sea null y salimos
    if (!isComplete) {
      setSlideTimeRemaining(null);
      return;
    }

    // 3. Iniciamos el contador de cambio de slide
    let countdown = AUTO_SLIDE_DELAY_MS / 1000;
    setSlideTimeRemaining(countdown);

    slideIntervalRef.current = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        clearInterval(slideIntervalRef.current);
        handleNext();
      } else {
        setSlideTimeRemaining(countdown);
      }
    }, 1000);

    return () => { if (slideIntervalRef.current) clearInterval(slideIntervalRef.current); };
  }, [isComplete, currentSlide, handleNext]); // Solo reacciona a cambios reales de estado o de slide manual


  // --- HELPERS DE RENDER ---

  // TVs HD antiguas (Panasonic de +3 años) suelen tener poco espacio
  // vertical útil (resolución más baja, a veces con overscan que recorta
  // los bordes). Con pocas filas el diseño original (pensado para 1-5
  // premios) se ve bien, pero con 11 filas (ej. el grupo "30 MILLONES")
  // el texto se desborda o se corta. Esta función reduce fuente y
  // espaciado progresivamente según la cantidad de filas del slide.
  const getEscalaFila = (cantidadFilas) => {
    const filas = Math.max(cantidadFilas, 1);
    if (filas <= 4) return { fontSize: '4vh', numeroSize: '5.6vh', padding: '1.2vh 1.2vw' };
    if (filas <= 6) return { fontSize: '3.2vh', numeroSize: '4.6vh', padding: '0.9vh 1.2vw' };
    if (filas <= 8) return { fontSize: '2.6vh', numeroSize: '3.8vh', padding: '0.6vh 1.2vw' };
    return { fontSize: '2.1vh', numeroSize: '3.1vh', padding: '0.4vh 1.2vw' };
  };

  const renderNumero = (numero, cantidadBalotas, isHuge = false, numeroSize = null) => {
    const overrideStyle = numeroSize ? { fontSize: numeroSize } : undefined;
    if (!numero) return <span className="num-placeholder" style={overrideStyle}>{"-".repeat(cantidadBalotas || 4)}</span>;
    const n = String(numero);
    const principal = n.length > 4 ? n.substring(0, n.length - 3) : n;
    const serie = n.length > 4 ? n.substring(n.length - 3) : "";
    return (
      <div className={`numero-container ${isHuge ? 'huge-layout' : 'list-layout'}`}>
        <span className="num-principal" style={overrideStyle}>{principal}</span>
        {serie && <span className="num-serie" style={overrideStyle}>{serie}</span>}
      </div>
    );
  };

  // Separa el texto del título ("Seco") del número de premio seco, para
  // poder destacar el número en tamaño grande sin que se rompa a otra línea.
  const renderTituloPremio = (titulo, fontSize = null) => {
    const match = titulo.match(/(\d+)/);
    if (!match) {
      return <span className="titulo-premio" style={fontSize ? { fontSize } : undefined}>{titulo}</span>;
    }
    const numero = match[0];
    const antes = titulo.slice(0, match.index).trim();
    const despues = titulo.slice(match.index + numero.length).trim();
    return (
      <span
        className="titulo-premio"
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: '0.35em',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          fontSize: fontSize || undefined,
        }}
      >
        {antes && <span className="titulo-texto">{antes}</span>}
        <span
          className="titulo-numero"
          style={{
            fontWeight: 800,
            color: '#FFC94A',
            textShadow: '0 0 6px rgba(255, 201, 74, 0.55), 0 1px 2px rgba(0,0,0,0.45)',
          }}
        >
          {numero}
        </span>
        {despues && <span className="titulo-texto">{despues}</span>}
      </span>
    );
  };

  return (
    <div className="layout-split">
      <aside className="sidebar-brand">
        <div
          className="brand-header"
          style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
        >
          <img
            src={logoMZL}
            className="logo-mzl-white"
            alt="MZL Manizales del alma"
            style={{ height: '25.5vh', width: 'auto' }}
          />
          <div
            className="brand-divider"
            style={{
              width: '1px',
              alignSelf: 'stretch',
              backgroundColor: 'rgba(255,255,255,0.35)',
            }}
          />
          <img src={logoMoneda} className="logo-3d-small" alt="Logo" style={{ height: '25.5vh', width: 'auto' }} />
          <img src={textoLogo} className="logo-text-small" alt="Lotería" style={{ height: '10.5vh', width: 'auto' }} />
        </div>
        <div className="draw-info">
          <div className="draw-label">SORTEO</div>
          <div className="draw-number">{sorteoInfo.numero}</div>
          <div className="draw-date">{sorteoInfo.fecha}</div>
        </div>
      </aside>

      <main className="main-content">
        <div className="slider-area">
          {content.type === 'mayor' && content.data && (
            <div className="card-huge mayor-theme">
              <div className="card-header-huge">{content.header}</div>
              <div className="card-body-huge">
                <div className="value-huge">{content.data.titulo}</div>
                <div className="number-wrapper-huge">{renderNumero(content.data.numero, content.data.balotas, true)}</div>
              </div>
            </div>
          )}
          {content.type === 'gana_siempre' && content.data && (
            <div className="card-list">
              <div className="card-header-list">{content.header}</div>
              <div className="card-body-list single-item-centered">
                <table className="table-prizes">
                  <tbody>
                    <tr>
                      <td className="td-label" style={{fontSize: '5vh', color: '#ddd'}}>{content.data.titulo}</td>
                      <td className="td-number">{renderNumero(content.data.numero, content.data.balotas, false)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {content.type === 'promocional' && content.data && (
            <div className="card-list promo-theme">
              <div className="card-header-list">{content.header}</div>
              <div className="card-body-list single-item-centered">
                <table className="table-prizes">
                  <tbody>
                    <tr>
                      <td className="td-label" style={{fontSize: '5vh', color: '#ddd'}}>{content.data.titulo}</td>
                      <td className="td-number">{renderNumero(content.data.numero, content.data.balotas, false)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {content.type === 'lista' && (() => {
            const escala = getEscalaFila(content.data.length);
            return (
              <div className="card-list">
                <div className="card-header-list">{content.header}</div>
                <div className="card-body-list">
                  <table className="table-prizes">
                    <tbody>
                      {content.data.map((p, idx) => (
                        <tr key={idx}>
                          <td className="td-label" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', padding: escala.padding }}>
                            {renderTituloPremio(p.titulo, escala.fontSize)}
                          </td>
                          <td className="td-number" style={{ verticalAlign: 'middle', padding: escala.padding }}>
                            {renderNumero(p.numero, p.balotas, false, escala.numeroSize)}
                          </td>
                        </tr>
                      ))}
                      {content.data.length === 0 && <tr><td colSpan="2" style={{ textAlign: 'center', padding: '20px' }}>Por jugar...</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>

        <footer className="footer-controls">
          <div className="footer-info left">
            <small>Actualización en: {timeRemaining}s</small><br/>
            <span>V: {lastUpdate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>
          </div>
          <div className="footer-nav">
            <button className="nav-btn" onClick={() => { if(slideIntervalRef.current) clearInterval(slideIntervalRef.current); setCurrentSlide(p => (p > 0 ? p - 1 : slides.length - 1)); }}>◀</button>
            <div className="nav-dots">
              {slides.map((s, idx) => <span key={idx} className={`dot ${idx === currentSlide ? 'active' : ''}`} />)}
            </div>
            <button className="nav-btn" onClick={() => { if(slideIntervalRef.current) clearInterval(slideIntervalRef.current); handleNext(); }}>▶</button>
          </div>
          <div className="footer-info right">
            {slideTimeRemaining !== null ? `Próximo slide: ${slideTimeRemaining}s` : 'Esperando resultados...'}
          </div>
        </footer>
      </main>
    </div>
  );
};

export default ResultadosPage;


// import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
// import axios from 'axios';
// import logoMoneda from '../assets/logo.png';
// import textoLogo from '../assets/letras.png';
// import logoMZL from '../assets/logo-mzl-blanco.png';
// import API_URL from '../config';

// const UPDATE_INTERVAL_MS = 2000;
// const AUTO_SLIDE_DELAY_MS = 15000;

// // Convierte el texto de "valor" que viene del backend (ej. "$ 40.000.000")
// // en un número comparable, para poder ordenar los slides de menor a mayor
// // sin tener que hardcodear los montos en el frontend.
// const parseValorNumerico = (valor) => {
//   if (!valor) return 0;
//   const digits = String(valor).replace(/[^\d]/g, '');
//   return digits ? parseInt(digits, 10) : 0;
// };

// // Estas 3 categorías se identifican por el título del premio (son roles
// // estructurales del plan: el premio mayor, el "gana siempre" y el
// // promocional), no por su valor. Cada una usa una plantilla visual propia,
// // así que se separan del resto antes de agrupar por valor.
// const esMayor = (p) => p.titulo.toLowerCase().includes('mayor');
// const esGanaSiempre = (p) => p.titulo.toLowerCase().includes('gana');
// const esPromocional = (p) => p.titulo.toLowerCase().includes('promocional');

// const ResultadosPage = () => {
//   const [todosPremios, setTodosPremios] = useState([]);
//   const [sorteoInfo, setSorteoInfo] = useState({ numero: '---', fecha: '' });
//   const [lastUpdate, setLastUpdate] = useState(new Date());
//   const [currentSlide, setCurrentSlide] = useState(0);
//   const [timeRemaining, setTimeRemaining] = useState(UPDATE_INTERVAL_MS / 1000);
//   const [slideTimeRemaining, setSlideTimeRemaining] = useState(null);
  
//   // Ref para el intervalo del slide para tener control total sobre él
//   const slideIntervalRef = useRef(null);

//   // --- FETCH DATA ---
//   const fetchData = useCallback(async () => {
//     try {
//       const resSorteos = await axios.get(`${API_URL}/sorteos/`);
//       if (resSorteos.data.length === 0) return;
//       const ultimoSorteo = resSorteos.data[resSorteos.data.length - 1];
//       setSorteoInfo({ numero: ultimoSorteo.numero_sorteo, fecha: ultimoSorteo.fecha });

//       const resPlan = await axios.get(`${API_URL}/planes/${ultimoSorteo.plan_id}`);
//       const resResultados = await axios.get(`${API_URL}/sorteos/${ultimoSorteo.numero_sorteo}/publico`);
//       const resultadosJugados = resResultados.data.resultados || [];

//       const merged = resPlan.data.premios.map(premio => {
//         const resultado = resultadosJugados.find(r => r.premio === premio.titulo);
//         return {
//           titulo: premio.titulo,
//           valor: premio.valor,
//           balotas: premio.cantidad_balotas,
//           numero: resultado ? resultado.numero_ganador : null
//         };
//       });

//       setTodosPremios(merged);
//       setLastUpdate(new Date());
//       setTimeRemaining(UPDATE_INTERVAL_MS / 1000);
//     } catch (error) { console.error("Error:", error); }
//   }, []);

//   // Timer de refresco de API (Independiente)
//   useEffect(() => {
//     fetchData();
//     const dInt = setInterval(fetchData, UPDATE_INTERVAL_MS);
//     const tInt = setInterval(() => {
//       setTimeRemaining(p => (p > 1 ? p - 1 : UPDATE_INTERVAL_MS / 1000));
//     }, 1000);
//     return () => { clearInterval(dInt); clearInterval(tInt); };
//   }, [fetchData]);

//   // --- AGRUPACIÓN AUTOMÁTICA DE SLIDES POR VALOR (datos del backend) ---
//   const slides = useMemo(() => {
//     const mayor = todosPremios.find(esMayor);
//     const ganaSiempre = todosPremios.find(esGanaSiempre);
//     const promocional = todosPremios.find(esPromocional);

//     const regulares = todosPremios.filter(
//       p => !esMayor(p) && !esGanaSiempre(p) && !esPromocional(p)
//     );

//     // Agrupa los premios "seco" que comparten el mismo valor (tal cual viene
//     // del backend) en un único slide, en lugar de rangos fijos en el frontend.
//     const grupos = new Map();
//     regulares.forEach(p => {
//       const clave = (p.valor && String(p.valor).trim()) || p.titulo;
//       if (!grupos.has(clave)) grupos.set(clave, []);
//       grupos.get(clave).push(p);
//     });

//     const slidesLista = Array.from(grupos.entries())
//       .map(([valor, premios]) => ({
//         type: 'lista',
//         header: valor,
//         // Orden ascendente: el premio con el número más alto (el último
//         // ingresado dentro del grupo) queda en la fila de abajo.
//         data: [...premios].sort((a, b) => {
//           const nA = a.titulo.match(/(\d+)/);
//           const nB = b.titulo.match(/(\d+)/);
//           return (nA ? parseInt(nA[0], 10) : 0) - (nB ? parseInt(nB[0], 10) : 0);
//         }),
//       }))
//       .sort((a, b) => parseValorNumerico(a.header) - parseValorNumerico(b.header));

//     const slidesEspeciales = [];
//     if (mayor) {
//       slidesEspeciales.push({ type: 'mayor', header: mayor.valor || mayor.titulo, data: mayor });
//     }
//     if (ganaSiempre) {
//       slidesEspeciales.push({ type: 'gana_siempre', header: ganaSiempre.valor || ganaSiempre.titulo, data: ganaSiempre });
//     }
//     if (promocional) {
//       slidesEspeciales.push({ type: 'promocional', header: promocional.valor || promocional.titulo, data: promocional });
//     }

//     return [...slidesLista, ...slidesEspeciales];
//   }, [todosPremios]);

//   // El contenido del slide actual, cuidando que el índice siga siendo
//   // válido si la cantidad de slides cambia (ej. al llegar datos nuevos).
//   const content = useMemo(() => {
//     return slides[currentSlide] || slides[0] || { type: 'lista', header: '', data: [] };
//   }, [slides, currentSlide]);

//   // --- VALIDACIÓN DE COMPLETITUD ---
//   const isComplete = useMemo(() => {
//     if (!content.data) return false;
//     if (content.type === 'lista') {
//       return content.data.length > 0 && content.data.every(p => p.numero && String(p.numero).trim() !== "");
//     }
//     return content.data.numero && String(content.data.numero).trim() !== "";
//   }, [content]);

//   // --- CONTROL DEL SLIDER (PRO) ---
//   const handleNext = useCallback(() => {
//     setCurrentSlide(prev => (slides.length > 0 && prev < slides.length - 1 ? prev + 1 : 0));
//     setSlideTimeRemaining(null); // Reset visual inmediato
//   }, [slides.length]);

//   useEffect(() => {
//     // 1. Limpiar cualquier intervalo previo si cambia el estado o el slide
//     if (slideIntervalRef.current) clearInterval(slideIntervalRef.current);
    
//     // 2. Si no está completo, nos aseguramos de que el timer visual sea null y salimos
//     if (!isComplete) {
//       setSlideTimeRemaining(null);
//       return;
//     }

//     // 3. Iniciamos el contador de cambio de slide
//     let countdown = AUTO_SLIDE_DELAY_MS / 1000;
//     setSlideTimeRemaining(countdown);

//     slideIntervalRef.current = setInterval(() => {
//       countdown -= 1;
//       if (countdown <= 0) {
//         clearInterval(slideIntervalRef.current);
//         handleNext();
//       } else {
//         setSlideTimeRemaining(countdown);
//       }
//     }, 1000);

//     return () => { if (slideIntervalRef.current) clearInterval(slideIntervalRef.current); };
//   }, [isComplete, currentSlide, handleNext]); // Solo reacciona a cambios reales de estado o de slide manual


//   // --- HELPERS DE RENDER ---
//   const renderNumero = (numero, cantidadBalotas, isHuge = false) => {
//     if (!numero) return <span className="num-placeholder">{"-".repeat(cantidadBalotas || 4)}</span>;
//     const n = String(numero);
//     const principal = n.length > 4 ? n.substring(0, n.length - 3) : n;
//     const serie = n.length > 4 ? n.substring(n.length - 3) : "";
//     return (
//       <div className={`numero-container ${isHuge ? 'huge-layout' : 'list-layout'}`}>
//         <span className="num-principal">{principal}</span>
//         {serie && <span className="num-serie">{serie}</span>}
//       </div>
//     );
//   };

//   // Separa el texto del título ("Seco") del número de premio seco, para
//   // poder destacar el número en tamaño grande sin que se rompa a otra línea.
//   const renderTituloPremio = (titulo) => {
//     const match = titulo.match(/(\d+)/);
//     if (!match) {
//       return <span className="titulo-premio">{titulo}</span>;
//     }
//     const numero = match[0];
//     const antes = titulo.slice(0, match.index).trim();
//     const despues = titulo.slice(match.index + numero.length).trim();
//     return (
//       <span
//         className="titulo-premio"
//         style={{
//           display: 'inline-flex',
//           alignItems: 'baseline',
//           gap: '0.35em',
//           whiteSpace: 'nowrap',
//           maxWidth: '100%',
//         }}
//       >
//         {antes && <span className="titulo-texto">{antes}</span>}
//         <span
//           className="titulo-numero"
//           style={{
//             fontWeight: 800,
//             color: '#FFC94A',
//             textShadow: '0 0 6px rgba(255, 201, 74, 0.55), 0 1px 2px rgba(0,0,0,0.45)',
//           }}
//         >
//           {numero}
//         </span>
//         {despues && <span className="titulo-texto">{despues}</span>}
//       </span>
//     );
//   };

//   return (
//     <div className="layout-split">
//       <aside className="sidebar-brand">
//         <div
//           className="brand-header"
//           style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
//         >
//           <img
//             src={logoMZL}
//             className="logo-mzl-white"
//             alt="MZL Manizales del alma"
//             style={{ height: '25.5vh', width: 'auto' }}
//           />
//           <div
//             className="brand-divider"
//             style={{
//               width: '1px',
//               alignSelf: 'stretch',
//               backgroundColor: 'rgba(255,255,255,0.35)',
//             }}
//           />
//           <img src={logoMoneda} className="logo-3d-small" alt="Logo" style={{ height: '25.5vh', width: 'auto' }} />
//           <img src={textoLogo} className="logo-text-small" alt="Lotería" style={{ height: '10.5vh', width: 'auto' }} />
//         </div>
//         <div className="draw-info">
//           <div className="draw-label">SORTEO</div>
//           <div className="draw-number">{sorteoInfo.numero}</div>
//           <div className="draw-date">{sorteoInfo.fecha}</div>
//         </div>
//       </aside>

//       <main className="main-content">
//         <div className="slider-area">
//           {content.type === 'mayor' && content.data && (
//             <div className="card-huge mayor-theme">
//               <div className="card-header-huge">{content.header}</div>
//               <div className="card-body-huge">
//                 <div className="value-huge">{content.data.titulo}</div>
//                 <div className="number-wrapper-huge">{renderNumero(content.data.numero, content.data.balotas, true)}</div>
//               </div>
//             </div>
//           )}
//           {content.type === 'gana_siempre' && content.data && (
//             <div className="card-list">
//               <div className="card-header-list">{content.header}</div>
//               <div className="card-body-list single-item-centered">
//                 <table className="table-prizes">
//                   <tbody>
//                     <tr>
//                       <td className="td-label" style={{fontSize: '5vh', color: '#ddd'}}>{content.data.titulo}</td>
//                       <td className="td-number">{renderNumero(content.data.numero, content.data.balotas, false)}</td>
//                     </tr>
//                   </tbody>
//                 </table>
//               </div>
//             </div>
//           )}
//           {content.type === 'promocional' && content.data && (
//             <div className="card-list promo-theme">
//               <div className="card-header-list">{content.header}</div>
//               <div className="card-body-list single-item-centered">
//                 <table className="table-prizes">
//                   <tbody>
//                     <tr>
//                       <td className="td-label" style={{fontSize: '5vh', color: '#ddd'}}>{content.data.titulo}</td>
//                       <td className="td-number">{renderNumero(content.data.numero, content.data.balotas, false)}</td>
//                     </tr>
//                   </tbody>
//                 </table>
//               </div>
//             </div>
//           )}
//           {content.type === 'lista' && (
//             <div className="card-list">
//               <div className="card-header-list">{content.header}</div>
//               <div className="card-body-list">
//                 <table className="table-prizes">
//                   <tbody>
//                     {content.data.map((p, idx) => (
//                       <tr key={idx}>
//                         <td className="td-label" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
//                           {renderTituloPremio(p.titulo)}
//                         </td>
//                         <td className="td-number" style={{ verticalAlign: 'middle' }}>{renderNumero(p.numero, p.balotas, false)}</td>
//                       </tr>
//                     ))}
//                     {content.data.length === 0 && <tr><td colSpan="2" style={{ textAlign: 'center', padding: '20px' }}>Por jugar...</td></tr>}
//                   </tbody>
//                 </table>
//               </div>
//             </div>
//           )}
//         </div>

//         <footer className="footer-controls">
//           <div className="footer-info left">
//             <small>Actualización en: {timeRemaining}s</small><br/>
//             <span>V: {lastUpdate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>
//           </div>
//           <div className="footer-nav">
//             <button className="nav-btn" onClick={() => { if(slideIntervalRef.current) clearInterval(slideIntervalRef.current); setCurrentSlide(p => (p > 0 ? p - 1 : slides.length - 1)); }}>◀</button>
//             <div className="nav-dots">
//               {slides.map((s, idx) => <span key={idx} className={`dot ${idx === currentSlide ? 'active' : ''}`} />)}
//             </div>
//             <button className="nav-btn" onClick={() => { if(slideIntervalRef.current) clearInterval(slideIntervalRef.current); handleNext(); }}>▶</button>
//           </div>
//           <div className="footer-info right">
//             {slideTimeRemaining !== null ? `Próximo slide: ${slideTimeRemaining}s` : 'Esperando resultados...'}
//           </div>
//         </footer>
//       </main>
//     </div>
//   );
// };

// export default ResultadosPage;
