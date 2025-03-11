"""String visualizer for Sculpt-n-Code."""

import html

from dataclasses import dataclass
from collections.abc import Callable

@dataclass(frozen=True, slots=True)
class MouseMove:
    index: int

@dataclass(frozen=True, slots=True)
class MouseDown:
    index: int

@dataclass(frozen=True, slots=True)
class MouseUp:
    index: int

# attached handlers can be Python code strings that evaluate to functions of type: RawEventJSON -> ModelEvent
def mouse_move(i) -> Callable[[dict], MouseMove | MouseDown | MouseUp]:
    return lambda _: MouseMove(i)

def mouse_down(i) -> Callable[[dict], MouseMove | MouseDown | MouseUp]:
    return lambda _: MouseDown(i)

def mouse_up(i) -> Callable[[dict], MouseMove | MouseDown | MouseUp]:
    return lambda _: MouseUp(i)



# eval(f"{MouseOver(10)}") works


# VS Code theme colors
STRING = "#ce9178"
GRAY = "#808080"

def safe_repr(value):
    try:
        return html.escape(repr(value))
    except Exception:
        return '<span style="color: #f44747;">[Error]</span>'

def span(text, color, style=''):
    return f'<span style="color: {color};{style}">{text}</span>'

def can_visualize(value):
    return isinstance(value, str)

def plain_char(char):
    return span(html.escape(char), GRAY)

# def special_char(char):
#     return span(html.escape(char), GRAY)

# def vis_char(char):
#     if char == '\n':
#         return special_char('$') + special_char('\\n') + '\n   ' + special_char('^')
#     elif char == '\t':
#         return special_char('\\t')
#     else:
#         return plain_char(char)

def char_span(string, index, is_special, is_selected=False):
    background_style = 'background-color: rgba(255,255,0,0.35);' if is_selected else ''
    color = GRAY if is_special else STRING

    return f'<span data-snc-idx="{index}" snc-mouse-move="{html.escape(repr(MouseMove(index)))}" snc-mouse-down="{html.escape(repr(MouseDown(index)))}" snc-mouse-up="{html.escape(repr(MouseUp(index)))}" style="color: {color}; {background_style}">{html.escape(string)}</span>'


def vis_char_with_index(char, i, selected_indices):
    """Visualize a character with data-snc-idx attribute and optional highlighting."""

    if char == '\n':
        return (char_span('$', i, True, i in selected_indices) + (char_span('\\n', i+1, True, i+1 in selected_indices) + '\n   ' + char_span('^', i+2, True, i+2 in selected_indices)), i + 3)
    elif char == '\t':
        return (char_span('\\t', i, True, i in selected_indices), i + 1)

    return (char_span(char, i, False, i in selected_indices), i + 1)


def visualize(value, model=None):
    # chars_html = ''.join(vis_char(c) for c in value)
    # return f'''<div style="color: {GRAY}; white-space: pre;">'{chars_html}'</div>'''

    if model is None:
        model = init_model()

    # Extract selection ranges from model
    selection_ranges = model.get('stringSelectionRanges', [])

    # Create a set of selected indices for fast lookup
    selected_indices = set()
    for start, end in selection_ranges:
        for i in range(start, end):
            selected_indices.add(i)

    # Build character sequence with data-snc-idx attributes and highlighting
    char_elements = []

    # Prefix markers are selectable with internal indices -2 (\\A) and -1 (^)
    char_elements.append(char_span('\\A', 0, True, 0 in selected_indices))
    char_elements.append(char_span('^', 1, True, 1 in selected_indices))

    index = 2
    for char in value:
        char_html, index = vis_char_with_index(char, index, selected_indices)
        char_elements.append(char_html)

    chars_html = ''.join(char_elements)
    # return f'''<div style="color: {STRING}; white-space: pre; user-select: none" title="sel: {selection_ranges}">"{chars_html}"</div>'''
    return f'''<div style="color: {STRING}; white-space: pre; user-select: none">"{chars_html}"</div><script>alert("hello world");</script>'''

def init_model():
    return {"stringSelectionRanges": [], "anchorIdx": None, "cursorIdx": None, "dragging": False}

def update(event=None, model=None):
    print("event", event)

    # Event should have pythonEventStr and eventJSON
    if event is None or event.get('pythonEventStr', '') == '' or event.get('eventJSON', '') == '':
        return model
    if model is None:
        model = init_model()

    make_python_event = eval(event['pythonEventStr'])
    msg = make_python_event(event['eventJSON']) if callable(make_python_event) else make_python_event

    match msg:
        case MouseDown(index=idx):
            # Start a fresh selection on each new drag
            model = init_model()
            if isinstance(idx, int):
                model['anchorIdx'] = idx
                model['cursorIdx'] = idx
            model['dragging'] = True
        case MouseMove(index=idx):
            if event['eventJSON'].get('buttons') == 0: # Mouse may have been released outside the widget and we didn't get MouseUp
                model['dragging'] = False

            if model['dragging']:
                model['cursorIdx'] = idx

        case MouseUp(index=idx):
            if model['dragging']:
                model['cursorIdx'] = idx
                model['dragging'] = False

    # Compute selection ranges from anchor/cursor (end-exclusive)
    a = model.get('anchorIdx')
    c = model.get('cursorIdx')
    if isinstance(a, int) and isinstance(c, int):
        start = a if a <= c else c
        end = (c if a <= c else a) + 1
        model['stringSelectionRanges'] = [(start, end)]
    else:
        model['stringSelectionRanges'] = []

    return model
