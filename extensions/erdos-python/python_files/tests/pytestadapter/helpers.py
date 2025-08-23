# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import contextlib
import io
import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import threading
import uuid
from typing import Any, Dict, List, Optional, Tuple

if sys.platform == "win32":
    from namedpipe import NPopen


script_dir = pathlib.Path(__file__).parent.parent.parent
script_dir_child = pathlib.Path(__file__).parent.parent
sys.path.append(os.fspath(script_dir))
sys.path.append(os.fspath(script_dir_child))
sys.path.append(os.fspath(script_dir / "lib" / "python"))
print("sys add path", script_dir)

TEST_DATA_PATH = pathlib.Path(__file__).parent / ".data"
CONTENT_LENGTH: str = "Content-Length:"
CONTENT_TYPE: str = "Content-Type:"


@contextlib.contextmanager
def text_to_python_file(text_file_path: pathlib.Path):
    """Convert a text file to a python file and yield the python file path."""
    python_file = None
    try:
        contents = text_file_path.read_text(encoding="utf-8")
        python_file = text_file_path.with_suffix(".py")
        python_file.write_text(contents, encoding="utf-8")
        yield python_file
    finally:
        if python_file:
            python_file.unlink()


@contextlib.contextmanager
def create_symlink(root: pathlib.Path, target_ext: str, destination_ext: str):
    destination = None
    try:
        destination = root / destination_ext
        target = root / target_ext
        if destination and destination.exists():
            print("destination already exists", destination)
        try:
            destination.symlink_to(target)
        except Exception as e:
            print("error occurred when attempting to create a symlink", e)
        yield target, destination
    finally:
        if destination and destination.exists():
            destination.unlink()
        print("destination unlinked", destination)


def process_data_received(data: str) -> List[Dict[str, Any]]:
    """Process the all JSON data which comes from the server.

    After listen is finished, this function will be called.
    Here the data must be split into individual JSON messages and then parsed.

    This function also:
    - Checks that the jsonrpc value is 2.0
    """
    json_messages = []
    remaining = data
    while remaining:
        json_data, remaining = parse_rpc_message(remaining)
        # here json_data is a single rpc payload, now check its jsonrpc 2 and save the param data
        if "params" not in json_data or "jsonrpc" not in json_data:
            raise ValueError("Invalid JSON-RPC message received, missing params or jsonrpc key")
        elif json_data["jsonrpc"] != "2.0":
            raise ValueError("Invalid JSON-RPC version received, not version 2.0")
        else:
            json_messages.append(json_data["params"])

    return json_messages  # return the list of json messages


def parse_rpc_message(data: str) -> Tuple[Dict[str, str], str]:
    """Process the JSON data which comes from the server.

    A single rpc payload is in the format:
    content-length: #LEN# \r\ncontent-type: application/json\r\n\r\n{"jsonrpc": "2.0", "params": ENTIRE_DATA}

    returns:
    json_data: A single rpc payload of JSON data from the server.
    remaining: The remaining data after the JSON data.
    """
    str_stream: io.StringIO = io.StringIO(data)

    length: int = 0
    while True:
        line: str = str_stream.readline()
        if CONTENT_LENGTH.lower() in line.lower():
            length = int(line[len(CONTENT_LENGTH) :])

            line: str = str_stream.readline()
            if CONTENT_TYPE.lower() not in line.lower():
                raise ValueError("Header does not contain Content-Type")

            line = str_stream.readline()
            if line not in ["\r\n", "\n"]:
                raise ValueError("Header does not contain space to separate header and body")
            # if it passes all these checks then it has the right headers
            break

        if not line or line.isspace():
            raise ValueError("Header does not contain Content-Length")

    while True:  # keep reading until the number of bytes is the CONTENT_LENGTH
        line: str = str_stream.readline(length)
        try:
            # try to parse the json, if successful it is single payload so return with remaining data
            json_data: dict[str, str] = json.loads(line)
            return json_data, str_stream.read()
        except json.JSONDecodeError:
            print("json decode error")


def _listen_on_fifo(pipe_name: str, result: List[str], completed: threading.Event):
    # Open the FIFO for reading
    fifo_path = pathlib.Path(pipe_name)
    with fifo_path.open() as fifo:
        print("Waiting for data...")
        while True:
            if completed.is_set():
                break  # Exit loop if completed event is set
            data = fifo.read()  # This will block until data is available
            if len(data) == 0:
                # If data is empty, assume EOF
                break
            print(f"Received: {data}")
            result.append(data)


def _listen_on_pipe_new(listener, result: List[str], completed: threading.Event):
    """Listen on the named pipe or Unix domain socket for JSON data from the server.

    Created as a separate function for clarity in threading context.
    """
    # Windows design
    if sys.platform == "win32":
        all_data: list = []
        stream = listener.wait()
        while True:
            # Read data from collection
            close = stream.closed
            if close:
                break
            data = stream.readlines()
            if not data:
                if completed.is_set():
                    break  # Exit loop if completed event is set
            else:
                try:
                    # Attempt to accept another connection if the current one closes unexpectedly
                    print("attempt another connection")
                except socket.timeout:
                    # On timeout, append all collected data to result and return
                    # result.append("".join(all_data))
                    return
            data_decoded = "".join(data)
            all_data.append(data_decoded)
        # Append all collected data to result array
        result.append("".join(all_data))
    else:  # Unix design
        connection, _ = listener.socket.accept()
        listener.socket.settimeout(1)
        all_data: list = []
        while True:
            # Reading from connection
            data: bytes = connection.recv(1024 * 1024)
            if not data:
                if completed.is_set():
                    break  # Exit loop if completed event is set
                else:
                    try:
                        # Attempt to accept another connection if the current one closes unexpectedly
                        connection, _ = listener.socket.accept()
                    except socket.timeout:
                        # On timeout, append all collected data to result and return
                        result.append("".join(all_data))
                        return
            all_data.append(data.decode("utf-8"))
        # Append all collected data to result array
        result.append("".join(all_data))


def _run_test_code(proc_args: List[str], proc_env, proc_cwd: str, completed: threading.Event):
    result = subprocess.run(proc_args, env=proc_env, cwd=proc_cwd)
    completed.set()
    return result


def runner(args: List[str]) -> Optional[List[Dict[str, Any]]]:
    """Run a subprocess and a named-pipe to listen for messages at the same time with threading."""
    print("\n Running python test subprocess with cwd set to: ", TEST_DATA_PATH)
    return runner_with_cwd(args, TEST_DATA_PATH)


def runner_with_cwd(args: List[str], path: pathlib.Path) -> Optional[List[Dict[str, Any]]]:
    """Run a subprocess and a named-pipe to listen for messages at the same time with threading."""
    return runner_with_cwd_env(args, path, {})


def split_array_at_item(arr: List[str], item: str) -> Tuple[List[str], List[str]]:
    """
    Splits an array into two subarrays at the specified item.

    Args:
        arr (List[str]): The array to be split.
        item (str): The item at which to split the array.

    Returns:
        Tuple[List[str], List[str]]: A tuple containing two subarrays. The first subarray includes the item and all elements before it. The second subarray includes all elements after the item. If the item is not found, the first subarray is the original array and the second subarray is empty.
    """
    if item in arr:
        index = arr.index(item)
        before = arr[: index + 1]
        after = arr[index + 1 :]
        return before, after
    else:
        return arr, []


def runner_with_cwd_env(
    args: List[str], path: pathlib.Path, env_add: Dict[str, str]
) -> Optional[List[Dict[str, Any]]]:
    """
    Run a subprocess and a named-pipe to listen for messages at the same time with threading.

    Includes environment variables to add to the test environment.
    """
    process_args: List[str]
    pipe_name: str
    if "MANAGE_PY_PATH" in env_add and "COVERAGE_ENABLED" not in env_add:
        # If we are running Django, generate a unittest-specific pipe name.
        process_args = [sys.executable, *args]
        pipe_name = generate_random_pipe_name("unittest-discovery-test")
    elif "_TEST_VAR_UNITTEST" in env_add:
        before_args, after_ids = split_array_at_item(args, "*test*.py")
        process_args = [sys.executable, *before_args]
        pipe_name = generate_random_pipe_name("unittest-execution-test")
        test_ids_pipe = os.fspath(
            script_dir / "tests" / "unittestadapter" / ".data" / "coverage_ex" / "10943021.txt"
        )
        env_add.update({"RUN_TEST_IDS_PIPE": test_ids_pipe})
        test_ids_arr = after_ids
        with open(test_ids_pipe, "w") as f:  # noqa: PTH123
            f.write("\n".join(test_ids_arr))
    else:
        process_args = [sys.executable, "-m", "pytest", "-p", "vscode_pytest", "-s", *args]
        pipe_name = generate_random_pipe_name("pytest-discovery-test")

    if "COVERAGE_ENABLED" in env_add and "_TEST_VAR_UNITTEST" not in env_add:
        process_args = [
            sys.executable,
            "-m",
            "pytest",
            "-p",
            "vscode_pytest",
            "--cov=.",
            "--cov-branch",
            "-s",
            *args,
        ]

    # Generate pipe name, pipe name specific per OS type.

    # Windows design
    if sys.platform == "win32":
        with NPopen("r+t", name=pipe_name, bufsize=0) as pipe:
            # Update the environment with the pipe name and PYTHONPATH.
            env = os.environ.copy()
            env.update(
                {
                    "TEST_RUN_PIPE": pipe.path,
                    "PYTHONPATH": os.fspath(pathlib.Path(__file__).parent.parent.parent),
                }
            )
            # if additional environment variables are passed, add them to the environment
            if env_add:
                env.update(env_add)

            completed = threading.Event()

            result = []  # result is a string array to store the data during threading
            t1: threading.Thread = threading.Thread(
                target=_listen_on_pipe_new, args=(pipe, result, completed)
            )
            t1.start()

            t2 = threading.Thread(
                target=_run_test_code,
                args=(process_args, env, path, completed),
            )
            t2.start()

            t1.join()
            t2.join()

            return process_data_received(result[0]) if result else None
    else:  # Unix design
        # Update the environment with the pipe name and PYTHONPATH.
        env = os.environ.copy()
        env.update(
            {
                "TEST_RUN_PIPE": pipe_name,
                "PYTHONPATH": os.fspath(pathlib.Path(__file__).parent.parent.parent),
            }
        )
        # if additional environment variables are passed, add them to the environment
        if env_add:
            env.update(env_add)
        # server = UnixPipeServer(pipe_name)
        # server.start()
        #################
        # Create the FIFO (named pipe) if it doesn't exist
        # if not pathlib.Path.exists(pipe_name):
        os.mkfifo(pipe_name)
        #################

        completed = threading.Event()

        result = []  # result is a string array to store the data during threading
        t1: threading.Thread = threading.Thread(
            target=_listen_on_fifo, args=(pipe_name, result, completed)
        )
        t1.start()

        t2: threading.Thread = threading.Thread(
            target=_run_test_code,
            args=(process_args, env, path, completed),
        )

        t2.start()

        t1.join()
        t2.join()

        return process_data_received(result[0]) if result else None


def find_test_line_number(test_name: str, test_file_path) -> str:
    """Function which finds the correct line number for a test by looking for the "test_marker--[test_name]" string.

    The test_name is split on the "[" character to remove the parameterization information.

    Args:
    test_name: The name of the test to find the line number for, will be unique per file.
    test_file_path: The path to the test file where the test is located.
    """
    test_file_unique_id: str = "test_marker--" + test_name.split("[")[0]
    with open(test_file_path) as f:  # noqa: PTH123
        for i, line in enumerate(f):
            if test_file_unique_id in line:
                return str(i + 1)
    error_str: str = f"Test {test_name!r} not found on any line in {test_file_path}"
    raise ValueError(error_str)


def get_absolute_test_id(test_id: str, test_path: pathlib.Path) -> str:
    """Get the absolute test id by joining the testPath with the test_id."""
    split_id = test_id.split("::")[1:]
    return "::".join([str(test_path), *split_id])


def generate_random_pipe_name(prefix=""):
    # Generate a random suffix using UUID4, ensuring uniqueness.
    random_suffix = uuid.uuid4().hex[:10]
    # Default prefix if not provided.
    if not prefix:
        prefix = "python-ext-rpc"

    # For Windows, named pipes have a specific naming convention.
    if sys.platform == "win32":
        return f"\\\\.\\pipe\\{prefix}-{random_suffix}"

    # For Unix-like systems, use either the XDG_RUNTIME_DIR or a temporary directory.
    xdg_runtime_dir = os.getenv("XDG_RUNTIME_DIR")
    if xdg_runtime_dir:
        return os.path.join(xdg_runtime_dir, f"{prefix}-{random_suffix}")  # noqa: PTH118
    else:
        return os.path.join(tempfile.gettempdir(), f"{prefix}-{random_suffix}")  # noqa: PTH118


class UnixPipeServer:
    def __init__(self, name):
        self.name = name
        self.is_windows = sys.platform == "win32"
        if self.is_windows:
            raise NotImplementedError(
                "This class is only intended for Unix-like systems, not Windows."
            )
        else:
            # For Unix-like systems, use a Unix domain socket.
            self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            # Ensure the socket does not already exist
            try:
                os.unlink(self.name)  # noqa: PTH108
            except OSError:
                if os.path.exists(self.name):  # noqa: PTH110
                    raise

    def start(self):
        if self.is_windows:
            raise NotImplementedError(
                "This class is only intended for Unix-like systems, not Windows."
            )
        else:
            # Bind the socket to the address and listen for incoming connections.
            self.socket.bind(self.name)
            self.socket.listen(1)
            print(f"Server listening on {self.name}")

    def stop(self):
        # Clean up the server socket.
        self.socket.close()
        print("Server stopped.")
