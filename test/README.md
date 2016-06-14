# Tests

## Run

The best way to run the Code tests is from within VS Code. Simply press<kbd>F1</kbd>, type "run test" and press <kbd>enter</kbd> to launch the tests. To make development changes to unit tests you need to be running `gulp`. See [Development Workflow](https://github.com/Microsoft/vscode/wiki/How-to-Contribute#incremental-build) for more details.

If you wish to run the tests from a terminal, from the `vscode` folder run:

**OS X and Linux**

	./scripts/test.sh

**Windows**

	scripts\test

## Debug

You can use VS Code to debug your tests. Switch to the Debug viewlet, pick the `Unit Tests` debug target and press `Play`.

## Coverage

The following command will create a `coverage` folder at the root of the workspace:

**OS X and Linux**

	./scripts/test.sh --coverage

**Windows**

	scripts\test --coverage
