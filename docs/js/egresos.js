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

  // Qué se puede poner en «detalle» según el rubro.
  //
  // Antes era texto libre con sugerencias, y así «frascos», «Frascos» y
  // «frascos 660» terminaban siendo tres cosas distintas en el resumen. Con la
  // lista cerrada, el desglose por detalle suma bien.
  //
  // Los honorarios son la excepción: su lista se arma con las personas
  // cargadas, así que un nombre nuevo aparece acá sin tocar el código.
  const DETALLES = {
    "Insumos": ["envases", "verdura", "fruta", "condimentos", "etiquetas"],
    "Gastos Fijos": ["transporte", "alquiler"],
    "Inversión": ["equipamiento", "marca", "infraestructura", "administración"],
  };

  // El rubro que no tiene lista —«Otros Gastos»— sigue con texto libre: es
  // justamente el cajón de lo que no entra en ninguna categoría, y cerrarlo lo
  // dejaría sin sentido.
  function detallesDe(rubro) {
    if (rubro === "Honorarios") {
      return window.Datos.personasActivas().map((p) => "hs " + p.nombre);
    }
    return DETALLES[rubro] || null;
  }

  const OTRO = "__otro__";

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

        ${(() => {
          const lista = detallesDe(borrador.rubro);
          if (!lista) {
            return `
        <div class="campo">
          <label for="g-detalle">Detalle <span class="obliga">•</span></label>
          <span class="ayuda">Qué se compró o se pagó. Es lo que se lee en la planilla.</span>
          <input type="text" id="g-detalle" value="${esc(borrador.detalle)}"
                 placeholder="lo que sea" list="g-detalles">
          <datalist id="g-detalles">
            ${detallesUsados().map((d) => `<option value="${esc(d)}"></option>`).join("")}
          </datalist>
        </div>`;
          }
          const estaEnLaLista = lista.indexOf(borrador.detalle) >= 0;
          const esOtro = !!borrador.detalle && !estaEnLaLista;
          return `
        <div class="campo">
          <label for="g-detalle-sel">Detalle <span class="obliga">•</span></label>
          <select id="g-detalle-sel">
            <option value="">Elegí…</option>
            ${lista.map((d) => `
              <option value="${esc(d)}"${d === borrador.detalle ? " selected" : ""}>${esc(d)}</option>`).join("")}
            <option value="${OTRO}"${esOtro ? " selected" : ""}>otro…</option>
          </select>
          ${borrador.rubro === "Honorarios" && !lista.length ? `
            <span class="ayuda">No hay nadie cargado en <strong>Honorarios</strong>.
               Se agregan desde ahí, en Configuración.</span>` : ""}
        </div>
        <div class="campo" id="g-otro-caja"${esOtro ? "" : " hidden"}>
          <label for="g-detalle">Cuál</label>
          <input type="text" id="g-detalle" value="${esc(esOtro ? borrador.detalle : "")}"
                 placeholder="escribilo">
        </div>`;
        })()}

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

  // De «hs Luna» sale «Luna», si Luna existe. Si no coincide con nadie, queda
  // vacío: mejor un honorario sin dueño que atribuirlo a la persona equivocada.
  function personaDelDetalle(rubro, detalle) {
    if (rubro !== "Honorarios") return "";
    const nombre = String(detalle || "").replace(/^hs\s+/i, "").trim();
    return window.Datos.persona(nombre) ? nombre : "";
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
    const sel = document.getElementById("g-detalle-sel");
    const libre = document.getElementById("g-detalle");
    if (!sel) {
      borrador.detalle = libre ? libre.value.trim() : "";
    } else if (sel.value === OTRO) {
      borrador.detalle = libre ? libre.value.trim() : "";
    } else {
      borrador.detalle = sel.value;
    }
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
      // Un honorario cargado a mano también tiene que descontar del saldo de
      // esa persona, igual que si se hubiera liquidado desde Honorarios.
      persona: personaDelDetalle(borrador.rubro, borrador.detalle),
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
    ["g-fecha", "g-medio"].forEach((id) => {
      document.getElementById(id).onchange = leer;
    });

    // El rubro SÍ redibuja: de él depende qué forma tiene el campo de detalle
    // —desplegable con su lista, o texto libre— y con qué opciones.
    document.getElementById("g-rubro").onchange = () => {
      const antes = borrador.rubro;
      leer();
      // Un detalle del rubro anterior no tiene sentido en el nuevo, y quedaría
      // colgado como si lo hubieran escrito a mano.
      if (borrador.rubro !== antes) borrador.detalle = "";
      formulario();
    };
    const sel = document.getElementById("g-detalle-sel");
    if (sel) sel.onchange = () => {
      const caja = document.getElementById("g-otro-caja");
      const libre = document.getElementById("g-detalle");
      const esOtro = sel.value === OTRO;
      caja.hidden = !esOtro;
      if (esOtro) { libre.value = ""; libre.focus(); }
      leerDelFormulario();
    };

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
