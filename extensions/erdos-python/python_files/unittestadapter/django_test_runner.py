# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import os
import pathlib
import sys

script_dir = pathlib.Path(__file__).parent.parent
sys.path.append(os.fspath(script_dir))

from typing import TYPE_CHECKING  # noqa: E402

from execution import UnittestTestResult  # noqa: E402
from pvsc_utils import (  # noqa: E402
    DiscoveryPayloadDict,
    VSCodeUnittestError,
    build_test_tree,
    send_post_request,
)

try:
    from django.test.runner import DiscoverRunner
except ImportError:
    raise ImportError(  # noqa: B904
        "Django module not found. Please only use the environment variable MANAGE_PY_PATH if you want to use Django."
    )


if TYPE_CHECKING:
    import unittest


class CustomDiscoveryTestRunner(DiscoverRunner):
    """Custom test runner for Django to handle test DISCOVERY and building the test tree."""

    def run_tests(self, test_labels, **kwargs):
        test_run_pipe: str | None = os.getenv("TEST_RUN_PIPE")
        if not test_run_pipe:
            error_msg = (
                "UNITTEST ERROR: TEST_RUN_PIPE is not set at the time of unittest trying to send data. "
                "Please confirm this environment variable is not being changed or removed "
                "as it is required for successful test discovery and execution."
                f"TEST_RUN_PIPE = {test_run_pipe}\n"
            )
            print(error_msg, file=sys.stderr)
            raise VSCodeUnittestError(error_msg)
        try:
            top_level_dir: pathlib.Path = pathlib.Path.cwd()

            # Discover tests and build into a tree.
            suite: unittest.TestSuite = self.build_suite(test_labels, **kwargs)
            tests, error = build_test_tree(suite, os.fspath(top_level_dir))

            payload: DiscoveryPayloadDict = {
                "cwd": os.fspath(top_level_dir),
                "status": "success",
                "tests": None,
            }
            payload["tests"] = tests if tests is not None else None
            if len(error):
                payload["status"] = "error"
                payload["error"] = error

            # Send discovery payload.
            send_post_request(payload, test_run_pipe)
            return 0  # Skip actual test execution, return 0 as no tests were run.
        except Exception as e:
            error_msg = (
                "DJANGO ERROR: An error occurred while discovering and building the test suite. "
                f"Error: {e}\n"
            )
            print(error_msg, file=sys.stderr)
            raise VSCodeUnittestError(error_msg)  # noqa: B904


class CustomExecutionTestRunner(DiscoverRunner):
    """Custom test runner for Django to handle test EXECUTION and uses UnittestTestResult to send dynamic run results."""

    def get_test_runner_kwargs(self):
        """Override to provide custom test runner; resultclass."""
        test_run_pipe: str | None = os.getenv("TEST_RUN_PIPE")
        if not test_run_pipe:
            error_msg = (
                "UNITTEST ERROR: TEST_RUN_PIPE is not set at the time of Django trying to send data. "
                "Please confirm this environment variable is not being changed or removed "
                "as it is required for successful test discovery and execution."
                f"TEST_RUN_PIPE = {test_run_pipe}\n"
            )
            print(error_msg, file=sys.stderr)
            raise VSCodeUnittestError(error_msg)
        # Get existing kwargs
        kwargs = super().get_test_runner_kwargs()
        # Add custom resultclass, same resultclass as used in unittest.
        kwargs["resultclass"] = UnittestTestResult
        return kwargs
