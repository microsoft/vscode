# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest
import ctypes


class TestSegmentationFault(unittest.TestCase):
    def cause_segfault(self):
        print("Causing a segmentation fault")
        ctypes.string_at(0)  # Dereference a NULL pointer

    def test_segfault(self):
        self.cause_segfault()
        assert True


if __name__ == "__main__":
    unittest.main()
