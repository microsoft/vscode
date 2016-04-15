# 1.0 Release of VS Code

As of March 31st we will have completed the engineering work for our “1.0” release of VS Code. However, with all of the excitement around [//Build](https://build.microsoft.com/), we've decided to take this opportunity to hold back our "1.0" release for just a couple of weeks, to get some more community testing on the product. Our “Insiders” release has been updated to match what we plan to ship in mid April. We encourage you to [download it today](http://code.visualstudio.com/insiders?wt.mc_id=DX_835018&utm_source=blogs&utm_medium=ms%20editorial&utm_campaign=GH%20Roadmap%201-0%20Update) ([release notes](https://github.com/Microsoft/vscode-docs/blob/vnext/release-notes/latest.md)), use it, and let us know if you find any critical ship stopping issues. In the meantime we're going to finish up work on the [1.0 documentation](https://github.com/Microsoft/vscode-docs/tree/vnext/docs), clean up debt, unwind a bit, and start planning the future of Visual Studio Code.

----

## Declare General Availability ("GA")
* Accessibility
* Localization
* Stable APIs
* Performance

## Eliminate Adoption Blockers
### Core Editing
* Code folding
* Providing key bindings for users used to other editors, support VIM extension authors
* Improve the document management, stacking behaviour of editors

## Address Development Pain Points
### Workbench
* Support horizontal layout for output (debug output, task output)

### Tasks
* Support running multiple tasks
* Improve support for continously running `watching` tasks

### Extensions
* Improve in product extension selection performance
* Improve extension discovery and acquisition experience, looking across website/marketplace and product

### Debug
* Support conditional break points
* Support remote debugging (e.g. attach to Node app running in Docker container locally or on Linux)
* Support additional debug architectures (e.g. xdebug for PHP, C# debugging)

### JavaScript
* Improved Intellisense in JavaScript, migrate to [Salsa](https://github.com/Microsoft/TypeScript/issues/4789)
* Improve the support for JSX (Salsa enables this)

### C&#35;
* Move into a separate extension
* Debugging support (collaboration with the CoreCLR team) :heart:
