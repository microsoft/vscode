# Architecture
* `main.ts` contains the main smoke test suite. It includes all tests separated into mocha `describe()` groups that represent each of the areas of [Smoke Test document](https://github.com/Microsoft/vscode/wiki/Smoke-Test).

* `./areas/` folder contains a `.ts` file per each area of the document. E.g. `'Search'` area goes under `'search.ts'`. Every area file contains a list of methods with the name that represents the action that can be performed in the corresponding test. This reduces the amount of test suite code and means that if the UI changes, the fix need only be applied in one place. The name of the method reflects the action the tester would do if he would perform the test manually. See [Selenium Page Objects Wiki](https://github.com/SeleniumHQ/selenium/wiki/PageObjects) and [Selenium Bot Style Tests Wiki](https://github.com/SeleniumHQ/selenium/wiki/Bot-Style-Tests) for a good explanation of the implementation. Every smoke test area contains methods that are used in a bot-style approach in `main.ts`.
* `./spectron/` wraps the Spectron, with WebDriverIO API wrapped in `client.ts` and instance of Spectron Application is wrapped in `application.ts`.
* `./scripts/` contains scripts to run the smoke test.

# Adding new area
To contribute a new smoke test area, add `${area}.ts` file under `./areas`. This has to follow the bot-style approach described in the links mentioned above. Methods should be calling WebDriverIO API through `SpectronClient` class. If there is no existing WebDriverIO method, add it to the class.

# Adding new test
To add new test area or test, `main.ts` should be updated. The same instruction-style principle needs to be followed with the called area method names that reflect manual tester's actions.