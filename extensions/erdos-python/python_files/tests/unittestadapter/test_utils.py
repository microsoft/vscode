# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import os
import pathlib
import sys
import unittest

import pytest

from unittestadapter.pvsc_utils import (
    TestNode,
    TestNodeTypeEnum,
    build_test_tree,
    get_child_node,
    get_test_case,
)

script_dir = pathlib.Path(__file__).parent.parent
sys.path.append(os.fspath(script_dir))

from tests.tree_comparison_helper import is_same_tree  # noqa: E402

TEST_DATA_PATH = pathlib.Path(__file__).parent / ".data"


@pytest.mark.parametrize(
    ("directory", "pattern", "expected"),
    [
        (
            ".",
            "utils_simple_cases*",
            [
                "utils_simple_cases.CaseOne.test_one",
                "utils_simple_cases.CaseOne.test_two",
            ],
        ),
        (
            "utils_nested_cases",
            "file*",
            [
                "file_one.CaseTwoFileOne.test_one",
                "file_one.CaseTwoFileOne.test_two",
                "folder.file_two.CaseTwoFileTwo.test_one",
                "folder.file_two.CaseTwoFileTwo.test_two",
            ],
        ),
    ],
)
def test_simple_test_cases(directory, pattern, expected) -> None:
    """The get_test_case fuction should return tests from all test suites."""
    actual = []

    # Discover tests in .data/<directory>.
    start_dir = os.fsdecode(TEST_DATA_PATH / directory)

    loader = unittest.TestLoader()
    suite = loader.discover(start_dir, pattern)

    # Iterate on get_test_case and save the test id.
    actual = [test.id() for test in get_test_case(suite)]

    assert expected == actual


def test_get_existing_child_node() -> None:
    """The get_child_node fuction should return the child node of a test tree if it exists."""
    tree: TestNode = {
        "name": "root",
        "path": "foo",
        "type_": TestNodeTypeEnum.folder,
        "children": [
            {
                "name": "childOne",
                "path": "child/one",
                "type_": TestNodeTypeEnum.folder,
                "children": [
                    {
                        "name": "nestedOne",
                        "path": "nested/one",
                        "type_": TestNodeTypeEnum.folder,
                        "children": [],
                        "id_": "nested/one",
                    },
                    {
                        "name": "nestedTwo",
                        "path": "nested/two",
                        "type_": TestNodeTypeEnum.folder,
                        "children": [],
                        "id_": "nested/two",
                    },
                ],
                "id_": "child/one",
            },
            {
                "name": "childTwo",
                "path": "child/two",
                "type_": TestNodeTypeEnum.folder,
                "children": [],
                "id_": "child/two",
            },
        ],
        "id_": "foo",
    }

    get_child_node("childTwo", "child/two", TestNodeTypeEnum.folder, tree)
    tree_copy = tree.copy()

    # Check that the tree didn't get mutated by get_child_node.
    assert is_same_tree(tree, tree_copy, ["id_", "lineno", "name"])


def test_no_existing_child_node() -> None:
    """The get_child_node fuction should add a child node to a test tree and return it if it does not exist."""
    tree: TestNode = {
        "name": "root",
        "path": "foo",
        "type_": TestNodeTypeEnum.folder,
        "children": [
            {
                "name": "childOne",
                "path": "child/one",
                "type_": TestNodeTypeEnum.folder,
                "children": [
                    {
                        "name": "nestedOne",
                        "path": "nested/one",
                        "type_": TestNodeTypeEnum.folder,
                        "children": [],
                        "id_": "nested/one",
                    },
                    {
                        "name": "nestedTwo",
                        "path": "nested/two",
                        "type_": TestNodeTypeEnum.folder,
                        "children": [],
                        "id_": "nested/two",
                    },
                ],
                "id_": "child/one",
            },
            {
                "name": "childTwo",
                "path": "child/two",
                "type_": TestNodeTypeEnum.folder,
                "children": [],
                "id_": "child/two",
            },
        ],
        "id_": "foo",
    }

    # Make a separate copy of tree["children"].
    tree_before = tree.copy()
    tree_before["children"] = tree["children"][:]

    get_child_node("childThree", "child/three", TestNodeTypeEnum.folder, tree)

    tree_after = tree.copy()
    tree_after["children"] = tree_after["children"][:-1]

    # Check that all pre-existing items in the tree didn't get mutated by get_child_node.
    assert is_same_tree(tree_before, tree_after, ["id_", "lineno", "name"])

    # Check for the added node.
    last_child = tree["children"][-1]
    assert last_child["name"] == "childThree"


def test_build_simple_tree() -> None:
    """The build_test_tree function should build and return a test tree from discovered test suites, and an empty list of errors if there are none in the discovered data."""
    # Discovery tests in utils_simple_tree.py.
    start_dir = os.fsdecode(TEST_DATA_PATH)
    pattern = "utils_simple_tree*"
    file_path = os.fsdecode(pathlib.PurePath(TEST_DATA_PATH, "utils_simple_tree.py"))

    expected: TestNode = {
        "path": start_dir,
        "type_": TestNodeTypeEnum.folder,
        "name": ".data",
        "children": [
            {
                "name": "utils_simple_tree.py",
                "type_": TestNodeTypeEnum.file,
                "path": file_path,
                "children": [
                    {
                        "name": "TreeOne",
                        "path": file_path,
                        "type_": TestNodeTypeEnum.class_,
                        "children": [
                            {
                                "name": "test_one",
                                "path": file_path,
                                "type_": TestNodeTypeEnum.test,
                                "lineno": "13",
                                "id_": file_path + "\\" + "TreeOne" + "\\" + "test_one",
                                "runID": "utils_simple_tree.TreeOne.test_one",
                            },
                            {
                                "name": "test_two",
                                "path": file_path,
                                "type_": TestNodeTypeEnum.test,
                                "lineno": "16",
                                "id_": file_path + "\\" + "TreeOne" + "\\" + "test_two",
                                "runID": "utils_simple_tree.TreeOne.test_two",
                            },
                        ],
                        "id_": file_path + "\\" + "TreeOne",
                    }
                ],
                "id_": file_path,
            }
        ],
        "id_": start_dir,
    }

    loader = unittest.TestLoader()
    suite = loader.discover(start_dir, pattern)
    tests, errors = build_test_tree(suite, start_dir)

    assert is_same_tree(expected, tests, ["id_", "lineno", "name"])
    assert not errors


def test_build_decorated_tree() -> None:
    """The build_test_tree function should build and return a test tree from discovered test suites, with correct line numbers for decorated test, and an empty list of errors if there are none in the discovered data."""
    # Discovery tests in utils_decorated_tree.py.
    start_dir = os.fsdecode(TEST_DATA_PATH)
    pattern = "utils_decorated_tree*"
    file_path = os.fsdecode(pathlib.PurePath(TEST_DATA_PATH, "utils_decorated_tree.py"))

    expected: TestNode = {
        "path": start_dir,
        "type_": TestNodeTypeEnum.folder,
        "name": ".data",
        "children": [
            {
                "name": "utils_decorated_tree.py",
                "type_": TestNodeTypeEnum.file,
                "path": file_path,
                "children": [
                    {
                        "name": "TreeOne",
                        "path": file_path,
                        "type_": TestNodeTypeEnum.class_,
                        "children": [
                            {
                                "name": "test_one",
                                "path": file_path,
                                "type_": TestNodeTypeEnum.test,
                                "lineno": "24",
                                "id_": file_path + "\\" + "TreeOne" + "\\" + "test_one",
                                "runID": "utils_decorated_tree.TreeOne.test_one",
                            },
                            {
                                "name": "test_two",
                                "path": file_path,
                                "type_": TestNodeTypeEnum.test,
                                "lineno": "28",
                                "id_": file_path + "\\" + "TreeOne" + "\\" + "test_two",
                                "runID": "utils_decorated_tree.TreeOne.test_two",
                            },
                        ],
                        "id_": file_path + "\\" + "TreeOne",
                    }
                ],
                "id_": file_path,
            }
        ],
        "id_": start_dir,
    }

    loader = unittest.TestLoader()
    suite = loader.discover(start_dir, pattern)
    tests, errors = build_test_tree(suite, start_dir)

    assert is_same_tree(expected, tests, ["id_", "lineno", "name"])
    assert not errors


def test_build_empty_tree() -> None:
    """The build_test_tree function should return None if there are no discovered test suites, and an empty list of errors if there are none in the discovered data."""
    start_dir = os.fsdecode(TEST_DATA_PATH)
    pattern = "does_not_exist*"

    loader = unittest.TestLoader()
    suite = loader.discover(start_dir, pattern)
    tests, errors = build_test_tree(suite, start_dir)

    assert tests is not None
    assert tests.get("children") == []
    assert not errors
