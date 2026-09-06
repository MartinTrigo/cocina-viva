// ==========================================================================
// Cocina Viva — Honorarios
//
// Las horas de trabajo de cada una, lo que valen, y lo que se les pagó.
//
// Esto ya lo habían intentado: en la planilla vieja hay una hoja «Labores» con
// las horas de Luna, de Melí y de una ayudante, anotadas por fecha y por tarea.
// Se cortó a principios de 2024. El motivo es evidente: anotar horas todos los
// días en una planilla es fricción pura. Acá el formulario está arriba de todo
// y son cuatro toques.
//
// CÓMO SE CALCULA LO QUE SE DEBE. No se marcan horas como «liquidadas» una por
// una: se acumula el valor de todo lo trabajado y se le resta todo lo pagado.
//
//     saldo = Σ (horas × precio de la hora) − Σ (pagos a esa persona)
//
// Es más simple y es como trabajan de verdad: se paga un monto, no un conjunto
// de horas concretas. Y aguanta que el precio de la hora cambie sin tener que
// reescribir la historia.
//
// EL PAGO ES UN EGRESO. Liquidar no inventa un registro nuevo: escribe una fila
// en «egresos» con rubro Honorarios, que es donde tiene que estar para que el
// balance del resumen cierre. La columna «persona» de esa fila es lo que
// permite saber a quién se le pagó sin adivinarlo del texto del detalle.
// ==========================================================================

window.Honorarios = (function () {
  const { esc, dinero, numero, aNumero, hoy, fecha, mesDe, mesLargo, unaVez } = window.Util;

  // En qué se va el tiempo. Tiene que coincidir con ACTIVIDADES de Code.gs,
  // que es la que ofrece la planilla al cargar una hora a mano.
  const ACTIVIDADES = ["elaboración", "envasado", "administración", "reparto",
                       "comercialización", "comunicación", "mantenimiento"];

  // Con quiénes arranca la primera vez. Después se cambian desde Configuración:
  // esto es solo para que la pantalla no aparezca vacía y sin nada que tocar.
  const AL_PRINCIPIO = [
    { nombre: "Luna", cargo: "socia" },
    { nombre: "Melí", cargo: "socia" },
    { nombre: "Trabajadora 1", cargo: "trabajadora" },
    { nombre: "Trabajadora 2", cargo: "trabajadora" },
  ];

  let vista = null;
  let ir = null;
  let periodo = "";        // "" = todo; si no, "aaaa-mm" o "aaaa"
  let editando = "";       // id de la hora que se está corrigiendo

  async function render(contenedor, ruta, navegar) {
    vista = contenedor;
    ir = navegar;

    await sembrarPersonas();

    const que = ruta.split("/")[1] || "";
    if (que === "liquidar") {
      formularioDeLiquidacion();
      return { titulo: "Liquidar horas", subtitulo: "Pagar el trabajo" };
    }
    if (que === "config") {
      configuracion();
      return { titulo: "Configuración", subtitulo: "Quiénes trabajan y cuánto vale la hora" };
    }

    editando = "";
    pintar();
    return { titulo: "Honorarios", subtitulo: "Horas de trabajo y pagos" };
  }

  // La primera vez no hay nadie cargado y la pantalla no serviría para nada.
  // Se siembra una sola vez: si después las borran a todas, no vuelven.
  async function sembrarPersonas() {
    if (window.Datos.todo().personas.length) return;
    if (localStorage.getItem("cocinaviva_personas_sembradas")) return;
    const ahora = Date.now();
    for (const p of AL_PRINCIPIO) {
      await window.CVDB.guardar("personas", {
        nombre: p.nombre, cargo: p.cargo, precio_hora: 0, activo: true, mod: ahora,
      });
    }
    try { localStorage.setItem("cocinaviva_personas_sembradas", "1"); } catch (e) {}
    await window.Datos.cargar();
  }

  // ==========================================================================
  // Cálculos
  // ==========================================================================

  const horasTodas = () => (window.Datos.todo().horas || []);

  // Los pagos de honorarios son egresos con una persona anotada.
  const pagosTodos = () => (window.Datos.todo().egresos || [])
    .filter((e) => String(e.persona || "").trim());

  // "" es todo; "2026" es un año; "2026-09" es un mes.
  const entra = (f) => !periodo || String(f || "").slice(0, periodo.length) === periodo;

  const horasDelPeriodo = () => horasTodas().filter((h) => entra(h.fecha));
  const pagosDelPeriodo = () => pagosTodos().filter((e) => entra(e.fecha));

  // Lo que vale un rato de trabajo. El precio sale de la persona HOY: si le
  // suben la hora, sube el valor de lo que todavía no cobró, que es lo que
  // ellas esperan que pase.
  const valorDe = (h) => (Number(h.horas) || 0) * window.Datos.precioHora(h.persona);

  // El saldo de cada una: todo lo trabajado menos todo lo pagado, SIEMPRE sobre
  // la historia completa y no sobre el período elegido. Una deuda no se achica
  // porque uno mire un mes más corto.
  function saldos() {
    const cuenta = {};
    const tocar = (n) => {
      const k = String(n || "").trim();
      if (!k) return null;
      if (!cuenta[k]) cuenta[k] = { nombre: k, horas: 0, ganado: 0, pagado: 0 };
      return cuenta[k];
    };
    horasTodas().forEach((h) => {
      const c = tocar(h.persona);
      if (!c) return;
      c.horas += Number(h.horas) || 0;
      c.ganado += valorDe(h);
    });
    pagosTodos().forEach((e) => {
      const c = tocar(e.persona);
      if (c) c.pagado += Number(e.monto) || 0;
    });
    return Object.keys(cuenta).map((k) => {
      const c = cuenta[k];
      c.saldo = c.ganado - c.pagado;
      return c;
    }).sort((a, b) => b.saldo - a.saldo);
  }

  const agrupar = (lista, porQue, cuanto) => {
    const suma = {};
    lista.forEach((f) => {
      const k = String(porQue(f) || "—");
      suma[k] = (suma[k] || 0) + (Number(cuanto(f)) || 0);
    });
    return Object.keys(suma).map((k) => ({ que: k, cuanto: suma[k] }))
      .sort((a, b) => b.cuanto - a.cuanto);
  };

  // Los meses y años con horas cargadas, para el selector de período.
  function periodosConDatos() {
    const meses = [...new Set(horasTodas().map((h) => mesDe(h.fecha)).filter(Boolean))].sort().reverse();
    const anios = [...new Set(meses.map((m) => m.slice(0, 4)))].sort().reverse();
    return { meses, anios };
  }

  const enHoras = (n) => {
    const r = Math.round(n * 10) / 10;
    return numero(r) + (r === 1 ? " hora" : " horas");
  };

  // ==========================================================================
  // La pantalla principal
  // ==========================================================================

  function pintar(mensaje) {
    const personas = window.Datos.personasActivas();
    const delPeriodo = horasDelPeriodo();
    const horasSuma = delPeriodo.reduce((n, h) => n + (Number(h.horas) || 0), 0);
    const valorSuma = delPeriodo.reduce((n, h) => n + valorDe(h), 0);
    const conSaldo = saldos().filter((s) => Math.round(s.saldo) > 0);
    const deuda = conSaldo.reduce((n, s) => n + s.saldo, 0);
    const enEdicion = editando ? horasTodas().find((h) => h.id === editando) : null;

    vista.innerHTML = `
      ${mensaje || ""}

      <div class="cifras">
        <div class="cifra cifra--sale">
          <span class="cifra__que">Trabajado${periodo ? " · " + esc(nombrePeriodo()) : ""}</span>
          <span class="cifra__cuanto">${enHoras(horasSuma)}</span>
        </div>
        <div class="cifra cifra--saldo">
          <span class="cifra__que">Falta pagar</span>
          <span class="cifra__cuanto${deuda > 0 ? " negativo" : ""}">${dinero(deuda)}</span>
        </div>
      </div>

      ${!personas.length ? `
        <p class="aviso aviso--info">No hay nadie cargado todavía. Andá a
           <strong>Configuración</strong>, acá abajo, y agregá a quienes trabajan.</p>` : `

      <div class="tarjeta">
        <h2>${enEdicion ? "Corregir estas horas" : "Sumar horas"}</h2>

        <div class="fila">
          <div class="campo">
            <label for="h-fecha">Fecha</label>
            <input type="date" id="h-fecha" value="${esc(enEdicion ? enEdicion.fecha : hoy())}">
          </div>
          <div class="campo">
            <label for="h-horas">Cuántas horas <span class="obliga">•</span></label>
            <input type="text" id="h-horas" class="numero" inputmode="decimal"
                   placeholder="0" value="${esc(enEdicion ? enEdicion.horas : "")}">
          </div>
        </div>

        <div class="campo">
          <label for="h-persona">Quién <span class="obliga">•</span></label>
          <select id="h-persona">
            ${personas.map((p) => `
              <option value="${esc(p.nombre)}"${enEdicion && enEdicion.persona === p.nombre ? " selected" : ""}>${esc(p.nombre)}${p.cargo ? " · " + esc(p.cargo) : ""}</option>`).join("")}
          </select>
        </div>

        <div class="campo">
          <label for="h-actividad">Actividad <span class="obliga">•</span></label>
          <select id="h-actividad">
            ${ACTIVIDADES.map((a) => `
              <option value="${esc(a)}"${enEdicion && enEdicion.actividad === a ? " selected" : ""}>${esc(a)}</option>`).join("")}
          </select>
        </div>

        <div class="campo">
          <label for="h-obs">Observaciones</label>
          <input type="text" id="h-obs" placeholder="opcional"
                 value="${esc(enEdicion ? enEdicion.obs || "" : "")}">
        </div>

        <p class="resumen-vivo" id="h-vivo" hidden></p>
        <p class="campo__error" id="h-error" hidden></p>
        <button class="boton boton--ancho" id="btn-sumar">
          ${enEdicion ? "Guardar los cambios" : "Sumar las horas"}
        </button>
        ${enEdicion ? `
          <button class="boton boton--secundario boton--ancho separado" id="btn-cancelar">
            Cancelar
          </button>` : ""}
      </div>`}

      ${ultimasHoras()}

      ${personas.length ? `
        <button class="boton boton--ancho separado" id="btn-liquidar">Liquidar horas</button>` : ""}

      ${resumen()}

      <button class="boton boton--secundario boton--ancho separado" id="btn-config">
        ⚙ Configuración
      </button>`;

    enganchar();
    vivo();
  }

  const nombrePeriodo = () =>
    periodo.length === 7 ? mesLargo(periodo) : periodo;

  // ---------- Las últimas que se cargaron ----------

  function ultimasHoras() {
    const ultimas = horasTodas()
      .slice()
      .sort((a, b) => (a.fecha === b.fecha ? (b.mod || 0) - (a.mod || 0) : (a.fecha < b.fecha ? 1 : -1)))
      .slice(0, 5);
    if (!ultimas.length) return "";

    return `
      <h2 class="separado">Últimas horas cargadas</h2>
      <ul class="renglones">
        ${ultimas.map((h) => `
          <li class="renglon renglon--sale">
            <span class="renglon__texto">
              <span class="renglon__que">${esc(h.persona)} · ${enHoras(h.horas)}</span>
              <span class="renglon__detalle">${fecha(h.fecha)} · ${esc(h.actividad || "sin actividad")}${
                h.obs ? " · " + esc(h.obs) : ""}</span>
            </span>
            <span class="renglon__cuanto">${dinero(valorDe(h))}</span>
            <button class="lapiz" data-editar="${esc(h.id)}"
                    aria-label="Corregir las horas de ${esc(h.persona)}">&#9998;</button>
            <button class="quitar" data-borrar="${esc(h.id)}"
                    aria-label="Borrar las horas de ${esc(h.persona)}">&#10005;</button>
          </li>`).join("")}
      </ul>`;
  }

  // ---------- El resumen ----------

  function resumen() {
    if (!horasTodas().length) return "";
    const { meses, anios } = periodosConDatos();
    const delPeriodo = horasDelPeriodo();
    const cuentas = saldos();

    const porPersona = {};
    delPeriodo.forEach((h) => {
      const k = String(h.persona || "—");
      if (!porPersona[k]) porPersona[k] = { horas: 0, plata: 0 };
      porPersona[k].horas += Number(h.horas) || 0;
      porPersona[k].plata += valorDe(h);
    });
    const filas = Object.keys(porPersona)
      .map((k) => Object.assign({ nombre: k }, porPersona[k]))
      .sort((a, b) => b.horas - a.horas);

    const porActividad = agrupar(delPeriodo, (h) => h.actividad, (h) => h.horas);
    const totalHoras = filas.reduce((n, f) => n + f.horas, 0);
    const totalPlata = filas.reduce((n, f) => n + f.plata, 0);

    return `
      <h2 class="separado">Resumen</h2>

      <div class="campo">
        <label for="h-periodo">Período</label>
        <select id="h-periodo">
          <option value=""${periodo === "" ? " selected" : ""}>Todo lo cargado</option>
          ${anios.map((a) => `
            <option value="${a}"${periodo === a ? " selected" : ""}>Año ${a}</option>`).join("")}
          ${meses.map((m) => `
            <option value="${m}"${periodo === m ? " selected" : ""}>${esc(mesLargo(m))}</option>`).join("")}
        </select>
      </div>

      ${filas.length ? `
        <h3 class="subtitulo">Quién trabajó</h3>
        <div class="tabla-envoltorio">
          <table class="tabla">
            <thead>
              <tr><th>Persona</th><th class="numero">Horas</th><th class="numero">Vale</th></tr>
            </thead>
            <tbody>
              ${filas.map((f) => `
                <tr>
                  <td>
                    <span class="celda__que">${esc(f.nombre)}</span>
                    <span class="celda__detalle">${dinero(window.Datos.precioHora(f.nombre))} la hora</span>
                  </td>
                  <td class="numero">${numero(Math.round(f.horas * 10) / 10)}</td>
                  <td class="numero">${dinero(f.plata)}</td>
                </tr>`).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td class="numero">${numero(Math.round(totalHoras * 10) / 10)}</td>
                <td class="numero">${dinero(totalPlata)}</td>
              </tr>
            </tfoot>
          </table>
        </div>` : `<p class="vacio">No hay horas cargadas en este período.</p>`}

      ${porActividad.length ? `
        <h3 class="subtitulo">En qué se fue el tiempo</h3>
        ${barras(porActividad, totalHoras)}` : ""}

      <h3 class="subtitulo">Cuentas al día</h3>
      <p class="nota">Todo lo trabajado desde siempre, menos todo lo pagado. No
         depende del período: una deuda no se achica mirando un mes más corto.</p>
      <div class="tabla-envoltorio">
        <table class="tabla">
          <thead>
            <tr><th>Persona</th><th class="numero">Ganó</th><th class="numero">Cobró</th><th class="numero">Saldo</th></tr>
          </thead>
          <tbody>
            ${cuentas.map((c) => `
              <tr>
                <td>
                  <span class="celda__que">${esc(c.nombre)}</span>
                  <span class="celda__detalle">${enHoras(c.horas)}</span>
                </td>
                <td class="numero">${dinero(c.ganado)}</td>
                <td class="numero">${dinero(c.pagado)}</td>
                <td class="numero saldo${c.saldo > 0 ? " negativo" : ""}">${dinero(c.saldo)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p class="nota">El saldo en rojo es lo que se les debe. En negro y con
         signo menos, lo que cobraron de más y queda a cuenta.</p>`;
  }

  // Mismas barras que el resumen general, con las mismas clases: una pantalla
  // nueva que inventa su propio dibujo para lo mismo envejece distinto que el
  // resto. El ancho se pone después con CSSOM porque la política de seguridad
  // de la app no admite estilos escritos en el HTML.
  function barras(grupos, total) {
    if (!grupos.length) return "";
    const tope = Math.max(...grupos.map((g) => g.cuanto), 1);
    return `
      <ul class="desglose">
        ${grupos.map((g) => `
          <li class="desglose__fila">
            <span class="desglose__que">${esc(g.que)}</span>
            <span class="desglose__pista">
              <i class="desglose__barra" data-tono="tierra"
                 data-ancho="${Math.round((g.cuanto / tope) * 100)}"></i>
            </span>
            <span class="desglose__cuanto">${numero(Math.round(g.cuanto * 10) / 10)} h
              <span class="desglose__pct">${total ? Math.round((g.cuanto / total) * 100) : 0}%</span>
            </span>
          </li>`).join("")}
      </ul>`;
  }

  function pintarBarras() {
    vista.querySelectorAll("[data-ancho]").forEach((b) => {
      b.style.width = b.dataset.ancho + "%";
    });
  }

  // ---------- El texto vivo del formulario ----------

  function vivo() {
    const caja = document.getElementById("h-vivo");
    if (!caja) return;
    const n = aNumero(document.getElementById("h-horas").value);
    const quien = document.getElementById("h-persona").value;
    if (!Number.isFinite(n) || n <= 0 || !quien) { caja.hidden = true; return; }

    const precio = window.Datos.precioHora(quien);
    caja.className = "resumen-vivo";
    caja.innerHTML = precio
      ? `Son <strong>${dinero(n * precio)}</strong> para ${esc(quien)},
         a ${dinero(precio)} la hora.`
      : `<strong>${esc(quien)} no tiene precio por hora cargado.</strong> Las horas
         se guardan igual, pero no van a valer nada hasta que se lo pongas en
         Configuración.`;
    caja.hidden = false;
  }

  // ==========================================================================
  // Guardar horas
  // ==========================================================================

  async function sumarHoras() {
    const mal = (t) => {
      const e = document.getElementById("h-error");
      e.textContent = t;
      e.hidden = false;
    };
    document.getElementById("h-error").hidden = true;

    const cuando = document.getElementById("h-fecha").value || hoy();
    const quien = document.getElementById("h-persona").value;
    const actividad = document.getElementById("h-actividad").value;
    const obs = document.getElementById("h-obs").value.trim();
    const n = aNumero(document.getElementById("h-horas").value);

    if (!quien) return mal("Elegí quién trabajó.");
    if (!Number.isFinite(n) || n <= 0) return mal("Las horas tienen que ser un número mayor que cero.");
    if (n > 24) return mal("Son más de 24 horas en un día. Revisá el número.");

    const registro = {
      id: editando || window.Util.nuevoId(),
      fecha: cuando, persona: quien, actividad: actividad, horas: n, obs: obs,
    };
    await window.CVDB.guardar("horas", Object.assign({}, registro, { mod: Date.now() }));
    await window.Datos.cargar();
    window.Sincro.sincronizar(true);

    const era = editando;
    editando = "";
    pintar(`<p class="aviso aviso--ok">${era ? "Corregido" : "Cargado"}:
      ${esc(quien)}, ${enHoras(n)} de ${esc(actividad)}.</p>`);
  }

  async function borrarHoras(id) {
    const h = horasTodas().find((x) => x.id === id);
    if (!h) return;
    await window.CVDB.borrar("horas", id);
    await window.Datos.cargar();
    window.Sincro.sincronizar(true);
    if (editando === id) editando = "";
    pintar(`<p class="aviso aviso--ok">Borrado: ${esc(h.persona)},
      ${enHoras(h.horas)} del ${fecha(h.fecha)}.</p>`);
  }

  // ==========================================================================
  // Liquidar
  // ==========================================================================

  function formularioDeLiquidacion(mensaje) {
    const personas = window.Datos.personasActivas();
    const medios = (window.Datos.todo().listas.medios_pago || []);
    const cuentas = saldos();
    const deuda = (n) => {
      const c = cuentas.find((x) => x.nombre === n);
      return c ? c.saldo : 0;
    };

    vista.innerHTML = `
      ${mensaje || ""}

      <div class="tarjeta">
        <h2>Liquidar horas</h2>
        <p class="nota">Se anota el pago y se agrega solo como egreso en el rubro
           Honorarios. No hace falta cargarlo dos veces.</p>

        <div class="fila">
          <div class="campo">
            <label for="l-fecha">Fecha</label>
            <input type="date" id="l-fecha" value="${hoy()}">
          </div>
          <div class="campo">
            <label for="l-monto">Monto <span class="obliga">•</span></label>
            <input type="text" id="l-monto" class="numero" inputmode="decimal" placeholder="0">
          </div>
        </div>

        <div class="campo">
          <label for="l-persona">A quién <span class="obliga">•</span></label>
          <select id="l-persona">
            ${personas.map((p) => `
              <option value="${esc(p.nombre)}">${esc(p.nombre)}${
                deuda(p.nombre) > 0 ? " · se le deben " + dinero(deuda(p.nombre)) : ""}</option>`).join("")}
          </select>
        </div>

        <div class="campo">
          <label for="l-medio">Medio de pago <span class="obliga">•</span></label>
          <select id="l-medio">
            <option value="">Elegí…</option>
            ${medios.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("")}
          </select>
        </div>

        <div class="campo">
          <label for="l-obs">Observaciones</label>
          <input type="text" id="l-obs" placeholder="opcional">
        </div>

        <p class="resumen-vivo" id="l-vivo" hidden></p>
        <p class="campo__error" id="l-error" hidden></p>
        <button class="boton boton--ancho" id="btn-liquidar-recibo">
          Liquidar y generar recibo
        </button>
        <button class="boton boton--secundario boton--ancho separado" id="btn-liquidar-solo">
          Liquidar sin recibo
        </button>
        <button class="boton boton--secundario boton--ancho separado" id="btn-volver-liquidar">
          Volver
        </button>
      </div>

      <div id="l-recibo"></div>`;

    const refrescar = () => {
      const caja = document.getElementById("l-vivo");
      const quien = document.getElementById("l-persona").value;
      const monto = aNumero(document.getElementById("l-monto").value);
      const antes = deuda(quien);
      if (!quien || !Number.isFinite(monto) || monto <= 0) { caja.hidden = true; return; }
      const queda = antes - monto;
      caja.className = "resumen-vivo" + (queda < 0 ? " resumen-vivo--resta" : "");
      caja.innerHTML = `A ${esc(quien)} se le ${antes >= 0 ? "deben" : "deben"}
        <strong>${dinero(antes)}</strong>. Pagando ${dinero(monto)},
        ${Math.round(queda) === 0
          ? "queda <strong>al día</strong>."
          : (queda > 0
             ? "quedan debiéndole <strong>" + dinero(queda) + "</strong>."
             : "queda <strong>" + dinero(-queda) + "</strong> a favor de ustedes.")}`;
      caja.hidden = false;
    };
    ["l-persona", "l-monto"].forEach((id) => {
      const e = document.getElementById(id);
      e.oninput = refrescar;
      e.onchange = refrescar;
    });

    unaVez(document.getElementById("btn-liquidar-solo"), () => liquidar(false));
    unaVez(document.getElementById("btn-liquidar-recibo"), () => liquidar(true));
    document.getElementById("btn-volver-liquidar").onclick = () => ir("honorarios");
  }

  async function liquidar(conRecibo) {
    const mal = (t) => {
      const e = document.getElementById("l-error");
      e.textContent = t;
      e.hidden = false;
    };
    document.getElementById("l-error").hidden = true;

    const cuando = document.getElementById("l-fecha").value || hoy();
    const quien = document.getElementById("l-persona").value;
    const medio = document.getElementById("l-medio").value;
    const obs = document.getElementById("l-obs").value.trim();
    const monto = aNumero(document.getElementById("l-monto").value);

    if (!quien) return mal("Elegí a quién le estás pagando.");
    if (!Number.isFinite(monto) || monto <= 0) return mal("El monto tiene que ser mayor que cero.");
    if (!medio) return mal("Elegí el medio de pago.");

    const antes = (saldos().find((s) => s.nombre === quien) || { saldo: 0 }).saldo;

    // El pago ES el egreso. Que la fila la escriba esta pantalla y no la de
    // Egresos evita el paso de cargarlo dos veces, que es donde se olvidan.
    const egreso = {
      id: window.Util.nuevoId(),
      fecha: cuando,
      rubro: "Honorarios",
      detalle: "hs " + quien,
      persona: quien,
      cantidad: "",
      monto: monto,
      medio_pago: medio,
      obs: obs || "Liquidación de horas",
    };
    await window.CVDB.guardar("egresos", Object.assign({}, egreso, { mod: Date.now() }));
    await window.Datos.cargar();
    window.Sincro.sincronizar(true);

    if (!conRecibo) {
      window.Util.brindis("Liquidado: " + quien + ", " + dinero(monto) + ".");
      ir("honorarios");
      return;
    }

    formularioDeLiquidacion(`<p class="aviso aviso--ok">Liquidado:
      ${esc(quien)}, ${dinero(monto)}.</p>`);
    await generarRecibo(egreso, antes);
  }

  async function generarRecibo(egreso, saldoAntes) {
    const caja = document.getElementById("l-recibo");
    const datos = {
      titulo: "RECIBO",
      numero: egreso.id.slice(0, 6).toUpperCase(),
      fecha: egreso.fecha,
      cliente: egreso.persona,
      etiquetaCliente: "PAGADO A",
      leyenda: "Honorarios · " + egreso.medio_pago,
      conPrecios: true,
      lineas: [{
        nombre: "Horas de trabajo", cod: "",
        cantidad: 1, precio: egreso.monto, subtotal: egreso.monto,
      }],
      total: egreso.monto,
      obs: (saldoAntes - egreso.monto) > 0
        ? "Saldo pendiente: " + dinero(saldoAntes - egreso.monto)
        : (egreso.obs || ""),
    };

    try {
      const url = await window.Remito.vistaPrevia(datos);
      caja.innerHTML = `
        <figure class="remito"><img src="${url}" alt="Recibo para ${esc(egreso.persona)}"></figure>
        <div class="acciones">
          <button class="boton" id="btn-compartir">Compartir</button>
          <button class="boton boton--secundario" id="btn-imprimir">Imprimir</button>
        </div>`;
      document.getElementById("btn-compartir").onclick = async () => {
        const r = await window.Remito.compartir(datos);
        if (r.como === "descargado") window.Util.brindis("Descargado: " + r.nombre);
        if (r.como === "compartido") window.Util.brindis("Enviado.");
      };
      document.getElementById("btn-imprimir").onclick = () => window.Remito.imprimir(datos);
    } catch (err) {
      caja.innerHTML = `<p class="aviso aviso--error">El pago se guardó, pero el recibo
        no se pudo armar. Detalle: ${esc(err.message || err)}</p>`;
    }
  }

  // ==========================================================================
  // Configuración
  // ==========================================================================

  function configuracion(mensaje) {
    const personas = window.Datos.todo().personas;

    vista.innerHTML = `
      ${mensaje || ""}

      <p class="nota">Quiénes trabajan, qué hacen y cuánto vale su hora. El precio
         se usa para calcular lo que vale cada rato de trabajo, así que cambiarlo
         cambia también lo que todavía no se cobró.</p>

      ${personas.length ? `
        <ul class="renglones">
          ${personas.map((p) => `
            <li class="renglon ${p.activo === false ? "en-cero" : "renglon--sale"}">
              <span class="renglon__texto">
                <span class="renglon__que">${esc(p.nombre)}</span>
                <span class="renglon__detalle">${esc(p.cargo || "sin cargo")}${
                  p.activo === false ? " · dada de baja" : ""}</span>
              </span>
              <span class="renglon__cuanto">${p.precio_hora ? dinero(p.precio_hora) + "/h" : "sin precio"}</span>
              <button class="lapiz" data-persona="${esc(p.nombre)}"
                      aria-label="Editar a ${esc(p.nombre)}">&#9998;</button>
            </li>`).join("")}
        </ul>` : `<p class="vacio">Todavía no hay nadie cargado.</p>`}

      <div class="tarjeta separado">
        <h2 id="p-titulo">Agregar una persona</h2>
        <div class="campo">
          <label for="p-nombre">Nombre <span class="obliga">•</span></label>
          <input type="text" id="p-nombre" autocomplete="off" placeholder="Como le dicen">
        </div>
        <div class="fila">
          <div class="campo">
            <label for="p-cargo">Cargo o función</label>
            <input type="text" id="p-cargo" autocomplete="off" placeholder="socia, trabajadora…">
          </div>
          <div class="campo">
            <label for="p-precio">Precio por hora</label>
            <input type="text" id="p-precio" class="numero" inputmode="decimal" placeholder="0">
          </div>
        </div>
        <p class="campo__error" id="p-error" hidden></p>
        <button class="boton boton--ancho" id="btn-persona">Guardar</button>
        <button class="boton boton--secundario boton--ancho separado" id="btn-limpiar" hidden>
          Cancelar la edición
        </button>
        <div id="p-baja"></div>
      </div>

      <button class="boton boton--secundario boton--ancho separado" id="btn-volver-config">
        Volver a Honorarios
      </button>`;

    let editandoPersona = "";

    const cargar = (p) => {
      editandoPersona = p.nombre;
      document.getElementById("p-titulo").textContent = "Editar a " + p.nombre;
      document.getElementById("p-nombre").value = p.nombre;
      document.getElementById("p-cargo").value = p.cargo || "";
      document.getElementById("p-precio").value = p.precio_hora || "";
      document.getElementById("btn-limpiar").hidden = false;
      document.getElementById("p-baja").innerHTML = `
        <button class="boton--peligro separado" id="btn-baja">
          ${p.activo === false ? "Volver a darla de alta" : "Dar de baja"}
        </button>`;
      document.getElementById("btn-baja").onclick = async () => {
        await window.CVDB.guardar("personas",
          Object.assign({}, p, { activo: p.activo === false, mod: Date.now() }));
        await window.Datos.cargar();
        window.Sincro.sincronizar(true);
        configuracion(`<p class="aviso aviso--ok">${esc(p.nombre)}
          ${p.activo === false ? "vuelve a estar activa" : "queda dada de baja"}.</p>`);
      };
      document.getElementById("p-nombre").focus();
    };

    vista.querySelectorAll("[data-persona]").forEach((b) => {
      b.onclick = () => {
        const p = window.Datos.persona(b.dataset.persona);
        if (p) cargar(p);
      };
    });

    document.getElementById("btn-limpiar").onclick = () => configuracion();
    document.getElementById("btn-volver-config").onclick = () => ir("honorarios");

    unaVez(document.getElementById("btn-persona"), async () => {
      const mal = (t) => {
        const e = document.getElementById("p-error");
        e.textContent = t;
        e.hidden = false;
      };
      document.getElementById("p-error").hidden = true;

      const nombre = document.getElementById("p-nombre").value.trim();
      const cargo = document.getElementById("p-cargo").value.trim();
      const precio = aNumero(document.getElementById("p-precio").value);

      if (!nombre) return mal("Escribí el nombre.");
      if (document.getElementById("p-precio").value.trim() && !Number.isFinite(precio)) {
        return mal("El precio por hora tiene que ser un número.");
      }
      const repetida = window.Datos.persona(nombre);
      if (repetida && nombre !== editandoPersona) {
        return mal("Ya hay alguien que se llama «" + nombre + "».");
      }

      const previa = editandoPersona ? window.Datos.persona(editandoPersona) : null;
      await window.CVDB.guardar("personas", {
        nombre: nombre,
        cargo: cargo,
        precio_hora: Number.isFinite(precio) ? precio : 0,
        activo: previa ? previa.activo !== false : true,
        mod: Date.now(),
      });

      // Cambiar el nombre deja las horas viejas apuntando a alguien que ya no
      // existe, y su trabajo desaparecería de las cuentas. Se reescriben.
      let movidas = 0;
      if (previa && previa.nombre !== nombre) {
        for (const h of horasTodas().filter((x) => x.persona === previa.nombre)) {
          await window.CVDB.guardar("horas", Object.assign({}, h, { persona: nombre, mod: Date.now() }));
          movidas++;
        }
        for (const e of pagosTodos().filter((x) => x.persona === previa.nombre)) {
          await window.CVDB.guardar("egresos",
            Object.assign({}, e, { persona: nombre, detalle: "hs " + nombre, mod: Date.now() }));
          movidas++;
        }
        await window.CVDB.borrar("personas", previa.nombre);
      }

      await window.Datos.cargar();
      window.Sincro.sincronizar(true);
      configuracion(`<p class="aviso aviso--ok">Guardada: ${esc(nombre)}.${
        movidas ? " Se le pasaron " + movidas + " registro" + (movidas === 1 ? "" : "s")
                  + " del nombre anterior." : ""}</p>`);
    });
  }

  // ==========================================================================

  function enganchar() {
    const sumar = document.getElementById("btn-sumar");
    if (sumar) unaVez(sumar, sumarHoras);

    ["h-horas", "h-persona"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) { e.oninput = vivo; e.onchange = vivo; }
    });

    const cancelar = document.getElementById("btn-cancelar");
    if (cancelar) cancelar.onclick = () => { editando = ""; pintar(); };

    vista.querySelectorAll("[data-editar]").forEach((b) => {
      b.onclick = () => {
        editando = b.dataset.editar;
        pintar();
        const campo = document.getElementById("h-horas");
        if (campo) campo.scrollIntoView({ block: "center" });
      };
    });

    vista.querySelectorAll("[data-borrar]").forEach((b) => {
      unaVez(b, () => borrarHoras(b.dataset.borrar));
    });

    const liq = document.getElementById("btn-liquidar");
    if (liq) liq.onclick = () => ir("honorarios/liquidar");

    document.getElementById("btn-config").onclick = () => ir("honorarios/config");

    const sel = document.getElementById("h-periodo");
    if (sel) sel.onchange = () => { periodo = sel.value; pintar(); };

    pintarBarras();
  }

  return { render };
})();
