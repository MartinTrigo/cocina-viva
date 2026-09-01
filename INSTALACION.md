# Instalación

De cero a la app andando en el celular. Son cuatro partes y se hace una sola
vez. Lo que vaya saliendo (direcciones, códigos) se anota en `IDS.txt`, que no
va al repositorio.

---

## 1 · El libro de Google

1. Entrar a la carpeta de Drive del proyecto:
   <https://drive.google.com/drive/folders/11EBGH74C44XZFqm5omaXoSDUuE-Et6db>
2. **Nuevo → Hojas de cálculo de Google**. Ponerle de nombre
   **`Cocina Viva · Gestión`**.
3. Anotar su dirección en `IDS.txt`.

No hay que crear ninguna hoja ni escribir ningún encabezado: eso lo hace el
script en el paso siguiente.

---

## 2 · El servicio

1. Desde el libro recién creado: **Extensiones → Apps Script**.
2. Borrar todo lo que haya en `Código.gs` y pegar el contenido completo de
   `apps-script/Code.gs` **de este repositorio**, que es este archivo y ninguna
   otra cosa parecida de otro proyecto:

   <https://github.com/MartinTrigo/cocina-viva/blob/main/apps-script/Code.gs>

   (el botón de copiar está arriba a la derecha del recuadro de código).
   Guardar (💾).
3. En el desplegable de funciones elegir **`prepararLibro`** y **Ejecutar**.
   - La primera vez pide autorización: *Revisar permisos* → elegir la cuenta →
     *Configuración avanzada* → *Ir a Cocina Viva (no seguro)* → *Permitir*.
     Dice «no seguro» porque el script no está verificado por Google; es tuyo.
   - En el **Registro de ejecución** tiene que decir que creó las hojas y que
     cargó 19 productos, 46 clientes y el stock inicial de 12 productos.
4. Volver a la planilla y mirar: tienen que estar las hojas `resumen`,
   `productos`, `clientes`, `ingresos`, `egresos`, `movimientos` y `listas`.
   Las de acceso quedan ocultas a propósito.
5. En el editor, elegir **`crearInvitaciones`** y **Ejecutar**. Deja cuatro
   códigos en el Registro de ejecución.

   > **La hoja `invitaciones` no va a aparecer entre las pestañas: se crea
   > oculta a propósito.** Para verla, clic derecho sobre cualquier pestaña de
   > abajo → **Ver hojas ocultas** → `invitaciones`. Lo mismo vale para
   > `dispositivos` y `borrados`.

   **Copiar los códigos a `IDS.txt`**, y anotar en la columna «para quién» de
   esa hoja a quién le tocó cada uno.

### Publicar el servicio

6. **Implementar → Nueva implementación → ⚙ → Aplicación web**:
   - Descripción: `v1`
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
7. **Implementar**, autorizar si lo pide, y **copiar la URL** que termina en
   `/exec`. Anotarla en `IDS.txt`.

> **«Cualquier persona» no significa que cualquiera vea los datos.** Significa
> que el servicio contesta el pedido sin pedir cuenta de Google. Quién puede
> leer o escribir lo decide la credencial, no Google. Si acá se elige «Solo yo»,
> la app no funciona en ningún teléfono que no sea el tuyo.

8. Pegar esa URL en [`docs/js/sincro.js`](docs/js/sincro.js), en la constante
   `SERVICIO`:

   ```js
   const SERVICIO = "https://script.google.com/macros/s/AKfy…/exec";
   ```

9. Subir el número de caché en [`docs/sw.js`](docs/sw.js) (`cocinaviva-v1` →
   `cocinaviva-v2`) para que los teléfonos que ya tengan la app se bajen la
   versión nueva.

---

## 3 · Publicar la app

1. Subir los cambios:

   ```bash
   git add -A && git commit -m "Conectar la app con el servicio publicado" && git push
   ```

2. En GitHub: **Settings → Pages → Source: Deploy from a branch**, rama `main`,
   carpeta **`/docs`**. Guardar.
3. A los dos o tres minutos queda en
   <https://martintrigo.github.io/cocina-viva/>.

---

## 4 · Activar cada teléfono

1. Abrir esa dirección en el celular, en Chrome.
2. Menú **⋮ → Agregar a pantalla de inicio**. Queda instalada con su ícono y
   funciona sin señal.
3. Abrirla, entrar a **Acceso y sincronización**, escribir el código de
   invitación y tocar **Activar**.
4. Volver al inicio: tienen que aparecer las cifras del depósito.

Cada código sirve **una sola vez y en un solo teléfono**. Si alguien cambia de
celular, se le da otro.

---

## Comprobar que quedó bien

**Hecho el 1/9/2026 sobre esta instalación**, con el cuarto código de repuesto:
se canjeó, se comprobó que el mismo código rechaza un segundo teléfono, se bajó
el estado (19 productos, 46 clientes, 12 movimientos), se subió un movimiento de
prueba, apareció en la planilla, y se borró desde la app dejando el depósito de
nuevo en $2.060.950. Anda de punta a punta.

Para repetirlo alguna vez —al cambiar de implementación, por ejemplo—:

1. Activar la app con un código de repuesto.
2. Cargar cualquier cosa: un ingreso de stock de una unidad, por ejemplo.
3. Tocar **↻** y esperar el aviso de que subió.
4. Abrir la planilla y ver la fila nueva en `movimientos`.
5. Borrar esa fila desde la app, sincronizar de nuevo, y comprobar que se fue
   también de la planilla.
6. Dar de baja el teléfono de prueba escribiendo `no` en la columna `activo` de
   la hoja oculta `dispositivos`.

Si algo no arranca, ejecutar **`revisar()`** en el editor de Apps Script: no toca
nada y cuenta en castellano qué encontró y qué falta.

---

## Actualizar el servicio más adelante

Cuando cambie `Code.gs`:

1. Pegar el `Code.gs` nuevo en el editor y guardar.
2. **Implementar → Administrar implementaciones → ✏ (editar) → Versión: Nueva
   versión → Implementar.**
3. Si el cambio toca el formato, los desplegables o el ancho de las columnas,
   ejecutar además **`reaplicarFormato()`** a mano. `darFormato()` corre una
   sola vez, la primera; si corriera siempre pisaría los retoques que ellas le
   hayan hecho a la planilla. Esa función es la puerta para forzarlo, y no toca
   ni una fila de datos.

Así la URL `/exec` **no cambia**. Si en cambio se hace una *implementación
nueva*, sale una URL distinta y hay que actualizarla en `sincro.js` y subir el
número de caché del service worker.
