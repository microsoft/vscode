/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindowsTerminalEncoding } from '../../node/terminalEncoding.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('Terminal Encoding', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getWindowsTerminalEncoding', () => {
		const outputs = [
			'Active code page: 437\r\n',
			'Active code page: 932\r\n',
			'Active code page: 936\r\n',
			'Active code page: 949\r\n',
			'Active code page: 950\r\n',
			'Active code page: 65001\r\n',
		];
		assert.deepStrictEqual(outputs.map(getWindowsTerminalEncoding), [
			'cp437',
			'cp932',
			'cp936',
			'cp949',
			'cp950',
			undefined,
		]);
	});
});
