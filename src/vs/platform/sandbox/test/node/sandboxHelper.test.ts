/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SandboxHelperService } from '../../node/sandboxHelper.js';

suite('SandboxHelper', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports when both dependencies are installed', async () => {
		const status = await SandboxHelperService.checkSandboxDependenciesWith(async command => command === 'bwrap' || command === 'socat' ? `/usr/bin/${command}` : undefined);

		strictEqual(status?.bubblewrapInstalled, true);
		strictEqual(status?.socatInstalled, true);
	});

	test('reports missing dependencies independently', async () => {
		const status = await SandboxHelperService.checkSandboxDependenciesWith(async command => command === 'socat' ? '/usr/bin/socat' : undefined);

		strictEqual(status?.bubblewrapInstalled, false);
		strictEqual(status?.socatInstalled, true);
	});

	test('skips dependency checks on non-linux platforms', async () => {
		let callCount = 0;
		const status = await SandboxHelperService.checkSandboxDependenciesWith(async () => {
			callCount++;
			return undefined;
		}, false);

		strictEqual(callCount, 0);
		strictEqual(status, undefined);
	});
});
