# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import os
import pathlib
import sys
from typing import Any, Dict, List

import pytest

from unittestadapter.discovery import discover_tests
from unittestadapter.pvsc_utils import TestNodeTypeEnum, parse_unittest_args

script_dir = pathlib.Path(__file__).parent.parent
sys.path.append(os.fspath(script_dir))

from tests.pytestadapter import helpers  # noqa: E402
from tests.tree_comparison_helper import is_same_tree  # noqa: E402

from . import expected_discovery_test_output  # noqa: E402

TEST_DATA_PATH = pathlib.Path(__file__).parent / ".data"


@pytest.mark.parametrize(
    ("args", "expected"),
    [
        (
            ["-s", "something", "-p", "other*", "-t", "else"],
            ("something", "other*", "else", 1, None, None),
        ),
        (
            [
                "--start-directory",
                "foo",
                "--pattern",
                "bar*",
                "--top-level-directory",
                "baz",
            ],
            ("foo", "bar*", "baz", 1, None, None),
        ),
        (
            ["--foo", "something"],
            (".", "test*.py", None, 1, None, None),
        ),
        (
            ["--foo", "something", "-v"],
            (".", "test*.py", None, 2, None, None),
        ),
        (
            ["--foo", "something", "-f"],
            (".", "test*.py", None, 1, True, None),
        ),
        (
            ["--foo", "something", "--verbose", "-f"],
            (".", "test*.py", None, 2, True, None),
        ),
        (
            ["--foo", "something", "-q", "--failfast"],
            (".", "test*.py", None, 0, True, None),
        ),
        (
            ["--foo", "something", "--quiet"],
            (".", "test*.py", None, 0, None, None),
        ),
        (
            ["--foo", "something", "--quiet", "--locals"],
            (".", "test*.py", None, 0, None, True),
        ),
    ],
)
def test_parse_unittest_args(args: List[str], expected: List[str]) -> None:
    """The parse_unittest_args function should return values for the start_dir, pattern, and top_level_dir arguments when passed as command-line options, and ignore unrecognized arguments."""
    actual = parse_unittest_args(args)

    assert actual == expected


def test_simple_discovery() -> None:
    """The discover_tests function should return a dictionary with a "success" status, no errors, and a test tree if unittest discovery was performed successfully."""
    start_dir = os.fsdecode(TEST_DATA_PATH)
    pattern = "discovery_simple*"
    file_path = os.fsdecode(pathlib.PurePath(TEST_DATA_PATH / "discovery_simple.py"))

    expected = {
        "path": start_dir,
        "type_": TestNodeTypeEnum.folder,
        "name": ".data",
        "children": [
            {
                "name": "discovery_simple.py",
                "type_": TestNodeTypeEnum.file,
                "path": file_path,
                "children": [
                    {
                        "name": "DiscoverySimple",
                        "path": file_path,
                        "type_": TestNodeTypeEnum.class_,
                        "children": [
                            {
                                "name": "test_one",
                                "path": file_path,
                                "type_": TestNodeTypeEnum.test,
                                "lineno": "14",
                                "id_": file_path + "\\" + "DiscoverySimple" + "\\" + "test_one",
                            },
                            {
                                "name": "test_two",
                                "path": file_path,
                                "type_": TestNodeTypeEnum.test,
                                "lineno": "17",
                                "id_": file_path + "\\" + "DiscoverySimple" + "\\" + "test_two",
                            },
                        ],
                        "id_": file_path + "\\" + "DiscoverySimple",
                    }
                ],
                "id_": file_path,
            }
        ],
        "id_": start_dir,
    }

    actual = discover_tests(start_dir, pattern, None)

    assert actual["status"] == "success"
    assert is_same_tree(actual.get("tests"), expected, ["id_", "lineno", "name"])
    assert "error" not in actual


def test_simple_discovery_with_top_dir_calculated() -> None:
    """The discover_tests function should return a dictionary with a "success" status, no errors, and a test tree if unittest discovery was performed successfully."""
    start_dir = "."
    pattern = "discovery_simple*"
    file_path = os.fsdecode(pathlib.PurePath(TEST_DATA_PATH / "discovery_simple.py"))

    expected = {
        "path": os.fsdecode(pathlib.PurePath(TEST_DATA_PATH)),
        "type_": TestNodeTypeEnum.folder,
        "name": ".data",
        "children": [
            {
                "name": "discovery_simple.py",
                "type_": TestNodeTypeEnum.file,
                "path": file_path,
                "children": [
                    {
                        "name": "DiscoverySimple",
                        "path": file_path,
                        "type_": TestNodeTypeEnum.class_,
                        "children": [
                            {
                                "name": "test_one",
                                "path": file_path,
                                "type_": TestNodeTypeEnum.test,
                                "lineno": "14",
                                "id_": file_path + "\\" + "DiscoverySimple" + "\\" + "test_one",
                            },
                            {
                                "name": "test_two",
                                "path": file_path,
                                "type_": TestNodeTypeEnum.test,
                                "lineno": "17",
                                "id_": file_path + "\\" + "DiscoverySimple" + "\\" + "test_two",
                            },
                        ],
                        "id_": file_path + "\\" + "DiscoverySimple",
                    }
                ],
                "id_": file_path,
            }
        ],
        "id_": os.fsdecode(pathlib.PurePath(TEST_DATA_PATH)),
    }

    # Define the CWD to be the root of the test data folder.
    os.chdir(os.fsdecode(pathlib.PurePath(TEST_DATA_PATH)))
    actual = discover_tests(start_dir, pattern, None)

    assert actual["status"] == "success"
    assert is_same_tree(actual.get("tests"), expected, ["id_", "lineno", "name"])
    assert "error" not in actual


def test_empty_discovery() -> None:
    """The discover_tests function should return a dictionary with a "success" status,  no errors, and no test tree if unittest discovery was performed successfully but no tests were found."""
    start_dir = os.fsdecode(TEST_DATA_PATH)
    pattern = "discovery_empty*"

    actual = discover_tests(start_dir, pattern, None)

    assert actual["status"] == "success"
    assert "tests" in actual
    assert "error" not in actual


def test_error_discovery() -> None:
    """The discover_tests function should return a dictionary with an "error" status, the discovered tests, and a list of errors if unittest discovery failed at some point."""
    # Discover tests in .data/discovery_error/.
    start_path = pathlib.PurePath(TEST_DATA_PATH / "discovery_error")
    start_dir = os.fsdecode(start_path)
    pattern = "file*"

    file_path = os.fsdecode(start_path / "file_two.py")

    expected = {
        "path": start_dir,
        "type_": TestNodeTypeEnum.folder,
        "name": "discovery_error",
        "children": [
            {
                "name": "file_two.py",
                "type_": TestNodeTypeEnum.file,
                "path": file_path,
                "children": [
                    {
                        "name": "DiscoveryErrorTwo",
                        "path": file_path,
                        "type_": TestNodeTypeEnum.class_,
                        "children": [
                            {
                                "name": "test_one",
                                "path": file_path,
                                "type_": TestNodeTypeEnum.test,
                                "lineno": "14",
                                "id_": file_path + "\\" + "DiscoveryErrorTwo" + "\\" + "test_one",
                            },
                            {
                                "name": "test_two",
                                "path": file_path,
                                "type_": TestNodeTypeEnum.test,
                                "lineno": "17",
                                "id_": file_path + "\\" + "DiscoveryErrorTwo" + "\\" + "test_two",
                            },
                        ],
                        "id_": file_path + "\\" + "DiscoveryErrorTwo",
                    }
                ],
                "id_": file_path,
            }
        ],
        "id_": start_dir,
    }

    actual = discover_tests(start_dir, pattern, None)

    assert actual["status"] == "error"
    assert is_same_tree(expected, actual.get("tests"), ["id_", "lineno", "name"])
    assert len(actual.get("error", [])) == 1


def test_unit_skip() -> None:
    """The discover_tests function should return a dictionary with a "success" status, no errors, and test tree.

    if unittest discovery was performed and found a test in one file marked as skipped and another file marked as skipped.
    """
    start_dir = os.fsdecode(TEST_DATA_PATH / "unittest_skip")
    pattern = "unittest_*"

    actual = discover_tests(start_dir, pattern, None)

    assert actual["status"] == "success"
    assert "tests" in actual
    assert is_same_tree(
        actual.get("tests"),
        expected_discovery_test_output.skip_unittest_folder_discovery_output,
        ["id_", "lineno", "name"],
    )
    assert "error" not in actual


def test_complex_tree() -> None:
    """This test specifically tests when different start_dir and top_level_dir are provided."""
    start_dir = os.fsdecode(
        pathlib.PurePath(
            TEST_DATA_PATH,
            "utils_complex_tree",
            "test_outer_folder",
            "test_inner_folder",
        )
    )
    pattern = "test_*.py"
    top_level_dir = os.fsdecode(pathlib.PurePath(TEST_DATA_PATH, "utils_complex_tree"))
    actual = discover_tests(start_dir, pattern, top_level_dir)
    assert actual["status"] == "success"
    assert "error" not in actual
    assert is_same_tree(
        actual.get("tests"),
        expected_discovery_test_output.complex_tree_expected_output,
        ["id_", "lineno", "name"],
    )


def test_simple_django_collect():
    test_data_path: pathlib.Path = pathlib.Path(__file__).parent / ".data"
    python_files_path: pathlib.Path = pathlib.Path(__file__).parent.parent.parent
    discovery_script_path: str = os.fsdecode(python_files_path / "unittestadapter" / "discovery.py")
    data_path: pathlib.Path = test_data_path / "simple_django"
    manage_py_path: str = os.fsdecode(pathlib.Path(data_path, "manage.py"))

    actual = helpers.runner_with_cwd_env(
        [
            discovery_script_path,
            "--udiscovery",
        ],
        data_path,
        {"MANAGE_PY_PATH": manage_py_path},
    )

    assert actual
    actual_list: List[Dict[str, Any]] = actual
    assert actual_list is not None
    if actual_list is not None:
        actual_item = actual_list.pop(0)
        assert all(item in actual_item for item in ("status", "cwd"))
        assert actual_item.get("status") == "success", (
            f"Status is not 'success', error is: {actual_item.get('error')}"
        )
        assert actual_item.get("cwd") == os.fspath(data_path)
        assert len(actual_item["tests"]["children"]) == 1
        assert actual_item["tests"]["children"][0]["children"][0]["id_"] == os.fsdecode(
            pathlib.PurePath(test_data_path, "simple_django", "polls", "tests.py")
        )
        assert (
            len(actual_item["tests"]["children"][0]["children"][0]["children"][0]["children"]) == 3
        )
