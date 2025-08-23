# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import os
import pathlib
import sys
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from unittest.mock import patch

import pytest

sys.path.append(os.fspath(pathlib.Path(__file__).parent))

python_files_path = pathlib.Path(__file__).parent.parent.parent
sys.path.insert(0, os.fspath(python_files_path))
sys.path.insert(0, os.fspath(python_files_path / "lib" / "python"))

from tests.pytestadapter import helpers  # noqa: E402
from unittestadapter.execution import run_tests  # noqa: E402

if TYPE_CHECKING:
    from unittestadapter.pvsc_utils import ExecutionPayloadDict

TEST_DATA_PATH = pathlib.Path(__file__).parent / ".data"


def test_no_ids_run() -> None:
    """This test runs on an empty array of test_ids, therefore it should return an empty dict for the result."""
    start_dir: str = os.fspath(TEST_DATA_PATH)
    testids = []
    pattern = "discovery_simple*"
    actual = run_tests(start_dir, testids, pattern, None, 1, None)
    assert actual
    assert all(item in actual for item in ("cwd", "status"))
    assert actual["status"] == "success"
    assert actual["cwd"] == os.fspath(TEST_DATA_PATH)
    if actual["result"] is not None:
        assert len(actual["result"]) == 0
    else:
        raise AssertionError("actual['result'] is None")


@pytest.fixture
def mock_send_run_data():
    with patch("unittestadapter.execution.send_run_data") as mock:
        yield mock


def test_single_ids_run(mock_send_run_data):
    """This test runs on a single test_id, therefore it should return a dict with a single key-value pair for the result.

    This single test passes so the outcome should be 'success'.
    """
    id_ = "discovery_simple.DiscoverySimple.test_one"
    os.environ["TEST_RUN_PIPE"] = "fake"
    actual: ExecutionPayloadDict = run_tests(
        os.fspath(TEST_DATA_PATH),
        [id_],
        "discovery_simple*",
        None,
        1,
        None,
    )

    # Access the arguments
    args, _ = mock_send_run_data.call_args
    test_actual = args[0]  # first argument is the result

    assert test_actual
    actual_result: Optional[Dict[str, Dict[str, Optional[str]]]] = actual["result"]
    if actual_result is None:
        raise AssertionError("actual_result is None")
    else:
        if not isinstance(actual_result, Dict):
            raise AssertionError("actual_result is not a Dict")
        assert len(actual_result) == 1
        assert id_ in actual_result
        id_result = actual_result[id_]
        assert id_result is not None
        assert "outcome" in id_result
        assert id_result["outcome"] == "success"


def test_subtest_run(mock_send_run_data) -> None:  # noqa: ARG001
    """This test runs on a the test_subtest which has a single method, test_even, that uses unittest subtest.

    The actual result of run should return a dict payload with 6 entry for the 6 subtests.
    """
    id_ = "test_subtest.NumbersTest.test_even"
    os.environ["TEST_RUN_PIPE"] = "fake"
    actual = run_tests(
        os.fspath(TEST_DATA_PATH),
        [id_],
        "test_subtest.py",
        None,
        1,
        None,
    )
    subtests_ids = [
        "test_subtest.NumbersTest.test_even (i=0)",
        "test_subtest.NumbersTest.test_even (i=1)",
        "test_subtest.NumbersTest.test_even (i=2)",
        "test_subtest.NumbersTest.test_even (i=3)",
        "test_subtest.NumbersTest.test_even (i=4)",
        "test_subtest.NumbersTest.test_even (i=5)",
    ]
    assert actual
    assert all(item in actual for item in ("cwd", "status"))
    assert actual["status"] == "success"
    assert actual["cwd"] == os.fspath(TEST_DATA_PATH)
    assert actual["result"] is not None
    result = actual["result"]
    assert len(result) == 6
    for id_ in subtests_ids:
        assert id_ in result


@pytest.mark.parametrize(
    ("test_ids", "pattern", "cwd", "expected_outcome"),
    [
        (
            [
                "test_add.TestAddFunction.test_add_negative_numbers",
                "test_add.TestAddFunction.test_add_positive_numbers",
            ],
            "test_add.py",
            os.fspath(TEST_DATA_PATH / "unittest_folder"),
            "success",
        ),
        (
            [
                "test_add.TestAddFunction.test_add_negative_numbers",
                "test_add.TestAddFunction.test_add_positive_numbers",
                "test_subtract.TestSubtractFunction.test_subtract_negative_numbers",
                "test_subtract.TestSubtractFunction.test_subtract_positive_numbers",
            ],
            "test*",
            os.fspath(TEST_DATA_PATH / "unittest_folder"),
            "success",
        ),
        (
            [
                "pattern_a_test.DiscoveryA.test_one_a",
                "pattern_a_test.DiscoveryA.test_two_a",
            ],
            "*test.py",
            os.fspath(TEST_DATA_PATH / "two_patterns"),
            "success",
        ),
        (
            [
                "test_pattern_b.DiscoveryB.test_one_b",
                "test_pattern_b.DiscoveryB.test_two_b",
            ],
            "test_*",
            os.fspath(TEST_DATA_PATH / "two_patterns"),
            "success",
        ),
        (
            [
                "file_one.CaseTwoFileOne.test_one",
                "file_one.CaseTwoFileOne.test_two",
                "folder.file_two.CaseTwoFileTwo.test_one",
                "folder.file_two.CaseTwoFileTwo.test_two",
            ],
            "*",
            os.fspath(TEST_DATA_PATH / "utils_nested_cases"),
            "success",
        ),
        (
            [
                "test_two_classes.ClassOne.test_one",
                "test_two_classes.ClassTwo.test_two",
            ],
            "test_two_classes.py",
            os.fspath(TEST_DATA_PATH),
            "success",
        ),
        (
            [
                "test_scene.TestMathOperations.test_operations(add)",
                "test_scene.TestMathOperations.test_operations(subtract)",
                "test_scene.TestMathOperations.test_operations(multiply)",
            ],
            "*",
            os.fspath(TEST_DATA_PATH / "test_scenarios" / "tests"),
            "success",
        ),
    ],
)
def test_multiple_ids_run(mock_send_run_data, test_ids, pattern, cwd, expected_outcome) -> None:  # noqa: ARG001
    """
    The following are all successful tests of different formats.

    # 1. Two tests with the `pattern` specified as a file
        # 2. Two test files in the same folder called `unittest_folder`
        # 3. A folder with two different test file patterns, this test gathers pattern `*test`
        # 4. A folder with two different test file patterns, this test gathers pattern `test_*`
        # 5. A nested structure where a test file is on the same level as a folder containing a test file
        # 6. Test file with two test classes

    All tests should have the outcome of `success`.
    """
    os.environ["TEST_RUN_PIPE"] = "fake"
    actual = run_tests(cwd, test_ids, pattern, None, 1, None)
    assert actual
    assert all(item in actual for item in ("cwd", "status"))
    assert actual["status"] == "success"
    assert actual["cwd"] == cwd
    assert actual["result"] is not None
    result = actual["result"]
    assert len(result) == len(test_ids)
    for test_id in test_ids:
        assert test_id in result
        id_result = result[test_id]
        assert id_result is not None
        assert "outcome" in id_result
        assert id_result["outcome"] == expected_outcome
    assert True


def test_failed_tests(mock_send_run_data):  # noqa: ARG001
    """This test runs on a single file `test_fail` with two tests that fail."""
    os.environ["TEST_RUN_PIPE"] = "fake"
    test_ids = [
        "test_fail_simple.RunFailSimple.test_one_fail",
        "test_fail_simple.RunFailSimple.test_two_fail",
    ]
    actual = run_tests(
        os.fspath(TEST_DATA_PATH),
        test_ids,
        "test_fail_simple*",
        None,
        1,
        None,
    )
    assert actual
    assert all(item in actual for item in ("cwd", "status"))
    assert actual["status"] == "success"
    assert actual["cwd"] == os.fspath(TEST_DATA_PATH)
    assert actual["result"] is not None
    result = actual["result"]
    assert len(result) == len(test_ids)
    for test_id in test_ids:
        assert test_id in result
        id_result = result[test_id]
        assert id_result is not None
        assert "outcome" in id_result
        assert id_result["outcome"] == "failure"
        assert "message" in id_result
        assert "traceback" in id_result
        assert "2 not greater than 3" in str(id_result["message"]) or "1 == 1" in str(
            id_result["traceback"]
        )
    assert True


def test_unknown_id(mock_send_run_data):  # noqa: ARG001
    """This test runs on a unknown test_id, therefore it should return an error as the outcome as it attempts to find the given test."""
    os.environ["TEST_RUN_PIPE"] = "fake"
    test_ids = ["unknown_id"]
    actual = run_tests(
        os.fspath(TEST_DATA_PATH),
        test_ids,
        "test_fail_simple*",
        None,
        1,
        None,
    )
    assert actual
    assert all(item in actual for item in ("cwd", "status"))
    assert actual["status"] == "success"
    assert actual["cwd"] == os.fspath(TEST_DATA_PATH)
    assert actual["result"] is not None
    result = actual["result"]
    assert len(result) == len(test_ids)
    assert "unittest.loader._FailedTest.unknown_id" in result
    id_result = result["unittest.loader._FailedTest.unknown_id"]
    assert id_result is not None
    assert "outcome" in id_result
    assert id_result["outcome"] == "error"
    assert "message" in id_result
    assert "traceback" in id_result


def test_incorrect_path():
    """This test runs on a non existent path, therefore it should return an error as the outcome as it attempts to find the given folder."""
    test_ids = ["unknown_id"]
    os.environ["TEST_RUN_PIPE"] = "fake"

    actual = run_tests(
        os.fspath(TEST_DATA_PATH / "unknown_folder"),
        test_ids,
        "test_fail_simple*",
        None,
        1,
        None,
    )
    assert actual
    assert all(item in actual for item in ("cwd", "status", "error"))
    assert actual["status"] == "error"
    assert actual["cwd"] == os.fspath(TEST_DATA_PATH / "unknown_folder")


def test_basic_run_django():
    """This test runs on a simple django project with three tests, two of which pass and one that fails."""
    data_path: pathlib.Path = TEST_DATA_PATH / "simple_django"
    manage_py_path: str = os.fsdecode(data_path / "manage.py")
    execution_script: pathlib.Path = (
        pathlib.Path(__file__).parent / "django_test_execution_script.py"
    )

    test_ids = [
        "polls.tests.QuestionModelTests.test_was_published_recently_with_future_question",
        "polls.tests.QuestionModelTests.test_was_published_recently_with_future_question_2",
        "polls.tests.QuestionModelTests.test_question_creation_and_retrieval",
    ]
    script_str = os.fsdecode(execution_script)
    actual = helpers.runner_with_cwd_env(
        [script_str, manage_py_path, *test_ids],
        data_path,
        {"MANAGE_PY_PATH": manage_py_path},
    )
    assert actual
    actual_list: List[Dict[str, Dict[str, Any]]] = actual
    actual_result_dict = {}
    assert len(actual_list) == 3
    for actual_item in actual_list:
        assert all(item in actual_item for item in ("status", "cwd", "result"))
        assert actual_item.get("cwd") == os.fspath(data_path)
        actual_result_dict.update(actual_item["result"])
    for test_id in test_ids:
        assert test_id in actual_result_dict
        id_result = actual_result_dict[test_id]
        assert id_result is not None
        assert "outcome" in id_result
        if (
            test_id
            == "polls.tests.QuestionModelTests.test_was_published_recently_with_future_question_2"
        ):
            assert id_result["outcome"] == "failure"
        else:
            assert id_result["outcome"] == "success"
