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
  const { esc, dinero, numero, aNumero, hoy, fecha, enBloque } = window.Util;

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
      ${resumenDeposito(productos, deposito)}`;

    enganchar();
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
    document.getElementById("btn-guardar").onclick = guardar;

    vista.querySelectorAll("[data-deshacer]").forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.deshacer;
        await window.CVDB.borrar("movimientos", id);
        await window.Datos.cargar();
        window.Sincro.sincronizar(true);
        cargadosRecien = cargadosRecien.filter((m) => m.id !== id);
        pintar(`<p class="aviso aviso--ok">Deshecho.</p>`);
      };
    });
  }

  return { render };
})();
