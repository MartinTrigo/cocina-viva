# Cocina Viva · Gestión

App para manejar las ventas, los gastos, las consignaciones y el stock de
**Cocina Viva**, un emprendimiento de fermentos y conservas de la Comarca
Andina del Paralelo 42: chucrut, kimchi, pickles, vinagres, chutneys, untables
y algunas conservas más.

Reemplaza la planilla `2026 ventas gastos stock`, que hacía todo eso mezclado.

**La app:** <https://martintrigo.github.io/cocina-viva/>

---

## Qué hace

| Pantalla | Para qué |
|---|---|
| **Ingresos** | Cargar una venta con todos sus productos, en una sola pantalla. Los precios salen del catálogo. Genera el remito para mandar por WhatsApp. |
| **Egresos** | Insumos, gastos fijos, honorarios, otros gastos e inversión. |
| **Consignación** | Qué tiene hoy cada local, cuánta plata hay en la calle, y los tres movimientos: entregar, liquidar y devolver. |
| **Stock** | Cargar lo que envasaron y ver el depósito al día, producto por producto. |
| **Productos** | El catálogo completo, con alta, edición y actualización de precios en masa. |
| **Resumen** | Balance por mes, por medio de pago y por rubro, con gráficos y descarga. |

Todo se guarda también en un libro de Google, así que se puede abrir, filtrar,
graficar y descargar desde la planilla como siempre.

## Lo que la app separa y la planilla mezclaba

En la planilla, dejar mercadería en consignación se anotaba como un ingreso con
medio de pago «Consignación»: descontaba el stock **y al mismo tiempo**
registraba como cobrada plata que todavía no estaba. Por eso el resumen mensual
tenía una línea aparte para consignación que no se sumaba a las ventas.

Acá son tres momentos distintos:

| Momento | Mercadería | Plata |
|---|---|---|
| **Entrega** a un local | del depósito al local | nada |
| **Liquidación** (el local paga lo vendido) | sale del local | entra |
| **Devolución** | del local al depósito | nada |

## Cómo está hecha

Igual que las otras apps del conjunto: **sin frameworks, sin dependencias y sin
paso de compilación**. Se edita un archivo, se guarda y se recarga el navegador.

- **PWA** en `docs/`, publicada por GitHub Pages. HTML, CSS y JavaScript a mano.
- **CSP estricta** en el `<meta>` del index: lo único externo permitido es
  `script.google.com`.
- **IndexedDB** para funcionar sin señal. Todo se carga primero en el teléfono.
- **Service worker** «red primero con paciencia corta» (3 s) y caché de respaldo.
- **Apps Script** (`apps-script/Code.gs`) vinculado al libro de Google. Sin
  servidor propio: es criterio explícito.
- **Control de acceso** desde el primer día: código de invitación de un solo
  uso → credencial; la planilla guarda solo la huella SHA-256.

### El stock no se guarda: se calcula

La hoja `movimientos` es la única verdad sobre la mercadería. Cada fila dice una
cantidad, de dónde salió y a dónde fue. El stock del depósito y el de cada local
son sumas de esas filas. Por eso nunca puede haber un número guardado que no
coincida con los movimientos, y siempre se puede reconstruir de dónde salió cada
unidad.

## Archivos

```
docs/                     la app (esto es lo que publica GitHub Pages)
  index.html              estructura, CSP y orden de carga
  css/estilos.css         paleta y componentes
  js/util.js              formato de números, fechas y plata a la argentina
  js/acceso.js            credencial de este teléfono
  js/db.js                IndexedDB y qué falta subir
  js/datos.js             el modelo: catálogo y cálculo del stock
  js/sincro.js            canje del código y sincronización
  js/app.js               armazón, navegación e inicio
  sw.js                   funcionamiento sin señal
apps-script/Code.gs       el servicio y la estructura del libro de Google
```

## Probarla en la PC

```bash
cd "C:/MARTO/INFORMATICA/Cocina Viva/docs" && python -m http.server 8611
```

y abrir <http://127.0.0.1:8611>.

## Instalarla de cero

Está paso a paso en [INSTALACION.md](INSTALACION.md). El modelo de acceso y cómo
dar de baja un teléfono, en [SEGURIDAD.md](SEGURIDAD.md). Por qué está hecha así
y no de otra manera, en [DECISIONES.md](DECISIONES.md). Lo que falta, en
[PLAN.md](PLAN.md).
