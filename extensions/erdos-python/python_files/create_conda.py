# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import argparse
import os
import pathlib
import subprocess
import sys
from typing import Optional, Sequence, Union

CONDA_ENV_NAME = ".conda"
CWD = pathlib.Path.cwd()


class VenvError(Exception):
    pass


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--python",
        action="store",
        help="Python version to install in the virtual environment.",
        default=f"{sys.version_info.major}.{sys.version_info.minor}",
    )
    parser.add_argument(
        "--install",
        action="store_true",
        default=False,
        help="Install packages into the virtual environment.",
    )
    parser.add_argument(
        "--git-ignore",
        action="store_true",
        default=False,
        help="Add .gitignore to the newly created virtual environment.",
    )
    parser.add_argument(
        "--name",
        default=CONDA_ENV_NAME,
        type=str,
        help="Name of the virtual environment.",
        metavar="NAME",
        action="store",
    )
    return parser.parse_args(argv)


def file_exists(path: Union[str, pathlib.PurePath]) -> bool:
    return os.path.exists(path)  # noqa: PTH110


def conda_env_exists(name: Union[str, pathlib.PurePath]) -> bool:
    return os.path.exists(CWD / name)  # noqa: PTH110


def run_process(args: Sequence[str], error_message: str) -> None:
    try:
        print("Running: " + " ".join(args))
        subprocess.run(args, cwd=os.getcwd(), check=True)  # noqa: PTH109
    except subprocess.CalledProcessError as exc:
        raise VenvError(error_message) from exc


def get_conda_env_path(name: str) -> str:
    return os.fspath(CWD / name)


def install_packages(env_path: str) -> None:
    yml = os.fspath(CWD / "environment.yml")
    if file_exists(yml):
        print(f"CONDA_INSTALLING_YML: {yml}")
        run_process(
            [
                sys.executable,
                "-m",
                "conda",
                "env",
                "update",
                "--prefix",
                env_path,
                "--file",
                yml,
            ],
            "CREATE_CONDA.FAILED_INSTALL_YML",
        )
        print("CREATE_CONDA.INSTALLED_YML")


def add_gitignore(name: str) -> None:
    git_ignore = CWD / name / ".gitignore"
    if not git_ignore.is_file():
        print(f"Creating: {os.fsdecode(git_ignore)}")
        git_ignore.write_text("*")


def main(argv: Optional[Sequence[str]] = None) -> None:
    if argv is None:
        argv = []
    args = parse_args(argv)

    if conda_env_exists(args.name):
        env_path = get_conda_env_path(args.name)
        print(f"EXISTING_CONDA_ENV:{env_path}")
    else:
        run_process(
            [
                sys.executable,
                "-m",
                "conda",
                "create",
                "--yes",
                "--prefix",
                args.name,
                f"python={args.python}",
            ],
            "CREATE_CONDA.ENV_FAILED_CREATION",
        )
        env_path = get_conda_env_path(args.name)
        print(f"CREATED_CONDA_ENV:{env_path}")
        if args.git_ignore:
            add_gitignore(args.name)

    if args.install:
        install_packages(env_path)


if __name__ == "__main__":
    main(sys.argv[1:])
