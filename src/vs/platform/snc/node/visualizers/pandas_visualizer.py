"""Pandas visualizer for Sculpt-n-Code."""

import html

# VS Code theme colors
BLUE = "#569cd6"
STRING = "#ce9178"
VALUE = "#b5cea8"
TYPE = "#4ec9b0"
GRAY = "#808080"

def safe_repr(value):
    try:
        return html.escape(repr(value))
    except Exception:
        return '<span style="color: #f44747;">[Error]</span>'

def span(text, color):
    return f'<span style="color: {color};">{text}</span>'

def table_cell(content, color=STRING, bg="#2d2d2d"):
    return f'<td style="border: 1px solid #444; padding: 2px; background: {bg}; color: {color};">{safe_repr(content)}</td>'

def table_header(content, color=STRING):
    return f'<th style="border: 1px solid #444; padding: 2px; background: #333; color: {color};">{safe_repr(content)}</th>'

def can_visualize(value):
    # Avoid importing pandas here to prevent heavy startup cost on every run.
    # Detect pandas objects by module/class name to keep this check O(1).
    try:
        cls = getattr(value, "__class__", None)
        mod = getattr(cls, "__module__", "")
        name = getattr(cls, "__name__", "")
        return mod.startswith("pandas") and name in ("DataFrame", "Series")
    except Exception:
        return False

def visualize(value):
    try:
        cls = getattr(value, "__class__", None)
        name = getattr(cls, "__name__", "")
        if name == "DataFrame":
            return _visualize_dataframe(value)
        elif name == "Series":
            return _visualize_series(value)
        else:
            return safe_repr(value)
    except Exception:
        return safe_repr(value)

def _visualize_series(series):
    name = series.name if series.name is not None else 'Series'
    name_display = f'"{safe_repr(name)}"'
    header = f'{span("Series", TYPE)} {span(name_display, STRING)} {span(f"({len(series)} rows, {series.dtype})", GRAY)}'

    if len(series) == 0:
        return f'{header} {span("[]", BLUE)}'

    if len(series) <= 6:
        elements = [f'{span(safe_repr(idx), VALUE)}: {span(safe_repr(val), STRING)}'
                   for idx, val in series.items()]
    else:
        elements = []
        for i in range(3):
            idx, val = series.index[i], series.iloc[i]
            elements.append(f'{span(safe_repr(idx), VALUE)}: {span(safe_repr(val), STRING)}')
        elements.append(span("...", GRAY))
        for i in range(-3, 0):
            idx, val = series.index[i], series.iloc[i]
            elements.append(f'{span(safe_repr(idx), VALUE)}: {span(safe_repr(val), STRING)}')

    return f'{header}<br>{"<br>".join(elements)}'

def _visualize_dataframe(df):
    rows, cols = df.shape
    header = f'{span("DataFrame", TYPE)} {span(f"({rows} rows × {cols} cols)", GRAY)}'

    if rows == 0 or cols == 0:
        return f'{header} {span("[empty]", BLUE)}'

    if rows <= 4 and cols <= 4:
        return _create_html_table(df, header)

    return _create_summary_view(df, header)

def _create_html_table(df, header):
    parts = [f'{header}<br><table style="border-collapse: collapse; font-size: 10px; font-family: monospace;">']

    parts.append('<tr>' + table_header("", VALUE))
    parts.extend(table_header(col, STRING) for col in df.columns)
    parts.append('</tr>')

    for idx, row in df.iterrows():
        parts.append('<tr>' + table_cell(idx, VALUE))
        parts.extend(table_cell(val) for val in row)
        parts.append('</tr>')

    parts.append('</table>')
    return ''.join(parts)

def _create_summary_view(df, header):
    rows, cols = df.shape

    if cols <= 8:
        col_display = ', '.join(span(safe_repr(col), STRING) for col in df.columns)
    else:
        first_cols = [span(safe_repr(col), STRING) for col in df.columns[:3]]
        last_cols = [span(safe_repr(col), STRING) for col in df.columns[-2:]]
        col_display = ', '.join(first_cols) + f', {span("...", GRAY)}, ' + ', '.join(last_cols)

    if rows > 0:
        if cols <= 4:
            sample_display = ', '.join(span(safe_repr(val), VALUE) for val in df.iloc[0])
        else:
            sample_vals = [span(safe_repr(val), VALUE) for val in df.iloc[0][:2]]
            sample_display = ', '.join(sample_vals) + f', {span("...", GRAY)}'

        return f'{header}<br>Columns: {col_display}<br>Sample: {span("[", BLUE)}{sample_display}{span("]", BLUE)}'
    else:
        return f'{header}<br>Columns: {col_display}'
