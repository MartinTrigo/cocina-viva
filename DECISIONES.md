# Decisiones

Por qué la app está hecha así y no de otra manera. Sirve para no rediscutir lo
mismo dentro de un año, y para saber qué habría que revisar si cambia el motivo.

## El stock se calcula, no se guarda

Hay una sola hoja de mercadería, `movimientos`, y cada fila dice una cantidad,
de dónde salió y a dónde fue. El stock de cualquier ubicación —el depósito, un
local— es la suma de lo que entró menos lo que salió.

**Por qué:** en la planilla vieja el stock era una celda con un número, y las
ventas y las consignaciones lo modificaban por fórmulas que cruzaban tres hojas.
Cuando ese número no cerraba, no había manera de saber en qué momento se
desacomodó. Con un libro mayor eso no puede pasar: el número no existe hasta que
se lo pide, y siempre se puede leer fila por fila de dónde salió.

**Costo:** cada consulta de stock recorre todos los movimientos. Con unos pocos
miles de filas al año es instantáneo. Si algún día fueran cientos de miles,
habría que guardar saldos parciales por mes; hoy sería complicar de gratis.

## Entregar, liquidar y devolver son tres cosas distintas

En la planilla, «Consignación» era un **medio de pago** dentro de INGRESOS.
Dejar mercadería en Humus generaba una fila de ingreso que descontaba stock y a
la vez registraba como cobrada plata que no estaba. El resumen mensual tenía que
tener una línea aparte para consignación que no se sumara a las ventas: era un
parche para no inflar los ingresos.

Acá la entrega mueve mercadería y no toca la plata; la liquidación es la que
cobra y genera el ingreso; la devolución trae de vuelta lo que no se vendió.

**Consecuencia:** «Consignación» ya no figura entre los medios de pago. Cuando un
local paga, se elige con qué pagó de verdad (efectivo, transferencia, MP).

## El script está vinculado al libro, no suelto

`apps-script/Code.gs` se pega desde la planilla misma (Extensiones → Apps
Script), así que `SpreadsheetApp.getActive()` ya es el libro correcto.

**Por qué:** en Semillas el script era suelto y había que cargarle los ids de
dos planillas en «Propiedades del script», una pantalla con un botón de guardar
fácil de no ver. La mitad de los problemas de instalación venían de ahí. Un
script vinculado no tiene ningún identificador que cargar, y de paso resuelve
sin esfuerzo el criterio de que los ids no vivan en el código: no hay ids.

**Costo:** las hojas de acceso (`invitaciones`, `dispositivos`) viven en el mismo
libro que los datos, ocultas. En Semillas iban aparte para que un estudiante no
viera las credenciales de los demás. Acá las dos únicas personas con acceso al
libro son las dueñas, y lo que se guarda es una huella SHA-256 que no sirve para
entrar. No hay a quién ocultárselo.

## Sincronización en los dos sentidos, gana el más reciente

Cada registro lleva `mod`, el momento en que se tocó. La app manda lo que cambió
desde la última sincronización buena y recibe el estado completo ya fusionado.
Si el mismo registro se editó en dos teléfonos, gana el de `mod` más alto.

**Por qué:** es lo que ya funciona en bioma-mov con este mismo tipo de datos, y
alcanza para dos o tres personas que no editan la misma fila al mismo tiempo. Un
esquema de conflictos más fino sería trabajo sin caso de uso.

**Las bajas van a la hoja `borrados`.** Sin esa lápida, un registro borrado en un
teléfono volvería a aparecer en la próxima sincronización: el servicio no
tendría cómo distinguir «esto se borró» de «este teléfono todavía no lo conocía».

## La planilla se puede seguir usando como planilla

El servicio lee las hojas tolerando filas escritas a mano: si falta el id lo
inventa, si la fecha vino `7/8/2026` la normaliza, si el monto vino `$ 1.234,50`
lo convierte a número. Los desplegables avisan pero no rechazan.

**Por qué:** si cargar una fila desde la planilla rompiera algo, la planilla
dejaría de ser una planilla y pasaría a ser una base de datos que se mira. La
razón de usar Google Sheets y no un servidor propio es justamente que puedan
meter mano.

## La app no trae ningún catálogo de arranque

Productos y clientes bajan en la primera sincronización.

**Por qué:** el repositorio es público —GitHub Pages gratis lo necesita— y la
lista de locales del emprendimiento no tiene por qué estar ahí. Y no se pierde
nada: ninguna sección se abre sin activar el teléfono, activar necesita señal, y
apenas se activa se sincroniza. Nunca hay un momento útil en que el catálogo de
arranque hiciera falta.

## Los precios son dos y el que manda lo elige la venta

Cada producto tiene precio mayorista y minorista. El formulario de venta tiene
un selector que decide cuál se usa, y arranca en mayorista, que es lo más
frecuente.

**Por qué:** el pedido original decía «precio automático desde la hoja
productos», pero en la hoja hay dos columnas de precio. Sin elegir cuál, la app
tendría que adivinar.

## El remito se dibuja en un canvas

Se arma en un `<canvas>`, sale como `.jpg` y se comparte con el botón nativo del
teléfono.

**Por qué:** hace falta un archivo de imagen para mandar por WhatsApp, y la
alternativa sería una librería de PDF o de captura de pantalla. Un canvas es
parte del navegador, no pesa nada, funciona sin señal y no agrega dependencias.

## Los campos de número son de texto

Se reciben como texto y se interpretan a la argentina: el punto separa miles y
la coma es el decimal.

**Por qué:** es una lección de MonAgric. El navegador considera inválido `5,5` en
un `<input type="number">` y lo deja vacío **sin avisar**. La gente escribe con
coma.

## Los gráficos del resumen van a ser SVG a mano

**Por qué:** una librería de gráficos es la primera dependencia externa, y con
eso se cae la CSP estricta y el «sin build». Un gráfico de barras y uno de torta
son treinta líneas de SVG.

**Costo:** no va a haber gráficos interactivos ni animados. Para mirar un balance
mensual no hacen falta.

## El PDF sale por el diálogo de impresión

No se genera un archivo: hay una hoja de estilos de impresión y se usa «guardar
como PDF» del teléfono o de la PC. La descarga en CSV sí es un archivo de verdad.

**Por qué:** lo mismo que arriba. Generar un PDF de verdad significa meter una
librería.
