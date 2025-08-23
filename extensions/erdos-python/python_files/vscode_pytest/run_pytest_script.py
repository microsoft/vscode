# Copyright (c) Microsoft Corporation.
# Licensed under the MIT License.
import os
import pathlib
import sys
import sysconfig

import pytest

# Adds the scripts directory to the PATH as a workaround for enabling shell for test execution.
path_var_name = "PATH" if "PATH" in os.environ else "Path"
os.environ[path_var_name] = (
    sysconfig.get_paths()["scripts"] + os.pathsep + os.environ[path_var_name]
)

script_dir = pathlib.Path(__file__).parent.parent
sys.path.append(os.fspath(script_dir))
sys.path.append(os.fspath(script_dir / "lib" / "python"))


def run_pytest(args):
    arg_array = ["-p", "vscode_pytest", *args]
    pytest.main(arg_array)


# This script handles running pytest via pytest.main(). It is called via run in the
# pytest execution adapter and gets the test_ids to run via stdin and the rest of the
# args through sys.argv. It then runs pytest.main() with the args and test_ids.

if __name__ == "__main__":
    # Add the root directory to the path so that we can import the plugin.
    directory_path = pathlib.Path(__file__).parent.parent
    sys.path.append(os.fspath(directory_path))
    sys.path.insert(0, os.getcwd())  # noqa: PTH109
    # Get the rest of the args to run with pytest.
    args = sys.argv[1:]

    # Check if coverage is enabled and adjust the args accordingly.
    is_coverage_run = os.environ.get("COVERAGE_ENABLED")
    coverage_enabled = False
    if is_coverage_run == "True":
        # If coverage is enabled, check if the coverage plugin is already in the args, if so keep user args.
        for arg in args:
            # if '--cov' is an arg or if '--cov=' is in an arg (check to see if this arg is set to not override user intent)
            if arg == "--cov" or "--cov=" in arg:
                print("coverage already enabled with specific args")
                coverage_enabled = True
                break
        if not coverage_enabled:
            args = [*args, "--cov=.", "--cov-branch"]

    run_test_ids_pipe = os.environ.get("RUN_TEST_IDS_PIPE")
    if run_test_ids_pipe:
        try:
            # Read the test ids from the file, delete file, and run pytest.
            ids_path = pathlib.Path(run_test_ids_pipe)
            ids = ids_path.read_text(encoding="utf-8").splitlines()
            try:
                ids_path.unlink()
            except Exception as e:
                print("Error[vscode-pytest]: unable to delete temp file" + str(e))
            arg_array = ["-p", "vscode_pytest", *args, *ids]
            print("Running pytest with args: " + str(arg_array))
            pytest.main(arg_array)
        except Exception as e:
            print("Error[vscode-pytest]: unable to read testIds from temp file" + str(e))
            run_pytest(args)
    else:
        print("Error[vscode-pytest]: RUN_TEST_IDS_PIPE env var is not set.")
        run_pytest(args)
