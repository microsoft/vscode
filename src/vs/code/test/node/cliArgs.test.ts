/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { combineUriFlags } from '../../node/cliArgs.js';

suite('combineUriFlags', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('rewrites --folder-uri and --file-uri followed by a URI into --flag=value', () => {
		assert.deepStrictEqual(
			combineUriFlags([
				'--wait',
				'--folder-uri', 'vscode-remote://ssh-remote+host/workspace',
				'--file-uri', 'vscode-remote://ssh-remote+host/file.txt',
				'--new-window',
				'--folder-uri=vscode-remote://already-joined/workspace',
				'--folder-uri', // trailing flag with no value
			]),
			[
				'--wait',
				'--folder-uri=vscode-remote://ssh-remote+host/workspace',
				'--file-uri=vscode-remote://ssh-remote+host/file.txt',
				'--new-window',
				'--folder-uri=vscode-remote://already-joined/workspace',
				'--folder-uri',
			]
		);
	});

	test('does not join when next argument is a flag', () => {
		assert.deepStrictEqual(
			combineUriFlags(['--folder-uri', '--wait', 'somepath']),
			['--folder-uri', '--wait', 'somepath']
		);
	});

	test('leaves unrelated arguments untouched', () => {
		assert.deepStrictEqual(
			combineUriFlags(['--wait', '--new-window', 'C:\\some\\path']),
			['--wait', '--new-window', 'C:\\some\\path']
		);
	});

	test('does not rewrite past the -- end-of-options marker', () => {
		assert.deepStrictEqual(
			combineUriFlags([
				'--wait',
				'--folder-uri', 'vscode-remote://host/before',
				'--',
				'--folder-uri', 'vscode-remote://host/after',
				'--file-uri', 'vscode-remote://host/file.txt',
			]),
			[
				'--wait',
				'--folder-uri=vscode-remote://host/before',
				'--',
				'--folder-uri', 'vscode-remote://host/after',
				'--file-uri', 'vscode-remote://host/file.txt',
			]
		);
	});
});
