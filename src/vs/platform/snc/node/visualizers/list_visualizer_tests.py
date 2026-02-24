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


class ListVisualizerAdapter:
    """Wraps the list_visualizer module to act like a visualizer object."""
    def can_visualize(self, value):
        return list_visualizer.can_visualize(value)
    def init_model(self, value, get_visualizer=None):
        return list_visualizer.init_model(value, get_visualizer)
    def visualize(self, value, model, get_visualizer):
        return list_visualizer.visualize(value, model, get_visualizer)
    def update(self, event, source_code, source_line, model, value, get_visualizer=None):
        return list_visualizer.update(event, source_code, source_line, model, value, get_visualizer)


_mock_string_vis = MockStringVisualizer()
_mock_int_vis = MockIntVisualizer()
_mock_list_vis = ListVisualizerAdapter()


def mock_get_visualizer(value):
    if isinstance(value, list):
        return _mock_list_vis
    if isinstance(value, str):
        return _mock_string_vis
    return _mock_int_vis


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

    def test_nested_list_init_model(self):
        lst = [[1, 2], [3, 4]]
        model = init_model(lst, mock_get_visualizer)
        self.assertIn('0', model['children'])
        self.assertIn('1', model['children'])
        # Children should also have 'children' since they're lists
        self.assertIn('children', model['children']['0'])
        self.assertIn('children', model['children']['1'])

    def test_nested_list_visualize(self):
        """Inner list items (ints) have no snc-* attrs, but strings do."""
        lst = [["hello"], [3, 4]]
        model = init_model(lst, mock_get_visualizer)
        output = visualize(lst, model, mock_get_visualizer)
        # The outer list wraps child list HTML -> ChildEvent at outer level
        self.assertIn('ChildEvent', output)
        self.assertIn('hello', output)


if __name__ == '__main__':
    unittest.main()
