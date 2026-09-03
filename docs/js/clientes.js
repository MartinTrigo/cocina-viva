// ==========================================================================
// Cocina Viva — Clientes
//
// La libreta de a quién se le vende y a quién se le deja en consignación. De
// acá salen el desplegable de las ventas y la lista de locales de la pantalla
// de Consignación.
//
// EL NOMBRE ES LA CLAVE, Y SE PUEDE CAMBIAR IGUAL.
//
// A diferencia del código de un producto, el nombre de un cliente no es una
// sigla que se elige una vez: es cómo se lo llama, sale impreso en cada remito
// y es lo más fácil de escribir mal. Por eso acá el renombre se hace de verdad,
// no se prohíbe: al cambiarlo se reescriben también todas las filas que lo
// nombran —las ventas, y el "desde" y el "hacia" de los movimientos de
// consignación— para que no quede nada huérfano. La pantalla dice cuántas son
// antes de tocarlas.
//
// DAR DE BAJA NO ES BORRAR, igual que en Productos: un cliente con ventas
// encima se da de baja y desaparece de los desplegables, pero su historia
// queda. Solo se borra de verdad el que no tiene ni una venta ni un movimiento.
// ==========================================================================

window.Clientes = (function () {
  const { esc, dinero, numero, unaVez } = window.Util;

  let vista = null;
  let ir = null;
  let filtro = "";

  async function render(contenedor, ruta, navegar) {
    vista = contenedor;
    ir = navegar;

    const partes = ruta.split("/");
    const que = decodeURIComponent(partes[1] || "");

    if (que === "nuevo") { formulario(null); return cab("Cliente nuevo", "Alta en la libreta"); }
    if (que === "bajas") { enMasa(); return cab("Dar de baja varios", "Los que ya no van"); }
    if (que) {
      const c = buscar(que);
      if (!c) { lista(); return cab("Clientes", "A quién le vendemos"); }
      formulario(c);
      return cab(c.nombre, c.localidad || "Editar cliente");
    }
    lista();
    return cab("Clientes", "A quién le vendemos");
  }

  const cab = (titulo, subtitulo) => ({ titulo, subtitulo });

  const buscar = (nombre) =>
    (window.Datos.todo().clientes || []).find((c) => c.nombre === nombre) || null;

  // ---------- La lista ----------

  function lista() {
    const todos = window.Datos.todo().clientes || [];
    const activos = todos.filter((c) => c.activo !== false);
    const bajas = todos.filter((c) => c.activo === false);

    const busca = filtro.trim().toLowerCase();
    const visibles = !busca ? activos : activos.filter((c) =>
      (c.nombre + " " + (c.localidad || "")).toLowerCase().indexOf(busca) >= 0);

    vista.innerHTML = `
      <div class="acciones">
        <button class="boton" data-ir="clientes/nuevo">+ Cliente nuevo</button>
        <button class="boton boton--secundario" data-ir="clientes/bajas">Dar de baja varios</button>
      </div>

      <div class="campo">
        <label for="cl-filtro" class="oculto-visual">Buscar</label>
        <input type="search" id="cl-filtro" value="${esc(filtro)}"
               placeholder="Buscar por nombre o localidad…" autocomplete="off">
      </div>

      ${visibles.length ? renglones(visibles) : `<p class="vacio">${busca
        ? "Ningún cliente coincide con «" + esc(filtro) + "»."
        : "Todavía no hay clientes cargados."}</p>`}

      ${bajas.length ? `
        <details class="grupo separado">
          <summary class="grupo__cab">
            <span class="grupo__texto">
              <span class="grupo__nombre">Dados de baja</span>
              <span class="grupo__cuenta">${bajas.length} cliente${bajas.length === 1 ? "" : "s"} · no aparecen al cargar una venta</span>
            </span>
          </summary>
          <div class="grupo__cuerpo">${renglones(bajas)}</div>
        </details>` : ""}

      <p class="nota nota--pie">
        ${activos.length} cliente${activos.length === 1 ? "" : "s"} activo${activos.length === 1 ? "" : "s"},
        ${activos.filter((c) => c.tipo === "consignación").length} a consignación.
      </p>`;

    const busq = document.getElementById("cl-filtro");
    busq.oninput = () => {
      filtro = busq.value;
      const donde = busq.selectionStart;
      lista();
      const nuevo = document.getElementById("cl-filtro");
      nuevo.focus();
      nuevo.setSelectionRange(donde, donde);
    };

    enganchar();
  }

  function renglones(clientes) {
    return `
      <ul class="renglones">
        ${clientes.map((c) => `
          <li class="renglon ${c.tipo === "consignación" ? "renglon--sale" : "renglon--entra"}">
            <span class="renglon__texto">
              <span class="renglon__que">${esc(c.nombre)}</span>
              <span class="renglon__detalle">${esc(c.localidad || "sin localidad")} · ${esc(c.tipo)}${c.medio_pago ? " · " + esc(c.medio_pago) : ""}</span>
            </span>
            <button class="lapiz" data-ir="clientes/${encodeURIComponent(c.nombre)}"
                    aria-label="Editar ${esc(c.nombre)}">&#9998;</button>
          </li>`).join("")}
      </ul>`;
  }

  // ---------- Alta y edición ----------

  function formulario(c) {
    const nuevo = !c;
    const uso = nuevo ? { total: 0, ventas: 0, movimientos: 0 } : cuantoSeUso(c.nombre);
    const enCalle = nuevo ? {} : window.Datos.stockEn(c.nombre);
    const unidades = Object.keys(enCalle).reduce((n, k) => n + enCalle[k], 0);
    // El medio que YA tiene guardado el cliente va en la lista aunque no esté
    // entre los de la planilla. Si no, el desplegable cae en «—» y al guardar se
    // lo lleva puesto sin que nadie se entere: pasa si en la hoja `listas` le
    // cambian el nombre a un medio de pago, y pasa entero en un teléfono que
    // todavía no sincronizó, donde esa lista está vacía.
    const medios = (window.Datos.todo().listas.medios_pago || []).slice();
    if (!nuevo && c.medio_pago && medios.indexOf(c.medio_pago) < 0) medios.push(c.medio_pago);

    vista.innerHTML = `
      <div class="tarjeta">
        <div class="campo">
          <label for="cl-nombre">Nombre <span class="obliga">•</span></label>
          <span class="ayuda">${nuevo
            ? "Como lo nombran ustedes. Es lo que va a salir en el remito."
            : uso.total
              ? "Se puede cambiar. Al guardar se corrigen también " + cuantasFilas(uso.total)
                + " de la historia que lo nombra" + (uso.total === 1 ? "" : "n")
                + ", para que no quede nada suelto."
              : "Se puede cambiar: este cliente todavía no tiene historia."}</span>
          <input type="text" id="cl-nombre" value="${esc(nuevo ? "" : c.nombre)}" placeholder="el molino">
        </div>

        <div class="fila">
          <div class="campo">
            <label for="cl-localidad">Localidad</label>
            <input type="text" id="cl-localidad" value="${esc(nuevo ? "" : c.localidad)}"
                   placeholder="El Bolsón" list="cl-localidades">
            <datalist id="cl-localidades">
              ${localidades().map((l) => `<option value="${esc(l)}"></option>`).join("")}
            </datalist>
          </div>
          <div class="campo">
            <label for="cl-medio">Medio de pago habitual</label>
            <select id="cl-medio">
              <option value="">—</option>
              ${medios.map((m) => `<option value="${esc(m)}"${!nuevo && m === c.medio_pago ? " selected" : ""}>${esc(m)}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="campo">
          <label>Cómo trabaja</label>
          <div class="opciones opciones--dos">
            ${[["compra", "💵", "Compra"], ["consignación", "🏪", "Consignación"]].map(([v, i, t]) => {
              const elegido = nuevo ? v === "compra" : c.tipo === v;
              return `
              <label class="opcion${elegido ? " elegida" : ""}">
                <input type="radio" name="tipo" value="${v}"${elegido ? " checked" : ""}>
                <span class="opcion__icono">${i}</span>
                <span class="opcion__texto">${t}</span>
              </label>`;
            }).join("")}
          </div>
          <span class="ayuda separado">A consignación quiere decir que se le deja
            mercadería y paga a medida que vende. Esos son los que aparecen en la
            pantalla de Consignación.</span>
        </div>

        <p class="campo__error" id="cl-error" hidden></p>
        <button class="boton boton--ancho" id="btn-guardar">Guardar</button>
      </div>

      ${nuevo ? "" : `
        <div class="tarjeta">
          <h2>${c.activo === false ? "Este cliente está dado de baja" : "Dar de baja"}</h2>
          <p class="nota">${c.activo === false
            ? "No aparece al cargar una venta ni en la lista de locales. Su historia sigue contando."
            : "Deja de aparecer al cargar una venta, pero su historia queda intacta."}</p>

          ${unidades ? `
            <p class="aviso aviso--info al-final">
              <strong>Ojo:</strong> ${esc(c.nombre)} todavía tiene
              ${numero(unidades)} unidad${unidades === 1 ? "" : "es"} en consignación,
              por ${dinero(window.Datos.valorDe(enCalle))}. Darlo de baja no las trae
              de vuelta: eso se hace desde <strong>Consignación</strong>.
            </p>` : ""}

          <button class="boton boton--secundario boton--ancho separado" id="btn-baja">
            ${c.activo === false ? "Volver a activarlo" : "Dar de baja"}
          </button>

          ${uso.total === 0 ? `
            <p class="nota separado">No tiene ni una venta ni un movimiento, así que
               se puede borrar del todo sin romper nada.</p>
            <button class="boton--peligro" id="btn-borrar">Borrar de la libreta</button>`
          : `<p class="nota separado">Tiene ${numero(uso.ventas)} fila${uso.ventas === 1 ? "" : "s"}
               de venta y ${numero(uso.movimientos)} movimiento${uso.movimientos === 1 ? "" : "s"}
               de mercadería, así que no se puede borrar: se daría de baja nada más.</p>`}
        </div>`}`;

    vista.querySelectorAll('input[name="tipo"]').forEach((r) => {
      r.onchange = () => vista.querySelectorAll(".opcion").forEach((o) =>
        o.classList.toggle("elegida", o.contains(r) && r.checked));
    });

    unaVez(document.getElementById("btn-guardar"), () => guardar(c));

    const baja = document.getElementById("btn-baja");
    if (baja) baja.onclick = async () => {
      await guardarCliente(Object.assign({}, c, { activo: c.activo === false }));
      window.Util.brindis(c.activo === false ? "Activado de nuevo." : "Dado de baja.");
      ir("clientes");
    };

    const borrar = document.getElementById("btn-borrar");
    if (borrar) borrar.onclick = async () => {
      await window.CVDB.borrar("clientes", c.nombre);
      await window.Datos.cargar();
      window.Sincro.sincronizar(true);
      window.Util.brindis("Borrado de la libreta.");
      ir("clientes");
    };
  }

  const localidades = () => {
    const vistas = {};
    (window.Datos.todo().clientes || []).forEach((c) => { if (c.localidad) vistas[c.localidad] = true; });
    return Object.keys(vistas).sort((a, b) => a.localeCompare(b, "es"));
  };

  // Un movimiento nombra al cliente de dos maneras distintas: los de
  // consignación lo tienen como ubicación —en "desde" o en "hacia", según la
  // mercadería vaya o vuelva—, y los de venta lo llevan en las observaciones,
  // que es lo que hace legible la hoja sin tener que cruzarla con "ingresos".
  // Las dos cuentan, porque las dos hay que corregir al renombrar.
  const movimientoNombra = (m, nombre) =>
    m.desde === nombre || m.hacia === nombre || m.obs === nombre;

  // Cuántas filas de la historia nombran a este cliente.
  function cuantoSeUso(nombre) {
    const d = window.Datos.todo();
    const ventas = (d.ingresos || []).filter((f) => f.cliente === nombre).length;
    const movimientos = (d.movimientos || []).filter((m) => movimientoNombra(m, nombre)).length;
    return { ventas: ventas, movimientos: movimientos, total: ventas + movimientos };
  }

  // "la fila" / "las 3 filas", que es como se dice.
  const cuantasFilas = (n) => n === 1 ? "la fila" : "las " + numero(n) + " filas";

  async function guardar(previo) {
    const nuevo = !previo;
    const nombre = (document.getElementById("cl-nombre").value || "").trim();
    const localidad = (document.getElementById("cl-localidad").value || "").trim();
    const medio_pago = document.getElementById("cl-medio").value;
    const elegido = vista.querySelector('input[name="tipo"]:checked');
    const tipo = elegido ? elegido.value : "compra";

    const mal = (texto) => {
      const e = document.getElementById("cl-error");
      e.textContent = texto;
      e.hidden = false;
    };
    document.getElementById("cl-error").hidden = true;

    if (!nombre) return mal("Falta el nombre.");
    const choque = buscar(nombre);
    if (choque && (nuevo || choque.nombre !== previo.nombre)) {
      return mal("Ya hay un cliente que se llama «" + nombre + "». Los nombres no se repiten.");
    }

    const cambioDeNombre = !nuevo && nombre !== previo.nombre;

    await guardarCliente({
      nombre: nombre,
      localidad: localidad,
      tipo: tipo,
      medio_pago: medio_pago,
      activo: nuevo ? true : previo.activo !== false,
    });

    if (cambioDeNombre) {
      const cuantas = await renombrarEnLaHistoria(previo.nombre, nombre);
      await window.CVDB.borrar("clientes", previo.nombre);
      await window.Datos.cargar();
      window.Sincro.sincronizar(true);
      window.Util.brindis(cuantas
        ? "Renombrado, y con él " + cuantasFilas(cuantas) + " de la historia."
        : "Renombrado.");
    } else {
      window.Util.brindis(nuevo ? "Cliente agregado." : "Guardado.");
    }
    ir("clientes");
  }

  // Reescribe el nombre en todas las filas que lo nombran. Es lo que evita que
  // renombrar deje ventas de un cliente que ya no existe y mercadería en un
  // local fantasma.
  async function renombrarEnLaHistoria(viejo, nuevo) {
    const d = window.Datos.todo();

    const ventas = (d.ingresos || []).filter((f) => f.cliente === viejo)
      .map((f) => Object.assign({}, f, { cliente: nuevo }));

    const movs = (d.movimientos || []).filter((m) => movimientoNombra(m, viejo))
      .map((m) => Object.assign({}, m, {
        desde: m.desde === viejo ? nuevo : m.desde,
        hacia: m.hacia === viejo ? nuevo : m.hacia,
        obs: m.obs === viejo ? nuevo : m.obs,
      }));

    if (ventas.length) await window.CVDB.guardarVarios("ingresos", ventas);
    if (movs.length) await window.CVDB.guardarVarios("movimientos", movs);
    return ventas.length + movs.length;
  }

  // ---------- Bajas en masa ----------

  function enMasa() {
    const activos = (window.Datos.todo().clientes || []).filter((c) => c.activo !== false);

    vista.innerHTML = `
      <div class="tarjeta">
        <h2>Los que ya no van</h2>
        <p class="nota">Marcá los clientes con los que no trabajan más. Dejan de
           aparecer al cargar una venta, pero su historia queda: no se borra nada,
           y los resúmenes de meses viejos siguen dando lo mismo.</p>
        <ul class="chequeos separado">
          ${activos.map((c) => {
            const enCalle = window.Datos.stockEn(c.nombre);
            const unidades = Object.keys(enCalle).reduce((n, k) => n + enCalle[k], 0);
            return `
            <li>
              <label class="chequeo">
                <input type="checkbox" value="${esc(c.nombre)}">
                <span><strong>${esc(c.nombre)}</strong>
                  <span class="celda__detalle">${esc(c.localidad || "sin localidad")} · ${esc(c.tipo)}${
                    unidades ? " · todavía tiene " + numero(unidades) + " u. en consignación" : ""}</span>
                </span>
              </label>
            </li>`;
          }).join("")}
        </ul>
        <button class="boton boton--ancho separado" id="btn-bajas" disabled>Dar de baja los marcados</button>
      </div>`;

    const chequeos = vista.querySelectorAll(".chequeo input");
    const boton = document.getElementById("btn-bajas");

    chequeos.forEach((ch) => {
      ch.onchange = () => {
        const cuantos = [...chequeos].filter((x) => x.checked).length;
        boton.disabled = !cuantos;
        boton.textContent = cuantos
          ? "Dar de baja " + cuantos + " cliente" + (cuantos === 1 ? "" : "s")
          : "Dar de baja los marcados";
      };
    });

    boton.onclick = async () => {
      const elegidos = [...chequeos].filter((x) => x.checked).map((x) => x.value);
      if (!elegidos.length) return;
      await window.CVDB.guardarVarios("clientes", elegidos.map((n) =>
        Object.assign({}, buscar(n), { activo: false })));
      await window.Datos.cargar();
      window.Sincro.sincronizar(true);
      window.Util.brindis(elegidos.length + " dado" + (elegidos.length === 1 ? "" : "s") + " de baja.");
      ir("clientes");
    };
  }

  // ---------- Auxiliares ----------

  async function guardarCliente(c) {
    await window.CVDB.guardar("clientes", c);
    await window.Datos.cargar();
    window.Sincro.sincronizar(true);
  }

  function enganchar() {
    vista.querySelectorAll("[data-ir]").forEach((b) => { b.onclick = () => ir(b.dataset.ir); });
  }

  return { render };
})();
