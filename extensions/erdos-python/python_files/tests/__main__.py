# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import argparse
import sys

import pytest

from . import DEBUG_ADAPTER_ROOT, SRC_ROOT, TEST_ROOT, TESTING_TOOLS_ROOT


def parse_args():
    parser = argparse.ArgumentParser()
    # To mark a test as functional:  (decorator) @pytest.mark.functional
    parser.add_argument("--functional", dest="markers", action="append_const", const="functional")
    parser.add_argument(
        "--no-functional", dest="markers", action="append_const", const="not functional"
    )
    args, remainder = parser.parse_known_args()

    ns = vars(args)

    if remainder:
        for arg in remainder:
            if arg.startswith("-") and arg not in ("-v", "--verbose", "-h", "--help"):
                specific = False
                break
        else:
            specific = True
    else:
        specific = False
    args.specific = specific

    return ns, remainder


def main(pytestargs, markers=None, specific=False):  # noqa: FBT002
    sys.path.insert(1, TESTING_TOOLS_ROOT)
    sys.path.insert(1, DEBUG_ADAPTER_ROOT)

    if not specific:
        pytestargs.insert(0, TEST_ROOT)
    pytestargs.insert(0, "--rootdir")
    pytestargs.insert(1, SRC_ROOT)
    for marker in reversed(markers or ()):
        pytestargs.insert(0, marker)
        pytestargs.insert(0, "-m")

    return pytest.main(pytestargs)


if __name__ == "__main__":
    mainkwargs, pytestargs = parse_args()
    ec = main(pytestargs, **mainkwargs)
    sys.exit(ec)
