// Botiquín · web app personal de ejercicios de Coaching Vital
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TIPOS = { guiada: 'Guiada', expres: 'Exprés', ficha: 'Ficha', lectura: 'Lectura' };
const RITMOS = [['pausado', 'Pausado'], ['normal', 'Normal'], ['agil', 'Ágil']];

let CAT = null;
const ui = {
  estados: new Set(store.get('estados', [])),
  tiempo: store.get('tiempo', 10),
  vozAlta: store.get('vozAlta', true),
  ritmo: store.get('ritmo', 'normal'),
};
let sesionActual = null;   // datos para la pantalla de fin
let finSesion = null;      // función para cortar la sesión en curso

// ---------- Utilidades ----------
const ej = id => CAT.ejercicios.find(e => e.id === id);
const nombreEstado = id => CAT.estados.find(s => s.id === id)?.nombre.toLowerCase() || id;
// si ya estamos en esa dirección, el navegador no avisa: se pinta la vista directamente
const ir = h => { if (location.hash === h) rutear(); else location.hash = h; };
const fmtMin = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ---------- Perfil: todo se guarda solo en este móvil ----------
const nombre = () => store.get('nombre', '');
// los audios que dicen «Daniel» solo suenan en el móvil de Daniel; los demás oyen la versión sin nombre
const esDaniel = () => sinTildes(nombre()).trim() === 'daniel';
const animoActivo = () => store.get('animoActivo', true);
const PERFIL = 'perfil';   // caché con la foto de portada elegida
const URL_FOTO = 'perfil/foto-portada';

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

function tarjeta(e, extra = '') {
  const tags = [`<span class="tag">${e.minutos} min</span>`, `<span class="tag">${TIPOS[e.tipo]}</span>`];
  if (e.audio) tags.push(`<span class="tag ok">${e.explicacion ? 'Con voz y explicación' : 'Con voz'}</span>`);
  else if (e.tipo === 'guiada') tags.push('<span class="tag">Audio pendiente</span>');
  return `<button class="card" data-ir="#/ej/${e.id}">
    <h3>${esc(e.titulo)}</h3><div class="sub">${esc(e.subtitulo || '')}</div>
    <div class="meta">${tags.join('')}</div>${extra}</button>`;
}

function enlazar(root = app) {
  root.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => ir(b.dataset.ir)));
}

// ---------- Recomendador ----------
function recomendar() {
  if (!ui.estados.size) return [];
  return CAT.ejercicios
    .map(e => {
      let puntos = 0; const porque = [];
      for (const s of ui.estados) {
        const w = e.estados[s];
        if (w === 1) { puntos += 3; porque.push(s); } else if (w === 2) { puntos += 1; porque.push(s); }
      }
      return { e, puntos, porque };
    })
    .filter(r => r.puntos > 0)
    .filter(r => r.e.minutos <= ui.tiempo)
    .filter(r => ui.vozAlta || !r.e.requisitos.includes('voz_alta'))
    .sort((a, b) => b.puntos - a.puntos || (!!b.e.audio - !!a.e.audio) || a.e.minutos - b.e.minutos)
    .slice(0, 4);
}

// ---------- Entender lo que dices ----------
const sinTildes = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const CLAVES = {
  ansiedad: ['ansi', 'nervio', 'inquiet', 'agobi', 'panico', 'angusti', 'miedo', 'acelerad', 'alterad', 'intranquil', 'taquicardia', 'preocupad'],
  bucle: ['no paro de pensar', 'no dejo de pensar', 'pensamiento', 'rumi', 'vueltas', 'obses', 'bucle', 'la cabeza no para', 'mente no para', 'no puedo parar de pensar'],
  saturacion: ['estres', 'estresad', 'saturad', 'colapsad', 'desbordad', 'bloquead', 'agotad', 'quemad', 'mucho trabajo', 'tension', 'cargad', 'presionad'],
  emocion: ['triste', 'tristeza', 'rabia', 'enfad', 'frustr', 'ira', 'dolid', 'decepcion', 'decepcionad', 'llorar', 'culpa', 'celos', 'rencor', 'resentid', 'atascad', 'hundid', 'desanimad', 'conflicto', 'discusion', 'pelea', 'mal'],
  recuerdo: ['recuerdo', 'duelo', 'perdida', 'ruptura', 'separacion', 'divorcio', 'muerte', 'fallec', 'trauma', 'echo de menos', 'nostalgi', 'me dejo', 'lo dejamos', 'conflicto', 'discusion', 'pelea'],
  limites: ['opinion', 'critica', 'criticad', 'lo que dicen', 'lo que piensen', 'me afecta', 'limite', 'juzgad', 'me juzgan', 'presion', 'decir que no', 'manipul', 'invadid', 'me pisan'],
  confianza: ['confianza', 'insegur', 'no valgo', 'no soy capaz', 'no puedo con', 'merec', 'autoestima', 'inutil', 'fracas', 'dudo de mi', 'pequeno', 'incapaz', 'sabote', 'acomplejad', 'autoimagen', 'duda', 'dudo', 'indecis', 'no me atrevo', 'me da miedo dar el paso', 'hablar en publico', 'exponerme'],
  disperso: ['dispers', 'desconect', 'despist', 'concentr', 'en las nubes', 'piloto automatico', 'ausente', 'no estoy presente', 'distraid', 'en otra parte'],
  dormir: ['dormir', 'insomnio', 'sueno', 'desvel', 'no duermo', 'dormido', 'descansar'],
  rumbo: ['rumbo', 'objetivo', 'perdido', 'sin sentido', 'que hacer con mi vida', 'motivac', 'proposito', 'meta', 'desorientad', 'estancad', 'decision', 'decidir', 'no se que hacer', 'no se por donde', 'elegir', 'escoger'],
  pendientes: ['pendiente', 'cerrar', 'procrastin', 'no acabo', 'tareas', 'aplazo', 'dejo para manana', 'sin terminar', 'lo dejo para luego', 'postergo', 'conversacion pendiente', 'evitando', 'evito', 'dar el paso'],
  impulsos: ['impulso', 'fumar', 'tabaco', 'picar', 'atracon', 'beber', 'alcohol', 'comprar', 'adicc', 'compuls', 'antojo'],
};
const CRISIS = ['suicid', 'matarme', 'quitarme la vida', 'hacerme dano', 'no quiero vivir', 'autolesion', 'acabar con todo', 'desaparecer para siempre'];

function entender(texto) {
  const t = ' ' + sinTildes(texto) + ' ';
  if (CRISIS.some(c => t.includes(c))) return { crisis: true, estados: [] };
  const estados = Object.entries(CLAVES).filter(([, ks]) => ks.some(k => {
    if (k === 'mal') return /\bmal\b/.test(t);
    if (k === 'ira') return /\bira\b/.test(t);
    return t.includes(k);
  })).map(([id]) => id);
  // "mal" solo cuenta si no hay nada más concreto
  if (estados.length > 1 && estados.includes('emocion') && !/triste|rabia|enfad|frustr|\bira\b|dolid|decepcion|llorar|culpa|celos|rencor|resentid|atascad|hundid|desanimad/.test(t)) {
    estados.splice(estados.indexOf('emocion'), 1);
  }
  return { crisis: false, estados };
}

function oirFrase() {
  return new Promise(resolve => {
    if (!SR) return resolve(null);
    const rec = new SR();
    rec.lang = 'es-ES'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
    let texto = null;
    rec.onresult = ev => { texto = ev.results[0][0].transcript; };
    rec.onerror = () => {};
    rec.onend = () => resolve(texto);
    try { rec.start(); } catch { resolve(null); }
  });
}

// ---------- Vistas ----------
let ultimaFrase = null;

// Portada: las cuatro secciones de la app. Solo «coaching» tiene contenido por ahora.
const ICONOS = {
  // brote: crecer desde dentro
  coaching: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5Z"/><path d="M12 15c0-3.2-2.4-5.2-5.8-5.2 0 3.2 2.4 5.2 5.8 5.2Z"/>',
  // loto
  meditaciones: '<path d="M12 4.5c2.1 2.3 2.7 5.8 0 9.8-2.7-4-2.1-7.5 0-9.8Z"/><path d="M12 14.3c-1-3.3-3.6-5.2-7.6-5.2.1 3.9 3.1 6 7.6 5.2Z"/><path d="M12 14.3c1-3.3 3.6-5.2 7.6-5.2-.1 3.9-3.1 6-7.6 5.2Z"/><path d="M6 18.5c3 1.4 9 1.4 12 0"/>',
  // sol que sale: el día a día
  recursos: '<path d="M4 18h16"/><path d="M7.5 18a4.5 4.5 0 0 1 9 0"/><path d="M12 9.5V7M6.3 11.8 4.8 10.3M17.7 11.8l1.5-1.5"/>',
  // auriculares
  podcasts: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>',
};
const SECCIONES = [
  { id: 'coaching', titulo: 'Coaching y biodescodificación', texto: 'Los ejercicios de tus sesiones, para cuando los necesites.' },
  { id: 'meditaciones', titulo: 'Meditaciones', texto: 'Para parar, respirar y volver a ti.' },
  { id: 'recursos', titulo: 'Recursos para el día a día', texto: 'Pequeñas herramientas para tu rutina.' },
  { id: 'podcasts', titulo: 'Podcasts', texto: 'Escucha, aprende e inspírate a tu ritmo.' },
];
const conContenido = id => id === 'coaching';
const icono = (id, t = 32) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[id]}</svg>`;

function vistaPortada() {
  const preguntar = !nombre() && !store.get('nombrePreguntado', false);
  app.innerHTML = `
    <div class="top portada-top"><p class="saludo">${saludo()}${nombre() ? `, ${esc(nombre())}` : ''}</p>
      <button class="icono-btn" data-ir="#/ajustes" aria-label="Ajustes">${ICONO_AJUSTES}</button></div>
    ${preguntar ? `<form class="card pedir-nombre" id="pedir-nombre">
      <label for="nombre-nuevo"><b>¿Cómo quieres que te llame?</b></label>
      <div class="fila"><input id="nombre-nuevo" type="text" autocomplete="given-name" enterkeyhint="done" maxlength="30" placeholder="Tu nombre">
        <button class="btn-mini" type="submit">Guardar</button></div>
      <button class="enlace" type="button" id="no-nombre">Ahora no</button></form>` : ''}
    <h1>¿Qué necesitas hoy?</h1>
    ${animoActivo() ? tarjetaAnimoHoy() : ''}
    <div class="secciones">${SECCIONES.map(x => `
      <button class="seccion${conContenido(x.id) ? '' : ' pronto'}" data-ir="#/${x.id}">
        <span class="seccion-icono">${icono(x.id)}</span>
        <b>${esc(x.titulo)}</b>
        <span class="seccion-texto">${esc(x.texto)}</span>
        ${conContenido(x.id) ? '' : '<span class="seccion-pronto">Muy pronto</span>'}
      </button>`).join('')}
    </div>
    <button class="btn-sec mis-descargas" data-ir="#/descargas">${ICONO_DESCARGA}<span>Mis descargas</span><span class="cuenta" id="n-descargas" hidden></span></button>`;
  enlazar();
  if (preguntar) {
    $('#pedir-nombre').addEventListener('submit', ev => {
      ev.preventDefault();
      const v = $('#nombre-nuevo').value.trim();
      if (!v) return;
      store.set('nombre', v); store.set('nombrePreguntado', true); vistaPortada();
    });
    $('#no-nombre').addEventListener('click', () => { store.set('nombrePreguntado', true); vistaPortada(); });
  }
  enlazarCaras(app, n => { animoElegido = n; ir('#/registro'); });
  listarDescargas().then(l => { const n = $('#n-descargas'); if (n && l.length) { n.textContent = l.length; n.hidden = false; } }).catch(() => {});
}

async function vistaDescargas() {
  app.innerHTML = `<div class="top"><button class="back" data-ir="#/">← Inicio</button></div>
    <h1>Mis descargas</h1>
    <p class="ficha-meta">Los ejercicios descargados se pueden escuchar sin conexión, por ejemplo en un avión.</p>
    <div id="lista-descargas"><p class="muted">Cargando…</p></div>`;
  enlazar();
  const pintar = async () => {
    const l = await listarDescargas().catch(() => []);
    const zona = $('#lista-descargas');
    if (!zona) return;
    if (!l.length) {
      zona.innerHTML = '<p class="vacio">Todavía no has descargado nada. En la ficha de cada ejercicio encontrarás «Descargar para escuchar sin conexión».</p>';
      return;
    }
    // ¿hay versión nueva? (solo si hay conexión)
    const nuevas = await Promise.all(l.map(async ({ info }) => {
      try { const e = ej(info.ej); const f = await (await fetch(rutaInfo(e, info.ritmo), { cache: 'no-cache' })).json(); return f.version !== info.version; } catch { return false; }
    }));
    const total = l.reduce((t, x) => t + x.bytes, 0);
    zona.innerHTML = `<div class="lista">${l.map(({ info, bytes }, i) => {
      const e = ej(info.ej);
      return `<div class="card descargado">
        <button class="descargado-info" data-ir="#/ej/${esc(info.ej)}"><h3>${esc(e?.titulo || info.ej)}</h3>
          <span class="sub">${info.ritmo === 'explicacion' ? 'Explicación' : `Ritmo ${esc(NOMBRE_RITMO[info.ritmo]?.toLowerCase() || info.ritmo)}`} · ${fmtMin(info.duracion)} · ${fmtMB(bytes)}</span>
          ${nuevas[i] ? '<span class="tag ok">Hay una versión nueva</span>' : ''}</button>
        <button class="enlace" data-borrar="${i}">Borrar</button></div>`;
    }).join('')}</div>
      <p class="total-descargas">Ocupan ${fmtMB(total)} en el móvil.</p>
      <button class="enlace" id="borrar-todo">Borrar todas las descargas</button>`;
    enlazar(zona);
    zona.querySelectorAll('[data-borrar]').forEach(b => b.addEventListener('click', async () => {
      const { info } = l[+b.dataset.borrar]; await borrarDescarga(ej(info.ej), info.ritmo); pintar();
    }));
    $('#borrar-todo').addEventListener('click', async () => {
      if (!confirm('¿Borrar todas las descargas? Podrás volver a descargarlas cuando tengas conexión.')) return;
      await caches.delete(DESCARGAS); pintar();
    });
  };
  pintar();
}

function vistaSeccionVacia(x) {
  app.innerHTML = `<div class="top"><button class="back" data-ir="#/">← Inicio</button></div>
    <div class="vacia">
      <span class="seccion-icono grande">${icono(x.id, 40)}</span>
      <h1>${esc(x.titulo)}</h1>
      <p class="muted">${esc(x.texto)}</p>
      <p>Muy pronto habrá contenido aquí.</p>
    </div>`;
  enlazar();
}

function vistaInicio() {
  const recursos = CAT.ejercicios.filter(e => ['expres', 'ficha', 'lectura'].includes(e.tipo));
  app.innerHTML = `
    <div class="top"><button class="back" data-ir="#/">← Inicio</button></div>
    <p class="saludo">Coaching y biodescodificación</p>
    <h1>¿Cómo te sientes ahora?</h1>
    <div class="hablar">
      <form class="hablar-fila" id="form-hablar">
        <input id="frase" type="text" enterkeyhint="go" autocomplete="off" placeholder="Cuéntame: «estoy nervioso, triste…»" aria-label="Cómo te sientes">
        <button type="button" class="btn-mic" id="mic" aria-label="Hablar"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
      </form>
      <p class="entendido" id="entendido">${SR ? 'Pulsa el micrófono y dime cómo estás, o escríbelo.' : 'Escribe cómo estás.'}</p>
    </div>
    <div class="sentir">
      <button class="sentir-cab" id="abrir-nube" aria-expanded="false" aria-controls="nube">
        <span>Si no puedes hablar, selecciona cómo te sientes</span><span class="mas" aria-hidden="true">+</span>
      </button>
      <div class="sentir-sel" id="sentir-sel"></div>
      <div class="nube" id="nube" hidden>
        <div class="chips">${CAT.estados.map(s => `<button class="chip" data-estado="${s.id}" aria-pressed="${ui.estados.has(s.id)}">${esc(s.nombre)}</button>`).join('')}</div>
        <button class="nube-listo" id="nube-listo">Listo</button>
      </div>
    </div>
    <h2>Tiempo que tienes</h2>
    <div class="seg" role="group" aria-label="Tiempo disponible">
      ${[[5, '5 min'], [10, '10 min'], [20, '20 min'], [999, 'Sin prisa']].map(([v, t]) => `<button data-tiempo="${v}" aria-pressed="${ui.tiempo === v}">${t}</button>`).join('')}
    </div>
    <label class="toggle"><span>Puedo hablar en voz alta aquí</span><input type="checkbox" id="voz" ${ui.vozAlta ? 'checked' : ''}></label>
    <h2 id="titulo-recs">Te propongo</h2>
    <div class="lista" id="recs"></div>
    <div class="plegable">
      <button class="sentir-cab" id="abrir-recursos" aria-expanded="false" aria-controls="lista-recursos">
        <span>Recursos <span class="cuenta">${recursos.length}</span></span><span class="mas" aria-hidden="true">+</span>
      </button>
      <div class="recursos" id="lista-recursos" hidden>${recursos.map(e => `<button data-ir="#/ej/${e.id}"><b>${esc(e.titulo)}</b><span>${e.tipo === 'expres' ? `${e.minutos} min · al momento` : e.tipo === 'lectura' ? `Lectura · ${e.minutos} min` : esc(e.subtitulo || '')}</span></button>`).join('')}</div>
    </div>
    <button class="btn btn-todos" data-ir="#/catalogo">Todos los ejercicios</button>`;

  let crisis = false;
  const pintarChips = () => {
    app.querySelectorAll('[data-estado]').forEach(b => b.setAttribute('aria-pressed', ui.estados.has(b.dataset.estado)));
    // con la nube cerrada, se ven solo las elegidas (y se pueden quitar con un toque)
    $('#sentir-sel').innerHTML = [...ui.estados].map(id => `<button class="sel" data-quitar="${id}" aria-label="Quitar ${esc(nombreEstado(id))}">${esc(CAT.estados.find(x => x.id === id)?.nombre || id)} <span aria-hidden="true">×</span></button>`).join('');
    $('#sentir-sel').querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => {
      ui.estados.delete(b.dataset.quitar); store.set('estados', [...ui.estados]); crisis = false; pintarChips(); pintarRecs();
    }));
  };
  const abrirRec = $('#abrir-recursos'), listaRec = $('#lista-recursos');
  abrirRec.addEventListener('click', () => {
    listaRec.hidden = !listaRec.hidden; abrirRec.setAttribute('aria-expanded', !listaRec.hidden);
  });
  const nube = $('#nube'), abrir = $('#abrir-nube');
  const ponerNube = abierta => {
    nube.hidden = !abierta; abrir.setAttribute('aria-expanded', abierta);
    $('#sentir-sel').hidden = abierta;
  };
  abrir.addEventListener('click', () => ponerNube(nube.hidden));
  $('#nube-listo').addEventListener('click', () => { ponerNube(false); $('#titulo-recs').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const pintarRecs = () => {
    if (crisis) {
      $('#recs').innerHTML = `<div class="crisis-card"><p><b>Lo que cuentas es importante y no tienes que llevarlo solo.</b></p>
        <p>Llama ahora al <a href="tel:024">024</a> (línea de atención a la conducta suicida, 24 h, gratuita) o al <a href="tel:112">112</a>. Y habla con Gerard o con alguien de confianza.</p></div>`;
      return;
    }
    const r = recomendar();
    $('#recs').innerHTML = !ui.estados.size
      ? '<div class="vacio">Cuéntame cómo estás o marca una o varias cosas de arriba y te propongo ejercicios.</div>'
      : r.length
        ? r.map(x => tarjeta(x.e, `<div class="porque">Para: ${x.porque.map(nombreEstado).join(', ')}</div>`)).join('')
        : '<div class="vacio">Nada encaja con ese tiempo o ese sitio. Prueba con más tiempo o activando «voz alta».</div>';
    enlazar($('#recs'));
  };

  const aplicarFrase = texto => {
    ultimaFrase = texto;
    const r = entender(texto);
    crisis = r.crisis;
    const nota = $('#entendido');
    if (r.crisis) {
      nota.innerHTML = `Has dicho: <b>«${esc(texto)}»</b>`;
    } else if (r.estados.length) {
      ui.estados = new Set(r.estados); store.set('estados', r.estados); pintarChips();
      nota.innerHTML = `Has dicho: <b>«${esc(texto)}»</b>. Lo relaciono con: ${r.estados.map(nombreEstado).join(', ')}.`;
    } else {
      ui.estados = new Set(); store.set('estados', []); pintarChips();
      nota.innerHTML = `Has dicho: <b>«${esc(texto)}»</b>. No he sabido relacionarlo con ningún ejercicio; prueba con otras palabras o marca cómo te sientes abajo.`;
    }
    pintarRecs();
    if (r.crisis || r.estados.length) $('#titulo-recs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  $('#form-hablar').addEventListener('submit', ev => {
    ev.preventDefault();
    const t = $('#frase').value.trim();
    if (t) { $('#frase').blur(); aplicarFrase(t); }
  });
  const mic = $('#mic');
  if (!SR) mic.hidden = true;
  mic.addEventListener('click', async () => {
    if (mic.classList.contains('activo')) return;
    mic.classList.add('activo');
    $('#entendido').textContent = 'Te escucho…';
    const t = await oirFrase();
    mic.classList.remove('activo');
    if (t) { $('#frase').value = t; aplicarFrase(t); }
    else $('#entendido').textContent = 'No te he oído bien. Vuelve a pulsar el micrófono o escríbelo.';
  });
  if (ultimaFrase) { $('#frase').value = ultimaFrase; }

  app.querySelectorAll('[data-estado]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.estado;
    crisis = false;
    ui.estados.has(id) ? ui.estados.delete(id) : ui.estados.add(id);
    store.set('estados', [...ui.estados]); pintarChips(); pintarRecs();
  }));
  app.querySelectorAll('[data-tiempo]').forEach(b => b.addEventListener('click', () => {
    ui.tiempo = +b.dataset.tiempo; store.set('tiempo', ui.tiempo);
    app.querySelectorAll('[data-tiempo]').forEach(x => x.setAttribute('aria-pressed', x === b));
    pintarRecs();
  }));
  $('#voz').addEventListener('change', ev => { ui.vozAlta = ev.target.checked; store.set('vozAlta', ui.vozAlta); pintarRecs(); });
  enlazar(); pintarChips(); pintarRecs();
}

function vistaCatalogo() {
  const grupo = (tipo, titulo) => {
    const l = CAT.ejercicios.filter(e => e.tipo === tipo);
    return `<h2>${titulo}</h2><div class="lista">${l.map(e => tarjeta(e)).join('')}</div>`;
  };
  app.innerHTML = `<div class="top"><button class="back" data-ir="#/coaching">← Coaching</button></div>
    <h1>Todos los ejercicios</h1>
    ${grupo('guiada', 'Guiados con voz')}${grupo('expres', 'Exprés')}${grupo('ficha', 'Fichas')}${grupo('lectura', 'Lecturas')}`;
  enlazar();
}

// ---------- Descargas para escuchar sin conexión ----------
// Solo se guarda lo que Daniel descarga a mano (caché «descargas»). Podcasts no se descargan.
const DESCARGAS = 'descargas';
const SECCIONES_DESCARGABLES = ['coaching', 'meditaciones'];
const descargable = e => e.audio && SECCIONES_DESCARGABLES.includes(e.seccion || 'coaching') && 'caches' in window;
const rutaInfo = (e, r) => (r === 'explicacion' ? `audio/${e.explicacion}.json` : `audio/${e.audio}${r === 'normal' ? '' : '-' + r}.json`);
const archivosDe = info => [info.archivo,
  ...(info.eventos || []).filter(ev => ev.clip).map(ev => ev.clip),
  ...(info.ciclo?.enlace_clip ? [info.ciclo.enlace_clip] : []),
  // saludo y final con el nombre de Daniel: pesan muy poco y se guardan siempre, por si cambia el nombre
  ...(info.personal?.saludo ? [info.personal.saludo] : []),
  ...(info.personal?.final ? [info.personal.final.archivo] : [])];
const NOMBRE_RITMO = Object.fromEntries(RITMOS);

async function infoDescargada(e, r) {
  if (!('caches' in window)) return null;
  const resp = await (await caches.open(DESCARGAS)).match(rutaInfo(e, r));
  return resp ? resp.json() : null;
}

async function descargar(e, r, info, progreso) {
  try { await navigator.storage?.persist?.(); } catch { /* el sistema decide */ }
  const c = await caches.open(DESCARGAS);
  let hecho = 0, total = 0;
  for (const f of archivosDe(info)) {
    const resp = await fetch(`audio/${f}?v=${info.version || ''}`, { cache: 'no-store' });
    if (!resp.ok || !resp.body) throw new Error('descarga');
    total += +resp.headers.get('content-length') || 0;
    const lector = resp.body.getReader(), trozos = [];
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      trozos.push(value); hecho += value.length; progreso(total ? hecho / total : 0);
    }
    const blob = new Blob(trozos, { type: 'audio/mpeg' });
    await c.put(`audio/${f}`, new Response(blob, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(blob.size) } }));
  }
  // la ficha de la descarga se guarda al final: si se corta a medias, no cuenta como descargado
  await c.put(rutaInfo(e, r), new Response(JSON.stringify({ ...info, ej: e.id, ritmo: r }), { headers: { 'Content-Type': 'application/json' } }));
}

async function borrarDescarga(e, r) {
  const c = await caches.open(DESCARGAS);
  const info = await infoDescargada(e, r);
  await c.delete(rutaInfo(e, r));
  if (info) for (const f of archivosDe(info)) await c.delete(`audio/${f}`);
}

async function listarDescargas() {
  if (!('caches' in window)) return [];
  const c = await caches.open(DESCARGAS);
  const out = [];
  for (const req of await c.keys()) {
    if (!req.url.endsWith('.json')) continue;
    const info = await (await c.match(req)).json();
    let bytes = 0;
    for (const f of archivosDe(info)) bytes += +(await c.match(`audio/${f}`))?.headers.get('content-length') || 0;
    out.push({ info, bytes });
  }
  return out;
}
const fmtMB = b => `${(b / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;

// Dónde suena cada archivo: la copia descargada (blob) o el servidor
async function fuentesDescargadas(info) {
  const c = await caches.open(DESCARGAS), fuentes = {};
  for (const f of archivosDe(info)) {
    const resp = await c.match(`audio/${f}`);
    if (!resp) return null;
    fuentes[f] = URL.createObjectURL(await resp.blob());
  }
  return fuentes;
}

const ICONO_DESCARGA = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';

async function vistaFicha(id) {
  const e = ej(id);
  if (!e) return ir('#/coaching');
  if (e.tipo === 'lectura') return vistaLectura(e);
  const req = e.requisitos.map(r => CAT.requisitos[r]).filter(Boolean);
  const lectura = e.lectura && ej(e.lectura);
  app.innerHTML = `<div class="top"><button class="back" data-ir="#/coaching">← Coaching</button></div>
    <h1>${esc(e.titulo)}</h1>
    <p class="ficha-meta">${esc(e.subtitulo || '')} · Sesión ${e.sesion} · ${e.minutos} min · ${TIPOS[e.tipo]}</p>
    ${req.length ? `<div class="meta">${req.map(r => `<span class="tag warm">${esc(r)}</span>`).join('')}</div>` : ''}
    <section class="bloque"><h2>Para qué sirve</h2><p>${esc(e.para_que)}</p></section>
    <section class="bloque"><h2>Cuándo</h2><p>${esc(e.cuando)}</p></section>
    <section class="bloque"><h2>${e.tipo === 'ficha' ? 'Cómo se hace' : 'Los pasos'}</h2><ol class="pasos">${e.pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol></section>
    ${e.puntos ? `<section class="bloque"><h2>Los puntos, por orden</h2><ol class="puntos">${e.puntos.map(p => `<li>${esc(p)}</li>`).join('')}</ol></section>` : ''}
    ${e.ilustracion ? `<section class="bloque"><h2>${esc(e.ilustracion.titulo)}</h2><figure class="ilustracion">
      <img src="${esc(e.ilustracion.src)}" alt="${esc(e.ilustracion.pie)}" loading="lazy" width="680" height="400">
      <figcaption>${esc(e.ilustracion.pie)}</figcaption></figure></section>` : ''}
    ${e.contexto ? `<section class="bloque"><h2>Contexto</h2><p class="contexto">${esc(e.contexto)}</p></section>` : ''}
    ${lectura ? `<section class="bloque"><h2>Para entenderlo</h2><button class="card lectura-enlace" data-ir="#/ej/${lectura.id}">
      <h3>${esc(lectura.titulo)}</h3><div class="sub">Lectura · ${lectura.minutos} min · ${esc(lectura.subtitulo || '')}</div></button></section>` : ''}
    ${e.aviso ? `<p class="aviso">${esc(e.aviso)}</p>` : ''}
    <div id="zona-empezar"></div>`;
  enlazar();
  if (!e.audio) {
    if (e.tipo !== 'ficha') $('#zona-empezar').innerHTML = '<p class="consejos">El audio guiado de este ejercicio todavía está en preparación.</p>';
    return;
  }
  const infos = {}, locales = {};
  const opciones = [...RITMOS.map(([r]) => r), ...(e.explicacion ? ['explicacion'] : [])];
  await Promise.all(opciones.map(async r => {
    try { infos[r] = await (await fetch(rutaInfo(e, r), { cache: 'no-cache' })).json(); } catch { /* sin red o no disponible */ }
    if (descargable(e)) try { locales[r] = await infoDescargada(e, r); } catch { /* sin acceso */ }
  }));
  // sin conexión, cuenta lo descargado
  const infoDe = r => infos[r] || locales[r];
  const disponibles = RITMOS.filter(([r]) => infoDe(r));
  const hayExplicacion = !!infoDe('explicacion');
  let modo = disponibles.length ? 'guiado' : 'explicacion';   // ejercicio guiado o explicación locutada
  const actual = () => (modo === 'explicacion' ? 'explicacion' : ui.ritmo);
  if (!disponibles.length && !hayExplicacion) {
    $('#zona-empezar').innerHTML = '<p class="consejos">Ahora no hay conexión y este ejercicio no está descargado. Cuando vuelvas a tener internet podrás escucharlo o descargarlo.</p>';
    return;
  }
  if (disponibles.length && !infoDe(ui.ritmo)) ui.ritmo = disponibles[0][0];
  $('#zona-empezar').innerHTML = `
    ${hayExplicacion ? `<section class="bloque"><h2>Qué quieres escuchar</h2>
      <div class="seg" role="group" aria-label="Qué quieres escuchar">
        <button data-modo="guiado" aria-pressed="${modo === 'guiado'}" ${disponibles.length ? '' : 'disabled'}>Ejercicio guiado<span class="dur" id="dur-guiado">${disponibles.length ? ` · ${fmtMin(infoDe(ui.ritmo).duracion)}` : ''}</span></button>
        <button data-modo="explicacion" aria-pressed="${modo === 'explicacion'}">Explicación · ${fmtMin(infoDe('explicacion').duracion)}</button>
      </div></section>` : ''}
    <section class="bloque" id="bloque-ritmo" ${modo === 'explicacion' ? 'hidden' : ''}><h2>Ritmo</h2>
      <div class="seg">${disponibles.map(([r, t]) => `<button data-ritmo="${r}" aria-pressed="${ui.ritmo === r}">${t} · ${fmtMin(infoDe(r).duracion)}</button>`).join('')}</div>
    </section>
    <p class="consejos">Busca un sitio tranquilo. Durante el ejercicio la pantalla se queda en negro.${e.voz ? ' Al final te preguntará cómo de intenso es el malestar: dilo en voz alta y, si es 5 o más, te ofrecerá repetir el ciclo.' : ''}</p>
    <div class="empezar"><button class="btn" id="empezar">Empezar</button></div>
    <div class="descarga" id="descarga"></div>`;

  let descargando = false;
  const pintarDescarga = () => {
    const zona = $('#descarga');
    if (!zona || !descargable(e) || descargando) return;
    const r = actual(), local = locales[r], nueva = local && infos[r] && infos[r].version !== local.version;
    const ritmo = r === 'explicacion' ? ' · explicación' : disponibles.length > 1 ? ` · ritmo ${NOMBRE_RITMO[r].toLowerCase()}` : '';
    if (!local) {
      zona.innerHTML = infos[r] ? `<button class="btn-sec" id="bajar">${ICONO_DESCARGA}<span>Descargar para escuchar sin conexión</span></button>` : '';
    } else if (nueva) {
      zona.innerHTML = `<p class="descarga-estado nueva">Hay una versión nueva de este audio${ritmo}.</p>
        <button class="btn-sec" id="bajar">${ICONO_DESCARGA}<span>Actualizar descarga</span></button>
        <button class="enlace" id="borrar">Borrar descarga</button>`;
    } else {
      zona.innerHTML = `<p class="descarga-estado">✓ Descargado para escuchar sin conexión${ritmo}</p>
        <button class="enlace" id="borrar">Borrar descarga</button>`;
    }
    $('#bajar')?.addEventListener('click', async () => {
      descargando = true;
      zona.innerHTML = `<p class="descarga-estado">Descargando… <b id="pct">0 %</b></p><div class="barra-descarga"><i id="barra"></i></div>`;
      try {
        await descargar(e, r, infos[r], x => { const p = Math.round(x * 100); $('#pct').textContent = `${p} %`; $('#barra').style.width = `${p}%`; });
        locales[r] = await infoDescargada(e, r);
      } catch {
        zona.innerHTML = '<p class="descarga-estado error">No se ha podido descargar. Comprueba la conexión y vuelve a intentarlo.</p>';
        descargando = false; setTimeout(pintarDescarga, 3000); return;
      }
      descargando = false; pintarDescarga();
    });
    $('#borrar')?.addEventListener('click', async () => {
      await borrarDescarga(e, r); locales[r] = null; pintarDescarga();
    });
  };
  pintarDescarga();

  app.querySelectorAll('[data-ritmo]').forEach(b => b.addEventListener('click', () => {
    ui.ritmo = b.dataset.ritmo; store.set('ritmo', ui.ritmo);
    app.querySelectorAll('[data-ritmo]').forEach(x => x.setAttribute('aria-pressed', x === b));
    const d = $('#dur-guiado'); if (d) d.textContent = ` · ${fmtMin(infoDe(ui.ritmo).duracion)}`;
    pintarDescarga();
  }));
  app.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
    modo = b.dataset.modo;
    app.querySelectorAll('[data-modo]').forEach(x => x.setAttribute('aria-pressed', x === b));
    $('#bloque-ritmo').hidden = modo === 'explicacion';
    pintarDescarga();
  }));
  $('#empezar').addEventListener('click', async () => {
    if (e.voz) await pedirMicrofono();   // el permiso se pide ahora, con los ojos abiertos
    const r = actual(), local = locales[r];
    // suena la copia descargada si es la versión actual o si no hay conexión; si hay una nueva, la del servidor
    const usarLocal = local && (!infos[r] || infos[r].version === local.version);
    const fuentes = usarLocal ? await fuentesDescargadas(local).catch(() => null) : null;
    iniciarSesion(e, usarLocal && fuentes ? local : infoDe(r), fuentes, { explicacion: r === 'explicacion' });
  });
}

// ---------- Lecturas (apuntes) ----------
const itemLectura = x => `<li>${Array.isArray(x) ? `<b>${esc(x[0])}</b>${esc(x[1])}` : esc(x)}</li>`;
function vistaLectura(e) {
  const rel = (e.relacionados || []).map(ej).filter(Boolean);
  app.innerHTML = `<div class="top"><button class="back" data-ir="#/coaching">← Coaching</button></div>
    <h1>${esc(e.titulo)}</h1>
    <p class="ficha-meta">${esc(e.subtitulo || '')} · Sesión ${e.sesion} · ${e.minutos} min de lectura</p>
    <article class="lectura">${e.contenido.map(b => b.h ? `<h2>${esc(b.h)}</h2>` : b.p ? `<p>${esc(b.p)}</p>`
      : b.ul ? `<ul>${b.ul.map(itemLectura).join('')}</ul>` : b.ol ? `<ol>${b.ol.map(itemLectura).join('')}</ol>` : '').join('')}</article>
    ${rel.length ? `<section class="bloque"><h2>Para practicarlo</h2><div class="lista">${rel.map(x => tarjeta(x)).join('')}</div></section>` : ''}`;
  enlazar();
}

// ---------- Voz: reconocimiento ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const PALABRAS = { cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

async function pedirMicrofono() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
  } catch { /* sin permiso: se usarán los botones */ }
}

function leerNumero(t) {
  t = t.toLowerCase();
  const d = t.match(/\b(10|[0-9])\b/);
  if (d) return +d[1];
  for (const w of t.split(/[^a-záéíóúñ]+/)) if (w in PALABRAS) return PALABRAS[w];
  return null;
}
function leerSiNo(t) {
  t = t.toLowerCase();
  if (/\b(s[ií]|claro|vale|venga|repet\w*|otra)\b/.test(t)) return true;
  if (/\bno\b/.test(t)) return false;
  return null;
}

function pitido() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 660; g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.3);
    setTimeout(() => ctx.close(), 500);
  } catch { /* sin audio */ }
}

// Escucha un número o un sí/no. Resuelve con el valor o null. Siempre ofrece botones.
function escuchar(modo, espera = 8) {
  return new Promise(resolve => {
    const capa = document.createElement('div');
    capa.className = 'escucha';
    capa.innerHTML = `<div class="mic${SR ? '' : ' off'}" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></div>
      <p>${SR ? 'Te escucho…' : 'Toca tu respuesta'}</p>
      ${modo === 'numero'
        ? `<div class="numeros">${Array.from({ length: 10 }, (_, i) => `<button data-v="${i + 1}">${i + 1}</button>`).join('')}</div>`
        : '<div class="sino"><button data-v="si">Sí</button><button data-v="no">No</button></div>'}`;
    document.body.appendChild(capa);
    let hecho = false, rec = null;
    const fin = v => {
      if (hecho) return; hecho = true;
      clearTimeout(limite);
      try { rec?.abort(); } catch { /* ya parado */ }
      capa.remove(); resolve(v);
    };
    capa.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.v; fin(modo === 'numero' ? +v : v === 'si');
    }));
    const limite = setTimeout(() => fin(null), (espera + 7) * 1000);
    if (!SR) return;
    const hasta = Date.now() + espera * 1000;
    const arrancar = () => {
      if (hecho || Date.now() > hasta) { if (!hecho) capa.querySelector('p').textContent = 'No te he oído. Toca tu respuesta'; capa.querySelector('.mic')?.classList.add('off'); return; }
      rec = new SR();
      rec.lang = 'es-ES'; rec.interimResults = false; rec.maxAlternatives = 5; rec.continuous = false;
      rec.onresult = ev => {
        for (const alt of ev.results[0]) {
          const v = modo === 'numero' ? leerNumero(alt.transcript) : leerSiNo(alt.transcript);
          if (v !== null && (modo !== 'numero' || (v >= 1 && v <= 10))) return fin(v);
        }
      };
      rec.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { capa.querySelector('p').textContent = 'Sin micrófono. Toca tu respuesta'; capa.querySelector('.mic').classList.add('off'); hechoMic = true; } };
      let hechoMic = false;
      rec.onend = () => { if (!hecho && !hechoMic) arrancar(); };
      try { rec.start(); } catch { /* ya activo */ }
    };
    pitido(); setTimeout(arrancar, 300);
  });
}

// ---------- Sesión guiada ----------
let wakeLock = null;
async function mantenerPantalla() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* no disponible */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && finSesion) mantenerPantalla();
});

function cumple(cond, vars) {
  const m = /^\s*(\w+)\s*(>=|<=|>|<|==)\s*(\d+)\s*$/.exec(cond || '');
  if (!m) return false;
  const v = vars[m[1]]; if (v == null) return false;
  const n = +m[3];
  return { '>=': v >= n, '<=': v <= n, '>': v > n, '<': v < n, '==': v === n }[m[2]];
}

function tocar(audio, src) {
  return new Promise(res => {
    audio.src = src; audio.onended = () => res(); audio.onerror = () => res();
    audio.play().catch(() => res());
  });
}

async function iniciarSesion(e, info, fuentes = null, opciones = {}) {
  const fuente = f => fuentes?.[f] || `audio/${f}?v=${info.version || ''}`;  // ?v= cambia con cada versión del audio
  document.body.classList.add('en-sesion');
  app.innerHTML = `<div class="sesion">
      <div class="centro"><div class="paso" id="paso">Preparando…</div><div class="num" id="num"></div>
      <div class="linea" id="linea" role="slider" aria-label="Posición del audio" tabindex="0"><div class="barra"><i id="prog"></i></div></div>
      <div class="tiempos"><span id="t-act">0:00</span><span id="t-total">${fmtMin(info.duracion)}</span></div></div>
      <div class="controles">
        <button id="ant" aria-label="Repetir paso"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg></button>
        <button id="pp" aria-label="Pausa"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg></button>
        <button id="sig" aria-label="Paso siguiente"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg></button>
      </div>
      <div class="controles"><button class="salir" id="salir">Salir</button></div>
    </div>`;
  await mantenerPantalla();

  const ICONO_PAUSA = $('#pp').innerHTML;
  const ICONO_PLAY = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>';
  const a = new Audio(fuente(info.archivo));
  a.preload = 'auto';
  const clip = new Audio();
  // En el móvil de Daniel: «Hola, Daniel.» antes del audio, y al final se funde con la versión que dice su nombre
  const per = esDaniel() && info.personal ? info.personal : null;
  const pf = per?.final || null;
  const fin = new Audio();
  if (pf) { fin.src = fuente(pf.archivo); fin.preload = 'auto'; }
  let enFinal = false;
  const total = pf ? pf.desde + pf.duracion : info.duracion;
  const activo = () => (enFinal ? fin : a);
  const ahora = () => (enFinal ? pf.desde + fin.currentTime : a.currentTime);
  const espera = ms => new Promise(r => setTimeout(r, ms));
  async function pasarAlFinal() {
    enFinal = true;
    fin.volume = 0; fin.currentTime = Math.max(0, a.currentTime - pf.desde);
    try { await fin.play(); } catch { enFinal = false; return; }
    fin.currentTime = Math.max(0, a.currentTime - pf.desde);   // vuelve a alinearlos tras el arranque
    for (let i = 1; i <= 10; i++) { await espera(30); fin.volume = i / 10; a.volume = 1 - i / 10; }
    a.pause(); a.volume = 1;
  }
  const marcas = info.marcas, eventos = info.eventos || [];
  const vars = {}; let ciclos = 1, ocupado = false, pasoActual = -1;
  let disparados = new Set();
  const datos = { id: e.id, titulo: e.titulo, ritmo: info.ritmo, inicio: Date.now(), vars, ciclos: 1 };
  window.__sesion = { a, clip, fin, vars, irA: t => irA(t), get enFinal() { return enFinal; }, get ciclos() { return ciclos; }, get ocupado() { return ocupado; } }; // para depurar

  const indicePaso = t => { let i = 0; marcas.forEach((m, k) => { if (t >= m.inicio - 0.05) i = k; }); return i; };
  const irA = t => {
    if (pf && t >= pf.desde) {   // dentro del final con el nombre
      a.pause(); enFinal = true; fin.volume = 1; fin.currentTime = t - pf.desde; fin.play().catch(() => {});
      return;
    }
    if (enFinal) { fin.pause(); enFinal = false; a.volume = 1; a.play().catch(() => {}); }
    a.currentTime = t;
    disparados = new Set(eventos.map((ev, i) => (ev.t < t - 0.01 ? i : -1)).filter(i => i >= 0));
  };
  let destino = null, temporizador = null;   // salto pendiente: varias pulsaciones seguidas = un solo salto
  const posicion = () => (destino ?? ahora());
  const pintar = (t = posicion()) => {
    const i = indicePaso(t);
    $('#prog').style.width = `${Math.min(100, (t / total) * 100)}%`;
    $('#t-act').textContent = fmtMin(t);
    if (i === pasoActual) return;
    pasoActual = i;
    $('#paso').textContent = marcas[i].titulo;
    $('#num').textContent = `Paso ${i + 1} de ${marcas.length}${ciclos > 1 ? ` · ciclo ${ciclos}` : ''}`;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: marcas[i].titulo, artist: e.titulo, album: 'Botiquín',
        artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
    }
  };

  async function procesar(desde) {
    ocupado = true; a.pause();
    const t = eventos[desde].t;
    for (let i = desde; i < eventos.length && eventos[i].t === t; i++) {
      disparados.add(i);
      const ev = eventos[i];
      if (ev.tipo === 'escuchar') {
        const v = await escuchar(ev.modo, ev.espera);
        if (ev.guardar) vars[ev.guardar] = v;
      } else if (ev.tipo === 'rama' && cumple(ev.condicion, vars) && ev.si === 'repetir_ciclo' && info.ciclo && ciclos < info.ciclo.max) {
        await tocar(clip, fuente(ev.clip));
        const quiere = ev.escuchar ? await escuchar(ev.escuchar.modo, ev.escuchar.espera) : true;
        if (quiere) {
          ciclos++; datos.ciclos = ciclos; pasoActual = -1;
          await tocar(clip, fuente(info.ciclo.enlace_clip));
          irA(marcas.find(m => m.id === info.ciclo.desde).inicio);
          break;
        }
      }
    }
    ocupado = false;
    if (finSesion) a.play();
  }

  const reloj = setInterval(() => {
    if (ocupado || activo().paused || destino !== null) return;
    pintar();
    if (enFinal) return;
    if (pf && a.currentTime >= pf.desde && a.currentTime < pf.desde + 0.6) { pasarAlFinal(); return; }
    const i = eventos.findIndex((ev, k) => !disparados.has(k) && a.currentTime >= ev.t - 0.08);
    if (i >= 0) procesar(i);
  }, 100);

  const buscar = t => {
    if (ocupado) return;
    destino = Math.max(0, Math.min(t, total - 0.5));
    pintar(destino);
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { const t2 = destino; destino = null; irA(t2); pintar(t2); }, 350);
  };
  const saltar = dir => {
    const t = posicion(); const i = indicePaso(t);
    if (dir > 0 && i + 1 < marcas.length) buscar(marcas[i + 1].inicio);
    if (dir < 0) buscar(t - marcas[i].inicio < 3 && i > 0 ? marcas[i - 1].inicio : marcas[i].inicio);
  };
  const linea = $('#linea');
  const tocarLinea = ev => {
    const r = linea.getBoundingClientRect();
    buscar(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * total);
  };
  linea.addEventListener('pointerdown', ev => { linea.setPointerCapture(ev.pointerId); tocarLinea(ev); });
  linea.addEventListener('pointermove', ev => { if (linea.hasPointerCapture(ev.pointerId)) tocarLinea(ev); });
  linea.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowRight') buscar(posicion() + 10);
    if (ev.key === 'ArrowLeft') buscar(posicion() - 10);
  });
  const alternar = () => {
    if (ocupado) return;
    const r = activo();
    if (r.paused) r.play(); else r.pause();
  };
  a.onplay = fin.onplay = () => { $('#pp').innerHTML = ICONO_PAUSA; };
  a.onpause = () => { if (!ocupado && !enFinal) $('#pp').innerHTML = ICONO_PLAY; };
  fin.onpause = () => { if (enFinal) $('#pp').innerHTML = ICONO_PLAY; };
  $('#pp').onclick = alternar; $('#sig').onclick = () => saltar(1); $('#ant').onclick = () => saltar(-1);

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => { if (!ocupado) activo().play(); });
    ms.setActionHandler('pause', () => { if (!ocupado) activo().pause(); });
    ms.setActionHandler('nexttrack', () => saltar(1));
    ms.setActionHandler('previoustrack', () => saltar(-1));
  }

  const terminar = (completa) => {
    clearInterval(reloj); clearTimeout(temporizador); a.pause(); clip.pause(); fin.pause(); a.src = ''; clip.src = ''; fin.src = '';
    if (fuentes) Object.values(fuentes).forEach(u => URL.revokeObjectURL(u));
    finSesion = null;
    try { wakeLock?.release(); } catch { /* ya liberado */ }
    wakeLock = null;
    document.body.classList.remove('en-sesion');
    if ('mediaSession' in navigator) ['play', 'pause', 'nexttrack', 'previoustrack'].forEach(k => navigator.mediaSession.setActionHandler(k, null));
    if (completa && !opciones.explicacion) { apuntarSesion(datos); sesionActual = datos; ir('#/fin'); } else ir(`#/ej/${e.id}`);
  };
  finSesion = () => terminar(false);
  a.onended = () => { if (!enFinal) terminar(true); };
  fin.onended = () => terminar(true);
  $('#salir').onclick = () => terminar(false);

  pintar();
  if (per?.saludo) {
    ocupado = true;
    $('#t-total').textContent = fmtMin(total);
    await tocar(clip, fuente(per.saludo));
    ocupado = false;
    if (!finSesion) return;   // ha salido durante el saludo
    a.currentTime = per.salto || 0;
  } else if (pf) $('#t-total').textContent = fmtMin(total);
  a.play().catch(() => { $('#pp').innerHTML = ICONO_PLAY; });
}

function vistaFin() {
  const d = sesionActual;
  sesionActual = null;
  if (!d) return ir('#/');
  app.innerHTML = `<div class="fin"><h1>Bien hecho</h1>
    <p class="ficha-meta">${esc(d.titulo)}${d.ciclos > 1 ? ` · ${d.ciclos} ciclos` : ''}</p>
    <p class="muted">Quédate un momento con lo que sientes antes de seguir.</p>
    ${animoActivo() ? `<div class="animo-fin" id="animo-fin"><p><b>¿Cómo estás ahora?</b></p>${filaCaras()}</div>` : ''}
    <button class="btn" data-ir="#/">Volver al inicio</button></div>`;
  enlazar();
  enlazarCaras(app, n => {
    apuntarAnimo({ n, tipo: 'tras', ej: d.id });
    $('#animo-fin').innerHTML = `<p class="guardado">${cara(n, 28)} Apuntado: ${ANIMOS[n - 1].toLowerCase()}. Lo verás en tu evolución.</p>`;
  });
}

// ---------- Registro de ánimo ----------
const ANIMOS = ['Muy mal', 'Mal', 'Regular', 'Bien', 'Muy bien'];
const COLOR_ANIMO = ['#c96f6a', '#e39a72', '#e6c06c', '#9cc596', '#5aa98a'];
const BOCA = ['M8 16.5q4-3.2 8 0', 'M8.3 16q3.7-1.8 7.4 0', 'M8.5 15.5h7', 'M8.3 14.6q3.7 1.8 7.4 0', 'M7.8 14q4.2 3.6 8.4 0'];
const cara = (n, t = 40) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="12" r="10.5" fill="${COLOR_ANIMO[n - 1]}"/>
  <circle cx="8.8" cy="10" r="1.15" fill="#3d1f2d"/><circle cx="15.2" cy="10" r="1.15" fill="#3d1f2d"/>
  <path d="${BOCA[n - 1]}" fill="none" stroke="#3d1f2d" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const filaCaras = (sel = 0) => `<div class="caras" role="group" aria-label="Cómo estás">${ANIMOS.map((t, i) =>
  `<button class="cara" data-animo="${i + 1}" aria-pressed="${sel === i + 1}" aria-label="${t}">${cara(i + 1)}<span>${t}</span></button>`).join('')}</div>`;
const enlazarCaras = (root, fn) => root.querySelectorAll('[data-animo]').forEach(b => b.addEventListener('click', () => fn(+b.dataset.animo)));
let animoElegido = 0;

const dia = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const registros = () => store.get('animo', []);
function apuntarAnimo(r) {
  const l = registros(); l.push({ f: dia(), t: Date.now(), e: [], nota: '', ...r }); store.set('animo', l);
}
function apuntarSesion(d) {
  const l = store.get('sesiones', []);
  l.push({ f: dia(), t: Date.now(), ej: d.id, ritmo: d.ritmo, min: Math.round((Date.now() - d.inicio) / 60000) });
  store.set('sesiones', l);
}
const hoyRegistrado = () => registros().filter(r => r.f === dia() && r.tipo === 'dia').pop();

function tarjetaAnimoHoy() {
  const hoy = hoyRegistrado();
  if (hoy) return `<div class="animo-hoy hecho">${cara(hoy.n, 30)}<span>Hoy te sientes <b>${ANIMOS[hoy.n - 1].toLowerCase()}</b></span>
    <button class="enlace" data-ir="#/evolucion">Tu evolución</button></div>`;
  return `<div class="animo-hoy"><p><b>¿Cómo estás hoy?</b></p>${filaCaras()}
    <button class="enlace" data-ir="#/evolucion">Ver tu evolución</button></div>`;
}

function vistaRegistro() {
  if (!animoElegido) return ir('#/');
  const sel = new Set();
  app.innerHTML = `<div class="top"><button class="back" data-ir="#/">← Inicio</button></div>
    <h1>¿Cómo estás hoy?</h1>
    ${filaCaras(animoElegido)}
    <h2>¿Qué hay hoy? <span class="opcional">Opcional</span></h2>
    <div class="chips">${CAT.estados.map(x => `<button class="chip" data-estado="${x.id}" aria-pressed="false">${esc(x.nombre)}</button>`).join('')}</div>
    <h2><label for="nota">Una nota para ti</label> <span class="opcional">Opcional</span></h2>
    <textarea id="nota" rows="3" maxlength="500" placeholder="Qué ha pasado, qué te ha ayudado…"></textarea>
    <button class="btn" id="guardar-animo">Guardar</button>`;
  enlazar();
  enlazarCaras(app, n => { animoElegido = n; app.querySelectorAll('[data-animo]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.animo === n)); });
  app.querySelectorAll('[data-estado]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.estado; if (sel.has(id)) sel.delete(id); else sel.add(id);
    b.setAttribute('aria-pressed', sel.has(id));
  }));
  $('#guardar-animo').addEventListener('click', () => {
    apuntarAnimo({ n: animoElegido, tipo: 'dia', e: [...sel], nota: $('#nota').value.trim() });
    animoElegido = 0; ir('#/');
  });
}

// ---------- Tu evolución: resumen de cada mes ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const media = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
const fmt1 = x => x.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mesDe = f => f.slice(0, 7);
const mesSiguiente = (m, k) => { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 1 + k, 1); return dia(d).slice(0, 7); };
const nombreMes = m => MESES[+m.slice(5) - 1];

function resumenMes(m) {
  const regs = registros().filter(r => mesDe(r.f) === m);
  const ses = store.get('sesiones', []).filter(x => mesDe(x.f) === m);
  const porDia = {};
  regs.forEach(r => (porDia[r.f] ||= []).push(r.n));
  const medias = Object.values(porDia).map(media);
  const cuenta = {};
  regs.forEach(r => (r.e || []).forEach(id => { cuenta[id] = (cuenta[id] || 0) + 1; }));
  const estados = Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const porEj = {};
  ses.forEach(x => { (porEj[x.ej] ||= { veces: 0, tras: [] }).veces++; });
  regs.filter(r => r.tipo === 'tras' && r.ej).forEach(r => (porEj[r.ej] ||= { veces: 0, tras: [] }).tras.push(r.n));
  return { regs, ses, porDia, media: media(medias), dias: medias.length, estados, porEj };
}

const y = l => (l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}` : l[0]);

function textoResumen(m, r, ant) {
  const mes = nombreMes(m), partes = [];
  if (!r.dias) return '';
  partes.push(`En ${mes} has apuntado cómo estabas ${r.dias} ${r.dias === 1 ? 'día' : 'días'} y, de media, te has sentido ${ANIMOS[Math.round(r.media) - 1].toLowerCase()} (${fmt1(r.media)} sobre 5).`);
  if (ant.media != null) {
    const d = r.media - ant.media;
    partes.push(Math.abs(d) < 0.25 ? `Muy parecido a ${nombreMes(mesSiguiente(m, -1))}.`
      : d > 0 ? `Mejor que en ${nombreMes(mesSiguiente(m, -1))}, cuando la media fue ${fmt1(ant.media)}.`
        : `Algo más bajo que en ${nombreMes(mesSiguiente(m, -1))}, cuando la media fue ${fmt1(ant.media)}.`);
  }
  if (r.estados.length) partes.push(`Lo que más ha aparecido: ${y(r.estados.map(([id]) => `«${nombreEstado(id)}»`))}.`);
  const mejor = Object.entries(r.porEj).filter(([, v]) => v.tras.length).map(([id, v]) => [id, media(v.tras)]).sort((a, b) => b[1] - a[1])[0];
  if (mejor) partes.push(`El ejercicio después del que mejor te has sentido: ${ej(mejor[0])?.titulo || mejor[0]}.`);
  return partes.join(' ');
}

function vistaEvolucion(param) {
  const hoyMes = dia().slice(0, 7);
  const m = /^\d{4}-\d{2}$/.test(param || '') ? param : hoyMes;
  const r = resumenMes(m), ant = resumenMes(mesSiguiente(m, -1));
  const [y, mm] = m.split('-').map(Number);
  const primero = (new Date(y, mm - 1, 1).getDay() + 6) % 7;   // lunes = 0
  const nDias = new Date(y, mm, 0).getDate();
  const celdas = [...Array(primero).fill('<span></span>'), ...Array.from({ length: nDias }, (_, i) => {
    const f = `${m}-${String(i + 1).padStart(2, '0')}`, v = r.porDia[f];
    const n = v ? Math.round(media(v)) : 0;
    return `<span class="dia${n ? '' : ' vacio-dia'}${f === dia() ? ' hoy' : ''}" ${n ? `style="background:${COLOR_ANIMO[n - 1]}" title="${ANIMOS[n - 1]}"` : ''}>${i + 1}</span>`;
  })];
  // gráfica: los últimos 6 meses
  const meses = Array.from({ length: 6 }, (_, i) => mesSiguiente(m, i - 5)).map(x => ({ m: x, v: resumenMes(x).media }));
  const barras = meses.map(({ m: x, v }, i) => {
    const h = v ? (v / 5) * 90 : 0, c = v ? COLOR_ANIMO[Math.round(v) - 1] : 'none';
    return `<g><rect x="${i * 50 + 10}" y="${100 - h}" width="30" height="${h}" rx="5" fill="${c}"/>
      ${v ? `<text x="${i * 50 + 25}" y="${94 - h}" text-anchor="middle" class="graf-num">${fmt1(v)}</text>` : ''}
      <text x="${i * 50 + 25}" y="118" text-anchor="middle" class="graf-mes">${nombreMes(x).slice(0, 3)}</text></g>`;
  }).join('');
  const notas = r.regs.filter(x => x.nota).sort((a, b) => a.t - b.t);
  const ejs = Object.entries(r.porEj).filter(([, v]) => v.veces).sort((a, b) => b[1].veces - a[1].veces);
  app.innerHTML = `<div class="top"><button class="back" data-ir="#/">← Inicio</button></div>
    <h1>Tu evolución</h1>
    <div class="mes-nav"><button class="icono-btn" data-ir="#/evolucion/${mesSiguiente(m, -1)}" aria-label="Mes anterior">‹</button>
      <b>${nombreMes(m)[0].toUpperCase() + nombreMes(m).slice(1)} ${y}</b>
      <button class="icono-btn" data-ir="#/evolucion/${mesSiguiente(m, 1)}" aria-label="Mes siguiente" ${m >= hoyMes ? 'disabled' : ''}>›</button></div>
    ${r.dias ? `<p class="resumen-mes">${esc(textoResumen(m, r, ant))}</p>` : `<p class="vacio">No hay nada apuntado en ${nombreMes(m)}. ${m === hoyMes ? 'En la portada puedes decir cómo estás hoy.' : ''}</p>`}
    <div class="calendario" aria-label="Ánimo de cada día">
      ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<span class="dsem">${d}</span>`).join('')}${celdas.join('')}</div>
    <div class="leyenda">${ANIMOS.map((t, i) => `<span><i style="background:${COLOR_ANIMO[i]}"></i>${t}</span>`).join('')}</div>
    ${r.dias ? `<div class="cifras">
      <div><b>${fmt1(r.media)}</b><span>ánimo medio</span></div>
      <div><b>${r.dias}</b><span>${r.dias === 1 ? 'día apuntado' : 'días apuntados'}</span></div>
      <div><b>${r.ses.length}</b><span>${r.ses.length === 1 ? 'ejercicio hecho' : 'ejercicios hechos'}</span></div></div>` : ''}
    ${r.estados.length ? `<h2>Lo que más ha aparecido</h2><div class="chips">${r.estados.map(([id, n]) => `<span class="chip">${esc(CAT.estados.find(x => x.id === id)?.nombre || id)} · ${n}</span>`).join('')}</div>` : ''}
    ${ejs.length ? `<h2>Tus ejercicios</h2><div class="lista">${ejs.map(([id, v]) => `<div class="card fila-ej"><span><b>${esc(ej(id)?.titulo || id)}</b>
      <span class="sub">${v.veces} ${v.veces === 1 ? 'vez' : 'veces'}${v.tras.length ? ` · después: ${ANIMOS[Math.round(media(v.tras)) - 1].toLowerCase()}` : ''}</span></span>
      ${v.tras.length ? cara(Math.round(media(v.tras)), 28) : ''}</div>`).join('')}</div>` : ''}
    <h2>Mes a mes</h2>
    <svg class="grafica" viewBox="0 0 300 124" role="img" aria-label="Ánimo medio de los últimos seis meses">${barras}</svg>
    ${notas.length ? `<h2>Tus notas</h2><div class="notas">${notas.map(x => `<p><span class="muted">${+x.f.slice(8)} de ${nombreMes(m)} ·</span> ${cara(x.n, 18)} ${esc(x.nota)}</p>`).join('')}</div>` : ''}`;
  enlazar();
}

// ---------- Ajustes ----------
const ICONO_AJUSTES = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>';

async function fotoPortada() {
  if (!('caches' in window)) return null;
  const r = await (await caches.open(PERFIL)).match(URL_FOTO);
  return r ? URL.createObjectURL(await r.blob()) : null;
}
// la foto se reduce a 1600 px como máximo para que no ocupe mucho
async function guardarFoto(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  await (await caches.open(PERFIL)).put(URL_FOTO, new Response(blob, { headers: { 'Content-Type': 'image/jpeg' } }));
}
const blobADataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
const CLAVES_PERFIL = ['nombre', 'nombrePreguntado', 'animoActivo', 'animo', 'sesiones', 'estados', 'tiempo', 'vozAlta', 'ritmo'];

async function vistaAjustes() {
  const foto = await fotoPortada().catch(() => null);
  app.innerHTML = `<div class="top"><button class="back" data-ir="#/">← Inicio</button></div>
    <h1>Ajustes</h1>
    <section class="bloque"><h2><label for="nombre">Tu nombre</label></h2>
      <form class="fila" id="form-nombre"><input id="nombre" type="text" autocomplete="given-name" maxlength="30" value="${esc(nombre())}" placeholder="Tu nombre">
        <button class="btn-mini" type="submit">Guardar</button></form>
      <p class="ayuda" id="ayuda-nombre">${esDaniel() ? 'Aparece en el saludo de la portada y los audios te llaman por tu nombre.' : 'Aparece en el saludo de la portada.'}</p></section>
    <section class="bloque"><h2>Foto de portada</h2>
      <div class="foto-ajuste"><img src="${foto || 'img/inicio.jpg'}" alt="Foto de portada actual">
        <div><label class="btn-sec elegir-foto">Elegir foto<input type="file" accept="image/*" id="foto" hidden></label>
        ${foto ? '<button class="enlace" id="foto-original">Volver a la foto original</button>' : ''}</div></div>
      <p class="ayuda">La foto se queda en este móvil.</p></section>
    <section class="bloque"><h2>Registro de ánimo</h2>
      <label class="toggle"><span>Preguntarme cómo estoy, cada día y al terminar un ejercicio</span><input type="checkbox" id="animo-activo" ${animoActivo() ? 'checked' : ''}></label>
      <button class="enlace" data-ir="#/evolucion">Ver tu evolución</button></section>
    <section class="bloque"><h2>Descargas</h2>
      <button class="btn-sec" data-ir="#/descargas">${ICONO_DESCARGA}<span>Mis descargas</span></button></section>
    <section class="bloque"><h2>Tus datos</h2>
      <p class="ayuda">Tu nombre, tu foto y tu registro de ánimo se guardan solo en este móvil. No se envían a ningún sitio y nadie más puede verlos. Si cambias de móvil o borras los datos del navegador, se pierden: guarda una copia de vez en cuando.</p>
      <div class="botones-datos">
        <button class="btn-sec" id="copia">Guardar una copia</button>
        <label class="btn-sec">Recuperar una copia<input type="file" accept="application/json,.json" id="recuperar" hidden></label>
      </div>
      <button class="enlace peligro" id="borrar-datos">Borrar mis datos</button></section>
    <p class="estado-ajustes" id="estado" role="status"></p>`;
  enlazar();
  const aviso = t => { $('#estado').textContent = t; setTimeout(() => { const x = $('#estado'); if (x) x.textContent = ''; }, 3500); };
  $('#form-nombre').addEventListener('submit', ev => {
    ev.preventDefault();
    store.set('nombre', $('#nombre').value.trim()); store.set('nombrePreguntado', true);
    $('#ayuda-nombre').textContent = esDaniel() ? 'Aparece en el saludo de la portada y los audios te llaman por tu nombre.' : 'Aparece en el saludo de la portada.';
    aviso('Nombre guardado.');
  });
  $('#foto').addEventListener('change', async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try { await guardarFoto(f); vistaAjustes(); } catch { aviso('No se ha podido usar esa foto. Prueba con otra.'); }
  });
  $('#foto-original')?.addEventListener('click', async () => { await (await caches.open(PERFIL)).delete(URL_FOTO); vistaAjustes(); });
  $('#animo-activo').addEventListener('change', ev => store.set('animoActivo', ev.target.checked));
  $('#copia').addEventListener('click', async () => {
    const datos = { app: 'botiquin', version: 1, fecha: new Date().toISOString(), datos: {} };
    CLAVES_PERFIL.forEach(k => { const v = store.get(k, null); if (v !== null) datos.datos[k] = v; });
    const r = await (await caches.open(PERFIL)).match(URL_FOTO).catch(() => null);
    if (r) datos.foto = await blobADataURL(await r.blob());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(datos)], { type: 'application/json' }));
    a.download = `botiquin-copia-${dia()}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    aviso('Copia guardada en tus descargas del móvil.');
  });
  $('#recuperar').addEventListener('change', async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      const c = JSON.parse(await f.text());
      if (c.app !== 'botiquin' || !c.datos) throw new Error('formato');
      if (!confirm('¿Recuperar esta copia? Sustituye tu nombre, tu foto y tu registro de ánimo actuales.')) return;
      CLAVES_PERFIL.forEach(k => { try { localStorage.removeItem(k); } catch { /* nada */ } });
      Object.entries(c.datos).forEach(([k, v]) => { if (CLAVES_PERFIL.includes(k)) store.set(k, v); });
      const cache = await caches.open(PERFIL);
      if (c.foto) await cache.put(URL_FOTO, await fetch(c.foto)); else await cache.delete(URL_FOTO);
      ui.estados = new Set(store.get('estados', [])); ui.tiempo = store.get('tiempo', 10); ui.ritmo = store.get('ritmo', 'normal');
      await vistaAjustes(); aviso('Copia recuperada.');
    } catch { aviso('Ese archivo no es una copia de Botiquín.'); }
  });
  $('#borrar-datos').addEventListener('click', async () => {
    if (!confirm('¿Borrar tu nombre, tu foto y tu registro de ánimo de este móvil? No se puede deshacer. Las descargas se mantienen.')) return;
    CLAVES_PERFIL.forEach(k => { try { localStorage.removeItem(k); } catch { /* nada */ } });
    await caches.delete(PERFIL).catch(() => {});
    ui.estados = new Set(); ir('#/');
  });
}

// ---------- Rutas ----------
function rutear() {
  if (finSesion && !location.hash.startsWith('#/sesion')) { const f = finSesion; finSesion = null; f(); return; }
  const h = location.hash || '#/';
  window.scrollTo(0, 0);
  if (h.startsWith('#/ej/')) return vistaFicha(decodeURIComponent(h.slice(5)));
  if (h === '#/catalogo') return vistaCatalogo();
  if (h === '#/fin') return vistaFin();
  if (h === '#/coaching') return vistaInicio();
  if (h === '#/descargas') return vistaDescargas();
  if (h === '#/ajustes') return vistaAjustes();
  if (h === '#/registro') return vistaRegistro();
  if (h.startsWith('#/evolucion')) return vistaEvolucion(h.split('/')[2]);
  const sec = SECCIONES.find(x => `#/${x.id}` === h);
  if (sec) return vistaSeccionVacia(sec);
  return vistaPortada();
}

function bienvenida() {
  const s = document.createElement('div');
  s.className = 'splash';
  s.innerHTML = '<p class="toca">Toca para entrar</p>';
  fotoPortada().then(u => { if (u) s.style.backgroundImage = `url("${u}")`; }).catch(() => {});
  s.addEventListener('click', () => { s.classList.add('fuera'); setTimeout(() => s.remove(), 1000); });
  document.body.appendChild(s);
}

(async () => {
  // enlace personal de Daniel: …/botiquin/?yo=daniel (solo hace falta abrirlo una vez en su móvil)
  const q = new URLSearchParams(location.search);
  if (q.get('yo') === 'daniel') {
    store.set('nombre', 'Daniel'); store.set('nombrePreguntado', true);
    history.replaceState(null, '', location.pathname + location.hash);
  }
  bienvenida();
  CAT = await (await fetch('data/catalogo.json', { cache: 'no-cache' })).json();
  window.addEventListener('hashchange', rutear);
  rutear();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
