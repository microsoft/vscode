# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest

# Test class for the test_subtest_run test.
# The test_failed_tests function should return a dictionary that has a "success" status
# and the "result" value is a dict with 6 entries, one for each subtest.


class NumbersTest(unittest.TestCase):
    def test_even(self):
        """
        Test that numbers between 0 and 5 are all even.
        """
        for i in range(0, 6):
            with self.subTest(i=i):
                self.assertEqual(i % 2, 0)
