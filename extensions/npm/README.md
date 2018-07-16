# Node npm

**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.

## Features

This extension supports running npm scripts defined in the `package.json` as [tasks](https://code.visualstudio.com/docs/editor/tasks). Scripts with the name 'build', 'compile', or 'watch'
are treated as build tasks.

To run scripts as tasks, use the **Tasks** menu.

For more information about auto detection of Tasks, see the [documentation](https://code.visualstudio.com/Docs/editor/tasks#_task-autodetection).

## Settings

- `npm.autoDetect` - Enable detecting scripts as tasks, the default is `on`.
- `npm.runSilent` - Run npm script with the `--silent` option, the default is `false`.
- `npm.packageManager` - The package manager used to run the scripts: `npm` or `yarn`, the default is `npm`.
- `npm.exclude` - Glob patterns for folders that should be excluded from automatic script detection. The pattern is matched against the **absolute path** of the package.json. For example, to exclude all test folders use '&ast;&ast;/test/&ast;&ast;'.
- `npm.enableScriptExplorer` - Enable an explorer view for npm scripts.
- `npm.scriptExplorerAction` - The default click action: `open` or `run`, the default is `open`.
