# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import argparse
import os
import pathlib
import subprocess
import sys
from typing import Optional, Sequence

VENV_NAME = ".venv"
LIB_ROOT = pathlib.Path(__file__).parent / "lib" / "python"
CWD = pathlib.Path.cwd()


class MicroVenvError(Exception):
    pass


def run_process(args: Sequence[str], error_message: str) -> None:
    try:
        print("Running: " + " ".join(args))
        subprocess.run(args, cwd=os.getcwd(), check=True)  # noqa: PTH109
    except subprocess.CalledProcessError as exc:
        raise MicroVenvError(error_message) from exc


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--name",
        default=VENV_NAME,
        type=str,
        help="Name of the virtual environment.",
        metavar="NAME",
        action="store",
    )
    return parser.parse_args(argv)


def create_microvenv(name: str):
    run_process(
        [sys.executable, os.fspath(LIB_ROOT / "microvenv.py"), name],
        "CREATE_MICROVENV.MICROVENV_FAILED_CREATION",
    )


def main(argv: Optional[Sequence[str]] = None) -> None:
    if argv is None:
        argv = []
    args = parse_args(argv)

    print("CREATE_MICROVENV.CREATING_MICROVENV")
    create_microvenv(args.name)
    print("CREATE_MICROVENV.CREATED_MICROVENV")


if __name__ == "__main__":
    main(sys.argv[1:])
