# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import pytest


class TestClass:
    # Testing pytest with parametrized tests. The first two pass, the third fails.
    # The tests ids are parametrize_tests.py::test_adding[3+5-8] and so on.
    @pytest.mark.parametrize(  # test_marker--test_adding
        "actual, expected", [("3+5", 8), ("2+4", 6), ("6+9", 16)]
    )
    def test_adding(self, actual, expected):
        assert eval(actual) == expected


# Testing pytest with parametrized tests. All three pass.
# The tests ids are parametrize_tests.py::test_under_ten[1] and so on.
@pytest.mark.parametrize(  # test_marker--test_string
    "string", ["hello", "complicated split [] ()"]
)
def test_string(string):
    assert string == "hello"
