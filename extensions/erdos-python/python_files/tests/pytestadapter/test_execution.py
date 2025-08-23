# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import json
import os
import pathlib
import sys
from typing import Any, Dict, List

import pytest

script_dir = pathlib.Path(__file__).parent.parent
sys.path.append(os.fspath(script_dir))

from tests.pytestadapter import expected_execution_test_output  # noqa: E402

from .helpers import (  # noqa: E402
    TEST_DATA_PATH,
    create_symlink,
    get_absolute_test_id,
    runner,
    runner_with_cwd,
)


def test_config_file():
    """Test pytest execution when a config file is specified."""
    args = [
        "-c",
        "tests/pytest.ini",
        str(TEST_DATA_PATH / "root" / "tests" / "test_a.py::test_a_function"),
    ]
    new_cwd = TEST_DATA_PATH / "root"
    actual = runner_with_cwd(args, new_cwd)
    expected_const = expected_execution_test_output.config_file_pytest_expected_execution_output
    assert actual
    actual_list: List[Dict[str, Any]] = actual
    assert len(actual_list) == len(expected_const)
    actual_result_dict = {}
    if actual_list is not None:
        for actual_item in actual_list:
            assert all(item in actual_item for item in ("status", "cwd", "result"))
            assert actual_item.get("status") == "success"
            assert actual_item.get("cwd") == os.fspath(new_cwd)
            actual_result_dict.update(actual_item["result"])
        assert actual_result_dict == expected_const


def test_rootdir_specified():
    """Test pytest execution when a --rootdir is specified."""
    rd = f"--rootdir={TEST_DATA_PATH / 'root' / 'tests'}"
    args = [rd, "tests/test_a.py::test_a_function"]
    new_cwd = TEST_DATA_PATH / "root"
    actual = runner_with_cwd(args, new_cwd)
    expected_const = expected_execution_test_output.config_file_pytest_expected_execution_output
    assert actual
    actual_list: List[Dict[str, Dict[str, Any]]] = actual
    assert len(actual_list) == len(expected_const)
    actual_result_dict = {}
    if actual_list is not None:
        for actual_item in actual_list:
            assert all(item in actual_item for item in ("status", "cwd", "result"))
            assert actual_item.get("status") == "success"
            assert actual_item.get("cwd") == os.fspath(new_cwd)
            actual_result_dict.update(actual_item["result"])
        assert actual_result_dict == expected_const


@pytest.mark.parametrize(
    ("test_ids", "expected_const"),
    [
        pytest.param(
            [
                "test_env_vars.py::test_clear_env",
                "test_env_vars.py::test_check_env",
            ],
            expected_execution_test_output.safe_clear_env_vars_expected_execution_output,
            id="safe_clear_env_vars",
        ),
        pytest.param(
            [
                "skip_tests.py::test_something",
                "skip_tests.py::test_another_thing",
                "skip_tests.py::test_decorator_thing",
                "skip_tests.py::test_decorator_thing_2",
                "skip_tests.py::TestClass::test_class_function_a",
                "skip_tests.py::TestClass::test_class_function_b",
            ],
            expected_execution_test_output.skip_tests_execution_expected_output,
            id="skip_tests_execution",
        ),
        pytest.param(
            ["error_raise_exception.py::TestSomething::test_a"],
            expected_execution_test_output.error_raised_exception_execution_expected_output,
            id="error_raised_exception",
        ),
        pytest.param(
            [
                "unittest_folder/test_add.py::TestAddFunction::test_add_positive_numbers",
                "unittest_folder/test_add.py::TestAddFunction::test_add_negative_numbers",
                "unittest_folder/test_subtract.py::TestSubtractFunction::test_subtract_positive_numbers",
                "unittest_folder/test_subtract.py::TestSubtractFunction::test_subtract_negative_numbers",
            ],
            expected_execution_test_output.uf_execution_expected_output,
            id="unittest_multiple_files",
        ),
        pytest.param(
            [
                "unittest_folder/test_add.py::TestAddFunction::test_add_positive_numbers",
                "unittest_folder/test_add.py::TestAddFunction::test_add_negative_numbers",
            ],
            expected_execution_test_output.uf_single_file_expected_output,
            id="unittest_single_file",
        ),
        pytest.param(
            [
                "unittest_folder/test_add.py::TestAddFunction::test_add_positive_numbers",
            ],
            expected_execution_test_output.uf_single_method_execution_expected_output,
            id="unittest_single_method",
        ),
        pytest.param(
            [
                "unittest_folder/test_add.py::TestAddFunction::test_add_positive_numbers",
                "unittest_folder/test_subtract.py::TestSubtractFunction::test_subtract_positive_numbers",
            ],
            expected_execution_test_output.uf_non_adjacent_tests_execution_expected_output,
            id="unittest_non_adjacent_tests",
        ),
        pytest.param(
            [
                "unittest_pytest_same_file.py::TestExample::test_true_unittest",
                "unittest_pytest_same_file.py::test_true_pytest",
            ],
            expected_execution_test_output.unit_pytest_same_file_execution_expected_output,
            id="unittest_pytest_same_file",
        ),
        pytest.param(
            [
                "dual_level_nested_folder/test_top_folder.py::test_top_function_t",
                "dual_level_nested_folder/test_top_folder.py::test_top_function_f",
                "dual_level_nested_folder/nested_folder_one/test_bottom_folder.py::test_bottom_function_t",
                "dual_level_nested_folder/nested_folder_one/test_bottom_folder.py::test_bottom_function_f",
            ],
            expected_execution_test_output.dual_level_nested_folder_execution_expected_output,
            id="dual_level_nested_folder",
        ),
        pytest.param(
            ["folder_a/folder_b/folder_a/test_nest.py::test_function"],
            expected_execution_test_output.double_nested_folder_expected_execution_output,
            id="double_nested_folder",
        ),
        pytest.param(
            [
                "parametrize_tests.py::TestClass::test_adding[3+5-8]",
                "parametrize_tests.py::TestClass::test_adding[2+4-6]",
                "parametrize_tests.py::TestClass::test_adding[6+9-16]",
            ],
            expected_execution_test_output.parametrize_tests_expected_execution_output,
            id="parametrize_tests",
        ),
        pytest.param(
            [
                "parametrize_tests.py::TestClass::test_adding[3+5-8]",
            ],
            expected_execution_test_output.single_parametrize_tests_expected_execution_output,
            id="single_parametrize_test",
        ),
        pytest.param(
            [
                "text_docstring.txt::text_docstring.txt",
            ],
            expected_execution_test_output.doctest_pytest_expected_execution_output,
            id="doctest_pytest",
        ),
        pytest.param(
            ["test_logging.py::test_logging2", "test_logging.py::test_logging"],
            expected_execution_test_output.logging_test_expected_execution_output,
            id="logging_tests",
        ),
        pytest.param(
            [
                "pytest_describe_plugin/describe_only.py::describe_A::test_1",
                "pytest_describe_plugin/describe_only.py::describe_A::test_2",
            ],
            expected_execution_test_output.describe_only_expected_execution_output,
            id="describe_only",
        ),
        pytest.param(
            [
                "pytest_describe_plugin/nested_describe.py::describe_list::describe_append::add_empty",
                "pytest_describe_plugin/nested_describe.py::describe_list::describe_append::remove_empty",
                "pytest_describe_plugin/nested_describe.py::describe_list::describe_remove::removes",
            ],
            expected_execution_test_output.nested_describe_expected_execution_output,
            id="nested_describe_plugin",
        ),
        pytest.param(
            ["skip_test_fixture.py::test_docker_client"],
            expected_execution_test_output.skip_test_fixture_execution_expected_output,
            id="skip_test_fixture",
        ),
    ],
)
def test_pytest_execution(test_ids, expected_const):
    """
    Test that pytest discovery works as expected where run pytest is always successful, but the actual test results are both successes and failures.

    Keyword arguments:
    test_ids -- an array of test_ids to run.
    expected_const -- a dictionary of the expected output from running pytest discovery on the files.
    """
    args = test_ids
    actual = runner(args)
    assert actual
    actual_list: List[Dict[str, Dict[str, Any]]] = actual
    assert len(actual_list) == len(expected_const)
    actual_result_dict = {}
    if actual_list is not None:
        for actual_item in actual_list:
            assert all(item in actual_item for item in ("status", "cwd", "result"))
            assert actual_item.get("status") == "success"
            assert actual_item.get("cwd") == os.fspath(TEST_DATA_PATH)
            actual_result_dict.update(actual_item["result"])
    for key in actual_result_dict:
        if (
            actual_result_dict[key]["outcome"] == "failure"
            or actual_result_dict[key]["outcome"] == "error"
        ):
            actual_result_dict[key]["message"] = "ERROR MESSAGE"
        if actual_result_dict[key]["traceback"] is not None:
            actual_result_dict[key]["traceback"] = "TRACEBACK"
    assert actual_result_dict == expected_const


def test_symlink_run():
    """Test to test pytest discovery with the command line arg --rootdir specified as a symlink path.

    Discovery should succeed and testids should be relative to the symlinked root directory.
    """
    with create_symlink(TEST_DATA_PATH, "root", "symlink_folder") as (
        source,
        destination,
    ):
        assert destination.is_symlink()
        test_a_path = TEST_DATA_PATH / "symlink_folder" / "tests" / "test_a.py"
        test_a_id = get_absolute_test_id(
            "tests/test_a.py::test_a_function",
            test_a_path,
        )

        # Run pytest with the cwd being the resolved symlink path (as it will be when we run the subprocess from node).
        actual = runner_with_cwd([f"--rootdir={os.fspath(destination)}", test_a_id], source)

        expected_const = expected_execution_test_output.symlink_run_expected_execution_output
        assert actual
        actual_list: List[Dict[str, Any]] = actual
        if actual_list is not None:
            actual_item = actual_list.pop(0)
            try:
                # Check if all requirements
                assert all(item in actual_item for item in ("status", "cwd", "result")), (
                    "Required keys are missing"
                )
                assert actual_item.get("status") == "success", "Status is not 'success'"
                assert actual_item.get("cwd") == os.fspath(destination), (
                    f"CWD does not match: {os.fspath(destination)}"
                )
                actual_result_dict = {}
                actual_result_dict.update(actual_item["result"])
                assert actual_result_dict == expected_const
            except AssertionError as e:
                # Print the actual_item in JSON format if an assertion fails
                print(json.dumps(actual_item, indent=4))
                pytest.fail(str(e))
