import ast
import contextlib
import io
import json
import sys
import traceback
import uuid
from typing import Dict, List, Optional, Union

STDIN = sys.stdin
STDOUT = sys.stdout
STDERR = sys.stderr
USER_GLOBALS = {}


def _send_message(msg: str):
    # Content-Length is the data size in bytes.
    length_msg = len(msg.encode())
    STDOUT.buffer.write(f"Content-Length: {length_msg}\r\n\r\n{msg}".encode())
    STDOUT.buffer.flush()


def send_message(**kwargs):
    _send_message(json.dumps({"jsonrpc": "2.0", **kwargs}))


def print_log(msg: str):
    send_message(method="log", params=msg)


def send_response(
    response: str,
    response_id: int,
    execution_status: bool = True,  # noqa: FBT001, FBT002
):
    send_message(
        id=response_id,
        result={"status": execution_status, "output": response},
    )


def send_request(params: Optional[Union[List, Dict]] = None):
    request_id = uuid.uuid4().hex
    if params is None:
        send_message(id=request_id, method="input")
    else:
        send_message(id=request_id, method="input", params=params)

    return request_id


original_input = input


def custom_input(prompt=""):
    try:
        send_request({"prompt": prompt})
        headers = get_headers()
        # Content-Length is the data size in bytes.
        content_length = int(headers.get("Content-Length", 0))

        if content_length:
            message_text = STDIN.buffer.read(content_length).decode()
            message_json = json.loads(message_text)
            return message_json["result"]["userInput"]
    except Exception:
        print_log(traceback.format_exc())


# Set input to our custom input
USER_GLOBALS["input"] = custom_input
input = custom_input  # noqa: A001


def handle_response(request_id):
    while not STDIN.closed:
        try:
            headers = get_headers()
            # Content-Length is the data size in bytes.
            content_length = int(headers.get("Content-Length", 0))

            if content_length:
                message_text = STDIN.buffer.read(content_length).decode()
                message_json = json.loads(message_text)
                our_user_input = message_json["result"]["userInput"]
                if message_json["id"] == request_id:
                    send_response(our_user_input, message_json["id"])
                elif message_json["method"] == "exit":
                    sys.exit(0)

        except Exception:  # noqa: PERF203
            print_log(traceback.format_exc())


def exec_function(user_input):
    try:
        compile(user_input, "<stdin>", "eval")
    except SyntaxError:
        return exec
    return eval


def check_valid_command(request):
    try:
        user_input = request["params"]
        ast.parse(user_input[0])
        send_response("True", request["id"])
    except SyntaxError:
        send_response("False", request["id"])


def execute(request, user_globals):
    str_output = CustomIO("<stdout>", encoding="utf-8")
    str_error = CustomIO("<stderr>", encoding="utf-8")
    str_input = CustomIO("<stdin>", encoding="utf-8", newline="\n")

    with contextlib.redirect_stdout(str_output), contextlib.redirect_stderr(str_error):
        original_stdin = sys.stdin
        try:
            sys.stdin = str_input
            execution_status = exec_user_input(request["params"], user_globals)
        finally:
            sys.stdin = original_stdin

    send_response(str_output.get_value(), request["id"], execution_status)


def exec_user_input(user_input, user_globals) -> bool:
    user_input = user_input[0] if isinstance(user_input, list) else user_input

    try:
        callable_ = exec_function(user_input)
        retval = callable_(user_input, user_globals)
        if retval is not None:
            print(retval)
        return True
    except KeyboardInterrupt:
        print(traceback.format_exc())
        return False
    except Exception:
        print(traceback.format_exc())
        return False


class CustomIO(io.TextIOWrapper):
    """Custom stream object to replace stdio."""

    def __init__(self, name, encoding="utf-8", newline=None):
        self._buffer = io.BytesIO()
        self._custom_name = name
        super().__init__(self._buffer, encoding=encoding, newline=newline)

    def close(self):
        """Provide this close method which is used by some tools."""
        # This is intentionally empty.

    def get_value(self) -> str:
        """Returns value from the buffer as string."""
        self.seek(0)
        return self.read()


def get_headers():
    headers = {}
    while True:
        line = STDIN.buffer.readline().decode().strip()
        if not line:
            break
        name, value = line.split(":", 1)
        headers[name] = value.strip()
    return headers


if __name__ == "__main__":
    while not STDIN.closed:
        try:
            headers = get_headers()
            # Content-Length is the data size in bytes.
            content_length = int(headers.get("Content-Length", 0))

            if content_length:
                request_text = STDIN.buffer.read(content_length).decode()
                request_json = json.loads(request_text)
                if request_json["method"] == "execute":
                    execute(request_json, USER_GLOBALS)
                if request_json["method"] == "check_valid_command":
                    check_valid_command(request_json)
                elif request_json["method"] == "exit":
                    sys.exit(0)

        except Exception:  # noqa: PERF203
            print_log(traceback.format_exc())
