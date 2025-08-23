# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import unittest

# Test class which runs for the test_multiple_ids_run test with the two test
# files in the same folder. The cwd is set to the parent folder. This should return
# a dictionary with a "success" status and the two tests with their outcome as "success".


def add(a, b):
    return a + b


class TestAddFunction(unittest.TestCase):
    def test_add_positive_numbers(self):
        result = add(2, 3)
        self.assertEqual(result, 5)

    def test_add_negative_numbers(self):
        result = add(-2, -3)
        self.assertEqual(result, -5)
