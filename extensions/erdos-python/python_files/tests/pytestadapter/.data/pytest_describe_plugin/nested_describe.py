# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import pytest


def describe_list():
    @pytest.fixture
    def list():
        return []

    def describe_append():
        def add_empty(list): # test_marker--add_empty
            list.append("foo")
            list.append("bar")
            assert list == ["foo", "bar"]

        def remove_empty(list): # test_marker--remove_empty
            try:
                list.remove("foo")
            except ValueError:
                pass

    def describe_remove():
        @pytest.fixture
        def list():
            return ["foo", "bar"]

        def removes(list): # test_marker--removes
            list.remove("foo")
            assert list == ["bar"]
