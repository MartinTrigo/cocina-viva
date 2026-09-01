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
   [`apps-script/Code.gs`](apps-script/Code.gs). Guardar (💾).
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
   códigos en el Registro de ejecución y en la hoja `invitaciones`.
   **Copiarlos a `IDS.txt`**, y anotar en la planilla a quién le tocó cada uno.

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

Antes de repartir los códigos conviene hacer una prueba entera con uno de los de
repuesto:

1. Activar la app con ese código.
2. Cargar cualquier cosa —un ingreso de stock de una unidad, por ejemplo—.
3. Tocar **↻** y esperar el aviso de que subió.
4. Abrir la planilla y ver la fila nueva en `movimientos`.
5. Borrar esa fila y darle de baja al código de prueba escribiendo `anulado` en
   la columna «estado» de la hoja `invitaciones`.

Si algo no arranca, ejecutar **`revisar()`** en el editor de Apps Script: no toca
nada y cuenta en castellano qué encontró y qué falta.

---

## Actualizar el servicio más adelante

Cuando cambie `Code.gs`:

**Implementar → Administrar implementaciones → ✏ (editar) → Versión: Nueva
versión → Implementar.**

Así la URL `/exec` **no cambia**. Si en cambio se hace una *implementación
nueva*, sale una URL distinta y hay que actualizarla en `sincro.js` y subir el
número de caché del service worker.
