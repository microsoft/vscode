# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest
import ctypes

ctypes.string_at(0)  # Dereference a NULL pointer


class TestSegmentationFault(unittest.TestCase):
    def test_segfault(self):
        assert True


if __name__ == "__main__":
    unittest.main()
