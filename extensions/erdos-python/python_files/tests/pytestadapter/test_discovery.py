# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import json
import os
import sys
from typing import Any, Dict, List, Optional

import pytest

from tests.tree_comparison_helper import is_same_tree

from . import expected_discovery_test_output, helpers


def test_import_error():
    """Test pytest discovery on a file that has a pytest marker but does not import pytest.

    Copies the contents of a .txt file to a .py file in the temporary directory
    to then run pytest discovery on.

    The json should still be returned but the errors list should be present.

    Keyword arguments:
    tmp_path -- pytest fixture that creates a temporary directory.
    """
    file_path = helpers.TEST_DATA_PATH / "error_pytest_import.txt"
    with helpers.text_to_python_file(file_path) as p:
        actual: Optional[List[Dict[str, Any]]] = helpers.runner(["--collect-only", os.fspath(p)])

    assert actual
    actual_list: List[Dict[str, Any]] = actual
    if actual_list is not None:
        for actual_item in actual_list:
            assert all(item in actual_item for item in ("status", "cwd", "error"))
            assert actual_item.get("status") == "error"
            assert actual_item.get("cwd") == os.fspath(helpers.TEST_DATA_PATH)

            # Ensure that 'error' is a list and then check its length
            error_content = actual_item.get("error")
            if error_content is not None and isinstance(
                error_content, (list, tuple, str)
            ):  # You can add other types if needed
                assert len(error_content) == 2
            else:
                pytest.fail(f"{error_content} is None or not a list, str, or tuple")


def test_syntax_error(tmp_path):  # noqa: ARG001
    """Test pytest discovery on a file that has a syntax error.

    Copies the contents of a .txt file to a .py file in the temporary directory
    to then run pytest discovery on.

    The json should still be returned but the errors list should be present.

    Keyword arguments:
    tmp_path -- pytest fixture that creates a temporary directory.
    """
    # Saving some files as .txt to avoid that file displaying a syntax error for
    # the extension as a whole. Instead, rename it before running this test
    # in order to test the error handling.
    file_path = helpers.TEST_DATA_PATH / "error_syntax_discovery.txt"
    with helpers.text_to_python_file(file_path) as p:
        actual = helpers.runner(["--collect-only", os.fspath(p)])

    assert actual
    actual_list: List[Dict[str, Any]] = actual
    if actual_list is not None:
        for actual_item in actual_list:
            assert all(item in actual_item for item in ("status", "cwd", "error"))
            assert actual_item.get("status") == "error"
            assert actual_item.get("cwd") == os.fspath(helpers.TEST_DATA_PATH)

            # Ensure that 'error' is a list and then check its length
            error_content = actual_item.get("error")
            if error_content is not None and isinstance(
                error_content, (list, tuple, str)
            ):  # You can add other types if needed
                assert len(error_content) == 2
            else:
                pytest.fail(f"{error_content} is None or not a list, str, or tuple")


def test_parameterized_error_collect():
    """Tests pytest discovery on specific file that incorrectly uses parametrize.

    The json should still be returned but the errors list should be present.
    """
    file_path_str = "error_parametrize_discovery.py"
    actual = helpers.runner(["--collect-only", file_path_str])
    assert actual
    actual_list: List[Dict[str, Any]] = actual
    if actual_list is not None:
        for actual_item in actual_list:
            assert all(item in actual_item for item in ("status", "cwd", "error"))
            assert actual_item.get("status") == "error"
            assert actual_item.get("cwd") == os.fspath(helpers.TEST_DATA_PATH)

            # Ensure that 'error' is a list and then check its length
            error_content = actual_item.get("error")
            if error_content is not None and isinstance(
                error_content, (list, tuple, str)
            ):  # You can add other types if needed
                assert len(error_content) == 2
            else:
                pytest.fail(f"{error_content} is None or not a list, str, or tuple")


@pytest.mark.parametrize(
    ("file", "expected_const"),
    [
        (
            "test_param_span_class.py",
            expected_discovery_test_output.test_param_span_class_expected_output,
        ),
        (
            "test_multi_class_nest.py",
            expected_discovery_test_output.nested_classes_expected_test_output,
        ),
        (
            "same_function_new_class_param.py",
            expected_discovery_test_output.same_function_new_class_param_expected_output,
        ),
        (
            "unittest_skiptest_file_level.py",
            expected_discovery_test_output.unittest_skip_file_level_expected_output,
        ),
        (
            "param_same_name",
            expected_discovery_test_output.param_same_name_expected_output,
        ),
        (
            "parametrize_tests.py",
            expected_discovery_test_output.parametrize_tests_expected_output,
        ),
        (
            "empty_discovery.py",
            expected_discovery_test_output.empty_discovery_pytest_expected_output,
        ),
        (
            "simple_pytest.py",
            expected_discovery_test_output.simple_discovery_pytest_expected_output,
        ),
        (
            "unittest_pytest_same_file.py",
            expected_discovery_test_output.unit_pytest_same_file_discovery_expected_output,
        ),
        (
            "unittest_folder",
            expected_discovery_test_output.unittest_folder_discovery_expected_output,
        ),
        (
            "dual_level_nested_folder",
            expected_discovery_test_output.dual_level_nested_folder_expected_output,
        ),
        (
            "folder_a",
            expected_discovery_test_output.double_nested_folder_expected_output,
        ),
        (
            "text_docstring.txt",
            expected_discovery_test_output.doctest_pytest_expected_output,
        ),
        (
            "pytest_describe_plugin" + os.path.sep + "describe_only.py",
            expected_discovery_test_output.expected_describe_only_output,
        ),
        (
            "pytest_describe_plugin" + os.path.sep + "nested_describe.py",
            expected_discovery_test_output.expected_nested_describe_output,
        ),
    ],
)
def test_pytest_collect(file, expected_const):
    """Test to test pytest discovery on a variety of test files/ folder structures.

    Uses variables from expected_discovery_test_output.py to store the expected
    dictionary return. Only handles discovery and therefore already contains the arg
    --collect-only. All test discovery will succeed, be in the correct cwd, and match
    expected test output.

    Keyword arguments:
    file -- a string with the file or folder to run pytest discovery on.
    expected_const -- the expected output from running pytest discovery on the file.
    """
    actual = helpers.runner(
        [
            os.fspath(helpers.TEST_DATA_PATH / file),
            "--collect-only",
        ]
    )

    assert actual
    actual_list: List[Dict[str, Any]] = actual
    if actual_list is not None:
        actual_item = actual_list.pop(0)
        assert all(item in actual_item for item in ("status", "cwd", "error"))
        assert actual_item.get("status") == "success", (
            f"Status is not 'success', error is: {actual_item.get('error')}"
        )
        assert actual_item.get("cwd") == os.fspath(helpers.TEST_DATA_PATH)
        assert is_same_tree(
            actual_item.get("tests"),
            expected_const,
            ["id_", "lineno", "name", "runID"],
        ), (
            f"Tests tree does not match expected value. \n Expected: {json.dumps(expected_const, indent=4)}. \n Actual: {json.dumps(actual_item.get('tests'), indent=4)}"
        )


@pytest.mark.skipif(
    sys.platform == "win32",
    reason="See https://stackoverflow.com/questions/32877260/privlege-error-trying-to-create-symlink-using-python-on-windows-10",
)
def test_symlink_root_dir():
    """Test to test pytest discovery with the command line arg --rootdir specified as a symlink path.

    Discovery should succeed and testids should be relative to the symlinked root directory.
    """
    with helpers.create_symlink(helpers.TEST_DATA_PATH, "root", "symlink_folder") as (
        source,
        destination,
    ):
        assert destination.is_symlink()

        # Run pytest with the cwd being the resolved symlink path (as it will be when we run the subprocess from node).
        actual = helpers.runner_with_cwd(
            ["--collect-only", f"--rootdir={os.fspath(destination)}"], source
        )
        expected = expected_discovery_test_output.symlink_expected_discovery_output
        assert actual
        actual_list: List[Dict[str, Any]] = actual
        if actual_list is not None:
            actual_item = actual_list.pop(0)
            try:
                # Check if all requirements
                assert all(item in actual_item for item in ("status", "cwd", "error")), (
                    "Required keys are missing"
                )
                assert actual_item.get("status") == "success", "Status is not 'success'"
                assert actual_item.get("cwd") == os.fspath(destination), (
                    f"CWD does not match: {os.fspath(destination)}"
                )
                assert actual_item.get("tests") == expected, "Tests do not match expected value"
            except AssertionError as e:
                # Print the actual_item in JSON format if an assertion fails
                print(json.dumps(actual_item, indent=4))
                pytest.fail(str(e))


def test_pytest_root_dir():
    """Test to test pytest discovery with the command line arg --rootdir specified to be a subfolder of the workspace root.

    Discovery should succeed and testids should be relative to workspace root.
    """
    rd = f"--rootdir={helpers.TEST_DATA_PATH / 'root' / 'tests'}"
    actual = helpers.runner_with_cwd(
        [
            "--collect-only",
            rd,
        ],
        helpers.TEST_DATA_PATH / "root",
    )
    assert actual
    actual_list: List[Dict[str, Any]] = actual
    if actual_list is not None:
        actual_item = actual_list.pop(0)

        assert all(item in actual_item for item in ("status", "cwd", "error"))
        assert actual_item.get("status") == "success"
        assert actual_item.get("cwd") == os.fspath(helpers.TEST_DATA_PATH / "root")
        assert is_same_tree(
            actual_item.get("tests"),
            expected_discovery_test_output.root_with_config_expected_output,
            ["id_", "lineno", "name", "runID"],
        ), (
            f"Tests tree does not match expected value. \n Expected: {json.dumps(expected_discovery_test_output.root_with_config_expected_output, indent=4)}. \n Actual: {json.dumps(actual_item.get('tests'), indent=4)}"
        )


def test_pytest_config_file():
    """Test to test pytest discovery with the command line arg -c with a specified config file which changes the workspace root.

    Discovery should succeed and testids should be relative to workspace root.
    """
    actual = helpers.runner_with_cwd(
        [
            "--collect-only",
            "tests/",
        ],
        helpers.TEST_DATA_PATH / "root",
    )
    assert actual
    actual_list: List[Dict[str, Any]] = actual
    if actual_list is not None:
        actual_item = actual_list.pop(0)

        assert all(item in actual_item for item in ("status", "cwd", "error"))
        assert actual_item.get("status") == "success"
        assert actual_item.get("cwd") == os.fspath(helpers.TEST_DATA_PATH / "root")
        assert is_same_tree(
            actual_item.get("tests"),
            expected_discovery_test_output.root_with_config_expected_output,
            ["id_", "lineno", "name", "runID"],
        ), (
            f"Tests tree does not match expected value. \n Expected: {json.dumps(expected_discovery_test_output.root_with_config_expected_output, indent=4)}. \n Actual: {json.dumps(actual_item.get('tests'), indent=4)}"
        )


def test_config_sub_folder():
    """Here the session node will be a subfolder of the workspace root and the test are in another subfolder.

    This tests checks to see if test node path are under the session node and if so the
    session node is correctly updated to the common path.
    """
    folder_path = helpers.TEST_DATA_PATH / "config_sub_folder"
    actual = helpers.runner_with_cwd(
        [
            "--collect-only",
            "-c=config/pytest.ini",
            "--rootdir=config/",
            "-vv",
        ],
        folder_path,
    )

    assert actual
    actual_list: List[Dict[str, Any]] = actual
    if actual_list is not None:
        actual_item = actual_list.pop(0)
        assert all(item in actual_item for item in ("status", "cwd", "error"))
        assert actual_item.get("status") == "success"
        assert actual_item.get("cwd") == os.fspath(helpers.TEST_DATA_PATH / "config_sub_folder")
        assert actual_item.get("tests") is not None
        if actual_item.get("tests") is not None:
            tests: Any = actual_item.get("tests")
            assert tests.get("name") == "config_sub_folder"


@pytest.mark.parametrize(
    ("file", "expected_const", "extra_arg"),
    [
        (
            "folder_with_script",
            expected_discovery_test_output.ruff_test_expected_output,
            "--ruff",
        ),
        (
            "2496-black-formatter",
            expected_discovery_test_output.black_formatter_expected_output,
            "--black",
        ),
    ],
)
def test_plugin_collect(file, expected_const, extra_arg):
    """Test pytest discovery on a folder with a plugin argument (e.g., --ruff, --black).

    Uses variables from expected_discovery_test_output.py to store the expected
    dictionary return. Only handles discovery and therefore already contains the arg
    --collect-only. All test discovery will succeed, be in the correct cwd, and match
    expected test output.

    Keyword arguments:
    file -- a string with the file or folder to run pytest discovery on.
    expected_const -- the expected output from running pytest discovery on the file.
    extra_arg -- the extra plugin argument to pass (e.g., --ruff, --black)
    """
    file_path = helpers.TEST_DATA_PATH / file
    actual = helpers.runner(
        [os.fspath(file_path), "--collect-only", extra_arg],
    )

    assert actual
    actual_list: List[Dict[str, Any]] = actual
    if actual_list is not None:
        actual_item = actual_list.pop(0)
        assert all(item in actual_item for item in ("status", "cwd", "error"))
        assert actual_item.get("status") == "success", (
            f"Status is not 'success', error is: {actual_item.get('error')}"
        )
        assert actual_item.get("cwd") == os.fspath(helpers.TEST_DATA_PATH)
        assert is_same_tree(
            actual_item.get("tests"),
            expected_const,
            ["id_", "lineno", "name", "runID"],
        ), (
            f"Tests tree does not match expected value. \n Expected: {json.dumps(expected_const, indent=4)}. \n Actual: {json.dumps(actual_item.get('tests'), indent=4)}"
        )
