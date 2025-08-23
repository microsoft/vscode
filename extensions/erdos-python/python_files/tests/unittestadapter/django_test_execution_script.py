# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import os
import pathlib
import sys

sys.path.append(os.fspath(pathlib.Path(__file__).parent.parent))

from unittestadapter.django_handler import django_execution_runner

if __name__ == "__main__":
    args = sys.argv[1:]
    manage_py_path = args[0]
    test_ids = args[1:]
    # currently doesn't support additional args past test_ids.
    django_execution_runner(manage_py_path, test_ids, [])
