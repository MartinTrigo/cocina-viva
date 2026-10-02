// ==========================================================================
// Los casos. Cada uno reproduce algo que ellas vieron pasar.
// ==========================================================================

(function () {
  const salida = document.getElementById("salida");
  let fallados = 0;
  const linea = (t, clase) => {
    salida.innerHTML += '<span class="' + (clase || "") + '">' + t + "</span>\n";
  };
  const caso = (t) => linea("\n▸ " + t, "caso");
  const afirmar = (bien, t) => {
    if (!bien) fallados++;
    linea((bien ? "   ok   " : "   MAL  ") + t, bien ? "ok" : "mal");
  };

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  // Deja que se asiente: la sincronizacion que quedo encolada sale sola cuando
  // termina la anterior, asi que hay que darle lugar antes de mirar el saldo.
  async function reposar() {
    for (let i = 0; i < 6; i++) { await esperar(30); await window.Sincro.sincronizar(true); }
    await esperar(30);
  }

  // ---------- utilidades del banco ----------

  function limpiarPlanilla() {
    const libro = window.__libro;
    libro.hojas = {}; libro.orden = [];
    ["productos", "clientes", "ingresos", "egresos", "movimientos",
     "listas", "invitaciones", "dispositivos", "borrados"].forEach((n) => hoja(n));
  }

  // Escribe filas directo en la hoja, como si las hubieran cargado desde la
  // planilla o desde el otro teléfono.
  function enLaPlanilla(nombre, objetos) {
    escribirFilas(nombre, objetos);
  }

  const filasDe = (nombre) => leerFilas(nombre);

  async function limpiarTelefono() {
    await new Promise((r) => {
      const p = indexedDB.deleteDatabase("cocinaviva");
      p.onsuccess = p.onerror = p.onblocked = () => r();
    });
  }

  const localTodos = (n) => window.CVDB.todos(n);
  const hay = (lista, campo, valor) => lista.some((r) => r[campo] === valor);

  // ---------- casos ----------

  async function casoClienteBorrado() {
    caso("Se borra un cliente que ya estaba en la planilla");
    limpiarPlanilla();
    await limpiarTelefono();
    enLaPlanilla("clientes", [
      { nombre: "almacen viejo", localidad: "El Bolsón", tipo: "compra",
        medio_pago: "Efectivo", activo: true, mod: 1000 },
      { nombre: "almacen nuevo", localidad: "Lago Puelo", tipo: "compra",
        medio_pago: "Efectivo", activo: true, mod: 1000 },
    ]);

    await window.Sincro.sincronizar(true);                  // baja los dos
    afirmar(hay(await localTodos("clientes"), "nombre", "almacen viejo"),
            "el cliente bajó al teléfono");

    await window.CVDB.borrar("clientes", "almacen viejo");  // lo borran
    afirmar(!hay(await localTodos("clientes"), "nombre", "almacen viejo"),
            "se fue de la pantalla al borrarlo");

    await window.Sincro.sincronizar(true);                  // sube la baja

    afirmar(!hay(filasDe("clientes"), "nombre", "almacen viejo"),
            "se fue TAMBIÉN de la planilla");
    afirmar(!hay(await localTodos("clientes"), "nombre", "almacen viejo"),
            "no volvió al teléfono");
    afirmar(hay(await localTodos("clientes"), "nombre", "almacen nuevo"),
            "el otro cliente sigue estando");
  }

  async function casoClienteRehecho() {
    caso("Se borra un cliente y después se vuelve a dar de alta con el mismo nombre");
    limpiarPlanilla();
    await limpiarTelefono();
    enLaPlanilla("clientes", [
      { nombre: "humus", localidad: "El Bolsón", tipo: "consignacion",
        medio_pago: "Efectivo", activo: true, mod: 1000 },
    ]);

    await window.Sincro.sincronizar(true);
    await window.CVDB.borrar("clientes", "humus");
    await window.Sincro.sincronizar(true);
    afirmar(!hay(filasDe("clientes"), "nombre", "humus"), "se borró");

    // Se arrepienten y lo vuelven a cargar.
    await window.CVDB.guardar("clientes", {
      nombre: "humus", localidad: "Lago Puelo", tipo: "consignacion",
      medio_pago: "Efectivo", activo: true, mod: Date.now(),
    });
    await window.Sincro.sincronizar(true);

    const enPlanilla = filasDe("clientes").filter((c) => c.nombre === "humus");
    afirmar(enPlanilla.length === 1, "volvió a la planilla una sola vez");
    afirmar(enPlanilla.length === 1 && enPlanilla[0].localidad === "Lago Puelo",
            "y con los datos nuevos, no con los viejos");
    afirmar(hay(await localTodos("clientes"), "nombre", "humus"),
            "sigue en el teléfono después de sincronizar");
  }

  async function casoVentaBorradaEnPleneVuelo() {
    caso("Se borra una venta MIENTRAS hay una sincronización en el aire");
    limpiarPlanilla();
    await limpiarTelefono();
    enLaPlanilla("ingresos", [
      { id: "v1", venta: "V1", fecha: "2026-09-01", cliente: "prueba",
        lista: "mayor", medio_pago: "Efectivo", cod: "KIM340", cantidad: 3,
        precio: 100, subtotal: 300, obs: "", mod: 1000 },
    ]);

    await window.Sincro.sincronizar(true);
    afirmar(hay(await localTodos("ingresos"), "id", "v1"), "la venta bajó al teléfono");

    // Arranca una sincronización lenta y NO se la espera: es la de fondo que
    // dispara cualquier guardado.
    window.__demoraRed = 300;
    const enVuelo = window.Sincro.sincronizar(true);

    await esperar(80);
    await window.CVDB.borrar("ingresos", "v1");             // borran mientras viaja
    const rechazada = await window.Sincro.sincronizar(true); // la app pide subir la baja

    await enVuelo;
    window.__demoraRed = 0;

    // Y se la deja terminar: la que quedó encolada sale sola.
    await reposar();

    afirmar(!hay(await localTodos("ingresos"), "id", "v1"),
            "la venta NO volvió a aparecer sola en el teléfono");
    afirmar(!hay(filasDe("ingresos"), "id", "v1"),
            "y tampoco quedó viva en la planilla");
    if (rechazada && rechazada.error) linea("   (la segunda dio: " + rechazada.error + ")");
  }

  async function casoCargaEnPlenoVuelo() {
    caso("Se carga una venta nueva MIENTRAS hay una sincronización en el aire");
    limpiarPlanilla();
    await limpiarTelefono();
    await window.Sincro.sincronizar(true);

    window.__demoraRed = 300;
    const enVuelo = window.Sincro.sincronizar(true);

    await esperar(80);
    await window.CVDB.guardar("ingresos", {
      id: "v2", venta: "V2", fecha: "2026-09-02", cliente: "prueba",
      lista: "mayor", medio_pago: "Efectivo", cod: "KIM340", cantidad: 1,
      precio: 100, subtotal: 100, obs: "", mod: Date.now(),
    });
    await window.Sincro.sincronizar(true);

    await enVuelo;
    window.__demoraRed = 0;
    await reposar();

    afirmar(hay(await localTodos("ingresos"), "id", "v2"),
            "la venta sigue en el teléfono");
    afirmar(hay(filasDe("ingresos"), "id", "v2"),
            "y LLEGÓ a la planilla (si no, se perdió una venta en silencio)");
  }

  async function casoProductoBorrado() {
    caso("Se borra un producto recién cargado, sin historia");
    limpiarPlanilla();
    await limpiarTelefono();
    enLaPlanilla("productos", [
      { cod: "ERR999", producto: "cargado mal", presentacion: "340 g",
        pmayor: 1, pminor: 2, activo: true, mod: 1000 },
    ]);
    await window.Sincro.sincronizar(true);
    await window.CVDB.borrar("productos", "ERR999");
    await reposar();

    afirmar(!hay(filasDe("productos"), "cod", "ERR999"), "se fue de la planilla");
    afirmar(!hay(await localTodos("productos"), "cod", "ERR999"), "no volvió al teléfono");
  }

  async function casoBorradoDesdeElOtroTelefono() {
    caso("Una borra en su teléfono y la otra lo ve al sincronizar");
    limpiarPlanilla();
    await limpiarTelefono();
    enLaPlanilla("clientes", [
      { nombre: "el rincón", localidad: "Epuyén", tipo: "compra",
        medio_pago: "Efectivo", activo: true, mod: 1000 },
    ]);
    await window.Sincro.sincronizar(true);

    // El otro teléfono manda la lápida directo al servicio.
    sincronizar({ borrados: [{ id: "el rincón", mod: Date.now() }] });
    afirmar(!hay(filasDe("clientes"), "nombre", "el rincón"),
            "el servicio lo sacó de la planilla");

    await window.Sincro.sincronizar(true);
    afirmar(!hay(await localTodos("clientes"), "nombre", "el rincón"),
            "y este teléfono también lo pierde de vista");
  }

  // ---------- las fechas ----------
  //
  // El 7 de septiembre la columna «fecha» de ingresos apareció vacía en 138 de
  // 143 filas. Lo grave no fue el vaciado sino lo que vino después: leerFilas
  // rellenaba una fecha ilegible con la del día, así que la sincronización
  // siguiente convirtió el hueco en 07/09/2026 y 140 ventas de julio y agosto
  // se volvieron ventas de hoy. Un dato inventado es peor que un hueco: el
  // hueco se ve, el invento no.

  function renglones(venta, fecha, cuantos) {
    const filas = [];
    for (let i = 0; i < cuantos; i++) {
      filas.push({ id: venta + "-" + i, venta: venta, fecha: fecha, cliente: "amarantus",
        lista: "mayorista", medio_pago: "Efectivo", pagado: true, cod: "CRT650",
        cantidad: 2, precio: 9800, subtotal: 19600, obs: "", mod: 1787324400000 });
    }
    return filas;
  }

  // Lo que quedó escrito en la columna C, leído crudo de la hoja.
  const columnaFecha = () => hoja("ingresos").filas.slice(1)
    .filter((f) => f[0])
    .map((f) => (f[2] instanceof Date
      ? f[2].getFullYear() + "-" + ("0" + (f[2].getMonth() + 1)).slice(-2)
        + "-" + ("0" + f[2].getDate()).slice(-2)
      : ""));

  async function casoFechasVaciadas() {
    caso("La columna de fechas aparece vacía");
    limpiarPlanilla();
    enLaPlanilla("ingresos", renglones("v1", "2026-07-10", 3).concat(renglones("v2", "2026-08-28", 2)));
    afirmar(columnaFecha().join(",") === "2026-07-10,2026-07-10,2026-07-10,2026-08-28,2026-08-28",
            "las fechas se escriben bien");

    hoja("ingresos").filas.slice(1).forEach((f) => { if (f[0]) f[2] = ""; });   // el estropicio

    afirmar(filasDe("ingresos").every((o) => !o.fecha),
            "leerFilas NO las rellena con la fecha de hoy");
    sincronizar({ ingresos: [] });
    afirmar(columnaFecha().every((f) => !f),
            "y la sincronización tampoco: el hueco sigue siendo hueco");
  }

  async function casoFechaDelHermano() {
    caso("A un renglón solo le falta la fecha");
    limpiarPlanilla();
    enLaPlanilla("ingresos", renglones("v3", "2026-08-13", 3));
    hoja("ingresos").filas[2][2] = "";
    afirmar(filasDe("ingresos").map((o) => o.fecha).join(",")
            === "2026-08-13,2026-08-13,2026-08-13",
            "se la presta otro renglón de la misma venta");
  }

  async function casoElTelefonoNoPisaLaFecha() {
    caso("El teléfono manda un renglón sin fecha");
    limpiarPlanilla();
    enLaPlanilla("ingresos", renglones("v4", "2026-08-21", 1));
    sincronizar({ ingresos: [{ id: "v4-0", venta: "v4", fecha: "", cliente: "amarantus",
      lista: "mayorista", medio_pago: "Efectivo", pagado: true, cod: "CRT650",
      cantidad: 2, precio: 9800, subtotal: 19600, obs: "", mod: Date.now() }] });
    afirmar(columnaFecha()[0] === "2026-08-21",
            "la planilla conserva la fecha que ya tenía");
  }

  async function casoRestaurarFechas() {
    caso("La reparación de las fechas, por sus cinco vías");
    limpiarPlanilla();

    //  a1  venta de la app con movimiento → la fecha sale del movimiento
    //  a2  hermano de esa venta, sin movimiento propio → sale del hermano
    //  viejo-001  importado → sale de la tabla, Y le corrige una fecha mala
    //  perdida    no tiene de dónde salir → tiene que decirlo
    enLaPlanilla("ingresos", [
      { id: "a1", venta: "vA", fecha: "", cliente: "lahuan", lista: "mayorista",
        medio_pago: "Efectivo", pagado: true, cod: "CRT650", cantidad: 1, precio: 10200,
        subtotal: 10200, obs: "", mod: 1 },
      { id: "a2", venta: "vA", fecha: "", cliente: "lahuan", lista: "mayorista",
        medio_pago: "Efectivo", pagado: true, cod: "KIM350", cantidad: 1, precio: 6800,
        subtotal: 6800, obs: "", mod: 1 },
      { id: "viejo-001", venta: "vieja-001", fecha: "2026-09-07", cliente: "amarantus",
        lista: "mayorista", medio_pago: "Efectivo", pagado: true, cod: "CRT650",
        cantidad: 2, precio: 9800, subtotal: 19600, obs: "", mod: 1 },
      { id: "renacer-001", venta: "vieja-renacer", fecha: "", cliente: "renacer",
        lista: "mayorista", medio_pago: "", pagado: false, cod: "CRT650", cantidad: 2,
        precio: 9800, subtotal: 19600, obs: "", mod: 1 },
      { id: "perdida", venta: "vZ", fecha: "", cliente: "nadie", lista: "mayorista",
        medio_pago: "Efectivo", pagado: true, cod: "CRT650", cantidad: 1, precio: 1,
        subtotal: 1, obs: "", mod: Date.UTC(2026, 8, 24, 15) },
    ]);
    enLaPlanilla("movimientos", [
      { id: "mA", fecha: "2026-09-18", tipo: "venta", cod: "CRT650", cantidad: 1,
        desde: "DEPOSITO", hacia: "VENDIDO", ref: "vA", obs: "lahuan", mod: 1 },
    ]);

    const dice = restaurarFechasDeIngresosAhora();
    const porId = {};
    filasDe("ingresos").forEach((o) => { porId[o.id] = o.fecha; });

    afirmar(porId["a1"] === "2026-09-18",
            "la venta recupera su fecha del movimiento: " + porId["a1"]);
    afirmar(porId["a2"] === "2026-09-18",
            "y el otro renglón de la misma venta también: " + porId["a2"]);
    afirmar(porId["viejo-001"] === "2026-07-10",
            "y la tabla corrige al importado, aunque tuviera una fecha puesta: "
            + porId["viejo-001"]);
    afirmar(porId["renacer-001"] === "2026-08-31",
            "la venta que a propósito no mueve stock sale de su tabla: "
            + porId["renacer-001"]);
    // La última no tiene ninguna fuente, así que cae en el día en que se cargó.
    // No es su fecha y el informe tiene que decirlo con todas las letras.
    afirmar(porId["perdida"] === "2026-09-24",
            "la que no tiene fuente cae en el día de carga: " + porId["perdida"]);
    afirmar(/DEDUCIDAS del día en que se cargaron: 1/.test(dice),
            "el informe la separa de las recuperadas");
    afirmar(/no es la fecha de la operación/.test(dice),
            "y avisa que eso no es un dato sino una deducción");
    afirmar(/SIN FUENTE, siguen sin fecha: 0/.test(dice), "no queda ninguna suelta");

    let cuantos = 0;
    Object.keys(FECHAS_DE_INGRESOS).forEach((f) => {
      cuantos += FECHAS_DE_INGRESOS[f].split(" ").length;
    });
    afirmar(cuantos === 135, "la tabla de respaldo sigue teniendo los 135 renglones");
  }

  async function casoPagadoSiONo() {
    caso("«Pagado» se escribe como lo dice el desplegable");
    limpiarPlanilla();
    enLaPlanilla("ingresos", renglones("v5", "2026-08-14", 1));
    afirmar(hoja("ingresos").filas[1][6] === "sí",
            "dice «sí» y no TRUE: " + JSON.stringify(hoja("ingresos").filas[1][6]));
  }

  // ---------- borrar deja rastro ----------
  //
  // Hasta ahora la hoja «borrados» guardaba un id y una hora, y nada más. Cuando
  // desaparecieron cuatro egresos de agosto no hubo forma de saber qué decían ni
  // quién los borró: el dispositivo se dedujo cruzando la hora con la última
  // actividad de cada teléfono, que es una corazonada, no un registro.

  async function casoLaLapidaCuenta() {
    caso("Al borrar queda anotado qué era y quién fue");
    limpiarPlanilla();
    enLaPlanilla("egresos", [{ id: "e1", fecha: "2026-08-23", rubro: "Insumos",
      detalle: "Repollo", persona: "", cantidad: "100", monto: 179400,
      medio_pago: "Brubank", obs: "Eppa", mod: 1000 }]);

    sincronizar({ borrados: [{ id: "e1", mod: 2000 }] },
                { persona: "luna", dispositivo: "d-luna" });

    const lapidas = leerBorrados();
    afirmar(lapidas.length === 1, "quedó una lápida");
    const l = lapidas[0] || {};
    afirmar((l.que || "").indexOf("Repollo") >= 0 && (l.que || "").indexOf("179400") >= 0,
            "dice qué se borró: " + (l.que || "(nada)"));
    afirmar(l.quien === "luna", "y quién lo borró: " + (l.quien || "(nadie)"));
    afirmar(!filasDe("egresos").length, "el egreso se fue de la planilla");

    // Y no se pierde en la sincronización siguiente, que es cuando importa.
    sincronizar({}, { persona: "meli", dispositivo: "d-meli" });
    const otra = leerBorrados()[0] || {};
    afirmar(otra.quien === "luna", "sigue diciendo luna, no la última que sincronizó");
  }

  async function casoRestaurarEgresos() {
    caso("Devolver los cuatro egresos borrados sin querer");
    limpiarPlanilla();
    // Como quedó la planilla: sin las filas y con las lápidas puestas.
    const borrados = {};
    EGRESOS_A_DEVOLVER.forEach((e) => { borrados[e.id] = { id: e.id, mod: 9000 }; });
    escribirBorrados(borrados);

    restaurarEgresosBorradosAhora();

    const egresos = filasDe("egresos");
    afirmar(egresos.length === 4, "volvieron los cuatro: " + egresos.length);
    const total = egresos.reduce((n, e) => n + e.monto, 0);
    afirmar(total === 236600, "y con su plata: $" + total);
    afirmar(!leerBorrados().length,
            "las lápidas se levantaron (si no, se borran de nuevo)");

    // Lo que importa de verdad: que la próxima sincronización no se los lleve.
    sincronizar({}, { persona: "luna" });
    afirmar(filasDe("egresos").length === 4, "y siguen ahí después de sincronizar");

    restaurarEgresosBorradosAhora();
    afirmar(filasDe("egresos").length === 4, "correrla dos veces no los duplica");
  }

  async function casoRefecharVentasViejas() {
    caso("La venta de verdu vuelve al 21 de agosto y deja de mover stock");
    limpiarPlanilla();
    const venta = "1c5b435d-681d-4d21-8d39-9e6f2cb50df4";
    enLaPlanilla("ingresos", [{ id: "i1", venta: venta, fecha: "2026-09-07",
      cliente: "verdu richard bari", lista: "mayorista", medio_pago: "Efectivo",
      pagado: true, cod: "CRT650", cantidad: 5, precio: 10200, subtotal: 51000,
      obs: "", mod: 1000 }]);
    enLaPlanilla("movimientos", [{ id: "m1", fecha: "2026-09-07", tipo: "venta",
      cod: "CRT650", cantidad: 5, desde: "DEPOSITO", hacia: "VENDIDO",
      ref: venta, obs: "verdu richard bari", mod: 1000 }]);

    refecharVentasViejasAhora();

    const i = filasDe("ingresos")[0] || {};
    afirmar(i.fecha === "2026-08-21", "la venta quedó en 21/08: " + i.fecha);
    afirmar(i.subtotal === 51000, "la plata no se tocó: $" + i.subtotal);
    afirmar(!filasDe("movimientos").length, "el movimiento de mercadería se fue");
    afirmar(leerBorrados().length === 1, "y quedó su lápida, para los teléfonos");

    refecharVentasViejasAhora();
    afirmar(filasDe("ingresos").length === 1, "correrla dos veces no rompe nada");
  }

  // ---------- la planilla pierde las fechas y el teléfono no se deja ----------
  //
  // Esto ya pasó dos veces: la columna de fechas de «ingresos» aparece vacía en
  // la planilla. Qué la vacía sigue sin saberse —no lo hace el código: el banco
  // corre el ida y vuelta entero sin perder una fecha, y las otras hojas nunca
  // se tocaron—. Pero lo que convertía un estropicio en una pérdida definitiva
  // sí se puede arreglar, y es esto:
  //
  //   1. el teléfono solo manda lo que cambió de su lado, y esas filas no
  //      cambiaron, así que no las manda;
  //   2. recibe la lista del servicio, que viene sin fechas;
  //   3. borra su copia y escribe esa encima.
  //
  // O sea que la única copia buena que quedaba se borraba sola, en silencio, en
  // la primera sincronización después del estropicio.

  async function casoLaFechaVuelveDelTelefono() {
    caso("Si la planilla pierde una fecha, el teléfono se la devuelve");
    limpiarPlanilla();
    await limpiarTelefono();
    enLaPlanilla("ingresos", [
      { id: "i1", venta: "v1", fecha: "2026-08-21", cliente: "amarantus", lista: "mayorista",
        medio_pago: "Efectivo", pagado: true, cod: "CRT650", cantidad: 2, precio: 10200,
        subtotal: 20400, obs: "", mod: 1000 },
    ]);
    await window.Sincro.sincronizar(true);
    afirmar(((await localTodos("ingresos"))[0] || {}).fecha === "2026-08-21",
            "la venta baja al teléfono con su fecha");

    // El estropicio: alguien vacía la celda en la planilla. El «mod» no cambia,
    // porque nadie editó la fila desde la app.
    hoja("ingresos").filas[1][2] = "";
    afirmar(!filasDe("ingresos")[0].fecha, "la planilla quedó sin la fecha");

    await window.Sincro.sincronizar(true);
    afirmar(((await localTodos("ingresos"))[0] || {}).fecha === "2026-08-21",
            "el teléfono NO se deja pisar: "
            + (((await localTodos("ingresos"))[0] || {}).fecha || "la perdió"));

    // Y en la vuelta siguiente se la devuelve a la planilla.
    await window.Sincro.sincronizar(true);
    afirmar(filasDe("ingresos")[0].fecha === "2026-08-21",
            "y la planilla la recupera sola: "
            + (filasDe("ingresos")[0].fecha || "sigue vacía"));
  }

  async function casoEmpateDeFechas() {
    caso("En un empate, la fecha escrita le gana a la vacía");
    limpiarPlanilla();
    await limpiarTelefono();
    // Las dos partes con el mismo mod: una con fecha, la otra sin.
    enLaPlanilla("ingresos", [
      { id: "i2", venta: "v2", fecha: "", cliente: "lahuan", lista: "mayorista",
        medio_pago: "Efectivo", pagado: true, cod: "KIM350", cantidad: 1, precio: 6800,
        subtotal: 6800, obs: "", mod: 5000 },
    ]);
    sincronizar({ ingresos: [
      { id: "i2", venta: "v2", fecha: "2026-09-15", cliente: "lahuan", lista: "mayorista",
        medio_pago: "Efectivo", pagado: true, cod: "KIM350", cantidad: 1, precio: 6800,
        subtotal: 6800, obs: "", mod: 5000 },
    ] }, { persona: "luna" });
    afirmar(filasDe("ingresos")[0].fecha === "2026-09-15",
            "gana la que tiene fecha, aunque empaten: "
            + (filasDe("ingresos")[0].fecha || "ninguna"));
  }

  // ---------- las formas en que se puede escribir una fecha ----------
  //
  // Cada forma que fechaIso() no entiende es una fecha que se pierde, porque lo
  // que vuelve vacío se escribe vacío. Y las dos que faltaban aparecen solas
  // apenas alguien escribe una fecha a mano en la planilla.

  async function casoFormasDeFecha() {
    caso("Una fecha escrita de cualquier manera se entiende igual");
    afirmar(fechaIso("21/08/2026") === "2026-08-21", "21/08/2026");
    afirmar(fechaIso("2026-08-21") === "2026-08-21", "2026-08-21");
    afirmar(fechaIso("21.08.2026") === "2026-08-21", "21.08.2026");
    afirmar(fechaIso(new Date(2026, 7, 21)) === "2026-08-21", "un Date de verdad");

    // Las dos que faltaban:
    afirmar(fechaIso("21/8/26") === "2026-08-21",
            "el año de dos cifras, que es como se tipea a las apuradas: "
            + fechaIso("21/8/26"));
    // 46255 es el 21/08/2026 en el número de serie de la planilla.
    afirmar(fechaIso(46255) === "2026-08-21",
            "el número de serie, que es lo que devuelve la celda si le cambiaron "
            + "el formato: " + fechaIso(46255));
    afirmar(fechaIso("46255") === "2026-08-21", "y el mismo número como texto");

    afirmar(fechaIso("") === "", "lo vacío sigue vacío");
    afirmar(fechaIso("cualquier cosa") === "", "lo que no es fecha sigue sin serlo");
    afirmar(fechaIso(12) === "" && fechaIso(9800) === "",
            "y una cantidad o un precio no se toman por fecha");
  }

  async function casoNoSeBorraLoQueNoSeEntiende() {
    caso("Una fecha ilegible se deja a la vista, no se borra");
    limpiarPlanilla();
    enLaPlanilla("ingresos", [
      { id: "x1", venta: "vX", fecha: "2026-08-21", cliente: "amarantus",
        lista: "mayorista", medio_pago: "Efectivo", pagado: true, cod: "CRT650",
        cantidad: 1, precio: 10200, subtotal: 10200, obs: "", mod: 1 },
    ]);
    // Alguien escribe algo en la celda que no es una fecha reconocible.
    hoja("ingresos").filas[1][2] = "el martes";
    sincronizar({}, { persona: "luna" });
    afirmar(hoja("ingresos").filas[1][2] === "el martes",
            "sigue ahí para que alguien lo vea y lo corrija: "
            + JSON.stringify(hoja("ingresos").filas[1][2]));
  }

  // ---------- qué copias de respaldo se tiran ----------
  //
  // Es lo único de todo el respaldo que no tiene vuelta atrás, así que la
  // decisión está separada del Drive justamente para poder probarla acá.

  async function casoQueRespaldosSeTiran() {
    caso("Se guardan los últimos días, y la primera copia de cada mes");
    const dia = (d) => "Cocina Viva " + d;
    // Dos meses y medio de copias, una por día.
    const todas = [];
    for (let m = 8; m <= 10; m++) {
      for (let d = 1; d <= 28; d++) {
        todas.push(dia("2026-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0")));
      }
    }
    const tirar = cualesTirar(todas, 30);
    const quedan = todas.filter((n) => tirar.indexOf(n) < 0).sort().reverse();

    afirmar(quedan.indexOf(dia("2026-10-28")) >= 0, "queda la de hoy");
    afirmar(quedan.length === 32,
            "quedan las 30 últimas más un ancla por mes viejo: " + quedan.length);
    afirmar(quedan.indexOf(dia("2026-08-01")) >= 0,
            "y la primera de agosto NO se tira, aunque tenga dos meses");
    afirmar(quedan.indexOf(dia("2026-08-15")) < 0, "pero el resto de agosto sí");
    afirmar(tirar.indexOf(dia("2026-10-28")) < 0, "nunca se tira una reciente");

    // Con pocas copias no se tira nada.
    afirmar(cualesTirar([dia("2026-10-01"), dia("2026-10-02")], 30).length === 0,
            "con menos copias que el tope no se tira ninguna");
    afirmar(cualesTirar([], 30).length === 0, "y sin copias tampoco se rompe");
  }

  // ---------- que la versión y el caché vayan juntos ----------
  //
  // La app avisa «hay una versión nueva» comparándole al servidor el VERSION de
  // app.js contra el que está corriendo. Y el service worker decide qué
  // archivos rebajar por el nombre de su CACHE. Son dos números distintos para
  // una sola cosa, y ya pasó lo obvio: seis publicaciones seguidas subiendo el
  // CACHE y olvidando el VERSION. La app se actualizaba en silencio, el cartel
  // no aparecía nunca, y del otro lado no había forma de saber si la versión
  // que se estaba usando era la nueva o la vieja.

  // El banco le pisa el fetch a la página, así que para leer archivos de verdad
  // hay que ir por el camino viejo.
  function leerArchivo(ruta) {
    return new Promise((listo) => {
      const p = new XMLHttpRequest();
      p.open("GET", ruta, true);
      p.onload = () => listo(p.status >= 200 && p.status < 300 ? p.responseText : "");
      p.onerror = () => listo("");
      p.send();
    });
  }

  async function casoLasDosApi() {
    caso("La API del servicio y la de la app son la misma");
    // Si se separan, la app se niega a sincronizar hasta que coincidan —y está
    // bien que lo haga, porque una de las dos no conoce alguna columna—. Pero
    // olvidarse de subir una de las dos deja a las dos chicas sin sincronizar
    // sin que nadie entienda por qué. Ya pasó al agregar «cobrado».
    const dice = sincronizar({}, { persona: "banco" });
    afirmar(dice.api === window.Sincro.API,
            "el servicio dice " + dice.api + " y la app espera " + window.Sincro.API);
  }

  async function casoLaVersionYElCache() {
    caso("La versión de la app y la del caché son la misma");
    const app = await leerArchivo("../docs/js/app.js");
    const sw = await leerArchivo("../docs/sw.js");
    afirmar(!!app && !!sw, "se pudieron leer app.js y sw.js");
    if (!app || !sw) return;

    const enApp = (app.match(/const VERSION = "([\d.]+)/) || [])[1];
    const enCache = (sw.match(/const CACHE = "cocinaviva-v([\d.]+)"/) || [])[1];
    afirmar(!!enApp, "app.js dice su versión: " + (enApp || "NO SE ENCONTRÓ"));
    afirmar(!!enCache, "sw.js dice la del caché: " + (enCache || "NO SE ENCONTRÓ"));
    afirmar(enApp === enCache,
            "y son la misma —si no, el cartel de versión nueva no aparece nunca—: "
            + enApp + " vs " + enCache);
  }

  // ---------- correr ----------

  async function correr() {
    salida.innerHTML = "";
    const casos = [
      casoClienteBorrado, casoClienteRehecho, casoVentaBorradaEnPleneVuelo,
      casoCargaEnPlenoVuelo, casoProductoBorrado, casoBorradoDesdeElOtroTelefono,
      casoFechasVaciadas, casoFechaDelHermano, casoElTelefonoNoPisaLaFecha,
      casoRestaurarFechas, casoPagadoSiONo,
      casoLaLapidaCuenta, casoRestaurarEgresos, casoRefecharVentasViejas,
      casoLaFechaVuelveDelTelefono, casoEmpateDeFechas,
      casoFormasDeFecha, casoNoSeBorraLoQueNoSeEntiende,
      casoQueRespaldosSeTiran, casoLasDosApi, casoLaVersionYElCache,
    ];
    for (const c of casos) {
      try { await c(); }
      catch (err) { fallados++; linea("   MAL  se rompió: " + (err && err.message), "mal"); }
    }
    linea("\n" + (fallados ? "✗ " + fallados + " afirmaciones fallaron" : "✓ todo bien"),
          fallados ? "mal" : "ok");
    window.__fallados = fallados;
    window.__listo = true;
  }

  // Cada vuelta corre dos veces: hay bugs que dependen de en qué estado quedó
  // la vuelta anterior, y esos son justamente los que aparecen a veces sí y a
  // veces no.
  correr();
})();
