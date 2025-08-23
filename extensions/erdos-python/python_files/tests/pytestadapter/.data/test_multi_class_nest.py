# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.


class TestFirstClass:
    class TestSecondClass:
        def test_second(self):  # test_marker--test_second
            assert 1 == 2

    def test_first(self):  # test_marker--test_first
        assert 1 == 2

    class TestSecondClass2:
        def test_second2(self):  # test_marker--test_second2
            assert 1 == 1


def test_independent():  # test_marker--test_independent
    assert 1 == 1
