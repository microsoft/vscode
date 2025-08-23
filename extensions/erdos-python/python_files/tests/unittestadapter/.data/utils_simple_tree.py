# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest


class TreeOne(unittest.TestCase):
    """Test class for the test_build_simple_tree test.

    build_test_tree should build a test tree with these test cases.
    """

    def test_one(self) -> None:
        self.assertGreater(2, 1)

    def test_two(self) -> None:
        self.assertNotEqual(2, 1)
