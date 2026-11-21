/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { getRepositoryFromUrl } from '../util.js';

suite('github util', function () {

	test('getRepositoryFromUrl', function () {
		const urls = [
			'https://github.com/microsoft/vscode',
			'https://github.com/microsoft/vscode.git',
			'https://user@github.com/microsoft/vscode.git',
			'https://user:token@github.com/microsoft/vscode.git',
			'git@github.com:microsoft/vscode.git',
			'ssh://git@github.com/microsoft/vscode.git',
			'https://gitlab.com/microsoft/vscode.git',
			'https://github.com@example.com/microsoft/vscode.git',
			'https://github.com.example.com/microsoft/vscode.git',
			'git@example.com:microsoft/vscode.git',
		];

		assert.deepStrictEqual(urls.map(url => getRepositoryFromUrl(url)), [
			{ owner: 'microsoft', repo: 'vscode' },
			{ owner: 'microsoft', repo: 'vscode' },
			{ owner: 'microsoft', repo: 'vscode' },
			{ owner: 'microsoft', repo: 'vscode' },
			{ owner: 'microsoft', repo: 'vscode' },
			{ owner: 'microsoft', repo: 'vscode' },
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	});
});
