"""
Actualiza el historico de dolar MEP y CCL implicitos (via AL30/AL30D/AL30C)
bajando el precio mas reciente de la API de PPI, y agregandolo a
mep_ccl_historico.csv.

Pensado para correr una vez por dia via GitHub Actions, separado del script
de actualizacion de fondos (actualizar_historico_cafci.py).

Requiere: pip install ppi_client pandas

Las credenciales de PPI se leen de variables de entorno (nunca hardcodeadas
en el codigo), para poder usarlas como GitHub Secrets sin exponerlas en el
repo publico:
    PPI_API_KEY_PUBLICA
    PPI_API_KEY_PRIVADA
"""

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
from ppi_client.ppi import PPI

MEP_CCL_CSV = Path("mep_ccl_historico.csv")

# Ventana de busqueda: bajamos los ultimos 10 dias y nos quedamos con el mas
# reciente disponible de cada instrumento, asi cubrimos fines de semana y
# feriados sin que el script falle si "hoy" todavia no tiene dato.
DIAS_VENTANA = 10


def obtener_ultimo_precio(ppi, ticker):
    hasta = datetime.now()
    desde = hasta - timedelta(days=DIAS_VENTANA)
    datos = ppi.marketdata.search(ticker, "BONOS", "INMEDIATA", desde, hasta)
    if not datos:
        return None, None
    ultimo = datos[-1]
    fecha = pd.to_datetime(ultimo["date"]).date().isoformat()
    precio = float(ultimo["price"])
    return fecha, precio


def main():
    api_key_publica = os.environ.get("PPI_API_KEY_PUBLICA")
    api_key_privada = os.environ.get("PPI_API_KEY_PRIVADA")

    if not api_key_publica or not api_key_privada:
        print("ERROR: faltan las variables de entorno PPI_API_KEY_PUBLICA / PPI_API_KEY_PRIVADA")
        sys.exit(1)

    print(f"Corriendo actualizacion MEP/CCL - {datetime.now().isoformat()}")

    ppi = PPI(sandbox=False)
    ppi.account.login_api(api_key_publica, api_key_privada)

    fecha_al30, precio_al30 = obtener_ultimo_precio(ppi, "AL30")
    fecha_al30d, precio_al30d = obtener_ultimo_precio(ppi, "AL30D")
    fecha_al30c, precio_al30c = obtener_ultimo_precio(ppi, "AL30C")

    print(f"AL30:  {fecha_al30} -> {precio_al30}")
    print(f"AL30D: {fecha_al30d} -> {precio_al30d}")
    print(f"AL30C: {fecha_al30c} -> {precio_al30c}")

    if None in (precio_al30, precio_al30d, precio_al30c):
        print("ERROR: no se pudo obtener alguno de los 3 precios. No se actualiza nada.")
        sys.exit(1)

    if not (fecha_al30 == fecha_al30d == fecha_al30c):
        print(f"AVISO: las fechas de los 3 instrumentos no coinciden "
              f"(AL30={fecha_al30}, AL30D={fecha_al30d}, AL30C={fecha_al30c}). "
              f"Se usa la fecha de AL30 igual.")

    fecha_final = fecha_al30
    mep_implicito = round(precio_al30 / precio_al30d, 4)
    ccl_implicito = round(precio_al30 / precio_al30c, 4)

    nueva_fila = pd.DataFrame([{
        "fecha": fecha_final,
        "al30_ars": precio_al30,
        "al30d_usd": precio_al30d,
        "al30c_usd": precio_al30c,
        "mep_implicito": mep_implicito,
        "ccl_implicito": ccl_implicito,
    }])

    if MEP_CCL_CSV.exists():
        historico = pd.read_csv(MEP_CCL_CSV)
    else:
        historico = pd.DataFrame(columns=nueva_fila.columns)

    combinado = pd.concat([historico, nueva_fila], ignore_index=True)
    combinado = combinado.drop_duplicates(subset=["fecha"], keep="last")
    combinado = combinado.sort_values("fecha")
    combinado.to_csv(MEP_CCL_CSV, index=False)

    agregadas = len(combinado) - len(historico)
    print(f"Historico MEP/CCL actualizado: {MEP_CCL_CSV} ({agregadas} fila(s) nueva(s), {len(combinado)} en total)")


if __name__ == "__main__":
    main()
