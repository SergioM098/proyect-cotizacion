"""
Extrae tablas de un PDF usando pdfplumber con posicionamiento de palabras.
Uso: python pdf_to_json.py <ruta_pdf>
Salida: JSON con { headers: string[], rows: string[][] }
"""
import sys
import json
import pdfplumber


def extract_tables(pdf_path: str) -> dict:
    with pdfplumber.open(pdf_path) as pdf:
        all_words = []
        for page in pdf.pages:
            words = page.extract_words(keep_blank_chars=True, y_tolerance=3)
            # Agregar offset de página para que Y sea único
            page_offset = page.page_number * 10000
            for w in words:
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
                       "sucursal", "documento", "debito", "débito", "credito",
                       "crédito", "concepto", "detalle", "amount", "date"]

    # Agrupar palabras por Y (fila)
    row_groups = group_by_y(all_words, tolerance=5)
    sorted_ys = sorted(row_groups.keys())

    # Buscar la fila de encabezados
    header_y = None
    header_words = []
    for y in sorted_ys:
        words_in_row = row_groups[y]
        text_combined = " ".join(w["text"] for w in words_in_row).lower()
        keyword_count = sum(1 for kw in header_keywords if kw in text_combined)
        if keyword_count >= 2:
            header_y = y
            header_words = sorted(words_in_row, key=lambda w: w["x0"])
            break

    if not header_words:
        # No se encontraron headers, usar enfoque de texto plano
        return extract_fallback(row_groups, sorted_ys)

    # Paso 2: Definir los límites de cada columna a partir de los headers
    columns = []
    for i, hw in enumerate(header_words):
        col_start = hw["x0"]
        # El fin de la columna es el inicio de la siguiente (o infinito para la última)
        col_end = header_words[i + 1]["x0"] - 1 if i + 1 < len(header_words) else 9999
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

    for y in data_ys:
        words_in_row = sorted(row_groups[y], key=lambda w: w["x0"])

        # Verificar si esta fila tiene contenido en la primera columna
        # (indica nueva fila de datos, no continuación de texto de la anterior)
        first_col_limit = columns[0]["x_end"] + 5 if len(columns) > 1 else columns[0]["x_end"] + 20
        first_col_words = [w for w in words_in_row if w["x0"] < first_col_limit]
        is_new_row = len(first_col_words) > 0

        if is_new_row and any(c.strip() for c in current_cells):
            # Guardar fila anterior
            transactions.append([c.strip() for c in current_cells])
            current_cells = [""] * num_cols

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

    # Filtrar filas de "Página X de Y" y filas vacías
    filtered = []
    for row in transactions:
        combined = " ".join(row).lower()
        if "página" in combined and " de " in combined and len(combined) < 30:
            continue
        if all(c == "" for c in row):
            continue
        filtered.append(row)

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
