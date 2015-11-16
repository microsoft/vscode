# Tests

## Run

The best way to run the Code tests is from within VS Code. Simply press `CMD+Shift+T` (`Ctrl+Shift+T` on Windows) to launch the tests.

If you wish to run the tests from a terminal, from the `vscode` folder run:

OSX and Linux

	./test/run.sh

Windows

	test\run

## Debug

You can use VS Code to debug your tests. Switch to the Debug viewlet, pick the `Unit Tests` debug target and press `Play`.

## Coverage

The following command will create a `coverage` folder at the root of the workspace:

	mocha --coverage