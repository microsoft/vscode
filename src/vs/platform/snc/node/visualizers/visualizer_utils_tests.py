"""
Tests for visualizer_utils.py - shared utilities for visualizer composition.

Run:
    python3 -m pytest visualizer_utils_tests.py -v
"""

import unittest
import html

from visualizer_utils import ChildEvent, wrap_child_html, route_child_event, aggregate_handled_keys


class TestChildEvent(unittest.TestCase):
    """Test ChildEvent dataclass basics."""

    def test_child_event_fields(self):
        ev = ChildEvent(child_key='0', py_ev_str='MouseDown(index=5)')
        self.assertEqual(ev.child_key, '0')
        self.assertEqual(ev.py_ev_str, 'MouseDown(index=5)')

    def test_child_event_is_frozen(self):
        ev = ChildEvent(child_key='0', py_ev_str='MouseDown(index=5)')
        with self.assertRaises(AttributeError):
            ev.child_key = '1'

    def test_child_event_repr_evals_back(self):
        ev = ChildEvent(child_key='abc', py_ev_str='KeyDown()')
        reconstructed = eval(repr(ev))
        self.assertEqual(reconstructed, ev)


class TestWrapChildHtml(unittest.TestCase):
    """Test wrap_child_html rewrites snc-* attributes correctly."""

    def test_wraps_simple_repr_value(self):
        child_html = '<span snc-mouse-down="MouseDown(index=5)">X</span>'
        wrapped = wrap_child_html(child_html, '0')
        self.assertIn('ChildEvent', wrapped)
        self.assertNotIn('snc-mouse-down="MouseDown(index=5)"', wrapped)

    def test_wrapped_attr_evals_to_child_event(self):
        child_html = '<span snc-mouse-down="MouseDown(index=5)">X</span>'
        wrapped = wrap_child_html(child_html, '0')
        # Extract attribute value and unescape
        import re
        match = re.search(r'snc-mouse-down="([^"]*)"', wrapped)
        self.assertIsNotNone(match)
        attr_value = html.unescape(match.group(1))
        result = eval(attr_value)
        self.assertIsInstance(result, ChildEvent)
        self.assertEqual(result.child_key, '0')
        self.assertEqual(result.py_ev_str, 'MouseDown(index=5)')

    def test_wraps_html_escaped_value(self):
        """Attribute values are HTML-escaped in real visualizer output."""
        inner_expr = "MouseDown(index=5)"
        child_html = f'<span snc-mouse-down="{html.escape(inner_expr)}">X</span>'
        wrapped = wrap_child_html(child_html, '0')
        import re
        match = re.search(r'snc-mouse-down="([^"]*)"', wrapped)
        attr_value = html.unescape(match.group(1))
        result = eval(attr_value)
        self.assertEqual(result.py_ev_str, 'MouseDown(index=5)')

    def test_wraps_lambda_expression(self):
        """Lambda expressions (used by snc-input) should survive wrapping."""
        inner_expr = "lambda e: FieldInput(value=e.get('value', ''))"
        child_html = f'<input snc-input="{html.escape(inner_expr)}" />'
        wrapped = wrap_child_html(child_html, 'mykey')
        import re
        match = re.search(r'snc-input="([^"]*)"', wrapped)
        self.assertIsNotNone(match)
        attr_value = html.unescape(match.group(1))
        result = eval(attr_value)
        self.assertIsInstance(result, ChildEvent)
        self.assertEqual(result.child_key, 'mykey')
        self.assertEqual(result.py_ev_str, inner_expr)

    def test_wraps_all_snc_attrs(self):
        """All five snc-* attribute types should be wrapped."""
        child_html = (
            '<span'
            ' snc-mouse-down="A"'
            ' snc-mouse-move="B"'
            ' snc-mouse-up="C"'
            '>X</span>'
            '<div snc-key-down="D" snc-input="E"></div>'
        )
        wrapped = wrap_child_html(child_html, '0')
        for attr_name in ['snc-mouse-down', 'snc-mouse-move', 'snc-mouse-up', 'snc-key-down', 'snc-input']:
            self.assertIn(f'{attr_name}=', wrapped)
        # None should have the raw unwrapped values
        for raw_val in ['="A"', '="B"', '="C"', '="D"', '="E"']:
            self.assertNotIn(raw_val, wrapped)

    def test_preserves_non_snc_attributes(self):
        """Non-snc attributes and regular content should not be modified."""
        child_html = '<span class="foo" style="color:red" snc-mouse-down="X">hello</span>'
        wrapped = wrap_child_html(child_html, '0')
        self.assertIn('class="foo"', wrapped)
        self.assertIn('style="color:red"', wrapped)
        self.assertIn('>hello</span>', wrapped)

    def test_expression_with_double_quotes(self):
        """Expressions containing double quotes should be handled via repr escaping."""
        inner_expr = 'lambda e: Foo(x="bar")'
        child_html = f'<span snc-mouse-down="{html.escape(inner_expr)}">X</span>'
        wrapped = wrap_child_html(child_html, '0')
        import re
        match = re.search(r'snc-mouse-down="([^"]*)"', wrapped)
        self.assertIsNotNone(match)
        attr_value = html.unescape(match.group(1))
        result = eval(attr_value)
        self.assertEqual(result.py_ev_str, inner_expr)

    def test_no_snc_attrs_returns_unchanged(self):
        child_html = '<span class="foo">bar</span>'
        wrapped = wrap_child_html(child_html, '0')
        self.assertEqual(wrapped, child_html)

    def test_multiple_elements_with_same_attr(self):
        """Multiple elements with the same snc-* attr should all be wrapped."""
        child_html = '<span snc-mouse-down="A">1</span><span snc-mouse-down="B">2</span>'
        wrapped = wrap_child_html(child_html, '0')
        import re
        matches = re.findall(r'snc-mouse-down="([^"]*)"', wrapped)
        self.assertEqual(len(matches), 2)
        result_a = eval(html.unescape(matches[0]))
        result_b = eval(html.unescape(matches[1]))
        self.assertEqual(result_a.py_ev_str, 'A')
        self.assertEqual(result_b.py_ev_str, 'B')


class TestRouteChildEvent(unittest.TestCase):
    """Test route_child_event dispatches to child visualizers correctly."""

    def _make_mock_visualizer(self, updated_model='updated', commands=None):
        """Create a mock visualizer module with init_model and update."""
        class MockVis:
            def can_visualize(self, value):
                return True
            def init_model(self, value, get_visualizer=None):
                return {'mock': True}
            def visualize(self, value, model, get_visualizer):
                return '<span>mock</span>'
            def update(self, event, source_code, source_line, model, value, get_visualizer=None):
                return (updated_model, commands or [])
        return MockVis()

    def _make_get_visualizer(self, vis):
        return lambda value: vis

    def test_routes_to_child_and_updates_model(self):
        mock_vis = self._make_mock_visualizer(updated_model='child_updated')
        get_vis = self._make_get_visualizer(mock_vis)

        model = {'children': {'0': 'old_child_model'}, 'handledKeys': []}
        event = {
            'pythonEventStr': "ChildEvent('0', 'SomeEvent()')",
            'eventJSON': {'type': 'mousedown'}
        }
        value = ['item0', 'item1']

        def child_value_getter(key):
            return value[int(key)]

        new_model, commands = route_child_event(
            event, model, value, child_value_getter, get_vis,
            source_code='x = [1,2]', source_line=1
        )
        self.assertEqual(new_model['children']['0'], 'child_updated')

    def test_initializes_missing_child_model(self):
        mock_vis = self._make_mock_visualizer(updated_model='new_child')
        get_vis = self._make_get_visualizer(mock_vis)

        model = {'children': {}, 'handledKeys': []}
        event = {
            'pythonEventStr': "ChildEvent('0', 'SomeEvent()')",
            'eventJSON': {'type': 'mousedown'}
        }
        value = ['item0']

        new_model, commands = route_child_event(
            event, model, value, lambda k: value[int(k)], get_vis,
            source_code='', source_line=1
        )
        self.assertEqual(new_model['children']['0'], 'new_child')

    def test_returns_child_commands(self):
        mock_vis = self._make_mock_visualizer(commands=['cmd1', 'cmd2'])
        get_vis = self._make_get_visualizer(mock_vis)

        model = {'children': {'0': 'some_model'}, 'handledKeys': []}
        event = {
            'pythonEventStr': "ChildEvent('0', 'SomeEvent()')",
            'eventJSON': {'type': 'mousedown'}
        }
        value = ['item0']

        _, commands = route_child_event(
            event, model, value, lambda k: value[int(k)], get_vis,
            source_code='', source_line=1
        )
        self.assertEqual(commands, ['cmd1', 'cmd2'])


class TestAggregateHandledKeys(unittest.TestCase):
    """Test aggregate_handled_keys merges child handledKeys."""

    def _make_vis_with_keys(self, keys):
        class Vis:
            def can_visualize(self, value):
                return True
            def init_model(self, value, get_visualizer=None):
                return {'handledKeys': keys}
            def visualize(self, value, model, get_visualizer):
                return ''
            def update(self, event, source_code, source_line, model, value, get_visualizer=None):
                return (model, [])
        return Vis()

    def test_aggregates_from_children_models(self):
        children_models = {
            '0': {'handledKeys': ['Enter', 'Escape']},
            '1': {'handledKeys': ['Escape', 'Tab']},
        }
        result = aggregate_handled_keys(children_models, own_keys=[])
        self.assertIn('Enter', result)
        self.assertIn('Escape', result)
        self.assertIn('Tab', result)

    def test_includes_own_keys(self):
        children_models = {
            '0': {'handledKeys': ['Enter']},
        }
        result = aggregate_handled_keys(children_models, own_keys=['Backspace'])
        self.assertIn('Enter', result)
        self.assertIn('Backspace', result)

    def test_empty_children(self):
        result = aggregate_handled_keys({}, own_keys=['Escape'])
        self.assertEqual(result, ['Escape'])

    def test_child_without_handled_keys(self):
        children_models = {
            '0': {'some_other_field': 'val'},
            '1': {'handledKeys': ['Enter']},
        }
        result = aggregate_handled_keys(children_models, own_keys=[])
        self.assertIn('Enter', result)

    def test_no_duplicates(self):
        children_models = {
            '0': {'handledKeys': ['Enter', 'Escape']},
            '1': {'handledKeys': ['Enter', 'Tab']},
        }
        result = aggregate_handled_keys(children_models, own_keys=['Enter'])
        self.assertEqual(result.count('Enter'), 1)


if __name__ == '__main__':
    unittest.main()
