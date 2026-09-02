// ==========================================================================
// Cocina Viva — armazón de la app
//
// Maneja la navegación entre secciones, el botón de sincronizar de la cabecera
// y el bloqueo hasta que el teléfono esté activado.
// ==========================================================================

(function () {
  const { esc, dinero, numero } = window.Util;

  const VERSION = "0.5.0 · fase 3";

  const vista = document.getElementById("vista");
  const barra = document.querySelector(".barra");
  const marca = document.getElementById("marca");
  const titulo = document.getElementById("titulo-vista");
  const subtitulo = document.getElementById("subtitulo-vista");
  const botonVolver = document.getElementById("btn-volver");
  const botonSincro = document.getElementById("btn-sincro");

  let instalador = null;   // evento de instalación que ofrece Android

  // Las secciones que todavía no están programadas se muestran igual, con la
  // fase en la que llegan: así se sabe qué va a poder hacerse y no parece que
  // la app estuviera rota.
  const SECCIONES = {
    ingresos: {
      icono: "💵",
      titulo: "Ingresos",
      detalle: "Cargar una venta y sacar el remito",
      subtitulo: "Ventas cobradas",
      clase: "menu__boton--entra",
      listo: true,          // la atiende js/ingresos.js
    },
    egresos: {
      icono: "🧾",
      titulo: "Egresos",
      detalle: "Insumos, honorarios, gastos fijos",
      subtitulo: "Gastos del emprendimiento",
      clase: "menu__boton--sale",
      fase: 4,
      queVa: `Fecha, rubro, detalle, cantidad, monto y medio de pago. Los
        rubros son los mismos cinco que vienen usando: insumos, gastos fijos,
        honorarios, otros gastos e inversión.`,
    },
    consignacion: {
      icono: "🏪",
      titulo: "Consignación",
      detalle: "Lo que hay en cada local y cuánto vale",
      subtitulo: "Mercadería en la calle",
      listo: true,          // la atiende js/consignacion.js
    },
    stock: {
      icono: "📦",
      titulo: "Stock",
      detalle: "Cargar producción y ver el depósito",
      subtitulo: "Depósito",
      clase: "menu__boton--entra",
      listo: true,          // la atiende js/stock.js
    },
    productos: {
      icono: "🫙",
      titulo: "Productos",
      detalle: "La oferta completa y los precios",
      subtitulo: "Catálogo",
      listo: true,          // la atiende js/productos.js
    },
    clientes: {
      icono: "📓",
      titulo: "Clientes",
      detalle: "A quién le vendemos y cómo trabaja",
      subtitulo: "A quién le vendemos",
      listo: true,          // la atiende js/clientes.js
    },
    resumen: {
      icono: "📊",
      titulo: "Resumen",
      detalle: "Balance por mes y descargas",
      subtitulo: "Números del emprendimiento",
      fase: 4,
      queVa: `Elegís un mes y ves el balance: qué entró, qué salió, por medio
        de pago y por rubro, con gráficos. Se puede descargar en planilla o
        imprimir para guardar en PDF.`,
    },
  };

  // ---------- Navegación ----------

  const rutaActual = () => (location.hash || "#/inicio").replace("#/", "");
  const ir = (ruta) => { location.hash = "#/" + ruta; };

  async function mostrar() {
    const ruta = rutaActual();
    const base = ruta.split("/")[0];      // "consignacion/humus" → "consignacion"

    await window.Datos.cargar();
    const activado = window.Acceso.tieneAcceso() || !window.Sincro.hayServicio();

    botonVolver.hidden = ruta === "inicio";
    marca.hidden = ruta !== "inicio";
    barra.classList.toggle("barra--inicio", ruta === "inicio");
    window.scrollTo(0, 0);
    pintarBotonSincro();

    // Sin activar no se entra a ninguna sección, ni siquiera escribiendo la
    // dirección a mano. Mientras el servicio no esté publicado se deja pasar:
    // así se puede probar la app antes de tener la planilla.
    if (base !== "inicio" && base !== "acceso" && !activado) { ir("acceso"); return; }

    if (base === "acceso") {
      encabezado("Acceso", "Activación y sincronización");
      await window.Sincro.render(vista, () => ir("inicio"));
      return;
    }

    // Las secciones ya programadas manejan sus propias sub-pantallas y
    // devuelven qué poner en la cabecera, que cambia según dónde se esté.
    const MODULOS = {
      ingresos: window.Ingresos,
      consignacion: window.Consignacion,
      productos: window.Productos,
      clientes: window.Clientes,
      stock: window.Stock,
    };
    if (MODULOS[base]) {
      // Si una pantalla falla en el medio de dibujarse, sin este catch queda a
      // la vista lo que hubiera quedado a medias —o lo de la pantalla
      // anterior— y no hay forma de saber que algo se rompió. Lo cargado no se
      // pierde nunca: está en el teléfono, no en la pantalla.
      try {
        const cabecera = await MODULOS[base].render(vista, ruta, ir);
        encabezado(cabecera.titulo, cabecera.subtitulo);
      } catch (err) {
        encabezado(SECCIONES[base].titulo, SECCIONES[base].subtitulo);
        vista.innerHTML = `<p class="aviso aviso--error">No se pudo mostrar esta pantalla.
          Lo que tengas cargado sigue guardado en el teléfono.<br><br>
          Detalle: ${esc(err.message || err)}</p>
          <button class="boton boton--ancho" data-ir="inicio">Volver al inicio</button>`;
        vista.querySelectorAll("[data-ir]").forEach((b) => { b.onclick = () => ir(b.dataset.ir); });
      }
      return;
    }

    if (SECCIONES[base]) {
      const s = SECCIONES[base];
      encabezado(s.titulo, s.subtitulo);
      enConstruccion(s);
      return;
    }

    encabezado("Cocina Viva", "Gestión del emprendimiento");
    await inicio(activado);
  }

  function encabezado(t, sub) {
    titulo.textContent = t;
    subtitulo.textContent = sub;
    document.title = t === "Cocina Viva" ? "Cocina Viva" : t + " · Cocina Viva";
  }

  // ---------- Inicio ----------

  async function inicio(activado) {
    const menu = Object.entries(SECCIONES).map(([ruta, s]) => `
      <button class="menu__boton ${s.clase || ""}" data-ir="${ruta}" ${activado ? "" : "disabled"}>
        <span class="menu__icono">${s.icono}</span>
        <span>
          <span class="menu__titulo">${esc(s.titulo)}</span>
          <span class="menu__detalle">${activado ? esc(s.detalle) : "Activá el teléfono primero"}</span>
        </span>
      </button>`).join("");

    vista.innerHTML = `
      ${activado ? resumenDeArriba() : `
        <p class="aviso aviso--info">
          <strong>Falta activar este teléfono.</strong> Pedí el código de acceso
          y cargalo en <strong>Acceso</strong>, acá abajo.
        </p>`}

      <div class="menu">
        ${menu}
        <button class="menu__boton" data-ir="acceso">
          <span class="menu__icono">🔑</span>
          <span>
            <span class="menu__titulo">Acceso y sincronización</span>
            <span class="menu__detalle" id="menu-acceso-detalle">…</span>
          </span>
        </button>
      </div>

      ${instalador ? `<button class="boton boton--secundario boton--ancho separado"
                        id="btn-instalar">Instalar en el celular</button>` : ""}

      <p class="nota nota--pie">
        Todo lo que cargues queda guardado en el teléfono y funciona sin señal.
        Se sube a la planilla con el botón ↻ de arriba.
      </p>`;

    vista.querySelectorAll("[data-ir]").forEach((b) => { b.onclick = () => ir(b.dataset.ir); });

    const instalar = document.getElementById("btn-instalar");
    if (instalar) instalar.onclick = async () => {
      instalador.prompt();
      await instalador.userChoice;
      instalador = null;
      mostrar();
    };

    const detalle = document.getElementById("menu-acceso-detalle");
    if (detalle) {
      const e = await window.Sincro.estado();
      detalle.textContent = !e.hayServicio ? "El servicio todavía no está publicado"
        : !e.tieneAcceso ? "Este teléfono todavía no está activado"
        : e.pendientes ? e.pendientes + (e.pendientes === 1 ? " cambio sin subir" : " cambios sin subir")
        : "Todo al día";
    }
  }

  // Las dos cifras que se miran antes que cualquier otra cosa: lo que hay en
  // el depósito y lo que está en la calle sin cobrar.
  function resumenDeArriba() {
    const deposito = window.Datos.stockDeposito();
    const enCalle = window.Datos.localesConMercaderia()
      .reduce((total, local) => total + window.Datos.valorDe(window.Datos.stockEn(local)), 0);
    const unidades = Object.keys(deposito).reduce((n, cod) => n + deposito[cod], 0);

    return `
      <div class="cifras">
        <div class="cifra cifra--entra">
          <span class="cifra__que">En depósito · ${numero(unidades)} u.</span>
          <span class="cifra__cuanto">${dinero(window.Datos.valorDe(deposito))}</span>
        </div>
        <div class="cifra cifra--saldo">
          <span class="cifra__que">En la calle</span>
          <span class="cifra__cuanto">${dinero(enCalle)}</span>
        </div>
      </div>`;
  }

  // ---------- Secciones que todavía no están ----------

  function enConstruccion(s) {
    vista.innerHTML = `
      <div class="tarjeta">
        <h2>${s.icono} ${esc(s.titulo)}</h2>
        <p>${s.queVa}</p>
        <p class="aviso aviso--info al-final">
          Esta sección llega en la <strong>fase ${s.fase}</strong> del desarrollo.
        </p>
      </div>
      <button class="boton boton--ancho" data-ir="inicio">Volver al inicio</button>`;

    vista.querySelectorAll("[data-ir]").forEach((b) => { b.onclick = () => ir(b.dataset.ir); });
  }

  // ---------- Botón de sincronizar ----------

  async function pintarBotonSincro() {
    const e = await window.Sincro.estado();
    botonSincro.className = "sincro"
      + (e.trabajando ? " sincro--girando" : "")
      + (!e.trabajando && e.error ? " sincro--error" : "")
      + (!e.trabajando && !e.error && e.pendientes ? " sincro--pendiente" : "");
    botonSincro.title = !e.hayServicio ? "El servicio todavía no está publicado"
      : !e.tieneAcceso ? "Este teléfono todavía no está activado"
      : e.pendientes ? e.pendientes + " sin subir"
      : "Todo al día";
  }

  botonSincro.onclick = async () => {
    const e = await window.Sincro.estado();
    if (!e.hayServicio || !e.tieneAcceso) { ir("acceso"); return; }
    await window.Sincro.sincronizar(false);
    mostrar();
  };

  window.Sincro.alCambiar(pintarBotonSincro);

  // ---------- Arranque ----------

  // La flecha sube un nivel, no salta al inicio: desde la ficha de un local
  // vuelve a la lista de locales, y recién desde ahí al inicio.
  botonVolver.onclick = () => {
    const partes = rutaActual().split("/");
    if (partes.length > 1) { partes.pop(); ir(partes.join("/")); return; }
    ir("inicio");
  };
  window.addEventListener("hashchange", mostrar);

  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    instalador = evento;
    if (rutaActual() === "inicio") mostrar();
  });

  document.getElementById("pie-version").textContent = "versión " + VERSION;

  async function arrancar() {
    // Abrir el almacenamiento se prueba aparte del resto. Si todo colgara del
    // mismo catch, cualquier error de cualquier pantalla saldría con el cartel
    // de «no se pudo abrir el almacenamiento», que manda a buscar el problema
    // donde no está: pasó una vez y se perdió un rato averiguándolo.
    try {
      await window.CVDB.abrir();
    } catch (err) {
      vista.innerHTML = `<p class="aviso aviso--error">No se pudo abrir el almacenamiento
        del teléfono, así que la app no puede guardar nada. Suele pasar en modo
        incógnito o con el almacenamiento del navegador bloqueado.<br><br>
        Detalle: ${esc(err.message || err)}</p>`;
      return;
    }

    await mostrar();

    // Al abrir se sincroniza sola y en silencio: si hay señal, los números ya
    // están al día antes de que nadie toque nada; si no hay, no molesta.
    if (window.Sincro.hayServicio() && window.Acceso.tieneAcceso()) {
      window.Sincro.sincronizar(true).then(() => mostrar());
    }
  }

  // Cualquier otra cosa que falle se muestra como lo que es, sin inventarle
  // una causa. Un cartel que nombra mal el problema es peor que uno genérico.
  arrancar().catch((err) => {
    vista.innerHTML = `<p class="aviso aviso--error">Algo falló al arrancar la app.
      Lo que tengas cargado no se perdió: sigue guardado en el teléfono.<br><br>
      Detalle: ${esc(err.message || err)}</p>`;
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
  }
})();
