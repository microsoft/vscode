# Node npm

**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.

## Features

### Task Running

This extension supports running npm scripts defined in the `package.json` as [tasks](https://code.visualstudio.com/docs/editor/tasks). Scripts with the name 'build', 'compile', or 'watch'
are treated as build tasks.

To run scripts as tasks, use the **Tasks** menu.

For more information about auto detection of Tasks, see the [documentation](https://code.visualstudio.com/Docs/editor/tasks#_task-autodetection).

### Script Explorer

The Npm Script Explorer shows the npm scripts found in your workspace. The explorer view is enabled by the setting `npm.enableScriptExplorer`. A script can be opened, run, or debug from the explorer.

### Run Scripts from the Editor

The extension supports to run the selected script as a task when editing the `package.json`file. You can either run a script from
the hover shown on a script or using the command `Run Selected Npm Script`.

### Run Scripts from a Folder in the Explorer

The extension supports running a script as a task from a folder in the Explorer. The command  `Run NPM Script in Folder...` shown in the Explorer context menu finds all scripts in `package.json` files that are contained in this folder. You can then select the script to be executed as a task from the resulting list. You enable this support with the `npm.runScriptFromFolder` which is `false` by default.

### Others

The extension fetches data from <https://registry.npmjs.org> and <https://registry.bower.io> to provide auto-completion and information on hover features on npm dependencies.

## Settings

- `npm.autoDetect` - Enable detecting scripts as tasks, the default is `on`.
- `npm.runSilent` - Run npm script with the `--silent` option, the default is `false`.
- `npm.packageManager` - The package manager used to install dependencies: `auto`, `npm`, `yarn`, `pnpm` or `bun`. The default is `auto`, which detects your package manager based on files in your workspace.
- `npm.scriptRunner` - The script runner used to run the scripts: `auto`, `npm`, `yarn`, `pnpm`, `bun` or `node`. The default is `auto`, which detects your script runner based on files in your workspace.
- `npm.exclude` - Glob patterns for folders that should be excluded from automatic script detection. The pattern is matched against the **absolute path** of the package.json. For example, to exclude all test folders use '&ast;&ast;/test/&ast;&ast;'.
- `npm.enableScriptExplorer` - Enable an explorer view for npm scripts.
- `npm.scriptExplorerAction` - The default click action: `open` or `run`, the default is `open`.
- `npm.enableRunFromFolder` - Enable running npm scripts from the context menu of folders in Explorer, the default is `false`.
- `npm.scriptCodeLens.enable` - Enable/disable the code lenses to run a script, the default is `false`.

## Example Configuration

Here are some common configuration examples for your `settings.json`:

### Use Yarn as Default Package Manager

```json
{
  "npm.packageManager": "yarn",
  "npm.scriptRunner": "yarn"
}
```

### Enable Script Explorer and Code Lens

```json
{
  "npm.enableScriptExplorer": true,
  "npm.scriptCodeLens.enable": true,
  "npm.scriptExplorerAction": "run"
}
```

### Run Scripts Silently and Exclude Test Folders

```json
{
  "npm.runSilent": true,
  "npm.exclude": "**/test/**"
}
```

### Enable Run from Folder Feature

```json
{
  "npm.enableRunFromFolder": true
}
```

### Multi-Package Manager Setup

For monorepos or projects with multiple package managers:

```json
{
  "npm.packageManager": "auto",
  "npm.scriptRunner": "auto"
}
```

This will automatically detect whether to use npm, yarn, pnpm, or bun based on lock files in your workspace.

## Troubleshooting

### Scripts Not Detected

If your npm scripts are not being detected:

1. Ensure `npm.autoDetect` is set to `on`
2. Check if your workspace folders are excluded by the `npm.exclude` pattern
3. Verify your `package.json` is valid JSON
4. Reload the window: **Developer: Reload Window**

### Wrong Package Manager Used

If VS Code is using the wrong package manager:

1. Set `npm.packageManager` explicitly to `npm`, `yarn`, `pnpm`, or `bun`
2. Ensure the corresponding lock file exists (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, or `bun.lockb`)

### Script Explorer Not Visible

1. Enable it with `"npm.enableScriptExplorer": true`
2. Reload the window
3. Check if you have a valid `package.json` with scripts defined
