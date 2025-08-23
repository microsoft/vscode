import os

from .helpers import TEST_DATA_PATH, find_test_line_number, get_absolute_test_id

# This file contains the expected output dictionaries for tests discovery and is used in test_discovery.py.

# This is the expected output for the empty_discovery.py file.
# └──
TEST_DATA_PATH_STR = os.fspath(TEST_DATA_PATH)
empty_discovery_pytest_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [],
    "id_": TEST_DATA_PATH_STR,
}

# This is the expected output for the simple_pytest.py file.
# └── simple_pytest.py
#    └── test_function
simple_test_file_path = TEST_DATA_PATH / "simple_pytest.py"
simple_discovery_pytest_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "simple_pytest.py",
            "path": os.fspath(simple_test_file_path),
            "type_": "file",
            "id_": os.fspath(simple_test_file_path),
            "children": [
                {
                    "name": "test_function",
                    "path": os.fspath(simple_test_file_path),
                    "lineno": find_test_line_number(
                        "test_function",
                        simple_test_file_path,
                    ),
                    "type_": "test",
                    "id_": get_absolute_test_id(
                        "simple_pytest.py::test_function", simple_test_file_path
                    ),
                    "runID": get_absolute_test_id(
                        "simple_pytest.py::test_function", simple_test_file_path
                    ),
                }
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}

# This is the expected output for the unittest_pytest_same_file.py file.
# ├── unittest_pytest_same_file.py
#   ├── TestExample
#   │   └── test_true_unittest
#   └── test_true_pytest
unit_pytest_same_file_path = TEST_DATA_PATH / "unittest_pytest_same_file.py"
unit_pytest_same_file_discovery_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "unittest_pytest_same_file.py",
            "path": os.fspath(unit_pytest_same_file_path),
            "type_": "file",
            "id_": os.fspath(unit_pytest_same_file_path),
            "children": [
                {
                    "name": "TestExample",
                    "path": os.fspath(unit_pytest_same_file_path),
                    "type_": "class",
                    "children": [
                        {
                            "name": "test_true_unittest",
                            "path": os.fspath(unit_pytest_same_file_path),
                            "lineno": find_test_line_number(
                                "test_true_unittest",
                                os.fspath(unit_pytest_same_file_path),
                            ),
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "unittest_pytest_same_file.py::TestExample::test_true_unittest",
                                unit_pytest_same_file_path,
                            ),
                            "runID": get_absolute_test_id(
                                "unittest_pytest_same_file.py::TestExample::test_true_unittest",
                                unit_pytest_same_file_path,
                            ),
                        }
                    ],
                    "id_": get_absolute_test_id(
                        "unittest_pytest_same_file.py::TestExample",
                        unit_pytest_same_file_path,
                    ),
                },
                {
                    "name": "test_true_pytest",
                    "path": os.fspath(unit_pytest_same_file_path),
                    "lineno": find_test_line_number(
                        "test_true_pytest",
                        unit_pytest_same_file_path,
                    ),
                    "type_": "test",
                    "id_": get_absolute_test_id(
                        "unittest_pytest_same_file.py::test_true_pytest",
                        unit_pytest_same_file_path,
                    ),
                    "runID": get_absolute_test_id(
                        "unittest_pytest_same_file.py::test_true_pytest",
                        unit_pytest_same_file_path,
                    ),
                },
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}

# This is the expected output for the unittest_skip_file_level test.
# └── unittest_skiptest_file_level.py
unittest_skip_file_level_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [],
    "id_": TEST_DATA_PATH_STR,
}

# This is the expected output for the unittest_folder tests
# └── unittest_folder
#    ├── test_add.py
#    │   └── TestAddFunction
#    │       ├── test_add_negative_numbers
#    │       └── test_add_positive_numbers
#    │   └── TestDuplicateFunction
#    │       └── test_dup_a
#    └── test_subtract.py
#        └── TestSubtractFunction
#            ├── test_subtract_negative_numbers
#            └── test_subtract_positive_numbers
#    │   └── TestDuplicateFunction
#    │       └── test_dup_s
unittest_folder_path = TEST_DATA_PATH / "unittest_folder"
test_add_path = TEST_DATA_PATH / "unittest_folder" / "test_add.py"
test_subtract_path = TEST_DATA_PATH / "unittest_folder" / "test_subtract.py"
unittest_folder_discovery_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "unittest_folder",
            "path": os.fspath(unittest_folder_path),
            "type_": "folder",
            "id_": os.fspath(unittest_folder_path),
            "children": [
                {
                    "name": "test_add.py",
                    "path": os.fspath(test_add_path),
                    "type_": "file",
                    "id_": os.fspath(test_add_path),
                    "children": [
                        {
                            "name": "TestAddFunction",
                            "path": os.fspath(test_add_path),
                            "type_": "class",
                            "children": [
                                {
                                    "name": "test_add_negative_numbers",
                                    "path": os.fspath(test_add_path),
                                    "lineno": find_test_line_number(
                                        "test_add_negative_numbers",
                                        os.fspath(test_add_path),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "unittest_folder/test_add.py::TestAddFunction::test_add_negative_numbers",
                                        test_add_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "unittest_folder/test_add.py::TestAddFunction::test_add_negative_numbers",
                                        test_add_path,
                                    ),
                                },
                                {
                                    "name": "test_add_positive_numbers",
                                    "path": os.fspath(test_add_path),
                                    "lineno": find_test_line_number(
                                        "test_add_positive_numbers",
                                        os.fspath(test_add_path),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "unittest_folder/test_add.py::TestAddFunction::test_add_positive_numbers",
                                        test_add_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "unittest_folder/test_add.py::TestAddFunction::test_add_positive_numbers",
                                        test_add_path,
                                    ),
                                },
                            ],
                            "id_": get_absolute_test_id(
                                "unittest_folder/test_add.py::TestAddFunction",
                                test_add_path,
                            ),
                        },
                        {
                            "name": "TestDuplicateFunction",
                            "path": os.fspath(test_add_path),
                            "type_": "class",
                            "children": [
                                {
                                    "name": "test_dup_a",
                                    "path": os.fspath(test_add_path),
                                    "lineno": find_test_line_number(
                                        "test_dup_a",
                                        os.fspath(test_add_path),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "unittest_folder/test_add.py::TestDuplicateFunction::test_dup_a",
                                        test_add_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "unittest_folder/test_add.py::TestDuplicateFunction::test_dup_a",
                                        test_add_path,
                                    ),
                                },
                            ],
                            "id_": get_absolute_test_id(
                                "unittest_folder/test_add.py::TestDuplicateFunction",
                                test_add_path,
                            ),
                        },
                    ],
                },
                {
                    "name": "test_subtract.py",
                    "path": os.fspath(test_subtract_path),
                    "type_": "file",
                    "id_": os.fspath(test_subtract_path),
                    "children": [
                        {
                            "name": "TestSubtractFunction",
                            "path": os.fspath(test_subtract_path),
                            "type_": "class",
                            "children": [
                                {
                                    "name": "test_subtract_negative_numbers",
                                    "path": os.fspath(test_subtract_path),
                                    "lineno": find_test_line_number(
                                        "test_subtract_negative_numbers",
                                        os.fspath(test_subtract_path),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "unittest_folder/test_subtract.py::TestSubtractFunction::test_subtract_negative_numbers",
                                        test_subtract_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "unittest_folder/test_subtract.py::TestSubtractFunction::test_subtract_negative_numbers",
                                        test_subtract_path,
                                    ),
                                },
                                {
                                    "name": "test_subtract_positive_numbers",
                                    "path": os.fspath(test_subtract_path),
                                    "lineno": find_test_line_number(
                                        "test_subtract_positive_numbers",
                                        os.fspath(test_subtract_path),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "unittest_folder/test_subtract.py::TestSubtractFunction::test_subtract_positive_numbers",
                                        test_subtract_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "unittest_folder/test_subtract.py::TestSubtractFunction::test_subtract_positive_numbers",
                                        test_subtract_path,
                                    ),
                                },
                            ],
                            "id_": get_absolute_test_id(
                                "unittest_folder/test_subtract.py::TestSubtractFunction",
                                test_subtract_path,
                            ),
                        },
                        {
                            "name": "TestDuplicateFunction",
                            "path": os.fspath(test_subtract_path),
                            "type_": "class",
                            "children": [
                                {
                                    "name": "test_dup_s",
                                    "path": os.fspath(test_subtract_path),
                                    "lineno": find_test_line_number(
                                        "test_dup_s",
                                        os.fspath(test_subtract_path),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "unittest_folder/test_subtract.py::TestDuplicateFunction::test_dup_s",
                                        test_subtract_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "unittest_folder/test_subtract.py::TestDuplicateFunction::test_dup_s",
                                        test_subtract_path,
                                    ),
                                },
                            ],
                            "id_": get_absolute_test_id(
                                "unittest_folder/test_subtract.py::TestDuplicateFunction",
                                test_subtract_path,
                            ),
                        },
                    ],
                },
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}


# This is the expected output for the dual_level_nested_folder tests
#  └── dual_level_nested_folder
#    └── test_top_folder.py
#       └── test_top_function_t
#       └── test_top_function_f
#    └── nested_folder_one
#       └── test_bottom_folder.py
#          └── test_bottom_function_t
#          └── test_bottom_function_f
dual_level_nested_folder_path = TEST_DATA_PATH / "dual_level_nested_folder"
test_top_folder_path = TEST_DATA_PATH / "dual_level_nested_folder" / "test_top_folder.py"

test_nested_folder_one_path = TEST_DATA_PATH / "dual_level_nested_folder" / "nested_folder_one"

test_bottom_folder_path = (
    TEST_DATA_PATH / "dual_level_nested_folder" / "nested_folder_one" / "test_bottom_folder.py"
)


dual_level_nested_folder_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "dual_level_nested_folder",
            "path": os.fspath(dual_level_nested_folder_path),
            "type_": "folder",
            "id_": os.fspath(dual_level_nested_folder_path),
            "children": [
                {
                    "name": "test_top_folder.py",
                    "path": os.fspath(test_top_folder_path),
                    "type_": "file",
                    "id_": os.fspath(test_top_folder_path),
                    "children": [
                        {
                            "name": "test_top_function_t",
                            "path": os.fspath(test_top_folder_path),
                            "lineno": find_test_line_number(
                                "test_top_function_t",
                                test_top_folder_path,
                            ),
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "dual_level_nested_folder/test_top_folder.py::test_top_function_t",
                                test_top_folder_path,
                            ),
                            "runID": get_absolute_test_id(
                                "dual_level_nested_folder/test_top_folder.py::test_top_function_t",
                                test_top_folder_path,
                            ),
                        },
                        {
                            "name": "test_top_function_f",
                            "path": os.fspath(test_top_folder_path),
                            "lineno": find_test_line_number(
                                "test_top_function_f",
                                test_top_folder_path,
                            ),
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "dual_level_nested_folder/test_top_folder.py::test_top_function_f",
                                test_top_folder_path,
                            ),
                            "runID": get_absolute_test_id(
                                "dual_level_nested_folder/test_top_folder.py::test_top_function_f",
                                test_top_folder_path,
                            ),
                        },
                    ],
                },
                {
                    "name": "nested_folder_one",
                    "path": os.fspath(test_nested_folder_one_path),
                    "type_": "folder",
                    "id_": os.fspath(test_nested_folder_one_path),
                    "children": [
                        {
                            "name": "test_bottom_folder.py",
                            "path": os.fspath(test_bottom_folder_path),
                            "type_": "file",
                            "id_": os.fspath(test_bottom_folder_path),
                            "children": [
                                {
                                    "name": "test_bottom_function_t",
                                    "path": os.fspath(test_bottom_folder_path),
                                    "lineno": find_test_line_number(
                                        "test_bottom_function_t",
                                        test_bottom_folder_path,
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "dual_level_nested_folder/nested_folder_one/test_bottom_folder.py::test_bottom_function_t",
                                        test_bottom_folder_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "dual_level_nested_folder/nested_folder_one/test_bottom_folder.py::test_bottom_function_t",
                                        test_bottom_folder_path,
                                    ),
                                },
                                {
                                    "name": "test_bottom_function_f",
                                    "path": os.fspath(test_bottom_folder_path),
                                    "lineno": find_test_line_number(
                                        "test_bottom_function_f",
                                        test_bottom_folder_path,
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "dual_level_nested_folder/nested_folder_one/test_bottom_folder.py::test_bottom_function_f",
                                        test_bottom_folder_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "dual_level_nested_folder/nested_folder_one/test_bottom_folder.py::test_bottom_function_f",
                                        test_bottom_folder_path,
                                    ),
                                },
                            ],
                        }
                    ],
                },
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}

# This is the expected output for the double_nested_folder tests.
# └── folder_a
#    └── folder_b
#        └── folder_a
#            └── test_nest.py
#                └── test_function

folder_a_path = TEST_DATA_PATH / "folder_a"
folder_b_path = TEST_DATA_PATH / "folder_a" / "folder_b"
folder_a_nested_path = TEST_DATA_PATH / "folder_a" / "folder_b" / "folder_a"
test_nest_path = TEST_DATA_PATH / "folder_a" / "folder_b" / "folder_a" / "test_nest.py"
double_nested_folder_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "folder_a",
            "path": os.fspath(folder_a_path),
            "type_": "folder",
            "id_": os.fspath(folder_a_path),
            "children": [
                {
                    "name": "folder_b",
                    "path": os.fspath(folder_b_path),
                    "type_": "folder",
                    "id_": os.fspath(folder_b_path),
                    "children": [
                        {
                            "name": "folder_a",
                            "path": os.fspath(folder_a_nested_path),
                            "type_": "folder",
                            "id_": os.fspath(folder_a_nested_path),
                            "children": [
                                {
                                    "name": "test_nest.py",
                                    "path": os.fspath(test_nest_path),
                                    "type_": "file",
                                    "id_": os.fspath(test_nest_path),
                                    "children": [
                                        {
                                            "name": "test_function",
                                            "path": os.fspath(test_nest_path),
                                            "lineno": find_test_line_number(
                                                "test_function",
                                                test_nest_path,
                                            ),
                                            "type_": "test",
                                            "id_": get_absolute_test_id(
                                                "folder_a/folder_b/folder_a/test_nest.py::test_function",
                                                test_nest_path,
                                            ),
                                            "runID": get_absolute_test_id(
                                                "folder_a/folder_b/folder_a/test_nest.py::test_function",
                                                test_nest_path,
                                            ),
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}

# This is the expected output for the nested_folder tests.
# └── parametrize_tests.py
#    └── TestClass
#       └── test_adding
#        └── [3+5-8]
#        └── [2+4-6]
#        └── [6+9-16]
#    └── test_string
#       └── [hello]
#       └── [complicated split [] ()]
parameterize_tests_path = TEST_DATA_PATH / "parametrize_tests.py"
parametrize_tests_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "parametrize_tests.py",
            "path": os.fspath(parameterize_tests_path),
            "type_": "file",
            "id_": os.fspath(parameterize_tests_path),
            "children": [
                {
                    "name": "TestClass",
                    "path": os.fspath(parameterize_tests_path),
                    "type_": "class",
                    "id_": get_absolute_test_id(
                        "parametrize_tests.py::TestClass",
                        parameterize_tests_path,
                    ),
                    "children": [
                        {
                            "name": "test_adding",
                            "path": os.fspath(parameterize_tests_path),
                            "type_": "function",
                            "id_": os.fspath(parameterize_tests_path) + "::TestClass::test_adding",
                            "children": [
                                {
                                    "name": "[3+5-8]",
                                    "path": os.fspath(parameterize_tests_path),
                                    "lineno": find_test_line_number(
                                        "test_adding[3+5-8]",
                                        parameterize_tests_path,
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "parametrize_tests.py::TestClass::test_adding[3+5-8]",
                                        parameterize_tests_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "parametrize_tests.py::TestClass::test_adding[3+5-8]",
                                        parameterize_tests_path,
                                    ),
                                },
                                {
                                    "name": "[2+4-6]",
                                    "path": os.fspath(parameterize_tests_path),
                                    "lineno": find_test_line_number(
                                        "test_adding[2+4-6]",
                                        parameterize_tests_path,
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "parametrize_tests.py::TestClass::test_adding[2+4-6]",
                                        parameterize_tests_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "parametrize_tests.py::TestClass::test_adding[2+4-6]",
                                        parameterize_tests_path,
                                    ),
                                },
                                {
                                    "name": "[6+9-16]",
                                    "path": os.fspath(parameterize_tests_path),
                                    "lineno": find_test_line_number(
                                        "test_adding[6+9-16]",
                                        parameterize_tests_path,
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "parametrize_tests.py::TestClass::test_adding[6+9-16]",
                                        parameterize_tests_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "parametrize_tests.py::TestClass::test_adding[6+9-16]",
                                        parameterize_tests_path,
                                    ),
                                },
                            ],
                        },
                    ],
                },
                {
                    "name": "test_string",
                    "path": os.fspath(parameterize_tests_path),
                    "type_": "function",
                    "children": [
                        {
                            "name": "[hello]",
                            "path": os.fspath(parameterize_tests_path),
                            "lineno": find_test_line_number(
                                "test_string[hello]",
                                parameterize_tests_path,
                            ),
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "parametrize_tests.py::test_string[hello]",
                                parameterize_tests_path,
                            ),
                            "runID": get_absolute_test_id(
                                "parametrize_tests.py::test_string[hello]",
                                parameterize_tests_path,
                            ),
                        },
                        {
                            "name": "[complicated split [] ()]",
                            "path": os.fspath(parameterize_tests_path),
                            "lineno": find_test_line_number(
                                "test_string[1]",
                                parameterize_tests_path,
                            ),
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "parametrize_tests.py::test_string[complicated split [] ()]",
                                parameterize_tests_path,
                            ),
                            "runID": get_absolute_test_id(
                                "parametrize_tests.py::test_string[complicated split [] ()]",
                                parameterize_tests_path,
                            ),
                        },
                    ],
                    "id_": os.fspath(parameterize_tests_path) + "::test_string",
                },
            ],
        },
    ],
    "id_": TEST_DATA_PATH_STR,
}

# This is the expected output for the text_docstring.txt tests.
# └── text_docstring.txt
text_docstring_path = TEST_DATA_PATH / "text_docstring.txt"
doctest_pytest_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "text_docstring.txt",
            "path": os.fspath(text_docstring_path),
            "type_": "file",
            "id_": os.fspath(text_docstring_path),
            "children": [
                {
                    "name": "text_docstring.txt",
                    "path": os.fspath(text_docstring_path),
                    "lineno": find_test_line_number(
                        "text_docstring.txt",
                        os.fspath(text_docstring_path),
                    ),
                    "type_": "test",
                    "id_": get_absolute_test_id(
                        "text_docstring.txt::text_docstring.txt", text_docstring_path
                    ),
                    "runID": get_absolute_test_id(
                        "text_docstring.txt::text_docstring.txt", text_docstring_path
                    ),
                }
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}

# This is the expected output for the param_same_name tests.
# └── param_same_name
#    └── test_param1.py
#       └── test_odd_even
#          └── [a]
#          └── [b]
#          └── [c]
#    └── test_param2.py
#       └── test_odd_even
#          └── [1]
#          └── [2]
#          └── [3]
param1_path = TEST_DATA_PATH / "param_same_name" / "test_param1.py"
param2_path = TEST_DATA_PATH / "param_same_name" / "test_param2.py"
param_same_name_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "param_same_name",
            "path": os.fspath(TEST_DATA_PATH / "param_same_name"),
            "type_": "folder",
            "id_": os.fspath(TEST_DATA_PATH / "param_same_name"),
            "children": [
                {
                    "name": "test_param1.py",
                    "path": os.fspath(param1_path),
                    "type_": "file",
                    "id_": os.fspath(param1_path),
                    "children": [
                        {
                            "name": "test_odd_even",
                            "path": os.fspath(param1_path),
                            "type_": "function",
                            "children": [
                                {
                                    "name": "[a]",
                                    "path": os.fspath(param1_path),
                                    "lineno": "6",
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "param_same_name/test_param1.py::test_odd_even[a]",
                                        param1_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "param_same_name/test_param1.py::test_odd_even[a]",
                                        param1_path,
                                    ),
                                },
                                {
                                    "name": "[b]",
                                    "path": os.fspath(param1_path),
                                    "lineno": "6",
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "param_same_name/test_param1.py::test_odd_even[b]",
                                        param1_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "param_same_name/test_param1.py::test_odd_even[b]",
                                        param1_path,
                                    ),
                                },
                                {
                                    "name": "[c]",
                                    "path": os.fspath(param1_path),
                                    "lineno": "6",
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "param_same_name/test_param1.py::test_odd_even[c]",
                                        param1_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "param_same_name/test_param1.py::test_odd_even[c]",
                                        param1_path,
                                    ),
                                },
                            ],
                            "id_": os.fspath(param1_path) + "::test_odd_even",
                        }
                    ],
                },
                {
                    "name": "test_param2.py",
                    "path": os.fspath(param2_path),
                    "type_": "file",
                    "id_": os.fspath(param2_path),
                    "children": [
                        {
                            "name": "test_odd_even",
                            "path": os.fspath(param2_path),
                            "type_": "function",
                            "children": [
                                {
                                    "name": "[1]",
                                    "path": os.fspath(param2_path),
                                    "lineno": "6",
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "param_same_name/test_param2.py::test_odd_even[1]",
                                        param2_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "param_same_name/test_param2.py::test_odd_even[1]",
                                        param2_path,
                                    ),
                                },
                                {
                                    "name": "[2]",
                                    "path": os.fspath(param2_path),
                                    "lineno": "6",
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "param_same_name/test_param2.py::test_odd_even[2]",
                                        param2_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "param_same_name/test_param2.py::test_odd_even[2]",
                                        param2_path,
                                    ),
                                },
                                {
                                    "name": "[3]",
                                    "path": os.fspath(param2_path),
                                    "lineno": "6",
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "param_same_name/test_param2.py::test_odd_even[3]",
                                        param2_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "param_same_name/test_param2.py::test_odd_even[3]",
                                        param2_path,
                                    ),
                                },
                            ],
                            "id_": os.fspath(param2_path) + "::test_odd_even",
                        }
                    ],
                },
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}

tests_path = TEST_DATA_PATH / "root" / "tests"
tests_a_path = TEST_DATA_PATH / "root" / "tests" / "test_a.py"
tests_b_path = TEST_DATA_PATH / "root" / "tests" / "test_b.py"
# This is the expected output for the root folder tests.
# └── tests
#    └── test_a.py
#       └── test_a_function
#    └── test_b.py
#       └── test_b_function
root_with_config_expected_output = {
    "name": "tests",
    "path": os.fspath(tests_path),
    "type_": "folder",
    "children": [
        {
            "name": "test_a.py",
            "path": os.fspath(tests_a_path),
            "type_": "file",
            "id_": os.fspath(tests_a_path),
            "children": [
                {
                    "name": "test_a_function",
                    "path": os.fspath(os.path.join(tests_path, "test_a.py")),  # noqa: PTH118
                    "lineno": find_test_line_number(
                        "test_a_function",
                        os.path.join(tests_path, "test_a.py"),  # noqa: PTH118
                    ),
                    "type_": "test",
                    "id_": get_absolute_test_id("tests/test_a.py::test_a_function", tests_a_path),
                    "runID": get_absolute_test_id("tests/test_a.py::test_a_function", tests_a_path),
                }
            ],
        },
        {
            "name": "test_b.py",
            "path": os.fspath(tests_b_path),
            "type_": "file",
            "id_": os.fspath(tests_b_path),
            "children": [
                {
                    "name": "test_b_function",
                    "path": os.fspath(os.path.join(tests_path, "test_b.py")),  # noqa: PTH118
                    "lineno": find_test_line_number(
                        "test_b_function",
                        os.path.join(tests_path, "test_b.py"),  # noqa: PTH118
                    ),
                    "type_": "test",
                    "id_": get_absolute_test_id("tests/test_b.py::test_b_function", tests_b_path),
                    "runID": get_absolute_test_id("tests/test_b.py::test_b_function", tests_b_path),
                }
            ],
        },
    ],
    "id_": os.fspath(tests_path),
}
TEST_MULTI_CLASS_NEST_PATH = TEST_DATA_PATH / "test_multi_class_nest.py"
# This is the expected output for the nested_classes tests.
# └── test_multi_class_nest.py
#    └── TestFirstClass
#       └── TestSecondClass
#          └── test_second
#       └── test_first
#       └── TestSecondClass2
#          └── test_second2
#    └── test_independent
nested_classes_expected_test_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "test_multi_class_nest.py",
            "path": str(TEST_MULTI_CLASS_NEST_PATH),
            "type_": "file",
            "id_": str(TEST_MULTI_CLASS_NEST_PATH),
            "children": [
                {
                    "name": "TestFirstClass",
                    "path": str(TEST_MULTI_CLASS_NEST_PATH),
                    "type_": "class",
                    "id_": get_absolute_test_id(
                        "test_multi_class_nest.py::TestFirstClass",
                        TEST_MULTI_CLASS_NEST_PATH,
                    ),
                    "children": [
                        {
                            "name": "TestSecondClass",
                            "path": str(TEST_MULTI_CLASS_NEST_PATH),
                            "type_": "class",
                            "id_": get_absolute_test_id(
                                "test_multi_class_nest.py::TestFirstClass::TestSecondClass",
                                TEST_MULTI_CLASS_NEST_PATH,
                            ),
                            "children": [
                                {
                                    "name": "test_second",
                                    "path": str(TEST_MULTI_CLASS_NEST_PATH),
                                    "lineno": find_test_line_number(
                                        "test_second",
                                        str(TEST_MULTI_CLASS_NEST_PATH),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "test_multi_class_nest.py::TestFirstClass::TestSecondClass::test_second",
                                        TEST_MULTI_CLASS_NEST_PATH,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "test_multi_class_nest.py::TestFirstClass::TestSecondClass::test_second",
                                        TEST_MULTI_CLASS_NEST_PATH,
                                    ),
                                }
                            ],
                        },
                        {
                            "name": "test_first",
                            "path": str(TEST_MULTI_CLASS_NEST_PATH),
                            "lineno": find_test_line_number(
                                "test_first", str(TEST_MULTI_CLASS_NEST_PATH)
                            ),
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "test_multi_class_nest.py::TestFirstClass::test_first",
                                TEST_MULTI_CLASS_NEST_PATH,
                            ),
                            "runID": get_absolute_test_id(
                                "test_multi_class_nest.py::TestFirstClass::test_first",
                                TEST_MULTI_CLASS_NEST_PATH,
                            ),
                        },
                        {
                            "name": "TestSecondClass2",
                            "path": str(TEST_MULTI_CLASS_NEST_PATH),
                            "type_": "class",
                            "id_": get_absolute_test_id(
                                "test_multi_class_nest.py::TestFirstClass::TestSecondClass2",
                                TEST_MULTI_CLASS_NEST_PATH,
                            ),
                            "children": [
                                {
                                    "name": "test_second2",
                                    "path": str(TEST_MULTI_CLASS_NEST_PATH),
                                    "lineno": find_test_line_number(
                                        "test_second2",
                                        str(TEST_MULTI_CLASS_NEST_PATH),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "test_multi_class_nest.py::TestFirstClass::TestSecondClass2::test_second2",
                                        TEST_MULTI_CLASS_NEST_PATH,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "test_multi_class_nest.py::TestFirstClass::TestSecondClass2::test_second2",
                                        TEST_MULTI_CLASS_NEST_PATH,
                                    ),
                                }
                            ],
                        },
                    ],
                },
                {
                    "name": "test_independent",
                    "path": str(TEST_MULTI_CLASS_NEST_PATH),
                    "lineno": find_test_line_number(
                        "test_independent", str(TEST_MULTI_CLASS_NEST_PATH)
                    ),
                    "type_": "test",
                    "id_": get_absolute_test_id(
                        "test_multi_class_nest.py::test_independent",
                        TEST_MULTI_CLASS_NEST_PATH,
                    ),
                    "runID": get_absolute_test_id(
                        "test_multi_class_nest.py::test_independent",
                        TEST_MULTI_CLASS_NEST_PATH,
                    ),
                },
            ],
        }
    ],
    "id_": str(TEST_DATA_PATH),
}
SYMLINK_FOLDER_PATH = TEST_DATA_PATH / "symlink_folder"
SYMLINK_FOLDER_PATH_TESTS = TEST_DATA_PATH / "symlink_folder" / "tests"
SYMLINK_FOLDER_PATH_TESTS_TEST_A = TEST_DATA_PATH / "symlink_folder" / "tests" / "test_a.py"
SYMLINK_FOLDER_PATH_TESTS_TEST_B = TEST_DATA_PATH / "symlink_folder" / "tests" / "test_b.py"

# This is the expected output for the symlink_folder tests.
# └── symlink_folder
#    └── tests
#       └── test_a.py
#          └── test_a_function
#       └── test_b.py
#          └── test_b_function
symlink_expected_discovery_output = {
    "name": "symlink_folder",
    "path": str(SYMLINK_FOLDER_PATH),
    "type_": "folder",
    "children": [
        {
            "name": "tests",
            "path": str(SYMLINK_FOLDER_PATH_TESTS),
            "type_": "folder",
            "id_": str(SYMLINK_FOLDER_PATH_TESTS),
            "children": [
                {
                    "name": "test_a.py",
                    "path": str(SYMLINK_FOLDER_PATH_TESTS_TEST_A),
                    "type_": "file",
                    "id_": str(SYMLINK_FOLDER_PATH_TESTS_TEST_A),
                    "children": [
                        {
                            "name": "test_a_function",
                            "path": str(SYMLINK_FOLDER_PATH_TESTS_TEST_A),
                            "lineno": find_test_line_number(
                                "test_a_function",
                                os.path.join(tests_path, "test_a.py"),  # noqa: PTH118
                            ),
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "tests/test_a.py::test_a_function",
                                SYMLINK_FOLDER_PATH_TESTS_TEST_A,
                            ),
                            "runID": get_absolute_test_id(
                                "tests/test_a.py::test_a_function",
                                SYMLINK_FOLDER_PATH_TESTS_TEST_A,
                            ),
                        }
                    ],
                },
                {
                    "name": "test_b.py",
                    "path": str(SYMLINK_FOLDER_PATH_TESTS_TEST_B),
                    "type_": "file",
                    "id_": str(SYMLINK_FOLDER_PATH_TESTS_TEST_B),
                    "children": [
                        {
                            "name": "test_b_function",
                            "path": str(SYMLINK_FOLDER_PATH_TESTS_TEST_B),
                            "lineno": find_test_line_number(
                                "test_b_function",
                                os.path.join(tests_path, "test_b.py"),  # noqa: PTH118
                            ),
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "tests/test_b.py::test_b_function",
                                SYMLINK_FOLDER_PATH_TESTS_TEST_B,
                            ),
                            "runID": get_absolute_test_id(
                                "tests/test_b.py::test_b_function",
                                SYMLINK_FOLDER_PATH_TESTS_TEST_B,
                            ),
                        }
                    ],
                },
            ],
        }
    ],
    "id_": str(SYMLINK_FOLDER_PATH),
}

same_function_new_class_param_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "same_function_new_class_param.py",
            "path": os.fspath(TEST_DATA_PATH / "same_function_new_class_param.py"),
            "type_": "file",
            "id_": os.fspath(TEST_DATA_PATH / "same_function_new_class_param.py"),
            "children": [
                {
                    "name": "TestNotEmpty",
                    "path": os.fspath(TEST_DATA_PATH / "same_function_new_class_param.py"),
                    "type_": "class",
                    "children": [
                        {
                            "name": "test_integer",
                            "path": os.fspath(TEST_DATA_PATH / "same_function_new_class_param.py"),
                            "type_": "function",
                            "children": [
                                {
                                    "name": "[1-1]",
                                    "path": os.fspath(
                                        TEST_DATA_PATH / "same_function_new_class_param.py"
                                    ),
                                    "lineno": find_test_line_number(
                                        "TestNotEmpty::test_integer",
                                        os.fspath(
                                            TEST_DATA_PATH / "same_function_new_class_param.py"
                                        ),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "same_function_new_class_param.py::TestNotEmpty::test_integer[1-1]",
                                        TEST_DATA_PATH / "same_function_new_class_param.py",
                                    ),
                                    "runID": get_absolute_test_id(
                                        "same_function_new_class_param.py::TestNotEmpty::test_integer[1-1]",
                                        TEST_DATA_PATH / "same_function_new_class_param.py",
                                    ),
                                },
                                {
                                    "name": "[2-2]",
                                    "path": os.fspath(
                                        TEST_DATA_PATH / "same_function_new_class_param.py"
                                    ),
                                    "lineno": find_test_line_number(
                                        "TestNotEmpty::test_integer",
                                        os.fspath(
                                            TEST_DATA_PATH / "same_function_new_class_param.py"
                                        ),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "same_function_new_class_param.py::TestNotEmpty::test_integer[2-2]",
                                        TEST_DATA_PATH / "same_function_new_class_param.py",
                                    ),
                                    "runID": get_absolute_test_id(
                                        "same_function_new_class_param.py::TestNotEmpty::test_integer[2-2]",
                                        TEST_DATA_PATH / "same_function_new_class_param.py",
                                    ),
                                },
                            ],
                            "id_": os.fspath(TEST_DATA_PATH / "same_function_new_class_param.py")
                            + "::TestNotEmpty::test_integer",
                        },
                        {
                            "name": "test_string",
                            "path": os.fspath(TEST_DATA_PATH / "same_function_new_class_param.py"),
                            "type_": "function",
                            "children": [
                                {
                                    "name": "[a-a]",
                                    "path": os.fspath(
                                        TEST_DATA_PATH / "same_function_new_class_param.py"
                                    ),
                                    "lineno": find_test_line_number(
                                        "TestNotEmpty::test_string",
                                        os.fspath(
                                            TEST_DATA_PATH / "same_function_new_class_param.py"
                                        ),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "same_function_new_class_param.py::TestNotEmpty::test_string[a-a]",
                                        TEST_DATA_PATH / "same_function_new_class_param.py",
                                    ),
                                    "runID": get_absolute_test_id(
                                        "same_function_new_class_param.py::TestNotEmpty::test_string[a-a]",
                                        TEST_DATA_PATH / "same_function_new_class_param.py",
                                    ),
                                },
                                {
                                    "name": "[b-b]",
                                    "path": os.fspath(
                                        TEST_DATA_PATH / "same_function_new_class_param.py"
                                    ),
                                    "lineno": find_test_line_number(
                                        "TestNotEmpty::test_string",
                                        os.fspath(
                                            TEST_DATA_PATH / "same_function_new_class_param.py"
                                        ),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "same_function_new_class_param.py::TestNotEmpty::test_string[b-b]",
                                        TEST_DATA_PATH / "same_function_new_class_param.py",
                                    ),
                                    "runID": get_absolute_test_id(
                                        "same_function_new_class_param.py::TestNotEmpty::test_string[b-b]",
                                        TEST_DATA_PATH / "same_function_new_class_param.py",
                                    ),
                                },
                            ],
                            "id_": os.fspath(TEST_DATA_PATH / "same_function_new_class_param.py")
                            + "::TestNotEmpty::test_string",
                        },
                    ],
                    "id_": get_absolute_test_id(
                        "same_function_new_class_param.py::TestNotEmpty",
                        TEST_DATA_PATH / "same_function_new_class_param.py",
                    ),
                },
                {
                    "name": "TestEmpty",
                    "path": os.fspath(TEST_DATA_PATH / "same_function_new_class_param.py"),
                    "type_": "class",
                    "children": [
                        {
                            "name": "test_integer",
                            "path": os.fspath(TEST_DATA_PATH / "same_function_new_class_param.py"),
                            "type_": "function",
                            "children": [
                                {
                                    "name": "[0-0]",
                                    "path": os.fspath(
                                        TEST_DATA_PATH / "same_function_new_class_param.py"
                                    ),
                                    "lineno": find_test_line_number(
                                        "TestEmpty::test_integer",
                                        os.fspath(
                                            TEST_DATA_PATH / "same_function_new_class_param.py"
                                        ),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "same_function_new_class_param.py::TestEmpty::test_integer[0-0]",
                                        TEST_DATA_PATH / "same_function_new_class_param.py",
                                    ),
                                    "runID": get_absolute_test_id(
                                        "same_function_new_class_param.py::TestEmpty::test_integer[0-0]",
                                        TEST_DATA_PATH / "same_function_new_class_param.py",
                                    ),
                                },
                            ],
                            "id_": os.fspath(TEST_DATA_PATH / "same_function_new_class_param.py")
                            + "::TestEmpty::test_integer",
                        },
                        {
                            "name": "test_string",
                            "path": os.fspath(TEST_DATA_PATH / "same_function_new_class_param.py"),
                            "type_": "function",
                            "children": [
                                {
                                    "name": "[-]",
                                    "path": os.fspath(
                                        TEST_DATA_PATH / "same_function_new_class_param.py"
                                    ),
                                    "lineno": find_test_line_number(
                                        "TestEmpty::test_string",
                                        os.fspath(
                                            TEST_DATA_PATH / "same_function_new_class_param.py"
                                        ),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "same_function_new_class_param.py::TestEmpty::test_string[-]",
                                        TEST_DATA_PATH / "same_function_new_class_param.py",
                                    ),
                                    "runID": get_absolute_test_id(
                                        "same_function_new_class_param.py::TestEmpty::test_string[-]",
                                        TEST_DATA_PATH / "same_function_new_class_param.py",
                                    ),
                                },
                            ],
                            "id_": os.fspath(TEST_DATA_PATH / "same_function_new_class_param.py")
                            + "::TestEmpty::test_string",
                        },
                    ],
                    "id_": get_absolute_test_id(
                        "same_function_new_class_param.py::TestEmpty",
                        TEST_DATA_PATH / "same_function_new_class_param.py",
                    ),
                },
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}

test_param_span_class_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "test_param_span_class.py",
            "path": os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
            "type_": "file",
            "id_": os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
            "children": [
                {
                    "name": "TestClass1",
                    "path": os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
                    "type_": "class",
                    "children": [
                        {
                            "name": "test_method1",
                            "path": os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
                            "type_": "function",
                            "children": [
                                {
                                    "name": "[1]",
                                    "path": os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
                                    "lineno": find_test_line_number(
                                        "TestClass1::test_method1",
                                        os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "test_param_span_class.py::TestClass1::test_method1[1]",
                                        TEST_DATA_PATH / "test_param_span_class.py",
                                    ),
                                    "runID": get_absolute_test_id(
                                        "test_param_span_class.py::TestClass1::test_method1[1]",
                                        TEST_DATA_PATH / "test_param_span_class.py",
                                    ),
                                },
                                {
                                    "name": "[2]",
                                    "path": os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
                                    "lineno": find_test_line_number(
                                        "TestClass1::test_method1",
                                        os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "test_param_span_class.py::TestClass1::test_method1[2]",
                                        TEST_DATA_PATH / "test_param_span_class.py",
                                    ),
                                    "runID": get_absolute_test_id(
                                        "test_param_span_class.py::TestClass1::test_method1[2]",
                                        TEST_DATA_PATH / "test_param_span_class.py",
                                    ),
                                },
                            ],
                            "id_": os.fspath(
                                TEST_DATA_PATH
                                / "test_param_span_class.py::TestClass1::test_method1"
                            ),
                        }
                    ],
                    "id_": get_absolute_test_id(
                        "test_param_span_class.py::TestClass1",
                        TEST_DATA_PATH / "test_param_span_class.py",
                    ),
                },
                {
                    "name": "TestClass2",
                    "path": os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
                    "type_": "class",
                    "children": [
                        {
                            "name": "test_method1",
                            "path": os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
                            "type_": "function",
                            "children": [
                                {
                                    "name": "[1]",
                                    "path": os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
                                    "lineno": find_test_line_number(
                                        "TestClass2::test_method1",
                                        os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "test_param_span_class.py::TestClass2::test_method1[1]",
                                        TEST_DATA_PATH / "test_param_span_class.py",
                                    ),
                                    "runID": get_absolute_test_id(
                                        "test_param_span_class.py::TestClass2::test_method1[1]",
                                        TEST_DATA_PATH / "test_param_span_class.py",
                                    ),
                                },
                                {
                                    "name": "[2]",
                                    "path": os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
                                    "lineno": find_test_line_number(
                                        "TestClass2::test_method1",
                                        os.fspath(TEST_DATA_PATH / "test_param_span_class.py"),
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "test_param_span_class.py::TestClass2::test_method1[2]",
                                        TEST_DATA_PATH / "test_param_span_class.py",
                                    ),
                                    "runID": get_absolute_test_id(
                                        "test_param_span_class.py::TestClass2::test_method1[2]",
                                        TEST_DATA_PATH / "test_param_span_class.py",
                                    ),
                                },
                            ],
                            "id_": os.fspath(
                                TEST_DATA_PATH
                                / "test_param_span_class.py::TestClass2::test_method1"
                            ),
                        }
                    ],
                    "id_": get_absolute_test_id(
                        "test_param_span_class.py::TestClass2",
                        TEST_DATA_PATH / "test_param_span_class.py",
                    ),
                },
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}
# This is the expected output for the describe_only.py tests.
# └── describe_only.py
#    └── describe_A
#       └── test_1
#       └── test_2

describe_only_path = TEST_DATA_PATH / "pytest_describe_plugin" / "describe_only.py"
pytest_describe_plugin_path = TEST_DATA_PATH / "pytest_describe_plugin"

expected_describe_only_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "pytest_describe_plugin",
            "path": os.fspath(pytest_describe_plugin_path),
            "type_": "folder",
            "id_": os.fspath(pytest_describe_plugin_path),
            "children": [
                {
                    "name": "describe_only.py",
                    "path": os.fspath(describe_only_path),
                    "type_": "file",
                    "id_": os.fspath(describe_only_path),
                    "children": [
                        {
                            "name": "describe_A",
                            "path": os.fspath(describe_only_path),
                            "type_": "class",
                            "children": [
                                {
                                    "name": "test_1",
                                    "path": os.fspath(describe_only_path),
                                    "lineno": find_test_line_number(
                                        "test_1",
                                        describe_only_path,
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "pytest_describe_plugin/describe_only.py::describe_A::test_1",
                                        describe_only_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "pytest_describe_plugin/describe_only.py::describe_A::test_1",
                                        describe_only_path,
                                    ),
                                },
                                {
                                    "name": "test_2",
                                    "path": os.fspath(describe_only_path),
                                    "lineno": find_test_line_number(
                                        "test_2",
                                        describe_only_path,
                                    ),
                                    "type_": "test",
                                    "id_": get_absolute_test_id(
                                        "pytest_describe_plugin/describe_only.py::describe_A::test_2",
                                        describe_only_path,
                                    ),
                                    "runID": get_absolute_test_id(
                                        "pytest_describe_plugin/describe_only.py::describe_A::test_2",
                                        describe_only_path,
                                    ),
                                },
                            ],
                            "id_": get_absolute_test_id(
                                "pytest_describe_plugin/describe_only.py::describe_A",
                                describe_only_path,
                            ),
                        }
                    ],
                }
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}
# This is the expected output for the nested_describe.py tests.
# └── nested_describe.py
#    └── describe_list
#       └── describe_append
#          └── add_empty
#          └── remove_empty
#       └── describe_remove
#          └── removes
nested_describe_path = TEST_DATA_PATH / "pytest_describe_plugin" / "nested_describe.py"
expected_nested_describe_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "pytest_describe_plugin",
            "path": os.fspath(pytest_describe_plugin_path),
            "type_": "folder",
            "id_": os.fspath(pytest_describe_plugin_path),
            "children": [
                {
                    "name": "nested_describe.py",
                    "path": os.fspath(nested_describe_path),
                    "type_": "file",
                    "id_": os.fspath(nested_describe_path),
                    "children": [
                        {
                            "name": "describe_list",
                            "path": os.fspath(nested_describe_path),
                            "type_": "class",
                            "children": [
                                {
                                    "name": "describe_append",
                                    "path": os.fspath(nested_describe_path),
                                    "type_": "class",
                                    "children": [
                                        {
                                            "name": "add_empty",
                                            "path": os.fspath(nested_describe_path),
                                            "lineno": find_test_line_number(
                                                "add_empty",
                                                nested_describe_path,
                                            ),
                                            "type_": "test",
                                            "id_": get_absolute_test_id(
                                                "pytest_describe_plugin/nested_describe.py::describe_list::describe_append::add_empty",
                                                nested_describe_path,
                                            ),
                                            "runID": get_absolute_test_id(
                                                "pytest_describe_plugin/nested_describe.py::describe_list::describe_append::add_empty",
                                                nested_describe_path,
                                            ),
                                        },
                                        {
                                            "name": "remove_empty",
                                            "path": os.fspath(nested_describe_path),
                                            "lineno": find_test_line_number(
                                                "remove_empty",
                                                nested_describe_path,
                                            ),
                                            "type_": "test",
                                            "id_": get_absolute_test_id(
                                                "pytest_describe_plugin/nested_describe.py::describe_list::describe_append::remove_empty",
                                                nested_describe_path,
                                            ),
                                            "runID": get_absolute_test_id(
                                                "pytest_describe_plugin/nested_describe.py::describe_list::describe_append::remove_empty",
                                                nested_describe_path,
                                            ),
                                        },
                                    ],
                                    "id_": get_absolute_test_id(
                                        "pytest_describe_plugin/nested_describe.py::describe_list::describe_append",
                                        nested_describe_path,
                                    ),
                                },
                                {
                                    "name": "describe_remove",
                                    "path": os.fspath(nested_describe_path),
                                    "type_": "class",
                                    "children": [
                                        {
                                            "name": "removes",
                                            "path": os.fspath(nested_describe_path),
                                            "lineno": find_test_line_number(
                                                "removes",
                                                nested_describe_path,
                                            ),
                                            "type_": "test",
                                            "id_": get_absolute_test_id(
                                                "pytest_describe_plugin/nested_describe.py::describe_list::describe_remove::removes",
                                                nested_describe_path,
                                            ),
                                            "runID": get_absolute_test_id(
                                                "pytest_describe_plugin/nested_describe.py::describe_list::describe_remove::removes",
                                                nested_describe_path,
                                            ),
                                        }
                                    ],
                                    "id_": get_absolute_test_id(
                                        "pytest_describe_plugin/nested_describe.py::describe_list::describe_remove",
                                        nested_describe_path,
                                    ),
                                },
                            ],
                            "id_": get_absolute_test_id(
                                "pytest_describe_plugin/nested_describe.py::describe_list",
                                nested_describe_path,
                            ),
                        }
                    ],
                }
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}
# This is the expected output for the folder_with_script folder when run with ruff
# └── .data
#    └── folder_with_script
#       └── script_random.py
#          └── ruff
#       └── test_simple.py
#          └── ruff
#          └── test_function
ruff_test_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "folder_with_script",
            "path": os.fspath(TEST_DATA_PATH / "folder_with_script"),
            "type_": "folder",
            "id_": os.fspath(TEST_DATA_PATH / "folder_with_script"),
            "children": [
                {
                    "name": "script_random.py",
                    "path": os.fspath(TEST_DATA_PATH / "folder_with_script" / "script_random.py"),
                    "type_": "file",
                    "id_": os.fspath(TEST_DATA_PATH / "folder_with_script" / "script_random.py"),
                    "children": [
                        {
                            "name": "ruff",
                            "path": os.fspath(
                                TEST_DATA_PATH / "folder_with_script" / "script_random.py"
                            ),
                            "lineno": "",
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "folder_with_script/script_random.py::ruff",
                                TEST_DATA_PATH / "folder_with_script" / "script_random.py",
                            ),
                            "runID": get_absolute_test_id(
                                "folder_with_script/script_random.py::ruff",
                                TEST_DATA_PATH / "folder_with_script" / "script_random.py",
                            ),
                        }
                    ],
                },
                {
                    "name": "test_simple.py",
                    "path": os.fspath(TEST_DATA_PATH / "folder_with_script" / "test_simple.py"),
                    "type_": "file",
                    "id_": os.fspath(TEST_DATA_PATH / "folder_with_script" / "test_simple.py"),
                    "children": [
                        {
                            "name": "ruff",
                            "path": os.fspath(
                                TEST_DATA_PATH / "folder_with_script" / "test_simple.py"
                            ),
                            "lineno": "",
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "folder_with_script/test_simple.py::ruff",
                                TEST_DATA_PATH / "folder_with_script" / "test_simple.py",
                            ),
                            "runID": get_absolute_test_id(
                                "folder_with_script/test_simple.py::ruff",
                                TEST_DATA_PATH / "folder_with_script" / "test_simple.py",
                            ),
                        },
                        {
                            "name": "test_function",
                            "path": os.fspath(
                                TEST_DATA_PATH / "folder_with_script" / "test_simple.py"
                            ),
                            "lineno": find_test_line_number(
                                "test_function",
                                TEST_DATA_PATH / "folder_with_script" / "test_simple.py",
                            ),
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "folder_with_script/test_simple.py::test_function",
                                TEST_DATA_PATH / "folder_with_script" / "test_simple.py",
                            ),
                            "runID": get_absolute_test_id(
                                "folder_with_script/test_simple.py::test_function",
                                TEST_DATA_PATH / "folder_with_script" / "test_simple.py",
                            ),
                        },
                    ],
                },
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}

# This is the expected output for the 2496-black-formatter folder when run with black plugin
# └── .data
#    └── 2496-black-formatter
#       └── app.py
#          └── black
#       └── test_app.py
#          └── black
#          └── test_add
#          └── test_subtract
black_formatter_folder_path = TEST_DATA_PATH / "2496-black-formatter"
black_app_path = black_formatter_folder_path / "app.py"
black_test_app_path = black_formatter_folder_path / "test_app.py"
black_formatter_expected_output = {
    "name": ".data",
    "path": TEST_DATA_PATH_STR,
    "type_": "folder",
    "children": [
        {
            "name": "2496-black-formatter",
            "path": os.fspath(black_formatter_folder_path),
            "type_": "folder",
            "id_": os.fspath(black_formatter_folder_path),
            "children": [
                {
                    "name": "app.py",
                    "path": os.fspath(black_app_path),
                    "type_": "file",
                    "id_": os.fspath(black_app_path),
                    "children": [
                        {
                            "name": "black",
                            "path": os.fspath(black_app_path),
                            "lineno": "0",
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "2496-black-formatter/app.py::black",
                                black_app_path,
                            ),
                            "runID": get_absolute_test_id(
                                "2496-black-formatter/app.py::black",
                                black_app_path,
                            ),
                        }
                    ],
                },
                {
                    "name": "test_app.py",
                    "path": os.fspath(black_test_app_path),
                    "type_": "file",
                    "id_": os.fspath(black_test_app_path),
                    "children": [
                        {
                            "name": "black",
                            "path": os.fspath(black_test_app_path),
                            "lineno": "0",
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "2496-black-formatter/test_app.py::black",
                                black_test_app_path,
                            ),
                            "runID": get_absolute_test_id(
                                "2496-black-formatter/test_app.py::black",
                                black_test_app_path,
                            ),
                        },
                        {
                            "name": "test_add",
                            "path": os.fspath(black_test_app_path),
                            "lineno": find_test_line_number(
                                "test_add",
                                black_test_app_path,
                            ),
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "2496-black-formatter/test_app.py::test_add",
                                black_test_app_path,
                            ),
                            "runID": get_absolute_test_id(
                                "2496-black-formatter/test_app.py::test_add",
                                black_test_app_path,
                            ),
                        },
                        {
                            "name": "test_subtract",
                            "path": os.fspath(black_test_app_path),
                            "lineno": find_test_line_number(
                                "test_subtract",
                                black_test_app_path,
                            ),
                            "type_": "test",
                            "id_": get_absolute_test_id(
                                "2496-black-formatter/test_app.py::test_subtract",
                                black_test_app_path,
                            ),
                            "runID": get_absolute_test_id(
                                "2496-black-formatter/test_app.py::test_subtract",
                                black_test_app_path,
                            ),
                        },
                    ],
                },
            ],
        }
    ],
    "id_": TEST_DATA_PATH_STR,
}
