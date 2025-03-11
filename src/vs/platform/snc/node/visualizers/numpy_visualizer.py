"""NumPy array visualizer for Sculpt-n-Code."""

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

def make_header(type_name, info, dtype=None):
    header = f'{span(type_name, TYPE)}{span("[", BLUE)}{span(info, VALUE)}{span("]", BLUE)}'
    if dtype:
        header += f' {span(f"({dtype})", GRAY)}'
    return header

def format_elements(items, color=STRING):
    return [span(safe_repr(item), color) for item in items]

def format_array_elements(arr, max_items=12):
    if len(arr) <= max_items:
        return format_elements(arr)

    elements = format_elements(arr[:3])
    elements.append(span("...", GRAY))
    elements.extend(format_elements(arr[-3:]))
    return elements

def can_visualize(value):
    # Avoid importing numpy here to prevent heavy startup cost on every run.
    # Detect numpy arrays by module/class name to keep this check O(1).
    try:
        cls = getattr(value, "__class__", None)
        mod = getattr(cls, "__module__", "")
        name = getattr(cls, "__name__", "")
        return mod.startswith("numpy") and name == "ndarray"
    except Exception:
        return False

def visualize(value):
    try:
        shape_str = '×'.join(map(str, value.shape)) if value.shape else '()'
        header = make_header("ndarray", shape_str, value.dtype)

        if value.size == 0:
            return f'{header} {span("[]", BLUE)}'

        if value.ndim == 0:
            return f'{header} {span(safe_repr(value.item()), STRING)}'

        if value.ndim == 1:
            elements = format_array_elements(value)
            content = ", ".join(elements)
            return f'{header} {span("[", BLUE)}{content}{span("]", BLUE)}'

        if value.ndim == 2:
            rows, cols = value.shape
            if rows <= 3 and cols <= 6:
                matrix_lines = []
                for i in range(rows):
                    row_elements = format_elements(value[i])
                    content = " ".join(row_elements)
                    matrix_lines.append(f'{span("[", BLUE)}{content}{span("]", BLUE)}')
                return f'{header}<br>{"<br>".join(matrix_lines)}'
            else:
                sample = span(safe_repr(value[0, 0]) if rows > 0 and cols > 0 else "...", STRING)
                info = span(f"... ({rows}×{cols} elements)", GRAY)
                return f'{header} {span("[[", BLUE)}{sample} {info}{span("]]", BLUE)}'

        # Higher dimensions
        sample = span(safe_repr(value.flat[0]) if value.size > 0 else "...", STRING)
        dims = "D" if value.ndim <= 9 else "D+"
        info = span(f"... ({value.ndim}{dims} array)", GRAY)
        return f'{header} {span("[", BLUE)}{sample} {info}{span("]", BLUE)}'

    except Exception:
        return safe_repr(value)
