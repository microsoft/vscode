# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest


class CaseOne(unittest.TestCase):
    """Test class for the test_simple_test_cases test.

    get_test_case should return tests from the test suite.
    """

    def test_one(self) -> None:
        self.assertGreater(2, 1)

    def test_two(self) -> None:
        self.assertNotEqual(2, 1)
