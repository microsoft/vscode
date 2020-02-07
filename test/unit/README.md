# Unit Tests

## Run (inside Electron)

The best way to run the unit tests is from the terminal. To make development changes to unit tests you need to be running `yarn watch`. See [Development Workflow](https://github.com/Microsoft/vscode/wiki/How-to-Contribute#incremental-build) for more details. From the `vscode` folder run:

**OS X and Linux**

	./scripts/test.sh

**Windows**

	scripts\test


## Run (inside browser)

You can run tests inside a browser instance too:

**OS X and Linux**

	node test/unit/browser/index.js

**Windows**

	node test\unit\browser\index.js


## Run (with node)

	yarn run mocha --run src/vs/editor/test/browser/controller/cursor.test.ts

## Debug

To debug tests use `--debug` when running the test script. Also, the set of tests can be reduced with the `--run` and `--runGlob` flags. Both require a file path/pattern. Like so:

	./scripts/test.sh --debug --runGrep **/extHost*.test.js

## Coverage

The following command will create a `coverage` folder at the root of the workspace:

**OS X and Linux**

	./scripts/test.sh --coverage

**Windows**

	scripts\test --coverage
