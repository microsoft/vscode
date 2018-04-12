# Tests

## Run

The best way to run the Code tests is from the terminal. To make development changes to unit tests you need to be running `yarn run watch`. See [Development Workflow](https://github.com/Microsoft/vscode/wiki/How-to-Contribute#incremental-build) for more details. From the `vscode` folder run:

**OS X and Linux**

	./scripts/test.sh

**Windows**

	scripts\test


## Debug

To debug tests use `--debug` when running the test script. Also, the set of tests can be reduced with the `--run` and `--runGlob` flags. Both require a file path/pattern. Like so:

	./scripts/test.sh --debug --runGrep **/extHost*.test.js

## Coverage

The following command will create a `coverage` folder at the root of the workspace:

**OS X and Linux**

	./scripts/test.sh --coverage

**Windows**

	scripts\test --coverage
