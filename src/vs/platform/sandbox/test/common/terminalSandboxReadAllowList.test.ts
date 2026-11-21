/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getTerminalSandboxReadAllowListForCommands } from '../../common/terminalSandboxReadAllowList.js';

suite('TerminalSandboxReadAllowList', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('restricts Ruby read access to installed gems', () => {
		const expectedPaths = [
			'~/.gem/ruby',
			'~/.rbenv/versions',
			'~/.rbenv/shims',
			'~/.rvm/rubies',
		];

		for (const os of [OperatingSystem.Linux, OperatingSystem.Macintosh]) {
			for (const keyword of ['ruby', 'gem', 'bundle', 'bundler', 'rake', 'rbenv', 'rvm']) {
				deepStrictEqual(getTerminalSandboxReadAllowListForCommands(os, [keyword]), expectedPaths);
			}
		}
	});
});
