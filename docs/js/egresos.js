// ==========================================================================
// Cocina Viva — Egresos
//
// Lo que sale: insumos, gastos fijos, honorarios, otros gastos e inversión.
// Es el formulario más simple de la app y no toca el stock: un egreso es plata
// y nada más. Los frascos que se compran son insumo, no producto terminado.
//
// LA CANTIDAD ES TEXTO, NO UN NÚMERO. En la planilla vieja esa columna dice
// «5,4», «9,5 l», «2 k», «7 turnos», «433 frascos 660 y 100 tapas». Obligarla a
// número perdería la unidad, que es justo lo que hace que el dato sirva para
// algo después. Lo que sí es número es el monto.
// ==========================================================================

window.Egresos = (function () {
  const { esc, dinero, aNumero, hoy, fecha, mesDe, mesLargo, unaVez } = window.Util;

  let vista = null;
  let ir = null;
  let borrador = null;

  const vacio = () => ({
    fecha: hoy(), rubro: "", detalle: "", cantidad: "", monto: "", medio_pago: "", obs: "",
  });

  async function render(contenedor, ruta, navegar) {
    vista = contenedor;
    ir = navegar;
    if (!borrador) borrador = vacio();
    formulario();
    return { titulo: "Egresos", subtitulo: "Gastos del emprendimiento" };
  }

  // ---------- El formulario ----------

  function formulario(mensaje) {
    const listas = window.Datos.todo().listas;
    const rubros = listas.rubros || [];
    const medios = listas.medios_pago || [];

    vista.innerHTML = `
      ${mensaje || ""}

      <div class="tarjeta">
        <div class="fila">
          <div class="campo">
            <label for="g-fecha">Fecha</label>
            <input type="date" id="g-fecha" value="${esc(borrador.fecha)}">
          </div>
          <div class="campo">
            <label for="g-monto">Monto <span class="obliga">•</span></label>
            <input type="text" id="g-monto" class="numero" inputmode="decimal"
                   placeholder="0" value="${esc(borrador.monto)}">
          </div>
        </div>

        <div class="campo">
          <label for="g-rubro">Rubro <span class="obliga">•</span></label>
          <select id="g-rubro">
            <option value="">Elegí…</option>
            ${rubros.map((r) => `<option value="${esc(r)}"${r === borrador.rubro ? " selected" : ""}>${esc(r)}</option>`).join("")}
          </select>
        </div>

        <div class="campo">
          <label for="g-detalle">Detalle <span class="obliga">•</span></label>
          <span class="ayuda">Qué se compró o se pagó. Es lo que se lee en la planilla.</span>
          <input type="text" id="g-detalle" value="${esc(borrador.detalle)}"
                 placeholder="frascos 660 y tapas" list="g-detalles">
          <datalist id="g-detalles">
            ${detallesUsados().map((d) => `<option value="${esc(d)}"></option>`).join("")}
          </datalist>
        </div>

        <div class="fila">
          <div class="campo">
            <label for="g-cantidad">Cantidad</label>
            <span class="ayuda">Con su unidad: 15 kg, 2 cajas, 7 turnos.</span>
            <input type="text" id="g-cantidad" value="${esc(borrador.cantidad)}" placeholder="opcional">
          </div>
          <div class="campo">
            <label for="g-medio">Medio de pago <span class="obliga">•</span></label>
            <select id="g-medio">
              <option value="">Elegí…</option>
              ${medios.map((m) => `<option value="${esc(m)}"${m === borrador.medio_pago ? " selected" : ""}>${esc(m)}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="campo">
          <label for="g-obs">Observaciones</label>
          <input type="text" id="g-obs" value="${esc(borrador.obs)}" placeholder="opcional">
        </div>

        <p class="campo__error" id="g-error" hidden></p>
        <button class="boton boton--ancho" id="g-guardar">Guardar el egreso</button>
      </div>

      ${ultimos()}`;

    enganchar();
  }

  // Los detalles que ya usaron, para no volver a escribir «etiquetas bari»
  // veinte veces y para que en la planilla se escriban siempre igual.
  function detallesUsados() {
    const vistos = {};
    (window.Datos.todo().egresos || []).forEach((e) => {
      const d = String(e.detalle || "").trim();
      if (d) vistos[d] = (vistos[d] || 0) + 1;
    });
    return Object.keys(vistos)
      .sort((a, b) => vistos[b] - vistos[a])
      .slice(0, 40);
  }

  function leer() {
    borrador.fecha = document.getElementById("g-fecha").value || hoy();
    borrador.rubro = document.getElementById("g-rubro").value;
    borrador.detalle = document.getElementById("g-detalle").value.trim();
    borrador.cantidad = document.getElementById("g-cantidad").value.trim();
    borrador.monto = document.getElementById("g-monto").value;
    borrador.medio_pago = document.getElementById("g-medio").value;
    borrador.obs = document.getElementById("g-obs").value.trim();
  }

  async function guardar() {
    leer();
    const mal = (texto) => {
      const e = document.getElementById("g-error");
      e.textContent = texto;
      e.hidden = false;
      e.scrollIntoView({ block: "center" });
    };
    document.getElementById("g-error").hidden = true;

    const monto = aNumero(borrador.monto);
    if (!borrador.rubro) return mal("Elegí el rubro.");
    if (!borrador.detalle) return mal("Escribí qué se compró o se pagó.");
    if (!Number.isFinite(monto) || monto <= 0) return mal("El monto tiene que ser un número mayor que cero.");
    if (!borrador.medio_pago) return mal("Elegí el medio de pago.");

    await window.CVDB.guardar("egresos", {
      id: window.Util.nuevoId(),
      fecha: borrador.fecha,
      rubro: borrador.rubro,
      detalle: borrador.detalle,
      cantidad: borrador.cantidad,
      monto: monto,
      medio_pago: borrador.medio_pago,
      obs: borrador.obs,
    });
    await window.Datos.cargar();
    window.Sincro.sincronizar(true);

    const detalle = borrador.detalle;
    // La fecha, el rubro y el medio de pago se quedan: cuando se cargan los
    // gastos del mes, casi todos comparten los tres.
    borrador = Object.assign(vacio(), {
      fecha: borrador.fecha, rubro: borrador.rubro, medio_pago: borrador.medio_pago,
    });

    formulario(`<p class="aviso aviso--ok">Guardado: ${esc(detalle)}, ${dinero(monto)}.</p>`);
  }

  // ---------- Los últimos ----------

  function ultimos() {
    const todos = (window.Datos.todo().egresos || [])
      .slice()
      .sort((a, b) => (a.fecha === b.fecha ? (b.mod || 0) - (a.mod || 0) : (a.fecha < b.fecha ? 1 : -1)));

    if (!todos.length) return "";

    const delMes = todos.filter((e) => mesDe(e.fecha) === mesDe(hoy()));
    const gastadoEsteMes = delMes.reduce((n, e) => n + (Number(e.monto) || 0), 0);

    return `
      ${delMes.length ? `
        <div class="cifras">
          <div class="cifra cifra--sale">
            <span class="cifra__que">Gastado en ${esc(mesLargo(mesDe(hoy())))}</span>
            <span class="cifra__cuanto">${dinero(gastadoEsteMes)}</span>
          </div>
          <div class="cifra cifra--sale">
            <span class="cifra__que">Movimientos del mes</span>
            <span class="cifra__cuanto">${delMes.length}</span>
          </div>
        </div>` : ""}

      <h2 class="separado">Últimos egresos</h2>
      <ul class="renglones">
        ${todos.slice(0, 12).map((e) => `
          <li class="renglon renglon--sale">
            <span class="renglon__texto">
              <span class="renglon__que">${esc(e.detalle || e.rubro)}</span>
              <span class="renglon__detalle">${fecha(e.fecha)} · ${esc(e.rubro)}${
                e.cantidad ? " · " + esc(e.cantidad) : ""} · ${esc(e.medio_pago)}</span>
            </span>
            <span class="renglon__cuanto">${dinero(e.monto)}</span>
            <button class="boton--peligro" data-borrar="${esc(e.id)}"
                    aria-label="Borrar ${esc(e.detalle)}">&#10005;</button>
          </li>`).join("")}
      </ul>`;
  }

  function enganchar() {
    ["g-fecha", "g-rubro", "g-medio"].forEach((id) => {
      document.getElementById(id).onchange = leer;
    });
    ["g-detalle", "g-cantidad", "g-monto", "g-obs"].forEach((id) => {
      document.getElementById(id).oninput = leer;
    });
    unaVez(document.getElementById("g-guardar"), guardar);

    vista.querySelectorAll("[data-borrar]").forEach((b) => {
      unaVez(b, async () => {
        await window.CVDB.borrar("egresos", b.dataset.borrar);
        await window.Datos.cargar();
        window.Sincro.sincronizar(true);
        formulario(`<p class="aviso aviso--ok">Egreso borrado.</p>`);
      });
    });
  }

  return { render };
})();
