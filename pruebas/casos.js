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
    caso("La reparación de las fechas perdidas");
    limpiarPlanilla();
    enLaPlanilla("ingresos", [{ id: "viejo-001", venta: "vieja-001", fecha: "2026-09-07",
      cliente: "amarantus", lista: "mayorista", medio_pago: "Efectivo", pagado: true,
      cod: "CRT650", cantidad: 2, precio: 9800, subtotal: 19600, obs: "", mod: 1 }]);
    restaurarFechasDeIngresosAhora();
    afirmar(columnaFecha()[0] === "2026-07-10", "viejo-001 volvió al 10 de julio");

    let cuantos = 0;
    Object.keys(FECHAS_DE_INGRESOS).forEach((f) => {
      cuantos += FECHAS_DE_INGRESOS[f].split(" ").length;
    });
    afirmar(cuantos === 135, "la tabla de respaldo tiene los 135 renglones");
  }

  async function casoPagadoSiONo() {
    caso("«Pagado» se escribe como lo dice el desplegable");
    limpiarPlanilla();
    enLaPlanilla("ingresos", renglones("v5", "2026-08-14", 1));
    afirmar(hoja("ingresos").filas[1][6] === "sí",
            "dice «sí» y no TRUE: " + JSON.stringify(hoja("ingresos").filas[1][6]));
  }

  // ---------- correr ----------

  async function correr() {
    salida.innerHTML = "";
    const casos = [
      casoClienteBorrado, casoClienteRehecho, casoVentaBorradaEnPleneVuelo,
      casoCargaEnPlenoVuelo, casoProductoBorrado, casoBorradoDesdeElOtroTelefono,
      casoFechasVaciadas, casoFechaDelHermano, casoElTelefonoNoPisaLaFecha,
      casoRestaurarFechas, casoPagadoSiONo,
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
