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
- Dragging the BOTTOM half creates "fuzzy" selections (purple = .*)
- Multiple segments can be chained by starting a new drag at the end of
  the previous selection
- Pressing Enter generates regex code: re.search(r'pattern', var).group(0)

MODEL STATE:
- selectionRegex: Regex pattern with / delimiters, e.g., "/(hello)(.*)(world)/"
  Each segment is wrapped in a capturing group for position tracking.
  The / prefix/suffix anticipates other search types (literal strings, globs).
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
import re._parser as regex_parser  # type: ignore[import]
from re._constants import (  # type: ignore[import]
    LITERAL, NOT_LITERAL, AT, IN, ANY, BRANCH, SUBPATTERN,
    MAX_REPEAT, MIN_REPEAT, GROUPREF, ASSERT, ASSERT_NOT,
    AT_BEGINNING, AT_BEGINNING_STRING, AT_END, AT_END_STRING,
    AT_BOUNDARY, AT_NON_BOUNDARY, NEGATE, RANGE, CATEGORY
)

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

# Sentinel characters for regex anchors (ASCII Device Control chars)
# These are inserted into an "augmented string" to enable 1:1 mapping
# between string positions and visual display indices
DC1 = chr(0x11)  # \A - start of string anchor
DC2 = chr(0x12)  # ^  - start of line anchor
DC3 = chr(0x13)  # $  - end of line anchor
DC4 = chr(0x14)  # \Z - end of string anchor

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

def build_augmented_string(string_value: str) -> str:
    """
    Build a string with sentinel characters for regex anchors.

    The augmented string has 1:1 correspondence with internal visual indices:
    - Position 0: DC1 (\A - start of string)
    - Position 1: DC2 (^ - start of first line)
    - Positions 2+: actual characters
    - For each \n: DC3 ($) + \n + DC2 (^)
    - End: DC3 ($) if no trailing newline, then DC4 (\Z)

    Example:
        Input:  "hello\\nworld"
        Output: DC1 + DC2 + "hello" + DC3 + "\\n" + DC2 + "world" + DC3 + DC4

    This enables regex matching where match positions directly equal visual indices.
    """
    result = [DC1, DC2]  # \A and ^ at start

    for char in string_value:
        if char == '\n':
            # Newline expands to: $ (end of line), \n, ^ (start of next line)
            result.extend([DC3, '\n', DC2])
        else:
            result.append(char)

    # Add end markers
    if not string_value or not string_value.endswith('\n'):
        result.append(DC3)  # $ at end if no trailing newline
    result.append(DC4)  # \Z at end

    return ''.join(result)


def convert_regex_for_augmented_string(pattern: str) -> str:
    """
    Convert regex anchors to sentinel characters for matching against augmented string.

    Uses re._parser to properly parse the regex AST and replace anchor tokens:
        AT_BEGINNING_STRING (\\A) -> DC1
        AT_BEGINNING (^)          -> DC2
        AT_END ($)                -> DC3
        AT_END_STRING (\\Z)       -> DC4

    This correctly handles anchors vs literals in all contexts (character classes,
    escape sequences, etc.) by working at the AST level rather than string manipulation.
    """
    # Characters that need escaping when used as literals in regex
    REGEX_SPECIAL = set(r'\.^$*+?{}[]|()')

    def escape_literal(code: int) -> str:
        """Convert a character code to its regex-safe representation."""
        char = chr(code)
        if char in REGEX_SPECIAL:
            return '\\' + char
        elif code < 32 or code > 126:
            # Non-printable: use hex escape
            return f'\\x{code:02x}'
        return char

    def convert_items(items: list) -> str:
        """Recursively convert parsed regex items to string with sentinel anchors."""
        result = []
        for item in items:
            op = item[0]
            av = item[1] if len(item) > 1 else None

            if op == LITERAL:
                result.append(escape_literal(av))

            elif op == NOT_LITERAL:
                result.append(f'[^{escape_literal(av)}]')

            elif op == AT:
                # This is the key part - replace anchors with sentinels
                if av == AT_BEGINNING_STRING:
                    result.append(DC1)
                elif av == AT_BEGINNING:
                    result.append(DC2)
                elif av == AT_END:
                    result.append(DC3)
                elif av == AT_END_STRING:
                    result.append(DC4)
                elif av == AT_BOUNDARY:
                    result.append(r'\b')
                elif av == AT_NON_BOUNDARY:
                    result.append(r'\B')
                else:
                    # Unknown anchor type - skip or raise?
                    pass

            elif op == ANY:
                result.append('.')

            elif op == IN:
                # Character class - convert items inside
                result.append('[')
                for class_item in av:
                    class_op = class_item[0]
                    class_av = class_item[1] if len(class_item) > 1 else None
                    if class_op == NEGATE:
                        result.append('^')
                    elif class_op == LITERAL:
                        # Inside character class, fewer chars need escaping
                        char = chr(class_av)
                        if char in r'\]^-':
                            result.append('\\' + char)
                        else:
                            result.append(char)
                    elif class_op == RANGE:
                        lo, hi = class_av
                        lo_char = chr(lo)
                        hi_char = chr(hi)
                        if lo_char in r'\]^-':
                            lo_char = '\\' + lo_char
                        if hi_char in r'\]^-':
                            hi_char = '\\' + hi_char
                        result.append(f'{lo_char}-{hi_char}')
                    elif class_op == CATEGORY:
                        # Categories like \d, \w, \s
                        cat_map = {
                            32: r'\d', 33: r'\D',  # CATEGORY_DIGIT, CATEGORY_NOT_DIGIT
                            34: r'\s', 35: r'\S',  # CATEGORY_SPACE, CATEGORY_NOT_SPACE
                            36: r'\w', 37: r'\W',  # CATEGORY_WORD, CATEGORY_NOT_WORD
                        }
                        result.append(cat_map.get(class_av, ''))
                result.append(']')

            elif op == BRANCH:
                # Alternation: (None, [branch1_items, branch2_items, ...])
                branches = [convert_items(branch) for branch in av[1]]
                result.append('|'.join(branches))

            elif op == SUBPATTERN:
                # Group: (group_num, add_flags, del_flags, items)
                group_num, add_flags, del_flags, items = av
                inner = convert_items(items)
                if group_num is None:
                    # Non-capturing group
                    result.append(f'(?:{inner})')
                else:
                    result.append(f'({inner})')

            elif op in (MAX_REPEAT, MIN_REPEAT):
                # Repetition: (min, max, items)
                min_count, max_count, items = av
                inner = convert_items(items)
                # Wrap in non-capturing group if inner is complex
                if len(items) > 1:
                    inner = f'(?:{inner})'
                if min_count == 0 and max_count == 1:
                    result.append(f'{inner}?')
                elif min_count == 0 and max_count >= 65535:  # MAXREPEAT
                    result.append(f'{inner}*')
                elif min_count == 1 and max_count >= 65535:
                    result.append(f'{inner}+')
                elif min_count == max_count:
                    result.append(f'{inner}{{{min_count}}}')
                else:
                    result.append(f'{inner}{{{min_count},{max_count}}}')
                # Add ? for non-greedy
                if op == MIN_REPEAT:
                    result.append('?')

            elif op == GROUPREF:
                result.append(f'\\{av}')

            elif op in (ASSERT, ASSERT_NOT):
                # Lookahead/lookbehind: (direction, items)
                direction, items = av
                inner = convert_items(items)
                if op == ASSERT:
                    if direction == 1:
                        result.append(f'(?={inner})')
                    else:
                        result.append(f'(?<={inner})')
                else:
                    if direction == 1:
                        result.append(f'(?!{inner})')
                    else:
                        result.append(f'(?<!{inner})')

            elif op == CATEGORY:
                cat_map = {
                    32: r'\d', 33: r'\D',
                    34: r'\s', 35: r'\S',
                    36: r'\w', 37: r'\W',
                }
                result.append(cat_map.get(av, ''))

        return ''.join(result)

    parsed = regex_parser.parse(pattern)
    return convert_items(parsed.data)


def convert_sentinels_to_regex_anchors(text: str) -> str:
    """
    Convert sentinel characters back to regex anchor syntax.

    Used when building the regex pattern from selected text that may include anchors.
    """
    text = text.replace(DC1, r'\A')
    text = text.replace(DC2, '^')
    text = text.replace(DC3, '$')
    text = text.replace(DC4, r'\Z')
    return text


def build_internal_to_string_mapping(string_value: str) -> List[int]:
    """
    Build a mapping from internal visualizer indices to actual string character indices.

    Internal indices:
    - 0: \A prefix marker (maps to string index 0, start of string)
    - 1: ^ prefix marker (maps to string index 0, start of string)
    - 2+: actual characters, but \n expands to 3 indices, \t to 1

    Returns a list where mapping[internal_idx] = string_char_idx.
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


# === Regex building and parsing functions ===

def append_segment_to_regex(current_regex: str | None, segment_type: str, text: str) -> str:
    """
    Append a new segment to the regex pattern.

    Each segment is wrapped in a capturing group for position tracking.

    Args:
        current_regex: Current regex pattern with / delimiters (e.g., "/(hello)/") or None
        segment_type: 'literal' or 'fuzzy'
        text: The text to add (from augmented string, may contain sentinel chars)

    Returns:
        New regex pattern with the segment appended, e.g., "/(hello)(.*)/"
    """
    if current_regex is None:
        # Start fresh with empty pattern
        inner_pattern = ""
    else:
        # Extract inner pattern (strip / delimiters)
        inner_pattern = current_regex[1:-1]

    # Add the new segment as a capturing group
    if segment_type == 'literal':
        # Text may contain sentinel characters from the augmented string
        # We need to handle these specially - they should become regex anchors
        # First, separate anchors from regular text
        regex_parts = []
        for char in text:
            if char == DC1:
                regex_parts.append(r'\A')
            elif char == DC2:
                regex_parts.append('^')
            elif char == DC3:
                regex_parts.append('$')
            elif char == DC4:
                regex_parts.append(r'\Z')
            else:
                # Regular character - escape it for regex
                regex_parts.append(re.escape(char))
        new_segment = f"({''.join(regex_parts)})"
    else:  # fuzzy
        new_segment = "(.*)"

    return f"/{inner_pattern}{new_segment}/"


def get_regex_inner_pattern(selection_regex: str | None) -> str | None:
    """
    Extract the inner pattern from a selection regex (strips / delimiters).

    Args:
        selection_regex: Regex with / delimiters, e.g., "/(hello)(.*)/"

    Returns:
        Inner pattern without delimiters, e.g., "(hello)(.*)", or None if input is None
    """
    if selection_regex is None:
        return None
    return selection_regex[1:-1]


def count_regex_groups(selection_regex: str | None) -> int:
    """
    Count the number of capturing groups in the regex.

    This tells us how many segments have been selected.
    """
    if selection_regex is None:
        return 0
    inner = get_regex_inner_pattern(selection_regex)
    if not inner:
        return 0
    # Parse the regex and count SUBPATTERN entries
    try:
        parsed = regex_parser.parse(inner)
        count = 0
        for op, av in parsed:
            # SUBPATTERN represents a capturing group
            if op.__class__.__name__ == 'SUBPATTERN' or str(op) == 'SUBPATTERN':
                count += 1
        # Simpler approach: count unescaped opening parens that aren't (?
        # Actually, since we build the regex ourselves with simple (group) structure,
        # we can just count the groups by parsing
        return parsed.state.groups - 1  # groups includes group 0 (whole match)
    except Exception:
        return 0


def parse_regex_for_highlighting(selection_regex: str | None, string_value: str) -> List[Tuple[int, int, str]]:
    """
    Parse the selection regex and run it against the augmented string to get highlight ranges.

    Uses the augmented string (with sentinel characters for anchors) so that match
    positions directly correspond to internal visual indices - no translation needed!

    Args:
        selection_regex: Regex with / delimiters, e.g., "/(\\A)(hello)(.*)(world)(\\Z)/"
        string_value: The string being visualized

    Returns:
        List of (internal_start, internal_end, type) tuples for highlighting.
        type is 'literal' or 'fuzzy'.
    """
    if selection_regex is None:
        return []

    inner_pattern = get_regex_inner_pattern(selection_regex)
    if not inner_pattern:
        return []

    # Build the augmented string with sentinel characters for anchors
    augmented = build_augmented_string(string_value)

    # Convert regex anchors to sentinel characters
    converted_pattern = convert_regex_for_augmented_string(inner_pattern)

    # Parse the converted regex to understand its structure (for literal vs fuzzy)
    try:
        parsed = regex_parser.parse(converted_pattern)
    except Exception:
        return []

    # Run the regex against the augmented string
    # Use DOTALL so .* matches newlines (which are in the augmented string)
    try:
        match = re.search(converted_pattern, augmented, re.DOTALL)
    except Exception:
        return []

    if not match:
        return []

    # Walk through parsed structure to identify segment types
    # Each SUBPATTERN (capturing group) is a segment
    segment_types = []
    for op, av in parsed:
        op_name = str(op)
        if op_name == 'SUBPATTERN':
            # av is (group_id, add_flags, del_flags, subpattern)
            group_id, add_flags, del_flags, subpattern = av
            # Check if this subpattern is a fuzzy match (.*)
            is_fuzzy = False
            if len(subpattern) == 1:
                sub_op, sub_av = subpattern[0]
                sub_op_name = str(sub_op)
                # MAX_REPEAT is .* (greedy), MIN_REPEAT is .*? (non-greedy)
                if sub_op_name in ('MAX_REPEAT', 'MIN_REPEAT'):
                    min_count, max_count, repeat_pattern = sub_av
                    if len(repeat_pattern) == 1:
                        rep_op, rep_av = repeat_pattern[0]
                        if str(rep_op) == 'ANY':
                            is_fuzzy = True
            segment_types.append('fuzzy' if is_fuzzy else 'literal')

    # Match positions in augmented string directly equal internal visual indices!
    highlights = []
    num_groups = match.lastindex or 0

    for group_num in range(1, num_groups + 1):
        span = match.span(group_num)
        if span == (-1, -1):
            continue  # Group didn't participate in match

        start, end = span
        seg_type = segment_types[group_num - 1] if group_num - 1 < len(segment_types) else 'literal'
        highlights.append((start, end, seg_type))

    return highlights


def get_last_segment_end_internal_idx(selection_regex: str | None, string_value: str) -> int | None:
    """
    Get the internal index where the last segment ends.

    Used to determine if a new selection is extending from the previous one.
    """
    highlights = parse_regex_for_highlighting(selection_regex, string_value)
    if not highlights:
        return None
    last_start, last_end, _ = highlights[-1]
    return last_end


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
            pattern_parts.append('.*')

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


def strip_capturing_groups(pattern: str) -> str:
    """
    Strip capturing groups from a pattern, leaving just the inner content.

    For example: "(hello)(.*)(world)" -> "hello.*world"

    Since we build the regex with simple non-nested groups, we can do a simple replacement.
    """
    result = []
    i = 0
    while i < len(pattern):
        if pattern[i] == '(':
            # Skip the opening paren
            i += 1
        elif pattern[i] == ')':
            # Skip the closing paren
            i += 1
        elif pattern[i] == '\\' and i + 1 < len(pattern):
            # Escaped character - keep both
            result.append(pattern[i:i+2])
            i += 2
        else:
            result.append(pattern[i])
            i += 1
    return ''.join(result)


def generate_regex_code_from_pattern(source_code: str, line_number: int, selection_regex: str) -> str:
    """
    Generate new source code with a regex search expression inserted after the current line.

    Args:
        source_code: The full source code
        line_number: Line where the string is visualized (1-indexed)
        selection_regex: Regex with / delimiters, e.g., "/(hello)(.*)(world)/"

    Returns:
        New source code with regex search line inserted
    """
    # Check if 'import re' is needed
    needs_import = 'import re' not in source_code

    expr, var_name = extract_expression_from_line(source_code, line_number)

    # Extract inner pattern and strip capturing groups
    inner_pattern = get_regex_inner_pattern(selection_regex)
    regex_pattern = strip_capturing_groups(inner_pattern) if inner_pattern else ""

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


def get_all_highlights(model) -> List[Tuple[int, int, str]]:
    """
    Get all highlight ranges including the in-progress selection.

    Returns list of (internal_start, internal_end, type) tuples.
    """
    string_value = model.get('stringValue')
    selection_regex = model.get('selectionRegex')

    # Get highlights from the completed regex
    highlights = parse_regex_for_highlighting(selection_regex, string_value) if string_value else []

    # Add current in-progress segment from anchor/cursor
    a = model.get('anchorIdx')
    c = model.get('cursorIdx')
    anchor_type = model.get('anchorType', 'literal')

    if isinstance(a, int) and isinstance(c, int):
        start = min(a, c)
        end = max(a, c) + 1
        highlights.append((start, end, anchor_type))

    return highlights


def visualize(value, model=None):
    if model is None:
        model = init_model()

    # Store the string value in the model for use by update()
    model['stringValue'] = value

    # Build selection_type_by_index from all highlights (completed regex + in-progress)
    highlights = get_all_highlights(model)
    selection_type_by_index = {}
    for start, end, seg_type in highlights:
        for i in range(start, end):
            selection_type_by_index[i] = seg_type

    # Build debug info showing current regex and segments
    selection_regex = model.get('selectionRegex')
    debug_html = ""
    if selection_regex:
        # Show raw regex
        inner_pattern = get_regex_inner_pattern(selection_regex)
        stripped_pattern = strip_capturing_groups(inner_pattern) if inner_pattern else ""
        debug_html += f'<div style="color: {GRAY}; font-size: 0.9em; margin-bottom: 4px;">Regex: <span style="color: #4ec9b0;">{html.escape(selection_regex)}</span></div>'
        debug_html += f'<div style="color: {GRAY}; font-size: 0.9em; margin-bottom: 4px;">Pattern: <span style="color: #dcdcaa;">{html.escape(stripped_pattern)}</span></div>'

        # Show segments with highlighting
        segments_html = []
        augmented = build_augmented_string(value)
        for i, (start, end, seg_type) in enumerate(highlights):
            if seg_type == 'literal':
                color = "rgba(255,255,0,0.35)"
                # Get the matched text from augmented string (direct slice by internal indices)
                segment_text = augmented[start:end]
                # Convert sentinel chars to display representation
                display_text = segment_text.replace(DC1, '\\A').replace(DC2, '^').replace(DC3, '$').replace(DC4, '\\Z')
                text = repr(display_text)
            else:
                color = "rgba(150,100,255,0.35)"
                text = "(.*)"
            segments_html.append(f'<span style="background-color: {color}; padding: 1px 3px; margin-right: 4px;">{html.escape(text)}</span>')
        if segments_html:
            debug_html += f'<div style="color: {GRAY}; font-size: 0.9em; margin-bottom: 8px;">Segments: {"".join(segments_html)}</div>'

    # Build character sequence with data-snc-idx attributes and highlighting
    char_elements = []

    # Prefix markers are selectable with internal indices 0 (\A) and 1 (^)
    char_elements.append(char_span('\\A', 0, True, selection_type_by_index.get(0)))
    char_elements.append(char_span('^', 1, True, selection_type_by_index.get(1)))

    index = 2
    for char in value:
        char_html, index = vis_char_with_index(char, index, selection_type_by_index)
        char_elements.append(char_html)

    # Add $ marker if string is empty or doesn't end with newline
    # (must match logic in build_augmented_string for 1:1 correspondence)
    if not value or not value.endswith('\n'):
        char_elements.append(char_span('$', index, True, selection_type_by_index.get(index)))
        index += 1

    char_elements.append(char_span('\\Z', index, True, selection_type_by_index.get(index)))
    index += 1

    chars_html = ''.join(char_elements)
    # Add tabindex to make div focusable for keyboard events, and snc-key-down handler
    return f'''<div tabindex="0" snc-key-down="{html.escape(repr(KeyDown()))}" style="color: {STRING}; white-space: pre; user-select: none; outline: none;">{debug_html}'{chars_html}'</div>'''

def init_model():
    return {
        "selectionRegex": None,   # Regex pattern with / delimiters, e.g., "/(hello)(.*)(world)/"
        "anchorIdx": None,
        "anchorType": None,       # "literal" or "fuzzy" - determined when drag starts
        "cursorIdx": None,
        "dragging": False,
        "stringValue": None,
        "undoHistory": [],        # Stack of previous selectionRegex states
        "redoHistory": [],        # Stack for redo
        "handledKeys": ["Escape", "Enter", "cmd z", "cmd shift z"]  # Keys to intercept from VS Code
    }


def is_top_half(event_json):
    """Determine if mouse click was in top half of the target element."""
    offset_y = event_json.get('offsetY', 0)
    height = event_json.get('elementHeight', 1)
    return offset_y <= height / 2

def update(event, source_code:str, source_line:int, model:dict) -> Tuple[dict, List[Any]]:
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
            selection_regex = model.get('selectionRegex')

            # Determine selection type based on top/bottom half of character
            anchor_type = 'literal' if is_top_half(event_json) else 'fuzzy'

            # Check if we're extending from the end of existing selection
            last_end: int | None = None
            if selection_regex and isinstance(string_value, str) and isinstance(idx, int):
                last_end = get_last_segment_end_internal_idx(selection_regex, string_value)

            # Determine if we should extend from the last segment
            if last_end is not None and isinstance(idx, int) and (idx == last_end or idx == last_end - 1):
                # Keep existing regex, start new segment from end of last
                model['anchorIdx'] = last_end
                model['anchorType'] = anchor_type
                model['cursorIdx'] = idx
            else:
                # Fresh start: reset selection
                model = init_model()
                model['stringValue'] = string_value
                if isinstance(idx, int):
                    model['anchorIdx'] = idx
                    model['anchorType'] = anchor_type
                    model['cursorIdx'] = idx

            model['dragging'] = True

        case MouseMove(index=idx):
            if event_json.get('buttons') == 0:  # Mouse released outside widget
                # Finalize the current segment by appending to regex
                a = model.get('anchorIdx')
                c = model.get('cursorIdx')
                string_value = model.get('stringValue')
                if isinstance(a, int) and isinstance(c, int) and string_value is not None:
                    start = min(a, c)
                    end = max(a, c) + 1
                    anchor_type = model.get('anchorType', 'literal')

                    # Build augmented string and slice directly using internal indices
                    # (internal indices = positions in augmented string)
                    augmented = build_augmented_string(string_value)
                    selected_text = augmented[start:end]

                    # Save to undo history before modifying
                    current_regex = model.get('selectionRegex')
                    model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
                    model['redoHistory'] = []  # Clear redo on new action

                    # Append segment to regex
                    model['selectionRegex'] = append_segment_to_regex(current_regex, anchor_type, selected_text)
                    model['anchorIdx'] = None
                    model['cursorIdx'] = None
                model['dragging'] = False
            elif model.get('dragging'):
                model['cursorIdx'] = idx

        case MouseUp(index=idx):
            if model.get('dragging'):
                model['cursorIdx'] = idx
                # Finalize the current segment by appending to regex
                a = model.get('anchorIdx')
                c = model.get('cursorIdx')
                string_value = model.get('stringValue')
                if isinstance(a, int) and isinstance(c, int) and string_value is not None:
                    start = min(a, c)
                    end = max(a, c) + 1
                    anchor_type = model.get('anchorType', 'literal')

                    # Build augmented string and slice directly using internal indices
                    # (internal indices = positions in augmented string)
                    augmented = build_augmented_string(string_value)
                    selected_text = augmented[start:end]

                    # Save to undo history before modifying
                    current_regex = model.get('selectionRegex')
                    model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
                    model['redoHistory'] = []  # Clear redo on new action

                    # Append segment to regex
                    model['selectionRegex'] = append_segment_to_regex(current_regex, anchor_type, selected_text)
                    model['anchorIdx'] = None
                    model['cursorIdx'] = None
                model['dragging'] = False

        case KeyDown():
            key = event_json.get('key')
            meta_key = event_json.get('metaKey', False)
            shift_key = event_json.get('shiftKey', False)

            if key == 'Enter':
                # Generate regex code if we have a selection
                selection_regex = model.get('selectionRegex')
                string_value = model.get('stringValue')

                if selection_regex and string_value is not None and source_code and source_line:
                    new_code = generate_regex_code_from_pattern(source_code, source_line, selection_regex)
                    commands.append(NewCode(code=new_code))

            elif key == 'Escape':
                # Clear all selections (save to undo first so it's recoverable)
                current_regex = model.get('selectionRegex')
                if current_regex or model.get('anchorIdx') is not None:
                    model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
                    model['redoHistory'] = []
                model['selectionRegex'] = None
                model['anchorIdx'] = None
                model['cursorIdx'] = None
                model['dragging'] = False

            elif key == 'z' and meta_key and not shift_key:
                # Cmd-Z: Undo
                undo_history = model.get('undoHistory', [])
                if undo_history:
                    # Push current to redo
                    model['redoHistory'] = model.get('redoHistory', []) + [model.get('selectionRegex')]
                    # Pop from undo
                    model['selectionRegex'] = undo_history[-1]
                    model['undoHistory'] = undo_history[:-1]
                    # Clear any in-progress selection
                    model['anchorIdx'] = None
                    model['cursorIdx'] = None
                    model['dragging'] = False

            elif key == 'z' and meta_key and shift_key:
                # Cmd-Shift-Z: Redo
                redo_history = model.get('redoHistory', [])
                if redo_history:
                    # Push current to undo
                    model['undoHistory'] = model.get('undoHistory', []) + [model.get('selectionRegex')]
                    # Pop from redo
                    model['selectionRegex'] = redo_history[-1]
                    model['redoHistory'] = redo_history[:-1]
                    # Clear any in-progress selection
                    model['anchorIdx'] = None
                    model['cursorIdx'] = None
                    model['dragging'] = False

    return (model, commands)
