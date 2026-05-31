# Diffing Fixture Tests

Every folder in `fixtures` represents a test.
The file that starts with `1.` is diffed against the file that starts with `2.`. Use `tst` instead of `ts` to avoid compiler/linter errors for typescript diff files.

* Missing `*.expected.diff.json` are created automatically (as well as an `*.invalid.diff.json` file).
* If the actual diff does not equal the expected diff, the expected file is updated automatically. The previous value of the expected file is written to `*.invalid.diff.json`.
* The test will fail if there are any `*.invalid.diff.json` files. This makes sure that the test keeps failing even if it is run a second time.

When changing the diffing algorithm, run the fixture tests, review the diff of the `*.expected.diff.json` files and delete all `*.invalid.diff.json` files.
