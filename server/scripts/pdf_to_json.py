"""
Extrae tablas de un PDF usando pdfplumber con posicionamiento de palabras.
Uso: python pdf_to_json.py <ruta_pdf>
Salida: JSON con { headers: string[], rows: string[][] }
"""
import sys
import json
import re
import tempfile
import os
import pdfplumber


# Patrones de texto de pie de página / encabezados repetidos que deben ignorarse
PAGE_FOOTER_PATTERNS = [
    re.compile(r"^p[aá]gina\s*\d+\s*de\s*\d+$", re.IGNORECASE),
    re.compile(r"^\d+\s*de\s*\d+$"),  # "1 de 2"
    re.compile(r"^p[aá]g\.?\s*\d+", re.IGNORECASE),  # "Pág 1", "Pag. 2"
    re.compile(r"^p[aá]gina:?\s*\d+$", re.IGNORECASE),  # "PÁGINA: 1", "PÁGINA 3"
]

# Marcadores que identifican líneas de pie de página genéricas (contacto, legal, URLs)
FOOTER_TEXT_MARKERS = [
    "www.", "defensor", "dcf:", "marca registrada",
    "canales de atenci", "servicio al cliente", "centro de ayuda",
    "correo electr", "horario de",
]


def is_footer_row(words: list[dict]) -> bool:
    """Determina si un grupo de palabras es un pie de página."""
    text = " ".join(w["text"] for w in words).strip()
    for pattern in PAGE_FOOTER_PATTERNS:
        if pattern.search(text):
            return True
    # Detectar líneas de contacto/legal/URLs que aparecen al pie de cada página
    text_lower = text.lower()
    if any(marker in text_lower for marker in FOOTER_TEXT_MARKERS):
        return True
    return False


def open_pdf(pdf_path: str):
    """Abre un PDF, descifrándolo con pikepdf si está encriptado."""
    try:
        return pdfplumber.open(pdf_path), None
    except Exception:
        import pikepdf
        tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
        tmp_path = tmp.name
        tmp.close()
        try:
            with pikepdf.open(pdf_path, password='') as encrypted:
                encrypted.save(tmp_path)
            return pdfplumber.open(tmp_path), tmp_path
        except Exception:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            raise ValueError(
                "El PDF está protegido con contraseña. "
                "Por favor quita la contraseña del PDF antes de subirlo."
            )


def extract_tables(pdf_path: str) -> dict:
    pdf, tmp_path = open_pdf(pdf_path)
    try:
        return _extract_tables_from_pdf(pdf)
    finally:
        pdf.close()
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _extract_tables_from_pdf(pdf) -> dict:
    all_words = []
    for page in pdf.pages:
        words = page.extract_words(keep_blank_chars=True, y_tolerance=3)
        page_offset = page.page_number * 10000

        # Agrupar palabras de esta página por Y para detectar pies de página
        page_row_groups = group_by_y(
            [{"text": w["text"], "x0": w["x0"], "x1": w["x1"], "top": w["top"]}
             for w in words],
            tolerance=5
        )

        # Identificar Y positions que son pies de página
        footer_ys = set()
        for y, row_words in page_row_groups.items():
            if is_footer_row(row_words):
                footer_ys.add(y)

        for w in words:
            # Saltar palabras que pertenecen a filas de pie de página
            skip = False
            for fy in footer_ys:
                if abs(w["top"] - fy) <= 5:
                    skip = True
                    break
            if skip:
                continue

            all_words.append({
                "text": w["text"],
                "x0": w["x0"],
                "x1": w["x1"],
                "top": w["top"] + page_offset,
            })

    if not all_words:
        return {"headers": [], "rows": [], "totalRows": 0}

    # Paso 1: Detectar la fila de headers
    header_keywords = ["fecha", "descripci", "valor", "monto", "referencia",
                       "sucursal", "documento", "docum", "oficina",
                       "debito", "débito", "credito",
                       "crédito", "concepto", "detalle", "amount", "date"]

    # Agrupar palabras por Y (fila)
    row_groups = group_by_y(all_words, tolerance=5)
    sorted_ys = sorted(row_groups.keys())

    # Buscar la fila de encabezados: la que tenga MÁS keywords (mínimo 2)
    # Priorizar filas con "fecha" (toda tabla transaccional tiene fecha)
    header_y = None
    header_words = []
    best_score = 0
    for y in sorted_ys:
        words_in_row = row_groups[y]
        text_combined = " ".join(w["text"] for w in words_in_row).lower()
        keyword_count = sum(1 for kw in header_keywords if kw in text_combined)
        if keyword_count < 2:
            continue
        # Bonus si contiene "fecha" (columna casi obligatoria en tablas transaccionales)
        has_date = any(kw in text_combined for kw in ["fecha", "date"])
        score = keyword_count + (10 if has_date else 0)
        if score > best_score:
            best_score = score
            header_y = y
            header_words = sorted(words_in_row, key=lambda w: w["x0"])

    if not header_words:
        # No se encontraron headers, usar enfoque de texto plano
        return extract_fallback(row_groups, sorted_ys)

    # Paso 2: Definir los límites de cada columna a partir de los headers
    # Usar punto medio entre el fin del header actual y el inicio del siguiente
    # para evitar que datos desplazados caigan en la columna equivocada
    columns = []
    for i, hw in enumerate(header_words):
        col_start = hw["x0"]
        if i + 1 < len(header_words):
            col_end = (hw["x1"] + header_words[i + 1]["x0"]) / 2
        else:
            col_end = 9999
        columns.append({
            "name": hw["text"],
            "x_start": col_start,
            "x_end": col_end,
        })

    headers = [c["name"] for c in columns]
    num_cols = len(columns)

    # Paso 3: Extraer las filas de datos (después del header)
    # Agrupar las filas de datos por transacción (cada transacción empieza con una fecha)
    data_ys = [y for y in sorted_ys if y > header_y]

    transactions: list[list[str]] = []
    current_cells: list[str] = [""] * num_cols
    prev_y: float | None = None

    for y in data_ys:
        words_in_row = sorted(row_groups[y], key=lambda w: w["x0"])

        # Verificar si esta fila tiene contenido en la primera columna
        # (indica nueva fila de datos, no continuación de texto de la anterior)
        first_col_limit = columns[0]["x_end"] + 5 if len(columns) > 1 else columns[0]["x_end"] + 20
        first_col_words = [w for w in words_in_row if w["x0"] < first_col_limit]
        is_new_row = len(first_col_words) > 0

        # Salto de página: si el gap Y es enorme (>50px normal = ~5 filas),
        # forzar nueva fila para no fusionar contenido entre páginas
        if not is_new_row and prev_y is not None and (y - prev_y) > 50:
            is_new_row = True

        # Filas de resumen/totales que no empiezan en la primera columna
        # deben tratarse como filas nuevas para no fusionarse con la anterior
        if not is_new_row:
            row_text = " ".join(w["text"] for w in words_in_row).lower()
            if any(kw in row_text for kw in ["total", "subtotal", "saldo anterior",
                                              "saldo final", "saldo inicial"]):
                is_new_row = True

        # Filas que abarcan 3+ columnas son transacciones separadas, no
        # continuaciones de descripción (ej: IMP/TRANS FINANC/ACUM MES con monto)
        if not is_new_row and any(c.strip() for c in current_cells):
            cols_hit = set()
            for w in words_in_row:
                wc = (w["x0"] + w["x1"]) / 2
                ci = assign_to_column(wc, columns)
                if ci is not None:
                    cols_hit.add(ci)
            if len(cols_hit) >= 3:
                is_new_row = True

        if is_new_row and any(c.strip() for c in current_cells):
            # Guardar fila anterior
            transactions.append([c.strip() for c in current_cells])
            current_cells = [""] * num_cols

        prev_y = y

        # Asignar cada palabra a su columna
        for w in words_in_row:
            word_center = (w["x0"] + w["x1"]) / 2
            col_idx = assign_to_column(word_center, columns)
            if col_idx is not None:
                if current_cells[col_idx]:
                    current_cells[col_idx] += " " + w["text"]
                else:
                    current_cells[col_idx] = w["text"]

    # Última transacción
    if any(c.strip() for c in current_cells):
        transactions.append([c.strip() for c in current_cells])

    # Heredar fecha de la fila anterior cuando una transacción no tiene fecha
    # (ej: "IMP/TRANS FINANC/ACUM MES" en extractos Colpatria)
    date_col = None
    for i, col in enumerate(columns):
        if any(kw in col["name"].lower() for kw in ["fecha", "date", "fec"]):
            date_col = i
            break
    if date_col is not None:
        prev_date = ""
        for tx in transactions:
            if tx[date_col].strip():
                prev_date = tx[date_col].strip()
            elif prev_date:
                tx[date_col] = prev_date

    # Palabras clave que indican filas de resumen/totales (no son transacciones)
    summary_keywords = [
        "total", "subtotal", "sub-total", "saldo anterior", "saldo final",
        "saldo inicial", "total movimiento", "total general", "gran total",
        "totales", "saldo disponible", "saldo a la fecha",
        "fin estado de cuenta", "estado de cuenta",
    ]

    # Texto normalizado de los headers para detectar repeticiones
    headers_lower = [h.lower().strip() for h in headers]

    # Filtrar filas no deseadas y limpiar residuos
    filtered = []
    for row in transactions:
        combined = " ".join(row).lower()
        # Descartar filas completas de paginación
        if "página" in combined and " de " in combined and len(combined) < 50:
            continue
        if re.search(r"p[aá]gina\s*\d+\s*de\s*\d+", combined):
            continue
        # Descartar filas de totales/resumen
        if any(kw in combined for kw in summary_keywords):
            continue
        if all(c == "" for c in row):
            continue
        # Descartar headers repetidos (salto de página)
        row_lower = [c.lower().strip().split()[0] if c.strip() else "" for c in row]
        if len(row_lower) == len(headers_lower) and all(
            rl == hl for rl, hl in zip(row_lower, headers_lower) if hl
        ):
            continue
        # Descartar encabezados de página repetidos de reportes contables
        page_header_markers = ["impreso por", "día y hora", "dia y hora",
                               "extractos de libros", "desde:", "hasta:"]
        if any(m in combined for m in page_header_markers):
            continue
        # Descartar filas tipo "Nit. 900230334  Pag: 2"
        if re.search(r"\bnit\.?\s+\d", combined):
            continue
        # Descartar filas de texto legal/informativo: celdas >120 chars sin monto numérico
        has_numeric = any(re.search(r"\d{2,}", c.replace(".", "").replace(",", ""))
                         for c in row if c.strip())
        max_cell_len = max((len(c) for c in row), default=0)
        if max_cell_len > 120 and not has_numeric:
            continue
        # Descartar filas tipo "EMPRESA / DETALLE DE CUENTA / Pag N"
        if "detalle de cuenta" in combined:
            continue
        # Descartar texto tipo footer de banco (canales de atención, defensoria, etc.)
        footer_markers = ["www.", "defensor", "marca registrada", "tasas de inter",
                          "canales de atenci", "chat personas", "servicio al cliente",
                          "centro de ayuda", "horario de", "correo electr"]
        if any(m in combined for m in footer_markers):
            continue
        # Descartar filas con pocas celdas no vacías y sin datos transaccionales
        non_empty = [c for c in row if c.strip()]
        if len(non_empty) <= 2 and not has_numeric:
            continue
        # Limpiar celdas individuales que tengan "Página X de Y" pegado al valor
        cleaned_row = []
        for cell in row:
            cell = re.sub(r"\s*[Pp][aá]gina\s*\d+\s*de\s*\d+\s*", "", cell).strip()
            cleaned_row.append(cell)
        filtered.append(cleaned_row)

    return {
        "headers": headers,
        "rows": filtered,
        "totalRows": len(filtered),
    }


def group_by_y(words: list[dict], tolerance: float = 5) -> dict[float, list[dict]]:
    """Agrupa palabras por posición Y con tolerancia."""
    groups: dict[float, list[dict]] = {}

    for w in words:
        y = w["top"]
        # Buscar un grupo existente cercano
        matched = False
        for gy in list(groups.keys()):
            if abs(y - gy) <= tolerance:
                groups[gy].append(w)
                matched = True
                break
        if not matched:
            groups[y] = [w]

    return groups


def assign_to_column(x_center: float, columns: list[dict]) -> int | None:
    """Asigna una posición X a la columna más cercana."""
    best_col = None
    best_dist = float("inf")

    for i, col in enumerate(columns):
        # Si el centro está dentro del rango de la columna
        if col["x_start"] - 10 <= x_center <= col["x_end"] + 10:
            dist = abs(x_center - (col["x_start"] + col["x_end"]) / 2)
            if dist < best_dist:
                best_dist = dist
                best_col = i

    # Si no encaja en ninguna, asignar a la más cercana
    if best_col is None:
        for i, col in enumerate(columns):
            dist = min(abs(x_center - col["x_start"]), abs(x_center - col["x_end"]))
            if dist < best_dist:
                best_dist = dist
                best_col = i

    return best_col


def extract_fallback(row_groups: dict, sorted_ys: list) -> dict:
    """Fallback: si no se detectan headers, devolver como texto separado por espacios."""
    all_rows = []
    for y in sorted_ys:
        words = sorted(row_groups[y], key=lambda w: w["x0"])
        line = " ".join(w["text"] for w in words)
        cells = [c.strip() for c in line.split("  ") if c.strip()]
        if len(cells) >= 2:
            all_rows.append(cells)

    if not all_rows:
        return {"headers": [], "rows": [], "totalRows": 0}

    max_cols = max(len(r) for r in all_rows)
    headers = [f"Columna {i+1}" for i in range(max_cols)]
    normalized = []
    for row in all_rows:
        if len(row) < max_cols:
            row = row + [""] * (max_cols - len(row))
        elif len(row) > max_cols:
            row = row[:max_cols]
        normalized.append(row)

    return {
        "headers": headers,
        "rows": normalized,
        "totalRows": len(normalized),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Uso: python pdf_to_json.py <ruta_pdf>"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    try:
        result = extract_tables(pdf_path)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)
