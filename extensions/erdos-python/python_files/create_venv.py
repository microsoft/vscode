# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import argparse
import importlib.util as import_util
import json
import os
import pathlib
import subprocess
import sys
import urllib.request as url_lib
from typing import List, Optional, Sequence, Union

VENV_NAME = ".venv"
CWD = pathlib.Path.cwd()
MICROVENV_SCRIPT_PATH = pathlib.Path(__file__).parent / "create_microvenv.py"


class VenvError(Exception):
    pass


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--requirements",
        action="append",
        default=[],
        help="Install additional dependencies into the virtual environment.",
    )

    parser.add_argument(
        "--toml",
        action="store",
        default=None,
        help="Install additional dependencies from sources like `pyproject.toml` into the virtual environment.",
    )

    parser.add_argument(
        "--extras",
        action="append",
        default=[],
        help="Install specific package groups from `pyproject.toml` into the virtual environment.",
    )

    parser.add_argument(
        "--git-ignore",
        action="store_true",
        default=False,
        help="Add .gitignore to the newly created virtual environment.",
    )

    parser.add_argument(
        "--name",
        default=VENV_NAME,
        type=str,
        help="Name of the virtual environment.",
        metavar="NAME",
        action="store",
    )

    parser.add_argument(
        "--stdin",
        action="store_true",
        default=False,
        help="Read arguments from stdin.",
    )

    return parser.parse_args(argv)


def is_installed(module: str) -> bool:
    return import_util.find_spec(module) is not None


def file_exists(path: Union[str, pathlib.PurePath]) -> bool:
    return pathlib.Path(path).exists()


def is_file(path: Union[str, pathlib.PurePath]) -> bool:
    return pathlib.Path(path).is_file()


def venv_exists(name: str) -> bool:
    return (
        (CWD / name).exists()
        and (CWD / name / "pyvenv.cfg").exists()
        and file_exists(get_venv_path(name))
    )


def run_process(args: Sequence[str], error_message: str) -> None:
    try:
        print("Running: " + " ".join(args))
        subprocess.run(args, cwd=os.getcwd(), check=True)  # noqa: PTH109
    except subprocess.CalledProcessError as exc:
        raise VenvError(error_message) from exc


def get_win_venv_path(name: str) -> str:
    venv_dir = CWD / name
    # If using MSYS2 Python, the Python executable is located in the 'bin' directory.
    if file_exists(venv_dir / "bin" / "python.exe"):
        return os.fspath(venv_dir / "bin" / "python.exe")
    else:
        return os.fspath(venv_dir / "Scripts" / "python.exe")


def get_venv_path(name: str) -> str:
    # See `venv` doc here for more details on binary location:
    # https://docs.python.org/3/library/venv.html#creating-virtual-environments
    if sys.platform == "win32":
        return get_win_venv_path(name)
    else:
        return os.fspath(CWD / name / "bin" / "python")


def install_requirements(venv_path: str, requirements: List[str]) -> None:
    if not requirements:
        return

    for requirement in requirements:
        print(f"VENV_INSTALLING_REQUIREMENTS: {requirement}")
        run_process(
            [venv_path, "-m", "pip", "install", "-r", requirement],
            "CREATE_VENV.PIP_FAILED_INSTALL_REQUIREMENTS",
        )
    print("CREATE_VENV.PIP_INSTALLED_REQUIREMENTS")


def install_toml(venv_path: str, extras: List[str]) -> None:
    args = "." if len(extras) == 0 else f".[{','.join(extras)}]"
    run_process(
        [venv_path, "-m", "pip", "install", "-e", args],
        "CREATE_VENV.PIP_FAILED_INSTALL_PYPROJECT",
    )
    print("CREATE_VENV.PIP_INSTALLED_PYPROJECT")


def upgrade_pip(venv_path: str) -> None:
    print("CREATE_VENV.UPGRADING_PIP")
    run_process(
        [venv_path, "-m", "pip", "install", "--upgrade", "pip"],
        "CREATE_VENV.UPGRADE_PIP_FAILED",
    )
    print("CREATE_VENV.UPGRADED_PIP")


def create_gitignore(git_ignore: Union[str, pathlib.PurePath]):
    print("Creating:", os.fspath(git_ignore))
    pathlib.Path(git_ignore).write_text("*")


def add_gitignore(name: str) -> None:
    git_ignore = CWD / name / ".gitignore"
    if not is_file(git_ignore):
        create_gitignore(git_ignore)


def download_pip_pyz(name: str):
    url = "https://bootstrap.pypa.io/pip/pip.pyz"
    print("CREATE_VENV.DOWNLOADING_PIP")

    try:
        with url_lib.urlopen(url) as response:
            pip_pyz_path = CWD / name / "pip.pyz"
            pip_pyz_path.write_bytes(data=response.read())
    except Exception as exc:
        raise VenvError("CREATE_VENV.DOWNLOAD_PIP_FAILED") from exc


def install_pip(name: str):
    pip_pyz_path = os.fspath(CWD / name / "pip.pyz")
    executable = get_venv_path(name)
    print("CREATE_VENV.INSTALLING_PIP")
    run_process(
        [executable, pip_pyz_path, "install", "pip"],
        "CREATE_VENV.INSTALL_PIP_FAILED",
    )


def get_requirements_from_args(args: argparse.Namespace) -> List[str]:
    requirements = []
    if args.stdin:
        data = json.loads(sys.stdin.read())
        requirements = data.get("requirements", [])
    if args.requirements:
        requirements.extend(args.requirements)
    return requirements


def main(argv: Optional[Sequence[str]] = None) -> None:
    if argv is None:
        argv = []
    args = parse_args(argv)

    use_micro_venv = False
    venv_installed = is_installed("venv")
    pip_installed = is_installed("pip")
    ensure_pip_installed = is_installed("ensurepip")
    distutils_installed = is_installed("distutils")

    if not venv_installed:
        if sys.platform == "win32":
            raise VenvError("CREATE_VENV.VENV_NOT_FOUND")
        else:
            use_micro_venv = True
            if not distutils_installed:
                print("Install `python3-distutils` package or equivalent for your OS.")
                print("On Debian/Ubuntu: `sudo apt install python3-distutils`")
                raise VenvError("CREATE_VENV.DISTUTILS_NOT_INSTALLED")

    if venv_exists(args.name):
        # A virtual environment with same name exists.
        # We will use the existing virtual environment.
        venv_path = get_venv_path(args.name)
        print(f"EXISTING_VENV:{venv_path}")
    else:
        if use_micro_venv:
            # `venv` was not found but on this platform we can use `microvenv`
            run_process(
                [
                    sys.executable,
                    os.fspath(MICROVENV_SCRIPT_PATH),
                    "--name",
                    args.name,
                ],
                "CREATE_VENV.MICROVENV_FAILED_CREATION",
            )
        elif not pip_installed or not ensure_pip_installed:
            # `venv` was found but `pip` or `ensurepip` was not found.
            # We create a venv without `pip` in it. We will later install `pip`.
            run_process(
                [sys.executable, "-m", "venv", "--without-pip", args.name],
                "CREATE_VENV.VENV_FAILED_CREATION",
            )
        else:
            # Both `venv` and `pip` were found. So create a .venv normally
            run_process(
                [sys.executable, "-m", "venv", args.name],
                "CREATE_VENV.VENV_FAILED_CREATION",
            )

        venv_path = get_venv_path(args.name)
        print(f"CREATED_VENV:{venv_path}")

        if args.git_ignore:
            add_gitignore(args.name)

    # At this point we have a .venv. Now we handle installing `pip`.
    if pip_installed and ensure_pip_installed:
        # We upgrade pip if it is already installed.
        upgrade_pip(venv_path)
    else:
        # `pip` was not found, so we download it and install it.
        download_pip_pyz(args.name)
        install_pip(args.name)

    requirements = get_requirements_from_args(args)
    if requirements:
        print(f"VENV_INSTALLING_REQUIREMENTS: {requirements}")
        install_requirements(venv_path, requirements)

    if args.toml:
        print(f"VENV_INSTALLING_PYPROJECT: {args.toml}")
        install_toml(venv_path, args.extras)


if __name__ == "__main__":
    main(sys.argv[1:])
