"""
Tests for dict_visualizer.py get_fields and eval_caret_expr integration.

Run:
    python3 -m pytest dict_visualizer_tests.py -v
"""

import unittest
from dict_visualizer import get_fields
from visualizer_utils import eval_caret_expr


class TestGetFields(unittest.TestCase):
    def test_string_keys(self):
        d = {'name': 'Alice', 'age': 30}
        self.assertEqual(get_fields(d), ["^['name']", "^['age']"])

    def test_empty_dict(self):
        self.assertEqual(get_fields({}), [])

    def test_int_keys(self):
        d = {1: 'a', 2: 'b'}
        self.assertEqual(get_fields(d), ["^[1]", "^[2]"])


class TestDictEvalCaretExpr(unittest.TestCase):
    """Verify that get_fields output works with eval_caret_expr."""

    def test_string_key_roundtrip(self):
        d = {'name': 'Alice', 'age': 30}
        fields = get_fields(d)
        self.assertEqual(eval_caret_expr(fields[0], d), 'Alice')
        self.assertEqual(eval_caret_expr(fields[1], d), 30)

    def test_int_key_roundtrip(self):
        d = {1: 'a', 2: 'b'}
        fields = get_fields(d)
        self.assertEqual(eval_caret_expr(fields[0], d), 'a')
        self.assertEqual(eval_caret_expr(fields[1], d), 'b')

    def test_tuple_key_roundtrip(self):
        d = {(1, 2): 'pair'}
        fields = get_fields(d)
        self.assertEqual(eval_caret_expr(fields[0], d), 'pair')


if __name__ == '__main__':
    unittest.main()
