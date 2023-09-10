# Git static contributions and remote repository picker

**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.

## Features

Git static contributions and remote repository picker.

## API

The Git extension exposes an API, reachable by any other extension.

1. Copy `src/api/git-base.d.ts` to your extension's sources;
2. Include `git-base.d.ts` in your extension's compilation.
3. Get a hold of the API with the following snippet:

	```ts
	const gitBaseExtension = vscode.extensions.getExtension<GitBaseExtension>('vscode.git-base').exports;
	const git = gitBaseExtension.getAPI(1);
	```
