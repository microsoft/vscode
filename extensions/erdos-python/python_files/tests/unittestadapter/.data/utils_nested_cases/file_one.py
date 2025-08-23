# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest


class CaseTwoFileOne(unittest.TestCase):
    """Test class for the test_nested_test_cases test.

    get_test_case should return tests from the test suites in this folder.
    """

    def test_one(self) -> None:
        self.assertGreater(2, 1)

    def test_two(self) -> None:
        self.assertNotEqual(2, 1)
