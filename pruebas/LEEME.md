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
