# Banco de pruebas de la sincronización

Corre el **código de verdad de las dos puntas** —`apps-script/Code.gs` y
`docs/js/db.js` + `docs/js/sincro.js`— contra una planilla de Google de mentira
hecha en memoria (`planilla.js`). No toca internet ni la planilla real.

Existe por un bug concreto: **las bajas volvían solas**. Se borraba un cliente o
una venta de prueba y al rato reaparecían. Los casos de `casos.js` reproducen
eso y algunas cosas de la misma familia.

## Cómo se corre

Desde la raíz del repositorio:

```
python -m http.server 8137
```

y abrir <http://127.0.0.1:8137/pruebas/banco.html>. Tarda unos veinte segundos:
hay casos que esperan a propósito, porque el bug vivía justamente en el rato en
que un pedido está viajando.

Tiene que terminar diciendo **«✓ todo bien»**. Si dice cuántas fallaron, la
línea en rojo nombra qué se rompió.

Conviene correrlo un par de veces. Los bugs de sincronización dependen de en qué
estado quedó la vuelta anterior, y por eso aparecen a veces sí y a veces no.

## Qué mira cada caso

- Borrar un **cliente** que ya estaba en la planilla: se tiene que ir de los dos
  lados y no volver.
- Borrar un cliente y **volver a darlo de alta con el mismo nombre**: la lápida
  no puede dejar ese nombre inutilizable para siempre.
- Borrar una **venta mientras hay una sincronización en el aire**: es el caso
  que fallaba.
- **Cargar** una venta mientras hay una sincronización en el aire: peor todavía,
  la venta se perdía entera.
- Borrar un **producto** recién cargado.
- Que la baja hecha en **un teléfono** llegue al otro.

## `impresora.html` — los bytes que salen por Bluetooth

Corre `docs/js/impresora.js` sin impresora. Comprueba el CRC8 y el armado de
las órdenes contra **paquetes publicados** por quienes destriparon el protocolo
de estas térmicas —«empezar a imprimir» y «pausar el flujo»—, y comprueba que
el punto de más a la izquierda del papel caiga en el bit de menor peso, que es
lo único que no se puede deducir mirando.

Si esto se rompe, el papel sale en blanco o con manchas y no hay forma de
adivinar por qué. Abrirlo directo en el navegador, sin servidor.

## `pantallas.html` — la app entera, usándola

Los otros dos bancos miran de cerca: la sincronización y los bytes de la
impresora. Este mira de lejos. Levanta la app completa con un juego de datos
parecido al real —cinco productos, uno dado de baja; ventas cobradas y sin
cobrar; una corrección; stock en el depósito y en la calle— y hace dos cosas:

1. **Entra a las ocho pantallas** y comprueba que cada una se dibuje, devuelva
   su encabezado y no tire nada por consola.
2. **Las usa.** Carga una venta por el formulario —buscador de productos
   incluido—, la borra y mira que el stock vuelva; carga un egreso eligiendo
   rubro y detalle; corrige el stock por conteo; suma horas; entra a un local de
   consignación; y cuadra un mes.

Lo segundo es lo que vale. Un botón que no hace nada no se ve leyendo el código
ni mirando la pantalla: hay que tocarlo.

Se abre directo en el navegador. Usa IndexedDB de verdad y la borra al empezar.

## `llamadas.py` — llamadas a funciones que no existen

```
python pruebas/llamadas.py
```

Tiene que decir **`sospechosas: 0`**.

Se escribió por un bug de verdad: `egresos.js` llamaba a `leerDelFormulario()`,
que vive en `ingresos.js`. No se ve leyendo el archivo, el navegador no lo marca
al cargar, y no revienta hasta que alguien toca ese control. Estuvo suelto vaya
a saber cuánto.
