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
		const result = await SandboxHelperService.checkSandboxDependenciesWith(
			async command => `/usr/bin/${command}`,
			true,
			async command => {
				probedCommand = command;
				return { usable: true };
			},
		);

		strictEqual(probedCommand, '/usr/bin/bwrap');
		deepStrictEqual(result, {
			bubblewrapInstalled: true,
			bubblewrapUsable: true,
			bubblewrapError: undefined,
			socatInstalled: true,
			dependencyInstallCommand: undefined,
		});
	});

	test('reports the probe error when bubblewrap is unusable', async () => {
		const result = await SandboxHelperService.checkSandboxDependenciesWith(
			async command => `/usr/bin/${command}`,
			true,
			async () => ({ usable: false, error: 'No permissions to create namespace' }),
		);

		deepStrictEqual(result, {
			bubblewrapInstalled: true,
			bubblewrapUsable: false,
			bubblewrapError: 'No permissions to create namespace',
			socatInstalled: true,
			dependencyInstallCommand: undefined,
		});
	});

	for (const [distributionId, packageManager, expectedCommand] of [
		['debian', 'apt-get', 'sudo apt-get install -y'],
		['ubuntu', 'apt', 'sudo apt install -y'],
		['fedora', 'dnf', 'sudo dnf install -y'],
		['centos', 'yum', 'sudo yum install -y'],
		['arch', 'pacman', 'sudo pacman -S --needed --noconfirm'],
		['opensuse', 'zypper', 'sudo zypper --non-interactive install'],
		['alpine', 'apk', 'sudo apk add'],
	] as const) {
		test(`detects ${packageManager} for dependency installation`, async () => {
			const result = await SandboxHelperService.checkSandboxDependenciesWith(
				async command => command === 'socat' || command === 'sudo' || command === packageManager ? `/usr/bin/${command}` : undefined,
				true,
				undefined,
				async () => ({ distributionIds: [distributionId], isRoot: false }),
			);

			strictEqual(result?.dependencyInstallCommand, expectedCommand);
		});
	}

	test('uses ID_LIKE to detect a derivative distribution', async () => {
		const result = await SandboxHelperService.checkSandboxDependenciesWith(
			async command => ['socat', 'sudo', 'dnf'].includes(command) ? `/usr/bin/${command}` : undefined,
			true,
			undefined,
			async () => ({ distributionIds: ['custom-linux', 'fedora'], isRoot: false }),
		);

		strictEqual(result?.dependencyInstallCommand, 'sudo dnf install -y');
	});

	test('uses the native package manager when multiple managers are available', async () => {
		const result = await SandboxHelperService.checkSandboxDependenciesWith(
			async command => ['socat', 'sudo', 'apt-get', 'pacman'].includes(command) ? `/usr/bin/${command}` : undefined,
			true,
			undefined,
			async () => ({ distributionIds: ['arch'], isRoot: false }),
		);

		strictEqual(result?.dependencyInstallCommand, 'sudo pacman -S --needed --noconfirm');
	});

	test('does not use sudo when running as root', async () => {
		const result = await SandboxHelperService.checkSandboxDependenciesWith(
			async command => ['socat', 'apk'].includes(command) ? `/usr/bin/${command}` : undefined,
			true,
			undefined,
			async () => ({ distributionIds: ['alpine'], isRoot: true }),
		);

		strictEqual(result?.dependencyInstallCommand, 'apk add');
	});

	test('does not offer dependency installation to a non-root user without sudo', async () => {
		const result = await SandboxHelperService.checkSandboxDependenciesWith(
			async command => ['socat', 'pacman'].includes(command) ? `/usr/bin/${command}` : undefined,
			true,
			undefined,
			async () => ({ distributionIds: ['arch'], isRoot: false }),
		);

		strictEqual(result?.dependencyInstallCommand, undefined);
	});

	test('does not offer dependency installation without a supported package manager', async () => {
		const result = await SandboxHelperService.checkSandboxDependenciesWith(
			async command => command === 'socat' ? '/usr/bin/socat' : undefined,
			true,
			undefined,
			async () => ({ distributionIds: ['unknown'], isRoot: false }),
		);

		strictEqual(result?.dependencyInstallCommand, undefined);
	});
});
