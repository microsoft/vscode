# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest
from functools import wraps


def my_decorator(f):
    @wraps(f)
    def wrapper(*args, **kwds):
        print("Calling decorated function")
        return f(*args, **kwds)

    return wrapper


class TreeOne(unittest.TestCase):
    """Test class for the test_build_decorated_tree test.

    build_test_tree should build a test tree with these test cases.
    """

    @my_decorator
    def test_one(self) -> None:
        self.assertGreater(2, 1)

    @my_decorator
    def test_two(self) -> None:
        self.assertNotEqual(2, 1)
