# -*- coding: utf-8 -*-
"""
Busca llamadas a funciones que no existen.

Se escribio por un bug de verdad: egresos.js llamaba a leerDelFormulario(), que
vive en ingresos.js y aca no existe. No se ve leyendo el archivo, no lo marca el
navegador al cargar, y no revienta hasta que alguien toca ese control. Estuvo
suelto vaya a saber cuanto. Esto lo encuentra en un segundo.

Correr:  python pruebas/llamadas.py
Tiene que decir "sospechosas: 0". Si dice otra cosa, mirar cada una: puede ser
un falso positivo, pero puede ser una pantalla que revienta al tocar un boton.

Es deliberadamente generoso con lo que considera definido -funcion, const, let,
var, parametro, propiedad de objeto- y saca comentarios y textos antes de
mirar. Prefiere callarse antes que dar cien falsos positivos que nadie lee.
"""
import io, re, glob, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(os.path.dirname(AQUI), "docs", "js")

NL = chr(10)
BS = chr(92)

GLOBALES = set((
    "async of in instanceof case throw try finally yield "
    "if for while switch catch return typeof function do else new delete void await "
    "Array Object String Number Boolean Math JSON Date RegExp Promise Error Map Set "
    "parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent "
    "setTimeout setInterval clearTimeout clearInterval requestAnimationFrame "
    "alert confirm fetch console document window navigator localStorage indexedDB "
    "Intl Uint8Array Int32Array Float64Array ArrayBuffer DataView Blob File FormData "
    "URL URLSearchParams Event MouseEvent CustomEvent Image Notification "
    "structuredClone btoa atob queueMicrotask crypto TextEncoder TextDecoder "
    "AbortController"
).split())


def sinTextoNiComentarios(s):
    s = re.sub(r"/\*.*?\*/", " ", s, flags=re.S)
    s = re.sub(r"(?m)//.*$", " ", s)
    # Adentro de unas comillas hay prosa, no codigo. Sin esto, "no acepto el
    # trabajo (codigo" parece una llamada a trabajo().
    s = re.sub(r'"(?:\\.|[^"\\\n])*"', ' "" ', s)
    s = re.sub(r"'(?:\\.|[^'\\\n])*'", " '' ", s)
    # Las plantillas con acento invertido NO se tocan: adentro va HTML mezclado
    # con codigo de verdad en ${...}, y cualquier intento de sacarlas con una
    # expresion regular termina comiendose las funciones que hay en el medio.
    return s


def definidos(s):
    d = set()
    d |= set(re.findall(r"function\s+([A-Za-z_$]\w*)", s))
    # Declaraciones, incluidas las de a varias:  let a = 1, b = 2, c;
    for bloque in re.findall(r"(?:const|let|var)\s+([^;\n]*)", s):
        d |= set(re.findall(r"([A-Za-z_$]\w*)\s*(?==|,|;|$)", bloque))
    # Desarmado:  const { a, b, c } = ...
    for bloque in re.findall(r"(?:const|let|var)\s*\{([^}]*)\}\s*=", s):
        d |= set(re.findall(r"[A-Za-z_$]\w*", bloque))
    # Parametros, de funcion y de flecha
    for bloque in re.findall(r"function\s*[A-Za-z_$]*\w*\s*\(([^)]*)\)", s):
        d |= set(re.findall(r"[A-Za-z_$]\w*", bloque))
    for bloque in re.findall(r"\(([^)]*)\)\s*=>", s):
        d |= set(re.findall(r"[A-Za-z_$]\w*", bloque))
    d |= set(re.findall(r"([A-Za-z_$]\w*)\s*=>", s))
    # Propiedades que son funciones:  nombre: (a) => ...
    d |= set(re.findall(r"([A-Za-z_$]\w*)\s*:\s*(?:async\s*)?(?:function|\()", s))
    return d


def llamadas(s):
    return set(m.group(1) for m in re.finditer(r"(?<![.\w$])([A-Za-z_$]\w*)\s*\(", s))


def main():
    print("Buscando llamadas a funciones que no existen." + NL)
    total = 0
    for ruta in sorted(glob.glob(os.path.join(D, "*.js"))):
        s = sinTextoNiComentarios(io.open(ruta, encoding="utf-8").read())
        faltan = sorted(llamadas(s) - definidos(s) - GLOBALES)
        if faltan:
            total += len(faltan)
            print("  %-16s %s" % (os.path.basename(ruta), ", ".join(faltan)))
    print(NL + "sospechosas: %d" % total)
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
