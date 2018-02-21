# Node npm

This extension supports running npm scripts defined in the `package.json` as [tasks](https://code.visualstudio.com/docs/editor/tasks). Scripts with the name 'build', 'compile', or 'watch'
are treated as build tasks.

To run scripts as tasks you use the `Tasks` menu.

## Settings
- `npm.autoDetect` enable detecting scripts as tasks, the default is `on`.
- `npm.runSilent` run npm script with the `--silent` option, the default is `false`.
- `npm.packageManager` the package manager used to run the scripts: `npm` or `yarn`, the default is `npm`.
