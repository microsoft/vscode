# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import pytest


# This test has an error which will appear on pytest discovery.
# This error is intentional and is meant to test pytest discovery error handling.
@pytest.mark.parametrize("actual,expected", [("3+5", 8), ("2+4", 6), ("6*9", 42)])
def test_function():
    assert True
