# Tests
## Run
<<<<<<< HEAD
The best way to run the Code tests is from within VS Code. Simply press<kbd>F1</kbd>, type "run test" and press <kbd>enter</kbd> to launch the tests. To make development changes to unit tests you need to be running `gulp`. See [Development Workflow](https://github.com/Microsoft/vscode/wiki/How-to-Contribute#incremental-build) for more details.
If you wish to run the tests from a terminal, from the `vscode` folder run:
=======

The best way to run the Code tests is from the terminal. To make development changes to unit tests you need to be running `yarn run watch`. See [Development Workflow](https://github.com/Microsoft/vscode/wiki/How-to-Contribute#incremental-build) for more details. From the `vscode` folder run:

>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
**OS X and Linux**
	./scripts/test.sh
**Windows**
	scripts\test
<<<<<<< HEAD
## Debug
You can use VS Code to debug your tests. Switch to the Debug viewlet, pick the `Unit Tests` debug target and press `Play`.
=======


## Debug

To debug tests use `--debug` when running the test script. Also, the set of tests can be reduced with the `--run` and `--runGlob` flags. Both require a file path/pattern. Like so:

	./scripts/test.sh --debug --runGrep **/extHost*.test.js

>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
## Coverage
The following command will create a `coverage` folder at the root of the workspace:
**OS X and Linux**
	./scripts/test.sh --coverage
**Windows**

	scripts\test --coverage
