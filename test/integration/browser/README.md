# Integration test

## Compile

Make sure to run the following command to compile and install dependencies:

	yarn --cwd test/integration/browser

## Run (inside Electron)

	scripts/test-integration.[sh|bat]

All integration tests run in an Electron instance. You can specify to run the tests against a real build by setting the environment variables `INTEGRATION_TEST_ELECTRON_PATH` and `VSCODE_REMOTE_SERVER_PATH` (if you want to include remote tests).

## Run (inside browser)

	resources/server/test/test-web-integration.[sh|bat] --browser [chromium|webkit] [--debug]

All integration tests run in a browser instance as specified by the command line arguments.

Add the `--debug` flag to see a browser window with the tests running.

## Debug

All integration tests can be run and debugged from within VSCode (both Electron and Web) simply by selecting the related launch configuration and running them.
