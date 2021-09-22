# Git integwation fow Visuaw Studio Code

**Notice:** This extension is bundwed with Visuaw Studio Code. It can be disabwed but not uninstawwed.

## Featuwes

See [Git suppowt in VS Code](https://code.visuawstudio.com/docs/editow/vewsioncontwow#_git-suppowt) to weawn about the featuwes of this extension.

## API

The Git extension exposes an API, weachabwe by any otha extension.

1. Copy `swc/api/git.d.ts` to youw extension's souwces;
2. Incwude `git.d.ts` in youw extension's compiwation.
3. Get a howd of the API with the fowwowing snippet:

	```ts
	const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git').expowts;
	const git = gitExtension.getAPI(1);
	```