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

## El remito es un ticket de 58 mm, en blanco y negro

Se dibuja sobre una grilla de **384 puntos de ancho** y crece hacia abajo lo que
haga falta. No es una hoja: es un ticket largo y angosto.

**Por qué:** van a sumar una impresora térmica portátil chica, de esas «de
gatito». Casi todas usan papel de 58 mm e imprimen 384 puntos a 203 dpi. Un
remito de 720 px no entra, y reducirlo dejaría el texto ilegible.

**Se dibuja al doble, 768 px reales.** En la pantalla de un teléfono un canvas a
tamaño real se ve borroso, y como 768 es exactamente el doble de 384, la app de
la impresora lo reduce sin ensuciar ni un punto.

**Va en blanco y negro a propósito.** El papel térmico es de un solo tono: cada
punto se quema o no se quema, no hay grises ni colores. Una banda bordó como la
de la app saldría como un rectángulo negro macizo: gasta batería, gasta el papel
y se ve peor. Negro sobre blanco imprime perfecto y en WhatsApp se lee como lo
que es, un remito.

**Cada producto ocupa dos renglones**, el nombre a lo ancho y debajo la cuenta
con el subtotal a la derecha. En 384 puntos no entran cuatro columnas sin partir
el nombre en tres pedazos, que es justo lo que hay que leer.

## Compartir e imprimir son dos botones distintos

**Compartir** es también el camino a la impresora térmica: esas impresoras no se
manejan desde el navegador, se manejan desde su propia app, y esa app aparece en
el menú de compartir como una más. Se elige WhatsApp o se elige la impresora;
para nuestra app es lo mismo.

**Imprimir** abre el diálogo del sistema con el ticket a 58 mm de ancho y alto
automático, para cualquier impresora que el teléfono o la computadora ya vean.

**Por qué los dos y no uno:** mientras la térmica portátil no traiga complemento
de impresión de Android —la mayoría no lo trae—, el diálogo del sistema no la
ve. Cuando llegue la impresora vamos a saber cuál de los dos caminos usa, y ahí
se puede evaluar hablarle directo por Web Bluetooth. Hasta entonces, tener los
dos cubre las dos posibilidades sin adivinar.

## El remito se dibuja en un canvas

Se arma en un `<canvas>`, sale como `.jpg` y se comparte con el botón nativo del
teléfono.

**Por qué:** hace falta un archivo de imagen para mandar por WhatsApp, y la
alternativa sería una librería de PDF o de captura de pantalla. Un canvas es
parte del navegador, no pesa nada, funciona sin señal y no agrega dependencias.

**Si el navegador no sabe compartir archivos, se descarga.** En el celular
`navigator.share` abre el menú de siempre y se elige WhatsApp; en una PC no
existe, así que baja el `.jpg`. Las dos cosas terminan en un archivo en la mano,
y no hace falta explicarle a nadie cuál de las dos le va a tocar.

**Cancelar el menú de compartir no es un error.** Se distingue el `AbortError`
—cambiaron de idea— de una falla de verdad. Si no se distinguiera, cerrar el
menú dispararía una descarga que nadie pidió.

**Se muestra antes de mandarlo.** Mirar el remito es la única forma de darse
cuenta de que el cliente estaba mal elegido, y eso pasa después de guardar, no
antes.

## Los campos de número son de texto

Se reciben como texto y se interpretan a la argentina: el punto separa miles y
la coma es el decimal.

**Por qué:** es una lección de MonAgric. El navegador considera inválido `5,5` en
un `<input type="number">` y lo deja vacío **sin avisar**. La gente escribe con
coma.

## Los gráficos del resumen son SVG a mano

**Por qué:** una librería de gráficos es la primera dependencia externa, y con
eso se cae la CSP estricta y el «sin build». El gráfico de barras mes a mes y la
torta de rubros son unas líneas de SVG, y encima salen bien impresos.

**Costo:** no hay gráficos interactivos ni animados. Para mirar un balance
mensual no hacen falta.

**El ancho de las barras horizontales lo pone el JavaScript, no un atributo
`style`.** La política de contenido no admite estilos sueltos en el HTML, así
que el porcentaje viaja en un `data-ancho` y una función lo aplica por CSSOM
después de dibujar, que sí está permitido. Los colores van por atributo
(`data-tono`, `data-i`) con sus reglas en la hoja de estilos.

## El PDF sale por el diálogo de impresión

No se genera un archivo: hay una hoja de estilos de impresión y se usa «guardar
como PDF» del teléfono o de la PC. La descarga en CSV sí es un archivo de verdad.

**Por qué:** lo mismo que arriba. Generar un PDF de verdad significa meter una
librería.

## El código de un producto no se edita

El nombre, la presentación y los precios sí. El código no.

**Por qué:** cada movimiento y cada venta guardan el código, no el nombre. Si
`KIM340` pasara a llamarse otra cosa, todas sus filas quedarían huérfanas y el
stock del kimchi de 340 pasaría a contar cero sin que nada avise. Para
reemplazar un producto se lo da de baja y se crea otro.

**Costo:** un código mal escrito al crearlo no se arregla; hay que dar de baja y
crear de nuevo. Es molesto una vez y evita un desastre silencioso.

## Dar de baja no es borrar

Un producto con historia se da de baja: desaparece de los desplegables y de los
resúmenes, pero sus filas viejas siguen teniendo sentido. Solo se borra de
verdad el que no tiene ni un movimiento ni una venta, que es el caso de haberlo
cargado mal recién.

**Por qué:** el pedido original decía «quitar productos». Quitarlos de verdad
rompería el historial de ventas, que es lo que la app viene a cuidar.

## La pantalla de Stock también resta

Además de cargar producción, permite «se rompió o venció» y «corrección por
conteo».

**Por qué:** no estaba pedido, pero una pantalla de stock que solo suma miente
apenas se rompe un frasco: el número queda alto para siempre y no hay dónde
anotar por qué. Con el depósito calculado a partir de los movimientos, la única
forma de que cierre es que todo lo que sale tenga su fila.

**La corrección pide el total contado, no la diferencia.** Nadie cuenta
diferencias: se cuentan frascos. La diferencia la saca la app y la muestra en
castellano antes de guardar.

## Los precios en masa se redondean, y se ve antes de aplicar

El aumento por porcentaje redondea a los $50 —se puede cambiar a $100 o a nada—
y muestra una tabla de precio viejo → precio nuevo antes de tocar nada.

**Por qué:** los precios que vienen usando son todos múltiplos de 50 y algunos
no de 100 ($6.150 el kale). Redondear sin mostrarlo haría aparecer números que
nadie pidió; mostrarlo primero convierte el redondeo en una decisión y no en una
sorpresa. Los productos cuyo precio no cambia después de redondear no se tocan,
para no gastar una sincronización de gusto.

## Una venta es varias filas con el mismo id

Cada producto vendido es una fila de la hoja `ingresos`, y todas las de la misma
venta comparten la columna `venta`, que va oculta en la planilla.

**Por qué:** el pedido pedía una fila por producto, que es lo que sirve para
filtrar y sumar en la planilla. Pero para armar el remito, para mostrar la venta
y para borrarla entera hay que poder volver a juntarlas. El id común es lo que
lo permite sin duplicar información.

**Al guardar se juntan los renglones repetidos.** Si alguien carga dos veces el
mismo producto en la misma venta, se suman en uno: dos filas iguales en la
planilla parecen un error de carga aunque no lo sean.

**Borrar una venta borra las dos cosas**, las filas de plata y los movimientos
de mercadería, que se encuentran por el mismo id guardado en su columna
`referencia`. Si borrara solo una de las dos, la plata y el stock dejarían de
contar la misma historia.

## Vender más de lo que hay avisa, no impide

Si la cantidad deja el depósito en negativo, el renglón lo dice y el guardado
sigue adelante.

**Por qué:** a veces la venta es real y lo que está mal es el stock —se envasó y
no se cargó—. En ese caso lo que hay que corregir es el stock, no la venta.
Impedirlo obligaría a inventar una carga de producción para poder registrar algo
que ya pasó.

Lo mismo con los clientes de consignación: si se elige uno en la pantalla de
Ingresos, avisa que las entregas van por Consignación, pero deja seguir. Un
local que trabaja a consignación también compra de vez en cuando.

## El nombre de un cliente sí se puede cambiar

Al revés que el código de un producto. Cambiarlo reescribe también todas las
filas que lo nombran: la columna `cliente` de las ventas, el `desde` y el
`hacia` de los movimientos de consignación, y las observaciones de los
movimientos de venta, donde el nombre va escrito para que la hoja se entienda
sin cruzarla con otra.

**Por qué la diferencia:** el código de un producto es una sigla que se elige
una vez y no se lee en voz alta. El nombre de un cliente es cómo se lo llama,
sale impreso en cada remito y es de lo más fácil de escribir mal. Prohibir el
renombre dejaría un error a la vista para siempre.

**Costo, y es real:** si otra persona tiene ventas cargadas sin sincronizar con
el nombre viejo, al subirlas van a quedar con el nombre viejo y ese cliente
aparecerá dos veces. Se arregla renombrando de nuevo. Con dos o tres personas
que sincronizan seguido es poco probable; si alguna vez pasa, ahora se sabe por
qué.

**Dar de baja a un local que todavía tiene mercadería avisa.** No la trae de
vuelta —eso se hace desde Consignación—, pero dice cuántas unidades y cuánta
plata quedan ahí. Dar de baja al cliente sin traerse los frascos sería perder
de vista plata que está en la calle.

## Los tres formularios de consignación no son iguales

Para **entregar** hay un desplegable con todo el catálogo y un botón de agregar,
como en una venta. Para **liquidar** y para **devolver** se listan los productos
que ese local tiene, cada uno con un casillero al lado y un botón «Todo».

**Por qué:** entregar es elegir de todo lo que hay; liquidar y devolver es mirar
la estantería del local y anotar. Con un desplegable habría que buscar producto
por producto lo que ya se sabe que está ahí, y encima se podría elegir uno que
el local no tiene.

## Liquidar sí frena cuando la cantidad no alcanza; vender, no

En una venta, pedir más de lo que hay en el depósito avisa y deja guardar,
porque puede ser que la venta sea real y el stock esté mal cargado.

En una liquidación **no se puede pasar** de lo que el local tiene. La diferencia
es que ese número no salió de un conteo: salió de una entrega que está anotada
fila por fila. Si el local dice que vendió más de lo que se le entregó, lo que
falta es una entrega, y cargarla es lo que corresponde.

## Una liquidación es una venta, y se borra como una venta

Liquidar escribe las mismas filas de `ingresos` que una venta —con el local como
cliente y la lista mayorista— más un movimiento de tipo `liquidacion`. Por eso
aparece después en las últimas ventas de Ingresos y se borra desde ahí.

**Al borrarla, la mercadería vuelve al local, no al depósito**, porque de ahí
había salido. La pantalla lo dice con esas palabras: decir «vuelven al depósito»
sería mentir justo sobre lo que esta app vino a separar.

## La plata en la calle no se calcula sumando los locales

Se calcula de una: todo lo que entró a cualquier ubicación que no sea reservada,
menos todo lo que salió de ella.

**Por qué:** si se sumaran los locales de la lista de clientes, un local
renombrado o dado de baja desaparecería del total y la plata en la calle daría
menos de lo que es. La plata en la calle es la que es, esté el cliente en la
libreta o no.

## La cantidad de un egreso es texto, no un número

**Por qué:** en la planilla vieja esa columna dice «5,4», «9,5 l», «2 k»,
«7 turnos», «433 frascos 660 y 100 tapas». Obligarla a número perdería la
unidad, que es justo lo que hace que el dato sirva para algo seis meses después.
Lo que sí es número es el monto.

## El CSV se arma desde los datos, no desde la pantalla

Trae todas las columnas, no las que se están mostrando, y los números van con
punto decimal y sin separador de miles: es lo que cualquier planilla entiende.
El formateo lindo —`$12.300`— es cosa de la pantalla.

**Lleva un BOM al principio.** Sin él, «almíbar» llega como «almÃ­bar» al abrir
el archivo en una planilla. Son tres bytes que evitan una pregunta segura.

## El PDF sale por el diálogo de impresión

Hay una hoja de estilos de impresión que saca la cabecera, el pie y los botones,
agrega el título con el período, y evita que un gráfico o una tabla se partan
entre dos hojas. Desde ahí, «guardar como PDF» del teléfono o de la PC.

**Por qué:** generar un PDF de verdad significa meter una librería, que es
exactamente lo que este proyecto no hace. La descarga en CSV sí es un archivo de
verdad, porque eso el navegador lo sabe hacer solo.

Hay que insistirle al navegador con `print-color-adjust: exact`: por defecto no
imprime fondos, y sin los fondos las barras y la torta salen en blanco.

## La escala es compacta, pero nada se toca con menos de 44 px

Los cuerpos de letra y los espaciados bajaron un escalón en toda la app: el
texto base de 17 a 16 px, las tarjetas de 16 a 12 px de aire, los botones de 50
a 44 px de alto, los renglones del menú de 68 a 54.

**Por qué:** lo pidieron ellas. «Son chicas jóvenes» y la app estaba pensada con
una holgura que no necesitan; en Ingresos, que es lo que más usan, había que
bajar media pantalla para llegar al botón de agregar otro producto.

**El piso son 44 px** de alto para cualquier cosa que se toque con el dedo, que
es el mínimo razonable en un teléfono. Los campos, los botones y las opciones
quedaron ahí; lo que se achicó es el aire alrededor y el tamaño del texto, no el
área para acertarle.

**El renglón de producto de una venta pasó de dos líneas a una.** Antes eran
unos 130 px cada uno y con cinco productos el botón de agregar quedaba fuera de
la pantalla. Ahora son 51 px, el subtotal aparece solo cuando hay algo que
mostrar, y con cinco productos cargados el botón sigue a la vista.

## «En la calle» pasó a decir «en consignación»

**Por qué:** en el inicio decía «En la calle» al lado de «En depósito» y no se
entendía qué era. La palabra que sí se entiende es la que le da nombre a la
sección. En el código y en los comentarios la expresión queda, porque ahí
describe bien la idea; en la pantalla no.

## El aviso de versión nueva pregunta, no escucha

La app compara la versión que está corriendo contra la que declara el
`js/app.js` del servidor, al volver a la app desde segundo plano y como mucho
una vez cada dos minutos.

**Por qué así y no escuchando el cambio de service worker:** como los archivos
se piden a la red primero, quien abre la app con señal ya recibe los nuevos, y
el service worker se actualiza igual. Escuchar ese cambio haría aparecer el
cartel anunciando algo que ya está puesto. El caso real que hay que cubrir es
otro: la app instalada que quedó abierta en segundo plano y al volver a ella no
vuelve a pedir nada. Ahí la pregunta «¿qué versión tenés vos?» es exactamente la
que corresponde.

**Sin señal no avisa nada**, que es lo correcto: no tener novedades no es una
novedad.

## La notebook se resuelve con un solo punto de quiebre

Todo lo del escritorio vive detrás de `min-width: 900px`. En el teléfono no
cambia ni un píxel: la app se sigue diseñando para el celular, y lo de arriba de
900 es lo que evita que en una notebook se vea como un teléfono perdido en el
medio de la pantalla.

**La columna crece a 880 px, no más.** Un desplegable de mil píxeles de ancho es
peor de usar que uno de cuatrocientos: los formularios se leen en columna.

**El resumen es la excepción y llega a 1140.** Es un tablero, no un formulario,
y ahí el ancho se aprovecha de verdad. Se resuelve poniéndole al `body` en qué
sección está y redefiniendo la variable `--ancho`: como se hereda, la cabecera y
el pie acompañan solos, sin una regla más.

**Los bloques del resumen dicen si quieren media pantalla o entera.** En el
teléfono van todos uno abajo del otro; arriba de 900 se acomodan de a dos, salvo
el gráfico de meses, el balance y el stock, que piden la fila completa.

## El balance por medio de pago

Por cada medio: lo que entró, lo que salió y la diferencia. Es la pregunta que
de verdad se hace uno a fin de mes —«¿cuánta plata tendría que haber en
efectivo?»— y la que la planilla vieja contestaba con filas sueltas que había
que restar a mano.

**Ojo con lo que NO dice, y está escrito en el código:** es el movimiento del
período, no un saldo de caja. Eligiendo un mes, la diferencia es la de ese mes;
el saldo real arrastra lo que venía de antes. Eligiendo «todo lo cargado» sí es
el saldo desde que empezaron a usar la app.

Con esta tabla sobran las dos listas de barras por medio de pago que había
antes: decían lo mismo por separado y sin restarlo.

## Consignación también da comprobante

Liquidar y devolver generan su papel, no solo entregar.

- **Liquidar → RECIBO**, con precios y total: le queda al local como constancia
  de lo que pagó.
- **Devolver → DEVOLUCIÓN**, sin precios y con unidades: es la constancia de lo
  que se llevaron de vuelta.

**Y la etiqueta de quién es el otro cambia según el papel**: «entregado a» en un
remito, «recibimos de» en un recibo, «devuelto por» en una devolución. Poner la
misma en los tres estaría mal en dos, y son documentos que quedan en manos del
cliente.

## El botón con comprobante va primero y pintado

En Ingresos y en Consignación, el botón que además genera el papel es el
principal —bordó, arriba— y el que solo guarda queda abajo, sin pintar y
diciendo «sin remito» o «sin comprobante».

**Por qué:** generar el remito es lo que hacen casi siempre. Cuando el botón
pintado era el otro, la mano iba sola al que no correspondía, y darse cuenta
implicaba volver a entrar a la venta. Decir «sin remito» en vez de solo
«guardar» hace visible la diferencia en el momento de elegir.

## Por qué las bajas volvían solas

Se borraba una venta de prueba o un cliente viejo y al rato reaparecía. No era
una impresión: eran **dos bugs distintos** que daban el mismo síntoma, y por eso
a veces pasaba y a veces no.

**Uno.** Al sincronizar, los ingresos, los egresos y los movimientos se fusionan
mirando la lista de bajas, pero los productos y los clientes se fusionan por su
clave —el código o el nombre— con otra función, `fusionarPorClave`, **que nunca
recibió esa lista**. Así que borrar un cliente mandaba la lápida, el servicio la
guardaba obedientemente en la hoja `borrados`… y después la ignoraba. La fila
seguía en la planilla, se leía de vuelta y volvía al teléfono. Este era el de los
clientes, y pasaba siempre.

**Dos, y más grave.** La marca de «hasta acá está todo subido» se ponía con la
hora de la RESPUESTA, no con la del pedido. Entonces todo lo que se tocaba
mientras el pedido viajaba quedaba por detrás de la marca y **no se subía nunca
más**. Si en ese rato se borraba algo, la respuesta —que es una foto de antes—
lo revivía y la lápida quedaba muerta. Este era el de las ventas, y pasaba solo
si el borrado caía justo mientras había una sincronización en el aire: de ahí lo
intermitente.

Y encima, pedir una sincronización mientras había otra corriendo la **descartaba**
(`if (trabajando) return`), así que el cambio que la disparó se quedaba esperando
una próxima vuelta que podía no llegar.

Lo peor de los tres no eran las bajas: **una venta cargada mientras había una
sincronización en el aire se perdía entera**, del teléfono y de la planilla, sin
que nada avisara.

Los tres arreglos:

- `fusionarPorClave` mira las bajas. Con una diferencia contra la otra: acá la
  lápida gana solo si es **igual o más nueva** que la fila, porque un nombre se
  puede volver a usar. Si un cliente se borra y después se carga de nuevo con el
  mismo nombre, gana la fila nueva. Con los ingresos es al revés —la lápida gana
  siempre— porque sus ids son irrepetibles y así la baja aguanta aunque a la fila
  le falte el `mod`.
- El pedido se arma con un **corte**, tomado antes de leer nada, y la marca se
  mueve hasta ese corte y no hasta la hora de la respuesta. Lo que pasó durante
  el viaje sigue pendiente, que es exactamente lo que tiene que pasar.
- Al aplicar la respuesta, lo tocado después del corte se aparta y se vuelve a
  poner encima: lo borrado en ese rato no revive y lo cargado en ese rato no
  desaparece.
- Una sincronización pedida mientras hay otra ya no se tira: se anota y sale sola
  apenas termina la anterior.

**Queda un banco de pruebas en `pruebas/`** que corre el código de verdad de las
dos puntas contra una planilla de mentira y reproduce todo esto. Los seis casos
fallaban antes del arreglo; ahora pasan. Vale la pena correrlo antes de tocar la
sincronización.

## Dos toques no pueden guardar dos veces

Guardar una venta son varias escrituras seguidas más recalcular todo. En un
celular que tarda medio segundo, el segundo toque —que es lo más natural del
mundo cuando el botón no reacciona— entraba antes de que el primero terminara y
guardaba la venta **dos veces**, con el stock descontado doble. Comprobado: tres
toques seguidos daban tres ventas.

Se resolvió con un ayudante en `util.js`, `unaVez(boton, fn)`, que desactiva el
botón mientras la función corre. Está en todos los botones que escriben: las dos
formas de guardar una venta, borrarla, los egresos, el stock, las tres de
consignación, los productos y los clientes.

**Restaura el estado anterior, no habilita.** Hay botones que nacen desactivados
a propósito, como el de dar de baja los marcados mientras no hay ninguno
marcado.

El que más se agradece es el del **aumento masivo de precios**: aplicado dos
veces componía el porcentaje, y un 12 % se convertía en un 25 % sin que nadie
entendiera por qué.

## Cosas más chicas de la misma revisión

- **El medio de pago de un cliente ya no se pierde solo.** El desplegable se
  arma con la lista de la hoja `listas`; si el valor guardado no estaba entre las
  opciones, caía en «—» y guardar se lo llevaba puesto. Pasa si le cambian el
  nombre a un medio de pago en la planilla, y pasa entero en un teléfono que
  todavía no sincronizó, donde esa lista está vacía. Ahora el valor guardado se
  agrega a la lista aunque no figure.
- **El CSV ya no puede abrirse con una fórmula viva.** Un texto que arranca con
  `=`, `+` o `@` lo interpreta la planilla que abre el archivo. El Apps Script ya
  lo neutralizaba al escribir en la hoja; faltaba hacerlo también al descargar.
- **El nombre del cliente se parte en el remito.** En 384 puntos, un nombre largo
  se salía del papel y la térmica lo iba a cortar. Ahora se acomoda en varias
  líneas, y `partir` además corta por letra las palabras que no entran enteras.
- **«1 unidad», no «1 unidades»**, en la lista de locales y en los dos avisos de
  consignación.

Lo que se revisó y **estaba bien**: el escapado del HTML (se probó con nombres
que traen `<img onerror=…>` y no ejecutan nada, se ven como texto), el parseo de
números a la argentina (`6.800`, `6,50`, `$1.250.000`), la fecha local en vez de
UTC, el CSV con BOM y comillas dobladas, y toda la aritmética del resumen y del
stock, verificada a mano contra catorce movimientos y cinco ventas.

## La pantalla de arranque, y las DOS que hay

Al abrir la app no aparece una pantalla de carga sino dos, y conviene saberlo
porque se configuran en lugares distintos.

**La primera la arma Android**, antes de que corra una sola línea de código, con
lo que dice `manifest.webmanifest`: el `background_color` y el ícono. Estaba en
crema con el ícono cuadrado, así que lo primero que se veía era justo lo
contrario de lo que se quería. Ahora el fondo es negro.

**La segunda es la de la app**, en `index.html` y `estilos.css`. Está escrita en
el HTML y no la dibuja el JavaScript a propósito: así aparece en el primer
pintado, que es exactamente para lo que sirve. Fondo negro, el disco, el
logotipo de la marca, la versión y la firma.

**El logo redondo se construyó, no se recortó a ojo.** El ícono es un cuadrado
bordó con el círculo apenas insinuado por un aro fino. Se midió el dibujo: las
piezas circulares están centradas en (531, 544.5) del `viewBox` de `marca.svg` y
llegan hasta un radio de 253. De los 90 caminos del archivo, los primeros diez
son el logotipo y el once es el aro —no una bacteria, aunque esté en el mismo
grupo—, cosa que se descubrió al ver dos circunferencias concéntricas en la
primera versión. El disco quedó con radio 282,8, que deja el aro al 89 % del
radio: la misma proporción que tiene el ícono original.

Para los PNG no hizo falta rasterizar nada: el ícono cuadrado ya tiene el dibujo
bien proporcionado, así que alcanzó con recortarle las esquinas en círculo, con
la máscara dibujada al cuádruple y reducida para que el borde no quede
escalonado.

**Los cuadrados no se tiraron: quedaron como `maskable`.** Son ideales para eso,
porque tienen color a sangre y el dibujo entra entero en la zona segura del
recorte que cada lanzador de Android le aplica al ícono. Los redondos, con las
esquinas transparentes, son los que se ven sobre el negro.

**El télon tiene un piso de 600 ms, medido desde que arrancó la página y no
desde que termina de cargar.** Si bajar los archivos ya tardó más que eso —que
es lo normal la primera vez y con poca señal— no se espera ni un milisegundo de
más. El piso es solo para la carga instantánea, donde si no la pantalla sería un
destello que nadie llega a ver. Y se levanta salga bien o salga mal: si algo
falló, lo que hay que ver es el cartel del error y no el logo.

**En el arranque va solo el número de versión**, sin el nombre: ahí abajo del
logo, «1.3.2 · pantalla de arranque» sería un renglón de ruido. El nombre
completo sigue en el pie.

## La consignación de la planilla vieja entra como conteo, no como entrega

En la hoja `INGRESOS` de la planilla vieja, las primeras 97 filas —contiguas,
arriba de todo— tienen «Consignación» en la columna del medio de pago. Son diez
locales y 171 unidades.

**No son remitos de entrega: son un conteo de lo que cada local tiene.** Se nota
en que cada local trae la lista casi completa del catálogo, **con los renglones
en cero incluidos**. Un remito no lista lo que no entregó; una planilla de
control sí, y se edita en el lugar cuando el local vende.

**Y el conteo del depósito ya los excluía.** Esto se comprobó, no se supuso: en
la tabla de stock de la planilla vieja hay tres productos en cero que sin
embargo están en varios locales. Si el conteo del depósito los hubiera incluido,
no podrían dar cero. Además esa tabla suma exactamente las 263 unidades y los
$2.060.950 con los que arrancó la app.

De ahí la decisión: **entran como `ajuste` con `desde` vacío y `hacia` el local**,
que es el mismo movimiento con el que se cargó el stock inicial del depósito.
Cargarlos como `entrega` habría descontado 171 unidades de un depósito que nunca
las tuvo, y habría dejado tres productos en negativo.

Se probó con el catálogo real cargado: el depósito queda intacto en 263 unidades
y $2.060.950, la consignación pasa a $1.242.200, y no queda ninguna ubicación en
negativo.

**Lo que esto no resuelve.** La planilla anotaba una fecha por local y algunas
son de abril. Si desde entonces vendieron y no quedó anotado, el número carga de
más. Es un punto de partida, no un conteo de hoy: sigue haciendo falta pasar por
cada local. Lo bueno es que ahora hay contra qué comparar, que antes no había.

**Los datos no van al repositorio.** Las 84 filas se entregaron como archivo
aparte, para pegar en la hoja `movimientos`. La app tiene el camino previsto
—las hojas se editan a mano y la sincronización las lee— así que no hizo falta
tocar código ni hacer una implementación nueva.

## El repositorio es público y `Code.gs` lleva datos del emprendimiento

Encontrado al preparar la carga de la consignación, y sin resolver: el archivo
`apps-script/Code.gs` está versionado y trae `SEMILLA_CLIENTES` con los 46
clientes, su localidad y si compran o trabajan a consignación, y
`SEMILLA_PRODUCTOS` con los dos precios de cada producto y el stock inicial.

Las semillas ya cumplieron su función: el libro está creado. Sacarlas del
archivo es barato, pero **borrarlas del archivo no las borra del historial de
git**: para eso hay que reescribir el historial y forzar la subida, o empezar un
repositorio nuevo.

Queda anotado como decisión pendiente de Martín, que es de quien es el dato.

## INGRESOS POR MES: por qué daba #ERROR! y con qué se reemplazó

`#ERROR!` en Google Sheets no es un dato que falta ni una cuenta imposible: es
lo que muestra cuando **no entiende la fórmula**. La que había armaba un arreglo
a mano de dos columnas —el mes como texto y el subtotal— y se lo pasaba a QUERY:

    =QUERY({ARRAYFORMULA(...TEXT(fecha;"yyyy-mm")...)\ingresos!J2:J};"select ...")

Esa construcción con `{ ... \ ... }` es la parte frágil, y es la que se sacó. La
fórmula de al lado, EGRESOS POR RUBRO, usa QUERY sin arreglo y siempre anduvo,
lo que deja bastante claro de dónde venía el problema.

En vez de arreglar el arreglo se sacó el arreglo. Ahora son dos piezas que no
necesitan armar nada:

- **La columna de meses** sale de `SORT(UNIQUE(FILTER(TEXT(...))))`, ordenada del
  más nuevo al más viejo.
- **Cada total** es un `SUMPRODUCT` común, uno por renglón, treinta y seis
  renglones que son tres años de meses.

Es más largo de escribir y mucho más difícil de romper. Los dos van envueltos en
`IFERROR`, así que aunque algo falle no vuelve a aparecer un `#ERROR!` pelado.

Se mantuvo la decisión original de **comparar los meses como texto «aaaa-mm» y
no con funciones de fecha**: QUERY resuelve las fechas según el tipo que le
adivina a la columna, y ahí es donde se rompía seguido.

`crearResumen()` se corta sola si la hoja ya existe, así que para arreglar un
libro que ya está hay una función aparte, `arreglarIngresosPorMes()`, que
reescribe solo esas celdas. Borrar la hoja entera para rehacerla era más
riesgoso que tocar cuatro celdas.

## Los clientes dados de baja salen de consignación

La consignación importada de la planilla vieja traía locales con los que ya no
trabajan. `limpiarConsignacionDeBajas()` los saca.

**Toca solo los renglones del conteo inicial**, los que llevan la referencia
`conteo inicial`. Una entrega, una liquidación o una devolución de verdad no se
borran nunca, aunque después den de baja al cliente: eso pasó, y borrarlo sería
falsear la historia. Lo importado es lo único que se puede sacar sin mentir,
porque nunca fue un movimiento: fue una foto de la planilla anterior.

**No lleva ningún nombre escrito en el código.** Mira quién está marcado como no
activo en la hoja de clientes. Si mañana dan de baja a otro local, se vuelve a
correr y listo. De paso, el código del repositorio no suma nombres de clientes,
que es algo que en este proyecto conviene cuidar.

Escribe lápidas en la hoja `borrados`, así la baja también les llega a los
teléfonos que ya se habían bajado esas filas, en vez de depender de que no las
vuelvan a subir.
