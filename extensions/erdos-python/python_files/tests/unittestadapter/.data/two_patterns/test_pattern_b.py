# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import unittest

# Test class for the two file pattern test. This file is pattern test*.py.
# The test_ids_multiple_runs function should return a dictionary with a "success" status,
# and the two tests with their outcome as "success".


class DiscoveryB(unittest.TestCase):
    def test_one_b(self) -> None:
        self.assertGreater(2, 1)

    def test_two_b(self) -> None:
        self.assertNotEqual(2, 1)
