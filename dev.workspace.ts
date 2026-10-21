/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { command, computation, defineProject, output, projectInput, service, sourceTree, watch } from '@vscode/dev-workspace';

const runtimeInfo = command({
	executable: process.execPath,
	args: ['-e', 'console.log(JSON.stringify({node:process.version,cwd:process.cwd()},null,2))'],
});

const install = computation({
	derivation: {
		recipe: 'vscode-install-fast-v1',
		inputs: { manifest: sourceTree('package.json'), lock: sourceTree('package-lock.json'), installer: sourceTree('build/npm') },
	},
	command: { kind: 'process', executable: process.execPath, args: ['build/npm/fast-install.ts'] },
});
const bootstrap = computation({
	derivation: { recipe: 'vscode-build-fast-v1', inputs: { install: output(install), build: sourceTree('build/next') } },
	command: { kind: 'process', executable: 'npm', args: ['run', 'build-fast'] },
});
const electron = computation({
	derivation: { recipe: 'vscode-electron-v1', inputs: { install: output(install), version: sourceTree('.npmrc'), product: sourceTree('product.json') } },
	command: { kind: 'process', executable: 'npm', args: ['run', 'electron'] },
});
const coreBuild = computation({
	derivation: { recipe: 'vscode-core-v1', inputs: { bootstrap: output(bootstrap), source: sourceTree('src') } },
	command: { kind: 'process', executable: process.execPath, args: ['build/next/index.ts', 'transpile'] },
	output: { kind: 'mutable', path: 'out' },
});
const coreWatch = watch(coreBuild, {
	command: { kind: 'process', executable: process.execPath, args: ['build/next/index.ts', 'transpile', '--watch', '--incremental'] },
	contract: {
		id: 'vscode-transpile-v1', reactionMs: 1000,
		start: 'Starting transpilation', success: 'Finished transpilation with 0 errors', failure: 'Finished transpilation with [1-9][0-9]* errors',
	},
});
const extensionsBuild = computation({
	derivation: {
		recipe: 'vscode-markdown-extension-v1',
		inputs: {
			bootstrap: output(bootstrap), source: sourceTree('extensions/markdown-language-features/src'),
			build: sourceTree('build/gulpfile.extensions.ts'),
		},
	},
	command: { kind: 'process', executable: 'npm', args: ['run', 'gulp', 'compile-extension:markdown-language-features'] },
});
const extensionsWatch = watch(extensionsBuild, {
	command: { kind: 'process', executable: 'npm', args: ['run', 'gulp', 'watch-extension:markdown-language-features'], env: { DEV_WORKSPACE_BUILD_EVENTS: '1' } },
	contract: {
		id: 'vscode-extension-events-v1', reactionMs: 1000,
		start: 'DEV_WORKSPACE_BUILD_START', success: 'DEV_WORKSPACE_BUILD_DONE', failure: 'DEV_WORKSPACE_BUILD_FAILED',
	},
	restartOn: ['build'],
});
function markdownMedia(id: string, script: string, source: string, folder: string) {
	const isEditor = id === 'editor';
	const command = isEditor
		? { kind: 'process' as const, executable: process.execPath, args: ['dev-workspace/markdown.mts'] }
		: { kind: 'process' as const, executable: process.execPath, args: [script], cwd: 'extensions/markdown-language-features' };
	const build = computation({
		derivation: {
			recipe: `vscode-markdown-${id}-v1`,
			inputs: {
				bootstrap: output(bootstrap), source: sourceTree(`extensions/markdown-language-features/${source}`),
				script: sourceTree(`extensions/markdown-language-features/${script}`),
				runner: sourceTree('extensions/esbuild-common.mts'),
				...(isEditor ? {
					packageOverride: projectInput('markdownEditorPath', {
						type: 'optionalString', default: null,
						description: 'Local @vscode/markdown-editor package directory, or null for the installed dependency.',
					}),
					adapter: sourceTree('dev-workspace/markdown.mts'),
					packageResolver: sourceTree('extensions/markdown-language-features/scripts/markdownEditorPackage.mts'),
					manifestGenerator: sourceTree('extensions/markdown-language-features/scripts/updateMarkdownEditorPackageJson.mts'),
				} : {}),
			},
		},
		command,
		output: { kind: 'mutable' as const, path: `extensions/markdown-language-features/${folder}` },
	});
	const watching = watch(build, {
		command: {
			...command, args: [...command.args, '--watch'],
			env: { DEV_WORKSPACE_BUILD_EVENTS: '1' },
		},
		contract: {
			id: `vscode-markdown-${id}-v1`, reactionMs: 1000,
			start: 'DEV_WORKSPACE_BUILD_START', success: 'DEV_WORKSPACE_BUILD_DONE', failure: 'DEV_WORKSPACE_BUILD_FAILED',
		},
		restartOn: ['script', 'runner', ...(isEditor ? ['adapter', 'packageResolver', 'manifestGenerator'] : [])],
	});
	return { build, watching };
}
const editor = markdownMedia('editor', 'esbuild.markdownEditor.mts', 'markdown-editor-src', 'markdown-editor-out');
const preview = markdownMedia('preview', 'esbuild.webview.mts', 'preview-src', 'media');
const notebook = markdownMedia('notebook', 'esbuild.notebook.mts', 'notebook', 'notebook-out');
const codeOss = service({
	executable: process.execPath,
	args: ['dev-workspace/codeoss.mts'],
	dependencies: [electron, coreWatch, extensionsWatch, editor.watching, preview.watching, notebook.watching],
	derivation: {
		recipe: 'vscode-managed-codeoss-v1',
		inputs: { adapter: sourceTree('dev-workspace/codeoss.mts'), launcher: sourceTree('dev-workspace/launcher') },
	},
	update: 'keep',
	ready: { message: true, timeoutMs: 120_000 },
});

export default defineProject({
	name: 'VS Code Markdown development',
	nodes: {
		runtimeInfo, install, bootstrap, electron, coreBuild, coreWatch, extensionsBuild, extensionsWatch,
		markdownEditorBuild: editor.build, markdownEditorWatch: editor.watching,
		markdownPreviewBuild: preview.build, markdownPreviewWatch: preview.watching,
		markdownNotebookBuild: notebook.build, markdownNotebookWatch: notebook.watching,
		codeOss,
	},
});
