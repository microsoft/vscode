"""
Tests for list_visualizer.py - list composition with child visualizers.

Run:
    python3 -m pytest list_visualizer_tests.py -v
"""

import unittest
import html
import re

from visualizer_utils import ChildEvent
import list_visualizer
from list_visualizer import (
    can_visualize, init_model, visualize, update,
    AddColumnClick, ColumnInput, ColumnSelect, ColumnClick,
    RemoveColumnClick, ColumnDragStart, ColumnDragOver, ColumnDragEnd,
    ColumnKeyDown, COLUMN_DOTFILE_NAME,
    load_columns_from_dotfile, save_columns_to_dotfile,
    _get_item_type_key, _get_column_suggestions, _get_all_possible_columns,
)


# === Mock event types for the mock string visualizer ===

from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class MouseDown:
    index: int


# === Test helpers ===

class MockStringVisualizer:
    """Mimics a string visualizer with interactive model."""
    def can_visualize(self, value):
        return isinstance(value, str)
    def get_fields(self, value):
        return None
    def init_model(self, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
        return {'selection': None, 'handledKeys': ['Escape', 'Enter']}
    def visualize(self, value, model, get_visualizer, eval_in_scope=None, max_width=None, max_height=None, small=False, source_expr=None):
        return f'<span snc-mouse-down="MouseDown(index=0)">{html.escape(value)}</span>'
    def update(self, event, source_code, source_line, model, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
        model = dict(model)
        model['last_event'] = event['pythonEventStr']
        return (model, [])


class SmallTrackingVisualizer:
    """Mock visualizer that records the small= kwarg passed to visualize()."""
    def __init__(self):
        self.visualize_calls = []
    def can_visualize(self, value):
        return isinstance(value, str)
    def get_fields(self, value):
        return None
    def init_model(self, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
        return {'handledKeys': []}
    def visualize(self, value, model, get_visualizer, eval_in_scope=None, max_width=None, max_height=None, small=False, source_expr=None):
        self.visualize_calls.append({'value': value, 'small': small})
        return f'<span>{html.escape(value)}</span>'
    def update(self, event, source_code, source_line, model, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
        return (model, [])


class MockIntVisualizer:
    """Mimics a simple int visualizer (no interactive model)."""
    def can_visualize(self, value):
        return isinstance(value, int)
    def init_model(self, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
        return None
    def visualize(self, value, model, get_visualizer, eval_in_scope=None, max_width=None, max_height=None, small=False, source_expr=None):
        return f'<span>{value}</span>'
    def update(self, event, source_code, source_line, model, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
        return (model, [])


class MockDictVisualizer:
    """Mimics a dict visualizer with get_fields support."""
    def can_visualize(self, value):
        return isinstance(value, dict)
    def get_fields(self, value):
        return [f"^[{repr(k)}]" for k in value.keys()]
    def init_model(self, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
        return None
    def visualize(self, value, model, get_visualizer, eval_in_scope=None, max_width=None, max_height=None, small=False, source_expr=None):
        return f'<span>{html.escape(repr(value))}</span>'
    def update(self, event, source_code, source_line, model, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
        return (model, [])


class MockObjectVisualizer:
    """Mimics an object visualizer with get_fields support."""
    def can_visualize(self, value):
        return True
    def get_fields(self, value):
        if value is None or isinstance(value, (int, float)):
            return None
        names = sorted([name for name in dir(value) if not name.startswith('_')])
        return [f'^.{name}' for name in names]
    def init_model(self, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
        return None
    def visualize(self, value, model, get_visualizer, eval_in_scope=None, max_width=None, max_height=None, small=False, source_expr=None):
        return f'<span>{html.escape(repr(value))}</span>'
    def update(self, event, source_code, source_line, model, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
        return (model, [])


class ListVisualizerAdapter:
    """Wraps the list_visualizer module to act like a visualizer object."""
    def can_visualize(self, value):
        return list_visualizer.can_visualize(value)
    def get_fields(self, value):
        return list_visualizer.get_fields(value)
    def init_model(self, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
        return list_visualizer.init_model(value, get_visualizer, eval_in_scope=eval_in_scope, source_expr=source_expr)
    def visualize(self, value, model, get_visualizer, eval_in_scope=None, max_width=None, max_height=None, small=False, source_expr=None):
        return list_visualizer.visualize(value, model, get_visualizer, eval_in_scope, max_width=max_width, max_height=max_height, small=small, source_expr=source_expr)
    def update(self, event, source_code, source_line, model, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
        return list_visualizer.update(event, source_code, source_line, model, value, get_visualizer, eval_in_scope=eval_in_scope, source_expr=source_expr)


_mock_string_vis = MockStringVisualizer()
_mock_int_vis = MockIntVisualizer()
_mock_dict_vis = MockDictVisualizer()
_mock_obj_vis = MockObjectVisualizer()
_mock_list_vis = ListVisualizerAdapter()


def mock_get_visualizer(value):
    if isinstance(value, list):
        return _mock_list_vis
    if isinstance(value, str):
        return _mock_string_vis
    if isinstance(value, dict):
        return _mock_dict_vis
    if isinstance(value, int):
        return _mock_int_vis
    return _mock_obj_vis


def make_child_mouse_event(child_key: str, py_ev_str: str) -> dict:
    """Create a ChildEvent mouse-down event for testing update()."""
    ce = ChildEvent(child_key=child_key, py_ev_str=py_ev_str)
    return {
        'pythonEventStr': repr(ce),
        'eventJSON': {'type': 'mousedown', 'button': 0, 'buttons': 1},
    }


# === Tests ===

class TestCanVisualize(unittest.TestCase):
    def test_list(self):
        self.assertTrue(can_visualize([1, 2, 3]))

    def test_empty_list(self):
        self.assertTrue(can_visualize([]))

    def test_not_list(self):
        self.assertFalse(can_visualize("hello"))
        self.assertFalse(can_visualize(42))
        self.assertFalse(can_visualize((1, 2)))


class TestInitModel(unittest.TestCase):
    def test_stores_child_models_by_string_index(self):
        lst = ["hello", "world"]
        model = init_model(lst, mock_get_visualizer)
        self.assertIn('children', model)
        self.assertIn('^[0]', model['children'])
        self.assertIn('^[1]', model['children'])

    def test_child_models_come_from_child_visualizer(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        child_model = model['children']['^[0]']
        self.assertEqual(child_model, _mock_string_vis.init_model("hello"))

    def test_int_child_model(self):
        lst = [42]
        model = init_model(lst, mock_get_visualizer)
        self.assertIsNone(model['children']['^[0]'])

    def test_aggregates_handled_keys(self):
        lst = ["hello", "world"]
        model = init_model(lst, mock_get_visualizer)
        self.assertIn('handledKeys', model)
        self.assertIn('Escape', model['handledKeys'])
        self.assertIn('Enter', model['handledKeys'])

    def test_empty_list(self):
        model = init_model([], mock_get_visualizer)
        self.assertEqual(model['children'], {})
        self.assertIsInstance(model['handledKeys'], list)


class TestVisualize(unittest.TestCase):
    def test_output_contains_wrapped_child_events(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('snc-child-key=', output)

    def test_child_html_is_wrapped_with_correct_key(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        matches = re.findall(r'snc-child-key="([^"]*)"', output)
        self.assertTrue(len(matches) > 0)
        self.assertEqual(eval(html.unescape(matches[0])), '^[0]')

    def test_multiple_items_have_different_keys(self):
        lst = ["a", "b"]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        matches = re.findall(r'snc-child-key="([^"]*)"', output)
        keys = {eval(html.unescape(m)) for m in matches}
        self.assertIn('^[0]', keys)
        self.assertIn('^[1]', keys)

    def test_contains_child_content(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('hello', output)

    def test_brackets_present(self):
        lst = [42]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('[', output)
        self.assertIn(']', output)

    def test_empty_list(self):
        lst = []
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('[', output)
        self.assertIn(']', output)


class TestUpdate(unittest.TestCase):
    def test_child_event_routes_to_child_visualizer(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        event = make_child_mouse_event('^[0]', 'MouseDown(index=0)')
        new_model, commands = update(event, 'x = ["hello"]', 1, model, lst, mock_get_visualizer)
        child_model = new_model['children']['^[0]']
        self.assertIn('last_event', child_model)

    def test_child_event_preserves_other_children(self):
        lst = ["hello", "world"]
        model = init_model(lst, mock_get_visualizer)
        event = make_child_mouse_event('^[0]', 'MouseDown(index=0)')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIn('^[1]', new_model['children'])
        self.assertNotIn('last_event', new_model['children']['^[1]'])

    def test_null_event_is_noop(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        new_model, commands = update(None, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model, model)
        self.assertEqual(commands, [])

    def test_empty_event_is_noop(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        new_model, commands = update({}, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model, model)
        self.assertEqual(commands, [])

    def test_child_commands_propagated(self):
        class CmdVis:
            def can_visualize(self, v): return True
            def init_model(self, v, get_visualizer=None, eval_in_scope=None, source_expr=None): return {}
            def visualize(self, v, m, gv, eval_in_scope=None, max_width=None, max_height=None, source_expr=None): return '<span snc-mouse-down="X">x</span>'
            def update(self, event, sc, sl, model, value, gv=None, eval_in_scope=None, source_expr=None):
                return (model, ['test_command'])

        cmd_vis = CmdVis()
        get_vis = lambda v: cmd_vis

        lst = ["x"]
        model = init_model(lst, get_vis)
        event = make_child_mouse_event('^[0]', 'X')
        _, commands = update(event, '', 1, model, lst, get_vis)
        self.assertIn('test_command', commands)

    def test_handled_keys_updated_after_child_event(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        event = make_child_mouse_event('^[0]', 'MouseDown(index=0)')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIn('handledKeys', new_model)


class TestNestedComposition(unittest.TestCase):
    """Test list of lists works (nested composition)."""

    def test_nested_list_is_table_mode(self):
        lst = [[1, 2], [3, 4]]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        self.assertEqual(model['columns'], ['^[0]', '^[1]'])
        self.assertIn('0\x00^[0]', model['children'])
        self.assertIn('0\x00^[1]', model['children'])
        self.assertIn('1\x00^[0]', model['children'])
        self.assertIn('1\x00^[1]', model['children'])


class TestGetFields(unittest.TestCase):
    """Test get_fields and eval_caret_expr integration on list_visualizer."""

    def test_returns_string_indices(self):
        from list_visualizer import get_fields
        self.assertEqual(get_fields([10, 20, 30]), ['^[0]', '^[1]', '^[2]'])

    def test_empty_list(self):
        from list_visualizer import get_fields
        self.assertEqual(get_fields([]), [])

    def test_eval_caret_expr_roundtrip(self):
        from list_visualizer import get_fields
        from visualizer_utils import eval_caret_expr
        lst = [10, 20, 30]
        fields = get_fields(lst)
        self.assertEqual(eval_caret_expr(fields[0], lst), 10)
        self.assertEqual(eval_caret_expr(fields[2], lst), 30)


class TestTableDetection(unittest.TestCase):
    """Test that init_model detects table mode for homogeneous lists."""

    def test_list_of_dicts_is_table_mode(self):
        lst = [{'name': 'Alice', 'age': 30}, {'name': 'Bob', 'age': 25}]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        self.assertIn("^['name']", model['columns'])
        self.assertIn("^['age']", model['columns'])

    def test_list_of_strings_is_list_mode(self):
        lst = ["hello", "world"]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'list')

    def test_empty_list_is_list_mode(self):
        model = init_model([], mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'list')

    def test_list_of_lists_is_table_mode(self):
        lst = [[1, 2, 3], [4, 5, 6]]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        self.assertEqual(model['columns'], ['^[0]', '^[1]', '^[2]'])

    def test_mixed_types_is_list_mode(self):
        lst = ["hello", 42]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'list')

    def test_union_columns_from_different_field_sets(self):
        lst = [{'a': 1, 'b': 2}, {'b': 3, 'c': 4}]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        cols = model['columns']
        self.assertIn("^['a']", cols)
        self.assertIn("^['b']", cols)
        self.assertIn("^['c']", cols)

    def test_list_of_objects_is_table_mode(self):
        class Point:
            def __init__(self, x, y):
                self.x = x
                self.y = y
        lst = [Point(1, 2), Point(3, 4)]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        self.assertIn('^.x', model['columns'])
        self.assertIn('^.y', model['columns'])

    def test_single_item_list_of_dicts_is_table_mode(self):
        lst = [{'x': 1}]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')

    def test_table_mode_has_cell_children(self):
        """In table mode, children are keyed by composite row\\x00field keys."""
        lst = [{'name': 'Alice'}, {'name': 'Bob'}]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        self.assertIn("0\x00^['name']", model['children'])
        self.assertIn("1\x00^['name']", model['children'])


class TestTableRendering(unittest.TestCase):
    """Test that visualize() renders HTML tables correctly in table mode."""

    def test_renders_table_element(self):
        lst = [{'name': 'Alice'}, {'name': 'Bob'}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('<table', output)
        self.assertIn('</table>', output)

    def test_renders_column_headers(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        unescaped = html.unescape(output)
        self.assertIn("^['name']", unescaped)
        self.assertIn("^['age']", unescaped)
        self.assertIn('<th', output)

    def test_renders_row_index_column(self):
        lst = [{'x': 1}, {'x': 2}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        # Row indices should appear
        self.assertIn('0', output)
        self.assertIn('1', output)

    def test_renders_cell_content(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('Alice', output)

    def test_cell_html_wrapped_with_composite_key(self):
        """Cell HTML should be inside a snc-child-key span with composite key."""
        lst = [{'name': 'test_str'}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        matches = re.findall(r'snc-child-key="([^"]*)"', output)
        found_composite = False
        for m in matches:
            key = eval(html.unescape(m))
            if '\x00' in key:
                found_composite = True
                break
        self.assertTrue(found_composite, "Expected composite key in snc-child-key")

    def test_missing_field_renders_empty_cell(self):
        lst = [{'a': 1}, {'b': 2}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        unescaped = html.unescape(output)
        self.assertIn("^['a']", unescaped)
        self.assertIn("^['b']", unescaped)
        self.assertIn('<td style="padding:0 8px;"></td>', output) # missing cell

    def test_list_mode_still_uses_brackets(self):
        lst = ["hello", "world"]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('[', output)
        self.assertIn(']', output)
        self.assertNotIn('<table', output)

    def test_list_of_lists_renders_table(self):
        lst = [[1, 2], [3, 4]]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('<table', output)
        self.assertIn('1', output)
        self.assertIn('4', output)


class TestTableEventRouting(unittest.TestCase):
    """Test that update() routes events to the correct cell in table mode."""

    def test_cell_event_routes_to_correct_cell(self):
        lst = [{'name': 'Alice'}, {'name': 'Bob'}]
        model = init_model(lst, mock_get_visualizer)
        composite_key = "0\x00^['name']"
        event = make_child_mouse_event(composite_key, 'MouseDown(index=0)')
        new_model, commands = update(event, '', 1, model, lst, mock_get_visualizer)
        cell_model = new_model['children'][composite_key]
        self.assertIn('last_event', cell_model)

    def test_cell_event_preserves_other_cells(self):
        lst = [{'name': 'Alice'}, {'name': 'Bob'}]
        model = init_model(lst, mock_get_visualizer)
        event = make_child_mouse_event("0\x00^['name']", 'MouseDown(index=0)')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        bob_key = "1\x00^['name']"
        self.assertIn(bob_key, new_model['children'])
        bob_model = new_model['children'][bob_key]
        if bob_model and isinstance(bob_model, dict):
            self.assertNotIn('last_event', bob_model)

    def test_null_event_is_noop_in_table_mode(self):
        lst = [{'x': 1}]
        model = init_model(lst, mock_get_visualizer)
        new_model, commands = update(None, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model, model)
        self.assertEqual(commands, [])

    def test_cell_commands_propagated(self):
        class CmdVis:
            def can_visualize(self, v): return isinstance(v, str)
            def init_model(self, v, get_visualizer=None, eval_in_scope=None, source_expr=None): return {}
            def visualize(self, v, m, gv, eval_in_scope=None, max_width=None, max_height=None, source_expr=None): return '<span snc-mouse-down="X">x</span>'
            def update(self, event, sc, sl, model, value, gv=None, eval_in_scope=None, source_expr=None):
                return (model, ['table_cmd'])

        cmd_vis = CmdVis()

        def get_vis(v):
            if isinstance(v, dict):
                return _mock_dict_vis
            if isinstance(v, str):
                return cmd_vis
            return _mock_int_vis

        lst = [{'k': 'val'}]
        model = init_model(lst, get_vis)
        event = make_child_mouse_event("0\x00^['k']", 'X')
        _, commands = update(event, '', 1, model, lst, get_vis)
        self.assertIn('table_cmd', commands)


class TestVisualizeMaxDimensions(unittest.TestCase):
    """Test that visualize() accepts optional max_width and max_height."""

    def test_list_mode_accepts_max_width_and_max_height(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        output_default = visualize(lst, model, mock_get_visualizer, None)
        output_with_dims = visualize(lst, model, mock_get_visualizer, None, max_width=100, max_height=50)
        self.assertEqual(output_default, output_with_dims)

    def test_table_mode_accepts_max_width_and_max_height(self):
        lst = [{'name': 'Alice'}, {'name': 'Bob'}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None, max_width=200, max_height=100)
        self.assertIn('<table', output)

    def test_empty_list_accepts_max_width_and_max_height(self):
        lst = []
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None, max_width=50, max_height=50)
        self.assertIn('[', output)


class TestSmallParameter(unittest.TestCase):
    """Test that visualize() passes small=True to nested children, except focused."""

    def test_visualize_accepts_small_parameter(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None, small=True)
        self.assertIn('hello', output)

    def test_children_receive_small_true_by_default(self):
        tracker = SmallTrackingVisualizer()
        get_vis = lambda v: tracker
        lst = ["a", "b"]
        model = init_model(lst, get_vis)
        visualize(lst, model, get_vis, None)
        self.assertEqual(len(tracker.visualize_calls), 2)
        self.assertTrue(tracker.visualize_calls[0]['small'])
        self.assertTrue(tracker.visualize_calls[1]['small'])

    def test_focused_child_receives_small_false(self):
        tracker = SmallTrackingVisualizer()
        get_vis = lambda v: tracker
        lst = ["a", "b"]
        model = init_model(lst, get_vis)
        model['focused_child'] = '^[1]'
        tracker.visualize_calls.clear()
        visualize(lst, model, get_vis, None)
        self.assertTrue(tracker.visualize_calls[0]['small'])
        self.assertFalse(tracker.visualize_calls[1]['small'])

    def test_no_focused_child_all_small(self):
        tracker = SmallTrackingVisualizer()
        get_vis = lambda v: tracker
        lst = ["a"]
        model = init_model(lst, get_vis)
        visualize(lst, model, get_vis, None)
        self.assertTrue(tracker.visualize_calls[0]['small'])

    def test_table_mode_children_receive_small_true(self):
        tracker = SmallTrackingVisualizer()
        def get_vis(v):
            if isinstance(v, dict):
                return _mock_dict_vis
            return tracker
        lst = [{'name': 'Alice'}]
        model = init_model(lst, get_vis)
        tracker.visualize_calls.clear()
        visualize(lst, model, get_vis, None)
        self.assertTrue(all(c['small'] for c in tracker.visualize_calls))

    def test_table_mode_focused_child_receives_small_false(self):
        tracker = SmallTrackingVisualizer()
        def get_vis(v):
            if isinstance(v, dict):
                return _mock_dict_vis
            return tracker
        lst = [{'name': 'Alice'}, {'name': 'Bob'}]
        model = init_model(lst, get_vis)
        model['focused_child'] = "0\x00^['name']"
        tracker.visualize_calls.clear()
        visualize(lst, model, get_vis, None)
        alice_call = next(c for c in tracker.visualize_calls if c['value'] == 'Alice')
        bob_call = next(c for c in tracker.visualize_calls if c['value'] == 'Bob')
        self.assertFalse(alice_call['small'])
        self.assertTrue(bob_call['small'])


class TestFocusTracking(unittest.TestCase):
    """Test that update() sets focused_child when routing child events."""

    def test_child_event_sets_focused_child(self):
        lst = ["hello", "world"]
        model = init_model(lst, mock_get_visualizer)
        event = make_child_mouse_event('^[0]', 'MouseDown(index=0)')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model.get('focused_child'), '^[0]')

    def test_second_child_event_changes_focus(self):
        lst = ["hello", "world"]
        model = init_model(lst, mock_get_visualizer)
        event1 = make_child_mouse_event('^[0]', 'MouseDown(index=0)')
        model, _ = update(event1, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(model.get('focused_child'), '^[0]')
        event2 = make_child_mouse_event('^[1]', 'MouseDown(index=0)')
        model, _ = update(event2, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(model.get('focused_child'), '^[1]')

    def test_table_cell_event_sets_focused_child(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        composite_key = "0\x00^['name']"
        event = make_child_mouse_event(composite_key, 'MouseDown(index=0)')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model.get('focused_child'), composite_key)


import json
import os
import tempfile
import shutil
from unittest.mock import patch


# === Column management test helpers ===

def make_column_mouse_event(python_event_str, detail=1, buttons=1):
    """Create a mouse down event for column management."""
    return {
        'pythonEventStr': python_event_str,
        'eventJSON': {
            'type': 'mousedown',
            'button': 0,
            'buttons': buttons,
            'detail': detail,
            'offsetY': 5,
            'elementHeight': 20,
            'timeStamp': 1000.0,
        },
    }


def make_column_key_event(key):
    """Create a ColumnKeyDown event."""
    return {
        'pythonEventStr': repr(ColumnKeyDown()),
        'eventJSON': {
            'type': 'keydown',
            'key': key,
            'metaKey': False,
            'shiftKey': False,
            'ctrlKey': False,
            'altKey': False,
        },
    }


def make_column_input_event(value):
    """Create a ColumnInput event."""
    return {
        'pythonEventStr': f"lambda e: ColumnInput(value=e.get('value', ''))",
        'eventJSON': {'type': 'input', 'value': value},
    }


def make_column_mouse_move_event(python_event_str, buttons=1):
    """Create a mouse move event for column drag."""
    return {
        'pythonEventStr': python_event_str,
        'eventJSON': {
            'type': 'mousemove',
            'buttons': buttons,
        },
    }


def make_column_mouse_up_event(python_event_str):
    """Create a mouse up event for column drag."""
    return {
        'pythonEventStr': python_event_str,
        'eventJSON': {
            'type': 'mouseup',
            'buttons': 0,
        },
    }


# === Column management tests ===

class TestColumnManagementInitModel(unittest.TestCase):
    """Test that init_model returns column management fields in table mode."""

    def test_table_mode_has_column_management_fields(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        self.assertIsNone(model['editing_column_index'])
        self.assertFalse(model['adding_column'])
        self.assertEqual(model['column_input_value'], '')
        self.assertIsNone(model['selected_suggestion_index'])
        self.assertIsNone(model['column_drag_from'])
        self.assertIsNone(model['column_drag_over'])

    def test_list_mode_has_column_management_fields(self):
        lst = ["hello", "world"]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'list')
        self.assertIsNone(model['editing_column_index'])
        self.assertFalse(model['adding_column'])
        self.assertEqual(model['column_input_value'], '')

    def test_table_mode_has_own_handled_keys(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        self.assertIn('Enter', model['handledKeys'])
        self.assertIn('Escape', model['handledKeys'])
        self.assertIn('ArrowUp', model['handledKeys'])
        self.assertIn('ArrowDown', model['handledKeys'])
        self.assertIn('Tab', model['handledKeys'])

    def test_no_get_visualizer_has_column_management_fields(self):
        lst = [1, 2, 3]
        model = init_model(lst)
        self.assertIn('editing_column_index', model)
        self.assertIn('adding_column', model)


class TestColumnAdd(unittest.TestCase):
    """Test adding columns to the table."""

    def test_add_column_click_sets_adding_true(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        event = make_column_mouse_event(repr(AddColumnClick()))
        new_model, cmds = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertTrue(new_model['adding_column'])
        self.assertEqual(new_model['column_input_value'], '')
        self.assertIsNone(new_model['editing_column_index'])

    def test_column_select_adds_column_when_adding(self):
        lst = [{'name': 'Alice', 'age': 30, 'city': 'NYC'}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        model['column_input_value'] = "^['ci"
        event = make_column_mouse_event(repr(ColumnSelect(name="^['city']")))
        with patch('list_visualizer.save_columns_to_dotfile'):
            new_model, cmds = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIn("^['city']", new_model['columns'])
        self.assertFalse(new_model['adding_column'])
        self.assertEqual(new_model['column_input_value'], '')

    def test_enter_commits_add_column(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        model['column_input_value'] = "^['age']"
        event = make_column_key_event('Enter')
        with patch('list_visualizer.save_columns_to_dotfile'):
            new_model, cmds = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIn("^['age']", new_model['columns'])
        self.assertFalse(new_model['adding_column'])
        self.assertEqual(new_model['column_input_value'], '')

    def test_enter_with_empty_input_does_not_add(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        original_cols = list(model['columns'])
        model['adding_column'] = True
        model['column_input_value'] = ''
        event = make_column_key_event('Enter')
        new_model, cmds = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['columns'], original_cols)
        self.assertFalse(new_model['adding_column'])

    def test_add_column_saves_dotfile(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        event = make_column_mouse_event(repr(ColumnSelect(name="^['extra']")))
        with patch('list_visualizer.save_columns_to_dotfile') as mock_save:
            new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
            mock_save.assert_called_once()


class TestColumnEdit(unittest.TestCase):
    """Test editing existing columns."""

    def test_double_click_starts_editing(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        event = make_column_mouse_event(repr(ColumnClick(index=0)), detail=2)
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['editing_column_index'], 0)
        self.assertEqual(new_model['column_input_value'], model['columns'][0])
        self.assertFalse(new_model['adding_column'])

    def test_single_click_does_not_start_editing(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        event = make_column_mouse_event(repr(ColumnClick(index=0)), detail=1)
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIsNone(new_model['editing_column_index'])

    def test_column_select_replaces_column_when_editing(self):
        lst = [{'name': 'Alice', 'age': 30, 'city': 'NYC'}]
        model = init_model(lst, mock_get_visualizer)
        model['editing_column_index'] = 0
        model['column_input_value'] = "^['ci"
        old_col = model['columns'][0]
        event = make_column_mouse_event(repr(ColumnSelect(name="^['city']")))
        with patch('list_visualizer.save_columns_to_dotfile'):
            new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['columns'][0], "^['city']")
        self.assertIsNone(new_model['editing_column_index'])

    def test_enter_commits_edit(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        model['editing_column_index'] = 0
        model['column_input_value'] = "^['age']"
        event = make_column_key_event('Enter')
        with patch('list_visualizer.save_columns_to_dotfile'):
            new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['columns'][0], "^['age']")
        self.assertIsNone(new_model['editing_column_index'])

    def test_escape_cancels_edit(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        original_col = model['columns'][0]
        model['editing_column_index'] = 0
        model['column_input_value'] = "^['bogus']"
        event = make_column_key_event('Escape')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIsNone(new_model['editing_column_index'])
        self.assertEqual(new_model['column_input_value'], '')
        self.assertEqual(new_model['columns'][0], original_col)


class TestColumnRemove(unittest.TestCase):
    """Test removing columns."""

    def test_remove_column_removes_from_list(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        self.assertIn("^['name']", model['columns'])
        name_idx = model['columns'].index("^['name']")
        event = make_column_mouse_event(repr(RemoveColumnClick(index=name_idx)))
        with patch('list_visualizer.save_columns_to_dotfile'):
            new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertNotIn("^['name']", new_model['columns'])

    def test_remove_column_saves_dotfile(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        event = make_column_mouse_event(repr(RemoveColumnClick(index=0)))
        with patch('list_visualizer.save_columns_to_dotfile') as mock_save:
            new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
            mock_save.assert_called_once()

    def test_remove_column_cleans_up_children(self):
        lst = [{'name': 'Alice'}, {'name': 'Bob'}]
        model = init_model(lst, mock_get_visualizer)
        name_idx = model['columns'].index("^['name']")
        self.assertIn("0\x00^['name']", model['children'])
        event = make_column_mouse_event(repr(RemoveColumnClick(index=name_idx)))
        with patch('list_visualizer.save_columns_to_dotfile'):
            new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertNotIn("0\x00^['name']", new_model['children'])
        self.assertNotIn("1\x00^['name']", new_model['children'])

    def test_remove_out_of_range_is_noop(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        original_cols = list(model['columns'])
        event = make_column_mouse_event(repr(RemoveColumnClick(index=99)))
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['columns'], original_cols)

    def test_remove_cancels_editing_if_index_matches(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        model['editing_column_index'] = 0
        model['column_input_value'] = "^['name']"
        event = make_column_mouse_event(repr(RemoveColumnClick(index=0)))
        with patch('list_visualizer.save_columns_to_dotfile'):
            new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIsNone(new_model['editing_column_index'])
        self.assertEqual(new_model['column_input_value'], '')

    def test_remove_adjusts_editing_index_when_before_editing(self):
        lst = [{'a': 1, 'b': 2, 'c': 3}]
        model = init_model(lst, mock_get_visualizer)
        model['editing_column_index'] = 2
        model['column_input_value'] = model['columns'][2]
        event = make_column_mouse_event(repr(RemoveColumnClick(index=0)))
        with patch('list_visualizer.save_columns_to_dotfile'):
            new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['editing_column_index'], 1)


class TestColumnReorder(unittest.TestCase):
    """Test drag-and-drop column reordering."""

    def test_drag_start_sets_drag_from(self):
        lst = [{'a': 1, 'b': 2, 'c': 3}]
        model = init_model(lst, mock_get_visualizer)
        event = make_column_mouse_event(repr(ColumnDragStart(index=1)))
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['column_drag_from'], 1)
        self.assertEqual(new_model['column_drag_over'], 1)

    def test_drag_over_sets_drag_over(self):
        lst = [{'a': 1, 'b': 2, 'c': 3}]
        model = init_model(lst, mock_get_visualizer)
        model['column_drag_from'] = 2
        event = make_column_mouse_move_event(repr(ColumnDragOver(index=0)), buttons=1)
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['column_drag_over'], 0)

    def test_drag_over_cancels_on_button_release(self):
        lst = [{'a': 1, 'b': 2}]
        model = init_model(lst, mock_get_visualizer)
        model['column_drag_from'] = 0
        model['column_drag_over'] = 1
        event = make_column_mouse_move_event(repr(ColumnDragOver(index=1)), buttons=0)
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIsNone(new_model['column_drag_from'])
        self.assertIsNone(new_model['column_drag_over'])

    def test_drag_end_reorders_forward(self):
        lst = [{'a': 1, 'b': 2, 'c': 3}]
        model = init_model(lst, mock_get_visualizer)
        original = list(model['columns'])
        model['column_drag_from'] = 0
        model['column_drag_over'] = 2
        event = make_column_mouse_up_event(repr(ColumnDragEnd(index=2)))
        with patch('list_visualizer.save_columns_to_dotfile'):
            new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['columns'][0], original[1])
        self.assertEqual(new_model['columns'][1], original[2])
        self.assertEqual(new_model['columns'][2], original[0])
        self.assertIsNone(new_model['column_drag_from'])
        self.assertIsNone(new_model['column_drag_over'])

    def test_drag_end_reorders_backward(self):
        lst = [{'a': 1, 'b': 2, 'c': 3}]
        model = init_model(lst, mock_get_visualizer)
        original = list(model['columns'])
        model['column_drag_from'] = 2
        model['column_drag_over'] = 0
        event = make_column_mouse_up_event(repr(ColumnDragEnd(index=0)))
        with patch('list_visualizer.save_columns_to_dotfile'):
            new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['columns'][0], original[2])
        self.assertEqual(new_model['columns'][1], original[0])
        self.assertEqual(new_model['columns'][2], original[1])

    def test_drag_end_same_position_is_noop(self):
        lst = [{'a': 1, 'b': 2}]
        model = init_model(lst, mock_get_visualizer)
        original = list(model['columns'])
        model['column_drag_from'] = 0
        model['column_drag_over'] = 0
        event = make_column_mouse_up_event(repr(ColumnDragEnd(index=0)))
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['columns'], original)

    def test_drag_end_saves_dotfile(self):
        lst = [{'a': 1, 'b': 2}]
        model = init_model(lst, mock_get_visualizer)
        model['column_drag_from'] = 0
        model['column_drag_over'] = 1
        event = make_column_mouse_up_event(repr(ColumnDragEnd(index=1)))
        with patch('list_visualizer.save_columns_to_dotfile') as mock_save:
            new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
            mock_save.assert_called_once()

    def test_drag_end_without_drag_is_noop(self):
        lst = [{'a': 1, 'b': 2}]
        model = init_model(lst, mock_get_visualizer)
        original = list(model['columns'])
        event = make_column_mouse_up_event(repr(ColumnDragEnd(index=1)))
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['columns'], original)


class TestColumnKeyboard(unittest.TestCase):
    """Test keyboard interaction in column input."""

    def test_escape_cancels_add(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        model['column_input_value'] = "^['na"
        event = make_column_key_event('Escape')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertFalse(new_model['adding_column'])
        self.assertEqual(new_model['column_input_value'], '')
        self.assertIsNone(new_model['selected_suggestion_index'])

    def test_arrow_down_selects_first_suggestion(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        model['column_input_value'] = ''
        model['columns'] = []
        event = make_column_key_event('ArrowDown')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['selected_suggestion_index'], 0)

    def test_arrow_up_selects_last_suggestion(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        model['column_input_value'] = ''
        model['columns'] = []
        event = make_column_key_event('ArrowUp')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        suggestions = _get_column_suggestions(lst, mock_get_visualizer, [], '')
        expected = min(len(suggestions), 10) - 1
        self.assertEqual(new_model['selected_suggestion_index'], expected)

    def test_arrow_down_wraps_around(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        model['column_input_value'] = ''
        model['columns'] = []
        suggestions = _get_column_suggestions(lst, mock_get_visualizer, [], '')
        last_idx = min(len(suggestions), 10) - 1
        model['selected_suggestion_index'] = last_idx
        event = make_column_key_event('ArrowDown')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['selected_suggestion_index'], 0)

    def test_tab_commits_selected_suggestion(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        model['column_input_value'] = ''
        model['columns'] = []
        suggestions = _get_column_suggestions(lst, mock_get_visualizer, [], '')
        model['selected_suggestion_index'] = 0
        expected_col = suggestions[0]
        event = make_column_key_event('Tab')
        with patch('list_visualizer.save_columns_to_dotfile'):
            new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIn(expected_col, new_model['columns'])
        self.assertFalse(new_model['adding_column'])
        self.assertIsNone(new_model['selected_suggestion_index'])

    def test_arrow_keys_noop_when_not_input_active(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        event = make_column_key_event('ArrowDown')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIsNone(new_model['selected_suggestion_index'])

    def test_column_input_updates_value(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        event = make_column_input_event("^['na")
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['column_input_value'], "^['na")

    def test_column_input_auto_highlights_first_suggestion(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        model['columns'] = []
        event = make_column_input_event("^['n")
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['selected_suggestion_index'], 0)

    def test_column_input_clears_selection_when_no_suggestions(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        model['selected_suggestion_index'] = 0
        event = make_column_input_event("^['zzzzz")
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIsNone(new_model['selected_suggestion_index'])


class TestColumnAutocomplete(unittest.TestCase):
    """Test column autocomplete suggestions."""

    def test_get_all_possible_columns_from_dicts(self):
        lst = [{'name': 'Alice', 'age': 30}, {'name': 'Bob', 'city': 'NYC'}]
        cols = _get_all_possible_columns(lst, mock_get_visualizer)
        self.assertIn("^['name']", cols)
        self.assertIn("^['age']", cols)
        self.assertIn("^['city']", cols)

    def test_get_column_suggestions_filters_existing(self):
        lst = [{'name': 'Alice', 'age': 30}]
        suggestions = _get_column_suggestions(lst, mock_get_visualizer, ["^['name']"], '')
        self.assertNotIn("^['name']", suggestions)
        self.assertIn("^['age']", suggestions)

    def test_get_column_suggestions_filters_by_prefix(self):
        lst = [{'name': 'Alice', 'age': 30}]
        suggestions = _get_column_suggestions(lst, mock_get_visualizer, [], "^['n")
        self.assertIn("^['name']", suggestions)
        self.assertNotIn("^['age']", suggestions)

    def test_get_all_possible_columns_empty_list(self):
        self.assertEqual(_get_all_possible_columns([], mock_get_visualizer), [])

    def test_get_all_possible_columns_from_objects(self):
        class Point:
            def __init__(self, x, y):
                self.x = x
                self.y = y
        lst = [Point(1, 2), Point(3, 4)]
        cols = _get_all_possible_columns(lst, mock_get_visualizer)
        self.assertIn('^.x', cols)
        self.assertIn('^.y', cols)


class TestColumnDotfile(unittest.TestCase):
    """Test dotfile persistence for column configurations."""

    def setUp(self):
        self.orig_cwd = os.getcwd()
        self.tmp_dir = tempfile.mkdtemp()
        os.chdir(self.tmp_dir)

    def tearDown(self):
        os.chdir(self.orig_cwd)
        shutil.rmtree(self.tmp_dir)

    def test_load_columns_missing_file(self):
        result = load_columns_from_dotfile('builtins.dict')
        self.assertIsNone(result)

    def test_save_and_load_columns(self):
        save_columns_to_dotfile('builtins.dict', ["^['name']", "^['age']"])
        result = load_columns_from_dotfile('builtins.dict')
        self.assertEqual(result, ["^['name']", "^['age']"])

    def test_save_preserves_other_types(self):
        save_columns_to_dotfile('type.A', ['^.x'])
        save_columns_to_dotfile('type.B', ['^.y'])
        self.assertEqual(load_columns_from_dotfile('type.A'), ['^.x'])
        self.assertEqual(load_columns_from_dotfile('type.B'), ['^.y'])

    def test_load_corrupt_file(self):
        with open(COLUMN_DOTFILE_NAME, 'w') as f:
            f.write('not json{{{')
        result = load_columns_from_dotfile('builtins.dict')
        self.assertIsNone(result)

    def test_get_item_type_key_for_dict(self):
        self.assertEqual(_get_item_type_key([{'a': 1}]), 'builtins.dict')

    def test_get_item_type_key_for_empty_list(self):
        self.assertIsNone(_get_item_type_key([]))

    def test_get_item_type_key_for_custom_class(self):
        class Foo:
            pass
        key = _get_item_type_key([Foo()])
        self.assertIn('Foo', key)

    def test_init_model_loads_from_dotfile(self):
        save_columns_to_dotfile('builtins.dict', ["^['age']", "^['name']"])
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        self.assertEqual(model['columns'], ["^['age']", "^['name']"])

    def test_init_model_falls_back_when_no_dotfile(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        self.assertIn("^['name']", model['columns'])
        self.assertIn("^['age']", model['columns'])


class TestColumnVisualize(unittest.TestCase):
    """Test HTML rendering of column management controls in table mode."""

    def test_table_has_add_column_button(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('AddColumnClick', output)

    def test_table_headers_have_remove_button(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('RemoveColumnClick(index=0)', output)

    def test_table_headers_have_drag_handle(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('ColumnDragStart(index=0)', output)
        self.assertIn('ColumnDragOver(index=0)', output)
        self.assertIn('ColumnDragEnd(index=0)', output)

    def test_table_headers_have_click_handler(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('ColumnClick(index=0)', output)
        self.assertIn('ColumnClick(index=1)', output)

    def test_table_has_key_down_handler(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('ColumnKeyDown', output)
        self.assertIn('snc-key-down', output)

    def test_table_shows_input_when_adding(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        model['column_input_value'] = "^['na"
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('<input', output)
        self.assertIn('snc-input', output)
        self.assertIn('ColumnInput', output)

    def test_table_shows_input_when_editing(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        model['editing_column_index'] = 0
        model['column_input_value'] = "^['name']"
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('<input', output)
        self.assertIn('snc-select-all', output)

    def test_table_shows_autocomplete_suggestions(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        model['columns'] = []
        model['column_input_value'] = "^['"
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('ColumnSelect', output)
        self.assertIn('snc-dropdown-panel', output)

    def test_input_has_autofocus_when_adding(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        model['adding_column'] = True
        model['column_input_value'] = ''
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('autofocus', output)

    def test_input_has_autofocus_when_editing(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        model['editing_column_index'] = 0
        model['column_input_value'] = "^['name']"
        output = visualize(lst, model, mock_get_visualizer, None)
        self.assertIn('autofocus', output)

    def test_child_events_still_route_in_table_mode(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        composite_key = "0\x00^['name']"
        event = make_child_mouse_event(composite_key, 'MouseDown(index=0)')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        cell_model = new_model['children'].get(composite_key)
        if cell_model and isinstance(cell_model, dict):
            self.assertIn('last_event', cell_model)


class TestColumnManagementInListMode(unittest.TestCase):
    """Verify column management events are no-ops in list mode."""

    def test_add_column_is_noop_in_list_mode(self):
        lst = ["hello", "world"]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'list')
        event = make_column_mouse_event(repr(AddColumnClick()))
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertFalse(new_model.get('adding_column', False))

    def test_remove_column_is_noop_in_list_mode(self):
        lst = ["hello", "world"]
        model = init_model(lst, mock_get_visualizer)
        event = make_column_mouse_event(repr(RemoveColumnClick(index=0)))
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertEqual(new_model['columns'], [])


if __name__ == '__main__':
    unittest.main()
