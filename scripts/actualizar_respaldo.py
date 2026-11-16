"""Baja el catálogo publicado del Sheet y regenera catalogo-respaldo.js.

Lo corre GitHub una vez por día (ver .github/workflows/actualizar-respaldo.yml).
También se puede correr a mano:  python scripts/actualizar_respaldo.py
"""
import json
import pathlib
import urllib.request

CSV_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vQNuXYt6_YuWe5-LYQ01ZZwf5EnLYTA2pSgpDP7eFhSVclMC9QmAK9DgTQMvBPw71Uq4gEdIrT4zQ2v"
    "/pub?gid=4002&single=true&output=csv"
)
DESTINO = pathlib.Path(__file__).resolve().parent.parent / "catalogo-respaldo.js"


def main() -> None:
    with urllib.request.urlopen(CSV_URL, timeout=30) as resp:
        texto = resp.read().decode("utf-8")
    # Si Google devuelve algo raro (una página de error), no se pisa el respaldo bueno.
    if "Categoría" not in texto or "ID opción" not in texto:
        raise SystemExit("El CSV no tiene el formato esperado; no se actualiza el respaldo.")
    contenido = (
        "/* Copia de respaldo del catálogo: se muestra al instante y se reemplaza "
        "cuando responde el Sheet. Se regenera sola; no editar a mano. */\n"
        "window.CATALOGO_RESPALDO = " + json.dumps(texto, ensure_ascii=False) + ";\n"
    )
    DESTINO.write_text(contenido, encoding="utf-8")
    print(f"Respaldo actualizado: {DESTINO.name} ({len(texto)} caracteres)")


if __name__ == "__main__":
    main()
