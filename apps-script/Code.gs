/* ==========================================================================
   Cocina Viva · servicio de la planilla

   Script VINCULADO al libro "Cocina Viva · Gestión" (se abre desde la planilla
   misma: Extensiones → Apps Script). Por eso acá no hay ningún identificador:
   SpreadsheetApp.getActive() ya es el libro correcto. Es la diferencia con
   Semillas, donde el script era suelto y había que cargarle los ids a mano;
   la mitad de los problemas de instalación venían de ahí.

   HOJAS QUE ADMINISTRA
     productos     código, producto, presentación, precios, activo
     clientes      nombre, localidad, tipo, medio de pago habitual, activo
     ingresos      una fila por PRODUCTO vendido (varias por venta)
     egresos       una fila por gasto
     movimientos   el libro mayor de mercadería: de dónde salió y a dónde fue
     listas        los desplegables (medios de pago, rubros)
     resumen       fórmulas vivas, para mirar desde la planilla
     invitaciones  códigos de acceso                  (oculta)
     dispositivos  teléfonos habilitados              (oculta)
     borrados      bajas propagadas entre teléfonos   (oculta)

   Cualquier OTRA hoja que agreguen a mano no se toca nunca.

   POR QUÉ EL STOCK NO SE GUARDA EN NINGUNA CELDA
   La hoja "movimientos" es la única verdad sobre la mercadería. Cada fila dice
   una cantidad, de dónde salió y a dónde fue. El stock del depósito y el de
   cada local se CALCULAN sumando esas filas. Así no existe el caso de que el
   número guardado y los movimientos no coincidan, y siempre se puede
   reconstruir de dónde salió cada unidad.

   En la planilla vieja esto estaba mezclado: dejar mercadería en consignación
   se anotaba como un ingreso con medio de pago "Consignación", que descontaba
   stock y al mismo tiempo registraba como cobrada plata que todavía no estaba.
   Acá son dos cosas distintas: la ENTREGA mueve mercadería y no toca la plata;
   la LIQUIDACIÓN es la que cobra.

   PARA EMPEZAR (una sola vez)
     1. Abrir el libro → Extensiones → Apps Script.
     2. Borrar lo que haya en Código.gs y pegar todo este archivo. Guardar.
     3. Ejecutar prepararLibro(). Crea las hojas y carga productos, clientes y
        el stock inicial. Correrla dos veces no rompe ni duplica nada.
     4. Ejecutar crearInvitaciones(). Deja los códigos en el registro de
        ejecución y en la hoja "invitaciones".
     5. Implementar → Nueva implementación → Aplicación web:
          Ejecutar como: Yo    ·    Quién tiene acceso: Cualquier persona
        Copiar la URL que termina en /exec y pegarla en docs/js/sincro.js.

   AL ACTUALIZAR ESTE CÓDIGO usar Implementar → Administrar implementaciones →
   ✏ → Nueva versión. Si se hace una implementación NUEVA cambia la URL y hay
   que actualizarla en sincro.js y subir el número de caché del service worker.
   ========================================================================== */

// Versión del protocolo. La app rechaza una respuesta que no la traiga o que
// traiga otra: así una implementación vieja que haya quedado publicada no
// puede pisar los datos del teléfono con un esquema que ya no existe.
var API = 1;

// Ubicaciones reservadas del libro mayor. En mayúscula y sin acentos a
// propósito: los locales se escriben como los nombraron ellas ("humus",
// "el gaita"), así que nunca se van a confundir con estas.
var DEPOSITO = 'DEPOSITO';
var PRODUCCION = 'PRODUCCION';
var VENDIDO = 'VENDIDO';
var MERMA = 'MERMA';

var COLUMNAS = {
  productos:   ['cod', 'producto', 'presentacion', 'pmayor', 'pminor', 'activo', 'mod'],
  clientes:    ['nombre', 'localidad', 'tipo', 'medio_pago', 'activo', 'mod'],
  ingresos:    ['id', 'venta', 'fecha', 'cliente', 'lista', 'medio_pago', 'cod',
                'cantidad', 'precio', 'subtotal', 'obs', 'mod'],
  egresos:     ['id', 'fecha', 'rubro', 'detalle', 'cantidad', 'monto', 'medio_pago', 'obs', 'mod'],
  movimientos: ['id', 'fecha', 'tipo', 'cod', 'cantidad', 'desde', 'hacia', 'ref', 'obs', 'mod'],
  borrados:    ['id', 'mod']
};

var ENCABEZADOS = {
  productos:   ['código', 'producto', 'presentación', 'precio mayor', 'precio minorista', 'activo', 'mod'],
  clientes:    ['nombre', 'localidad', 'tipo', 'medio de pago habitual', 'activo', 'mod'],
  ingresos:    ['id', 'venta', 'fecha', 'cliente', 'lista', 'medio de pago', 'código',
                'cantidad', 'precio', 'subtotal', 'observaciones', 'mod'],
  egresos:     ['id', 'fecha', 'rubro', 'detalle', 'cantidad', 'monto', 'medio de pago',
                'observaciones', 'mod'],
  movimientos: ['id', 'fecha', 'tipo', 'código', 'cantidad', 'desde', 'hacia', 'referencia',
                'observaciones', 'mod'],
  borrados:     ['id', 'mod'],
  listas:       ['medios de pago', 'rubros de egreso'],
  invitaciones: ['código', 'para quién', 'estado', 'creada', 'usada el', 'dispositivo'],
  dispositivos: ['dispositivo', 'persona', 'activo', 'alta', 'última actividad', 'envíos', 'huella']
};

// Los tipos de movimiento y qué hacen con la mercadería. El "desde" y el
// "hacia" los pone la app; se listan acá para que la hoja se entienda
// mirándola sola.
//
//   produccion    PRODUCCION → DEPOSITO    envasaron y entró al depósito
//   venta         DEPOSITO   → VENDIDO     venta con cobro, sale del depósito
//   entrega       DEPOSITO   → humus       se dejó en consignación, sin cobrar
//   liquidacion   humus      → VENDIDO     el local vendió y pagó
//   devolucion    humus      → DEPOSITO    volvió sin venderse
//   ajuste        según el conteo real
//   merma         DEPOSITO   → MERMA       rotura, vencimiento, consumo propio
var TIPOS = ['produccion', 'venta', 'entrega', 'liquidacion', 'devolucion', 'ajuste', 'merma'];

var COLOR = {
  bordo: '#8c0730', bordoSuave: '#f6e7ec',
  verde: '#4a6b3a', verdeSuave: '#eaf0e5',
  tierra: '#a9722f', tierraSuave: '#f7eddd',
  gris: '#6b6560', crema: '#faf6f0', blanco: '#ffffff'
};

/* ================= Entradas del servicio ================= */

// Todo va envuelto: si algo falla, Apps Script devuelve una página HTML de
// error que no le dice nada a nadie. Así al menos vuelve el motivo en JSON.
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};

    // Lo único abierto sin credencial: canjear el código de invitación.
    if (p.canjear) {
      return json(canjearInvitacion(p.canjear, p.persona || '', p.dispositivo || ''));
    }
    return json({ ok: true, api: API, servicio: 'Cocina Viva', hora: new Date().toISOString() });
  } catch (err) {
    return json({ ok: false, error: String(err), donde: 'doGet' });
  }
}

function doPost(e) {
  var candado = LockService.getScriptLock();
  candado.waitLock(25000);
  try {
    var pedido = JSON.parse(e.postData.contents);

    // Nada se lee ni se escribe sin credencial. La dirección del servicio está
    // en el código público de la app: sin esto, cualquiera que la encontrara
    // podría leer las ventas del emprendimiento o inventar filas.
    var permiso = permitido(pedido.credencial);
    if (!permiso.ok) return json(permiso);

    asegurarEsquema();
    var estado = sincronizar(pedido);
    marcarActividad(permiso.fila, estado.guardados);
    return json(estado);
  } catch (err) {
    return json({ ok: false, error: String(err), donde: 'doPost' });
  } finally {
    candado.releaseLock();
  }
}

/* ================= Sincronización ================= */

// Un solo viaje hace las dos cosas: sube lo que el teléfono tenga pendiente y
// baja el estado completo. La app se queda con lo que vuelve, así que después
// de sincronizar todos los teléfonos muestran lo mismo.
function sincronizar(pedido) {
  var borrados = {};
  leerBorrados().forEach(function (b) { borrados[b.id] = b; });
  (pedido.borrados || []).forEach(function (b) { borrados[b.id] = b; });

  var guardados = 0;
  var resultado = { ok: true, api: API };

  ['ingresos', 'egresos', 'movimientos'].forEach(function (nombre) {
    var entrantes = pedido[nombre] || [];
    guardados += entrantes.length;
    var fusionadas = fusionar(leerFilas(nombre), entrantes, borrados);
    escribirFilas(nombre, fusionadas);
    resultado[nombre] = fusionadas;
  });

  // Productos y clientes se identifican por su código o su nombre, no por un
  // id: son catálogos cortos que ellas también editan desde la planilla.
  [['productos', 'cod'], ['clientes', 'nombre']].forEach(function (par) {
    var entrantes = pedido[par[0]] || [];
    guardados += entrantes.length;
    var fusionadas = fusionarPorClave(leerFilas(par[0]), entrantes, par[1]);
    escribirFilas(par[0], fusionadas);
    resultado[par[0]] = fusionadas;
  });

  escribirBorrados(borrados);
  resultado.borrados = Object.keys(borrados).map(function (id) {
    return { id: id, mod: borrados[id].mod };
  });
  resultado.listas = leerListas();
  resultado.guardados = guardados;
  return resultado;
}

// Gana la versión con el "mod" más alto. Es la regla más simple que funciona
// con dos o tres personas cargando desde teléfonos distintos, y la misma que
// venimos usando en bioma-mov.
function fusionar(remotas, locales, borrados) {
  var porId = {};
  remotas.concat(locales).forEach(function (f) {
    if (!f || !f.id || borrados[f.id]) return;
    var previa = porId[f.id];
    if (!previa || (Number(f.mod) || 0) > (Number(previa.mod) || 0)) porId[f.id] = f;
  });
  return Object.keys(porId).map(function (id) { return porId[id]; })
    .sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
}

function fusionarPorClave(remotas, locales, clave) {
  var porClave = {};
  remotas.concat(locales).forEach(function (f) {
    var k = String((f && f[clave]) || '').trim();
    if (!k) return;
    var previa = porClave[k];
    if (!previa || (Number(f.mod) || 0) > (Number(previa.mod) || 0)) porClave[k] = f;
  });
  return Object.keys(porClave).sort().map(function (k) { return porClave[k]; });
}

/* ================= Lectura ================= */

// Lee una hoja tolerando filas escritas a mano: si falta el id lo inventa, si
// la fecha vino "7/8/2026" la normaliza, si el monto vino "$ 1.234,50" lo
// convierte a número. Que puedan agregar una fila desde la planilla y que la
// app la levante igual no es un extra: es la razón de usar una planilla.
function leerFilas(nombre) {
  var h = hoja(nombre);
  var valores = h.getDataRange().getValues();
  var cols = COLUMNAS[nombre];
  var filas = [];
  var contador = 0;

  for (var i = 1; i < valores.length; i++) {
    var v = valores[i];
    var vacia = true;
    for (var k = 0; k < cols.length; k++) {
      if (v[k] !== '' && v[k] != null) { vacia = false; break; }
    }
    if (vacia) continue;

    var o = {};
    for (var j = 0; j < cols.length; j++) o[cols[j]] = v[j];
    o.mod = Number(o.mod) || Date.now();

    if (nombre === 'productos') {
      o.cod = String(o.cod || '').trim().toUpperCase();
      if (!o.cod) continue;
      o.producto = String(o.producto || '').trim();
      o.presentacion = String(o.presentacion || '').trim();
      o.pmayor = numero(o.pmayor);
      o.pminor = numero(o.pminor);
      o.activo = siNo(o.activo, true);

    } else if (nombre === 'clientes') {
      o.nombre = String(o.nombre || '').trim();
      if (!o.nombre) continue;
      o.localidad = String(o.localidad || '').trim();
      o.tipo = String(o.tipo || '').trim().toLowerCase().indexOf('consig') === 0
        ? 'consignación' : 'compra';
      o.medio_pago = String(o.medio_pago || '').trim();
      o.activo = siNo(o.activo, true);

    } else {
      o.id = String(o.id || '').trim() || ('man-' + Date.now().toString(36) + '-' + (contador++));
      o.fecha = fechaIso(o.fecha) || fechaIso(new Date());
    }

    if (nombre === 'ingresos') {
      o.venta = String(o.venta || '').trim() || o.id;
      o.cliente = String(o.cliente || '').trim();
      o.lista = String(o.lista || '').trim().toLowerCase().indexOf('min') === 0
        ? 'minorista' : 'mayorista';
      o.medio_pago = String(o.medio_pago || '').trim();
      o.cod = String(o.cod || '').trim().toUpperCase();
      o.cantidad = numero(o.cantidad);
      o.precio = numero(o.precio);
      // Si la fila se cargó a mano sin subtotal, se calcula; si lo pusieron, se
      // respeta: puede haber un redondeo o una bonificación.
      o.subtotal = numero(o.subtotal) || (o.cantidad * o.precio);
      o.obs = String(o.obs || '');
      if (!o.cantidad && !o.subtotal) continue;

    } else if (nombre === 'egresos') {
      o.rubro = String(o.rubro || '').trim() || 'Otros Gastos';
      o.detalle = String(o.detalle || '');
      // La cantidad de un egreso es texto a propósito: en la planilla vieja hay
      // "5,4", "9,5 l", "2 k" y "7 turnos". Obligarla a número perdería el dato.
      o.cantidad = String(o.cantidad == null ? '' : o.cantidad);
      o.monto = numero(o.monto);
      o.medio_pago = String(o.medio_pago || '').trim();
      o.obs = String(o.obs || '');
      if (!o.monto) continue;

    } else if (nombre === 'movimientos') {
      o.tipo = String(o.tipo || '').trim().toLowerCase();
      if (TIPOS.indexOf(o.tipo) < 0) o.tipo = 'ajuste';
      o.cod = String(o.cod || '').trim().toUpperCase();
      o.cantidad = numero(o.cantidad);
      o.desde = String(o.desde || '').trim();
      o.hacia = String(o.hacia || '').trim();
      o.ref = String(o.ref || '');
      o.obs = String(o.obs || '');
      if (!o.cod || !o.cantidad) continue;
    }

    filas.push(o);
  }
  return filas;
}

function leerBorrados() {
  var v = hoja('borrados').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (!v[i][0]) continue;
    out.push({ id: String(v[i][0]), mod: Number(v[i][1]) || 0 });
  }
  return out;
}

function leerListas() {
  var v = hoja('listas').getDataRange().getValues();
  var listas = { medios_pago: [], rubros: [] };
  for (var i = 1; i < v.length; i++) {
    var m = String(v[i][0] || '').trim();
    var r = String(v[i][1] || '').trim();
    if (m && listas.medios_pago.indexOf(m) < 0) listas.medios_pago.push(m);
    if (r && listas.rubros.indexOf(r) < 0) listas.rubros.push(r);
  }
  return listas;
}

/* ================= Escritura ================= */

function escribirFilas(nombre, objetos) {
  var h = hoja(nombre);
  var cols = COLUMNAS[nombre];
  var ultima = h.getLastRow();
  if (ultima > 1) h.getRange(2, 1, ultima - 1, cols.length).clearContent();
  if (!objetos.length) return;

  var filas = objetos.map(function (o) {
    return cols.map(function (c) {
      var v = o[c];
      if (c === 'fecha') return aFecha(v);
      if (c === 'activo') return v === false ? 'no' : 'sí';
      return v == null ? '' : v;
    });
  });
  asegurarFilas(h, filas.length + 1);
  h.getRange(2, 1, filas.length, cols.length).setValues(filas);
}

function escribirBorrados(borrados) {
  var h = hoja('borrados');
  var ultima = h.getLastRow();
  if (ultima > 1) h.getRange(2, 1, ultima - 1, 2).clearContent();
  var ids = Object.keys(borrados);
  if (!ids.length) return;
  h.getRange(2, 1, ids.length, 2).setValues(ids.map(function (id) {
    return [id, borrados[id].mod];
  }));
}

/* ================= Normalización ================= */

function dos(n) { return ('0' + n).slice(-2); }

// Acepta lo que salga: el objeto Date de la planilla, "7/8/2026", "2026-08-07"
// y también "7/8" sin año, que en la planilla vieja aparece bastante.
function fechaIso(v) {
  if (v instanceof Date && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v || '').trim();
  if (!s) return '';
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return m[3] + '-' + dos(m[2]) + '-' + dos(m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + dos(m[2]) + '-' + dos(m[3]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) return new Date().getFullYear() + '-' + dos(m[2]) + '-' + dos(m[1]);
  return '';
}

function aFecha(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s || '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// "$ 12.300" y "12,5" salen bien los dos: el punto separa miles y la coma es
// el decimal, que es como se escribe acá.
function numero(v) {
  if (typeof v === 'number') return v;
  var s = String(v == null ? '' : v).replace(/[^\d,.\-]/g, '');
  if (!s) return 0;
  if (s.indexOf(',') > -1 && s.lastIndexOf(',') > s.lastIndexOf('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  } else {
    s = s.replace(/,/g, '');
  }
  return Number(s) || 0;
}

// Cualquier cosa que no diga que no, es que sí. Que tachen la celda con una
// "x" o la dejen vacía no tiene que dar de baja un producto sin querer.
function siNo(v, porDefecto) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return porDefecto;
  return !(s === 'no' || s === 'n' || s === 'false' || s === '0' || s === 'baja');
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==========================================================================
   ACCESO

   La dirección del servicio va escrita en docs/js/sincro.js, que es público.
   Sin nada más, cualquiera que la encontrara podría leer las ventas del
   emprendimiento o inventar filas. En MonAgric se comprobó ejecutándolo: no
   era teoría.

   Por eso cada teléfono canjea UNA VEZ un código y recibe a cambio una
   credencial larga y al azar que queda guardada en ese aparato. Del lado de
   la planilla se guarda solo la huella SHA-256: alcanza para comprobarla,
   pero no permite reconstruirla.

   Si un teléfono se pierde, se escribe "no" en la columna "activo" de su fila
   en la hoja "dispositivos" y deja de poder entrar, sin afectar a nadie más.
   ========================================================================== */

// De la credencial sale siempre la misma huella, pero de la huella no se
// puede volver a la credencial.
function huella(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
                                      String(texto), Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}

// Sin I, O, 0 ni 1: se confunden al dictarlos por teléfono o al copiarlos de
// un papel.
function alAzar(largo) {
  var letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for (var i = 0; i < largo; i++) {
    s += letras.charAt(Math.floor(Math.random() * letras.length));
  }
  return s;
}

// Se ejecuta A MANO desde el editor. No se expone como entrada del servicio:
// si cualquiera pudiera pedir invitaciones, no habría control de acceso.
function crearInvitaciones() {
  var cuantas = 4;            // ← alcanzan para las dos, más dos de repuesto
  asegurarEsquema();
  var h = hoja('invitaciones');
  var salida = [];
  for (var i = 0; i < cuantas; i++) {
    var codigo = alAzar(4) + '-' + alAzar(4);
    h.appendRow([codigo, '', 'Nueva', new Date(), '', '']);
    salida.push(codigo);
  }
  var texto = 'Códigos creados (anotá en la columna «para quién» a quién le tocó cada uno):\n\n'
            + salida.join('\n');
  Logger.log(texto);
  return texto;
}

// Canjea el código por una credencial. El código queda usado y no sirve más.
function canjearInvitacion(codigo, persona, dispositivo) {
  codigo = String(codigo || '').trim().toUpperCase();
  if (!codigo) return rechazo('Falta el código.');
  if (!dispositivo) return rechazo('Falta el identificador del teléfono.');

  // Sin el candado, dos personas canjeando el mismo código en el mismo momento
  // podrían quedar las dos adentro.
  var candado = LockService.getScriptLock();
  candado.waitLock(20000);
  try {
    asegurarEsquema();
    var h = hoja('invitaciones');
    if (h.getLastRow() < 2) return rechazo('Ese código no existe.');

    var ancho = ENCABEZADOS.invitaciones.length;
    var filas = h.getRange(2, 1, h.getLastRow() - 1, ancho).getValues();

    for (var i = 0; i < filas.length; i++) {
      if (String(filas[i][0]).trim().toUpperCase() !== codigo) continue;

      // Solo sirve un código que siga diciendo "Nueva". Vale al revés que lo
      // obvio a propósito: cualquier cosa que no sea "Nueva" lo inutiliza, así
      // tacharlo escribiendo "anulado" en la celda alcanza para darlo de baja.
      var estado = String(filas[i][2] || '').trim().toLowerCase();
      if (estado === 'usado') return rechazo('Ese código ya se usó en otro teléfono.');
      if (estado !== 'nueva') return rechazo('Ese código fue dado de baja. Pedí otro.');

      var credencial = alAzar(8) + '-' + alAzar(8) + '-' + alAzar(8);
      var quien = persona || String(filas[i][1] || '');
      hoja('dispositivos').appendRow([dispositivo, quien, 'sí', new Date(), new Date(), 0,
                                      huella(credencial)]);
      h.getRange(i + 2, 3, 1, 4).setValues([['Usado', filas[i][3], new Date(), dispositivo]]);
      return { ok: true, api: API, credencial: credencial, persona: quien };
    }
    return rechazo('Ese código no existe.');
  } finally {
    candado.releaseLock();
  }
}

function permitido(credencial) {
  if (!credencial) return rechazo('Este teléfono todavía no tiene acceso.');

  var h = SpreadsheetApp.getActive().getSheetByName('dispositivos');
  if (!h || h.getLastRow() < 2) return rechazo('Este teléfono todavía no tiene acceso.');

  var buscada = huella(credencial);
  var ancho = ENCABEZADOS.dispositivos.length;
  var filas = h.getRange(2, 1, h.getLastRow() - 1, ancho).getValues();

  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][6]) !== buscada) continue;
    if (!siNo(filas[i][2], true)) {
      return rechazo('Este teléfono fue dado de baja. Pedí un código nuevo.');
    }
    return { ok: true, fila: i + 2, persona: String(filas[i][1] || '') };
  }
  return rechazo('Credencial desconocida. Pedí un código nuevo.');
}

// Deja constancia de que ese teléfono estuvo activo y cuánto subió. Si falla,
// se ignora: no se va a perder una venta por no poder anotar la visita.
function marcarActividad(fila, cuantos) {
  if (!fila) return;
  try {
    var h = SpreadsheetApp.getActive().getSheetByName('dispositivos');
    h.getRange(fila, 5).setValue(new Date());
    if (cuantos) {
      var previos = Number(h.getRange(fila, 6).getValue()) || 0;
      h.getRange(fila, 6).setValue(previos + cuantos);
    }
  } catch (err) { /* a propósito */ }
}

function rechazo(motivo) {
  return { ok: false, api: API, sin_permiso: true, error: motivo };
}

/* ==========================================================================
   PREPARAR EL LIBRO

   Se ejecuta A MANO una vez, al instalar. Deja las hojas creadas, con formato
   y con los productos, los clientes y el stock inicial cargados.

   Es idempotente: correrla dos veces no rompe ni duplica nada. Los datos de
   arranque se cargan SOLO si la hoja está vacía, así que volver a ejecutarla
   nunca pisa lo que ya hayan trabajado.
   ========================================================================== */

// El catálogo tal como estaba en la planilla vieja, hoja "Stock y Ps", al
// 21/8/2026. Las presentaciones son las que figuran ahí, con sus rarezas
// (CRT340 dice 360 y PIK360 dice 350): se copian tal cual en vez de
// corregirlas de prepo, porque la página PRODUCTOS está justamente para que
// ellas las revisen sabiendo cuál es la correcta.
//
//   código, producto, presentación, precio mayor, precio minorista, stock 21/8
var SEMILLA_PRODUCTOS = [
  ['CHCIR350', 'chutney de ciruela',            '360 g',   6800,  9100,  0],
  ['CHDU350',  'chutney de durazno',            '360 g',   6800,  9100, 73],
  ['CHDU650',  'chutney de durazno',            '650 g',  10500, 14200, 17],
  ['CRT150',   'chucrut',                       '1,5 kg', 22000, 29000,  0],
  ['CRT340',   'chucrut',                       '360 g',   6400,  8700, 28],
  ['CRT600',   'chucrut',                       '660 g',  10200, 13800,  9],
  ['DD350',    'dulce de durazno',              '350 g',   6800,  9100,  0],
  ['KAL180',   'untable de kale',               '180 g',   6150,  8300, 17],
  ['KIM150',   'kimchi',                        '1,5 kg', 25000, 33000,  0],
  ['KIM340',   'kimchi',                        '340 g',   6800,  9100, 29],
  ['KIM600',   'kimchi',                        '600 g',  10500, 14200, 17],
  ['PDN360',   'pasta de nuez y maní',          '360 g',  13000, 17100,  0],
  ['PIK360',   'pickles',                       '350 g',   6400,  8700,  5],
  ['PIK650',   'pickles',                       '660 g',  10200, 13800, 24],
  ['VIC500',   'vinagre de ciruela',            '500 ml',  7100,  9600,  0],
  ['VIE500',   'vinagre de frutas de estación', '500 ml',  7100,  9600,  5],
  ['VIM500',   'vinagre de manzana',            '500 ml',  7100,  9600,  0],
  ['VIQ500',   'vinagre de mosqueta',           '500 ml',  7100,  9600, 15],
  ['ZAM700',   'zapallo en almíbar',            '700 g',   9000, 12500, 24]
];

// De la hoja "Clientes" y de la lista de desplegables de "data1", unidas.
//
// El tipo (compra o consignación) NO sale solo de la columna de la hoja
// "Clientes": esa columna quedó vieja. Dice que lahuan compra, pero en
// INGRESOS lahuan aparece siempre con medio de pago "Consignación". Donde las
// dos fuentes no coinciden gana lo que muestran los movimientos reales, que
// es lo que efectivamente están haciendo.
//
//   nombre, localidad, tipo
var SEMILLA_CLIENTES = [
  ['bere',                         'Bariloche',         'consignación'],
  ['faty',                         'Bariloche',         'consignación'],
  ['sebastian lanzi',              'Bariloche',         'consignación'],
  ['navarro km 8 bari',            'Bariloche',         'compra'],
  ['verdu richard bari',           'Bariloche',         'compra'],
  ['bicho sano',                   'El Bolsón',         'consignación'],
  ['cabaña micó',                  'El Bolsón',         'compra'],
  ['chiringuito',                  'El Bolsón',         'compra'],
  ['del paralelo',                 'El Bolsón',         'compra'],
  ['el chaqueño',                  'El Bolsón',         'compra'],
  ['el gaita',                     'El Bolsón',         'consignación'],
  ['el molino belgrano y beruti',  'El Bolsón',         'compra'],
  ['el molino san martin',         'El Bolsón',         'consignación'],
  ['el obrador',                   'El Bolsón',         'consignación'],
  ['hotdogueria',                  'El Bolsón',         'compra'],
  ['humus',                        'El Bolsón',         'consignación'],
  ['la rompe',                     'El Bolsón',         'consignación'],
  ['maradona 1 (sarmiento)',       'El Bolsón',         'compra'],
  ['maradona 2 (san martin)',      'El Bolsón',         'compra'],
  ['mercado de montaña',           'El Bolsón',         'consignación'],
  ['nutriverde',                   'El Bolsón',         'compra'],
  ['renacer',                      'El Bolsón',         'consignación'],
  ['verde menta',                  'El Bolsón',         'compra'],
  ['chaqueño el hoyo',             'El Hoyo',           'compra'],
  ['casa koko',                    'Lago Puelo',        'compra'],
  ['el molino puelo',              'Lago Puelo',        'compra'],
  ['keuken',                       'Lago Puelo',        'consignación'],
  ['lahuan',                       'Lago Puelo',        'consignación'],
  ['reina fragaria',               'Lago Puelo',        'compra'],
  ['la gringa',                    'Paraje Entre Ríos', 'compra'],
  ['lima limón',                   'Paraje Entre Ríos', 'compra'],
  ['el molino paraje',             'Paraje Entre Ríos', 'compra'],
  ['amarantus',                    'Comarca',           'compra'],
  ['bioma',                        'Comarca',           'compra'],
  ['cyberia',                      'Comarca',           'compra'],
  ['eppa',                         'Comarca',           'compra'],
  ['finca los menucos',            'Comarca',           'compra'],
  ['la charcu',                    'Comarca',           'compra'],
  ['patria grande',                'Comarca',           'compra'],
  ['raisa',                        'Comarca',           'compra'],
  ['sureña',                       'Comarca',           'compra'],
  ['viñedos trevelin',             'Comarca',           'compra'],
  ['consumidor final',             '',                  'compra'],
  ['consumo propio',               '',                  'compra'],
  ['pedido luna',                  '',                  'compra'],
  ['pedido melí',                  '',                  'compra']
];

// "Consignación" ya NO es un medio de pago: dejar mercadería en un local no es
// cobrar. Esa era la confusión de la planilla vieja y es lo que la app viene a
// separar. Los otros cinco son los que venían usando.
var SEMILLA_MEDIOS = ['Efectivo', 'MP Luna', 'MP Melí', 'Brubank', 'Transferencia'];
var SEMILLA_RUBROS = ['Insumos', 'Gastos Fijos', 'Honorarios', 'Otros Gastos', 'Inversión'];

// La fecha del conteo de stock del que salen los números de arriba.
var FECHA_STOCK_INICIAL = '2026-08-21';

function prepararLibro() {
  var hechas = asegurarEsquema();
  var texto = hechas.join('\n');
  Logger.log(texto);
  return texto;
}

// Lo que corre también en cada sincronización: barato si ya está todo hecho.
function asegurarEsquema() {
  var props = PropertiesService.getDocumentProperties();
  var hechas = [];

  ['productos', 'clientes', 'ingresos', 'egresos', 'movimientos', 'listas',
   'invitaciones', 'dispositivos', 'borrados'].forEach(function (n) { hoja(n); });

  if (props.getProperty('esquema') !== 'v1') {
    darFormato();
    hechas.push('Hojas creadas y con formato.');

    if (hoja('listas').getLastRow() < 2) {
      var n = Math.max(SEMILLA_MEDIOS.length, SEMILLA_RUBROS.length);
      var filas = [];
      for (var i = 0; i < n; i++) {
        filas.push([SEMILLA_MEDIOS[i] || '', SEMILLA_RUBROS[i] || '']);
      }
      hoja('listas').getRange(2, 1, n, 2).setValues(filas);
      hechas.push('Listas de medios de pago y rubros cargadas.');
    }

    // Cada carga mira SU propia hoja, no la de al lado. Si las tres colgaran
    // de una sola condición y la ejecución se cortara en el medio —Apps Script
    // corta a los seis minutos, y una autorización a medias también corta—, al
    // volver a ejecutar la condición ya sería falsa y lo que faltaba no se
    // cargaría nunca.
    if (hoja('productos').getLastRow() < 2) hechas.push(cargarProductos());
    if (hoja('clientes').getLastRow() < 2) hechas.push(cargarClientes());
    if (hoja('movimientos').getLastRow() < 2) hechas.push(cargarStockInicial());

    crearResumen();
    hechas.push('Hoja resumen creada.');
    ['invitaciones', 'dispositivos', 'borrados'].forEach(function (n) { hoja(n).hideSheet(); });
    limpiarHojaSobrante();
    props.setProperty('esquema', 'v1');
  }
  return hechas.length ? hechas : ['Ya estaba todo listo, no hizo falta cambiar nada.'];
}

function cargarProductos() {
  var ahora = Date.now();
  var filas = SEMILLA_PRODUCTOS.map(function (p) {
    return [p[0], p[1], p[2], p[3], p[4], 'sí', ahora];
  });
  hoja('productos').getRange(2, 1, filas.length, 7).setValues(filas);
  return 'Cargados ' + filas.length + ' productos.';
}

function cargarClientes() {
  var ahora = Date.now();
  var filas = SEMILLA_CLIENTES.map(function (c) {
    return [c[0], c[1], c[2], '', 'sí', ahora];
  });
  hoja('clientes').getRange(2, 1, filas.length, 6).setValues(filas);
  return 'Cargados ' + filas.length + ' clientes.';
}

// El stock inicial entra como movimientos de verdad, uno por producto, en vez
// de como un número suelto en una celda. Así el depósito queda cuadrado desde
// el primer día por el mismo camino que todo lo que venga después, y se ve de
// dónde salió: dice "ajuste" con la fecha del conteo.
function cargarStockInicial() {
  var ahora = Date.now();
  var filas = [];
  SEMILLA_PRODUCTOS.forEach(function (p, i) {
    if (!p[5]) return;
    filas.push(['ini-' + p[0], aFecha(FECHA_STOCK_INICIAL), 'ajuste', p[0], p[5],
                '', DEPOSITO, 'conteo inicial',
                'Stock contado el ' + FECHA_STOCK_INICIAL, ahora + i]);
  });
  if (!filas.length) return 'No había stock inicial que cargar.';
  hoja('movimientos').getRange(2, 1, filas.length, 10).setValues(filas);
  return 'Cargado el stock inicial de ' + filas.length + ' productos ('
       + FECHA_STOCK_INICIAL + ').';
}

/* ================= Formato de las hojas ================= */

function darFormato() {
  formatoDatos('productos', COLOR.verde, COLOR.verdeSuave);
  formatoDatos('clientes', COLOR.gris, '#efedea');
  formatoDatos('ingresos', COLOR.bordo, COLOR.bordoSuave);
  formatoDatos('egresos', COLOR.tierra, COLOR.tierraSuave);
  formatoDatos('movimientos', COLOR.verde, COLOR.verdeSuave);

  var l = hoja('listas');
  l.setTabColor(COLOR.gris);
  l.setFrozenRows(1);
  l.getRange(1, 1, 1, 2).setValues([ENCABEZADOS.listas])
    .setBackground(COLOR.gris).setFontColor(COLOR.blanco).setFontWeight('bold');
  l.setColumnWidth(1, 170);
  l.setColumnWidth(2, 170);
}

// Hasta qué fila llegan el formato, los desplegables y el rayado. Google crea
// las hojas con mil filas; acá se estiran hasta esta cantidad de una vez, para
// no tener que reaplicar el formato cada vez que crecen.
var FILAS_CON_FORMATO = 2000;

// Un getRange que se pasa del tamaño de la hoja NO devuelve un rango recortado:
// tira «those rows are out of bounds» y corta la ejecución ahí mismo. Como la
// hoja de ingresos va a pasar las mil filas dentro del primer año —la planilla
// vieja llevaba unas ochocientas en ocho meses—, la hoja se agranda antes de
// escribir en vez de suponer que entra.
function asegurarFilas(h, cuantas) {
  var faltan = cuantas - h.getMaxRows();
  if (faltan > 0) h.insertRowsAfter(h.getMaxRows(), faltan);
}

function formatoDatos(nombre, fuerte, suave) {
  var h = hoja(nombre);
  var cols = COLUMNAS[nombre];
  var n = cols.length;

  asegurarFilas(h, FILAS_CON_FORMATO);
  h.setTabColor(fuerte);
  h.setFrozenRows(1);
  h.getRange(1, 1, 1, n).setValues([ENCABEZADOS[nombre]])
    .setBackground(fuerte).setFontColor(COLOR.blanco).setFontWeight('bold').setFontSize(11);

  if (h.getBandings().length === 0) {
    h.getRange(1, 1, FILAS_CON_FORMATO, n).applyRowBanding()
      .setHeaderRowColor(fuerte).setFirstRowColor(COLOR.blanco).setSecondRowColor(suave);
  }

  var col = function (c) { return cols.indexOf(c) + 1; };
  if (col('fecha')) {
    h.getRange(2, col('fecha'), FILAS_CON_FORMATO - 1).setNumberFormat('dd/mm/yyyy');
    h.setColumnWidth(col('fecha'), 95);
  }
  ['pmayor', 'pminor', 'precio', 'subtotal', 'monto'].forEach(function (c) {
    if (col(c)) {
      h.getRange(2, col(c), FILAS_CON_FORMATO - 1).setNumberFormat('"$"#,##0');
      h.setColumnWidth(col(c), 110);
    }
  });
  ['producto', 'detalle', 'obs', 'nombre', 'cliente'].forEach(function (c) {
    if (col(c)) h.setColumnWidth(col(c), 200);
  });

  // Los desplegables se arman contra las hojas "listas", "productos" y
  // "clientes", y admiten valores fuera de la lista: una fila cargada a mano
  // recibe una advertencia, no un rechazo. Si rechazara, dejaría de poder
  // usarse la planilla como planilla.
  var ss = SpreadsheetApp.getActive();
  var contra = function (rango) {
    return SpreadsheetApp.newDataValidation()
      .requireValueInRange(ss.getRange(rango), true).setAllowInvalid(true).build();
  };
  if (col('medio_pago')) {
    h.getRange(2, col('medio_pago'), FILAS_CON_FORMATO - 1).setDataValidation(contra('listas!A2:A200'));
  }
  if (nombre === 'egresos') {
    h.getRange(2, col('rubro'), FILAS_CON_FORMATO - 1).setDataValidation(contra('listas!B2:B200'));
  }
  if (col('cod') && nombre !== 'productos') {
    h.getRange(2, col('cod'), FILAS_CON_FORMATO - 1).setDataValidation(contra('productos!A2:A500'));
  }
  if (nombre === 'ingresos') {
    h.getRange(2, col('cliente'), FILAS_CON_FORMATO - 1).setDataValidation(contra('clientes!A2:A500'));
    h.getRange(2, col('lista'), FILAS_CON_FORMATO - 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['mayorista', 'minorista'], true)
        .setAllowInvalid(true).build());
  }
  if (nombre === 'movimientos') {
    h.getRange(2, col('tipo'), FILAS_CON_FORMATO - 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(TIPOS, true)
        .setAllowInvalid(true).build());
  }
  if (col('activo')) {
    h.getRange(2, col('activo'), FILAS_CON_FORMATO - 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['sí', 'no'], true)
        .setAllowInvalid(true).build());
  }

  // Columnas técnicas: existen porque la sincronización las necesita, pero no
  // le sirven a nadie que abra la planilla a mirar.
  if (col('id')) { h.getRange(2, col('id'), FILAS_CON_FORMATO - 1).setNumberFormat('@'); h.hideColumns(col('id')); }
  if (col('venta')) { h.getRange(2, col('venta'), FILAS_CON_FORMATO - 1).setNumberFormat('@'); h.hideColumns(col('venta')); }
  if (col('mod')) { h.getRange(2, col('mod'), FILAS_CON_FORMATO - 1).setNumberFormat('0'); h.hideColumns(col('mod')); }
}

/* ==========================================================================
   HOJA RESUMEN

   Es para mirar desde la planilla, no para la app: la app calcula lo suyo.
   Se crea una sola vez; si la tocan o le agregan cosas, no se pisa.

   Las fórmulas usan ";" como separador porque la planilla está en español.
   ========================================================================== */

function crearResumen() {
  var ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName('resumen')) return;
  var h = ss.insertSheet('resumen', 0);
  h.setTabColor(COLOR.bordo);

  h.getRange('A1:H1').merge().setValue('COCINA VIVA · RESUMEN')
    .setBackground(COLOR.bordo).setFontColor(COLOR.blanco)
    .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');

  h.getRange('A3:B7').setValues([
    ['Ingresos totales', '=SUM(ingresos!J2:J)'],
    ['Egresos totales', '=SUM(egresos!F2:F)'],
    ['Balance', '=B3-B4'],
    ['Valor del stock en depósito', '=SUM(F11:F70)'],
    ['Valor en consignación', '=SUM(G11:G70)']
  ]);
  h.getRange('A3:A7').setFontWeight('bold');
  h.getRange('B3:B7').setNumberFormat('"$"#,##0');

  h.getRange('A9').setValue('STOCK POR PRODUCTO').setFontWeight('bold').setFontColor(COLOR.verde);
  h.getRange('A10:G10').setValues([['código', 'producto', 'en depósito', 'en la calle',
                                    'precio mayor', 'valor depósito', 'valor en la calle']])
    .setFontWeight('bold').setBackground(COLOR.crema);

  // "En la calle" es todo lo que está en un local: cualquier ubicación que no
  // sea una de las reservadas. Se escribe como una lista de "distinto de" en
  // vez de nombrar los locales uno por uno, así un local nuevo entra solo.
  var noReservada = function (columna) {
    return ';movimientos!$' + columna + '$2:$' + columna + ';"<>"'
         + ';movimientos!$' + columna + '$2:$' + columna + ';"<>' + DEPOSITO + '"'
         + ';movimientos!$' + columna + '$2:$' + columna + ';"<>' + VENDIDO + '"'
         + ';movimientos!$' + columna + '$2:$' + columna + ';"<>' + MERMA + '"'
         + ';movimientos!$' + columna + '$2:$' + columna + ';"<>' + PRODUCCION + '"';
  };

  // Sesenta filas alcanzan de sobra para el catálogo y dejan lugar a los
  // productos nuevos: la fila se completa sola cuando aparece el código.
  var filas = [];
  for (var i = 0; i < 60; i++) {
    var p = i + 2;                       // fila de la hoja productos
    var f = i + 11;                      // fila de esta hoja
    var entra = 'SUMIFS(movimientos!$E$2:$E;movimientos!$D$2:$D;$A' + f + ';movimientos!$G$2:$G;"' + DEPOSITO + '")';
    var sale  = 'SUMIFS(movimientos!$E$2:$E;movimientos!$D$2:$D;$A' + f + ';movimientos!$F$2:$F;"' + DEPOSITO + '")';
    var entraCalle = 'SUMIFS(movimientos!$E$2:$E;movimientos!$D$2:$D;$A' + f + noReservada('G') + ')';
    var saleCalle  = 'SUMIFS(movimientos!$E$2:$E;movimientos!$D$2:$D;$A' + f + noReservada('F') + ')';
    filas.push([
      '=IF(productos!A' + p + '="";"";productos!A' + p + ')',
      '=IF($A' + f + '="";"";productos!B' + p + '&" "&productos!C' + p + ')',
      '=IF($A' + f + '="";"";' + entra + '-' + sale + ')',
      '=IF($A' + f + '="";"";' + entraCalle + '-' + saleCalle + ')',
      '=IF($A' + f + '="";"";productos!D' + p + ')',
      '=IF($A' + f + '="";"";C' + f + '*E' + f + ')',
      '=IF($A' + f + '="";"";D' + f + '*E' + f + ')'
    ]);
  }
  h.getRange(11, 1, 60, 7).setValues(filas);
  h.getRange('C11:D70').setNumberFormat('0');
  h.getRange('E11:G70').setNumberFormat('"$"#,##0');

  h.getRange('A72').setValue('INGRESOS POR MES').setFontWeight('bold').setFontColor(COLOR.bordo);
  h.getRange('D72').setValue('EGRESOS POR RUBRO').setFontWeight('bold').setFontColor(COLOR.tierra);
  // Los meses se arman como texto "aaaa-mm" en vez de con funciones de fecha:
  // QUERY las resuelve distinto según el tipo de la columna y se rompe seguido.
  h.getRange('A73').setValue('=QUERY({ARRAYFORMULA(IF(ingresos!C2:C="";"";TEXT(ingresos!C2:C;"yyyy-mm")))\\ingresos!J2:J};"select Col1, sum(Col2) where Col1<>\'\' group by Col1 order by Col1 desc label Col1 \'mes\', sum(Col2) \'ingresos\'";0)');
  h.getRange('D73').setValue('=QUERY(egresos!C2:F;"select C, sum(F) where C is not null group by C order by sum(F) desc label C \'rubro\', sum(F) \'total\'";0)');
  h.getRange('B73:B200').setNumberFormat('"$"#,##0');
  h.getRange('E73:E200').setNumberFormat('"$"#,##0');

  [1, 2].forEach(function (c) { h.setColumnWidth(c, 190); });
  [3, 4, 5, 6, 7].forEach(function (c) { h.setColumnWidth(c, 120); });
}

/* ================= Auxiliares ================= */

function hoja(nombre) {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(nombre);
  if (!h) {
    h = ss.insertSheet(nombre);
    h.appendRow(ENCABEZADOS[nombre] || COLUMNAS[nombre]);
  }
  return h;
}

// La hoja vacía que Google crea sola con cada planilla nueva.
function limpiarHojaSobrante() {
  var ss = SpreadsheetApp.getActive();
  ['Hoja 1', 'Hoja1', 'Sheet1'].forEach(function (nombre) {
    var sobrante = ss.getSheetByName(nombre);
    if (sobrante && ss.getSheets().length > 1 && sobrante.getLastRow() === 0) {
      ss.deleteSheet(sobrante);
    }
  });
}

// Diagnóstico: se ejecuta a mano cuando algo no arranca. No toca nada, solo
// cuenta en castellano qué encontró.
function revisar() {
  var ss = SpreadsheetApp.getActive();
  var lineas = ['Libro: ' + ss.getName(), ''];
  ['productos', 'clientes', 'ingresos', 'egresos', 'movimientos', 'listas',
   'invitaciones', 'dispositivos', 'borrados', 'resumen'].forEach(function (n) {
    var h = ss.getSheetByName(n);
    lineas.push((h ? '✓ ' : '✗ ') + n + (h ? '  (' + Math.max(0, h.getLastRow() - 1) + ' filas)' : '  falta'));
  });

  var d = ss.getSheetByName('dispositivos');
  var activos = 0;
  if (d && d.getLastRow() > 1) {
    d.getRange(2, 3, d.getLastRow() - 1, 1).getValues().forEach(function (f) {
      if (siNo(f[0], true)) activos++;
    });
  }
  lineas.push('', 'Teléfonos habilitados: ' + activos);

  var i = ss.getSheetByName('invitaciones');
  var nuevas = 0;
  if (i && i.getLastRow() > 1) {
    i.getRange(2, 3, i.getLastRow() - 1, 1).getValues().forEach(function (f) {
      if (String(f[0]).trim().toLowerCase() === 'nueva') nuevas++;
    });
  }
  lineas.push('Códigos sin usar: ' + nuevas);

  var texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}
