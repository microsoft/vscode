## Contributing bug fixes
TypeScript is currently accepting contributions in the form of bug fixes. A bug must have an issue tracking it in the issue tracker that has been approved ("Milestone == Community") by the TypeScript team. Your pull request should include a link to the bug that you are fixing. If you've submitted a PR for a bug, please post a comment in the bug to avoid duplication of effort.

## Contributing features
Features (things that add new or improved functionality to TypeScript) may be accepted, but will need to first be approved (marked as "Milestone == Community" by a TypeScript coordinator with the message "Approved") in the suggestion issue. Features with language design impact, or that are adequately satisfied with external tools, will not be accepted.

Design changes will not be accepted at this time. If you have a design change proposal, please log a suggestion issue.

## Legal
You will need to complete a Contributor License Agreement (CLA). Briefly, this agreement testifies that you are granting us permission to use the submitted change according to the terms of the project's license, and that the work being submitted is under appropriate copyright.

Please submit a Contributor License Agreement (CLA) before submitting a pull request. You may visit https://cla.microsoft.com to sign digitally. Alternatively, download the agreement ([Microsoft Contribution License Agreement.docx](https://www.codeplex.com/Download?ProjectName=typescript&DownloadId=822190) or [Microsoft Contribution License Agreement.pdf](https://www.codeplex.com/Download?ProjectName=typescript&DownloadId=921298)), sign, scan, and email it back to <cla@microsoft.com>. Be sure to include your github user name along with the agreement. Once we have received the signed CLA, we'll review the request.

## Housekeeping
Your pull request should:

* Include a description of what your change intends to do
* Be a child commit of a reasonably recent commit in the **master** branch
    * Requests need not be a single commit, but should be a linear sequence of commits (i.e. no merge commits in your PR)
* It is desirable, but not necessary, for the tests to pass at each commit
* Have clear commit messages
    * e.g. "Refactor feature", "Fix issue", "Add tests for issue"
* Include adequate tests
    * At least one test should fail in the absence of your non-test code changes. If your PR does not match this criteria, please specify why
    * Tests should include reasonable permutations of the target fix/change
    * Include baseline changes with your change
    * All changed code must have 100% code coverage
* Follow the code conventions descriped in [Coding guidelines](https://github.com/Microsoft/TypeScript/wiki/Coding-guidelines)
* To avoid line ending issues, set `autocrlf = input` and `whitespace = cr-at-eol` in your git configuration

## Running the Tests
To run all tests, invoke the runtests target using jake:

```Shell
jake runtests
```

This run will all tests; to run only a specific subset of tests, use:

```Shell
jake runtests tests=<regex>
```

e.g. to run all compiler baseline tests:

```Shell
jake runtests tests=compiler
```

or to run specifc test: `tests\cases\compiler\2dArrays.ts`

```Shell
jake runtests tests=2dArrays
```

## Adding a Test
To add a new testcase, simply place a `.ts` file in `tests\cases\compiler` containing code that exemplifies the bugfix or change you are making.

These files support metadata tags in the format  `// @metaDataName: value`. The supported names and values are:

* `comments`, `sourcemap`, `noimplicitany`, `declaration`: true or false (corresponds to the compiler command-line options of the same name)
* `target`: ES3 or ES5 (same as compiler)
* `out`, outDir: path (same as compiler)
* `module`: local, commonjs, or amd (local corresponds to not passing any compiler --module flag)
* `fileName`: path
  * These tags delimit sections of a file to be used as separate compilation units. They are useful for tests relating to modules. See below for examples.

**Note** that if you have a test corresponding to a specific spec compliance item, you can place it in `tests\cases\conformance` in an appropriately-named subfolder.
**Note** that filenames here must be distinct from all other compiler testcase names, so you may have to work a bit to find a unique name if it's something common.

### Tests for multiple files

When one needs to test for scenarios which require multiple files, it is useful to use the `fileName` metadata tag as such:

```TypeScript
// @fileName: file1.ts
export function f() {
}

// @fileName: file2.ts
import { f as g } from "file1";

var x = g();
```

One can also write a project test, but it is slightly more involved.

## Managing the Baselines
Compiler testcases generate baselines that track the emitted `.js`, the errors produced by the compiler, and the type of each expression in the file. Additionally, some testcases opt in to baselining the source map output.

When a change in the baselines is detected, the test will fail. To inspect changes vs the expected baselines, use

```Shell
jake diff
```

After verifying that the changes in the baselines are correct, run

```Shell
jake baseline-accept
```

to establish the new baselines as the desired behavior. This will change the files in `tests\baselines\reference`, which should be included as part of your commit. It's important to carefully validate changes in the baselines.

**Note** that baseline-accept should only be run after a full test run! Accepting baselines after running a subset of tests will delete baseline files for the tests that didn't run.
