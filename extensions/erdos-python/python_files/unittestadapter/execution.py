# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import atexit
import enum
import os
import pathlib
import sys
import sysconfig
import traceback
import unittest
from types import TracebackType
from typing import Dict, List, Optional, Set, Tuple, Type, Union

# Adds the scripts directory to the PATH as a workaround for enabling shell for test execution.
path_var_name = "PATH" if "PATH" in os.environ else "Path"
os.environ[path_var_name] = (
    sysconfig.get_paths()["scripts"] + os.pathsep + os.environ[path_var_name]
)

script_dir = pathlib.Path(__file__).parent
sys.path.append(os.fspath(script_dir))

from django_handler import django_execution_runner  # noqa: E402

from unittestadapter.pvsc_utils import (  # noqa: E402
    CoveragePayloadDict,
    ExecutionPayloadDict,
    FileCoverageInfo,
    TestExecutionStatus,
    VSCodeUnittestError,
    parse_unittest_args,
    send_post_request,
)

ErrorType = Union[Tuple[Type[BaseException], BaseException, TracebackType], Tuple[None, None, None]]
test_run_pipe = ""
START_DIR = ""


class TestOutcomeEnum(str, enum.Enum):
    error = "error"
    failure = "failure"
    success = "success"
    skipped = "skipped"
    expected_failure = "expected-failure"
    unexpected_success = "unexpected-success"
    subtest_success = "subtest-success"
    subtest_failure = "subtest-failure"


class UnittestTestResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        self.formatted: Dict[str, Dict[str, Union[str, None]]] = {}
        super().__init__(*args, **kwargs)

    def startTest(self, test: unittest.TestCase):  # noqa: N802
        super().startTest(test)

    def stopTestRun(self):  # noqa: N802
        super().stopTestRun()

    def addError(  # noqa: N802
        self,
        test: unittest.TestCase,
        err: ErrorType,
    ):
        super().addError(test, err)
        self.formatResult(test, TestOutcomeEnum.error, err)

    def addFailure(  # noqa: N802
        self,
        test: unittest.TestCase,
        err: ErrorType,
    ):
        super().addFailure(test, err)
        self.formatResult(test, TestOutcomeEnum.failure, err)

    def addSuccess(self, test: unittest.TestCase):  # noqa: N802
        super().addSuccess(test)
        self.formatResult(test, TestOutcomeEnum.success)

    def addSkip(self, test: unittest.TestCase, reason: str):  # noqa: N802
        super().addSkip(test, reason)
        self.formatResult(test, TestOutcomeEnum.skipped)

    def addExpectedFailure(self, test: unittest.TestCase, err: ErrorType):  # noqa: N802
        super().addExpectedFailure(test, err)
        self.formatResult(test, TestOutcomeEnum.expected_failure, err)

    def addUnexpectedSuccess(self, test: unittest.TestCase):  # noqa: N802
        super().addUnexpectedSuccess(test)
        self.formatResult(test, TestOutcomeEnum.unexpected_success)

    def addSubTest(  # noqa: N802
        self,
        test: unittest.TestCase,
        subtest: unittest.TestCase,
        err: Union[ErrorType, None],
    ):
        super().addSubTest(test, subtest, err)
        self.formatResult(
            test,
            TestOutcomeEnum.subtest_failure if err else TestOutcomeEnum.subtest_success,
            err,
            subtest,
        )

    def formatResult(  # noqa: N802
        self,
        test: unittest.TestCase,
        outcome: str,
        error: Union[ErrorType, None] = None,
        subtest: Union[unittest.TestCase, None] = None,
    ):
        tb = None

        message = ""
        # error is a tuple of the form returned by sys.exc_info(): (type, value, traceback).
        if error is not None:
            try:
                message = f"{error[0]} {error[1]}"
            except Exception:
                message = "Error occurred, unknown type or value"
            formatted = traceback.format_exception(*error)
            tb = "".join(formatted)
            # Remove the 'Traceback (most recent call last)'
            formatted = formatted[1:]
        test_id = subtest.id() if subtest else test.id()

        result = {
            "test": test.id(),
            "outcome": outcome,
            "message": message,
            "traceback": tb,
            "subtest": subtest.id() if subtest else None,
        }
        self.formatted[test_id] = result
        test_run_pipe = os.getenv("TEST_RUN_PIPE")
        if not test_run_pipe:
            print(
                "UNITTEST ERROR: TEST_RUN_PIPE is not set at the time of unittest trying to send data. "
                f"TEST_RUN_PIPE = {test_run_pipe}\n",
                file=sys.stderr,
            )
            raise VSCodeUnittestError(
                "UNITTEST ERROR: TEST_RUN_PIPE is not set at the time of unittest trying to send data. "
            )
        send_run_data(result, test_run_pipe)


def filter_tests(suite: unittest.TestSuite, test_ids: List[str]) -> unittest.TestSuite:
    """Filter the tests in the suite to only run the ones with the given ids."""
    filtered_suite = unittest.TestSuite()
    for test in suite:
        if isinstance(test, unittest.TestCase):
            if test.id() in test_ids:
                filtered_suite.addTest(test)
        else:
            filtered_suite.addTest(filter_tests(test, test_ids))
    return filtered_suite


def get_all_test_ids(suite: unittest.TestSuite) -> List[str]:
    """Return a list of all test ids in the suite."""
    test_ids = []
    for test in suite:
        if isinstance(test, unittest.TestCase):
            test_ids.append(test.id())
        else:
            test_ids.extend(get_all_test_ids(test))
    return test_ids


def find_missing_tests(test_ids: List[str], suite: unittest.TestSuite) -> List[str]:
    """Return a list of test ids that are not in the suite."""
    all_test_ids = get_all_test_ids(suite)
    return [test_id for test_id in test_ids if test_id not in all_test_ids]


# Args: start_path path to a directory or a file, list of ids that may be empty.
# Edge cases:
# - if tests got deleted since the VS Code side last ran discovery and the current test run,
# return these test ids in the "not_found" entry, and the VS Code side can process them as "unknown";
# - if tests got added since the VS Code side last ran discovery and the current test run, ignore them.
def run_tests(
    start_dir: str,
    test_ids: List[str],
    pattern: str,
    top_level_dir: Optional[str],
    verbosity: int,
    failfast: Optional[bool],  # noqa: FBT001
    locals_: Optional[bool] = None,  # noqa: FBT001
) -> ExecutionPayloadDict:
    cwd = os.path.abspath(start_dir)  # noqa: PTH100
    if "/" in start_dir:  #  is a subdir
        parent_dir = os.path.dirname(start_dir)  # noqa: PTH120
        sys.path.insert(0, parent_dir)
    else:
        sys.path.insert(0, cwd)
    status = TestExecutionStatus.error
    error = None
    payload: ExecutionPayloadDict = {"cwd": cwd, "status": status, "result": None}

    try:
        # If it's a file, split path and file name.
        start_dir = cwd
        if cwd.endswith(".py"):
            start_dir = os.path.dirname(cwd)  # noqa: PTH120
            pattern = os.path.basename(cwd)  # noqa: PTH119

        if failfast is None:
            failfast = False
        if locals_ is None:
            locals_ = False
        if verbosity is None:
            verbosity = 1
        runner = unittest.TextTestRunner(
            resultclass=UnittestTestResult,
            tb_locals=locals_,
            failfast=failfast,
            verbosity=verbosity,
        )

        # Discover tests at path with the file name as a pattern (if any).
        loader = unittest.TestLoader()
        suite = loader.discover(start_dir, pattern, top_level_dir)

        # lets try to tailer our own suite so we can figure out running only the ones we want
        tailor: unittest.TestSuite = filter_tests(suite, test_ids)

        # If any tests are missing, add them to the payload.
        not_found = find_missing_tests(test_ids, tailor)
        if not_found:
            missing_suite = loader.loadTestsFromNames(not_found)
            tailor.addTests(missing_suite)

        result: UnittestTestResult = runner.run(tailor)  # type: ignore

        payload["result"] = result.formatted

    except Exception:
        status = TestExecutionStatus.error
        error = traceback.format_exc()

    if error is not None:
        payload["error"] = error
    else:
        status = TestExecutionStatus.success

    payload["status"] = status

    return payload


__socket = None
atexit.register(lambda: __socket.close() if __socket else None)


def send_run_data(raw_data, test_run_pipe):
    status = raw_data["outcome"]
    cwd = os.path.abspath(START_DIR)  # noqa: PTH100
    test_id = raw_data["subtest"] or raw_data["test"]
    test_dict = {}
    test_dict[test_id] = raw_data
    payload: ExecutionPayloadDict = {"cwd": cwd, "status": status, "result": test_dict}
    send_post_request(payload, test_run_pipe)


if __name__ == "__main__":
    # Get unittest test execution arguments.
    argv = sys.argv[1:]
    index = argv.index("--udiscovery")

    (
        start_dir,
        pattern,
        top_level_dir,
        verbosity,
        failfast,
        locals_,
    ) = parse_unittest_args(argv[index + 1 :])

    run_test_ids_pipe = os.environ.get("RUN_TEST_IDS_PIPE")
    test_run_pipe = os.getenv("TEST_RUN_PIPE")
    if not run_test_ids_pipe:
        print("Error[vscode-unittest]: RUN_TEST_IDS_PIPE env var is not set.")
        raise VSCodeUnittestError("Error[vscode-unittest]: RUN_TEST_IDS_PIPE env var is not set.")
    if not test_run_pipe:
        print("Error[vscode-unittest]: TEST_RUN_PIPE env var is not set.")
        raise VSCodeUnittestError("Error[vscode-unittest]: TEST_RUN_PIPE env var is not set.")
    test_ids = []
    cwd = pathlib.Path(start_dir).absolute()
    try:
        # Read the test ids from the file, attempt to delete file afterwords.
        ids_path = pathlib.Path(run_test_ids_pipe)
        test_ids = ids_path.read_text(encoding="utf-8").splitlines()
        print("Received test ids from temp file.")
        try:
            ids_path.unlink()
        except Exception as e:
            print("Error[vscode-pytest]: unable to delete temp file" + str(e))

    except Exception as e:
        # No test ids received from buffer, return error payload
        status: TestExecutionStatus = TestExecutionStatus.error
        payload: ExecutionPayloadDict = {
            "cwd": str(cwd),
            "status": status,
            "result": None,
            "error": "No test ids read from temp file," + str(e),
        }
        send_post_request(payload, test_run_pipe)

    workspace_root = os.environ.get("COVERAGE_ENABLED")
    # For unittest COVERAGE_ENABLED is to the root of the workspace so correct data is collected
    cov = None
    is_coverage_run = os.environ.get("COVERAGE_ENABLED") is not None
    include_branches = False
    if is_coverage_run:
        print(
            "COVERAGE_ENABLED env var set, starting coverage. workspace_root used as parent dir:",
            workspace_root,
        )
        import coverage

        # insert "python_files/lib/python" into the path so packaging can be imported
        python_files_dir = pathlib.Path(__file__).parent.parent
        bundled_dir = pathlib.Path(python_files_dir / "lib" / "python")
        sys.path.append(os.fspath(bundled_dir))

        from packaging.version import Version

        coverage_version = Version(coverage.__version__)
        # only include branches if coverage version is 7.7.0 or greater (as this was when the api saves)
        if coverage_version >= Version("7.7.0"):
            include_branches = True

        source_ar: List[str] = []
        if workspace_root:
            source_ar.append(workspace_root)
        if top_level_dir:
            source_ar.append(top_level_dir)
        if start_dir:
            source_ar.append(os.path.abspath(start_dir))  # noqa: PTH100
        cov = coverage.Coverage(
            branch=include_branches, source=source_ar
        )  # is at least 1 of these required??
        cov.start()

    # If no error occurred, we will have test ids to run.
    if manage_py_path := os.environ.get("MANAGE_PY_PATH"):
        print("MANAGE_PY_PATH env var set, running Django test suite.")
        args = argv[index + 1 :] or []
        django_execution_runner(manage_py_path, test_ids, args)
    else:
        # Perform regular unittest execution.
        payload = run_tests(
            start_dir,
            test_ids,
            pattern,
            top_level_dir,
            verbosity,
            failfast,
            locals_,
        )

    if is_coverage_run:
        import coverage

        if not cov:
            raise VSCodeUnittestError("Coverage is enabled but cov is not set")
        cov.stop()
        cov.save()
        cov.load()
        file_set: Set[str] = cov.get_data().measured_files()
        file_coverage_map: Dict[str, FileCoverageInfo] = {}
        for file in file_set:
            analysis = cov.analysis2(file)
            taken_file_branches = 0
            total_file_branches = -1

            if include_branches:
                branch_stats: dict[int, tuple[int, int]] = cov.branch_stats(file)
                total_file_branches = sum([total_exits for total_exits, _ in branch_stats.values()])
                taken_file_branches = sum([taken_exits for _, taken_exits in branch_stats.values()])

            lines_executable = {int(line_no) for line_no in analysis[1]}
            lines_missed = {int(line_no) for line_no in analysis[3]}
            lines_covered = lines_executable - lines_missed
            file_info: FileCoverageInfo = {
                "lines_covered": list(lines_covered),  # list of int
                "lines_missed": list(lines_missed),  # list of int
                "executed_branches": taken_file_branches,
                "total_branches": total_file_branches,
            }
            file_coverage_map[file] = file_info

        payload_cov: CoveragePayloadDict = CoveragePayloadDict(
            coverage=True,
            cwd=os.fspath(cwd),
            result=file_coverage_map,
            error=None,
        )
        send_post_request(payload_cov, test_run_pipe)
