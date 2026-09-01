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
  const dinero = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");

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

  return { esc, brindis, numero, dinero, aNumero, hoy, fecha, mesLargo, mesDe, enBloque, nuevoId };
})();
