/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { chunkInput } from 'vs/platform/terminal/common/terminalProcess';

suite('platform - terminalProcess', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	suite('chunkInput', () => {
		test('single chunk', () => {
			deepStrictEqual(chunkInput('foo bar'), ['foo bar']);
		});
		test('multi chunk', () => {
			deepStrictEqual(chunkInput('foo'.repeat(50)), [
				'foofoofoofoofoofoofoofoofoofoofoofoofoofoofoofoofo',
				'ofoofoofoofoofoofoofoofoofoofoofoofoofoofoofoofoof',
				'oofoofoofoofoofoofoofoofoofoofoofoofoofoofoofoofoo'
			]);
		});
		test('small data with escapes', () => {
			deepStrictEqual(chunkInput('foo \x1b[30mbar'), [
				'foo ',
				'\x1b[30mbar'
			]);
		});
		test('large data with escapes', () => {
			deepStrictEqual(chunkInput('foofoofoofoo\x1b[30mbarbarbarbarbar\x1b[0m'.repeat(3)), [
				'foofoofoofoo',
				'\x1B[30mbarbarbarbarbar',
				'\x1B[0mfoofoofoofoo',
				'\x1B[30mbarbarbarbarbar',
				'\x1B[0mfoofoofoofoo',
				'\x1B[30mbarbarbarbarbar',
				'\x1B[0m'
			]);
		});
	});
});
