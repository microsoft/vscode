# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import os
import pathlib
import sys
import tempfile

from .helpers import (
    TEST_DATA_PATH,
)

script_dir = pathlib.Path(__file__).parent.parent.parent
sys.path.append(os.fspath(script_dir))
from vscode_pytest import has_symlink_parent  # noqa: E402


def test_has_symlink_parent_with_symlink():
    # Create a temporary directory and a file in it
    with tempfile.TemporaryDirectory() as temp_dir:
        file_path = pathlib.Path(temp_dir) / "file"
        file_path.touch()

        # Create a symbolic link to the temporary directory
        symlink_path = pathlib.Path(temp_dir) / "symlink"
        symlink_path.symlink_to(temp_dir)

        # Check that has_symlink_parent correctly identifies the symbolic link
        assert has_symlink_parent(symlink_path / "file")


def test_has_symlink_parent_without_symlink():
    folder_path = TEST_DATA_PATH / "unittest_folder" / "test_add.py"
    # Check that has_symlink_parent correctly identifies that there are no symbolic links
    assert not has_symlink_parent(folder_path)
