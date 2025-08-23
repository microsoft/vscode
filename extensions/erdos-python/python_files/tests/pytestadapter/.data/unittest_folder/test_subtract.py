# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import unittest


def subtract(a, b):
    return a - b


class TestSubtractFunction(unittest.TestCase):
    # This test's id is unittest_folder/test_subtract.py::TestSubtractFunction::test_subtract_positive_numbers.
    # This test passes.
    def test_subtract_positive_numbers(  # test_marker--test_subtract_positive_numbers
        self,
    ):
        result = subtract(5, 3)
        self.assertEqual(result, 2)

    # This test's id is unittest_folder/test_subtract.py::TestSubtractFunction::test_subtract_negative_numbers.
    # This test passes.
    def test_subtract_negative_numbers(  # test_marker--test_subtract_negative_numbers
        self,
    ):
        result = subtract(-2, -3)
        # This is intentional to test assertion failures
        self.assertEqual(result, 100000)


class TestDuplicateFunction(unittest.TestCase):
    # This test's id is unittest_folder/test_subtract.py::TestDuplicateFunction::test_dup_s. It has the same class name as
    # another test, but it's in a different file, so it should not be confused.
    # This test passes.
    def test_dup_s(self):  # test_marker--test_dup_s
        self.assertEqual(1, 1)
