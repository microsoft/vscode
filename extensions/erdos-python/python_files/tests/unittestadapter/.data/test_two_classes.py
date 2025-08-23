# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest

# Test class which runs for the test_multiple_ids_run test with the two class parameters.
# Both test functions will be returned in a dictionary with a "success" status,
# and the two tests with their outcome as "success".


class ClassOne(unittest.TestCase):

    def test_one(self) -> None:
        self.assertGreater(2, 1)

class ClassTwo(unittest.TestCase):

    def test_two(self) -> None:
        self.assertGreater(2, 1)

