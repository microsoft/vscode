# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest


class DiscoveryEmpty(unittest.TestCase):
    """Test class for the test_empty_discovery test.

    The discover_tests function should return a dictionary with a "success" status, no errors, and no test tree
    if unittest discovery was performed successfully but no tests were found.
    """

    def something(self) -> bool:
        return True
