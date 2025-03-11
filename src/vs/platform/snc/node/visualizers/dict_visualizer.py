"""Dictionary visualizer for Sculpt-n-Code."""

import html

# VS Code theme colors
BLUE = "#569cd6"
STRING = "#ce9178"
VALUE = "#b5cea8"
GRAY = "#808080"

def safe_repr(value):
    try:
        return html.escape(repr(value))
    except Exception:
        return '<span style="color: #f44747;">[Error]</span>'

def span(text, color):
    return f'<span style="color: {color};">{text}</span>'

def truncate_container(items, limit, show_first=3):
    if len(items) <= limit:
        return list(items), 0
    remaining = len(items) - show_first
    return list(items)[:show_first], remaining

def can_visualize(value):
    return isinstance(value, dict)

def visualize(value):
    if not value:
        return span("{}", BLUE)

    items, remaining = truncate_container(value.items(), 3, 2)
    pairs = [f'{span(safe_repr(k), STRING)}{span(":", BLUE)} {span(safe_repr(v), VALUE)}'
             for k, v in items]

    if remaining:
        pairs.append(span(f"... +{remaining} more", GRAY))

    content = ", ".join(pairs)
    return f'{span("{", BLUE)}{content}{span("}", BLUE)}'
