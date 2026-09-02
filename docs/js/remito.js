// ==========================================================================
// Cocina Viva — el remito
//
// Dibuja un remito en un <canvas> y lo entrega como .jpg para mandar por
// WhatsApp. Sin librerías: el canvas es parte del navegador, no pesa nada y
// funciona sin señal, que es cuando más falta hace —parado en el local, con el
// pedido recién entregado—.
//
// Lo usan dos pantallas: las ventas de Ingresos y las entregas de
// Consignación. Por eso recibe una estructura genérica y no sabe nada de
// ninguna de las dos.
//
// CÓMO SE COMPARTE
// Si el teléfono sabe compartir archivos (navigator.share con files), se abre
// el menú de siempre y se elige WhatsApp. Si no —una PC, un navegador viejo—,
// se descarga el archivo. Las dos cosas terminan en lo mismo: un .jpg en la
// mano.
// ==========================================================================

window.Remito = (function () {
  const { dinero, numero, fecha } = window.Util;

  // Se dibuja al doble de tamaño y se muestra a la mitad: en la pantalla de un
  // teléfono, un canvas a tamaño real se ve borroso.
  const ESCALA = 2;
  const ANCHO = 720;
  const MARGEN = 40;

  const BORDO = "#8c0730";
  const CREMA = "#faf6f0";
  const TEXTO = "#2a2124";
  const SUAVE = "#6b6560";
  const BORDE = "#e5ddd4";

  const FUENTE = '-apple-system, "Segoe UI", Roboto, system-ui, sans-serif';
  const letra = (tam, peso) => (peso || "400") + " " + tam + "px " + FUENTE;

  // El logotipo se carga una vez y se reusa. Si no se pudiera cargar —un
  // navegador que no dibuja SVG en canvas—, el remito sale igual con el nombre
  // escrito en letras: un remito sin logo sirve, uno que no sale no.
  let logo = null;
  let logoIntentado = false;

  function cargarLogo() {
    if (logoIntentado) return Promise.resolve(logo);
    logoIntentado = true;
    return new Promise((resolver) => {
      const img = new Image();
      img.onload = () => { logo = img; resolver(logo); };
      img.onerror = () => { logo = null; resolver(null); };
      img.src = "img/logotipo.svg";
    });
  }

  // ---------- Dibujo ----------

  // datos = {
  //   titulo:   "REMITO" | "REMITO DE ENTREGA"
  //   numero:   "A3F9C1"
  //   fecha:    "2026-09-01"
  //   cliente:  "humus"
  //   leyenda:  texto opcional bajo el cliente (p. ej. "Mercadería en consignación")
  //   lineas:   [{ nombre, cod, cantidad, precio, subtotal }]
  //   conPrecios: true | false
  //   total:    número
  //   obs:      texto opcional
  // }
  async function dibujar(datos) {
    await cargarLogo();

    const lienzo = document.createElement("canvas");
    const c = lienzo.getContext("2d");

    // Primera pasada en un canvas descartable, solo para medir cuánto alto
    // necesitan los renglones: los nombres largos ocupan dos y no se sabe
    // cuántos son hasta escribirlos.
    const alto = medirAlto(c, datos);

    lienzo.width = ANCHO * ESCALA;
    lienzo.height = alto * ESCALA;
    c.scale(ESCALA, ESCALA);

    c.fillStyle = CREMA;
    c.fillRect(0, 0, ANCHO, alto);

    let y = cabecera(c, datos);
    y = cuerpo(c, datos, y);
    pie(c, alto);

    return lienzo;
  }

  function cabecera(c, datos) {
    const altoBanda = 108;
    c.fillStyle = BORDO;
    c.fillRect(0, 0, ANCHO, altoBanda);

    if (logo) {
      // El logotipo original es blanco: va tal cual sobre el bordó.
      const alto = 34;
      const ancho = alto * (582 / 172);          // la proporción del viewBox
      c.drawImage(logo, MARGEN, 26, ancho, alto);
    } else {
      c.fillStyle = "#fff";
      c.font = letra(30, "700");
      c.fillText("Cocina Viva", MARGEN, 52);
    }

    c.fillStyle = "rgba(255,255,255,.85)";
    c.font = letra(14);
    c.fillText("Fermentos y conservas · Comarca Andina del Paralelo 42", MARGEN, 82);

    c.fillStyle = "#fff";
    c.font = letra(20, "700");
    c.textAlign = "right";
    c.fillText(datos.titulo || "REMITO", ANCHO - MARGEN, 48);
    c.font = letra(13);
    c.fillStyle = "rgba(255,255,255,.85)";
    c.fillText("N° " + datos.numero, ANCHO - MARGEN, 68);
    c.fillText(fecha(datos.fecha), ANCHO - MARGEN, 86);
    c.textAlign = "left";

    return altoBanda + 34;
  }

  function cuerpo(c, datos, y) {
    const conPrecios = datos.conPrecios !== false;

    c.fillStyle = SUAVE;
    c.font = letra(13);
    c.fillText("ENTREGADO A", MARGEN, y);
    y += 26;
    c.fillStyle = TEXTO;
    c.font = letra(24, "700");
    c.fillText(datos.cliente || "—", MARGEN, y);
    y += 24;

    if (datos.leyenda) {
      c.fillStyle = SUAVE;
      c.font = letra(14);
      c.fillText(datos.leyenda, MARGEN, y);
      y += 22;
    }
    y += 16;

    // Encabezado de la tabla
    const xCant = ANCHO - MARGEN - (conPrecios ? 300 : 60);
    const xPrecio = ANCHO - MARGEN - 150;
    const xTotal = ANCHO - MARGEN;

    c.fillStyle = SUAVE;
    c.font = letra(12, "700");
    c.fillText("PRODUCTO", MARGEN, y);
    c.textAlign = "right";
    c.fillText("CANT.", xCant, y);
    if (conPrecios) {
      c.fillText("PRECIO", xPrecio, y);
      c.fillText("SUBTOTAL", xTotal, y);
    }
    c.textAlign = "left";
    y += 10;
    linea(c, y);
    y += 22;

    // Renglones
    (datos.lineas || []).forEach((l) => {
      const partes = partir(c, l.nombre, xCant - MARGEN - 70, letra(16));
      c.fillStyle = TEXTO;
      c.font = letra(16);
      partes.forEach((parte, i) => { c.fillText(parte, MARGEN, y + i * 20); });

      c.font = letra(16, "600");
      c.textAlign = "right";
      c.fillText(numero(l.cantidad), xCant, y);
      if (conPrecios) {
        c.font = letra(16);
        c.fillText(dinero(l.precio), xPrecio, y);
        c.font = letra(16, "600");
        c.fillText(dinero(l.subtotal), xTotal, y);
      }
      c.textAlign = "left";

      c.fillStyle = SUAVE;
      c.font = letra(12);
      c.fillText(l.cod, MARGEN, y + partes.length * 20 - 2);

      y += partes.length * 20 + 16;
      linea(c, y - 10, BORDE);
    });

    y += 14;

    if (conPrecios) {
      c.fillStyle = BORDO;
      c.font = letra(15, "700");
      c.textAlign = "right";
      c.fillText("TOTAL", xPrecio, y + 6);
      c.font = letra(26, "700");
      c.fillText(dinero(datos.total), xTotal, y + 8);
      c.textAlign = "left";
      y += 40;
    } else {
      c.fillStyle = BORDO;
      c.font = letra(15, "700");
      c.textAlign = "right";
      c.fillText(numero(totalUnidades(datos.lineas)) + " unidades", xTotal, y + 6);
      c.textAlign = "left";
      y += 28;
    }

    if (datos.obs) {
      y += 10;
      c.fillStyle = SUAVE;
      c.font = letra(12, "700");
      c.fillText("OBSERVACIONES", MARGEN, y);
      y += 20;
      c.fillStyle = TEXTO;
      c.font = letra(15);
      partir(c, datos.obs, ANCHO - MARGEN * 2, letra(15)).forEach((parte, i) => {
        c.fillText(parte, MARGEN, y + i * 20);
      });
    }
    return y;
  }

  function pie(c, alto) {
    c.fillStyle = SUAVE;
    c.font = letra(12);
    c.textAlign = "center";
    c.fillText("Cocina Viva · cocinavivacomarca@gmail.com", ANCHO / 2, alto - 22);
    c.textAlign = "left";
  }

  const linea = (c, y, color) => {
    c.strokeStyle = color || BORDO;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(MARGEN, y);
    c.lineTo(ANCHO - MARGEN, y);
    c.stroke();
  };

  const totalUnidades = (lineas) =>
    (lineas || []).reduce((n, l) => n + (Number(l.cantidad) || 0), 0);

  // Parte un texto en los renglones que entren en el ancho dado.
  function partir(c, texto, ancho, fuente) {
    c.font = fuente;
    const palabras = String(texto || "").split(" ");
    const salida = [];
    let renglon = "";
    palabras.forEach((p) => {
      const prueba = renglon ? renglon + " " + p : p;
      if (c.measureText(prueba).width > ancho && renglon) { salida.push(renglon); renglon = p; }
      else renglon = prueba;
    });
    if (renglon) salida.push(renglon);
    return salida.length ? salida : [""];
  }

  // Mide sin dibujar, para saber de qué alto tiene que ser el canvas.
  function medirAlto(c, datos) {
    let alto = 108 + 34 + 26 + 24 + (datos.leyenda ? 22 : 0) + 16 + 32;
    const xCant = ANCHO - MARGEN - (datos.conPrecios !== false ? 300 : 60);
    (datos.lineas || []).forEach((l) => {
      alto += partir(c, l.nombre, xCant - MARGEN - 70, letra(16)).length * 20 + 16;
    });
    alto += 14 + (datos.conPrecios !== false ? 40 : 28);
    if (datos.obs) {
      alto += 30 + partir(c, datos.obs, ANCHO - MARGEN * 2, letra(15)).length * 20;
    }
    return alto + 60;
  }

  // ---------- Entrega ----------

  const aBlob = (lienzo) =>
    new Promise((r) => lienzo.toBlob(r, "image/jpeg", 0.92));

  function nombreArchivo(datos) {
    const limpio = String(datos.cliente || "cliente").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return "remito-" + limpio + "-" + String(datos.fecha).replace(/-/g, "") + ".jpg";
  }

  // Devuelve qué pasó, para poder decirlo en castellano en la pantalla.
  async function compartir(datos) {
    const lienzo = await dibujar(datos);
    const blob = await aBlob(lienzo);
    const nombre = nombreArchivo(datos);
    const archivo = new File([blob], nombre, { type: "image/jpeg" });

    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({
          files: [archivo],
          title: (datos.titulo || "Remito") + " · Cocina Viva",
          text: (datos.titulo || "Remito") + " para " + datos.cliente,
        });
        return { como: "compartido" };
      } catch (err) {
        // Cancelar el menú de compartir no es un error: es que cambiaron de
        // idea. No hay que avisar nada ni ofrecer la descarga como si algo
        // hubiera fallado.
        if (err && err.name === "AbortError") return { como: "cancelado" };
        // Cualquier otra cosa sí es una falla: se cae a la descarga.
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { como: "descargado", nombre: nombre };
  }

  // Para mostrarlo en pantalla antes de mandarlo.
  async function vistaPrevia(datos) {
    const lienzo = await dibujar(datos);
    const blob = await aBlob(lienzo);
    return URL.createObjectURL(blob);
  }

  return { dibujar, compartir, vistaPrevia };
})();
