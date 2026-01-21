"""
String visualizer for Sculpt-n-Code.

This visualizer displays Python string values with interactive selection capabilities,
allowing users to build regex patterns by demonstration.

================================================================================
ARCHITECTURE OVERVIEW
================================================================================

This visualizer follows the Elm architecture with three core functions:

1. visualize(value, model) -> HTML string
   - Renders the string value as interactive HTML
   - Each character is wrapped in a <span> with mouse event handlers
   - Selection highlighting is applied based on model state

2. init_model() -> dict
   - Returns the initial model state for a new visualization

3. update(event, source_code, source_line, model) -> (new_model, commands)
   - Processes UI events (mouse, keyboard) and returns updated model
   - May return commands (like NewCode) for VS Code to execute

================================================================================
HOW IT WORKS
================================================================================

RENDERING:
- The string is displayed character-by-character inside a <div>
- Special characters (\n, \t) are shown as escape sequences
- Regex anchors \A and ^ are shown as prefix markers
- Each <span> has snc-mouse-* attributes containing Python code strings
  that get eval'd in the update() function to create typed event objects

INTERNAL INDEXING:
- Characters use "internal indices" that differ from string indices
- Index 0: \A marker, Index 1: ^ marker, Index 2+: actual characters
- Newlines expand to 3 indices: $ (end-of-line), \n, ^ (start-of-line)
- The build_internal_to_string_mapping() function converts between systems

SELECTION (Programming by Demonstration):
- Users can create regex patterns by selecting parts of the string
- Dragging the TOP half of characters creates "literal" selections (yellow)
- Dragging the BOTTOM half creates "fuzzy" selections (purple = .*?)
- Multiple segments can be chained by starting a new drag at the end of
  the previous selection
- Pressing Enter generates regex code: re.search(r'pattern', var).group(0)

MODEL STATE:
- completedSegments: List of finalized selection segments
- anchorIdx/cursorIdx: Current drag start/end positions (internal indices)
- anchorType: 'literal' or 'fuzzy' based on where the drag started
- dragging: Whether a drag is in progress
- stringValue: The actual Python string being visualized

COMMANDS:
- NewCode(code): Tells VS Code to replace the file contents with new code
  (used when Enter is pressed to insert the generated regex line)

================================================================================
"""

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

def char_span(string, index, is_special, selection_type=None):
    """Render a character span with optional selection highlighting.

    Args:
        selection_type: None, 'literal', or 'fuzzy'
    """
    if selection_type == 'literal':
        background_style = 'background-color: rgba(255,255,0,0.35);'  # Yellow for literal
    elif selection_type == 'fuzzy':
        background_style = 'background-color: rgba(150,100,255,0.35);'  # Purple for fuzzy
    else:
        background_style = ''
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


def generate_regex_code(source_code: str, line_number: int, string_value: str,
                        segments: List[dict]) -> str:
    """
    Generate new source code with a regex search expression inserted after the current line.

    Args:
        source_code: The full source code
        line_number: Line where the string is visualized (1-indexed)
        string_value: The actual string value
        segments: List of {"start": int, "end": int, "type": "literal"|"fuzzy"}

    Returns:
        New source code with regex search line inserted
    """
    # Check if 'import re' is needed
    needs_import = 'import re' not in source_code
    
    expr, var_name = extract_expression_from_line(source_code, line_number)
    mapping = build_internal_to_string_mapping(string_value)

    # Build regex pattern from segments
    pattern_parts = []
    for seg in segments:
        # Convert internal indices to string slice
        seg_start = seg['start']
        seg_end = seg['end']

        # Map internal indices to string indices
        slice_start = mapping[seg_start] if seg_start < len(mapping) else len(string_value)
        slice_end = mapping[seg_end - 1] + 1 if seg_end - 1 < len(mapping) else len(string_value)
        slice_end = min(slice_end, len(string_value))

        text = string_value[slice_start:slice_end]

        if seg['type'] == 'literal':
            pattern_parts.append(re.escape(text))
        else:  # fuzzy
            pattern_parts.append('.*?')

    regex_pattern = ''.join(pattern_parts)

    # Generate the regex expression
    var_to_search = var_name if var_name else f"({expr})"
    if var_name:
        new_var = f"{var_name}_match"
        regex_expr = f"{new_var} = re.search(r'{regex_pattern}', {var_to_search}).group(0)"
    else:
        regex_expr = f"result_match = re.search(r'{regex_pattern}', {var_to_search}).group(0)"

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
    new_line = indent_str + regex_expr
    lines.insert(line_number, new_line)

    # Add 'import re' at the top if needed
    if needs_import:
        # Find the right place to insert the import (after any existing imports or at top)
        import_line = 0
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith('import ') or stripped.startswith('from '):
                import_line = i + 1
            elif stripped and not stripped.startswith('#'):
                # Stop at first non-import, non-comment line
                break
        lines.insert(import_line, 'import re')

    return '\n'.join(lines)


def vis_char_with_index(char, i, selection_type_by_index):
    """Visualize a character with data-snc-idx attribute and optional highlighting.

    Args:
        selection_type_by_index: dict mapping index -> 'literal' | 'fuzzy' | None
    """
    if char == '\n':
        return (char_span('$', i, True, selection_type_by_index.get(i)) + (char_span('\\n', i+1, True, selection_type_by_index.get(i+1)) + '\n   ' + char_span('^', i+2, True, selection_type_by_index.get(i+2))), i + 3)
    elif char == '\t':
        return (char_span('\\t', i, True, selection_type_by_index.get(i)), i + 1)

    return (char_span(char, i, False, selection_type_by_index.get(i)), i + 1)


def get_all_segments(model):
    """Get all segments including the in-progress one for display."""
    completed = model.get('completedSegments', [])
    
    # Compute current in-progress segment from anchor/cursor
    a = model.get('anchorIdx')
    c = model.get('cursorIdx')
    anchor_type = model.get('anchorType', 'literal')
    
    if isinstance(a, int) and isinstance(c, int):
        start = min(a, c)
        end = max(a, c) + 1
        current_segment = {"start": start, "end": end, "type": anchor_type}
        return completed + [current_segment]
    
    return completed


def visualize(value, model=None):
    if model is None:
        model = init_model()

    # Store the string value in the model for use by update()
    model['stringValue'] = value

    # Build selection_type_by_index from all segments (completed + in-progress)
    segments = get_all_segments(model)
    selection_type_by_index = {}
    for seg in segments:
        seg_type = seg.get('type', 'literal')
        for i in range(seg['start'], seg['end']):
            selection_type_by_index[i] = seg_type

    # Build character sequence with data-snc-idx attributes and highlighting
    char_elements = []

    # Prefix markers are selectable with internal indices 0 (\A) and 1 (^)
    char_elements.append(char_span('\\A', 0, True, selection_type_by_index.get(0)))
    char_elements.append(char_span('^', 1, True, selection_type_by_index.get(1)))

    index = 2
    for char in value:
        char_html, index = vis_char_with_index(char, index, selection_type_by_index)
        char_elements.append(char_html)

    chars_html = ''.join(char_elements)
    # Add tabindex to make div focusable for keyboard events, and snc-key-down handler
    return f'''<div tabindex="0" snc-key-down="{html.escape(repr(KeyDown()))}" style="color: {STRING}; white-space: pre; user-select: none; outline: none;">"{chars_html}"</div>'''

def init_model():
    return {
        "completedSegments": [],  # Finalized segments from previous drags
        "anchorIdx": None,
        "anchorType": None,       # "literal" or "fuzzy" - determined when drag starts
        "cursorIdx": None,
        "dragging": False,
        "stringValue": None
    }


def is_top_half(event_json):
    """Determine if mouse click was in top half of the target element."""
    offset_y = event_json.get('offsetY', 0)
    height = event_json.get('elementHeight', 1)
    return offset_y <= height / 2

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
    event_json = event['eventJSON']
    msg = make_python_event(event_json) if callable(make_python_event) else make_python_event

    match msg:
        case MouseDown(index=idx):
            string_value = model.get('stringValue')
            completed_segments = model.get('completedSegments', [])

            # Determine selection type based on top/bottom half of character
            anchor_type = 'literal' if is_top_half(event_json) else 'fuzzy'

            # Check if we're extending from the end of existing segments
            extending = False
            if completed_segments and isinstance(idx, int):
                last_segment = completed_segments[-1]
                # If clicking at or adjacent to the end of the last segment, extend
                if idx == last_segment['end'] or idx == last_segment['end'] - 1:
                    extending = True

            if extending:
                # Keep existing segments, start new segment from end of last
                model['anchorIdx'] = completed_segments[-1]['end']
                model['anchorType'] = anchor_type
                model['cursorIdx'] = idx
            else:
                # Fresh start: reset segments
                model = init_model()
                model['stringValue'] = string_value
                if isinstance(idx, int):
                    model['anchorIdx'] = idx
                    model['anchorType'] = anchor_type
                    model['cursorIdx'] = idx

            model['dragging'] = True

        case MouseMove(index=idx):
            if event_json.get('buttons') == 0:  # Mouse released outside widget
                # Finalize the current segment
                a = model.get('anchorIdx')
                c = model.get('cursorIdx')
                if isinstance(a, int) and isinstance(c, int):
                    start = min(a, c)
                    end = max(a, c) + 1
                    current_segment = {"start": start, "end": end, "type": model.get('anchorType', 'literal')}
                    model['completedSegments'] = model.get('completedSegments', []) + [current_segment]
                    model['anchorIdx'] = None
                    model['cursorIdx'] = None
                model['dragging'] = False
            elif model.get('dragging'):
                model['cursorIdx'] = idx

        case MouseUp(index=idx):
            if model.get('dragging'):
                model['cursorIdx'] = idx
                # Finalize the current segment
                a = model.get('anchorIdx')
                c = model.get('cursorIdx')
                if isinstance(a, int) and isinstance(c, int):
                    start = min(a, c)
                    end = max(a, c) + 1
                    current_segment = {"start": start, "end": end, "type": model.get('anchorType', 'literal')}
                    model['completedSegments'] = model.get('completedSegments', []) + [current_segment]
                    model['anchorIdx'] = None
                    model['cursorIdx'] = None
                model['dragging'] = False

        case KeyDown():
            if event_json.get('key') == 'Enter':
                # Generate regex code if we have segments
                segments = get_all_segments(model)
                string_value = model.get('stringValue')

                if segments and string_value is not None and source_code and source_line:
                    new_code = generate_regex_code(source_code, source_line, string_value, segments)
                    commands.append(NewCode(code=new_code))

    return (model, commands)
