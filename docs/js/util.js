// ==========================================================================
// Cocina Viva — ayudas cortas de uso general
// ==========================================================================

window.Util = (function () {

  // Todo lo que se escribe en la app pasa por acá antes de volver a la
  // pantalla, para que un apóstrofo o un signo raro no rompa la vista.
  function esc(valor) {
    return String(valor == null ? "" : valor)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Mensaje breve al pie de la pantalla.
  let brindisActivo = null;
  function brindis(texto) {
    if (brindisActivo) brindisActivo.remove();
    const caja = document.createElement("div");
    caja.className = "brindis";
    caja.setAttribute("role", "status");
    caja.textContent = texto;
    document.body.appendChild(caja);
    brindisActivo = caja;
    setTimeout(() => { caja.remove(); if (brindisActivo === caja) brindisActivo = null; }, 3200);
  }

  const numero = (n) => Number(n || 0).toLocaleString("es-AR");

  // Los pesos se muestran sin centavos. No es una simplificación: los precios
  // del catálogo son todos redondos y mostrar ",00" en cada renglón solo hace
  // más difícil leer la columna de un vistazo.
  //
  // El menos va ANTES del signo: "-$160.326" y no "$-160.326", que es como sale
  // si uno pega el "$" adelante sin mirar y se lee raro justo en el número que
  // más importa mirar, el balance en rojo.
  function dinero(n) {
    const r = Math.round(Number(n) || 0);
    return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("es-AR");
  }

  // Los campos de número son de texto, no <input type="number">.
  //
  // Es una lección de MonAgric: el navegador considera inválido "5,5" en un
  // campo numérico y lo deja vacío sin avisar. Acá la gente escribe con coma.
  // Así que se recibe texto y se interpreta a la argentina.
  //
  //   "1.200"   → 1200      (el punto separa miles)
  //   "2,5"     → 2.5       (la coma es el decimal)
  //   "1.250,5" → 1250.5
  //   "1.5"     → 1.5       (un punto suelto que no separa miles: es decimal)
  function aNumero(texto) {
    let s = String(texto == null ? "" : texto).trim().replace(/\s/g, "").replace(/^\$/, "");
    if (!s) return NaN;

    if (s.indexOf(",") >= 0) {
      s = s.replace(/\./g, "").replace(",", ".");        // hay coma: el punto es de miles
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, "");                          // 1.200 o 1.250.000: miles
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  // Fecha local, no UTC: a la noche en Argentina el ISO en UTC ya es mañana.
  const hoy = () => {
    const d = new Date();
    const dos = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + dos(d.getMonth() + 1) + "-" + dos(d.getDate());
  };

  // "2026-08-28" → "28/08/2026", que es como se lee acá.
  function fecha(iso) {
    if (!iso) return "";
    const p = String(iso).slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(iso);
  }

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                 "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  // "2026-08" → "agosto de 2026"
  function mesLargo(am) {
    const p = String(am || "").split("-");
    if (p.length < 2) return String(am || "");
    return MESES[Number(p[1]) - 1] + " de " + p[0];
  }

  const mesDe = (iso) => String(iso || "").slice(0, 7);

  // Une las palabras con un espacio que no se parte. Es para las
  // presentaciones: "360 g" cortado deja un renglón con una letra sola, y en
  // una tabla de productos en un teléfono eso pasa en casi todas las filas.
  // Son textos cortos siempre, así que van enteros o no van.
  const enBloque = (texto) => String(texto == null ? "" : texto).replace(/ /g, " ");

  // Identificador propio de cada registro. Va desde que se crea en el teléfono
  // y no cambia nunca: es lo que permite reintentar un envío sin duplicar la
  // fila en la planilla.
  function nuevoId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  // Un botón que dispara algo asíncrono tiene que dejar de responder mientras
  // eso pasa. Guardar una venta son varias escrituras seguidas más recalcular
  // todo: en un celular que tarda medio segundo, el segundo toque —que es lo
  // más natural del mundo cuando el botón no reacciona— entra antes de que el
  // primero haya terminado y guarda la venta DOS VECES, con el stock
  // descontado doble. Lo mismo con el aumento de precios, que aplicado dos
  // veces compone el porcentaje.
  //
  // Se desactiva mientras corre y se vuelve a habilitar al terminar, salvo que
  // la pantalla ya se haya ido, que es lo normal cuando el guardado navega a
  // otro lado.
  function unaVez(boton, fn) {
    if (!boton) return;
    let ocupado = false;
    boton.onclick = async (evento) => {
      if (ocupado) return;
      ocupado = true;
      // Vuelve a como estaba, no a habilitado: hay botones que nacen
      // deshabilitados a propósito, como el de dar de baja los marcados
      // mientras no hay ninguno marcado.
      const estaba = boton.disabled;
      boton.disabled = true;
      try {
        await fn(evento);
      } finally {
        ocupado = false;
        if (boton.isConnected) boton.disabled = estaba;
      }
    };
  }

  // «1 unidad», no «1 unidades». Escrito a mano se escapa siempre, y en una
  // pantalla que la clienta tiene enfrente se nota.
  const unidades = (n) => numero(n) + (Number(n) === 1 ? " unidad" : " unidades");

  // "ayer", "hace 12 días", "hace 4 meses". Un número de días pelado obliga a
  // dividir mentalmente, y estos números se leen de reojo mientras se decide a
  // quién visitar.
  function haceCuanto(dias) {
    if (dias == null) return "";
    if (dias <= 0) return "hoy";
    if (dias === 1) return "ayer";
    if (dias < 31) return "hace " + dias + " días";
    const meses = Math.round(dias / 30.44);
    if (meses < 12) return "hace " + meses + (meses === 1 ? " mes" : " meses");
    const anios = Math.floor(meses / 12);
    const resto = meses % 12;
    return "hace " + anios + (anios === 1 ? " año" : " años")
      + (resto ? " y " + resto + (resto === 1 ? " mes" : " meses") : "");
  }

  return { esc, brindis, numero, dinero, aNumero, hoy, fecha, mesLargo, mesDe,
           enBloque, nuevoId, unaVez, unidades, haceCuanto };
})();
