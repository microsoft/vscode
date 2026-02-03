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
- Pressing Enter generates regex code: re.search(r'pattern', var, re.M).group(0)

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
    AT_BEGINNING, AT_BEGINNING_STRING, AT_END, AT_END_STRING,
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
# def mouse_move(i) -> Callable[[dict], MouseMove | MouseDown | MouseUp | KeyDown]:
#     return lambda _: MouseMove(i)


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


def char_to_regex_literal(char: str) -> str:
    """Convert a character (possibly sentinel) to its regex representation."""
    if char == DC1:
        return r'\A'
    elif char == DC2:
        return '^'
    elif char == DC3:
        return '$'
    elif char == DC4:
        return r'\Z'
    elif char == '\n':
        return r'\n'
    elif char == '\t':
        return r'\t'
    elif char == '\r':
        return r'\r'
    else:
        return re.escape(char)


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

def compute_internal_length(string_value: str) -> int:
    """
    Compute the total internal length for a string's visual representation.

    Internal indices include:
    - 2 prefix anchors (\A at 0, ^ at 1)
    - Each character adds 1
    - Each \n adds 2 extra ($ before, ^ after)
    - 2 suffix anchors ($ and \Z)

    Formula: 4 + len(string_value) + 2 * newline_count
    """
    return 4 + len(string_value) + 2 * string_value.count('\n')


def extract_by_internal_indices(string_value: str, start: int, end: int) -> str:
    """
    Extract text from string_value by internal visual indices.

    Returns a string where anchors are represented as DC sentinel characters
    (DC1=\\A, DC2=^, DC3=$, DC4=\\Z) and regular characters are included as-is.
    This is suitable for passing to char_to_regex_literal or for display
    after converting sentinels to their text representations.

    Args:
        string_value: The original string
        start: Start internal index (inclusive)
        end: End internal index (exclusive)

    Returns:
        String for the range [start:end) with DC sentinel chars for anchors
    """
    if start >= end:
        return ''

    # Build a list of (internal_index, char) pairs
    elements = []
    idx = 0

    # Prefix anchors
    elements.append((idx, DC1))  # \A
    idx += 1
    elements.append((idx, DC2))  # ^
    idx += 1

    # Characters
    for char in string_value:
        if char == '\n':
            elements.append((idx, DC3))  # $
            idx += 1
            elements.append((idx, '\n'))
            idx += 1
            elements.append((idx, DC2))  # ^
            idx += 1
        else:
            elements.append((idx, char))
            idx += 1

    # Suffix anchors
    elements.append((idx, DC3))  # $
    idx += 1
    elements.append((idx, DC4))  # \Z
    idx += 1

    # Extract the slice
    result = []
    for elem_idx, char in elements:
        if start <= elem_idx < end:
            result.append(char)

    return ''.join(result)


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


def build_string_to_internal_mapping(string_value: str) -> List[int]:
    """
    Build a mapping from string character indices to internal visualizer indices.

    This is the inverse of build_internal_to_string_mapping.

    For each character position in the original string, returns the internal index
    where that character is displayed. For newlines, returns the index of the \\n
    display element (not the $ or ^ anchors).

    Returns a list where mapping[string_idx] = internal_idx.
    Also appends one extra entry for the end position (len(string)).
    """
    mapping = []

    internal_idx = 2  # Start after \A (0) and ^ (1)

    for char in string_value:
        if char == '\n':
            # \n expands to: $ (internal_idx), \n (internal_idx+1), ^ (internal_idx+2)
            # Map the string's \n to the \n display element (middle one)
            mapping.append(internal_idx + 1)
            internal_idx += 3
        else:
            # Regular character (including \t which displays as single element)
            mapping.append(internal_idx)
            internal_idx += 1

    # End position maps to $ anchor at the end
    mapping.append(internal_idx)

    return mapping


def string_index_to_internal_index(string_idx: int, string_value: str) -> int:
    """
    Convert a string character index to an internal visualizer index.

    Args:
        string_idx: Index in the original string (0-based)
        string_value: The string being visualized

    Returns:
        The corresponding internal index for highlighting/display.
    """
    mapping = build_string_to_internal_mapping(string_value)
    if string_idx < 0:
        return 0
    if string_idx >= len(mapping):
        return mapping[-1] if mapping else 2
    return mapping[string_idx]


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
        regex_parts = [char_to_regex_literal(char) for char in text]
        new_segment = f"({''.join(regex_parts)})"
    else:  # fuzzy
        new_segment = "(.*)"

    return f"/{inner_pattern}{new_segment}/"


def prepend_segment_to_regex(current_regex: str | None, segment_type: str, text: str) -> str:
    """
    Prepend a new segment to the beginning of the regex pattern.

    Similar to append_segment_to_regex but inserts at the start.
    Used when extending selections from the left side.

    Args:
        current_regex: Current regex pattern with / delimiters (e.g., "/(hello)/") or None
        segment_type: 'literal' or 'fuzzy'
        text: The text to add (from augmented string, may contain sentinel chars)

    Returns:
        New regex pattern with the segment prepended, e.g., "/(new)(hello)/"
    """
    if current_regex is None:
        # Start fresh with empty pattern
        inner_pattern = ""
    else:
        # Extract inner pattern (strip / delimiters)
        inner_pattern = current_regex[1:-1]

    # Add the new segment as a capturing group
    if segment_type == 'literal':
        regex_parts = [char_to_regex_literal(char) for char in text]
        new_segment = f"({''.join(regex_parts)})"
    else:  # fuzzy
        new_segment = "(.*)"

    return f"/{new_segment}{inner_pattern}/"


def insert_segment_at_position(current_regex: str | None, position: int, segment_type: str, text: str) -> str:
    """
    Insert a new segment at a specific position in the regex pattern.

    Used when clicking inside a fuzzy segment to split/anchor it. The position
    determines where in the regex the new segment goes to maintain text order.

    Args:
        current_regex: Current regex pattern with / delimiters (e.g., "/(.*)(world)/") or None
        position: The 0-based position to insert at (0 = prepend, len = append)
        segment_type: 'literal' or 'fuzzy'
        text: The text to add (from augmented string, may contain sentinel chars)

    Returns:
        New regex pattern with the segment inserted at the given position.
    """
    if current_regex is None:
        return append_segment_to_regex(None, segment_type, text)

    # Build the new segment
    if segment_type == 'literal':
        regex_parts = [char_to_regex_literal(char) for char in text]
        new_segment = f"({''.join(regex_parts)})"
    else:  # fuzzy
        new_segment = "(.*)"

    # Parse the existing segments (simple approach: find top-level groups)
    inner_pattern = current_regex[1:-1]
    segments = []
    depth = 0
    current_start = 0

    for i, char in enumerate(inner_pattern):
        if char == '(' and (i == 0 or inner_pattern[i-1] != '\\'):
            if depth == 0:
                current_start = i
            depth += 1
        elif char == ')' and (i == 0 or inner_pattern[i-1] != '\\'):
            depth -= 1
            if depth == 0:
                segments.append(inner_pattern[current_start:i+1])

    # Insert the new segment at the specified position
    if position <= 0:
        segments.insert(0, new_segment)
    elif position >= len(segments):
        segments.append(new_segment)
    else:
        segments.insert(position, new_segment)

    return f"/{''.join(segments)}/"


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


def _analyze_group_for_anchors(subpattern: list) -> Tuple[List[str], bool]:
    """
    Analyze a regex subpattern to find leading/trailing anchors and check if it's fuzzy.

    Returns:
        (anchor_types, is_fuzzy) where anchor_types is a list of anchor names found
        ('AT_BEGINNING_STRING', 'AT_BEGINNING', 'AT_END', 'AT_END_STRING')
    """
    anchors = []
    is_fuzzy = False

    for item in subpattern:
        op = item[0]
        av = item[1] if len(item) > 1 else None
        op_name = str(op)

        if op_name == 'AT':
            if av == AT_BEGINNING_STRING:
                anchors.append('AT_BEGINNING_STRING')
            elif av == AT_BEGINNING:
                anchors.append('AT_BEGINNING')
            elif av == AT_END:
                anchors.append('AT_END')
            elif av == AT_END_STRING:
                anchors.append('AT_END_STRING')

        elif op_name in ('MAX_REPEAT', 'MIN_REPEAT'):
            min_count, max_count, repeat_pattern = av
            if len(repeat_pattern) == 1:
                rep_op = repeat_pattern[0][0]
                if str(rep_op) == 'ANY':
                    is_fuzzy = True

    return anchors, is_fuzzy


def parse_regex_for_highlighting(selection_regex: str | None, string_value: str) -> List[Tuple[int, int, str]]:
    """
    Parse the selection regex and run it against the ORIGINAL string to get highlight ranges.

    Two-phase approach:
    1. Match the regex against the original string (not augmented)
    2. Translate string positions to internal visual indices

    This ensures regex patterns work correctly (e.g., \\n+ matches consecutive newlines)
    while still producing the correct internal indices for UI highlighting.

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

    # Parse the regex to understand its structure
    try:
        parsed = regex_parser.parse(inner_pattern)
    except Exception:
        return []

    # Analyze each capturing group for anchors and fuzzy status
    group_info = []  # List of (anchors, is_fuzzy) per group
    for item in parsed:
        op = item[0]
        av = item[1] if len(item) > 1 else None
        op_name = str(op)
        if op_name == 'SUBPATTERN':
            group_id, add_flags, del_flags, subpattern = av
            anchors, is_fuzzy = _analyze_group_for_anchors(subpattern)
            group_info.append((anchors, is_fuzzy))

    # Run the regex against the ORIGINAL string (not augmented!)
    # re.M makes ^ and $ match at line boundaries
    try:
        match = re.search(inner_pattern, string_value, re.M)
    except Exception:
        return []

    if not match:
        return []

    # Build the string-to-internal mapping for position translation
    str_to_internal = build_string_to_internal_mapping(string_value)

    # Translate match positions to internal indices
    highlights = []
    num_groups = match.lastindex or 0

    for group_num in range(1, num_groups + 1):
        span = match.span(group_num)
        if span == (-1, -1):
            continue  # Group didn't participate in match

        str_start, str_end = span
        anchors, is_fuzzy = group_info[group_num - 1] if group_num - 1 < len(group_info) else ([], False)
        seg_type = 'fuzzy' if is_fuzzy else 'literal'

        # Translate string positions to internal indices
        # Handle edge case: empty match (e.g., anchor-only groups or .* matching nothing)
        if str_start == str_end:
            # Zero-width match - we're at a gap/boundary position
            # For fuzzy (.*) matching empty, this is typically at an anchor position like $
            if str_start < len(str_to_internal):
                internal_pos = str_to_internal[str_start]
            else:
                internal_pos = str_to_internal[-1] if str_to_internal else 2

            # For zero-width matches, we're at the boundary BEFORE the character
            # This corresponds to anchor positions:
            # - Before a newline: the $ anchor (internal_pos - 1 for \n)
            # - At string start: could be \A or ^
            # - At string end: the $ anchor
            if str_start < len(string_value) and string_value[str_start] == '\n':
                # We're at the boundary before a newline - that's the $ position
                internal_start = internal_pos - 1  # $ is one before \n
            elif str_start == len(string_value):
                # We're at the end of string - that's the $ position
                internal_start = internal_pos
            elif str_start == 0:
                # At the very start - position 2 (after \A and ^)
                internal_start = internal_pos
            else:
                # General case: position right after previous char
                internal_start = internal_pos

            internal_end = internal_start

            # Expand based on which anchors are present
            if 'AT_BEGINNING_STRING' in anchors:
                internal_start = 0
            if 'AT_BEGINNING' in anchors:
                if str_start == 0:
                    internal_start = min(internal_start, 1)
            if 'AT_END' in anchors:
                internal_end = max(internal_end, internal_start + 1)
            if 'AT_END_STRING' in anchors:
                internal_end = compute_internal_length(string_value)

            if internal_end <= internal_start:
                internal_end = internal_start + 1
            highlights.append((internal_start, internal_end, seg_type))
        else:
            # Normal match with content
            internal_start = str_to_internal[str_start] if str_start < len(str_to_internal) else 2
            # For end, we need the position AFTER the last matched character
            if str_end > 0 and str_end <= len(str_to_internal):
                internal_end = str_to_internal[str_end - 1] + 1
                # Adjust for newlines: if last char is \n, end should be after the ^ marker
                if str_end > 0 and str_end - 1 < len(string_value) and string_value[str_end - 1] == '\n':
                    # \n maps to middle of 3 indices ($, \n, ^), so add 1 more to include ^
                    internal_end += 1
            else:
                internal_end = str_to_internal[-1] if str_to_internal else 2

            # Extend for leading anchors
            if 'AT_BEGINNING_STRING' in anchors:
                internal_start = 0
            if 'AT_BEGINNING' in anchors and str_start == 0:
                internal_start = min(internal_start, 1)

            # Extend for trailing anchors
            if 'AT_END_STRING' in anchors:
                internal_end = compute_internal_length(string_value)
            if 'AT_END' in anchors:
                # $ anchor - extend to include the $ marker
                # For end of string, $ is at augmented_len - 2
                # For end of line, $ is right before the \n
                pass  # The current end should already be correct

            highlights.append((internal_start, internal_end, seg_type))

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


def get_first_segment_start_internal_idx(selection_regex: str | None, string_value: str) -> int | None:
    """
    Get the internal index where the first segment starts.

    Used to determine if a new selection is extending from the left side.
    """
    highlights = parse_regex_for_highlighting(selection_regex, string_value)
    if not highlights:
        return None
    first_start, first_end, _ = highlights[0]
    return first_start


def find_fuzzy_segment_at_index(selection_regex: str | None, string_value: str, idx: int) -> dict | None:
    """
    Find a fuzzy segment that contains the given internal index.

    Returns dict with 'start', 'end', 'segment_index' if found, None otherwise.
    Used to detect clicks inside realized fuzzy regions.
    """
    highlights = parse_regex_for_highlighting(selection_regex, string_value)
    for i, (start, end, seg_type) in enumerate[Tuple[int, int, str]](highlights):
        if seg_type == 'fuzzy' and start <= idx < end:
            return {'start': start, 'end': end, 'segment_index': i}
    return None


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
        regex_expr = f"{new_var} = re.search(r'{regex_pattern}', {var_to_search}, re.M).group(0)"
    else:
        regex_expr = f"result_match = re.search(r'{regex_pattern}', {var_to_search}, re.M).group(0)"

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
        regex_expr = f"{new_var} = re.search(r'{regex_pattern}', {var_to_search}, re.M).group(0)"
    else:
        regex_expr = f"result_match = re.search(r'{regex_pattern}', {var_to_search}, re.M).group(0)"

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
        for i, (start, end, seg_type) in enumerate(highlights):
            if seg_type == 'literal':
                color = "rgba(255,255,0,0.35)"
                # Get the matched text by internal indices
                segment_text = extract_by_internal_indices(value, start, end)
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

    # (must match internal index scheme for 1:1 correspondence with extract_by_internal_indices)
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
        "extendDirection": None,  # "left", "right", or None - which side we're extending from
        "insertAfterSegment": None,  # Segment index to insert after (for clicking inside fuzzy)
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


def finalize_segment(model: dict) -> dict:
    """
    Finalize the in-progress segment and add it to selectionRegex.

    Commits the current anchor/cursor selection to the regex pattern,
    saves to undo history, and clears the in-progress state.
    """
    a = model.get('anchorIdx')
    c = model.get('cursorIdx')
    string_value = model.get('stringValue')
    anchor_type = model.get('anchorType', 'literal')
    extend_direction = model.get('extendDirection')
    insert_after_segment = model.get('insertAfterSegment')

    if isinstance(a, int) and isinstance(c, int) and string_value is not None:
        start = min(a, c)
        # For left-extension, end should NOT include +1 to avoid overlapping
        # with the first character of the existing segment
        if extend_direction == 'left':
            end = max(a, c)  # Stop just before existing first segment
        else:
            end = max(a, c) + 1

        # Save to undo history before modifying
        current_regex = model.get('selectionRegex')
        model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
        model['redoHistory'] = []  # Clear redo on new action

        if anchor_type == 'fuzzy':
            # Fuzzy is always (.*), no text needed
            if extend_direction == 'left':
                model['selectionRegex'] = prepend_segment_to_regex(current_regex, 'fuzzy', '')
            elif insert_after_segment is not None:
                # When clicking inside a fuzzy to add a new segment:
                # - If fuzzy is first segment (index 0), insert BEFORE it to maintain text order
                # - Otherwise, insert AFTER the fuzzy segment
                if insert_after_segment == 0:
                    insert_position = 0  # Insert before the leading fuzzy
                else:
                    insert_position = insert_after_segment + 1  # Insert after the fuzzy
                model['selectionRegex'] = insert_segment_at_position(current_regex, insert_position, 'fuzzy', '')
            else:
                model['selectionRegex'] = append_segment_to_regex(current_regex, 'fuzzy', '')
        else:
            # Literal: need actual text from the selection
            selected_text = extract_by_internal_indices(string_value, start, end)
            if extend_direction == 'left':
                model['selectionRegex'] = prepend_segment_to_regex(current_regex, 'literal', selected_text)
            elif insert_after_segment is not None:
                # When clicking inside a fuzzy to add a new segment:
                # - If fuzzy is first segment (index 0), insert BEFORE it to maintain text order
                # - Otherwise, insert AFTER the fuzzy segment
                if insert_after_segment == 0:
                    insert_position = 0  # Insert before the leading fuzzy
                else:
                    insert_position = insert_after_segment + 1  # Insert after the fuzzy
                model['selectionRegex'] = insert_segment_at_position(current_regex, insert_position, 'literal', selected_text)
            else:
                model['selectionRegex'] = append_segment_to_regex(current_regex, 'literal', selected_text)

        model['anchorIdx'] = None
        model['cursorIdx'] = None
        model['extendDirection'] = None
        model['insertAfterSegment'] = None

    model['dragging'] = False
    return model


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

            # Check extension points if we have an existing selection
            last_end: int | None = None
            first_start: int | None = None
            fuzzy_info: dict | None = None
            if selection_regex and isinstance(string_value, str) and isinstance(idx, int):
                last_end = get_last_segment_end_internal_idx(selection_regex, string_value)
                first_start = get_first_segment_start_internal_idx(selection_regex, string_value)
                fuzzy_info = find_fuzzy_segment_at_index(selection_regex, string_value, idx)

            # Check if extending from the right (end of last segment)
            if last_end is not None and isinstance(idx, int) and idx == last_end:
                # Keep existing regex, start new segment from end of last
                model['anchorIdx'] = last_end
                model['anchorType'] = anchor_type
                model['cursorIdx'] = idx
                model['extendDirection'] = 'right'
                model['insertAfterSegment'] = None  # Not inserting at specific position
            # Check if extending from the left (char immediately to the left of first segment)
            # This is symmetric with right extension: click the adjacent char to extend
            elif first_start is not None and isinstance(idx, int) and idx == first_start - 1:
                # Keep existing regex, start new segment extending left from first
                # Anchor at first_start so the selection can span from cursor (first_start-1) to anchor
                model['anchorIdx'] = first_start
                model['anchorType'] = anchor_type
                model['cursorIdx'] = idx
                model['extendDirection'] = 'left'
                model['insertAfterSegment'] = None  # Not inserting at specific position
            # Check if clicking inside a fuzzy segment (to split it)
            elif fuzzy_info is not None and isinstance(idx, int):
                # Allow starting a new segment inside the fuzzy region
                # This will constrain/split the fuzzy match
                # Track which segment we clicked inside so we can insert after it
                model['anchorIdx'] = idx
                model['anchorType'] = anchor_type
                model['cursorIdx'] = idx
                model['extendDirection'] = None  # Not a simple left/right extend
                model['insertAfterSegment'] = fuzzy_info['segment_index']  # Insert after this segment
            else:
                # Fresh start: reset selection
                model = init_model()
                model['stringValue'] = string_value
                if isinstance(idx, int):
                    model['anchorIdx'] = idx
                    model['anchorType'] = anchor_type
                    model['cursorIdx'] = idx
                model['extendDirection'] = None

            model['dragging'] = True

        case MouseMove(index=idx):
            if event_json.get('buttons') == 0:  # Mouse released outside widget
                model = finalize_segment(model)
            elif model.get('dragging'):
                # For fuzzy, don't update cursorIdx during drag (no drag preview)
                anchor_type = model.get('anchorType', 'literal')
                if anchor_type == 'literal':
                    model['cursorIdx'] = idx

        case MouseUp(index=idx):
            if model.get('dragging'):
                # For literal selections, update cursor on mouse up
                # For fuzzy, cursor stays at anchor (no drag)
                anchor_type = model.get('anchorType', 'literal')
                if anchor_type == 'literal':
                    model['cursorIdx'] = idx

                model = finalize_segment(model)

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
                model['insertAfterSegment'] = None

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
                    model['insertAfterSegment'] = None

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
                    model['insertAfterSegment'] = None

    return (model, commands)
