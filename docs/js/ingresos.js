// ==========================================================================
// Cocina Viva — Ingresos
//
// Una venta cobrada, con todos los productos que lleve. Al guardar pasan dos
// cosas a la vez, y por eso están en el mismo lugar:
//
//   · una fila por producto en la hoja "ingresos"  → la plata
//   · un movimiento de venta por producto          → la mercadería
//
// Las filas de una misma venta comparten el campo "venta", que es lo que
// permite volver a armarla después para el remito o para borrarla entera. En
// la planilla esa columna va oculta: para leer, lo que importa es la fila.
//
// ESTO NO ES UNA ENTREGA A CONSIGNACIÓN. Acá se cobra. Dejar mercadería en un
// local sin cobrar se carga en Consignación, que mueve el stock y no toca la
// plata. Si se elige un cliente que trabaja a consignación, la pantalla lo
// avisa pero no lo impide: a veces el mismo local también compra.
// ==========================================================================

window.Ingresos = (function () {
  const { esc, dinero, numero, aNumero, hoy, fecha, enBloque } = window.Util;

  let vista = null;
  let ir = null;

  // El borrador vive acá y no en el DOM: agregar o sacar un renglón vuelve a
  // dibujar el formulario, y lo que ya estaba escrito no se puede perder.
  let borrador = null;

  const vacio = () => ({
    fecha: hoy(),
    cliente: "",
    lista: "mayorista",
    medio_pago: "",
    obs: "",
    lineas: [{ cod: "", cantidad: "" }],
  });

  async function render(contenedor, ruta, navegar) {
    vista = contenedor;
    ir = navegar;

    const idVenta = ruta.split("/")[1] || "";
    if (idVenta) {
      const venta = buscarVenta(idVenta);
      if (!venta) { formulario(); return { titulo: "Ingresos", subtitulo: "Ventas cobradas" }; }
      detalle(venta);
      return { titulo: venta.cliente, subtitulo: "Venta del " + fecha(venta.fecha) };
    }

    if (!borrador) borrador = vacio();
    formulario();
    return { titulo: "Ingresos", subtitulo: "Ventas cobradas" };
  }

  // ---------- El formulario ----------

  function formulario(mensaje) {
    const d = window.Datos.todo();
    const productos = d.productos.filter((p) => p.activo !== false);
    const clientes = d.clientes.filter((c) => c.activo !== false);
    const medios = (d.listas.medios_pago || []);
    const cliente = clientes.find((c) => c.nombre === borrador.cliente);

    vista.innerHTML = `
      ${mensaje || ""}

      <div class="tarjeta">
        <div class="fila">
          <div class="campo">
            <label for="v-fecha">Fecha</label>
            <input type="date" id="v-fecha" value="${esc(borrador.fecha)}">
          </div>
          <div class="campo">
            <label for="v-medio">Medio de pago <span class="obliga">•</span></label>
            <select id="v-medio">
              <option value="">Elegí…</option>
              ${medios.map((m) => `<option value="${esc(m)}"${m === borrador.medio_pago ? " selected" : ""}>${esc(m)}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="campo">
          <label for="v-cliente">Cliente <span class="obliga">•</span></label>
          <select id="v-cliente">
            <option value="">Elegí un cliente…</option>
            ${clientes.map((c) => `
              <option value="${esc(c.nombre)}"${c.nombre === borrador.cliente ? " selected" : ""}>${esc(c.nombre)}${c.localidad ? " · " + esc(c.localidad) : ""}</option>`).join("")}
          </select>
        </div>

        ${cliente && cliente.tipo === "consignación" ? `
          <p class="aviso aviso--info">
            <strong>${esc(cliente.nombre)} trabaja a consignación.</strong>
            Si le estás <em>dejando</em> mercadería sin cobrar, cargala desde
            <strong>Consignación</strong>: acá se registra plata que ya entró.
          </p>` : ""}

        <div class="campo">
          <label>Lista de precios</label>
          <div class="opciones opciones--dos">
            ${[["mayorista", "🏪", "Mayorista"], ["minorista", "🧍", "Minorista"]].map(([v, i, t]) => `
              <label class="opcion${borrador.lista === v ? " elegida" : ""}">
                <input type="radio" name="lista" value="${v}"${borrador.lista === v ? " checked" : ""}>
                <span class="opcion__icono">${i}</span>
                <span class="opcion__texto">${t}</span>
              </label>`).join("")}
          </div>
        </div>
      </div>

      <div class="tarjeta">
        <h2>Productos</h2>
        <div id="v-lineas">
          ${borrador.lineas.map((l, i) => renglon(l, i, productos)).join("")}
        </div>
        <button class="boton boton--secundario boton--chico boton--ancho" id="btn-mas">+ Agregar producto</button>

        <div class="total" id="v-total"></div>
      </div>

      <div class="tarjeta">
        <div class="campo">
          <label for="v-obs">Observaciones</label>
          <textarea id="v-obs" placeholder="opcional">${esc(borrador.obs)}</textarea>
        </div>
        <p class="campo__error" id="v-error" hidden></p>
        <button class="boton boton--ancho" id="btn-guardar-remito">
          Guardar y generar remito
        </button>
        <button class="boton boton--secundario boton--ancho separado" id="btn-guardar">
          Guardar sin remito
        </button>
      </div>

      ${ultimasVentas()}`;

    enganchar(productos);
    recalcular();
  }

  function renglon(l, i, productos) {
    return `
      <div class="renglon-venta" data-i="${i}">
        <div class="renglon-venta__linea">
          <select class="v-cod" data-i="${i}" aria-label="Producto">
            <option value="">Elegí un producto…</option>
            ${productos.map((p) => `
              <option value="${esc(p.cod)}"${p.cod === l.cod ? " selected" : ""}>${esc(p.producto)}${p.presentacion ? " · " + esc(p.presentacion) : ""}</option>`).join("")}
          </select>
          <input type="text" class="v-cant numero" data-i="${i}" inputmode="numeric"
                 placeholder="0" value="${esc(l.cantidad)}" aria-label="Cantidad">
          <button class="quitar" data-quitar="${i}" aria-label="Quitar este producto">&#10005;</button>
        </div>
        <span class="renglon-venta__sub" id="v-sub-${i}" hidden></span>
        <p class="renglon-venta__aviso" id="v-aviso-${i}" hidden></p>
      </div>`;
  }

  // Recalcula subtotales y total sin volver a dibujar: mientras se tipea una
  // cantidad, redibujar el formulario haría perder el foco en cada tecla.
  function recalcular() {
    let total = 0;
    borrador.lineas.forEach((l, i) => {
      const precio = l.cod ? window.Datos.precioDe(l.cod, borrador.lista) : 0;
      const n = aNumero(l.cantidad);
      const sub = Number.isFinite(n) ? n * precio : 0;
      total += sub;

      const caja = document.getElementById("v-sub-" + i);
      if (caja) {
        const hayQueMostrar = !!(l.cod && Number.isFinite(n) && n);
        caja.textContent = hayQueMostrar ? dinero(sub) + " · " + dinero(precio) + " c/u" : "";
        caja.hidden = !hayQueMostrar;
      }

      // Aviso de stock: no impide vender, avisa. A veces la venta es real y lo
      // que está mal es el stock, y en ese caso lo que hay que corregir es el
      // stock, no la venta.
      const aviso = document.getElementById("v-aviso-" + i);
      if (aviso) {
        const hay = l.cod ? (window.Datos.stockDeposito()[l.cod] || 0) : 0;
        if (l.cod && Number.isFinite(n) && n > hay) {
          aviso.textContent = "En el depósito hay " + numero(hay) + ". El stock va a quedar en "
            + numero(hay - n) + ".";
          aviso.hidden = false;
        } else {
          aviso.hidden = true;
        }
      }
    });

    const caja = document.getElementById("v-total");
    if (caja) {
      caja.innerHTML = `<span class="total__que">Total a cobrar</span>
        <span class="total__cuanto">${dinero(total)}</span>`;
    }
    return total;
  }

  function leerDelFormulario() {
    borrador.fecha = document.getElementById("v-fecha").value || hoy();
    borrador.cliente = document.getElementById("v-cliente").value;
    borrador.medio_pago = document.getElementById("v-medio").value;
    borrador.obs = document.getElementById("v-obs").value.trim();
    const elegida = vista.querySelector('input[name="lista"]:checked');
    if (elegida) borrador.lista = elegida.value;
    vista.querySelectorAll(".v-cod").forEach((s) => { borrador.lineas[s.dataset.i].cod = s.value; });
    vista.querySelectorAll(".v-cant").forEach((c) => { borrador.lineas[c.dataset.i].cantidad = c.value; });
  }

  function enganchar(productos) {
    ["v-fecha", "v-cliente", "v-medio"].forEach((id) => {
      const e = document.getElementById(id);
      e.onchange = () => { leerDelFormulario(); formulario(); };
    });

    document.getElementById("v-obs").oninput = () => { borrador.obs = document.getElementById("v-obs").value; };

    vista.querySelectorAll('input[name="lista"]').forEach((r) => {
      r.onchange = () => {
        leerDelFormulario();
        vista.querySelectorAll(".opcion").forEach((o) => o.classList.toggle("elegida", o.contains(r) && r.checked));
        recalcular();
      };
    });

    vista.querySelectorAll(".v-cod").forEach((s) => {
      s.onchange = () => { borrador.lineas[s.dataset.i].cod = s.value; recalcular(); };
    });
    vista.querySelectorAll(".v-cant").forEach((c) => {
      c.oninput = () => { borrador.lineas[c.dataset.i].cantidad = c.value; recalcular(); };
    });

    vista.querySelectorAll("[data-quitar]").forEach((b) => {
      b.onclick = () => {
        leerDelFormulario();
        const i = Number(b.dataset.quitar);
        borrador.lineas.splice(i, 1);
        if (!borrador.lineas.length) borrador.lineas.push({ cod: "", cantidad: "" });
        formulario();
      };
    });

    document.getElementById("btn-mas").onclick = () => {
      leerDelFormulario();
      borrador.lineas.push({ cod: "", cantidad: "" });
      formulario();
      // El producto recién agregado queda enfocado: si no, hay que ir a
      // buscarlo con el dedo cada vez.
      const ultimos = vista.querySelectorAll(".v-cod");
      if (ultimos.length) ultimos[ultimos.length - 1].focus();
    };

    document.getElementById("btn-guardar").onclick = () => guardar(false);
    document.getElementById("btn-guardar-remito").onclick = () => guardar(true);

    // Los renglones de las últimas ventas son <li> con role="button": el
    // teclado los enfoca pero, sin esto, Enter no hace nada.
    vista.querySelectorAll("[data-ir]").forEach((b) => {
      b.onclick = () => ir(b.dataset.ir);
      b.onkeydown = (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ir(b.dataset.ir); }
      };
    });
  }

  // ---------- Guardar ----------

  async function guardar(conRemito) {
    leerDelFormulario();

    const mal = (texto) => {
      const e = document.getElementById("v-error");
      e.textContent = texto;
      e.hidden = false;
      e.scrollIntoView({ block: "center" });
    };
    document.getElementById("v-error").hidden = true;

    if (!borrador.cliente) return mal("Elegí el cliente.");
    if (!borrador.medio_pago) return mal("Elegí el medio de pago.");

    const lineas = [];
    for (const l of borrador.lineas) {
      if (!l.cod && !String(l.cantidad).trim()) continue;      // renglón vacío: se ignora
      if (!l.cod) return mal("Hay un renglón con cantidad pero sin producto.");
      const n = aNumero(l.cantidad);
      if (!Number.isFinite(n) || n <= 0) {
        return mal("La cantidad de " + window.Datos.nombreDe(l.cod) + " tiene que ser mayor que cero.");
      }
      lineas.push({ cod: l.cod, cantidad: n });
    }
    if (!lineas.length) return mal("Agregá al menos un producto.");

    // Dos renglones del mismo producto se juntan en uno: en la planilla, dos
    // filas iguales de la misma venta parecen un error de carga.
    const juntadas = [];
    lineas.forEach((l) => {
      const previa = juntadas.find((j) => j.cod === l.cod);
      if (previa) previa.cantidad += l.cantidad;
      else juntadas.push(Object.assign({}, l));
    });

    const idVenta = window.Util.nuevoId();
    const filas = [];
    const movimientos = [];

    juntadas.forEach((l) => {
      const precio = window.Datos.precioDe(l.cod, borrador.lista);
      filas.push({
        id: window.Util.nuevoId(),
        venta: idVenta,
        fecha: borrador.fecha,
        cliente: borrador.cliente,
        lista: borrador.lista,
        medio_pago: borrador.medio_pago,
        cod: l.cod,
        cantidad: l.cantidad,
        precio: precio,
        subtotal: l.cantidad * precio,
        obs: borrador.obs,
      });
      movimientos.push(window.Datos.movimiento("venta", l.cod, l.cantidad, {
        fecha: borrador.fecha,
        ref: idVenta,
        obs: borrador.cliente,
      }));
    });

    await window.CVDB.guardarVarios("ingresos", filas);
    await window.CVDB.guardarVarios("movimientos", movimientos);
    await window.Datos.cargar();
    window.Sincro.sincronizar(true);

    const total = filas.reduce((n, f) => n + f.subtotal, 0);
    const cliente = borrador.cliente;
    borrador = vacio();

    if (conRemito) {
      ir("ingresos/" + idVenta);
      // La pantalla de detalle se dibuja sola por el cambio de ruta; el remito
      // se pide desde ahí, con un toque, para poder mirarlo antes de mandarlo.
      return;
    }

    formulario(`<p class="aviso aviso--ok">Venta guardada:
      ${esc(cliente)}, ${dinero(total)} en ${filas.length}
      producto${filas.length === 1 ? "" : "s"}.</p>`);
  }

  // ---------- Últimas ventas ----------

  // Junta las filas de "ingresos" por su campo "venta". Cada venta vuelve a ser
  // una sola cosa con sus renglones adentro, que es como se cargó.
  function ventasArmadas() {
    const porId = {};
    (window.Datos.todo().ingresos || []).forEach((f) => {
      const id = f.venta || f.id;
      if (!porId[id]) {
        porId[id] = {
          id: id, fecha: f.fecha, cliente: f.cliente, lista: f.lista,
          medio_pago: f.medio_pago, obs: f.obs, mod: f.mod || 0, lineas: [], total: 0,
        };
      }
      const v = porId[id];
      v.lineas.push(f);
      v.total += Number(f.subtotal) || 0;
      if ((f.mod || 0) > v.mod) v.mod = f.mod || 0;
    });
    return Object.keys(porId).map((id) => porId[id])
      .sort((a, b) => (a.fecha === b.fecha ? b.mod - a.mod : (a.fecha < b.fecha ? 1 : -1)));
  }

  const buscarVenta = (id) => ventasArmadas().find((v) => v.id === id) || null;

  // Los movimientos de mercadería de esta venta. Se encuentran por su columna
  // "referencia", que guarda el id de la venta.
  const movimientosDe = (v) =>
    (window.Datos.todo().movimientos || []).filter((m) => m.ref === v.id);

  // Una liquidación de consignación entra por la misma puerta que una venta
  // —es plata que entró— pero la mercadería no salió del depósito: salió del
  // local. Al borrarla, vuelve ahí. Decir "vuelven al depósito" sería mentir, y
  // justo sobre el punto que esta app vino a separar.
  function deDondeSalio(v) {
    const lugares = [...new Set(movimientosDe(v).map((m) => m.desde).filter(Boolean))];

    // Una fila escrita a mano en la planilla no tiene movimiento de mercadería:
    // registró la plata y nada más. Al borrarla no vuelve stock a ningún lado,
    // y decir que sí sería inventar.
    if (!lugares.length) return { esLiquidacion: false, sinStock: true, texto: "" };

    const esLiquidacion = lugares.some((l) => window.Datos.RESERVADAS.indexOf(l) < 0);
    return {
      esLiquidacion: esLiquidacion,
      sinStock: false,
      texto: esLiquidacion ? "a " + lugares.join(" y ") : "al depósito",
    };
  }

  function ultimasVentas() {
    const ventas = ventasArmadas().slice(0, 8);
    if (!ventas.length) return "";

    return `
      <h2 class="separado">Últimas ventas</h2>
      <ul class="renglones">
        ${ventas.map((v) => `
          <li class="renglon renglon--entra" data-ir="ingresos/${esc(v.id)}" role="button" tabindex="0">
            <span class="renglon__texto">
              <span class="renglon__que">${esc(v.cliente)}</span>
              <span class="renglon__detalle">${fecha(v.fecha)} · ${v.lineas.length}
                producto${v.lineas.length === 1 ? "" : "s"} · ${esc(v.medio_pago)}${
                  deDondeSalio(v).esLiquidacion ? " · liquidación" : ""}</span>
            </span>
            <span class="renglon__cuanto">${dinero(v.total)}</span>
          </li>`).join("")}
      </ul>`;
  }

  // ---------- Detalle de una venta ----------

  function detalle(v) {
    const salio = deDondeSalio(v);
    const unidades = v.lineas.reduce((n, l) => n + l.cantidad, 0);

    vista.innerHTML = `
      <div class="cifras">
        <div class="cifra cifra--entra">
          <span class="cifra__que">Total cobrado</span>
          <span class="cifra__cuanto">${dinero(v.total)}</span>
        </div>
        <div class="cifra cifra--saldo">
          <span class="cifra__que">${esc(v.medio_pago)}</span>
          <span class="cifra__cuanto">${numero(unidades)} u.</span>
        </div>
      </div>

      <div class="tabla-envoltorio">
        <table class="tabla">
          <thead>
            <tr><th>Producto</th><th class="numero">Cant.</th><th class="numero">Precio</th><th class="numero">Subtotal</th></tr>
          </thead>
          <tbody>
            ${v.lineas.map((l) => `
              <tr>
                <td>
                  <span class="celda__que">${esc(window.Datos.nombreDe(l.cod))}</span>
                  <span class="celda__detalle">${esc(l.cod)}</span>
                </td>
                <td class="numero">${numero(l.cantidad)}</td>
                <td class="numero">${dinero(l.precio)}</td>
                <td class="numero">${dinero(l.subtotal)}</td>
              </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr><td>Total</td><td></td><td></td><td class="numero">${dinero(v.total)}</td></tr>
          </tfoot>
        </table>
      </div>

      ${v.obs ? `<p class="aviso aviso--info">${esc(v.obs)}</p>` : ""}

      <p class="nota">${salio.esLiquidacion
        ? "Liquidación de consignación · lo que vendió y pagó " + esc(v.cliente)
        : "Lista " + esc(v.lista)} · ${fecha(v.fecha)}</p>

      <button class="boton boton--ancho separado" id="btn-remito">Generar remito</button>
      <div id="v-remito"></div>

      <div class="tarjeta separado">
        <h2>Borrar esta ${salio.esLiquidacion ? "liquidación" : "venta"}</h2>
        <p class="nota">Se ${v.lineas.length === 1 ? "va la fila" : "van las " + v.lineas.length + " filas"}
           de la planilla${salio.sinStock
             ? ". Esta venta no tiene movimiento de mercadería asociado —seguramente se cargó a mano en la planilla—, así que el stock no cambia."
             : ` y ${unidades === 1 ? "vuelve" : "vuelven"} ${esc(salio.texto)}
                ${unidades === 1 ? "la unidad" : "las " + numero(unidades) + " unidades"}.`}</p>
        <button class="boton--peligro separado" id="btn-borrar">Borrar
          ${salio.esLiquidacion ? "la liquidación entera" : "la venta entera"}</button>
      </div>`;

    document.getElementById("btn-remito").onclick = () => generarRemito(v);
    document.getElementById("btn-borrar").onclick = () => borrarVenta(v);
  }

  async function generarRemito(v) {
    const boton = document.getElementById("btn-remito");
    boton.disabled = true;
    boton.textContent = "Armando el remito…";
    try {
      const datos = {
        titulo: "REMITO",
        numero: v.id.slice(0, 6).toUpperCase(),
        fecha: v.fecha,
        cliente: v.cliente,
        leyenda: "Lista " + v.lista + " · " + v.medio_pago,
        conPrecios: true,
        lineas: v.lineas.map((l) => ({
          nombre: window.Datos.nombreDe(l.cod), cod: l.cod,
          cantidad: l.cantidad, precio: l.precio, subtotal: l.subtotal,
        })),
        total: v.total,
        obs: v.obs,
      };

      const url = await window.Remito.vistaPrevia(datos);
      document.getElementById("v-remito").innerHTML = `
        <figure class="remito">
          <img src="${url}" alt="Remito para ${esc(v.cliente)}">
        </figure>
        <div class="acciones">
          <button class="boton" id="btn-compartir">Compartir</button>
          <button class="boton boton--secundario" id="btn-imprimir">Imprimir</button>
        </div>
        <p class="nota">Para mandarlo por WhatsApp o a la impresora térmica, usá
           <strong>Compartir</strong> y elegí la app. <strong>Imprimir</strong> abre el
           diálogo del sistema, para las impresoras que el teléfono ya ve.</p>`;

      document.getElementById("btn-compartir").onclick = async () => {
        const r = await window.Remito.compartir(datos);
        if (r.como === "descargado") window.Util.brindis("Descargado: " + r.nombre);
        if (r.como === "compartido") window.Util.brindis("Enviado.");
      };
      document.getElementById("btn-imprimir").onclick = () => window.Remito.imprimir(datos);
    } catch (err) {
      document.getElementById("v-remito").innerHTML =
        `<p class="aviso aviso--error">No se pudo armar el remito. Detalle: ${esc(err.message || err)}</p>`;
    } finally {
      boton.disabled = false;
      boton.textContent = "Generar remito";
    }
  }

  // Borra la venta entera: sus filas de plata y sus movimientos de mercadería.
  // Los movimientos se encuentran por su "ref", que guarda el id de la venta.
  async function borrarVenta(v) {
    const salio = deDondeSalio(v);
    const suyos = movimientosDe(v);
    for (const l of v.lineas) await window.CVDB.borrar("ingresos", l.id);
    for (const m of suyos) await window.CVDB.borrar("movimientos", m.id);

    await window.Datos.cargar();
    window.Sincro.sincronizar(true);
    window.Util.brindis(salio.esLiquidacion ? "Liquidación borrada." : "Venta borrada.");
    ir("ingresos");
  }

  return { render };
})();
