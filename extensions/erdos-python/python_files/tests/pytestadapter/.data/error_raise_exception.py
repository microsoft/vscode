# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import pytest


@pytest.fixture
def raise_fixture():
    raise Exception("Dummy exception")


class TestSomething:
    def test_a(self, raise_fixture):
        assert True
