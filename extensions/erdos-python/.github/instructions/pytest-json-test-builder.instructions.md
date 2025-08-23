---
applyTo: 'python_files/tests/pytestadapter/test_discovery.py'
description: 'A guide for adding new tests for pytest discovery and JSON formatting in the test_pytest_collect suite.'
---

# How to Add New Pytest Discovery Tests

This guide explains how to add new tests for pytest discovery and JSON formatting in the `test_pytest_collect` suite. Follow these steps to ensure your tests are consistent and correct.

---

## 1. Add Your Test File

-   Place your new test file/files in the appropriate subfolder under:
    ```
    python_files/tests/pytestadapter/.data/
    ```
-   Organize folders and files to match the structure you want to test. For example, to test nested folders, create the corresponding directory structure.
-   In your test file, mark each test function with a comment:
    ```python
    def test_function():  # test_marker--test_function
        ...
    ```

**Root Node Matching:**

-   The root node in your expected output must match the folder or file you pass to pytest discovery. For example, if you run discovery on a subfolder, the root `"name"`, `"path"`, and `"id_"` in your expected output should be that subfolder, not the parent `.data` folder.
-   Only use `.data` as the root if you are running discovery on the entire `.data` folder.

**Example:**
If you run:

```python
helpers.runner([os.fspath(TEST_DATA_PATH / "myfolder"), "--collect-only"])
```

then your expected output root should be:

```python
{
    "name": "myfolder",
    "path": os.fspath(TEST_DATA_PATH / "myfolder"),
    "type_": "folder",
    ...
}
```

---

## 2. Update `expected_discovery_test_output.py`

-   Open `expected_discovery_test_output.py` in the same test suite.
-   Add a new expected output dictionary for your test file, following the format of existing entries.
-   Use the helper functions and path conventions:
    -   Use `os.fspath()` for all paths.
    -   Use `find_test_line_number("function_name", file_path)` for the `lineno` field.
    -   Use `get_absolute_test_id("relative_path::function_name", file_path)` for `id_` and `runID`.
    -   Always use current path concatenation (e.g., `TEST_DATA_PATH / "your_folder" / "your_file.py"`).
    -   Create new constants as needed to keep the code clean and maintainable.

**Important:**

-   Do **not** read the entire `expected_discovery_test_output.py` file if you only need to add or reference a single constant. This file is very large; prefer searching for the relevant section or appending to the end.

**Example:**
If you run discovery on a subfolder:

```python
helpers.runner([os.fspath(TEST_DATA_PATH / "myfolder"), "--collect-only"])
```

then your expected output root should be:

```python
myfolder_path = TEST_DATA_PATH / "myfolder"
my_expected_output = {
    "name": "myfolder",
    "path": os.fspath(myfolder_path),
    "type_": "folder",
    ...
}
```

-   Add a comment above your dictionary describing the structure, as in the existing examples.

---

## 3. Add Your Test to `test_discovery.py`

-   In `test_discovery.py`, add your new test as a parameterized case to the main `test_pytest_collect` function. Do **not** create a standalone test function for new discovery cases.
-   Reference your new expected output constant from `expected_discovery_test_output.py`.

**Example:**

```python
@pytest.mark.parametrize(
    ("file", "expected_const"),
    [
        ("myfolder", my_expected_output),
        # ... other cases ...
    ],
)
def test_pytest_collect(file, expected_const):
    ...
```

---

## 4. Run and Verify

-   Run the test suite to ensure your new test is discovered and passes.
-   If the test fails, check your expected output dictionary for path or structure mismatches.

---

## 5. Tips

-   Always use the helper functions for line numbers and IDs.
-   Match the folder/file structure in `.data` to the expected JSON structure.
-   Use comments to document the expected output structure for clarity.
-   Ensure all `"path"` and `"id_"` fields in your expected output match exactly what pytest returns, including absolute paths and root node structure.

---

**Reference:**
See `expected_discovery_test_output.py` for more examples and formatting. Use search or jump to the end of the file to avoid reading the entire file when possible.
