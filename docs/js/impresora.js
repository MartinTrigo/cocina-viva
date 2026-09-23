// ==========================================================================
// La impresora térmica, directo desde la app
//
// Estas "mini printer" de gatito son todas la misma máquina con distinta
// carcasa: GB01, GB02, GB03, GT01, YT01, MX05, MX06, WXW01… y hablan un
// protocolo propio por Bluetooth de bajo consumo que está documentado desde
// hace años. La app de ellas —Fun Print, que es Kitty Print— hace exactamente
// esto que hace este archivo.
//
// EL PROTOCOLO, en resumen:
//   · servicio 0xAE30; se le escribe a 0xAE01 y ella contesta por 0xAE02
//   · cada orden es  51 78 <orden> 00 <largo en 2 bytes> <datos> <crc8> FF
//   · el crc8 es el común, polinomio 0x07, arranca en cero
//   · la imagen va renglón por renglón, 384 puntos = 48 bytes, un bit por
//     punto y con los bits de cada byte al revés
//
// TRES COSAS QUE NO SON OPCIONALES, y que en el primer intento faltaban:
//
//   1. Hay que SUSCRIBIRSE a lo que contesta (0xAE02) antes de mandarle nada.
//      Varias de estas máquinas no arrancan hasta que alguien las escucha.
//   2. No se le manda una orden por escritura. Se junta todo en una tira de
//      bytes y se escribe de a pedazos parejos, con una pausa entre pedazo y
//      pedazo. Ella lo lee como un chorro, no como paquetes sueltos.
//   3. Ella misma pide PAUSA cuando se le llena la memoria, y avisa por
//      0xAE02. Si uno no escucha, se le sigue mandando encima y se pierde.
//
// LO QUE NO SE PUEDE: Bluetooth desde el navegador existe en Chrome (Android y
// computadora) pero NO en iPhone, porque Safari no lo implementa y en iPhone
// todos los navegadores son Safari por dentro. En un iPhone el botón no
// aparece y queda el camino de guardar el archivo.
// ==========================================================================

window.Impresora = (function () {
  const SERVICIO = 0xae30;      // por acá se imprime
  const ANUNCIO = 0xaf30;       // el que la impresora anuncia al aparecer
  const ESCRIBIR = 0xae01;
  const CONTESTA = 0xae02;

  const ANCHO = 384;            // puntos de una térmica de 58 mm
  const BYTES_POR_RENGLON = ANCHO / 8;

  // Cuánto calienta el cabezal. Más es más negro y más lento; pasarse quema el
  // papel y lo deja gris. Este valor sale de la app de fábrica.
  const CALOR = 24000;
  const VELOCIDAD = 32;         // al revés de lo que suena: más alto, más lento

  // De a cuántos bytes se le escribe y cuánto se espera entre tanda y tanda.
  // Los mismos números que usa la implementación de referencia.
  const PEDAZO = 200;
  const RESPIRO = 20;

  // Los nombres con que se presentan. Van como filtro para que en la lista del
  // teléfono aparezca la impresora y no los cincuenta aparatos del vecindario.
  const MODELOS = ["GB01", "GB02", "GB03", "GT01", "YT01", "MX05", "MX06",
                   "MX08", "MX09", "MX10", "MX11", "PD01", "SC03", "MXTP",
                   "WXW", "BQ05", "JK01", "AB18", "MiniPrint", "Cat"];

  const LATTICE_ABRE = [0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c];
  const LATTICE_CIERRA = [0xaa, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17];

  let aparato = null;
  let canal = null;             // 0xAE01, por donde se le escribe
  let oreja = null;             // 0xAE02, por donde contesta
  let escribirCrudo = null;
  let enPausa = false;
  let loQueDijo = [];           // lo último que contestó, para el diagnóstico

  const hay = () => !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  const conectada = () => !!(canal && aparato && aparato.gatt && aparato.gatt.connected);
  const comoSeLlama = () => (aparato && aparato.name) || "la impresora";

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const hex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join(" ");

  // ---------- el protocolo ----------

  function crc8(datos) {
    let crc = 0;
    for (const b of datos) {
      crc ^= b;
      for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
    return crc;
  }

  function orden(cual, datos) {
    const carga = Uint8Array.from(datos);
    const paquete = new Uint8Array(carga.length + 8);
    paquete.set([0x51, 0x78, cual, 0x00, carga.length & 0xff, carga.length >> 8], 0);
    paquete.set(carga, 6);
    paquete[6 + carga.length] = crc8(carga);
    paquete[7 + carga.length] = 0xff;
    return paquete;
  }

  const dosBytes = (n) => [n & 0xff, (n >> 8) & 0xff];

  // Los bits de cada byte van al revés de como uno los arma. En vez de dar
  // vuelta el byte después, se escribe el punto de la izquierda en el bit de
  // menor peso y ya sale como lo quiere la impresora.
  function renglonAbytes(pixeles, y) {
    const salida = new Uint8Array(BYTES_POR_RENGLON);
    for (let x = 0; x < ANCHO; x++) {
      const p = (y * ANCHO + x) * 4;
      // Un punto se quema si es oscuro. El alfa cuenta: lo transparente es papel.
      const luz = (pixeles[p] * 299 + pixeles[p + 1] * 587 + pixeles[p + 2] * 114) / 1000;
      const opaco = pixeles[p + 3] > 128;
      if (opaco && luz < 128) salida[x >> 3] |= 1 << (x & 7);
    }
    return salida;
  }

  // ---------- la tira de bytes ----------
  //
  // Todo lo que se le manda se junta acá y sale de a pedazos parejos. Mandarle
  // una escritura por orden parecía más prolijo y no funcionó: la impresora lee
  // un chorro de bytes, no paquetes.

  let pendiente = [];

  function encolar(bytes) {
    for (const b of bytes) pendiente.push(b);
  }

  async function soltar() {
    while (pendiente.length) {
      while (enPausa) await esperar(200);
      const pedazo = Uint8Array.from(pendiente.splice(0, PEDAZO));
      await escribirCrudo(pedazo);
      await esperar(RESPIRO);
    }
  }

  const mandar = (cual, datos) => encolar(orden(cual, datos));

  // ---------- la conexión ----------

  async function conectar() {
    if (conectada()) return comoSeLlama();
    if (!hay()) throw new Error("Este navegador no maneja Bluetooth. En iPhone no se puede.");

    if (!aparato) aparato = await elegir();
    if (!aparato) throw new Error("No se eligió ninguna impresora.");

    const servidor = await aparato.gatt.connect();
    const servicio = await servidor.getPrimaryService(SERVICIO);
    canal = await servicio.getCharacteristic(ESCRIBIR);

    // Casi todas piden que se les escriba "sin respuesta". Si alguna aceptara
    // la otra forma, mejor: es la que tiene control de flujo de verdad.
    const sinRespuesta = canal.properties && canal.properties.writeWithoutResponse;
    escribirCrudo = sinRespuesta
      ? (b) => canal.writeValueWithoutResponse(b)
      : (b) => canal.writeValue(b);

    await escuchar(servicio);

    aparato.addEventListener("gattserverdisconnected", () => {
      canal = null; oreja = null; enPausa = false; pendiente = [];
    });
    return comoSeLlama();
  }

  // Suscribirse a lo que contesta no es para leerlo: es que varias de estas
  // máquinas no hacen nada hasta que alguien las escucha. Y de paso avisan
  // cuando se les llena la memoria y hay que frenar.
  async function escuchar(servicio) {
    try {
      oreja = await servicio.getCharacteristic(CONTESTA);
      oreja.addEventListener("characteristicvaluechanged", (ev) => {
        const b = new Uint8Array(ev.target.value.buffer);
        loQueDijo.push(hex(b));
        if (loQueDijo.length > 12) loQueDijo.shift();
        // La orden 0xAE con un 0x10 adentro es "pará"; con 0x00, "seguí".
        if (b.length > 6 && b[2] === 0xae) enPausa = b[6] === 0x10;
      });
      await oreja.startNotifications();
    } catch (err) {
      oreja = null;              // se sigue igual: hay modelos que no contestan
    }
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
    aparato = null; canal = null; oreja = null; pendiente = [];
  }

  // ---------- imprimir ----------

  function preparar() {
    mandar(0xa3, [0x00]);                       // despertarla
    mandar(0xa3, [0x00]);                       // arrancar
    mandar(0xa4, [50]);                         // 200 puntos por pulgada
    mandar(0xbd, [VELOCIDAD]);
    mandar(0xaf, dosBytes(CALOR));
    mandar(0xbe, [0x01]);                       // aplicar el calor elegido
    mandar(0xa9, [0x00]);
  }

  // Sacar papel con la orden 0xa1 no funciona en varios modelos: la aceptan y
  // no mueven nada. Mandarles renglones en blanco funciona en todos, porque es
  // el mismo camino por el que sale la tinta.
  function sacarPapel(renglones) {
    const blanco = new Uint8Array(BYTES_POR_RENGLON);
    for (let i = 0; i < renglones; i++) mandar(0xa2, blanco);
  }

  // El lienzo tiene que venir de 384 puntos de ancho, que es el papel entero.
  // Si viniera de otro tamaño se imprimiría cortado o corrido, así que se
  // rechaza en vez de sacar un papel mal.
  async function imprimir(lienzo, avisar) {
    if (lienzo.width !== ANCHO) {
      throw new Error("El remito tiene " + lienzo.width + " puntos de ancho y "
                    + "la impresora usa " + ANCHO + ".");
    }
    const decir = avisar || function () {};

    decir("Buscando la impresora…");
    await conectar();

    const pixeles = lienzo.getContext("2d").getImageData(0, 0, ANCHO, lienzo.height).data;
    const renglones = lienzo.height;

    decir("Preparando…");
    pendiente = [];
    preparar();
    await soltar();
    mandar(0xa6, LATTICE_ABRE);                 // acá empieza el dibujo
    await soltar();

    for (let y = 0; y < renglones; y++) {
      mandar(0xa2, renglonAbytes(pixeles, y));
      if ((y & 7) === 7) {
        await soltar();
        if ((y & 63) === 63) decir("Imprimiendo… " + Math.round((y / renglones) * 100) + "%");
      }
    }
    await soltar();

    decir("Terminando…");
    mandar(0xa6, LATTICE_CIERRA);
    sacarPapel(80);                             // que sobre para cortar
    mandar(0xa3, [0x00]);
    await soltar();
    await esperar(400);
    return comoSeLlama();
  }

  /* ------------------------------------------------------------------------
     EL DIAGNÓSTICO

     Cuando la impresora conecta, dice que sí a todo y no sale un papel, no hay
     por dónde agarrarla: el Bluetooth no avisa si la máquina entendió o tiró
     los bytes a la basura. Esto pregunta lo que se puede preguntar y hace una
     prueba mínima, para saber si el problema es que no le llega nada o que no
     le gusta lo que le llega.
     ------------------------------------------------------------------------ */

  async function diagnostico(avisar) {
    const decir = avisar || function () {};
    const dice = [];

    decir("Conectando…");
    if (!aparato) aparato = await elegir();
    const servidor = await aparato.gatt.connect();
    dice.push("impresora: " + (aparato.name || "(sin nombre)"));

    const servicio = await servidor.getPrimaryService(SERVICIO);
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

    canal = await servicio.getCharacteristic(ESCRIBIR);
    const sinRespuesta = canal.properties && canal.properties.writeWithoutResponse;
    escribirCrudo = sinRespuesta
      ? (b) => canal.writeValueWithoutResponse(b)
      : (b) => canal.writeValue(b);
    dice.push("se le escribe " + (sinRespuesta ? "sin respuesta" : "con respuesta"));

    loQueDijo = [];
    await escuchar(servicio);
    dice.push(oreja ? "escuchando por ae02" : "ae02 NO se pudo escuchar");

    decir("Preguntándole cómo está…");
    pendiente = [];
    mandar(0xa3, [0x00]);
    mandar(0xa8, [0x00]);                       // quién sos
    await soltar();
    await esperar(1200);
    dice.push(loQueDijo.length
      ? "contestó: " + loQueDijo.join(" | ")
      : "NO contestó nada");

    decir("Probando a sacar papel…");
    loQueDijo = [];
    preparar();
    mandar(0xa6, LATTICE_ABRE);
    // Una raya negra bien gorda: si algo sale, sale esto.
    const negro = new Uint8Array(BYTES_POR_RENGLON).fill(0xff);
    for (let i = 0; i < 24; i++) mandar(0xa2, negro);
    sacarPapel(60);
    mandar(0xa6, LATTICE_CIERRA);
    mandar(0xa3, [0x00]);
    await soltar();
    await esperar(1500);
    dice.push(loQueDijo.length
      ? "mientras imprimía dijo: " + loQueDijo.join(" | ")
      : "no dijo nada mientras imprimía");
    dice.push("");
    dice.push("¿SALIÓ UNA RAYA NEGRA? Eso es lo que hay que mirar.");

    decir("Listo.");
    return dice.join("\n");
  }

  return { hay, conectar, conectada, imprimir, olvidar, comoSeLlama, diagnostico, ANCHO };
})();
