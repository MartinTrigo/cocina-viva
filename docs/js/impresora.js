// ==========================================================================
// La impresora térmica, directo desde la app
//
// Estas "mini printer" de gatito son todas la misma máquina con distinta
// carcasa: GB01, GB02, GB03, GT01, YT01, MX05, MX06, MX08…, y hablan un
// protocolo propio por Bluetooth de bajo consumo que está documentado desde
// hace años. La app de ellas —Fun Print, que es Kitty Print— hace exactamente
// esto que hace este archivo.
//
// El camino de compartir no servía: Fun Print no se anota como destino de
// imágenes, así que había que guardar el remito, abrir la otra app y buscarlo.
// Tres pasos para un papelito. Ahora se toca "Imprimir" y sale.
//
// EL PROTOCOLO, en resumen:
//   · servicio 0xAE30, se le escribe a la característica 0xAE01
//   · cada orden es  51 78 <orden> 00 <largo en 2 bytes> <datos> <crc8> FF
//   · el crc8 es el común, polinomio 0x07, arranca en cero
//   · la imagen va renglón por renglón, 384 puntos = 48 bytes, un bit por
//     punto y con los bits de cada byte al revés
//
// LO QUE NO SE PUEDE: Bluetooth desde el navegador existe en Chrome (Android y
// computadora) pero NO en iPhone, porque Safari no lo implementa y en iPhone
// todos los navegadores son Safari por dentro. En un iPhone el botón no
// aparece y queda el camino de siempre, compartir o guardar.
// ==========================================================================

window.Impresora = (function () {
  const SERVICIO = 0xae30;      // por acá se imprime
  const ANUNCIO = 0xaf30;       // el que la impresora anuncia al aparecer
  const ESCRIBIR = 0xae01;

  const ANCHO = 384;            // puntos de una térmica de 58 mm
  const BYTES_POR_RENGLON = ANCHO / 8;

  // Cuánto calienta el cabezal. Más es más negro y más lento; pasarse quema el
  // papel y lo deja gris. Este valor sale de la app de fábrica.
  const CALOR = 24000;
  const VELOCIDAD = 32;         // al revés de lo que suena: más alto, más lento

  // Los nombres con que se presentan. Van como filtro para que en la lista del
  // teléfono aparezca la impresora y no los cincuenta aparatos del vecindario.
  const MODELOS = ["GB01", "GB02", "GB03", "GT01", "YT01", "MX05", "MX06",
                   "MX08", "MX09", "MX10", "MX11", "SC03H", "MXTP", "BQ05",
                   "JK01", "AB18", "PT-2", "MiniPrint", "Cat"];

  const LATTICE_ABRE = [0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c];
  const LATTICE_CIERRA = [0xaa, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17];

  let aparato = null;
  let canal = null;

  const hay = () => !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  const conectada = () => !!(canal && aparato && aparato.gatt && aparato.gatt.connected);
  const comoSeLlama = () => (aparato && aparato.name) || "la impresora";

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // ---------- la conexión ----------

  let escribirCrudo = null;

  async function conectar() {
    if (conectada()) return comoSeLlama();
    if (!hay()) throw new Error("Este navegador no maneja Bluetooth. En iPhone no se puede.");

    if (!aparato) aparato = await elegir();
    if (!aparato) throw new Error("No se eligió ninguna impresora.");

    const servidor = await aparato.gatt.connect();
    const servicio = await servidor.getPrimaryService(SERVICIO);
    canal = await servicio.getCharacteristic(ESCRIBIR);

    // Casi todas piden que se les escriba "sin respuesta". Si alguna aceptara
    // la otra forma, mejor: es la que tiene control de flujo.
    const sinRespuesta = canal.properties && canal.properties.writeWithoutResponse;
    escribirCrudo = sinRespuesta
      ? (b) => canal.writeValueWithoutResponse(b)
      : (b) => canal.writeValue(b);

    aparato.addEventListener("gattserverdisconnected", () => { canal = null; });
    return comoSeLlama();
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
    aparato = null;
    canal = null;
  }

  // ---------- imprimir ----------

  const mandar = (cual, datos) => escribirCrudo(orden(cual, datos));

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
    await mandar(0xa3, [0x00]);                 // despertarla
    await mandar(0xa3, [0x00]);                 // arrancar
    await mandar(0xa4, [50]);                   // 200 puntos por pulgada
    await mandar(0xbd, [VELOCIDAD]);
    await mandar(0xaf, dosBytes(CALOR));
    await mandar(0xbe, [0x01]);                 // aplicar el calor elegido
    await mandar(0xa9, [0x00]);
    await mandar(0xa6, LATTICE_ABRE);           // acá empieza el dibujo

    for (let y = 0; y < renglones; y++) {
      await mandar(0xa2, renglonAbytes(pixeles, y));
      // Escribir "sin respuesta" no espera a que la impresora termine: si se
      // le manda todo de una, se le llena la memoria y salen renglones
      // repetidos o borrosos. Cada tanto hay que dejarla respirar.
      if ((y & 7) === 7) {
        await esperar(18);
        if ((y & 63) === 63) decir("Imprimiendo… " + Math.round((y / renglones) * 100) + "%");
      }
    }

    decir("Terminando…");
    await mandar(0xa6, LATTICE_CIERRA);
    await mandar(0xbd, [8]);                    // rápido para sacar el papel
    await mandar(0xa1, dosBytes(96));           // que sobre para cortar
    await mandar(0xa3, [0x00]);
    await esperar(400);
    return comoSeLlama();
  }

  return { hay, conectar, conectada, imprimir, olvidar, comoSeLlama, ANCHO };
})();
