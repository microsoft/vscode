/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { getRepositoryFromUrl } from '../util.js';

suite('github util', function () {
	test('getRepositoryFromUrl parses GitHub remote URLs', function () {
		const expected = { owner: 'microsoft', repo: 'vscode' };

		assert.deepStrictEqual(getRepositoryFromUrl('https://github.com/microsoft/vscode.git'), expected);
		assert.deepStrictEqual(getRepositoryFromUrl('git@github.com:microsoft/vscode.git'), expected);
		assert.deepStrictEqual(getRepositoryFromUrl('org-12345@github.com:microsoft/vscode.git'), expected);
		assert.strictEqual(getRepositoryFromUrl('git@gitlab.com:microsoft/vscode.git'), undefined);
	});
});
