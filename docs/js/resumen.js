// ==========================================================================
// Cocina Viva — Resumen
//
// Los números del emprendimiento, por mes o de todo el año. Es la única
// pantalla que no carga nada: solo mira.
//
// LOS GRÁFICOS SON SVG DIBUJADO A MANO. Una librería de gráficos sería la
// primera dependencia externa de la app y con eso se cae la política de
// contenido estricta y el «sin compilación». Un gráfico de barras y una torta
// son unas líneas de SVG, y encima salen bien impresos.
//
// LO QUE SE DESCARGA ES CSV DE VERDAD, no la tabla de la pantalla: se arma
// desde los datos, con todas las columnas, para poder abrirlo en una planilla
// y seguir trabajando ahí. El PDF sale por el diálogo de impresión: generar uno
// de verdad significa meter una librería.
// ==========================================================================

window.Resumen = (function () {
  const { esc, dinero, numero, aNumero, fecha, mesDe, mesLargo, hoy } = window.Util;

  const VERDE = "#4a6b3a";
  const TIERRA = "#a9722f";
  const BORDO = "#8c0730";

  // Colores para los rubros y los medios de pago. Se reparten por posición, así
  // que un rubro siempre tiene el mismo color mientras no cambie la lista.
  const PALETA = ["#8c0730", "#a9722f", "#4a6b3a", "#6b6560", "#b4143f", "#7a6a3f", "#5b7f8c"];

  let vista = null;

  // Arranca en el mes en curso y no en todo lo cargado. La pregunta de todos
  // los días es cómo viene este mes; el acumulado desde que se empezó se mira
  // de vez en cuando. Se cambia con el selector, y lo elegido queda mientras
  // la app esté abierta.
  let periodo = null;    // null = todavía nadie eligió; "" = todo; o "2026-08"

  function periodoInicial() {
    const lista = meses();                  // del más nuevo al más viejo
    const actual = mesDe(hoy());
    if (lista.indexOf(actual) >= 0) return actual;
    // Si el mes en curso todavía no tiene nada cargado, el último que sí:
    // una pantalla en blanco no le dice nada a nadie.
    return lista.length ? lista[0] : "";
  }

  async function render(contenedor, ruta, navegar) {
    vista = contenedor;
    if (periodo === null) periodo = periodoInicial();
    pintar();
    return { titulo: "Resumen", subtitulo: "Números del emprendimiento" };
  }

  // ---------- Los datos del período ----------

  function meses() {
    const d = window.Datos.todo();
    const vistos = {};
    (d.ingresos || []).forEach((f) => { if (f.fecha) vistos[mesDe(f.fecha)] = true; });
    (d.egresos || []).forEach((e) => { if (e.fecha) vistos[mesDe(e.fecha)] = true; });
    return Object.keys(vistos).sort().reverse();
  }

  const enPeriodo = (f) => !periodo || mesDe(f.fecha) === periodo;

  function datosDelPeriodo() {
    const d = window.Datos.todo();
    const ingresos = (d.ingresos || []).filter(enPeriodo);
    const egresos = (d.egresos || []).filter(enPeriodo);
    return {
      ingresos: ingresos,
      egresos: egresos,
      totalIngresos: ingresos.reduce((n, f) => n + (Number(f.subtotal) || 0), 0),
      totalEgresos: egresos.reduce((n, e) => n + (Number(e.monto) || 0), 0),
    };
  }

  // Agrupa una lista sumando un campo, y devuelve [{que, cuanto, cuantos}]
  // ordenado de mayor a menor.
  function agrupar(lista, porQue, cuanto) {
    const suma = {};
    const cuenta = {};
    lista.forEach((f) => {
      const k = String(porQue(f) || "—");
      suma[k] = (suma[k] || 0) + (Number(cuanto(f)) || 0);
      cuenta[k] = (cuenta[k] || 0) + 1;
    });
    return Object.keys(suma)
      .map((k) => ({ que: k, cuanto: suma[k], cuantos: cuenta[k] }))
      .sort((a, b) => b.cuanto - a.cuanto);
  }

  // ---------- La pantalla ----------

  function pintar() {
    const p = datosDelPeriodo();
    const balance = p.totalIngresos - p.totalEgresos;
    const listaMeses = meses();

    const deposito = window.Datos.stockDeposito();
    const calle = window.Datos.stockEnLaCalle();

    vista.innerHTML = `
      <div class="campo no-imprimir">
        <label for="r-periodo">Período</label>
        <select id="r-periodo">
          <option value=""${periodo === "" ? " selected" : ""}>Todo lo cargado</option>
          ${listaMeses.map((m) => `
            <option value="${m}"${m === periodo ? " selected" : ""}>${esc(mesLargo(m))}</option>`).join("")}
        </select>
      </div>

      <h2 class="solo-imprimir">Cocina Viva · ${esc(periodo ? mesLargo(periodo) : "todo lo cargado")}</h2>

      <div class="cifras cifras--tres">
        <div class="cifra cifra--entra">
          <span class="cifra__que">Ingresos</span>
          <span class="cifra__cuanto">${dinero(p.totalIngresos)}</span>
        </div>
        <div class="cifra cifra--sale">
          <span class="cifra__que">Egresos</span>
          <span class="cifra__cuanto">${dinero(p.totalEgresos)}</span>
        </div>
        <div class="cifra cifra--saldo">
          <span class="cifra__que">Balance</span>
          <span class="cifra__cuanto${balance < 0 ? " negativo" : ""}">${dinero(balance)}</span>
        </div>
      </div>

      ${!p.ingresos.length && !p.egresos.length ? `
        <p class="vacio">No hay nada cargado en este período.</p>` : ""}

      <div class="tablero">
        ${listaMeses.length > 1 ? bloque("Mes a mes",
          "Lo que entró y lo que salió, todos los meses con datos.",
          graficoMeses(), true) : ""}

        ${p.ingresos.length || p.egresos.length ? bloque("Cuánto quedó, y dónde",
          "Lo que entró menos lo que salió, medio de pago por medio de pago.",
          balancePorMedio(p), true) : ""}

        ${periodo ? bloque("Cuadrar el mes",
          "Si al contar la plata sobró o faltó, se anota acá y el mes cierra.",
          cuadrarElMes(p), true) : ""}

        ${p.egresos.length ? bloque("En qué se fue",
          "Los egresos por rubro.",
          dona(agrupar(p.egresos, (e) => e.rubro, (e) => e.monto), p.totalEgresos)) : ""}

        ${p.egresos.length ? bloque("Rubro por rubro",
          "Cada rubro abierto por lo que dice el detalle de cada gasto.",
          egresosPorDetalle(p.egresos), true) : ""}

        ${p.ingresos.length ? bloque("Qué se vendió",
          "Los ingresos por producto.",
          dona(porProducto(p.ingresos), p.totalIngresos)) : ""}

        ${p.ingresos.length ? bloque("Lo que más se vendió", "",
          tablaProductos(p.ingresos)) : ""}

        ${p.ingresos.length ? bloque("Lo que dejó",
          "Lo vendido menos lo que costó hacerlo.",
          loQueDejo(p.ingresos), true) : ""}

        ${p.ingresos.length ? bloque("Por cliente", "",
          barras(agrupar(p.ingresos, (f) => f.cliente, (f) => f.subtotal).slice(0, 12),
                 p.totalIngresos, BORDO)) : ""}

        ${bloque("Stock hoy", "No depende del período: es lo que hay en este momento.", `
          <div class="cifras">
            <div class="cifra cifra--entra">
              <span class="cifra__que">En depósito</span>
              <span class="cifra__cuanto">${dinero(window.Datos.valorDe(deposito))}</span>
            </div>
            <div class="cifra cifra--sale">
              <span class="cifra__que">En consignación</span>
              <span class="cifra__cuanto">${dinero(window.Datos.valorDe(calle))}</span>
            </div>
          </div>`, true)}
      </div>

      <div class="tarjeta no-imprimir separado">
        <h2>Llevarse los datos</h2>
        <p class="nota">Los CSV traen todas las columnas y se abren en cualquier
           planilla. Traen lo del período elegido.</p>
        <div class="acciones separado">
          <button class="boton boton--secundario" data-bajar="ingresos">Ingresos</button>
          <button class="boton boton--secundario" data-bajar="egresos">Egresos</button>
          <button class="boton boton--secundario" data-bajar="movimientos">Movimientos</button>
        </div>
        <button class="boton boton--ancho separado" id="r-imprimir">Imprimir o guardar en PDF</button>
      </div>`;

    pintarBarras();
    document.getElementById("r-periodo").onchange = (ev) => { periodo = ev.target.value; pintar(); };
    document.getElementById("r-imprimir").onclick = () => window.print();

    const abrir = document.getElementById("r-abrir-correccion");
    if (abrir) {
      abrir.onclick = () => {
        document.getElementById("r-correccion").hidden = false;
        abrir.hidden = true;
        document.getElementById("c-monto").focus();
      };
      document.getElementById("c-cancelar").onclick = () => {
        document.getElementById("r-correccion").hidden = true;
        abrir.hidden = false;
      };
      window.Util.unaVez(document.getElementById("c-guardar"), guardarCorreccion);
    }
    vista.querySelectorAll("[data-bajar]").forEach((b) => {
      b.onclick = () => bajar(b.dataset.bajar);
    });
  }

  // Un bloque del tablero. En el teléfono van uno abajo del otro; en una
  // pantalla grande se acomodan de a dos, y los que piden fila entera lo dicen.
  // Los egresos abiertos por detalle dentro de cada rubro.
  //
  // «Insumos» solo dice que la plata se fue en producir. «frascos $145.000 ·
  // repollo $96.000» dice dónde conviene mirar, que es la pregunta real. Es la
  // subcategoría que llevaban en la planilla vieja, y no hizo falta agregar
  // ninguna columna: el detalle ya se carga en cada egreso.
  function egresosPorDetalle(egresos) {
    return agrupar(egresos, (e) => e.rubro, (e) => e.monto).map((r) => {
      const suyos = egresos.filter((e) => String(e.rubro || "—") === r.que);
      const detalles = agrupar(suyos,
        (e) => String(e.detalle || "").trim() || "sin detalle", (e) => e.monto);
      return `
        <div class="desglose">
          <p class="desglose__rubro">
            <span>${esc(r.que)}</span><span>${dinero(r.cuanto)}</span>
          </p>
          <ul class="desglose__lista">
            ${detalles.map((d) => `
              <li>
                <span>${esc(d.que)}${d.cuantos > 1 ? ` <em>×${d.cuantos}</em>` : ""}</span>
                <span>${dinero(d.cuanto)}</span>
              </li>`).join("")}
          </ul>
        </div>`;
    }).join("");
  }

  /* ------------------------------------------------------------------------
     CUADRAR EL MES

     A fin de mes la plata contada casi nunca coincide con la anotada: una venta
     que nadie cargó, un egreso que salió distinto, un vuelto. Antes esa
     diferencia no tenía dónde ir y se arrastraba para siempre; el mes siguiente
     arrancaba con un error de arriba.

     La corrección se guarda donde va, no en una tabla aparte: si sobró plata es
     un ingreso, si faltó es un egreso. La plata entró o salió de verdad, y
     esconderla en un ajuste invisible sería justamente lo que hace que después
     nadie entienda un número.

     Por eso también se listan las que ya se hicieron, con su motivo: una
     corrección sin explicación es una diferencia con otro nombre.
     ------------------------------------------------------------------------ */

  // El último día del mes que se está cerrando. Si ese mes todavía no terminó,
  // hoy: fechar algo en el futuro descoloca cualquier cuenta que mire fechas.
  function diaDeCierre(mes) {
    const p = String(mes).split("-");
    const ultimo = new Date(Number(p[0]), Number(p[1]), 0);
    const dos = (n) => String(n).padStart(2, "0");
    const cierre = ultimo.getFullYear() + "-" + dos(ultimo.getMonth() + 1) + "-" + dos(ultimo.getDate());
    return cierre > hoy() ? hoy() : cierre;
  }

  function correccionesDe(p) {
    const sobraron = p.ingresos.filter(window.Datos.esCorreccion).map((f) => ({
      fecha: f.fecha, cuanto: Number(f.subtotal) || 0, medio: f.medio_pago,
      por: f.obs, sobro: true,
    }));
    const faltaron = p.egresos.filter(window.Datos.esCorreccion).map((e) => ({
      fecha: e.fecha, cuanto: Number(e.monto) || 0, medio: e.medio_pago,
      por: e.obs || e.detalle, sobro: false,
    }));
    return sobraron.concat(faltaron).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }

  function cuadrarElMes(p) {
    const hechas = correccionesDe(p);
    const medios = window.Datos.todo().listas
      ? (window.Datos.todo().listas.medios_pago || [])
      : [];
    // Si por lo que sea no bajaron las listas, se ofrecen los medios que ya
    // aparecen en el mes: siempre es mejor que un desplegable vacío.
    const vistos = {};
    p.ingresos.concat(p.egresos).forEach((f) => { if (f.medio_pago) vistos[f.medio_pago] = true; });
    const opciones = (medios.length ? medios : Object.keys(vistos).sort());

    const yaHecho = hechas.reduce((n, c) => n + (c.sobro ? c.cuanto : -c.cuanto), 0);

    return `
      ${hechas.length ? `
        <ul class="renglones">
          ${hechas.map((c) => `
            <li class="renglon">
              <span class="renglon__texto">
                <span class="renglon__que">${c.sobro ? "Sobró" : "Faltó"} plata</span>
                <span class="renglon__detalle">${esc(fecha(c.fecha))}
                  · ${esc(c.medio || "—")}${c.por ? " · " + esc(c.por) : ""}</span>
              </span>
              <span class="renglon__cuanto${c.sobro ? "" : " negativo"}">
                ${c.sobro ? "+" : "−"}${dinero(c.cuanto)}</span>
            </li>`).join("")}
        </ul>
        <p class="nota">Ya corregido en este mes: <strong>${dinero(yaHecho)}</strong>.</p>`
        : `<p class="nota">Todavía no hay ninguna corrección en este mes.</p>`}

      <button class="boton boton--ancho separado no-imprimir" id="r-abrir-correccion">
        Anotar una corrección</button>

      <div id="r-correccion" class="no-imprimir" hidden>
        <div class="campo">
          <label for="c-que">¿Qué pasó?</label>
          <select id="c-que">
            <option value="falto">Faltó plata — hay menos de lo anotado</option>
            <option value="sobro">Sobró plata — hay más de lo anotado</option>
          </select>
        </div>
        <div class="fila">
          <div class="campo">
            <label for="c-monto">Cuánto <span class="obliga">•</span></label>
            <input type="number" id="c-monto" inputmode="numeric" min="0" step="1" placeholder="0">
          </div>
          <div class="campo">
            <label for="c-medio">Medio de pago</label>
            <select id="c-medio">
              ${opciones.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="campo">
          <label for="c-por">Por qué</label>
          <input type="text" id="c-por" maxlength="120"
                 placeholder="una venta que no se anotó, un gasto que salió distinto…">
          <span class="ayuda">Dentro de un mes, esto es lo único que va a explicar el número.</span>
        </div>
        <p class="nota">Se va a guardar con fecha <strong>${esc(diaDeCierre(periodo))}</strong>,
          como un ingreso o un egreso normal, para poder verla y corregirla
          después.</p>
        <div class="acciones">
          <button class="boton" id="c-guardar">Guardar la corrección</button>
          <button class="boton boton--secundario" id="c-cancelar">Cancelar</button>
        </div>
        <p class="aviso aviso--error" id="c-error" hidden></p>
      </div>`;
  }

  // Guardarla es escribir un ingreso o un egreso común y corriente. La única
  // seña es el nombre «Corrección», que es lo que después permite listarlas
  // acá y sacarlas de donde no van —las ventas, los productos más vendidos—.
  async function guardarCorreccion() {
    const falto = document.getElementById("c-que").value === "falto";
    const monto = Math.abs(aNumero(document.getElementById("c-monto").value));
    const medio = document.getElementById("c-medio").value || "";
    const por = document.getElementById("c-por").value.trim();
    const error = document.getElementById("c-error");

    if (!monto) {
      error.textContent = "Falta poner cuánto sobró o faltó.";
      error.hidden = false;
      return;
    }
    error.hidden = true;

    const cuando = diaDeCierre(periodo);
    const nota = por || (falto ? "Faltó plata" : "Sobró plata");

    if (falto) {
      await window.CVDB.guardar("egresos", {
        id: window.Util.nuevoId(),
        fecha: cuando,
        rubro: window.Datos.CORRECCION,
        detalle: "faltó plata",
        persona: "",
        cantidad: "",
        monto: monto,
        medio_pago: medio,
        obs: nota,
        mod: Date.now(),
      });
    } else {
      // Un ingreso sin producto: registra la plata y no toca el stock, que es
      // el mismo caso de las ventas viejas importadas.
      await asegurarElCliente();
      const id = window.Util.nuevoId();
      await window.CVDB.guardar("ingresos", {
        id: id,
        venta: id,
        fecha: cuando,
        cliente: window.Datos.CORRECCION,
        lista: "mayorista",
        medio_pago: medio,
        pagado: true,
        cod: "",
        cantidad: 0,
        precio: 0,
        subtotal: monto,
        obs: nota,
        mod: Date.now(),
      });
    }

    await window.Datos.cargar();
    window.Sincro.sincronizar(true);
    window.Util.brindis((falto ? "Anotado que faltaron " : "Anotado que sobraron ") + dinero(monto));
    pintar();
  }

  // La planilla valida el cliente contra la hoja de clientes: sin esta fila, la
  // celda queda marcada como valor de afuera. Va dada de baja a propósito, así
  // no aparece en el desplegable al cargar una venta.
  async function asegurarElCliente() {
    const hay = (window.Datos.todo().clientes || [])
      .some((c) => c.nombre === window.Datos.CORRECCION);
    if (hay) return;
    await window.CVDB.guardar("clientes", {
      nombre: window.Datos.CORRECCION,
      localidad: "",
      tipo: "compra",
      medio_pago: "",
      activo: false,
      mod: Date.now(),
    });
  }

  function bloque(titulo, nota, contenido, ancho) {
    if (!contenido) return "";
    return `
      <section class="bloque${ancho ? " bloque--ancho" : ""}">
        <h2>${esc(titulo)}</h2>
        ${nota ? `<p class="nota">${esc(nota)}</p>` : ""}
        ${contenido}
      </section>`;
  }

  // ---------- Cuánto quedó, y dónde ----------
  //
  // Por cada medio de pago: lo que entró, lo que salió y la diferencia. Es la
  // pregunta que de verdad se hace uno a fin de mes —«¿cuánta plata tendría que
  // haber en efectivo?»— y la que la planilla vieja contestaba con tres filas
  // sueltas que había que restar a mano.
  //
  // Ojo con lo que NO dice: es el movimiento del período, no un saldo de caja.
  // Si se elige un mes, la diferencia es la de ese mes; el saldo real arrastra
  // lo que venía de antes. Eligiendo «todo lo cargado» sí es el saldo desde que
  // empezaron a usar la app.
  // OJO: este cuadro cuenta SOLO lo cobrado.
  //
  // Contesta «cuánta plata tendría que haber», y una venta entregada que
  // todavía no pagaron no está en ningún bolsillo. Sumarla haría que el número
  // no cierre nunca contra la caja, que es justo para lo que se mira. Lo que
  // falta cobrar va debajo del cuadro, aparte, para que la cuenta se entienda.
  function balancePorMedio(p) {
    const cobrados = p.ingresos.filter((f) => f.pagado !== false);
    const impagos = p.ingresos.filter((f) => f.pagado === false);
    const porCobrar = impagos.reduce((n, f) => n + (Number(f.subtotal) || 0), 0);

    const medios = {};
    const sumar = (lista, campo, cual) => lista.forEach((f) => {
      const k = String(f.medio_pago || "—");
      if (!medios[k]) medios[k] = { entro: 0, salio: 0 };
      medios[k][cual] += Number(f[campo]) || 0;
    });
    sumar(cobrados, "subtotal", "entro");
    sumar(p.egresos, "monto", "salio");

    const filas = Object.keys(medios)
      .map((k) => ({ que: k, entro: medios[k].entro, salio: medios[k].salio,
                     saldo: medios[k].entro - medios[k].salio }))
      .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
    if (!filas.length) return "";

    const total = filas.reduce((t, f) => ({
      entro: t.entro + f.entro, salio: t.salio + f.salio, saldo: t.saldo + f.saldo,
    }), { entro: 0, salio: 0, saldo: 0 });

    return `
      <div class="tabla-envoltorio">
        <table class="tabla">
          <thead>
            <tr>
              <th>Medio de pago</th>
              <th class="numero">Entró</th>
              <th class="numero">Salió</th>
              <th class="numero">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            ${filas.map((f) => `
              <tr>
                <td><span class="celda__que">${esc(f.que)}</span></td>
                <td class="numero entra">${f.entro ? dinero(f.entro) : "—"}</td>
                <td class="numero sale">${f.salio ? dinero(f.salio) : "—"}</td>
                <td class="numero saldo${f.saldo < 0 ? " negativo" : ""}">${dinero(f.saldo)}</td>
              </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="numero">${dinero(total.entro)}</td>
              <td class="numero">${dinero(total.salio)}</td>
              <td class="numero saldo${total.saldo < 0 ? " negativo" : ""}">${dinero(total.saldo)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      ${porCobrar ? `
        <p class="nota">No entra acá lo que todavía no cobraron:
           <strong>${dinero(porCobrar)}</strong> en
           ${impagos.length === 1 ? "una venta" : "varias ventas"} entregadas.
           Están en <strong>Falta cobrar</strong>, en Ingresos.</p>` : ""}`;
  }

  // Los ingresos agrupados por producto, para la torta. Más de seis tajadas no
  // se distinguen: de ahí para abajo van todas juntas en «otros».
  function porProducto(ingresos) {
    const grupos = agrupar(ingresos, (f) => window.Datos.nombreDe(f.cod), (f) => f.subtotal);
    if (grupos.length <= 7) return grupos;
    const primeros = grupos.slice(0, 6);
    const resto = grupos.slice(6).reduce((n, g) => n + g.cuanto, 0);
    return primeros.concat([{ que: "otros " + (grupos.length - 6) + " productos", cuanto: resto }]);
  }

  // ---------- Gráfico de barras por mes ----------

  function graficoMeses() {
    const d = window.Datos.todo();
    const porMes = {};
    const sumar = (lista, campo, cual) => (lista || []).forEach((f) => {
      if (!f.fecha) return;
      const m = mesDe(f.fecha);
      if (!porMes[m]) porMes[m] = { ingresos: 0, egresos: 0 };
      porMes[m][cual] += Number(f[campo]) || 0;
    });
    sumar(d.ingresos, "subtotal", "ingresos");
    sumar(d.egresos, "monto", "egresos");

    // Los últimos doce con datos: más que eso no entra en la pantalla de un
    // teléfono sin que las barras queden en un hilo.
    const claves = Object.keys(porMes).sort().slice(-12);
    if (!claves.length) return "";

    const tope = Math.max(...claves.map((m) => Math.max(porMes[m].ingresos, porMes[m].egresos)), 1);

    const ANCHO = 720;
    const ALTO = 220;
    const PIE = 34;
    const util = ALTO - PIE - 10;
    const paso = ANCHO / claves.length;
    const ancho = Math.min(18, (paso - 10) / 2);

    const barras = claves.map((m, i) => {
      const x = i * paso + paso / 2;
      const hi = (porMes[m].ingresos / tope) * util;
      const he = (porMes[m].egresos / tope) * util;
      const y = ALTO - PIE;
      const elegido = periodo === m;
      return `
        <rect x="${(x - ancho - 1).toFixed(1)}" y="${(y - hi).toFixed(1)}" width="${ancho}" height="${Math.max(hi, 1).toFixed(1)}"
              fill="${VERDE}" opacity="${!periodo || elegido ? 1 : 0.35}" rx="2"></rect>
        <rect x="${(x + 1).toFixed(1)}" y="${(y - he).toFixed(1)}" width="${ancho}" height="${Math.max(he, 1).toFixed(1)}"
              fill="${TIERRA}" opacity="${!periodo || elegido ? 1 : 0.35}" rx="2"></rect>
        <text x="${x.toFixed(1)}" y="${ALTO - 14}" text-anchor="middle" font-size="12"
              fill="${elegido ? BORDO : "#6b6560"}" font-weight="${elegido ? "700" : "400"}">${m.slice(5)}</text>
        <text x="${x.toFixed(1)}" y="${ALTO - 2}" text-anchor="middle" font-size="10" fill="#6b6560">${m.slice(2, 4)}</text>`;
    }).join("");

    return `
      <figure class="grafico">
        <svg viewBox="0 0 ${ANCHO} ${ALTO}" role="img"
             aria-label="Ingresos y egresos mes a mes">
          <line x1="0" y1="${ALTO - PIE}" x2="${ANCHO}" y2="${ALTO - PIE}" stroke="#e5ddd4" stroke-width="1"></line>
          ${barras}
        </svg>
        <figcaption>
          <span class="clave"><i class="clave__color" data-color="verde"></i>lo que entró</span>
          <span class="clave"><i class="clave__color" data-color="tierra"></i>lo que salió</span>
          <span class="clave__tope">tope de la escala: ${dinero(tope)}</span>
        </figcaption>
      </figure>`;
  }

  // ---------- Torta ----------

  function dona(grupos, total) {
    if (!grupos.length || !total) return "";

    const R = 70;          // radio del círculo sobre el que se dibuja el trazo
    const GROSOR = 34;
    const VUELTA = 2 * Math.PI * R;

    let acumulado = 0;
    const tajadas = grupos.map((g, i) => {
      const largo = (g.cuanto / total) * VUELTA;
      const trazo = `<circle cx="100" cy="100" r="${R}" fill="none"
        stroke="${PALETA[i % PALETA.length]}" stroke-width="${GROSOR}"
        stroke-dasharray="${largo.toFixed(2)} ${(VUELTA - largo).toFixed(2)}"
        stroke-dashoffset="${(-acumulado).toFixed(2)}"
        transform="rotate(-90 100 100)"></circle>`;
      acumulado += largo;
      return trazo;
    }).join("");

    return `
      <figure class="grafico grafico--dona">
        <svg viewBox="0 0 200 200" role="img" aria-label="Egresos por rubro">
          ${tajadas}
          <text x="100" y="96" text-anchor="middle" font-size="13" fill="#6b6560">total</text>
          <text x="100" y="118" text-anchor="middle" font-size="19" font-weight="700" fill="#2a2124">${dinero(total)}</text>
        </svg>
        <figcaption class="dona__claves">
          ${grupos.map((g, i) => `
            <span class="clave">
              <i class="clave__color" data-i="${i % PALETA.length}"></i>
              ${esc(g.que)} · <strong>${dinero(g.cuanto)}</strong>
              <span class="clave__pct">${Math.round((g.cuanto / total) * 100)}%</span>
            </span>`).join("")}
        </figcaption>
      </figure>`;
  }

  // ---------- Barras horizontales ----------

  // El ancho de cada barra NO puede ir en un atributo style: la política de
  // contenido de la app no admite estilos sueltos en el HTML, justamente para
  // que nada que se cuele pueda pintar la pantalla. Va en un data- y lo aplica
  // pintarBarras() después de dibujar, por CSSOM, que sí está permitido.
  function barras(grupos, total, color, titulo) {
    if (!grupos.length) return "";
    const tope = Math.max(...grupos.map((g) => g.cuanto), 1);
    const tono = color === VERDE ? "verde" : color === TIERRA ? "tierra" : "bordo";

    return `
      ${titulo ? `<h3 class="subtitulo">${esc(titulo)}</h3>` : ""}
      <ul class="desglose">
        ${grupos.map((g) => `
          <li class="desglose__fila">
            <span class="desglose__que">${esc(g.que)}</span>
            <span class="desglose__pista">
              <i class="desglose__barra" data-tono="${tono}"
                 data-ancho="${Math.round((g.cuanto / tope) * 100)}"></i>
            </span>
            <span class="desglose__cuanto">${dinero(g.cuanto)}
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

  // ---------- Lo más vendido ----------

  // Cuánto quedó después de descontar lo que costaron los frascos vendidos.
  //
  // SOLO CUENTA LOS PRODUCTOS CON COSTO CARGADO, y dice cuánto quedó afuera.
  // Un margen calculado tratando el costo vacío como cero diría que se gana el
  // 100 %, que es exactamente el número que uno quiere creer y el que más caro
  // sale creer. Mejor un total sobre la mitad de las ventas, con el aviso al
  // lado, que un total redondo que está mal.
  function loQueDejo(ingresos) {
    const porCod = {};
    ingresos.forEach((f) => {
      if (window.Datos.esCorreccion(f)) return;   // no tiene producto
      if (!porCod[f.cod]) porCod[f.cod] = { cod: f.cod, unidades: 0, vendido: 0 };
      porCod[f.cod].unidades += Number(f.cantidad) || 0;
      porCod[f.cod].vendido += Number(f.subtotal) || 0;
    });

    const conCosto = [];
    let sinCosto = 0, cuantosSinCosto = 0;
    Object.keys(porCod).forEach((c) => {
      const f = porCod[c];
      const costo = window.Datos.costoDe(c);
      if (!costo) { sinCosto += f.vendido; cuantosSinCosto++; return; }
      f.costo = costo * f.unidades;
      f.dejo = f.vendido - f.costo;
      conCosto.push(f);
    });
    conCosto.sort((a, b) => b.dejo - a.dejo);

    if (!conCosto.length) {
      return `<p class="vacio">Todavía no hay ningún producto con el costo cargado.
        Se carga en <strong>Productos</strong>, en «cuánto cuesta hacer uno», y a
        partir de ahí la app puede decir cuánto se gana.</p>`;
    }

    const vendido = conCosto.reduce((n, f) => n + f.vendido, 0);
    const costo = conCosto.reduce((n, f) => n + f.costo, 0);
    const dejo = vendido - costo;
    const pct = (v, sobre) => sobre > 0 ? Math.round((v / sobre) * 100) + "%" : "—";

    return `
      <div class="tabla-envoltorio">
        <table class="tabla">
          <thead>
            <tr><th>Producto</th><th class="numero">Vendido</th>
                <th class="numero">Costó</th><th class="numero">Dejó</th></tr>
          </thead>
          <tbody>
            ${conCosto.map((f) => `
              <tr>
                <td>
                  <span class="celda__que">${esc(window.Datos.nombreDe(f.cod))}</span>
                  <span class="celda__detalle">${numero(f.unidades)} u. · ${pct(f.dejo, f.vendido)}</span>
                </td>
                <td class="numero">${dinero(f.vendido)}</td>
                <td class="numero">${dinero(f.costo)}</td>
                <td class="numero${f.dejo < 0 ? " negativo" : ""}">${dinero(f.dejo)}</td>
              </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td>Total · ${pct(dejo, vendido)}</td>
              <td class="numero">${dinero(vendido)}</td>
              <td class="numero">${dinero(costo)}</td>
              <td class="numero${dejo < 0 ? " negativo" : ""}">${dinero(dejo)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      ${cuantosSinCosto ? `
        <p class="nota">Quedaron afuera ${cuantosSinCosto}
           producto${cuantosSinCosto === 1 ? "" : "s"} sin costo cargado,
           ${dinero(sinCosto)} de lo vendido. Cargando esos costos en
           <strong>Productos</strong>, este total pasa a ser el de verdad.</p>` : ""}`;
  }

  function tablaProductos(ingresos) {
    const porCod = {};
    ingresos.forEach((f) => {
      if (window.Datos.esCorreccion(f)) return;   // no tiene producto
      if (!porCod[f.cod]) porCod[f.cod] = { cod: f.cod, unidades: 0, plata: 0 };
      porCod[f.cod].unidades += Number(f.cantidad) || 0;
      porCod[f.cod].plata += Number(f.subtotal) || 0;
    });
    const filas = Object.keys(porCod).map((c) => porCod[c]).sort((a, b) => b.plata - a.plata);
    if (!filas.length) return "";

    const unidades = filas.reduce((n, f) => n + f.unidades, 0);
    const plata = filas.reduce((n, f) => n + f.plata, 0);

    return `
      <div class="tabla-envoltorio">
        <table class="tabla">
          <thead>
            <tr><th>Producto</th><th class="numero">Unidades</th><th class="numero">Plata</th></tr>
          </thead>
          <tbody>
            ${filas.map((f) => `
              <tr>
                <td>
                  <span class="celda__que">${esc(window.Datos.nombreDe(f.cod))}</span>
                  <span class="celda__detalle">${esc(f.cod)}</span>
                </td>
                <td class="numero">${numero(f.unidades)}</td>
                <td class="numero">${dinero(f.plata)}</td>
              </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr><td>Total</td><td class="numero">${numero(unidades)}</td><td class="numero">${dinero(plata)}</td></tr>
          </tfoot>
        </table>
      </div>`;
  }

  // ---------- Descargas ----------

  const COLUMNAS = {
    ingresos: [
      ["fecha", "fecha"], ["cliente", "cliente"], ["lista", "lista"],
      ["medio de pago", "medio_pago"], ["código", "cod"],
      ["producto", (f) => window.Datos.nombreDe(f.cod)],
      ["cantidad", "cantidad"], ["precio", "precio"], ["subtotal", "subtotal"],
      ["observaciones", "obs"],
    ],
    egresos: [
      ["fecha", "fecha"], ["rubro", "rubro"], ["detalle", "detalle"],
      ["cantidad", "cantidad"], ["monto", "monto"], ["medio de pago", "medio_pago"],
      ["observaciones", "obs"],
    ],
    movimientos: [
      ["fecha", "fecha"], ["tipo", "tipo"], ["código", "cod"],
      ["producto", (m) => window.Datos.nombreDe(m.cod)],
      ["cantidad", "cantidad"], ["desde", "desde"], ["hacia", "hacia"],
      ["observaciones", "obs"],
    ],
  };

  function bajar(cual) {
    const d = window.Datos.todo();
    const filas = (d[cual] || []).filter(enPeriodo)
      .slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

    if (!filas.length) { window.Util.brindis("No hay " + cual + " en este período."); return; }

    const cols = COLUMNAS[cual];
    const lineas = [cols.map((c) => c[0]).join(",")];
    filas.forEach((f) => {
      lineas.push(cols.map((c) => {
        const v = typeof c[1] === "function" ? c[1](f) : f[c[1]];
        return celda(v);
      }).join(","));
    });

    // El BOM del principio es lo que hace que los acentos se vean bien al abrir
    // el archivo en una planilla. Sin él, "almíbar" llega como "almÃ­bar".
    const texto = "﻿" + lineas.join("\r\n") + "\r\n";
    const nombre = "cocinaviva-" + cual + "-" + (periodo || "todo") + ".csv";
    descargar(new Blob([texto], { type: "text/csv;charset=utf-8" }), nombre);
    window.Util.brindis("Descargado: " + nombre);
  }

  // Los números van con punto decimal y sin separador de miles: es lo que
  // cualquier planilla entiende. El formateo lindo es cosa de la pantalla.
  function celda(v) {
    if (v == null) return "";
    if (typeof v === "number") return String(v);
    let s = String(v);
    // Un texto que arranca con = o + lo toma como fórmula la planilla que
    // abra el archivo, no este código. El Apps Script ya hace lo mismo al
    // escribir en la hoja (`comoTexto`); acá hace falta igual, porque el CSV
    // se abre en otra planilla y los datos salen de una hoja que se edita a
    // mano.
    if (/^[=+@]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return { render };
})();
