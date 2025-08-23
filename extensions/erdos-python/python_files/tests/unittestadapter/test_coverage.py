# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import os
import pathlib
import sys

import coverage
import pytest
from packaging.version import Version

sys.path.append(os.fspath(pathlib.Path(__file__).parent))

python_files_path = pathlib.Path(__file__).parent.parent.parent
sys.path.insert(0, os.fspath(python_files_path))
sys.path.insert(0, os.fspath(python_files_path / "lib" / "python"))

from tests.pytestadapter import helpers  # noqa: E402

TEST_DATA_PATH = pathlib.Path(__file__).parent / ".data"


def test_basic_coverage():
    """This test runs on a simple django project with three tests, two of which pass and one that fails."""
    coverage_ex_folder: pathlib.Path = TEST_DATA_PATH / "coverage_ex"
    execution_script: pathlib.Path = python_files_path / "unittestadapter" / "execution.py"
    test_ids = [
        "test_reverse.TestReverseFunctions.test_reverse_sentence",
        "test_reverse.TestReverseFunctions.test_reverse_sentence_error",
        "test_reverse.TestReverseFunctions.test_reverse_string",
    ]
    argv = [os.fsdecode(execution_script), "--udiscovery", "-vv", "-s", ".", "-p", "*test*.py"]
    argv = argv + test_ids

    actual = helpers.runner_with_cwd_env(
        argv,
        coverage_ex_folder,
        {"COVERAGE_ENABLED": os.fspath(coverage_ex_folder), "_TEST_VAR_UNITTEST": "True"},
    )

    assert actual
    cov = actual[-1]
    assert cov
    results = cov["result"]
    assert results
    assert len(results) == 3
    focal_function_coverage = results.get(os.fspath(TEST_DATA_PATH / "coverage_ex" / "reverse.py"))
    assert focal_function_coverage
    assert focal_function_coverage.get("lines_covered") is not None
    assert focal_function_coverage.get("lines_missed") is not None
    assert set(focal_function_coverage.get("lines_covered")) == {4, 5, 7, 9, 10, 11, 12, 13, 14}
    assert set(focal_function_coverage.get("lines_missed")) == {6}
    coverage_version = Version(coverage.__version__)
    # only include check for branches if the version is >= 7.7.0
    if coverage_version >= Version("7.7.0"):
        assert focal_function_coverage.get("executed_branches") == 3
        assert focal_function_coverage.get("total_branches") == 4


@pytest.mark.parametrize("manage_py_file", ["manage.py", "old_manage.py"])
@pytest.mark.timeout(30)
def test_basic_django_coverage(manage_py_file):
    """This test validates that the coverage is correctly calculated for a Django project."""
    data_path: pathlib.Path = TEST_DATA_PATH / "simple_django"
    manage_py_path: str = os.fsdecode(data_path / manage_py_file)
    execution_script: pathlib.Path = python_files_path / "unittestadapter" / "execution.py"

    test_ids = [
        "polls.tests.QuestionModelTests.test_was_published_recently_with_future_question",
        "polls.tests.QuestionModelTests.test_was_published_recently_with_future_question_2",
        "polls.tests.QuestionModelTests.test_question_creation_and_retrieval",
    ]

    script_str = os.fsdecode(execution_script)
    actual = helpers.runner_with_cwd_env(
        [script_str, "--udiscovery", "-p", "*test*.py", *test_ids],
        data_path,
        {
            "MANAGE_PY_PATH": manage_py_path,
            "_TEST_VAR_UNITTEST": "True",
            "COVERAGE_ENABLED": os.fspath(data_path),
        },
    )

    assert actual
    cov = actual[-1]
    assert cov
    results = cov["result"]
    assert results
    assert len(results) == 16
    polls_views_coverage = results.get(str(data_path / "polls" / "views.py"))
    assert polls_views_coverage
    assert polls_views_coverage.get("lines_covered") is not None
    assert polls_views_coverage.get("lines_missed") is not None
    assert set(polls_views_coverage.get("lines_covered")) == {3, 4, 6}
    assert set(polls_views_coverage.get("lines_missed")) == {7}

    model_cov = results.get(str(data_path / "polls" / "models.py"))
    coverage_version = Version(coverage.__version__)
    # only include check for branches if the version is >= 7.7.0
    if coverage_version >= Version("7.7.0"):
        assert model_cov.get("executed_branches") == 1
        assert model_cov.get("total_branches") == 2
