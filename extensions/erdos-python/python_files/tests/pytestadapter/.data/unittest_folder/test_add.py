# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import unittest


def add(a, b):
    return a + b


class TestAddFunction(unittest.TestCase):
    # This test's id is unittest_folder/test_add.py::TestAddFunction::test_add_positive_numbers.
    # This test passes.
    def test_add_positive_numbers(self):  # test_marker--test_add_positive_numbers
        result = add(2, 3)
        self.assertEqual(result, 5)

    # This test's id is unittest_folder/test_add.py::TestAddFunction::test_add_negative_numbers.
    # This test passes.
    def test_add_negative_numbers(self):  # test_marker--test_add_negative_numbers
        result = add(-2, -3)
        self.assertEqual(result, -5)


class TestDuplicateFunction(unittest.TestCase):
    # This test's id is unittest_folder/test_subtract.py::TestDuplicateFunction::test_dup_a. It has the same class name as
    # another test, but it's in a different file, so it should not be confused.
    # This test passes.
    def test_dup_a(self):  # test_marker--test_dup_a
        self.assertEqual(1, 1)
