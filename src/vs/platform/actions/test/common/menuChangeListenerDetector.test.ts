/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MenuRegistry } from '../../common/actions.js';
import { menuChangeListenerDetector } from './menuChangeListenerDetector.js';

suite('Menu change listener detector', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports listeners added and not removed', () => {
		const before = menuChangeListenerDetector.snapshot();
		const listener = MenuRegistry.onDidChangeMenu(() => { });
		const findings = menuChangeListenerDetector.check(before);
		listener.dispose();
		assert.deepStrictEqual({ findings, restored: menuChangeListenerDetector.check(before) }, {
			findings: ['left 1 MenuRegistry.onDidChangeMenu listener(s), from menus that were not disposed'],
			restored: [],
		});
	});
});
