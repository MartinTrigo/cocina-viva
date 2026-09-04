// ==========================================================================
// Cocina Viva — Stock del depósito
//
// Dos cosas en una pantalla: cargar lo que entra o sale del depósito, y ver
// cuánto hay.
//
// El formulario no solo suma. Una pantalla de stock que únicamente carga
// producción miente apenas se rompe un frasco: el número queda alto para
// siempre y no hay dónde anotar por qué. Por eso hay tres cosas que pueden
// pasar, y las tres escriben en el mismo libro mayor:
//
//   envasamos            entra al depósito
//   se rompió o venció   sale del depósito (merma)
//   corrección por conteo  cuadra contra lo que se contó de verdad
//
// La corrección pide el TOTAL contado, no la diferencia. Nadie cuenta
// diferencias: se cuentan frascos. La diferencia la saca la app.
// ==========================================================================

window.Stock = (function () {
  const { esc, dinero, numero, aNumero, hoy, fecha, enBloque, unaVez } = window.Util;

  const QUE_PASO = {
    produccion: {
      titulo: "Envasamos",
      icono: "📥",
      ayuda: "Entra al depósito.",
      etiqueta: "Cuántas unidades",
    },
    merma: {
      titulo: "Se rompió o venció",
      icono: "💔",
      ayuda: "Sale del depósito sin haberse vendido.",
      etiqueta: "Cuántas unidades",
    },
    conteo: {
      titulo: "Corrección por conteo",
      icono: "🔢",
      ayuda: "Cuadra el depósito contra lo que contaste de verdad.",
      etiqueta: "Contaste en total",
    },
  };

  let vista = null;
  let ir = null;
  let que = "produccion";
  let cargadosRecien = [];      // lo de esta sesión, para poder deshacer

  async function render(contenedor, ruta, navegar) {
    vista = contenedor;
    ir = navegar;
    // "Cargado recién" es lo de esta visita. Al volver a entrar a la pantalla
    // se limpia: si no, quedaba una lista vieja con botones de deshacer que ya
    // no deshacían nada, porque esos movimientos podían estar borrados.
    cargadosRecien = [];
    pintar();
    return { titulo: "Stock", subtitulo: "Depósito" };
  }

  function pintar(mensaje) {
    const productos = window.Datos.todo().productos.filter((p) => p.activo !== false);
    const deposito = window.Datos.stockDeposito();

    vista.innerHTML = `
      ${mensaje || ""}

      <div class="tarjeta">
        <h2>Cargar un movimiento</h2>

        <div class="campo">
          <label>¿Qué pasó?</label>
          <div class="opciones">
            ${Object.entries(QUE_PASO).map(([clave, o]) => `
              <label class="opcion${clave === que ? " elegida" : ""}">
                <input type="radio" name="que" value="${clave}"${clave === que ? " checked" : ""}>
                <span class="opcion__icono">${o.icono}</span>
                <span class="opcion__texto">${esc(o.titulo)}</span>
              </label>`).join("")}
          </div>
          <span class="ayuda" id="s-ayuda">${esc(QUE_PASO[que].ayuda)}</span>
        </div>

        <div class="fila">
          <div class="campo">
            <label for="s-fecha">Fecha</label>
            <input type="date" id="s-fecha" value="${hoy()}">
          </div>
          <div class="campo">
            <label for="s-cantidad" id="s-etiqueta">${esc(QUE_PASO[que].etiqueta)} <span class="obliga">•</span></label>
            <input type="text" id="s-cantidad" class="numero" inputmode="numeric" placeholder="0">
          </div>
        </div>

        <div class="campo">
          <label for="s-cod">Producto <span class="obliga">•</span></label>
          <select id="s-cod">
            <option value="">Elegí un producto…</option>
            ${productos.map((p) => `
              <option value="${esc(p.cod)}">${esc(p.producto)}${p.presentacion ? " · " + esc(p.presentacion) : ""} (${esc(p.cod)})</option>`).join("")}
          </select>
        </div>

        <div class="campo">
          <label for="s-obs">Observaciones</label>
          <input type="text" id="s-obs" placeholder="opcional">
        </div>

        <p class="resumen-vivo" id="s-resumen" hidden></p>
        <p class="campo__error" id="s-error" hidden></p>
        <button class="boton boton--ancho" id="btn-guardar">Guardar</button>
      </div>

      ${cargadosRecien.length ? `
        <div class="tarjeta">
          <h2>Cargado recién</h2>
          <ul class="renglones al-final">
            ${cargadosRecien.map((m) => `
              <li class="renglon renglon--${m.hacia === window.Datos.DEPOSITO ? "entra" : "sale"}">
                <span class="renglon__texto">
                  <span class="renglon__que">${esc(window.Datos.nombreDe(m.cod))}</span>
                  <span class="renglon__detalle">${esc(nombreDelMovimiento(m))} · ${fecha(m.fecha)}</span>
                </span>
                <span class="renglon__cuanto">${m.hacia === window.Datos.DEPOSITO ? "+" : "−"}${numero(m.cantidad)}</span>
                <button class="boton--peligro" data-deshacer="${esc(m.id)}" aria-label="Deshacer">&#10005;</button>
              </li>`).join("")}
          </ul>
        </div>` : ""}

      <h2 class="separado">Lo que hay en el depósito</h2>
      ${resumenDeposito(productos, deposito)}

      ${queConvieneProducir()}`;

    enganchar();
  }

  // ---------- Qué conviene producir ----------
  //
  // Cuántas semanas dura lo que hay en el depósito al ritmo al que se vende. No
  // hace falta cargar nada nuevo: el ritmo sale de las ventas y las
  // liquidaciones que ya están anotadas.
  //
  // Los primeros son los que menos duran, que es el orden en el que uno decide
  // qué envasar el lunes.

  // Cuánto mira para atrás. Tres meses es suficiente para que un producto de
  // venta despareja no parezca muerto por una mala semana, y poco como para que
  // un cambio de temporada se note.
  const VENTANA_DIAS = 90;

  // Debajo de esto, urge. Dos semanas es más o menos lo que tarda un fermento
  // en estar listo, así que es el aviso que llega a tiempo.
  const SEMANAS_CORTAS = 2;

  function queConvieneProducir() {
    const todos = window.Datos.coberturaDeStock(VENTANA_DIAS);
    const conRitmo = todos.filter((f) => f.porSemana > 0);

    if (!conRitmo.length) {
      return `
        <h2 class="separado">Qué conviene producir</h2>
        <p class="vacio">Todavía no hay ventas cargadas de los últimos tres meses,
           así que no hay con qué estimar cuánto dura el stock. Aparece solo
           cuando empiecen a cargar ventas y liquidaciones.</p>`;
    }

    const orden = conRitmo.slice().sort((a, b) => a.semanas - b.semanas);
    const urgentes = orden.filter((f) => f.semanas < SEMANAS_CORTAS).length;
    // Los que no se vendieron nada van al final. No se puede decir cuánto duran,
    // pero que estén quietos es información en sí misma.
    const quietos = todos.filter((f) => !f.porSemana && f.cantidad)
      .sort((a, b) => b.cantidad - a.cantidad);

    return `
      <h2 class="separado">Qué conviene producir</h2>
      <p class="nota">Cuánto dura lo del depósito al ritmo de los últimos tres
         meses. ${urgentes
           ? "Hay " + urgentes + (urgentes === 1 ? " producto" : " productos")
             + " para menos de " + SEMANAS_CORTAS + " semanas."
           : "Ninguno baja de las " + SEMANAS_CORTAS + " semanas."}</p>
      <ul class="renglones">
        ${orden.map((f) => renglonDeCobertura(f)).join("")}
        ${quietos.map((f) => renglonDeCobertura(f)).join("")}
      </ul>`;
  }

  function renglonDeCobertura(f) {
    const meses = Math.round(f.diasMirados / 30.44);
    // Se muestran las unidades vendidas crudas y no el ritmo por semana: un
    // "0,2 por semana" redondeado no cuadra con la duración si alguien divide,
    // y además "2 vendidos en 3 meses" deja ver solo lo flaca que es la
    // estimación, que es justo lo que hay que saber para creerle o no.
    return `
      <li class="renglon ${f.semanas != null && f.semanas < SEMANAS_CORTAS ? "renglon--sale" : ""}
                 ${f.semanas == null ? "en-cero" : ""}">
        <span class="renglon__texto">
          <span class="renglon__que">${esc(f.nombre)}</span>
          <span class="renglon__detalle">${numero(f.cantidad)} en depósito ·
            ${f.vendidos ? numero(f.vendidos) + " vendidos" : "sin ventas"}
            en ${meses} meses</span>
        </span>
        <span class="renglon__cuanto ${f.semanas != null && f.semanas < SEMANAS_CORTAS ? "negativo" : ""}">
          ${duracion(f.semanas)}</span>
      </li>`;
  }

  // "3 sem." aguanta bien hasta un par de meses; de ahí en más el número de
  // semanas deja de decir algo y conviene pasar a meses. Y arriba del año el
  // número exacto es una precisión falsa: sale de un puñado de ventas.
  function duracion(semanas) {
    if (semanas == null) return "—";
    if (semanas < 1) return "menos de 1 sem.";
    if (semanas < 9) return Math.round(semanas) + " sem.";
    if (semanas > 52) return "más de un año";
    const meses = Math.round(semanas / 4.35);
    return meses + (meses === 1 ? " mes" : " meses");
  }

  // ---------- El resumen del depósito ----------

  function resumenDeposito(productos, deposito) {
    // Se listan TODOS los productos a la venta, también los que están en cero.
    // Ver que falta chucrut de 660 es tan útil como ver que hay nueve.
    const filas = productos.map((p) => {
      const cantidad = deposito[p.cod] || 0;
      return {
        cod: p.cod,
        nombre: p.producto + (p.presentacion ? " " + enBloque(p.presentacion) : ""),
        cantidad: cantidad,
        precio: Number(p.pmayor) || 0,
        subtotal: cantidad * (Number(p.pmayor) || 0),
      };
    });

    // Puede haber stock de un producto dado de baja: no se esconde, porque
    // esos frascos existen y valen plata.
    Object.keys(deposito).forEach((cod) => {
      if (filas.some((f) => f.cod === cod)) return;
      const p = window.Datos.producto(cod);
      filas.push({
        cod: cod,
        nombre: (p ? p.producto + (p.presentacion ? " " + enBloque(p.presentacion) : "") : cod) + " (dado de baja)",
        cantidad: deposito[cod],
        precio: p ? Number(p.pmayor) || 0 : 0,
        subtotal: deposito[cod] * (p ? Number(p.pmayor) || 0 : 0),
      });
    });

    const unidades = filas.reduce((n, f) => n + f.cantidad, 0);
    const total = filas.reduce((n, f) => n + f.subtotal, 0);

    if (!filas.length) return `<p class="vacio">Todavía no hay productos en el catálogo.</p>`;

    return `
      <div class="cifras">
        <div class="cifra cifra--entra">
          <span class="cifra__que">Unidades</span>
          <span class="cifra__cuanto">${numero(unidades)}</span>
        </div>
        <div class="cifra cifra--saldo">
          <span class="cifra__que">Valor a precio mayorista</span>
          <span class="cifra__cuanto">${dinero(total)}</span>
        </div>
      </div>

      <div class="tabla-envoltorio">
        <table class="tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th class="numero">Cantidad</th>
              <th class="numero">Precio</th>
              <th class="numero">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${filas.map((f) => `
              <tr${f.cantidad ? "" : ' class="en-cero"'}>
                <td>
                  <span class="celda__que">${esc(f.nombre)}</span>
                  <span class="celda__detalle">${esc(f.cod)}</span>
                </td>
                <td class="numero">${numero(f.cantidad)}</td>
                <td class="numero">${dinero(f.precio)}</td>
                <td class="numero">${f.cantidad ? dinero(f.subtotal) : "—"}</td>
              </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="numero">${numero(unidades)}</td>
              <td></td>
              <td class="numero">${dinero(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }

  // ---------- El texto que se arma solo ----------

  function resumenVivo() {
    const caja = document.getElementById("s-resumen");
    const cod = document.getElementById("s-cod").value;
    const n = aNumero(document.getElementById("s-cantidad").value);

    if (!cod || !Number.isFinite(n)) { caja.hidden = true; return; }

    const nombre = window.Datos.nombreDe(cod);
    const hay = window.Datos.stockDeposito()[cod] || 0;

    if (que === "conteo") {
      const diferencia = n - hay;
      caja.className = "resumen-vivo" + (diferencia < 0 ? " resumen-vivo--resta" : "");
      caja.innerHTML = diferencia === 0
        ? `Hay <strong>${numero(hay)}</strong> ${esc(nombre)} registradas y contaste
           <strong>${numero(n)}</strong>. <strong>Coinciden</strong>: no hay nada que corregir.`
        : `Hay <strong>${numero(hay)}</strong> ${esc(nombre)} registradas y contaste
           <strong>${numero(n)}</strong>. Se van a
           <strong>${diferencia > 0 ? "sumar " + numero(diferencia) : "descontar " + numero(-diferencia)}</strong>.`;
    } else if (que === "merma") {
      caja.className = "resumen-vivo resumen-vivo--resta";
      caja.innerHTML = `Estás descontando <strong>${numero(n)}</strong> ${esc(nombre)}.
        Quedan <strong>${numero(hay - n)}</strong> en el depósito.`
        + (n > hay ? ` <strong>Ojo:</strong> hay ${numero(hay)}, el depósito queda en negativo.` : "");
    } else {
      caja.className = "resumen-vivo";
      caja.innerHTML = `Estás ingresando <strong>${numero(n)}</strong> ${esc(nombre)}.
        Pasan a ser <strong>${numero(hay + n)}</strong> en el depósito.`;
    }
    caja.hidden = false;
  }

  // ---------- Guardar ----------

  async function guardar() {
    const cod = document.getElementById("s-cod").value;
    const n = aNumero(document.getElementById("s-cantidad").value);
    const cuando = document.getElementById("s-fecha").value || hoy();
    const obs = (document.getElementById("s-obs").value || "").trim();

    const mal = (texto) => {
      const e = document.getElementById("s-error");
      e.textContent = texto;
      e.hidden = false;
    };
    document.getElementById("s-error").hidden = true;

    if (!cod) return mal("Elegí un producto.");
    if (!Number.isFinite(n)) return mal("La cantidad no se entiende como número.");
    if (n < 0) return mal("La cantidad no puede ser negativa. Para descontar, elegí «se rompió o venció».");

    let m;
    if (que === "conteo") {
      const hay = window.Datos.stockDeposito()[cod] || 0;
      const diferencia = n - hay;
      if (diferencia === 0) return mal("Lo contado coincide con lo registrado: no hay nada que corregir.");
      m = window.Datos.ajuste(cod, diferencia, window.Datos.DEPOSITO, {
        fecha: cuando,
        ref: "conteo",
        obs: obs || ("Se contaron " + n + " y había " + hay + " registradas"),
      });
    } else {
      if (n === 0) return mal("La cantidad tiene que ser mayor que cero.");
      m = window.Datos.movimiento(que, cod, n, { fecha: cuando, obs: obs });
    }

    await window.CVDB.guardarVarios("movimientos", [m]);
    await window.Datos.cargar();
    window.Sincro.sincronizar(true);

    cargadosRecien.unshift(m);
    pintar(`<p class="aviso aviso--ok">${esc(textoDeGuardado(m, cod, n))}</p>`);
  }

  function textoDeGuardado(m, cod, n) {
    const nombre = window.Datos.nombreDe(cod);
    const hay = window.Datos.stockDeposito()[cod] || 0;
    if (que === "conteo") {
      return "Corregido: " + nombre + " queda en " + numero(hay) + ".";
    }
    if (que === "merma") {
      return "Descontadas " + numero(n) + " " + nombre + ". Quedan " + numero(hay) + ".";
    }
    return "Ingresadas " + numero(n) + " " + nombre + ". Ahora hay " + numero(hay) + ".";
  }

  const nombreDelMovimiento = (m) => ({
    produccion: "envasado", merma: "rotura o vencimiento", ajuste: "corrección por conteo",
    venta: "venta", entrega: "entrega", liquidacion: "liquidación", devolucion: "devolución",
  })[m.tipo] || m.tipo;

  // ---------- Enganches ----------

  function enganchar() {
    vista.querySelectorAll('input[name="que"]').forEach((r) => {
      r.onchange = () => {
        que = r.value;
        document.getElementById("s-ayuda").textContent = QUE_PASO[que].ayuda;
        document.getElementById("s-etiqueta").innerHTML =
          esc(QUE_PASO[que].etiqueta) + ' <span class="obliga">•</span>';
        vista.querySelectorAll(".opcion").forEach((o) => {
          o.classList.toggle("elegida", o.contains(r) && r.checked);
        });
        resumenVivo();
      };
    });

    document.getElementById("s-cod").onchange = resumenVivo;
    document.getElementById("s-cantidad").oninput = resumenVivo;
    unaVez(document.getElementById("btn-guardar"), guardar);

    vista.querySelectorAll("[data-deshacer]").forEach((b) => {
      unaVez(b, async () => {
        const id = b.dataset.deshacer;
        await window.CVDB.borrar("movimientos", id);
        await window.Datos.cargar();
        window.Sincro.sincronizar(true);
        cargadosRecien = cargadosRecien.filter((m) => m.id !== id);
        pintar(`<p class="aviso aviso--ok">Deshecho.</p>`);
      });
    });
  }

  return { render };
})();
