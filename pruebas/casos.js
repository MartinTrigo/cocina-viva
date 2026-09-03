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

  // ---------- correr ----------

  async function correr() {
    salida.innerHTML = "";
    const casos = [
      casoClienteBorrado, casoClienteRehecho, casoVentaBorradaEnPleneVuelo,
      casoCargaEnPlenoVuelo, casoProductoBorrado, casoBorradoDesdeElOtroTelefono,
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
