"""
Actualiza el historico de VCP (Valor de Cuotaparte) de un conjunto fijo de FCI,
bajando todos los dias la planilla publica de CAFCI y agregando las filas nuevas
a un archivo historico.csv (formato largo: fondo, fecha, vcp).

Pensado para correr una vez por dia (por ejemplo via GitHub Actions con un
cron job), y que el historico.csv resultante alimente un dashboard aparte.

FUENTE DE DATOS
------------------------------------------------
https://api.pub.cafci.org.ar/pb_get
Es la "descarga de la ultima planilla diaria" que ofrece CAFCI en su home
(https://www.cafci.org.ar/), publica y sin necesidad de login. Trae la info
del ultimo dia habil para TODOS los fondos del mercado.

Estructura del archivo (confirmada por la usuaria):
    Columna A: nombre del fondo + clase (ej. "Gainvest Renta Fija Dolares - Clase A")
    Columna E: fecha del valor "Actual"
    Columna F: valor de cuotaparte "Actual" (VCP del dia mas reciente)
    Columna G: valor de cuotaparte del dia habil anterior (columna de
               comparacion). Su fecha esta en la fila de sub-encabezados
               (fila 9, 0-indexada como 8), no en cada fila de datos.

IMPORTANTE -- correccion retroactiva:
    Las administradoras a veces recalculan el VCP de un dia despues de
    haberlo publicado (la planilla del dia siguiente trae, en la columna
    de comparacion, el valor YA CORREGIDO del dia anterior). Por eso el
    script no solo guarda el valor "Actual" del dia de hoy: tambien vuelve
    a guardar el valor de la columna de comparacion, pisando lo que
    hubiera guardado antes para esa fecha si cambio.

Como la fuente no esta documentada oficialmente, si CAFCI cambia el formato
el script puede necesitar un ajuste. Por eso, si un fondo esperado no aparece
en la planilla del dia, se imprime un aviso en vez de fallar en silencio.

Requisitos:
    pip install pandas openpyxl requests
"""

import re
import unicodedata
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

# ------------------------------------------------------------------
# CONFIGURACION
# ------------------------------------------------------------------

PLANILLA_URL = "https://api.pub.cafci.org.ar/pb_get"

# Nombres exactos tal como aparecen en la planilla de CAFCI (columna A)
FONDOS_DE_INTERES = [
    "Fima Premium - Clase A",
    "Gainvest FF - Clase A",
    "Gainvest Global I - Clase A",
    "Gainvest Renta Fija Dolares - Clase A",
    "Galileo Ahorro Plus - Clase A",
    "Galileo Event Driven - Clase A",
    "Galileo Income - Clase B",
    "Galileo Income - Clase A",
    "Galileo Fixed Income - Clase B",
    "Galileo Fixed Income - Clase A",
    "Galileo Multi Strategy - Clase A",
    "Parakeet MM Investments Fund - Clase B",
    "Parakeet MM Investments Fund - Clase A",
    "Max Dinamico II - Clase A",
    "Gainvest Balanceado - Clase A",
    "Parakeet Global - Clase A",
]

# Columnas en la planilla (0-indexado)
COL_NOMBRE = 0
COL_FECHA_ACTUAL = 4
COL_VCP_ACTUAL = 5
COL_VCP_COMPARACION = 6  # dia habil anterior -- puede venir corregido

# Fila (0-indexada) donde esta el sub-encabezado con la fecha de la
# columna de comparacion (ej. "07/07/26")
FILA_SUBENCABEZADO = 8

HISTORICO_CSV = Path("historico.csv")  # se crea/actualiza en la carpeta del repo


# ------------------------------------------------------------------
# FUNCIONES
# ------------------------------------------------------------------

def normalizar(texto: str) -> str:
    """Baja a minuscula, saca tildes y espacios de mas, para poder comparar
    nombres de fondos aunque haya pequenas diferencias de formato."""
    if not isinstance(texto, str):
        return ""
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    texto = texto.lower().strip()
    texto = re.sub(r"\s+", " ", texto)
    return texto


def descargar_planilla() -> pd.DataFrame:
    resp = requests.get(PLANILLA_URL, timeout=30)
    resp.raise_for_status()

    tmp_path = Path("planilla_diaria_temp.xlsx")
    tmp_path.write_bytes(resp.content)

    df = pd.read_excel(tmp_path, header=None)

    tmp_path.unlink(missing_ok=True)
    return df


def obtener_fecha_comparacion(df: pd.DataFrame):
    """Lee la fecha de la columna de comparacion desde la fila de
    sub-encabezados (ej. '07/07/26'). Devuelve None si no se pudo leer."""
    try:
        valor = df.iloc[FILA_SUBENCABEZADO, COL_VCP_COMPARACION]
        if pd.isna(valor):
            return None
        # Puede venir como texto "07/07/26" o ya como fecha
        if isinstance(valor, str):
            return pd.to_datetime(valor, format="%d/%m/%y", errors="coerce")
        return pd.to_datetime(valor, errors="coerce")
    except Exception as e:
        print(f"AVISO: no se pudo leer la fecha de la columna de comparacion: {e}")
        return None


def extraer_fondos_de_interes(df: pd.DataFrame) -> pd.DataFrame:
    objetivo_normalizado = {normalizar(n): n for n in FONDOS_DE_INTERES}
    fecha_comparacion = obtener_fecha_comparacion(df)

    filas = []
    encontrados = set()

    for _, row in df.iterrows():
        nombre_crudo = row[COL_NOMBRE]
        nombre_norm = normalizar(nombre_crudo)
        if nombre_norm not in objetivo_normalizado:
            continue

        nombre_original = objetivo_normalizado[nombre_norm]
        encontrados.add(nombre_original)

        # Valor "Actual" (el dato principal del dia)
        valor_actual = row[COL_VCP_ACTUAL]
        if pd.notna(valor_actual):
            filas.append({
                "fondo": nombre_original,
                "fecha": row[COL_FECHA_ACTUAL],
                "vcp": valor_actual / 1000,
            })

        # Valor de comparacion (dia habil anterior) -- se vuelve a guardar
        # siempre, para pisar el valor viejo si la administradora lo
        # recalculo entre ayer y hoy.
        if fecha_comparacion is not None:
            valor_comparacion = row[COL_VCP_COMPARACION]
            if pd.notna(valor_comparacion):
                filas.append({
                    "fondo": nombre_original,
                    "fecha": fecha_comparacion,
                    "vcp": valor_comparacion / 1000,
                })

    faltantes = set(FONDOS_DE_INTERES) - encontrados
    if faltantes:
        print("AVISO: no se encontraron estos fondos en la planilla de hoy:")
        for f in sorted(faltantes):
            print(f"  - {f}")
        print("(puede ser que ese fondo no haya operado ese dia, o que el "
              "nombre en la planilla cambio un poco - revisar manualmente)")

    return pd.DataFrame(filas)


def actualizar_historico(nuevas_filas: pd.DataFrame):
    if nuevas_filas.empty:
        print("No se encontraron filas de los fondos de interes en la planilla de hoy. No se actualiza nada.")
        return

    nuevas_filas["fecha"] = pd.to_datetime(nuevas_filas["fecha"], format="mixed", dayfirst=True).dt.date

    if HISTORICO_CSV.exists():
        historico = pd.read_csv(HISTORICO_CSV, parse_dates=["fecha"])
        historico["fecha"] = historico["fecha"].dt.date
    else:
        historico = pd.DataFrame(columns=["fondo", "fecha", "vcp"])

    combinado = pd.concat([historico, nuevas_filas], ignore_index=True)
    # keep="last" es la clave: si ya existia una fila para (fondo, fecha),
    # la de "nuevas_filas" (agregada despues) gana -- asi se aplican las
    # correcciones retroactivas de la columna de comparacion.
    combinado = combinado.drop_duplicates(subset=["fondo", "fecha"], keep="last")
    combinado = combinado.sort_values(["fondo", "fecha"])

    combinado["vcp"] = combinado["vcp"].round(6)
    combinado.to_csv(HISTORICO_CSV, index=False)

    agregadas = len(combinado) - len(historico)
    print(f"Historico actualizado: {HISTORICO_CSV} ({agregadas} fila(s) nueva(s) netas, {len(combinado)} en total)")


if __name__ == "__main__":
    print(f"Corriendo actualizacion - {datetime.now().isoformat()}")
    df_planilla = descargar_planilla()
    print(f"Planilla descargada: {len(df_planilla)} filas totales")

    df_interes = extraer_fondos_de_interes(df_planilla)
    print(f"Filas de fondos de interes encontradas hoy (actual + comparacion): {len(df_interes)}")
    if not df_interes.empty:
        print("Fechas encontradas:", sorted(df_interes["fecha"].astype(str).unique()))

    actualizar_historico(df_interes)
