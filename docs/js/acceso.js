// ==========================================================================
// Cocina Viva — acceso del teléfono
//
// La dirección del servicio de la planilla va escrita en el código, que es
// público. Sin nada más, cualquiera que la encontrara podría leer las ventas
// del emprendimiento o inventar filas. En MonAgric se comprobó ejecutándolo:
// no era teoría.
//
// Por eso cada teléfono canjea UNA VEZ un código, y recibe a cambio una
// credencial larga y al azar que queda guardada en ese aparato. Desde ahí,
// cada sincronización viaja con ella.
//
// Del lado de la planilla se guarda solo la huella SHA-256 de la credencial:
// alcanza para comprobarla, pero no permite reconstruirla.
//
// Si un teléfono se pierde, se escribe "no" en la columna "activo" de su fila
// en la hoja "dispositivos" y deja de poder entrar, sin afectar a nadie más.
// ==========================================================================

window.Acceso = (function () {
  const LS = {
    dispositivo: "cocinaviva_dispositivo",
    credencial: "cocinaviva_credencial",
    persona: "cocinaviva_persona",
  };

  const leer = (clave) => {
    try { return localStorage.getItem(clave) || ""; } catch (e) { return ""; }
  };

  const escribir = (clave, valor) => {
    try { localStorage.setItem(clave, valor); } catch (e) { /* modo incógnito */ }
  };

  // Identificador de este teléfono. Se crea una sola vez y no cambia: sirve
  // para ver desde cuántos aparatos se está cargando y para dar de baja uno
  // solo. Se puede inventar, así que sirve para DETECTAR cosas raras, no para
  // impedirlas: la que impide es la credencial.
  function dispositivo() {
    let id = leer(LS.dispositivo);
    if (!id) {
      id = "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      escribir(LS.dispositivo, id);
    }
    return id;
  }

  const credencial = () => leer(LS.credencial);
  const tieneAcceso = () => !!credencial();
  const persona = () => leer(LS.persona);

  function guardarAcceso(cred, quien) {
    escribir(LS.credencial, String(cred || ""));
    if (quien) escribir(LS.persona, String(quien));
  }

  // Cuando el servicio contesta que este teléfono ya no tiene permiso, se
  // borra la credencial pero NUNCA lo que está cargado: una venta anotada no
  // se pierde por un problema de acceso.
  const borrarCredencial = () => escribir(LS.credencial, "");

  return { dispositivo, credencial, tieneAcceso, persona, guardarAcceso, borrarCredencial };
})();
