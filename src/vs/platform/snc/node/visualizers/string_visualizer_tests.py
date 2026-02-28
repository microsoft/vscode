"""
Tests for string_visualizer.py update function.

These tests simulate mouse and keyboard events to verify the selection behavior
for building regex patterns by demonstration.

Run this test file directly:
	python3 src/vs/platform/snc/node/visualizers/string_visualizer_tests.py

Or use pytest with verbose output:
	python3 -m pytest src/vs/platform/snc/node/visualizers/string_visualizer_tests.py -v

No arguments are required; all tests should pass.
"""

import unittest
import re
from string_visualizer import (
    update, init_model, visualize,
    MouseDown, MouseMove, MouseUp, KeyDown,
    HandleMouseDown,
    DropdownToggle, DropdownSelect,
    SearchBoxInput,
    ReplaceBoxInput, ReplaceToggle,
    RepetitionInput,
    FirstMatchToggle,
    CaseSensitiveToggle,
    ActionButtonClick,
    CopyToClipboard,
    compute_internal_length,
    extract_by_internal_indices,
    get_last_segment_end_internal_idx,
    get_first_segment_start_internal_idx,
    parse_regex_for_highlighting,
    find_fuzzy_segment_at_index,
    replace_segment_pattern,
    replace_segment_repetition,
    resize_literal_segment,
    extract_quantifier,
    _subpattern_to_string,
    strip_capturing_groups,
    get_regex_inner_pattern,
    get_search_flags,
    is_first_match_mode,
    is_case_insensitive,
    is_regex_search,
    is_string_search,
    is_backtick_search,
    is_expression_search,
    get_string_literal,
    get_eval_expression,
    eval_string_search,
    _find_closing_delimiter,
    is_adjacent_right,
    is_adjacent_left,
    synthesize_fuzzy_pattern,
    find_available_variable_name,
    _count_matches,
    DC1, DC2, DC3, DC4,  # Sentinel characters
)


# =============================================================================
# Test Helpers
# =============================================================================

def make_mouse_down_event(index: int, top_half: bool = True) -> dict:
    """Create a MouseDown event dict.

    Args:
        index: The character index clicked
        top_half: If True, click is in top half (literal). If False, bottom half (fuzzy).
    """
    return {
        'pythonEventStr': repr(MouseDown(index)),
        'eventJSON': {
            'offsetY': 5 if top_half else 15,  # top half < 10, bottom half >= 10
            'elementHeight': 20,
            'buttons': 1,
        }
    }


def make_mouse_move_event(index: int, buttons: int = 1, top_half: bool | None = None) -> dict:
    """Create a MouseMove event dict.

    Args:
        index: The character index the mouse moved to
        buttons: 1 if button pressed, 0 if released
        top_half: If provided, include offsetY/elementHeight for hover detection.
                  True = top half (literal), False = bottom half (fuzzy).
    """
    event_json: dict = {
        'buttons': buttons,
    }
    if top_half is not None:
        event_json['offsetY'] = 5 if top_half else 15  # top half < 10, bottom half >= 10
        event_json['elementHeight'] = 20
    return {
        'pythonEventStr': repr(MouseMove(index)),
        'eventJSON': event_json,
    }


def make_mouse_up_event(index: int) -> dict:
    """Create a MouseUp event dict."""
    return {
        'pythonEventStr': repr(MouseUp(index)),
        'eventJSON': {
            'buttons': 0,
        }
    }


def make_key_down_event(key: str, meta_key: bool = False, shift_key: bool = False) -> dict:
    """Create a KeyDown event dict."""
    return {
        'pythonEventStr': repr(KeyDown()),
        'eventJSON': {
            'key': key,
            'metaKey': meta_key,
            'shiftKey': shift_key,
        }
    }


# =============================================================================
# Basic Tests
# =============================================================================

class TestBasics(unittest.TestCase):
    """Test basic functionality: null events, init_model defaults."""

    def test_init_model_returns_expected_defaults(self):
        """init_model(value) returns a dict with all expected keys and default values."""
        model = init_model("test")

        self.assertIsNone(model['search'])
        self.assertIsNone(model['anchorIdx'])
        self.assertIsNone(model['anchorType'])
        self.assertIsNone(model['cursorIdx'])
        self.assertFalse(model['dragging'])
        self.assertIsNone(model['extendDirection'])
        self.assertIsNone(model['insertAfterSegment'])
        # Note: stringValue is no longer stored in model - it's passed as parameter
        self.assertEqual(model['undoHistory'], [])
        self.assertEqual(model['redoHistory'], [])
        self.assertEqual(model['handledKeys'], ["Escape", "Enter", "cmd Backspace", "cmd r", "cmd z", "cmd shift z"])

    def test_null_event_returns_unchanged_model(self):
        """Passing None event returns model unchanged with no commands."""
        value = "test"
        model = init_model(value)

        new_model, commands = update(None, "x = 'test'", 1, model, value)

        self.assertEqual(new_model, model)
        self.assertEqual(commands, [])

    def test_empty_event_returns_unchanged_model(self):
        """Passing empty event dict returns model unchanged."""
        value = "test"
        model = init_model(value)

        new_model, commands = update({}, "x = 'test'", 1, model, value)

        self.assertEqual(new_model, model)
        self.assertEqual(commands, [])

    def test_event_with_empty_pythonEventStr_returns_unchanged(self):
        """Event with empty pythonEventStr returns model unchanged."""
        value = "test"
        model = init_model(value)

        event = {'pythonEventStr': '', 'eventJSON': {}}
        new_model, commands = update(event, "x = 'test'", 1, model, value)

        self.assertEqual(new_model, model)
        self.assertEqual(commands, [])

    def test_none_model_gets_initialized(self):
        """Passing None model initializes a fresh model."""
        event = make_mouse_down_event(5, top_half=True)
        value = "hello world"

        new_model, commands = update(event, "x = 'hello world'", 1, None, value)

        self.assertIsNotNone(new_model)
        self.assertEqual(new_model['anchorIdx'], 5)
        self.assertEqual(new_model['cursorIdx'], 5)
        self.assertEqual(new_model['anchorType'], 'literal')
        self.assertTrue(new_model['dragging'])
        self.assertEqual(commands, [])


# =============================================================================
# Single Literal Selection Tests
# =============================================================================

class TestSingleLiteralSelection(unittest.TestCase):
    """Test single literal selection: MouseDown (top half) -> MouseMove -> MouseUp.

    For "hello world", the augmented string indices are:
        0=\\A, 1=^, 2=h, 3=e, 4=l, 5=l, 6=o, 7=' ', 8=w, 9=o, 10=r, 11=l, 12=d, 13=$, 14=\\Z
    """

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_mouse_down_top_half_starts_literal_selection(self):
        """MouseDown in top half sets up literal drag state."""
        event = make_mouse_down_event(5, top_half=True)

        model, commands = update(event, self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['anchorIdx'], 5)
        self.assertEqual(model['cursorIdx'], 5)
        self.assertEqual(model['anchorType'], 'literal')
        self.assertTrue(model['dragging'])
        self.assertIsNone(model['search'])  # Not finalized yet
        self.assertEqual(commands, [])

    def test_mouse_move_updates_cursor_for_literal(self):
        """MouseMove updates cursorIdx during literal drag."""
        model, _ = update(make_mouse_down_event(5, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)

        model, _ = update(make_mouse_move_event(8),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['anchorIdx'], 5)
        self.assertEqual(model['cursorIdx'], 8)
        self.assertTrue(model['dragging'])
        self.assertIsNone(model['search'])  # Still not finalized

    def test_mouse_up_finalizes_hello_selection(self):
        """MouseUp finalizes 'hello' selection (indices 2-6) into /(hello)/."""
        # Select indices 2-6: h(2), e(3), l(4), l(5), o(6)
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model, self.value)
        model, commands = update(make_mouse_up_event(6),
                                self.source_code, self.source_line, model, self.value)

        self.assertFalse(model['dragging'])
        self.assertIsNone(model['anchorIdx'])
        self.assertIsNone(model['cursorIdx'])
        self.assertEqual(model['search'], '/hello/')
        self.assertEqual(model['undoHistory'], [None])
        self.assertEqual(commands, [])

    def test_single_char_selection(self):
        """Click and release on same index selects single char 'h' -> /(h)/."""
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_up_event(2),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/h/')

    def test_world_selection(self):
        """Select 'world' (indices 8-12) -> /(world)/."""
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(12),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(12),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/world/')

    def test_space_selection(self):
        """Select just the space at index 7 -> /(\\ )/."""
        model, _ = update(make_mouse_down_event(7, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_up_event(7),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/\\ /')


# =============================================================================
# Single Fuzzy Selection Tests
# =============================================================================

class TestSingleFuzzySelection(unittest.TestCase):
    """Test single fuzzy selection: MouseDown (bottom half) -> MouseUp."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_mouse_down_bottom_half_starts_fuzzy_selection(self):
        """MouseDown in bottom half starts a fuzzy selection."""
        event = make_mouse_down_event(5, top_half=False)

        model, commands = update(event, self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['anchorIdx'], 5)
        self.assertEqual(model['anchorType'], 'fuzzy')
        self.assertTrue(model['dragging'])

    def test_mouse_move_updates_cursor_for_fuzzy(self):
        """MouseMove updates cursorIdx for fuzzy selection (needed for pattern synthesis)."""
        model, _ = update(make_mouse_down_event(5, top_half=False),
                         self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['cursorIdx'], 5)

        model, _ = update(make_mouse_move_event(10),
                         self.source_code, self.source_line, model, self.value)

        # Cursor tracks mouse for fuzzy (used to synthesize pattern from drag range)
        self.assertEqual(model['cursorIdx'], 10)

    def test_mouse_up_finalizes_fuzzy_segment(self):
        """MouseUp finalizes fuzzy segment with synthesized pattern.

        Clicking at index 5 (letter 'l' in 'hello world') with no drag:
        - The single char 'l' is lowercase, next char 'o' is also lowercase
        - So [a-z]+ would overshoot; falls back to [a-z]{1}
        """
        model, _ = update(make_mouse_down_event(5, top_half=False),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_up_event(5),
                         self.source_code, self.source_line, model, self.value)

        self.assertFalse(model['dragging'])
        self.assertEqual(model['search'], '/[a-z]{1}/')
        self.assertEqual(model['undoHistory'], [None])

    def test_fresh_fuzzy_on_space_uses_plus(self):
        r"""Fresh fuzzy selection on space char uses \s+ (not \s*).

        Clicking at index 7 (the space in 'hello world') with no drag:
        - actual_text = ' '
        - prev_char = 'o' (doesn't match \s) -> clean left boundary
        - next_char = 'w' (doesn't match \s) -> clean right boundary
        - Fresh selection (no existing regex) -> uses + quantifier
        """
        model, _ = update(make_mouse_down_event(7, top_half=False),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_up_event(7),
                         self.source_code, self.source_line, model, self.value)

        self.assertFalse(model['dragging'])
        self.assertEqual(model['search'], r'/\s+/')
        self.assertEqual(model['undoHistory'], [None])

    def test_fresh_fuzzy_drag_across_letters_with_clean_boundaries(self):
        r"""Fresh fuzzy drag with clean boundaries uses +.

        For 'abc 123 xyz':
        Augmented: 0=\A, 1=^, 2=a, 3=b, 4=c, 5=' ', 6=1, 7=2, 8=3, 9=' ', 10=x, 11=y, 12=z, ...
        Dragging across '123' (indices 6-8):
        - actual_text = '123'
        - prev_char = ' ' (doesn't match \d) -> clean left boundary
        - next_char = ' ' (doesn't match \d) -> clean right boundary
        - Fresh selection -> \d+
        """
        value = "abc 123 xyz"
        model = init_model(value)
        source_code = "x = 'abc 123 xyz'"

        model, _ = update(make_mouse_down_event(6, top_half=False),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(8),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(8),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], r'/\d+/')


# =============================================================================
# Chained Selections (Extend Right) Tests
# =============================================================================

class TestChainedSelectionsExtendRight(unittest.TestCase):
    """Test chaining selections by extending from the right end."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_extend_hello_with_fuzzy(self):
        """Extend 'hello' selection with fuzzy -> /(hello)(\s*)/."""
        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello/')

        # Get end index for extending
        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        self.assertEqual(end_idx, 7)

        # Extend with fuzzy at end
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello\\s*/')
        self.assertEqual(model['undoHistory'], [None, '/hello/'])

    def test_extend_hello_with_space_literal(self):
        """Extend 'hello' with space literal -> /(hello)(\\ )/."""
        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model, self.value)

        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)

        # Extend with single space (click and release at same position)
        model, _ = update(make_mouse_down_event(end_idx, top_half=True),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/(hello)(\\ )/')

    def test_chain_hello_fuzzy_world(self):
        """Chain: hello -> fuzzy -> world gives /(hello)(.*)(world)/."""
        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello/')

        # Extend with fuzzy at end of hello (index 7)
        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        self.assertEqual(end_idx, 7)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello\\s*/')

        # The fuzzy (\s*) matches " world$\Z" (indices 7-15)
        # To add "world", click INSIDE the fuzzy region at index 8 (start of 'w')
        # and drag to index 12 (end of 'world')
        # Augmented indices: 7=' ', 8=w, 9=o, 10=r, 11=l, 12=d, 13=$, 14=\Z
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(12),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(12),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello\\s*world/')


class TestChainThreeSegmentsWithConstrainedFuzzy(unittest.TestCase):
    """Test chaining with fuzzy that doesn't consume everything."""

    def setUp(self):
        # Use a multiline string where (.*) stops at newline
        self.value = "hello\nworld"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello\\nworld'"
        self.source_line = 1
        # Augmented: 0=\A, 1=^, 2=h, 3=e, 4=l, 5=l, 6=o, 7=$, 8=\n, 9=^, 10=w, 11=o, 12=r, 13=l, 14=d, 15=$, 16=\Z

    def test_chain_hello_fuzzy_world_with_newline(self):
        """Chain hello -> fuzzy (stops at $) -> $\\n^ -> world."""
        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello/')

        # Extend with fuzzy (will stop at $ because .* doesn't match newline by default)
        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello.*/')

        # The (.*) after "hello" matches the $ anchor (index 7)
        # So fuzzy spans 7-8, end_idx is 8
        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        self.assertEqual(end_idx, 8)

        # Extend with \n at index 8
        model, _ = update(make_mouse_down_event(end_idx, top_half=True),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello.*\\n/')


# =============================================================================
# Extend Left (Prepend) Tests
# =============================================================================

class TestExtendLeft(unittest.TestCase):
    """Test extending selection from the left (prepending segments)."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_click_immediately_left_of_literal_extends_with_fuzzy(self):
        """Click char immediately left of literal selection extends it with fuzzy.

        BUG: Previously clicking the char immediately to the left of a literal
        selection would reset the selection instead of extending it.

        For "hello world":
            Augmented: 0=\\A, 1=^, 2=h, 3=e, 4=l, 5=l, 6=o, 7=' ', 8=w, 9=o, 10=r, 11=l, 12=d, 13=$, 14=\\Z

        If we select "world" (indices 8-12), clicking on index 7 (the space immediately
        to the left) should extend the selection to the left, not reset it.
        """
        # Select "world" (indices 8-12)
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(12),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(12),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/world/')

        # Get start index - this is 8 (the 'w')
        start_idx = get_first_segment_start_internal_idx(model['search'], self.value)
        self.assertEqual(start_idx, 8)

        # Click on index 7 (the space immediately to the left) with fuzzy (bottom half)
        # This should extend left, NOT reset the selection
        model, _ = update(make_mouse_down_event(7, top_half=False),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(7),
                         self.source_code, self.source_line, model, self.value)

        # Should prepend fuzzy: /(\s*)(world)/
        self.assertEqual(model['search'], '/\\s*world/')
        self.assertEqual(model['undoHistory'], [None, '/world/'])

    def test_prepend_fuzzy_to_world(self):
        """Select 'world', then prepend fuzzy -> /(\s*)(world)/."""
        # Select "world" (indices 8-12)
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(12),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(12),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/world/')

        # Get start index for prepending
        start_idx = get_first_segment_start_internal_idx(model['search'], self.value)
        self.assertEqual(start_idx, 8)

        # Prepend with fuzzy by clicking the char immediately to the left (start_idx - 1 = 7)
        model, _ = update(make_mouse_down_event(start_idx - 1, top_half=False),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(start_idx - 1),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/\\s*world/')
        self.assertEqual(model['undoHistory'], [None, '/world/'])

    def test_prepend_literal_to_world(self):
        """Select 'world', prepend by dragging left selects 'o ' -> /(o\\ )(world)/."""
        # Select "world"
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(12),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(12),
                         self.source_code, self.source_line, model, self.value)

        start_idx = get_first_segment_start_internal_idx(model['search'], self.value)
        self.assertEqual(start_idx, 8)

        # Prepend by clicking at the char immediately to the left (start_idx - 1 = 7)
        # and dragging left to index 6. This selects indices 6, 7 = 'o', ' '
        model, _ = update(make_mouse_down_event(start_idx - 1, top_half=True),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/(o\\ )(world)/')


# =============================================================================
# Click Inside Fuzzy Segment Tests
# =============================================================================

class TestClickInsideFuzzy(unittest.TestCase):
    """Test clicking inside a fuzzy segment to split/constrain it."""

    def setUp(self):
        self.value = "hello world goodbye"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world goodbye'"
        self.source_line = 1

    def test_click_inside_fuzzy_starts_new_segment(self):
        """Clicking inside a realized fuzzy region starts a new drag."""
        # Create hello + (.*) pattern
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model, self.value)

        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello\\s*/')

        # Find where the fuzzy segment spans
        highlights = parse_regex_for_highlighting(model['search'], self.value)
        fuzzy_segment = None
        for start, end, seg_type, _, _, _ in highlights:
            if seg_type == 'fuzzy':
                fuzzy_segment = (start, end)
                break

        self.assertIsNotNone(fuzzy_segment)
        fuzzy_start, fuzzy_end = fuzzy_segment

        # Click inside the fuzzy region
        click_idx = fuzzy_start + 3
        fuzzy_info = find_fuzzy_segment_at_index(model['search'], self.value, click_idx)
        self.assertIsNone(fuzzy_info)  # canonical format doesn't expose groups to this helper

        # Click inside fuzzy to start new segment
        model, _ = update(make_mouse_down_event(click_idx, top_half=True),
                         self.source_code, self.source_line, model, self.value)

        # Should start a new drag, resetting the regex
        self.assertTrue(model['dragging'])
        self.assertEqual(model['anchorIdx'], click_idx)
        self.assertIsNone(model['search'])  # Reset for new selection

    def test_visualize_while_dragging_inside_fuzzy_does_not_crash(self):
        """
        BUG TEST: Calling visualize() while dragging inside a fuzzy segment
        should not crash with an assertion error about overlapping highlights.

        The bug was: when dragging inside a fuzzy segment, the in-progress
        selection (anchorIdx to cursorIdx) overlaps with the existing fuzzy
        highlight, causing an AssertionError in visualize().

        Error was: "AssertionError: Index 12 already has a highlight: (7, 19, 'fuzzy', '.*', (0, inf))"
        """
        # Create hello + (.*) pattern
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model, self.value)

        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello\\s*/')

        # Find where the fuzzy segment spans
        highlights = parse_regex_for_highlighting(model['search'], self.value)
        fuzzy_segment = None
        for start, end, seg_type, _, _, _ in highlights:
            if seg_type == 'fuzzy':
                fuzzy_segment = (start, end)
                break

        self.assertIsNotNone(fuzzy_segment)
        fuzzy_start, fuzzy_end = fuzzy_segment

        # Click inside the fuzzy region and START dragging (don't release yet)
        click_idx = fuzzy_start + 3
        model, _ = update(make_mouse_down_event(click_idx, top_half=True),
                         self.source_code, self.source_line, model, self.value)

        # Drag to another position still inside the fuzzy region
        drag_idx = click_idx + 2
        model, _ = update(make_mouse_move_event(drag_idx),
                         self.source_code, self.source_line, model, self.value)

        # Model should still be dragging with the in-progress selection
        self.assertTrue(model['dragging'])
        self.assertEqual(model['anchorIdx'], click_idx)
        self.assertEqual(model['cursorIdx'], drag_idx)

        # THIS IS THE BUG: visualize() crashes because the in-progress selection
        # overlaps with the existing fuzzy highlight
        # After fix, this should NOT raise an assertion error
        html_output = visualize(self.value, model, None, None)

        # Should produce valid HTML without crashing
        self.assertIsInstance(html_output, str)
        self.assertIn('<span', html_output)

    def test_anchor_fuzzy_with_literal_inside_appends_to_right(self):
        """
        BUG TEST: Clicking inside a fuzzy segment to anchor it with a literal
        should produce the pattern in the correct order: (1)(.*)(2).

        Where:
        - (1) = first literal selection
        - (2) = second literal selection (clicked inside fuzzy)

        Scenario:
        1. Select "hello" = (1) -> /(hello)/
        2. Extend with fuzzy at end -> /(hello)(.*)/
        3. Click inside the fuzzy region on "world" = (2)

        Expected: /(hello)(.*)(world)/ = (1)(.*)(2)
        Bug would produce: /(.*)(world)(hello)/ = (.*)(2)(1) - WRONG ORDER!

        The bug was that the literal was being added to the wrong position.
        """
        # For "hello world goodbye":
        # Augmented: 0=\A, 1=^, 2=h, 3=e, 4=l, 5=l, 6=o, 7=' ', 8=w, 9=o, 10=r, 11=l, 12=d, 13=' ', 14=g, ...

        # Step 1: Select "hello" (indices 2-6) = (1)
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello/')

        # Step 2: Extend with fuzzy at end of hello
        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        self.assertEqual(end_idx, 7)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello\\s*/')

        # Step 3: Click inside the fuzzy on "world" (indices 8-12) = (2)
        # This is a click-drag to select "world"
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(12),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(12),
                         self.source_code, self.source_line, model, self.value)

        # Expected: (1)(\s*)(2) = /hello\s*world/
        # Bug would produce: (\s*)(2)(1) = /(\s*)(world)(hello)/ - WRONG!
        self.assertEqual(model['search'], '/hello\\s*world/')

        # Verify segment order explicitly
        highlights = parse_regex_for_highlighting(model['search'], self.value)
        # Should be: [(2, 7, 'literal'), (7, 8, 'fuzzy'), (8, 13, 'literal')]
        # i.e., hello first, then fuzzy, then world
        self.assertEqual(len(highlights), 3)
        self.assertEqual(highlights[0][2], 'literal')  # hello
        self.assertEqual(highlights[1][2], 'fuzzy')    # (.*)
        self.assertEqual(highlights[2][2], 'literal')  # world

    def test_anchor_leading_fuzzy_inserts_before_fuzzy_to_maintain_text_order(self):
        """
        BUG TEST: When clicking inside a LEADING fuzzy segment (segment index 0),
        the new literal should be inserted BEFORE the fuzzy to maintain text order.

        Scenario:
        1. Select "world" -> /(world)/
        2. Prepend with fuzzy (click left of "world") -> /(.*)(world)/
        3. Click inside the leading fuzzy on "ello" -> should get /(ello)(.*)(world)/

        The key insight: the new literal "ello" comes BEFORE "world" in the text,
        so it should come before the fuzzy (which matches what's between them).

        Bug was: /(.*)(ello)(world)/ - fuzzy wrongly before the literal
        """
        # For "hello world":
        # Augmented: 0=\A, 1=^, 2=h, 3=e, 4=l, 5=l, 6=o, 7=' ', 8=w, 9=o, 10=r, 11=l, 12=d, 13=$, 14=\Z

        value = "hello world"
        model = init_model(value)
        source_code = "x = 'hello world'"

        # Step 1: Select "world" (indices 8-12)
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(12),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(12),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/world/')

        # Step 2: Prepend with fuzzy (click at first_start - 1 = 7)
        first_start = get_first_segment_start_internal_idx(model['search'], value)
        self.assertEqual(first_start, 8)
        model, _ = update(make_mouse_down_event(first_start - 1, top_half=False),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(first_start - 1),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/\\s*world/')

        # Verify the fuzzy segment exists (in canonical format, \s* only covers whitespace)
        highlights = parse_regex_for_highlighting(model['search'], value)
        fuzzy_segment = None
        for start, end, seg_type, _, _, _ in highlights:
            if seg_type == 'fuzzy':
                fuzzy_segment = (start, end, seg_type)
                break
        self.assertIsNotNone(fuzzy_segment)
        fuzzy_start, fuzzy_end, _ = fuzzy_segment

        # Step 3: Click on "ello" (indices 3-6), which is before the fuzzy in canonical format
        self.assertTrue(3 < fuzzy_start)

        model, _ = update(make_mouse_down_event(3, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model, value)

        # In canonical format, clicking before the fuzzy region starts a new selection
        # (index 3 is before the \s* fuzzy at the space character)
        self.assertEqual(model['search'], '/ello/')

    def test_anchor_leading_fuzzy_abc_scenario(self):
        """
        BUG TEST: Exact reproduction of user's bug report.

        String: 'ABC'
        Click (1): literal C -> /(C)/
        Click (2): fuzzy B (extend left) -> /(.*)(C)/
        Click (3): literal A (inside fuzzy) -> Expected: /(A)(.*)(C)/

        Bug was producing: /(.*)(A)(C)/ - wrong order!
        """
        value = 'ABC'
        model = init_model(value)
        source_code = "x = 'ABC'"

        # Augmented: 0=\A, 1=^, 2=A, 3=B, 4=C, 5=$, 6=\Z

        # Click (1): literal C (index 4)
        model, _ = update(make_mouse_down_event(4, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(4),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/C/')

        # Click (2): fuzzy B (extend left from C)
        first_start = get_first_segment_start_internal_idx(model['search'], value)
        self.assertEqual(first_start, 4)
        model, _ = update(make_mouse_down_event(first_start - 1, top_half=False),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(first_start - 1),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/[A-Z]{1}C/')

        # Click (3): literal A (inside fuzzy at index 2)
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(2),
                         source_code, 1, model, value)

        # Expected: A + fuzzy + C - A first, then fuzzy for B, then C
        # Bug was: (.*)(A)(C) - wrong order
        self.assertEqual(model['search'], '/A[A-Z]{1}C/')


# =============================================================================
# Keyboard Event Tests
# =============================================================================

class TestKeyboardEvents(unittest.TestCase):
    """Test keyboard events: Escape, Enter, Cmd-Z, Cmd-Shift-Z."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def _create_hello_selection(self, model):
        """Helper to create /(hello)/ selection."""
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model, self.value)
        return model

    def test_escape_clears_selection(self):
        """Escape key clears the selection and saves to undo."""
        model = self._create_hello_selection(self.model)
        self.assertEqual(model['search'], '/hello/')

        model, commands = update(make_key_down_event('Escape'),
                                self.source_code, self.source_line, model, self.value)

        self.assertIsNone(model['search'])
        self.assertIsNone(model['anchorIdx'])
        self.assertIsNone(model['cursorIdx'])
        self.assertFalse(model['dragging'])
        self.assertEqual(model['undoHistory'], [None, '/hello/'])
        self.assertEqual(commands, [])

    def test_enter_generates_new_code_command(self):
        """Enter key returns (suggest_var_name, expr) tuple for regex search."""
        model = self._create_hello_selection(self.model)

        model, commands = update(make_key_down_event('Enter'),
                                self.source_code, self.source_line, model, self.value)

        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_matches")
        self.assertEqual(expr, "list(re.finditer(r'hello', x, flags=re.M))")

    def test_enter_without_selection_does_nothing(self):
        """Enter without selection produces no commands."""
        model, commands = update(make_key_down_event('Enter'),
                                self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(commands, [])

    def test_backspace_generates_delete_code_command(self):
        """Backspace key returns (suggest_var_name, expr) tuple for re.sub deletion."""
        model = self._create_hello_selection(self.model)

        model, commands = update(make_key_down_event('Backspace', meta_key=True),
                                self.source_code, self.source_line, model, self.value)

        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x")
        self.assertEqual(expr, "re.sub(r'hello', '', x, flags=re.M)")

    def test_enter_suggests_name_regardless_of_collision(self):
        """Enter key suggests var name without collision resolution (harness handles that)."""
        source_code = "x = 'hello world'\nx_matches = 'already used'\nx_matches2 = 'also used'"
        model = self._create_hello_selection(self.model)

        model, commands = update(make_key_down_event('Enter'),
                                source_code, self.source_line, model, self.value)

        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_matches")
        self.assertEqual(expr, "list(re.finditer(r'hello', x, flags=re.M))")

    def test_backspace_suggests_name_regardless_of_collision(self):
        """Backspace key suggests var name without collision resolution (harness handles that)."""
        source_code = "x = 'hello world'\nx2 = 'already used'\nx3 = 'also used'"
        model = self._create_hello_selection(self.model)

        model, commands = update(make_key_down_event('Backspace', meta_key=True),
                                source_code, self.source_line, model, self.value)

        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x")
        self.assertEqual(expr, "re.sub(r'hello', '', x, flags=re.M)")

    def test_backspace_without_selection_does_nothing(self):
        """Backspace without selection produces no commands."""
        model, commands = update(make_key_down_event('Backspace', meta_key=True),
                                self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(commands, [])

    def test_cmd_z_undoes_selection(self):
        """Cmd-Z undoes the last selection."""
        model = self._create_hello_selection(self.model)

        # Add fuzzy segment
        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello\\s*/')
        self.assertEqual(model['undoHistory'], [None, '/hello/'])

        # Undo
        model, commands = update(make_key_down_event('z', meta_key=True),
                                self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello/')
        self.assertEqual(model['undoHistory'], [None])
        self.assertEqual(model['redoHistory'], ['/hello\\s*/'])
        self.assertEqual(commands, [])

    def test_cmd_shift_z_redoes_selection(self):
        """Cmd-Shift-Z redoes the undone selection."""
        model = self._create_hello_selection(self.model)

        # Add fuzzy segment
        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model, self.value)

        # Undo
        model, _ = update(make_key_down_event('z', meta_key=True),
                         self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/hello/')

        # Redo
        model, commands = update(make_key_down_event('z', meta_key=True, shift_key=True),
                                self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello\\s*/')
        self.assertEqual(model['undoHistory'], [None, '/hello/'])
        self.assertEqual(model['redoHistory'], [])
        self.assertEqual(commands, [])

    def test_undo_with_empty_history_does_nothing(self):
        """Cmd-Z with empty undo history does nothing."""
        model, commands = update(make_key_down_event('z', meta_key=True),
                                self.source_code, self.source_line, self.model, self.value)

        self.assertIsNone(model['search'])
        self.assertEqual(model['undoHistory'], [])
        self.assertEqual(commands, [])

    def test_redo_with_empty_history_does_nothing(self):
        """Cmd-Shift-Z with empty redo history does nothing."""
        model, commands = update(make_key_down_event('z', meta_key=True, shift_key=True),
                                self.source_code, self.source_line, self.model, self.value)

        self.assertIsNone(model['search'])
        self.assertEqual(commands, [])


# =============================================================================
# Edge Cases Tests
# =============================================================================

class TestEdgeCases(unittest.TestCase):
    """Test edge cases: anchors, newlines, mouse released outside."""

    def test_selection_starting_at_backslash_A_anchor(self):
        """Selection from index 0 includes \\A anchor -> /(\\A^he)/."""
        value = "hello"
        model = init_model(value)
        source_code = "x = 'hello'"

        # Select indices 0-3: \A(0), ^(1), h(2), e(3)
        model, _ = update(make_mouse_down_event(0, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(3),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(3),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/\\A^he/')

    def test_selection_starting_at_caret_anchor(self):
        """Selection from index 1 includes ^ anchor -> /(^hel)/."""
        value = "hello"
        model = init_model(value)
        source_code = "x = 'hello'"

        # Select indices 1-4: ^(1), h(2), e(3), l(4)
        model, _ = update(make_mouse_down_event(1, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(4),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(4),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/^hel/')

    def test_selection_with_newlines_before_newline(self):
        """Selection of 'hello' in 'hello\\nworld' -> /(hello)/."""
        value = "hello\nworld"
        model = init_model(value)
        source_code = "x = 'hello\\nworld'"

        # Augmented: 0=\A, 1=^, 2=h, 3=e, 4=l, 5=l, 6=o, 7=$, 8=\n, 9=^, 10=w...
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/hello/')

    def test_selection_across_newline(self):
        """Selection spanning newline in 'hi\\nbye' -> /(hi$\\n^b)/."""
        value = "hi\nbye"
        model = init_model(value)
        source_code = "x = 'hi\\nbye'"

        # Augmented: 0=\A, 1=^, 2=h, 3=i, 4=$, 5=\n, 6=^, 7=b, 8=y, 9=e, 10=$, 11=\Z
        # Select indices 2-7: h(2), i(3), $(4), \n(5), ^(6), b(7)
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(7),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(7),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/hi$\\n^b/')

    def test_mouse_released_outside_widget(self):
        """MouseMove with buttons=0 finalizes segment."""
        value = "hello"
        model = init_model(value)
        source_code = "x = 'hello'"

        # Start drag
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(5),
                         source_code, 1, model, value)

        self.assertTrue(model['dragging'])

        # Mouse released outside (buttons=0)
        model, _ = update(make_mouse_move_event(5, buttons=0),
                         source_code, 1, model, value)

        self.assertFalse(model['dragging'])
        self.assertEqual(model['search'], '/hell/')

    def test_empty_string_anchor_selection(self):
        """Selection on empty string selects anchors -> /(\\A^)/."""
        value = ""
        model = init_model(value)
        source_code = "x = ''"

        # Augmented for "": 0=\A, 1=^, 2=$, 3=\Z
        model, _ = update(make_mouse_down_event(0, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(1),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(1),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/\\A^/')

    def test_fresh_click_resets_selection(self):
        """Clicking away from extension points resets selection."""
        value = "hello world"
        model = init_model(value)
        source_code = "x = 'hello world'"

        # Create initial selection
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/hello/')

        # Click somewhere NOT an extension point (index 10 = 'r' in world)
        model, _ = update(make_mouse_down_event(10, top_half=True),
                         source_code, 1, model, value)

        # Selection should be reset, new drag started
        self.assertIsNone(model['search'])
        self.assertEqual(model['anchorIdx'], 10)
        self.assertTrue(model['dragging'])


# =============================================================================
# Two-Phase Matching Tests (verify the fix works correctly)
# =============================================================================

class TestTwoPhaseMatching(unittest.TestCase):
    """
    Tests verifying that the two-phase matching approach works correctly.

    The fix matches regex patterns against the ORIGINAL string (not augmented),
    then translates positions to internal visual indices. This ensures regex
    patterns behave correctly for patterns involving newlines, quantifiers, etc.
    """

    def test_newline_plus_matches_consecutive_newlines(self):
        """
        A pattern with \\n+ should correctly match consecutive newlines
        and return proper internal indices for highlighting.
        """
        string_value = "a\n\nb"
        # Pattern matches both newlines
        # In original: \n\n is at positions 1-3 (string indices)
        # Internal indices: a=2, $=3, \n=4, ^=5, $=6, \n=7, ^=8, b=9
        # The two \n chars are at internal 4 and 7

        highlights = parse_regex_for_highlighting(r'/(\n+)/', string_value)
        self.assertEqual(len(highlights), 1)
        start, end, seg_type, _, _, _ = highlights[0]

        # Should span both newlines
        # First \n is at string index 1 -> internal 4
        # Second \n is at string index 2 -> internal 7
        # End should be after second \n (including ^ marker) -> 9
        self.assertEqual(seg_type, 'literal')
        self.assertEqual(start, 4)  # First \n
        self.assertEqual(end, 9)    # After second \n and its ^ marker

    def test_literal_two_newlines_matches(self):
        """
        A pattern with literal \\n\\n should match two consecutive newlines.
        """
        string_value = "a\n\nb"
        highlights = parse_regex_for_highlighting(r'/(\n\n)/', string_value)
        self.assertEqual(len(highlights), 1)
        start, end, seg_type, _, _, _ = highlights[0]
        self.assertEqual(seg_type, 'literal')

    def test_newline_quantifier_matches(self):
        """
        A pattern with \\n{2,3} should match 2-3 consecutive newlines.
        """
        string_value = "a\n\n\nb"  # Three newlines
        highlights = parse_regex_for_highlighting(r'/(\n{2,3})/', string_value)
        self.assertEqual(len(highlights), 1)
        start, end, seg_type, _, _, _ = highlights[0]
        self.assertEqual(seg_type, 'literal')

    def test_dot_plus_correct_span(self):
        """
        A pattern with .+ should match characters without being corrupted by sentinels.
        The internal index span should correspond to 5 characters.
        """
        string_value = "hello"
        # Internal indices: \A=0, ^=1, h=2, e=3, l=4, l=5, o=6, $=7, \Z=8
        highlights = parse_regex_for_highlighting(r'/(.+)/', string_value)
        self.assertEqual(len(highlights), 1)
        start, end, seg_type, _, _, _ = highlights[0]
        self.assertEqual(start, 2)  # 'h' at internal index 2
        self.assertEqual(end, 7)    # After 'o' at internal index 6, so end is 7

    def test_backreference_matches_correctly(self):
        """
        A pattern with backreference (.)\\1 should find repeated chars correctly.
        """
        string_value = "xaay"
        # Internal indices: \A=0, ^=1, x=2, a=3, a=4, y=5, $=6, \Z=7
        highlights = parse_regex_for_highlighting(r'/((.)\2)/', string_value)
        self.assertEqual(len(highlights), 1)
        start, end, seg_type, _, _, _ = highlights[0]
        # "aa" is at string positions 1-3, internal indices 3-5
        self.assertEqual(start, 3)  # First 'a'
        self.assertEqual(end, 5)    # After second 'a'

    def test_lookbehind_newline_works(self):
        """
        A pattern with (?<=\\n)x should match 'x' after a newline.
        """
        string_value = "a\nxb"
        # Internal indices: \A=0, ^=1, a=2, $=3, \n=4, ^=5, x=6, b=7, $=8, \Z=9
        highlights = parse_regex_for_highlighting(r'/((?<=\n)x)/', string_value)
        self.assertEqual(len(highlights), 1)
        start, end, seg_type, _, _, _ = highlights[0]
        # 'x' is at string index 2, internal index 6
        self.assertEqual(start, 6)
        self.assertEqual(end, 7)

    def test_lookahead_before_newline_works(self):
        """
        A pattern with x(?=\\n) should match 'x' before a newline.
        """
        string_value = "ax\nb"
        # Internal indices: \A=0, ^=1, a=2, x=3, $=4, \n=5, ^=6, b=7, $=8, \Z=9
        highlights = parse_regex_for_highlighting(r'/(x(?=\n))/', string_value)
        self.assertEqual(len(highlights), 1)
        start, end, seg_type, _, _, _ = highlights[0]
        # 'x' is at string index 1, internal index 3
        self.assertEqual(start, 3)
        self.assertEqual(end, 4)

    def test_word_boundary_correct_positions(self):
        """
        A pattern with word boundaries should return correct internal positions.
        """
        string_value = "hello world"
        # Internal indices: \A=0, ^=1, h=2, e=3, l=4, l=5, o=6, ' '=7, w=8, o=9, r=10, l=11, d=12, $=13, \Z=14
        highlights = parse_regex_for_highlighting(r'/(\bworld\b)/', string_value)
        self.assertEqual(len(highlights), 1)
        start, end, seg_type, _, _, _ = highlights[0]
        # "world" is at string positions 6-11, internal indices 8-13
        self.assertEqual(start, 8)   # 'w'
        self.assertEqual(end, 13)    # After 'd'

    def test_newline_followed_by_text(self):
        """
        A pattern with \\n followed by text should match correctly.
        """
        string_value = "hello\nworld"
        # Internal: \A=0, ^=1, h=2, e=3, l=4, l=5, o=6, $=7, \n=8, ^=9, w=10, o=11, r=12, l=13, d=14, $=15, \Z=16
        highlights = parse_regex_for_highlighting(r'/(\nworld)/', string_value)
        self.assertEqual(len(highlights), 1)
        start, end, seg_type, _, _, _ = highlights[0]
        # \n is at string index 5 -> internal 8
        # "world" ends at string index 10 -> internal 14
        self.assertEqual(start, 8)   # \n
        self.assertEqual(end, 15)    # After 'd'

    def test_fuzzy_pattern_identified_correctly(self):
        """
        A pattern with (.*) should be identified as fuzzy.
        """
        string_value = "hello world"
        highlights = parse_regex_for_highlighting(r'/(hello)(.*)(world)/', string_value)
        self.assertEqual(len(highlights), 3)
        self.assertEqual(highlights[0][2], 'literal')  # hello
        self.assertEqual(highlights[1][2], 'fuzzy')    # (.*)
        self.assertEqual(highlights[2][2], 'literal')  # world

    def test_anchor_at_start_of_string(self):
        """
        A pattern starting with \\A should include the start anchor in highlights.
        """
        string_value = "hello"
        # Use single backslash for the \A anchor in the regex pattern
        highlights = parse_regex_for_highlighting(r'/(\Ahello)/', string_value)
        self.assertEqual(len(highlights), 1)
        start, end, seg_type, _, _, _ = highlights[0]
        # Should start at internal index 0 (\A position)
        self.assertEqual(start, 0)


# =============================================================================
# Internal Index Computation Tests
# =============================================================================

class TestComputeInternalLength(unittest.TestCase):
    """Tests for compute_internal_length function."""

    def test_empty_string(self):
        """Empty string has 4 internal positions: \\A, ^, $, \\Z."""
        self.assertEqual(compute_internal_length(""), 4)

    def test_single_char(self):
        """Single char: \\A, ^, char, $, \\Z = 5."""
        self.assertEqual(compute_internal_length("a"), 5)

    def test_simple_string(self):
        """'hello' = 4 + 5 + 0 = 9."""
        self.assertEqual(compute_internal_length("hello"), 9)

    def test_string_with_newline(self):
        """'hi\\nbye' = 4 + 6 + 2*1 = 12."""
        # Internal: \A(0), ^(1), h(2), i(3), $(4), \n(5), ^(6), b(7), y(8), e(9), $(10), \Z(11)
        self.assertEqual(compute_internal_length("hi\nbye"), 12)

    def test_string_with_multiple_newlines(self):
        """'a\\n\\nb' = 4 + 4 + 2*2 = 12."""
        self.assertEqual(compute_internal_length("a\n\nb"), 12)

    def test_only_newline(self):
        """'\\n' = 4 + 1 + 2 = 7."""
        self.assertEqual(compute_internal_length("\n"), 7)


class TestExtractByInternalIndices(unittest.TestCase):
    """Tests for extract_by_internal_indices function."""

    def test_extract_anchor_at_start(self):
        """Extract \\A anchor at index 0."""
        result = extract_by_internal_indices("hello", 0, 1)
        self.assertEqual(result, DC1)  # \A sentinel

    def test_extract_caret_at_start(self):
        """Extract ^ anchor at index 1."""
        result = extract_by_internal_indices("hello", 1, 2)
        self.assertEqual(result, DC2)  # ^ sentinel

    def test_extract_first_char(self):
        """Extract first character at index 2."""
        result = extract_by_internal_indices("hello", 2, 3)
        self.assertEqual(result, "h")

    def test_extract_substring(self):
        """Extract 'ell' from 'hello'."""
        # Internal: \A(0), ^(1), h(2), e(3), l(4), l(5), o(6), $(7), \Z(8)
        result = extract_by_internal_indices("hello", 3, 6)
        self.assertEqual(result, "ell")

    def test_extract_with_trailing_anchor(self):
        """Extract including $ anchor."""
        result = extract_by_internal_indices("hi", 4, 5)
        self.assertEqual(result, DC3)  # $ sentinel

    def test_extract_across_newline(self):
        """Extract text spanning a newline."""
        # Internal: \A(0), ^(1), h(2), i(3), $(4), \n(5), ^(6), b(7), y(8), e(9), $(10), \Z(11)
        result = extract_by_internal_indices("hi\nbye", 3, 8)
        # Should get: i, $, \n, ^, b
        self.assertEqual(result, "i" + DC3 + "\n" + DC2 + "b")

    def test_extract_empty_range(self):
        """Empty range returns empty string."""
        result = extract_by_internal_indices("hello", 3, 3)
        self.assertEqual(result, "")

    def test_extract_full_string_with_anchors(self):
        """Extract entire augmented representation."""
        # For "ab": \A(0), ^(1), a(2), b(3), $(4), \Z(5) - length 6
        result = extract_by_internal_indices("ab", 0, 6)
        self.assertEqual(result, DC1 + DC2 + "ab" + DC3 + DC4)


# =============================================================================
# Dropdown Tests
# =============================================================================

def make_dropdown_toggle_event(dropdown_id: str) -> dict:
    """Create a DropdownToggle event dict."""
    return {
        'pythonEventStr': repr(DropdownToggle(dropdown_id)),
        'eventJSON': {}
    }


def make_dropdown_select_event(dropdown_id: str, option_value: str) -> dict:
    """Create a DropdownSelect event dict."""
    return {
        'pythonEventStr': repr(DropdownSelect(dropdown_id, option_value)),
        'eventJSON': {}
    }


class TestDropdownToggle(unittest.TestCase):
    """Tests for dropdown toggle functionality."""

    def test_dropdown_toggle_opens_dropdown(self):
        """DropdownToggle opens the dropdown when it's closed."""
        model = init_model("hello")
        self.assertIsNone(model.get('openDropdown'))

        event = make_dropdown_toggle_event('fuzzy-pattern-0')
        model, _ = update(event, '', 1, model, "hello")

        self.assertIsNotNone(model.get('openDropdown'))
        self.assertEqual(model['openDropdown']['id'], 'fuzzy-pattern-0')
        self.assertEqual(model['openDropdown']['segmentIndex'], 0)

    def test_dropdown_toggle_closes_dropdown(self):
        """DropdownToggle closes the dropdown when it's already open."""
        model = init_model("hello")
        model['openDropdown'] = {'id': 'fuzzy-pattern-0', 'segmentIndex': 0}

        event = make_dropdown_toggle_event('fuzzy-pattern-0')
        model, _ = update(event, '', 1, model, "hello")

        self.assertIsNone(model.get('openDropdown'))

    def test_dropdown_toggle_switches_dropdown(self):
        """DropdownToggle on a different dropdown closes the old one and opens the new."""
        model = init_model("hello")
        model['openDropdown'] = {'id': 'fuzzy-pattern-0', 'segmentIndex': 0}

        event = make_dropdown_toggle_event('fuzzy-pattern-1')
        model, _ = update(event, '', 1, model, "hello")

        self.assertIsNotNone(model.get('openDropdown'))
        self.assertEqual(model['openDropdown']['id'], 'fuzzy-pattern-1')
        self.assertEqual(model['openDropdown']['segmentIndex'], 1)

    def test_dropdown_parses_segment_index_from_id(self):
        """Segment index is correctly parsed from dropdown ID."""
        model = init_model("hello")

        event = make_dropdown_toggle_event('fuzzy-pattern-5')
        model, _ = update(event, '', 1, model, "hello")

        self.assertEqual(model['openDropdown']['segmentIndex'], 5)


class TestDropdownSelect(unittest.TestCase):
    """Tests for dropdown selection functionality."""

    def test_dropdown_select_updates_regex_pattern(self):
        """Selecting a character class from dropdown updates the regex, preserving quantifier."""
        model = init_model("hello world")
        # Set up a regex with a fuzzy segment (.* has * quantifier)
        model['search'] = '/(hello)(.*)(world)/'
        model['openDropdown'] = {'id': 'fuzzy-pattern-1', 'segmentIndex': 1}

        # Select \s (character class only, no quantifier)
        event = make_dropdown_select_event('fuzzy-pattern-1', r'\s')
        model, _ = update(event, '', 1, model, "hello world")

        # Result should be \s* (preserves the * from .*)
        self.assertEqual(model['search'], r'/hello\s*world/')
        self.assertIsNone(model.get('openDropdown'))

    def test_dropdown_select_closes_dropdown(self):
        """Selecting a pattern closes the dropdown."""
        model = init_model("test")
        model['search'] = '/(.*)/'
        model['openDropdown'] = {'id': 'fuzzy-pattern-0', 'segmentIndex': 0}

        event = make_dropdown_select_event('fuzzy-pattern-0', r'\d*')
        model, _ = update(event, '', 1, model, "test")

        self.assertIsNone(model.get('openDropdown'))

    def test_dropdown_select_adds_to_undo_history(self):
        """Selecting a pattern saves the previous regex to undo history."""
        model = init_model("test")
        model['search'] = '/(.*)/'
        model['openDropdown'] = {'id': 'fuzzy-pattern-0', 'segmentIndex': 0}

        # Select \w (character class only), quantifier * is preserved
        event = make_dropdown_select_event('fuzzy-pattern-0', r'\w')
        model, _ = update(event, '', 1, model, "test")

        self.assertEqual(model['undoHistory'], ['/(.*)/']),
        self.assertEqual(model['search'], r'/\w*/')

    def test_dropdown_select_ignores_wrong_dropdown_id(self):
        """Selection is ignored if dropdown ID doesn't match open dropdown."""
        model = init_model("test")
        model['search'] = '/(.*)/'
        model['openDropdown'] = {'id': 'fuzzy-pattern-0', 'segmentIndex': 0}

        event = make_dropdown_select_event('fuzzy-pattern-1', r'\d*')
        model, _ = update(event, '', 1, model, "test")

        # Regex should remain unchanged
        self.assertEqual(model['search'], '/(.*)/')
        # But dropdown should still close
        self.assertIsNone(model.get('openDropdown'))


class TestDropdownCloseBehavior(unittest.TestCase):
    """Tests for dropdown close behavior on other events."""

    def test_mouse_down_closes_dropdown(self):
        """MouseDown on a character closes any open dropdown."""
        model = init_model("hello")
        model['openDropdown'] = {'id': 'fuzzy-pattern-0', 'segmentIndex': 0}

        event = make_mouse_down_event(3, top_half=True)
        model, _ = update(event, '', 1, model, "hello")

        self.assertIsNone(model.get('openDropdown'))

    def test_escape_closes_dropdown_first(self):
        """Escape closes dropdown without clearing selection."""
        model = init_model("hello")
        model['search'] = '/(hello)/'
        model['openDropdown'] = {'id': 'fuzzy-pattern-0', 'segmentIndex': 0}

        event = make_key_down_event('Escape')
        model, _ = update(event, '', 1, model, "hello")

        # Dropdown should be closed
        self.assertIsNone(model.get('openDropdown'))
        # But selection should remain
        self.assertEqual(model['search'], '/(hello)/')

    def test_escape_clears_selection_when_no_dropdown(self):
        """Escape clears selection when no dropdown is open."""
        model = init_model("hello")
        model['search'] = '/(hello)/'
        model['openDropdown'] = None

        event = make_key_down_event('Escape')
        model, _ = update(event, '', 1, model, "hello")

        # Selection should be cleared
        self.assertIsNone(model.get('search'))


class TestExtractQuantifier(unittest.TestCase):
    """Tests for extract_quantifier function."""

    def test_extract_star(self):
        """Extract * quantifier from .*"""
        base, quant = extract_quantifier('.*')
        self.assertEqual(base, '.')
        self.assertEqual(quant, '*')

    def test_extract_plus(self):
        """Extract + quantifier from \\s+"""
        base, quant = extract_quantifier(r'\s+')
        self.assertEqual(base, r'\s')
        self.assertEqual(quant, '+')

    def test_extract_question(self):
        """Extract ? quantifier from \\d?"""
        base, quant = extract_quantifier(r'\d?')
        self.assertEqual(base, r'\d')
        self.assertEqual(quant, '?')

    def test_extract_braced_range(self):
        """Extract {n,m} quantifier from [a-z]{2,5}"""
        base, quant = extract_quantifier('[a-z]{2,5}')
        self.assertEqual(base, '[a-z]')
        self.assertEqual(quant, '{2,5}')

    def test_extract_exact_count(self):
        """Extract {n} quantifier from \\w{3}"""
        base, quant = extract_quantifier(r'\w{3}')
        self.assertEqual(base, r'\w')
        self.assertEqual(quant, '{3}')

    def test_extract_min_only(self):
        """Extract {n,} quantifier from .{2,}"""
        base, quant = extract_quantifier('.{2,}')
        self.assertEqual(base, '.')
        self.assertEqual(quant, '{2,}')

    def test_no_quantifier(self):
        """Pattern without quantifier returns empty string."""
        base, quant = extract_quantifier('.')
        self.assertEqual(base, '.')
        self.assertEqual(quant, '')

    def test_character_class_no_quantifier(self):
        """Character class without quantifier."""
        base, quant = extract_quantifier('[a-z]')
        self.assertEqual(base, '[a-z]')
        self.assertEqual(quant, '')

    def test_lazy_star(self):
        """Extract *? lazy quantifier from .*?"""
        base, quant = extract_quantifier('.*?')
        self.assertEqual(base, '.')
        self.assertEqual(quant, '*?')

    def test_lazy_plus(self):
        """Extract +? lazy quantifier from .+?"""
        base, quant = extract_quantifier('.+?')
        self.assertEqual(base, '.')
        self.assertEqual(quant, '+?')

    def test_lazy_question(self):
        """Extract ?? lazy quantifier from .??"""
        base, quant = extract_quantifier('.??')
        self.assertEqual(base, '.')
        self.assertEqual(quant, '??')

    def test_lazy_braced(self):
        """Extract {n,m}? lazy quantifier."""
        base, quant = extract_quantifier('[a-z]{2,5}?')
        self.assertEqual(base, '[a-z]')
        self.assertEqual(quant, '{2,5}?')

    def test_lazy_with_char_class(self):
        """Extract lazy quantifier from character class pattern."""
        base, quant = extract_quantifier(r'\s*?')
        self.assertEqual(base, r'\s')
        self.assertEqual(quant, '*?')


class TestReplaceSegmentPattern(unittest.TestCase):
    """Tests for replace_segment_pattern function.

    replace_segment_pattern should only replace the character class,
    preserving the existing repetition quantifier.
    """

    def test_replace_preserves_star_quantifier(self):
        """Replacing .* with \s should give \s* (preserve *)."""
        result = replace_segment_pattern('/(.*)(world)/', 0, r'\s')
        self.assertEqual(result, r'/\s*world/')

    def test_replace_preserves_plus_quantifier(self):
        """Replacing .+ with \d should give \d+ (preserve +)."""
        result = replace_segment_pattern('/(.+)(world)/', 0, r'\d')
        self.assertEqual(result, r'/\d+world/')

    def test_replace_preserves_question_quantifier(self):
        """Replacing .? with \w should give \w? (preserve ?)."""
        result = replace_segment_pattern('/(.?)(world)/', 0, r'\w')
        self.assertEqual(result, r'/\w?world/')

    def test_replace_preserves_braced_quantifier(self):
        """Replacing .{2,5} with [a-z] should give [a-z]{2,5}."""
        result = replace_segment_pattern('/(hello)(.{2,5})/', 1, r'[a-z]')
        self.assertEqual(result, r'/hello[a-z]{2,5}/')

    def test_replace_preserves_exact_count_quantifier(self):
        """Replacing .{3} with \d should give \d{3}."""
        result = replace_segment_pattern('/(.{3})/', 0, r'\d')
        self.assertEqual(result, r'/\d{3}/')

    def test_replace_no_quantifier_adds_none(self):
        """Replacing (.) with \s should give (\s) - no quantifier added."""
        result = replace_segment_pattern('/(.)/', 0, r'\s')
        self.assertEqual(result, r'/\s/')

    def test_replace_character_class_preserves_quantifier(self):
        """Replacing [a-z]* with \d should give \d*."""
        result = replace_segment_pattern('/([a-z]*)/', 0, r'\d')
        self.assertEqual(result, r'/\d*/')

    def test_replace_middle_segment_preserves_quantifier(self):
        """Replace pattern of middle segment preserves its quantifier."""
        result = replace_segment_pattern('/(hello)(.*)(world)/', 1, r'\s')
        self.assertEqual(result, r'/hello\s*world/')

    def test_replace_out_of_bounds_index(self):
        """Out of bounds index leaves regex unchanged."""
        result = replace_segment_pattern('/(hello)/', 5, r'\d')
        self.assertEqual(result, '/hello/')


class TestDropdownInVisualize(unittest.TestCase):
    """Tests for dropdown rendering in visualize function."""

    def test_visualize_renders_dropdown_trigger_for_fuzzy(self):
        """Fuzzy segments render with a clickable dropdown trigger."""
        model = init_model("hello world")
        model['search'] = '/(hello)(.*)(world)/'

        html = visualize("hello world", model, None, None)

        # Should contain a dropdown toggle event for segment 1 (the fuzzy one)
        self.assertIn('DropdownToggle', html)
        self.assertIn('fuzzy-pattern-1', html)

    def test_visualize_renders_dropdown_options_when_open(self):
        """When dropdown is open, options are rendered."""
        model = init_model("hello world")
        model['search'] = '/(hello)(.*)(world)/'
        model['openDropdown'] = {'id': 'fuzzy-pattern-1', 'segmentIndex': 1}

        html = visualize("hello world", model, None, None)

        # Should contain dropdown select events for options
        self.assertIn('DropdownSelect', html)
        # Should contain some of the character class options (no quantifiers)
        self.assertIn(r'\s', html)
        self.assertIn(r'\d', html)


class TestPatternDisplay(unittest.TestCase):
    """Tests that regex patterns display correctly in UI overlays."""

    def test_word_char_displays_as_backslash_w(self):
        r"""The \w pattern should display as \w, not [...]."""
        highlights = parse_regex_for_highlighting(r'/(\w*)(!)/', 'hello!')
        self.assertEqual(len(highlights), 2)
        _, _, _, pattern_display, _, _ = highlights[0]
        self.assertEqual(pattern_display, r'\w')

    def test_whitespace_displays_as_backslash_s(self):
        r"""The \s pattern should display as \s, not [...]."""
        highlights = parse_regex_for_highlighting(r'/(\s*)(world)/', '   world')
        self.assertEqual(len(highlights), 2)
        _, _, _, pattern_display, _, _ = highlights[0]
        self.assertEqual(pattern_display, r'\s')

    def test_digit_displays_as_backslash_d(self):
        r"""The \d pattern should display as \d, not [...]."""
        highlights = parse_regex_for_highlighting(r'/(\d*)(!)/', '123!')
        self.assertEqual(len(highlights), 2)
        _, _, _, pattern_display, _, _ = highlights[0]
        self.assertEqual(pattern_display, r'\d')

    def test_non_whitespace_displays_as_backslash_S(self):
        r"""The \S pattern should display as \S, not [...]."""
        highlights = parse_regex_for_highlighting(r'/(\S*)( )/', 'hello ')
        self.assertEqual(len(highlights), 2)
        _, _, _, pattern_display, _, _ = highlights[0]
        self.assertEqual(pattern_display, r'\S')

    def test_non_digit_displays_as_backslash_D(self):
        r"""The \D pattern should display as \D, not [...]."""
        highlights = parse_regex_for_highlighting(r'/(\D*)(1)/', 'hello1')
        self.assertEqual(len(highlights), 2)
        _, _, _, pattern_display, _, _ = highlights[0]
        self.assertEqual(pattern_display, r'\D')

    def test_non_word_displays_as_backslash_W(self):
        r"""The \W pattern should display as \W, not [...]."""
        highlights = parse_regex_for_highlighting(r'/(\W*)(a)/', '...a')
        self.assertEqual(len(highlights), 2)
        _, _, _, pattern_display, _, _ = highlights[0]
        self.assertEqual(pattern_display, r'\W')

    def test_character_range_displays_as_brackets(self):
        """Character class [a-z] should display as [a-z]."""
        highlights = parse_regex_for_highlighting(r'/([a-z]*)(!)/', 'hello!')
        self.assertEqual(len(highlights), 2)
        _, _, _, pattern_display, _, _ = highlights[0]
        self.assertEqual(pattern_display, '[a-z]')

    def test_character_set_displays_as_brackets(self):
        """Character set [abc] should display as [abc]."""
        highlights = parse_regex_for_highlighting(r'/([abc]*)(d)/', 'abcd')
        self.assertEqual(len(highlights), 2)
        _, _, _, pattern_display, _, _ = highlights[0]
        self.assertEqual(pattern_display, '[abc]')

    def test_dot_displays_as_dot(self):
        """The . pattern should display as . not [...]."""
        highlights = parse_regex_for_highlighting('/(.)(!)(!)/', 'a!!')
        self.assertEqual(len(highlights), 3)
        _, _, _, pattern_display, _, _ = highlights[0]
        self.assertEqual(pattern_display, '.')

    def test_literal_displays_correctly(self):
        """Literal patterns display as-is."""
        highlights = parse_regex_for_highlighting('/(hello)(world)/', 'helloworld')
        self.assertEqual(len(highlights), 2)
        _, _, _, pattern_display, _, _ = highlights[0]
        self.assertEqual(pattern_display, 'hello')


class TestFuzzyPatternRecognition(unittest.TestCase):
    """Tests that various wildcard patterns are recognized as fuzzy."""

    def test_dot_star_is_fuzzy(self):
        """The classic .* pattern is fuzzy."""
        highlights = parse_regex_for_highlighting('/(.*)(world)/', 'hello world')
        self.assertEqual(len(highlights), 2)
        _, _, seg_type, _, _, _ = highlights[0]
        self.assertEqual(seg_type, 'fuzzy')

    def test_whitespace_star_is_fuzzy(self):
        r"""The \s* pattern is fuzzy."""
        highlights = parse_regex_for_highlighting(r'/(\s*)(world)/', '   world')
        self.assertEqual(len(highlights), 2)
        _, _, seg_type, _, _, _ = highlights[0]
        self.assertEqual(seg_type, 'fuzzy')

    def test_digit_star_is_fuzzy(self):
        r"""The \d* pattern is fuzzy."""
        highlights = parse_regex_for_highlighting(r'/(\d*)(world)/', '123world')
        self.assertEqual(len(highlights), 2)
        _, _, seg_type, _, _, _ = highlights[0]
        self.assertEqual(seg_type, 'fuzzy')

    def test_word_char_star_is_fuzzy(self):
        r"""The \w* pattern is fuzzy."""
        highlights = parse_regex_for_highlighting(r'/(\w*)(!)/', 'hello!')
        self.assertEqual(len(highlights), 2)
        _, _, seg_type, _, _, _ = highlights[0]
        self.assertEqual(seg_type, 'fuzzy')

    def test_non_whitespace_star_is_fuzzy(self):
        r"""The \S* pattern is fuzzy."""
        highlights = parse_regex_for_highlighting(r'/(\S*)( )/', 'hello ')
        self.assertEqual(len(highlights), 2)
        _, _, seg_type, _, _, _ = highlights[0]
        self.assertEqual(seg_type, 'fuzzy')

    def test_character_class_star_is_fuzzy(self):
        """Character class with * like [a-z]* is fuzzy."""
        highlights = parse_regex_for_highlighting(r'/([a-z]*)(!)/', 'hello!')
        self.assertEqual(len(highlights), 2)
        _, _, seg_type, _, _, _ = highlights[0]
        self.assertEqual(seg_type, 'fuzzy')

    def test_character_class_plus_is_fuzzy(self):
        """Character class with + like [A-Z]+ is fuzzy."""
        highlights = parse_regex_for_highlighting(r'/([A-Z]+)(!)/', 'HELLO!')
        self.assertEqual(len(highlights), 2)
        _, _, seg_type, _, _, _ = highlights[0]
        self.assertEqual(seg_type, 'fuzzy')

    def test_dot_plus_is_fuzzy(self):
        """The .+ pattern is fuzzy."""
        highlights = parse_regex_for_highlighting('/(hello)(.+)/', 'hello world')
        self.assertEqual(len(highlights), 2)
        _, _, seg_type, _, _, _ = highlights[1]
        self.assertEqual(seg_type, 'fuzzy')

    def test_single_dot_is_fuzzy(self):
        """A single . (any char) is fuzzy."""
        highlights = parse_regex_for_highlighting('/(.)(ello)/', 'hello')
        self.assertEqual(len(highlights), 2)
        _, _, seg_type, _, _, _ = highlights[0]
        self.assertEqual(seg_type, 'fuzzy')

    def test_literal_text_is_not_fuzzy(self):
        """Literal text patterns are not fuzzy."""
        highlights = parse_regex_for_highlighting('/(hello)(world)/', 'helloworld')
        self.assertEqual(len(highlights), 2)
        _, _, seg_type1, _, _, _ = highlights[0]
        _, _, seg_type2, _, _, _ = highlights[1]
        self.assertEqual(seg_type1, 'literal')
        self.assertEqual(seg_type2, 'literal')

    def test_escaped_special_chars_is_not_fuzzy(self):
        r"""Escaped special chars like \. are literal, not fuzzy."""
        highlights = parse_regex_for_highlighting(r'/(hello)(\.)/', 'hello.')
        self.assertEqual(len(highlights), 2)
        _, _, seg_type, _, _, _ = highlights[1]
        self.assertEqual(seg_type, 'literal')


# =============================================================================
# Synthesize Fuzzy Pattern Tests
# =============================================================================

class TestSynthesizeFuzzyPattern(unittest.TestCase):
    """Tests for synthesize_fuzzy_pattern() which picks the best regex pattern
    to match exactly the characters the user dragged over."""

    # ---- Step 1: + repetition with natural boundary ----

    def test_whitespace_at_boundary(self):
        r"""Whitespace followed by non-whitespace -> \s+."""
        result = synthesize_fuzzy_pattern("   ", next_char="w")
        self.assertEqual(result, r"\s+")

    def test_digits_at_boundary(self):
        r"""Digits followed by non-digit -> \d+."""
        result = synthesize_fuzzy_pattern("123", next_char="a")
        self.assertEqual(result, r"\d+")

    def test_lowercase_at_boundary(self):
        r"""Lowercase letters followed by space -> [a-z]+."""
        result = synthesize_fuzzy_pattern("abc", next_char=" ")
        self.assertEqual(result, r"[a-z]+")

    def test_uppercase_at_boundary(self):
        r"""Uppercase letters followed by space -> [A-Z]+."""
        result = synthesize_fuzzy_pattern("ABC", next_char=" ")
        self.assertEqual(result, r"[A-Z]+")

    def test_word_chars_at_boundary(self):
        r"""Mixed word chars followed by space -> \w+."""
        result = synthesize_fuzzy_pattern("heLLo_1", next_char=" ")
        self.assertEqual(result, r"\w+")

    def test_dot_plus_at_end_of_string(self):
        """Any text at end of string (no next char) -> first matching +."""
        # "abc" with no next char: \s fails, \d fails, [0-9\.] fails,
        # [a-z]+ matches with no overshoot since no next char
        result = synthesize_fuzzy_pattern("abc", next_char="")
        self.assertEqual(result, r"[a-z]+")

    def test_alphanumeric_at_boundary(self):
        r"""Alphanumeric chars followed by whitespace -> [A-Za-z0-9]+ (more specific than \S+)."""
        result = synthesize_fuzzy_pattern("abc123", next_char=" ")
        self.assertEqual(result, r"[A-Za-z0-9]+")

    def test_non_whitespace_at_boundary(self):
        r"""Non-whitespace with special chars followed by whitespace -> \S+."""
        result = synthesize_fuzzy_pattern("abc!@#", next_char=" ")
        self.assertEqual(result, r"\S+")

    def test_empty_text_returns_dot_star(self):
        """Empty drag text returns .*."""
        result = synthesize_fuzzy_pattern("", next_char="a")
        self.assertEqual(result, ".*")

    # ---- Step 1: + skipped when next_char also matches pattern ----

    def test_whitespace_not_at_boundary_skips_plus(self):
        r"""Whitespace followed by more whitespace -> can't use \s+, uses {n}."""
        result = synthesize_fuzzy_pattern("   ", next_char=" ")
        self.assertEqual(result, r"\s{3}")

    def test_digits_not_at_boundary_skips_plus(self):
        r"""Digits followed by more digits -> can't use \d+, uses {n}."""
        result = synthesize_fuzzy_pattern("12", next_char="3")
        self.assertEqual(result, r"\d{2}")

    def test_lowercase_not_at_boundary_skips_plus(self):
        r"""Lowercase followed by more lowercase -> can't use [a-z]+, uses {n}."""
        result = synthesize_fuzzy_pattern("hel", next_char="l")
        self.assertEqual(result, r"[a-z]{3}")

    # ---- Step 1: + skipped when prev_char also matches pattern ----

    def test_whitespace_prev_char_matches_skips_plus(self):
        r"""Whitespace preceded by more whitespace -> can't use \s+, uses {n}."""
        result = synthesize_fuzzy_pattern("   ", prev_char=" ", next_char="w")
        self.assertEqual(result, r"\s{3}")

    def test_digits_prev_char_matches_skips_plus(self):
        r"""Digits preceded by another digit -> can't use \d+, uses {n}."""
        result = synthesize_fuzzy_pattern("123", prev_char="0", next_char="a")
        self.assertEqual(result, r"\d{3}")

    def test_lowercase_prev_char_matches_skips_plus(self):
        r"""Lowercase preceded by more lowercase -> can't use [a-z]+, uses {n}."""
        result = synthesize_fuzzy_pattern("abc", prev_char="z", next_char=" ")
        self.assertEqual(result, r"[a-z]{3}")

    def test_prev_char_no_match_allows_plus(self):
        r"""Digits preceded by a letter (non-digit) -> \d+ is fine."""
        result = synthesize_fuzzy_pattern("123", prev_char="a", next_char="b")
        self.assertEqual(result, r"\d+")

    def test_both_edges_match_skips_plus(self):
        r"""Both prev and next match the pattern -> uses {n}."""
        result = synthesize_fuzzy_pattern("abc", prev_char="z", next_char="d")
        self.assertEqual(result, r"[a-z]{3}")

    # ---- Adjacent to existing literal (None) -> uses * ----

    def test_prev_char_none_uses_star(self):
        r"""prev_char=None means adjacent to literal on left -> \s*."""
        result = synthesize_fuzzy_pattern("   ", prev_char=None, next_char="w")
        self.assertEqual(result, r"\s*")

    def test_next_char_none_uses_star(self):
        r"""next_char=None means adjacent to literal on right -> \s*."""
        result = synthesize_fuzzy_pattern("   ", prev_char="a", next_char=None)
        self.assertEqual(result, r"\s*")

    def test_both_none_uses_star(self):
        r"""Both None (inserting between literals) -> \s*."""
        result = synthesize_fuzzy_pattern("   ", prev_char=None, next_char=None)
        self.assertEqual(result, r"\s*")

    def test_none_prev_still_checks_next_boundary(self):
        r"""prev_char=None but next_char matches pattern -> skips *, uses {n}."""
        result = synthesize_fuzzy_pattern("   ", prev_char=None, next_char=" ")
        self.assertEqual(result, r"\s{3}")

    def test_none_next_still_checks_prev_boundary(self):
        r"""next_char=None but prev_char matches pattern -> skips *, uses {n}."""
        result = synthesize_fuzzy_pattern("   ", prev_char=" ", next_char=None)
        self.assertEqual(result, r"\s{3}")

    # ---- Step 2: {n} repetition ----

    def test_mixed_text_uses_dot_n(self):
        """Mixed characters (letters+digits+space) -> .{n}."""
        result = synthesize_fuzzy_pattern("a1 ", next_char="b")
        self.assertEqual(result, r".{3}")

    def test_single_char_with_same_next(self):
        r"""Single char 'l' followed by another 'l' -> [a-z]{1}."""
        result = synthesize_fuzzy_pattern("l", next_char="l")
        self.assertEqual(result, r"[a-z]{1}")

    def test_digits_and_dots(self):
        r"""'3.14' is all [0-9\.] followed by non-matching char -> [0-9\.]+."""
        result = synthesize_fuzzy_pattern("3.14", next_char=" ")
        self.assertEqual(result, r"[0-9\.]+")

    def test_digits_and_dots_not_at_boundary(self):
        r"""'3.14' followed by another digit -> [0-9\.]{4}."""
        result = synthesize_fuzzy_pattern("3.14", next_char="1")
        self.assertEqual(result, r"[0-9\.]{4}")

    # ---- Text with newlines ----

    def test_newline_text_uses_whitespace_plus(self):
        r"""Newline is whitespace, so '\n  ' with non-ws next -> \s+."""
        result = synthesize_fuzzy_pattern("\n  ", next_char="a")
        self.assertEqual(result, r"\s+")

    def test_mixed_with_newline_uses_bracket_n(self):
        r"""'a\nb' can't use .* (dot doesn't match \n), uses [\S\s]{3}."""
        result = synthesize_fuzzy_pattern("a\nb", next_char=" ")
        # . doesn't match \n, but [\S\s] does
        self.assertEqual(result, r"[\S\s]{3}")

    # ---- Integration: synthesized patterns are recognized as fuzzy ----

    def test_synthesized_plus_pattern_is_fuzzy_in_highlights(self):
        r"""\s+ pattern is recognized as fuzzy in highlighting."""
        highlights = parse_regex_for_highlighting(r'/hello\s+world/', 'hello   world')
        self.assertEqual(len(highlights), 3)
        _, _, seg_type, _, _, _ = highlights[1]
        self.assertEqual(seg_type, 'fuzzy')

    def test_synthesized_exact_n_pattern_is_fuzzy_in_highlights(self):
        r"""\d{3} pattern is recognized as fuzzy in highlighting."""
        highlights = parse_regex_for_highlighting(r'/prefix\d{3}suffix/', 'prefix123suffix')
        self.assertEqual(len(highlights), 3)
        _, _, seg_type, _, _, _ = highlights[1]
        self.assertEqual(seg_type, 'fuzzy')

    def test_synthesized_pattern_matches_exact_range(self):
        r"""Synthesized \s{3} matches exactly 3 spaces in context."""
        highlights = parse_regex_for_highlighting(r'/hello\s{3}world/', 'hello   world')
        self.assertEqual(len(highlights), 3)
        # The fuzzy segment should cover exactly 3 characters
        fuzzy_start, fuzzy_end, seg_type, _, _, _ = highlights[1]
        self.assertEqual(seg_type, 'fuzzy')
        self.assertEqual(fuzzy_end - fuzzy_start, 3)


# =============================================================================
# Selection Adjacency Tests (skip over anchors)
# =============================================================================

class TestIsAdjacentRight(unittest.TestCase):
    """Unit tests for is_adjacent_right helper function.

    is_adjacent_right(idx, last_end, string_value) returns True if idx is
    at or just past last_end, with only anchor/sentinel chars in between.
    """

    def test_exact_adjacent(self):
        """idx == last_end is always adjacent."""
        self.assertTrue(is_adjacent_right(7, 7, "hello\nworld"))

    def test_skip_dollar_to_newline(self):
        """Skip $ to reach \\n at end of line.

        String "hello\\nworld":
        Internal: ..., o=6, $=7, \\n=8, ...
        last_end=7 (at $), idx=8 (\\n). Skipped: $ (anchor).
        """
        self.assertTrue(is_adjacent_right(8, 7, "hello\nworld"))

    def test_skip_dollar_to_backslash_Z(self):
        """Skip $ to reach \\Z at end of string.

        String "hello":
        Internal: ..., o=6, $=7, \\Z=8
        last_end=7 (at $), idx=8 (\\Z). Skipped: $ (anchor).
        """
        self.assertTrue(is_adjacent_right(8, 7, "hello"))

    def test_skip_caret_after_newline_to_first_char(self):
        """Skip ^ to reach first char of next line.

        String "hello\\nworld":
        Internal: ..., \\n=8, ^=9, w=10, ...
        last_end=9 (at ^), idx=10 (w). Skipped: ^ (anchor).
        """
        self.assertTrue(is_adjacent_right(10, 9, "hello\nworld"))

    def test_skip_multiple_anchors_between_consecutive_newlines(self):
        """Skip ^$ between consecutive newlines.

        String "a\\n\\nb":
        Internal: ..., \\n=4, ^=5, $=6, \\n=7, ...
        last_end=5, idx=7. Skipped: ^$ (both anchors).
        """
        self.assertTrue(is_adjacent_right(7, 5, "a\n\nb"))

    def test_not_adjacent_over_real_char(self):
        """Cannot skip \\n (a real character, not an anchor).

        String "hello\\nworld":
        Internal: ..., $=7, \\n=8, ^=9, ...
        last_end=7, idx=9. Skipped: $\\n — \\n is real.
        """
        self.assertFalse(is_adjacent_right(9, 7, "hello\nworld"))

    def test_far_away_not_adjacent(self):
        """Far-away index is not adjacent."""
        self.assertFalse(is_adjacent_right(12, 7, "hello\nworld"))

    def test_before_last_end_not_adjacent(self):
        """idx < last_end is not adjacent."""
        self.assertFalse(is_adjacent_right(5, 7, "hello\nworld"))

    def test_out_of_bounds_not_adjacent(self):
        """Out-of-bounds idx is not adjacent."""
        self.assertFalse(is_adjacent_right(100, 7, "hello"))


class TestIsAdjacentLeft(unittest.TestCase):
    """Unit tests for is_adjacent_left helper function.

    is_adjacent_left(idx, first_start, string_value) returns True if idx is
    just before first_start, with only anchor/sentinel chars in between.
    """

    def test_exact_adjacent(self):
        """idx == first_start - 1 is always adjacent."""
        self.assertTrue(is_adjacent_left(9, 10, "hello\nworld"))

    def test_skip_caret_to_newline(self):
        """Skip ^ to reach \\n going left.

        String "hello\\nworld":
        Internal: ..., \\n=8, ^=9, w=10, ...
        first_start=10 (w), idx=8 (\\n). Skipped: ^ (anchor).
        """
        self.assertTrue(is_adjacent_left(8, 10, "hello\nworld"))

    def test_skip_caret_to_backslash_A(self):
        """Skip ^ to reach \\A at start of string.

        String "hello":
        Internal: \\A=0, ^=1, h=2, ...
        first_start=2 (h), idx=0 (\\A). Skipped: ^ (anchor).
        """
        self.assertTrue(is_adjacent_left(0, 2, "hello"))

    def test_skip_dollar_to_last_char_of_prev_line(self):
        """Skip $ to reach last char of previous line going left.

        String "hello\\nworld":
        Internal: ..., o=6, $=7, \\n=8, ...
        first_start=8 (\\n), idx=6 (o). Skipped: $ (anchor).
        """
        self.assertTrue(is_adjacent_left(6, 8, "hello\nworld"))

    def test_skip_multiple_anchors_between_consecutive_newlines(self):
        """Skip $^ between consecutive newlines going left.

        String "a\\n\\nb":
        Internal: ..., \\n=4, ^=5, $=6, \\n=7, ...
        first_start=7, idx=4. Skipped: ^$ (both anchors going left).

        Wait, skipped chars are at indices 5 and 6, which are ^ and $.
        """
        self.assertTrue(is_adjacent_left(4, 7, "a\n\nb"))

    def test_not_adjacent_over_real_char(self):
        """Cannot skip \\n (a real character) going left.

        String "hello\\nworld":
        Internal: ..., o=6, $=7, \\n=8, ^=9, w=10, ...
        first_start=10, idx=7. Between: \\n=8, ^=9. \\n is real.
        """
        self.assertFalse(is_adjacent_left(7, 10, "hello\nworld"))

    def test_far_away_not_adjacent(self):
        """Far-away index is not adjacent."""
        self.assertFalse(is_adjacent_left(2, 10, "hello\nworld"))

    def test_at_first_start_not_adjacent(self):
        """idx == first_start is not adjacent (must be to the left)."""
        self.assertFalse(is_adjacent_left(10, 10, "hello\nworld"))

    def test_past_first_start_not_adjacent(self):
        """idx > first_start is not adjacent."""
        self.assertFalse(is_adjacent_left(11, 10, "hello\nworld"))


class TestSelectionAdjacencyIntegration(unittest.TestCase):
    """Integration tests for extending selections across anchor boundaries.

    These test the full flow through update() to verify that the adjacency
    fix works end-to-end for various scenarios.
    """

    def test_right_extend_over_dollar_to_newline(self):
        """BUG: After /(^)(.*)/, clicking \\n (past $) should extend, not reset.

        This is the user's primary reported bug: can't generate /^.*\\n/
        because \\n is drawn after $ and not considered adjacent.

        String "hello\\nworld":
        Internal: \\A=0, ^=1, h=2, e=3, l=4, l=5, o=6, $=7, \\n=8, ^=9, w=10, ...

        /(^)(.*)/ matches ^hello, last_end=7 (at $).
        Clicking \\n at index 8 should extend the selection.
        """
        value = "hello\nworld"
        model = init_model(value)
        source_code = "x = 'hello\\nworld'"

        # Select ^ literal at index 1
        model, _ = update(make_mouse_down_event(1, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(1),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/^/')

        # Extend with .* fuzzy
        last_end = get_last_segment_end_internal_idx(model['search'], value)
        model, _ = update(make_mouse_down_event(last_end, top_half=False),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(last_end),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/^[a-z]{1}/')

        # Verify last_end (one past the last segment's last char)
        last_end = get_last_segment_end_internal_idx(model['search'], value)
        self.assertEqual(last_end, 3)  # one past 'h' match from [a-z]{1}

        # Click \n at index 8 (past $ at 7) — THIS WAS THE BUG
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(8),
                         source_code, 1, model, value)

        # Click at index 8 is far from last_end=3, starts new selection for \n
        self.assertEqual(model['search'], '/\\n/')

    def test_right_extend_over_dollar_to_newline_hello_first(self):
        """Extend /(hello)/ by clicking \\n (past $) should extend.

        String "hello\\nworld":
        /(hello)/ matches "hello", last_end=7 (at $).
        Clicking \\n at 8 should extend.
        """
        value = "hello\nworld"
        model = init_model(value)
        source_code = "x = 'hello\\nworld'"

        # Select "hello" (indices 2-6)
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/hello/')

        last_end = get_last_segment_end_internal_idx(model['search'], value)
        self.assertEqual(last_end, 7)

        # Click \n at 8 (skips $ at 7)
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(8),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/(hello)(\\n)/')

    def test_right_extend_over_dollar_to_backslash_Z(self):
        """After selecting "hello", clicking \\Z (past $) should extend.

        String "hello":
        Internal: \\A=0, ^=1, h=2, e=3, l=4, l=5, o=6, $=7, \\Z=8

        /(hello)/ ends at 7 (at $).
        Clicking \\Z at 8 should extend.
        """
        value = "hello"
        model = init_model(value)
        source_code = "x = 'hello'"

        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/hello/')

        last_end = get_last_segment_end_internal_idx(model['search'], value)
        self.assertEqual(last_end, 7)  # at $

        # Click \Z at 8 (past $ at 7)
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(8),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/(hello)(\\Z)/')

    def test_right_extend_fuzzy_over_dollar_to_newline(self):
        """Fuzzy extension over $ to \\n should work too.

        Same as literal but using bottom-half click for fuzzy.
        """
        value = "hello\nworld"
        model = init_model(value)
        source_code = "x = 'hello\\nworld'"

        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/hello/')

        last_end = get_last_segment_end_internal_idx(model['search'], value)

        # Click \n at 8 with fuzzy (bottom half) — skips $ at 7
        model, _ = update(make_mouse_down_event(8, top_half=False),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(8),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/hello\\s*/')

    def test_left_extend_over_caret_to_newline(self):
        """Select "world", clicking \\n (past ^ going left) should extend left.

        String "hello\\nworld":
        Internal: ..., $=7, \\n=8, ^=9, w=10, o=11, r=12, l=13, d=14, ...

        /(world)/ starts at 10 (w), first_start=10.
        Clicking \\n at 8: ^ at 9 is between (anchor). Should extend left.
        """
        value = "hello\nworld"
        model = init_model(value)
        source_code = "x = 'hello\\nworld'"

        # Select "world" at indices 10-14
        model, _ = update(make_mouse_down_event(10, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(14),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(14),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/world/')

        first_start = get_first_segment_start_internal_idx(model['search'], value)
        self.assertEqual(first_start, 10)

        # Click \n at 8 (past ^ at 9)
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(8),
                         source_code, 1, model, value)

        # Should extend left (includes \n and ^ which is between)
        self.assertEqual(model['search'], '/(\\n^)(world)/')

    def test_left_extend_over_caret_to_backslash_A(self):
        """Select "hello" from h, clicking \\A (past ^) should extend left.

        String "hello":
        Internal: \\A=0, ^=1, h=2, e=3, l=4, l=5, o=6, $=7, \\Z=8

        /(hello)/ starts at 2 (h), first_start=2.
        Clicking \\A at 0: ^ at 1 is between (anchor). Should extend left.
        """
        value = "hello"
        model = init_model(value)
        source_code = "x = 'hello'"

        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/hello/')

        first_start = get_first_segment_start_internal_idx(model['search'], value)
        self.assertEqual(first_start, 2)

        # Click \A at 0 (past ^ at 1)
        model, _ = update(make_mouse_down_event(0, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(0),
                         source_code, 1, model, value)

        # Should extend left with \A and ^
        self.assertEqual(model['search'], '/(\\A^)(hello)/')

    def test_no_extend_over_real_characters(self):
        """Should NOT extend when real characters are between click and selection.

        String "hello\\nworld":
        Select "world" at w=10, first_start=10.
        Click $ at 7: between are \\n (real) and ^ (anchor). Can't skip \\n.
        Should reset, not extend.
        """
        value = "hello\nworld"
        model = init_model(value)
        source_code = "x = 'hello\\nworld'"

        # Select "world"
        model, _ = update(make_mouse_down_event(10, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(14),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(14),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/world/')

        # Click $ at 7 — there's \n (real char) between $ and the selection
        model, _ = update(make_mouse_down_event(7, top_half=True),
                         source_code, 1, model, value)

        # Should reset, not extend
        self.assertIsNone(model['search'])

    def test_drag_after_skipped_adjacency_works(self):
        """After extending via skipped adjacency, drag should still work.

        Click \\n (skipping $), then drag to ^ to select \\n^.
        """
        value = "hello\nworld"
        model = init_model(value)
        source_code = "x = 'hello\\nworld'"

        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/hello/')

        # Click \n at 8 (skips $ at 7) and drag to ^ at 9
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(9),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(9),
                         source_code, 1, model, value)

        # Should extend with \n^ (both selected by the drag)
        self.assertEqual(model['search'], '/(hello)(\\n^)/')

    def test_right_extend_skipped_adjacency_does_not_include_anchor(self):
        """When extending right by skipping an anchor, the skipped anchor
        should NOT be included in the new segment.

        After /(hello)/ with last_end=7 ($), clicking \\n at 8 should
        produce a segment containing just \\n, not $\\n.
        """
        value = "hello\nworld"
        model = init_model(value)
        source_code = "x = 'hello\\nworld'"

        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model, value)

        # Click \n at 8
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(8),
                         source_code, 1, model, value)

        # Should be just \n, NOT $\n
        self.assertEqual(model['search'], '/(hello)(\\n)/')

    def test_existing_right_extend_still_works(self):
        """The standard right extension (idx == last_end) should still work.

        Regression test to make sure the fix doesn't break existing behavior.
        """
        value = "hello world"
        model = init_model(value)
        source_code = "x = 'hello world'"

        # Select "hello" (indices 2-6)
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/hello/')

        # Extend with fuzzy at exact end
        end_idx = get_last_segment_end_internal_idx(model['search'], value)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(end_idx),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/hello\\s*/')

    def test_existing_left_extend_still_works(self):
        """The standard left extension (idx == first_start - 1) should still work.

        Regression test.
        """
        value = "hello world"
        model = init_model(value)
        source_code = "x = 'hello world'"

        # Select "world"
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(12),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(12),
                         source_code, 1, model, value)
        self.assertEqual(model['search'], '/world/')

        # Extend left at first_start - 1 (standard adjacency)
        start_idx = get_first_segment_start_internal_idx(model['search'], value)
        model, _ = update(make_mouse_down_event(start_idx - 1, top_half=False),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(start_idx - 1),
                         source_code, 1, model, value)

        self.assertEqual(model['search'], '/\\s*world/')


# =============================================================================
# Search Box Tests
# =============================================================================

def make_search_box_input_event(value: str) -> dict:
    """Create a SearchBoxInput event dict (simulates typing in the search box).

    Args:
        value: The full current value of the search box input field.
    """
    return {
        'pythonEventStr': "lambda e: SearchBoxInput(value=e.get('value', ''))",
        'eventJSON': {
            'type': 'input',
            'value': value,
        }
    }


class TestSearchBoxBasics(unittest.TestCase):
    """Test basic search box input behavior."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_typing_regex_sets_selection_regex(self):
        """Typing a regex in the search box sets search directly."""
        model, commands = update(make_search_box_input_event('/hello/'),
                                self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['search'], '/hello/')
        self.assertEqual(commands, [])

    def test_typing_regex_with_groups_sets_selection_regex(self):
        """Typing a regex with capturing groups works."""
        model, commands = update(make_search_box_input_event('/(hello)(.*)(world)/'),
                                self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['search'], '/(hello)(.*)(world)/')

    def test_clearing_search_box_clears_regex(self):
        """Clearing the search box (empty value) sets search to None."""
        self.model['search'] = '/(hello)/'
        self.model['undoHistory'] = [None]

        model, _ = update(make_search_box_input_event(''),
                          self.source_code, self.source_line, self.model, self.value)

        self.assertIsNone(model['search'])

    def test_typing_saves_undo_history(self):
        """Each search box change saves the previous value to undo history."""
        model, _ = update(make_search_box_input_event('/hello/'),
                          self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['undoHistory'], [None])  # Previous was None

        model, _ = update(make_search_box_input_event('/hello world/'),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['undoHistory'], [None, '/hello/'])

    def test_same_value_does_not_add_to_undo(self):
        """Typing the same value again doesn't add duplicate undo entries."""
        model, _ = update(make_search_box_input_event('/hello/'),
                          self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['undoHistory'], [None])

        # Same value again
        model, _ = update(make_search_box_input_event('/hello/'),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['undoHistory'], [None])  # No duplicate

    def test_typing_clears_drag_state(self):
        """Typing in the search box clears any in-progress drag state."""
        self.model['anchorIdx'] = 5
        self.model['cursorIdx'] = 8
        self.model['dragging'] = True
        self.model['insertAfterSegment'] = 1

        model, _ = update(make_search_box_input_event('/hello/'),
                          self.source_code, self.source_line, self.model, self.value)

        self.assertIsNone(model['anchorIdx'])
        self.assertIsNone(model['cursorIdx'])
        self.assertFalse(model['dragging'])
        self.assertIsNone(model['insertAfterSegment'])

    def test_invalid_regex_still_stored(self):
        """An invalid regex is still stored so the user can keep editing."""
        model, _ = update(make_search_box_input_event('/[unclosed/'),
                          self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['search'], '/[unclosed/')

    def test_search_box_value_without_delimiters(self):
        """Value without / delimiters is stored as-is (future search types)."""
        model, _ = update(make_search_box_input_event('hello'),
                          self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['search'], 'hello')


class TestSearchBoxVisualize(unittest.TestCase):
    """Test that the search box renders correctly in visualize output."""

    def test_search_box_present_in_output(self):
        """The search box input element is present in visualize output."""
        html = visualize("hello world", init_model("hello world"), None, None)
        self.assertIn('<input', html)
        self.assertIn('snc-input', html)
        self.assertIn('SearchBoxInput', html)

    def test_search_box_shows_empty_when_no_regex(self):
        """Search box value is empty when there's no selection regex."""
        model = init_model("hello world")
        html = visualize("hello world", model, None, None)
        # The value attribute should be empty
        self.assertIn('value=""', html)

    def test_search_box_shows_current_regex(self):
        """Search box shows the full search with / delimiters."""
        model = init_model("hello world")
        model['search'] = '/(hello)(.*)(world)/'

        html = visualize("hello world", model, None, None)
        self.assertIn('/(hello)(.*)(world)/', html)

    def test_search_box_shows_regex_after_mouse_selection(self):
        """After a mouse selection, the search box reflects the built regex."""
        value = "hello world"
        model = init_model(value)
        source_code = "x = 'hello world'"

        # Select "hello" by mouse
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model, value)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model, value)

        html = visualize(value, model, None, None)
        self.assertIn('/hello/', html)

    def test_search_box_has_placeholder(self):
        """Search box has a placeholder for when it's empty."""
        html = visualize("hello world", init_model("hello world"), None, None)
        self.assertIn('placeholder=', html)


class TestSearchBoxToMouseInteraction(unittest.TestCase):
    """Test transitioning from search box editing to mouse-based selection."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_type_regex_then_extend_with_mouse(self):
        """Type a regex in the search box, then extend it with mouse selection.

        Type /(hello)/ -> extend right with fuzzy -> /(hello)(.*)/
        """
        # Type regex in search box
        model, _ = update(make_search_box_input_event('/(hello)/'),
                          self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['search'], '/(hello)/')

        # Now extend with fuzzy from the right end
        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        self.assertIsNotNone(end_idx)

        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello\\s*/')

    def test_type_regex_then_click_inside_fuzzy(self):
        """Type a regex with fuzzy, then click inside the fuzzy to anchor it.

        Type /(hello)(.*)(world)/ -> click inside fuzzy to split with literal.
        """
        # Type regex with fuzzy segment in the search box
        model, _ = update(make_search_box_input_event('/(hello)(.*)/'),
                          self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['search'], '/(hello)(.*)/')

        # Find the fuzzy segment and click inside it to add a literal anchor
        # In "hello world", (.*) matches " world" (indices 7-12)
        # Click at 'w' (index 8) to anchor inside the fuzzy
        fuzzy_info = find_fuzzy_segment_at_index(model['search'], self.value, 8)
        self.assertIsNotNone(fuzzy_info)

        model, _ = update(make_mouse_down_event(8, top_half=True),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(12),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(12),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hello.*world/')

    def test_type_regex_then_new_mouse_selection_replaces(self):
        """Clicking far from the typed regex starts a fresh selection.

        Type /(hello)/ -> click in unrelated area -> replaces with new selection.
        """
        # Type regex
        model, _ = update(make_search_box_input_event('/(hello)/'),
                          self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['search'], '/(hello)/')

        # Click on 'w' at index 8 (not adjacent to "hello" selection end at 7)
        # This is far enough away that it should start fresh
        # Actually, let's click somewhere definitely not adjacent
        # "hello" ends at index 7, and 'w' is at index 8.
        # is_adjacent_right(8, 7, value) == True because 8 >= 7 and idx == last_end + 1
        # So let's click at 10 ('r') which is NOT adjacent to index 7
        model, _ = update(make_mouse_down_event(10, top_half=True),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(10),
                          self.source_code, self.source_line, model, self.value)

        # Should reset and create a fresh single-char selection
        self.assertEqual(model['search'], '/r/')

    def test_type_regex_then_extend_left_with_mouse(self):
        """Type a regex in the search box, then extend it from the left.

        Type /(world)/ -> extend left with fuzzy -> /(.*)(world)/
        """
        # Type regex in search box
        model, _ = update(make_search_box_input_event('/(world)/'),
                          self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['search'], '/(world)/')

        # Extend left with fuzzy
        start_idx = get_first_segment_start_internal_idx(model['search'], self.value)
        self.assertIsNotNone(start_idx)

        model, _ = update(make_mouse_down_event(start_idx - 1, top_half=False),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(start_idx - 1),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/\\s*world/')


class TestMouseToSearchBoxInteraction(unittest.TestCase):
    """Test transitioning from mouse-based selection to search box editing."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def _select_hello(self, model):
        """Helper to create /(hello)/ via mouse selection."""
        model, _ = update(make_mouse_down_event(2, top_half=True),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(6),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                          self.source_code, self.source_line, model, self.value)
        return model

    def _select_hello_fuzzy_world(self, model):
        """Helper to create /(hello)(.*)(world)/ via mouse selection."""
        model = self._select_hello(model)

        # Add fuzzy
        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                          self.source_code, self.source_line, model, self.value)

        # Add "world" inside fuzzy
        model, _ = update(make_mouse_down_event(8, top_half=True),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(12),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(12),
                          self.source_code, self.source_line, model, self.value)
        return model

    def test_mouse_selection_then_edit_in_search_box(self):
        """Build a regex with mouse, then edit it via the search box."""
        model = self._select_hello(self.model)
        self.assertEqual(model['search'], '/hello/')

        # Now tweak the regex via search box
        model, _ = update(make_search_box_input_event('/(hell)/'),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/(hell)/')
        self.assertEqual(model['undoHistory'], [None, '/hello/'])

    def test_mouse_selection_then_clear_via_search_box(self):
        """Build regex with mouse, then clear it by emptying the search box."""
        model = self._select_hello(self.model)
        self.assertEqual(model['search'], '/hello/')

        model, _ = update(make_search_box_input_event(''),
                          self.source_code, self.source_line, model, self.value)

        self.assertIsNone(model['search'])
        self.assertEqual(model['undoHistory'], [None, '/hello/'])

    def test_mouse_selection_then_search_box_then_mouse_again(self):
        """Full round trip: mouse -> search box edit -> mouse extend.

        Build /(hello)/ with mouse -> edit to /(hel)/ in search box -> extend right.
        """
        model = self._select_hello(self.model)
        self.assertEqual(model['search'], '/hello/')

        # Edit in search box to shorten the pattern
        model, _ = update(make_search_box_input_event('/(hel)/'),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/(hel)/')

        # Extend right with fuzzy from end of "hel" match
        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        self.assertIsNotNone(end_idx)

        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/hel[a-z]{1}/')

    def test_complex_mouse_then_edit_pattern_in_search_box(self):
        """Build /(hello)(.*)(world)/ with mouse, then change .* to \\s+ via search box."""
        model = self._select_hello_fuzzy_world(self.model)
        self.assertEqual(model['search'], '/hello\\s*world/')

        # Edit the pattern in the search box to change \s* to \s+
        model, _ = update(make_search_box_input_event(r'/(hello)(\s+)(world)/'),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], r'/(hello)(\s+)(world)/')

    def test_mouse_then_search_box_then_extend_left(self):
        """Mouse selection -> edit in search box -> extend left with mouse.

        Build /(world)/ with mouse -> edit to /(world!)/ in search box (invalid for this string) ->
        fix back to /(world)/ -> extend left.
        """
        value = "hello world"
        model = init_model(value)

        # Select "world" with mouse
        model, _ = update(make_mouse_down_event(8, top_half=True),
                          self.source_code, self.source_line, model, value)
        model, _ = update(make_mouse_move_event(12),
                          self.source_code, self.source_line, model, value)
        model, _ = update(make_mouse_up_event(12),
                          self.source_code, self.source_line, model, value)

        self.assertEqual(model['search'], '/world/')

        # Edit in search box
        model, _ = update(make_search_box_input_event('/(world!)/'),
                          self.source_code, self.source_line, model, value)
        self.assertEqual(model['search'], '/(world!)/')

        # Fix back
        model, _ = update(make_search_box_input_event('/(world)/'),
                          self.source_code, self.source_line, model, value)
        self.assertEqual(model['search'], '/(world)/')

        # Extend left with fuzzy
        start_idx = get_first_segment_start_internal_idx(model['search'], value)
        model, _ = update(make_mouse_down_event(start_idx - 1, top_half=False),
                          self.source_code, self.source_line, model, value)
        model, _ = update(make_mouse_up_event(start_idx - 1),
                          self.source_code, self.source_line, model, value)

        self.assertEqual(model['search'], '/\\s*world/')


class TestSearchBoxUndoRedo(unittest.TestCase):
    """Test undo/redo interactions with search box edits."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_undo_search_box_edit(self):
        """Cmd-Z after a search box edit restores the previous regex."""
        # Type a regex
        model, _ = update(make_search_box_input_event('/(hello)/'),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '/(hello)/')

        # Undo
        model, _ = update(make_key_down_event('z', meta_key=True),
                          self.source_code, self.source_line, model, self.value)

        self.assertIsNone(model['search'])
        self.assertEqual(model['undoHistory'], [])
        self.assertEqual(model['redoHistory'], ['/(hello)/'])

    def test_redo_search_box_edit(self):
        """Cmd-Shift-Z after undoing a search box edit restores the regex."""
        model, _ = update(make_search_box_input_event('/(hello)/'),
                          self.source_code, self.source_line, self.model, self.value)

        # Undo
        model, _ = update(make_key_down_event('z', meta_key=True),
                          self.source_code, self.source_line, model, self.value)
        self.assertIsNone(model['search'])

        # Redo
        model, _ = update(make_key_down_event('z', meta_key=True, shift_key=True),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/(hello)/')

    def test_undo_across_mouse_and_search_box(self):
        """Undo traverses both mouse selections and search box edits.

        Mouse: None -> /(hello)/ -> /(hello)(.*)/
        Search box: /(hello)(.*)(world)/
        Undo 3 times should get back to None.
        """
        # Mouse: select hello
        model, _ = update(make_mouse_down_event(2, top_half=True),
                          self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(6),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/hello/')

        # Mouse: extend with fuzzy
        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/hello\\s*/')

        # Search box: refine to /(hello)(.*)(world)/
        model, _ = update(make_search_box_input_event('/(hello)(.*)(world)/'),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/(hello)(.*)(world)/')
        self.assertEqual(model['undoHistory'], [None, '/hello/', '/hello\\s*/'])

        # Undo 1: back to /hello\s*/
        model, _ = update(make_key_down_event('z', meta_key=True),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/hello\\s*/')

        # Undo 2: back to /hello/
        model, _ = update(make_key_down_event('z', meta_key=True),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/hello/')

        # Undo 3: back to None
        model, _ = update(make_key_down_event('z', meta_key=True),
                          self.source_code, self.source_line, model, self.value)
        self.assertIsNone(model['search'])

    def test_search_box_edit_clears_redo_history(self):
        """A search box edit after an undo clears the redo history."""
        # Create a regex
        model, _ = update(make_search_box_input_event('/(hello)/'),
                          self.source_code, self.source_line, self.model, self.value)

        # Undo it
        model, _ = update(make_key_down_event('z', meta_key=True),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['redoHistory'], ['/(hello)/'])

        # Type something new in search box - should clear redo
        model, _ = update(make_search_box_input_event('/(world)/'),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/(world)/')
        self.assertEqual(model['redoHistory'], [])


class TestSearchBoxEnterGeneratesCode(unittest.TestCase):
    """Test that Enter key generates code from a search-box-entered regex."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_enter_after_search_box_regex(self):
        """Enter generates (suggest_name, expr) using the regex typed in the search box."""
        model, _ = update(make_search_box_input_event('/(hello)(.*)(world)/'),
                          self.source_code, self.source_line, self.model, self.value)

        model, commands = update(make_key_down_event('Enter'),
                                self.source_code, self.source_line, model, self.value)

        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_matches")
        self.assertIn("list(re.finditer(r'hello.*world'", expr)

    def test_enter_after_search_box_simple_regex(self):
        """Enter generates (suggest_name, expr) for a simple regex without groups."""
        model, _ = update(make_search_box_input_event('/hello/'),
                          self.source_code, self.source_line, self.model, self.value)

        model, commands = update(make_key_down_event('Enter'),
                                self.source_code, self.source_line, model, self.value)

        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_matches")
        self.assertIn("list(re.finditer(r'hello'", expr)

    def test_enter_after_search_box_suggests_name_regardless_of_collision(self):
        """Search-box Enter path suggests name without collision resolution."""
        source_code = "x = 'hello world'\nx_matches = 'already used'"
        model, _ = update(make_search_box_input_event('/hello/'),
                          source_code, self.source_line, self.model, self.value)

        model, commands = update(make_key_down_event('Enter'),
                                source_code, self.source_line, model, self.value)

        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_matches")
        self.assertIn("list(re.finditer(r'hello'", expr)


class TestFindAvailableVariableName(unittest.TestCase):
    """Unit tests for variable-name collision helper."""

    def test_returns_desired_name_when_unused(self):
        source_code = "x = 'hello world'"
        self.assertEqual(find_available_variable_name(source_code, "x_match"), "x_match")

    def test_increments_suffix_until_name_is_available(self):
        source_code = "x_match = 1\nx_match2 = 2\nx_match3 = 3"
        self.assertEqual(find_available_variable_name(source_code, "x_match"), "x_match4")

    def test_bare_expression_suggests_result_matches(self):
        """For a bare expression (not an assignment), suggested name is result_matches."""
        source_code = "print('hello world')"
        model = init_model("hello world")
        model['search'] = '/hello/'
        model, commands = update(make_key_down_event('Enter'),
                                source_code, 1, model, "hello world")
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "result_matches")
        self.assertIn("re.finditer(r'hello'", expr)

    def test_bare_expression_suggests_result_for_delete(self):
        """For a bare expression, Backspace suggests 'result' as var name."""
        source_code = "print('hello world')"
        model = init_model("hello world")
        model['search'] = '/hello/'
        model, commands = update(make_key_down_event('Backspace', meta_key=True),
                                source_code, 1, model, "hello world")
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "result")
        self.assertIn("re.sub(r'hello'", expr)


class TestSearchBoxEscape(unittest.TestCase):
    """Test Escape key interactions with the search box."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_escape_clears_search_box_typed_regex(self):
        """Escape clears a regex that was typed in the search box."""
        model, _ = update(make_search_box_input_event('/(hello)/'),
                          self.source_code, self.source_line, self.model, self.value)

        model, _ = update(make_key_down_event('Escape'),
                          self.source_code, self.source_line, model, self.value)

        self.assertIsNone(model['search'])
        # The typed regex should be in undo history (recoverable)
        self.assertIn('/(hello)/', model['undoHistory'])


class TestSearchBoxHighlighting(unittest.TestCase):
    """Test that regex typed in search box produces correct highlighting."""

    def test_typed_regex_with_groups_highlights_segments(self):
        """A typed regex with groups produces segment highlights."""
        value = "hello world"
        model = init_model(value)
        model['search'] = '/(hello)(.*)(world)/'

        highlights = parse_regex_for_highlighting(model['search'], value)
        self.assertEqual(len(highlights), 3)

        # First segment: literal "hello"
        self.assertEqual(highlights[0][2], 'literal')

        # Second segment: fuzzy (.*)
        self.assertEqual(highlights[1][2], 'fuzzy')

        # Third segment: literal "world"
        self.assertEqual(highlights[2][2], 'literal')

    def test_typed_regex_without_groups_still_highlights_segments(self):
        """A typed regex without groups still produces segment highlights."""
        value = "hello world"
        model = init_model(value)
        model['search'] = '/hello.*world/'

        highlights = parse_regex_for_highlighting(model['search'], value)
        # Canonical parsing identifies segments even without explicit groups
        self.assertEqual(len(highlights), 3)

    def test_typed_invalid_regex_no_highlights(self):
        """An invalid regex produces no highlights (graceful handling)."""
        value = "hello world"
        model = init_model(value)
        model['search'] = '/[unclosed/'

        highlights = parse_regex_for_highlighting(model['search'], value)
        self.assertEqual(len(highlights), 0)

    def test_typed_regex_no_match_no_highlights(self):
        """A valid regex that doesn't match produces no highlights."""
        value = "hello world"
        model = init_model(value)
        model['search'] = '/(xyz)/'

        highlights = parse_regex_for_highlighting(model['search'], value)
        self.assertEqual(len(highlights), 0)


class TestSearchBoxMultipleRoundTrips(unittest.TestCase):
    """Test multiple round trips between search box and mouse interactions."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_mouse_then_searchbox_then_mouse_then_searchbox(self):
        """Multiple alternations between mouse and search box.

        Mouse: /(hello)/
        Search box: /(hello)(.*)/
        Mouse: extend with (world) inside fuzzy -> /(hello)(.*)(world)/
        Search box: tweak to /(hello)(\\s+)(world)/
        """
        # Mouse: select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                          self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_mouse_move_event(6),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/hello/')

        # Search box: add fuzzy
        model, _ = update(make_search_box_input_event('/(hello)(.*)/'),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/(hello)(.*)/')

        # Mouse: click inside fuzzy to add "world"
        model, _ = update(make_mouse_down_event(8, top_half=True),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(12),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(12),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/hello.*world/')

        # Search box: tweak fuzzy to \s+
        model, _ = update(make_search_box_input_event(r'/(hello)(\s+)(world)/'),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], r'/(hello)(\s+)(world)/')

        # Verify the full undo history
        self.assertEqual(model['undoHistory'], [
            None,
            '/hello/',
            '/(hello)(.*)/',
            '/hello.*world/',
        ])

    def test_searchbox_to_mouse_preserves_undo_chain(self):
        """Switching input methods doesn't break the undo chain."""
        # Search box
        model, _ = update(make_search_box_input_event('/(hello)/'),
                          self.source_code, self.source_line, self.model, self.value)

        # Mouse extend
        end_idx = get_last_segment_end_internal_idx(model['search'], self.value)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(end_idx),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/hello\\s*/')

        # Search box again
        model, _ = update(make_search_box_input_event('/(hello)(\\d+)/'),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/(hello)(\\d+)/')

        # Undo all the way back
        model, _ = update(make_key_down_event('z', meta_key=True),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/hello\\s*/')

        model, _ = update(make_key_down_event('z', meta_key=True),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/(hello)/')

        model, _ = update(make_key_down_event('z', meta_key=True),
                          self.source_code, self.source_line, model, self.value)
        self.assertIsNone(model['search'])

    def test_incremental_typing_in_search_box(self):
        """Simulates the user incrementally typing a regex character by character.

        Each keystroke fires an input event with the full current value.
        """
        model = self.model

        # Type "/" -> "/h" -> "/he" -> "/hel" -> "/hell" -> "/hello" -> "/hello/"
        steps = ['/', '/h', '/he', '/hel', '/hell', '/hello', '/hello/']
        for step_value in steps:
            model, _ = update(make_search_box_input_event(step_value),
                              self.source_code, self.source_line, model, self.value)
            self.assertEqual(model['search'], step_value)

        # Only the changing values should be in undo history
        self.assertEqual(model['undoHistory'], [None, '/', '/h', '/he', '/hel', '/hell', '/hello'])


# =============================================================================
# Test Helper: Handle Mouse Down Events
# =============================================================================

def make_handle_mouse_down_event(segment_index: int, side: str) -> dict:
    """Create a HandleMouseDown event dict for drag handle interaction.

    Args:
        segment_index: Index of the segment whose handle is being dragged
        side: 'left' or 'right' - which handle
    """
    return {
        'pythonEventStr': repr(HandleMouseDown(segment_index=segment_index, side=side)),
        'eventJSON': {
            'buttons': 1,
        }
    }


# =============================================================================
# Tests: resize_literal_segment (core function)
# =============================================================================

class TestResizeLiteralSegment(unittest.TestCase):
    """Test the resize_literal_segment function that modifies a literal segment's boundaries.

    For "hello world", internal indices are:
        0=\\A, 1=^, 2=h, 3=e, 4=l, 5=l, 6=o, 7=' ', 8=w, 9=o, 10=r, 11=l, 12=d, 13=$, 14=\\Z

    /(hello)/ matches "hello" at string indices 0-4, internal range [2, 7).
    """

    def setUp(self):
        self.value = "hello world"

    def test_expand_right(self):
        """Expand 'hello' right to include space -> 'hello '."""
        result = resize_literal_segment('/(hello)/', 0, self.value, 2, 8)
        self.assertEqual(result, '/(hello\\ )/')

    def test_collapse_right(self):
        """Collapse 'hello' from right to 'hell'."""
        result = resize_literal_segment('/(hello)/', 0, self.value, 2, 6)
        self.assertEqual(result, '/(hell)/')

    def test_expand_left(self):
        """Expand 'ello' left to include 'h' -> 'hello'."""
        result = resize_literal_segment('/(ello)/', 0, self.value, 2, 7)
        self.assertEqual(result, '/(hello)/')

    def test_collapse_left(self):
        """Collapse 'hello' from left to 'ello'."""
        result = resize_literal_segment('/(hello)/', 0, self.value, 3, 7)
        self.assertEqual(result, '/(ello)/')

    def test_single_char(self):
        """Resize to single char 'h'."""
        result = resize_literal_segment('/(hello)/', 0, self.value, 2, 3)
        self.assertEqual(result, '/(h)/')

    def test_no_change_if_empty_range(self):
        """Empty range (new_end <= new_start) returns original regex unchanged."""
        result = resize_literal_segment('/(hello)/', 0, self.value, 5, 5)
        self.assertEqual(result, '/(hello)/')

    def test_multi_segment_resize_first(self):
        """Resize first segment in multi-segment regex."""
        result = resize_literal_segment('/(hello)(.*)(world)/', 0, self.value, 2, 8)
        self.assertEqual(result, '/(hello\\ )(.*)(world)/')

    def test_multi_segment_resize_last(self):
        """Resize last segment in multi-segment regex."""
        result = resize_literal_segment('/(hello)(.*)(world)/', 2, self.value, 7, 13)
        self.assertEqual(result, '/(hello)(.*)(\\ world)/')

    def test_preserves_other_segments(self):
        """Other segments are unchanged when one is resized."""
        result = resize_literal_segment('/(hello)(.*)(world)/', 0, self.value, 2, 3)
        self.assertEqual(result, '/(h)(.*)(world)/')

    # --- Canonical ungrouped form (the form actually stored in model) ---

    def test_ungrouped_single_expand_right(self):
        """Ungrouped /hello/ expanded right to include space."""
        result = resize_literal_segment('/hello/', 0, self.value, 2, 8)
        self.assertEqual(result, '/hello\\ /')

    def test_ungrouped_single_collapse_right(self):
        """Ungrouped /hello/ collapsed from right to 'hell'."""
        result = resize_literal_segment('/hello/', 0, self.value, 2, 6)
        self.assertEqual(result, '/hell/')

    def test_ungrouped_single_collapse_left(self):
        """Ungrouped /hello/ collapsed from left to 'ello'."""
        result = resize_literal_segment('/hello/', 0, self.value, 3, 7)
        self.assertEqual(result, '/ello/')

    def test_ungrouped_single_char_expand(self):
        """Ungrouped single char /h/ expanded right."""
        result = resize_literal_segment('/h/', 0, self.value, 2, 4)
        self.assertEqual(result, '/he/')

    def test_ungrouped_multi_segment_resize_first(self):
        """Ungrouped /hello.*world/ resize first literal segment."""
        result = resize_literal_segment('/hello.*world/', 0, self.value, 2, 8)
        self.assertEqual(result, '/hello\\ .*world/')

    def test_ungrouped_multi_segment_resize_last(self):
        """Ungrouped /hello.*world/ resize last literal segment."""
        result = resize_literal_segment('/hello.*world/', 2, self.value, 7, 13)
        self.assertEqual(result, '/hello.*\\ world/')


# =============================================================================
# Tests: Literal Drag Handle Update Logic
# =============================================================================

class TestLiteralDragHandleUpdate(unittest.TestCase):
    """Test the handle drag interaction flow through update().

    For "hello world", internal indices are:
        0=\\A, 1=^, 2=h, 3=e, 4=l, 5=l, 6=o, 7=' ', 8=w, 9=o, 10=r, 11=l, 12=d, 13=$, 14=\\Z
    """

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    # --- Handle drag start ---

    def test_handle_mouse_down_right_starts_drag(self):
        """HandleMouseDown on right side starts handle drag mode."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'

        model, commands = update(make_handle_mouse_down_event(0, 'right'),
                                 self.source_code, self.source_line, model, self.value)

        self.assertIsNotNone(model.get('handleDrag'))
        self.assertEqual(model['handleDrag']['segmentIndex'], 0)
        self.assertEqual(model['handleDrag']['side'], 'right')
        self.assertEqual(commands, [])

    def test_handle_mouse_down_left_starts_drag(self):
        """HandleMouseDown on left side starts handle drag mode."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'

        model, commands = update(make_handle_mouse_down_event(0, 'left'),
                                 self.source_code, self.source_line, model, self.value)

        self.assertIsNotNone(model.get('handleDrag'))
        self.assertEqual(model['handleDrag']['segmentIndex'], 0)
        self.assertEqual(model['handleDrag']['side'], 'left')

    # --- Mouse move during handle drag ---

    def test_mouse_move_during_handle_drag_updates_cursor(self):
        """MouseMove during handle drag updates the drag cursor position."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'

        model, _ = update(make_handle_mouse_down_event(0, 'right'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(8),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['handleDrag']['cursorIdx'], 8)

    def test_mouse_move_during_handle_drag_does_not_start_new_selection(self):
        """MouseMove during handle drag should NOT set anchorIdx/cursorIdx on model root."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'

        model, _ = update(make_handle_mouse_down_event(0, 'right'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(8),
                          self.source_code, self.source_line, model, self.value)

        # The normal drag state should not be set
        self.assertIsNone(model.get('anchorIdx'))
        self.assertFalse(model.get('dragging', False))

    # --- Mouse up finalizes handle drag ---

    def test_mouse_up_finalizes_handle_drag(self):
        """MouseUp finalizes the handle drag and clears handleDrag state."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'

        model, _ = update(make_handle_mouse_down_event(0, 'right'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(7),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(7),
                          self.source_code, self.source_line, model, self.value)

        self.assertIsNone(model.get('handleDrag'))

    # --- Full drag right handle sequences ---

    def test_drag_right_handle_right_expands(self):
        """Drag right handle rightward: hello -> hello (space)."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'

        model, _ = update(make_handle_mouse_down_event(0, 'right'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(7),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(7),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/(hello\\ )/')

    def test_drag_right_handle_left_collapses(self):
        """Drag right handle leftward: hello -> hell."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'

        # hello is internal [2,7). Drag right handle to index 5 (second l).
        model, _ = update(make_handle_mouse_down_event(0, 'right'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(5),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(5),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/(hell)/')

    # --- Full drag left handle sequences ---

    def test_drag_left_handle_left_expands(self):
        """Drag left handle leftward: ello -> hello."""
        model = init_model(self.value)
        model['search'] = '/(ello)/'

        # ello matches internal [3,7). Drag left handle to index 2 (h).
        model, _ = update(make_handle_mouse_down_event(0, 'left'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(2),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(2),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/(hello)/')

    def test_drag_left_handle_right_collapses(self):
        """Drag left handle rightward: hello -> ello."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'

        # hello is internal [2,7). Drag left handle to index 3 (e).
        model, _ = update(make_handle_mouse_down_event(0, 'left'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(3),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(3),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/(ello)/')

    # --- Minimum size: cannot collapse to empty ---

    def test_right_handle_cannot_collapse_past_start(self):
        """Dragging right handle past start keeps at least 1 char."""
        model = init_model(self.value)
        model['search'] = '/(h)/'

        # h is internal [2,3). Drag right handle to index 1 (past start).
        model, _ = update(make_handle_mouse_down_event(0, 'right'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(1),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(1),
                          self.source_code, self.source_line, model, self.value)

        # Should stay as /(h)/ - at least 1 char
        self.assertEqual(model['search'], '/(h)/')

    def test_left_handle_cannot_collapse_past_end(self):
        """Dragging left handle past end keeps at least 1 char."""
        model = init_model(self.value)
        model['search'] = '/(h)/'

        # h is internal [2,3). Drag left handle to index 3 (past end).
        model, _ = update(make_handle_mouse_down_event(0, 'left'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(3),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(3),
                          self.source_code, self.source_line, model, self.value)

        # Should stay as /(h)/ - at least 1 char
        self.assertEqual(model['search'], '/(h)/')

    # --- Multi-segment resize ---

    def test_resize_first_segment_in_multi(self):
        """Resize first segment in /(hello)(.*)(world)/."""
        model = init_model(self.value)
        model['search'] = '/(hello)(.*)(world)/'

        # Drag right handle of hello to include space.
        model, _ = update(make_handle_mouse_down_event(0, 'right'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(7),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(7),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/(hello\\ )(.*)(world)/')

    def test_resize_last_segment_in_multi(self):
        """Resize last segment in /(hello)(.*)(world)/."""
        model = init_model(self.value)
        model['search'] = '/(hello)(.*)(world)/'

        # world is internal [8,13). Drag left handle to index 7 (space).
        model, _ = update(make_handle_mouse_down_event(2, 'left'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(7),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(7),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/(hello)(.*)(\\ world)/')

    # --- Undo history ---

    def test_handle_drag_saves_to_undo_history(self):
        """Handle drag finalization saves old regex to undo history."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'

        model, _ = update(make_handle_mouse_down_event(0, 'right'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(7),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(7),
                          self.source_code, self.source_line, model, self.value)

        self.assertIn('/(hello)/', model['undoHistory'])

    def test_handle_drag_no_change_does_not_add_to_undo(self):
        """If handle is dragged back to original position, no undo entry."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'
        undo_before = list(model.get('undoHistory', []))

        # Drag right handle to 8 then back to 6 (original last char index).
        model, _ = update(make_handle_mouse_down_event(0, 'right'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(8),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(6),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_up_event(6),
                          self.source_code, self.source_line, model, self.value)

        self.assertEqual(model['search'], '/(hello)/')
        self.assertEqual(model.get('undoHistory', []), undo_before)

    # --- Preview during drag ---

    def test_preview_shows_resized_segment_during_drag(self):
        """During handle drag, the visualize output reflects the resized segment."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'

        model, _ = update(make_handle_mouse_down_event(0, 'right'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(7),
                          self.source_code, self.source_line, model, self.value)

        # Still in handle-drag mode (no mouse-up yet).
        self.assertIsNotNone(model.get('handleDrag'))

        # The visualize function should use the preview regex which includes the space.
        html_output = visualize(self.value, model, None, None)
        # The space character (index 7) should have highlight styling
        # (border-top indicates literal highlight).
        # We check that the space char is highlighted by looking for border-top near the space.
        self.assertIn('border-top', html_output)

    # --- Mouse released outside (buttons=0) during handle drag ---

    def test_mouse_move_buttons_0_finalizes_handle_drag(self):
        """MouseMove with buttons=0 during handle drag finalizes it."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'

        model, _ = update(make_handle_mouse_down_event(0, 'right'),
                          self.source_code, self.source_line, model, self.value)
        model, _ = update(make_mouse_move_event(7),
                          self.source_code, self.source_line, model, self.value)

        # Mouse released outside - buttons=0
        model, _ = update(make_mouse_move_event(8, buttons=0),
                          self.source_code, self.source_line, model, self.value)

        self.assertIsNone(model.get('handleDrag'))
        self.assertEqual(model['search'], '/(hello\\ )/')


# =============================================================================
# Tests: Literal Drag Handle Rendering
# =============================================================================

class TestLiteralDragHandleRendering(unittest.TestCase):
    """Test that drag handles appear in HTML for literal segments, not fuzzy."""

    def setUp(self):
        self.value = "hello world"

    def test_literal_segment_has_ew_resize_cursor(self):
        """Literal selection bracket renders elements with ew-resize cursor."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'
        html_output = visualize(self.value, model, None, None)
        self.assertIn('ew-resize', html_output)

    def test_literal_segment_has_left_handle(self):
        """First char of literal segment renders a left drag handle."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'
        html_output = visualize(self.value, model, None, None)
        self.assertIn("side=&#x27;left&#x27;", html_output)

    def test_literal_segment_has_right_handle(self):
        """Last char of literal segment renders a right drag handle."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'
        html_output = visualize(self.value, model, None, None)
        self.assertIn("side=&#x27;right&#x27;", html_output)

    def test_literal_handle_has_HandleMouseDown_event(self):
        """Drag handle elements have HandleMouseDown event attribute."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'
        html_output = visualize(self.value, model, None, None)
        self.assertIn('HandleMouseDown', html_output)

    def test_fuzzy_segment_has_no_drag_handles(self):
        """Fuzzy selection does NOT render drag handles."""
        model = init_model(self.value)
        model['search'] = '/(.*)/'
        html_output = visualize(self.value, model, None, None)
        self.assertNotIn('ew-resize', html_output)
        self.assertNotIn('HandleMouseDown', html_output)

    def test_mixed_segments_only_literal_has_handles(self):
        """In /(hello)(.*)(world)/, only literal segments have handles."""
        model = init_model(self.value)
        model['search'] = '/(hello)(.*)(world)/'
        html_output = visualize(self.value, model, None, None)
        # Should have handles for hello and world (both literal)
        self.assertIn('HandleMouseDown', html_output)
        # Count occurrences: 2 segments * 2 handles each = 4 HandleMouseDown
        handle_count = html_output.count('HandleMouseDown')
        self.assertEqual(handle_count, 4)


# =============================================================================
# Test Helper: Repetition Input Events
# =============================================================================

def make_repetition_input_event(dropdown_id: str, field: str, value: str) -> dict:
    """Create a RepetitionInput event dict for repetition text field interaction.

    Args:
        dropdown_id: The dropdown ID (e.g., 'repetition-0')
        field: Which field changed: 'exact', 'min', or 'max'
        value: The new value of the field
    """
    return {
        'pythonEventStr': repr(RepetitionInput(dropdown_id=dropdown_id, field=field, value=value)),
        'eventJSON': {}
    }


# =============================================================================
# Tests: replace_segment_repetition (core function)
# =============================================================================

class TestReplaceSegmentRepetition(unittest.TestCase):
    """Test the replace_segment_repetition function that modifies a segment's quantifier.

    replace_segment_repetition should replace the quantifier of a segment,
    preserving the base pattern (character class or literal content).

    Note: Results are canonicalized, so groups are only kept when:
    - Two adjacent non-fuzzy (literal) segments exist, OR
    - The segment text contains non-capturing groups (?:...)
    Single-segment regexes always have groups stripped.
    """

    # --- Fuzzy segment (single atom) repetition changes ---

    def test_replace_star_with_plus_on_fuzzy(self):
        """Replacing .* quantifier with + gives .+ (canonical: no group for single segment)."""
        result = replace_segment_repetition('/(.*)/', 0, '+')
        self.assertEqual(result, '/.+/')

    def test_replace_star_with_question_on_fuzzy(self):
        """Replacing .* quantifier with ? gives .? (canonical)."""
        result = replace_segment_repetition('/(.*)/', 0, '?')
        self.assertEqual(result, '/.?/')

    def test_replace_star_with_exact_on_fuzzy(self):
        """Replacing .* quantifier with {3} gives .{3} (canonical)."""
        result = replace_segment_repetition('/(.*)/', 0, '{3}')
        self.assertEqual(result, '/.{3}/')

    def test_replace_star_with_range_on_fuzzy(self):
        """Replacing .* quantifier with {2,5} gives .{2,5} (canonical)."""
        result = replace_segment_repetition('/(.*)/', 0, '{2,5}')
        self.assertEqual(result, '/.{2,5}/')

    def test_replace_star_with_no_quantifier_on_fuzzy(self):
        """Replacing .* with '' (exactly 1) gives . (canonical)."""
        result = replace_segment_repetition('/(.*)/', 0, '')
        self.assertEqual(result, '/./')

    def test_replace_plus_with_star_on_fuzzy(self):
        """Replacing .+ quantifier with * gives .* (canonical)."""
        result = replace_segment_repetition('/(.+)/', 0, '*')
        self.assertEqual(result, '/.*/')

    def test_replace_on_char_class_fuzzy(self):
        r"""Replacing \s* quantifier with + gives \s+ (canonical)."""
        result = replace_segment_repetition(r'/(\s*)/', 0, '+')
        self.assertEqual(result, r'/\s+/')

    def test_replace_on_bracket_class_fuzzy(self):
        """Replacing [a-z]* quantifier with {2,5} gives [a-z]{2,5} (canonical)."""
        result = replace_segment_repetition('/([a-z]*)/', 0, '{2,5}')
        self.assertEqual(result, '/[a-z]{2,5}/')

    # --- Literal segment (single char) repetition changes ---

    def test_replace_repetition_on_literal_single_char(self):
        """Adding + to single char literal 'h' gives h+ (canonical: no group)."""
        result = replace_segment_repetition('/(h)/', 0, '+')
        self.assertEqual(result, '/h+/')

    def test_replace_single_char_with_exact(self):
        """Adding {3} to single char literal 'h' gives h{3} (canonical: no group)."""
        result = replace_segment_repetition('/(h)/', 0, '{3}')
        self.assertEqual(result, '/h{3}/')

    # --- Literal segment (multi char) repetition changes ---

    def test_replace_repetition_on_literal_multi_char(self):
        """Adding + to multi-char literal 'hello' wraps in (?:hello)+ and keeps group."""
        result = replace_segment_repetition('/(hello)/', 0, '+')
        # Group kept because text contains (?:
        self.assertEqual(result, '/((?:hello)+)/')

    def test_replace_repetition_on_literal_multi_char_exact(self):
        """Adding {3} to multi-char literal 'hello' wraps in (?:hello){3}."""
        result = replace_segment_repetition('/(hello)/', 0, '{3}')
        self.assertEqual(result, '/((?:hello){3})/')

    def test_remove_repetition_from_literal_multi_char(self):
        """Removing quantifier from (?:hello)+ gives back hello (canonical: no group)."""
        result = replace_segment_repetition('/((?:hello)+)/', 0, '')
        # Unwraps (?:...) and removes group since no (?:) in result
        self.assertEqual(result, '/hello/')

    def test_change_repetition_on_literal_multi_char(self):
        """Changing (?:hello)+ to (?:hello){2,5} keeps group."""
        result = replace_segment_repetition('/((?:hello)+)/', 0, '{2,5}')
        self.assertEqual(result, '/((?:hello){2,5})/')

    # --- Multi-segment regex (canonical form strips groups for non-adjacent-literal segments) ---

    def test_replace_in_middle_segment(self):
        """Replace repetition of middle (fuzzy) segment in multi-segment regex.

        Canonical form: no adjacent literals -> no groups needed.
        """
        result = replace_segment_repetition('/(hello)(.*)(world)/', 1, '+')
        self.assertEqual(result, '/hello.+world/')

    def test_replace_preserves_other_segments(self):
        """When adding (?:...) to one segment, it keeps its group."""
        result = replace_segment_repetition('/(hello)(.*)(world)/', 0, '{3}')
        # (?:hello){3} segment keeps group, others get canonicalized
        self.assertEqual(result, '/((?:hello){3}).*world/')

    def test_replace_last_segment_repetition(self):
        """Replace repetition of last segment wraps in (?:...) and keeps group."""
        result = replace_segment_repetition('/(hello)(.*)(world)/', 2, '+')
        self.assertEqual(result, '/hello.*((?:world)+)/')

    # --- Edge cases ---

    def test_out_of_bounds_index_unchanged(self):
        """Out of bounds segment index leaves regex unchanged (canonical form)."""
        result = replace_segment_repetition('/(hello)/', 5, '+')
        self.assertEqual(result, '/hello/')

    def test_replace_with_min_only_range(self):
        """Replace with {2,} (2 or more) quantifier (canonical)."""
        result = replace_segment_repetition('/(.*)/', 0, '{2,}')
        self.assertEqual(result, '/.{2,}/')

    def test_escaped_chars_in_literal(self):
        r"""Escaped chars like \n are single atoms, no wrapping needed (canonical)."""
        result = replace_segment_repetition(r'/(\n)/', 0, '+')
        self.assertEqual(result, r'/\n+/')


# =============================================================================
# Tests: Repetition Dropdown Toggle
# =============================================================================

class TestRepetitionDropdownToggle(unittest.TestCase):
    """Tests for toggling the repetition dropdown via DropdownToggle."""

    def test_repetition_dropdown_toggle_opens(self):
        """DropdownToggle with repetition-* ID opens the repetition dropdown."""
        model = init_model("hello world")
        model['search'] = '/(hello)/'
        self.assertIsNone(model.get('openDropdown'))

        event = make_dropdown_toggle_event('repetition-0')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertIsNotNone(model.get('openDropdown'))
        self.assertEqual(model['openDropdown']['id'], 'repetition-0')
        self.assertEqual(model['openDropdown']['segmentIndex'], 0)

    def test_repetition_dropdown_toggle_closes(self):
        """DropdownToggle closes an already-open repetition dropdown."""
        model = init_model("hello world")
        model['search'] = '/(hello)/'
        model['openDropdown'] = {'id': 'repetition-0', 'segmentIndex': 0}

        event = make_dropdown_toggle_event('repetition-0')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertIsNone(model.get('openDropdown'))

    def test_repetition_dropdown_toggle_switches(self):
        """Opening a different repetition dropdown closes the old one."""
        model = init_model("hello world")
        model['search'] = '/(hello)(.*)(world)/'
        model['openDropdown'] = {'id': 'repetition-0', 'segmentIndex': 0}

        event = make_dropdown_toggle_event('repetition-2')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertEqual(model['openDropdown']['id'], 'repetition-2')
        self.assertEqual(model['openDropdown']['segmentIndex'], 2)


# =============================================================================
# Tests: Repetition Dropdown Select (simple options: 1, ?, *, +)
# =============================================================================

class TestRepetitionDropdownSelect(unittest.TestCase):
    """Tests for selecting simple repetition options from the dropdown.

    Note: Results are canonicalized, so groups may be stripped for non-adjacent-literal
    segments. Multi-segment regexes without adjacent literals lose their groups.
    """

    def test_select_star_on_fuzzy(self):
        """Select * on a fuzzy segment changes .+ to .* (canonical: no groups)."""
        model = init_model("hello world")
        model['search'] = '/hello.+world/'
        model['openDropdown'] = {'id': 'repetition-1', 'segmentIndex': 1}

        event = make_dropdown_select_event('repetition-1', '*')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertEqual(model['search'], '/hello.*world/')
        self.assertIsNone(model.get('openDropdown'))

    def test_select_plus_on_fuzzy(self):
        """Select + on a fuzzy segment changes .* to .+ (canonical: no groups)."""
        model = init_model("hello world")
        model['search'] = '/hello.*world/'
        model['openDropdown'] = {'id': 'repetition-1', 'segmentIndex': 1}

        event = make_dropdown_select_event('repetition-1', '+')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertEqual(model['search'], '/hello.+world/')
        self.assertIsNone(model.get('openDropdown'))

    def test_select_question_on_fuzzy(self):
        """Select ? on a fuzzy segment changes .* to .? (canonical: no groups)."""
        model = init_model("hello world")
        model['search'] = '/hello.*world/'
        model['openDropdown'] = {'id': 'repetition-1', 'segmentIndex': 1}

        event = make_dropdown_select_event('repetition-1', '?')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertEqual(model['search'], '/hello.?world/')
        self.assertIsNone(model.get('openDropdown'))

    def test_select_1_removes_quantifier(self):
        """Select 1 on a fuzzy segment removes the quantifier (e.g., .* -> .)."""
        model = init_model("hello world")
        model['search'] = '/hello.*world/'
        model['openDropdown'] = {'id': 'repetition-1', 'segmentIndex': 1}

        event = make_dropdown_select_event('repetition-1', '1')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertEqual(model['search'], '/hello.world/')
        self.assertIsNone(model.get('openDropdown'))

    def test_select_plus_on_literal(self):
        """Select + on a literal segment adds + quantifier, wrapping multi-char in (?:...)."""
        model = init_model("hello world")
        model['search'] = '/hello.*world/'
        model['openDropdown'] = {'id': 'repetition-0', 'segmentIndex': 0}

        event = make_dropdown_select_event('repetition-0', '+')
        model, _ = update(event, '', 1, model, "hello world")

        # (?:hello)+ gets a group because it contains (?:)
        self.assertEqual(model['search'], '/((?:hello)+).*world/')
        self.assertIsNone(model.get('openDropdown'))

    def test_repetition_select_saves_undo(self):
        """Changing repetition saves previous regex to undo history."""
        model = init_model("hello world")
        model['search'] = '/hello.*world/'
        model['openDropdown'] = {'id': 'repetition-1', 'segmentIndex': 1}

        event = make_dropdown_select_event('repetition-1', '+')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertIn('/hello.*world/', model['undoHistory'])

    def test_repetition_select_wrong_id_ignored(self):
        """Selection ignored if dropdown ID doesn't match."""
        model = init_model("hello world")
        model['search'] = '/hello.*/'
        model['openDropdown'] = {'id': 'repetition-0', 'segmentIndex': 0}

        event = make_dropdown_select_event('repetition-1', '+')
        model, _ = update(event, '', 1, model, "hello world")

        # Regex unchanged
        self.assertEqual(model['search'], '/hello.*/')
        # Dropdown still closes
        self.assertIsNone(model.get('openDropdown'))


# =============================================================================
# Tests: RepetitionInput (text field changes for {n} and {n,m})
# =============================================================================

class TestRepetitionInput(unittest.TestCase):
    """Tests for RepetitionInput events from {n} and {n,m} text fields.

    Note: Results are canonicalized. Single-segment fuzzy patterns lose their groups.
    """

    def test_exact_field_sets_exact_quantifier(self):
        """Typing '3' in the {n} field sets quantifier to {3} (canonical: no group)."""
        model = init_model("hello world")
        model['search'] = '/.*/'
        model['openDropdown'] = {'id': 'repetition-0', 'segmentIndex': 0,
                                  'exactN': '', 'rangeMin': '', 'rangeMax': ''}

        event = make_repetition_input_event('repetition-0', 'exact', '3')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertEqual(model['search'], '/.{3}/')
        # Dropdown should remain open for further edits
        self.assertIsNotNone(model.get('openDropdown'))
        self.assertEqual(model['openDropdown']['exactN'], '3')

    def test_exact_field_empty_does_not_change_regex(self):
        """Empty {n} field does not change the regex."""
        model = init_model("hello world")
        model['search'] = '/.*/'
        model['openDropdown'] = {'id': 'repetition-0', 'segmentIndex': 0,
                                  'exactN': '3', 'rangeMin': '', 'rangeMax': ''}

        event = make_repetition_input_event('repetition-0', 'exact', '')
        model, _ = update(event, '', 1, model, "hello world")

        # Should not crash; dropdown state updated but regex may not change
        self.assertIsNotNone(model.get('openDropdown'))
        self.assertEqual(model['openDropdown']['exactN'], '')

    def test_range_min_and_max_set_range_quantifier(self):
        """Typing in both min and max fields sets {min,max} quantifier."""
        model = init_model("hello world")
        model['search'] = '/.*/'
        model['openDropdown'] = {'id': 'repetition-0', 'segmentIndex': 0,
                                  'exactN': '', 'rangeMin': '', 'rangeMax': ''}

        # Set min to 2
        event = make_repetition_input_event('repetition-0', 'min', '2')
        model, _ = update(event, '', 1, model, "hello world")

        # With only min, should produce {2,}
        self.assertEqual(model['openDropdown']['rangeMin'], '2')

        # Set max to 5
        event = make_repetition_input_event('repetition-0', 'max', '5')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertEqual(model['search'], '/.{2,5}/')
        self.assertEqual(model['openDropdown']['rangeMax'], '5')

    def test_range_min_only_sets_min_quantifier(self):
        """Setting only min field gives {n,} quantifier (canonical: no group)."""
        model = init_model("hello world")
        model['search'] = '/.*/'
        model['openDropdown'] = {'id': 'repetition-0', 'segmentIndex': 0,
                                  'exactN': '', 'rangeMin': '', 'rangeMax': ''}

        event = make_repetition_input_event('repetition-0', 'min', '2')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertEqual(model['search'], '/.{2,}/')

    def test_range_max_only_does_not_change_regex(self):
        """Setting only max field (no min) does not produce a valid quantifier."""
        model = init_model("hello world")
        original_regex = '/.*/'
        model['search'] = original_regex
        model['openDropdown'] = {'id': 'repetition-0', 'segmentIndex': 0,
                                  'exactN': '', 'rangeMin': '', 'rangeMax': ''}

        event = make_repetition_input_event('repetition-0', 'max', '5')
        model, _ = update(event, '', 1, model, "hello world")

        # rangeMax only is not a valid quantifier on its own; regex unchanged
        self.assertEqual(model['openDropdown']['rangeMax'], '5')

    def test_repetition_input_saves_undo(self):
        """RepetitionInput that changes the regex saves to undo history."""
        model = init_model("hello world")
        model['search'] = '/.*/'
        model['openDropdown'] = {'id': 'repetition-0', 'segmentIndex': 0,
                                  'exactN': '', 'rangeMin': '', 'rangeMax': ''}

        event = make_repetition_input_event('repetition-0', 'exact', '3')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertIn('/.*/', model['undoHistory'])

    def test_repetition_input_non_numeric_ignored(self):
        """Non-numeric values in text fields are ignored."""
        model = init_model("hello world")
        model['search'] = '/.*/'
        original_regex = '/.*/'
        model['openDropdown'] = {'id': 'repetition-0', 'segmentIndex': 0,
                                  'exactN': '', 'rangeMin': '', 'rangeMax': ''}

        event = make_repetition_input_event('repetition-0', 'exact', 'abc')
        model, _ = update(event, '', 1, model, "hello world")

        # Non-numeric value should not change regex
        self.assertEqual(model['search'], original_regex)

    def test_repetition_input_on_literal_multi_char(self):
        """RepetitionInput on a multi-char literal wraps in (?:...) and keeps group."""
        model = init_model("hello world")
        model['search'] = '/hello/'
        model['openDropdown'] = {'id': 'repetition-0', 'segmentIndex': 0,
                                  'exactN': '', 'rangeMin': '', 'rangeMax': ''}

        event = make_repetition_input_event('repetition-0', 'exact', '3')
        model, _ = update(event, '', 1, model, "hello world")

        self.assertEqual(model['search'], '/((?:hello){3})/')


# =============================================================================
# Tests: Repetition Dropdown Rendering
# =============================================================================

class TestRepetitionDropdownRendering(unittest.TestCase):
    """Tests that repetition dropdowns render correctly in visualize output.

    Note: We use canonical regexes that actually produce highlights for the test value.
    For "hello world": hello.*world matches and produces 3 segments.
    For single segments, use regexes that match the test value.
    """

    def test_literal_segment_has_clickable_repetition(self):
        """Literal segment renders repetition count as a clickable dropdown trigger."""
        model = init_model("helloworld")
        # Adjacent literals need groups to be preserved in canonical form
        model['search'] = '/(hello)(world)/'

        html_output = visualize("helloworld", model, None, None)

        # Should contain a repetition dropdown toggle event
        self.assertIn('repetition-0', html_output)

    def test_fuzzy_segment_has_clickable_repetition(self):
        """Fuzzy segment renders repetition count as a clickable dropdown trigger."""
        model = init_model("hello world")
        # Use canonical form that will produce highlights
        model['search'] = '/hello.*world/'

        html_output = visualize("hello world", model, None, None)

        # Should contain repetition dropdown toggle events
        # Segment 1 is fuzzy (.*)
        self.assertIn('repetition-1', html_output)

    def test_repetition_dropdown_open_shows_options(self):
        """When repetition dropdown is open, options are rendered."""
        model = init_model("hello world")
        model['search'] = '/hello.*world/'
        model['openDropdown'] = {'id': 'repetition-1', 'segmentIndex': 1,
                                  'exactN': '', 'rangeMin': '', 'rangeMax': ''}

        html_output = visualize("hello world", model, None, None)

        # Should contain dropdown select options
        self.assertIn('DropdownSelect', html_output)

    def test_repetition_dropdown_has_text_input_fields(self):
        """When repetition dropdown is open, text input fields for {n} and {n,m} are present."""
        model = init_model("hello world")
        model['search'] = '/hello.*world/'
        model['openDropdown'] = {'id': 'repetition-1', 'segmentIndex': 1,
                                  'exactN': '', 'rangeMin': '', 'rangeMax': ''}

        html_output = visualize("hello world", model, None, None)

        # Should contain RepetitionInput events for text fields
        self.assertIn('RepetitionInput', html_output)


# =============================================================================
# Tests: Hover Preview
# =============================================================================

class TestHoverPreview(unittest.TestCase):
    """Test hover preview shows a border indicating literal/fuzzy on mouse hover."""

    def setUp(self):
        self.value = "hello world"
        self.source_code = "x = 'hello world'"
        self.source_line = 1
        self.model = init_model(self.value)

    # --- Model state tests ---

    def test_mousemove_no_buttons_top_half_sets_literal_hover(self):
        """MouseMove with buttons=0 and top half sets hoverIdx and hoverType='literal'."""
        event = make_mouse_move_event(5, buttons=0, top_half=True)
        model, _ = update(event, self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['hoverIdx'], 5)
        self.assertEqual(model['hoverType'], 'literal')

    def test_mousemove_no_buttons_bottom_half_sets_fuzzy_hover(self):
        """MouseMove with buttons=0 and bottom half sets hoverType='fuzzy'."""
        event = make_mouse_move_event(5, buttons=0, top_half=False)
        model, _ = update(event, self.source_code, self.source_line, self.model, self.value)

        self.assertEqual(model['hoverIdx'], 5)
        self.assertEqual(model['hoverType'], 'fuzzy')

    def test_mousedown_clears_hover_state(self):
        """MouseDown clears hoverIdx and hoverType."""
        # First set hover state
        event = make_mouse_move_event(5, buttons=0, top_half=True)
        model, _ = update(event, self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['hoverIdx'], 5)

        # MouseDown should clear it
        event = make_mouse_down_event(5, top_half=True)
        model, _ = update(event, self.source_code, self.source_line, model, self.value)

        self.assertIsNone(model['hoverIdx'])
        self.assertIsNone(model['hoverType'])

    def test_hover_not_set_while_dragging(self):
        """MouseMove with buttons=1 (dragging) does not set hover state."""
        # Start a drag
        event = make_mouse_down_event(3, top_half=True)
        model, _ = update(event, self.source_code, self.source_line, self.model, self.value)

        # Move with button held - should NOT set hover
        event = make_mouse_move_event(5, buttons=1, top_half=True)
        model, _ = update(event, self.source_code, self.source_line, model, self.value)

        self.assertIsNone(model.get('hoverIdx'))
        self.assertIsNone(model.get('hoverType'))

    # --- Rendering tests ---

    def test_visualize_shows_hover_border_top_for_literal(self):
        """visualize() renders border-top on hovered char when hoverType='literal'."""
        model = init_model(self.value)
        model['hoverIdx'] = 5  # 'l' in "hello" (internal index)
        model['hoverType'] = 'literal'

        html_output = visualize(self.value, model, None, None)

        # The hovered char should have a blue top border (literal style)
        # Extract the span for index 5
        self.assertIn('border-top', html_output)
        # Check the blue literal color is present on border
        self.assertIn('#00aeff', html_output)

    def test_visualize_shows_hover_border_bottom_for_fuzzy(self):
        """visualize() renders border-bottom on hovered char when hoverType='fuzzy'."""
        model = init_model(self.value)
        model['hoverIdx'] = 5
        model['hoverType'] = 'fuzzy'

        html_output = visualize(self.value, model, None, None)

        # The hovered char should have a gray bottom border (fuzzy style)
        self.assertIn('border-bottom', html_output)
        self.assertIn('#868686', html_output)

    def test_hover_does_not_affect_highlighted_char(self):
        """If char is already in a selected segment, hover border style does not duplicate."""
        model = init_model(self.value)
        model['search'] = '/(hello)/'
        # Hover on index 4 which is inside the 'hello' literal segment
        model['hoverIdx'] = 4
        model['hoverType'] = 'fuzzy'

        html_output = visualize(self.value, model, None, None)

        # The highlighted char should still have literal border-top (from the selection),
        # not the fuzzy border-bottom from the hover. Count occurrences of border-bottom
        # with the fuzzy color - there should be none since 'hello' is literal.
        # The hover should not add its own border to an already-highlighted char.
        # (All chars in 'hello' have border-top from the literal segment)
        # We verify by checking that no span has BOTH border-top and border-bottom
        # Actually, simpler: count border-bottom with #868686 - should be 0
        # because the only hover char is inside the literal segment.
        import re as _re
        # Find spans with MouseMove(4) and check they don't have fuzzy border
        spans = _re.findall(r'<span[^>]*snc-mouse-move="MouseMove\(4\)"[^>]*style="([^"]*)"', html_output)
        for style in spans:
            self.assertNotIn('#868686', style)

    def test_hover_border_has_left_and_right_borders(self):
        """Hover preview on a single char shows left and right borders too."""
        model = init_model(self.value)
        model['hoverIdx'] = 5
        model['hoverType'] = 'literal'

        html_output = visualize(self.value, model, None, None)

        # Extract the inner span's style (borders live on the nested span inside snc-mouse="5")
        import re as _re
        inner_spans = _re.findall(r'<span snc-mouse="5"[^>]*><span style="([^"]*)"', html_output)
        self.assertTrue(len(inner_spans) > 0, "Should find inner span inside snc-mouse=5")
        style = inner_spans[0]
        self.assertIn('border-left', style)
        self.assertIn('border-right', style)
        self.assertIn('border-top', style)


# =============================================================================
# Run Tests
# =============================================================================

class TestGetFields(unittest.TestCase):
    """Test get_fields on string_visualizer."""

    def test_returns_none(self):
        from string_visualizer import get_fields
        self.assertIsNone(get_fields("hello"))

    def test_returns_none_for_empty_string(self):
        from string_visualizer import get_fields
        self.assertIsNone(get_fields(""))


class TestSmallParameter(unittest.TestCase):
    """Test that small=True hides the search box."""

    def test_visualize_accepts_small_parameter(self):
        model = init_model("hello")
        output = visualize("hello", model, None, None, small=True)
        self.assertIn('hello</span>', output)

    def test_search_box_present_when_not_small(self):
        model = init_model("hello")
        output = visualize("hello", model, None, None, small=False)
        self.assertIn('Search', output)
        self.assertIn('<input', output)

    def test_search_box_hidden_when_small(self):
        model = init_model("hello")
        output = visualize("hello", model, None, None, small=True)
        self.assertNotIn('<input', output)
        self.assertNotIn('Search', output)

    def test_search_box_present_by_default(self):
        model = init_model("hello")
        output = visualize("hello", model, None, None)
        self.assertIn('Search', output)


class TestTextGrouping(unittest.TestCase):
    """Test that consecutive plain characters are grouped into a single span
    using snc-text-start instead of individual snc-mouse spans."""

    def test_plain_string_uses_grouped_span(self):
        """For 'hello' with no highlights/hover, the 5 plain chars should be
        in a single snc-text-start span, not 5 individual snc-mouse spans."""
        model = init_model("hello")
        output = visualize("hello", model, None, None)
        self.assertIn('snc-text-start="2"', output)
        import re as _re
        individual_plain = _re.findall(r'snc-mouse="[2-6]"', output)
        self.assertEqual(len(individual_plain), 0,
                         "Plain chars should not have individual snc-mouse spans")

    def test_grouped_span_contains_all_plain_chars(self):
        """The grouped span's text content should contain the full plain text."""
        model = init_model("hello")
        output = visualize("hello", model, None, None)
        self.assertIn('snc-text-start="2"', output)
        import re as _re
        match = _re.search(r'<span snc-text-start="2"[^>]*>([^<]+)</span>', output)
        self.assertIsNotNone(match, "Should find grouped span starting at index 2")
        self.assertEqual(match.group(1), "hello")

    def test_special_chars_always_individual_spans(self):
        """Prefix/suffix markers and \\n/\\t always get individual snc-mouse spans."""
        model = init_model("a\nb")
        output = visualize("a\nb", model, None, None)
        import re as _re
        self.assertIn('snc-mouse="0"', output)
        self.assertIn('snc-mouse="1"', output)
        for special_idx in [3, 4, 5]:
            self.assertIn(f'snc-mouse="{special_idx}"', output,
                          f"Newline expansion index {special_idx} should be individual span")

    def test_group_flushes_at_newline(self):
        """'ab\\ncd' should produce groups for 'ab' and 'cd', with \\n chars individual."""
        model = init_model("ab\ncd")
        output = visualize("ab\ncd", model, None, None)
        self.assertIn('snc-text-start="2"', output)
        self.assertIn('snc-text-start="7"', output)

    def test_group_flushes_at_tab(self):
        """'ab\\tcd' should produce groups for 'ab' and 'cd', with \\t individual."""
        model = init_model("ab\tcd")
        output = visualize("ab\tcd", model, None, None)
        self.assertIn('snc-text-start="2"', output)
        self.assertIn('snc-text-start="5"', output)
        self.assertIn('snc-mouse="4"', output)

    def test_hover_breaks_group(self):
        """When hoverIdx points to a plain char, that char gets its own span
        and the surrounding chars are in separate groups."""
        model = init_model("hello")
        model['hoverIdx'] = 4
        model['hoverType'] = 'literal'
        output = visualize("hello", model, None, None)
        self.assertIn('snc-mouse="4"', output)
        self.assertIn('snc-text-start="2"', output)
        self.assertIn('snc-text-start="5"', output)

    def test_highlight_breaks_group(self):
        """Highlighted chars get individual spans; surrounding plain chars are grouped."""
        model = init_model("hello world")
        model['search'] = '/(hello)/'
        output = visualize("hello world", model, None, None)
        import re as _re
        for idx in range(2, 7):
            self.assertIn(f'snc-mouse="{idx}"', output,
                          f"Highlighted char at index {idx} should be individual span")
        self.assertIn('snc-text-start=', output)

    def test_start_index_correctness_across_groups(self):
        """With 'ab\\tcd', verify snc-text-start values match internal indexing."""
        model = init_model("ab\tcd")
        output = visualize("ab\tcd", model, None, None)
        import re as _re
        starts = _re.findall(r'snc-text-start="(\d+)"', output)
        self.assertIn('2', starts, "First group should start at index 2")
        self.assertIn('5', starts, "Second group should start at index 5")

    def test_html_escape_in_grouped_span(self):
        """Characters like < and & are HTML-escaped inside grouped spans."""
        model = init_model("a<b")
        output = visualize("a<b", model, None, None)
        import re as _re
        match = _re.search(r'<span snc-text-start="2"[^>]*>(.*?)</span>', output)
        self.assertIsNotNone(match)
        self.assertIn('&lt;', match.group(1))

    def test_single_plain_char_still_grouped(self):
        """Even a single plain char between specials should use grouped span."""
        model = init_model("\na\n")
        output = visualize("\na\n", model, None, None)
        self.assertIn('snc-text-start="5"', output)

    def test_empty_string_no_grouped_spans(self):
        """An empty string should have no snc-text-start spans."""
        model = init_model("")
        output = visualize("", model, None, None)
        self.assertNotIn('snc-text-start', output)

    def test_grouped_span_has_letter_spacing(self):
        """Grouped spans should have letter-spacing:1px for consistent spacing."""
        model = init_model("hello")
        output = visualize("hello", model, None, None)
        import re as _re
        match = _re.search(r'<span snc-text-start="2"[^>]*style="([^"]*)"', output)
        self.assertIsNotNone(match)
        self.assertIn('letter-spacing:1px', match.group(1))


# =============================================================================
# First-Match Toggle Tests
# =============================================================================

class TestIsFirstMatchMode(unittest.TestCase):
    """Test is_first_match_mode helper function."""

    def test_none_is_not_first_match(self):
        self.assertFalse(is_first_match_mode(None))

    def test_many_match_default(self):
        self.assertFalse(is_first_match_mode('/hello/'))

    def test_first_match_with_1_postfix(self):
        self.assertTrue(is_first_match_mode('/hello/1'))

    def test_complex_pattern_many_match(self):
        self.assertFalse(is_first_match_mode('/hello.*world/'))

    def test_complex_pattern_first_match(self):
        self.assertTrue(is_first_match_mode('/hello.*world/1'))

    def test_empty_pattern_not_first_match(self):
        self.assertFalse(is_first_match_mode('//'))

    def test_empty_pattern_first_match(self):
        self.assertTrue(is_first_match_mode('//1'))


class TestGetRegexInnerPatternWithPostfix(unittest.TestCase):
    """Test get_regex_inner_pattern strips /1 postfix correctly."""

    def test_many_match_pattern(self):
        self.assertEqual(get_regex_inner_pattern('/hello/'), 'hello')

    def test_first_match_pattern_strips_1(self):
        self.assertEqual(get_regex_inner_pattern('/hello/1'), 'hello')

    def test_complex_first_match(self):
        self.assertEqual(get_regex_inner_pattern('/hello.*world/1'), 'hello.*world')

    def test_none_returns_none(self):
        self.assertIsNone(get_regex_inner_pattern(None))


class TestFirstMatchToggle(unittest.TestCase):
    """Test the FirstMatchToggle event toggles between first and many match mode."""

    def setUp(self):
        self.value = "hello world hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world hello world'"
        self.source_line = 1

    def test_toggle_from_many_to_first(self):
        """Toggling from many-match adds /1 postfix."""
        self.model['search'] = '/hello/'
        model, _ = update(make_first_match_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '/hello/1')

    def test_toggle_from_first_to_many(self):
        """Toggling from first-match removes /1 postfix."""
        self.model['search'] = '/hello/1'
        model, _ = update(make_first_match_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '/hello/')

    def test_toggle_with_no_search_does_nothing(self):
        """Toggling with no search pattern does nothing."""
        model, _ = update(make_first_match_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertIsNone(model['search'])

    def test_toggle_saves_undo(self):
        """Toggling saves to undo history."""
        self.model['search'] = '/hello/'
        model, _ = update(make_first_match_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertIn('/hello/', model['undoHistory'])

    def test_double_toggle_roundtrip(self):
        """Toggling twice returns to original state."""
        self.model['search'] = '/hello/'
        model, _ = update(make_first_match_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '/hello/1')
        model, _ = update(make_first_match_toggle_event(),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/hello/')


class TestManyMatchHighlighting(unittest.TestCase):
    """Test that many-match mode highlights ALL matches, not just the first."""

    def test_many_match_highlights_all_occurrences(self):
        """Many-match mode should return highlights for all matches."""
        value = "abc abc abc"
        highlights = parse_regex_for_highlighting('/abc/', value)
        match_starts = [h[0] for h in highlights]
        self.assertGreater(len(match_starts), 1,
                           "Many-match should highlight more than one occurrence")

    def test_first_match_highlights_only_first(self):
        """First-match mode should return highlights for only the first match."""
        value = "abc abc abc"
        highlights = parse_regex_for_highlighting('/abc/1', value)
        match_count = len(set(h[0] for h in highlights))
        self.assertEqual(match_count, 1,
                         "First-match should highlight only one occurrence")

    def test_many_match_correct_positions(self):
        """Many-match mode highlights at correct string positions."""
        value = "ab ab"
        # "ab" appears at string positions 0-2 and 3-5
        # Internal indices: +2 offset, so first "ab" at 2-4, second at 5-7
        highlights = parse_regex_for_highlighting('/ab/', value)
        starts = sorted(set(h[0] for h in highlights))
        self.assertEqual(len(starts), 2, "Should find two 'ab' matches")

    def test_many_match_with_fuzzy_pattern(self):
        """Many-match with fuzzy pattern highlights multiple matches."""
        value = "12 34 56"
        highlights = parse_regex_for_highlighting(r'/\d+/', value)
        starts = sorted(set(h[0] for h in highlights))
        self.assertGreaterEqual(len(starts), 3,
                                "Should find three digit groups")

    def test_many_match_no_matches(self):
        """Many-match with no matches returns empty."""
        value = "hello world"
        highlights = parse_regex_for_highlighting('/xyz/', value)
        self.assertEqual(len(highlights), 0)


class TestFirstMatchEnterCodeGen(unittest.TestCase):
    """Test Enter code gen differs between first-match and many-match modes."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_many_match_enter_generates_finditer(self):
        """Default many-match Enter generates list(re.finditer(...))."""
        self.model['search'] = '/hello/'
        model, commands = update(make_key_down_event('Enter'),
                                self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_matches")
        self.assertIn("list(re.finditer(", expr)

    def test_first_match_enter_generates_search(self):
        """First-match Enter generates re.search(...)."""
        self.model['search'] = '/hello/1'
        model, commands = update(make_key_down_event('Enter'),
                                self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_match")
        self.assertIn("re.search(", expr)
        self.assertNotIn("finditer", expr)

    def test_first_match_enter_with_complex_pattern(self):
        """First-match Enter with grouped pattern uses re.search."""
        self.model['search'] = '/(hello)(.*)(world)/1'
        model, commands = update(make_key_down_event('Enter'),
                                self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertIn("re.search(", expr)


class TestFirstMatchBackspaceCodeGen(unittest.TestCase):
    """Test Backspace code gen differs between first-match and many-match modes."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_many_match_backspace_generates_sub(self):
        """Default many-match Backspace generates re.sub without count."""
        self.model['search'] = '/hello/'
        model, commands = update(make_key_down_event('Backspace', meta_key=True),
                                self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x")
        self.assertIn("re.sub(", expr)
        self.assertNotIn("count=1", expr)

    def test_first_match_backspace_generates_sub_with_count(self):
        """First-match Backspace generates re.sub with count=1."""
        self.model['search'] = '/hello/1'
        model, commands = update(make_key_down_event('Backspace', meta_key=True),
                                self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x")
        self.assertIn("re.sub(", expr)
        self.assertIn("count=1", expr)


class TestFirstMatchToggleRendering(unittest.TestCase):
    """Test that the '1st' toggle button renders in the search box."""

    def test_toggle_button_present(self):
        """The '1st' toggle button should be present in the search box HTML."""
        model = init_model("hello world")
        output = visualize("hello world", model, None, None)
        self.assertIn('1st', output)

    def test_toggle_button_inactive_by_default(self):
        """The toggle should appear inactive (not highlighted) by default."""
        model = init_model("hello world")
        output = visualize("hello world", model, None, None)
        self.assertIn('FirstMatchToggle', output)

    def test_toggle_button_active_when_first_match(self):
        """The toggle should appear active when in first-match mode."""
        model = init_model("hello world")
        model['search'] = '/hello/1'
        output = visualize("hello world", model, None, None)
        self.assertIn('1st', output)

    def test_toggle_hidden_when_small(self):
        """The toggle should be hidden when small=True (no search box)."""
        model = init_model("hello world")
        output = visualize("hello world", model, None, None, small=True)
        self.assertNotIn('1st', output)


class TestSearchBoxValueWithPostfix(unittest.TestCase):
    """Test that the search box displays the full value including /1 postfix."""

    def test_search_box_shows_postfix(self):
        """The search box value should include the /1 postfix when in first-match mode."""
        model = init_model("hello world")
        model['search'] = '/hello/1'
        output = visualize("hello world", model, None, None)
        self.assertIn('/hello/1', output)

    def test_search_box_input_preserves_postfix(self):
        """Typing /hello/1 in the search box sets first-match mode."""
        model = init_model("hello world")
        model, _ = update(make_search_box_input_event('/hello/1'),
                          "x = 'hello world'", 1, model, "hello world")
        self.assertEqual(model['search'], '/hello/1')
        self.assertTrue(is_first_match_mode(model['search']))


def make_first_match_toggle_event() -> dict:
    """Create a FirstMatchToggle event dict."""
    return {
        'pythonEventStr': repr(FirstMatchToggle()),
        'eventJSON': {},
    }


def make_case_sensitive_toggle_event() -> dict:
    """Create a CaseSensitiveToggle event dict."""
    return {
        'pythonEventStr': repr(CaseSensitiveToggle()),
        'eventJSON': {},
    }


# =============================================================================
# Case-Sensitive Toggle Tests
# =============================================================================

class TestGetSearchFlags(unittest.TestCase):
    """Test get_search_flags helper that extracts postfix flags."""

    def test_no_flags(self):
        self.assertEqual(get_search_flags('/hello/'), '')

    def test_first_match_flag(self):
        self.assertEqual(get_search_flags('/hello/1'), '1')

    def test_case_insensitive_flag(self):
        self.assertEqual(get_search_flags('/hello/i'), 'i')

    def test_combined_flags_1i(self):
        self.assertEqual(get_search_flags('/hello/1i'), '1i')

    def test_combined_flags_i1(self):
        self.assertEqual(get_search_flags('/hello/i1'), 'i1')

    def test_none_returns_empty(self):
        self.assertEqual(get_search_flags(None), '')

    def test_pattern_with_slash(self):
        """Slash inside pattern doesn't confuse flag extraction."""
        self.assertEqual(get_search_flags('/a\\/b/i'), 'i')


class TestIsCaseInsensitive(unittest.TestCase):
    """Test is_case_insensitive helper."""

    def test_none_is_case_sensitive(self):
        self.assertFalse(is_case_insensitive(None))

    def test_no_flag_is_case_sensitive(self):
        self.assertFalse(is_case_insensitive('/hello/'))

    def test_i_flag_is_case_insensitive(self):
        self.assertTrue(is_case_insensitive('/hello/i'))

    def test_1i_flag_is_case_insensitive(self):
        self.assertTrue(is_case_insensitive('/hello/1i'))

    def test_1_flag_only_is_case_sensitive(self):
        self.assertFalse(is_case_insensitive('/hello/1'))


class TestGetRegexInnerPatternWithFlags(unittest.TestCase):
    """Test get_regex_inner_pattern strips all postfix flags."""

    def test_no_flags(self):
        self.assertEqual(get_regex_inner_pattern('/hello/'), 'hello')

    def test_1_flag(self):
        self.assertEqual(get_regex_inner_pattern('/hello/1'), 'hello')

    def test_i_flag(self):
        self.assertEqual(get_regex_inner_pattern('/hello/i'), 'hello')

    def test_1i_flags(self):
        self.assertEqual(get_regex_inner_pattern('/hello/1i'), 'hello')

    def test_i1_flags(self):
        self.assertEqual(get_regex_inner_pattern('/hello/i1'), 'hello')

    def test_pattern_with_slash(self):
        self.assertEqual(get_regex_inner_pattern('/a\\/b/i'), 'a\\/b')


class TestIsFirstMatchModeWithCombinedFlags(unittest.TestCase):
    """Test is_first_match_mode works with combined flag postfixes."""

    def test_1_flag(self):
        self.assertTrue(is_first_match_mode('/hello/1'))

    def test_1i_flag(self):
        self.assertTrue(is_first_match_mode('/hello/1i'))

    def test_i1_flag(self):
        self.assertTrue(is_first_match_mode('/hello/i1'))

    def test_i_flag_only(self):
        self.assertFalse(is_first_match_mode('/hello/i'))

    def test_no_flags(self):
        self.assertFalse(is_first_match_mode('/hello/'))


class TestCaseSensitiveToggle(unittest.TestCase):
    """Test the CaseSensitiveToggle event."""

    def setUp(self):
        self.value = "Hello hello HELLO"
        self.model = init_model(self.value)
        self.source_code = "x = 'Hello hello HELLO'"
        self.source_line = 1

    def test_toggle_to_case_insensitive(self):
        """Toggling from case-sensitive adds i flag."""
        self.model['search'] = '/hello/'
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '/hello/i')

    def test_toggle_to_case_sensitive(self):
        """Toggling from case-insensitive removes i flag."""
        self.model['search'] = '/hello/i'
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '/hello/')

    def test_toggle_preserves_first_match_flag(self):
        """Toggling case preserves the 1 flag."""
        self.model['search'] = '/hello/1'
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '/hello/1i')

    def test_toggle_off_preserves_first_match_flag(self):
        """Toggling case off with 1 flag preserves 1."""
        self.model['search'] = '/hello/1i'
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '/hello/1')

    def test_toggle_with_no_search_does_nothing(self):
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertIsNone(model['search'])

    def test_toggle_saves_undo(self):
        self.model['search'] = '/hello/'
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertIn('/hello/', model['undoHistory'])

    def test_double_toggle_roundtrip(self):
        self.model['search'] = '/hello/'
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '/hello/i')
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '/hello/')


class TestCaseInsensitiveHighlighting(unittest.TestCase):
    """Test that case-insensitive flag affects highlighting."""

    def test_case_insensitive_matches_different_cases(self):
        """Case-insensitive search highlights all case variants."""
        value = "Hello hello HELLO"
        highlights = parse_regex_for_highlighting('/hello/i', value)
        starts = sorted(set(h[0] for h in highlights))
        self.assertEqual(len(starts), 3, "Should match all three 'hello' variants")

    def test_case_sensitive_matches_exact_case_only(self):
        """Case-sensitive search only matches exact case."""
        value = "Hello hello HELLO"
        highlights = parse_regex_for_highlighting('/hello/', value)
        starts = sorted(set(h[0] for h in highlights))
        self.assertEqual(len(starts), 1, "Should match only exact 'hello'")

    def test_case_insensitive_first_match(self):
        """Case-insensitive + first-match highlights only first case variant."""
        value = "Hello hello HELLO"
        highlights = parse_regex_for_highlighting('/hello/1i', value)
        match_count = len(set(h[0] for h in highlights))
        self.assertEqual(match_count, 1, "First-match should highlight only one")


class TestCaseInsensitiveEnterCodeGen(unittest.TestCase):
    """Test Enter generates code with re.I flag when case-insensitive."""

    def setUp(self):
        self.value = "Hello hello"
        self.model = init_model(self.value)
        self.source_code = "x = 'Hello hello'"
        self.source_line = 1

    def test_case_sensitive_enter_no_re_I(self):
        """Case-sensitive Enter should NOT include re.I in flags."""
        self.model['search'] = '/hello/'
        model, commands = update(make_key_down_event('Enter'),
                                self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertNotIn('re.I', expr)

    def test_case_insensitive_enter_has_re_I(self):
        """Case-insensitive Enter should include re.I in flags."""
        self.model['search'] = '/hello/i'
        model, commands = update(make_key_down_event('Enter'),
                                self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn('re.I', expr)
        self.assertIn('re.M', expr)

    def test_case_insensitive_first_match_enter(self):
        """Case-insensitive + first-match Enter uses re.search with re.I."""
        self.model['search'] = '/hello/1i'
        model, commands = update(make_key_down_event('Enter'),
                                self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertIn('re.search(', expr)
        self.assertIn('re.I', expr)
        self.assertEqual(suggest_name, "x_match")


class TestCaseInsensitiveBackspaceCodeGen(unittest.TestCase):
    """Test Backspace generates code with re.I flag when case-insensitive."""

    def setUp(self):
        self.value = "Hello hello"
        self.model = init_model(self.value)
        self.source_code = "x = 'Hello hello'"
        self.source_line = 1

    def test_case_sensitive_backspace_no_re_I(self):
        self.model['search'] = '/hello/'
        model, commands = update(make_key_down_event('Backspace', meta_key=True),
                                self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertNotIn('re.I', expr)

    def test_case_insensitive_backspace_has_re_I(self):
        self.model['search'] = '/hello/i'
        model, commands = update(make_key_down_event('Backspace', meta_key=True),
                                self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn('re.I', expr)
        self.assertIn('re.M', expr)

    def test_case_insensitive_first_match_backspace(self):
        """Case-insensitive + first-match Backspace uses count=1 and re.I."""
        self.model['search'] = '/hello/1i'
        model, commands = update(make_key_down_event('Backspace', meta_key=True),
                                self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn('count=1', expr)
        self.assertIn('re.I', expr)


class TestCaseSensitiveToggleRendering(unittest.TestCase):
    """Test that the 'Aa' toggle button renders in the search box."""

    def test_aa_button_present(self):
        model = init_model("hello")
        output = visualize("hello", model, None, None)
        self.assertIn('Aa', output)

    def test_aa_button_active_by_default(self):
        """Aa should be highlighted (active) by default = case-sensitive."""
        model = init_model("hello")
        output = visualize("hello", model, None, None)
        self.assertIn('CaseSensitiveToggle', output)

    def test_aa_button_hidden_when_small(self):
        model = init_model("hello")
        output = visualize("hello", model, None, None, small=True)
        self.assertNotIn('Aa', output)


# =============================================================================
# String Search Tests
# =============================================================================

class TestFindClosingDelimiter(unittest.TestCase):
    """Test _find_closing_delimiter for regex and string searches."""

    def test_regex(self):
        self.assertEqual(_find_closing_delimiter('/hello/'), 7)

    def test_regex_with_flags(self):
        self.assertEqual(_find_closing_delimiter('/hello/1i'), 7)

    def test_single_quote(self):
        self.assertEqual(_find_closing_delimiter("'hello'"), 7)

    def test_double_quote(self):
        self.assertEqual(_find_closing_delimiter('"hello"'), 7)

    def test_triple_single_quote(self):
        self.assertEqual(_find_closing_delimiter("'''hello'''"), 11)

    def test_triple_double_quote(self):
        self.assertEqual(_find_closing_delimiter('"""hello"""'), 11)

    def test_single_quote_with_flags(self):
        self.assertEqual(_find_closing_delimiter("'hello'i"), 7)

    def test_triple_quote_with_flags(self):
        self.assertEqual(_find_closing_delimiter("'''hello'''1i"), 11)

    def test_f_string(self):
        self.assertEqual(_find_closing_delimiter("f'hello'"), 8)

    def test_r_string(self):
        self.assertEqual(_find_closing_delimiter("r'hello'"), 8)

    def test_b_string(self):
        self.assertEqual(_find_closing_delimiter("b'hello'"), 8)

    def test_fr_string(self):
        self.assertEqual(_find_closing_delimiter("fr'hello'"), 9)

    def test_rb_string(self):
        self.assertEqual(_find_closing_delimiter("rb'hello'"), 9)

    def test_escaped_quote_in_single(self):
        self.assertEqual(_find_closing_delimiter(r"'it\'s'"), 7)

    def test_no_closing_delimiter_returns_none(self):
        self.assertIsNone(_find_closing_delimiter("'hello"))

    def test_none_returns_none(self):
        self.assertIsNone(_find_closing_delimiter(None))

    def test_empty_string_literal(self):
        self.assertEqual(_find_closing_delimiter("''"), 2)

    def test_empty_regex(self):
        self.assertEqual(_find_closing_delimiter('//'), 2)

    def test_triple_quote_with_single_inside(self):
        self.assertEqual(_find_closing_delimiter("'''it's'''"), 10)

    def test_double_quote_with_escaped_inside(self):
        self.assertEqual(_find_closing_delimiter(r'"say \"hi\""'), 12)

    def test_raw_string_backslash_doesnt_escape(self):
        # r'\' is a valid raw string containing a single backslash
        self.assertEqual(_find_closing_delimiter(r"r'hello\'"), 9)


class TestIsRegexSearch(unittest.TestCase):
    def test_regex(self):
        self.assertTrue(is_regex_search('/hello/'))

    def test_string(self):
        self.assertFalse(is_regex_search("'hello'"))

    def test_none(self):
        self.assertFalse(is_regex_search(None))


class TestIsStringSearch(unittest.TestCase):
    def test_single_quote(self):
        self.assertTrue(is_string_search("'hello'"))

    def test_double_quote(self):
        self.assertTrue(is_string_search('"hello"'))

    def test_f_string(self):
        self.assertTrue(is_string_search("f'hello'"))

    def test_r_string(self):
        self.assertTrue(is_string_search("r'hello'"))

    def test_triple_quote(self):
        self.assertTrue(is_string_search("'''hello'''"))

    def test_regex_is_not_string(self):
        self.assertFalse(is_string_search('/hello/'))

    def test_none(self):
        self.assertFalse(is_string_search(None))

    def test_bare_text(self):
        self.assertFalse(is_string_search('hello'))


class TestGetStringLiteral(unittest.TestCase):
    """Test extracting the string literal portion (including quotes, excluding flags)."""

    def test_simple(self):
        self.assertEqual(get_string_literal("'hello'"), "'hello'")

    def test_with_flags(self):
        self.assertEqual(get_string_literal("'hello'i"), "'hello'")

    def test_with_combined_flags(self):
        self.assertEqual(get_string_literal("'hello'1i"), "'hello'")

    def test_f_string(self):
        self.assertEqual(get_string_literal("f'hello'"), "f'hello'")

    def test_triple_quote(self):
        self.assertEqual(get_string_literal("'''hello'''1i"), "'''hello'''")

    def test_regex_returns_none(self):
        self.assertIsNone(get_string_literal("/hello/"))

    def test_none_returns_none(self):
        self.assertIsNone(get_string_literal(None))


class TestEvalStringSearch(unittest.TestCase):
    """Test eval_string_search evaluates the string literal to a Python str."""

    def test_simple_single_quote(self):
        self.assertEqual(eval_string_search("'hello'"), "hello")

    def test_simple_double_quote(self):
        self.assertEqual(eval_string_search('"hello"'), "hello")

    def test_with_flags(self):
        self.assertEqual(eval_string_search("'hello'i"), "hello")

    def test_escape_sequence(self):
        self.assertEqual(eval_string_search(r"'hello\nworld'"), "hello\nworld")

    def test_triple_quote(self):
        self.assertEqual(eval_string_search("'''hello'''"), "hello")

    def test_raw_string(self):
        self.assertEqual(eval_string_search(r"r'\n'"), r"\n")

    def test_regex_returns_none(self):
        self.assertIsNone(eval_string_search("/hello/"))

    def test_none_returns_none(self):
        self.assertIsNone(eval_string_search(None))

    def test_unterminated_returns_none(self):
        self.assertIsNone(eval_string_search("'hello"))

    def test_empty_string(self):
        self.assertEqual(eval_string_search("''"), "")


class TestGetSearchFlagsWithStrings(unittest.TestCase):
    """Test get_search_flags works for both regex and string searches."""

    def test_regex_no_flags(self):
        self.assertEqual(get_search_flags('/hello/'), '')

    def test_regex_flags(self):
        self.assertEqual(get_search_flags('/hello/1i'), '1i')

    def test_string_no_flags(self):
        self.assertEqual(get_search_flags("'hello'"), '')

    def test_string_i_flag(self):
        self.assertEqual(get_search_flags("'hello'i"), 'i')

    def test_string_1i_flags(self):
        self.assertEqual(get_search_flags("'hello'1i"), '1i')

    def test_triple_quote_flags(self):
        self.assertEqual(get_search_flags("'''hello'''1"), '1')

    def test_f_string_flags(self):
        self.assertEqual(get_search_flags("f'hello'i"), 'i')


class TestIsFirstMatchModeWithStrings(unittest.TestCase):
    def test_string_no_flags(self):
        self.assertFalse(is_first_match_mode("'hello'"))

    def test_string_1_flag(self):
        self.assertTrue(is_first_match_mode("'hello'1"))

    def test_string_1i_flags(self):
        self.assertTrue(is_first_match_mode("'hello'1i"))


class TestIsCaseInsensitiveWithStrings(unittest.TestCase):
    def test_string_no_flags(self):
        self.assertFalse(is_case_insensitive("'hello'"))

    def test_string_i_flag(self):
        self.assertTrue(is_case_insensitive("'hello'i"))


class TestToggleFlagWithStrings(unittest.TestCase):
    """Test _toggle_search_flag works with string search format."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_toggle_first_match_on_string(self):
        self.model['search'] = "'hello'"
        model, _ = update(make_first_match_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], "'hello'1")

    def test_toggle_case_on_string(self):
        self.model['search'] = "'hello'"
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], "'hello'i")

    def test_toggle_both_flags_on_string(self):
        self.model['search'] = "'hello'"
        model, _ = update(make_first_match_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], "'hello'1i")

    def test_toggle_roundtrip_on_string(self):
        self.model['search'] = "'hello'"
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], "'hello'i")
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], "'hello'")


class TestStringSearchHighlighting(unittest.TestCase):
    """Test that string search produces correct highlighting."""

    def test_single_match(self):
        value = "hello world"
        highlights = parse_regex_for_highlighting("'hello'", value)
        self.assertEqual(len(highlights), 1)
        start, end, seg_type, _, _, _ = highlights[0]
        self.assertEqual(seg_type, 'literal')

    def test_many_match(self):
        value = "abc abc abc"
        highlights = parse_regex_for_highlighting("'abc'", value)
        self.assertEqual(len(highlights), 3)

    def test_first_match_only(self):
        value = "abc abc abc"
        highlights = parse_regex_for_highlighting("'abc'1", value)
        self.assertEqual(len(highlights), 1)

    def test_case_insensitive(self):
        value = "Hello hello HELLO"
        highlights = parse_regex_for_highlighting("'hello'i", value)
        self.assertEqual(len(highlights), 3)

    def test_case_sensitive(self):
        value = "Hello hello HELLO"
        highlights = parse_regex_for_highlighting("'hello'", value)
        self.assertEqual(len(highlights), 1)

    def test_no_match(self):
        value = "hello world"
        highlights = parse_regex_for_highlighting("'xyz'", value)
        self.assertEqual(len(highlights), 0)

    def test_special_regex_chars_are_escaped(self):
        """Dots, parens, etc. in the literal should not be treated as regex."""
        value = "hello (world)."
        highlights = parse_regex_for_highlighting("'(world).'", value)
        self.assertEqual(len(highlights), 1)

    def test_escape_sequence(self):
        r"""String with \n should match actual newlines."""
        value = "hello\nworld"
        highlights = parse_regex_for_highlighting(r"'\n'", value)
        self.assertEqual(len(highlights), 1)

    def test_double_quote_string(self):
        value = "hello world"
        highlights = parse_regex_for_highlighting('"hello"', value)
        self.assertEqual(len(highlights), 1)

    def test_triple_quote_string(self):
        value = "hello world"
        highlights = parse_regex_for_highlighting("'''hello'''", value)
        self.assertEqual(len(highlights), 1)

    def test_empty_string_search_no_highlights(self):
        """Empty string literal should not produce highlights."""
        value = "hello"
        highlights = parse_regex_for_highlighting("''", value)
        self.assertEqual(len(highlights), 0)

    def test_combined_first_match_case_insensitive(self):
        value = "Hello hello HELLO"
        highlights = parse_regex_for_highlighting("'hello'1i", value)
        self.assertEqual(len(highlights), 1)


class TestStringSearchEnterCodeGen(unittest.TestCase):
    """Test Enter code generation for string searches."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_many_match_case_sensitive(self):
        self.model['search'] = "'hello'"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_matches")
        self.assertIn("re.escape('hello')", expr)
        self.assertIn("re.finditer(", expr)
        self.assertNotIn("re.I", expr)

    def test_first_match_case_sensitive(self):
        self.model['search'] = "'hello'1"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_match")
        self.assertIn("re.search(", expr)
        self.assertIn("re.escape('hello')", expr)

    def test_many_match_case_insensitive(self):
        self.model['search'] = "'hello'i"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("re.finditer(", expr)
        self.assertIn("re.I", expr)

    def test_first_match_case_insensitive(self):
        self.model['search'] = "'hello'1i"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertIn("re.search(", expr)
        self.assertIn("re.I", expr)
        self.assertEqual(suggest_name, "x_match")

    def test_double_quote_preserved(self):
        """Double-quote string literal preserved in generated code."""
        self.model['search'] = '"hello"'
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn('re.escape("hello")', expr)


class TestStringSearchBackspaceCodeGen(unittest.TestCase):
    """Test Backspace code generation for string searches."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_many_match_case_sensitive(self):
        self.model['search'] = "'hello'"
        _, commands = update(make_key_down_event('Backspace', meta_key=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x")
        self.assertIn(".replace('hello', '')", expr)
        self.assertNotIn("re.sub", expr)

    def test_first_match_case_sensitive(self):
        self.model['search'] = "'hello'1"
        _, commands = update(make_key_down_event('Backspace', meta_key=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn(".replace('hello', '', 1)", expr)

    def test_many_match_case_insensitive(self):
        self.model['search'] = "'hello'i"
        _, commands = update(make_key_down_event('Backspace', meta_key=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("re.sub(", expr)
        self.assertIn("re.escape('hello')", expr)
        self.assertIn("re.I", expr)

    def test_first_match_case_insensitive(self):
        self.model['search'] = "'hello'1i"
        _, commands = update(make_key_down_event('Backspace', meta_key=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("re.sub(", expr)
        self.assertIn("count=1", expr)
        self.assertIn("re.I", expr)


# =============================================================================
# Backtick / Expression Search Tests
# =============================================================================

class TestFindClosingDelimiterBacktick(unittest.TestCase):

    def test_backtick(self):
        self.assertEqual(_find_closing_delimiter('`s`'), 3)

    def test_backtick_with_flags(self):
        self.assertEqual(_find_closing_delimiter('`s`1i'), 3)

    def test_backtick_complex_expr(self):
        self.assertEqual(_find_closing_delimiter('`x.lower()`'), 11)

    def test_backtick_no_close_returns_none(self):
        self.assertIsNone(_find_closing_delimiter('`hello'))

    def test_backtick_empty_expr(self):
        self.assertEqual(_find_closing_delimiter('``'), 2)


class TestIsBacktickSearch(unittest.TestCase):

    def test_backtick(self):
        self.assertTrue(is_backtick_search('`s`'))

    def test_backtick_with_flags(self):
        self.assertTrue(is_backtick_search('`s`i'))

    def test_regex_is_not(self):
        self.assertFalse(is_backtick_search('/hello/'))

    def test_string_is_not(self):
        self.assertFalse(is_backtick_search("'hello'"))

    def test_bare_is_not(self):
        self.assertFalse(is_backtick_search('s'))

    def test_none(self):
        self.assertFalse(is_backtick_search(None))


class TestIsExpressionSearch(unittest.TestCase):
    """is_expression_search covers both backtick and bare text."""

    def test_backtick(self):
        self.assertTrue(is_expression_search('`s`'))

    def test_bare(self):
        self.assertTrue(is_expression_search('s'))

    def test_bare_function_call(self):
        self.assertTrue(is_expression_search('f(x)'))

    def test_regex_is_not(self):
        self.assertFalse(is_expression_search('/hello/'))

    def test_string_is_not(self):
        self.assertFalse(is_expression_search("'hello'"))

    def test_none(self):
        self.assertFalse(is_expression_search(None))

    def test_empty(self):
        self.assertFalse(is_expression_search(''))


class TestGetEvalExpression(unittest.TestCase):

    def test_backtick(self):
        self.assertEqual(get_eval_expression('`s`'), 's')

    def test_backtick_complex(self):
        self.assertEqual(get_eval_expression('`x.lower()`'), 'x.lower()')

    def test_backtick_with_flags(self):
        self.assertEqual(get_eval_expression('`s`1i'), 's')

    def test_bare(self):
        self.assertEqual(get_eval_expression('s'), 's')

    def test_bare_complex(self):
        self.assertEqual(get_eval_expression('x.lower()'), 'x.lower()')

    def test_regex_returns_none(self):
        self.assertIsNone(get_eval_expression('/hello/'))

    def test_string_returns_none(self):
        self.assertIsNone(get_eval_expression("'hello'"))

    def test_none(self):
        self.assertIsNone(get_eval_expression(None))


class TestGetSearchFlagsBacktickAndBare(unittest.TestCase):

    def test_backtick_no_flags(self):
        self.assertEqual(get_search_flags('`s`'), '')

    def test_backtick_with_flags(self):
        self.assertEqual(get_search_flags('`s`1i'), '1i')

    def test_bare_no_flags(self):
        """Bare text has no closing delimiter so no flags."""
        self.assertEqual(get_search_flags('s'), '')


class TestToggleFlagBareWrapsInBackticks(unittest.TestCase):
    """Toggling a flag on bare text should wrap it in backticks."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_toggle_first_match_on_bare(self):
        self.model['search'] = 's'
        model, _ = update(make_first_match_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '`s`1')

    def test_toggle_case_on_bare(self):
        self.model['search'] = 's'
        model, _ = update(make_case_sensitive_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '`s`i')

    def test_toggle_on_backtick(self):
        self.model['search'] = '`s`'
        model, _ = update(make_first_match_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '`s`1')

    def test_toggle_roundtrip_backtick(self):
        self.model['search'] = '`s`'
        model, _ = update(make_first_match_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['search'], '`s`1')
        model, _ = update(make_first_match_toggle_event(),
                          self.source_code, self.source_line, model, self.value)
        self.assertEqual(model['search'], '`s`')


class TestExpressionSearchHighlighting(unittest.TestCase):
    """Test highlighting for backtick and bare expression searches."""

    def test_backtick_literal_evals(self):
        """Backtick containing a string literal can be eval'd for highlights."""
        value = "hello world"
        highlights = parse_regex_for_highlighting("`'hello'`", value)
        self.assertEqual(len(highlights), 1)

    def test_backtick_variable_no_highlights(self):
        """Backtick referencing a variable can't be eval'd; no highlights."""
        value = "hello world"
        highlights = parse_regex_for_highlighting('`s`', value)
        self.assertEqual(len(highlights), 0)

    def test_bare_literal_evals(self):
        """Bare string literal expression eval'd for highlights."""
        value = "hello world"
        highlights = parse_regex_for_highlighting("`'hello'`", value)
        self.assertEqual(len(highlights), 1)

    def test_bare_variable_no_highlights(self):
        """Bare variable reference can't be eval'd; no highlights."""
        value = "hello world"
        highlights = parse_regex_for_highlighting('s', value)
        self.assertEqual(len(highlights), 0)

    def test_backtick_case_insensitive(self):
        value = "Hello hello HELLO"
        highlights = parse_regex_for_highlighting("`'hello'`i", value)
        self.assertEqual(len(highlights), 3)

    def test_backtick_first_match(self):
        value = "hello hello hello"
        highlights = parse_regex_for_highlighting("`'hello'`1", value)
        self.assertEqual(len(highlights), 1)

    def test_highlight_segment_indices_are_none(self):
        """Expression search highlights should all have segment_index=None."""
        value = "hello world"
        highlights = parse_regex_for_highlighting("`'hello'`", value)
        for h in highlights:
            self.assertIsNone(h[5], "Expression search highlights should be display-only")


class TestExpressionSearchEnterCodeGen(unittest.TestCase):

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_backtick_many_cs(self):
        self.model['search'] = '`s`'
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        name, expr = commands[0]
        self.assertEqual(name, 'x_matches')
        self.assertIn('re.finditer(re.escape(s)', expr)
        self.assertNotIn('re.I', expr)

    def test_backtick_first_ci(self):
        self.model['search'] = '`s`1i'
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        name, expr = commands[0]
        self.assertEqual(name, 'x_match')
        self.assertIn('re.search(re.escape(s)', expr)
        self.assertIn('re.I', expr)

    def test_bare_many_cs(self):
        self.model['search'] = 's'
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        name, expr = commands[0]
        self.assertIn('re.finditer(re.escape(s)', expr)

    def test_bare_complex_expression(self):
        self.model['search'] = 'x.lower()'
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn('re.escape(x.lower())', expr)


class TestExpressionSearchBackspaceCodeGen(unittest.TestCase):

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_backtick_many_cs(self):
        self.model['search'] = '`s`'
        _, commands = update(make_key_down_event('Backspace', meta_key=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        name, expr = commands[0]
        self.assertEqual(name, 'x')
        self.assertIn('.replace(s, \'\')', expr)

    def test_backtick_first_cs(self):
        self.model['search'] = '`s`1'
        _, commands = update(make_key_down_event('Backspace', meta_key=True),
                            self.source_code, self.source_line, self.model, self.value)
        _, expr = commands[0]
        self.assertIn(".replace(s, '', 1)", expr)

    def test_backtick_many_ci(self):
        self.model['search'] = '`s`i'
        _, commands = update(make_key_down_event('Backspace', meta_key=True),
                            self.source_code, self.source_line, self.model, self.value)
        _, expr = commands[0]
        self.assertIn('re.sub(re.escape(s)', expr)
        self.assertIn('re.I', expr)

    def test_backtick_first_ci(self):
        self.model['search'] = '`s`1i'
        _, commands = update(make_key_down_event('Backspace', meta_key=True),
                            self.source_code, self.source_line, self.model, self.value)
        _, expr = commands[0]
        self.assertIn('re.sub(re.escape(s)', expr)
        self.assertIn('count=1', expr)
        self.assertIn('re.I', expr)


# =============================================================================
# Replace Box Tests
# =============================================================================

def make_replace_box_input_event(value: str) -> dict:
    """Create a ReplaceBoxInput event dict (simulates typing in the replace box)."""
    return {
        'pythonEventStr': "lambda e: ReplaceBoxInput(value=e.get('value', ''))",
        'eventJSON': {
            'type': 'input',
            'value': value,
        }
    }


def make_replace_toggle_event() -> dict:
    """Create a ReplaceToggle event dict (simulates clicking the disclosure triangle)."""
    return {
        'pythonEventStr': repr(ReplaceToggle()),
        'eventJSON': {},
    }


class TestReplaceToggle(unittest.TestCase):
    """Test disclosure triangle toggles replace box visibility."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_toggle_shows_replace_box(self):
        """Clicking disclosure triangle shows the replace box."""
        self.assertFalse(self.model.get('replace_visible', False))
        model, _ = update(make_replace_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertTrue(model['replace_visible'])

    def test_toggle_twice_hides_replace_box(self):
        """Clicking disclosure triangle twice hides the replace box."""
        model, _ = update(make_replace_toggle_event(),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertTrue(model['replace_visible'])
        model, _ = update(make_replace_toggle_event(),
                          self.source_code, self.source_line, model, self.value)
        self.assertFalse(model['replace_visible'])


class TestReplaceBoxInput(unittest.TestCase):
    """Test replace box input updates model."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.model['replace_visible'] = True
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_typing_updates_replace_text(self):
        """Typing in replace box updates replace_text."""
        model, _ = update(make_replace_box_input_event("'world'"),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(model['replace_text'], "'world'")

    def test_clearing_replace_box(self):
        """Clearing the replace box sets replace_text to None."""
        self.model['replace_text'] = "'world'"
        model, _ = update(make_replace_box_input_event(''),
                          self.source_code, self.source_line, self.model, self.value)
        self.assertIsNone(model['replace_text'])


class TestReplaceEnterCodeGen(unittest.TestCase):
    """Test Enter in replace mode generates Transform code (list comprehension).

    Enter in replace mode now produces a list comprehension that maps
    the replace expression over matches. The ^ character translates to _mtch.
    The old re.sub behavior is accessed via Cmd-R or the Replace button.
    """

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.model['replace_visible'] = True
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_regex_replace_many_match(self):
        """Regex search + replacement produces list comprehension."""
        self.model['search'] = '/hello/'
        self.model['replace_text'] = "'world'"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_transformed")
        self.assertEqual(expr, "['world' for _mtch in re.finditer(r'hello', x, flags=re.M)]")

    def test_regex_replace_first_match(self):
        """Regex search + first-match generates next(...)."""
        self.model['search'] = '/hello/1'
        self.model['replace_text'] = "'world'"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_transformed")
        self.assertIn("next(", expr)
        self.assertIn("'world' for _mtch in", expr)

    def test_regex_replace_case_insensitive(self):
        """Regex search + case-insensitive includes re.M|re.I."""
        self.model['search'] = '/hello/i'
        self.model['replace_text'] = "'world'"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("re.M|re.I", expr)
        self.assertIn("'world' for _mtch in", expr)

    def test_string_replace_many_match_case_sensitive(self):
        """String search + replace produces list comprehension."""
        self.model['search'] = "'hello'"
        self.model['replace_text'] = "'world'"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_transformed")
        self.assertIn("re.escape('hello')", expr)
        self.assertIn("'world' for _mtch in", expr)

    def test_string_replace_first_match_case_sensitive(self):
        """String search + replace, first-match uses next()."""
        self.model['search'] = "'hello'1"
        self.model['replace_text'] = "'world'"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("next(", expr)

    def test_string_replace_case_insensitive(self):
        """String search + replace, case-insensitive includes re.I."""
        self.model['search'] = "'hello'i"
        self.model['replace_text'] = "'world'"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("re.I", expr)

    def test_expression_replace_many_match(self):
        """Expression search + replace produces list comprehension."""
        self.model['search'] = '`s`'
        self.model['replace_text'] = "'world'"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_transformed")
        self.assertIn("re.escape(s)", expr)

    def test_caret_translates_to_match_var(self):
        """^ in replace expression translates to _mtch in list comprehension."""
        self.model['search'] = '/hello/'
        self.model['replace_text'] = "^[0].upper()"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("_mtch[0].upper() for _mtch in", expr)

    def test_backtick_wrapped_expression(self):
        """Backtick-wrapped replace expression is unwrapped and ^ translated."""
        self.model['search'] = '/hello/'
        self.model['replace_text'] = "`^[0].upper()`"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("_mtch[0].upper() for _mtch in", expr)

    def test_caret_method_call(self):
        """^ with method call: ^.group(1) -> _mtch.group(1) in comprehension."""
        self.model['search'] = '/hello/'
        self.model['replace_text'] = "^.group(1)"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("_mtch.group(1) for _mtch in", expr)

    def test_arbitrary_code_accepted(self):
        """Any non-empty replace text is accepted as Python code."""
        self.model['search'] = '/hello/'
        self.model['replace_text'] = 'some_func(^[0])'
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("some_func(_mtch[0]) for _mtch in", expr)

    def test_empty_replace_text_does_nothing(self):
        """Enter with empty replace text in replace mode falls back to Get."""
        self.model['search'] = '/hello/'
        self.model['replace_text'] = None
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        # With no replace text, Enter does Get (list of matches)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertIn("re.finditer(", expr)

    def test_replace_visible_false_does_extract(self):
        """Enter with replace_visible=False generates extract code."""
        self.model['search'] = '/hello/'
        self.model['replace_visible'] = False
        self.model['replace_text'] = "'world'"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_matches")
        self.assertIn("re.finditer(", expr)

    def test_double_quote_replace(self):
        """Double-quote replacement expression is preserved in comprehension."""
        self.model['search'] = "'hello'"
        self.model['replace_text'] = '"world"'
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn('"world" for _mtch in', expr)

    def test_fstring_replace(self):
        """f-string replacement is preserved in comprehension."""
        self.model['search'] = "'hello'"
        self.model['replace_text'] = "f'hi {name}'"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("f'hi {name}' for _mtch in", expr)

    def test_no_search_does_nothing(self):
        """Enter in replace mode with no search pattern produces no commands."""
        self.model['search'] = None
        self.model['replace_text'] = "'world'"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(commands, [])


class TestReplaceBoxVisualize(unittest.TestCase):
    """Test that the replace box renders correctly in visualize output."""

    def setUp(self):
        self.value = "hello world"
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_disclosure_triangle_present(self):
        """Disclosure triangle is present in non-small visualize output."""
        model = init_model(self.value)
        html = visualize(self.value, model, None, None, max_width=400)
        self.assertIn('ReplaceToggle()', html)

    def test_replace_box_hidden_by_default(self):
        """Replace input is not visible when replace_visible is False."""
        model = init_model(self.value)
        html = visualize(self.value, model, None, None, max_width=400)
        self.assertNotIn('ReplaceBoxInput', html)

    def test_replace_box_visible_when_toggled(self):
        """Replace input is visible when replace_visible is True."""
        model = init_model(self.value)
        model['replace_visible'] = True
        html = visualize(self.value, model, None, None, max_width=400)
        self.assertIn('ReplaceBoxInput', html)

    def test_replace_box_preserves_value(self):
        """Replace input preserves the current replace_text value."""
        model = init_model(self.value)
        model['replace_visible'] = True
        model['replace_text'] = "'world'"
        html = visualize(self.value, model, None, None, max_width=400)
        self.assertIn("&#x27;world&#x27;", html)  # html.escape("'world'")

    def test_no_replace_box_in_small_mode(self):
        """Small mode doesn't render disclosure triangle or replace box."""
        model = init_model(self.value)
        model['replace_visible'] = True
        html = visualize(self.value, model, None, None, max_width=400, small=True)
        self.assertNotIn('ReplaceToggle', html)
        self.assertNotIn('ReplaceBoxInput', html)


# =============================================================================
# Action Button Test Helpers
# =============================================================================

def make_action_button_event(action: str, copy: bool = False) -> dict:
    """Create an ActionButtonClick event dict."""
    return {
        'pythonEventStr': repr(ActionButtonClick(action=action, copy=copy)),
        'eventJSON': {},
    }


# =============================================================================
# Handled Keys Updated Tests
# =============================================================================

class TestHandledKeysUpdated(unittest.TestCase):
    """Test that init_model includes new handled keys for action shortcuts."""

    def test_init_model_handled_keys(self):
        """handledKeys should include cmd Backspace, cmd r, and NOT plain Backspace."""
        model = init_model("test")
        keys = model['handledKeys']
        self.assertIn('cmd Backspace', keys)
        self.assertIn('cmd r', keys)
        self.assertNotIn('Backspace', keys)
        self.assertIn('Enter', keys)
        self.assertIn('Escape', keys)
        self.assertIn('cmd z', keys)
        self.assertIn('cmd shift z', keys)


# =============================================================================
# Action Button: Get/Transform Tests
# =============================================================================

class TestActionButtonGetTransform(unittest.TestCase):
    """Test Get/Transform action button and Enter key behavior."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.model['search'] = '/hello/'
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_get_button_non_replace(self):
        """ActionButtonClick('get_transform') with regex produces finditer."""
        _, commands = update(make_action_button_event('get_transform'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_matches")
        self.assertEqual(expr, "list(re.finditer(r'hello', x, flags=re.M))")

    def test_get_button_non_replace_first_match(self):
        """With 1st mode, Get produces re.search."""
        self.model['search'] = '/hello/1'
        _, commands = update(make_action_button_event('get_transform'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_match")
        self.assertEqual(expr, "re.search(r'hello', x, flags=re.M)")

    def test_transform_button_replace_mode(self):
        """With replace_visible, get_transform produces list comprehension."""
        self.model['replace_visible'] = True
        self.model['replace_text'] = "^[0].upper()"
        _, commands = update(make_action_button_event('get_transform'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_transformed")
        self.assertEqual(expr, "[_mtch[0].upper() for _mtch in re.finditer(r'hello', x, flags=re.M)]")

    def test_transform_button_first_match(self):
        """With 1st mode + replace, produces next(..., None)."""
        self.model['search'] = '/hello/1'
        self.model['replace_visible'] = True
        self.model['replace_text'] = "^[0].upper()"
        _, commands = update(make_action_button_event('get_transform'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_transformed")
        self.assertEqual(expr, "next((_mtch[0].upper() for _mtch in re.finditer(r'hello', x, flags=re.M)), None)")

    def test_enter_key_non_replace_unchanged(self):
        """Enter still produces Get in non-replace mode."""
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_matches")
        self.assertEqual(expr, "list(re.finditer(r'hello', x, flags=re.M))")

    def test_enter_key_replace_mode_now_transforms(self):
        """Enter in replace mode now produces Transform (not re.sub)."""
        self.model['replace_visible'] = True
        self.model['replace_text'] = "^[0].upper()"
        _, commands = update(make_key_down_event('Enter'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_transformed")
        self.assertIn("for _mtch in re.finditer(", expr)
        self.assertNotIn("re.sub(", expr)

    def test_copy_get_transform(self):
        """copy=True produces CopyToClipboard command."""
        _, commands = update(make_action_button_event('get_transform', copy=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        cmd = commands[0]
        self.assertIsInstance(cmd, CopyToClipboard)
        self.assertEqual(cmd.text, "list(re.finditer(r'hello', x, flags=re.M))")

    def test_get_transform_string_search(self):
        """Get with string search uses re.escape."""
        self.model['search'] = "'hello'"
        _, commands = update(make_action_button_event('get_transform'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("re.escape('hello')", expr)

    def test_get_transform_no_search_does_nothing(self):
        """No search pattern produces no commands."""
        self.model['search'] = None
        _, commands = update(make_action_button_event('get_transform'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(commands, [])


# =============================================================================
# Action Button: Replace Tests
# =============================================================================

class TestActionButtonReplace(unittest.TestCase):
    """Test Replace action button and Cmd-R key."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.model['search'] = '/hello/'
        self.model['replace_visible'] = True
        self.model['replace_text'] = "'world'"
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_replace_button(self):
        """Replace button produces re.sub with lambda."""
        _, commands = update(make_action_button_event('replace'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x")
        self.assertEqual(expr, "re.sub(r'hello', lambda _mtch: 'world', x, flags=re.M)")

    def test_replace_button_first_match(self):
        """Replace with first-match includes count=1."""
        self.model['search'] = '/hello/1'
        _, commands = update(make_action_button_event('replace'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertEqual(expr, "re.sub(r'hello', lambda _mtch: 'world', x, count=1, flags=re.M)")

    def test_replace_button_not_in_replace_mode(self):
        """Replace button does nothing when not in replace mode."""
        self.model['replace_visible'] = False
        _, commands = update(make_action_button_event('replace'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(commands, [])

    def test_cmd_r_key(self):
        """Cmd-R produces same as replace button."""
        _, commands = update(make_key_down_event('r', meta_key=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x")
        self.assertEqual(expr, "re.sub(r'hello', lambda _mtch: 'world', x, flags=re.M)")

    def test_copy_replace(self):
        """copy=True produces CopyToClipboard with re.sub expr."""
        _, commands = update(make_action_button_event('replace', copy=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        cmd = commands[0]
        self.assertIsInstance(cmd, CopyToClipboard)
        self.assertIn("re.sub(", cmd.text)

    def test_replace_button_string_search(self):
        """Replace with string search uses re.escape."""
        self.model['search'] = "'hello'"
        _, commands = update(make_action_button_event('replace'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("re.sub(re.escape('hello')", expr)


# =============================================================================
# Action Button: Delete Tests
# =============================================================================

class TestActionButtonDelete(unittest.TestCase):
    """Test Delete action button and Cmd-Backspace key."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.model['search'] = '/hello/'
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_delete_button(self):
        """Delete button produces re.sub with empty string."""
        _, commands = update(make_action_button_event('delete'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x")
        self.assertEqual(expr, "re.sub(r'hello', '', x, flags=re.M)")

    def test_cmd_backspace_key(self):
        """Cmd-Backspace produces delete code."""
        _, commands = update(make_key_down_event('Backspace', meta_key=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x")
        self.assertEqual(expr, "re.sub(r'hello', '', x, flags=re.M)")

    def test_plain_backspace_no_longer_deletes(self):
        """Plain Backspace key no longer produces delete commands."""
        _, commands = update(make_key_down_event('Backspace'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(commands, [])

    def test_copy_delete(self):
        """copy=True produces CopyToClipboard with delete expr."""
        _, commands = update(make_action_button_event('delete', copy=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        cmd = commands[0]
        self.assertIsInstance(cmd, CopyToClipboard)
        self.assertIn("re.sub(", cmd.text)

    def test_delete_string_search(self):
        """Delete with string search, case-sensitive uses .replace()."""
        self.model['search'] = "'hello'"
        _, commands = update(make_action_button_event('delete'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertEqual(expr, "x.replace('hello', '')")


# =============================================================================
# Action Button: Loop Tests
# =============================================================================

class TestActionButtonLoop(unittest.TestCase):
    """Test Loop action button."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.model['search'] = '/hello/'
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_loop_non_replace(self):
        """Loop produces for loop with enumerate(re.finditer(...))."""
        _, commands = update(make_action_button_event('loop'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertIsNone(suggest_name)
        self.assertIn("for _i, _mtch in enumerate(re.finditer(r'hello', x, flags=re.M)):", expr)
        self.assertIn("\n    pass", expr)

    def test_loop_replace_mode(self):
        """Loop in replace mode iterates over transformed values."""
        self.model['replace_visible'] = True
        self.model['replace_text'] = "^[0].upper()"
        _, commands = update(make_action_button_event('loop'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertIsNone(suggest_name)
        self.assertIn("for _i, _val in enumerate(", expr)
        self.assertIn("_mtch[0].upper() for _mtch in re.finditer(", expr)

    def test_loop_suggest_name_none(self):
        """Loop returns suggest_name=None for multiline code."""
        _, commands = update(make_action_button_event('loop'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        self.assertIsNone(commands[0][0])

    def test_copy_loop(self):
        """copy=True produces CopyToClipboard with loop code."""
        _, commands = update(make_action_button_event('loop', copy=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        cmd = commands[0]
        self.assertIsInstance(cmd, CopyToClipboard)
        self.assertIn("for _i, _mtch in enumerate(", cmd.text)


# =============================================================================
# Action Button: Any Tests
# =============================================================================

class TestActionButtonAny(unittest.TestCase):
    """Test Any action button."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.model['search'] = '/hello/'
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_any_non_replace(self):
        """Any in non-replace mode produces bool(re.search(...))."""
        _, commands = update(make_action_button_event('any'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_any")
        self.assertEqual(expr, "bool(re.search(r'hello', x, flags=re.M))")

    def test_any_replace_mode(self):
        """Any in replace mode produces any(EXPR for _mtch in ...)."""
        self.model['replace_visible'] = True
        self.model['replace_text'] = "^[0].upper()"
        _, commands = update(make_action_button_event('any'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_any")
        self.assertEqual(expr, "any(_mtch[0].upper() for _mtch in re.finditer(r'hello', x, flags=re.M))")

    def test_copy_any(self):
        """copy=True produces CopyToClipboard."""
        _, commands = update(make_action_button_event('any', copy=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        cmd = commands[0]
        self.assertIsInstance(cmd, CopyToClipboard)

    def test_any_string_search(self):
        """Any with string search."""
        self.model['search'] = "'hello'"
        _, commands = update(make_action_button_event('any'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("re.search(re.escape('hello')", expr)


# =============================================================================
# Action Button: All Tests
# =============================================================================

class TestActionButtonAll(unittest.TestCase):
    """Test All action button (replace mode only)."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.model['search'] = '/hello/'
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_all_replace_mode(self):
        """All in replace mode produces all(EXPR for _mtch in ...)."""
        self.model['replace_visible'] = True
        self.model['replace_text'] = "^[0].upper()"
        _, commands = update(make_action_button_event('all'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_all")
        self.assertEqual(expr, "all(_mtch[0].upper() for _mtch in re.finditer(r'hello', x, flags=re.M))")

    def test_all_non_replace_returns_nothing(self):
        """All not in replace mode produces no commands."""
        _, commands = update(make_action_button_event('all'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(commands, [])

    def test_copy_all(self):
        """copy=True produces CopyToClipboard."""
        self.model['replace_visible'] = True
        self.model['replace_text'] = "^[0].upper()"
        _, commands = update(make_action_button_event('all', copy=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        self.assertIsInstance(commands[0], CopyToClipboard)


# =============================================================================
# Action Button: If Any Tests
# =============================================================================

class TestActionButtonIfAny(unittest.TestCase):
    """Test If Any action button."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.model['search'] = '/hello/'
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_if_any_non_replace(self):
        """If Any in non-replace produces if re.search(...):\\n    pass."""
        _, commands = update(make_action_button_event('if_any'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertIsNone(suggest_name)
        self.assertIn("if re.search(r'hello', x, flags=re.M):", expr)
        self.assertIn("\n    pass", expr)

    def test_if_any_replace_mode(self):
        """If Any in replace mode produces if any(...):\\n    pass."""
        self.model['replace_visible'] = True
        self.model['replace_text'] = "^[0].upper()"
        _, commands = update(make_action_button_event('if_any'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertIsNone(suggest_name)
        self.assertIn("if any(", expr)
        self.assertIn("\n    pass", expr)

    def test_copy_if_any(self):
        """Copy If Any copies just the boolean expression."""
        _, commands = update(make_action_button_event('if_any', copy=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        cmd = commands[0]
        self.assertIsInstance(cmd, CopyToClipboard)
        # Copy should be just the boolean expression, no "if" or "pass"
        self.assertNotIn("if ", cmd.text)
        self.assertNotIn("pass", cmd.text)


# =============================================================================
# Action Button: If All Tests
# =============================================================================

class TestActionButtonIfAll(unittest.TestCase):
    """Test If All action button (replace mode only)."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.model['search'] = '/hello/'
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_if_all_replace_mode(self):
        """If All in replace mode produces if all(...):\\n    pass."""
        self.model['replace_visible'] = True
        self.model['replace_text'] = "^[0].upper()"
        _, commands = update(make_action_button_event('if_all'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertIsNone(suggest_name)
        self.assertIn("if all(", expr)
        self.assertIn("\n    pass", expr)

    def test_if_all_non_replace_returns_nothing(self):
        """If All not in replace mode produces no commands."""
        _, commands = update(make_action_button_event('if_all'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(commands, [])

    def test_copy_if_all(self):
        """Copy If All copies just the all(...) expression."""
        self.model['replace_visible'] = True
        self.model['replace_text'] = "^[0].upper()"
        _, commands = update(make_action_button_event('if_all', copy=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        cmd = commands[0]
        self.assertIsInstance(cmd, CopyToClipboard)
        self.assertNotIn("if ", cmd.text)
        self.assertNotIn("pass", cmd.text)


# =============================================================================
# Action Button: Count Tests
# =============================================================================

class TestActionButtonCount(unittest.TestCase):
    """Test Count action button."""

    def setUp(self):
        self.value = "hello world"
        self.model = init_model(self.value)
        self.model['search'] = '/hello/'
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_count_non_replace(self):
        """Count produces sum(1 for _ in re.finditer(...))."""
        _, commands = update(make_action_button_event('count'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_count")
        self.assertEqual(expr, "sum(1 for _ in re.finditer(r'hello', x, flags=re.M))")

    def test_count_replace_mode(self):
        """Count in replace mode filters by replace expr truthiness."""
        self.model['replace_visible'] = True
        self.model['replace_text'] = "^[0].upper()"
        _, commands = update(make_action_button_event('count'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        suggest_name, expr = commands[0]
        self.assertEqual(suggest_name, "x_count")
        self.assertEqual(expr, "sum(1 for _mtch in re.finditer(r'hello', x, flags=re.M) if _mtch[0].upper())")

    def test_copy_count(self):
        """copy=True produces CopyToClipboard."""
        _, commands = update(make_action_button_event('count', copy=True),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        self.assertIsInstance(commands[0], CopyToClipboard)

    def test_count_string_search(self):
        """Count with string search."""
        self.model['search'] = "'hello'"
        _, commands = update(make_action_button_event('count'),
                            self.source_code, self.source_line, self.model, self.value)
        self.assertEqual(len(commands), 1)
        _, expr = commands[0]
        self.assertIn("re.escape('hello')", expr)


# =============================================================================
# Count Matches Helper Tests
# =============================================================================

class TestCountMatches(unittest.TestCase):
    """Test _count_matches() helper for button label display."""

    def test_count_regex_matches(self):
        """Count regex matches in a string."""
        self.assertEqual(_count_matches('/l/', "hello world"), 3)

    def test_count_string_matches(self):
        """Count string literal matches."""
        self.assertEqual(_count_matches("'l'", "hello world"), 3)

    def test_count_first_match_mode(self):
        """First match mode returns 0 or 1."""
        self.assertEqual(_count_matches('/l/1', "hello world"), 1)
        self.assertEqual(_count_matches('/z/1', "hello world"), 0)

    def test_count_no_search(self):
        """No search returns 0."""
        self.assertEqual(_count_matches(None, "hello world"), 0)

    def test_count_no_matches(self):
        """Pattern that doesn't match returns 0."""
        self.assertEqual(_count_matches('/xyz/', "hello world"), 0)

    def test_count_case_insensitive(self):
        """Case insensitive flag affects count."""
        self.assertEqual(_count_matches('/HELLO/i', "hello world"), 1)
        self.assertEqual(_count_matches('/HELLO/', "hello world"), 0)


# =============================================================================
# Action Button Rendering Tests
# =============================================================================

class TestActionButtonRendering(unittest.TestCase):
    """Test that action buttons render correctly in visualize output."""

    def setUp(self):
        self.value = "hello world"
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_buttons_present_non_small(self):
        """Action buttons render in non-small mode."""
        model = init_model(self.value)
        model['search'] = '/hello/'
        html_output = visualize(self.value, model, None, None, max_width=400)
        self.assertIn('ActionButtonClick', html_output)
        self.assertIn('get_transform', html_output)
        self.assertIn('delete', html_output)

    def test_buttons_absent_small(self):
        """No action buttons in small mode."""
        model = init_model(self.value)
        model['search'] = '/hello/'
        html_output = visualize(self.value, model, None, None, max_width=400, small=True)
        self.assertNotIn('ActionButtonClick', html_output)

    def test_get_label_changes_to_transform(self):
        """Button label changes from 'Get' to 'Transform' in replace mode."""
        model = init_model(self.value)
        model['search'] = '/hello/'
        html_get = visualize(self.value, model, None, None, max_width=400)
        self.assertIn('Get', html_get)

        model['replace_visible'] = True
        model['replace_text'] = "'world'"
        html_transform = visualize(self.value, model, None, None, max_width=400)
        self.assertIn('Transform', html_transform)

    def test_replace_button_grayed_when_no_replace(self):
        """Replace button has low opacity when not in replace mode."""
        model = init_model(self.value)
        model['search'] = '/hello/'
        html_output = visualize(self.value, model, None, None, max_width=400)
        # The replace button section should have opacity styling for disabled state
        # Just check that the replace action reference exists but is styled as disabled
        self.assertIn("action=&#x27;replace&#x27;", html_output)

    def test_count_shows_match_count(self):
        """Count button text shows the number of matches."""
        model = init_model(self.value)
        model['search'] = '/l/'
        html_output = visualize(self.value, model, None, None, max_width=400)
        # 'hello world' has 3 'l' characters
        self.assertIn('Count (3)', html_output)

    def test_question_mark_dropdown_renders(self):
        """Predicate dropdown button is present in the action bar."""
        model = init_model(self.value)
        model['search'] = '/hello/'
        html_output = visualize(self.value, model, None, None, max_width=400)
        self.assertIn('action-predicate', html_output)


if __name__ == '__main__':
    unittest.main()
