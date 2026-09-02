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
  const { esc, dinero, numero, mesDe, mesLargo } = window.Util;

  const VERDE = "#4a6b3a";
  const TIERRA = "#a9722f";
  const BORDO = "#8c0730";

  // Colores para los rubros y los medios de pago. Se reparten por posición, así
  // que un rubro siempre tiene el mismo color mientras no cambie la lista.
  const PALETA = ["#8c0730", "#a9722f", "#4a6b3a", "#6b6560", "#b4143f", "#7a6a3f", "#5b7f8c"];

  let vista = null;
  let periodo = "";      // "" = todo, o "2026-08"

  async function render(contenedor, ruta, navegar) {
    vista = contenedor;
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

      ${listaMeses.length > 1 ? `
        <h2 class="separado">Mes a mes</h2>
        <p class="nota">Lo que entró y lo que salió, todos los meses con datos.</p>
        ${graficoMeses()}` : ""}

      ${p.ingresos.length ? `
        <h2 class="separado">De dónde entró la plata</h2>
        ${barras(agrupar(p.ingresos, (f) => f.medio_pago, (f) => f.subtotal), p.totalIngresos, VERDE)}
      ` : ""}

      ${p.egresos.length ? `
        <h2 class="separado">En qué se fue</h2>
        ${dona(agrupar(p.egresos, (e) => e.rubro, (e) => e.monto), p.totalEgresos)}
        ${barras(agrupar(p.egresos, (e) => e.medio_pago, (e) => e.monto), p.totalEgresos, TIERRA, "Por medio de pago")}
      ` : ""}

      ${p.ingresos.length ? `
        <h2 class="separado">Lo que más se vendió</h2>
        ${tablaProductos(p.ingresos)}

        <h2 class="separado">Por cliente</h2>
        ${barras(agrupar(p.ingresos, (f) => f.cliente, (f) => f.subtotal).slice(0, 12), p.totalIngresos, BORDO)}
      ` : ""}

      <h2 class="separado">Stock hoy</h2>
      <p class="nota">No depende del período: es lo que hay en este momento.</p>
      <div class="cifras">
        <div class="cifra cifra--entra">
          <span class="cifra__que">En depósito</span>
          <span class="cifra__cuanto">${dinero(window.Datos.valorDe(deposito))}</span>
        </div>
        <div class="cifra cifra--sale">
          <span class="cifra__que">En consignación</span>
          <span class="cifra__cuanto">${dinero(window.Datos.valorDe(calle))}</span>
        </div>
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
    vista.querySelectorAll("[data-bajar]").forEach((b) => {
      b.onclick = () => bajar(b.dataset.bajar);
    });
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

  function tablaProductos(ingresos) {
    const porCod = {};
    ingresos.forEach((f) => {
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
    const s = String(v);
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
