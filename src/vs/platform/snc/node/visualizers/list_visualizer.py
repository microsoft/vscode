"""List visualizer for Sculpt-n-Code."""

import html

# VS Code theme colors
BLUE = "#569cd6"
STRING = "#ce9178"
GRAY = "#808080"

def safe_repr(value):
    try:
        return html.escape(repr(value))
    except Exception:
        return '<span style="color: #f44747;">[Error]</span>'

def span(text, color):
    return f'<span style="color: {color};">{text}</span>'

def truncate_container(items, limit, show_first=12):
    if len(items) <= limit:
        return list(items), 0
    remaining = len(items) - show_first
    return list(items)[:show_first], remaining

def format_elements(items, color=GRAY):
    return [span(safe_repr(item), color) for item in items]

def can_visualize(value):
    return isinstance(value, list)

def visualize(value):
    if not value:
        return span("[]", GRAY)

    items, remaining = truncate_container(value, 5)
    elements = format_elements(items)

    if remaining:
        elements.append(span(f"... +{remaining} more", GRAY))

    content = ", ".join(elements)
    return f'{span("[", GRAY)}{content}{span("]", GRAY)}'
