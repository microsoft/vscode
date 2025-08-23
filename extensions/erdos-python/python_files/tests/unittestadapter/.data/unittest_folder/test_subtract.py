# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import unittest

# Test class which runs for the test_multiple_ids_run test with the two test
# files in the same folder. The cwd is set to the parent folder. This should return
# a dictionary with a "success" status and the two tests with their outcome as "success".


def subtract(a, b):
    return a - b


class TestSubtractFunction(unittest.TestCase):
    def test_subtract_positive_numbers(self):
        result = subtract(5, 3)
        self.assertEqual(result, 2)

    def test_subtract_negative_numbers(self):
        result = subtract(-2, -3)
        self.assertEqual(result, 1)
