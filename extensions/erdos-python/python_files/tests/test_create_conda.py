# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import importlib
import sys

import pytest

import create_conda


@pytest.mark.parametrize("env_exists", [True, False])
@pytest.mark.parametrize("git_ignore", [True, False])
@pytest.mark.parametrize("install", [True, False])
@pytest.mark.parametrize("python", [True, False])
def test_create_env(env_exists, git_ignore, install, python):
    importlib.reload(create_conda)
    create_conda.conda_env_exists = lambda _n: env_exists

    install_packages_called = False

    def install_packages(_name):
        nonlocal install_packages_called
        install_packages_called = True

    create_conda.install_packages = install_packages

    run_process_called = False

    def run_process(args, error_message):
        nonlocal run_process_called
        run_process_called = True
        version = "12345" if python else f"{sys.version_info.major}.{sys.version_info.minor}"
        if not env_exists:
            assert args == [
                sys.executable,
                "-m",
                "conda",
                "create",
                "--yes",
                "--prefix",
                create_conda.CONDA_ENV_NAME,
                f"python={version}",
            ]
            assert error_message == "CREATE_CONDA.ENV_FAILED_CREATION"

    create_conda.run_process = run_process

    add_gitignore_called = False

    def add_gitignore(_name):
        nonlocal add_gitignore_called
        add_gitignore_called = True

    create_conda.add_gitignore = add_gitignore

    args = []
    if git_ignore:
        args.append("--git-ignore")
    if install:
        args.append("--install")
    if python:
        args.extend(["--python", "12345"])
    create_conda.main(args)
    assert install_packages_called == install

    # run_process is called when the venv does not exist
    assert run_process_called != env_exists

    # add_gitignore is called when new venv is created and git_ignore is True
    assert add_gitignore_called == (not env_exists and git_ignore)
