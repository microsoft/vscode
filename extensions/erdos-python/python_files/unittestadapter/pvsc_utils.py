# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import argparse
import atexit
import doctest
import enum
import inspect
import json
import os
import pathlib
import sys
import unittest
from typing import Dict, List, Literal, Optional, Tuple, TypedDict, Union

script_dir = pathlib.Path(__file__).parent.parent
sys.path.append(os.fspath(script_dir))
sys.path.append(os.fspath(script_dir / "lib" / "python"))

from typing_extensions import NotRequired  # noqa: E402

# Types


# Inherit from str so it's JSON serializable.
class TestNodeTypeEnum(str, enum.Enum):
    class_ = "class"
    file = "file"
    folder = "folder"
    test = "test"


class TestData(TypedDict):
    name: str
    path: str
    type_: TestNodeTypeEnum
    id_: str


class TestItem(TestData):
    lineno: str
    runID: str


class TestNode(TestData):
    children: "List[TestNode | TestItem]"


class TestExecutionStatus(str, enum.Enum):
    error = "error"
    success = "success"


class VSCodeUnittestError(Exception):
    """A custom exception class for unittest errors."""

    def __init__(self, message):
        super().__init__(message)


class DiscoveryPayloadDict(TypedDict):
    cwd: str
    status: Literal["success", "error"]
    tests: Optional[TestNode]
    error: NotRequired[List[str]]


class ExecutionPayloadDict(TypedDict):
    cwd: str
    status: TestExecutionStatus
    result: Optional[Dict[str, Dict[str, Optional[str]]]]
    not_found: NotRequired[List[str]]
    error: NotRequired[str]


class FileCoverageInfo(TypedDict):
    lines_covered: List[int]
    lines_missed: List[int]
    executed_branches: int
    total_branches: int


class CoveragePayloadDict(Dict):
    """A dictionary that is used to send a execution post request to the server."""

    coverage: bool
    cwd: str
    result: Optional[Dict[str, FileCoverageInfo]]
    error: Optional[str]  # Currently unused need to check


# Helper functions for data retrieval.


def get_test_case(suite):
    """Iterate through a unittest test suite and return all test cases."""
    for test in suite:
        if isinstance(test, unittest.TestCase):
            yield test
        else:
            yield from get_test_case(test)


def get_source_line(obj) -> str:
    """Get the line number of a test case start line."""
    try:
        sourcelines, lineno = inspect.getsourcelines(obj)
    except Exception:
        try:
            # tornado-specific, see https://github.com/microsoft/vscode-python/issues/17285.
            sourcelines, lineno = inspect.getsourcelines(obj.orig_method)
        except Exception:
            return "*"

    # Return the line number of the first line of the test case definition.
    for i, v in enumerate(sourcelines):
        if v.strip().startswith(("def", "async def")):
            return str(lineno + i)

    return "*"


# Helper functions for test tree building.


def build_test_node(path: str, name: str, type_: TestNodeTypeEnum) -> TestNode:
    """Build a test node with no children. A test node can be a folder, a file or a class."""
    ## figure out if we are folder, file, or class
    id_gen = path
    if type_ == TestNodeTypeEnum.folder or type_ == TestNodeTypeEnum.file:
        id_gen = path
    else:
        # means we have to build test node for class
        id_gen = path + "\\" + name

    return {"path": path, "name": name, "type_": type_, "children": [], "id_": id_gen}


def get_child_node(name: str, path: str, type_: TestNodeTypeEnum, root: TestNode) -> TestNode:
    """Find a child node in a test tree given its name, type and path.

    If the node doesn't exist, create it.
    Path is required to distinguish between nodes with the same name and type.
    """
    try:
        result = next(
            node
            for node in root["children"]
            if node["name"] == name and node["type_"] == type_ and node["path"] == path
        )
    except StopIteration:
        result = build_test_node(path, name, type_)
        root["children"].append(result)

    return result  # type:ignore


def build_test_tree(
    suite: unittest.TestSuite, top_level_directory: str
) -> Tuple[Union[TestNode, None], List[str]]:
    """Build a test tree from a unittest test suite.

    This function returns the test tree, and any errors found by unittest.
    If no tests were discovered, return `None` and a list of errors (if any).

    Test tree structure:
    {
        "path": <test_directory path>,
        "type": "folder",
        "name": <folder name>,
        "children": [
            { files and folders }
            ...
            {
                "path": <file path>,
                "name": filename.py,
                "type_": "file",
                "children": [
                    {
                        "path": <class path>,
                        "name": <class name>,
                        "type_": "class",
                        "children": [
                            {
                                "path": <test path>,
                                "name": <test name>,
                                "type_": "test",
                                "lineno": <line number>
                                "id_": <test case id following format in line 196>,
                            }
                        ],
                        "id_": <class path path following format after path>
                    }
                ],
                "id_": <file path>
            }
        ],
        "id_": <test_directory path>
    }
    """
    error = []
    directory_path = pathlib.PurePath(top_level_directory)
    root = build_test_node(top_level_directory, directory_path.name, TestNodeTypeEnum.folder)

    for test_case in get_test_case(suite):
        if isinstance(test_case, doctest.DocTestCase):
            print(
                "Skipping doctest as it is not supported for the extension. Test case: ", test_case
            )
            error = ["Skipping doctest as it is not supported for the extension."]
            continue
        test_id = test_case.id()
        if test_id.startswith("unittest.loader._FailedTest"):
            error.append(str(test_case._exception))  # type: ignore  # noqa: SLF001
        elif test_id.startswith("unittest.loader.ModuleSkipped"):
            components = test_id.split(".")
            class_name = f"{components[-1]}.py"
            # Find/build class node.
            file_path = os.fsdecode(directory_path / class_name)
            current_node = get_child_node(class_name, file_path, TestNodeTypeEnum.file, root)
        else:
            # Get the static test path components: filename, class name and function name.
            components = test_id.split(".")
            *folders, filename, class_name, function_name = components
            py_filename = f"{filename}.py"

            current_node = root

            # Find/build nodes for the intermediate folders in the test path.
            for folder in folders:
                current_node = get_child_node(
                    folder,
                    os.fsdecode(pathlib.PurePath(current_node["path"], folder)),
                    TestNodeTypeEnum.folder,
                    current_node,
                )

            # Find/build file node.
            path_components = [top_level_directory, *folders, py_filename]
            file_path = os.fsdecode(pathlib.PurePath("/".join(path_components)))
            current_node = get_child_node(
                py_filename, file_path, TestNodeTypeEnum.file, current_node
            )

            # Find/build class node.
            current_node = get_child_node(
                class_name, file_path, TestNodeTypeEnum.class_, current_node
            )

            # Get test line number.
            test_method = getattr(test_case, test_case._testMethodName)  # noqa: SLF001
            lineno = get_source_line(test_method)

            # Add test node.
            test_node: TestItem = {
                "name": function_name,
                "path": file_path,
                "lineno": lineno,
                "type_": TestNodeTypeEnum.test,
                "id_": file_path + "\\" + class_name + "\\" + function_name,
                "runID": test_id,
            }  # concatenate class name and function test name
            current_node["children"].append(test_node)

    return root, error


def parse_unittest_args(
    args: List[str],
) -> Tuple[str, str, Union[str, None], int, Union[bool, None], Union[bool, None]]:
    """Parse command-line arguments that should be forwarded to unittest to perform discovery.

    Valid unittest arguments are: -v, -s, -p, -t and their long-form counterparts,
    however we only care about the last three.

    The returned tuple contains the following items
    - start_directory: The directory where to start discovery, defaults to .
    - pattern: The pattern to match test files, defaults to test*.py
    - top_level_directory: The top-level directory of the project, defaults to None,
      and unittest will use start_directory behind the scenes.
    """
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument("--start-directory", "-s", default=".")
    arg_parser.add_argument("--pattern", "-p", default="test*.py")
    arg_parser.add_argument("--top-level-directory", "-t", default=None)
    arg_parser.add_argument("--failfast", "-f", action="store_true", default=None)
    arg_parser.add_argument("--verbose", "-v", action="store_true", default=None)
    arg_parser.add_argument("-q", "--quiet", action="store_true", default=None)
    arg_parser.add_argument("--locals", action="store_true", default=None)

    parsed_args, _ = arg_parser.parse_known_args(args)

    verbosity: int = 1
    if parsed_args.quiet:
        verbosity = 0
    elif parsed_args.verbose:
        verbosity = 2

    return (
        parsed_args.start_directory,
        parsed_args.pattern,
        parsed_args.top_level_directory,
        verbosity,
        parsed_args.failfast,
        parsed_args.locals,
    )


__writer = None
atexit.register(lambda: __writer.close() if __writer else None)


def send_post_request(
    payload: Union[ExecutionPayloadDict, DiscoveryPayloadDict, CoveragePayloadDict],
    test_run_pipe: Optional[str],
):
    """
    Sends a post request to the server.

    Keyword arguments:
    payload -- the payload data to be sent.
    test_run_pipe -- the name of the pipe to send the data to.
    """
    if not test_run_pipe:
        error_msg = (
            "UNITTEST ERROR: TEST_RUN_PIPE is not set at the time of unittest trying to send data. "
            "Please confirm this environment variable is not being changed or removed "
            "as it is required for successful test discovery and execution."
            f"TEST_RUN_PIPE = {test_run_pipe}\n"
        )
        print(error_msg, file=sys.stderr)
        raise VSCodeUnittestError(error_msg)

    global __writer

    if __writer is None:
        try:
            __writer = open(test_run_pipe, "wb")  # noqa: SIM115, PTH123
        except Exception as error:
            error_msg = f"Error attempting to connect to extension named pipe {test_run_pipe}[vscode-unittest]: {error}"
            print(error_msg, file=sys.stderr)
            __writer = None
            raise VSCodeUnittestError(error_msg) from error

    rpc = {
        "jsonrpc": "2.0",
        "params": payload,
    }
    data = json.dumps(rpc)
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
                f"Connection error[vscode-unittest], writer is None \n[vscode-unittest] data: \n{data} \n",
                file=sys.stderr,
            )
    except Exception as error:
        print(
            f"Exception thrown while attempting to send data[vscode-unittest]: {error} \n[vscode-unittest] data: \n{data}\n",
            file=sys.stderr,
        )
