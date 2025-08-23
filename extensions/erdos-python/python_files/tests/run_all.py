# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

# Replace the "." entry.
import os
import pathlib
import sys

sys.path[0] = os.fsdecode(pathlib.Path(__file__).parent.parent)

from tests.__main__ import main, parse_args  # noqa: E402

if __name__ == "__main__":
    mainkwargs, pytestargs = parse_args()
    ec = main(pytestargs, **mainkwargs)
    sys.exit(ec)
