# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from even import number_type
import unittest


class TestNumbers(unittest.TestCase):
    def test_odd(self):
        n = number_type(1)
        assert n == "odd"
