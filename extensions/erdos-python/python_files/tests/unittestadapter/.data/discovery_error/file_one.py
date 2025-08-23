# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest

import something_else  # type: ignore # noqa: F401


class DiscoveryErrorOne(unittest.TestCase):
    """Test class for the test_error_discovery test.

    The discover_tests function should return a dictionary with an "error" status, the discovered tests, and a list of errors
    if unittest discovery failed at some point.
    """

    def test_one(self) -> None:
        self.assertGreater(2, 1)

    def test_two(self) -> None:
        self.assertNotEqual(2, 1)
