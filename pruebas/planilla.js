// ==========================================================================
// Banco de pruebas: una planilla de Google de mentira
//
// Implementa lo poco de SpreadsheetApp que usa Code.gs, guardando las hojas en
// memoria como matrices. Alcanza para correr sincronizar() de verdad, con su
// leerFilas, su fusionar y su escribirFilas, sin tocar Google.
//
// La idea es poder reproducir un bug de sincronización de forma determinista y
// después demostrar que quedó arreglado.
// ==========================================================================

(function () {
  function Hoja(nombre) {
    this.nombre = nombre;
    this.filas = [];        // matriz de valores, la 0 es el encabezado
    this.maxFilas = 1000;
    this.oculta = false;
  }
  Hoja.prototype.getName = function () { return this.nombre; };
  Hoja.prototype.getMaxRows = function () { return this.maxFilas; };
  Hoja.prototype.insertRowsAfter = function (_d, cuantas) { this.maxFilas += cuantas; };
  Hoja.prototype.getLastRow = function () {
    for (var i = this.filas.length - 1; i >= 0; i--) {
      var f = this.filas[i] || [];
      for (var j = 0; j < f.length; j++) {
        if (f[j] !== "" && f[j] != null) return i + 1;
      }
    }
    return 0;
  };
  Hoja.prototype.getLastColumn = function () {
    return (this.filas[0] || []).length;
  };
  Hoja.prototype.appendRow = function (fila) { this.filas.push(fila.slice()); };
  Hoja.prototype.hideSheet = function () { this.oculta = true; };
  Hoja.prototype.setTabColor = function () { return this; };
  Hoja.prototype.setFrozenRows = function () { return this; };
  Hoja.prototype.getBandings = function () { return [{}]; };   // ya tiene, no reaplicar
  Hoja.prototype.setColumnWidth = function () { return this; };
  Hoja.prototype.hideColumns = function () { return this; };
  Hoja.prototype.getDataRange = function () {
    var self = this;
    return { getValues: function () { return self.filas.map(function (f) { return f.slice(); }); } };
  };
  Hoja.prototype.getRange = function (fila, col, nFilas, nCols) {
    var self = this;
    if (typeof fila === "string") {                    // notación A1, solo para resumen
      return rangoTonto();
    }
    nFilas = nFilas || 1;
    nCols = nCols || 1;
    if (fila + nFilas - 1 > self.maxFilas) {
      throw new Error("Those rows are out of bounds. (hoja " + self.nombre + ")");
    }
    return {
      getValues: function () {
        var out = [];
        for (var i = 0; i < nFilas; i++) {
          var origen = self.filas[fila - 1 + i] || [];
          var linea = [];
          for (var j = 0; j < nCols; j++) linea.push(origen[col - 1 + j] === undefined ? "" : origen[col - 1 + j]);
          out.push(linea);
        }
        return out;
      },
      getValue: function () { return (self.filas[fila - 1] || [])[col - 1]; },
      setValues: function (v) {
        for (var i = 0; i < v.length; i++) {
          var destino = self.filas[fila - 1 + i] || (self.filas[fila - 1 + i] = []);
          for (var j = 0; j < v[i].length; j++) destino[col - 1 + j] = v[i][j];
        }
        return this;
      },
      setValue: function (x) {
        var destino = self.filas[fila - 1] || (self.filas[fila - 1] = []);
        destino[col - 1] = x;
        return this;
      },
      clearContent: function () {
        for (var i = 0; i < nFilas; i++) {
          var destino = self.filas[fila - 1 + i];
          if (!destino) continue;
          for (var j = 0; j < nCols; j++) destino[col - 1 + j] = "";
        }
        return this;
      },
      setBackground: rangoTonto, setFontColor: rangoTonto, setFontWeight: rangoTonto,
      setFontSize: rangoTonto, setNumberFormat: rangoTonto, setDataValidation: rangoTonto,
      setHorizontalAlignment: rangoTonto, merge: rangoTonto,
      applyRowBanding: function () {
        return { setHeaderRowColor: rangoTonto, setFirstRowColor: rangoTonto, setSecondRowColor: rangoTonto };
      },
    };
    function rangoTonto() { return this; }
  };

  function Libro() { this.hojas = {}; this.orden = []; }
  Libro.prototype.getName = function () { return "Cocina Viva · Gestión (de mentira)"; };
  Libro.prototype.getSheetByName = function (n) { return this.hojas[n] || null; };
  Libro.prototype.getSheets = function () {
    var self = this;
    return this.orden.map(function (n) { return self.hojas[n]; });
  };
  Libro.prototype.insertSheet = function (n) {
    var h = new Hoja(n);
    this.hojas[n] = h;
    this.orden.push(n);
    return h;
  };
  Libro.prototype.deleteSheet = function (h) {
    delete this.hojas[h.nombre];
    this.orden = this.orden.filter(function (n) { return n !== h.nombre; });
  };
  Libro.prototype.getRange = function () { return {}; };

  var libro = new Libro();
  var propiedades = {};

  // --- lo que Code.gs espera encontrar en el ambiente de Apps Script ---
  window.SpreadsheetApp = {
    getActive: function () { return libro; },
    newDataValidation: function () {
      var v = {
        requireValueInRange: function () { return v; },
        requireValueInList: function () { return v; },
        setAllowInvalid: function () { return v; },
        build: function () { return {}; },
      };
      return v;
    },
  };
  window.PropertiesService = {
    getDocumentProperties: function () {
      return {
        getProperty: function (k) { return propiedades[k] || null; },
        setProperty: function (k, v) { propiedades[k] = v; },
        getProperties: function () { return propiedades; },
      };
    },
  };
  window.LockService = {
    getScriptLock: function () {
      return { waitLock: function () {}, releaseLock: function () {} };
    },
  };
  window.Utilities = {
    formatDate: function (d) {
      var dos = function (n) { return ("0" + n).slice(-2); };
      return d.getFullYear() + "-" + dos(d.getMonth() + 1) + "-" + dos(d.getDate());
    },
    computeDigest: function (_a, texto) {
      var h = 0, out = [];
      for (var i = 0; i < String(texto).length; i++) h = (h * 31 + String(texto).charCodeAt(i)) | 0;
      for (var j = 0; j < 32; j++) out.push((h >> (j % 24)) & 0xff);
      return out;
    },
    Charset: { UTF_8: 1 },
    DigestAlgorithm: { SHA_256: 1 },
  };
  window.Session = { getScriptTimeZone: function () { return "America/Argentina/Buenos_Aires"; } };
  window.Logger = { log: function () {} };
  window.ContentService = {
    createTextOutput: function (t) { return { texto: t, setMimeType: function () { return this; } }; },
    MimeType: { JSON: 1 },
  };

  window.__libro = libro;
})();
