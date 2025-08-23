# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest


class DiscoverySimple(unittest.TestCase):
    """Test class for the test_simple_discovery test.

    The discover_tests function should return a dictionary with a "success" status, no errors, and a test tree
    if unittest discovery was performed successfully.
    """

    def test_one(self) -> None:
        self.assertGreater(2, 1)

    def test_two(self) -> None:
        self.assertNotEqual(2, 1)
