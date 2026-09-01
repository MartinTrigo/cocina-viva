// ==========================================================================
// Cocina Viva — los datos y lo que se deduce de ellos
//
// Acá vive el modelo: el catálogo (productos, clientes, listas) y el cálculo
// del stock a partir del libro mayor de movimientos.
//
// EL STOCK NO SE GUARDA EN NINGÚN LADO. Se calcula.
//
// Cada movimiento dice una cantidad, de dónde salió y a dónde fue. El stock de
// una ubicación es todo lo que entró menos todo lo que salió. Por eso nunca
// puede haber un número guardado que no coincida con los movimientos: el
// número no existe hasta que se lo pide.
//
// Las ubicaciones son de dos clases:
//   · las reservadas, en mayúscula y sin acentos, que representan el afuera
//     (PRODUCCION, VENDIDO, MERMA) o el propio depósito;
//   · los locales, escritos como se llaman en la hoja de clientes ("humus",
//     "el gaita"), que son donde está la mercadería en consignación.
// ==========================================================================

window.Datos = (function () {
  const DEPOSITO = "DEPOSITO";
  const PRODUCCION = "PRODUCCION";
  const VENDIDO = "VENDIDO";
  const MERMA = "MERMA";
  const RESERVADAS = [DEPOSITO, PRODUCCION, VENDIDO, MERMA];

  // De dónde sale y a dónde va cada clase de movimiento. Tenerlo en una tabla
  // y no repartido en cada pantalla evita que dentro de un año una pantalla
  // nueva invente una combinación que no cuadra.
  //
  // "local" se reemplaza por el nombre del local cuando se arma el movimiento.
  const RECORRIDO = {
    produccion:  { desde: PRODUCCION, hacia: DEPOSITO },
    venta:       { desde: DEPOSITO,   hacia: VENDIDO },
    entrega:     { desde: DEPOSITO,   hacia: "local" },
    liquidacion: { desde: "local",    hacia: VENDIDO },
    devolucion:  { desde: "local",    hacia: DEPOSITO },
    merma:       { desde: DEPOSITO,   hacia: MERMA },
  };

  let cache = null;

  // Trae todo de IndexedDB a memoria. Se llama al entrar a cada pantalla; con
  // este volumen de datos es instantáneo y evita el problema clásico de tener
  // media app mirando una copia vieja.
  async function cargar() {
    const [productos, clientes, movimientos, ingresos, egresos, listas] = await Promise.all([
      window.CVDB.todos("productos"),
      window.CVDB.todos("clientes"),
      window.CVDB.todos("movimientos"),
      window.CVDB.todos("ingresos"),
      window.CVDB.todos("egresos"),
      window.CVDB.listas(),
    ]);

    cache = {
      productos: productos.sort((a, b) => a.cod.localeCompare(b.cod)),
      clientes: clientes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      movimientos, ingresos, egresos,
      listas: listas || { medios_pago: [], rubros: [] },
      porCod: Object.fromEntries(productos.map((p) => [p.cod, p])),
    };
    return cache;
  }

  const hay = () => !!cache;
  const todo = () => cache;

  const producto = (cod) => (cache && cache.porCod[String(cod || "").toUpperCase()]) || null;

  const productosActivos = () => (cache ? cache.productos.filter((p) => p.activo !== false) : []);
  const clientesActivos = () => (cache ? cache.clientes.filter((c) => c.activo !== false) : []);

  const localesDeConsignacion = () =>
    clientesActivos().filter((c) => c.tipo === "consignación");

  // Nombre para mostrar: "chucrut 660 g".
  function nombreDe(cod) {
    const p = producto(cod);
    if (!p) return String(cod || "");
    return p.presentacion ? p.producto + " " + window.Util.enBloque(p.presentacion) : p.producto;
  }

  const precioDe = (cod, lista) => {
    const p = producto(cod);
    if (!p) return 0;
    return lista === "minorista" ? Number(p.pminor) || 0 : Number(p.pmayor) || 0;
  };

  // ---------- Stock ----------

  // Cuánto hay de cada producto en una ubicación. Devuelve { COD: cantidad },
  // solo con lo que no está en cero.
  function stockEn(ubicacion) {
    const cuenta = {};
    if (!cache) return cuenta;
    const donde = String(ubicacion || "").trim();

    cache.movimientos.forEach((m) => {
      const n = Number(m.cantidad) || 0;
      if (!n || !m.cod) return;
      if (m.hacia === donde) cuenta[m.cod] = (cuenta[m.cod] || 0) + n;
      if (m.desde === donde) cuenta[m.cod] = (cuenta[m.cod] || 0) - n;
    });

    Object.keys(cuenta).forEach((cod) => { if (!cuenta[cod]) delete cuenta[cod]; });
    return cuenta;
  }

  const stockDeposito = () => stockEn(DEPOSITO);

  // Todas las ubicaciones que hoy tienen mercadería y no son reservadas: los
  // locales con productos en consignación. Sale de los movimientos, no de la
  // lista de clientes, para que un local al que se le dejó mercadería aparezca
  // aunque nadie lo haya marcado como "consignación" en la hoja de clientes.
  function localesConMercaderia() {
    if (!cache) return [];
    const vistos = {};
    cache.movimientos.forEach((m) => {
      [m.desde, m.hacia].forEach((u) => {
        const n = String(u || "").trim();
        if (n && RESERVADAS.indexOf(n) < 0) vistos[n] = true;
      });
    });
    return Object.keys(vistos).sort((a, b) => a.localeCompare(b, "es"));
  }

  // Cuánto vale un { COD: cantidad } a precio mayorista.
  function valorDe(cuenta, lista) {
    return Object.keys(cuenta).reduce(
      (total, cod) => total + cuenta[cod] * precioDe(cod, lista || "mayorista"), 0);
  }

  // Pasa un { COD: cantidad } a una lista ordenada y lista para mostrar.
  function renglonesDe(cuenta, lista) {
    return Object.keys(cuenta)
      .map((cod) => {
        const precio = precioDe(cod, lista || "mayorista");
        return {
          cod: cod,
          nombre: nombreDe(cod),
          cantidad: cuenta[cod],
          precio: precio,
          subtotal: cuenta[cod] * precio,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  // ---------- Armado de movimientos ----------

  // Arma la fila del libro mayor para una clase de movimiento. Que el "desde"
  // y el "hacia" salgan de la tabla RECORRIDO y no de cada pantalla es lo que
  // garantiza que el stock cierre.
  function movimiento(tipo, cod, cantidad, opciones) {
    const o = opciones || {};
    const r = RECORRIDO[tipo];
    if (!r) throw new Error("Tipo de movimiento desconocido: " + tipo);
    const local = String(o.local || "").trim();
    if ((r.desde === "local" || r.hacia === "local") && !local) {
      throw new Error("El movimiento «" + tipo + "» necesita saber de qué local se trata.");
    }
    return {
      id: o.id || window.Util.nuevoId(),
      fecha: o.fecha || window.Util.hoy(),
      tipo: tipo,
      cod: String(cod).toUpperCase(),
      cantidad: Number(cantidad) || 0,
      desde: r.desde === "local" ? local : r.desde,
      hacia: r.hacia === "local" ? local : r.hacia,
      ref: o.ref || "",
      obs: o.obs || "",
    };
  }

  // El ajuste es el único que no tiene un recorrido fijo: se usa para cuadrar
  // contra un conteo real, y puede sumar o restar en cualquier ubicación.
  function ajuste(cod, diferencia, ubicacion, opciones) {
    const o = opciones || {};
    const donde = String(ubicacion || DEPOSITO).trim();
    const n = Number(diferencia) || 0;
    return {
      id: o.id || window.Util.nuevoId(),
      fecha: o.fecha || window.Util.hoy(),
      tipo: "ajuste",
      cod: String(cod).toUpperCase(),
      cantidad: Math.abs(n),
      desde: n < 0 ? donde : "",
      hacia: n > 0 ? donde : "",
      ref: o.ref || "conteo",
      obs: o.obs || "",
    };
  }

  return {
    DEPOSITO, PRODUCCION, VENDIDO, MERMA, RESERVADAS,
    cargar, hay, todo,
    producto, productosActivos, clientesActivos, localesDeConsignacion,
    nombreDe, precioDe,
    stockEn, stockDeposito, localesConMercaderia, valorDe, renglonesDe,
    movimiento, ajuste,
  };
})();
