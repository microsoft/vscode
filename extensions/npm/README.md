# Node npm

**Notice** This is a an extension that is bundled with Visual Studio Code. 

This extension supports running npm scripts defined in the `package.json` as [tasks](https://code.visualstudio.com/docs/editor/tasks). Scripts with the name 'build', 'compile', or 'watch'
are treated as build tasks.

To run scripts as tasks you use the `Tasks` menu.

For more information about auto detection of Tasks pls see the [documentation](https://code.visualstudio.com/Docs/editor/tasks#_task-autodetection).

## Settings
- `npm.autoDetect` enable detecting scripts as tasks, the default is `on`.
- `npm.runSilent` run npm script with the `--silent` option, the default is `false`.
- `npm.packageManager` the package manager used to run the scripts: `npm` or `yarn`, the default is `npm`.
- `npm.exclude` glob patterns for folders that should be excluded from automatic script detection. The pattern is matched against the **absolute path** of the package.json. For example, to exclude all test folders use '&ast;&ast;/test/&ast;&ast;'.
