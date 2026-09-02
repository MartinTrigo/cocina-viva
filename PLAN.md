# Plan de desarrollo

Se ejecuta fase por fase: cada una se prueba andando en el celular antes de
empezar la siguiente. Si el modelo de datos no cierra, conviene descubrirlo
cuando todavía es barato cambiarlo.

## Fase 0 — Cimientos · **hecha**

- [x] Separar las piezas del logo original (`Bacterias + Logotipo.svg`) en el
      logotipo blanco de la cabecera, la marca completa en bordó y el ícono de
      la app. Paleta armada sobre el bordó `#8c0730`.
- [x] Armazón de la PWA: CSP, manifiesto, service worker, IndexedDB, navegación
      por hash y las seis secciones anunciadas con la fase en la que llegan.
- [x] Control de acceso por código de invitación, del lado de la app.
- [x] `apps-script/Code.gs` completo: las nueve hojas del libro, el formato, los
      desplegables, la hoja `resumen` con fórmulas vivas, la sincronización en
      los dos sentidos y los productos, clientes y stock inicial de arranque.
- [x] Comprobado: la app levanta, calcula y navega. Los totales del depósito dan
      **263 unidades** y **$2.060.950**, que es exactamente lo que decía la
      planilla vieja al 21/8/2026.

- [x] Publicada en GitHub Pages: <https://martintrigo.github.io/cocina-viva/>
- [x] Comprobado ahí mismo: el service worker registra, deja los 14 archivos en
      caché y la consola no tira un solo error. (En el navegador embebido con el
      que se desarrolla el service worker falla, pero falla igual el de
      Semillas, que anda publicado: es del navegador, no del código.)

- [x] Libro «Cocina Viva · Gestión» creado en `CocinaViva_App` y armado con
      `prepararLibro()`: 19 productos, 46 clientes, el stock inicial y la hoja
      `resumen`, que calcula $2.060.950 de depósito con sus propias fórmulas.
- [x] Apps Script publicado (implementación v1, 1/9/2026) y conectado en
      `docs/js/sincro.js`.
- [x] **Prueba de punta a punta hecha.** Canje de un código, rechazo del mismo
      código en un segundo teléfono, bajada del estado completo, subida de un
      movimiento, aparición en la planilla, y borrado desde la app que también
      lo saca de la planilla. El depósito quedó de nuevo en $2.060.950.
      Es lo que en Semillas estuvo meses sin comprobarse.

- [x] Teléfono de prueba dado de baja y códigos repartidos.
- [x] **Luna tiene la app activada y andando en su celular** (1/9/2026).
- [ ] Falta activar el teléfono de Melí y el de Martín.

## Fase 1 — Productos y Stock · **hecha**

- [x] **Productos.** La lista con código, presentación y los dos precios; alta,
      lápiz de edición en cada uno, y edición en masa: porcentaje con vista
      previa y redondeo elegible, y bajas marcando varios.
- [x] **Stock.** Formulario con el texto vivo («Estás ingresando 25 kimchi
      340 g. Pasan a ser 54 en el depósito») y el depósito al día con cantidad,
      precio, subtotal y total.
- [x] Probado renglón por renglón: envasar 25, romper 4 y contar 40 dejan el
      kimchi en 40 y el depósito en 274 unidades; deshacer los tres lo devuelve
      a 263 y $2.060.950. El aumento del 12 % lleva el kale de $6.150 a $6.900
      (redondeado a los $50). Un código repetido se rechaza, uno con historia no
      se deja borrar, y un producto dado de baja con stock sigue contando.

### Lo que se decidió sobre la marcha

- El **código de un producto no se edita**. Lo guardan todos los movimientos y
  todas las ventas; cambiarlo dejaría la historia huérfana y el stock en cero
  sin que nada avise.
- **Dar de baja no es borrar.** Un producto con historia solo se da de baja.
  Uno sin ningún registro —recién cargado, y mal— sí se borra de verdad.
- **La pantalla de Stock también resta.** Además de envasar, hay «se rompió o
  venció» y «corrección por conteo». Una pantalla que solo suma miente apenas
  se rompe un frasco.
- La **corrección pide el total contado**, no la diferencia: nadie cuenta
  diferencias, se cuentan frascos.

## Fase 2 — Ingresos · **hecha**

- [x] Venta con varios productos: botón **+**, selector mayorista/minorista que
      decide el precio, subtotal por renglón y total automático.
- [x] Al guardar: una fila por producto en `ingresos`, todas con el mismo id de
      venta, y un movimiento de venta por producto que descuenta el depósito.
- [x] **Remito** en `.jpg`, dibujado en un `<canvas>`, con vista previa antes de
      mandarlo. Sin librerías y sin conexión.
- [x] Detalle de cada venta, con el remito a un toque y el borrado entero:
      se van las filas y vuelve el stock.
- [x] Avisa cuando el cliente elegido trabaja a consignación, y cuando la
      cantidad vendida deja el depósito en negativo. Ninguna de las dos cosas
      impide guardar.
- [x] Probado: 3 kimchi + 2 chucrut dan $40.800 a mayorista y $54.900 a
      minorista; guardar baja el depósito de 29 a 26 y de 9 a 7; borrar la venta
      lo devuelve exacto. El nombre del archivo sale sin acentos
      (`remito-lima-limon-20260901.jpg`).

**Sin probar todavía:** el botón nativo de compartir. El navegador con el que se
desarrolla no tiene `navigator.share`, así que acá siempre cae en la descarga.
En el celular de Luna tiene que abrir el menú de siempre y ofrecer WhatsApp.
Es lo primero que conviene mirar.

## Fase 3 — Consignación · **falta**

- [ ] Lista de locales con lo que tiene cada uno, y el total de plata en la calle.
- [ ] Ficha de cada local con los tres botones: **entregar**, **liquidar** y
      **devolver**. La liquidación es la que genera el ingreso cobrado.
- [ ] Remito de entrega, igual que en ingresos.

## Fase 4 — Egresos y Resumen · **falta**

- [ ] Egresos: fecha, rubro, detalle, cantidad, monto, medio de pago.
- [ ] Resumen: filtro por mes, balance, desglose por medio de pago y por rubro,
      gráficos en SVG dibujados a mano, descarga en CSV e impresión a PDF.

## Fase 5 — Puesta en marcha · **falta**

- [ ] Prueba de punta a punta con las dos, cargando cosas de verdad.
- [ ] Contar el stock real de cada local y cargarlo como conteo inicial.
- [ ] Traspaso del libro y del repositorio a la cuenta del emprendimiento.

---

# Cosas que no son de programación

Estas dependen de ellas, no de la app.

- [ ] **Contar lo que hay en cada local.** El stock del depósito salió de la
      planilla, pero lo que está en consignación no se puede deducir: las
      entregas están anotadas y los cobros no, así que no hay forma de saber
      cuánto queda sin ir a contarlo. Es el único dato que la app no puede
      arrancar sola.
- [ ] **Revisar las presentaciones del catálogo.** En la planilla vieja hay
      inconsistencias que se copiaron tal cual: `CRT340` dice 360, `PIK360` dice
      350, `CHDU350` dice 360. Pueden ser el frasco contra el contenido, pero
      hay que confirmarlo. Se corrige desde la pantalla de Productos.
- [ ] **Confirmar quién trabaja a consignación y quién compra.** La hoja
      `Clientes` y los movimientos de `INGRESOS` no coinciden: la hoja dice que
      lahuan compra, pero todas sus filas dicen «Consignación». Se cargó lo que
      muestran los movimientos.
- [ ] **Decidir qué pasa con «Labores»** (las horas de trabajo de cada una) y
      con «planificación» (los kilos de verdura por lote). Quedaron fuera de
      alcance; si las quieren en la app, son una fase más.
