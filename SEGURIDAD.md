# Seguridad

Esta app maneja las ventas, los costos y la lista de clientes de un
emprendimiento. No es información pública y no está pensada para que la vea
cualquiera.

## De qué se protege y de qué no

La dirección del servicio está escrita en `docs/js/sincro.js`, que está en un
repositorio público. Cualquiera puede leerla. **Ese es el punto de partida del
diseño, no un descuido:** no hay forma de esconder una dirección en una app que
corre en el navegador.

En MonAgric esto se comprobó ejecutándolo: con la dirección sola se podían
inventar registros y borrar una temporada entera. Por eso acá el control de
acceso está desde el primer día.

**Protege de:** que alguien que encuentre la dirección pueda leer las ventas o
escribir filas.

**No protege de:** alguien que tenga el teléfono desbloqueado de una de ellas, o
que tenga acceso a la cuenta de Google donde vive el libro. Contra eso no hay
app: hay clave de pantalla y no compartir la cuenta.

## Cómo funciona

1. Se generan códigos de invitación desde el editor de Apps Script
   (`crearInvitaciones()`). Quedan en la hoja `invitaciones`, con estado
   `Nueva`. **No hay ninguna entrada del servicio que cree invitaciones**: si la
   hubiera, cualquiera podría pedirse una y no habría control de acceso.
2. El teléfono canjea el código una vez. El servicio le devuelve una credencial
   de 26 caracteres al azar y marca el código como `Usado`.
3. La credencial queda en el `localStorage` de ese teléfono. La planilla guarda
   **solo su huella SHA-256**, en la hoja `dispositivos`.
4. Cada sincronización viaja con la credencial. El servicio calcula la huella y
   la busca; si no está, o si la fila dice que el teléfono no está activo, no
   lee ni escribe nada.

De la credencial sale siempre la misma huella, pero de la huella no se puede
volver a la credencial. Ni leyendo la planilla entera se saca algo que sirva
para entrar.

## Un código solo sirve mientras diga «Nueva»

La comprobación está al revés de lo obvio, a propósito: **cualquier cosa que no
diga exactamente `Nueva` inutiliza el código**.

Si valiera al revés —rechazar solo los que digan `Usado`—, tachar un código
escribiendo `anulado` o `de más` en esa celda lo dejaría funcionando igual, que
es exactamente lo contrario de lo que uno espera al tacharlo.

## Dar de baja un teléfono

Si se pierde un celular o alguien deja de trabajar en el emprendimiento:

1. Abrir el libro.
2. Mostrar la hoja oculta `dispositivos` (clic derecho en las pestañas → *Ver
   hojas ocultas*).
3. Buscar la fila del teléfono y escribir **`no`** en la columna `activo`.

Deja de poder sincronizar desde el pedido siguiente, sin afectar a nadie más.
Los datos que ya subió quedan: dar de baja un acceso no borra el trabajo hecho.

Para volver a habilitarlo, escribir `sí` — o mejor, darle un código nuevo, por
si el aparato perdido apareció en manos de otra persona.

## Qué pasa si se pierde la credencial

Nada grave. Se genera un código nuevo con `crearInvitaciones()` y se vuelve a
activar. **Lo que hubiera cargado ese teléfono y no hubiera subido todavía sigue
en el teléfono:** cuando el servicio contesta que no hay permiso, la app borra
la credencial pero nunca los datos.

## Lo que se escribe en la planilla va como texto

Un valor que empieza con `=` o con `+` **no se guarda como texto**: la planilla
lo toma como fórmula. Una observación tan inocente como «=2 frascos rotos»
quedaría en `#NAME?`, y una fórmula puesta a propósito —`=IMPORTXML(...)`—
podría leer el libro entero o mandar datos afuera.

El servicio le pone una comilla simple adelante a esos textos antes de
escribirlos. No se ve en la celda, no viene al leerla de vuelta, y la fórmula
nunca se evalúa.

No es un agujero abierto a cualquiera —hay que tener credencial para escribir—
pero sí es la clase de cosa que rompe sola, sin que nadie la ataque.

## La política de contenido

El `index.html` declara de dónde puede venir cada cosa. La app no carga
tipografías, ni librerías, ni imágenes de otros sitios: todo viaja con ella. Lo
único externo permitido es `script.google.com`.

Eso significa que si alguna vez se colara un script ajeno —por una dependencia
comprometida, por un archivo subido de más—, el navegador no lo ejecuta. Se
comprobó que la política está activa: intentar evaluar una cadena como código
desde la consola de la app da el error de CSP esperado.

Como efecto secundario, **no se pueden usar atributos `style` sueltos en el
HTML**. Por eso hay clases como `.separado` o `.al-final` en la hoja de estilos
para cosas que serían un `style="margin-top:20px"`.

## Lo que sí está en el repositorio público

- El código de la app y del servicio.
- La dirección del servicio (`/exec`).
- El logo y la paleta.

## Lo que no

- `IDS.txt`, con la dirección del libro y los códigos de invitación. Está en el
  `.gitignore`.
- El catálogo de productos y **la lista de clientes**. La app no trae ninguna
  copia: baja en la primera sincronización, ya con credencial.
- Cualquier dato de ventas, costos o stock. Todo eso vive en el libro de Google,
  que es privado.

Si alguna vez se sube algo de esto por error, no alcanza con borrarlo en el
commit siguiente: queda en el historial. Hay que reescribirlo y rotar lo que se
haya filtrado (códigos nuevos, y si fuera la dirección del servicio, una
implementación nueva).
