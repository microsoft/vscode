/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SandboxHelperService } from '../../node/sandboxHelper.js';

suite('SandboxHelperService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('does not inspect sandbox dependencies on non-Linux platforms', async () => {
		let findCalled = false;
		const result = await SandboxHelperService.checkSandboxDependenciesWith(async () => {
			findCalled = true;
			return undefined;
		}, false);

		strictEqual(result, undefined);
		strictEqual(findCalled, false);
	});

	test('reports missing bubblewrap without running its capability probe', async () => {
		let probeCalled = false;
		const result = await SandboxHelperService.checkSandboxDependenciesWith(
			async command => command === 'socat' ? '/usr/bin/socat' : undefined,
			true,
			async () => {
				probeCalled = true;
				return { usable: true };
			},
		);

		strictEqual(probeCalled, false);
		strictEqual(result?.bubblewrapInstalled, false);
		strictEqual(result?.bubblewrapUsable, false);
		strictEqual(result?.socatInstalled, true);
	});

	test('reports bubblewrap usable when its capability probe succeeds', async () => {
		let probedCommand: string | undefined;
		let releaseInfoRead = false;
		const result = await SandboxHelperService.checkSandboxDependenciesWith(
			async command => `/usr/bin/${command}`,
			true,
			async command => {
				probedCommand = command;
				return { usable: true };
			},
			async () => {
				releaseInfoRead = true;
				return { id: 'ubuntu', version_id: '24.04' };
			},
		);

		strictEqual(probedCommand, '/usr/bin/bwrap');
		strictEqual(releaseInfoRead, false);
		deepStrictEqual(result, {
			bubblewrapInstalled: true,
			bubblewrapUsable: true,
			bubblewrapError: undefined,
			supportsUbuntuAppArmorRemediation: false,
			socatInstalled: true,
		});
	});

	test('reports AppArmor remediation support when bubblewrap fails on Ubuntu 24.04', async () => {
		const result = await SandboxHelperService.checkSandboxDependenciesWith(
			async command => `/usr/bin/${command}`,
			true,
			async () => ({ usable: false, error: 'No permissions to create namespace' }),
			async () => ({ id: 'ubuntu', version_id: '24.04' }),
		);

		deepStrictEqual(result, {
			bubblewrapInstalled: true,
			bubblewrapUsable: false,
			bubblewrapError: 'No permissions to create namespace',
			supportsUbuntuAppArmorRemediation: true,
			socatInstalled: true,
		});
	});

	test('does not report AppArmor remediation support when bubblewrap fails on Ubuntu 22.04', async () => {
		const result = await SandboxHelperService.checkSandboxDependenciesWith(
			async command => `/usr/bin/${command}`,
			true,
			async () => ({ usable: false, error: 'No permissions to create namespace' }),
			async () => ({ id: 'ubuntu', version_id: '22.04' }),
		);

		strictEqual(result?.bubblewrapUsable, false);
		strictEqual(result?.supportsUbuntuAppArmorRemediation, false);
	});
});
