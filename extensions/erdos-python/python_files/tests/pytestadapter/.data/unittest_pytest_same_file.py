# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest


class TestExample(unittest.TestCase):
    # This test's id is unittest_pytest_same_file.py::TestExample::test_true_unittest.
    # Test type is unittest and this test passes.
    def test_true_unittest(self):  # test_marker--test_true_unittest
        assert True


# This test's id is unittest_pytest_same_file.py::test_true_pytest.
# Test type is pytest and this test passes.
def test_true_pytest():  # test_marker--test_true_pytest
    assert True
