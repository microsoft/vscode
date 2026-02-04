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

Note: The string value is NOT stored in the model. Instead, it is passed as
a parameter to init_model(value), update(..., value), and visualize(value, model).

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
    MAXREPEAT,
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

@dataclass(frozen=True, slots=True)
class DropdownToggle:
    dropdown_id: str

@dataclass(frozen=True, slots=True)
class DropdownSelect:
    dropdown_id: str
    option_value: str

# attached handlers can be Python code strings that evaluate to functions of type: RawEventJSON -> ModelEvent
# def mouse_move(i) -> Callable[[dict], MouseMove | MouseDown | MouseUp | KeyDown]:
#     return lambda _: MouseMove(i)


# eval(f"{MouseOver(10)}") works



# VS Code theme colors
STRING = "#ce9178"
GRAY = "#808080"

# Available fuzzy character class options for dropdown selection
# Each tuple is (pattern_value, display_label)
# Note: These are character classes only - repetition is handled separately
FUZZY_PATTERN_OPTIONS = [
    (r".", r"."),
    (r"\s", r"\s"),
    (r"\S", r"\S"),
    (r"\d", r"\d"),
    (r"\w", r"\w"),
    (r"[0-9.]", r"[0-9.]"),
    (r"[a-z]", r"[a-z]"),
    (r"[A-Za-z]", r"[A-Za-z]"),
    (r"[A-Za-z0-9]", r"[A-Za-z0-9]"),
    (r"[\S\s]", r"[\S\s]"),
]

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


def render_dropdown(
    dropdown_id: str,
    options: list[tuple[str, str]],
    is_open: bool,
    trigger_content: str,
    trigger_style: str = '',
) -> str:
    """Render a reusable dropdown component.

    Args:
        dropdown_id: Unique identifier for this dropdown instance
        options: List of (value, display_label) tuples
        is_open: Whether the dropdown is currently open
        trigger_content: HTML content for the trigger element
        trigger_style: Additional CSS styles for the trigger

    Returns:
        HTML string for the dropdown (trigger + options list if open)
    """
    # Trigger element with click handler to toggle
    trigger_event = repr(DropdownToggle(dropdown_id))
    trigger_html = (
        f'<span snc-mouse-down="{html.escape(trigger_event)}" '
        f'style="cursor: pointer; {trigger_style}">{trigger_content}</span>'
    )

    if not is_open:
        return trigger_html

    # Build options list
    options_html = []
    for value, label in options:
        select_event = repr(DropdownSelect(dropdown_id, value))
        option_html = (
            f'<div snc-mouse-down="{html.escape(select_event)}" '
            'style="padding: 2px 6px; cursor: pointer; white-space: nowrap;"'
            f'class="snc-dropdown-option">{html.escape(label)}</div>'
        )
        options_html.append(option_html)

    # Dropdown container (absolutely positioned below trigger)
    dropdown_html = (
        '<div style="'
        'position: absolute;'
        'left: 0;'
        'top: 100%;'
        'background: #252526;'
        'border: 1px solid #3c3c3c;'
        'border-radius: 3px;'
        'z-index: 100;'
        'min-width: 80px;'
        'box-shadow: 0 2px 8px rgba(0,0,0,0.4);'
        'font-size: 11px;'
        'line-height: 1.4;'
        f'">{"".join(options_html)}</div>'
    )

    # Wrap trigger and dropdown in a relative container
    return (
        f'<span style="position: relative; display: inline-block;">'
        f'{trigger_html}{dropdown_html}</span>'
    )


def char_span(string, index, is_special, highlight=None, model=None):
    """Render a character span with optional selection highlighting.

    Args:
        string: The character(s) to display
        index: The internal index for this character
        is_special: Whether this is a special character (anchor, escape sequence)
        highlight: None or a highlight tuple (start, end, type, pattern_display, repetition, segment_index)
        model: The model state (needed for dropdown open state)
    """

    def overlay_html(content: str, side: str, seg_type: str, color: str) -> str:
        """Generate an overlay span for pattern/repetition display.

        Args:
            content: The text to display in the overlay
            side: 'left' or 'right' positioning
            seg_type: 'literal' or 'fuzzy' - affects vertical positioning
            color: The color for the overlay text
        """
        if not content:
            return ''
        v_align = 'text-top' if seg_type == 'literal' else 'baseline'
        top = -7 if seg_type == 'literal' else 3
        h_pos = 'left: -1px;' if side == 'left' else 'right: 0px;'
        return (
            f'<span style="position: relative; display: inline-block; vertical-align: {v_align}"><span style="'
            'position: absolute;'
            f'{h_pos}'
            f'top: {top}px;'
            'font-size: 5px;'
            'font-style: normal;'
            'font-weight: bold;'
            'padding: 0;'
            f'color: {color};'
            'pointer-events: none;'
            'z-index: 10;'
            'line-height: 6px;'
            f'">{html.escape(content)}</span></span>'
        )

    def fuzzy_dropdown_html(pat_str: str, segment_index: int, color: str) -> str:
        """Generate a dropdown for fuzzy pattern selection.

        Args:
            pat_str: Current pattern string to display
            segment_index: Index of this segment (for dropdown ID)
            color: The color for the trigger text
        """
        dropdown_id = f'fuzzy-pattern-{segment_index}'
        open_dropdown = model.get('openDropdown') if model else None
        is_open = open_dropdown is not None and open_dropdown.get('id') == dropdown_id

        # Style for the trigger (positioned like overlay_html but clickable)
        trigger_style = (
            'position: absolute;'
            'left: -1px;'
            'top: 3px;'
            'font-size: 5px;'
            'font-style: normal;'
            'font-weight: bold;'
            'padding: 0;'
            f'color: {color};'
            'z-index: 10;'
            'line-height: 6px;'
        )

        return render_dropdown(
            dropdown_id=dropdown_id,
            options=FUZZY_PATTERN_OPTIONS,
            is_open=is_open,
            trigger_content=html.escape(pat_str) if pat_str else '.*',
            trigger_style=trigger_style,
        )

    styles = f'color: {GRAY if is_special else STRING}; padding-right: 1px;'
    pat_html = ''
    repetition_html = ''

    if highlight is not None:
        start, end, seg_type, pat_str, (min_count, max_count), segment_index = highlight
        color = '#00aeff' if seg_type == 'literal' else '#868686'

        styles += f' border-{"top" if seg_type == "literal" else "bottom"}: 1px solid {color}; border-image: linear-gradient(to {"bottom" if seg_type == "literal" else "top"}, {color} 20%, transparent 20%) 1;'
        if start == index:
            styles += f' border-left: 1px solid {color}; margin-left: -1px;'
            if seg_type == 'fuzzy':
                # Fuzzy segments get a dropdown for pattern selection
                pat_html = f'<span style="position: relative; display: inline-block; vertical-align: baseline">{fuzzy_dropdown_html(pat_str, segment_index, color)}</span>'
            else:
                pat_html = overlay_html(pat_str, 'left', seg_type, color)
        if end - 1 == index:
            styles += f' border-right: 1px solid {color}; padding-right: 0px;'
            if min_count == max_count:
                rep_str = f'{min_count}'
            elif min_count == 0 and max_count == float('inf'):
                rep_str = '*'
            elif min_count == 1 and max_count == float('inf'):
                rep_str = '+'
            elif min_count == 0 and max_count == 1:
                rep_str = '?'
            elif min_count == 0:
                rep_str = f'≤{max_count}'
            elif max_count == float('inf'):
                rep_str = f'≥{min_count}'
            else:
                rep_str = f'{min_count}-{max_count}'
            repetition_html = overlay_html(rep_str, 'right', seg_type, color)

    return f'{pat_html}<span data-snc-idx="{index}" snc-mouse-move="{html.escape(repr(MouseMove(index)))}" snc-mouse-down="{html.escape(repr(MouseDown(index)))}" snc-mouse-up="{html.escape(repr(MouseUp(index)))}" style="{styles}">{html.escape(string)}</span>{repetition_html}'


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


def extract_quantifier(pattern: str) -> tuple[str, str]:
    """
    Extract the base pattern and quantifier from a regex pattern string.

    Args:
        pattern: A regex pattern like ".*", "\\s+", "[a-z]{2,5}", ".*?" (lazy)

    Returns:
        (base_pattern, quantifier) tuple, e.g., (".", "*") or ("[a-z]", "{2,5}")
        If no quantifier, returns (pattern, "")
    """
    # Match quantifiers at the end: *, +, ?, {n}, {n,}, {,m}, {n,m}
    # Also handles lazy quantifiers: *?, +?, ??, {n,m}?
    quantifier_match = re.search(r'([*+?]|\{[0-9,]+\})\??$', pattern)
    if quantifier_match:
        quantifier = quantifier_match.group(0)  # Use group(0) to include the optional ?
        base = pattern[:quantifier_match.start()]
        return (base, quantifier)
    return (pattern, "")


def replace_segment_pattern(selection_regex: str, segment_index: int, new_char_class: str) -> str:
    """
    Replace the character class of a specific capturing group, preserving its quantifier.

    Used when selecting a different fuzzy pattern from the dropdown.

    Args:
        selection_regex: Current regex with / delimiters, e.g., "/(hello)(.*)(world)/"
        segment_index: 0-based index of the segment to replace
        new_char_class: The new character class (e.g., r"\\s", r"\\d", r"[a-z]")
                        Note: This should NOT include a quantifier.

    Returns:
        New regex pattern with the segment's character class replaced,
        but its quantifier preserved.
    """
    inner_pattern = selection_regex[1:-1]

    # Parse the existing segments (find top-level groups)
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

    # Replace the specified segment, preserving its quantifier
    if 0 <= segment_index < len(segments):
        old_segment = segments[segment_index]
        # Extract content inside parentheses
        old_content = old_segment[1:-1]  # Strip ( and )
        # Extract the quantifier from the old pattern
        _, quantifier = extract_quantifier(old_content)
        # Build new segment with new char class + old quantifier
        segments[segment_index] = f"({new_char_class}{quantifier})"

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


# Mapping from category constants to shorthand display strings
_CATEGORY_TO_SHORTHAND = {
    'CATEGORY_WORD': r'\w',
    'CATEGORY_NOT_WORD': r'\W',
    'CATEGORY_DIGIT': r'\d',
    'CATEGORY_NOT_DIGIT': r'\D',
    'CATEGORY_SPACE': r'\s',
    'CATEGORY_NOT_SPACE': r'\S',
}


def _char_class_to_string(items: list) -> str:
    """
    Reconstruct a character class from its parsed items.

    Handles shorthand classes (\w, \s, \d, etc.), ranges ([a-z]),
    and explicit character sets ([abc]).
    """
    # Check for single shorthand category like \w, \s, \d
    if len(items) == 1:
        item_op = str(items[0][0])
        item_av = items[0][1] if len(items[0]) > 1 else None
        if item_op == 'CATEGORY' and item_av is not None:
            cat_name = str(item_av)
            if cat_name in _CATEGORY_TO_SHORTHAND:
                return _CATEGORY_TO_SHORTHAND[cat_name]

    # Need to build full [...] representation
    negated = False
    parts = []

    for item in items:
        item_op = str(item[0])
        item_av = item[1] if len(item) > 1 else None

        if item_op == 'NEGATE':
            negated = True

        elif item_op == 'CATEGORY':
            cat_name = str(item_av)
            if cat_name in _CATEGORY_TO_SHORTHAND:
                parts.append(_CATEGORY_TO_SHORTHAND[cat_name])
            # else skip unknown categories

        elif item_op == 'RANGE':
            start, end = item_av
            start_char = chr(start)
            end_char = chr(end)
            # Escape special chars in ranges
            if start_char in r'\]-^':
                start_char = '\\' + start_char
            if end_char in r'\]-^':
                end_char = '\\' + end_char
            parts.append(f'{start_char}-{end_char}')

        elif item_op == 'LITERAL':
            char = chr(item_av)
            # Escape special chars inside character class
            if char in r'\]-^':
                parts.append('\\' + char)
            elif char == '\n':
                parts.append(r'\n')
            elif char == '\t':
                parts.append(r'\t')
            elif char == '\r':
                parts.append(r'\r')
            elif not char.isprintable():
                parts.append(f'\\x{item_av:02x}')
            else:
                parts.append(char)

    prefix = '[^' if negated else '['
    return prefix + ''.join(parts) + ']'


def _subpattern_to_string(subpattern: list, include_repetition: bool = True) -> str:
    """
    Reconstruct a regex pattern string from a parsed subpattern AST.

    This converts the internal regex parser representation back to a human-readable
    string for display purposes.
    """
    result = []

    for item in subpattern:
        op = item[0]
        av = item[1] if len(item) > 1 else None
        op_name = str(op)

        if op_name == 'LITERAL':
            # av is the character code
            char = chr(av)
            # Escape special regex chars and non-printable chars
            if char in r'\.^$*+?{}[]|()':
                result.append('\\' + char)
            elif char == '\n':
                result.append(r'\n')
            elif char == '\t':
                result.append(r'\t')
            elif char == '\r':
                result.append(r'\r')
            elif not char.isprintable():
                result.append(f'\\x{av:02x}')
            else:
                result.append(char)

        elif op_name == 'ANY':
            result.append('.')

        elif op_name == 'AT':
            if av == AT_BEGINNING_STRING:
                result.append(r'\A')
            elif av == AT_BEGINNING:
                result.append('^')
            elif av == AT_END:
                result.append('$')
            elif av == AT_END_STRING:
                result.append(r'\Z')
            # Other AT types (word boundary, etc.) - just skip for display

        elif op_name in ('MAX_REPEAT', 'MIN_REPEAT'):
            min_count, max_count, repeat_subpattern = av
            inner = _subpattern_to_string(list(repeat_subpattern))
            if include_repetition:
                if min_count == 0 and max_count == MAXREPEAT:
                    result.append(inner + '*')
                elif min_count == 1 and max_count == MAXREPEAT:
                    result.append(inner + '+')
                elif min_count == 0 and max_count == 1:
                    result.append(inner + '?')
                elif min_count == max_count:
                    result.append(inner + f'{{{min_count}}}')
                else:
                    max_str = '' if max_count == MAXREPEAT else str(max_count)
                    result.append(inner + f'{{{min_count},{max_str}}}')
                if op_name == 'MIN_REPEAT':
                    result.append('?')  # Non-greedy marker
            else:
                result.append(inner)

        elif op_name == 'SUBPATTERN':
            # Nested group
            group_id, add_flags, del_flags, nested = av
            result.append('(' + _subpattern_to_string(list(nested)) + ')')

        elif op_name == 'ASSERT':
            # Lookahead/lookbehind
            direction, nested = av
            inner = _subpattern_to_string(list(nested))
            if direction == 1:
                result.append(f'(?={inner})')
            elif direction == -1:
                result.append(f'(?<={inner})')

        elif op_name == 'ASSERT_NOT':
            direction, nested = av
            inner = _subpattern_to_string(list(nested))
            if direction == 1:
                result.append(f'(?!{inner})')
            elif direction == -1:
                result.append(f'(?<!{inner})')

        elif op_name == 'IN':
            # Character class [...] - reconstruct properly
            char_class_result = _char_class_to_string(av)
            result.append(char_class_result)

        elif op_name == 'BRANCH':
            # Alternation
            branches = [_subpattern_to_string(list(b)) for b in av[1]]
            result.append('|'.join(branches))

        elif op_name == 'GROUPREF':
            result.append(f'\\{av}')

        # Other operations can be added as needed

    return ''.join(result)


def _is_wildcard_pattern(pattern_item) -> bool:
    """Check if a pattern item matches variable characters (is a wildcard).

    Returns True for patterns like ., \s, \d, \w, [a-z], etc.
    Returns False for literal characters like \n, \., a, etc.
    """
    op_name = str(pattern_item[0])
    # ANY matches any character (.)
    if op_name == 'ANY':
        return True
    # IN is a character class like [a-z], \d, \s, \w, etc.
    if op_name == 'IN':
        return True
    return False


def _analyze_group(subpattern: list) -> Tuple[List[str], bool, Tuple[int, int | float], str]:
    """
    Analyze a regex subpattern to find leading/trailing anchors, check if it's fuzzy,
    extract repetition bounds, and reconstruct the pattern string for display.

    Returns:
        (anchor_types, is_fuzzy, repetition_bounds, pattern_display) where:
        - anchor_types is a list of anchor names found
          ('AT_BEGINNING_STRING', 'AT_BEGINNING', 'AT_END', 'AT_END_STRING')
        - is_fuzzy is True if the pattern matches variable text (wildcards)
        - repetition_bounds is (min, max) tuple where max can be float('inf')
        - pattern_display is the reconstructed pattern string for display
    """
    anchors = []
    is_fuzzy = False
    repetition: Tuple[int, int | float] = (1, 1)  # Default: exactly one match

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

        elif op_name == 'ANY':
            # Single . (any character) is fuzzy
            is_fuzzy = True

        elif op_name == 'IN':
            # Character class like [a-z], \d, \s, \w, etc. without repetition
            # These are fuzzy since they match variable characters
            is_fuzzy = True

        elif op_name in ('MAX_REPEAT', 'MIN_REPEAT'):
            min_count, max_count, repeat_pattern = av
            # Extract repetition bounds
            # max_count is MAXREPEAT for unbounded (*, +)
            if max_count == MAXREPEAT:
                repetition = (min_count, float('inf'))
            else:
                repetition = (min_count, max_count)

            # Check if the repeated pattern is a wildcard (., \s, \d, [a-z], etc.)
            # Only wildcard patterns with repetition are fuzzy
            # Literal patterns like \n{2,3} are NOT fuzzy
            if len(repeat_pattern) >= 1 and _is_wildcard_pattern(repeat_pattern[0]):
                is_fuzzy = True

    # Reconstruct the pattern string from the AST
    pattern_display = _subpattern_to_string(subpattern, include_repetition=False)

    return anchors, is_fuzzy, repetition, pattern_display


def parse_regex_for_highlighting(selection_regex: str | None, string_value: str) -> List[Tuple[int, int, str, str, Tuple[int, int | float]]]:
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
        List of (internal_start, internal_end, type, pattern_display, repetition) tuples.
        - type is 'literal' or 'fuzzy'
        - pattern_display is the subpattern text (e.g., "hello", ".*")
        - repetition is (min, max) tuple where max can be float('inf')
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

    # Analyze each capturing group for anchors, fuzzy status, repetition, and pattern display
    group_info = []  # List of (anchors, is_fuzzy, repetition, pattern_display) per group
    for item in parsed:
        op = item[0]
        av = item[1] if len(item) > 1 else None
        op_name = str(op)
        if op_name == 'SUBPATTERN':
            group_id, add_flags, del_flags, subpattern = av
            anchors, is_fuzzy, repetition, pattern_display = _analyze_group(subpattern)
            group_info.append((anchors, is_fuzzy, repetition, pattern_display))

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
        group_idx = group_num - 1
        anchors, is_fuzzy, repetition, pattern_display = group_info[group_idx] if group_idx < len(group_info) else ([], False, (1, 1), '')
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
            segment_index = len(highlights)
            highlights.append((internal_start, internal_end, seg_type, pattern_display, repetition, segment_index))
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

            segment_index = len(highlights)
            highlights.append((internal_start, internal_end, seg_type, pattern_display, repetition, segment_index))

    return highlights


def get_last_segment_end_internal_idx(selection_regex: str | None, string_value: str) -> int | None:
    """
    Get the internal index where the last segment ends.

    Used to determine if a new selection is extending from the previous one.
    """
    highlights = parse_regex_for_highlighting(selection_regex, string_value)
    if not highlights:
        return None
    last_start, last_end, _, _, _, _ = highlights[-1]
    return last_end


def get_first_segment_start_internal_idx(selection_regex: str | None, string_value: str) -> int | None:
    """
    Get the internal index where the first segment starts.

    Used to determine if a new selection is extending from the left side.
    """
    highlights = parse_regex_for_highlighting(selection_regex, string_value)
    if not highlights:
        return None
    first_start, first_end, _, _, _, _ = highlights[0]
    return first_start


def find_fuzzy_segment_at_index(selection_regex: str | None, string_value: str, idx: int) -> dict | None:
    """
    Find a fuzzy segment that contains the given internal index.

    Returns dict with 'start', 'end', 'segment_index' if found, None otherwise.
    Used to detect clicks inside realized fuzzy regions.
    """
    highlights = parse_regex_for_highlighting(selection_regex, string_value)
    for i, (start, end, seg_type, _, _, _) in enumerate(highlights):
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


def vis_char_with_index(char, i, highlight_by_index, model=None):
    """Visualize a character with data-snc-idx attribute and optional highlighting.

    Args:
        highlight_by_index: dict mapping index -> highlight tuple or None
            where highlight tuple is (start, end, type, pattern_display, repetition, segment_index)
        model: The model state (needed for dropdown open state)
    """
    if char == '\n':
        return (char_span('$', i, True, highlight_by_index.get(i), model) + (char_span('\\n', i+1, True, highlight_by_index.get(i+1), model) + '\n   ' + char_span('^', i+2, True, highlight_by_index.get(i+2), model)), i + 3)
    elif char == '\t':
        return (char_span('\\t', i, True, highlight_by_index.get(i), model), i + 1)

    return (char_span(char, i, False, highlight_by_index.get(i), model), i + 1)


def build_preview_regex(model, string_value: str) -> str | None:
    """
    Build what the regex would look like if we finalized the in-progress selection.

    This mirrors the logic in finalize_segment() but doesn't modify the model.

    Args:
        model: The model state
        string_value: The string being visualized

    Returns:
        The preview regex string, or the current selectionRegex if no in-progress selection
    """
    a = model.get('anchorIdx')
    c = model.get('cursorIdx')

    if not (isinstance(a, int) and isinstance(c, int)):
        # No in-progress selection, return existing regex
        return model.get('selectionRegex')

    anchor_type = model.get('anchorType', 'literal')
    extend_direction = model.get('extendDirection')
    insert_after_segment = model.get('insertAfterSegment')
    current_regex = model.get('selectionRegex')

    start = min(a, c)
    # For left-extension, end should NOT include +1 to avoid overlapping
    if extend_direction == 'left':
        end = max(a, c)
    else:
        end = max(a, c) + 1

    if anchor_type == 'fuzzy':
        # Fuzzy is always (.*), no text needed
        if extend_direction == 'left':
            return prepend_segment_to_regex(current_regex, 'fuzzy', '')
        elif insert_after_segment is not None:
            if insert_after_segment == 0:
                insert_position = 0
            else:
                insert_position = insert_after_segment + 1
            return insert_segment_at_position(current_regex, insert_position, 'fuzzy', '')
        else:
            return append_segment_to_regex(current_regex, 'fuzzy', '')
    else:
        # Literal: need actual text from the selection
        selected_text = extract_by_internal_indices(string_value, start, end)
        if extend_direction == 'left':
            return prepend_segment_to_regex(current_regex, 'literal', selected_text)
        elif insert_after_segment is not None:
            if insert_after_segment == 0:
                insert_position = 0
            else:
                insert_position = insert_after_segment + 1
            return insert_segment_at_position(current_regex, insert_position, 'literal', selected_text)
        else:
            return append_segment_to_regex(current_regex, 'literal', selected_text)


def visualize(value, model=None):
    if model is None:
        model = init_model(value)

    # Build highlight_by_index from highlights (uses preview regex to include in-progress selection)
    preview_regex = build_preview_regex(model, value)
    highlights = parse_regex_for_highlighting(preview_regex, value) if value else []
    highlight_by_index = {}
    for highlight in highlights:
        start, end, _, _, _, _ = highlight
        for i in range(start, end):
            highlight_by_index[i] = highlight

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
        for i, (start, end, seg_type, pattern_display, repetition, _seg_idx) in enumerate(highlights):
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
    char_elements.append(char_span('\\A', 0, True, highlight_by_index.get(0), model))
    char_elements.append(char_span('^', 1, True, highlight_by_index.get(1), model))

    index = 2
    for char in value:
        char_html, index = vis_char_with_index(char, index, highlight_by_index, model)
        char_elements.append(char_html)

    # (must match internal index scheme for 1:1 correspondence with extract_by_internal_indices)
    char_elements.append(char_span('$', index, True, highlight_by_index.get(index), model))
    index += 1
    char_elements.append(char_span('\\Z', index, True, highlight_by_index.get(index), model))
    index += 1

    chars_html = ''.join(char_elements)
    # Add tabindex to make div focusable for keyboard events, and snc-key-down handler
    return (
        f'<div tabindex="0" snc-key-down="{html.escape(repr(KeyDown()))}" style="color: {STRING}; white-space: pre; user-select: none; outline: none;">'
        f'{debug_html}'
        f'''<div style="line-height: 28px;">{chars_html}</div>'''
        '</div>'
    )

def init_model(value):
    """
    Initialize the model state for a new visualization.

    Args:
        value: The string value being visualized (not stored in model)
    """
    return {
        "selectionRegex": None,   # Regex pattern with / delimiters, e.g., "/(hello)(.*)(world)/"
        "anchorIdx": None,
        "anchorType": None,       # "literal" or "fuzzy" - determined when drag starts
        "cursorIdx": None,
        "dragging": False,
        "extendDirection": None,  # "left", "right", or None - which side we're extending from
        "insertAfterSegment": None,  # Segment index to insert after (for clicking inside fuzzy)
        "openDropdown": None,     # {"id": "fuzzy-pattern-0", "segmentIndex": 0} when dropdown is open
        "undoHistory": [],        # Stack of previous selectionRegex states
        "redoHistory": [],        # Stack for redo
        "handledKeys": ["Escape", "Enter", "cmd z", "cmd shift z"]  # Keys to intercept from VS Code
    }


def is_top_half(event_json):
    """Determine if mouse click was in top half of the target element."""
    offset_y = event_json.get('offsetY', 0)
    height = event_json.get('elementHeight', 1)
    return offset_y <= height / 2


def finalize_segment(model: dict, string_value: str) -> dict:
    """
    Finalize the in-progress segment and add it to selectionRegex.

    Commits the current anchor/cursor selection to the regex pattern,
    saves to undo history, and clears the in-progress state.

    Args:
        model: The model state
        string_value: The string being visualized
    """
    # Build the new regex using the same logic as preview
    new_regex = build_preview_regex(model, string_value)
    current_regex = model.get('selectionRegex')

    # Only update regex and undo history if something changed
    if new_regex != current_regex:
        model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
        model['redoHistory'] = []  # Clear redo on new action
        model['selectionRegex'] = new_regex

    # Always clear in-progress state
    model['anchorIdx'] = None
    model['cursorIdx'] = None
    model['extendDirection'] = None
    model['insertAfterSegment'] = None
    model['dragging'] = False
    return model


def update(event, source_code: str, source_line: int, model: dict, value: str) -> Tuple[dict, List[Any]]:
    """
    Update model based on event. Returns (new_model, commands) tuple.

    Args:
        event: The UI event to process
        source_code: The full source code of the file
        source_line: The line number where this value is visualized
        model: The current model state
        value: The string value being visualized

    Commands are actions for VS Code to execute, like NewCode to update the file.
    """
    commands: List[Any] = []

    # Event should have pythonEventStr and eventJSON
    if event is None or event.get('pythonEventStr', '') == '' or event.get('eventJSON', '') == '':
        return (model, commands)
    if model is None:
        model = init_model(value)

    make_python_event = eval(event['pythonEventStr'])
    event_json = event['eventJSON']
    msg = make_python_event(event_json) if callable(make_python_event) else make_python_event

    match msg:
        case MouseDown(index=idx):
            # Close any open dropdown when clicking elsewhere
            model['openDropdown'] = None

            selection_regex = model.get('selectionRegex')

            # Determine selection type based on top/bottom half of character
            anchor_type = 'literal' if is_top_half(event_json) else 'fuzzy'

            # Check extension points if we have an existing selection
            last_end: int | None = None
            first_start: int | None = None
            fuzzy_info: dict | None = None
            if selection_regex and isinstance(idx, int):
                last_end = get_last_segment_end_internal_idx(selection_regex, value)
                first_start = get_first_segment_start_internal_idx(selection_regex, value)
                fuzzy_info = find_fuzzy_segment_at_index(selection_regex, value, idx)

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
                model = init_model(value)
                if isinstance(idx, int):
                    model['anchorIdx'] = idx
                    model['anchorType'] = anchor_type
                    model['cursorIdx'] = idx
                model['extendDirection'] = None

            model['dragging'] = True

        case MouseMove(index=idx):
            if event_json.get('buttons') == 0:  # Mouse released outside widget
                model = finalize_segment(model, value)
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

                model = finalize_segment(model, value)

        case KeyDown():
            key = event_json.get('key')
            meta_key = event_json.get('metaKey', False)
            shift_key = event_json.get('shiftKey', False)

            if key == 'Enter':
                # Generate regex code if we have a selection
                selection_regex = model.get('selectionRegex')

                if selection_regex and source_code and source_line:
                    new_code = generate_regex_code_from_pattern(source_code, source_line, selection_regex)
                    commands.append(NewCode(code=new_code))

            elif key == 'Escape':
                # Close dropdown if open, otherwise clear selections
                if model.get('openDropdown'):
                    model['openDropdown'] = None
                else:
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

        case DropdownToggle(dropdown_id=did):
            # Toggle dropdown open/closed
            open_dropdown = model.get('openDropdown')
            if open_dropdown and open_dropdown.get('id') == did:
                # Already open, close it
                model['openDropdown'] = None
            else:
                # Open this dropdown, extract segment index from ID
                # ID format: "fuzzy-pattern-{segment_index}"
                parts = did.split('-')
                segment_index = int(parts[-1]) if parts[-1].isdigit() else 0
                model['openDropdown'] = {'id': did, 'segmentIndex': segment_index}

        case DropdownSelect(dropdown_id=did, option_value=pattern):
            # Select a pattern from the dropdown
            open_dropdown = model.get('openDropdown')
            if open_dropdown and open_dropdown.get('id') == did:
                segment_index = open_dropdown.get('segmentIndex', 0)
                current_regex = model.get('selectionRegex')
                if current_regex:
                    # Save to undo history
                    model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
                    model['redoHistory'] = []
                    # Replace the segment pattern
                    model['selectionRegex'] = replace_segment_pattern(current_regex, segment_index, pattern)
            # Close the dropdown
            model['openDropdown'] = None

    return (model, commands)
