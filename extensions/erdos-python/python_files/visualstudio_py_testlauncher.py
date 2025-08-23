# Python Tools for Visual Studio
# Copyright(c) Microsoft Corporation
# All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the License); you may not use
# this file except in compliance with the License. You may obtain a copy of the
# License at http://www.apache.org/licenses/LICENSE-2.0
#
# THIS CODE IS PROVIDED ON AN  *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS
# OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY
# IMPLIED WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
# MERCHANTABLITY OR NON-INFRINGEMENT.
#
# See the Apache Version 2.0 License for specific language governing
# permissions and limitations under the License.

__author__ = "Microsoft Corporation <ptvshelp@microsoft.com>"
__version__ = "3.0.0.0"

import contextlib
import json
import os
import signal
import socket
import sys
import traceback
import unittest

try:
    import thread
except ModuleNotFoundError:
    import _thread as thread


class _TestOutput:
    """file like object which redirects output to the repl window."""

    errors = "strict"

    def __init__(self, old_out, is_stdout):
        self.is_stdout = is_stdout
        self.old_out = old_out
        if sys.version_info[0] >= 3 and hasattr(old_out, "buffer"):
            self.buffer = _TestOutputBuffer(old_out.buffer, is_stdout)

    def flush(self):
        if self.old_out:
            self.old_out.flush()

    def writelines(self, lines):
        for line in lines:
            self.write(line)

    @property
    def encoding(self):
        return "utf8"

    def write(self, value):
        _channel.send_event("stdout" if self.is_stdout else "stderr", content=value)
        if self.old_out:
            self.old_out.write(value)
            # flush immediately, else things go wonky and out of order
            self.flush()

    def isatty(self):
        return True

    def next(self):
        pass

    @property
    def name(self):
        if self.is_stdout:
            return "<stdout>"
        else:
            return "<stderr>"

    def __getattr__(self, name):
        return getattr(self.old_out, name)


class _TestOutputBuffer:
    def __init__(self, old_buffer, is_stdout):
        self.buffer = old_buffer
        self.is_stdout = is_stdout

    def write(self, data):
        _channel.send_event("stdout" if self.is_stdout else "stderr", content=data)
        self.buffer.write(data)

    def flush(self):
        self.buffer.flush()

    def truncate(self, pos=None):
        return self.buffer.truncate(pos)

    def tell(self):
        return self.buffer.tell()

    def seek(self, pos, whence=0):
        return self.buffer.seek(pos, whence)


class _IpcChannel:
    def __init__(self, socket, callback):
        self.socket = socket
        self.seq = 0
        self.callback = callback
        self.lock = thread.allocate_lock()
        self._closed = False
        # start the testing reader thread loop
        self.test_thread_id = thread.start_new_thread(self.read_socket, ())

    def close(self):
        self._closed = True

    def read_socket(self):
        try:
            self.socket.recv(1024)
            self.callback()
        except OSError:
            if not self._closed:
                raise

    def receive(self):
        pass

    def send_event(self, name, **args):
        with self.lock:
            body = {"type": "event", "seq": self.seq, "event": name, "body": args}
            self.seq += 1
            content = json.dumps(body).encode("utf8")
            headers = f"Content-Length: {len(content)}\n\n".encode()
            self.socket.send(headers)
            self.socket.send(content)


_channel = None


class VsTestResult(unittest.TextTestResult):
    def startTest(self, test):  # noqa: N802
        super().startTest(test)
        if _channel is not None:
            _channel.send_event(name="start", test=test.id())

    def addError(self, test, err):  # noqa: N802
        super().addError(test, err)
        self.sendResult(test, "error", err)

    def addFailure(self, test, err):  # noqa: N802
        super().addFailure(test, err)
        self.sendResult(test, "failed", err)

    def addSuccess(self, test):  # noqa: N802
        super().addSuccess(test)
        self.sendResult(test, "passed")

    def addSkip(self, test, reason):  # noqa: N802
        super().addSkip(test, reason)
        self.sendResult(test, "skipped")

    def addExpectedFailure(self, test, err):  # noqa: N802
        super().addExpectedFailure(test, err)
        self.sendResult(test, "failed-expected", err)

    def addUnexpectedSuccess(self, test):  # noqa: N802
        super().addUnexpectedSuccess(test)
        self.sendResult(test, "passed-unexpected")

    def addSubTest(self, test, subtest, err):  # noqa: N802
        super().addSubTest(test, subtest, err)
        self.sendResult(test, "subtest-passed" if err is None else "subtest-failed", err, subtest)

    def sendResult(self, test, outcome, trace=None, subtest=None):  # noqa: N802
        if _channel is not None:
            tb = None
            message = None
            if trace is not None:
                traceback.print_exc()
                formatted = traceback.format_exception(*trace)
                # Remove the 'Traceback (most recent call last)'
                formatted = formatted[1:]
                tb = "".join(formatted)
                message = str(trace[1])

            result = {
                "outcome": outcome,
                "traceback": tb,
                "message": message,
                "test": test.id(),
            }
            if subtest is not None:
                result["subtest"] = subtest.id()
            _channel.send_event("result", **result)


def stop_tests():
    try:
        os.kill(os.getpid(), signal.SIGUSR1)
    except Exception:
        os.kill(os.getpid(), signal.SIGTERM)


class ExitCommand(Exception):  # noqa: N818
    pass


def signal_handler(signal, frame):  # noqa: ARG001
    raise ExitCommand


def main():
    import os
    import sys
    import unittest
    from optparse import OptionParser

    global _channel

    parser = OptionParser(
        prog="visualstudio_py_testlauncher",
        usage="Usage: %prog [<option>] <test names>... ",
    )
    parser.add_option("--debug", action="store_true", help="Whether debugging the unit tests")
    parser.add_option(
        "-x",
        "--mixed-mode",
        action="store_true",
        help="wait for mixed-mode debugger to attach",
    )
    parser.add_option(
        "-t",
        "--test",
        type="str",
        dest="tests",
        action="append",
        help="specifies a test to run",
    )
    parser.add_option("--testFile", type="str", help="Fully qualitified path to file name")
    parser.add_option(
        "-c", "--coverage", type="str", help="enable code coverage and specify filename"
    )
    parser.add_option(
        "-r",
        "--result-port",
        type="int",
        help="connect to port on localhost and send test results",
    )
    parser.add_option("--us", type="str", help="Directory to start discovery")
    parser.add_option("--up", type="str", help="Pattern to match test files (test*.py default)")
    parser.add_option(
        "--ut",
        type="str",
        help="Top level directory of project (default to start directory)",
    )
    parser.add_option(
        "--uvInt",
        "--verboseInt",
        type="int",
        help="Verbose output (0 none, 1 (no -v) simple, 2 (-v) full)",
    )
    parser.add_option("--uf", "--failfast", type="str", help="Stop on first failure")
    parser.add_option("--uc", "--catch", type="str", help="Catch control-C and display results")
    (opts, _) = parser.parse_args()

    sys.path[0] = os.getcwd()  # noqa: PTH109
    if opts.result_port:
        try:
            signal.signal(signal.SIGUSR1, signal_handler)
        except Exception:
            with contextlib.suppress(Exception):
                signal.signal(signal.SIGTERM, signal_handler)
        _channel = _IpcChannel(
            socket.create_connection(("127.0.0.1", opts.result_port)), stop_tests
        )
        sys.stdout = _TestOutput(sys.stdout, is_stdout=True)
        sys.stderr = _TestOutput(sys.stderr, is_stdout=False)

    if opts.mixed_mode:
        # For mixed-mode attach, there's no ptvsd and hence no wait_for_attach(),
        # so we have to use Win32 API in a loop to do the same thing.
        from ctypes import c_char, windll
        from time import sleep

        while True:
            if windll.kernel32.IsDebuggerPresent() != 0:
                break
            sleep(0.1)
        try:
            debugger_helper = windll["Microsoft.PythonTools.Debugger.Helper.x86.dll"]
        except OSError:
            debugger_helper = windll["Microsoft.PythonTools.Debugger.Helper.x64.dll"]
        is_tracing = c_char.in_dll(debugger_helper, "isTracing")
        while True:
            if is_tracing.value != 0:
                break
            sleep(0.1)

    cov = None
    try:
        if opts.coverage:
            with contextlib.suppress(Exception):
                import coverage

                cov = coverage.coverage(opts.coverage)
                cov.load()
                cov.start()
        if opts.tests is None and opts.testFile is None:
            if opts.us is None:
                opts.us = "."
            if opts.up is None:
                opts.up = "test*.py"
            tests = unittest.defaultTestLoader.discover(opts.us, opts.up)
        else:
            # loadTestsFromNames doesn't work well (with duplicate file names or class names)
            # Easier approach is find the test suite and use that for running
            loader = unittest.TestLoader()
            # opts.us will be passed in
            suites = loader.discover(
                opts.us,
                pattern=os.path.basename(opts.testFile),  # noqa: PTH119
                top_level_dir=opts.ut,
            )
            suite = None
            tests = None
            if opts.tests is None:
                # Run everything in the test file
                tests = suites
            else:
                # Run a specific test class or test method
                for test_suite in suites._tests:  # noqa: SLF001
                    for cls in test_suite._tests:  # noqa: SLF001
                        with contextlib.suppress(Exception):
                            for m in cls._tests:
                                test_id = m.id()
                                if test_id.startswith(opts.tests[0]):
                                    suite = cls
                                if test_id in opts.tests:
                                    if tests is None:
                                        tests = unittest.TestSuite([m])
                                    else:
                                        tests.addTest(m)
                if tests is None:
                    tests = suite
            if tests is None and suite is None:
                _channel.send_event(
                    name="error",
                    outcome="",
                    traceback="",
                    message="Failed to identify the test",
                    test="",
                )
        if opts.uvInt is None:
            opts.uvInt = 0
        if opts.uf is not None:
            runner = unittest.TextTestRunner(
                verbosity=opts.uvInt, resultclass=VsTestResult, failfast=True
            )
        else:
            runner = unittest.TextTestRunner(verbosity=opts.uvInt, resultclass=VsTestResult)
        result = runner.run(tests)
        if _channel is not None:
            _channel.close()
        sys.exit(not result.wasSuccessful())
    finally:
        if cov is not None:
            cov.stop()
            cov.save()
            cov.xml_report(outfile=opts.coverage + ".xml", omit=__file__)
        if _channel is not None:
            _channel.send_event(name="done")
            _channel.socket.close()
        # prevent generation of the error 'Error in sys.exitfunc:'
        with contextlib.suppress(Exception):
            sys.stdout.close()
        with contextlib.suppress(Exception):
            sys.stderr.close()


if __name__ == "__main__":
    main()
