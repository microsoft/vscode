# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from unittest import SkipTest

raise SkipTest("This is unittest.SkipTest calling")


def test_example():
    assert 1 == 1
