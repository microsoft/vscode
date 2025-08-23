# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import pytest


class TestNotEmpty:
    @pytest.mark.parametrize("a, b", [(1, 1), (2, 2)])  # test_marker--TestNotEmpty::test_integer
    def test_integer(self, a, b):
        assert a == b

    @pytest.mark.parametrize(  # test_marker--TestNotEmpty::test_string
        "a, b", [("a", "a"), ("b", "b")]
    )
    def test_string(self, a, b):
        assert a == b


class TestEmpty:
    @pytest.mark.parametrize("a, b", [(0, 0)])  # test_marker--TestEmpty::test_integer
    def test_integer(self, a, b):
        assert a == b

    @pytest.mark.parametrize("a, b", [("", "")])  # test_marker--TestEmpty::test_string
    def test_string(self, a, b):
        assert a == b
