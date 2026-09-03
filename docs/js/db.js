// ==========================================================================
// Cocina Viva — base de datos local (IndexedDB)
//
// Todo lo que se carga se guarda primero acá, en el teléfono. Así se puede
// anotar una venta parada en el mostrador del local, sin señal. Después, al
// sincronizar, lo pendiente sube a la planilla y baja el estado completo.
//
// El teléfono guarda una copia entera de los datos, no solo lo suyo: es lo
// que permite ver el stock y los resúmenes sin conexión. Con el volumen de
// este emprendimiento (unos pocos miles de filas al año) entra de sobra.
//
// CÓMO SE SABE QUÉ FALTA SUBIR
// Cada registro lleva "mod", el momento en que se tocó por última vez. En
// "meta" se guarda cuándo fue la última sincronización buena. Lo pendiente es
// todo lo que tenga mod mayor que eso. Si la sincronización se corta por la
// mitad, la marca no se mueve y en el próximo intento se manda de nuevo: como
// cada registro viaja con su id, reenviarlo lo reemplaza en vez de duplicarlo.
// ==========================================================================

window.CVDB = (function () {
  const NOMBRE = "cocinaviva";
  const VERSION = 1;

  // Los almacenes que se sincronizan, con cuál es su clave. Para agregar uno
  // más adelante: sumarlo acá y subir VERSION en uno.
  const SINCRONIZABLES = {
    ingresos:    "id",
    egresos:     "id",
    movimientos: "id",
    productos:   "cod",
    clientes:    "nombre",
  };

  const ESQUEMA = Object.assign({}, SINCRONIZABLES, {
    borrados: "id",       // las bajas, para propagarlas a los otros teléfonos
    meta:     "clave",    // marca de última sincronización, listas, etc.
  });

  let conexion = null;

  function abrir() {
    if (conexion) return Promise.resolve(conexion);

    return new Promise((resolver, rechazar) => {
      const pedido = indexedDB.open(NOMBRE, VERSION);

      pedido.onupgradeneeded = (evento) => {
        const db = evento.target.result;
        for (const [nombre, clave] of Object.entries(ESQUEMA)) {
          if (!db.objectStoreNames.contains(nombre)) {
            db.createObjectStore(nombre, { keyPath: clave });
          }
        }
      };

      pedido.onsuccess = () => {
        conexion = pedido.result;

        // La conexión se guarda para no reabrirla en cada consulta, pero el
        // navegador puede cerrarla por su cuenta: otra pestaña que abra una
        // versión nueva, o el sistema liberando memoria. Si eso pasa y
        // seguimos usando la guardada, todo falla con «the database connection
        // is closing» y la app queda muerta hasta recargarla. Se suelta la
        // referencia y la próxima consulta abre una nueva.
        conexion.onversionchange = () => { conexion.close(); conexion = null; };
        conexion.onclose = () => { conexion = null; };

        resolver(conexion);
      };
      pedido.onerror = () => rechazar(pedido.error);
      pedido.onblocked = () => rechazar(
        new Error("Hay otra pestaña de la app abierta con una versión distinta."));
    });
  }

  // Envuelve una operación y espera a que la transacción termine de verdad, no
  // solo a que el pedido responda.
  //
  // Si al abrir la transacción resulta que la conexión ya estaba cerrada,
  // reintenta una vez con una conexión nueva. El aviso de cierre no siempre
  // llega antes de que se use: entre que el navegador la cierra y que dispara
  // onclose puede haber una consulta en el medio, y esa no tiene por qué
  // perderse.
  function operar(almacenes, modo, hacer, reintento) {
    return abrir().then((db) => new Promise((resolver, rechazar) => {
      let tx;
      try {
        tx = db.transaction(almacenes, modo);
      } catch (err) {
        conexion = null;
        if (reintento) { rechazar(err); return; }
        operar(almacenes, modo, hacer, true).then(resolver, rechazar);
        return;
      }
      const pedido = hacer(Array.isArray(almacenes)
        ? Object.fromEntries(almacenes.map((n) => [n, tx.objectStore(n)]))
        : tx.objectStore(almacenes));
      let resultado;
      if (pedido && pedido.onsuccess !== undefined) {
        pedido.onsuccess = () => { resultado = pedido.result; };
      }
      tx.oncomplete = () => resolver(resultado);
      tx.onabort = tx.onerror = () => rechazar(tx.error);
    }));
  }

  const todos = (almacen) =>
    operar(almacen, "readonly", (a) => a.getAll()).then((r) => r || []);

  const obtener = (almacen, clave) =>
    operar(almacen, "readonly", (a) => a.get(clave));

  // ---------- Guardar y borrar ----------

  // Sella el registro con el momento actual. Ese sello es lo que decide quién
  // gana si el mismo registro se tocó en dos teléfonos: gana el más reciente.
  function guardar(almacen, registro) {
    const fila = Object.assign({}, registro, { mod: Date.now() });
    return operar(almacen, "readwrite", (a) => a.put(fila)).then(() => fila);
  }

  // Varios de una, con un solo sello y una sola transacción: una venta de seis
  // productos son seis filas que tienen que entrar o no entrar juntas.
  function guardarVarios(almacen, registros) {
    const ahora = Date.now();
    const filas = registros.map((r, i) => Object.assign({}, r, { mod: ahora + i }));
    return operar(almacen, "readwrite", (a) => {
      filas.forEach((f) => a.put(f));
      return null;
    }).then(() => filas);
  }

  // Borrar deja una lápida en "borrados". Sin eso, el registro volvería a
  // aparecer en la próxima sincronización: el servicio no tendría cómo saber
  // que se fue a propósito y no que este teléfono todavía no lo conocía.
  function borrar(almacen, clave) {
    return operar([almacen, "borrados"], "readwrite", (a) => {
      a[almacen].delete(clave);
      a.borrados.put({ id: clave, mod: Date.now() });
      return null;
    });
  }

  // ---------- Sincronización ----------

  const META_SINCRO = "ultima_sincro";

  const ultimaSincro = () =>
    obtener("meta", META_SINCRO).then((m) => (m && m.valor) || 0);

  const marcarSincro = (cuando) =>
    operar("meta", "readwrite", (a) => a.put({ clave: META_SINCRO, valor: cuando }));

  // Lo que este teléfono cambió y la planilla todavía no vio.
  //
  // El CORTE se toma antes de leer nada y viaja con el sobre. Todo lo que se
  // cargue o se borre mientras el pedido está en el aire queda por encima del
  // corte: no entra en este sobre y sigue pendiente para la vuelta que viene.
  // Sin ese corte, la marca terminaba tapando cambios que nunca se subieron.
  async function pendientes() {
    const desde = await ultimaSincro();
    const corte = Date.now();
    const enLaVentana = (r) => (r.mod || 0) > desde && (r.mod || 0) <= corte;
    const sobre = { borrados: [] };
    let cuantos = 0;

    for (const nombre of Object.keys(SINCRONIZABLES)) {
      const nuevos = (await todos(nombre)).filter(enLaVentana);
      sobre[nombre] = nuevos;
      cuantos += nuevos.length;
    }
    sobre.borrados = (await todos("borrados")).filter(enLaVentana);
    cuantos += sobre.borrados.length;

    return { sobre, cuantos, corte };
  }

  const cuantosPendientes = () => pendientes().then((p) => p.cuantos);

  // Reemplaza la copia local por la que devolvió el servicio. Se hace almacén
  // por almacén y en una sola transacción cada uno: si algo falla en el medio,
  // no queda media lista.
  function reemplazar(almacen, lista) {
    return operar(almacen, "readwrite", (a) => {
      a.clear();
      (lista || []).forEach((r) => a.put(r));
      return null;
    });
  }

  // Guarda lo que contestó el servicio, RESPETANDO lo que se tocó mientras el
  // pedido viajaba.
  //
  // Acá estuvo el bug de las bajas que volvían solas. La respuesta del servicio
  // es una foto del estado en el momento en que se armó el pedido: no sabe nada
  // de lo que pasó después. Si se la copia tal cual encima de todo, una venta
  // borrada en ese rato vuelve a aparecer, y una venta cargada en ese rato
  // desaparece sin dejar rastro. Por eso lo posterior al corte se aparta antes
  // de pisar los almacenes y se vuelve a aplicar encima.
  async function guardarEstado(estado, corte) {
    const tope = corte || Date.now();

    const posteriores = {};
    for (const nombre of Object.keys(SINCRONIZABLES)) {
      posteriores[nombre] = (await todos(nombre)).filter((r) => (r.mod || 0) > tope);
    }
    const bajasPosteriores = (await todos("borrados")).filter((r) => (r.mod || 0) > tope);

    for (const nombre of Object.keys(SINCRONIZABLES)) {
      if (!estado[nombre]) continue;
      await operar(nombre, "readwrite", (a) => {
        a.clear();
        estado[nombre].forEach((r) => a.put(r));
        // Primero se van los borrados de último momento y después vuelve lo
        // cargado de último momento: si algo se borró y se volvió a cargar en
        // ese rato, tiene que quedar cargado.
        bajasPosteriores.forEach((b) => a.delete(b.id));
        posteriores[nombre].forEach((r) => a.put(r));
        return null;
      });
    }
    if (estado.borrados) {
      await operar("borrados", "readwrite", (a) => {
        a.clear();
        estado.borrados.forEach((r) => a.put(r));
        bajasPosteriores.forEach((r) => a.put(r));
        return null;
      });
    }
    if (estado.listas) {
      await operar("meta", "readwrite", (a) => a.put({ clave: "listas", valor: estado.listas }));
    }

    // La marca es el corte con el que se armó el pedido, NO la hora de la
    // respuesta. Poniendo la hora de la respuesta, todo lo que pasó durante el
    // viaje quedaba por detrás de la marca y no se subía nunca más.
    await marcarSincro(tope);
  }

  const listas = () => obtener("meta", "listas").then((m) => (m && m.valor) || null);

  // Nota: la app NO trae ningún catálogo de arranque. El de productos y
  // clientes baja en la primera sincronización, que siempre ocurre apenas se
  // activa el teléfono —activar necesita señal—, así que nunca hay un momento
  // útil en que hiciera falta. Además el repositorio es público y la lista de
  // locales del emprendimiento no tiene por qué estar ahí.

  return {
    abrir, todos, obtener, guardar, guardarVarios, borrar,
    pendientes, cuantosPendientes, guardarEstado, ultimaSincro, listas,
  };
})();
