"""String visualizer for Sculpt-n-Code."""

import html
import re

from dataclasses import dataclass
from collections.abc import Callable
from typing import List, Tuple, Any

# === Command types (Elm-style commands for VS Code to execute) ===

@dataclass(frozen=True, slots=True)
class NewCode:
    """Command to replace the entire file with new code."""
    code: str

# === Event types ===

@dataclass(frozen=True, slots=True)
class MouseMove:
    index: int

@dataclass(frozen=True, slots=True)
class MouseDown:
    index: int

@dataclass(frozen=True, slots=True)
class MouseUp:
    index: int

@dataclass(frozen=True, slots=True)
class KeyDown:
    pass

# attached handlers can be Python code strings that evaluate to functions of type: RawEventJSON -> ModelEvent
def mouse_move(i) -> Callable[[dict], MouseMove | MouseDown | MouseUp | KeyDown]:
    return lambda _: MouseMove(i)

def mouse_down(i) -> Callable[[dict], MouseMove | MouseDown | MouseUp | KeyDown]:
    return lambda _: MouseDown(i)

def mouse_up(i) -> Callable[[dict], MouseMove | MouseDown | MouseUp | KeyDown]:
    return lambda _: MouseUp(i)

def key_down() -> Callable[[dict], KeyDown]:
    return lambda _: KeyDown()



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


# === Index mapping functions ===

def build_internal_to_string_mapping(string_value: str) -> List[int | None]:
    """
    Build a mapping from internal visualizer indices to actual string character indices.

    Internal indices:
    - 0: \A prefix marker (maps to string index 0, start of string)
    - 1: ^ prefix marker (maps to string index 0, start of string)
    - 2+: actual characters, but \n expands to 3 indices, \t to 1

    Returns a list where mapping[internal_idx] = string_char_idx or None for special markers.
    """
    mapping = []

    # Prefix markers map to start of string (index 0)
    mapping.append(0)  # \A -> 0
    mapping.append(0)  # ^ -> 0

    string_idx = 0
    for char in string_value:
        if char == '\n':
            # \n expands to: $ (char), \n (display), ^ (next line marker)
            mapping.append(string_idx)      # $ -> current char
            mapping.append(string_idx + 1)  # \n -> after this char
            mapping.append(string_idx + 1)  # ^ -> after this char (start of next logical char)
        elif char == '\t':
            # \t expands to single display
            mapping.append(string_idx)
        else:
            # Regular character
            mapping.append(string_idx)
        string_idx += 1

    # Add end marker (one past the last character)
    mapping.append(string_idx)

    return mapping


def internal_range_to_string_slice(internal_start: int, internal_end: int, string_value: str) -> Tuple[int, int]:
    """
    Convert internal visualizer index range to actual string slice indices.

    Args:
        internal_start: Start of selection in internal indices (inclusive)
        internal_end: End of selection in internal indices (exclusive)
        string_value: The actual string being visualized

    Returns:
        (slice_start, slice_end) for string[slice_start:slice_end]
    """
    mapping = build_internal_to_string_mapping(string_value)

    # Clamp to valid range
    internal_start = max(0, min(internal_start, len(mapping) - 1))
    internal_end = max(0, min(internal_end, len(mapping)))

    if internal_end <= internal_start:
        return (0, 0)

    slice_start = mapping[internal_start] if internal_start < len(mapping) else len(string_value)
    # For end, we want the character AFTER the last selected internal index
    slice_end = mapping[internal_end - 1] if internal_end - 1 < len(mapping) else len(string_value)

    # If end points to same char as start of that internal index, advance by 1
    if slice_end <= slice_start:
        slice_end = slice_start + 1

    # For end index, we actually want to include the character at internal_end - 1
    # So we need to find what string index that maps to, then add 1
    last_internal = internal_end - 1
    if last_internal < len(mapping):
        last_string_idx = mapping[last_internal]
        # Find if this is a multi-index char (like \n) and get the actual char end
        slice_end = last_string_idx + 1

    return (slice_start, min(slice_end, len(string_value)))


# === Source code analysis functions ===

def extract_expression_from_line(source_code: str, line_number: int) -> Tuple[str, str | None]:
    """
    Extract the expression being visualized from the source line.

    Returns:
        (expression, variable_name) where variable_name is set if it's a simple assignment
    """
    lines = source_code.split('\n')
    if line_number < 1 or line_number > len(lines):
        return ("result", None)

    line = lines[line_number - 1].strip()

    # Check for simple assignment: var = expr
    # Match: identifier = something (but not ==)
    assignment_match = re.match(r'^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?!=)(.+)$', line)
    if assignment_match:
        var_name = assignment_match.group(1)
        return (var_name, var_name)

    # Not a simple assignment, use the whole expression
    # Strip any trailing comment
    if '#' in line:
        line = line[:line.index('#')].strip()

    return (line if line else "result", None)


def generate_slice_code(source_code: str, line_number: int, string_value: str,
                        internal_start: int, internal_end: int) -> str:
    """
    Generate new source code with a slice expression inserted after the current line.

    Args:
        source_code: The full source code
        line_number: Line where the string is visualized (1-indexed)
        string_value: The actual string value
        internal_start: Start of selection (internal index, inclusive)
        internal_end: End of selection (internal index, exclusive)

    Returns:
        New source code with slice line inserted
    """
    slice_start, slice_end = internal_range_to_string_slice(internal_start, internal_end, string_value)
    expr, var_name = extract_expression_from_line(source_code, line_number)

    # Generate the slice expression
    if var_name:
        # Simple variable assignment: x = "hello" -> x_slice = x[0:3]
        new_var = f"{var_name}_slice"
        slice_expr = f"{new_var} = {var_name}[{slice_start}:{slice_end}]"
    else:
        # Complex expression: use parentheses
        slice_expr = f"result_slice = ({expr})[{slice_start}:{slice_end}]"

    # Insert the new line after the current line
    lines = source_code.split('\n')

    # Detect indentation of the current line
    if line_number >= 1 and line_number <= len(lines):
        current_line = lines[line_number - 1]
        indent = len(current_line) - len(current_line.lstrip())
        indent_str = current_line[:indent]
    else:
        indent_str = ""

    # Insert new line
    new_line = indent_str + slice_expr
    lines.insert(line_number, new_line)  # Insert after current line (0-indexed: line_number is the position after)

    return '\n'.join(lines)


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

    # Store the string value in the model for use by update()
    model['stringValue'] = value

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
    # Add tabindex to make div focusable for keyboard events, and snc-key-down handler
    return f'''<div tabindex="0" snc-key-down="{html.escape(repr(KeyDown()))}" style="color: {STRING}; white-space: pre; user-select: none; outline: none;">"{chars_html}"</div>'''

def init_model():
    return {"stringSelectionRanges": [], "anchorIdx": None, "cursorIdx": None, "dragging": False, "stringValue": None}

def update(event=None, source_code=None, source_line=None, model=None) -> Tuple[dict, List[Any]]:
    """
    Update model based on event. Returns (new_model, commands) tuple.

    Commands are actions for VS Code to execute, like NewCode to update the file.
    """
    commands: List[Any] = []

    # Event should have pythonEventStr and eventJSON
    if event is None or event.get('pythonEventStr', '') == '' or event.get('eventJSON', '') == '':
        return (model, commands)
    if model is None:
        model = init_model()

    make_python_event = eval(event['pythonEventStr'])
    msg = make_python_event(event['eventJSON']) if callable(make_python_event) else make_python_event

    match msg:
        case MouseDown(index=idx):
            # Start a fresh selection on each new drag, but preserve stringValue
            string_value = model.get('stringValue')
            model = init_model()
            model['stringValue'] = string_value
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

        case KeyDown():
            if event['eventJSON'].get('key') == 'Enter':
                # Generate slice code if we have a selection
                selection_ranges = model.get('stringSelectionRanges', [])
                string_value = model.get('stringValue')

                if selection_ranges and string_value is not None and source_code and source_line:
                    start, end = selection_ranges[0]
                    new_code = generate_slice_code(source_code, source_line, string_value, start, end)
                    commands.append(NewCode(code=new_code))

    # Compute selection ranges from anchor/cursor (end-exclusive)
    a = model.get('anchorIdx')
    c = model.get('cursorIdx')
    if isinstance(a, int) and isinstance(c, int):
        start = a if a <= c else c
        end = (c if a <= c else a) + 1
        model['stringSelectionRanges'] = [(start, end)]
    else:
        model['stringSelectionRanges'] = []

    return (model, commands)
