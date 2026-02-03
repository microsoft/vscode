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
    NewCode,
    compute_internal_length,
    extract_by_internal_indices,
    get_last_segment_end_internal_idx,
    get_first_segment_start_internal_idx,
    parse_regex_for_highlighting,
    find_fuzzy_segment_at_index,
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


def make_mouse_move_event(index: int, buttons: int = 1) -> dict:
    """Create a MouseMove event dict.

    Args:
        index: The character index the mouse moved to
        buttons: 1 if button pressed, 0 if released
    """
    return {
        'pythonEventStr': repr(MouseMove(index)),
        'eventJSON': {
            'buttons': buttons,
        }
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
        """init_model() returns a dict with all expected keys and default values."""
        model = init_model()

        self.assertIsNone(model['selectionRegex'])
        self.assertIsNone(model['anchorIdx'])
        self.assertIsNone(model['anchorType'])
        self.assertIsNone(model['cursorIdx'])
        self.assertFalse(model['dragging'])
        self.assertIsNone(model['extendDirection'])
        self.assertIsNone(model['insertAfterSegment'])
        self.assertIsNone(model['stringValue'])
        self.assertEqual(model['undoHistory'], [])
        self.assertEqual(model['redoHistory'], [])
        self.assertEqual(model['handledKeys'], ["Escape", "Enter", "cmd z", "cmd shift z"])

    def test_null_event_returns_unchanged_model(self):
        """Passing None event returns model unchanged with no commands."""
        model = init_model()
        model['stringValue'] = "test"

        new_model, commands = update(None, "x = 'test'", 1, model)

        self.assertEqual(new_model, model)
        self.assertEqual(commands, [])

    def test_empty_event_returns_unchanged_model(self):
        """Passing empty event dict returns model unchanged."""
        model = init_model()
        model['stringValue'] = "test"

        new_model, commands = update({}, "x = 'test'", 1, model)

        self.assertEqual(new_model, model)
        self.assertEqual(commands, [])

    def test_event_with_empty_pythonEventStr_returns_unchanged(self):
        """Event with empty pythonEventStr returns model unchanged."""
        model = init_model()
        model['stringValue'] = "test"

        event = {'pythonEventStr': '', 'eventJSON': {}}
        new_model, commands = update(event, "x = 'test'", 1, model)

        self.assertEqual(new_model, model)
        self.assertEqual(commands, [])

    def test_none_model_gets_initialized(self):
        """Passing None model initializes a fresh model."""
        event = make_mouse_down_event(5, top_half=True)

        new_model, commands = update(event, "x = 'hello world'", 1, None)

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
        self.model = init_model()
        self.model['stringValue'] = "hello world"
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_mouse_down_top_half_starts_literal_selection(self):
        """MouseDown in top half sets up literal drag state."""
        event = make_mouse_down_event(5, top_half=True)

        model, commands = update(event, self.source_code, self.source_line, self.model)

        self.assertEqual(model['anchorIdx'], 5)
        self.assertEqual(model['cursorIdx'], 5)
        self.assertEqual(model['anchorType'], 'literal')
        self.assertTrue(model['dragging'])
        self.assertIsNone(model['selectionRegex'])  # Not finalized yet
        self.assertEqual(commands, [])

    def test_mouse_move_updates_cursor_for_literal(self):
        """MouseMove updates cursorIdx during literal drag."""
        model, _ = update(make_mouse_down_event(5, top_half=True),
                         self.source_code, self.source_line, self.model)

        model, _ = update(make_mouse_move_event(8),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['anchorIdx'], 5)
        self.assertEqual(model['cursorIdx'], 8)
        self.assertTrue(model['dragging'])
        self.assertIsNone(model['selectionRegex'])  # Still not finalized

    def test_mouse_up_finalizes_hello_selection(self):
        """MouseUp finalizes 'hello' selection (indices 2-6) into /(hello)/."""
        # Select indices 2-6: h(2), e(3), l(4), l(5), o(6)
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model)
        model, commands = update(make_mouse_up_event(6),
                                self.source_code, self.source_line, model)

        self.assertFalse(model['dragging'])
        self.assertIsNone(model['anchorIdx'])
        self.assertIsNone(model['cursorIdx'])
        self.assertEqual(model['selectionRegex'], '/(hello)/')
        self.assertEqual(model['undoHistory'], [None])
        self.assertEqual(commands, [])

    def test_single_char_selection(self):
        """Click and release on same index selects single char 'h' -> /(h)/."""
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_up_event(2),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(h)/')

    def test_world_selection(self):
        """Select 'world' (indices 8-12) -> /(world)/."""
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_move_event(12),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(12),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(world)/')

    def test_space_selection(self):
        """Select just the space at index 7 -> /(\\ )/."""
        model, _ = update(make_mouse_down_event(7, top_half=True),
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_up_event(7),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(\\ )/')


# =============================================================================
# Single Fuzzy Selection Tests
# =============================================================================

class TestSingleFuzzySelection(unittest.TestCase):
    """Test single fuzzy selection: MouseDown (bottom half) -> MouseUp."""

    def setUp(self):
        self.model = init_model()
        self.model['stringValue'] = "hello world"
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_mouse_down_bottom_half_starts_fuzzy_selection(self):
        """MouseDown in bottom half starts a fuzzy selection."""
        event = make_mouse_down_event(5, top_half=False)

        model, commands = update(event, self.source_code, self.source_line, self.model)

        self.assertEqual(model['anchorIdx'], 5)
        self.assertEqual(model['anchorType'], 'fuzzy')
        self.assertTrue(model['dragging'])

    def test_mouse_move_does_not_update_cursor_for_fuzzy(self):
        """MouseMove does NOT update cursorIdx for fuzzy selection."""
        model, _ = update(make_mouse_down_event(5, top_half=False),
                         self.source_code, self.source_line, self.model)
        self.assertEqual(model['cursorIdx'], 5)

        model, _ = update(make_mouse_move_event(10),
                         self.source_code, self.source_line, model)

        # Cursor unchanged for fuzzy
        self.assertEqual(model['cursorIdx'], 5)

    def test_mouse_up_finalizes_fuzzy_segment(self):
        """MouseUp finalizes fuzzy segment as /(.*)/."""
        model, _ = update(make_mouse_down_event(5, top_half=False),
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_up_event(5),
                         self.source_code, self.source_line, model)

        self.assertFalse(model['dragging'])
        self.assertEqual(model['selectionRegex'], '/(.*)/')
        self.assertEqual(model['undoHistory'], [None])


# =============================================================================
# Chained Selections (Extend Right) Tests
# =============================================================================

class TestChainedSelectionsExtendRight(unittest.TestCase):
    """Test chaining selections by extending from the right end."""

    def setUp(self):
        self.model = init_model()
        self.model['stringValue'] = "hello world"
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def test_extend_hello_with_fuzzy(self):
        """Extend 'hello' selection with fuzzy -> /(hello)(.*)/."""
        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)/')

        # Get end index for extending
        end_idx = get_last_segment_end_internal_idx(model['selectionRegex'], model['stringValue'])
        self.assertEqual(end_idx, 7)

        # Extend with fuzzy at end
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)(.*)/')
        self.assertEqual(model['undoHistory'], [None, '/(hello)/'])

    def test_extend_hello_with_space_literal(self):
        """Extend 'hello' with space literal -> /(hello)(\\ )/."""
        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model)

        end_idx = get_last_segment_end_internal_idx(model['selectionRegex'], model['stringValue'])

        # Extend with single space (click and release at same position)
        model, _ = update(make_mouse_down_event(end_idx, top_half=True),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)(\\ )/')

    def test_chain_hello_fuzzy_world(self):
        """Chain: hello -> fuzzy -> world gives /(hello)(.*)(world)/."""
        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)/')

        # Extend with fuzzy at end of hello (index 7)
        end_idx = get_last_segment_end_internal_idx(model['selectionRegex'], model['stringValue'])
        self.assertEqual(end_idx, 7)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)(.*)/')

        # The fuzzy (.*) matches " world$\Z" (indices 7-15)
        # To add "world", click INSIDE the fuzzy region at index 8 (start of 'w')
        # and drag to index 12 (end of 'world')
        # Augmented indices: 7=' ', 8=w, 9=o, 10=r, 11=l, 12=d, 13=$, 14=\Z
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_move_event(12),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(12),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)(.*)(world)/')


class TestChainThreeSegmentsWithConstrainedFuzzy(unittest.TestCase):
    """Test chaining with fuzzy that doesn't consume everything."""

    def setUp(self):
        # Use a multiline string where (.*) stops at newline
        self.model = init_model()
        self.model['stringValue'] = "hello\nworld"
        self.source_code = "x = 'hello\\nworld'"
        self.source_line = 1
        # Augmented: 0=\A, 1=^, 2=h, 3=e, 4=l, 5=l, 6=o, 7=$, 8=\n, 9=^, 10=w, 11=o, 12=r, 13=l, 14=d, 15=$, 16=\Z

    def test_chain_hello_fuzzy_world_with_newline(self):
        """Chain hello -> fuzzy (stops at $) -> $\\n^ -> world."""
        # Select "hello"
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)/')

        # Extend with fuzzy (will stop at $ because .* doesn't match newline by default)
        end_idx = get_last_segment_end_internal_idx(model['selectionRegex'], model['stringValue'])
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)(.*)/')

        # The (.*) after "hello" matches the $ anchor (index 7)
        # So fuzzy spans 7-8, end_idx is 8
        end_idx = get_last_segment_end_internal_idx(model['selectionRegex'], model['stringValue'])
        self.assertEqual(end_idx, 8)

        # Extend with \n at index 8
        model, _ = update(make_mouse_down_event(end_idx, top_half=True),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)(.*)(\\n)/')


# =============================================================================
# Extend Left (Prepend) Tests
# =============================================================================

class TestExtendLeft(unittest.TestCase):
    """Test extending selection from the left (prepending segments)."""

    def setUp(self):
        self.model = init_model()
        self.model['stringValue'] = "hello world"
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
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_move_event(12),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(12),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(world)/')

        # Get start index - this is 8 (the 'w')
        start_idx = get_first_segment_start_internal_idx(model['selectionRegex'], model['stringValue'])
        self.assertEqual(start_idx, 8)

        # Click on index 7 (the space immediately to the left) with fuzzy (bottom half)
        # This should extend left, NOT reset the selection
        model, _ = update(make_mouse_down_event(7, top_half=False),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(7),
                         self.source_code, self.source_line, model)

        # Should prepend fuzzy: /(.*)(world)/
        self.assertEqual(model['selectionRegex'], '/(.*)(world)/')
        self.assertEqual(model['undoHistory'], [None, '/(world)/'])

    def test_prepend_fuzzy_to_world(self):
        """Select 'world', then prepend fuzzy -> /(.*)(world)/."""
        # Select "world" (indices 8-12)
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_move_event(12),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(12),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(world)/')

        # Get start index for prepending
        start_idx = get_first_segment_start_internal_idx(model['selectionRegex'], model['stringValue'])
        self.assertEqual(start_idx, 8)

        # Prepend with fuzzy by clicking the char immediately to the left (start_idx - 1 = 7)
        model, _ = update(make_mouse_down_event(start_idx - 1, top_half=False),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(start_idx - 1),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(.*)(world)/')
        self.assertEqual(model['undoHistory'], [None, '/(world)/'])

    def test_prepend_literal_to_world(self):
        """Select 'world', prepend by dragging left selects 'o ' -> /(o\\ )(world)/."""
        # Select "world"
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_move_event(12),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(12),
                         self.source_code, self.source_line, model)

        start_idx = get_first_segment_start_internal_idx(model['selectionRegex'], model['stringValue'])
        self.assertEqual(start_idx, 8)

        # Prepend by clicking at the char immediately to the left (start_idx - 1 = 7)
        # and dragging left to index 6. This selects indices 6, 7 = 'o', ' '
        model, _ = update(make_mouse_down_event(start_idx - 1, top_half=True),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(o\\ )(world)/')


# =============================================================================
# Click Inside Fuzzy Segment Tests
# =============================================================================

class TestClickInsideFuzzy(unittest.TestCase):
    """Test clicking inside a fuzzy segment to split/constrain it."""

    def setUp(self):
        self.model = init_model()
        self.model['stringValue'] = "hello world goodbye"
        self.source_code = "x = 'hello world goodbye'"
        self.source_line = 1

    def test_click_inside_fuzzy_starts_new_segment(self):
        """Clicking inside a realized fuzzy region starts a new drag."""
        # Create hello + (.*) pattern
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model)

        end_idx = get_last_segment_end_internal_idx(model['selectionRegex'], model['stringValue'])
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)(.*)/')

        # Find where the fuzzy segment spans
        highlights = parse_regex_for_highlighting(model['selectionRegex'], model['stringValue'])
        fuzzy_segment = None
        for start, end, seg_type in highlights:
            if seg_type == 'fuzzy':
                fuzzy_segment = (start, end)
                break

        self.assertIsNotNone(fuzzy_segment)
        fuzzy_start, fuzzy_end = fuzzy_segment

        # Click inside the fuzzy region
        click_idx = fuzzy_start + 3
        fuzzy_info = find_fuzzy_segment_at_index(model['selectionRegex'], model['stringValue'], click_idx)
        self.assertIsNotNone(fuzzy_info)

        # Click inside fuzzy to start new segment
        model, _ = update(make_mouse_down_event(click_idx, top_half=True),
                         self.source_code, self.source_line, model)

        # Should start a new drag, keeping existing regex until finalized
        self.assertTrue(model['dragging'])
        self.assertEqual(model['anchorIdx'], click_idx)
        self.assertEqual(model['selectionRegex'], '/(hello)(.*)/')  # Still the old one

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
                         self.source_code, self.source_line, self.model)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)/')

        # Step 2: Extend with fuzzy at end of hello
        end_idx = get_last_segment_end_internal_idx(model['selectionRegex'], model['stringValue'])
        self.assertEqual(end_idx, 7)
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)(.*)/')

        # Step 3: Click inside the fuzzy on "world" (indices 8-12) = (2)
        # This is a click-drag to select "world"
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_move_event(12),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(12),
                         self.source_code, self.source_line, model)

        # Expected: (1)(.*)(2) = /(hello)(.*)(world)/
        # Bug would produce: (.*)(2)(1) = /(.*)(world)(hello)/ - WRONG!
        self.assertEqual(model['selectionRegex'], '/(hello)(.*)(world)/')

        # Verify segment order explicitly
        highlights = parse_regex_for_highlighting(model['selectionRegex'], model['stringValue'])
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

        model = init_model()
        model['stringValue'] = "hello world"
        source_code = "x = 'hello world'"

        # Step 1: Select "world" (indices 8-12)
        model, _ = update(make_mouse_down_event(8, top_half=True),
                         source_code, 1, model)
        model, _ = update(make_mouse_move_event(12),
                         source_code, 1, model)
        model, _ = update(make_mouse_up_event(12),
                         source_code, 1, model)

        self.assertEqual(model['selectionRegex'], '/(world)/')

        # Step 2: Prepend with fuzzy (click at first_start - 1 = 7)
        first_start = get_first_segment_start_internal_idx(model['selectionRegex'], model['stringValue'])
        self.assertEqual(first_start, 8)
        model, _ = update(make_mouse_down_event(first_start - 1, top_half=False),
                         source_code, 1, model)
        model, _ = update(make_mouse_up_event(first_start - 1),
                         source_code, 1, model)

        self.assertEqual(model['selectionRegex'], '/(.*)(world)/')

        # Verify the fuzzy segment spans indices 0-8 (matches "^hello ")
        highlights = parse_regex_for_highlighting(model['selectionRegex'], model['stringValue'])
        fuzzy_segment = None
        for start, end, seg_type in highlights:
            if seg_type == 'fuzzy':
                fuzzy_segment = (start, end, seg_type)
                break
        self.assertIsNotNone(fuzzy_segment)
        fuzzy_start, fuzzy_end, _ = fuzzy_segment

        # Step 3: Click inside the leading fuzzy on "ello" (indices 3-6)
        # This is inside the fuzzy region
        self.assertTrue(fuzzy_start <= 3 < fuzzy_end)

        model, _ = update(make_mouse_down_event(3, top_half=True),
                         source_code, 1, model)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model)

        # The literal "ello" should be inserted BEFORE the fuzzy to maintain text order:
        # Text order: ello ... (space) ... world
        # Regex: (ello)(.*)(world) - where (.*) matches the space between
        self.assertEqual(model['selectionRegex'], '/(ello)(.*)(world)/')

    def test_anchor_leading_fuzzy_abc_scenario(self):
        """
        BUG TEST: Exact reproduction of user's bug report.

        String: 'ABC'
        Click (1): literal C -> /(C)/
        Click (2): fuzzy B (extend left) -> /(.*)(C)/
        Click (3): literal A (inside fuzzy) -> Expected: /(A)(.*)(C)/

        Bug was producing: /(.*)(A)(C)/ - wrong order!
        """
        model = init_model()
        model['stringValue'] = 'ABC'
        source_code = "x = 'ABC'"

        # Augmented: 0=\A, 1=^, 2=A, 3=B, 4=C, 5=$, 6=\Z

        # Click (1): literal C (index 4)
        model, _ = update(make_mouse_down_event(4, top_half=True),
                         source_code, 1, model)
        model, _ = update(make_mouse_up_event(4),
                         source_code, 1, model)
        self.assertEqual(model['selectionRegex'], '/(C)/')

        # Click (2): fuzzy B (extend left from C)
        first_start = get_first_segment_start_internal_idx(model['selectionRegex'], model['stringValue'])
        self.assertEqual(first_start, 4)
        model, _ = update(make_mouse_down_event(first_start - 1, top_half=False),
                         source_code, 1, model)
        model, _ = update(make_mouse_up_event(first_start - 1),
                         source_code, 1, model)
        self.assertEqual(model['selectionRegex'], '/(.*)(C)/')

        # Click (3): literal A (inside fuzzy at index 2)
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model)
        model, _ = update(make_mouse_up_event(2),
                         source_code, 1, model)

        # Expected: (A)(.*)(C) - A first, then fuzzy for B, then C
        # Bug was: (.*)(A)(C) - wrong order
        self.assertEqual(model['selectionRegex'], '/(A)(.*)(C)/')


# =============================================================================
# Keyboard Event Tests
# =============================================================================

class TestKeyboardEvents(unittest.TestCase):
    """Test keyboard events: Escape, Enter, Cmd-Z, Cmd-Shift-Z."""

    def setUp(self):
        self.model = init_model()
        self.model['stringValue'] = "hello world"
        self.source_code = "x = 'hello world'"
        self.source_line = 1

    def _create_hello_selection(self, model):
        """Helper to create /(hello)/ selection."""
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_move_event(6),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(6),
                         self.source_code, self.source_line, model)
        return model

    def test_escape_clears_selection(self):
        """Escape key clears the selection and saves to undo."""
        model = self._create_hello_selection(self.model)
        self.assertEqual(model['selectionRegex'], '/(hello)/')

        model, commands = update(make_key_down_event('Escape'),
                                self.source_code, self.source_line, model)

        self.assertIsNone(model['selectionRegex'])
        self.assertIsNone(model['anchorIdx'])
        self.assertIsNone(model['cursorIdx'])
        self.assertFalse(model['dragging'])
        self.assertEqual(model['undoHistory'], [None, '/(hello)/'])
        self.assertEqual(commands, [])

    def test_enter_generates_new_code_command(self):
        """Enter key generates NewCode command with regex expression."""
        model = self._create_hello_selection(self.model)

        model, commands = update(make_key_down_event('Enter'),
                                self.source_code, self.source_line, model)

        self.assertEqual(len(commands), 1)
        self.assertIsInstance(commands[0], NewCode)
        # Check generated code
        expected_code = "import re\nx = 'hello world'\nx_match = re.search(r'hello', x, re.M).group(0)"
        self.assertEqual(commands[0].code, expected_code)

    def test_enter_without_selection_does_nothing(self):
        """Enter without selection produces no commands."""
        model, commands = update(make_key_down_event('Enter'),
                                self.source_code, self.source_line, self.model)

        self.assertEqual(commands, [])

    def test_cmd_z_undoes_selection(self):
        """Cmd-Z undoes the last selection."""
        model = self._create_hello_selection(self.model)

        # Add fuzzy segment
        end_idx = get_last_segment_end_internal_idx(model['selectionRegex'], model['stringValue'])
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)(.*)/')
        self.assertEqual(model['undoHistory'], [None, '/(hello)/'])

        # Undo
        model, commands = update(make_key_down_event('z', meta_key=True),
                                self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)/')
        self.assertEqual(model['undoHistory'], [None])
        self.assertEqual(model['redoHistory'], ['/(hello)(.*)/'])
        self.assertEqual(commands, [])

    def test_cmd_shift_z_redoes_selection(self):
        """Cmd-Shift-Z redoes the undone selection."""
        model = self._create_hello_selection(self.model)

        # Add fuzzy segment
        end_idx = get_last_segment_end_internal_idx(model['selectionRegex'], model['stringValue'])
        model, _ = update(make_mouse_down_event(end_idx, top_half=False),
                         self.source_code, self.source_line, model)
        model, _ = update(make_mouse_up_event(end_idx),
                         self.source_code, self.source_line, model)

        # Undo
        model, _ = update(make_key_down_event('z', meta_key=True),
                         self.source_code, self.source_line, model)
        self.assertEqual(model['selectionRegex'], '/(hello)/')

        # Redo
        model, commands = update(make_key_down_event('z', meta_key=True, shift_key=True),
                                self.source_code, self.source_line, model)

        self.assertEqual(model['selectionRegex'], '/(hello)(.*)/')
        self.assertEqual(model['undoHistory'], [None, '/(hello)/'])
        self.assertEqual(model['redoHistory'], [])
        self.assertEqual(commands, [])

    def test_undo_with_empty_history_does_nothing(self):
        """Cmd-Z with empty undo history does nothing."""
        model, commands = update(make_key_down_event('z', meta_key=True),
                                self.source_code, self.source_line, self.model)

        self.assertIsNone(model['selectionRegex'])
        self.assertEqual(model['undoHistory'], [])
        self.assertEqual(commands, [])

    def test_redo_with_empty_history_does_nothing(self):
        """Cmd-Shift-Z with empty redo history does nothing."""
        model, commands = update(make_key_down_event('z', meta_key=True, shift_key=True),
                                self.source_code, self.source_line, self.model)

        self.assertIsNone(model['selectionRegex'])
        self.assertEqual(commands, [])


# =============================================================================
# Edge Cases Tests
# =============================================================================

class TestEdgeCases(unittest.TestCase):
    """Test edge cases: anchors, newlines, mouse released outside."""

    def test_selection_starting_at_backslash_A_anchor(self):
        """Selection from index 0 includes \\A anchor -> /(\\A^he)/."""
        model = init_model()
        model['stringValue'] = "hello"
        source_code = "x = 'hello'"

        # Select indices 0-3: \A(0), ^(1), h(2), e(3)
        model, _ = update(make_mouse_down_event(0, top_half=True),
                         source_code, 1, model)
        model, _ = update(make_mouse_move_event(3),
                         source_code, 1, model)
        model, _ = update(make_mouse_up_event(3),
                         source_code, 1, model)

        self.assertEqual(model['selectionRegex'], '/(\\A^he)/')

    def test_selection_starting_at_caret_anchor(self):
        """Selection from index 1 includes ^ anchor -> /(^hel)/."""
        model = init_model()
        model['stringValue'] = "hello"
        source_code = "x = 'hello'"

        # Select indices 1-4: ^(1), h(2), e(3), l(4)
        model, _ = update(make_mouse_down_event(1, top_half=True),
                         source_code, 1, model)
        model, _ = update(make_mouse_move_event(4),
                         source_code, 1, model)
        model, _ = update(make_mouse_up_event(4),
                         source_code, 1, model)

        self.assertEqual(model['selectionRegex'], '/(^hel)/')

    def test_selection_with_newlines_before_newline(self):
        """Selection of 'hello' in 'hello\\nworld' -> /(hello)/."""
        model = init_model()
        model['stringValue'] = "hello\nworld"
        source_code = "x = 'hello\\nworld'"

        # Augmented: 0=\A, 1=^, 2=h, 3=e, 4=l, 5=l, 6=o, 7=$, 8=\n, 9=^, 10=w...
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model)

        self.assertEqual(model['selectionRegex'], '/(hello)/')

    def test_selection_across_newline(self):
        """Selection spanning newline in 'hi\\nbye' -> /(hi$\\n^b)/."""
        model = init_model()
        model['stringValue'] = "hi\nbye"
        source_code = "x = 'hi\\nbye'"

        # Augmented: 0=\A, 1=^, 2=h, 3=i, 4=$, 5=\n, 6=^, 7=b, 8=y, 9=e, 10=$, 11=\Z
        # Select indices 2-7: h(2), i(3), $(4), \n(5), ^(6), b(7)
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model)
        model, _ = update(make_mouse_move_event(7),
                         source_code, 1, model)
        model, _ = update(make_mouse_up_event(7),
                         source_code, 1, model)

        self.assertEqual(model['selectionRegex'], '/(hi$\\n^b)/')

    def test_mouse_released_outside_widget(self):
        """MouseMove with buttons=0 finalizes segment."""
        model = init_model()
        model['stringValue'] = "hello"
        source_code = "x = 'hello'"

        # Start drag
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model)
        model, _ = update(make_mouse_move_event(5),
                         source_code, 1, model)

        self.assertTrue(model['dragging'])

        # Mouse released outside (buttons=0)
        model, _ = update(make_mouse_move_event(5, buttons=0),
                         source_code, 1, model)

        self.assertFalse(model['dragging'])
        self.assertEqual(model['selectionRegex'], '/(hell)/')

    def test_empty_string_anchor_selection(self):
        """Selection on empty string selects anchors -> /(\\A^)/."""
        model = init_model()
        model['stringValue'] = ""
        source_code = "x = ''"

        # Augmented for "": 0=\A, 1=^, 2=$, 3=\Z
        model, _ = update(make_mouse_down_event(0, top_half=True),
                         source_code, 1, model)
        model, _ = update(make_mouse_move_event(1),
                         source_code, 1, model)
        model, _ = update(make_mouse_up_event(1),
                         source_code, 1, model)

        self.assertEqual(model['selectionRegex'], '/(\\A^)/')

    def test_fresh_click_resets_selection(self):
        """Clicking away from extension points resets selection."""
        model = init_model()
        model['stringValue'] = "hello world"
        source_code = "x = 'hello world'"

        # Create initial selection
        model, _ = update(make_mouse_down_event(2, top_half=True),
                         source_code, 1, model)
        model, _ = update(make_mouse_move_event(6),
                         source_code, 1, model)
        model, _ = update(make_mouse_up_event(6),
                         source_code, 1, model)

        self.assertEqual(model['selectionRegex'], '/(hello)/')

        # Click somewhere NOT an extension point (index 10 = 'r' in world)
        model, _ = update(make_mouse_down_event(10, top_half=True),
                         source_code, 1, model)

        # Selection should be reset, new drag started
        self.assertIsNone(model['selectionRegex'])
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
        start, end, seg_type = highlights[0]

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
        start, end, seg_type = highlights[0]
        self.assertEqual(seg_type, 'literal')

    def test_newline_quantifier_matches(self):
        """
        A pattern with \\n{2,3} should match 2-3 consecutive newlines.
        """
        string_value = "a\n\n\nb"  # Three newlines
        highlights = parse_regex_for_highlighting(r'/(\n{2,3})/', string_value)
        self.assertEqual(len(highlights), 1)
        start, end, seg_type = highlights[0]
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
        start, end, seg_type = highlights[0]
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
        start, end, seg_type = highlights[0]
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
        start, end, seg_type = highlights[0]
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
        start, end, seg_type = highlights[0]
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
        start, end, seg_type = highlights[0]
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
        start, end, seg_type = highlights[0]
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
        start, end, seg_type = highlights[0]
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
# Run Tests
# =============================================================================

if __name__ == '__main__':
    unittest.main()
