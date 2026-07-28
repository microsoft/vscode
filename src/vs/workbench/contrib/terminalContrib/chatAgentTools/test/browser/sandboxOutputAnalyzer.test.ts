/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { outputLooksSandboxBlocked, outputLooksSandboxNetworkBlocked, SandboxOutputAnalyzer } from '../../browser/tools/sandboxOutputAnalyzer.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';

suite('SandboxOutputAnalyzer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let analyzer: SandboxOutputAnalyzer;
	let configurationService: TestConfigurationService;

	setup(() => {
		const instantiationService: TestInstantiationService = workbenchInstantiationService(undefined, store);
		configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ITerminalSandboxService, {
			_serviceBrand: undefined,
			getOS: async () => OperatingSystem.Linux,
		} as unknown as ITerminalSandboxService);
		analyzer = store.add(instantiationService.createInstance(SandboxOutputAnalyzer));
	});

	test('leaves network retry selection to the model', async () => {
		const guidance = await analyzer.analyze({
			exitCode: 1,
			exitResult: '/bin/bash: /tmp/test.txt: Operation not permitted',
			commandLine: 'echo test > /tmp/test.txt',
			isSandboxWrapped: true,
		});

		ok(guidance?.includes('If you determine from the output that the failure was caused by blocked network access'));
		ok(guidance?.includes('If it is not a network restriction, or the command still fails after retrying with requestAllowNetwork=true'));
	});

	test('does not recommend allow-network requests when per-command network access is disabled', async () => {
		configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, false);

		const guidance = await analyzer.analyze({
			exitCode: 1,
			exitResult: 'connect: Operation not permitted',
			commandLine: 'curl https://example.com',
			isSandboxWrapped: true,
		});

		ok(guidance?.includes('chat.agent.sandbox.retryWithAllowNetworkRequests'));
		ok(guidance?.includes('Do not set requestAllowNetwork=true'));
	});

	test('recommends unsandboxed execution for sandboxed missing file failures', async () => {
		const guidance = await analyzer.analyze({
			exitCode: 1,
			exitResult: '/bin/bash: /tmp/test.txt: No such file or directory',
			commandLine: 'cat /tmp/test.txt',
			isSandboxWrapped: true,
		});

		ok(guidance?.includes('No such file or directory'));
		ok(guidance?.includes('treat it as a sandbox access error'));
		ok(guidance?.includes('requestUnsandboxedExecution=true'));
	});
});

suite('outputLooksSandboxBlocked', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const positives: [string, string][] = [
		['macOS sandbox file write', '/bin/bash: /tmp/test.txt: Operation not permitted'],
		['Linux sandbox file write', '/usr/bin/bash: /tmp/test.txt: Read-only file system'],
		['Permission denied', 'bash: ./script.sh: Permission denied'],
		['sandbox-exec reference', 'sandbox-exec: some error occurred'],
		['bwrap reference', 'bwrap: error setting up namespace'],
		['sandbox_violation', 'sandbox_violation: deny(1) file-write-create /tmp/foo'],
		['missing file in sandbox', 'Error: ENOENT: no such file or directory'],
		['case insensitive', '/bin/bash: OPERATION NOT PERMITTED'],
		['wrapped across lines', '/bin/bash: Operation not\npermitted'],
	];

	for (const [label, output] of positives) {
		test(`detects: ${label}`, () => {
			strictEqual(outputLooksSandboxBlocked(output), true);
		});
	}

	const negatives: [string, string][] = [
		['normal output', 'hello world'],
		['empty output', ''],
		['unrelated error', 'Error: invalid configuration'],
	];

	for (const [label, output] of negatives) {
		test(`ignores: ${label}`, () => {
			strictEqual(outputLooksSandboxBlocked(output), false);
		});
	}
});

suite('outputLooksSandboxNetworkBlocked', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const positives: [string, string][] = [
		['curl resolution failure', 'curl: (6) Could not resolve host: example.com'],
		['dns unavailable', 'getaddrinfo EAI_AGAIN registry.npmjs.org'],
		['socket permission failure', 'connect: Operation not permitted'],
		['network unreachable', 'connect: Network is unreachable'],
		['CONNECT proxy HTTP 403', 'fatal: unable to access \'https://example.com/owner/repository.git/\':\nReceived HTTP code 403 from proxy after CONNECT'],
	];

	for (const [label, output] of positives) {
		test(`detects: ${label}`, () => {
			strictEqual(outputLooksSandboxNetworkBlocked(output), true);
		});
	}

	const negatives: [string, string][] = [
		['filesystem permission failure', '/bin/bash: /tmp/test.txt: Operation not permitted'],
		['application error', 'Error: invalid configuration'],
	];

	for (const [label, output] of negatives) {
		test(`ignores: ${label}`, () => {
			strictEqual(outputLooksSandboxNetworkBlocked(output), false);
		});
	}
});
