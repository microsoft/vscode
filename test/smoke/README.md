# VS Code Automated Smoke Testing

## Framework
* Smoke tests are written using the [Spectron](https://electron.atom.io/spectron/) and [Mocha](https://mochajs.org/) frameworks.
* Spectron is used to control the lifecycle of VS Code and also to query the DOM elements of VS Code renderer window using the [WebriverIO](http://webdriver.io/) API that is wrapped in Spectron API.
* Mocha is used to launch the smoke tests.

## Code Organization
* All smoke test code is present under `/test/smoke/` folder. Code is organized into indvidual areas. Each area contains a facade to to access it functionality and a test file to test it. For e.g. `debug` area has `debug.ts` facade class that provides utility methods to access debug functionalities. It also has `debug.test.ts` that tests the debug functionalities.

* `application.ts` provides APIs to start and stop the VS Code application. It also provides access to various utility APIs like
	* client
	* webclient
	* screenCapturer
	* workbench

* `client.ts` class wraps WebDriverIO APIs and provides enhanced APIs for accessing DOM elements. For e.g. it has methods like `waitForElement(selector, accept)` that will query the DOM with the given selector and waits until the element is found or time out after configured time (`5s`).

* `screenCapturer.ts` allows you capture the screenshots. Capturing is done only if argument `--screenshots` is passed while launching smoke tests. When run out of sources, screenshots are captured under `screenshots` folder in the parent directory of vscode workspace.

* `workbench.ts` provides utlities to access workbench functionality and also access to other functionality areas like `scm`, `debug`, `editor`. **Note**: All areas should be able to be accessible from workbench either directly or through area traversal.

### Adding new area and tests
To contribute a new smoke test area, add `${area}` folder under `./areas/`. All tests and facades related to this area should go under this folder. Newly added tests should be listed in `main.ts` as imports so that mocha can pick and run them.

## Running "Out of Sources"
```
npm run smoketest
```

## Running Insiders
```
npm run smoketest -- --build "path/to/code-insiders"
```

## Running Stable
```
npm run smoketest -- --build "path/to/code"
```

To run 'Data Migration' tests, specify the path of the version to be migrated using `--stable` argument

```
npm run smoketest -- --build "path/to/code-insiders" --stable "path/to/code"
```

By default screenshots are not captured. To run tests with screenshots use the argument `--screenshots`

```
npm run smoketest -- --screenshots
```

To run a specific test suite use `-f ${suiteName}` argument

```
npm run smoketest -- -f Git
```

# Debugging

Update