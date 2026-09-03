// ==========================================================================
// Cocina Viva — Consignación
//
// La mercadería que está en la calle: en Humus, en Renacer, en el Molino. Es
// la pantalla que más cambia respecto de cómo venían trabajando, porque separa
// tres cosas que en la planilla eran una sola fila:
//
//   ENTREGAR    del depósito al local. Se mueve mercadería y NO entra plata.
//   LIQUIDAR    el local vendió y pagó. Sale del local y ENTRA la plata:
//               genera las mismas filas de "ingresos" que una venta.
//   DEVOLVER    volvió sin venderse. Del local al depósito, sin plata.
//
// En la planilla vieja, dejar mercadería generaba un ingreso con medio de pago
// «Consignación»: descontaba stock y registraba como cobrado algo que no lo
// estaba. Por eso el resumen mensual necesitaba una línea aparte que no se
// sumara a las ventas. Acá no hace falta ese parche.
//
// LOS FORMULARIOS NO SON IGUALES, A PROPÓSITO.
// Para entregar se elige de todo el catálogo, así que va un desplegable y un
// botón de agregar. Para liquidar y para devolver solo se puede tocar lo que
// está en ese local, así que se listan esos productos con un casillero al lado
// de cada uno: es lo que se hace parado en el mostrador, mirando la estantería.
// ==========================================================================

window.Consignacion = (function () {
  const { esc, dinero, numero, aNumero, hoy, fecha } = window.Util;

  const MODOS = {
    entregar: { icono: "📦", titulo: "Entregar", verbo: "Entregar", corto: "Entregar",
                ayuda: "Sale del depósito y queda en el local. Todavía no se cobra." },
    liquidar: { icono: "💵", titulo: "Liquidar", verbo: "Registrar el cobro", corto: "Cobrar",
                ayuda: "Lo que el local vendió y pagó. Entra como ingreso." },
    devolver: { icono: "↩️", titulo: "Devolver", verbo: "Traer de vuelta", corto: "Devolver",
                ayuda: "Lo que no se vendió y vuelve al depósito." },
  };

  let vista = null;
  let ir = null;
  let modo = "entregar";
  let entrega = null;      // borrador de la entrega: [{cod, cantidad}]
  let cuando = null;       // la fecha del formulario, común a los tres modos
  let medioPago = "";

  async function render(contenedor, ruta, navegar) {
    vista = contenedor;
    ir = navegar;

    const local = decodeURIComponent(ruta.split("/")[1] || "");
    if (local) {
      if (!entrega) entrega = [{ cod: "", cantidad: "" }];
      if (!cuando) cuando = hoy();
      ficha(local);
      return { titulo: local, subtitulo: "Mercadería en consignación" };
    }

    modo = "entregar";
    entrega = null;
    cuando = null;
    lista();
    return { titulo: "Consignación", subtitulo: "Mercadería en la calle" };
  }

  // ==========================================================================
  // La lista de locales
  // ==========================================================================

  function lista() {
    const enLaCalle = window.Datos.stockEnLaCalle();
    const total = window.Datos.valorDe(enLaCalle);
    const unidades = Object.keys(enLaCalle).reduce((n, c) => n + enLaCalle[c], 0);

    // Se muestran los locales que tienen mercadería y también los clientes
    // marcados como de consignación que hoy no tienen nada: a esos justamente
    // hay que poder entrarles para dejarles la primera caja.
    const conMercaderia = window.Datos.localesConMercaderia();
    const declarados = window.Datos.localesDeConsignacion().map((c) => c.nombre);
    const todos = [...new Set([...conMercaderia, ...declarados])]
      .sort((a, b) => a.localeCompare(b, "es"));

    const filas = todos.map((nombre) => {
      const suyo = window.Datos.stockEn(nombre);
      const u = Object.keys(suyo).reduce((n, c) => n + suyo[c], 0);
      return { nombre, unidades: u, productos: Object.keys(suyo).length, valor: window.Datos.valorDe(suyo) };
    }).sort((a, b) => b.valor - a.valor);

    vista.innerHTML = `
      <div class="cifras">
        <div class="cifra cifra--saldo">
          <span class="cifra__que">En consignación</span>
          <span class="cifra__cuanto">${dinero(total)}</span>
        </div>
        <div class="cifra cifra--sale">
          <span class="cifra__que">Unidades${(() => {
            const cuantos = filas.filter((f) => f.unidades).length;
            return cuantos ? " · " + cuantos + (cuantos === 1 ? " local" : " locales") : "";
          })()}</span>
          <span class="cifra__cuanto">${numero(unidades)}</span>
        </div>
      </div>

      ${filas.length ? `
        <ul class="renglones">
          ${filas.map((f) => `
            <li class="renglon ${f.unidades ? "renglon--sale" : ""} ${f.unidades ? "" : "en-cero"}"
                data-ir="consignacion/${encodeURIComponent(f.nombre)}" role="button" tabindex="0">
              <span class="renglon__texto">
                <span class="renglon__que">${esc(f.nombre)}</span>
                <span class="renglon__detalle">${f.unidades
                  ? numero(f.unidades) + " unidades · " + f.productos + " producto" + (f.productos === 1 ? "" : "s")
                  : "sin mercadería"}</span>
              </span>
              <span class="renglon__cuanto">${f.unidades ? dinero(f.valor) : "—"}</span>
            </li>`).join("")}
        </ul>`
      : `<p class="vacio">Todavía no hay ningún local con mercadería. Marcá un cliente
           como «consignación» en <strong>Clientes</strong> y va a aparecer acá.</p>`}

      ${unidades ? `
        <h2 class="separado">Qué hay en consignación, en total</h2>
        <p class="nota">Sumando todos los locales, a precio mayorista.</p>
        ${tabla(window.Datos.renglonesDe(enLaCalle), total)}` : ""}`;

    enganchar();
  }

  function tabla(renglones, total) {
    return `
      <div class="tabla-envoltorio">
        <table class="tabla">
          <thead>
            <tr><th>Producto</th><th class="numero">Cant.</th><th class="numero">Precio</th><th class="numero">Subtotal</th></tr>
          </thead>
          <tbody>
            ${renglones.map((r) => `
              <tr>
                <td>
                  <span class="celda__que">${esc(r.nombre)}</span>
                  <span class="celda__detalle">${esc(r.cod)}</span>
                </td>
                <td class="numero">${numero(r.cantidad)}</td>
                <td class="numero">${dinero(r.precio)}</td>
                <td class="numero">${dinero(r.subtotal)}</td>
              </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="numero">${numero(renglones.reduce((n, r) => n + r.cantidad, 0))}</td>
              <td></td>
              <td class="numero">${dinero(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }

  // ==========================================================================
  // La ficha de un local
  // ==========================================================================

  function ficha(local, mensaje) {
    const suyo = window.Datos.stockEn(local);
    const renglones = window.Datos.renglonesDe(suyo);
    const valor = window.Datos.valorDe(suyo);
    const unidades = renglones.reduce((n, r) => n + r.cantidad, 0);

    vista.innerHTML = `
      ${mensaje || ""}

      <div class="cifras">
        <div class="cifra cifra--saldo">
          <span class="cifra__que">Tiene ahora</span>
          <span class="cifra__cuanto">${dinero(valor)}</span>
        </div>
        <div class="cifra cifra--sale">
          <span class="cifra__que">Unidades</span>
          <span class="cifra__cuanto">${numero(unidades)}</span>
        </div>
      </div>

      <div class="campo">
        <label>¿Qué estás haciendo?</label>
        <div class="opciones">
          ${Object.entries(MODOS).map(([clave, m]) => `
            <label class="opcion${clave === modo ? " elegida" : ""}">
              <input type="radio" name="modo" value="${clave}"${clave === modo ? " checked" : ""}>
              <span class="opcion__icono">${m.icono}</span>
              <span class="opcion__texto">${esc(m.titulo)}</span>
            </label>`).join("")}
        </div>
        <span class="ayuda">${esc(MODOS[modo].ayuda)}</span>
      </div>

      <div class="tarjeta">
        ${modo === "entregar" ? formEntregar(local) : formSacar(local, renglones)}
      </div>

      ${renglones.length ? `
        <h2 class="separado">Lo que tiene hoy</h2>
        ${tabla(renglones, valor)}`
      : `<p class="vacio">${esc(local)} no tiene mercadería nuestra en este momento.</p>`}

      ${historial(local)}`;

    engancharFicha(local);
  }

  // ---------- Entregar: se elige de todo el catálogo ----------

  function formEntregar(local) {
    const productos = window.Datos.todo().productos.filter((p) => p.activo !== false);
    const deposito = window.Datos.stockDeposito();

    return `
      <h2>Entregar a ${esc(local)}</h2>
      <div class="campo separado">
        <label for="cg-fecha">Fecha</label>
        <input type="date" id="cg-fecha" value="${esc(cuando)}">
      </div>

      <div id="cg-lineas">
        ${entrega.map((l, i) => {
          const hay = l.cod ? (deposito[l.cod] || 0) : 0;
          const n = aNumero(l.cantidad);
          return `
          <div class="renglon-venta" data-i="${i}">
            <div class="renglon-venta__linea">
              <select class="cg-cod" data-i="${i}" aria-label="Producto">
                <option value="">Elegí un producto…</option>
                ${productos.map((p) => `
                  <option value="${esc(p.cod)}"${p.cod === l.cod ? " selected" : ""}>${esc(p.producto)}${p.presentacion ? " · " + esc(p.presentacion) : ""}</option>`).join("")}
              </select>
              <input type="text" class="cg-cant numero" data-i="${i}" inputmode="numeric"
                     placeholder="0" value="${esc(l.cantidad)}" aria-label="Cantidad">
              <button class="quitar" data-quitar="${i}" aria-label="Quitar">&#10005;</button>
            </div>
            <span class="renglon-venta__sub" id="cg-sub-${i}" hidden></span>
            ${l.cod && Number.isFinite(n) && n > hay ? `
              <p class="renglon-venta__aviso">En el depósito hay ${numero(hay)}.
                 Va a quedar en ${numero(hay - n)}.</p>` : ""}
          </div>`;
        }).join("")}
      </div>

      <button class="boton boton--secundario boton--chico boton--ancho" id="cg-mas">+ Agregar producto</button>
      <div class="total" id="cg-total"></div>

      <p class="campo__error" id="cg-error" hidden></p>
      <button class="boton boton--ancho separado" id="cg-guardar-remito">
        Entregar y generar remito
      </button>
      <button class="boton boton--secundario boton--ancho separado" id="cg-guardar">
        Entregar sin remito
      </button>`;
  }

  // ---------- Liquidar y devolver: solo lo que hay en el local ----------

  function formSacar(local, renglones) {
    const m = MODOS[modo];
    const medios = window.Datos.todo().listas.medios_pago || [];

    if (!renglones.length) {
      return `<h2>${esc(m.titulo)}</h2>
        <p class="nota">${esc(local)} no tiene mercadería nuestra, así que no hay
           nada que ${modo === "liquidar" ? "liquidar" : "devolver"}.</p>`;
    }

    return `
      <h2>${esc(m.titulo)} · ${esc(local)}</h2>
      <p class="nota">${modo === "liquidar"
        ? "Poné cuántas vendió de cada producto. Se le descuentan del local y entran como ingreso."
        : "Poné cuántas te traés de vuelta de cada producto. Vuelven al depósito."}</p>

      <div class="fila separado">
        <div class="campo">
          <label for="cg-fecha">Fecha</label>
          <input type="date" id="cg-fecha" value="${esc(cuando)}">
        </div>
        ${modo === "liquidar" ? `
          <div class="campo">
            <label for="cg-medio">Con qué pagó <span class="obliga">•</span></label>
            <select id="cg-medio">
              <option value="">Elegí…</option>
              ${medios.map((x) => `<option value="${esc(x)}"${x === medioPago ? " selected" : ""}>${esc(x)}</option>`).join("")}
            </select>
          </div>` : ""}
      </div>

      <ul class="chequeos">
        ${renglones.map((r) => `
          <li class="cuenta">
            <span class="cuenta__texto">
              <span class="celda__que">${esc(r.nombre)}</span>
              <span class="celda__detalle">tiene ${numero(r.cantidad)} · ${dinero(r.precio)} c/u</span>
            </span>
            <input type="text" class="cg-sacar numero" data-cod="${esc(r.cod)}"
                   data-hay="${r.cantidad}" data-precio="${r.precio}"
                   inputmode="numeric" placeholder="0" aria-label="Cuántas de ${esc(r.nombre)}">
            <button class="cuenta__todo" data-todo="${esc(r.cod)}">Todo</button>
          </li>`).join("")}
      </ul>

      <div class="total" id="cg-total"></div>
      <p class="campo__error" id="cg-error" hidden></p>
      <button class="boton boton--ancho separado" id="cg-guardar-remito">
        ${esc(m.corto)} y dar comprobante
      </button>
      <button class="boton boton--secundario boton--ancho separado" id="cg-guardar">
        ${esc(m.corto)} sin comprobante
      </button>`;
  }

  // ---------- Cuentas vivas ----------

  function recalcular(local) {
    const caja = document.getElementById("cg-total");
    if (!caja) return 0;

    if (modo === "entregar") {
      let total = 0;
      entrega.forEach((l, i) => {
        const precio = l.cod ? window.Datos.precioDe(l.cod) : 0;
        const n = aNumero(l.cantidad);
        const sub = Number.isFinite(n) ? n * precio : 0;
        total += sub;
        const c = document.getElementById("cg-sub-" + i);
        if (c) {
          const hayQueMostrar = !!(l.cod && Number.isFinite(n) && n);
          c.textContent = hayQueMostrar ? dinero(sub) + " · " + dinero(precio) + " c/u" : "";
          c.hidden = !hayQueMostrar;
        }
      });
      caja.innerHTML = `<span class="total__que">Valor de lo que dejás</span>
        <span class="total__cuanto">${dinero(total)}</span>`;
      return total;
    }

    let total = 0;
    let unidades = 0;
    vista.querySelectorAll(".cg-sacar").forEach((e) => {
      const n = aNumero(e.value);
      if (!Number.isFinite(n) || n <= 0) { e.classList.remove("mal"); return; }
      const hay = Number(e.dataset.hay);
      e.classList.toggle("mal", n > hay);
      total += n * Number(e.dataset.precio);
      unidades += n;
    });

    caja.innerHTML = modo === "liquidar"
      ? `<span class="total__que">Total a cobrar · ${numero(unidades)} u.</span>
         <span class="total__cuanto">${dinero(total)}</span>`
      : `<span class="total__que">Vuelven al depósito</span>
         <span class="total__cuanto">${numero(unidades)} u.</span>`;
    return total;
  }

  // ---------- Guardar ----------

  function avisarMal(texto) {
    const e = document.getElementById("cg-error");
    if (!e) return;
    e.textContent = texto;
    e.hidden = false;
    e.scrollIntoView({ block: "center" });
  }

  async function guardar(local, conRemito) {
    const e = document.getElementById("cg-error");
    if (e) e.hidden = true;
    cuando = (document.getElementById("cg-fecha") || {}).value || hoy();

    if (modo === "entregar") return guardarEntrega(local, conRemito);
    return guardarSalida(local, conRemito);
  }

  async function guardarEntrega(local, conRemito) {
    const lineas = [];
    for (const l of entrega) {
      if (!l.cod && !String(l.cantidad).trim()) continue;
      if (!l.cod) return avisarMal("Hay un renglón con cantidad pero sin producto.");
      const n = aNumero(l.cantidad);
      if (!Number.isFinite(n) || n <= 0) {
        return avisarMal("La cantidad de " + window.Datos.nombreDe(l.cod) + " tiene que ser mayor que cero.");
      }
      lineas.push({ cod: l.cod, cantidad: n });
    }
    if (!lineas.length) return avisarMal("Agregá al menos un producto.");

    const juntadas = [];
    lineas.forEach((l) => {
      const previa = juntadas.find((j) => j.cod === l.cod);
      if (previa) previa.cantidad += l.cantidad;
      else juntadas.push(Object.assign({}, l));
    });

    const ref = window.Util.nuevoId();
    const movimientos = juntadas.map((l) => window.Datos.movimiento("entrega", l.cod, l.cantidad, {
      local: local, fecha: cuando, ref: ref,
    }));

    await window.CVDB.guardarVarios("movimientos", movimientos);
    await window.Datos.cargar();
    window.Sincro.sincronizar(true);

    const datos = datosDelRemito(local, juntadas, ref);
    entrega = [{ cod: "", cantidad: "" }];

    const cuantas = juntadas.reduce((n, l) => n + l.cantidad, 0);
    ficha(local, `<p class="aviso aviso--ok">Entregadas ${numero(cuantas)} unidades a
      ${esc(local)}, por ${dinero(datos.total)}.</p>`);

    if (conRemito) mostrarRemito(datos);
  }

  async function guardarSalida(local, conComprobante) {
    const elegidas = [];
    let hayExceso = false;

    vista.querySelectorAll(".cg-sacar").forEach((campo) => {
      const n = aNumero(campo.value);
      if (!Number.isFinite(n) || n <= 0) return;
      if (n > Number(campo.dataset.hay)) hayExceso = true;
      elegidas.push({ cod: campo.dataset.cod, cantidad: n, precio: Number(campo.dataset.precio) });
    });

    if (!elegidas.length) {
      return avisarMal("Poné al menos una cantidad.");
    }
    // Acá sí se frena, al revés que en una venta: en una venta el depósito
    // puede estar mal cargado, pero acá lo que se descuenta salió de una
    // entrega que está anotada. Si no alcanza, lo que falta es una entrega.
    if (hayExceso) {
      return avisarMal("Hay cantidades mayores que las que tiene el local, marcadas en rojo. "
        + "Si de verdad tiene más, falta cargar una entrega.");
    }

    if (modo === "liquidar") {
      medioPago = document.getElementById("cg-medio").value;
      if (!medioPago) return avisarMal("Elegí con qué pagó.");
    }

    const ref = window.Util.nuevoId();
    const movimientos = elegidas.map((l) => window.Datos.movimiento(
      modo === "liquidar" ? "liquidacion" : "devolucion", l.cod, l.cantidad, {
        local: local, fecha: cuando, ref: ref, obs: modo === "liquidar" ? local : "",
      }));

    await window.CVDB.guardarVarios("movimientos", movimientos);

    // Liquidar es cobrar: además del movimiento, escribe las mismas filas de
    // "ingresos" que una venta. Por eso la liquidación aparece después en la
    // lista de últimas ventas y se puede borrar desde ahí, con su movimiento.
    if (modo === "liquidar") {
      const filas = elegidas.map((l) => ({
        id: window.Util.nuevoId(),
        venta: ref,
        fecha: cuando,
        cliente: local,
        lista: "mayorista",
        medio_pago: medioPago,
        cod: l.cod,
        cantidad: l.cantidad,
        precio: l.precio,
        subtotal: l.cantidad * l.precio,
        obs: "Liquidación de consignación",
      }));
      await window.CVDB.guardarVarios("ingresos", filas);
    }

    await window.Datos.cargar();
    window.Sincro.sincronizar(true);

    const unidades = elegidas.reduce((n, l) => n + l.cantidad, 0);
    const plata = elegidas.reduce((n, l) => n + l.cantidad * l.precio, 0);
    const comprobante = datosDelComprobante(local, elegidas, ref);
    const eraLiquidacion = modo === "liquidar";

    ficha(local, eraLiquidacion
      ? `<p class="aviso aviso--ok">Cobrado: ${dinero(plata)} por ${numero(unidades)}
         unidades que vendió ${esc(local)}. Entró como ingreso en ${esc(medioPago)}.</p>`
      : `<p class="aviso aviso--ok">Volvieron al depósito ${numero(unidades)} unidades
         de ${esc(local)}.</p>`);

    if (conComprobante) mostrarRemito(comprobante);
  }

  // El comprobante de una liquidación es un recibo: le queda al local como
  // constancia de lo que pagó. El de una devolución es al revés, la constancia
  // de lo que se llevaron: por eso no lleva plata, lleva unidades.
  function datosDelComprobante(local, elegidas, ref) {
    const liquidacion = modo === "liquidar";
    const lineas = elegidas.map((l) => ({
      nombre: window.Datos.nombreDe(l.cod), cod: l.cod,
      cantidad: l.cantidad, precio: l.precio, subtotal: l.cantidad * l.precio,
    }));
    return {
      titulo: liquidacion ? "RECIBO" : "DEVOLUCIÓN",
      numero: ref.slice(0, 6).toUpperCase(),
      fecha: cuando,
      cliente: local,
      etiquetaCliente: liquidacion ? "RECIBIMOS DE" : "DEVUELTO POR",
      leyenda: liquidacion
        ? "Liquidación de consignación · pagó con " + medioPago
        : "Mercadería devuelta al depósito",
      conPrecios: liquidacion,
      lineas: lineas,
      total: lineas.reduce((n, l) => n + l.subtotal, 0),
      obs: "",
    };
  }

  // ---------- Remito de entrega ----------

  function datosDelRemito(local, lineas, ref) {
    const conPrecio = lineas.map((l) => {
      const precio = window.Datos.precioDe(l.cod);
      return {
        nombre: window.Datos.nombreDe(l.cod), cod: l.cod,
        cantidad: l.cantidad, precio: precio, subtotal: l.cantidad * precio,
      };
    });
    return {
      titulo: "REMITO DE ENTREGA",
      numero: ref.slice(0, 6).toUpperCase(),
      fecha: cuando,
      cliente: local,
      leyenda: "Mercadería en consignación · se paga a medida que se vende",
      conPrecios: true,
      lineas: conPrecio,
      total: conPrecio.reduce((n, l) => n + l.subtotal, 0),
      obs: "",
    };
  }

  async function mostrarRemito(datos) {
    const caja = document.createElement("div");
    vista.insertBefore(caja, vista.firstChild);
    caja.innerHTML = `<p class="nota">Armando el remito…</p>`;
    try {
      const url = await window.Remito.vistaPrevia(datos);
      caja.innerHTML = `
        <figure class="remito"><img src="${url}" alt="Remito de entrega para ${esc(datos.cliente)}"></figure>
        <div class="acciones">
          <button class="boton" id="cg-compartir">Compartir</button>
          <button class="boton boton--secundario" id="cg-imprimir">Imprimir</button>
        </div>`;
      document.getElementById("cg-compartir").onclick = async () => {
        const r = await window.Remito.compartir(datos);
        if (r.como === "descargado") window.Util.brindis("Descargado: " + r.nombre);
        if (r.como === "compartido") window.Util.brindis("Enviado.");
      };
      document.getElementById("cg-imprimir").onclick = () => window.Remito.imprimir(datos);
      caja.scrollIntoView({ block: "start" });
    } catch (err) {
      caja.innerHTML = `<p class="aviso aviso--error">No se pudo armar el remito.
        La entrega sí quedó guardada. Detalle: ${esc(err.message || err)}</p>`;
    }
  }

  // ---------- Historial del local ----------

  function historial(local) {
    const suyos = (window.Datos.todo().movimientos || [])
      .filter((m) => m.desde === local || m.hacia === local)
      .sort((a, b) => (a.fecha === b.fecha ? (b.mod || 0) - (a.mod || 0) : (a.fecha < b.fecha ? 1 : -1)))
      .slice(0, 10);

    if (!suyos.length) return "";

    const COMO = {
      entrega: ["Entregado", "renglon--sale", "+"],
      liquidacion: ["Vendido y cobrado", "renglon--entra", "−"],
      devolucion: ["Devuelto al depósito", "renglon--entra", "−"],
      ajuste: ["Ajuste por conteo", "", ""],
    };

    return `
      <h2 class="separado">Últimos movimientos</h2>
      <ul class="renglones">
        ${suyos.map((m) => {
          const c = COMO[m.tipo] || [m.tipo, "", ""];
          const signo = m.hacia === local ? "+" : "−";
          return `
          <li class="renglon ${c[1]}">
            <span class="renglon__texto">
              <span class="renglon__que">${esc(window.Datos.nombreDe(m.cod))}</span>
              <span class="renglon__detalle">${esc(c[0])} · ${fecha(m.fecha)}</span>
            </span>
            <span class="renglon__cuanto">${signo}${numero(m.cantidad)}</span>
          </li>`;
        }).join("")}
      </ul>`;
  }

  // ---------- Enganches ----------

  function enganchar() {
    vista.querySelectorAll("[data-ir]").forEach((b) => {
      b.onclick = () => ir(b.dataset.ir);
      b.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ir(b.dataset.ir); } };
    });
  }

  function leerEntrega() {
    vista.querySelectorAll(".cg-cod").forEach((s) => { entrega[s.dataset.i].cod = s.value; });
    vista.querySelectorAll(".cg-cant").forEach((c) => { entrega[c.dataset.i].cantidad = c.value; });
    const f = document.getElementById("cg-fecha");
    if (f) cuando = f.value || hoy();
  }

  function engancharFicha(local) {
    vista.querySelectorAll('input[name="modo"]').forEach((r) => {
      r.onchange = () => {
        if (modo === "entregar") leerEntrega();
        modo = r.value;
        ficha(local);
      };
    });

    const f = document.getElementById("cg-fecha");
    if (f) f.onchange = () => { cuando = f.value || hoy(); };

    if (modo === "entregar") {
      vista.querySelectorAll(".cg-cod").forEach((s) => {
        s.onchange = () => { entrega[s.dataset.i].cod = s.value; recalcular(local); };
      });
      vista.querySelectorAll(".cg-cant").forEach((c) => {
        c.oninput = () => { entrega[c.dataset.i].cantidad = c.value; recalcular(local); };
      });
      vista.querySelectorAll("[data-quitar]").forEach((b) => {
        b.onclick = () => {
          leerEntrega();
          entrega.splice(Number(b.dataset.quitar), 1);
          if (!entrega.length) entrega.push({ cod: "", cantidad: "" });
          ficha(local);
        };
      });
      const mas = document.getElementById("cg-mas");
      if (mas) mas.onclick = () => {
        leerEntrega();
        entrega.push({ cod: "", cantidad: "" });
        ficha(local);
        const todos = vista.querySelectorAll(".cg-cod");
        if (todos.length) todos[todos.length - 1].focus();
      };
    } else {
      vista.querySelectorAll(".cg-sacar").forEach((c) => { c.oninput = () => recalcular(local); });
      vista.querySelectorAll("[data-todo]").forEach((b) => {
        b.onclick = () => {
          const campo = vista.querySelector('.cg-sacar[data-cod="' + b.dataset.todo + '"]');
          campo.value = campo.dataset.hay;
          recalcular(local);
        };
      });
      const medio = document.getElementById("cg-medio");
      if (medio) medio.onchange = () => { medioPago = medio.value; };
    }

    const guardarlo = document.getElementById("cg-guardar");
    if (guardarlo) guardarlo.onclick = () => {
      if (modo === "entregar") leerEntrega();
      guardar(local, false);
    };

    const conComprobante = document.getElementById("cg-guardar-remito");
    if (conComprobante) conComprobante.onclick = () => {
      if (modo === "entregar") leerEntrega();
      guardar(local, true);
    };

    recalcular(local);
    enganchar();
  }

  return { render };
})();
