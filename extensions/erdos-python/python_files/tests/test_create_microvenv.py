# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import importlib
import os
import sys

import create_microvenv


def test_create_microvenv():
    importlib.reload(create_microvenv)
    run_process_called = False

    def run_process(args, error_message):
        nonlocal run_process_called
        run_process_called = True
        assert args == [
            sys.executable,
            os.fspath(create_microvenv.LIB_ROOT / "microvenv.py"),
            create_microvenv.VENV_NAME,
        ]
        assert error_message == "CREATE_MICROVENV.MICROVENV_FAILED_CREATION"

    create_microvenv.run_process = run_process

    create_microvenv.main()
    assert run_process_called is True
