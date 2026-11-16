// Botiquín · web app personal de ejercicios de Coaching Vital
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TIPOS = { guiada: 'Guiada', expres: 'Exprés', ficha: 'Ficha' };
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
const ir = h => { location.hash = h; };
const fmtMin = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

function tarjeta(e, extra = '') {
  const tags = [`<span class="tag">${e.minutos} min</span>`, `<span class="tag">${TIPOS[e.tipo]}</span>`];
  if (e.audio) tags.push('<span class="tag ok">Con voz</span>');
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
  emocion: ['triste', 'tristeza', 'rabia', 'enfad', 'frustr', 'ira', 'dolid', 'decepcion', 'decepcionad', 'llorar', 'culpa', 'celos', 'rencor', 'resentid', 'atascad', 'hundid', 'desanimad', 'mal'],
  recuerdo: ['recuerdo', 'duelo', 'perdida', 'ruptura', 'separacion', 'divorcio', 'muerte', 'fallec', 'trauma', 'echo de menos', 'nostalgi', 'me dejo', 'lo dejamos'],
  limites: ['opinion', 'critica', 'criticad', 'lo que dicen', 'lo que piensen', 'me afecta', 'limite', 'juzgad', 'me juzgan', 'presion', 'decir que no', 'manipul', 'invadid', 'me pisan'],
  confianza: ['confianza', 'insegur', 'no valgo', 'no soy capaz', 'no puedo con', 'merec', 'autoestima', 'inutil', 'fracas', 'dudo de mi', 'pequeno', 'incapaz'],
  disperso: ['dispers', 'desconect', 'despist', 'concentr', 'en las nubes', 'piloto automatico', 'ausente', 'no estoy presente', 'distraid', 'en otra parte'],
  dormir: ['dormir', 'insomnio', 'sueno', 'desvel', 'no duermo', 'dormido', 'descansar'],
  rumbo: ['rumbo', 'objetivo', 'perdido', 'sin sentido', 'que hacer con mi vida', 'motivac', 'proposito', 'meta', 'desorientad', 'estancad'],
  pendientes: ['pendiente', 'cerrar', 'procrastin', 'no acabo', 'tareas', 'aplazo', 'dejo para manana', 'sin terminar'],
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

function vistaInicio() {
  const recursos = CAT.ejercicios.filter(e => e.tipo === 'expres' || e.tipo === 'ficha');
  app.innerHTML = `
    <p class="saludo">${saludo()}, Daniel</p>
    <h1>¿Cómo te sientes ahora?</h1>
    <div class="hablar">
      <form class="hablar-fila" id="form-hablar">
        <input id="frase" type="text" enterkeyhint="go" autocomplete="off" placeholder="Cuéntame: «estoy nervioso, triste…»" aria-label="Cómo te sientes">
        <button type="button" class="btn-mic" id="mic" aria-label="Hablar"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
      </form>
      <p class="entendido" id="entendido">${SR ? 'Pulsa el micrófono y dime cómo estás, o escríbelo.' : 'Escribe cómo estás.'}</p>
    </div>
    <h2>Si no puedes hablar, selecciona cómo te sientes:</h2>
    <div class="chips">${CAT.estados.map(s => `<button class="chip" data-estado="${s.id}" aria-pressed="${ui.estados.has(s.id)}">${esc(s.nombre)}</button>`).join('')}</div>
    <h2>Tiempo que tienes</h2>
    <div class="seg" role="group" aria-label="Tiempo disponible">
      ${[[5, '5 min'], [10, '10 min'], [20, '20 min'], [999, 'Sin prisa']].map(([v, t]) => `<button data-tiempo="${v}" aria-pressed="${ui.tiempo === v}">${t}</button>`).join('')}
    </div>
    <label class="toggle"><span>Puedo hablar en voz alta aquí</span><input type="checkbox" id="voz" ${ui.vozAlta ? 'checked' : ''}></label>
    <h2 id="titulo-recs">Te propongo</h2>
    <div class="lista" id="recs"></div>
    <h2>Recursos</h2>
    <div class="recursos">${recursos.map(e => `<button data-ir="#/ej/${e.id}"><b>${esc(e.titulo)}</b><span>${e.tipo === 'expres' ? `${e.minutos} min · al momento` : esc(e.subtitulo || '')}</span></button>`).join('')}</div>
    <nav class="pie"><button data-ir="#/catalogo">Todos los ejercicios</button></nav>
    <p class="crisis">Si estás en crisis o piensas en hacerte daño: 024 (24 h, gratuito) o 112.</p>`;

  let crisis = false;
  const pintarChips = () => app.querySelectorAll('[data-estado]').forEach(b => b.setAttribute('aria-pressed', ui.estados.has(b.dataset.estado)));
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
    b.setAttribute('aria-pressed', ui.estados.has(id));
    store.set('estados', [...ui.estados]); pintarRecs();
  }));
  app.querySelectorAll('[data-tiempo]').forEach(b => b.addEventListener('click', () => {
    ui.tiempo = +b.dataset.tiempo; store.set('tiempo', ui.tiempo);
    app.querySelectorAll('[data-tiempo]').forEach(x => x.setAttribute('aria-pressed', x === b));
    pintarRecs();
  }));
  $('#voz').addEventListener('change', ev => { ui.vozAlta = ev.target.checked; store.set('vozAlta', ui.vozAlta); pintarRecs(); });
  enlazar(); pintarRecs();
}

function vistaCatalogo() {
  const grupo = (tipo, titulo) => {
    const l = CAT.ejercicios.filter(e => e.tipo === tipo);
    return `<h2>${titulo}</h2><div class="lista">${l.map(e => tarjeta(e)).join('')}</div>`;
  };
  app.innerHTML = `<div class="top"><button class="back" data-ir="#/">← Inicio</button></div>
    <h1>Todos los ejercicios</h1>
    ${grupo('guiada', 'Guiados con voz')}${grupo('expres', 'Exprés')}${grupo('ficha', 'Fichas')}`;
  enlazar();
}

async function vistaFicha(id) {
  const e = ej(id);
  if (!e) return ir('#/');
  const req = e.requisitos.map(r => CAT.requisitos[r]).filter(Boolean);
  app.innerHTML = `<div class="top"><button class="back" data-ir="#/">← Inicio</button></div>
    <h1>${esc(e.titulo)}</h1>
    <p class="ficha-meta">${esc(e.subtitulo || '')} · Sesión ${e.sesion} · ${e.minutos} min · ${TIPOS[e.tipo]}</p>
    ${req.length ? `<div class="meta">${req.map(r => `<span class="tag warm">${esc(r)}</span>`).join('')}</div>` : ''}
    <section class="bloque"><h2>Para qué sirve</h2><p>${esc(e.para_que)}</p></section>
    <section class="bloque"><h2>Cuándo</h2><p>${esc(e.cuando)}</p></section>
    <section class="bloque"><h2>${e.tipo === 'ficha' ? 'Cómo se hace' : 'Los pasos'}</h2><ol class="pasos">${e.pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol></section>
    ${e.contexto ? `<section class="bloque"><h2>Contexto</h2><p class="contexto">${esc(e.contexto)}</p></section>` : ''}
    ${e.aviso ? `<p class="aviso">${esc(e.aviso)}</p>` : ''}
    <div id="zona-empezar"></div>`;
  enlazar();
  if (!e.audio) {
    if (e.tipo !== 'ficha') $('#zona-empezar').innerHTML = '<p class="consejos">El audio guiado de este ejercicio todavía está en preparación.</p>';
    return;
  }
  const infos = {};
  await Promise.all(RITMOS.map(async ([r]) => {
    try { infos[r] = await (await fetch(`audio/${e.audio}${r === 'normal' ? '' : '-' + r}.json`)).json(); } catch { /* no disponible */ }
  }));
  const disponibles = RITMOS.filter(([r]) => infos[r]);
  if (!infos[ui.ritmo]) ui.ritmo = disponibles[0]?.[0] || 'normal';
  $('#zona-empezar').innerHTML = `
    <section class="bloque"><h2>Ritmo</h2>
      <div class="seg">${disponibles.map(([r, t]) => `<button data-ritmo="${r}" aria-pressed="${ui.ritmo === r}">${t} · ${fmtMin(infos[r].duracion)}</button>`).join('')}</div>
    </section>
    <p class="consejos">Busca un sitio tranquilo. Durante el ejercicio la pantalla se queda en negro.${e.voz ? ' Al final te preguntará cómo de intenso es el malestar: dilo en voz alta y, si es 5 o más, te ofrecerá repetir el ciclo.' : ''}</p>
    <div class="empezar"><button class="btn" id="empezar">Empezar</button></div>`;
  app.querySelectorAll('[data-ritmo]').forEach(b => b.addEventListener('click', () => {
    ui.ritmo = b.dataset.ritmo; store.set('ritmo', ui.ritmo);
    app.querySelectorAll('[data-ritmo]').forEach(x => x.setAttribute('aria-pressed', x === b));
  }));
  $('#empezar').addEventListener('click', async () => {
    if (e.voz) await pedirMicrofono();   // el permiso se pide ahora, con los ojos abiertos
    iniciarSesion(e, infos[ui.ritmo]);
  });
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

async function iniciarSesion(e, info) {
  document.body.classList.add('en-sesion');
  app.innerHTML = `<div class="sesion">
      <div class="centro"><div class="paso" id="paso">Preparando…</div><div class="num" id="num"></div>
      <div class="barra"><i id="prog"></i></div></div>
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
  const a = new Audio(`audio/${info.archivo}`);
  a.preload = 'auto';
  const clip = new Audio();
  const marcas = info.marcas, eventos = info.eventos || [];
  const vars = {}; let ciclos = 1, ocupado = false, pasoActual = -1;
  let disparados = new Set();
  const datos = { id: e.id, titulo: e.titulo, ritmo: info.ritmo, inicio: Date.now(), vars, ciclos: 1 };
  window.__sesion = { a, clip, vars, get ciclos() { return ciclos; }, get ocupado() { return ocupado; } }; // para depurar

  const indicePaso = t => { let i = 0; marcas.forEach((m, k) => { if (t >= m.inicio - 0.05) i = k; }); return i; };
  const irA = t => {
    a.currentTime = t;
    disparados = new Set(eventos.map((ev, i) => (ev.t < t - 0.01 ? i : -1)).filter(i => i >= 0));
  };
  const pintar = () => {
    const i = indicePaso(a.currentTime);
    $('#prog').style.width = `${Math.min(100, (a.currentTime / info.duracion) * 100)}%`;
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
        await tocar(clip, `audio/${ev.clip}`);
        const quiere = ev.escuchar ? await escuchar(ev.escuchar.modo, ev.escuchar.espera) : true;
        if (quiere) {
          ciclos++; datos.ciclos = ciclos; pasoActual = -1;
          await tocar(clip, `audio/${info.ciclo.enlace_clip}`);
          irA(marcas.find(m => m.id === info.ciclo.desde).inicio);
          break;
        }
      }
    }
    ocupado = false;
    if (finSesion) a.play();
  }

  const reloj = setInterval(() => {
    if (ocupado || a.paused) return;
    pintar();
    const i = eventos.findIndex((ev, k) => !disparados.has(k) && a.currentTime >= ev.t - 0.08);
    if (i >= 0) procesar(i);
  }, 100);

  const saltar = dir => {
    if (ocupado) return;
    const i = indicePaso(a.currentTime);
    if (dir > 0 && i + 1 < marcas.length) irA(marcas[i + 1].inicio);
    if (dir < 0) irA(a.currentTime - marcas[i].inicio < 3 && i > 0 ? marcas[i - 1].inicio : marcas[i].inicio);
    pintar();
  };
  const alternar = () => {
    if (ocupado) return;
    if (a.paused) a.play(); else a.pause();
  };
  a.onplay = () => { $('#pp').innerHTML = ICONO_PAUSA; };
  a.onpause = () => { if (!ocupado) $('#pp').innerHTML = ICONO_PLAY; };
  $('#pp').onclick = alternar; $('#sig').onclick = () => saltar(1); $('#ant').onclick = () => saltar(-1);

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => { if (!ocupado) a.play(); });
    ms.setActionHandler('pause', () => { if (!ocupado) a.pause(); });
    ms.setActionHandler('nexttrack', () => saltar(1));
    ms.setActionHandler('previoustrack', () => saltar(-1));
  }

  const terminar = (completa) => {
    clearInterval(reloj); a.pause(); clip.pause(); a.src = ''; clip.src = '';
    finSesion = null;
    try { wakeLock?.release(); } catch { /* ya liberado */ }
    wakeLock = null;
    document.body.classList.remove('en-sesion');
    if ('mediaSession' in navigator) ['play', 'pause', 'nexttrack', 'previoustrack'].forEach(k => navigator.mediaSession.setActionHandler(k, null));
    if (completa) { sesionActual = datos; ir('#/fin'); } else ir(`#/ej/${e.id}`);
  };
  finSesion = () => terminar(false);
  a.onended = () => terminar(true);
  $('#salir').onclick = () => terminar(false);

  guardarSinConexion(e, info);
  a.play().catch(() => { $('#pp').innerHTML = ICONO_PLAY; });
  pintar();
}

async function guardarSinConexion(e, info) {
  if (!('caches' in window)) return;
  try {
    const c = await caches.open('audio-v2');
    const urls = [`audio/${info.archivo}`, ...(info.eventos || []).filter(ev => ev.clip).map(ev => `audio/${ev.clip}`)];
    if (info.ciclo) urls.push(`audio/${info.ciclo.enlace_clip}`);
    for (const u of urls) if (!(await c.match(u))) await c.add(u);
  } catch { /* sin espacio o sin red */ }
}

function vistaFin() {
  const d = sesionActual;
  sesionActual = null;
  if (!d) return ir('#/');
  app.innerHTML = `<div class="fin"><h1>Bien hecho</h1>
    <p class="ficha-meta">${esc(d.titulo)}${d.ciclos > 1 ? ` · ${d.ciclos} ciclos` : ''}</p>
    <p class="muted">Quédate un momento con lo que sientes antes de seguir.</p>
    <button class="btn" data-ir="#/">Volver al inicio</button></div>`;
  enlazar();
}

// ---------- Rutas ----------
function rutear() {
  if (finSesion && !location.hash.startsWith('#/sesion')) { const f = finSesion; finSesion = null; f(); return; }
  const h = location.hash || '#/';
  window.scrollTo(0, 0);
  if (h.startsWith('#/ej/')) return vistaFicha(decodeURIComponent(h.slice(5)));
  if (h === '#/catalogo') return vistaCatalogo();
  if (h === '#/fin') return vistaFin();
  return vistaInicio();
}

function bienvenida() {
  const s = document.createElement('div');
  s.className = 'splash';
  s.innerHTML = '<h1>Tu roca, tus vistas, tu paz.</h1><p class="toca">Toca para entrar</p>';
  s.addEventListener('click', () => { s.classList.add('fuera'); setTimeout(() => s.remove(), 1000); });
  document.body.appendChild(s);
}

(async () => {
  bienvenida();
  CAT = await (await fetch('data/catalogo.json')).json();
  window.addEventListener('hashchange', rutear);
  rutear();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
