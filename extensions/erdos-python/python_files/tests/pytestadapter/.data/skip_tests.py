# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import pytest

# Testing pytest with skipped tests. The first passes, the second three are skipped.


def test_something():  # test_marker--test_something
    # This tests passes successfully.
    assert 1 + 1 == 2


def test_another_thing():  # test_marker--test_another_thing
    # Skip this test with a reason.
    pytest.skip("Skipping this test for now")


@pytest.mark.skip(
    reason="Skipping this test as it requires additional setup"  # test_marker--test_complex_thing
)
def test_decorator_thing():
    # Skip this test as well, with a reason. This one uses a decorator.
    assert True


@pytest.mark.skipif(1 < 5, reason="is always true")  # test_marker--test_complex_thing_2
def test_decorator_thing_2():
    # Skip this test as well, with a reason. This one uses a decorator with a condition.
    assert True


# With this test, the entire class is skipped.
@pytest.mark.skip(reason="Skip TestClass")
class TestClass:
    def test_class_function_a(self):  # test_marker--test_class_function_a
        assert True

    def test_class_function_b(self):  # test_marker--test_class_function_b
        assert False
