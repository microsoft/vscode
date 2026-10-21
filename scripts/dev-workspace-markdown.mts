/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const inputs: unknown = JSON.parse(process.env.DEV_WORKSPACE_INPUTS ?? '{}');
if (!inputs || typeof inputs !== 'object' || !('packageOverride' in inputs)
	|| !inputs.packageOverride || typeof inputs.packageOverride !== 'object' || !('value' in inputs.packageOverride)) {
	throw new Error('Missing packageOverride workspace input.');
}
const override = inputs.packageOverride.value;
if (override === null) {
	delete process.env.VSCODE_MARKDOWN_EDITOR_PATH;
} else if (typeof override === 'string') {
	process.env.VSCODE_MARKDOWN_EDITOR_PATH = resolve(override);
} else {
	throw new Error('Expected packageOverride to be a local package directory or null.');
}
const script = resolve('extensions/markdown-language-features/esbuild.markdownEditor.mts');
process.chdir(resolve('extensions/markdown-language-features'));
await import(pathToFileURL(script).href);
