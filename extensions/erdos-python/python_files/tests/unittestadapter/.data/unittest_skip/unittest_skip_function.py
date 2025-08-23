# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest


def add(x, y):
    return x + y


class SimpleTest(unittest.TestCase):
    @unittest.skip("demonstrating skipping")
    def testadd1(self):
        self.assertEquals(add(4, 5), 9)


if __name__ == "__main__":
    unittest.main()
