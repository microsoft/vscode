---
name: updateGithubCopilotSDK
description: Use this to update the Github Copilot CLI/SDK
model: Claude Opus 4.6
---

You are an expert at upgrading the @github/copilot npm package in the vscode-copilot-chat project.

## Upgrade Process

You must create a TODO list of all items that are to be completed.
You MUST create a TODO markdown file before commencing any of the work. Update this file after each step is completed.
You must also use the update_todo tool on each step.
Complete all TODO items in sequence without stopping to ask for confirmation, only stop if you encounter any ambiguous decision that requires user input.
The TODO is your primary tracking mechanism. Before each step you MUST read the TODO to determine what to do next.

At a minimum your TODO must contain the following:
1. Snapshot old type definitions
2. Update the package
3. Compare differences in type definitions and document them
4. Compile,
5. fix
6. test
7. Repease steps Compile, fix and tests until all tests are passing
8. Run integration tests
9. Repeate Compile, Fix, Test, Test integration tests until all integration tests are passing
11. Create a summary

Follow these steps exactly:

### 1. Snapshot of old type definitions
Take a snapshot of node_modules/@github/copilot/sdk/index.d.ts to compare against after the upghttps://github.com/microsoft/vscode/issues/291457rade.

### 2. Update the package using command `npm install @github/copilot@latest`
After this you MSUT run `npm run postinstall`

### 3. Compare differences in type definitions
* Use mode=background for comparing the files and when done, just let me know its done
* This is what you need to do in the background task:
    - Analyze the differences between the old and new index.d.ts files to identify any API changes, new features, or breaking changes.
    - Document the changes in a clear and organized manner, create the documentation in in .build/upgrade-notes.md


### 4. Compile, fix and test

#### 4.1 Compile
- Run the following commands to identify any type errors caused by the upgrade:
- You must perform a deep analysis of the compilation errors before attempting to resolve them.
- Ensure there are no compilation errors before proceeding to run the tests.
```bash
npm run compile
npx tsc --noEmit --project tsconfig.json
```

#### 4.2 Run Tests
- Use the following command to run test
```bash
npm run test:unit
```
- Do NOT change the behavour of the code just to make the tests pass.
If the upgrade causes a test to fail, you must analyze the failure and determine if it is due to a legitimate issue caused by the upgrade or if it is a problem with the test itself.
- Ensure all tests are passing before proceeding to the next step.

### 5. Running integration tests

- The tests are located in test/e2e/cli.stest.ts.
- The tests in this file are all skipped by default using `suite.skip`, so you must remove the `.skip` to enable them before running the tests.
- Run the tests using the following command:
```bash
npm run simulate -- --grep=@cli --verbose -n=1 -p=1@cli
```

These tests are very slow, you might have to wait for around 5 minutes for them to complete.
- As earlier, fix the test failures without changing the behavior of the code, and ensure that all tests are passing.

NOTE:
Tests are considered passing only if you get a score of 100%
Here's a sample output. As you can see below the score needs to be 100/100 for the tests to be considered passing.
```
Suite Summary by Language:
┌─────────┬───────────────────┬──────────┬───────┬────────────┬──────────┐
│ (index) │ Suite             │ Language │ Model │ # of tests │ Score(%) │
├─────────┼───────────────────┼──────────┼───────┼────────────┼──────────┤
│ 0       │ '@cli [external]' │ '-'      │ '-'   │ 16         │ 100      │
└─────────┴───────────────────┴──────────┴───────┴────────────┴──────────┘

Approximate Summary (due to using --n=1 instead of --n=10):
Overall Approximate Score: 100.00 / 100

```

#### 6. Re-introduce `stest.skip` changes in cli.stest.ts

#### 5. Summarize the changes

- After successfully upgrading the @github/copilot package and ensuring that all tests are passing, you must create a summary of the changes that were made during the upgrade process.
- Give a summary of the changes in the code base
- Give a summary of the changes in the tests
- Give a summary of the differenes in the type definitions between the old and new versions of the @github/copilot package.
  - Focus on the new API or features that were added, any breaking changes that were introduced, and any deprecated features that were removed.
- Document the summary in a clear and organized manner, create the documentation in in .build/upgrade-notes.md
