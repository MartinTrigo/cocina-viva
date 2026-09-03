// ==========================================================================
// Cocina Viva — Productos
//
// El catálogo. Es la pantalla de la que dependen todas las demás: los precios
// de una venta, el nombre que sale en un remito y los códigos de los
// desplegables salen de acá.
//
// EL CÓDIGO NO SE EDITA. Cada movimiento y cada venta guardan el código, no el
// nombre. Cambiar KIM340 por otra cosa dejaría huérfana toda la historia de ese
// producto, y peor: el stock del kimchi de 340 pasaría a contar cero sin que
// nada avise. El nombre, la presentación y los precios sí se editan.
//
// DAR DE BAJA NO ES BORRAR. Un producto con ventas encima no se puede borrar
// sin romper el historial, así que se lo da de baja: desaparece de los
// desplegables y de los resúmenes, pero sus filas viejas siguen teniendo
// sentido. La única excepción es un producto que todavía no tiene ni un
// movimiento ni una venta —recién cargado, y mal—: ese sí se borra de verdad.
// ==========================================================================

window.Productos = (function () {
  const { esc, dinero, aNumero, numero, enBloque, unaVez } = window.Util;

  let vista = null;
  let ir = null;

  async function render(contenedor, ruta, navegar) {
    vista = contenedor;
    ir = navegar;

    const partes = ruta.split("/");          // productos / nuevo | masa | KIM340
    const que = decodeURIComponent(partes[1] || "");

    if (que === "nuevo") { formulario(null); return cab("Producto nuevo", "Alta en el catálogo"); }
    if (que === "masa") { enMasa(); return cab("Editar en masa", "Precios y bajas"); }
    if (que) {
      const p = window.Datos.producto(que);
      if (!p) { lista(); return cab("Productos", "Catálogo"); }
      formulario(p);
      return cab(p.producto, p.presentacion || "Editar producto");
    }
    lista();
    return cab("Productos", "Catálogo");
  }

  const cab = (titulo, subtitulo) => ({ titulo, subtitulo });

  // ---------- La lista ----------

  function lista() {
    const todos = window.Datos.todo().productos;
    const activos = todos.filter((p) => p.activo !== false);
    const bajas = todos.filter((p) => p.activo === false);

    vista.innerHTML = `
      <div class="acciones">
        <button class="boton" data-ir="productos/nuevo">+ Producto nuevo</button>
        <button class="boton boton--secundario" data-ir="productos/masa">Editar en masa</button>
      </div>

      ${activos.length ? tabla(activos) : `<p class="vacio">Todavía no hay productos cargados.</p>`}

      ${bajas.length ? `
        <details class="grupo separado">
          <summary class="grupo__cab">
            <span class="grupo__texto">
              <span class="grupo__nombre">Dados de baja</span>
              <span class="grupo__cuenta">${bajas.length} producto${bajas.length === 1 ? "" : "s"} · no aparecen en las ventas</span>
            </span>
          </summary>
          <div class="grupo__cuerpo">${tabla(bajas)}</div>
        </details>` : ""}

      <p class="nota nota--pie">
        ${activos.length} producto${activos.length === 1 ? "" : "s"} a la venta.
        El código no se puede cambiar: lo usan todos los movimientos y todas las
        ventas para saber de qué producto hablan.
      </p>`;

    enganchar();
  }

  function tabla(productos) {
    return `
      <div class="tabla-envoltorio">
        <table class="tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th class="numero">Mayor</th>
              <th class="numero">Minorista</th>
              <th><span class="oculto-visual">Editar</span></th>
            </tr>
          </thead>
          <tbody>
            ${productos.map((p) => `
              <tr${p.activo === false ? ' class="en-cero"' : ""}>
                <td>
                  <span class="celda__que">${esc(p.producto)}${p.presentacion ? " " + esc(enBloque(p.presentacion)) : ""}</span>
                  <span class="celda__detalle">${esc(p.cod)}</span>
                </td>
                <td class="numero">${dinero(p.pmayor)}</td>
                <td class="numero">${dinero(p.pminor)}</td>
                <td class="numero">
                  <button class="lapiz" data-ir="productos/${encodeURIComponent(p.cod)}"
                          aria-label="Editar ${esc(p.producto)}">&#9998;</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  // ---------- Alta y edición ----------

  function formulario(p) {
    const nuevo = !p;
    const usos = nuevo ? 0 : cuantoSeUso(p.cod);

    vista.innerHTML = `
      <div class="tarjeta">
        <div class="campo">
          <label for="c-cod">Código${nuevo ? ' <span class="obliga">•</span>' : ""}</label>
          <span class="ayuda">${nuevo
            ? "Corto y sin espacios, como los que ya usan: KIM340, CRT600, VIM500. Se escribe una vez y no se cambia más."
            : "El código no se puede cambiar: lo usan todos los movimientos y todas las ventas de este producto para saber de cuál hablan."}</span>
          <input type="text" id="c-cod" value="${esc(nuevo ? "" : p.cod)}"
                 autocapitalize="characters" spellcheck="false"
                 ${nuevo ? 'placeholder="KIM340"' : "disabled"}>
        </div>

        <div class="campo">
          <label for="c-producto">Producto <span class="obliga">•</span></label>
          <input type="text" id="c-producto" value="${esc(nuevo ? "" : p.producto)}"
                 placeholder="kimchi">
        </div>

        <div class="campo">
          <label for="c-presentacion">Presentación</label>
          <span class="ayuda">Como se lee en la etiqueta: 340 g, 1,5 kg, 500 ml.</span>
          <input type="text" id="c-presentacion" value="${esc(nuevo ? "" : p.presentacion)}"
                 placeholder="340 g">
        </div>

        <div class="fila">
          <div class="campo">
            <label for="c-pmayor">Precio mayorista <span class="obliga">•</span></label>
            <input type="text" id="c-pmayor" class="numero" inputmode="decimal"
                   value="${nuevo ? "" : p.pmayor}">
          </div>
          <div class="campo">
            <label for="c-pminor">Precio minorista</label>
            <input type="text" id="c-pminor" class="numero" inputmode="decimal"
                   value="${nuevo ? "" : p.pminor}">
          </div>
        </div>

        <p class="campo__error" id="c-error" hidden></p>
        <button class="boton boton--ancho" id="btn-guardar">Guardar</button>
      </div>

      ${nuevo ? "" : `
        <div class="tarjeta">
          <h2>${p.activo === false ? "Este producto está dado de baja" : "Dar de baja"}</h2>
          <p class="nota">${p.activo === false
            ? "No aparece en las ventas ni en el resumen de stock. Sus movimientos viejos siguen contando."
            : "Deja de aparecer en las ventas y en las entregas, pero su historia queda intacta."}</p>
          <button class="boton boton--secundario boton--ancho separado" id="btn-baja">
            ${p.activo === false ? "Volver a poner a la venta" : "Dar de baja"}
          </button>

          ${usos === 0 ? `
            <p class="nota separado">Este producto no tiene ni un movimiento ni una venta,
               así que se puede borrar del todo sin romper nada.</p>
            <button class="boton--peligro" id="btn-borrar">Borrar del catálogo</button>`
          : `<p class="nota separado">Tiene ${numero(usos)} registro${usos === 1 ? "" : "s"}
               en la historia, así que no se puede borrar: se daría de baja nada más.</p>`}
        </div>`}`;

    unaVez(document.getElementById("btn-guardar"), () => guardar(p));

    const baja = document.getElementById("btn-baja");
    if (baja) baja.onclick = async () => {
      await guardarProducto(Object.assign({}, p, { activo: p.activo === false }));
      window.Util.brindis(p.activo === false ? "Vuelve a estar a la venta." : "Dado de baja.");
      ir("productos");
    };

    const borrar = document.getElementById("btn-borrar");
    if (borrar) borrar.onclick = async () => {
      await window.CVDB.borrar("productos", p.cod);
      await window.Datos.cargar();
      window.Sincro.sincronizar(true);
      window.Util.brindis("Borrado del catálogo.");
      ir("productos");
    };
  }

  // Cuántas filas de la historia nombran este código. Decide si se puede
  // borrar de verdad o solamente dar de baja.
  function cuantoSeUso(cod) {
    const d = window.Datos.todo();
    return d.movimientos.filter((m) => m.cod === cod).length
         + d.ingresos.filter((i) => i.cod === cod).length;
  }

  async function guardar(previo) {
    const nuevo = !previo;
    const cod = (document.getElementById("c-cod").value || "").trim().toUpperCase();
    const producto = (document.getElementById("c-producto").value || "").trim();
    const presentacion = (document.getElementById("c-presentacion").value || "").trim();
    const pmayor = aNumero(document.getElementById("c-pmayor").value);
    const pminor = aNumero(document.getElementById("c-pminor").value);

    const mal = (texto) => {
      const e = document.getElementById("c-error");
      e.textContent = texto;
      e.hidden = false;
    };

    if (nuevo && !cod) return mal("Falta el código.");
    // Letras, números, guiones y nada más. El código viaja en la dirección de
    // la pantalla de edición, así que una barra o un espacio la romperían; y
    // además es lo que ellas ya usan: KIM340, CRT600, VIM500.
    if (nuevo && !/^[A-Z0-9_-]+$/.test(cod)) {
      return mal("El código va con letras y números, sin espacios ni signos raros. Por ejemplo: KIM340.");
    }
    if (nuevo && window.Datos.producto(cod)) {
      return mal("Ya existe un producto con el código " + cod + ". Los códigos no se repiten.");
    }
    if (!producto) return mal("Falta el nombre del producto.");
    if (!Number.isFinite(pmayor) || pmayor <= 0) return mal("El precio mayorista tiene que ser un número mayor que cero.");
    if (document.getElementById("c-pminor").value.trim() && !Number.isFinite(pminor)) {
      return mal("El precio minorista no se entiende como número.");
    }

    await guardarProducto({
      cod: nuevo ? cod : previo.cod,
      producto: producto,
      presentacion: presentacion,
      pmayor: pmayor,
      pminor: Number.isFinite(pminor) ? pminor : 0,
      activo: nuevo ? true : previo.activo !== false,
    });
    window.Util.brindis(nuevo ? "Producto agregado." : "Guardado.");
    ir("productos");
  }

  // ---------- Editar en masa ----------

  function enMasa() {
    const activos = window.Datos.todo().productos.filter((p) => p.activo !== false);

    vista.innerHTML = `
      <div class="tarjeta">
        <h2>Actualizar precios</h2>
        <p class="nota">Sube o baja de una todos los precios que estén a la venta.
           Para bajarlos, poné el porcentaje en negativo.</p>

        <div class="fila separado">
          <div class="campo">
            <label for="m-pct">Porcentaje</label>
            <input type="text" id="m-pct" class="numero" inputmode="decimal" placeholder="12,5">
          </div>
          <div class="campo">
            <label for="m-redondeo">Redondear</label>
            <select id="m-redondeo">
              <option value="50" selected>A los $50</option>
              <option value="100">A los $100</option>
              <option value="1">Sin redondear</option>
            </select>
          </div>
        </div>

        <div class="campo">
          <label for="m-cuales">Qué precios</label>
          <select id="m-cuales">
            <option value="ambos" selected>Los dos</option>
            <option value="pmayor">Solo el mayorista</option>
            <option value="pminor">Solo el minorista</option>
          </select>
        </div>

        <div id="m-vista"></div>
        <button class="boton boton--ancho separado" id="btn-aplicar" disabled>Aplicar</button>
      </div>

      <div class="tarjeta">
        <h2>Dar de baja varios</h2>
        <p class="nota">Marcá los que ya no venden. Dejan de aparecer en las ventas
           y en las entregas, pero su historia queda: no se borra nada.</p>
        <ul class="chequeos separado">
          ${activos.map((p) => `
            <li>
              <label class="chequeo">
                <input type="checkbox" value="${esc(p.cod)}">
                <span><strong>${esc(p.producto)}</strong>
                  <span class="celda__detalle">${esc(p.cod)}${p.presentacion ? " · " + esc(p.presentacion) : ""}</span>
                </span>
              </label>
            </li>`).join("")}
        </ul>
        <button class="boton boton--secundario boton--ancho separado" id="btn-bajas" disabled>
          Dar de baja los marcados
        </button>
      </div>`;

    const pct = document.getElementById("m-pct");
    const redondeo = document.getElementById("m-redondeo");
    const cuales = document.getElementById("m-cuales");
    const aplicar = document.getElementById("btn-aplicar");

    // La vista previa no es un adorno: muestra el precio redondeado que va a
    // quedar de verdad, así el redondeo no aparece como sorpresa después.
    function previsualizar() {
      const cambios = calcular(activos, aNumero(pct.value), Number(redondeo.value), cuales.value);
      aplicar.disabled = !cambios.length;
      document.getElementById("m-vista").innerHTML = !cambios.length ? "" : `
        <div class="tabla-envoltorio separado">
          <table class="tabla">
            <thead><tr><th>Producto</th><th class="numero">Mayor</th><th class="numero">Minorista</th></tr></thead>
            <tbody>
              ${cambios.map((c) => `
                <tr>
                  <td><span class="celda__que">${esc(c.producto.producto)}</span>
                      <span class="celda__detalle">${esc(c.producto.cod)}</span></td>
                  <td class="numero">${flecha(c.producto.pmayor, c.pmayor)}</td>
                  <td class="numero">${flecha(c.producto.pminor, c.pminor)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    }

    [pct, redondeo, cuales].forEach((c) => { c.oninput = previsualizar; c.onchange = previsualizar; });

    unaVez(aplicar, async () => {
      const cambios = calcular(activos, aNumero(pct.value), Number(redondeo.value), cuales.value);
      if (!cambios.length) return;
      await window.CVDB.guardarVarios("productos", cambios.map((c) =>
        Object.assign({}, c.producto, { pmayor: c.pmayor, pminor: c.pminor })));
      await window.Datos.cargar();
      window.Sincro.sincronizar(true);
      window.Util.brindis("Precios actualizados: " + cambios.length + ".");
      ir("productos");
    });

    const chequeos = vista.querySelectorAll(".chequeo input");
    const bajas = document.getElementById("btn-bajas");
    chequeos.forEach((m) => {
      m.onchange = () => {
        const cuantos = [...chequeos].filter((x) => x.checked).length;
        bajas.disabled = !cuantos;
        bajas.textContent = cuantos
          ? "Dar de baja " + cuantos + " producto" + (cuantos === 1 ? "" : "s")
          : "Dar de baja los marcados";
      };
    });

    unaVez(bajas, async () => {
      const elegidos = [...chequeos].filter((x) => x.checked).map((x) => x.value);
      if (!elegidos.length) return;
      await window.CVDB.guardarVarios("productos", elegidos.map((cod) =>
        Object.assign({}, window.Datos.producto(cod), { activo: false })));
      await window.Datos.cargar();
      window.Sincro.sincronizar(true);
      window.Util.brindis(elegidos.length + " dado" + (elegidos.length === 1 ? "" : "s") + " de baja.");
      ir("productos");
    });
  }

  // Devuelve solo los productos cuyo precio efectivamente cambia. Un aumento
  // tan chico que el redondeo se lo come no tiene por qué tocar la fila ni
  // gastar una sincronización.
  function calcular(productos, porcentaje, paso, cuales) {
    if (!Number.isFinite(porcentaje) || porcentaje === 0) return [];
    const factor = 1 + porcentaje / 100;
    const redondear = (n) => Math.max(0, Math.round((n * factor) / paso) * paso);

    return productos.map((p) => ({
      producto: p,
      pmayor: cuales === "pminor" ? p.pmayor : redondear(p.pmayor),
      pminor: cuales === "pmayor" ? p.pminor : redondear(p.pminor),
    })).filter((c) => c.pmayor !== c.producto.pmayor || c.pminor !== c.producto.pminor);
  }

  const flecha = (antes, despues) => antes === despues
    ? `<span class="igual">${dinero(antes)}</span>`
    : `<span class="antes">${dinero(antes)}</span> <span class="despues">${dinero(despues)}</span>`;

  // ---------- Auxiliares ----------

  async function guardarProducto(p) {
    await window.CVDB.guardar("productos", p);
    await window.Datos.cargar();
    // Se sincroniza en silencio: si hay señal la otra lo ve enseguida, y si no
    // hay, queda pendiente y no molesta con un error que no es un error.
    window.Sincro.sincronizar(true);
  }

  function enganchar() {
    vista.querySelectorAll("[data-ir]").forEach((b) => { b.onclick = () => ir(b.dataset.ir); });
  }

  return { render };
})();
