# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest

# Test class for the test_fail_simple test.
# The test_failed_tests function should return a dictionary with a "success" status
# and the two tests with their outcome as "failed".

class RunFailSimple(unittest.TestCase):
    """Test class for the test_fail_simple test.

    The test_failed_tests function should return a dictionary with a "success" status
    and the two tests with their outcome as "failed".
    """

    def test_one_fail(self) -> None:
        self.assertGreater(2, 3)

    def test_two_fail(self) -> None:
        self.assertNotEqual(1, 1)
