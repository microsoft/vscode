# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import json
import os
import pathlib
import sys

import coverage
import pytest
from packaging.version import Version

script_dir = pathlib.Path(__file__).parent.parent
sys.path.append(os.fspath(script_dir))

from .helpers import (  # noqa: E402
    TEST_DATA_PATH,
    runner_with_cwd_env,
)


def test_simple_pytest_coverage():
    """
    Test coverage payload is correct for simple pytest example. Output of coverage run is below.

    Name              Stmts   Miss Branch BrPart  Cover
    ---------------------------------------------------
    __init__.py           0      0      0      0   100%
    reverse.py           13      3      8      2    76%
    test_reverse.py      11      0      0      0   100%
    ---------------------------------------------------
    TOTAL                24      3      8      2    84%

    """
    args = []
    env_add = {"COVERAGE_ENABLED": "True"}
    cov_folder_path = TEST_DATA_PATH / "coverage_gen"
    actual = runner_with_cwd_env(args, cov_folder_path, env_add)
    assert actual
    cov = actual[-1]
    assert cov
    results = cov["result"]
    assert results
    assert len(results) == 3
    focal_function_coverage = results.get(os.fspath(TEST_DATA_PATH / "coverage_gen" / "reverse.py"))
    assert focal_function_coverage
    assert focal_function_coverage.get("lines_covered") is not None
    assert focal_function_coverage.get("lines_missed") is not None
    assert set(focal_function_coverage.get("lines_covered")) == {4, 5, 7, 9, 10, 11, 12, 13, 14, 17}
    assert len(set(focal_function_coverage.get("lines_missed"))) >= 3

    coverage_version = Version(coverage.__version__)
    # only include check for branches if the version is >= 7.7.0
    if coverage_version >= Version("7.7.0"):
        assert focal_function_coverage.get("executed_branches") == 4
        assert focal_function_coverage.get("total_branches") == 6


coverage_gen_file_path = TEST_DATA_PATH / "coverage_gen" / "coverage.json"


@pytest.fixture
def cleanup_coverage_gen_file():
    # delete the coverage file if it exists as part of test cleanup
    yield
    if os.path.exists(coverage_gen_file_path):  # noqa: PTH110
        os.remove(coverage_gen_file_path)  # noqa: PTH107


def test_coverage_gen_report(cleanup_coverage_gen_file):  # noqa: ARG001
    """
    Test coverage payload is correct for simple pytest example. Output of coverage run is below.

    Name              Stmts   Miss Branch BrPart  Cover
    ---------------------------------------------------
    __init__.py           0      0      0      0   100%
    reverse.py           13      3      8      2    76%
    test_reverse.py      11      0      0      0   100%
    ---------------------------------------------------
    TOTAL                24      3      8      2    84%

    """
    args = ["--cov-report=json"]
    env_add = {"COVERAGE_ENABLED": "True"}
    cov_folder_path = TEST_DATA_PATH / "coverage_gen"
    print("cov_folder_path", cov_folder_path)
    actual = runner_with_cwd_env(args, cov_folder_path, env_add)
    assert actual
    cov = actual[-1]
    assert cov
    results = cov["result"]
    assert results
    assert len(results) == 3
    focal_function_coverage = results.get(os.fspath(TEST_DATA_PATH / "coverage_gen" / "reverse.py"))
    assert focal_function_coverage
    assert focal_function_coverage.get("lines_covered") is not None
    assert focal_function_coverage.get("lines_missed") is not None
    assert set(focal_function_coverage.get("lines_covered")) == {4, 5, 7, 9, 10, 11, 12, 13, 14, 17}
    assert set(focal_function_coverage.get("lines_missed")) == {18, 19, 6}
    coverage_version = Version(coverage.__version__)
    # only include check for branches if the version is >= 7.7.0
    if coverage_version >= Version("7.7.0"):
        assert focal_function_coverage.get("executed_branches") == 4
        assert focal_function_coverage.get("total_branches") == 6
    # assert that the coverage file was created at the right path
    assert os.path.exists(coverage_gen_file_path)  # noqa: PTH110


def test_coverage_w_omit_config():
    """
    Test the coverage report generation with omit configuration.

    folder structure of coverage_w_config
    ├── coverage_w_config
    │   ├── test_ignore.py
    │   ├── test_ran.py
    │   └── pyproject.toml
    │   ├── tests
    │   │   └── test_disregard.py

    pyproject.toml file with the following content:
    [tool.coverage.report]
    omit = [
        "test_ignore.py",
        "tests/*.py" (this will ignore the coverage in the file tests/test_disregard.py)
    ]


    Assertions:
        - The coverage report is generated.
        - The coverage report contains results.
        - Only one file is reported in the coverage results.
    """
    env_add = {"COVERAGE_ENABLED": "True"}
    cov_folder_path = TEST_DATA_PATH / "coverage_w_config"
    print("cov_folder_path", cov_folder_path)
    actual = runner_with_cwd_env([], cov_folder_path, env_add)
    assert actual
    print("actual", json.dumps(actual, indent=2))
    cov = actual[-1]
    assert cov
    results = cov["result"]
    assert results
    # assert one file is reported and one file (as specified in pyproject.toml) is omitted
    assert len(results) == 1
