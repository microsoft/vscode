# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import os
import pathlib

from unittestadapter.pvsc_utils import TestNodeTypeEnum

TEST_DATA_PATH = pathlib.Path(__file__).parent / ".data"


skip_unittest_folder_discovery_output = {
    "path": os.fspath(TEST_DATA_PATH / "unittest_skip"),
    "name": "unittest_skip",
    "type_": TestNodeTypeEnum.folder,
    "children": [
        {
            "path": os.fspath(TEST_DATA_PATH / "unittest_skip" / "unittest_skip_file.py"),
            "name": "unittest_skip_file.py",
            "type_": TestNodeTypeEnum.file,
            "children": [],
            "id_": os.fspath(TEST_DATA_PATH / "unittest_skip" / "unittest_skip_file.py"),
        },
        {
            "path": os.fspath(TEST_DATA_PATH / "unittest_skip" / "unittest_skip_function.py"),
            "name": "unittest_skip_function.py",
            "type_": TestNodeTypeEnum.file,
            "children": [
                {
                    "path": os.fspath(
                        TEST_DATA_PATH / "unittest_skip" / "unittest_skip_function.py"
                    ),
                    "name": "SimpleTest",
                    "type_": TestNodeTypeEnum.class_,
                    "children": [
                        {
                            "name": "testadd1",
                            "path": os.fspath(
                                TEST_DATA_PATH / "unittest_skip" / "unittest_skip_function.py"
                            ),
                            "lineno": "13",
                            "type_": TestNodeTypeEnum.test,
                            "id_": os.fspath(
                                TEST_DATA_PATH / "unittest_skip" / "unittest_skip_function.py"
                            )
                            + "\\SimpleTest\\testadd1",
                            "runID": "unittest_skip_function.SimpleTest.testadd1",
                        }
                    ],
                    "id_": os.fspath(TEST_DATA_PATH / "unittest_skip" / "unittest_skip_function.py")
                    + "\\SimpleTest",
                }
            ],
            "id_": os.fspath(TEST_DATA_PATH / "unittest_skip" / "unittest_skip_function.py"),
        },
    ],
    "id_": os.fspath(TEST_DATA_PATH / "unittest_skip"),
}

complex_tree_file_path = os.fsdecode(
    pathlib.PurePath(
        TEST_DATA_PATH,
        "utils_complex_tree",
        "test_outer_folder",
        "test_inner_folder",
        "test_utils_complex_tree.py",
    )
)
complex_tree_expected_output = {
    "name": "utils_complex_tree",
    "type_": TestNodeTypeEnum.folder,
    "path": os.fsdecode(pathlib.PurePath(TEST_DATA_PATH, "utils_complex_tree")),
    "children": [
        {
            "name": "test_outer_folder",
            "type_": TestNodeTypeEnum.folder,
            "path": os.fsdecode(
                pathlib.PurePath(TEST_DATA_PATH, "utils_complex_tree", "test_outer_folder")
            ),
            "children": [
                {
                    "name": "test_inner_folder",
                    "type_": TestNodeTypeEnum.folder,
                    "path": os.fsdecode(
                        pathlib.PurePath(
                            TEST_DATA_PATH,
                            "utils_complex_tree",
                            "test_outer_folder",
                            "test_inner_folder",
                        )
                    ),
                    "children": [
                        {
                            "name": "test_utils_complex_tree.py",
                            "type_": TestNodeTypeEnum.file,
                            "path": complex_tree_file_path,
                            "children": [
                                {
                                    "name": "TreeOne",
                                    "type_": TestNodeTypeEnum.class_,
                                    "path": complex_tree_file_path,
                                    "children": [
                                        {
                                            "name": "test_one",
                                            "type_": TestNodeTypeEnum.test,
                                            "path": complex_tree_file_path,
                                            "lineno": "7",
                                            "id_": complex_tree_file_path
                                            + "\\"
                                            + "TreeOne"
                                            + "\\"
                                            + "test_one",
                                            "runID": "utils_complex_tree.test_outer_folder.test_inner_folder.test_utils_complex_tree.TreeOne.test_one",
                                        },
                                    ],
                                    "id_": complex_tree_file_path + "\\" + "TreeOne",
                                }
                            ],
                            "id_": complex_tree_file_path,
                        }
                    ],
                    "id_": os.fsdecode(
                        pathlib.PurePath(
                            TEST_DATA_PATH,
                            "utils_complex_tree",
                            "test_outer_folder",
                            "test_inner_folder",
                        )
                    ),
                },
            ],
            "id_": os.fsdecode(
                pathlib.PurePath(TEST_DATA_PATH, "utils_complex_tree", "test_outer_folder")
            ),
        }
    ],
    "id_": os.fsdecode(pathlib.PurePath(TEST_DATA_PATH, "utils_complex_tree")),
}
