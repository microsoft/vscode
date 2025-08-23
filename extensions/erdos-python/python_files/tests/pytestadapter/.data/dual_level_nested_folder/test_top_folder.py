# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.


# This test's id is dual_level_nested_folder/test_top_folder.py::test_top_function_t.
# This test passes.
def test_top_function_t():  # test_marker--test_top_function_t
    assert True


# This test's id is dual_level_nested_folder/test_top_folder.py::test_top_function_f.
# This test fails.
def test_top_function_f():  # test_marker--test_top_function_f
    assert False
