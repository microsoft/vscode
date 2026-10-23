/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

export async function resolveMarkdownEditorPackage(): Promise<{ readonly directory?: string; readonly commandsUrl: string }> {
	const override = process.env.VSCODE_MARKDOWN_EDITOR_PATH;
	if (override === undefined) {
		return { commandsUrl: import.meta.resolve('@vscode/markdown-editor/commands') };
	}
	if (!override.trim()) {
		throw new Error('VSCODE_MARKDOWN_EDITOR_PATH must be a nonempty package directory.');
	}
	const directory = await realpath(resolve(override));
	const manifest: unknown = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
	if (!manifest || typeof manifest !== 'object' || !('name' in manifest) || manifest.name !== '@vscode/markdown-editor') {
		throw new Error(`Not a Markdown editor package: ${directory}`);
	}
	if (!('exports' in manifest) || !manifest.exports || typeof manifest.exports !== 'object' || Array.isArray(manifest.exports)) {
		throw new Error(`Markdown editor package must declare exports for package self-reference: ${directory}`);
	}
	let commands: esbuild.ResolveResult | undefined;
	await esbuild.build({
		stdin: { contents: '' }, write: false, logLevel: 'silent',
		plugins: [{
			name: 'resolve-markdown-editor-commands',
			setup(build) {
				build.onStart(async () => {
					commands = await build.resolve('@vscode/markdown-editor/commands', { resolveDir: directory, kind: 'import-statement' });
					return { errors: commands.errors, warnings: commands.warnings };
				});
			},
		}],
	});
	if (!commands?.path) {
		throw new Error(`Cannot resolve the Markdown editor commands export from ${directory}. Build the package first.`);
	}
	return { directory, commandsUrl: pathToFileURL(commands.path).href };
}

export function markdownEditorOverridePlugin(directory: string): esbuild.Plugin {
	return {
		name: 'markdown-editor-package-override',
		setup(build) {
			build.onResolve({ filter: /^@vscode\/markdown-editor(?:\/|$)/ }, args => {
				if (args.resolveDir === directory) {
					return;
				}
				return build.resolve(args.path, { resolveDir: directory, kind: args.kind });
			});
		},
	};
}
