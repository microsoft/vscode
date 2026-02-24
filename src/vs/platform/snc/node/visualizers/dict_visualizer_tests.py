"""
Tests for dict_visualizer.py get_fields / get_field_value.

Run:
    python3 -m pytest dict_visualizer_tests.py -v
"""

import unittest
from dict_visualizer import get_fields, get_field_value


class TestGetFields(unittest.TestCase):
    def test_string_keys(self):
        d = {'name': 'Alice', 'age': 30}
        self.assertEqual(get_fields(d), ["'name'", "'age'"])

    def test_empty_dict(self):
        self.assertEqual(get_fields({}), [])

    def test_int_keys(self):
        d = {1: 'a', 2: 'b'}
        self.assertEqual(get_fields(d), ['1', '2'])


class TestGetFieldValue(unittest.TestCase):
    def test_string_key(self):
        d = {'name': 'Alice', 'age': 30}
        self.assertEqual(get_field_value(d, "'name'"), 'Alice')
        self.assertEqual(get_field_value(d, "'age'"), 30)

    def test_int_key(self):
        d = {1: 'a', 2: 'b'}
        self.assertEqual(get_field_value(d, '1'), 'a')


if __name__ == '__main__':
    unittest.main()
