// ==========================================================================
// Cocina Viva — el remito
//
// Dibuja un remito en un <canvas> y lo entrega como .jpg. Sin librerías: el
// canvas es parte del navegador, no pesa nada y funciona sin señal, que es
// cuando más falta hace —parado en el local, con el pedido recién entregado—.
//
// FORMATO TICKET, 58 mm.
//
// Está pensado para las impresoras térmicas portátiles chicas, esas «de
// gatito» que se llevan en la mochila. Casi todas son de 58 mm de papel y
// imprimen 384 puntos de ancho a 203 dpi. Por eso el remito se dibuja sobre una
// grilla de 384 y crece hacia abajo lo que haga falta: es un ticket largo y
// angosto, no una hoja.
//
// Se dibuja al doble (768 px reales) para que en la pantalla de un teléfono no
// se vea borroso. Como 768 es exactamente el doble de 384, la app de la
// impresora lo reduce sin ensuciar ni un punto.
//
// VA EN BLANCO Y NEGRO, A PROPÓSITO. El papel térmico es de un solo tono: no
// hay grises ni colores, cada punto se quema o no se quema. Una banda bordó
// como la de la app saldría como un rectángulo negro macizo, que gasta batería,
// gasta el papel y se ve peor. Negro sobre blanco imprime perfecto y en
// WhatsApp se lee como lo que es: un remito.
//
// Lo usan dos pantallas: las ventas de Ingresos y las entregas de
// Consignación. Por eso recibe una estructura genérica y no sabe nada de
// ninguna de las dos.
// ==========================================================================

window.Remito = (function () {
  const { dinero, numero, fecha, esc } = window.Util;

  const ANCHO_PAPEL = 384;    // los puntos que imprime una térmica de 58 mm

  // El remito está dibujado en un espacio más chico que el papel y después se
  // agranda para llenarlo. Es la forma de subirle dos puntos a la letra sin
  // tocar los treinta números del dibujo: si se agrandara solo la tipografía,
  // los renglones quedarían encimados. Así crece todo junto y en proporción
  // —letra, interlineado, rayas, logo— y el ritmo no se mueve.
  // Tres tamaños. El número es el ancho del espacio en que se dibuja: cuanto
  // más chico, más hay que agrandarlo para llenar los 384 del papel y más
  // grande sale todo. Al lado, el cuerpo 12 del nombre del producto:
  //    normal 328 → 14 puntos    grande 288 → 16    enorme 256 → 18
  // Se puede elegir porque desde acá no hay forma de ver el papel, y lo que en
  // la pantalla parece bien en el papel puede ser chico.
  const ESPACIOS = { normal: 328, grande: 288, enorme: 256 };
  const TAMANO_POR_DEFECTO = "grande";

  const ESCALA = 2;           // el doble en pantalla: nítido, y exacto al reducir

  // Un margen de 5 acá son 7 puntos de papel, menos de un milímetro. Más al
  // borde no conviene: el rollo nunca entra perfectamente derecho.
  const MARGEN = 5;

  // Estas tres cambian con el tamaño elegido. Las fija medidas() justo antes de
  // dibujar, y pintar() las lee: así el dibujo no sabe nada de todo esto.
  let ANCHO = ESPACIOS[TAMANO_POR_DEFECTO];
  let CRECE = ANCHO_PAPEL / ANCHO;
  let UTIL = ANCHO - MARGEN * 2;

  function tamano() {
    try {
      const guardado = localStorage.getItem("cv-tamano");
      if (guardado && ESPACIOS[guardado]) return guardado;
    } catch (err) { /* da igual */ }
    return TAMANO_POR_DEFECTO;
  }

  function ponerTamano(cual) {
    if (!ESPACIOS[cual]) return tamano();
    try { localStorage.setItem("cv-tamano", cual); } catch (err) { /* da igual */ }
    return cual;
  }

  function medidas() {
    ANCHO = ESPACIOS[tamano()];
    CRECE = ANCHO_PAPEL / ANCHO;
    UTIL = ANCHO - MARGEN * 2;
  }

  // El papel térmico no tiene medios tonos: un palo de letra de un punto de
  // ancho sale roto o no sale. Un hilo de contorno del mismo color engorda cada
  // trazo un pelo de cada lado, y es la diferencia entre leerlo y adivinarlo.
  // En pantalla no se nota; en el papel sí.
  const ENGROSAR = 0.35;

  function poner(c, texto, x, y) {
    c.fillText(texto, x, y);
    c.lineWidth = ENGROSAR;
    c.lineJoin = "round";
    c.strokeStyle = c.fillStyle;
    c.strokeText(texto, x, y);
  }

  const NEGRO = "#000000";
  const GRIS = "#555555";     // lo más claro que una térmica todavía distingue

  const FUENTE = '-apple-system, "Segoe UI", Roboto, system-ui, sans-serif';
  const letra = (tam, peso) => (peso || "400") + " " + tam + "px " + FUENTE;

  // El logotipo se carga una vez y se reusa. Si no se pudiera cargar, el remito
  // sale igual con el nombre escrito en letras: un remito sin logo sirve, uno
  // que no sale no.
  let logo = null;
  let logoIntentado = false;

  function cargarLogo() {
    if (logoIntentado) return Promise.resolve(logo);
    logoIntentado = true;
    return new Promise((resolver) => {
      const img = new Image();
      img.onload = () => { logo = img; resolver(logo); };
      img.onerror = () => { logo = null; resolver(null); };
      img.src = "img/logotipo-negro.svg";
    });
  }

  // ---------- Dibujo ----------

  // datos = {
  //   titulo:   "REMITO" | "REMITO DE ENTREGA"
  //   numero:   "A3F9C1"
  //   fecha:    "2026-09-01"
  //   cliente:  "humus"
  //   etiquetaCliente: "ENTREGADO A" (por defecto) | "RECIBIMOS DE" | ...
  //   leyenda:  texto opcional bajo el cliente
  //   lineas:   [{ nombre, cod, cantidad, precio, subtotal }]
  //   conPrecios: true | false
  //   total:    número
  //   obs:      texto opcional
  // }
  //
  // Se dibuja dos veces: la primera sobre un canvas descartable, solo para
  // saber cuánto alto va a necesitar. Medir por adelantado obligaría a repetir
  // toda la lógica de los saltos de renglón en una función aparte, y esas dos
  // copias se desincronizan al primer cambio.
  // La escala es 2 para mirarlo en pantalla o mandarlo por WhatsApp, y 1 para
  // la térmica, que quiere los 384 puntos exactos del papel y ni uno más.
  async function dibujar(datos, escala) {
    await cargarLogo();
    medidas();
    const cuanto = escala || ESCALA;

    const medidor = document.createElement("canvas").getContext("2d");
    const alto = pintar(medidor, datos, false);

    const lienzo = document.createElement("canvas");
    lienzo.width = ANCHO_PAPEL * cuanto;
    lienzo.height = Math.ceil(alto * CRECE) * cuanto;
    const c = lienzo.getContext("2d");
    c.scale(CRECE * cuanto, CRECE * cuanto);
    pintar(c, datos, true);
    return lienzo;
  }

  // Devuelve el alto usado. Con dibuja=false no escribe nada: solo mide.
  function pintar(c, datos, dibuja) {
    const conPrecios = datos.conPrecios !== false;

    if (dibuja) {
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, ANCHO, 20000);
      c.textBaseline = "alphabetic";
    }

    const centro = ANCHO / 2;
    let y = 22;

    // ---- Cabecera ----
    if (logo) {
      const alto = 26;
      const ancho = alto * (582 / 172);       // la proporción del viewBox
      if (dibuja) c.drawImage(logo, centro - ancho / 2, y - 18, ancho, alto);
      y += 18;
    } else {
      if (dibuja) {
        c.fillStyle = NEGRO;
        c.font = letra(24, "700");
        c.textAlign = "center";
        poner(c, "Cocina Viva", centro, y);
      }
      y += 6;
    }

    y = escribirCentrado(c, dibuja, "Fermentos y conservas", letra(10), GRIS, y + 16);
    y = escribirCentrado(c, dibuja, "Comarca Andina del Paralelo 42", letra(10), GRIS, y + 12);

    y += 12;
    y = raya(c, dibuja, y, NEGRO, 1.5);

    y = escribirCentrado(c, dibuja, datos.titulo || "REMITO", letra(15, "700"), NEGRO, y + 18);
    y = escribirCentrado(c, dibuja, "N° " + datos.numero + "  ·  " + fecha(datos.fecha),
                         letra(11), GRIS, y + 14);
    y += 10;
    y = raya(c, dibuja, y, NEGRO, 1.5);

    // ---- A quién ----
    // Quién es el otro cambia según el papel: en un remito se le entrega, en un
    // recibo se le cobra y en una devolución es él quien devuelve. Poner
    // «entregado a» en los tres estaría mal en dos de ellos, y son documentos
    // que quedan en manos del cliente.
    y = escribir(c, dibuja, datos.etiquetaCliente || "ENTREGADO A",
                 letra(9, "700"), GRIS, MARGEN, y + 16);
    // El nombre se parte si no entra. En 384 puntos, «almacén de ramos generales
    // don segundo sombra» se salía del papel y la térmica lo cortaba a la mitad.
    partir(c, datos.cliente || "—", UTIL, letra(17, "700")).forEach((parte, i) => {
      y = escribir(c, dibuja, parte, letra(17, "700"), NEGRO, MARGEN, y + (i ? 19 : 20));
    });
    if (datos.leyenda) {
      partir(c, datos.leyenda, UTIL, letra(10)).forEach((parte) => {
        y = escribir(c, dibuja, parte, letra(10), GRIS, MARGEN, y + 13);
      });
    }

    y += 12;
    y = raya(c, dibuja, y, NEGRO, 1);

    // ---- Los renglones ----
    //
    // Cada producto ocupa dos líneas: el nombre a lo ancho, y debajo la cuenta
    // con el subtotal a la derecha. En 384 puntos no entran cuatro columnas sin
    // que el nombre quede en tres pedazos, que es justo lo que hay que leer.
    (datos.lineas || []).forEach((l) => {
      y += 13;
      const partes = partir(c, l.nombre, UTIL - 40, letra(12, "600"));
      partes.forEach((parte, i) => {
        escribir(c, dibuja, parte, letra(12, "600"), NEGRO, MARGEN, y + i * 14);
      });
      y += (partes.length - 1) * 14;

      if (dibuja) {
        c.fillStyle = GRIS;
        c.font = letra(9);
        c.textAlign = "right";
        poner(c, l.cod, ANCHO - MARGEN, y);
        c.textAlign = "left";
      }

      y += 15;
      const cuenta = conPrecios
        ? numero(l.cantidad) + " × " + dinero(l.precio)
        : numero(l.cantidad) + (l.cantidad === 1 ? " unidad" : " unidades");
      escribir(c, dibuja, cuenta, letra(12), NEGRO, MARGEN + 8, y);
      if (conPrecios) {
        escribirDerecha(c, dibuja, dinero(l.subtotal), letra(13, "700"), NEGRO, y);
      }
      y += 8;
      y = raya(c, dibuja, y, "#bbbbbb", 1);
    });

    // ---- Total ----
    y += 4;
    y = raya(c, dibuja, y, NEGRO, 1.5);
    y += 20;
    if (conPrecios) {
      escribir(c, dibuja, "TOTAL", letra(13, "700"), NEGRO, MARGEN, y);
      escribirDerecha(c, dibuja, dinero(datos.total), letra(20, "700"), NEGRO, y + 2);
      y += 10;
    } else {
      escribir(c, dibuja, "TOTAL", letra(13, "700"), NEGRO, MARGEN, y);
      escribirDerecha(c, dibuja, numero(totalUnidades(datos.lineas)) + " u.",
                      letra(17, "700"), NEGRO, y + 1);
      y += 8;
    }
    y = raya(c, dibuja, y, NEGRO, 1.5);

    // ---- Observaciones ----
    if (datos.obs) {
      y = escribir(c, dibuja, "OBSERVACIONES", letra(9, "700"), GRIS, MARGEN, y + 16);
      partir(c, datos.obs, UTIL, letra(11)).forEach((parte) => {
        y = escribir(c, dibuja, parte, letra(11), NEGRO, MARGEN, y + 14);
      });
    }

    // ---- Pie ----
    y = escribirCentrado(c, dibuja, "cocinavivacomarca@gmail.com", letra(9), GRIS, y + 26);

    // El aire de abajo importa de verdad: estas impresoras cortan pegado al
    // último punto y sin margen el texto queda contra el borde del papel.
    return y + 26;
  }

  // ---------- Ayudas de dibujo ----------
  //
  // Todas devuelven la y donde quedaron, así el cuerpo del remito se lee como
  // una sucesión de renglones y no como una cuenta de píxeles.

  function escribir(c, dibuja, texto, fuente, color, x, y) {
    if (dibuja) {
      c.fillStyle = color;
      c.font = fuente;
      c.textAlign = "left";
      poner(c, texto, x, y);
    }
    return y;
  }

  function escribirCentrado(c, dibuja, texto, fuente, color, y) {
    if (dibuja) {
      c.fillStyle = color;
      c.font = fuente;
      c.textAlign = "center";
      poner(c, texto, ANCHO / 2, y);
      c.textAlign = "left";
    }
    return y;
  }

  function escribirDerecha(c, dibuja, texto, fuente, color, y) {
    if (dibuja) {
      c.fillStyle = color;
      c.font = fuente;
      c.textAlign = "right";
      poner(c, texto, ANCHO - MARGEN, y);
      c.textAlign = "left";
    }
    return y;
  }

  function raya(c, dibuja, y, color, grosor) {
    if (dibuja) {
      c.strokeStyle = color;
      c.lineWidth = grosor || 1;
      c.beginPath();
      c.moveTo(MARGEN, y + 0.5);
      c.lineTo(ANCHO - MARGEN, y + 0.5);
      c.stroke();
    }
    return y + (grosor || 1);
  }

  const totalUnidades = (lineas) =>
    (lineas || []).reduce((n, l) => n + (Number(l.cantidad) || 0), 0);

  // Parte un texto en los renglones que entren en el ancho dado.
  function partir(c, texto, ancho, fuente) {
    c.font = fuente;
    const palabras = String(texto || "").split(" ");
    const salida = [];
    let renglon = "";
    palabras.forEach((p) => {
      // Una palabra sola más ancha que el papel no se puede acomodar moviendo
      // espacios: hay que cortarla por letra. Pasa con una dirección web pegada
      // o con un nombre escrito todo junto sin querer, y si no se corta se sale
      // del ticket y la térmica se la come.
      while (c.measureText(p).width > ancho) {
        let corte = 1;
        while (corte < p.length && c.measureText(p.slice(0, corte + 1)).width <= ancho) corte++;
        if (renglon) { salida.push(renglon); renglon = ""; }
        salida.push(p.slice(0, corte));
        p = p.slice(corte);
      }
      const prueba = renglon ? renglon + " " + p : p;
      if (c.measureText(prueba).width > ancho && renglon) { salida.push(renglon); renglon = p; }
      else renglon = prueba;
    });
    if (renglon) salida.push(renglon);
    return salida.length ? salida : [""];
  }

  // ---------- Entrega ----------

  const aBlob = (lienzo) => new Promise((r) => lienzo.toBlob(r, "image/jpeg", 0.92));

  function nombreArchivo(datos) {
    const limpio = String(datos.cliente || "cliente").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return "remito-" + limpio + "-" + String(datos.fecha).replace(/-/g, "") + ".jpg";
  }

  // Compartir es también el camino a la impresora: las térmicas portátiles no
  // se manejan desde el navegador, se manejan desde su propia app, y esa app
  // aparece en el menú de compartir como una más. Se elige WhatsApp o se elige
  // la impresora; para la app es lo mismo.
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
        // Cancelar el menú no es un error: es que cambiaron de idea. No hay que
        // avisar nada ni disparar una descarga que nadie pidió.
        if (err && err.name === "AbortError") return { como: "cancelado" };
      }
    }

    descargar(blob, nombre);
    return { como: "descargado", nombre: nombre };
  }

  // Guardar sin pasar por el menún de compartir. Hasta ahora, para tener el
  // archivo había que mandárselo a alguien por WhatsApp y bajarlo de ahí.
  async function guardar(datos) {
    const lienzo = await dibujar(datos);
    const blob = await aBlob(lienzo);
    const nombre = nombreArchivo(datos);
    descargar(blob, nombre);
    return nombre;
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

  // ---------- Imprimir ----------
  //
  // Manda el remito al diálogo de impresión del sistema, a 58 mm de ancho. Sirve
  // para cualquier impresora que el teléfono o la computadora ya vean. Para la
  // térmica portátil, mientras no tenga complemento de impresión de Android, el
  // camino sigue siendo compartir a su app: por eso están los dos botones.
  async function imprimir(datos) {
    const lienzo = await dibujar(datos);
    const url = lienzo.toDataURL("image/png");   // sin pérdida: el texto chico se lee mejor

    const caja = document.createElement("div");
    caja.className = "remito-a-imprimir";
    caja.innerHTML = '<img alt="Remito">';
    caja.querySelector("img").src = url;
    document.body.appendChild(caja);
    document.body.classList.add("imprimiendo-remito");

    const limpiar = () => {
      document.body.classList.remove("imprimiendo-remito");
      caja.remove();
      window.removeEventListener("afterprint", limpiar);
    };
    window.addEventListener("afterprint", limpiar);

    // Que la imagen esté cargada antes de abrir el diálogo: si no, algunos
    // navegadores imprimen la hoja en blanco.
    await new Promise((listo) => {
      const img = caja.querySelector("img");
      if (img.complete) { listo(); return; }
      img.onload = listo;
      img.onerror = listo;
    });

    window.print();
    // Safari en iOS no dispara afterprint. La red de seguridad evita que el
    // remito quede pegado en la página para siempre.
    setTimeout(limpiar, 60000);
  }

  // ---------- La térmica, directo ----------

  async function aLaTermica(datos, avisar) {
    const lienzo = await dibujar(datos, 1);      // 384 puntos clavados
    return window.Impresora.imprimir(lienzo, avisar);
  }

  // Para mostrarlo en pantalla antes de mandarlo.
  async function vistaPrevia(datos) {
    const lienzo = await dibujar(datos);
    const blob = await aBlob(lienzo);
    return URL.createObjectURL(blob);
  }

  /* ----------------------------------------------------------------------
     LOS BOTONES

     Los tres lugares que sacan papel —la venta, la entrega en consignación y
     el recibo de honorarios— tenían cada uno su copia de estos botones. Eran
     iguales salvo por el nombre de los ids, y ya pasó que una mejora entrara
     en una sola de las tres. Ahora los arma este archivo, una vez.
     ---------------------------------------------------------------------- */

  const opciones = (lista, elegida) => lista.map((v) =>
    '<option value="' + v + '"' + (v === elegida ? " selected" : "") + ">" + v + "</option>"
  ).join("");

  async function mostrar(caja, datos, alt) {
    const conBluetooth = window.Impresora && window.Impresora.hay();
    const url = await vistaPrevia(datos);

    caja.innerHTML = `
      <figure class="remito"><img src="${esc(url)}" alt="${esc(alt || "Remito")}"></figure>
      <div class="acciones">
        <button class="boton" id="rm-imprimir">Imprimir</button>
        <button class="boton boton--secundario" id="rm-compartir">Compartir</button>
        <button class="boton boton--secundario" id="rm-guardar">Guardar</button>
      </div>
      <p class="nota" id="rm-estado">${conBluetooth
        ? "<strong>Imprimir</strong> lo manda a la impresora térmica por Bluetooth. "
          + "La primera vez hay que elegirla de la lista y prenderla antes."
        : "<strong>Imprimir</strong> abre el diálogo del sistema. Este navegador no "
          + "maneja Bluetooth —en iPhone no se puede—, así que para la térmica hay que "
          + "<strong>Guardar</strong> y abrir el archivo desde la app de la impresora."}</p>
      <div class="remito__ajustes">
        <label for="rm-tamano">Tamaño</label>
        <select id="rm-tamano">${opciones(Object.keys(ESPACIOS), tamano())}</select>
        ${conBluetooth
          ? '<label for="rm-tinta">Tinta</label><select id="rm-tinta">'
            + opciones(["claro", "medio", "oscuro"], window.Impresora.tinta()) + "</select>"
          : ""}
      </div>
      ${conBluetooth
        ? '<button class="boton boton--secundario boton--chico remito__otra" id="rm-otra">Otra impresora</button>'
          + '<button class="boton boton--secundario boton--chico remito__otra" id="rm-probar" hidden>'
          + '¿No salió? Probar la impresora</button>'
          + '<pre class="remito__informe" id="rm-informe" hidden></pre>'
        : ""}`;

    const estado = caja.querySelector("#rm-estado");
    const decir = (t) => { estado.textContent = t; };
    const probar = caja.querySelector("#rm-probar");
    const informe = caja.querySelector("#rm-informe");

    const deSistema = () => imprimir(datos);

    caja.querySelector("#rm-imprimir").onclick = conBluetooth
      ? async (ev) => {
          const boton = ev.currentTarget;
          boton.disabled = true;
          try {
            const quien = await aLaTermica(datos, decir);
            decir("Listo, salió por " + quien + ".");
          } catch (err) {
            // Que cancelen la lista de aparatos no es un error, es que se
            // arrepintieron. Lo demás sí hay que contarlo, y completo: sin el
            // detalle no hay forma de saber si fue el Bluetooth apagado, la
            // impresora dormida o el papel.
            const m = String((err && err.message) || err);
            decir(/cancel|User cancelled|chooser/i.test(m)
              ? "No se eligió ninguna impresora."
              : "No se pudo imprimir: " + m);
          } finally {
            boton.disabled = false;
            // Recién después de intentarlo tiene sentido ofrecer la prueba, y
            // es justo el momento en que hace falta.
            if (probar) probar.hidden = false;
          }
        }
      : deSistema;

    /* --------------------------------------------------------------------
       Cuando la impresora conecta, dice que sí a todo y no sale un papel, no
       hay por dónde agarrarla: el Bluetooth no avisa si la máquina entendió o
       tiró los bytes a la basura. Esto le pregunta lo que se puede preguntar
       y le manda una raya negra. Si la raya sale, el problema está en el
       dibujo; si no sale nada, no le está llegando.
       -------------------------------------------------------------------- */
    if (probar) {
      probar.onclick = async (ev) => {
        const boton = ev.currentTarget;
        boton.disabled = true;
        informe.hidden = false;
        informe.textContent = "Probando…";
        try {
          informe.textContent = await window.Impresora.diagnostico(decir);
        } catch (err) {
          informe.textContent = "La prueba se cortó: " + String((err && err.message) || err);
        } finally {
          boton.disabled = false;
        }
      };
    }

    caja.querySelector("#rm-compartir").onclick = async () => {
      const r = await compartir(datos);
      if (r.como === "descargado") window.Util.brindis("Descargado: " + r.nombre);
      if (r.como === "compartido") window.Util.brindis("Enviado.");
    };

    caja.querySelector("#rm-guardar").onclick = async () => {
      window.Util.brindis("Guardado: " + (await guardar(datos)));
    };

    const otra = caja.querySelector("#rm-otra");
    if (otra) otra.onclick = deSistema;

    // Cuánto quemar el papel. Es lo mismo que ofrece la app de fábrica, y hace
    // falta poder tocarlo: depende del rollo, y un rollo viejo necesita más.
    const tinta = caja.querySelector("#rm-tinta");
    if (tinta) {
      tinta.onchange = () => {
        window.Impresora.ponerTinta(tinta.value);
        decir("Tinta en " + tinta.value + ". Probá de imprimir.");
      };
    }

    // El tamaño sí cambia el dibujo, así que hay que rehacerlo para que se vea
    // en el momento lo que va a salir en el papel.
    const cuerpo = caja.querySelector("#rm-tamano");
    if (cuerpo) {
      cuerpo.onchange = () => {
        ponerTamano(cuerpo.value);
        mostrar(caja, datos, alt);
      };
    }
  }

  return { dibujar, compartir, guardar, imprimir, aLaTermica, vistaPrevia, mostrar,
           tamano, ponerTamano, ESPACIOS };
})();
