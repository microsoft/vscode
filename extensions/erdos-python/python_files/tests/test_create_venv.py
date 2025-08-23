# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import argparse
import contextlib
import importlib
import io
import json
import os
import sys

import pytest

import create_venv


@pytest.mark.skipif(sys.platform == "win32", reason="Windows does not have micro venv fallback.")
def test_venv_not_installed_unix():
    importlib.reload(create_venv)
    create_venv.is_installed = lambda module: module != "venv"
    run_process_called = False

    def run_process(args, error_message):
        nonlocal run_process_called
        microvenv_path = os.fspath(create_venv.MICROVENV_SCRIPT_PATH)
        if microvenv_path in args:
            run_process_called = True
            assert args == [
                sys.executable,
                microvenv_path,
                "--name",
                ".test_venv",
            ]
            assert error_message == "CREATE_VENV.MICROVENV_FAILED_CREATION"

    create_venv.run_process = run_process

    create_venv.main(["--name", ".test_venv"])

    # run_process is called when the venv does not exist
    assert run_process_called is True


@pytest.mark.skipif(sys.platform != "win32", reason="Windows does not have microvenv fallback.")
def test_venv_not_installed_windows():
    importlib.reload(create_venv)
    create_venv.is_installed = lambda module: module != "venv"
    with pytest.raises(create_venv.VenvError) as e:
        create_venv.main()
    assert str(e.value) == "CREATE_VENV.VENV_NOT_FOUND"


@pytest.mark.parametrize("env_exists", ["hasEnv", "noEnv"])
@pytest.mark.parametrize("git_ignore", ["useGitIgnore", "skipGitIgnore", "gitIgnoreExists"])
@pytest.mark.parametrize("install", ["requirements", "toml", "skipInstall"])
def test_create_env(env_exists, git_ignore, install):
    importlib.reload(create_venv)
    create_venv.is_installed = lambda _x: True
    create_venv.venv_exists = lambda _n: env_exists == "hasEnv"
    create_venv.upgrade_pip = lambda _x: None
    create_venv.is_file = lambda _x: git_ignore == "gitIgnoreExists"

    install_packages_called = False

    def install_packages(_env, _name):
        nonlocal install_packages_called
        install_packages_called = True

    create_venv.install_requirements = install_packages
    create_venv.install_toml = install_packages

    run_process_called = False

    def run_process(args, error_message):
        nonlocal run_process_called
        run_process_called = True
        if env_exists == "noEnv":
            assert args == [sys.executable, "-m", "venv", create_venv.VENV_NAME]
            assert error_message == "CREATE_VENV.VENV_FAILED_CREATION"

    create_venv.run_process = run_process

    add_gitignore_called = False

    def add_gitignore(_name):
        nonlocal add_gitignore_called
        add_gitignore_called = True
        if not create_venv.is_file(_name):
            create_venv.create_gitignore(_name)

    create_venv.add_gitignore = add_gitignore

    create_gitignore_called = False

    def create_gitignore(_p):
        nonlocal create_gitignore_called
        create_gitignore_called = True

    create_venv.create_gitignore = create_gitignore

    args = []
    if git_ignore == "useGitIgnore":
        args += ["--git-ignore"]
    if install == "requirements":
        args += ["--requirements", "requirements-for-test.txt"]
    elif install == "toml":
        args += ["--toml", "pyproject.toml", "--extras", "test"]

    create_venv.main(args)
    assert install_packages_called == (install != "skipInstall")

    # run_process is called when the venv does not exist
    assert run_process_called == (env_exists == "noEnv")

    # add_gitignore is called when new venv is created and git_ignore is True
    assert add_gitignore_called == ((env_exists == "noEnv") and (git_ignore == "useGitIgnore"))

    assert create_gitignore_called == (add_gitignore_called and (git_ignore != "gitIgnoreExists"))


@pytest.mark.parametrize("install_type", ["requirements", "pyproject", "both"])
def test_install_packages(install_type):
    importlib.reload(create_venv)
    create_venv.is_installed = lambda _x: True
    create_venv.file_exists = lambda x: install_type in str(x)

    pip_upgraded = False
    installing = None

    order = []

    def run_process(args, error_message):
        nonlocal pip_upgraded, installing, order
        if args[1:] == ["-m", "pip", "install", "--upgrade", "pip"]:
            pip_upgraded = True
            assert error_message == "CREATE_VENV.UPGRADE_PIP_FAILED"
        elif args[1:-1] == ["-m", "pip", "install", "-r"]:
            installing = "requirements"
            order += ["requirements"]
            assert error_message == "CREATE_VENV.PIP_FAILED_INSTALL_REQUIREMENTS"
        elif args[1:] == ["-m", "pip", "install", "-e", ".[test]"]:
            installing = "pyproject"
            order += ["pyproject"]
            assert error_message == "CREATE_VENV.PIP_FAILED_INSTALL_PYPROJECT"

    create_venv.run_process = run_process

    if install_type == "requirements":
        create_venv.main(["--requirements", "requirements-for-test.txt"])
    elif install_type == "pyproject":
        create_venv.main(["--toml", "pyproject.toml", "--extras", "test"])
    elif install_type == "both":
        create_venv.main(
            [
                "--requirements",
                "requirements-for-test.txt",
                "--toml",
                "pyproject.toml",
                "--extras",
                "test",
            ]
        )

    assert pip_upgraded
    if install_type == "both":
        assert order == ["requirements", "pyproject"]
    else:
        assert installing == install_type


@pytest.mark.parametrize(
    ("extras", "expected"),
    [
        ([], ["-m", "pip", "install", "-e", "."]),
        (["test"], ["-m", "pip", "install", "-e", ".[test]"]),
        (["test", "doc"], ["-m", "pip", "install", "-e", ".[test,doc]"]),
    ],
)
def test_toml_args(extras, expected):
    importlib.reload(create_venv)

    actual = []

    def run_process(args, error_message):  # noqa: ARG001
        nonlocal actual
        actual = args[1:]

    create_venv.run_process = run_process

    create_venv.install_toml(sys.executable, extras)

    assert actual == expected


@pytest.mark.parametrize(
    ("extras", "expected"),
    [
        ([], []),
        (
            ["requirements/test.txt"],
            [[sys.executable, "-m", "pip", "install", "-r", "requirements/test.txt"]],
        ),
        (
            ["requirements/test.txt", "requirements/doc.txt"],
            [
                [sys.executable, "-m", "pip", "install", "-r", "requirements/test.txt"],
                [sys.executable, "-m", "pip", "install", "-r", "requirements/doc.txt"],
            ],
        ),
    ],
)
def test_requirements_args(extras, expected):
    importlib.reload(create_venv)

    actual = []

    def run_process(args, error_message):  # noqa: ARG001
        nonlocal actual
        actual.append(args)

    create_venv.run_process = run_process

    create_venv.install_requirements(sys.executable, extras)

    assert actual == expected


def test_create_venv_missing_pip():
    importlib.reload(create_venv)
    create_venv.venv_exists = lambda _n: True
    create_venv.is_installed = lambda module: module != "pip"

    download_pip_pyz_called = False

    def download_pip_pyz(name):
        nonlocal download_pip_pyz_called
        download_pip_pyz_called = True
        assert name == create_venv.VENV_NAME

    create_venv.download_pip_pyz = download_pip_pyz

    run_process_called = False

    def run_process(args, error_message):
        if "install" in args and "pip" in args:
            nonlocal run_process_called
            run_process_called = True
            pip_pyz_path = os.fspath(create_venv.CWD / create_venv.VENV_NAME / "pip.pyz")
            assert args[1:] == [pip_pyz_path, "install", "pip"]
            assert error_message == "CREATE_VENV.INSTALL_PIP_FAILED"

    create_venv.run_process = run_process
    create_venv.main([])


@contextlib.contextmanager
def redirect_io(stream: str, new_stream):
    """Redirect stdio streams to a custom stream."""
    old_stream = getattr(sys, stream)
    setattr(sys, stream, new_stream)
    yield
    setattr(sys, stream, old_stream)


class CustomIO(io.TextIOWrapper):
    """Custom stream object to replace stdio."""

    name: str = "customio"

    def __init__(self, name: str, encoding="utf-8", newline=None):
        self._buffer = io.BytesIO()
        self._buffer.name = name
        super().__init__(self._buffer, encoding=encoding, newline=newline)

    def close(self):
        """Provide this close method which is used by some tools."""
        # This is intentionally empty.

    def get_value(self) -> str:
        """Returns value from the buffer as string."""
        self.seek(0)
        return self.read()


def test_requirements_from_stdin():
    importlib.reload(create_venv)

    cli_requirements = [f"cli-requirement{i}.txt" for i in range(3)]
    args = argparse.Namespace()
    args.__dict__.update({"stdin": True, "requirements": cli_requirements})

    stdin_requirements = [f"stdin-requirement{i}.txt" for i in range(20)]
    text = json.dumps({"requirements": stdin_requirements})
    str_input = CustomIO("<stdin>", encoding="utf-8", newline="\n")
    with redirect_io("stdin", str_input):
        str_input.write(text)
        str_input.seek(0)
        actual = create_venv.get_requirements_from_args(args)

    assert actual == stdin_requirements + cli_requirements
