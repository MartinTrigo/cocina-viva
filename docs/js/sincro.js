// ==========================================================================
// Cocina Viva — sincronización con la planilla
//
// La app funciona entera sin esto: se carga todo en el teléfono y se sube
// cuando hay señal. Acá se hacen las dos cosas que necesitan conexión:
//
//   1. Canjear el código de acceso. Una sola vez por teléfono; de ahí sale la
//      credencial que después acompaña a cada pedido.
//   2. Sincronizar: subir lo pendiente y bajar el estado completo.
//
// Es un solo viaje de ida y vuelta. Sube lo que este teléfono cambió y baja
// todo, ya fusionado con lo que hayan cargado las demás. Después de
// sincronizar, todos los teléfonos muestran lo mismo.
//
// Cada registro viaja con SU id. Si el envío se corta por la mitad y se
// reintenta, el servicio reconoce los ids que ya tiene y los reemplaza en vez
// de sumarlos: en la planilla nunca aparece la misma venta dos veces.
// ==========================================================================

window.Sincro = (function () {
  const { esc, brindis } = window.Util;

  // ---------- Dirección del servicio ----------
  //
  // Se completa después de publicar el Apps Script (ver INSTALACION.md).
  // Mientras esté vacía la app avisa que todavía no hay a dónde sincronizar y
  // sigue guardando todo en el teléfono sin perder nada.
  // Implementación v1, publicada el 1/9/2026. Si alguna vez se hace una
  // implementación NUEVA en vez de una versión nueva, esta dirección cambia y
  // hay que actualizarla acá y subir el número de CACHE en sw.js.
  const SERVICIO = "https://script.google.com/macros/s/AKfycbwpSxJ-sxalWw7Q1vG9cCfsCONpFswE22-A5UCAS1KaVwiyuS6_l1khGMWxrLd0YI8/exec";

  // Tiene que coincidir con la constante API de apps-script/Code.gs. Si una
  // implementación vieja quedó publicada y contesta con otro número, la app
  // prefiere no hacer nada antes que pisar los datos con un esquema que ya no
  // existe.
  const API = 1;

  const hayServicio = () => !!SERVICIO;

  let trabajando = false;
  let pedidaDeNuevo = false;
  let ultimoError = "";

  // ---------- Canje del código ----------

  async function canjear(codigo) {
    codigo = String(codigo || "").trim().toUpperCase();
    if (!codigo) return { ok: false, error: "Escribí el código." };
    if (!hayServicio()) return { ok: false, error: "El servicio todavía no está publicado." };

    try {
      const url = SERVICIO
        + "?canjear=" + encodeURIComponent(codigo)
        + "&dispositivo=" + encodeURIComponent(window.Acceso.dispositivo());
      const respuesta = await fetch(url, { redirect: "follow" });
      const r = await respuesta.json();

      if (!r.ok) return r;
      if (r.api !== API) {
        return { ok: false, error: "El servicio publicado es de otra versión de la app "
          + "(la suya es " + r.api + ", la de este teléfono es " + API + "). "
          + "Hay que publicar una versión nueva del Apps Script." };
      }
      window.Acceso.guardarAcceso(r.credencial, r.persona);
      return r;
    } catch (err) {
      return { ok: false, error: motivoDeRed(err) };
    }
  }

  // ---------- Sincronización ----------

  // silencioso: la que corre sola al abrir la app. No molesta con avisos si no
  // hay señal, porque no haber señal es lo normal y no es un problema.
  async function sincronizar(silencioso) {
    // Si ya hay una en el aire, esta no se tira: se anota y sale sola apenas
    // termine la otra. Descartarla era perder el cambio que la disparó, porque
    // cada guardado y cada borrado dispara la suya.
    if (trabajando) {
      pedidaDeNuevo = true;
      return { ok: false, encolada: true, error: "Ya se está sincronizando." };
    }
    if (!hayServicio()) {
      return { ok: false, error: "El servicio todavía no está publicado.", sin_servicio: true };
    }
    if (!window.Acceso.tieneAcceso()) {
      return { ok: false, error: "Este teléfono todavía no está activado.", sin_permiso: true };
    }

    trabajando = true;
    avisarEstado();
    if (!silencioso) brindis("Sincronizando…");

    try {
      const { sobre, cuantos, corte } = await window.CVDB.pendientes();
      const cuerpo = Object.assign({
        credencial: window.Acceso.credencial(),
        dispositivo: window.Acceso.dispositivo(),
      }, sobre);

      // El tipo text/plain evita el pedido previo de CORS, que Apps Script no
      // contesta. El contenido sigue siendo JSON y del otro lado se lee igual.
      const respuesta = await fetch(SERVICIO, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(cuerpo),
      });
      const r = await respuesta.json();

      if (!r.ok) {
        if (r.sin_permiso) window.Acceso.borrarCredencial();
        ultimoError = r.error || "El servicio rechazó la sincronización.";
        return r;
      }
      if (r.api !== API) {
        ultimoError = "El servicio publicado es de otra versión. No se guardó nada.";
        return { ok: false, error: ultimoError };
      }

      // Recién cuando el servicio confirma se reemplaza la copia local y se
      // mueve la marca. Si algo falla antes, lo pendiente sigue pendiente.
      await window.CVDB.guardarEstado(r, corte);
      await window.Datos.cargar();
      ultimoError = "";
      if (!silencioso) {
        brindis(cuantos ? "Listo: se subieron " + cuantos + (cuantos === 1 ? " cambio." : " cambios.")
                        : "Todo al día.");
      }
      return r;
    } catch (err) {
      ultimoError = motivoDeRed(err);
      if (!silencioso) brindis("No se pudo conectar. Lo cargado no se perdió.");
      return { ok: false, error: ultimoError };
    } finally {
      trabajando = false;
      avisarEstado();
      if (pedidaDeNuevo) {
        pedidaDeNuevo = false;
        sincronizar(true);
      }
    }
  }

  // Acá caen dos cosas muy distintas y conviene nombrar las dos: que no haya
  // señal, y que el servicio esté publicado sin acceso para cualquier persona.
  // La segunda le pasa a TODAS a la vez y no se arregla buscando señal, así
  // que tienen que poder distinguirla.
  function motivoDeRed(err) {
    return "No se pudo conectar con el servicio. Si tenés señal y a la otra le "
      + "pasa lo mismo, puede ser que la implementación del Apps Script no esté "
      + "abierta a «cualquier persona». Detalle: " + (err.message || err);
  }

  // ---------- Estado, para el botón de la cabecera ----------

  const oyentes = [];
  const alCambiar = (fn) => { oyentes.push(fn); };
  const avisarEstado = () => { oyentes.forEach((fn) => { try { fn(); } catch (e) {} }); };

  async function estado() {
    return {
      hayServicio: hayServicio(),
      tieneAcceso: window.Acceso.tieneAcceso(),
      persona: window.Acceso.persona(),
      trabajando: trabajando,
      pendientes: await window.CVDB.cuantosPendientes(),
      ultima: await window.CVDB.ultimaSincro(),
      error: ultimoError,
    };
  }

  // ---------- Pantalla de activación ----------

  async function render(contenedor, volver) {
    const e = await estado();

    contenedor.innerHTML = `
      <div class="portada"><img src="img/marca.svg" alt="Cocina Viva"></div>

      ${!e.hayServicio ? `
        <p class="aviso aviso--info">
          <strong>El servicio todavía no está publicado.</strong> Podés seguir
          cargando: queda todo guardado en el teléfono y se sube apenas esté.
        </p>` : e.tieneAcceso ? `
        <div class="tarjeta">
          <h2>Este teléfono ya está activado</h2>
          <p class="nota">${e.persona ? "Anotado como " + esc(e.persona) + "." : ""}
             ${e.pendientes
               ? e.pendientes + (e.pendientes === 1 ? " cambio sin subir." : " cambios sin subir.")
               : "No queda nada pendiente."}</p>
          <button class="boton boton--ancho separado" id="btn-sincronizar-ahora">Sincronizar ahora</button>
        </div>` : `
        <div class="tarjeta">
          <h2>Activar este teléfono</h2>
          <p>Pedile el código a quien instaló la app. Se usa una sola vez y
             queda atado a este aparato.</p>
          <div class="campo separado">
            <label for="campo-codigo">Código de acceso</label>
            <span class="ayuda">Ocho letras y números, con un guión en el medio.</span>
            <input type="text" id="campo-codigo" autocomplete="off"
                   autocapitalize="characters" spellcheck="false" placeholder="ABCD-2345">
          </div>
          <button class="boton boton--ancho" id="btn-canjear">Activar</button>
        </div>`}

      ${e.error ? `<p class="aviso aviso--error">${esc(e.error)}</p>` : ""}

      <p class="nota nota--pie">
        Todo lo que cargues queda guardado en el teléfono aunque no haya señal.
        La sincronización solo hace falta para que la otra persona lo vea y para
        que quede en la planilla.
      </p>`;

    const canje = document.getElementById("btn-canjear");
    if (canje) canje.onclick = async () => {
      const r = await canjear(document.getElementById("campo-codigo").value);
      if (!r.ok) { ultimoError = r.error; await render(contenedor, volver); return; }
      brindis("Teléfono activado.");
      await sincronizar(false);
      if (volver) volver();
    };

    const ahora = document.getElementById("btn-sincronizar-ahora");
    if (ahora) ahora.onclick = async () => {
      await sincronizar(false);
      await render(contenedor, volver);
    };
  }

  return { render, canjear, sincronizar, estado, hayServicio, alCambiar, API };
})();
