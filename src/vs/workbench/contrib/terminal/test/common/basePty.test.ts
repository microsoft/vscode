/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BasePty } from '../../common/basePty.js';

class TestBasePty extends BasePty {
	get properties() {
		return this._properties;
	}
}

suite('BasePty', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('initializes ownership as undefined without changing process defaults', () => {
		const pty = store.add(new TestBasePty(1, true));

		deepStrictEqual(pty.properties, {
			chatOwner: undefined,
			sessionOwner: undefined,
			cwd: '',
			initialCwd: '',
			fixedDimensions: { cols: undefined, rows: undefined },
			title: '',
			shellType: undefined,
			hasChildProcesses: true,
			resolvedShellLaunchConfig: {},
			overrideDimensions: undefined,
			failedShellIntegrationActivation: false,
			usedShellIntegrationInjection: undefined,
			shellIntegrationInjectionFailureReason: undefined,
		});
	});
});
