# Cocina Viva — cómo está hecha, y qué le falta

Una lectura de la arquitectura hecha desde afuera, midiendo en vez de opinando.
No propone cambiar lo que hace la app: propone que lo mismo sea más fácil de
sostener dentro de dos años.

---

## 1. El mapa, en una página

Son tres piezas y ningún framework. **9.944 líneas**, todas de este proyecto, sin
una sola dependencia externa ni paso de compilación: lo que está escrito es
exactamente lo que corre.

```
  TELÉFONO (docs/)                        GOOGLE (apps-script/)
  ┌──────────────────────────┐            ┌─────────────────────────┐
  │  8 pantallas             │            │  doPost                 │
  │   ingresos, egresos,     │            │   ├─ permitido()        │
  │   consignación, stock,   │            │   ├─ asegurarEsquema()  │
  │   productos, clientes,   │  POST      │   └─ sincronizar()      │
  │   honorarios, resumen    │ ────────▶  │        ├─ leerFilas     │
  │           │              │            │        ├─ fusionar      │
  │           ▼              │ ◀────────  │        └─ escribirFilas │
  │  Datos  (caché + cálculo)│  estado    │            │            │
  │           │              │  completo  │            ▼            │
  │           ▼              │            │   LA PLANILLA           │
  │  CVDB   (IndexedDB)      │            │   9 hojas de datos      │
  └──────────────────────────┘            └─────────────────────────┘
```

**El teléfono manda lo que cambió; el servicio devuelve el estado completo.**
Esa es toda la sincronización. No hay API con verbos, no hay endpoints por
entidad: hay una sola operación, y es una fusión.

### El flujo de un dato, de punta a punta

Cargar una venta toca siete capas y conviene verlas en orden, porque casi todos
los problemas de estos meses vivieron en las costuras:

1. **`ingresos.js`** arma el borrador desde el formulario y lo valida.
2. **`CVDB.guardar()`** lo escribe en IndexedDB con `mod = Date.now()`. Desde
   acá el dato ya está a salvo aunque no haya señal: es el corazón del diseño.
3. **`Datos.cargar()`** relee todo a memoria y recalcula lo derivado.
4. **`Sincro.sincronizar()`** junta lo que tiene `mod` mayor a la última marca
   y lo manda.
5. **`sincronizar()`** en el servicio lee la hoja, fusiona por `id` quedándose
   con el `mod` más alto, y **reescribe la hoja entera**.
6. La respuesta trae **el estado completo**, no un acuse.
7. **`guardarEstado()`** reemplaza IndexedDB con eso, reaplicando lo que haya
   cambiado durante el viaje.

---

## 2. Las tres decisiones que sostienen todo

Antes de las críticas, lo que está bien, porque es lo que no hay que romper al
refactorizar.

**El stock nunca se guarda, se calcula.** No hay un campo «cantidad» en
productos: hay un libro mayor de movimientos con `desde` y `hacia`, y el stock
es una suma. Por eso se puede preguntar «¿cuánto había el 3 de agosto?» y por
eso borrar una venta devuelve la mercadería sin ninguna lógica especial. Es la
mejor decisión del proyecto.

**La planilla es la base de datos, y es legible.** No hay un backend que haya
que mantener: ellas abren la planilla y ven sus datos. El costo de esto es alto
—los tres incidentes de datos salieron de ahí— pero el beneficio también: el día
que la app no exista, los datos siguen estando.

**Las columnas se buscan por nombre, no por posición.** `letraDe()` y
`migrarHoja()` existen porque agregar una columna rompía fórmulas en silencio.
Agregar una columna hoy es seguro.

---

## 3. Zonas críticas, por riesgo

### 3.1 No hay una capa de validación en el borde — ★ crítico

Los tres incidentes de datos fueron **la misma columna**: `ingresos.fecha`.

La causa de fondo no es un error puntual: es que **no hay un lugar donde los
datos que entran se validen antes de tocar nada**. `leerFilas()` hace tres
trabajos a la vez —leer, normalizar y decidir qué descartar— y lo hace fila por
fila, sin ninguna noción del conjunto.

Eso significa que el sistema **no puede distinguir «no hay datos» de «no entendí
los datos»**, y ante la duda escribe. Si `fechaIso()` no reconoce un formato, la
fecha vuelve vacía y se escribe vacía: una fecha que nadie sabe leer se convierte
en una fecha que ya no existe.

Lo que falta es un chequeo de cordura sobre el conjunto, no sobre la fila:

```js
// En el servicio, antes de escribir nada:
function esCreible(nombre, filas, antes) {
  if (!antes.length) return true;
  // Que de golpe desaparezca la mitad de algo no es un dato, es un accidente.
  var perdidas = antes.filter(function (f) { return f.fecha; }).length
               - filas.filter(function (f) { return f.fecha; }).length;
  return perdidas < Math.max(5, antes.length * 0.1);
}
```

Con eso, el incidente de septiembre se habría detenido en la primera
sincronización en vez de propagarse a los teléfonos.

### 3.2 `Code.gs` mezcla el servicio con sus cicatrices — ★ crítico

**2.171 líneas, de las cuales ~460 (el 21%) son arreglos de una sola vez** que
ya corrieron, con sus tablas de datos de 2026 incrustadas:

| arreglo | líneas |
|---|---|
| `restaurarFechasDeIngresos` + su tabla | 116 |
| `EGRESOS_A_DEVOLVER` (cuatro egresos de agosto) | 84 |
| `renombrarCodigos` | 61 |
| `limpiarConsignacionDeBajas` | 42 |
| `refecharVentasViejas` | 41 |
| `restaurarEgresosBorrados` | 39 |
| `devolverStockAlConteo` | 35 |

Nadie que abra ese archivo puede distinguir qué es el servicio y qué es una
cicatriz de un lunes de septiembre. Y cada vez que hay que tocar el servicio hay
que copiar las 2.171 líneas a mano.

**Apps Script admite varios archivos en un proyecto, compartiendo el mismo
ámbito.** La separación es gratis:

```
apps-script/
  Code.gs        el servicio: esquema, doPost, sincronizar, formato   (~1.700)
  Arreglos.gs    los de una sola vez, con la fecha en que se corrieron  (~460)
```

Cambia cero comportamiento. Lo que cambia es que el archivo que uno lee para
entender el servicio pasa a ser el servicio.

### 3.3 El despliegue a mano es el mayor riesgo operativo — ★ crítico

La app se publica sola al hacer `git push`. **El servicio hay que pegarlo a mano
en un editor.** Ya pasó lo previsible: durante dos semanas el repositorio tenía
arreglos que la planilla no tenía, y no había forma de notarlo.

No es un problema de código, es de proceso, y tiene solución conocida:
[`clasp`](https://github.com/google/clasp), la herramienta oficial de Google.

```bash
npm i -g @google/clasp && clasp login
clasp clone <id-del-proyecto>
clasp push          # y listo
```

Mientras no esté, **al menos que la app avise**: la respuesta del servicio ya
trae `api`, y `sincro.js` ya lo mira. Alcanza con mostrarlo en el pie, al lado de
la versión de la app. Dos números que tienen que coincidir, igual que se hizo con
`VERSION` y `CACHE`.

### 3.4 El reloj del teléfono decide quién gana — ★ alto

`fusionar()` se queda con el `mod` más alto, y `mod` es `Date.now()` **del
teléfono**. Un teléfono con el reloj adelantado una hora gana todos los
conflictos durante una hora; uno atrasado pierde todos los suyos sin que nadie se
entere.

Hoy no se nota porque son tres personas que rara vez editan la misma fila. Con
más gente es un corruptor silencioso. La corrección estándar es que **el reloj
del servidor sea el árbitro**: `sincronizar()` le pone a cada fila entrante un
`recibido = Date.now()` del servicio y fusiona por ese, dejando `mod` como dato
informativo.

### 3.5 Todo se lee y se reescribe entero, en cada sincronización — ★ alto a futuro

| hoy | en tres años, al ritmo actual |
|---|---|
| 247 ingresos | ~3.000 |
| 299 movimientos | ~3.600 |
| ~0,2 s por sincronización | varios segundos |

`leerFilas()` trae la hoja completa a memoria y `escribirFilas()` la reescribe
completa, **en cada sincronización**, y hay unas 300 por semana. El costo crece
con el total histórico, no con lo que cambió.

Apps Script corta a los 6 minutos. No es urgente —faltan años— pero conviene
saber dónde está el techo y cuál es la salida: **escribir solo las filas que
cambiaron**, que es un cambio acotado a `escribirFilas()`, o **archivar por año**
moviendo lo cerrado a una hoja aparte.

El mismo problema del lado del teléfono: `guardarEstado()` vacía y reescribe
todos los almacenes de IndexedDB en cada vuelta.

### 3.6 El trío repetido 24 veces — ★ medio

Guardar algo son siempre tres pasos, en orden, en diez archivos distintos:

```js
await window.CVDB.guardar("egresos", fila);
await window.Datos.cargar();
window.Sincro.sincronizar(true);
```

Olvidar el segundo guarda el dato y no lo muestra. Olvidar el tercero lo muestra
y no lo sube. **Son 24 lugares donde hay que acordarse de las tres.** Debería ser
una sola puerta:

```js
// En datos.js
async function guardar(almacen, fila) {
  await window.CVDB.guardar(almacen, fila);
  await cargar();
  window.Sincro.sincronizar(true);
}
```

24 sitios que pasan de tres líneas a una, y un error menos que se puede cometer.

### 3.7 Cuatro pantallas con el mismo esqueleto y ningún molde — ★ medio

`resumen` (850), `honorarios` (829), `ingresos` (792) y `consignación` (737) son
**3.208 líneas** que repiten la misma estructura: un `render(contenedor, ruta,
navegar)`, un borrador en memoria, una función que pinta el formulario, otra que
engancha los eventos, validación a mano y una lista de lo último cargado.

No hace falta un framework. Alcanza con que lo común —el borrador, la validación,
el enganchado, el renglón de lista— viva en un solo lado. Es el refactor de mayor
superficie y el de menor urgencia: hacerlo mal cuesta más que no hacerlo.

### 3.8 Las pruebas no corren solas — ★ medio

Hay tres bancos buenos y un detector, pero **hay que abrir tres páginas a mano** y
nada impide publicar con todo roto. Con `node` instalado y un corredor sin
navegador, `git push` podría exigir que pasen.

### 3.9 Deuda menor, anotada

- **`SEMILLA_CLIENTES` y `SEMILLA_PRODUCTOS` están en un repositorio público**:
  46 clientes con sus localidades y la lista de precios. Sigue pendiente decidir
  qué hacer.
- **`id` como `man-<timestamp>-<n>`** para filas cargadas a mano: dos
  sincronizaciones en el mismo milisegundo pueden chocar.
- **Los rubros viven en la hoja `listas` y se escriben a mano**: hoy dice
  `Correción`, y la app escribe `Corrección`. Un error de tipeo rompe el calce.
- **`describirFila()` repite el formato del dinero** en vez de usar un ayudante.

---

## 4. Por dónde empezar

En orden de valor sobre esfuerzo. Los tres primeros son de bajo riesgo y se
pueden hacer sueltos.

| # | qué | por qué ahora | riesgo |
|---|---|---|---|
| 1 | Separar `Arreglos.gs` de `Code.gs` | el archivo que se lee pasa a ser el servicio | nulo |
| 2 | Mostrar la versión del servicio en el pie | hace visible el único desfase que no se nota | nulo |
| 3 | `Datos.guardar()`, el trío en una función | 24 sitios, un error menos | bajo |
| 4 | Chequeo de cordura antes de escribir | habría frenado los tres incidentes | bajo |
| 5 | `clasp` para publicar el servicio | saca el paso manual que ya falló | medio |
| 6 | El reloj del servicio como árbitro | corruptor silencioso al crecer | medio |
| 7 | Escribir solo lo que cambió | el techo de escalabilidad | medio |
| 8 | Molde común para las pantallas | 3.200 líneas que repiten estructura | alto |

**Lo que no hay que tocar:** el stock calculado, la planilla como base de datos,
la ausencia de dependencias y el local-first. Son las decisiones que hacen que
esto funcione sin señal en la Comarca y que sobreviva a quien lo escribió.
