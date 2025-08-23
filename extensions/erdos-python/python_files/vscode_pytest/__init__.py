# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from __future__ import annotations

import atexit
import contextlib
import json
import os
import pathlib
import sys
import traceback
from typing import TYPE_CHECKING, Any, Dict, Generator, Literal, TypedDict

import pytest

if TYPE_CHECKING:
    from pluggy import Result

USES_PYTEST_DESCRIBE = False

with contextlib.suppress(ImportError):
    from pytest_describe.plugin import DescribeBlock

    USES_PYTEST_DESCRIBE = True


class TestData(TypedDict):
    """A general class that all test objects inherit from."""

    name: str
    path: pathlib.Path
    type_: Literal["class", "function", "file", "folder", "test", "error"]
    id_: str


class TestItem(TestData):
    """A class defining test items."""

    lineno: str
    runID: str


class TestNode(TestData):
    """A general class that handles all test data which contains children."""

    children: list[TestNode | TestItem | None]


class VSCodePytestError(Exception):
    """A custom exception class for pytest errors."""

    def __init__(self, message):
        super().__init__(message)


ERRORS = []
IS_DISCOVERY = False
map_id_to_path = {}
collected_tests_so_far = []
TEST_RUN_PIPE = os.getenv("TEST_RUN_PIPE")
SYMLINK_PATH = None
INCLUDE_BRANCHES = False


def pytest_load_initial_conftests(early_config, parser, args):  # noqa: ARG001
    has_pytest_cov = early_config.pluginmanager.hasplugin("pytest_cov")
    has_cov_arg = any("--cov" in arg for arg in args)
    if has_cov_arg and not has_pytest_cov:
        raise VSCodePytestError(
            "\n \nERROR: pytest-cov is not installed, please install this before running pytest with coverage as pytest-cov is required. \n"
        )
    if "--cov-branch" in args:
        global INCLUDE_BRANCHES
        INCLUDE_BRANCHES = True

    global TEST_RUN_PIPE
    TEST_RUN_PIPE = os.getenv("TEST_RUN_PIPE")
    error_string = (
        "PYTEST ERROR: TEST_RUN_PIPE is not set at the time of pytest starting. "
        "Please confirm this environment variable is not being changed or removed "
        "as it is required for successful test discovery and execution."
        f"TEST_RUN_PIPE = {TEST_RUN_PIPE}\n"
    )
    if not TEST_RUN_PIPE:
        print(error_string, file=sys.stderr)
    if "--collect-only" in args:
        global IS_DISCOVERY
        IS_DISCOVERY = True

    # check if --rootdir is in the args
    for arg in args:
        if "--rootdir=" in arg:
            rootdir = pathlib.Path(arg.split("--rootdir=")[1])
            if not rootdir.exists():
                raise VSCodePytestError(
                    f"The path set in the argument --rootdir={rootdir} does not exist."
                )

            # Check if the rootdir is a symlink or a child of a symlink to the current cwd.
            is_symlink = False

            if rootdir.is_symlink():
                is_symlink = True
                print(
                    f"Plugin info[vscode-pytest]: rootdir argument, {rootdir}, is identified as a symlink."
                )
            elif rootdir.resolve() != rootdir:
                print("Plugin info[vscode-pytest]: Checking if rootdir is a child of a symlink.")
                is_symlink = has_symlink_parent(rootdir)
            if is_symlink:
                print(
                    f"Plugin info[vscode-pytest]: rootdir argument, {rootdir}, is identified as a symlink or child of a symlink, adjusting pytest paths accordingly.",
                )
                global SYMLINK_PATH
                SYMLINK_PATH = rootdir


def pytest_internalerror(excrepr, excinfo):  # noqa: ARG001
    """A pytest hook that is called when an internal error occurs.

    Keyword arguments:
    excrepr -- the exception representation.
    excinfo -- the exception information of type ExceptionInfo.
    """
    # call.excinfo.exconly() returns the exception as a string.
    ERRORS.append(excinfo.exconly() + "\n Check Python Logs for more details.")


def pytest_exception_interact(node, call, report):
    """A pytest hook that is called when an exception is raised which could be handled.

    Keyword arguments:
    node -- the node that raised the exception.
    call -- the call object.
    report -- the report object of either type CollectReport or TestReport.
    """
    # call.excinfo is the captured exception of the call, if it raised as type ExceptionInfo.
    # call.excinfo.exconly() returns the exception as a string.
    # If it is during discovery, then add the error to error logs.
    if IS_DISCOVERY:
        if call.excinfo and call.excinfo.typename != "AssertionError":
            if report.outcome == "skipped" and "SkipTest" in str(call):
                return
            ERRORS.append(call.excinfo.exconly() + "\n Check Python Logs for more details.")
        else:
            ERRORS.append(report.longreprtext + "\n Check Python Logs for more details.")
    else:
        # If during execution, send this data that the given node failed.
        report_value = "error"
        if call.excinfo.typename == "AssertionError":
            report_value = "failure"
        node_id = get_absolute_test_id(node.nodeid, get_node_path(node))
        if node_id not in collected_tests_so_far:
            collected_tests_so_far.append(node_id)
            item_result = create_test_outcome(
                node_id,
                report_value,
                "Test failed with exception",
                report.longreprtext,
            )
            collected_test = TestRunResultDict()
            collected_test[node_id] = item_result
            cwd = pathlib.Path.cwd()
            send_execution_message(
                os.fsdecode(cwd),
                "success",
                collected_test if collected_test else None,
            )


def has_symlink_parent(current_path):
    """Recursively checks if any parent directories of the given path are symbolic links."""
    # Convert the current path to an absolute Path object
    curr_path = pathlib.Path(current_path)
    print("Checking for symlink parent starting at current path: ", curr_path)

    # Iterate over all parent directories
    for parent in curr_path.parents:
        # Check if the parent directory is a symlink
        if parent.is_symlink():
            print(f"Symlink found at: {parent}")
            return True
    return False


def get_absolute_test_id(test_id: str, test_path: pathlib.Path) -> str:
    """A function that returns the absolute test id.

    This is necessary because testIds are relative to the rootdir.
    This does not work for our case since testIds when referenced during run time are relative to the instantiation
    location. Absolute paths for testIds are necessary for the test tree ensures configurations that change the rootdir
    of pytest are handled correctly.

    Keyword arguments:
    test_id -- the pytest id of the test which is relative to the rootdir.
    testPath -- the path to the file the test is located in, as a pathlib.Path object.
    """
    split_id = test_id.split("::")[1:]
    return "::".join([str(test_path), *split_id])


def pytest_keyboard_interrupt(excinfo):
    """A pytest hook that is called when a keyboard interrupt is raised.

    Keyword arguments:
    excinfo -- the exception information of type ExceptionInfo.
    """
    # The function execonly() returns the exception as a string.
    ERRORS.append(excinfo.exconly() + "\n Check Python Logs for more details.")


class TestOutcome(Dict):
    """A class that handles outcome for a single test.

    for pytest the outcome for a test is only 'passed', 'skipped' or 'failed'
    """

    test: str
    outcome: Literal["success", "failure", "skipped", "error"]
    message: str | None
    traceback: str | None
    subtest: str | None


def create_test_outcome(
    testid: str,
    outcome: str,
    message: str | None,
    traceback: str | None,
    subtype: str | None = None,  # noqa: ARG001
) -> TestOutcome:
    """A function that creates a TestOutcome object."""
    return TestOutcome(
        test=testid,
        outcome=outcome,
        message=message,
        traceback=traceback,  # TODO: traceback
        subtest=None,
    )


class TestRunResultDict(Dict[str, Dict[str, TestOutcome]]):
    """A class that stores all test run results."""

    outcome: str
    tests: dict[str, TestOutcome]


@pytest.hookimpl(hookwrapper=True, trylast=True)
def pytest_report_teststatus(report, config):  # noqa: ARG001
    """A pytest hook that is called when a test is called.

    It is called 3 times per test, during setup, call, and teardown.

    Keyword arguments:
    report -- the report on the test setup, call, and teardown.
    config -- configuration object.
    """
    cwd = pathlib.Path.cwd()
    if SYMLINK_PATH:
        cwd = SYMLINK_PATH

    if report.when == "call" or (report.when == "setup" and report.skipped):
        traceback = None
        message = None
        report_value = "skipped"
        if report.passed:
            report_value = "success"
        elif report.failed:
            report_value = "failure"
            message = report.longreprtext
        try:
            node_path = map_id_to_path[report.nodeid]
        except KeyError:
            node_path = cwd
        # Calculate the absolute test id and use this as the ID moving forward.
        absolute_node_id = get_absolute_test_id(report.nodeid, node_path)
        if absolute_node_id not in collected_tests_so_far:
            collected_tests_so_far.append(absolute_node_id)
            item_result = create_test_outcome(
                absolute_node_id,
                report_value,
                message,
                traceback,
            )
            collected_test = TestRunResultDict()
            collected_test[absolute_node_id] = item_result
            send_execution_message(
                os.fsdecode(cwd),
                "success",
                collected_test if collected_test else None,
            )
    yield


ERROR_MESSAGE_CONST = {
    2: "Pytest was unable to start or run any tests due to issues with test discovery or test collection.",
    3: "Pytest was interrupted by the user, for example by pressing Ctrl+C during test execution.",
    4: "Pytest encountered an internal error or exception during test execution.",
    5: "Pytest was unable to find any tests to run.",
}


@pytest.hookimpl(hookwrapper=True, trylast=True)
def pytest_runtest_protocol(item, nextitem):  # noqa: ARG001
    map_id_to_path[item.nodeid] = get_node_path(item)
    skipped = check_skipped_wrapper(item)
    if skipped:
        absolute_node_id = get_absolute_test_id(item.nodeid, get_node_path(item))
        report_value = "skipped"
        cwd = pathlib.Path.cwd()
        if absolute_node_id not in collected_tests_so_far:
            collected_tests_so_far.append(absolute_node_id)
            item_result = create_test_outcome(
                absolute_node_id,
                report_value,
                None,
                None,
            )
            collected_test = TestRunResultDict()
            collected_test[absolute_node_id] = item_result
            send_execution_message(
                os.fsdecode(cwd),
                "success",
                collected_test if collected_test else None,
            )
    yield


def check_skipped_wrapper(item):
    """A function that checks if a test is skipped or not by check its markers and its parent markers.

    Returns True if the test is marked as skipped at any level, False otherwise.

    Keyword arguments:
    item -- the pytest item object.
    """
    if item.own_markers and check_skipped_condition(item):
        return True
    parent = item.parent
    while isinstance(parent, pytest.Class):
        if parent.own_markers and check_skipped_condition(parent):
            return True
        parent = parent.parent
    return False


def check_skipped_condition(item):
    """A helper function that checks if a item has a skip or a true skip condition.

    Keyword arguments:
    item -- the pytest item object.
    """
    for marker in item.own_markers:
        # If the test is marked with skip then it will not hit the pytest_report_teststatus hook,
        # therefore we need to handle it as skipped here.
        skip_condition = False
        if marker.name == "skipif":
            skip_condition = any(marker.args)
        if marker.name == "skip" or skip_condition:
            return True
    return False


class FileCoverageInfo(TypedDict):
    lines_covered: list[int]
    lines_missed: list[int]
    executed_branches: int
    total_branches: int


def pytest_sessionfinish(session, exitstatus):
    """A pytest hook that is called after pytest has fulled finished.

    Keyword arguments:
    session -- the pytest session object.
    exitstatus -- the status code of the session.

    Exit code 0: All tests were collected and passed successfully
    Exit code 1: Tests were collected and run but some of the tests failed
    Exit code 2: Test execution was interrupted by the user
    Exit code 3: Internal error happened while executing tests
    Exit code 4: pytest command line usage error
    Exit code 5: No tests were collected
    """
    cwd = pathlib.Path.cwd()
    if SYMLINK_PATH:
        print("Plugin warning[vscode-pytest]: SYMLINK set, adjusting cwd.")
        cwd = pathlib.Path(SYMLINK_PATH)

    if IS_DISCOVERY:
        if not (exitstatus == 0 or exitstatus == 1 or exitstatus == 5):
            error_node: TestNode = {
                "name": "",
                "path": cwd,
                "type_": "error",
                "children": [],
                "id_": "",
            }
            send_discovery_message(os.fsdecode(cwd), error_node)
        try:
            session_node: TestNode | None = build_test_tree(session)
            if not session_node:
                raise VSCodePytestError(
                    "Something went wrong following pytest finish, \
                        no session node was created"
                )
            send_discovery_message(os.fsdecode(cwd), session_node)
        except Exception as e:
            ERRORS.append(
                f"Error Occurred, traceback: {(traceback.format_exc() if e.__traceback__ else '')}"
            )
            error_node: TestNode = {
                "name": "",
                "path": cwd,
                "type_": "error",
                "children": [],
                "id_": "",
            }
            send_discovery_message(os.fsdecode(cwd), error_node)
    else:
        if exitstatus == 0 or exitstatus == 1:
            exitstatus_bool = "success"
        else:
            ERRORS.append(
                f"Pytest exited with error status: {exitstatus}, {ERROR_MESSAGE_CONST[exitstatus]}"
            )
            exitstatus_bool = "error"

            send_execution_message(
                os.fsdecode(cwd),
                exitstatus_bool,
                None,
            )
        # send end of transmission token

    # send coverage if enabled
    is_coverage_run = os.environ.get("COVERAGE_ENABLED")
    if is_coverage_run == "True":
        # load the report and build the json result to return
        import coverage

        # insert "python_files/lib/python" into the path so packaging can be imported
        python_files_dir = pathlib.Path(__file__).parent.parent
        bundled_dir = pathlib.Path(python_files_dir / "lib" / "python")
        sys.path.append(os.fspath(bundled_dir))

        from packaging.version import Version

        coverage_version = Version(coverage.__version__)
        global INCLUDE_BRANCHES
        # only include branches if coverage version is 7.7.0 or greater (as this was when the api saves)
        if coverage_version < Version("7.7.0") and INCLUDE_BRANCHES:
            print(
                "Plugin warning[vscode-pytest]: Branch coverage not supported in this coverage versions < 7.7.0. Please upgrade coverage package if you would like to see branch coverage."
            )
            INCLUDE_BRANCHES = False

        try:
            from coverage.exceptions import NoSource
        except ImportError:
            from coverage.misc import NoSource

        cov = coverage.Coverage()
        cov.load()

        file_set: set[str] = cov.get_data().measured_files()
        file_coverage_map: dict[str, FileCoverageInfo] = {}

        # remove files omitted per coverage report config if any
        omit_files: list[str] | None = cov.config.report_omit
        if omit_files is not None:
            for pattern in omit_files:
                for file in list(file_set):
                    if pathlib.Path(file).match(pattern):
                        file_set.remove(file)

        for file in file_set:
            try:
                analysis = cov.analysis2(file)
                taken_file_branches = 0
                total_file_branches = -1

                if INCLUDE_BRANCHES:
                    branch_stats: dict[int, tuple[int, int]] = cov.branch_stats(file)
                    total_file_branches = sum(
                        [total_exits for total_exits, _ in branch_stats.values()]
                    )
                    taken_file_branches = sum(
                        [taken_exits for _, taken_exits in branch_stats.values()]
                    )

            except NoSource:
                # as per issue 24308 this best way to handle this edge case
                continue
            except Exception as e:
                print(
                    f"Plugin error[vscode-pytest]: Skipping analysis of file: {file} due to error: {e}"
                )
                continue
            lines_executable = {int(line_no) for line_no in analysis[1]}
            lines_missed = {int(line_no) for line_no in analysis[3]}
            lines_covered = lines_executable - lines_missed
            file_info: FileCoverageInfo = {
                "lines_covered": list(lines_covered),  # list of int
                "lines_missed": list(lines_missed),  # list of int
                "executed_branches": taken_file_branches,
                "total_branches": total_file_branches,
            }
            # convert relative path to absolute path
            if not pathlib.Path(file).is_absolute():
                file = str(pathlib.Path(file).resolve())
            file_coverage_map[file] = file_info

        payload: CoveragePayloadDict = CoveragePayloadDict(
            coverage=True,
            cwd=os.fspath(cwd),
            result=file_coverage_map,
            error=None,
        )
        send_message(payload)


def build_test_tree(session: pytest.Session) -> TestNode:
    """Builds a tree made up of testing nodes from the pytest session.

    Keyword arguments:
    session -- the pytest session object.
    """
    session_node = create_session_node(session)
    session_children_dict: dict[str, TestNode] = {}
    file_nodes_dict: dict[str, TestNode] = {}
    class_nodes_dict: dict[str, TestNode] = {}
    function_nodes_dict: dict[str, TestNode] = {}

    # Check to see if the global variable for symlink path is set
    if SYMLINK_PATH:
        session_node["path"] = SYMLINK_PATH
        session_node["id_"] = os.fspath(SYMLINK_PATH)

    for test_case in session.items:
        test_node = create_test_node(test_case)
        if hasattr(test_case, "callspec"):  # This means it is a parameterized test.
            function_name: str = ""
            # parameterized test cases cut the repetitive part of the name off.
            parent_part, parameterized_section = test_node["name"].split("[", 1)
            test_node["name"] = "[" + parameterized_section

            first_split = test_case.nodeid.rsplit(
                "::", 1
            )  # splits the parameterized test name from the rest of the nodeid
            second_split = first_split[0].rsplit(
                ".py", 1
            )  # splits the file path from the rest of the nodeid

            class_and_method = second_split[1] + "::"  # This has "::" separator at both ends
            # construct the parent id, so it is absolute path :: any class and method :: parent_part
            parent_id = os.fspath(get_node_path(test_case)) + class_and_method + parent_part
            # file, middle, param = test_case.nodeid.rsplit("::", 2)
            # parent_id = test_case.nodeid.rsplit("::", 1)[0] + "::" + parent_part
            # parent_path = os.fspath(get_node_path(test_case)) + "::" + parent_part
            try:
                function_name = test_case.originalname  # type: ignore
                function_test_node = function_nodes_dict[parent_id]
            except AttributeError:  # actual error has occurred
                ERRORS.append(
                    f"unable to find original name for {test_case.name} with parameterization detected."
                )
                raise VSCodePytestError(
                    "Unable to find original name for parameterized test case"
                ) from None
            except KeyError:
                function_test_node: TestNode = create_parameterized_function_node(
                    function_name, get_node_path(test_case), parent_id
                )
                function_nodes_dict[parent_id] = function_test_node
            if test_node not in function_test_node["children"]:
                function_test_node["children"].append(test_node)
            # Check if the parent node of the function is file, if so create/add to this file node.
            if isinstance(test_case.parent, pytest.File):
                # calculate the parent path of the test case
                parent_path = get_node_path(test_case.parent)
                try:
                    parent_test_case = file_nodes_dict[os.fspath(parent_path)]
                except KeyError:
                    parent_test_case = create_file_node(parent_path)
                    file_nodes_dict[os.fspath(parent_path)] = parent_test_case
                if function_test_node not in parent_test_case["children"]:
                    parent_test_case["children"].append(function_test_node)
            # If the parent is not a file, it is a class, add the function node as the test node to handle subsequent nesting.
            test_node = function_test_node
        if isinstance(test_case.parent, pytest.Class) or (
            USES_PYTEST_DESCRIBE and isinstance(test_case.parent, DescribeBlock)
        ):
            case_iter = test_case.parent
            node_child_iter = test_node
            test_class_node: TestNode | None = None
            while isinstance(case_iter, pytest.Class) or (
                USES_PYTEST_DESCRIBE and isinstance(case_iter, DescribeBlock)
            ):
                # While the given node is a class, create a class and nest the previous node as a child.
                try:
                    test_class_node = class_nodes_dict[case_iter.nodeid]
                except KeyError:
                    test_class_node = create_class_node(case_iter)
                    class_nodes_dict[case_iter.nodeid] = test_class_node
                # Check if the class already has the child node. This will occur if the test is parameterized.
                if node_child_iter not in test_class_node["children"]:
                    test_class_node["children"].append(node_child_iter)
                # Iterate up.
                node_child_iter = test_class_node
                case_iter = case_iter.parent
            # Now the parent node is not a class node, it is a file node.
            if case_iter:
                parent_module = case_iter
            else:
                ERRORS.append(f"Test class {case_iter} has no parent")
                break
            parent_path = get_node_path(parent_module)
            # Create a file node that has the last class as a child.
            try:
                test_file_node: TestNode = file_nodes_dict[os.fspath(parent_path)]
            except KeyError:
                test_file_node = create_file_node(parent_path)
                file_nodes_dict[os.fspath(parent_path)] = test_file_node
            # Check if the class is already a child of the file node.
            if test_class_node is not None and test_class_node not in test_file_node["children"]:
                test_file_node["children"].append(test_class_node)
        elif not hasattr(test_case, "callspec"):
            # This includes test cases that are pytest functions or a doctests.
            parent_path = get_node_path(test_case.parent)
            try:
                parent_test_case = file_nodes_dict[os.fspath(parent_path)]
            except KeyError:
                parent_test_case = create_file_node(parent_path)
                file_nodes_dict[os.fspath(parent_path)] = parent_test_case
            parent_test_case["children"].append(test_node)
    created_files_folders_dict: dict[str, TestNode] = {}
    for file_node in file_nodes_dict.values():
        # Iterate through all the files that exist and construct them into nested folders.
        root_folder_node: TestNode
        try:
            root_folder_node: TestNode = build_nested_folders(
                file_node, created_files_folders_dict, session_node
            )
        except ValueError:
            # This exception is raised when the session node is not a parent of the file node.
            print(
                "[vscode-pytest]: Session path not a parent of test paths, adjusting session node to common parent."
            )
            common_parent = os.path.commonpath([file_node["path"], get_node_path(session)])
            common_parent_path = pathlib.Path(common_parent)
            print("[vscode-pytest]: Session node now set to: ", common_parent)
            session_node["path"] = common_parent_path  # pathlib.Path
            session_node["id_"] = common_parent  # str
            session_node["name"] = common_parent_path.name  # str
            root_folder_node = build_nested_folders(
                file_node, created_files_folders_dict, session_node
            )
        # The final folder we get to is the highest folder in the path
        # and therefore we add this as a child to the session.
        root_id = root_folder_node.get("id_")
        if root_id and root_id not in session_children_dict:
            session_children_dict[root_id] = root_folder_node
    session_node["children"] = list(session_children_dict.values())
    return session_node


def build_nested_folders(
    file_node: TestNode,
    created_files_folders_dict: dict[str, TestNode],
    session_node: TestNode,
) -> TestNode:
    """Takes a file or folder and builds the nested folder structure for it.

    Keyword arguments:
    file_module -- the created module for the file we  are nesting.
    file_node -- the file node that we are building the nested folders for.
    created_files_folders_dict -- Dictionary of all the folders and files that have been created where the key is the path.
    session -- the pytest session object.
    """
    # check if session node is a parent of the file node, throw error if not.
    session_node_path = session_node["path"]
    is_relative = False
    try:
        is_relative = file_node["path"].is_relative_to(session_node_path)
    except AttributeError:
        is_relative = file_node["path"].relative_to(session_node_path)
    if not is_relative:
        # If the session node is not a parent of the file node, we need to find their common parent.
        raise ValueError("session and file not relative to each other, fixing now....")

    # Begin the iterator_path one level above the current file.
    prev_folder_node = file_node
    iterator_path = file_node["path"].parent
    counter = 0
    max_iter = 100
    while iterator_path != session_node_path:
        curr_folder_name = iterator_path.name
        try:
            curr_folder_node: TestNode = created_files_folders_dict[os.fspath(iterator_path)]
        except KeyError:
            curr_folder_node: TestNode = create_folder_node(curr_folder_name, iterator_path)
            created_files_folders_dict[os.fspath(iterator_path)] = curr_folder_node
        if prev_folder_node not in curr_folder_node["children"]:
            curr_folder_node["children"].append(prev_folder_node)
        iterator_path = iterator_path.parent
        prev_folder_node = curr_folder_node
        # Handles error where infinite loop occurs.
        counter += 1
        if counter > max_iter:
            raise ValueError(
                "[vscode-pytest]: Infinite loop occurred in build_nested_folders. iterator_path: ",
                iterator_path,
                "session_node_path: ",
                session_node_path,
            )
    return prev_folder_node


def create_test_node(
    test_case: pytest.Item,
) -> TestItem:
    """Creates a test node from a pytest test case.

    Keyword arguments:
    test_case -- the pytest test case.
    """
    test_case_loc: str = (
        str(test_case.location[1] + 1) if (test_case.location[1] is not None) else ""
    )
    absolute_test_id = get_absolute_test_id(test_case.nodeid, get_node_path(test_case))
    return {
        "name": test_case.name,
        "path": get_node_path(test_case),
        "lineno": test_case_loc,
        "type_": "test",
        "id_": absolute_test_id,
        "runID": absolute_test_id,
    }


def create_session_node(session: pytest.Session) -> TestNode:
    """Creates a session node from a pytest session.

    Keyword arguments:
    session -- the pytest session.
    """
    node_path = get_node_path(session)
    return {
        "name": node_path.name,
        "path": node_path,
        "type_": "folder",
        "children": [],
        "id_": os.fspath(node_path),
    }


def create_class_node(class_module: pytest.Class | DescribeBlock) -> TestNode:
    """Creates a class node from a pytest class object.

    Keyword arguments:
    class_module -- the pytest object representing a class module.
    """
    return {
        "name": class_module.name,
        "path": get_node_path(class_module),
        "type_": "class",
        "children": [],
        "id_": get_absolute_test_id(class_module.nodeid, get_node_path(class_module)),
    }


def create_parameterized_function_node(
    function_name: str, test_path: pathlib.Path, function_id: str
) -> TestNode:
    """Creates a function node to be the parent for the parameterized test nodes.

    Keyword arguments:
    function_name -- the name of the function.
    test_path -- the path to the test file.
    function_id -- the previously constructed function id that fits the pattern- absolute path :: any class and method :: parent_part
      must be edited to get a unique id for the function node.
    """
    return {
        "name": function_name,
        "path": test_path,
        "type_": "function",
        "children": [],
        "id_": function_id,
    }


def create_file_node(calculated_node_path: pathlib.Path) -> TestNode:
    """Creates a file node from a path which has already been calculated using the get_node_path function.

    Keyword arguments:
    calculated_node_path -- the pytest file path.
    """
    return {
        "name": calculated_node_path.name,
        "path": calculated_node_path,
        "type_": "file",
        "id_": os.fspath(calculated_node_path),
        "children": [],
    }


def create_folder_node(folder_name: str, path_iterator: pathlib.Path) -> TestNode:
    """Creates a folder node from a pytest folder name and its path.

    Keyword arguments:
    folderName -- the name of the folder.
    path_iterator -- the path of the folder.
    """
    return {
        "name": folder_name,
        "path": path_iterator,
        "type_": "folder",
        "id_": os.fspath(path_iterator),
        "children": [],
    }


class DiscoveryPayloadDict(TypedDict):
    """A dictionary that is used to send a post request to the server."""

    cwd: str
    status: Literal["success", "error"]
    tests: TestNode | None
    error: list[str] | None


class ExecutionPayloadDict(Dict):
    """A dictionary that is used to send a execution post request to the server."""

    cwd: str
    status: Literal["success", "error"]
    result: TestRunResultDict | None
    not_found: list[str] | None  # Currently unused need to check
    error: str | None  # Currently unused need to check


class CoveragePayloadDict(Dict):
    """A dictionary that is used to send a execution post request to the server."""

    coverage: bool
    cwd: str
    result: dict[str, FileCoverageInfo] | None
    error: str | None  # Currently unused need to check


def get_node_path(node: Any) -> pathlib.Path:
    """A function that returns the path of a node given the switch to pathlib.Path.

    It also evaluates if the node is a symlink and returns the equivalent path.
    """
    node_path = getattr(node, "path", None) or pathlib.Path(node.fspath)

    if not node_path:
        raise VSCodePytestError(
            f"Unable to find path for node: {node}, node.path: {node.path}, node.fspath: {node.fspath}"
        )

    # Check for the session node since it has the symlink already.
    if SYMLINK_PATH and not isinstance(node, pytest.Session):
        # Get relative between the cwd (resolved path) and the node path.
        try:
            # Check to see if the node path contains the symlink root already
            common_path = os.path.commonpath([SYMLINK_PATH, node_path])
            if common_path == os.fsdecode(SYMLINK_PATH):
                # The node path is already relative to the SYMLINK_PATH root therefore return
                return node_path
            else:
                # If the node path is not a symlink, then we need to calculate the equivalent symlink path
                # get the relative path between the cwd and the node path (as the node path is not a symlink).
                rel_path = node_path.relative_to(pathlib.Path.cwd())
                # combine the difference between the cwd and the node path with the symlink path
                return pathlib.Path(SYMLINK_PATH, rel_path)
        except Exception as e:
            raise VSCodePytestError(
                f"Error occurred while calculating symlink equivalent from node path: {e}"
                f"\n SYMLINK_PATH: {SYMLINK_PATH}, \n node path: {node_path}, \n cwd: {pathlib.Path.cwd()}"
            ) from e
    return node_path


__writer = None
atexit.register(lambda: __writer.close() if __writer else None)


def send_execution_message(
    cwd: str, status: Literal["success", "error"], tests: TestRunResultDict | None
):
    """Sends message execution payload details.

    Args:
        cwd (str): Current working directory.
        status (Literal["success", "error"]): Execution status indicating success or error.
        tests (Union[testRunResultDict, None]): Test run results, if available.
    """
    payload: ExecutionPayloadDict = ExecutionPayloadDict(
        cwd=cwd, status=status, result=tests, not_found=None, error=None
    )
    if ERRORS:
        payload["error"] = ERRORS
    send_message(payload)


def send_discovery_message(cwd: str, session_node: TestNode) -> None:
    """
    Sends a POST request with test session details in payload.

    Args:
        cwd (str): Current working directory.
        session_node (TestNode): Node information of the test session.
    """
    payload: DiscoveryPayloadDict = {
        "cwd": cwd,
        "status": "success" if not ERRORS else "error",
        "tests": session_node,
        "error": [],
    }
    if ERRORS is not None:
        payload["error"] = ERRORS
    send_message(payload, cls_encoder=PathEncoder)


class PathEncoder(json.JSONEncoder):
    """A custom JSON encoder that encodes pathlib.Path objects as strings."""

    def default(self, o):
        if isinstance(o, pathlib.Path):
            return os.fspath(o)
        return super().default(o)


def send_message(
    payload: ExecutionPayloadDict | DiscoveryPayloadDict | CoveragePayloadDict,
    cls_encoder=None,
):
    """
    Sends a post request to the server.

    Keyword arguments:
    payload -- the payload data to be sent.
    cls_encoder -- a custom encoder if needed.
    """
    if not TEST_RUN_PIPE:
        error_msg = (
            "PYTEST ERROR: TEST_RUN_PIPE is not set at the time of pytest starting. "
            "Please confirm this environment variable is not being changed or removed "
            "as it is required for successful test discovery and execution."
            f"TEST_RUN_PIPE = {TEST_RUN_PIPE}\n"
        )
        print(error_msg, file=sys.stderr)
        raise VSCodePytestError(error_msg)

    global __writer

    if __writer is None:
        try:
            __writer = open(TEST_RUN_PIPE, "wb")  # noqa: SIM115, PTH123
        except Exception as error:
            error_msg = f"Error attempting to connect to extension named pipe {TEST_RUN_PIPE}[vscode-pytest]: {error}"
            print(error_msg, file=sys.stderr)
            print(
                "If you are on a Windows machine, this error may be occurring if any of your tests clear environment variables"
                " as they are required to communicate with the extension. Please reference https://docs.pytest.org/en/stable/how-to/monkeypatch.html#monkeypatching-environment-variables"
                "for the correct way to clear environment variables during testing.\n",
                file=sys.stderr,
            )
            __writer = None
            raise VSCodePytestError(error_msg) from error

    rpc = {
        "jsonrpc": "2.0",
        "params": payload,
    }
    data = json.dumps(rpc, cls=cls_encoder)
    try:
        if __writer:
            request = (
                f"""content-length: {len(data)}\r\ncontent-type: application/json\r\n\r\n{data}"""
            )
            size = 4096
            encoded = request.encode("utf-8")
            bytes_written = 0
            while bytes_written < len(encoded):
                segment = encoded[bytes_written : bytes_written + size]
                bytes_written += __writer.write(segment)
                __writer.flush()
        else:
            print(
                f"Plugin error connection error[vscode-pytest], writer is None \n[vscode-pytest] data: \n{data} \n",
                file=sys.stderr,
            )
    except Exception as error:
        print(
            f"Plugin error, exception thrown while attempting to send data[vscode-pytest]: {error} \n[vscode-pytest] data: \n{data}\n",
            file=sys.stderr,
        )


class DeferPlugin:
    @pytest.hookimpl(hookwrapper=True)
    def pytest_xdist_auto_num_workers(
        self, config: pytest.Config
    ) -> Generator[None, Result[int], None]:
        """Determine how many workers to use based on how many tests were selected in the test explorer."""
        outcome = yield
        result = min(outcome.get_result(), len(config.option.file_or_dir))
        if result == 1:
            result = 0
        outcome.force_result(result)


def pytest_plugin_registered(plugin: object, manager: pytest.PytestPluginManager):
    plugin_name = "vscode_xdist"
    if (
        # only register the plugin if xdist is enabled:
        manager.hasplugin("xdist")
        # prevent infinite recursion:
        and not isinstance(plugin, DeferPlugin)
        # prevent this plugin from being registered multiple times:
        and not manager.hasplugin(plugin_name)
    ):
        manager.register(DeferPlugin(), name=plugin_name)
