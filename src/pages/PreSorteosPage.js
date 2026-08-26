import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import API_URL from '../config';

/*
  PRE-SORTEOS (PRUEBAS) - CAPTURA DE VOZ CONTINUA EN TIEMPO REAL
  ----------------------------------------------------------------
  No dependen del Plan de Premios. Cada sorteo tiene entre 5 y 10 "Pruebas"
  numeradas secuencialmente (1..10). Cada prueba captura un único resultado:
  - 6 balotas -> 7 cifras (4 balotas de 1 dígito + serie de 2 dígitos + 1 balota)
  - 4 balotas -> 4 cifras (4 balotas de 1 dígito)

  ENDPOINTS:
  - POST   /sorteos/{numero_sorteo}/presorteos/                body: { cantidad_balotas }
  - GET    /sorteos/{numero_sorteo}/presorteos/
  - PUT    /sorteos/{numero_sorteo}/presorteos/{numero_prueba} body: { numeros_ganadores }
  - DELETE /sorteos/{numero_sorteo}/presorteos/{numero_prueba}

  MODO VOZ CONTINUO (requiere Chrome en Android, y HTTPS):
  Se activa UNA vez con el botón grande. Desde ahí:
  - "prueba tres"  -> selecciona/crea la Prueba 3 y la deja activa.
  - "uno dos tres cuatro cero siete" -> llena las balotas en tiempo real,
    dígito por dígito, incluso repartido en varias frases.
  - Al completar todas las cifras -> se guarda solo y avanza a la
    siguiente prueba automáticamente.
  - "guardar"   -> fuerza guardar ya (aunque falten cifras, si el backend
    lo permite) o simplemente confirma lo que ya está lleno.
  - "siguiente" -> avanza a la siguiente prueba sin esperar a completar.
*/

const MAX_PRUEBAS = 10;

// Palabras -> dígito individual (para dictar el resultado, balota por balota)
const PALABRAS_DIGITO = {
  cero: '0', un: '1', uno: '1', una: '1', dos: '2', tres: '3', cuatro: '4',
  cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9',
};

// Palabras -> número de prueba (incluye "diez" como número completo, ya
// que las pruebas van de 1 a 10)
const PALABRAS_NUMERO_PRUEBA = { ...PALABRAS_DIGITO, diez: '10' };

// --- Números compuestos en español, de 0 a 39 (para la balota de la
// "serie", urna 5, que NO se dicta dígito por dígito sino como un número
// completo: "veinte", "treinta y cinco", "siete", etc.) ---
const UNIDADES_0_9 = {
  cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4,
  cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
};
const ESPECIALES_10_19 = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, dieciséis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
};
const VEINTIS_20_29 = {
  veinte: 20, veintiuno: 21, veintiún: 21, veintiun: 21, veintidos: 22, veintidós: 22,
  veintitres: 23, veintitrés: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintiséis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};

// Intenta leer un número de 0 a 39 a partir de tokens[i]. Devuelve
// { valor, consumidos } (consumidos = cuántas palabras ocupó, 1 a 3 para
// el caso "treinta y nueve") o null si tokens[i] no arranca un número.
const leerNumeroSerie = (tokens, i) => {
  const t = tokens[i];
  if (t === undefined) return null;
  if (t in UNIDADES_0_9) return { valor: UNIDADES_0_9[t], consumidos: 1 };
  if (t in ESPECIALES_10_19) return { valor: ESPECIALES_10_19[t], consumidos: 1 };
  if (t in VEINTIS_20_29) return { valor: VEINTIS_20_29[t], consumidos: 1 };
  if (t === 'treinta') {
    if (tokens[i + 1] === 'y' && tokens[i + 2] in UNIDADES_0_9) {
      return { valor: 30 + UNIDADES_0_9[tokens[i + 2]], consumidos: 3 };
    }
    return { valor: 30, consumidos: 1 };
  }
  if (/^\d{1,2}$/.test(t)) {
    const n = parseInt(t, 10);
    if (n >= 0 && n <= 39) return { valor: n, consumidos: 1 };
  }
  return null;
};

// Determina cuántos dígitos caben en cada balota (igual que en TVPage):
// con 6 balotas, la 5ta (índice 4) es la "serie" de 2 dígitos.
const getMaxLength = (index, numInputs) => {
  if (numInputs === 6 && index === 4) return 2;
  return 1;
};

// Reconstruye el arreglo de valores por balota a partir del string guardado.
const splitNumeroGanador = (numero, numInputs) => {
  const valores = Array(numInputs).fill('');
  if (!numero) return valores;
  let cursor = 0;
  for (let i = 0; i < numInputs; i++) {
    const len = getMaxLength(i, numInputs);
    valores[i] = numero.slice(cursor, cursor + len);
    cursor += len;
  }
  return valores;
};

// Extrae una secuencia de dígitos individuales de un texto hablado.
const extraerDigitos = (texto, mapa) => {
  const tokens = texto.toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  let digitos = '';
  tokens.forEach((token) => {
    if (mapa[token] !== undefined) {
      digitos += mapa[token];
    } else if (/^\d+$/.test(token)) {
      digitos += token;
    }
  });
  return digitos;
};

const PreSorteosPage = () => {
  const [sorteo, setSorteo] = useState({ id: null, numero_sorteo: '---', fecha: '---' });
  const [pruebas, setPruebas] = useState([]);
  const [pruebaActivaNumero, setPruebaActivaNumero] = useState(null);
  const [cantidadNueva, setCantidadNueva] = useState(6); // 6 o 4, para pruebas creadas por voz
  const [inputValues, setInputValues] = useState(Array(6).fill(''));
  const [creando, setCreando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [modoVozActivo, setModoVozActivo] = useState(false);

  const inputRefs = useRef([]);

  // Referencias "vivas" para que los callbacks de voz (definidos una vez por
  // render, pero ejecutados de forma asíncrona por el motor de reconocimiento)
  // siempre lean el estado más reciente sin depender de closures viejas.
  const sorteoRef = useRef(sorteo);
  const pruebasRef = useRef(pruebas);
  const pruebaActivaNumeroRef = useRef(pruebaActivaNumero);
  const inputValuesRef = useRef(inputValues);
  const cantidadNuevaRef = useRef(cantidadNueva);

  useEffect(() => { sorteoRef.current = sorteo; }, [sorteo]);
  useEffect(() => { pruebasRef.current = pruebas; }, [pruebas]);
  useEffect(() => { pruebaActivaNumeroRef.current = pruebaActivaNumero; }, [pruebaActivaNumero]);
  useEffect(() => { inputValuesRef.current = inputValues; }, [inputValues]);
  useEffect(() => { cantidadNuevaRef.current = cantidadNueva; }, [cantidadNueva]);

  // --- CARGA INICIAL: sorteo activo + pruebas existentes ---
  const cargarTodo = useCallback(async () => {
    try {
      const resSorteos = await axios.get(`${API_URL}/sorteos/`);
      if (resSorteos.data.length === 0) return;
      const ultimoSorteo = resSorteos.data[resSorteos.data.length - 1];
      setSorteo(ultimoSorteo);

      const resPruebas = await axios.get(`${API_URL}/sorteos/${ultimoSorteo.numero_sorteo}/presorteos/`);
      setPruebas(resPruebas.data);
      if (resPruebas.data.length > 0) {
        setPruebaActivaNumero(resPruebas.data[resPruebas.data.length - 1].numero_prueba);
      }
    } catch (error) {
      console.error('Error cargando pre-sorteos:', error);
    }
  }, []);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const pruebaSeleccionada = pruebas.find((p) => p.numero_prueba === pruebaActivaNumero);
  const numInputs = pruebaSeleccionada ? (pruebaSeleccionada.cantidad_balotas === 6 ? 6 : 4) : 6;
  const numeroCifras = numInputs === 6 ? 7 : 4;

  // --- Al cambiar de prueba activa, precargamos sus valores ---
  useEffect(() => {
    if (!pruebaSeleccionada) {
      setInputValues(Array(6).fill(''));
      return;
    }
    const inputs = pruebaSeleccionada.cantidad_balotas === 6 ? 6 : 4;
    setInputValues(splitNumeroGanador(pruebaSeleccionada.numeros_ganadores, inputs));
  }, [pruebaActivaNumero, pruebaSeleccionada]);

  const refrescarPruebas = async () => {
    const resPruebas = await axios.get(`${API_URL}/sorteos/${sorteoRef.current.numero_sorteo}/presorteos/`);
    setPruebas(resPruebas.data);
    return resPruebas.data;
  };

  // --- CREAR NUEVA PRUEBA (manual, con los botones) ---
  const crearNuevaPrueba = async () => {
    if (!sorteo.numero_sorteo || sorteo.numero_sorteo === '---') return;
    setCreando(true);
    setMensaje(null);
    try {
      const res = await axios.post(`${API_URL}/sorteos/${sorteo.numero_sorteo}/presorteos/`, {
        cantidad_balotas: cantidadNueva,
      });
      setPruebas((prev) => [...prev, res.data]);
      setPruebaActivaNumero(res.data.numero_prueba);
      setMensaje({ tipo: 'success', texto: `Prueba ${res.data.numero_prueba} creada.` });
    } catch (error) {
      console.error('Error creando prueba:', error);
      const detalle = error.response?.data?.detail || 'No se pudo crear la prueba.';
      setMensaje({ tipo: 'error', texto: detalle });
    } finally {
      setCreando(false);
    }
  };

  // --- ELIMINAR PRUEBA ---
  const eliminarPrueba = async (numeroPrueba) => {
    if (!window.confirm(`¿Eliminar la Prueba ${numeroPrueba}?`)) return;
    try {
      await axios.delete(`${API_URL}/sorteos/${sorteo.numero_sorteo}/presorteos/${numeroPrueba}`);
      const nuevasPruebas = pruebas.filter((p) => p.numero_prueba !== numeroPrueba);
      setPruebas(nuevasPruebas);
      if (pruebaActivaNumero === numeroPrueba) {
        setPruebaActivaNumero(nuevasPruebas.length > 0 ? nuevasPruebas[nuevasPruebas.length - 1].numero_prueba : null);
      }
    } catch (error) {
      console.error('Error eliminando prueba:', error);
      setMensaje({ tipo: 'error', texto: 'No se pudo eliminar la prueba.' });
    }
  };

  // --- CAMBIO EN UNA BALOTA (teclado, sigue funcionando igual) ---
  const handleChange = (index, val) => {
    const allowedLength = getMaxLength(index, numInputs);
    if (/^\d*$/.test(val) && val.length <= allowedLength) {
      setInputValues((prev) => {
        const nuevos = [...prev];
        nuevos[index] = val;
        return nuevos;
      });
      setMensaje(null);
      if (val.length === allowedLength && index < numInputs - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyDown = (e, index) => {
    const key = e.key.toLowerCase();
    if (key === 'arrowleft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
    if (key === 'arrowright' && index < numInputs - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
    if (key === 'backspace' && !inputValues[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (key === 'enter') {
      e.preventDefault();
      guardarResultado();
    }
  };

  // --- GUARDAR RESULTADO DE LA PRUEBA ACTIVA ---
  const guardarResultado = async () => {
    const numeroActivo = pruebaActivaNumeroRef.current;
    const valoresActuales = inputValuesRef.current;
    const numInputsActuales = numInputs;
    if (!numeroActivo) return;

    const numeros = valoresActuales.slice(0, numInputsActuales).join('');
    if (numeros.length !== numeroCifras) {
      setMensaje({ tipo: 'error', texto: `Faltan cifras. Se esperan ${numeroCifras}.` });
      return;
    }
    try {
      await axios.put(
        `${API_URL}/sorteos/${sorteoRef.current.numero_sorteo}/presorteos/${numeroActivo}`,
        { numeros_ganadores: numeros }
      );
      await refrescarPruebas();
      setMensaje({ tipo: 'success', texto: `Prueba ${numeroActivo} guardada.` });
      return true;
    } catch (error) {
      console.error('Error guardando resultado de prueba:', error);
      const detalle = error.response?.data?.detail || 'No se pudo guardar el resultado.';
      setMensaje({ tipo: 'error', texto: detalle });
      return false;
    }
  };

  // ============================================================
  // --- MODO VOZ CONTINUO ---
  // ============================================================

  // Procesa el texto dictado, palabra por palabra, aplicándolo a partir de
  // la primera balota vacía. La balota de la "serie" (urna 5, cuando hay
  // 6 balotas) se interpreta como UN número completo de 0 a 39 (ej.
  // "veinte", "treinta y cinco"), no dígito por dígito como las demás.
  const procesarDictadoDigitos = (texto) => {
    const tokens = texto.toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);

    setInputValues((prev) => {
      const nuevos = [...prev];

      let index = 0;
      while (index < numInputs && nuevos[index].length >= getMaxLength(index, numInputs)) {
        index++;
      }

      let i = 0;
      while (index < numInputs && i < tokens.length) {
        const esBalotaSerie = numInputs === 6 && index === 4;

        if (esBalotaSerie) {
          const resultado = leerNumeroSerie(tokens, i);
          if (!resultado) { i++; continue; } // palabra no reconocible aquí, se ignora
          nuevos[index] = String(resultado.valor).padStart(2, '0');
          i += resultado.consumidos;
          index++;
          continue;
        }

        const token = tokens[i];
        let digito = null;
        if (PALABRAS_DIGITO[token] !== undefined) digito = PALABRAS_DIGITO[token];
        else if (/^\d$/.test(token)) digito = token;

        if (digito === null) { i++; continue; } // palabra no reconocida, se ignora

        nuevos[index] = digito;
        i++;
        index++;
      }

      return nuevos;
    });
  };

  // Selecciona una prueba existente por voz, o la crea si es exactamente
  // la siguiente en la secuencia (para no romper el orden 1..10).
  const seleccionarPruebaPorVoz = async (numeroHablado) => {
    const digitos = extraerDigitos(numeroHablado, PALABRAS_NUMERO_PRUEBA);
    if (!digitos) {
      setMensaje({ tipo: 'error', texto: `No entendí el número de prueba: "${numeroHablado}"` });
      return;
    }
    const numero = parseInt(digitos, 10);
    const listaActual = pruebasRef.current;
    const existente = listaActual.find((p) => p.numero_prueba === numero);

    if (existente) {
      setPruebaActivaNumero(numero);
      setMensaje({ tipo: 'success', texto: `Prueba ${numero} seleccionada por voz.` });
      return;
    }

    const siguienteEsperado = listaActual.length + 1;
    if (numero === siguienteEsperado && listaActual.length < MAX_PRUEBAS) {
      try {
        const res = await axios.post(`${API_URL}/sorteos/${sorteoRef.current.numero_sorteo}/presorteos/`, {
          cantidad_balotas: cantidadNuevaRef.current,
        });
        setPruebas((prev) => [...prev, res.data]);
        setPruebaActivaNumero(res.data.numero_prueba);
        setMensaje({ tipo: 'success', texto: `Prueba ${res.data.numero_prueba} creada por voz.` });
      } catch (error) {
        setMensaje({ tipo: 'error', texto: 'No se pudo crear la prueba por voz.' });
      }
      return;
    }

    setMensaje({ tipo: 'error', texto: `No existe la Prueba ${numero} todavía. La siguiente disponible es la ${siguienteEsperado}.` });
  };

  // Avanza a la siguiente prueba (créandola si hace falta), usado tanto
  // por el comando "siguiente" como automáticamente al completar cifras.
  const avanzarSiguientePrueba = async () => {
    const listaActual = pruebasRef.current;
    const siguienteNumero = (pruebaActivaNumeroRef.current || 0) + 1;

    const existente = listaActual.find((p) => p.numero_prueba === siguienteNumero);
    if (existente) {
      setPruebaActivaNumero(siguienteNumero);
      setMensaje({ tipo: 'success', texto: `Avanzando a Prueba ${siguienteNumero}.` });
      return;
    }

    if (listaActual.length >= MAX_PRUEBAS) {
      setMensaje({ tipo: 'success', texto: `Ya completaste las ${MAX_PRUEBAS} pruebas.` });
      return;
    }

    try {
      const res = await axios.post(`${API_URL}/sorteos/${sorteoRef.current.numero_sorteo}/presorteos/`, {
        cantidad_balotas: cantidadNuevaRef.current,
      });
      setPruebas((prev) => [...prev, res.data]);
      setPruebaActivaNumero(res.data.numero_prueba);
      setMensaje({ tipo: 'success', texto: `Prueba ${res.data.numero_prueba} creada. Continúa dictando.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: 'No se pudo crear la siguiente prueba.' });
    }
  };

  // Patrones que ya maneja algún "command" (para no procesarlos de nuevo
  // como si fueran dígitos sueltos). Acepta tanto "prueba" como "presorteo".
  const esFraseDeComando = (texto) => {
    const t = texto.trim().toLowerCase();
    return /^(prueba|presorteo)\s/.test(t) || t === 'siguiente' || t === 'guardar' || t === 'borrar';
  };

  const commands = [
    {
      command: 'prueba :numero',
      callback: (numero) => seleccionarPruebaPorVoz(numero),
      matchInterim: false,
    },
    {
      command: 'presorteo :numero',
      callback: (numero) => seleccionarPruebaPorVoz(numero),
      matchInterim: false,
    },
    {
      command: 'siguiente',
      callback: () => avanzarSiguientePrueba(),
      matchInterim: false,
    },
    {
      command: 'guardar',
      callback: () => guardarResultado(),
      matchInterim: false,
    },
  ];

  const {
    transcript,
    finalTranscript,
    resetTranscript,
    listening,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition({ commands });

  // Procesa cada frase finalizada: si no es un comando conocido, se
  // interpreta como dictado de dígitos y se aplica en tiempo real.
  useEffect(() => {
    if (!finalTranscript) return;
    if (!esFraseDeComando(finalTranscript)) {
      procesarDictadoDigitos(finalTranscript);
    }
    resetTranscript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalTranscript]);

  // Auto-guardar y avanzar en cuanto se completan todas las cifras.
  useEffect(() => {
    if (!modoVozActivo || !pruebaSeleccionada) return;
    const completo = inputValues.slice(0, numInputs).join('').length === numeroCifras;
    if (completo) {
      (async () => {
        const ok = await guardarResultado();
        if (ok) {
          setTimeout(() => avanzarSiguientePrueba(), 600);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValues, numInputs, numeroCifras, modoVozActivo]);

  // Mantiene el micrófono encendido: si el motor se detiene solo (algo
  // común en Chrome/Android tras un rato) y el modo voz sigue activo, se
  // reinicia automáticamente sin que el usuario tenga que tocar nada.
  useEffect(() => {
    if (modoVozActivo && !listening) {
      SpeechRecognition.startListening({ continuous: true, language: 'es-CO' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, modoVozActivo]);

  const activarVoz = () => {
    setMensaje(null);
    setModoVozActivo(true);
    SpeechRecognition.startListening({ continuous: true, language: 'es-CO' });
  };

  const detenerVoz = () => {
    setModoVozActivo(false);
    SpeechRecognition.stopListening();
  };

  useEffect(() => {
    return () => { SpeechRecognition.stopListening(); };
  }, []);

  return (
    <div className="admin-container">
      <h1 className="admin-title">Pre-Sorteos (Pruebas)</h1>

      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <span style={{ color: '#ccc', fontSize: '1.3rem' }}>
          Sorteo <strong style={{ color: 'var(--color-oro)' }}>{sorteo.numero_sorteo}</strong>
        </span>
      </div>

      {!browserSupportsSpeechRecognition && (
        <p style={{ textAlign: 'center', color: '#ffb347', marginBottom: '20px' }}>
          Tu navegador no soporta captura por voz. Abre esta página en Chrome desde un celular Android.
        </p>
      )}
      {browserSupportsSpeechRecognition && !isMicrophoneAvailable && (
        <p style={{ textAlign: 'center', color: '#ff8a8a', marginBottom: '20px' }}>
          Debes autorizar el uso del micrófono en el navegador.
        </p>
      )}

      {/* --- SELECTOR / CREADOR MANUAL DE PRUEBAS --- */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '20px' }}>
        {pruebas.map((p) => {
          const activa = p.numero_prueba === pruebaActivaNumero;
          return (
            <div key={p.numero_prueba} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setPruebaActivaNumero(p.numero_prueba)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '6px',
                  border: activa ? '2px solid var(--color-oro)' : '2px solid rgba(255,255,255,0.2)',
                  background: activa ? 'var(--color-oro)' : 'rgba(255,255,255,0.05)',
                  color: activa ? '#12291d' : '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Prueba {p.numero_prueba}
                {p.numeros_ganadores && <span style={{ marginLeft: '6px' }}>✔</span>}
              </button>
              <button
                type="button"
                title="Eliminar prueba"
                onClick={() => eliminarPrueba(p.numero_prueba)}
                style={{ background: 'transparent', border: 'none', color: '#ff8a8a', cursor: 'pointer', fontSize: '1.1rem' }}
              >
                🗑
              </button>
            </div>
          );
        })}
      </div>

      {pruebas.length < MAX_PRUEBAS && (
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
          <span style={{ color: '#ccc' }}>Cifras de la próxima prueba:</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[6, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCantidadNueva(n)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: cantidadNueva === n ? '2px solid var(--color-oro)' : '2px solid rgba(255,255,255,0.2)',
                  background: cantidadNueva === n ? 'rgba(212,175,55,0.15)' : 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {n === 6 ? '6 balotas (7 cifras)' : '4 balotas (4 cifras)'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={crearNuevaPrueba}
            disabled={creando}
            style={{ padding: '10px 22px' }}
          >
            + Nueva Prueba
          </button>
        </div>
      )}

      {/* --- INTERRUPTOR DE VOZ CONTINUA --- */}
      {browserSupportsSpeechRecognition && (
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <button
            type="button"
            onClick={modoVozActivo ? detenerVoz : activarVoz}
            style={{
              padding: '16px 30px',
              borderRadius: '10px',
              border: 'none',
              background: modoVozActivo ? '#dc3545' : 'var(--color-verde, #28a745)',
              color: '#fff',
              fontWeight: 800,
              fontSize: '1.1rem',
              cursor: 'pointer',
            }}
          >
            {modoVozActivo ? '⏹ Detener Modo Voz' : '🎤 Activar Modo Voz Continuo'}
          </button>
          <p style={{ color: '#999', fontSize: '0.85rem', marginTop: '8px' }}>
            Di "prueba N" o "presorteo N", pausa un momento, y dicta los dígitos uno por uno
            (la balota 5 se dicta como un número completo de 0 a 39, ej. "veinte" o "treinta y cinco").
            Al completar, avanza solo. Comandos: "siguiente", "guardar".
          </p>
        </div>
      )}

      {modoVozActivo && (
        <div style={{ textAlign: 'center', marginBottom: '20px', padding: '15px', background: 'rgba(255,255,255,0.08)', borderRadius: '8px' }}>
          <p style={{ color: '#ccc', fontStyle: 'italic', margin: '0 0 8px 0' }}>
            {listening ? '🔴 Escuchando...' : '🟡 Reconectando micrófono...'}
            {' '}(micrófono disponible: {String(isMicrophoneAvailable)})
          </p>
          <p style={{ color: '#999', fontSize: '0.9rem', margin: '0 0 8px 0' }}>
            <strong>Transcripción en vivo:</strong> {transcript ? `"${transcript}"` : '(esperando...)'}
          </p>
          <p style={{ color: '#999', fontSize: '0.9rem', margin: '0' }}>
            <strong>Última frase completada:</strong> {finalTranscript ? `"${finalTranscript}"` : '(ninguna todavía)'}
          </p>
        </div>
      )}

      {/* --- CAPTURA DE LA PRUEBA ACTIVA --- */}
      {pruebaSeleccionada ? (
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--color-oro)', marginBottom: '20px' }}>
            Prueba {pruebaSeleccionada.numero_prueba} · {numeroCifras} cifras
          </h2>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '25px' }}>
            {inputValues.slice(0, numInputs).map((val, index) => (
              <React.Fragment key={index}>
                {numInputs === 6 && index === 4 && <div style={{ width: '20px' }} />}
                <input
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="balota-esferica"
                  style={{
                    width: '80px',
                    height: '80px',
                    fontSize: numInputs === 6 && index === 4 && val.length > 1 ? '1.6rem' : '2.2rem',
                  }}
                  value={val}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                />
              </React.Fragment>
            ))}
          </div>

          <button className="btn btn-primary" onClick={guardarResultado} style={{ padding: '12px 30px' }}>
            Guardar Prueba {pruebaSeleccionada.numero_prueba}
          </button>
        </div>
      ) : (
        <p style={{ color: '#ccc' }}>
          No hay pruebas creadas todavía. Crea la primera con "+ Nueva Prueba" o di "prueba uno".
        </p>
      )}

      {mensaje && (
        <div
          style={{
            marginTop: '20px',
            textAlign: 'center',
            color: mensaje.tipo === 'success' ? '#7CFC9A' : '#ff8a8a',
            fontWeight: 600,
          }}
        >
          {mensaje.texto}
        </div>
      )}
    </div>
  );
};

export default PreSorteosPage;
