"""
Tests for visualizer_utils.py - shared utilities for visualizer composition.

Run:
    python3 -m pytest visualizer_utils_tests.py -v
"""

import unittest
import html

from visualizer_utils import ChildEvent, wrap_child_html, wrap_child_html_parts, route_child_event, aggregate_handled_keys, eval_caret_expr


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
    """Test wrap_child_html wraps child HTML in a span with snc-child-key."""

    def test_wraps_in_span_with_data_attribute(self):
        child_html = '<span snc-mouse-down="MouseDown(index=5)">X</span>'
        wrapped = wrap_child_html(child_html, '0')
        self.assertIn('snc-child-key=', wrapped)
        self.assertTrue(wrapped.startswith('<span '))
        self.assertTrue(wrapped.endswith('</span>'))

    def test_child_html_preserved_inside_wrapper(self):
        child_html = '<span snc-mouse-down="MouseDown(index=5)">X</span>'
        wrapped = wrap_child_html(child_html, '0')
        self.assertIn(child_html, wrapped)

    def test_child_key_repr_in_data_attribute(self):
        """The data attribute should contain the Python repr of the child key."""
        import re
        wrapped = wrap_child_html('<span>X</span>', 'mykey')
        match = re.search(r'snc-child-key="([^"]*)"', wrapped)
        self.assertIsNotNone(match)
        attr_value = html.unescape(match.group(1))
        self.assertEqual(attr_value, repr('mykey'))

    def test_child_key_with_special_chars_is_escaped(self):
        """Keys with HTML-special chars should be properly escaped in the attribute."""
        import re
        wrapped = wrap_child_html('<span>X</span>', '0::field<name>')
        match = re.search(r'snc-child-key="([^"]*)"', wrapped)
        self.assertIsNotNone(match)
        attr_value = html.unescape(match.group(1))
        self.assertEqual(eval(attr_value), '0::field<name>')

    def test_snc_attrs_not_modified(self):
        """snc-* attributes in child HTML should be left untouched."""
        child_html = '<span snc-mouse-down="MouseDown(index=5)">X</span>'
        wrapped = wrap_child_html(child_html, '0')
        self.assertIn('snc-mouse-down="MouseDown(index=5)"', wrapped)

    def test_preserves_all_child_content(self):
        child_html = '<span class="foo" style="color:red" snc-mouse-down="X">hello</span>'
        wrapped = wrap_child_html(child_html, '0')
        self.assertIn('class="foo"', wrapped)
        self.assertIn('style="color:red"', wrapped)
        self.assertIn('>hello</span>', wrapped)

    def test_multiple_elements_preserved(self):
        child_html = '<span snc-mouse-down="A">1</span><span snc-mouse-down="B">2</span>'
        wrapped = wrap_child_html(child_html, '0')
        self.assertIn('snc-mouse-down="A"', wrapped)
        self.assertIn('snc-mouse-down="B"', wrapped)


class TestWrapChildHtmlParts(unittest.TestCase):
    """Test wrap_child_html_parts returns a list that joins to the same result as wrap_child_html."""

    def test_returns_list(self):
        parts = wrap_child_html_parts('<span>X</span>', '0')
        self.assertIsInstance(parts, list)

    def test_joins_to_same_as_wrap_child_html(self):
        child_html = '<span snc-mouse-down="MouseDown(index=5)">X</span>'
        self.assertEqual(''.join(wrap_child_html_parts(child_html, '0')),
                         wrap_child_html(child_html, '0'))

    def test_special_chars_same_as_wrap_child_html(self):
        child_html = '<span>X</span>'
        key = '0::field<name>'
        self.assertEqual(''.join(wrap_child_html_parts(child_html, key)),
                         wrap_child_html(child_html, key))

    def test_complex_child_html_same_as_wrap_child_html(self):
        child_html = '<span class="foo" style="color:red" snc-mouse-down="X">hello</span>'
        self.assertEqual(''.join(wrap_child_html_parts(child_html, 'k')),
                         wrap_child_html(child_html, 'k'))


class TestRouteChildEvent(unittest.TestCase):
    """Test route_child_event dispatches to child visualizers correctly."""

    def _make_mock_visualizer(self, updated_model='updated', commands=None):
        """Create a mock visualizer module with init_model and update."""
        class MockVis:
            def can_visualize(self, value):
                return True
            def init_model(self, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
                return {'mock': True}
            def visualize(self, value, model, get_visualizer):
                return '<span>mock</span>'
            def update(self, event, source_code, source_line, model, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
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
            def init_model(self, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
                return {'handledKeys': keys}
            def visualize(self, value, model, get_visualizer):
                return ''
            def update(self, event, source_code, source_line, model, value, get_visualizer=None, eval_in_scope=None, source_expr=None):
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


class TestEvalCaretExpr(unittest.TestCase):
    """Test eval_caret_expr: shared field evaluation using ^ expressions."""

    def test_simple_attribute_fallback(self):
        class Obj:
            x = 42
        self.assertEqual(eval_caret_expr('^.x', Obj()), 42)

    def test_index_access_fallback(self):
        self.assertEqual(eval_caret_expr('^[1]', [10, 20, 30]), 20)

    def test_dict_key_access_fallback(self):
        self.assertEqual(eval_caret_expr("^['name']", {'name': 'Alice'}), 'Alice')

    def test_method_call_fallback(self):
        self.assertEqual(eval_caret_expr('^.upper()', 'hello'), 'HELLO')

    def test_chained_access_fallback(self):
        class Inner:
            val = 99
        class Outer:
            child = Inner()
        self.assertEqual(eval_caret_expr('^.child.val', Outer()), 99)

    def test_uses_eval_in_scope_when_both_provided(self):
        _my_var = [10, 20, 30]
        eis = lambda expr: eval(expr)
        result = eval_caret_expr('^[2]', _my_var, eval_in_scope=eis, source_expr='_my_var')
        self.assertEqual(result, 30)

    def test_eval_in_scope_with_nested_source_expr(self):
        _my_var = [[1, 2], [3, 4]]
        eis = lambda expr: eval(expr)
        result = eval_caret_expr('^[0]', _my_var[1], eval_in_scope=eis, source_expr='_my_var[1]')
        self.assertEqual(result, 3)

    def test_falls_back_when_eval_in_scope_none(self):
        self.assertEqual(eval_caret_expr('^[0]', [42], eval_in_scope=None, source_expr='x'), 42)

    def test_falls_back_when_source_expr_none(self):
        eis = lambda expr: eval(expr)
        self.assertEqual(eval_caret_expr('^[0]', [42], eval_in_scope=eis, source_expr=None), 42)

    def test_error_propagates(self):
        with self.assertRaises(Exception):
            eval_caret_expr('^.nonexistent', 42)


if __name__ == '__main__':
    unittest.main()
