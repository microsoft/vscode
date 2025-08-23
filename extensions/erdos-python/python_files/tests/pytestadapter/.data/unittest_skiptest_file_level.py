# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest
from unittest import SkipTest

# Due to the skip at the file level, no tests will be discovered.
raise SkipTest("Skip all tests in this file, they should not be recognized by pytest.")


class SimpleTest(unittest.TestCase):
    def testadd1(self):
        assert True
