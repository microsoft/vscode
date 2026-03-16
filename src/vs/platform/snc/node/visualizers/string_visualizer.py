"""
String visualizer for Sculpt-n-Code.

This visualizer displays Python string values with interactive selection capabilities,
allowing users to build regex patterns by demonstration.

================================================================================
ARCHITECTURE OVERVIEW
================================================================================

This visualizer follows the Elm architecture with three core functions:

1. visualize(value, model, get_visualizer) -> HTML string
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
- Pressing Enter generates regex code: list(re.finditer(r'pattern', var, flags=re.M))

MODEL STATE:
- search: Regex pattern with / delimiters in canonical form.
  All segments (literal and fuzzy) are ungrouped by default.
  Groups are only kept when two literal segments are adjacent,
  to disambiguate their boundary:
    e.g., "/hello.*world/" or "/(hello)(world).*/"
  The / prefix/suffix anticipates other search types (literal strings, globs).
- anchorIdx/cursorIdx: Current drag start/end positions (internal indices)
- anchorType: 'literal' or 'fuzzy' based on where the drag started
- dragging: Whether a drag is in progress

Note: The string value is NOT stored in the model. Instead, it is passed as
a parameter to init_model(value), update(..., value), and visualize(value, model, ...).

COMMANDS:
- NewCode(code): Tells VS Code to replace the file contents with new code
  (used when Enter is pressed to insert the generated regex line)

================================================================================
"""

import ast
import html
import os
import re
import re._parser as regex_parser  # type: ignore[import]
from re._constants import (  # type: ignore[import]
    AT_BEGINNING, AT_BEGINNING_STRING, AT_END, AT_END_STRING,
    MAXREPEAT,
)

from dataclasses import dataclass
from typing import List, Tuple, Any

from visualizer_utils import replace_caret_in_py_exp

# === Command types (Elm-style commands for VS Code to execute) ===

@dataclass(frozen=True, slots=True)
class CopyToClipboard:
    text: str

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

@dataclass(frozen=True, slots=True)
class MouseOut:
    pass

@dataclass(frozen=True, slots=True)
class HandleMouseDown:
    segment_index: int
    side: str  # 'left' or 'right'

@dataclass(frozen=True, slots=True)
class SearchBoxInput:
    value: str

@dataclass(frozen=True, slots=True)
class ReplaceBoxInput:
    value: str

@dataclass(frozen=True, slots=True)
class ReplaceToggle:
    pass

@dataclass(frozen=True, slots=True)
class FirstMatchToggle:
    pass

@dataclass(frozen=True, slots=True)
class CaseSensitiveToggle:
    pass

@dataclass(frozen=True, slots=True)
class CaptureGroupsToggle:
    pass

@dataclass(frozen=True, slots=True)
class ActionButtonClick:
    action: str  # 'get_transform', 'replace', 'delete', 'loop', 'any', 'all', 'if_any', 'if_all', 'count', 'filter', 'split'
    copy: bool   # True → CopyToClipboard, False → NewCode

@dataclass(frozen=True, slots=True)
class RepetitionInput:
    dropdown_id: str
    field: str  # 'exact', 'min', or 'max'
    value: str

# attached handlers can be Python code strings that evaluate to functions of type: RawEventJSON -> ModelEvent
# def mouse_move(i) -> Callable[[dict], MouseMove | MouseDown | MouseUp | KeyDown]:
#     return lambda _: MouseMove(i)


# eval(f"{MouseOver(10)}") works



# VS Code theme colors
STRING = "#ce9178"
GRAY = "#808080"

# A buncha icons
ICONS = {}

for icon in ["bin", "caps", "exists", "filter", "match-first", "regex-group", "split", "loop", "replace"]:
    with open(os.path.join(os.path.dirname(__file__), f'icons/{icon}.svg'), 'r') as f:
        ICONS[icon] = f.read().replace('<?xml version="1.0" encoding="utf-8"?>\n', '').replace('<svg ', '<svg class="search-icon"')

# Available fuzzy character class options for dropdown selection
# Each tuple is (pattern_value, display_label)
# Note: These are character classes only - repetition is handled separately
FUZZY_PATTERN_OPTIONS = [
    (r"\s", r"\s"),
    (r"\d", r"\d"),
    (r"[0-9\.]", r"[0-9\.]"),
    (r"[a-z]", r"[a-z]"),
    (r"[A-Z]", r"[A-Z]"),
    (r"[A-Za-z]", r"[A-Za-z]"),
    (r"[A-Za-z0-9]", r"[A-Za-z0-9]"),
    (r"\w", r"\w"),
    (r"\S", r"\S"),
    (r".", r"."),
    (r"[\S\s]", r"[\S\s]"),
]

# Sentinel characters for regex anchors (ASCII Device Control chars)
# These are inserted into an "augmented string" to enable 1:1 mapping
# between string positions and visual display indices
DC1 = chr(0x11)  # \A - start of string anchor
DC2 = chr(0x12)  # ^  - start of line anchor
DC3 = chr(0x13)  # $  - end of line anchor
DC4 = chr(0x14)  # \Z - end of string anchor

_SENTINEL_CHARS = [DC1, DC2, DC3, DC4]


def synthesize_fuzzy_pattern(actual_text: str, prev_char: str | None = '', next_char: str | None = '') -> str:
    """
    Synthesize a fuzzy regex pattern that matches exactly the given text.

    Enumerates patterns from FUZZY_PATTERN_OPTIONS and picks the most specific
    one that matches the dragged text, so the highlighted fuzzy segment
    corresponds precisely to the user's mouse drag distance.

    Step 1: Try each pattern with an open-ended quantifier:
            - For a fresh selection (both prev_char and next_char are strings),
              use + (one or more) so the regex won't match zero characters.
            - When adjacent to an existing literal segment (prev_char or
              next_char is None), use * (zero or more) since the literal
              already anchors the match.
            Skip if a non-None boundary character matches the pattern
            (the quantifier would overshoot that edge).
    Step 2: If none matched, try each with {n} repetition (e.g. \\d{3}).

    Args:
        actual_text: The actual string characters under the drag range
                     (sentinel chars should already be stripped).
        prev_char: The character immediately before the drag range, or ''
                   if at start of string. None if adjacent to an existing
                   literal segment on the left (suppresses + in favor of *).
        next_char: The character immediately after the drag range, or ''
                   if at end of string. None if adjacent to an existing
                   literal segment on the right (suppresses + in favor of *).

    Returns:
        A regex pattern string like "\\s+", "\\s*", "\\d{3}", or ".*".
    """
    if not actual_text:
        return ".*"

    n = len(actual_text)

    # Use + only for fresh selections (both boundaries are strings).
    # When adjacent to an existing literal (either is None), use *.
    is_fresh = prev_char is not None and next_char is not None
    quantifier = '+' if is_fresh else '*'

    # Step 1: Try open-ended quantifier (+ or *).
    # Prefer more specific character classes first.
    # Skip if a non-None boundary character matches (would overshoot).
    for pattern_str, _ in FUZZY_PATTERN_OPTIONS:
        try:
            if re.fullmatch(pattern_str + quantifier, actual_text):
                # Check right boundary (only when next_char is a string)
                if next_char and re.fullmatch(pattern_str, next_char):
                    continue
                # Check left boundary (only when prev_char is a string)
                if prev_char and re.fullmatch(pattern_str, prev_char):
                    continue
                return pattern_str + quantifier
        except Exception:
            continue

    # Step 2: Try {n} repetition
    for pattern_str, _ in FUZZY_PATTERN_OPTIONS:
        try:
            if re.fullmatch(pattern_str + '{' + str(n) + '}', actual_text):
                return pattern_str + '{' + str(n) + '}'
        except Exception:
            continue

    # Fallback (should be unreachable since [\S\s]{n} matches everything)
    return r"[\S\s]" + quantifier


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
    elif char == "'":
        return "\\'"
    else:
        return re.escape(char)


def span(text, color, style=''):
    return f'<span style="color: {color};{style}">{text}</span>'

def get_fields(value):
    return None


def can_visualize(value):
    return isinstance(value, str)


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
        f'<div class="snc-dropdown-panel" snc-dropdown-align="left">{"".join(options_html)}</div>'
    )

    # Wrap trigger and dropdown in a relative container
    return (
        f'<span class="snc-dropdown-trigger" style="position: relative; display: inline-block;">'
        f'{trigger_html}{dropdown_html}</span>'
    )


def _overlay_html(content: str, side: str, seg_type: str, color: str) -> str:
    """Generate an overlay span for pattern/repetition display.

    Args:
        content: The text to display in the overlay
        side: 'left' or 'right' positioning
        seg_type: 'literal' or 'fuzzy' - affects vertical positioning
        color: The color for the overlay text
    """
    if not content:
        return ''

    # return f'<span class="overlay-container {seg_type}"><span class="overlay-content {seg_type} side-{side}">{html.escape(content)}</span></span>'

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


def _fuzzy_dropdown_html(pat_str: str, segment_index: int, color: str, model: dict) -> str:
    """Generate a dropdown for fuzzy pattern selection.

    Args:
        pat_str: Current pattern string to display
        segment_index: Index of this segment (for dropdown ID)
        color: The color for the trigger text
        model: The model state (needed for dropdown open state)
    """
    dropdown_id = f'fuzzy-pattern-{segment_index}'
    open_dropdown = model.get('openDropdown') if model else None
    is_open = open_dropdown is not None and open_dropdown.get('id') == dropdown_id

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

def _char_span_dropdown_html(rep_str: str, segment_index: int, seg_type: str, color: str, model: dict) -> str:
    dropdown_id = f'dropdown-{segment_index}'
    open_dropdown = model.get('openDropdown') if model else None
    is_open = open_dropdown is not None and open_dropdown.get('id') == dropdown_id

    if not is_open:
        return (
            '<span class="char-span-anchor-container"></span>'
        )

    options_html = []

    for value, label in REPETITION_OPTIONS:
        select_event = repr(DropdownSelect(dropdown_id, value))
        option_html = (
            f'<div snc-mouse-down="{html.escape(select_event)}" '
            f'class="snc-dropdown-option">{html.escape(label)}</div>'
        )
        options_html.append(option_html)

    exact_n = open_dropdown.get('exactN', '') if open_dropdown else ''
    exact_input_event = f"lambda e: RepetitionInput(dropdown_id='{dropdown_id}', field='exact', value=e.get('value', ''))"
    options_html.append(
        f'<div class="snc-dropdown-option">'
        f'{{'
        f'<input class="snc-dropdown-input" type="text" snc-input="{html.escape(exact_input_event)}" '
        f'value="{html.escape(exact_n)}" '
        f'placeholder="n" />'
        f'}}'
        f'</div>'
    )

    range_min = open_dropdown.get('rangeMin', '') if open_dropdown else ''
    range_max = open_dropdown.get('rangeMax', '') if open_dropdown else ''
    min_input_event = f"lambda e: RepetitionInput(dropdown_id='{dropdown_id}', field='min', value=e.get('value', ''))"
    max_input_event = f"lambda e: RepetitionInput(dropdown_id='{dropdown_id}', field='max', value=e.get('value', ''))"
    options_html.append(
        f'<div class="snc-dropdown-option">'
        f'{{'
        f'<input class="snc-dropdown-input" type="text" snc-input="{html.escape(min_input_event)}" '
        f'value="{html.escape(range_min)}" '
        f'placeholder="n" />'
        f','
        f'<input class="snc-dropdown-input" type="text" snc-input="{html.escape(max_input_event)}" '
        f'value="{html.escape(range_max)}" '
        f'placeholder="n" />'
        f'}}'
        f'</div>'
    )

    # Fuzzy pattern
    pattern_options_html = []
    if seg_type == 'fuzzy':
        pattern_options_html = []
        for value, label in FUZZY_PATTERN_OPTIONS:
            select_event = repr(DropdownSelect(dropdown_id, value))
            option_html = (
                f'<div class="snc-dropdown-option" snc-mouse-down="{html.escape(select_event)}">{html.escape(label)}</div>'
            )
            pattern_options_html.append(option_html)

    repetition_html = (
        f' <div class="snc-dropdown-category">'
        f'  <div class="snc-dropdown-category-name">Repetition</div>'
        f'  {"".join(options_html)}'
        f' </div>'
    )

    pattern_html = (
        f' <div class="snc-dropdown-category-divider"></div>'
        f' <div class="snc-dropdown-category">'
        f'  <div class="snc-dropdown-category-name">Pattern</div>'
        f'  {"".join(pattern_options_html)}'
        f' </div>'
    ) if seg_type == 'fuzzy' else ''

    dropdown_panel = (
        f'<div class="snc-dropdown-panel categorized right" snc-dropdown-align="right">'
        f' {repetition_html}'
        f' {pattern_html}'
        f'</div>'
    )

    return (
        f'<span class="snc-dropdown-trigger">{dropdown_panel}</span>'
    )


def _repetition_dropdown_html(rep_str: str, segment_index: int, seg_type: str, color: str, model: dict) -> str:
    """Generate a clickable dropdown for repetition selection.

    Args:
        rep_str: Current repetition display string (e.g., '1', '*', '+')
        segment_index: Index of this segment (for dropdown ID)
        seg_type: 'literal' or 'fuzzy' - affects vertical positioning
        color: The color for the trigger text
        model: The model state (needed for dropdown open state)
    """
    dropdown_id = f'repetition-{segment_index}'
    open_dropdown = model.get('openDropdown') if model else None
    is_open = open_dropdown is not None and open_dropdown.get('id') == dropdown_id

    v_align = 'text-top' if seg_type == 'literal' else 'baseline'
    top = -7 if seg_type == 'literal' else 3

    trigger_style = (
        'position: absolute;'
        'right: 0px;'
        f'top: {top}px;'
        'font-size: 5px;'
        'font-style: normal;'
        'font-weight: bold;'
        'padding: 0;'
        f'color: {color};'
        'z-index: 10;'
        'line-height: 6px;'
    )

    if not is_open:
        trigger_event = repr(DropdownToggle(dropdown_id))
        return (
            f'<span style="position: relative; display: inline-block; vertical-align: {v_align}">'
            f'<span snc-mouse-down="{html.escape(trigger_event)}" '
            f'style="cursor: pointer; {trigger_style}">{html.escape(rep_str)}</span>'
            f'</span>'
        )

    trigger_event = repr(DropdownToggle(dropdown_id))
    trigger_html = (
        f'<span snc-mouse-down="{html.escape(trigger_event)}" '
        f'style="cursor: pointer; {trigger_style}">{html.escape(rep_str)}</span>'
    )

    options_html = []
    for value, label in REPETITION_OPTIONS:
        select_event = repr(DropdownSelect(dropdown_id, value))
        option_html = (
            f'<div snc-mouse-down="{html.escape(select_event)}" '
            f'class="snc-dropdown-option">{html.escape(label)}</div>'
        )
        options_html.append(option_html)

    exact_n = open_dropdown.get('exactN', '') if open_dropdown else ''
    exact_input_event = f"lambda e: RepetitionInput(dropdown_id='{dropdown_id}', field='exact', value=e.get('value', ''))"
    options_html.append(
        f'<div class="snc-dropdown-option">'
        f'{{'
        f'<input class="snc-dropdown-input" type="text" snc-input="{html.escape(exact_input_event)}" '
        f'value="{html.escape(exact_n)}" '
        f'placeholder="n" />'
        f'}}'
        f'</div>'
    )

    range_min = open_dropdown.get('rangeMin', '') if open_dropdown else ''
    range_max = open_dropdown.get('rangeMax', '') if open_dropdown else ''
    min_input_event = f"lambda e: RepetitionInput(dropdown_id='{dropdown_id}', field='min', value=e.get('value', ''))"
    max_input_event = f"lambda e: RepetitionInput(dropdown_id='{dropdown_id}', field='max', value=e.get('value', ''))"
    options_html.append(
        f'<div class="snc-dropdown-option">'
        f'{{'
        f'<input class="snc-dropdown-input" type="text" snc-input="{html.escape(min_input_event)}" '
        f'value="{html.escape(range_min)}" '
        f'placeholder="n" />'
        f','
        f'<input class="snc-dropdown-input" type="text" snc-input="{html.escape(max_input_event)}" '
        f'value="{html.escape(range_max)}" '
        f'placeholder="n" />'
        f'}}'
        f'</div>'
    )

    dropdown_panel = (
        f'<div class="snc-dropdown-panel right" snc-dropdown-align="right">{"".join(options_html)}</div>'
    )

    return (
        f'<span class="snc-dropdown-trigger" style="position: relative; display: inline-block; vertical-align: {v_align}">'
        f'{trigger_html}{dropdown_panel}</span>'
    )

HTML_ESCAPE_CHARS = '<>&\'"'

def text_group_span(chars: list, start_index: int) -> str:
    text = ''.join(html.escape(c) if c in HTML_ESCAPE_CHARS else c for c in chars)
    return f'<span class="string-visualizer-text-group" snc-text-start="{start_index}">{text}</span>'

def char_span(string, index, is_special, highlight=None, model=None):
    return ''.join(char_span_els(string, index, is_special, highlight, model))

def char_span_els(string, index, is_special, highlight=None, model=None) -> List[str]:
    """Render a character span with optional selection highlighting.

    Args:
        string: The character(s) to display
        index: The internal index for this character
        is_special: Whether this is a special character (anchor, escape sequence)
        highlight: None or a highlight tuple (start, end, type, pattern_display, repetition, segment_index)
        model: The model state (needed for dropdown open state)
    """
    # styles = f'color:{GRAY};' if is_special else ''
    pat_html = ''
    repetition_html = ''
    classes = ['char-span']
    dropdown_id = None

    if (is_special):
        classes.append('is-special')

    if highlight is not None:
        start, end, seg_type, pat_str, (min_count, max_count), segment_index = highlight
        color = '#00aeff' if seg_type == 'literal' else '#868686'
        classes.append('highlight')
        classes.append(f'{seg_type}')

        # styles += f' border-{"top" if seg_type == "literal" else "bottom"}: 1px solid {color}; border-image: linear-gradient(to {"bottom" if seg_type == "literal" else "top"}, {color} 20%, transparent 20%) 1;'
        is_interactive = segment_index is not None

        if is_interactive:
            classes.append('is-interactive')
            dropdown_id = f'dropdown-{segment_index}'

        if start == index:
            classes.append('start')
            # styles += f' border-left: 1px solid {color}; margin-left: -1px;'
            if is_interactive:
                # if seg_type == 'fuzzy':
                #     pat_html = f'<span style="position: relative; display: inline-block; vertical-align: baseline">{_fuzzy_dropdown_html(pat_str, segment_index, color, model)}</span>'
                # else:
                #     pat_html = "" # _overlay_html(pat_str, 'left', seg_type, color)
                left_handle_event = repr(HandleMouseDown(segment_index=segment_index, side='left'))
                pat_html += (
                    '<span class="char-span-start-handle-container">'
                    f'<span class="char-span-resize-handle left" snc-mouse-down="{html.escape(left_handle_event)}"></span></span>'
                )
        if end - 1 == index:
            classes.append('end')
            # styles += f' border-right: 1px solid {color}; padding-right: 0px;'
            if is_interactive:
            #     if min_count == max_count:
            #         rep_str = f'{min_count}'
            #     elif min_count == 0 and max_count == float('inf'):
            #         rep_str = '*'
            #     elif min_count == 1 and max_count == float('inf'):
            #         rep_str = '+'
            #     elif min_count == 0 and max_count == 1:
            #         rep_str = '?'
            #     elif min_count == 0:
            #         rep_str = f'≤{max_count}'
            #     elif max_count == float('inf'):
            #         rep_str = f'≥{min_count}'
            #     else:
            #         rep_str = f'{min_count}-{max_count}'
                repetition_html = _char_span_dropdown_html('', segment_index, seg_type, color, model)
                if seg_type == 'literal':
                    right_handle_event = repr(HandleMouseDown(segment_index=segment_index, side='right'))
                    repetition_html += (
                        '<span class="char-span-start-handle-container">'
                        f'<span class="char-span-resize-handle right" snc-mouse-down="{html.escape(right_handle_event)}"></span></span>'
                    )
    elif model is not None and model.get('hoverIdx') == index and not model.get('dragging'):
        classes.append('hover')

    mouse_listener = f'snc-mouse-down="{html.escape(repr(DropdownToggle(dropdown_id)))}"' if dropdown_id else f'snc-mouse="{str(index)}"'

    # snc-mouse="5" is shorthand for snc-mouse-move="MouseMove(5)" snc-mouse-down="MouseDown(5)" snc-mouse-up="MouseUp(5)"
    # (this abbreviation speeds up the string visualization quite a bit)
    if pat_html or repetition_html: # yes this branching speeds it up slightly
        # return f'{pat_html}<span snc-mouse="{index}" style="padding-right:1px;{styles}">{html.escape(string) if string in HTML_ESCAPE_CHARS else string}</span>{repetition_html}'
        # return [pat_html, '<span snc-mouse="', str(index), '" style="height:100%;display:inline-block"><span style="padding-right:1px;', styles, '">', html.escape(string) if string in HTML_ESCAPE_CHARS else string, '</span></span>', repetition_html]
        return [pat_html, f'<span class="char-span-container" {mouse_listener}><span class="{" ".join(classes)}">', html.escape(string) if string in HTML_ESCAPE_CHARS else string, '</span></span>', repetition_html]
    else:
        # Yes, keep {styles} bc string interning, I think
        # return f'<span snc-mouse="{index}" style="padding-right:1px;{styles}">{html.escape(string) if string in HTML_ESCAPE_CHARS else string}</span>'
        return [f'<span class="char-span-container" {mouse_listener}><span class="{" ".join(classes)}">', html.escape(string) if string in HTML_ESCAPE_CHARS else string, '</span></span>']


    # return f'{pat_html}<span snc-mouse="{index}" style="padding-right:1px;{styles}">{html.escape(string) if string in HTML_ESCAPE_CHARS else string}</span>{repetition_html}'
    # index_str = str(index)
    # return f'{pat_html}<span snc-mouse-move="MouseMove({index_str})" snc-mouse-down="MouseDown({index_str})" snc-mouse-up="MouseUp({index_str})" style="color:{GRAY if is_special else STRING};padding-right:1px;{styles}">{html.escape(string) if string in HTML_ESCAPE_CHARS else string}</span>{repetition_html}'

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

    The result is canonicalized: literal segments are ungrouped unless
    adjacent to another literal segment.  Postfix flags (i, 1, c, etc.)
    are preserved and the 'c' flag keeps all groups.

    Args:
        current_regex: Current regex pattern with / delimiters (canonical form) or None
        segment_type: 'literal' or 'fuzzy'
        text: The text to add (from augmented string, may contain sentinel chars)

    Returns:
        Canonicalized regex pattern with the segment appended, e.g., "/hello(.*)/"
    """
    if current_regex is None:
        inner_pattern = ""
        flags = ""
    else:
        inner_pattern = get_regex_inner_pattern(current_regex) or ""
        flags = get_search_flags(current_regex)

    if segment_type == 'literal':
        regex_parts = [char_to_regex_literal(char) for char in text]
        new_segment = f"({''.join(regex_parts)})"
    else:  # fuzzy
        new_segment = f"({text})" if text else "(.*)"

    result = canonicalize_regex(f"/{inner_pattern}{new_segment}/")
    assert result is not None
    result = result + flags
    if 'c' in flags:
        result = ensure_all_groups(result)
    return result


def prepend_segment_to_regex(current_regex: str | None, segment_type: str, text: str) -> str:
    """
    Prepend a new segment to the beginning of the regex pattern.

    Similar to append_segment_to_regex but inserts at the start.
    Used when extending selections from the left side.
    The result is canonicalized.  Postfix flags are preserved.

    Args:
        current_regex: Current regex pattern with / delimiters (canonical form) or None
        segment_type: 'literal' or 'fuzzy'
        text: The text to add (from augmented string, may contain sentinel chars)

    Returns:
        Canonicalized regex pattern with the segment prepended.
    """
    if current_regex is None:
        inner_pattern = ""
        flags = ""
    else:
        inner_pattern = get_regex_inner_pattern(current_regex) or ""
        flags = get_search_flags(current_regex)

    if segment_type == 'literal':
        regex_parts = [char_to_regex_literal(char) for char in text]
        new_segment = f"({''.join(regex_parts)})"
    else:  # fuzzy
        new_segment = f"({text})" if text else "(.*)"

    result = canonicalize_regex(f"/{new_segment}{inner_pattern}/")
    assert result is not None
    result = result + flags
    if 'c' in flags:
        result = ensure_all_groups(result)
    return result


def insert_segment_at_position(current_regex: str | None, position: int, segment_type: str, text: str) -> str:
    """
    Insert a new segment at a specific position in the regex pattern.

    Used when clicking inside a fuzzy segment to split/anchor it. The position
    determines where in the regex the new segment goes to maintain text order.
    Postfix flags are preserved.

    Args:
        current_regex: Current regex pattern with / delimiters (e.g., "/(.*)world/") or None
        position: The 0-based position to insert at (0 = prepend, len = append)
        segment_type: 'literal' or 'fuzzy'
        text: The text to add (from augmented string, may contain sentinel chars)

    Returns:
        New regex pattern with the segment inserted at the given position (canonicalized).
    """
    if current_regex is None:
        return append_segment_to_regex(None, segment_type, text)

    if segment_type == 'literal':
        regex_parts = [char_to_regex_literal(char) for char in text]
        new_segment_text = ''.join(regex_parts)
    else:  # fuzzy
        new_segment_text = text if text else '.*'

    inner_pattern = get_regex_inner_pattern(current_regex) or ""
    flags = get_search_flags(current_regex)
    segments = parse_all_segments(inner_pattern)

    new_seg = {'text': new_segment_text, 'is_grouped': True}

    if position <= 0:
        segments.insert(0, new_seg)
    elif position >= len(segments):
        segments.append(new_seg)
    else:
        segments.insert(position, new_seg)

    fully_grouped = '/' + ''.join(f"({s['text']})" for s in segments) + '/'
    result = canonicalize_regex(fully_grouped)
    assert result is not None
    result = result + flags
    if 'c' in flags:
        result = ensure_all_groups(result)
    return result


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
    Replace the character class of a specific segment, preserving its quantifier.

    Used when selecting a different fuzzy pattern from the dropdown.
    Postfix flags are preserved.

    Args:
        selection_regex: Current regex with / delimiters (canonical form)
        segment_index: 0-based index of the segment to replace (matches highlight segment indices)
        new_char_class: The new character class (e.g., r"\\s", r"\\d", r"[a-z]")
                        Note: This should NOT include a quantifier.

    Returns:
        New regex pattern with the segment's character class replaced,
        but its quantifier preserved (canonicalized).
    """
    inner_pattern = get_regex_inner_pattern(selection_regex) or ""
    flags = get_search_flags(selection_regex)

    segments = parse_all_segments(inner_pattern)

    if 0 <= segment_index < len(segments):
        old_text = segments[segment_index]['text']
        _, quantifier = extract_quantifier(old_text)
        segments[segment_index] = {'text': f'{new_char_class}{quantifier}', 'is_grouped': True}

    fully_grouped = '/' + ''.join(f"({s['text']})" for s in segments) + '/'
    result = canonicalize_regex(fully_grouped)
    assert result is not None
    result = result + flags
    if 'c' in flags:
        result = ensure_all_groups(result)
    return result


def _is_single_atom(pattern: str) -> bool:
    """Check if a regex pattern is a single atom that can have a quantifier applied directly.

    Single atoms include: ., \s, \d, \w, [a-z], h, \n, etc.
    Multi-atom patterns like 'hello' or '\nhello' need a (?:...) wrapper for group repetition.

    Args:
        pattern: A regex pattern string (without quantifier)

    Returns:
        True if the pattern is a single regex atom.
    """
    try:
        parsed = list(regex_parser.parse(pattern))
        return len(parsed) == 1
    except Exception:
        return False


# Available repetition options for dropdown selection
# Each tuple is (quantifier_value, display_label)
REPETITION_OPTIONS = [
    ('1', '1'),
    ('?', '?'),
    ('*', '*'),
    ('+', '+'),
]


def replace_segment_repetition(selection_regex: str, segment_index: int, new_quantifier: str) -> str:
    """
    Replace the quantifier of a specific segment, preserving its base pattern.

    For single-atom patterns (., \\s, [a-z], single char), the quantifier is applied directly.
    For multi-atom patterns (hello, \\nhello), wraps in (?:...) when adding a quantifier,
    and unwraps when removing.  Postfix flags are preserved.

    Args:
        selection_regex: Current regex with / delimiters (canonical form)
        segment_index: 0-based index of the segment to modify
        new_quantifier: New quantifier string ('', '?', '*', '+', '{n}', '{n,m}')
                        Use '' to remove the quantifier (exactly 1 match).

    Returns:
        New regex pattern with the segment's quantifier replaced,
        but its base pattern preserved (canonicalized).
    """
    inner_pattern = get_regex_inner_pattern(selection_regex) or ""
    flags = get_search_flags(selection_regex)

    segments = parse_all_segments(inner_pattern)

    if 0 <= segment_index < len(segments):
        old_text = segments[segment_index]['text']
        base, _ = extract_quantifier(old_text)

        raw_base = base
        if raw_base.startswith('(?:') and raw_base.endswith(')'):
            raw_base = raw_base[3:-1]

        if new_quantifier == '':
            new_text = raw_base
        else:
            if _is_single_atom(raw_base):
                new_text = f'{raw_base}{new_quantifier}'
            else:
                new_text = f'(?:{raw_base}){new_quantifier}'

        segments[segment_index] = {'text': new_text, 'is_grouped': True}

    fully_grouped = '/' + ''.join(f"({s['text']})" for s in segments) + '/'
    result = canonicalize_regex(fully_grouped)
    assert result is not None
    result = result + flags
    if 'c' in flags:
        result = ensure_all_groups(result)
    return result


def resize_literal_segment(selection_regex: str, segment_index: int, string_value: str,
                           new_start: int, new_end: int) -> str:
    """
    Resize a literal segment to cover [new_start, new_end) in internal indices.

    Extracts text from string_value at the given internal indices, converts each
    character to its regex literal form, and replaces the specified segment's content.
    Postfix flags are preserved.

    Args:
        selection_regex: Regex with / delimiters, e.g., "/(hello)/" or "/hello/"
        segment_index: 0-based index of the segment to resize
        string_value: The string being visualized
        new_start: New start internal index (inclusive)
        new_end: New end internal index (exclusive)

    Returns:
        New regex pattern with the segment resized, or original if range is empty.
    """
    if new_end <= new_start:
        return selection_regex

    text = extract_by_internal_indices(string_value, new_start, new_end)

    regex_parts = [char_to_regex_literal(char) for char in text]
    new_content = ''.join(regex_parts)

    inner_pattern = get_regex_inner_pattern(selection_regex) or ""
    flags = get_search_flags(selection_regex)
    segments = parse_all_segments(inner_pattern)

    if not segments or segment_index >= len(segments):
        return selection_regex

    segments[segment_index]['text'] = new_content

    parts = []
    for seg in segments:
        if seg['is_grouped']:
            parts.append(f"({seg['text']})")
        else:
            parts.append(seg['text'])

    result = f"/{''.join(parts)}/" + flags
    if 'c' in flags:
        result = ensure_all_groups(result)
    return result


# Valid string literal prefixes (lowercase); checked case-insensitively
_STRING_PREFIXES = {'', 'f', 'r', 'b', 'u', 'fr', 'rf', 'br', 'rb'}


def _find_closing_delimiter(search: str | None) -> int | None:
    """Find the index just past the closing delimiter of a search string.

    Supports regex (/pattern/), Python string literals ('str', "str",
    triple-quoted, with f/r/b/u prefixes), and backtick expressions (`expr`).

    Returns None if no valid closing delimiter is found.
    """
    if not search:
        return None

    # Regex: /pattern/ — find the LAST slash (flags never contain /)
    if search[0] == '/':
        idx = search.rfind('/')
        return idx + 1 if idx > 0 else None

    # Backtick expression: `expr`
    if search[0] == '`':
        idx = search.find('`', 1)
        return idx + 1 if idx > 0 else None

    # String literal: optional prefix + quote
    prefix_end = 0
    lower = search.lower()
    for length in (2, 1):
        candidate = lower[:length]
        if candidate in _STRING_PREFIXES and candidate != '':
            prefix_end = length
            break

    if prefix_end >= len(search):
        return None

    rest = search[prefix_end:]
    is_raw = 'r' in lower[:prefix_end]

    # Detect quote style
    if rest.startswith("'''") or rest.startswith('"""'):
        quote = rest[:3]
        scan_start = 3
    elif rest[0] in ("'", '"'):
        quote = rest[0]
        scan_start = 1
    else:
        return None

    triple = len(quote) == 3
    i = scan_start
    while i < len(rest):
        if not is_raw and rest[i] == '\\' and i + 1 < len(rest):
            i += 2
            continue
        if triple:
            if rest[i:i + 3] == quote:
                return prefix_end + i + 3
        else:
            if rest[i] == quote:
                return prefix_end + i + 1
        i += 1

    return None


def _is_valid_python_expression(s: str) -> bool:
    """Check if s parses as a valid Python expression."""
    try:
        ast.parse(s, mode='eval')
        return True
    except SyntaxError:
        return False


def parse_slice_parts(search: str | None) -> tuple | None:
    """Try to parse search as a slice expression (e.g. '5:', ':5', '5:10', 'x:10').

    For each ':' in the search string, split into left/right. If both sides
    are blank or parse as valid Python expressions, return (left, right).
    Returns None if no valid slice split is found.

    Uses the same guess-and-check approach as replace_caret_in_py_exp.
    """
    if not search:
        return None
    for i, ch in enumerate(search):
        if ch == ':':
            left = search[:i]
            right = search[i + 1:]
            left_ok = (left == '' or _is_valid_python_expression(left))
            right_ok = (right == '' or _is_valid_python_expression(right))
            if left_ok and right_ok:
                return (left, right)
    return None


def is_regex_search(search: str | None) -> bool:
    """Check if the search string is a regex search."""
    p = parse_search_term(search)
    return p is not None and p[0] == 'regex'


def is_slice_search(search: str | None) -> bool:
    """Check if the search is a slice expression like '5:', ':10', '5:10'."""
    p = parse_search_term(search)
    return p is not None and p[0] == 'slice'


def get_search_flags(search: str | None) -> str:
    """Extract postfix flags from a search string."""
    p = parse_search_term(search)
    return p[2] if p else ''


def is_first_match_mode(search: str | None) -> bool:
    """Check if the search is in first-match mode ('1' in postfix flags)."""
    return '1' in get_search_flags(search)


def is_case_insensitive(search: str | None) -> bool:
    """Check if the search is case-insensitive ('i' in postfix flags)."""
    return 'i' in get_search_flags(search)


def is_capture_groups_mode(search: str | None) -> bool:
    """Check if the search has capture groups preserved ('c' in postfix flags)."""
    return 'c' in get_search_flags(search)


def parse_search_term(search: str | None) -> tuple | None:
    """Parse any search string into (kind, term, flags).

    Returns None for empty or None inputs.
    kind is one of 'regex', 'string', 'slice', 'expr'.
    term is the extracted content:
      - regex: inner pattern (between / delimiters)
      - string: the literal including quotes (e.g. "'hello'")
      - slice: (start, stop) tuple
      - expr: expression text (backtick content or bare text)
    flags is the postfix flags string (e.g. '1i').
    """
    if not search:
        return None
    if search[0] == '/':
        end = _find_closing_delimiter(search)
        if end is not None:
            return ('regex', search[1:end - 1], search[end:])
        return ('regex', search[1:], '')
    if search[0] == '`':
        end = _find_closing_delimiter(search)
        if end is not None:
            return ('expr', search[1:end - 1], search[end:])
        return ('expr', search[1:], '')
    end = _find_closing_delimiter(search)
    if end is not None:
        return ('string', search[:end], search[end:])
    parts = parse_slice_parts(search)
    if parts is not None:
        return ('slice', parts, '')
    return ('expr', search, '')


def get_regex_inner_pattern(search: str | None) -> str | None:
    """Extract the inner pattern from a regex search (strips / delimiters and flags)."""
    p = parse_search_term(search)
    return p[1] if p and p[0] == 'regex' else None


def eval_string_search(search: str | None) -> str | None:
    """Evaluate the string literal in a search to get the actual Python string value.

    Returns None if not a string search or if evaluation fails.
    """
    p = parse_search_term(search)
    if not p or p[0] != 'string':
        return None
    try:
        result = eval(p[1])
        if isinstance(result, (str, bytes)):
            return result if isinstance(result, str) else result.decode('utf-8', errors='replace')
        return None
    except Exception:
        return None


def _toggle_search_flag(search: str, flag_char: str) -> str:
    """Toggle a single flag character in the postfix of a search string.

    Bare text (no delimiters) is wrapped in backticks before adding a flag.
    """
    end = _find_closing_delimiter(search)
    if end is None:
        # Bare text: wrap in backticks so we can append a flag
        search = f'`{search}`'
        end = len(search)
    prefix = search[:end]
    flags = search[end:]
    if flag_char in flags:
        flags = flags.replace(flag_char, '')
    else:
        flags += flag_char
    return prefix + flags


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


def parse_top_level_segments(inner_pattern: str) -> list:
    """Parse a regex inner pattern into top-level segments by parentheses.

    A segment is either:
    - Ungrouped content (literal text, anchors, fuzzy patterns not wrapped in parens)
    - A top-level parenthesized group

    Returns list of dicts with:
    - 'text': Content (without outer parens for grouped segments)
    - 'is_grouped': Whether the segment was wrapped in parentheses

    Note: ungrouped content may contain mixed literal/fuzzy patterns (e.g., 'hello.*world').
    Use parse_all_segments() if you need each literal/fuzzy region as a separate segment.

    Examples:
        'hello.*world'    -> [{'text':'hello.*world','is_grouped':False}]
        '(hello)(world)'  -> [{'text':'hello','is_grouped':True}, {'text':'world','is_grouped':True}]
        'hello(.*)'       -> [{'text':'hello','is_grouped':False}, {'text':'.*','is_grouped':True}]
    """
    if not inner_pattern:
        return []

    segments = []
    depth = 0
    group_start = None
    last_end = 0
    i = 0

    while i < len(inner_pattern):
        char = inner_pattern[i]

        if char == '\\':
            # Skip escaped character
            i += 2
            continue

        if char == '(':
            if depth == 0:
                # Capture ungrouped content before this group
                if i > last_end:
                    segments.append({'text': inner_pattern[last_end:i], 'is_grouped': False})
                group_start = i
            depth += 1
        elif char == ')':
            depth -= 1
            if depth == 0:
                segments.append({'text': inner_pattern[group_start + 1:i], 'is_grouped': True})
                last_end = i + 1

        i += 1

    # Capture trailing ungrouped content
    if last_end < len(inner_pattern):
        segments.append({'text': inner_pattern[last_end:], 'is_grouped': False})

    return segments


# --- String-level helpers for splitting ungrouped regex content ---

def _is_fuzzy_start(text: str, pos: int) -> int | None:
    """Check if position starts a fuzzy base pattern (wildcard).

    Returns end position of the base pattern, or None if not a fuzzy start.
    Recognizes: . (any), \\s \\S \\d \\D \\w \\W (shorthand classes), [...] (char classes).
    """
    if pos >= len(text):
        return None

    c = text[pos]

    # . (any character) - but not \\. (escaped dot)
    if c == '.':
        return pos + 1

    # Shorthand character classes: \s \S \d \D \w \W
    if c == '\\' and pos + 1 < len(text) and text[pos + 1] in 'sSwWdD':
        return pos + 2

    # Character class [...]
    if c == '[':
        j = pos + 1
        if j < len(text) and text[j] == '^':
            j += 1  # negation
        if j < len(text) and text[j] == ']':
            j += 1  # ] at start of class is literal
        while j < len(text):
            if text[j] == '\\' and j + 1 < len(text):
                j += 2
                continue
            if text[j] == ']':
                return j + 1
            j += 1
        return None  # Unclosed [

    return None


def _skip_quantifier(text: str, pos: int) -> int:
    """Skip a quantifier at the given position. Returns new position (unchanged if no quantifier)."""
    if pos >= len(text):
        return pos

    c = text[pos]
    if c in '*+?':
        pos += 1
        # Lazy modifier?
        if pos < len(text) and text[pos] == '?':
            pos += 1
        return pos

    if c == '{':
        j = pos + 1
        while j < len(text) and (text[j].isdigit() or text[j] == ','):
            j += 1
        if j < len(text) and text[j] == '}':
            j += 1
            # Lazy modifier?
            if j < len(text) and text[j] == '?':
                j += 1
            return j

    return pos


def _skip_literal_unit(text: str, pos: int) -> int:
    """Skip one literal unit (char or escape sequence) at the given position."""
    if pos >= len(text):
        return pos
    if text[pos] == '\\' and pos + 1 < len(text):
        return pos + 2
    return pos + 1


def _split_ungrouped_into_segments(text: str) -> list:
    """Split ungrouped pattern text into separate literal and fuzzy segments.

    Fuzzy patterns are wildcard bases (., \\s, \\d, \\w, [...]) with optional quantifiers.
    Everything else is literal.

    Returns list of segment text strings.
    E.g., 'hello.*world' -> ['hello', '.*', 'world']
          'hello'         -> ['hello']
          '.*'            -> ['.*']
          '.*\\s+'        -> ['.*', '\\s+']
    """
    if not text:
        return []

    segments = []
    i = 0
    literal_start = 0

    while i < len(text):
        fuzzy_base_end = _is_fuzzy_start(text, i)
        if fuzzy_base_end is not None:
            # Flush accumulated literal
            if i > literal_start:
                segments.append(text[literal_start:i])
            # Consume fuzzy base + optional quantifier
            fuzzy_end = _skip_quantifier(text, fuzzy_base_end)
            segments.append(text[i:fuzzy_end])
            i = fuzzy_end
            literal_start = i
        else:
            # Skip one literal unit
            i = _skip_literal_unit(text, i)

    # Flush remaining literal
    if literal_start < len(text):
        segments.append(text[literal_start:len(text)])

    return segments


def parse_all_segments(inner_pattern: str) -> list:
    """Parse a regex inner pattern into all segments, splitting ungrouped fuzzy/literal.

    Like parse_top_level_segments, but also splits ungrouped content at fuzzy/literal
    boundaries. The number of segments returned matches the number of capture groups
    produced by _to_fully_grouped_inner().

    Returns list of dicts with 'text' and 'is_grouped'.

    Examples:
        'hello.*world'    -> [{'text':'hello','is_grouped':False}, {'text':'.*','is_grouped':False}, {'text':'world','is_grouped':False}]
        '(hello)(world)'  -> [{'text':'hello','is_grouped':True}, {'text':'world','is_grouped':True}]
        '.*(hello)(world)' -> [{'text':'.*','is_grouped':False}, {'text':'hello','is_grouped':True}, {'text':'world','is_grouped':True}]
    """
    string_segments = parse_top_level_segments(inner_pattern)
    all_segments = []
    for seg in string_segments:
        if seg['is_grouped']:
            all_segments.append(seg)
        else:
            sub_texts = _split_ungrouped_into_segments(seg['text'])
            for st in sub_texts:
                all_segments.append({'text': st, 'is_grouped': False})
    return all_segments


def canonicalize_regex(selection_regex: str | None) -> str | None:
    """Simplify a selection regex by removing unnecessary top-level groups.

    The canonical form removes groups from ALL segments (literal and fuzzy) unless
    two non-fuzzy (literal) segments are adjacent, in which case both keep groups
    to disambiguate their boundary.

    Examples:
        '/(hello)(.*)(world)/' -> '/hello.*world/'     (no adjacent literals)
        '/(hello)(world)/'     -> '/(hello)(world)/'   (adjacent literals need groups)
        '/(hello)(world)(.*)/' -> '/(hello)(world).*/' (hello/world adjacent, .* not)

    This is idempotent: canonicalizing an already-canonical regex returns the same result.
    """
    if selection_regex is None:
        return None

    inner = selection_regex[1:-1]  # Strip / delimiters
    if not inner:
        return selection_regex

    segments = parse_all_segments(inner)
    if not segments:
        return selection_regex

    # Analyze each segment for fuzziness
    for seg in segments:
        try:
            parsed = regex_parser.parse(seg['text'])
            _, is_fuzzy, _, _ = _analyze_group(list(parsed))
            seg['is_fuzzy'] = is_fuzzy
        except Exception:
            seg['is_fuzzy'] = False

    # Determine which segments need groups:
    # Only non-fuzzy (literal) segments adjacent to another non-fuzzy segment need groups.
    # Fuzzy segments never need groups (their pattern structure is always distinguishable).
    needs_group = [False] * len(segments)

    for i in range(len(segments) - 1):
        if not segments[i]['is_fuzzy'] and not segments[i + 1]['is_fuzzy']:
            needs_group[i] = True
            needs_group[i + 1] = True

    # Rebuild
    parts = []
    for i, seg in enumerate(segments):
        # A segment must also keep its group if it contains non-capturing groups
        # like (?:hello)+, because ungrouping would cause parse_top_level_segments
        # to misinterpret the non-capturing group parens as a top-level group.
        needs_explicit = '(?' in seg['text']
        if needs_group[i] or needs_explicit:
            parts.append(f"({seg['text']})")
        else:
            parts.append(seg['text'])

    return f"/{''.join(parts)}/"


def ensure_all_groups(regex: str | None) -> str | None:
    """Convert a regex to fully-grouped form, preserving postfix flags.

    Every segment (literal and fuzzy) gets wrapped in a capturing group.
    Non-regex inputs pass through unchanged.
    """
    if regex is None or not is_regex_search(regex):
        return regex
    inner = get_regex_inner_pattern(regex)
    if not inner:
        return regex
    flags = get_search_flags(regex)
    grouped = _to_fully_grouped_inner(inner)
    return f'/{grouped}/' + flags


def _to_fully_grouped_inner(inner_pattern: str) -> str:
    """Convert a (possibly canonical) inner pattern to fully-grouped form.

    Every segment (grouped or ungrouped) is wrapped in a capturing group.
    Ungrouped content is split at fuzzy/literal boundaries so each region
    becomes its own group. Used internally for regex matching.

    Examples:
        'hello.*world'     -> '(hello)(.*)(world)'
        '(hello)(world)'   -> '(hello)(world)'  (already fully grouped)
        'hello'            -> '(hello)'
        '.*(hello)(world)' -> '(.*)(hello)(world)'
    """
    string_segments = parse_top_level_segments(inner_pattern)
    if not string_segments:
        return inner_pattern

    result_parts = []
    for seg in string_segments:
        if seg['is_grouped']:
            result_parts.append(f"({seg['text']})")
        else:
            # Split ungrouped content into sub-segments at fuzzy/literal boundaries
            sub_texts = _split_ungrouped_into_segments(seg['text'])
            for st in sub_texts:
                result_parts.append(f"({st})")

    return ''.join(result_parts) if result_parts else inner_pattern


def _literal_match_highlights(search_text: str, string_value: str,
                              first_match_only: bool, re_flags: int) -> list:
    """Produce highlight tuples by matching a literal string against the value.

    All highlights are display-only (segment_index=None) since non-regex
    searches have no interactive segments.
    """
    escaped = re.escape(search_text)

    try:
        if first_match_only:
            m = re.search(escaped, string_value, flags=re_flags)
            matches = [m] if m else []
        else:
            matches = list(re.finditer(escaped, string_value, flags=re_flags))
    except Exception:
        return []

    if not matches:
        return []

    str_to_internal = build_string_to_internal_mapping(string_value)
    highlights = []

    for match in matches:
        str_start, str_end = match.span()
        if str_start == str_end:
            continue
        internal_start = str_to_internal[str_start] if str_start < len(str_to_internal) else 2
        if str_end > 0 and str_end <= len(str_to_internal):
            internal_end = str_to_internal[str_end - 1] + 1
            if str_end - 1 < len(string_value) and string_value[str_end - 1] == '\n':
                internal_end += 1
        else:
            internal_end = str_to_internal[-1] if str_to_internal else 2
        highlights.append((internal_start, internal_end, 'literal', search_text, (1, 1), None))

    return highlights


def _string_search_highlights(search: str, string_value: str) -> list:
    """Produce highlight tuples for a literal string search."""
    search_text = eval_string_search(search)
    if not search_text:
        return []
    return _literal_match_highlights(
        search_text, string_value,
        is_first_match_mode(search),
        re.I if is_case_insensitive(search) else 0)


def _index_highlight(index_val: int, string_value: str) -> list:
    """Produce a single highlight tuple for str[index_val].

    Returns [] if index is out of bounds.
    """
    n = len(string_value)
    if n == 0:
        return []
    if index_val < -n or index_val >= n:
        return []
    normalized = index_val % n
    str_to_internal = build_string_to_internal_mapping(string_value)
    internal_start = str_to_internal[normalized]
    internal_end = internal_start + 1
    if string_value[normalized] == '\n':
        internal_end += 1
    return [(internal_start, internal_end, 'literal', str(index_val), (1, 1), None)]


def _slice_search_highlights(search: str, string_value: str, eval_in_scope) -> list:
    """Produce highlight tuples for a slice search expression.

    Evaluates slice bounds in the user's scope and highlights the resulting range.
    """
    parts = parse_slice_parts(search)
    if parts is None:
        return []
    left, right = parts
    try:
        start = eval_in_scope(left) if left else None
        stop = eval_in_scope(right) if right else None
    except Exception:
        return []
    if start is not None and not isinstance(start, int):
        return []
    if stop is not None and not isinstance(stop, int):
        return []

    n = len(string_value)
    sliced = string_value[start:stop]
    if not sliced:
        return []

    actual_start = (start if start is not None else 0)
    if actual_start < 0:
        actual_start = max(actual_start + n, 0)
    actual_stop = (stop if stop is not None else n)
    if actual_stop < 0:
        actual_stop = max(actual_stop + n, 0)
    actual_stop = min(actual_stop, n)
    actual_start = min(actual_start, n)
    if actual_start >= actual_stop:
        return []

    str_to_internal = build_string_to_internal_mapping(string_value)
    internal_start = str_to_internal[actual_start]
    if actual_stop > 0 and actual_stop <= len(str_to_internal):
        internal_end = str_to_internal[actual_stop - 1] + 1
        if actual_stop - 1 < n and string_value[actual_stop - 1] == '\n':
            internal_end += 1
    else:
        internal_end = str_to_internal[-1] if str_to_internal else 2

    display = f'{left}:{right}'
    return [(internal_start, internal_end, 'literal', display, (1, 1), None)]


def _expression_search_highlights(search: str, string_value: str, eval_in_scope) -> list:
    """Produce highlight tuples for a backtick or bare expression search.

    Uses eval_in_scope to evaluate in the user's code scope.
    If the expression evaluates to an int, treats it as an index search (str[N]).
    Returns no highlights if eval fails.
    """
    p = parse_search_term(search)
    if not p or p[0] != 'expr':
        return []
    try:
        result = eval_in_scope(p[1])
    except Exception:
        return []
    if isinstance(result, int) and not isinstance(result, bool):
        return _index_highlight(result, string_value)
    if not isinstance(result, str):
        return []
    if not result:
        return []
    return _literal_match_highlights(
        result, string_value,
        is_first_match_mode(search),
        re.I if is_case_insensitive(search) else 0)


def parse_regex_for_highlighting(selection_regex: str | None, string_value: str, eval_in_scope=lambda _c: eval(_c)) -> List[Tuple[int, int, str, str, Tuple[int, int | float]]]:
    """
    Parse the search and run it against the ORIGINAL string to get highlight ranges.

    Supports regex (/pattern/), string literals ('string'), backtick
    expressions (`expr`), and bare expressions.

    Returns:
        List of (internal_start, internal_end, type, pattern_display, repetition, segment_index) tuples.
    """
    parsed = parse_search_term(selection_regex)
    if not parsed:
        return []
    kind = parsed[0]

    if kind == 'string':
        return _string_search_highlights(selection_regex, string_value)

    if kind == 'slice':
        return _slice_search_highlights(selection_regex, string_value, eval_in_scope)

    if kind == 'expr':
        return _expression_search_highlights(selection_regex, string_value, eval_in_scope)

    inner_pattern = parsed[1]
    if not inner_pattern:
        return []

    # Convert to fully-grouped form so every segment is a capturing group.
    # This handles canonical regex where some segments may be ungrouped.
    grouped_pattern = _to_fully_grouped_inner(inner_pattern)

    # Parse the fully-grouped regex to understand its structure
    try:
        parsed = regex_parser.parse(grouped_pattern)
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

    first_match_only = is_first_match_mode(selection_regex)
    re_flags = re.M | (re.I if is_case_insensitive(selection_regex) else 0)

    # Run the fully-grouped regex against the ORIGINAL string (not augmented!)
    # re.M makes ^ and $ match at line boundaries
    try:
        if first_match_only:
            matches = []
            m = re.search(grouped_pattern, string_value, flags=re_flags)
            if m:
                matches = [m]
        else:
            matches = list(re.finditer(grouped_pattern, string_value, flags=re_flags))
    except Exception:
        return []

    if not matches:
        return []

    # Build the string-to-internal mapping for position translation
    str_to_internal = build_string_to_internal_mapping(string_value)

    highlights = []

    for match_idx, match in enumerate(matches):
        # First match gets real segment indices (for interactive widgets);
        # additional matches get None (highlight-only, no dropdowns/handles)
        is_primary = (match_idx == 0)

        num_groups = match.lastindex or 0

        for group_num in range(1, num_groups + 1):
            span = match.span(group_num)
            if span == (-1, -1):
                continue  # Group didn't participate in match

            str_start, str_end = span
            group_idx = group_num - 1
            anchors, is_fuzzy, repetition, pattern_display = group_info[group_idx] if group_idx < len(group_info) else ([], False, (1, 1), '')
            seg_type = 'fuzzy' if is_fuzzy else 'literal'

            if is_primary:
                segment_index = len(highlights)
            else:
                segment_index = None

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

                highlights.append((internal_start, internal_end, seg_type, pattern_display, repetition, segment_index))

    return highlights


def get_last_segment_end_internal_idx(selection_regex: str | None, string_value: str) -> int | None:
    """
    Get the internal index where the last segment ends.

    Used to determine if a new selection is extending from the previous one.
    Only considers primary match segments (segment_index is not None).
    """
    highlights = parse_regex_for_highlighting(selection_regex, string_value)
    primary = [h for h in highlights if h[5] is not None]
    if not primary:
        return None
    last_start, last_end, _, _, _, _ = primary[-1]
    return last_end


def get_first_segment_start_internal_idx(selection_regex: str | None, string_value: str) -> int | None:
    """
    Get the internal index where the first segment starts.

    Used to determine if a new selection is extending from the left side.
    Only considers primary match segments (segment_index is not None).
    """
    highlights = parse_regex_for_highlighting(selection_regex, string_value)
    primary = [h for h in highlights if h[5] is not None]
    if not primary:
        return None
    first_start, first_end, _, _, _, _ = primary[0]
    return first_start


def find_fuzzy_segment_at_index(selection_regex: str | None, string_value: str, idx: int) -> dict | None:
    """
    Find a fuzzy segment that contains the given internal index.

    Returns dict with 'start', 'end', 'segment_index' if found, None otherwise.
    Used to detect clicks inside realized fuzzy regions.
    Only considers primary match segments (segment_index is not None).
    """
    highlights = parse_regex_for_highlighting(selection_regex, string_value)
    for i, (start, end, seg_type, _, _, seg_idx) in enumerate(highlights):
        if seg_idx is not None and seg_type == 'fuzzy' and start <= idx < end:
            return {'start': start, 'end': end, 'segment_index': seg_idx}
    return None


# === Adjacency helpers for selection extension ===

def is_adjacent_right(idx: int, last_end: int, string_value: str) -> bool:
    """
    Check if idx is adjacent to last_end for right-extension purposes.

    Returns True if idx >= last_end and all characters at internal indices
    in [last_end, idx) are anchor/sentinel characters (which can be skipped).

    This handles cases like:
    - Extending past $ to reach \\n (at end of line)
    - Extending past $ to reach \\Z (at end of string)
    - Extending past ^ to reach the first char of the next line

    Anchor characters (\\A, ^, $, \\Z) are zero-width regex positions that
    appear as visual markers in the UI. They don't represent actual string
    content, so it's natural to allow clicking "through" them to reach the
    next real character.
    """
    if idx < last_end:
        return False
    if idx == last_end:
        return True
    # Don't consider out-of-bounds indices as adjacent
    if idx >= compute_internal_length(string_value):
        return False
    # Check if all characters between last_end and idx are anchors
    skipped = extract_by_internal_indices(string_value, last_end, idx)
    return len(skipped) > 0 and all(c in _SENTINEL_CHARS for c in skipped)


def is_adjacent_left(idx: int, first_start: int, string_value: str) -> bool:
    """
    Check if idx is adjacent to first_start for left-extension purposes.

    Returns True if idx < first_start and all characters at internal indices
    in (idx, first_start) are anchor/sentinel characters (which can be skipped).

    This handles cases like:
    - Extending past ^ to reach \\n (going left from start of next line)
    - Extending past ^ to reach \\A (going left from start of string)
    - Extending past $ to reach the last char of the previous line
    """
    if idx >= first_start:
        return False
    if idx == first_start - 1:
        return True
    # Don't consider out-of-bounds indices as adjacent
    if idx < 0:
        return False
    # Check if all characters between idx+1 and first_start are anchors
    skipped = extract_by_internal_indices(string_value, idx + 1, first_start)
    return len(skipped) > 0 and all(c in _SENTINEL_CHARS for c in skipped)


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


def find_available_variable_name(source_code: str, desired_name: str) -> str:
    """
    Find a non-colliding variable name in source_code.

    Uses a simple regex over-approximation of identifiers. If desired_name is
    already used, tries desired_name + "2", then + "3", etc. If desired_name
    already ends with digits (e.g. "x2"), increments that numeric suffix.
    """
    existing_names = set(re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', source_code))
    if desired_name not in existing_names:
        return desired_name

    suffix_match = re.match(r'^(.*?)(\d+)$', desired_name)
    if suffix_match:
        base_name = suffix_match.group(1)
        next_suffix = int(suffix_match.group(2)) + 1
    else:
        base_name = desired_name
        next_suffix = 2

    while True:
        candidate = f"{base_name}{next_suffix}"
        if candidate not in existing_names:
            return candidate
        next_suffix += 1




def strip_capturing_groups(pattern: str) -> str:
    """
    Strip any remaining capturing groups from a pattern, leaving just the inner content.

    For example: "hello(.*)world" -> "hello.*world"
                 "(hello)(world)" -> "helloworld"

    Used when generating re.search() code, where groups are not needed.
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




def vis_char_with_index_els(char, i, highlight_by_index, model=None) -> Tuple[List[str], int]:
    if char == '\n':
        return ([
            *char_span_els('$', i, True, highlight_by_index.get(i), model),
            *char_span_els('\\n', i+1, True, highlight_by_index.get(i+1), model),
            '\n  ',
            *char_span_els('^', i+2, True, highlight_by_index.get(i+2), model)
        ], i + 3)
    elif char == '\t':
        return (char_span_els('\\t', i, True, highlight_by_index.get(i), model), i + 1)

    return (char_span_els(char, i, False, highlight_by_index.get(i), model), i + 1)

def vis_char_with_index(char, i, highlight_by_index, model=None):
    """Visualize a character with optional highlighting.

    Args:
        highlight_by_index: dict mapping index -> highlight tuple or None
            where highlight tuple is (start, end, type, pattern_display, repetition, segment_index)
        model: The model state (needed for dropdown open state)
    """
    if char == '\n':
        return (char_span('$', i, True, highlight_by_index.get(i), model) + (char_span('\\n', i+1, True, highlight_by_index.get(i+1), model) + '\n  ' + char_span('^', i+2, True, highlight_by_index.get(i+2), model)), i + 3)
    elif char == '\t':
        return (char_span('\\t', i, True, highlight_by_index.get(i), model), i + 1)

    return (char_span(char, i, False, highlight_by_index.get(i), model), i + 1)


def _compute_handle_drag_regex(model: dict, string_value: str) -> str | None:
    """
    Compute the regex during an active handle drag, resizing the target literal segment.

    Uses the handleDrag state (segmentIndex, side, cursorIdx) plus the current
    search and string_value to determine the new segment boundaries.

    Args:
        model: The model state (must have handleDrag set)
        string_value: The string being visualized

    Returns:
        The preview regex with the segment resized, or the current search on error.
    """
    handle_drag = model['handleDrag']
    segment_index = handle_drag['segmentIndex']
    side = handle_drag['side']
    cursor_idx = handle_drag['cursorIdx']
    selection_regex = model.get('search')

    if selection_regex is None:
        return None

    # Get current highlights to find segment boundaries
    highlights = parse_regex_for_highlighting(selection_regex, string_value)
    if segment_index >= len(highlights):
        return selection_regex

    current_start, current_end, seg_type, _, _, _ = highlights[segment_index]

    if side == 'right':
        new_start = current_start
        new_end = max(cursor_idx + 1, current_start + 1)  # At least 1 char
    else:  # left
        new_start = min(cursor_idx, current_end - 1)  # At least 1 char
        new_end = current_end

    return resize_literal_segment(selection_regex, segment_index, string_value, new_start, new_end)


def build_preview_regex(model, string_value: str) -> str | None:
    """
    Build what the regex would look like if we finalized the in-progress selection.

    This mirrors the logic in finalize_segment() but doesn't modify the model.

    Args:
        model: The model state
        string_value: The string being visualized

    Returns:
        The preview regex string, or the current search if no in-progress selection
    """
    # Check for handle drag state first
    handle_drag = model.get('handleDrag')
    if handle_drag is not None:
        cursor_idx = handle_drag.get('cursorIdx')
        if cursor_idx is not None:
            return _compute_handle_drag_regex(model, string_value)

    a = model.get('anchorIdx')
    c = model.get('cursorIdx')

    if not (isinstance(a, int) and isinstance(c, int)):
        # No in-progress selection, return existing regex
        return model.get('search')

    anchor_type = model.get('anchorType', 'literal')
    extend_direction = model.get('extendDirection')
    insert_after_segment = model.get('insertAfterSegment')
    current_regex = model.get('search')

    start = min(a, c)
    # For left-extension, end should NOT include +1 to avoid overlapping
    if extend_direction == 'left':
        end = max(a, c)
    else:
        end = max(a, c) + 1

    if anchor_type == 'fuzzy':
        # Synthesize a fuzzy pattern from the dragged text
        selected_text = extract_by_internal_indices(string_value, start, end)
        actual_text = ''.join(c for c in selected_text if c not in _SENTINEL_CHARS)

        # Determine boundary context:
        # - Fresh selection (no existing regex): pass actual prev/next chars
        #   so synthesize_fuzzy_pattern uses + (one or more).
        # - Adjacent to existing literal: pass None for that side so it uses *
        #   (zero or more), since the literal already anchors the match.
        is_fresh = current_regex is None and extend_direction is None and insert_after_segment is None

        if is_fresh:
            # New selection: check both edges
            prev_text = extract_by_internal_indices(string_value, start - 1, start) if start > 0 else ''
            prev_char = ''.join(c for c in prev_text if c not in _SENTINEL_CHARS)
            next_text = extract_by_internal_indices(string_value, end, end + 1)
            next_char = ''.join(c for c in next_text if c not in _SENTINEL_CHARS)
        elif extend_direction == 'left':
            # Prepending to existing regex: literal on the right
            prev_text = extract_by_internal_indices(string_value, start - 1, start) if start > 0 else ''
            prev_char = ''.join(c for c in prev_text if c not in _SENTINEL_CHARS)
            next_char = None
        elif extend_direction == 'right':
            # Appending to existing regex: literal on the left
            prev_char = None
            next_text = extract_by_internal_indices(string_value, end, end + 1)
            next_char = ''.join(c for c in next_text if c not in _SENTINEL_CHARS)
        elif insert_after_segment is not None:
            # Inserting between existing segments: literals on both sides
            prev_char = None
            next_char = None
        else:
            # Fallback: treat as adjacent
            prev_char = None
            next_text = extract_by_internal_indices(string_value, end, end + 1)
            next_char = ''.join(c for c in next_text if c not in _SENTINEL_CHARS)

        fuzzy_pattern = synthesize_fuzzy_pattern(actual_text, prev_char, next_char)
        if extend_direction == 'left':
            return prepend_segment_to_regex(current_regex, 'fuzzy', fuzzy_pattern)
        elif insert_after_segment is not None:
            if insert_after_segment == 0:
                insert_position = 0
            else:
                insert_position = insert_after_segment + 1
            return insert_segment_at_position(current_regex, insert_position, 'fuzzy', fuzzy_pattern)
        else:
            return append_segment_to_regex(current_regex, 'fuzzy', fuzzy_pattern)
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

def action_btn(label: str, action: str, enabled: bool = True, title: str = '', extra_style: str = '') -> str:
    # style = btn_with_copy + ('' if enabled else disabled_style) + extra_style
    event = repr(ActionButtonClick(action=action, copy=False))
    title_attr = f' title="{html.escape(title)}"' if title else ''
    return f'<span snc-mouse-down="{html.escape(event)}" class="action-button {"" if enabled else "dimmed"}" {title_attr}>{label}</span>'

def copy_btn(action: str, enabled: bool = True) -> str:
    event = repr(ActionButtonClick(action=action, copy=True))
    return f'<span snc-mouse-down="{html.escape(event)}" class="action-button action-button-copy {"" if enabled else "dimmed"}" title="Copy to clipboard">C</span>'

def btn_group(label: str, action: str, enabled: bool = True, title: str = '', extra_btn_style: str = '') -> str:
    return action_btn(label, action, enabled, title, extra_btn_style) # TODO
    # return f'<span class="action-button-group">{action_btn(label, action, enabled, title, extra_btn_style)}{copy_btn(action, enabled)}</span>'

def _render_replace_action_buttons(model: dict, value: str, eval_in_scope, max_width=None) -> str:
    """Replace row buttons"""
    selection_regex = model.get('search')
    has_search = selection_regex is not None and selection_regex != ''
    replace_visible = bool(model.get('replace_visible', False))
    replace_text = bool(model.get('replace_text'))
    has_replace = replace_visible and replace_text

    parts = []
    parts.append(btn_group(ICONS["replace"], 'replace', has_search and has_replace, 'Replace matches'))

    return (
        f'<div class="action-buttons action-replace-buttons">'
        f'{"".join(parts)}'
        f'</div>'
    )

def _render_action_buttons(model: dict, value: str, eval_in_scope, max_width=None) -> str:
    """Render the action button bar below the search/replace boxes.

    Returns HTML string with buttons for all available actions.
    Buttons are grayed out when not applicable (e.g., Replace when not in replace mode,
    All/If All when not in replace mode).
    """
    selection_regex = model.get('search')
    has_search = selection_regex is not None and selection_regex != ''
    replace_visible = bool(model.get('replace_visible', False))
    replace_text = bool(model.get('replace_text'))
    has_replace = replace_visible and replace_text

    # Compute match count for the Count button label.
    # When a transform/replace is present, count truthy transform results
    # (the transform could be a boolean predicate filtering which items to count).
    if has_search and has_replace:
        match_count = _count_truthy_transform_results(selection_regex, value, model.get('replace_text'), eval_in_scope)
    else:
        match_count = _count_matches(selection_regex, value, eval_in_scope) if has_search else 0

    first = is_first_match_mode(selection_regex) if has_search else False

    # Build button groups
    parts = []

    # Count (N) + Copy
    count_label = f'{match_count} matches'
    parts.append(btn_group(count_label, 'count', has_search, 'Count of matches'))

    parts.append('<div class="action-button-divider"></div>')

    # 1. Get/Transform + Copy
    # if has_replace:
    #     lbl = 'Map First Match' if first else 'Map Matches'
    #     parts.append(btn_group(lbl, 'get_transform', has_search, 'Map expression over matches (Enter)'))
    # else:
    #     lbl = 'Find First Match' if first else 'Find Matches'
    #     parts.append(btn_group(lbl, 'get_transform', has_search, 'Find matches (Enter)'))

    # 2. Replace + Copy (grayed out when not in replace mode)
    # replace_lbl = 'Replace First' if first else 'Replace All'
    # parts.append(btn_group(replace_lbl, 'replace', has_search and has_replace, 'Replace matches (UR)'))

    # 3. Loop + Copy (disabled in first-match mode)
    parts.append(btn_group(ICONS["loop"], 'loop', has_search and not first, 'For loop over matches'))

    # 4. ? dropdown button
    open_dropdown = model.get('openDropdown') if model else None
    predicate_dropdown_open = open_dropdown is not None and open_dropdown.get('id') == 'action-predicate'

    # Build ? button with dropdown
    toggle_event = repr(DropdownToggle('action-predicate'))
    q_btn = f'<span class="action-button action-button-q {"" if has_search else "dimmed"} {"active" if predicate_dropdown_open else ""}" snc-mouse-down="{html.escape(toggle_event)}" title="Boolean queries">{ICONS["exists"]}</span>'

    if predicate_dropdown_open:
        any_val, all_val = _compute_predicate_previews(
            selection_regex, value, replace_visible, model.get('replace_text'), match_count, eval_in_scope
        )
        any_suffix = f' ({any_val})' if any_val is not None else ''
        all_suffix = f' ({all_val})' if all_val is not None else ''

        # Build dropdown options
        dropdown_opts = []

        def dropdown_row(label: str, action: str, enabled: bool) -> str:
            act_event = repr(ActionButtonClick(action=action, copy=False))
            # cp_event = repr(ActionButtonClick(action=action, copy=True))
            return (
                f'<div class="snc-dropdown-option" snc-mouse-down="{html.escape(act_event)}">{label}</div>'
            )

        dropdown_opts.append(dropdown_row(f'Any{any_suffix}', 'any', has_search))
        dropdown_opts.append(dropdown_row(f'All{all_suffix}', 'all', has_search and has_replace))
        dropdown_opts.append(dropdown_row(f'If Any{any_suffix}', 'if_any', has_search))
        dropdown_opts.append(dropdown_row(f'If All{all_suffix}', 'if_all', has_search and has_replace))

        dropdown_panel = (
            '<div class="snc-dropdown-panel left" snc-dropdown-align="left">'
            f'{"".join(dropdown_opts)}</div>'
        )
        q_btn = (
            f'<span class="snc-dropdown-trigger" style="position: relative; display: inline-block;">'
            f'{q_btn}{dropdown_panel}</span>'
        )

    parts.append(q_btn)

    # 5. Delete + Copy
    # delete_lbl = 'Delete First UU' if first else 'Delete All UU'
    parts.append(btn_group(ICONS["bin"], 'delete', has_search, 'Delete matches'))

    # 6. Split + Copy
    parts.append(btn_group(ICONS["split"], 'split', has_search, 'Split string at matches'))

    # 8. Filter + Copy (requires replace/transform predicate)
    parts.append(btn_group(ICONS["filter"], 'filter', has_search and has_replace, 'Filter matches by predicate'))



    return (
        f'<div class="action-buttons">'
        f'{"".join(parts)}'
        f'</div>'
    )


def visualize(value, model, get_visualizer, eval_in_scope, max_width=None, max_height=None, small=False, source_expr=None) -> str:
    return ''.join(visualize_els(value, model, get_visualizer, eval_in_scope, max_width, max_height, small))

def visualize_els(value, model, get_visualizer, eval_in_scope, max_width=None, max_height=None, small=False, source_expr=None) -> List[str]:
    if eval_in_scope is None:
        eval_in_scope = lambda _c: eval(_c)

    # Build highlight_by_index from highlights (uses preview regex to include in-progress selection)
    preview_regex = build_preview_regex(model, value)
    highlights = parse_regex_for_highlighting(preview_regex, value, eval_in_scope) if value else []
    highlight_by_index = {}
    for highlight in highlights:
        start, end, _, _, _, _ = highlight
        for i in range(start, end):
            highlight_by_index[i] = highlight

    # Build character sequence with highlighting
    char_els = []

    # Prefix markers are selectable with internal indices 0 (\A) and 1 (^)
    char_els.append(char_span('\\A', 0, True, highlight_by_index.get(0), model))
    char_els.append(char_span('^', 1, True, highlight_by_index.get(1), model))

    hover_idx = model.get('hoverIdx') if model and not model.get('dragging') else None
    group_chars = []
    group_start = None

    def flush_group():
        nonlocal group_chars, group_start
        if group_chars and group_start is not None:
            char_els.append(text_group_span(group_chars, group_start))
            group_chars = []
            group_start = None

    index = 2
    for char in value:
        is_plain = (
            char != '\n' and char != '\t'
            and highlight_by_index.get(index) is None
            and index != hover_idx
        )
        if is_plain:
            if group_start is None:
                group_start = index
            group_chars.append(char)
            index += 1
        else:
            flush_group()
            char_htmls, index = vis_char_with_index_els(char, index, highlight_by_index, model)
            char_els.extend(char_htmls)

    flush_group()

    # (must match internal index scheme for 1:1 correspondence with extract_by_internal_indices)
    char_els.append(char_span("$", index, True, highlight_by_index.get(index), model))
    index += 1
    char_els.append(char_span("\\Z", index, True, highlight_by_index.get(index), model))
    index += 1

    # chars_html = ''.join(char_els)

    # Build the search box at the bottom (hidden when small)
    if small:
        search_box_html = ""
    else:
        selection_regex = model.get("search")
        search_box_value = selection_regex if selection_regex else ""
        search_input_event = "lambda e: SearchBoxInput(value=e.get('value', ''))"
        # Index/slice searches force 1st on and disable Aa / (Cap)(Grps)
        idx_slice = is_index_or_slice_search(selection_regex, eval_in_scope)

        # "(Cap)(Grps)" toggle: on = capture groups preserved, off = only adjacent literal groups
        cap_groups_on = is_capture_groups_mode(selection_regex)
        cg_event = repr(CaptureGroupsToggle())
        if idx_slice:
            cap_groups_toggle_html = f'<span class="search-button inactive dimmed">{ICONS["regex-group"]}</span>'
        else:
            cap_groups_toggle_html = f'<span class="search-button {"active" if cap_groups_on else "inactive"}" snc-mouse-down="{html.escape(cg_event)}">{ICONS["regex-group"]}</span>'

        # "Aa" toggle: on (highlighted) = case-sensitive (default), off = case-insensitive
        # Dimmed and non-interactive for index/slice
        case_sensitive = not is_case_insensitive(selection_regex)
        cs_event = repr(CaseSensitiveToggle())
        if idx_slice:
            case_toggle_html = f'<span class="search-button inactive dimmed">{ICONS["caps"]}</span>'
        else:
            case_toggle_html = f'<span class="search-button {"active" if case_sensitive else "inactive"}" snc-mouse-down="{html.escape(cs_event)}">{ICONS["caps"]}</span>'

        # "1st" toggle: off by default, on = first-match
        # Forced on for index/slice
        first_match = is_first_match_mode(selection_regex) or idx_slice
        fm_event = repr(FirstMatchToggle())
        first_match_toggle_html = f'<span class="search-button {"active" if first_match else "inactive"}" snc-mouse-down="{html.escape(fm_event)}">{ICONS["match-first"]}</span>'

        toggles_html = (
            f'<span class="search-toggles-container">'
            f"{cap_groups_toggle_html}"
            f"{case_toggle_html}"
            f"{first_match_toggle_html}"
            f"</span>"
        )
        replace_visible = model.get("replace_visible", False)
        replace_toggle_event = repr(ReplaceToggle())
        disclosure_icon = (
            '<span style="transform: rotate(90deg)">></span>'
            if replace_visible
            else ">"
        )
        discolure_button = f'<span snc-mouse-down="{html.escape(replace_toggle_event)}" class="search-button disclosure-button">{disclosure_icon}</span>'

        replace_box_html = ""
        preview_html = ""
        if replace_visible:
            replace_text_value = model.get("replace_text") or ""
            replace_input_event = "lambda e: ReplaceBoxInput(value=e.get('value', ''))"
            preview_html = _render_transform_preview(model, value, eval_in_scope)
            replace_box_html = (
                f'<div class="search-box-input-wrapper">'
                f'<input type="text" tabindex="0"'
                f' snc-input="{html.escape(replace_input_event)}"'
                f' value="{html.escape(replace_text_value)}"'
                f' placeholder="Replace"'
                f' spellcheck="false"'
                f' class="search-box-input search-box-input-replace"'
                f" />"
                f'{preview_html}'
                f'</div>'
            )

        search_input_html = (
            f'<div class="search-box-input-wrapper">'
            f'<input type="text" tabindex="0"'
            f' snc-input="{html.escape(search_input_event)}"'
            f' value="{html.escape(search_box_value)}"'
            f' placeholder="Find"'
            f' spellcheck="false"'
            f' class="search-box-input"'
            f" />"
            f"{toggles_html}"
            f" </div>"
        )

        # Action buttons bar (hidden when small)
        action_buttons_html = (
            "" if small else _render_action_buttons(model, value, eval_in_scope, max_width)
        )

        replace_buttons_html = (
            "" if not replace_visible else _render_replace_action_buttons(model, value, eval_in_scope, max_width)
        )

        search_box_html = (
            f'<div class="search-box {"expanded" if replace_visible else ""}">'
            f"{discolure_button}"
            f'<div class="search-replace-container">'
            f"{search_input_html}"
            f"{replace_box_html}"
            f"</div>"
            f'<div class="action-buttons-container">'
            f'{action_buttons_html}'
            f'{replace_buttons_html}'
            f"</div>"
            f"</div>"
            f"</div>"
        )

    # Add tabindex to make div focusable for keyboard events, and snc-key-down handler
    # doing it like this to try to make less string garbage
    return [
        f'''<div tabindex="0" snc-key-down="{html.escape(repr(KeyDown()))}" class="visualizer-container"><div class="string-visualizer">''',
        *char_els,
        f"""</div>{search_box_html}</div>""",
    ]


def _eval_index_or_slice_match(selection_regex: str, string_value: str, eval_in_scope) -> str | None:
    """Evaluate index or slice search and return the matched string, or None."""
    parsed = parse_search_term(selection_regex)
    if not parsed:
        return None
    kind, term, _flags = parsed

    if kind == 'slice':
        left, right = term
        try:
            start = eval_in_scope(left) if left else None
            stop = eval_in_scope(right) if right else None
        except Exception:
            return None
        sliced = string_value[start:stop]
        return sliced if sliced else None

    if kind == 'expr':
        try:
            result = eval_in_scope(term)
        except Exception:
            return None
        if isinstance(result, int) and not isinstance(result, bool):
            n = len(string_value)
            if n == 0 or result < -n or result >= n:
                return None
            return string_value[result]

    return None


def is_index_or_slice_search(selection_regex: str | None, eval_in_scope=None) -> bool:
    """Check if the search is an index (expression->int) or slice search.

    For slice, no eval needed. For index, eval_in_scope is required to check
    if the expression evaluates to an int.
    """
    parsed = parse_search_term(selection_regex)
    if not parsed:
        return False
    kind, term, _flags = parsed
    if kind == 'slice':
        return True
    if kind == 'expr' and eval_in_scope is not None:
        try:
            result = eval_in_scope(term)
            return isinstance(result, int) and not isinstance(result, bool)
        except Exception:
            pass
    return False


def _count_matches(selection_regex: str | None, string_value: str, eval_in_scope) -> int:
    """Count the number of matches for the current search pattern.

    Used by the Count button to display the match count in its label.
    """
    if not selection_regex or not string_value:
        return 0

    matched = _eval_index_or_slice_match(selection_regex, string_value, eval_in_scope)
    if matched is not None:
        return 1
    if is_slice_search(selection_regex) or is_index_or_slice_search(selection_regex, eval_in_scope):
        return 0

    parsed = parse_search_term(selection_regex)
    if not parsed:
        return 0
    kind, term, flags = parsed
    ci = 'i' in flags
    first = '1' in flags

    if kind in ('string', 'expr'):
        if kind == 'string':
            search_text = eval_string_search(selection_regex)
        else:
            try:
                search_text = eval_in_scope(term)
            except Exception:
                return 0
            if not isinstance(search_text, str):
                return 0
        if not search_text:
            return 0
        if ci:
            compiled = re.compile(re.escape(search_text), re.IGNORECASE)
            if first:
                return 1 if compiled.search(string_value) else 0
            return len(compiled.findall(string_value))
        else:
            if first:
                return 1 if search_text in string_value else 0
            return string_value.count(search_text)

    if kind == 'regex':
        pattern = strip_capturing_groups(term) if term else ''
        if not pattern:
            return 0
        re_flags = re.M | (re.I if ci else 0)
        try:
            if first:
                return 1 if re.search(pattern, string_value, flags=re_flags) else 0
            return len(list(re.finditer(pattern, string_value, flags=re_flags)))
        except Exception:
            return 0

    return 0


def _count_truthy_transform_results(selection_regex: str, string_value: str, replace_text: str, eval_in_scope) -> int:
    """Count matches whose transform result is truthy.

    Falls back to _count_matches if the transform can't be evaluated.
    """
    if not selection_regex or not string_value or not replace_text:
        return 0
    matches = _find_matches(selection_regex, string_value, eval_in_scope)
    if not matches:
        return 0
    replace_expr_raw = replace_text
    if replace_expr_raw.startswith('`') and len(replace_expr_raw) >= 2:
        end = replace_expr_raw.find('`', 1)
        if end > 0:
            replace_expr_raw = replace_expr_raw[1:end]
    replace_expr = replace_caret_in_py_exp(replace_expr_raw, '_mtch')
    try:
        transform_fn = eval_in_scope(f"(lambda _mtch: {replace_expr})")
        return sum(1 for m in matches if transform_fn(m))
    except Exception:
        return _count_matches(selection_regex, string_value, eval_in_scope)


def _find_matches(selection_regex: str, string_value: str, eval_in_scope) -> list:
    """Return match objects (or matched strings for index/slice) for the current search pattern."""
    if not selection_regex or not string_value:
        return []

    matched = _eval_index_or_slice_match(selection_regex, string_value, eval_in_scope)
    if matched is not None:
        return [matched]
    if is_slice_search(selection_regex) or is_index_or_slice_search(selection_regex, eval_in_scope):
        return []

    parsed = parse_search_term(selection_regex)
    if not parsed:
        return []
    kind, term, flags = parsed
    ci = 'i' in flags
    first = '1' in flags

    if kind in ('string', 'expr'):
        if kind == 'string':
            search_text = eval_string_search(selection_regex)
        else:
            try:
                search_text = eval_in_scope(term)
            except Exception:
                return []
            if not isinstance(search_text, str):
                return []
        if not search_text:
            return []
        compiled = re.compile(re.escape(search_text), re.IGNORECASE if ci else 0)
        if first:
            m = compiled.search(string_value)
            return [m] if m else []
        return list(compiled.finditer(string_value))

    if kind == 'regex':
        pattern = strip_capturing_groups(term) if term else ''
        if not pattern:
            return []
        re_flags = re.M | (re.I if ci else 0)
        try:
            if first:
                m = re.search(pattern, string_value, flags=re_flags)
                return [m] if m else []
            return list(re.finditer(pattern, string_value, flags=re_flags))
        except Exception:
            return []

    return []


def _compute_predicate_previews(selection_regex, value, replace_visible, replace_text, match_count, eval_in_scope):
    """Compute (any_val, all_val) boolean previews for the predicate dropdown.

    Returns (bool|None, bool|None). None means not applicable / not computable.
    """
    if not selection_regex:
        return (None, None)

    if not replace_visible or not replace_text:
        return (match_count > 0, None)

    # Replace mode: evaluate the replace expression against actual matches
    matches = _find_matches(selection_regex, value, eval_in_scope)
    if not matches:
        return (False, True)  # any([])=False, all([])=True per Python semantics

    replace_expr_raw = replace_text
    if replace_expr_raw.startswith('`') and len(replace_expr_raw) >= 2:
        end = replace_expr_raw.find('`', 1)
        if end > 0:
            replace_expr_raw = replace_expr_raw[1:end]
    replace_expr = replace_caret_in_py_exp(replace_expr_raw, '_mtch')

    try:
        transform_fn = eval_in_scope(f"(lambda _mtch: {replace_expr})")
        results = [transform_fn(m) for m in matches]
        return (any(results), all(results))
    except Exception:
        return (None, None)


def _trunc_repr(val, max_len=30) -> str:
    begin_end_size = max_len // 2
    r = repr(val)
    if len(r) > max_len:
        return r[:begin_end_size] + 'U' + r[-begin_end_size + 1:]
    return r


def _preview_chip(expr: str, val_repr: str, target: str = '.snc-replace-input') -> str:
    """Render a single clickable preview chip: expr => value.

    The snc-add-at-cursor attribute tells the front-end to insert `expr`
    at the cursor position in the input matched by snc-add-target (a CSS selector).
    """
    return (
        f'<span class="preview-chip-container">'
        f'<span class="preview-chip" snc-add-at-cursor="{html.escape(expr)}" snc-add-target="{html.escape(target)}">{html.escape(expr)}</span>'
        f' U {val_repr}'
        f'</span>'
    )


def _render_transform_preview(model: dict, value: str, eval_in_scope) -> str:
    """Render a live preview of match metadata and transform result using the first match.

    Returns HTML string, or '' if preconditions are not met (replace not visible,
    no search, or no matches).

    For index/slice searches, ^ is the matched string (not a match object),
    so the preview shows ^ => 'str' instead of ^[0], ^.start(), ^.end().

    When the regex has capture groups, shows ^[1], ^[2], etc. alongside ^[0].
    All expression chips are clickable (snc-add-at-cursor) to insert into the replace box.
    """
    if not model.get('replace_visible', False):
        return ''
    selection_regex = model.get('search')
    if not selection_regex:
        return ''

    is_idx_slice = is_index_or_slice_search(selection_regex, eval_in_scope)

    if is_idx_slice:
        matched_str = _eval_index_or_slice_match(selection_regex, value, eval_in_scope)
        if matched_str is None:
            return ''

        m_repr = html.escape(_trunc_repr(matched_str))
        row1 = _preview_chip('^', m_repr)

        result_str = ''
        replace_text = model.get('replace_text')
        if replace_text:
            replace_expr_raw = replace_text
            if replace_expr_raw.startswith('`') and len(replace_expr_raw) >= 2:
                end = replace_expr_raw.find('`', 1)
                if end > 0:
                    replace_expr_raw = replace_expr_raw[1:end]
            replace_expr = replace_caret_in_py_exp(replace_expr_raw, '_mtch')
            try:
                transform_fn = eval_in_scope(f"(lambda _mtch: {replace_expr})")
                result = transform_fn(matched_str)
                result_str = html.escape(_trunc_repr(result))
            except Exception as e:
                result_str = html.escape(str(e))
        row2 = f'<div class="transform-preview-content">{result_str}</div>' if result_str else ''

        return (
            f'<div class="transform-preview">'
            # f'<div class="transform-preview-content" style="font-size: 7px; filter: saturate(0.75); opacity: 0.75;">Match: {row1}</div>'
            f'{row2}'
            f'</div>'
        )

    matches = _find_matches(selection_regex, value, eval_in_scope)
    if not matches:
        return ''

    m = matches[0]
    m0 = html.escape(_trunc_repr(m[0]))
    mstart = html.escape(_trunc_repr(m.start()))
    mend = html.escape(_trunc_repr(m.end()))

    row1 = (
        _preview_chip('^[0]', m0)
        + _preview_chip('^.start()', mstart)
        + _preview_chip('^.end()', mend)
    )

    # Show capture group previews when the inner pattern has groups.
    # Also produce grouped_match for the transform evaluation so that
    # expressions like ^[2] resolve against the real capture groups.
    group_chips = ''
    grouped_match = None
    if is_regex_search(selection_regex):
        inner = get_regex_inner_pattern(selection_regex)
        if inner:
            ci = is_case_insensitive(selection_regex)
            flags = re.M | (re.I if ci else 0)
            try:
                grouped_match = re.search(inner, value, flags=flags)
                if grouped_match and grouped_match.lastindex:
                    for i in range(1, grouped_match.lastindex + 1):
                        g = grouped_match.group(i)
                        if g is not None:
                            g_repr = html.escape(_trunc_repr(g))
                            group_chips += _preview_chip(f'^[{i}]', g_repr)
            except Exception:
                grouped_match = None

    transform_match = grouped_match if grouped_match is not None else m

    result_str = ''
    replace_text = model.get('replace_text')
    if replace_text:
        replace_expr_raw = replace_text
        if replace_expr_raw.startswith('`') and len(replace_expr_raw) >= 2:
            end = replace_expr_raw.find('`', 1)
            if end > 0:
                replace_expr_raw = replace_expr_raw[1:end]
        replace_expr = replace_caret_in_py_exp(replace_expr_raw, '_mtch')

        try:
            transform_fn = eval_in_scope(f"(lambda _mtch: {replace_expr})")
            result = transform_fn(transform_match)
            result_str = html.escape(_trunc_repr(result))
        except Exception as e:
            result_str = html.escape(str(e))
    row2 = f'<div class="transform-preview-content">{result_str}</div>' if result_str else ''

    return (
        f'<div class="transform-preview">'
        # f'<div class="transform-preview-matches">First match: {row1}{group_chips}</div>'
        f'{row2}'
        f'</div>'
    )


def init_model(value, get_visualizer=None, eval_in_scope=None, source_expr=None):
    """
    Initialize the model state for a new visualization.

    Args:
        value: The string value being visualized (not stored in model)
    """
    return {
        "search": None,   # Regex pattern with / delimiters in canonical form, e.g., "/hello.*world/"
        "anchorIdx": None,
        "anchorType": None,       # "literal" or "fuzzy" - determined when drag starts
        "cursorIdx": None,
        "dragging": False,
        "extendDirection": None,  # "left", "right", or None - which side we're extending from
        "insertAfterSegment": None,  # Segment index to insert after (for clicking inside fuzzy)
        "openDropdown": None,     # {"id": "fuzzy-pattern-0", "segmentIndex": 0} when dropdown is open
        "handleDrag": None,       # {"segmentIndex": int, "side": "left"|"right", "cursorIdx": int} when dragging a handle
        "undoHistory": [],        # Stack of previous search states
        "redoHistory": [],        # Stack for redo
        "handledKeys": ["Escape", "Enter", "cmd Backspace", "cmd r", "cmd z", "cmd shift z"],  # Keys to intercept from VS Code
        "hoverIdx": None,         # Internal index of the character currently hovered
        "hoverType": None,        # "literal" or "fuzzy" based on mouse position in top/bottom half
        "replace_visible": False, # Whether the replace input box is visible
        "replace_text": None,     # The replacement text (a Python string literal, e.g., "'world'")
    }


def is_top_half(event_json):
    """Determine if mouse click was in top half of the target element."""
    offset_y = event_json.get('offsetY', 0)
    height = event_json.get('elementHeight', 1)
    return offset_y <= height / 2


def finalize_segment(model: dict, string_value: str) -> dict:
    """
    Finalize the in-progress segment and add it to search.

    Commits the current anchor/cursor selection to the regex pattern,
    saves to undo history, and clears the in-progress state.

    Args:
        model: The model state
        string_value: The string being visualized
    """
    # Build the new regex using the same logic as preview
    new_regex = build_preview_regex(model, string_value)
    current_regex = model.get('search')

    # Only update regex and undo history if something changed
    if new_regex != current_regex:
        model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
        model['redoHistory'] = []  # Clear redo on new action
        model['search'] = new_regex

    # Always clear in-progress state
    model['anchorIdx'] = None
    model['cursorIdx'] = None
    model['extendDirection'] = None
    model['insertAfterSegment'] = None
    model['dragging'] = False
    return model


def finalize_handle_drag(model: dict, string_value: str) -> dict:
    """
    Finalize a handle drag and update search.

    Computes the resized regex from the handle drag state, saves to undo history
    if changed, and clears the handleDrag state.

    Args:
        model: The model state (must have handleDrag set)
        string_value: The string being visualized
    """
    new_regex = _compute_handle_drag_regex(model, string_value)
    current_regex = model.get('search')

    # Only update if something changed
    if new_regex != current_regex:
        model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
        model['redoHistory'] = []
        model['search'] = new_regex

    model['handleDrag'] = None
    return model

# =============================================================================
# Expression Builder Helpers for Action Buttons
# =============================================================================

def _get_search_context(model: dict, source_code: str, source_line: int) -> dict | None:
    """Extract common search context from model and source code.

    Returns None if no valid search pattern or source info is available.
    Otherwise returns a dict with all values needed to build code expressions.
    """
    selection_regex = model.get('search')
    if not selection_regex or not source_code or not source_line:
        return None

    parsed = parse_search_term(selection_regex)
    if not parsed:
        return None
    kind, term, flags = parsed

    expr, var_name = extract_expression_from_line(source_code, source_line)
    var_to_search = var_name if var_name else f"({expr})"
    suggest_base = var_name if var_name else "result"

    is_idx = False
    index_expr = None
    if kind == 'slice':
        slice_start, slice_stop = term
    elif kind == 'expr':
        try:
            val = ast.literal_eval(term)
            if isinstance(val, int) and not isinstance(val, bool):
                is_idx = True
                index_expr = term
        except (ValueError, SyntaxError):
            pass

    if is_idx or kind == 'slice':
        replace_visible = model.get('replace_visible', False)
        replace_text = model.get('replace_text')
        replace_expr = None
        if replace_visible and replace_text:
            replace_expr_raw = replace_text
            if replace_expr_raw.startswith('`') and len(replace_expr_raw) >= 2:
                end = replace_expr_raw.find('`', 1)
                if end > 0:
                    replace_expr_raw = replace_expr_raw[1:end]
            replace_expr = replace_caret_in_py_exp(replace_expr_raw, '_mtch')
        return {
            'selection_regex': selection_regex,
            'var_to_search': var_to_search,
            'var_name': var_name,
            'suggest_base': suggest_base,
            'is_index': is_idx,
            'is_slice': kind == 'slice',
            'index_expr': index_expr,
            'slice_start': term[0] if kind == 'slice' else None,
            'slice_stop': term[1] if kind == 'slice' else None,
            'replace_visible': replace_visible,
            'replace_text': replace_text,
            'replace_expr': replace_expr,
        }
    first = '1' in flags
    ci = 'i' in flags
    is_expr = kind in ('string', 'expr')

    regex_pattern = None
    if kind == 'regex':
        if 'c' in flags:
            regex_pattern = term or ""
        else:
            regex_pattern = strip_capturing_groups(term) if term else ""

    if is_expr:
        flags_str = ', flags=re.I' if ci else ''
        flags_str_kw = flags_str
    else:
        flags_str = 'flags=re.M|re.I' if ci else 'flags=re.M'
        flags_str_kw = f', {flags_str}'

    count_str = ', count=1' if first else ''

    replace_visible = model.get('replace_visible', False)
    replace_text = model.get('replace_text')
    replace_expr = None
    lambda_str = None
    if replace_visible and replace_text:
        replace_expr_raw = replace_text
        if replace_expr_raw.startswith('`') and len(replace_expr_raw) >= 2:
            end = replace_expr_raw.find('`', 1)
            if end > 0:
                replace_expr_raw = replace_expr_raw[1:end]
        replace_expr = replace_caret_in_py_exp(replace_expr_raw, '_mtch')
        lambda_str = f'lambda _mtch: {replace_expr}'

    return {
        'selection_regex': selection_regex,
        'var_to_search': var_to_search,
        'var_name': var_name,
        'suggest_base': suggest_base,
        'is_first': first,
        'is_ci': ci,
        'is_expr': is_expr,
        'is_index': False,
        'is_slice': False,
        'expr': term if is_expr else None,
        'regex_pattern': regex_pattern,
        'flags_str': flags_str,
        'flags_str_kw': flags_str_kw,
        'count_str': count_str,
        'replace_visible': replace_visible,
        'replace_text': replace_text,
        'replace_expr': replace_expr,
        'lambda_str': lambda_str,
    }


def _finditer_expr(ctx: dict) -> str:
    """Build the re.finditer(...) call expression string."""
    if ctx['is_expr']:
        return f"re.finditer(re.escape({ctx['expr']}), {ctx['var_to_search']}{ctx['flags_str_kw']})"
    else:
        return f"re.finditer(r'{ctx['regex_pattern']}', {ctx['var_to_search']}, {ctx['flags_str']})"


def _search_expr(ctx: dict) -> str:
    """Build the re.search(...) call expression string."""
    if ctx['is_expr']:
        return f"re.search(re.escape({ctx['expr']}), {ctx['var_to_search']}{ctx['flags_str_kw']})"
    else:
        return f"re.search(r'{ctx['regex_pattern']}', {ctx['var_to_search']}, {ctx['flags_str']})"


def _build_get_expr(ctx: dict) -> tuple | None:
    """Build Get expression: list of matches (non-replace Enter behavior).

    Returns (suggest_name, expr_str) or None.
    """
    if ctx.get('is_index'):
        suggest_name = ctx['suggest_base'] if ctx['var_name'] else "result"
        return (suggest_name, f"{ctx['var_to_search']}[{ctx['index_expr']}]")
    if ctx.get('is_slice'):
        suggest_name = ctx['suggest_base'] if ctx['var_name'] else "result"
        return (suggest_name, f"{ctx['var_to_search']}[{ctx['slice_start']}:{ctx['slice_stop']}]")
    if ctx['is_first']:
        suggest_name = f"{ctx['suggest_base']}_match" if ctx['var_name'] else "result_match"
        return (suggest_name, _search_expr(ctx))
    else:
        suggest_name = f"{ctx['suggest_base']}_matches" if ctx['var_name'] else "result_matches"
        return (suggest_name, f"list({_finditer_expr(ctx)})")


def _build_transform_expr(ctx: dict) -> tuple | None:
    """Build Transform expression: list comprehension mapping replace expr over matches.

    Returns (suggest_name, expr_str) or None if no replace expression.
    """
    if not ctx.get('replace_expr'):
        return None
    suggest_name = f"{ctx['suggest_base']}_transformed" if ctx['var_name'] else "result_transformed"
    if ctx.get('is_index'):
        v = ctx['var_to_search']
        i = ctx['index_expr']
        return (suggest_name, f"(lambda _mtch: {ctx['replace_expr']})({v}[{i}])")
    if ctx.get('is_slice'):
        v = ctx['var_to_search']
        start = ctx['slice_start']
        stop = ctx['slice_stop']
        return (suggest_name, f"(lambda _mtch: {ctx['replace_expr']})({v}[{start}:{stop}])")
    if ctx['is_first']:
        return (suggest_name, f"next(({ctx['replace_expr']} for _mtch in {_finditer_expr(ctx)}), None)")
    else:
        return (suggest_name, f"[{ctx['replace_expr']} for _mtch in {_finditer_expr(ctx)}]")


def _build_get_or_transform_expr(ctx: dict) -> tuple | None:
    """Build Get when not in replace mode, Transform when in replace mode."""
    if ctx.get('is_index') or ctx.get('is_slice'):
        if ctx.get('replace_visible') and ctx.get('replace_expr'):
            return _build_transform_expr(ctx)
        return _build_get_expr(ctx)
    if ctx['replace_visible'] and ctx['replace_expr']:
        return _build_transform_expr(ctx)
    else:
        return _build_get_expr(ctx)


def _build_replace_expr(ctx: dict) -> tuple | None:
    """Build Replace expression: re.sub with lambda.

    Returns (suggest_name, expr_str) or None if not in replace mode.
    """
    if ctx.get('is_index') or ctx.get('is_slice'):
        if not ctx.get('replace_visible') or not ctx.get('replace_expr'):
            return None
        suggest_name = ctx['suggest_base'] if ctx['var_name'] else "result"
        v = ctx['var_to_search']
        repl = f"(lambda _mtch: {ctx['replace_expr']})"
        if ctx.get('is_index'):
            i = ctx['index_expr']
            return (suggest_name, f"{v}[:{i}] + str({repl}({v}[{i}])) + {v}[{i} + 1:]")
        else:
            start = ctx['slice_start']
            stop = ctx['slice_stop']
            left = f"{v}[:{start}]" if start else "''"
            right = f"{v}[{stop}:]" if stop else "''"
            return (suggest_name, f"{left} + str({repl}({v}[{start}:{stop}])) + {right}")

    if not ctx['replace_visible'] or not ctx.get('lambda_str'):
        return None
    suggest_name = ctx['suggest_base'] if ctx['var_name'] else "result"
    if ctx['is_expr']:
        return (suggest_name, f"re.sub(re.escape({ctx['expr']}), {ctx['lambda_str']}, {ctx['var_to_search']}{ctx['count_str']}{ctx['flags_str_kw']})")
    else:
        return (suggest_name, f"re.sub(r'{ctx['regex_pattern']}', {ctx['lambda_str']}, {ctx['var_to_search']}{ctx['count_str']}, {ctx['flags_str']})")


def _build_delete_expr(ctx: dict) -> tuple | None:
    """Build Delete expression: remove matches.

    Returns (suggest_name, expr_str).
    """
    suggest_name = ctx['suggest_base'] if ctx['var_name'] else "result"
    if ctx.get('is_index'):
        v = ctx['var_to_search']
        i = ctx['index_expr']
        return (suggest_name, f"{v}[:{i}] + {v}[{i} + 1:]")
    if ctx.get('is_slice'):
        v = ctx['var_to_search']
        start = ctx['slice_start']
        stop = ctx['slice_stop']
        left = f"{v}[:{start}]" if start else "''"
        right = f"{v}[{stop}:]" if stop else "''"
        return (suggest_name, f"{left} + {right}")
    if ctx['is_expr']:
        expr = ctx['expr']
        if ctx['is_ci']:
            return (suggest_name, f"re.sub(re.escape({expr}), '', {ctx['var_to_search']}{ctx['count_str']}{ctx['flags_str_kw']})")
        else:
            if ctx['is_first']:
                return (suggest_name, f"{ctx['var_to_search']}.replace({expr}, '', 1)")
            else:
                return (suggest_name, f"{ctx['var_to_search']}.replace({expr}, '')")
    else:
        if ctx['is_first']:
            return (suggest_name, f"re.sub(r'{ctx['regex_pattern']}', '', {ctx['var_to_search']}, count=1, {ctx['flags_str']})")
        else:
            return (suggest_name, f"re.sub(r'{ctx['regex_pattern']}', '', {ctx['var_to_search']}, {ctx['flags_str']})")


def _build_loop_code(ctx: dict) -> tuple | None:
    """Build for loop code with enumerate.

    Returns (None, code_str) — suggest_name is None for multiline statements.
    """
    if ctx['replace_visible'] and ctx['replace_expr']:
        gen_expr = f"{ctx['replace_expr']} for _mtch in {_finditer_expr(ctx)}"
        return (None, f"for _i, _val in enumerate({gen_expr}):\n    pass")
    else:
        return (None, f"for _i, _mtch in enumerate({_finditer_expr(ctx)}):\n    pass")


def _build_any_expr(ctx: dict) -> tuple | None:
    """Build Any boolean expression.

    Non-replace: bool(re.search(...))
    Replace: any(EXPR for _mtch in ...)
    """
    suggest_name = f"{ctx['suggest_base']}_any" if ctx['var_name'] else "result_any"
    if ctx['replace_visible'] and ctx['replace_expr']:
        return (suggest_name, f"any({ctx['replace_expr']} for _mtch in {_finditer_expr(ctx)})")
    else:
        return (suggest_name, f"bool({_search_expr(ctx)})")


def _build_all_expr(ctx: dict) -> tuple | None:
    """Build All boolean expression (replace mode only).

    Returns None when not in replace mode.
    """
    if not ctx['replace_visible'] or not ctx['replace_expr']:
        return None
    suggest_name = f"{ctx['suggest_base']}_all" if ctx['var_name'] else "result_all"
    return (suggest_name, f"all({ctx['replace_expr']} for _mtch in {_finditer_expr(ctx)})")


def _build_if_any_code(ctx: dict) -> tuple | None:
    """Build if-any statement code.

    Returns (None, "if EXPR:\\n    pass") for code insertion,
    or for copy: returns the boolean expression part.
    """
    if ctx['replace_visible'] and ctx['replace_expr']:
        bool_expr = f"any({ctx['replace_expr']} for _mtch in {_finditer_expr(ctx)})"
    else:
        bool_expr = _search_expr(ctx)
    return (None, f"if {bool_expr}:\n    pass")


def _build_if_all_code(ctx: dict) -> tuple | None:
    """Build if-all statement code (replace mode only).

    Returns None when not in replace mode.
    """
    if not ctx['replace_visible'] or not ctx['replace_expr']:
        return None
    bool_expr = f"all({ctx['replace_expr']} for _mtch in {_finditer_expr(ctx)})"
    return (None, f"if {bool_expr}:\n    pass")


def _build_count_expr(ctx: dict) -> tuple | None:
    """Build Count expression.

    Non-replace: sum(1 for _ in re.finditer(...))
    Replace: sum(1 for _mtch in re.finditer(...) if EXPR)
    """
    suggest_name = f"{ctx['suggest_base']}_count" if ctx['var_name'] else "result_count"
    if ctx['replace_visible'] and ctx['replace_expr']:
        return (suggest_name, f"sum(1 for _mtch in {_finditer_expr(ctx)} if {ctx['replace_expr']})")
    else:
        return (suggest_name, f"sum(1 for _ in {_finditer_expr(ctx)})")


def _build_filter_expr(ctx: dict) -> tuple | None:
    """Build Filter expression: matches filtered by replace predicate.

    Returns (suggest_name, expr_str) or None if not in replace mode.
    """
    if not ctx['replace_visible'] or not ctx['replace_expr']:
        return None
    suggest_name = f"{ctx['suggest_base']}_filtered" if ctx['var_name'] else "result_filtered"
    if ctx['is_first']:
        return (suggest_name, f"next((_mtch for _mtch in {_finditer_expr(ctx)} if {ctx['replace_expr']}), None)")
    else:
        return (suggest_name, f"[_mtch for _mtch in {_finditer_expr(ctx)} if {ctx['replace_expr']}]")


def _build_split_expr(ctx: dict) -> tuple | None:
    """Build Split expression: re.split or str.split.

    Returns (suggest_name, expr_str).
    """
    suggest_name = f"{ctx['suggest_base']}_parts" if ctx['var_name'] else "result_parts"
    maxsplit_str = ', maxsplit=1' if ctx['is_first'] else ''

    if ctx['is_expr']:
        expr = ctx['expr']
        if not ctx['is_ci']:
            if ctx['is_first']:
                return (suggest_name, f"{ctx['var_to_search']}.split({expr}, 1)")
            else:
                return (suggest_name, f"{ctx['var_to_search']}.split({expr})")
        return (suggest_name, f"re.split(re.escape({expr}), {ctx['var_to_search']}{maxsplit_str}{ctx['flags_str_kw']})")
    else:
        return (suggest_name, f"re.split(r'{ctx['regex_pattern']}', {ctx['var_to_search']}{maxsplit_str}, {ctx['flags_str']})")


def _get_copy_expr_for_if(action: str, ctx: dict) -> str | None:
    """Get just the boolean expression for copy of if_any/if_all actions."""
    if action == 'if_any':
        if ctx['replace_visible'] and ctx['replace_expr']:
            return f"any({ctx['replace_expr']} for _mtch in {_finditer_expr(ctx)})"
        else:
            return _search_expr(ctx)
    elif action == 'if_all':
        if not ctx['replace_visible'] or not ctx['replace_expr']:
            return None
        return f"all({ctx['replace_expr']} for _mtch in {_finditer_expr(ctx)})"
    return None


def update(event, source_code: str, source_line: int, model: dict, value: str, get_visualizer=None, eval_in_scope=None, source_expr=None) -> Tuple[dict, List[Any]]:
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
        case HandleMouseDown(segment_index=seg_idx, side=side):
            # Start a handle drag on a literal segment edge
            model['handleDrag'] = {
                'segmentIndex': seg_idx,
                'side': side,
                'cursorIdx': None,  # Will be set on first MouseMove
            }
            # Clear any normal drag state
            model['dragging'] = False
            model['anchorIdx'] = None
            model['cursorIdx'] = None
            model['openDropdown'] = None

        case MouseDown(index=idx):
            # Close any open dropdown when clicking elsewhere
            model['openDropdown'] = None
            # Cancel any handle drag
            model['handleDrag'] = None
            # Clear hover preview (actual selection takes over)
            model['hoverIdx'] = None
            model['hoverType'] = None

            selection_regex = model.get('search')

            # Determine selection type based on top/bottom half of character
            anchor_type = 'fuzzy' if event_json["altKey"] else 'literal'

            # Check extension points if we have an existing selection
            last_end: int | None = None
            first_start: int | None = None
            fuzzy_info: dict | None = None
            if selection_regex and isinstance(idx, int):
                last_end = get_last_segment_end_internal_idx(selection_regex, value)
                first_start = get_first_segment_start_internal_idx(selection_regex, value)
                fuzzy_info = find_fuzzy_segment_at_index(selection_regex, value, idx)

            # Check if extending from the right (end of last segment)
            # Uses broader adjacency: allows skipping over anchor chars ($, ^, \A, \Z)
            if last_end is not None and isinstance(idx, int) and is_adjacent_right(idx, last_end, value):
                # Keep existing regex, start new segment from where user clicked
                # (not from last_end, to avoid including skipped anchors in the segment)
                model['anchorIdx'] = idx
                model['anchorType'] = anchor_type
                model['cursorIdx'] = idx
                model['extendDirection'] = 'right'
                model['insertAfterSegment'] = None  # Not inserting at specific position
            # Check if extending from the left (near the start of first segment)
            # Uses broader adjacency: allows skipping over anchor chars
            elif first_start is not None and isinstance(idx, int) and is_adjacent_left(idx, first_start, value):
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
            if model.get('handleDrag') is not None:
                # Handle drag mode: update cursor position on the drag handle
                if event_json.get('buttons') == 0:
                    # Mouse released outside widget - finalize handle drag
                    model = finalize_handle_drag(model, value)
                else:
                    model['handleDrag']['cursorIdx'] = idx
            elif event_json.get('buttons') == 0:  # No mouse button held
                model = finalize_segment(model, value)
                # Update hover preview state
                model['hoverIdx'] = idx
                model['hoverType'] = 'literal' if is_top_half(event_json) else 'fuzzy'
            elif model.get('dragging'):
                model['cursorIdx'] = idx

        case MouseUp(index=idx):
            if model.get('handleDrag') is not None:
                # Finalize handle drag
                model['handleDrag']['cursorIdx'] = idx
                model = finalize_handle_drag(model, value)
            elif model.get('dragging'):
                model['cursorIdx'] = idx
                model = finalize_segment(model, value)

        case KeyDown():
            key = event_json.get('key')
            meta_key = event_json.get('metaKey', False)
            shift_key = event_json.get('shiftKey', False)

            if key == 'Enter':
                if model.get('openDropdown'):
                    model['openDropdown'] = None
                else:
                    # Enter: Get (non-replace) or Transform (replace mode)
                    ctx = _get_search_context(model, source_code, source_line)
                    if ctx:
                        result = _build_get_or_transform_expr(ctx)
                        if result:
                            commands.append(result)

            elif key == 'Backspace' and meta_key:
                # Cmd-Delete: Delete matches
                if model.get('openDropdown'):
                    model['openDropdown'] = None
                else:
                    ctx = _get_search_context(model, source_code, source_line)
                    if ctx:
                        result = _build_delete_expr(ctx)
                        if result:
                            commands.append(result)

            elif key == 'r' and meta_key:
                # Cmd-R: Replace (re.sub)
                ctx = _get_search_context(model, source_code, source_line)
                if ctx:
                    result = _build_replace_expr(ctx)
                    if result:
                        commands.append(result)

            elif key == 'Escape':
                # Close dropdown if open, otherwise clear selections
                if model.get('openDropdown'):
                    model['openDropdown'] = None
                else:
                    # Clear all selections (save to undo first so it's recoverable)
                    current_regex = model.get('search')
                    if current_regex or model.get('anchorIdx') is not None:
                        model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
                        model['redoHistory'] = []
                    model['search'] = None
                    model['anchorIdx'] = None
                    model['cursorIdx'] = None
                    model['dragging'] = False
                    model['insertAfterSegment'] = None

            elif key == 'z' and meta_key and not shift_key:
                # Cmd-Z: Undo
                undo_history = model.get('undoHistory', [])
                if undo_history:
                    # Push current to redo
                    model['redoHistory'] = model.get('redoHistory', []) + [model.get('search')]
                    # Pop from undo
                    model['search'] = undo_history[-1]
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
                    model['undoHistory'] = model.get('undoHistory', []) + [model.get('search')]
                    # Pop from redo
                    model['search'] = redo_history[-1]
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
                # ID format: "fuzzy-pattern-{segment_index}" or "repetition-{segment_index}"
                parts = did.split('-')
                segment_index = int(parts[-1]) if parts[-1].isdigit() else 0
                dropdown_state = {'id': did, 'segmentIndex': segment_index}

                # For repetition dropdowns, initialize text field state
                if did.startswith('repetition-'):
                    dropdown_state['exactN'] = ''
                    dropdown_state['rangeMin'] = ''
                    dropdown_state['rangeMax'] = ''

                model['openDropdown'] = dropdown_state

        case DropdownSelect(dropdown_id=did, option_value=option):
            # Select an option from a dropdown
            open_dropdown = model.get('openDropdown')
            if open_dropdown and open_dropdown.get('id') == did:
                segment_index = open_dropdown.get('segmentIndex', 0)
                current_regex = model.get('search')
                if current_regex:
                    # Save to undo history
                    model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
                    model['redoHistory'] = []

                    if did.startswith('repetition-'):
                        # Repetition dropdown: option is a quantifier ('1', '?', '*', '+')
                        new_quantifier = '' if option == '1' else option
                        model['search'] = replace_segment_repetition(
                            current_regex, segment_index, new_quantifier)
                    else:
                        # Fuzzy pattern dropdown: option is a character class
                        model['search'] = replace_segment_pattern(
                            current_regex, segment_index, option)
            # Close the dropdown
            model['openDropdown'] = None

        case RepetitionInput(dropdown_id=did, field=field, value=val):
            # Handle text input in repetition dropdown ({n} or {n,m} fields)
            open_dropdown = model.get('openDropdown')
            if open_dropdown and open_dropdown.get('id') == did:
                segment_index = open_dropdown.get('segmentIndex', 0)

                # Update the field value in dropdown state
                if field == 'exact':
                    open_dropdown['exactN'] = val
                elif field == 'min':
                    open_dropdown['rangeMin'] = val
                elif field == 'max':
                    open_dropdown['rangeMax'] = val

                # Construct quantifier from current field values
                new_quantifier = None
                if field == 'exact' and val.isdigit() and val != '':
                    new_quantifier = '{' + val + '}'
                elif field in ('min', 'max'):
                    range_min = open_dropdown.get('rangeMin', '')
                    range_max = open_dropdown.get('rangeMax', '')
                    if range_min.isdigit() and range_max.isdigit():
                        new_quantifier = '{' + range_min + ',' + range_max + '}'
                    elif range_min.isdigit():
                        new_quantifier = '{' + range_min + ',}'

                # Apply if we have a valid quantifier
                if new_quantifier is not None:
                    current_regex = model.get('search')
                    if current_regex:
                        new_regex = replace_segment_repetition(
                            current_regex, segment_index, new_quantifier)
                        if new_regex != current_regex:
                            model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
                            model['redoHistory'] = []
                            model['search'] = new_regex

                # Keep dropdown open for further edits

        case FirstMatchToggle():
            current_regex = model.get('search')
            if current_regex:
                new_regex = _toggle_search_flag(current_regex, '1')
                model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
                model['redoHistory'] = []
                model['search'] = new_regex

        case CaseSensitiveToggle():
            current_regex = model.get('search')
            if current_regex:
                new_regex = _toggle_search_flag(current_regex, 'i')
                model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
                model['redoHistory'] = []
                model['search'] = new_regex

        case CaptureGroupsToggle():
            current_regex = model.get('search')
            if current_regex:
                new_regex = _toggle_search_flag(current_regex, 'c')
                turning_on = 'c' in get_search_flags(new_regex)
                if turning_on:
                    new_regex = ensure_all_groups(new_regex)
                else:
                    inner = get_regex_inner_pattern(new_regex)
                    flags = get_search_flags(new_regex)
                    if inner and is_regex_search(new_regex):
                        new_regex = canonicalize_regex(f'/{inner}/') + flags
                model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
                model['redoHistory'] = []
                model['search'] = new_regex

        case SearchBoxInput(value=val):
            # Update search directly from search box input.
            # The value includes delimiters (e.g., /pattern/) to support
            # different search types in the future.
            current_regex = model.get('search')
            new_regex = val if val else None
            if new_regex != current_regex:
                model['undoHistory'] = model.get('undoHistory', []) + [current_regex]
                model['redoHistory'] = []
                model['search'] = new_regex
            # Clear any in-progress drag state since user is editing directly
            model['anchorIdx'] = None
            model['cursorIdx'] = None
            model['dragging'] = False
            model['insertAfterSegment'] = None

        case ReplaceToggle():
            model['replace_visible'] = not model.get('replace_visible', False)

        case ReplaceBoxInput(value=val):
            model['replace_text'] = val if val else None

        case ActionButtonClick(action=action, copy=copy):
            ctx = _get_search_context(model, source_code, source_line)
            if ctx:
                result = None
                match action:
                    case 'get_transform':
                        result = _build_get_or_transform_expr(ctx)
                    case 'replace':
                        result = _build_replace_expr(ctx)
                    case 'delete':
                        result = _build_delete_expr(ctx)
                    case 'loop':
                        result = _build_loop_code(ctx)
                    case 'any':
                        result = _build_any_expr(ctx)
                    case 'all':
                        result = _build_all_expr(ctx)
                    case 'if_any':
                        if copy:
                            # Copy just the boolean expression, not the if statement
                            bool_expr = _get_copy_expr_for_if('if_any', ctx)
                            if bool_expr:
                                commands.append(CopyToClipboard(text=bool_expr))
                            return (model, commands)
                        else:
                            result = _build_if_any_code(ctx)
                    case 'if_all':
                        if copy:
                            bool_expr = _get_copy_expr_for_if('if_all', ctx)
                            if bool_expr:
                                commands.append(CopyToClipboard(text=bool_expr))
                            return (model, commands)
                        else:
                            result = _build_if_all_code(ctx)
                    case 'count':
                        result = _build_count_expr(ctx)
                    case 'filter':
                        result = _build_filter_expr(ctx)
                    case 'split':
                        result = _build_split_expr(ctx)
                if result:
                    if copy:
                        _, expr = result
                        commands.append(CopyToClipboard(text=expr))
                    else:
                        commands.append(result)

    return (model, commands)
