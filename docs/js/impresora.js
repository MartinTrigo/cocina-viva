// ==========================================================================
// La impresora térmica, directo desde la app
//
// Estas "mini printer" de gatito se venden con veinte nombres distintos y por
// dentro no son una máquina sino DOS, con protocolos que no se parecen:
//
//   · las clásicas —GB01, GB02, GT01, MX05, MX06, YT01…— empiezan cada orden
//     con 51 78, reciben la imagen renglón por renglón por el canal 0xAE01 y
//     no avisan cuando terminan.
//
//   · la MXW01, que es la nuestra, empieza con 22 21, PIDE PERMISO antes de
//     imprimir diciendo cuántos renglones vienen, recibe la imagen por otro
//     canal (0xAE03) y avisa cuando terminó.
//
// El primer intento hablaba solo el clásico. La MXW01 conectaba, escuchaba
// 51 78, no entendía una palabra, no contestaba nada y no movía el papel. Eso
// fue lo que pasó: no estaba rota ni mal configurada, le hablábamos en otro
// idioma.
//
// Ahora se le pregunta en el idioma nuevo al conectar. Si contesta, es una
// MXW01; si no contesta, es una clásica. Los dos protocolos ignoran de plano
// el encabezado del otro, así que preguntar no molesta a ninguna.
//
// LO QUE COMPARTEN: servicio 0xAE30, el crc8 común (polinomio 0x07, arranca en
// cero), 384 puntos de ancho = 48 bytes por renglón, un bit por punto y el
// punto de la izquierda en el bit de menor peso.
//
// LO QUE NO SE PUEDE: Bluetooth desde el navegador existe en Chrome (Android y
// computadora) pero NO en iPhone, porque Safari no lo implementa y en iPhone
// todos los navegadores son Safari por dentro. Ahí el botón no aparece y queda
// el camino de guardar el archivo.
// ==========================================================================

window.Impresora = (function () {
  const SERVICIO = 0xae30;      // por acá se imprime, en las dos familias
  const ANUNCIO = 0xaf30;       // el que anuncian al aparecer
  const C_ORDENES = 0xae01;     // se le manda
  const C_AVISOS = 0xae02;      // ella contesta
  const C_DATOS = 0xae03;       // la imagen, solo en la MXW01

  const ANCHO = 384;            // puntos de una térmica de 58 mm
  const BYTES_POR_RENGLON = ANCHO / 8;

  // A partir de qué gris se quema el punto. El papel térmico no tiene medios
  // tonos: cada punto sale negro o no sale. Con el corte en la mitad (128) los
  // bordes suavizados de las letras —que son grises— no se imprimen y los
  // palos quedan finitos y despintados. Subiéndolo, esos bordes entran, el
  // trazo engorda medio punto de cada lado y la letra chica se lee.
  const UMBRAL = 170;
  const MINIMO_DE_DATOS = 90 * BYTES_POR_RENGLON;   // la MXW01 no acepta menos
  const COLA = 80;              // renglones en blanco al final, para cortar

  // Cuánto calienta el cabezal. Más es más negro y más lento; pasarse quema el
  // papel. Cada familia lo mide con su propia escala.
  const CALOR_CLASICO = 24000;
  const CALOR_MXW01 = 100;      // el máximo que acepta: más arriba lo recorta ella
  const VELOCIDAD = 32;         // solo la clásica; al revés de lo que suena:
                                // más alto, más lento

  const MODELOS = ["MXW", "GB01", "GB02", "GB03", "GT01", "YT01", "MX05",
                   "MX06", "MX08", "MX09", "MX10", "MX11", "PD01", "SC03",
                   "MXTP", "BQ05", "JK01", "AB18", "MiniPrint", "Cat"];

  const LATTICE_ABRE = [0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c];
  const LATTICE_CIERRA = [0xaa, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17];

  let aparato = null;
  let ordenes = null, avisos = null, datos = null;
  let escribirOrden = null, escribirDatos = null;
  let familia = null;           // "mxw01" o "clasico"
  let enPausa = false;          // solo la clásica
  const esperando = new Map();  // orden → a quién avisarle cuando contesten
  let loQueDijo = [];           // para el diagnóstico

  const hay = () => !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  const conectada = () => !!(ordenes && aparato && aparato.gatt && aparato.gatt.connected);
  const comoSeLlama = () => (aparato && aparato.name) || "la impresora";

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const hex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join(" ");

  // ---------- lo que comparten ----------

  function crc8(bytes) {
    let crc = 0;
    for (const b of bytes) {
      crc ^= b;
      for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
    return crc;
  }

  // El encabezado es lo único que cambia entre las dos familias.
  function armar(uno, dos, cual, carga) {
    const c = Uint8Array.from(carga);
    const p = new Uint8Array(c.length + 8);
    p.set([uno, dos, cual, 0x00, c.length & 0xff, (c.length >> 8) & 0xff], 0);
    p.set(c, 6);
    p[6 + c.length] = crc8(c);
    p[7 + c.length] = 0xff;
    return p;
  }

  const clasico = (cual, carga) => armar(0x51, 0x78, cual, carga);
  const moderno = (cual, carga) => armar(0x22, 0x21, cual, carga);
  const dosBytes = (n) => [n & 0xff, (n >> 8) & 0xff];

  // Los bits de cada byte van al revés de como uno los arma. En vez de dar
  // vuelta el byte después, se escribe el punto de la izquierda en el bit de
  // menor peso y ya sale como lo quieren las dos.
  function renglonAbytes(pixeles, y) {
    const salida = new Uint8Array(BYTES_POR_RENGLON);
    for (let x = 0; x < ANCHO; x++) {
      const p = (y * ANCHO + x) * 4;
      // Un punto se quema si es oscuro. El alfa cuenta: lo transparente es papel.
      const luz = (pixeles[p] * 299 + pixeles[p + 1] * 587 + pixeles[p + 2] * 114) / 1000;
      if (pixeles[p + 3] > 128 && luz < UMBRAL) salida[x >> 3] |= 1 << (x & 7);
    }
    return salida;
  }

  // ---------- lo que contesta ----------

  function alRecibir(ev) {
    const b = new Uint8Array(ev.target.value.buffer);
    loQueDijo.push(hex(b));
    if (loQueDijo.length > 12) loQueDijo.shift();

    if (b[0] === 0x22 && b[1] === 0x21) {
      familia = "mxw01";                        // solo ella habla así
      const largo = b[4] | (b[5] << 8);
      avisar(b[2], b.slice(6, 6 + largo));
    } else if (b[0] === 0x51 && b[1] === 0x78) {
      // La orden 0xAE con un 0x10 adentro es "pará"; con 0x00, "seguí".
      if (b.length > 6 && b[2] === 0xae) enPausa = b[6] === 0x10;
      avisar(b[2], b.slice(6));
    }
  }

  function avisar(cual, carga) {
    const quien = esperando.get(cual);
    if (quien) { esperando.delete(cual); quien(carga); }
  }

  function esperarRespuesta(cual, cuanto) {
    return new Promise((listo, mal) => {
      const reloj = setTimeout(() => {
        esperando.delete(cual);
        mal(new Error("La impresora no contestó a la orden 0x" + cual.toString(16) + "."));
      }, cuanto);
      esperando.set(cual, (carga) => { clearTimeout(reloj); listo(carga); });
    });
  }

  // ---------- la conexión ----------

  async function conectar() {
    if (conectada()) return comoSeLlama();
    if (!hay()) throw new Error("Este navegador no maneja Bluetooth. En iPhone no se puede.");

    if (!aparato) aparato = await elegir();
    if (!aparato) throw new Error("No se eligió ninguna impresora.");

    const servidor = await aparato.gatt.connect();
    const servicio = await servidor.getPrimaryService(SERVICIO);

    ordenes = await servicio.getCharacteristic(C_ORDENES);
    escribirOrden = aQuien(ordenes);

    // El canal de la imagen existe solo en la familia nueva.
    try {
      datos = await servicio.getCharacteristic(C_DATOS);
      escribirDatos = aQuien(datos);
    } catch (err) {
      datos = null; escribirDatos = null;
    }

    // Suscribirse no es para leerlo: varias de estas máquinas no hacen nada
    // hasta que alguien las escucha. Y la MXW01 avisa por acá que terminó.
    try {
      avisos = await servicio.getCharacteristic(C_AVISOS);
      avisos.addEventListener("characteristicvaluechanged", alRecibir);
      await avisos.startNotifications();
    } catch (err) {
      avisos = null;
    }

    aparato.addEventListener("gattserverdisconnected", () => {
      ordenes = null; avisos = null; datos = null;
      familia = null; enPausa = false; esperando.clear();
    });

    await averiguarFamilia();
    return comoSeLlama();
  }

  const aQuien = (c) => (c.properties && c.properties.writeWithoutResponse
    ? (b) => c.writeValueWithoutResponse(b)
    : (b) => c.writeValue(b));

  // Se le pregunta en el idioma nuevo. Si contesta, es una MXW01. Si no
  // contesta, es una clásica: ni se enteró de la pregunta, porque descarta
  // todo lo que no empiece con 51 78.
  async function averiguarFamilia() {
    if (familia) return familia;
    if (!avisos) { familia = "clasico"; return familia; }
    try {
      const espera = esperarRespuesta(0xa1, 1800);
      await escribirOrden(moderno(0xa1, [0x00]));
      await espera;
      familia = "mxw01";
    } catch (err) {
      familia = "clasico";
    }
    return familia;
  }

  // Si el teléfono ya se acuerda de la impresora, no hace falta volver a
  // elegirla de una lista cada vez que se imprime un remito.
  async function elegir() {
    if (navigator.bluetooth.getDevices) {
      try {
        const conocidas = await navigator.bluetooth.getDevices();
        const guardada = localStorage.getItem("cv-impresora");
        const hallada = conocidas.find((d) => d.id === guardada);
        if (hallada) return hallada;
      } catch (err) { /* sin permiso para la lista: se elige a mano */ }
    }

    const elegida = await navigator.bluetooth.requestDevice({
      filters: [{ services: [ANUNCIO] }, { services: [SERVICIO] }]
        .concat(MODELOS.map((n) => ({ namePrefix: n }))),
      optionalServices: [SERVICIO],
    });
    try { localStorage.setItem("cv-impresora", elegida.id); } catch (err) { /* da igual */ }
    return elegida;
  }

  function olvidar() {
    try { localStorage.removeItem("cv-impresora"); } catch (err) { /* da igual */ }
    if (aparato && aparato.gatt && aparato.gatt.connected) aparato.gatt.disconnect();
    aparato = null; ordenes = null; avisos = null; datos = null; familia = null;
    esperando.clear();
  }

  // ---------- la imagen ----------

  // Todos los renglones seguidos, más una cola en blanco para poder cortar.
  function aBytes(lienzo) {
    const pixeles = lienzo.getContext("2d").getImageData(0, 0, ANCHO, lienzo.height).data;
    const renglones = lienzo.height + COLA;
    const tira = new Uint8Array(Math.max(renglones * BYTES_POR_RENGLON, MINIMO_DE_DATOS));
    for (let y = 0; y < lienzo.height; y++) {
      tira.set(renglonAbytes(pixeles, y), y * BYTES_POR_RENGLON);
    }
    return { tira: tira, renglones: renglones };
  }

  // ---------- imprimir: la MXW01 ----------

  // Lo que la impresora cuenta de sí misma cuando se le pregunta. Sin esto, un
  // papel que no sale porque la tapa está floja parece un error del programa.
  function queLePasa(estado) {
    if (!estado || estado.length < 7) return "";
    const b = estado[6];
    if (b & 0x04) return "No hay papel.";
    if (b & 0x08) return "La tapa está abierta.";
    if (b & 0x02) return "El papel está atascado.";
    if (b & 0x20) return "Se recalentó. Esperá un minuto.";
    if (b & 0x10) return "La batería está muy baja.";
    return "";
  }

  async function imprimirMXW01(lienzo, decir) {
    if (!escribirDatos) {
      throw new Error("Esta impresora dice ser una MXW01 pero no tiene el canal "
                    + "de datos (0xAE03).");
    }
    const { tira, renglones } = aBytes(lienzo);

    decir("Preparando…");
    await escribirOrden(moderno(0xa2, [CALOR_MXW01]));      // cuánto calentar
    await esperar(60);

    const pregunta = esperarRespuesta(0xa1, 5000);
    await escribirOrden(moderno(0xa1, [0x00]));             // ¿cómo estás?
    const estado = await pregunta;
    const problema = queLePasa(estado);
    if (problema) throw new Error(problema);

    // La MXW01 pide permiso antes de imprimir: se le dice cuántos renglones
    // vienen y ella contesta si los acepta. Las clásicas no preguntan nada.
    const permiso = esperarRespuesta(0xa9, 5000);
    await escribirOrden(moderno(0xa9, [renglones & 0xff, (renglones >> 8) & 0xff, 0x30, 0x00]));
    const respuesta = await permiso;
    if (respuesta && respuesta.length && respuesta[0] !== 0) {
      throw new Error("La impresora no aceptó el trabajo (código " + respuesta[0] + ").");
    }

    decir("Mandando el remito…");
    const fin = esperarRespuesta(0xaa, 40000);              // avisará al terminar
    for (let i = 0; i < tira.length; i += BYTES_POR_RENGLON) {
      await escribirDatos(tira.slice(i, i + BYTES_POR_RENGLON));
      await esperar(15);
      if (((i / BYTES_POR_RENGLON) & 63) === 63) {
        decir("Imprimiendo… " + Math.round((i / tira.length) * 100) + "%");
      }
    }
    await escribirOrden(moderno(0xad, [0x00]));             // largá todo

    decir("Terminando…");
    await fin;
    return comoSeLlama();
  }

  // ---------- imprimir: las clásicas ----------
  //
  // Se junta todo en una tira y se escribe de a pedazos parejos: ellas leen un
  // chorro de bytes, no paquetes sueltos. Y hay que respetarles la pausa que
  // piden cuando se les llena la memoria.

  const PEDAZO = 200;
  let pendiente = [];
  const encolar = (bytes) => { for (const b of bytes) pendiente.push(b); };
  const mandar = (cual, carga) => encolar(clasico(cual, carga));

  async function soltar() {
    while (pendiente.length) {
      while (enPausa) await esperar(200);
      await escribirOrden(Uint8Array.from(pendiente.splice(0, PEDAZO)));
      await esperar(20);
    }
  }

  async function imprimirClasica(lienzo, decir) {
    const pixeles = lienzo.getContext("2d").getImageData(0, 0, ANCHO, lienzo.height).data;

    decir("Preparando…");
    pendiente = [];
    mandar(0xa3, [0x00]);                       // despertarla
    mandar(0xa3, [0x00]);                       // arrancar
    mandar(0xa4, [50]);                         // 200 puntos por pulgada
    mandar(0xbd, [VELOCIDAD]);
    mandar(0xaf, dosBytes(CALOR_CLASICO));
    mandar(0xbe, [0x01]);                       // aplicar el calor elegido
    mandar(0xa9, [0x00]);
    await soltar();
    mandar(0xa6, LATTICE_ABRE);                 // acá empieza el dibujo
    await soltar();

    for (let y = 0; y < lienzo.height; y++) {
      mandar(0xa2, renglonAbytes(pixeles, y));
      if ((y & 7) === 7) {
        await soltar();
        if ((y & 63) === 63) {
          decir("Imprimiendo… " + Math.round((y / lienzo.height) * 100) + "%");
        }
      }
    }
    await soltar();

    decir("Terminando…");
    mandar(0xa6, LATTICE_CIERRA);
    // Sacar papel con la orden 0xA1 no funciona en varios modelos: la aceptan
    // y no mueven nada. Renglones en blanco funcionan en todos.
    const blanco = new Uint8Array(BYTES_POR_RENGLON);
    for (let i = 0; i < COLA; i++) mandar(0xa2, blanco);
    mandar(0xa3, [0x00]);
    await soltar();
    await esperar(400);
    return comoSeLlama();
  }

  // ---------- la puerta ----------

  // El lienzo tiene que venir de 384 puntos de ancho, que es el papel entero.
  // Si viniera de otro tamaño se imprimiría cortado o corrido, así que se
  // rechaza en vez de sacar un papel mal.
  async function imprimir(lienzo, avisarle) {
    if (lienzo.width !== ANCHO) {
      throw new Error("El remito tiene " + lienzo.width + " puntos de ancho y "
                    + "la impresora usa " + ANCHO + ".");
    }
    const decir = avisarle || function () {};

    decir("Buscando la impresora…");
    await conectar();

    return familia === "mxw01"
      ? imprimirMXW01(lienzo, decir)
      : imprimirClasica(lienzo, decir);
  }

  /* ------------------------------------------------------------------------
     EL DIAGNÓSTICO

     Cuando la impresora conecta, dice que sí a todo y no sale un papel, no hay
     por dónde agarrarla: el Bluetooth no avisa si la máquina entendió o tiró
     los bytes a la basura. Esto pregunta lo que se puede preguntar y hace una
     prueba mínima. Fue lo que destapó que la MXW01 hablaba otro idioma.
     ------------------------------------------------------------------------ */

  async function diagnostico(avisarle) {
    const decir = avisarle || function () {};
    const dice = [];

    decir("Conectando…");
    loQueDijo = [];
    familia = null;
    await conectar();
    dice.push("impresora: " + (aparato.name || "(sin nombre)"));

    const servicio = await aparato.gatt.getPrimaryService(SERVICIO);
    const todas = await servicio.getCharacteristics();
    dice.push("servicio ae30, " + todas.length + " canales:");
    for (const c of todas) {
      const p = c.properties;
      const puede = [p.read && "leer", p.write && "escribir",
                     p.writeWithoutResponse && "escribir-sin-respuesta",
                     p.notify && "avisar", p.indicate && "indicar"]
        .filter(Boolean).join(", ");
      dice.push("  " + c.uuid.slice(4, 8) + " → " + (puede || "nada"));
    }
    dice.push("familia: " + (familia === "mxw01"
      ? "MXW01 (protocolo 22 21, imagen por ae03)"
      : "clásica (protocolo 51 78, imagen por ae01)"));
    dice.push(avisos ? "escuchando por ae02" : "ae02 NO se pudo escuchar");

    decir("Preguntándole cómo está…");
    loQueDijo = [];
    try {
      const espera = esperarRespuesta(0xa1, 4000);
      await escribirOrden(familia === "mxw01" ? moderno(0xa1, [0x00]) : clasico(0xa3, [0x00]));
      const estado = await espera;
      dice.push("contestó: " + hex(estado));
      dice.push("cómo está: " + (queLePasa(estado) || "sin problemas que sepa decir"));
    } catch (err) {
      dice.push("no contestó cómo está" + (familia === "clasico" ? " (las clásicas no suelen)" : ""));
    }

    decir("Probando a sacar una raya…");
    loQueDijo = [];
    // Una raya negra bien gorda. Si algo sale, sale esto.
    const prueba = document.createElement("canvas");
    prueba.width = ANCHO; prueba.height = 40;
    const c = prueba.getContext("2d");
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, ANCHO, 40);
    c.fillStyle = "#000000"; c.fillRect(20, 8, ANCHO - 40, 24);
    try {
      await (familia === "mxw01" ? imprimirMXW01(prueba, decir) : imprimirClasica(prueba, decir));
      dice.push("la orden de imprimir se completó sin error");
    } catch (err) {
      dice.push("al imprimir falló: " + String((err && err.message) || err));
    }
    dice.push(loQueDijo.length ? "dijo: " + loQueDijo.join(" | ") : "no dijo nada mientras imprimía");
    dice.push("");
    dice.push("¿SALIÓ UNA RAYA NEGRA? Eso es lo que hay que mirar.");

    decir("Listo.");
    return dice.join("\n");
  }

  return { hay, conectar, conectada, imprimir, olvidar, comoSeLlama, diagnostico,
           ANCHO, familia: () => familia };
})();
