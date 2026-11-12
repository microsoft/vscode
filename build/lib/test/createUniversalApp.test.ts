/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createRequire } from 'module';
import { suite, test } from 'node:test';
import { DARWIN_UNIVERSAL_SINGLE_ARCH_FILES } from '../../darwin/create-universal-app.ts';

// The minimatch that vscode-universal-bundler checks its allowlists with, called the way it does.
const require = createRequire(require_resolve('vscode-universal-bundler/package.json'));
const { minimatch } = require('minimatch') as { minimatch: (path: string, pattern: string, options?: { matchBase?: boolean }) => boolean };
const isSingleArchFile = (file: string) => minimatch(file, DARWIN_UNIVERSAL_SINGLE_ARCH_FILES, { matchBase: true });

function require_resolve(id: string): string {
	return createRequire(import.meta.url).resolve(id);
}

suite('create-universal-app', () => {

	test('allows the Copilot SDK plugin dot files of one arch in the merged ASAR', () => {
		for (const arch of ['x64', 'arm64']) {
			for (const file of [
				'.mcp.json',
				'.release-target',
				'.plugin',
				'.plugin/plugin.json',
			]) {
				assert.ok(isSingleArchFile(`@github/copilot-sdk-darwin-${arch}/plugins/browser-use/${file}`), `${arch}: ${file}`);
			}
			assert.ok(isSingleArchFile(`@github/copilot-sdk-darwin-${arch}/plugins/browser-use/dist/browser-mcp.cjs`));
		}
	});

	test('does not allow dot files outside of the Copilot SDK platform packages', () => {
		for (const file of [
			'@github/copilot/plugins/browser-use/.mcp.json',
			'@github/copilot-sdk/plugins/browser-use/.mcp.json',
			'some-package/.mcp.json',
			'some-package/.plugin/plugin.json',
		]) {
			assert.strictEqual(isSingleArchFile(file), false, file);
		}
	});
});