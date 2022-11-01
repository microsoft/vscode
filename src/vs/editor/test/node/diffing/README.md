# Diffing Fixture Tests

Every folder in `fixtures` represents a test.
The file that starts with `1.` is diffed against the file that starts with `2.`. Use `tsx` instead of `ts` to avoid compiler/linter errors for typescript diff files.

* When you delete `*.actual.diff.json`, they are regenerated.
* Make sure to delete `*.expected.diff.json`, as they make the tests fail.
