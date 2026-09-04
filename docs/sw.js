// ==========================================================================
// Cocina Viva — service worker
//
// Guarda la app en el teléfono para que funcione en el mostrador de un local
// o en el depósito, sin señal y sin datos.
//
// Estrategia: RED PRIMERO CON PACIENCIA CORTA, caché de respaldo.
//
// En MonAgric aprendimos que "caché primero" deja a los teléfonos con la
// versión vieja para siempre, porque nunca vuelven a preguntar. Por eso acá se
// pide siempre a la red. Pero la señal en el valle muchas veces no es "hay o
// no hay": es una señal débil que tarda quince segundos, y eso es peor que
// nada porque la app queda colgada. Por eso se espera solo unos segundos: si
// el servidor no contestó, se usa lo guardado y listo.
//
// IMPORTANTE: al cambiar un archivo de la lista, subir el número de CACHE.
// ==========================================================================

const CACHE = "cocinaviva-v13";

// Cuánto se espera a la red antes de usar lo guardado en el teléfono.
const ESPERA_MS = 3000;

const ARCHIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/estilos.css",
  "js/util.js",
  "js/acceso.js",
  "js/db.js",
  "js/datos.js",
  "js/sincro.js",
  "js/remito.js",
  "js/productos.js",
  "js/ingresos.js",
  "js/clientes.js",
  "js/consignacion.js",
  "js/egresos.js",
  "js/resumen.js",
  "js/stock.js",
  "js/app.js",
  "img/icono-192.png",
  "img/icono-redondo.svg",
  "img/icono-redondo-192.png",
  "img/icono-redondo-512.png",
  "img/icono-512.png",
  "img/logotipo.svg",
  "img/logotipo-negro.svg",
  "img/marca.svg",
];

self.addEventListener("install", (evento) => {
  // El "cache: reload" obliga a bajar cada archivo del servidor en vez de
  // tomarlo del caché del navegador. Sin eso, al publicar una versión nueva el
  // teléfono puede guardar una mezcla de archivos viejos y nuevos, que es peor
  // que quedarse con la versión vieja entera: la app queda rota.
  const pedidos = ARCHIVOS.map((url) => new Request(url, { cache: "reload" }));

  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(pedidos))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

function conPaciencia(pedido) {
  return new Promise((resolver, rechazar) => {
    const reloj = setTimeout(() => rechazar(new Error("la red tardó demasiado")), ESPERA_MS);
    fetch(pedido).then(
      (respuesta) => { clearTimeout(reloj); resolver(respuesta); },
      (error) => { clearTimeout(reloj); rechazar(error); }
    );
  });
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;

  // Los pedidos al servicio de la planilla van siempre a la red, sin pasar por
  // acá: guardar respuestas de datos en el caché daría información vieja como
  // si fuera actual, que en una app de stock y plata es peor que no tener nada.
  if (new URL(pedido.url).origin !== self.location.origin) return;

  evento.respondWith(
    conPaciencia(pedido)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(pedido, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(pedido).then((guardada) => guardada || caches.match("index.html")))
  );
});
