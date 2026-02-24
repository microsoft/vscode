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
from list_visualizer import can_visualize, init_model, visualize, update


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
    def init_model(self, value, get_visualizer=None):
        return {'selection': None, 'handledKeys': ['Escape', 'Enter']}
    def visualize(self, value, model, get_visualizer):
        return f'<span snc-mouse-down="MouseDown(index=0)">{html.escape(value)}</span>'
    def update(self, event, source_code, source_line, model, value, get_visualizer=None):
        model = dict(model)
        model['last_event'] = event['pythonEventStr']
        return (model, [])


class MockIntVisualizer:
    """Mimics a simple int visualizer (no interactive model)."""
    def can_visualize(self, value):
        return isinstance(value, int)
    def init_model(self, value, get_visualizer=None):
        return None
    def visualize(self, value, model, get_visualizer):
        return f'<span>{value}</span>'
    def update(self, event, source_code, source_line, model, value, get_visualizer=None):
        return (model, [])


class MockDictVisualizer:
    """Mimics a dict visualizer with get_fields support."""
    def can_visualize(self, value):
        return isinstance(value, dict)
    def get_fields(self, value):
        return [repr(k) for k in value.keys()]
    def get_field_value(self, value, field):
        return value[eval(field)]
    def init_model(self, value, get_visualizer=None):
        return None
    def visualize(self, value, model, get_visualizer):
        return f'<span>{html.escape(repr(value))}</span>'
    def update(self, event, source_code, source_line, model, value, get_visualizer=None):
        return (model, [])


class MockObjectVisualizer:
    """Mimics an object visualizer with get_fields support."""
    def can_visualize(self, value):
        return True
    def get_fields(self, value):
        if value is None or isinstance(value, (int, float)):
            return None
        names = sorted([name for name in dir(value) if not name.startswith('_')])
        return [f'.{name}' for name in names]
    def get_field_value(self, value, field):
        try:
            return getattr(value, field[1:])
        except Exception:
            return None
    def init_model(self, value, get_visualizer=None):
        return None
    def visualize(self, value, model, get_visualizer):
        return f'<span>{html.escape(repr(value))}</span>'
    def update(self, event, source_code, source_line, model, value, get_visualizer=None):
        return (model, [])


class ListVisualizerAdapter:
    """Wraps the list_visualizer module to act like a visualizer object."""
    def can_visualize(self, value):
        return list_visualizer.can_visualize(value)
    def get_fields(self, value):
        return list_visualizer.get_fields(value)
    def get_field_value(self, value, field):
        return list_visualizer.get_field_value(value, field)
    def init_model(self, value, get_visualizer=None):
        return list_visualizer.init_model(value, get_visualizer)
    def visualize(self, value, model, get_visualizer):
        return list_visualizer.visualize(value, model, get_visualizer)
    def update(self, event, source_code, source_line, model, value, get_visualizer=None):
        return list_visualizer.update(event, source_code, source_line, model, value, get_visualizer)


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
        self.assertIn('0', model['children'])
        self.assertIn('1', model['children'])

    def test_child_models_come_from_child_visualizer(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        child_model = model['children']['0']
        self.assertEqual(child_model, _mock_string_vis.init_model("hello"))

    def test_int_child_model(self):
        lst = [42]
        model = init_model(lst, mock_get_visualizer)
        self.assertIsNone(model['children']['0'])

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
        output = visualize(lst, model, mock_get_visualizer)
        self.assertIn('ChildEvent', output)

    def test_child_html_is_wrapped_with_correct_key(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        matches = re.findall(r'snc-mouse-down="([^"]*)"', output)
        self.assertTrue(len(matches) > 0)
        attr_value = html.unescape(matches[0])
        result = eval(attr_value)
        self.assertIsInstance(result, ChildEvent)
        self.assertEqual(result.child_key, '0')

    def test_multiple_items_have_different_keys(self):
        lst = ["a", "b"]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        matches = re.findall(r'snc-mouse-down="([^"]*)"', output)
        keys = set()
        for m in matches:
            result = eval(html.unescape(m))
            keys.add(result.child_key)
        self.assertIn('0', keys)
        self.assertIn('1', keys)

    def test_contains_child_content(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        self.assertIn('hello', output)

    def test_brackets_present(self):
        lst = [42]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        self.assertIn('[', output)
        self.assertIn(']', output)

    def test_empty_list(self):
        lst = []
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        self.assertIn('[', output)
        self.assertIn(']', output)


class TestUpdate(unittest.TestCase):
    def test_child_event_routes_to_child_visualizer(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        event = make_child_mouse_event('0', 'MouseDown(index=0)')
        new_model, commands = update(event, 'x = ["hello"]', 1, model, lst, mock_get_visualizer)
        child_model = new_model['children']['0']
        self.assertIn('last_event', child_model)

    def test_child_event_preserves_other_children(self):
        lst = ["hello", "world"]
        model = init_model(lst, mock_get_visualizer)
        event = make_child_mouse_event('0', 'MouseDown(index=0)')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIn('1', new_model['children'])
        self.assertNotIn('last_event', new_model['children']['1'])

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
            def init_model(self, v, get_visualizer=None): return {}
            def visualize(self, v, m, gv): return '<span snc-mouse-down="X">x</span>'
            def update(self, event, sc, sl, model, value, gv=None):
                return (model, ['test_command'])

        cmd_vis = CmdVis()
        get_vis = lambda v: cmd_vis

        lst = ["x"]
        model = init_model(lst, get_vis)
        event = make_child_mouse_event('0', 'X')
        _, commands = update(event, '', 1, model, lst, get_vis)
        self.assertIn('test_command', commands)

    def test_handled_keys_updated_after_child_event(self):
        lst = ["hello"]
        model = init_model(lst, mock_get_visualizer)
        event = make_child_mouse_event('0', 'MouseDown(index=0)')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        self.assertIn('handledKeys', new_model)


class TestNestedComposition(unittest.TestCase):
    """Test list of lists works (nested composition)."""

    def test_nested_list_is_table_mode(self):
        lst = [[1, 2], [3, 4]]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        self.assertEqual(model['columns'], ['0', '1'])
        self.assertIn('0\x000', model['children'])
        self.assertIn('0\x001', model['children'])
        self.assertIn('1\x000', model['children'])
        self.assertIn('1\x001', model['children'])


class TestGetFields(unittest.TestCase):
    """Test get_fields / get_field_value on list_visualizer."""

    def test_returns_string_indices(self):
        from list_visualizer import get_fields
        self.assertEqual(get_fields([10, 20, 30]), ['0', '1', '2'])

    def test_empty_list(self):
        from list_visualizer import get_fields
        self.assertEqual(get_fields([]), [])

    def test_get_field_value(self):
        from list_visualizer import get_field_value
        lst = [10, 20, 30]
        self.assertEqual(get_field_value(lst, '0'), 10)
        self.assertEqual(get_field_value(lst, '2'), 30)


class TestTableDetection(unittest.TestCase):
    """Test that init_model detects table mode for homogeneous lists."""

    def test_list_of_dicts_is_table_mode(self):
        lst = [{'name': 'Alice', 'age': 30}, {'name': 'Bob', 'age': 25}]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        self.assertIn("'name'", model['columns'])
        self.assertIn("'age'", model['columns'])

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
        self.assertEqual(model['columns'], ['0', '1', '2'])

    def test_mixed_types_is_list_mode(self):
        lst = ["hello", 42]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'list')

    def test_union_columns_from_different_field_sets(self):
        lst = [{'a': 1, 'b': 2}, {'b': 3, 'c': 4}]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        cols = model['columns']
        self.assertIn("'a'", cols)
        self.assertIn("'b'", cols)
        self.assertIn("'c'", cols)

    def test_list_of_objects_is_table_mode(self):
        class Point:
            def __init__(self, x, y):
                self.x = x
                self.y = y
        lst = [Point(1, 2), Point(3, 4)]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        self.assertIn('.x', model['columns'])
        self.assertIn('.y', model['columns'])

    def test_single_item_list_of_dicts_is_table_mode(self):
        lst = [{'x': 1}]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')

    def test_table_mode_has_cell_children(self):
        """In table mode, children are keyed by composite row\\x00field keys."""
        lst = [{'name': 'Alice'}, {'name': 'Bob'}]
        model = init_model(lst, mock_get_visualizer)
        self.assertEqual(model['display_mode'], 'table')
        self.assertIn("0\x00'name'", model['children'])
        self.assertIn("1\x00'name'", model['children'])


class TestTableRendering(unittest.TestCase):
    """Test that visualize() renders HTML tables correctly in table mode."""

    def test_renders_table_element(self):
        lst = [{'name': 'Alice'}, {'name': 'Bob'}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        self.assertIn('<table', output)
        self.assertIn('</table>', output)

    def test_renders_column_headers(self):
        lst = [{'name': 'Alice', 'age': 30}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        unescaped = html.unescape(output)
        self.assertIn("'name'", unescaped)
        self.assertIn("'age'", unescaped)
        self.assertIn('<th', output)

    def test_renders_row_index_column(self):
        lst = [{'x': 1}, {'x': 2}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        # Row indices should appear
        self.assertIn('0', output)
        self.assertIn('1', output)

    def test_renders_cell_content(self):
        lst = [{'name': 'Alice'}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        self.assertIn('Alice', output)

    def test_cell_html_wrapped_with_composite_key(self):
        """Cell HTML should have snc events wrapped with composite ChildEvent keys."""
        lst = [{'name': 'test_str'}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        # The string visualizer mock emits snc-mouse-down, which should be wrapped
        # with a ChildEvent using the composite key
        matches = re.findall(r'snc-mouse-down="([^"]*)"', output)
        found_composite = False
        for m in matches:
            result = eval(html.unescape(m))
            if isinstance(result, ChildEvent) and '\x00' in result.child_key:
                found_composite = True
                break
        self.assertTrue(found_composite, "Expected composite key ChildEvent in cell HTML")

    def test_missing_field_renders_empty_cell(self):
        lst = [{'a': 1}, {'b': 2}]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        unescaped = html.unescape(output)
        self.assertIn("'a'", unescaped)
        self.assertIn("'b'", unescaped)
        self.assertIn('<td style="padding:0 8px;"></td>', output) # missing cell

    def test_list_mode_still_uses_brackets(self):
        lst = ["hello", "world"]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        self.assertIn('[', output)
        self.assertIn(']', output)
        self.assertNotIn('<table', output)

    def test_list_of_lists_renders_table(self):
        lst = [[1, 2], [3, 4]]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        self.assertIn('<table', output)
        self.assertIn('1', output)
        self.assertIn('4', output)


class TestTableEventRouting(unittest.TestCase):
    """Test that update() routes events to the correct cell in table mode."""

    def test_cell_event_routes_to_correct_cell(self):
        lst = [{'name': 'Alice'}, {'name': 'Bob'}]
        model = init_model(lst, mock_get_visualizer)
        composite_key = "0\x00'name'"
        event = make_child_mouse_event(composite_key, 'MouseDown(index=0)')
        new_model, commands = update(event, '', 1, model, lst, mock_get_visualizer)
        cell_model = new_model['children'][composite_key]
        self.assertIn('last_event', cell_model)

    def test_cell_event_preserves_other_cells(self):
        lst = [{'name': 'Alice'}, {'name': 'Bob'}]
        model = init_model(lst, mock_get_visualizer)
        event = make_child_mouse_event("0\x00'name'", 'MouseDown(index=0)')
        new_model, _ = update(event, '', 1, model, lst, mock_get_visualizer)
        bob_key = "1\x00'name'"
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
            def init_model(self, v, get_visualizer=None): return {}
            def visualize(self, v, m, gv): return '<span snc-mouse-down="X">x</span>'
            def update(self, event, sc, sl, model, value, gv=None):
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
        event = make_child_mouse_event("0\x00'k'", 'X')
        _, commands = update(event, '', 1, model, lst, get_vis)
        self.assertIn('table_cmd', commands)


if __name__ == '__main__':
    unittest.main()
