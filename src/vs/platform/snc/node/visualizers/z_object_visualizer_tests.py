"""
Tests for z_object_visualizer.py - configurable field visualization.

These tests follow TDD: written before the implementation.

Run this test file directly:
    python3 src/vs/platform/snc/node/visualizers/z_object_visualizer_tests.py

Or use pytest with verbose output:
    python3 -m pytest src/vs/platform/snc/node/visualizers/z_object_visualizer_tests.py -v
"""

import unittest
import json
import os
import tempfile
import shutil
from unittest.mock import patch

from z_object_visualizer import (
    visualize, init_model, update, can_visualize,
    TRIVIAL_NAMES, DEFAULT_FIELDS_FOR_TYPE, DOTFILE_NAME,
    AddFieldClick, FieldInput, FieldSelect, FieldClick, KeyDown,
    RemoveFieldClick, DragStart, DragOver, DragEnd,
    load_fields_from_dotfile, save_fields_to_dotfile,
    _get_full_class_name, _get_autocomplete_suggestions,
)


# =============================================================================
# Test Helpers
# =============================================================================

class TestObj:
    """Simple test object with known attributes."""
    def __init__(self):
        self.x = 10
        self.y = 20
        self.name = "test"


class AnotherObj:
    """Another test object to test dotfile with multiple types."""
    def __init__(self):
        self.alpha = 1
        self.beta = 2


def make_input_event(value: str) -> dict:
    """Create a FieldInput event dict (from snc-input)."""
    return {
        'pythonEventStr': f"lambda e: FieldInput(value=e.get('value', ''))",
        'eventJSON': {'type': 'input', 'value': value},
    }


def make_mouse_down_event(python_event_str: str, detail: int = 1) -> dict:
    """Create a mouse down event dict with the given pythonEventStr."""
    return {
        'pythonEventStr': python_event_str,
        'eventJSON': {
            'type': 'mousedown',
            'button': 0,
            'buttons': 1,
            'detail': detail,
            'offsetY': 5,
            'elementHeight': 20,
            'timeStamp': 1000.0,
        },
    }


def make_key_down_event(key: str) -> dict:
    """Create a KeyDown event dict."""
    return {
        'pythonEventStr': repr(KeyDown()),
        'eventJSON': {
            'type': 'keydown',
            'key': key,
            'metaKey': False,
            'shiftKey': False,
            'ctrlKey': False,
            'altKey': False,
        },
    }


# =============================================================================
# TestInitModel
# =============================================================================

class TestInitModel(unittest.TestCase):
    """Test init_model returns correct initial state."""

    def test_init_model_returns_expected_structure(self):
        """init_model returns a dict with all expected keys."""
        obj = TestObj()
        model = init_model(obj)

        self.assertIn('fields', model)
        self.assertIn('editing_index', model)
        self.assertIn('adding_field', model)
        self.assertIn('input_value', model)
        self.assertIn('selected_suggestion_index', model)
        self.assertIn('handledKeys', model)

        self.assertIsInstance(model['fields'], list)
        self.assertIsNone(model['editing_index'])
        self.assertFalse(model['adding_field'])
        self.assertEqual(model['input_value'], "")
        self.assertIsNone(model['selected_suggestion_index'])
        self.assertIn('Enter', model['handledKeys'])
        self.assertIn('Escape', model['handledKeys'])
        self.assertIn('ArrowUp', model['handledKeys'])
        self.assertIn('ArrowDown', model['handledKeys'])
        self.assertIn('Tab', model['handledKeys'])

    def test_init_model_uses_non_trivial_names_for_unknown_type(self):
        """For a custom object with no DEFAULT_FIELDS_FOR_TYPE, use dir() minus TRIVIAL_NAMES."""
        obj = TestObj()
        model = init_model(obj)

        # TestObj has .x, .y, .name attributes
        self.assertIn('.x', model['fields'])
        self.assertIn('.y', model['fields'])
        self.assertIn('.name', model['fields'])

        # Should NOT contain trivial names like __class__, __init__, etc.
        for field in model['fields']:
            attr_name = field.lstrip('.')
            self.assertNotIn(attr_name, TRIVIAL_NAMES,
                             f"Trivial name '{attr_name}' should not be in fields")

    def test_init_model_uses_default_fields_for_known_type(self):
        """For types in DEFAULT_FIELDS_FOR_TYPE (when no dotfile), use those defaults."""
        import re
        match = re.search(r'hello', 'hello world')
        self.assertIsNotNone(match)

        # Ensure no dotfile interferes
        with patch('z_object_visualizer.load_fields_from_dotfile', return_value=None):
            model = init_model(match)

        self.assertEqual(model['fields'], DEFAULT_FIELDS_FOR_TYPE['re.Match'])

    def test_init_model_loads_from_dotfile(self):
        """When dotfile has fields for this type, use those."""
        obj = TestObj()
        full_class_name = _get_full_class_name(obj)
        saved_fields = ['.x', '.name']

        with patch('z_object_visualizer.load_fields_from_dotfile', return_value=saved_fields):
            model = init_model(obj)

        self.assertEqual(model['fields'], saved_fields)

    def test_init_model_falls_back_when_type_not_in_dotfile(self):
        """Dotfile exists but doesn't have this type → fall back to non-trivial names."""
        obj = TestObj()

        # load_fields_from_dotfile returns None (type not in dotfile)
        with patch('z_object_visualizer.load_fields_from_dotfile', return_value=None):
            model = init_model(obj)

        # Should still have the non-trivial attributes
        self.assertIn('.x', model['fields'])
        self.assertIn('.y', model['fields'])
        self.assertIn('.name', model['fields'])


# =============================================================================
# TestVisualize
# =============================================================================

class TestVisualize(unittest.TestCase):
    """Test the visualize function renders correct HTML."""

    def test_visualize_primitives_unchanged(self):
        """None, int, float should still return repr."""
        self.assertEqual(visualize(None, None), repr(None))
        self.assertEqual(visualize(42, None), repr(42))
        self.assertEqual(visualize(3.14, None), repr(3.14))
        self.assertEqual(visualize(True, None), repr(True))

    def test_visualize_object_shows_field_table(self):
        """Object visualization should contain table with field names and values."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']
        html_output = visualize(obj, model)

        self.assertIn('.x', html_output)
        self.assertIn('.name', html_output)
        self.assertIn('10', html_output)  # value of .x
        self.assertIn('test', html_output)  # value of .name (in repr form)
        self.assertIn('<table', html_output)

    def test_visualize_shows_add_button(self):
        """HTML should contain a (+) button with snc-mouse-down for AddFieldClick."""
        obj = TestObj()
        model = init_model(obj)
        html_output = visualize(obj, model)

        self.assertIn('snc-mouse-down', html_output)
        self.assertIn('AddFieldClick', html_output)
        self.assertIn('+', html_output)

    def test_visualize_shows_input_when_adding(self):
        """When adding_field=True, shows an <input> with snc-input handler."""
        obj = TestObj()
        model = init_model(obj)
        model['adding_field'] = True
        model['input_value'] = '.na'
        html_output = visualize(obj, model)

        self.assertIn('<input', html_output)
        self.assertIn('snc-input', html_output)
        self.assertIn('FieldInput', html_output)

    def test_visualize_shows_input_when_editing(self):
        """When editing_index is set, that row shows an <input>."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']
        model['editing_index'] = 0
        model['input_value'] = '.x'
        html_output = visualize(obj, model)

        self.assertIn('<input', html_output)
        self.assertIn('snc-input', html_output)

    def test_visualize_shows_autocomplete_suggestions(self):
        """When adding/editing with input, shows autocomplete suggestions."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = []  # no existing fields
        model['adding_field'] = True
        model['input_value'] = '.x'
        html_output = visualize(obj, model)

        # Should show .x as a suggestion (since it starts with '.x')
        self.assertIn('FieldSelect', html_output)

    def test_visualize_filters_autocomplete_by_input(self):
        """Typing '.na' should show '.name' but not '.x'."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = []
        model['adding_field'] = True
        model['input_value'] = '.na'
        html_output = visualize(obj, model)

        # Should have .name as suggestion
        self.assertIn('.name', html_output)
        # Should NOT have FieldSelect for .x (doesn't match '.na' prefix)
        # .x is still shown in... hmm actually .x might not appear at all if no fields
        # Let's check FieldSelect specifically
        self.assertNotIn("FieldSelect(accessor=&#x27;.x&#x27;)", html_output)

    def test_visualize_excludes_already_shown_from_autocomplete(self):
        """Fields already in model['fields'] should not appear in autocomplete."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.name']
        model['adding_field'] = True
        model['input_value'] = '.'  # matches everything
        html_output = visualize(obj, model)

        # .name is already shown, so FieldSelect for .name should not be in autocomplete
        # But .x and .y should be
        # Note: repr uses single quotes which get HTML-escaped to &#x27; in the output
        self.assertIn("FieldSelect(accessor=&#x27;.x&#x27;)", html_output)
        self.assertIn("FieldSelect(accessor=&#x27;.y&#x27;)", html_output)
        # .name should NOT be in autocomplete selections
        self.assertNotIn("FieldSelect(accessor=&#x27;.name&#x27;)", html_output)

    def test_visualize_shows_live_value_for_partial_input(self):
        """When typing a partial accessor, the value column should attempt to eval it."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x']
        model['adding_field'] = True
        model['input_value'] = '.name'
        html_output = visualize(obj, model)

        # .name evaluates to 'test', should be shown
        self.assertIn('test', html_output)

    def test_visualize_shows_class_name_header(self):
        """Should show the full class name in the header."""
        obj = TestObj()
        model = init_model(obj)
        html_output = visualize(obj, model)

        full_name = _get_full_class_name(obj)
        self.assertIn('TestObj', html_output)

    def test_visualize_field_has_double_click_handler(self):
        """Normal field names should have snc-mouse-down with FieldClick for double-click."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']
        html_output = visualize(obj, model)

        self.assertIn('FieldClick(index=0)', html_output)
        self.assertIn('FieldClick(index=1)', html_output)

    def test_visualize_shows_remove_button(self):
        """Each field row should have a remove (×) button with RemoveFieldClick."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']
        html_output = visualize(obj, model)

        self.assertIn('RemoveFieldClick(index=0)', html_output)
        self.assertIn('RemoveFieldClick(index=1)', html_output)
        # Remove button uses CSS class for hover visibility
        self.assertIn('snc-hover-hidden', html_output)
        self.assertIn('snc-hover-hidden-parent', html_output)

    def test_visualize_input_has_autofocus_when_adding(self):
        """Input should have autofocus attribute when adding a field."""
        obj = TestObj()
        model = init_model(obj)
        model['adding_field'] = True
        model['input_value'] = ''
        html_output = visualize(obj, model)

        self.assertIn('autofocus', html_output)

    def test_visualize_input_has_autofocus_when_editing(self):
        """Input should have autofocus attribute when editing a field."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']
        model['editing_index'] = 0
        model['input_value'] = '.x'
        html_output = visualize(obj, model)

        self.assertIn('autofocus', html_output)

    def test_visualize_input_has_select_all_when_editing(self):
        """Input should have data-snc-select-all when editing (not when adding)."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']
        model['editing_index'] = 0
        model['input_value'] = '.x'
        html_output = visualize(obj, model)

        self.assertIn('data-snc-select-all', html_output)

    def test_visualize_input_no_select_all_when_adding(self):
        """Input should NOT have data-snc-select-all when adding."""
        obj = TestObj()
        model = init_model(obj)
        model['adding_field'] = True
        model['input_value'] = ''
        html_output = visualize(obj, model)

        self.assertNotIn('data-snc-select-all', html_output)

    def test_visualize_highlights_selected_suggestion(self):
        """Selected suggestion should have highlight background."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = []
        model['adding_field'] = True
        model['input_value'] = '.'
        model['selected_suggestion_index'] = 0
        html_output = visualize(obj, model)

        # The first suggestion should have the highlight color
        self.assertIn('#094771', html_output)

    def test_visualize_autocomplete_uses_dropdown_hoisting(self):
        """Autocomplete should use snc-dropdown-trigger/panel classes for hoisting."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = []
        model['adding_field'] = True
        model['input_value'] = '.'
        html_output = visualize(obj, model)

        self.assertIn('snc-dropdown-trigger', html_output)
        self.assertIn('snc-dropdown-panel', html_output)
        self.assertIn('snc-dropdown-option', html_output)


# =============================================================================
# TestUpdate
# =============================================================================

class TestUpdate(unittest.TestCase):
    """Test the update function processes events correctly."""

    def test_null_event_returns_unchanged(self):
        """Passing None event returns model unchanged."""
        obj = TestObj()
        model = init_model(obj)
        new_model, commands = update(None, "x = TestObj()", 1, model, obj)
        self.assertEqual(new_model, model)
        self.assertEqual(commands, [])

    def test_empty_event_returns_unchanged(self):
        """Passing empty event dict returns model unchanged."""
        obj = TestObj()
        model = init_model(obj)
        new_model, commands = update({}, "x = TestObj()", 1, model, obj)
        self.assertEqual(new_model, model)
        self.assertEqual(commands, [])

    def test_add_field_click_sets_adding_true(self):
        """AddFieldClick event sets adding_field=True and clears input."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x']

        event = make_mouse_down_event(repr(AddFieldClick()))
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertTrue(new_model['adding_field'])
        self.assertEqual(new_model['input_value'], '')
        self.assertIsNone(new_model['editing_index'])

    def test_field_input_updates_input_value(self):
        """FieldInput event updates input_value in model."""
        obj = TestObj()
        model = init_model(obj)
        model['adding_field'] = True

        event = make_input_event('.na')
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['input_value'], '.na')

    def test_field_select_adds_field_when_adding(self):
        """FieldSelect during add mode appends accessor to fields."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x']
        model['adding_field'] = True
        model['input_value'] = '.na'

        event = make_mouse_down_event(repr(FieldSelect(accessor='.name')))
        with patch('z_object_visualizer.save_fields_to_dotfile'):
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertIn('.name', new_model['fields'])
        self.assertFalse(new_model['adding_field'])
        self.assertEqual(new_model['input_value'], '')

    def test_field_select_replaces_field_when_editing(self):
        """FieldSelect during edit mode replaces the field at editing_index."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.y']
        model['editing_index'] = 0
        model['input_value'] = '.na'

        event = make_mouse_down_event(repr(FieldSelect(accessor='.name')))
        with patch('z_object_visualizer.save_fields_to_dotfile'):
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['fields'][0], '.name')
        self.assertEqual(new_model['fields'][1], '.y')
        self.assertIsNone(new_model['editing_index'])
        self.assertEqual(new_model['input_value'], '')

    def test_double_click_starts_editing(self):
        """FieldClick with detail=2 sets editing_index and input_value."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']

        event = make_mouse_down_event(repr(FieldClick(index=0)), detail=2)
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['editing_index'], 0)
        self.assertEqual(new_model['input_value'], '.x')
        self.assertFalse(new_model['adding_field'])

    def test_single_click_does_not_start_editing(self):
        """FieldClick with detail=1 does NOT start editing."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']

        event = make_mouse_down_event(repr(FieldClick(index=0)), detail=1)
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertIsNone(new_model['editing_index'])

    def test_enter_commits_add(self):
        """Enter key during add mode appends input_value to fields."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x']
        model['adding_field'] = True
        model['input_value'] = '.name'

        event = make_key_down_event('Enter')
        with patch('z_object_visualizer.save_fields_to_dotfile'):
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertIn('.name', new_model['fields'])
        self.assertFalse(new_model['adding_field'])
        self.assertEqual(new_model['input_value'], '')

    def test_enter_commits_edit(self):
        """Enter key during edit mode replaces field at editing_index."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.y']
        model['editing_index'] = 0
        model['input_value'] = '.name'

        event = make_key_down_event('Enter')
        with patch('z_object_visualizer.save_fields_to_dotfile'):
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['fields'][0], '.name')
        self.assertIsNone(new_model['editing_index'])

    def test_enter_with_empty_input_does_not_add(self):
        """Enter with empty input_value during add should not add empty field."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x']
        model['adding_field'] = True
        model['input_value'] = ''

        event = make_key_down_event('Enter')
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(len(new_model['fields']), 1)
        self.assertFalse(new_model['adding_field'])

    def test_escape_cancels_add(self):
        """Escape key during add mode cancels adding."""
        obj = TestObj()
        model = init_model(obj)
        model['adding_field'] = True
        model['input_value'] = '.na'

        event = make_key_down_event('Escape')
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertFalse(new_model['adding_field'])
        self.assertEqual(new_model['input_value'], '')

    def test_escape_cancels_edit(self):
        """Escape key during edit mode cancels editing."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']
        model['editing_index'] = 0
        model['input_value'] = '.foo'

        event = make_key_down_event('Escape')
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertIsNone(new_model['editing_index'])
        self.assertEqual(new_model['input_value'], '')
        # Field should be unchanged
        self.assertEqual(new_model['fields'][0], '.x')

    def test_field_select_saves_dotfile(self):
        """FieldSelect commit should call save_fields_to_dotfile."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x']
        model['adding_field'] = True

        event = make_mouse_down_event(repr(FieldSelect(accessor='.name')))
        with patch('z_object_visualizer.save_fields_to_dotfile') as mock_save:
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)
            mock_save.assert_called_once()
            # Should save with the updated fields list
            saved_fields = mock_save.call_args[0][1]
            self.assertIn('.name', saved_fields)

    def test_enter_saves_dotfile(self):
        """Enter commit should call save_fields_to_dotfile."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x']
        model['adding_field'] = True
        model['input_value'] = '.name'

        event = make_key_down_event('Enter')
        with patch('z_object_visualizer.save_fields_to_dotfile') as mock_save:
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)
            mock_save.assert_called_once()

    def test_none_model_gets_initialized(self):
        """Passing None model initializes a fresh model."""
        obj = TestObj()
        event = make_mouse_down_event(repr(AddFieldClick()))
        new_model, commands = update(event, "x = TestObj()", 1, None, obj)
        self.assertIsNotNone(new_model)
        self.assertTrue(new_model['adding_field'])

    def test_arrow_down_selects_first_suggestion(self):
        """ArrowDown from no selection selects the first suggestion."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = []
        model['adding_field'] = True
        model['input_value'] = '.'

        event = make_key_down_event('ArrowDown')
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['selected_suggestion_index'], 0)

    def test_arrow_down_wraps_around(self):
        """ArrowDown wraps from last suggestion back to first."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = []
        model['adding_field'] = True
        model['input_value'] = '.'
        # Get the count of suggestions to set index to last
        from z_object_visualizer import _get_autocomplete_suggestions
        suggestions = _get_autocomplete_suggestions(obj, [], '.')
        last_idx = min(len(suggestions), 10) - 1
        model['selected_suggestion_index'] = last_idx

        event = make_key_down_event('ArrowDown')
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['selected_suggestion_index'], 0)

    def test_arrow_up_selects_last_suggestion(self):
        """ArrowUp from no selection selects the last suggestion."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = []
        model['adding_field'] = True
        model['input_value'] = '.'

        event = make_key_down_event('ArrowUp')
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        from z_object_visualizer import _get_autocomplete_suggestions
        suggestions = _get_autocomplete_suggestions(obj, [], '.')
        expected = min(len(suggestions), 10) - 1
        self.assertEqual(new_model['selected_suggestion_index'], expected)

    def test_arrow_up_wraps_around(self):
        """ArrowUp from first suggestion wraps to last."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = []
        model['adding_field'] = True
        model['input_value'] = '.'
        model['selected_suggestion_index'] = 0

        event = make_key_down_event('ArrowUp')
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        from z_object_visualizer import _get_autocomplete_suggestions
        suggestions = _get_autocomplete_suggestions(obj, [], '.')
        expected = min(len(suggestions), 10) - 1
        self.assertEqual(new_model['selected_suggestion_index'], expected)

    def test_enter_commits_selected_suggestion(self):
        """Enter with a selected suggestion commits that suggestion, not the input text."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = []
        model['adding_field'] = True
        model['input_value'] = '.'
        # Get suggestions and pick the first one
        from z_object_visualizer import _get_autocomplete_suggestions
        suggestions = _get_autocomplete_suggestions(obj, [], '.')
        model['selected_suggestion_index'] = 0
        expected_field = suggestions[0]

        event = make_key_down_event('Enter')
        with patch('z_object_visualizer.save_fields_to_dotfile'):
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertIn(expected_field, new_model['fields'])
        self.assertFalse(new_model['adding_field'])
        self.assertIsNone(new_model['selected_suggestion_index'])

    def test_field_input_auto_highlights_first_suggestion(self):
        """Typing in the input should auto-highlight the first matching suggestion."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x']  # .name is NOT already shown
        model['adding_field'] = True
        model['selected_suggestion_index'] = None

        event = make_input_event('.na')
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        # .name matches '.na' and is not in fields, so first suggestion should be selected
        self.assertEqual(new_model['selected_suggestion_index'], 0)

    def test_field_input_clears_selection_when_no_suggestions(self):
        """Typing something with no matches should clear the selection."""
        obj = TestObj()
        model = init_model(obj)
        model['adding_field'] = True
        model['selected_suggestion_index'] = 0

        event = make_input_event('.zzzzz')
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertIsNone(new_model['selected_suggestion_index'])

    def test_field_input_clears_selection_when_empty(self):
        """Clearing input should clear the selection."""
        obj = TestObj()
        model = init_model(obj)
        model['adding_field'] = True
        model['selected_suggestion_index'] = 0

        event = make_input_event('')
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertIsNone(new_model['selected_suggestion_index'])

    def test_tab_commits_selected_suggestion(self):
        """Tab with a selected suggestion commits it like Enter."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = []
        model['adding_field'] = True
        model['input_value'] = '.'
        suggestions = _get_autocomplete_suggestions(obj, [], '.')
        model['selected_suggestion_index'] = 0
        expected_field = suggestions[0]

        event = make_key_down_event('Tab')
        with patch('z_object_visualizer.save_fields_to_dotfile'):
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertIn(expected_field, new_model['fields'])
        self.assertFalse(new_model['adding_field'])
        self.assertIsNone(new_model['selected_suggestion_index'])

    def test_arrow_keys_noop_when_not_input_active(self):
        """ArrowDown/Up should do nothing when not adding or editing."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x']

        event = make_key_down_event('ArrowDown')
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)
        self.assertIsNone(new_model['selected_suggestion_index'])

    def test_remove_field_removes_from_list(self):
        """RemoveFieldClick removes the field at the given index."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name', '.y']

        event = make_mouse_down_event(repr(RemoveFieldClick(index=1)))
        with patch('z_object_visualizer.save_fields_to_dotfile'):
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['fields'], ['.x', '.y'])

    def test_remove_field_saves_dotfile(self):
        """RemoveFieldClick should persist the updated fields to dotfile."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']

        event = make_mouse_down_event(repr(RemoveFieldClick(index=0)))
        with patch('z_object_visualizer.save_fields_to_dotfile') as mock_save:
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)
            mock_save.assert_called_once()
            saved_fields = mock_save.call_args[0][1]
            self.assertEqual(saved_fields, ['.name'])

    def test_remove_field_out_of_range_is_noop(self):
        """RemoveFieldClick with invalid index does nothing."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x']

        event = make_mouse_down_event(repr(RemoveFieldClick(index=5)))
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['fields'], ['.x'])

    def test_remove_field_cancels_editing_if_index_matches(self):
        """Removing the field being edited should cancel editing."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']
        model['editing_index'] = 0
        model['input_value'] = '.x'

        event = make_mouse_down_event(repr(RemoveFieldClick(index=0)))
        with patch('z_object_visualizer.save_fields_to_dotfile'):
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertIsNone(new_model['editing_index'])
        self.assertEqual(new_model['input_value'], '')
        self.assertEqual(new_model['fields'], ['.name'])


# =============================================================================
# TestDotfile
# =============================================================================

# =============================================================================
# TestDragReorder
# =============================================================================

def make_mouse_move_event(python_event_str: str, buttons: int = 1) -> dict:
    """Create a mouse move event dict."""
    return {
        'pythonEventStr': python_event_str,
        'eventJSON': {
            'type': 'mousemove',
            'buttons': buttons,
        },
    }


def make_mouse_up_event(python_event_str: str) -> dict:
    """Create a mouse up event dict."""
    return {
        'pythonEventStr': python_event_str,
        'eventJSON': {
            'type': 'mouseup',
            'buttons': 0,
        },
    }


class TestDragReorder(unittest.TestCase):
    """Test drag-and-drop field reordering."""

    def test_drag_start_sets_drag_from_index(self):
        """DragStart sets drag_from_index in model."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name', '.y']

        event = make_mouse_down_event(repr(DragStart(index=1)))
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['drag_from_index'], 1)

    def test_drag_over_sets_drag_over_index(self):
        """DragOver while dragging sets drag_over_index."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name', '.y']
        model['drag_from_index'] = 2

        event = make_mouse_move_event(repr(DragOver(index=0)), buttons=1)
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['drag_over_index'], 0)

    def test_drag_over_cancels_on_button_release(self):
        """DragOver with buttons=0 cancels drag."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name', '.y']
        model['drag_from_index'] = 2
        model['drag_over_index'] = 0

        event = make_mouse_move_event(repr(DragOver(index=1)), buttons=0)
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertIsNone(new_model['drag_from_index'])
        self.assertIsNone(new_model['drag_over_index'])

    def test_drag_over_ignored_when_not_dragging(self):
        """DragOver without active drag is ignored."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name', '.y']

        event = make_mouse_move_event(repr(DragOver(index=1)), buttons=1)
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertIsNone(new_model.get('drag_over_index'))

    def test_drag_end_reorders_forward(self):
        """DragEnd moves field from index 0 to index 2."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name', '.y']
        model['drag_from_index'] = 0
        model['drag_over_index'] = 2

        event = make_mouse_up_event(repr(DragEnd(index=2)))
        with patch('z_object_visualizer.save_fields_to_dotfile'):
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['fields'], ['.name', '.y', '.x'])
        self.assertIsNone(new_model['drag_from_index'])
        self.assertIsNone(new_model['drag_over_index'])

    def test_drag_end_reorders_backward(self):
        """DragEnd moves field from index 2 to index 0."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name', '.y']
        model['drag_from_index'] = 2
        model['drag_over_index'] = 0

        event = make_mouse_up_event(repr(DragEnd(index=0)))
        with patch('z_object_visualizer.save_fields_to_dotfile'):
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['fields'], ['.y', '.x', '.name'])
        self.assertIsNone(new_model['drag_from_index'])
        self.assertIsNone(new_model['drag_over_index'])

    def test_drag_end_same_position_is_noop(self):
        """DragEnd to the same position doesn't change order."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name', '.y']
        model['drag_from_index'] = 1
        model['drag_over_index'] = 1

        event = make_mouse_up_event(repr(DragEnd(index=1)))
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['fields'], ['.x', '.name', '.y'])

    def test_drag_end_saves_dotfile(self):
        """DragEnd should save reordered fields to dotfile."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name', '.y']
        model['drag_from_index'] = 0
        model['drag_over_index'] = 2

        event = make_mouse_up_event(repr(DragEnd(index=2)))
        with patch('z_object_visualizer.save_fields_to_dotfile') as mock_save:
            new_model, commands = update(event, "x = TestObj()", 1, model, obj)
            mock_save.assert_called_once()

    def test_drag_end_without_drag_is_noop(self):
        """DragEnd without active drag does nothing."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name', '.y']

        event = make_mouse_up_event(repr(DragEnd(index=1)))
        new_model, commands = update(event, "x = TestObj()", 1, model, obj)

        self.assertEqual(new_model['fields'], ['.x', '.name', '.y'])

    def test_visualize_shows_drag_handles(self):
        """Each field row should have a drag handle."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']
        html_output = visualize(obj, model)

        self.assertIn('DragStart(index=0)', html_output)
        self.assertIn('DragStart(index=1)', html_output)

    def test_visualize_shows_drag_target_indicators(self):
        """Each field row should have DragOver and DragEnd handlers."""
        obj = TestObj()
        model = init_model(obj)
        model['fields'] = ['.x', '.name']
        html_output = visualize(obj, model)

        self.assertIn('DragOver(index=0)', html_output)
        self.assertIn('DragEnd(index=0)', html_output)


class TestDotfile(unittest.TestCase):
    """Test dotfile load/save operations."""

    def setUp(self):
        """Create a temp directory for dotfile tests."""
        self.orig_cwd = os.getcwd()
        self.tmp_dir = tempfile.mkdtemp()
        os.chdir(self.tmp_dir)

    def tearDown(self):
        """Restore original cwd and clean up temp dir."""
        os.chdir(self.orig_cwd)
        shutil.rmtree(self.tmp_dir)

    def test_load_fields_missing_file(self):
        """No dotfile → returns None."""
        result = load_fields_from_dotfile('some.Type')
        self.assertIsNone(result)

    def test_load_fields_from_dotfile(self):
        """Valid dotfile with type key → returns fields list."""
        data = {'some.Type': ['.x', '.y']}
        with open(DOTFILE_NAME, 'w') as f:
            json.dump(data, f)

        result = load_fields_from_dotfile('some.Type')
        self.assertEqual(result, ['.x', '.y'])

    def test_load_fields_type_not_in_dotfile(self):
        """Dotfile exists but doesn't have this type → returns None."""
        data = {'other.Type': ['.a', '.b']}
        with open(DOTFILE_NAME, 'w') as f:
            json.dump(data, f)

        result = load_fields_from_dotfile('some.Type')
        self.assertIsNone(result)

    def test_load_fields_corrupt_file(self):
        """Bad JSON → returns None (doesn't crash)."""
        with open(DOTFILE_NAME, 'w') as f:
            f.write('this is not json{{{')

        result = load_fields_from_dotfile('some.Type')
        self.assertIsNone(result)

    def test_save_fields_to_dotfile(self):
        """Saves correct JSON structure."""
        save_fields_to_dotfile('some.Type', ['.x', '.y'])

        with open(DOTFILE_NAME, 'r') as f:
            data = json.load(f)

        self.assertEqual(data['some.Type'], ['.x', '.y'])

    def test_save_preserves_other_types(self):
        """Saving for type A doesn't clobber type B entries."""
        save_fields_to_dotfile('type.A', ['.a1', '.a2'])
        save_fields_to_dotfile('type.B', ['.b1', '.b2'])

        with open(DOTFILE_NAME, 'r') as f:
            data = json.load(f)

        self.assertEqual(data['type.A'], ['.a1', '.a2'])
        self.assertEqual(data['type.B'], ['.b1', '.b2'])

    def test_save_overwrites_same_type(self):
        """Saving the same type again overwrites the previous entry."""
        save_fields_to_dotfile('some.Type', ['.x'])
        save_fields_to_dotfile('some.Type', ['.x', '.y'])

        with open(DOTFILE_NAME, 'r') as f:
            data = json.load(f)

        self.assertEqual(data['some.Type'], ['.x', '.y'])


# =============================================================================
# TestGetFullClassName
# =============================================================================

class TestGetFullClassName(unittest.TestCase):
    """Test _get_full_class_name helper."""

    def test_builtin_type(self):
        """Built-in types should return module.qualname."""
        result = _get_full_class_name("hello")
        self.assertEqual(result, 'builtins.str')

    def test_custom_type(self):
        """Custom types should include module and qualname."""
        obj = TestObj()
        result = _get_full_class_name(obj)
        self.assertIn('TestObj', result)


if __name__ == '__main__':
    unittest.main()
