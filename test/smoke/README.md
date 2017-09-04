# VS Code Smoke Testing

- Run `npm install`
- Start the tests: `npm test -- --latest "path/to/binary"`.

If you want to include 'Data Migration' area tests use  `npm test -- --latest path/to/binary --stable path/to/currentStable` respectively.

Detailed prerequisites and running steps are described [in our smoke test wiki](https://github.com/Microsoft/vscode/wiki/Smoke-Test#automated-smoke-test).

# Architecture
* `main.js` is used to prepare all smoke test dependencies (fetching key bindings and 'Express' repository, running `npm install` there).
* `mocha-runner.js` launches Mocha programmatically. It is spawned in Node environment from main.js to ensure that it is possible to listen on `stderr`s (primary `process.stderr` is not readable otherwise). This is accomplished because WebDriverIO command deprecation warnings need to be redirected to a separate log. Those warnings are coming from WebDriverIO because ChromeDriver has not migrated from JsonWire to W3C WebDriver protocol.
* `test.ts` contains the main smoke test suite calling the tests that are bundled in areas and defined in `./tests/`. It includes all tests separated into mocha `describe()` groups that represent each of the areas of [Smoke Test document](https://github.com/Microsoft/vscode/wiki/Smoke-Test).

* `./areas/` folder contains a `.ts` file per each area of the document. E.g. `'Search'` area goes under `'search.ts'`. Every area file contains a list of methods with the name that represents the action that can be performed in the corresponding test. This reduces the amount of test suite code and means that if the UI changes, the fix need only be applied in one place. The name of the method reflects the action the tester would do if he would perform the test manually. See [Selenium Page Objects Wiki](https://github.com/SeleniumHQ/selenium/wiki/PageObjects) and [Selenium Bot Style Tests Wiki](https://github.com/SeleniumHQ/selenium/wiki/Bot-Style-Tests) for a good explanation of the implementation. Every smoke test area contains methods that are used in a bot-style approach in `main.ts`.
* `./spectron/` wraps the Spectron, with WebDriverIO API wrapped in `client.ts` and instance of Spectron Application is wrapped in `application.ts`.

* `./test_data/` folder contains temporary data used by smoke test (cloned express repository, temporary user-data-dir/extensions-dir).
* `./test_data/screenshots` has action screenshots captured by a smoke test when performing actions during runtime. Screenshots are split in folders per each test.

# Adding new area
To contribute a new smoke test area, add `${area}.ts` file under `./areas/`. All related tests to the area should go to the alike named file under `./tests/${area}.ts`. This has to follow the bot-style approach described in the links mentioned above. Methods should be calling WebDriverIO API through `SpectronClient` class. If there is no existing WebDriverIO method, add it to the class.

# Adding new test
To add new test, `./test/${area}.ts` should be updated. The same instruction-style principle needs to be followed with the called area method names that reflect manual tester's actions.

# Debugging
1. Add the following configuration to launch.json, specifying binaries in `args`:
```json
{
	"type": "node",
	"request": "launch",
	"name": "Launch Smoke Test",
	"program": "${workspaceRoot}/test/smoke/out/main.js",
	"cwd": "${workspaceRoot}/test/smoke",
	"timeout": 240000,
	"port": 9999,
	"args": [
		"-l",
		"path/to/Code.exe"
	],
	"outFiles": [
		"${cwd}/out/**/*.js"
	]
}
```
2. In main.js add `--debug-brk=9999` as a first argument to the place where `out/mocha-runner.js` is spawned.

# Screenshots
Almost on every automated test action it captures a screenshot. These help to determine an issue, if smoke test fails. The normal workflow is that you understand what code is doing and then try to match it up with screenshots obtained from the test.

# Running "Out of Sources"
If you did a fix in VS Code that you need in order for the smoke test to succeed, here is how you can run the smoke test against the sources of VS Code:
* Set related environment variables in the console:
  * `export NODE_ENV=development`
  * `export VSCODE_DEV=1`
  * `export VSCODE_CLI=1`
* open `application.ts`
  * pass in the vscode folder as argument to the application
  * e.g. instead of `args: args` type `args: ['/Users/bpasero/Development/vscode', ...args]`
* `cd test/smoke`
* `npm install`
* `npm test -- --latest <path to electron>`
  * e.g. on macOS: `npm test -- --latest <path to vscode>/.build/electron/Code\ -\ OSS.app/Contents/MacOS/Electron`