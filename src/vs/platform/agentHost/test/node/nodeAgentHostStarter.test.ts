/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { isWindows, type IProcessEnvironment } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Client, type IIPCOptions } from '../../../../base/parts/ipc/node/ipc.cp.js';
import { AiAgentEnvValue, AiAgentEnvVar } from '../../../chat/common/aiAgentEnv.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { createCopilotCliEnvironment } from '../../node/copilot/copilotCliEnvironment.js';
import { NodeAgentHostStarter } from '../../node/nodeAgentHostStarter.js';

class TestNodeAgentHostStarter extends NodeAgentHostStarter {
	readonly environments: IProcessEnvironment[] = [];

	protected override async _resolveShellEnv(): Promise<IProcessEnvironment> {
		return { GITHUB_TOKEN: 'shell-token', GH_TOKEN: 'shell-gh-token', SHELL_ONLY: 'shell-value', EMPTY: 'shell-value' };
	}

	protected override _createClient(options: IIPCOptions): Client {
		this.environments.push({ ...options.env });
		return super._createClient(options);
	}
}

suite('NodeAgentHostStarter', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createStarter(): TestNodeAgentHostStarter {
		return disposables.add(new TestNodeAgentHostStarter(
			new TestConfigurationService(),
			new class extends mock<INativeEnvironmentService>() {
				override readonly args = { _: [] };
				override readonly isBuilt = true;
				override readonly logsHome = URI.file('/logs');
				override readonly userDataPath = '/user-data';
			},
			new NullLogService(),
			NullTelemetryService,
		));
	}

	test('applies resolver overrides without replacing launcher-owned environment values', async () => {
		const starter = createStarter();
		starter.setWebSocketConfig({ port: '12345', connectionToken: 'launcher-connection-token' });
		starter.setEnvironment(Object.freeze({
			GITHUB_TOKEN: 'codespace-token',
			GH_TOKEN: null,
			EMPTY: '',
			[AiAgentEnvVar]: 'resolver-agent',
			VSCODE_ESM_ENTRYPOINT: 'resolver-entrypoint',
			VSCODE_AGENT_HOST_CONNECTION_TOKEN: 'resolver-connection-token',
		}));
		disposables.add((await starter.start()).store);
		const env = starter.environments[0];
		const cliEnv = createCopilotCliEnvironment(env);

		assert.deepStrictEqual({
			token: env.GITHUB_TOKEN,
			ghToken: env.GH_TOKEN,
			empty: env.EMPTY,
			shellOnly: env.SHELL_ONLY,
			agent: env[AiAgentEnvVar],
			entrypoint: env.VSCODE_ESM_ENTRYPOINT,
			connectionToken: env.VSCODE_AGENT_HOST_CONNECTION_TOKEN,
			cliToken: cliEnv.GITHUB_TOKEN,
			cliGhToken: cliEnv.GH_TOKEN,
		}, {
			token: 'codespace-token',
			ghToken: undefined,
			empty: '',
			shellOnly: 'shell-value',
			agent: AiAgentEnvValue,
			entrypoint: 'vs/platform/agentHost/node/agentHostMain',
			connectionToken: 'launcher-connection-token',
			cliToken: 'codespace-token',
			cliGhToken: undefined,
		});
	});

	test('retains an environment snapshot for restarts and replaces it on re-resolution', async () => {
		const starter = createStarter();
		const environment = { GITHUB_TOKEN: 'codespace-token', GH_TOKEN: null };
		starter.setEnvironment(environment);
		environment.GITHUB_TOKEN = 'modified-after-setting';
		disposables.add((await starter.start()).store);
		disposables.add((await starter.start()).store);
		starter.setEnvironment({ GITHUB_TOKEN: 'refreshed-codespace-token' });
		disposables.add((await starter.start()).store);

		assert.deepStrictEqual(starter.environments.map(env => ({ token: env.GITHUB_TOKEN, ghToken: env.GH_TOKEN })), [
			{ token: 'codespace-token', ghToken: undefined },
			{ token: 'codespace-token', ghToken: undefined },
			{ token: 'refreshed-codespace-token', ghToken: 'shell-gh-token' },
		]);
	});

	test('keeps the inherited shell environment when there are no resolver overrides', async () => {
		const starter = createStarter();
		disposables.add((await starter.start()).store);
		const env = starter.environments[0];

		assert.deepStrictEqual({ token: env.GITHUB_TOKEN, ghToken: env.GH_TOKEN }, {
			token: 'shell-token',
			ghToken: 'shell-gh-token',
		});
	});

	test('merges debug and resolver environments using the server platform casing', async () => {
		const starter = createStarter();
		starter.setEnvironment({ github_token: 'resolver-token', gh_token: null }, { GITHUB_TOKEN: 'debug-token', GH_TOKEN: 'debug-gh-token' });
		disposables.add((await starter.start()).store);
		const env = starter.environments[0];

		assert.deepStrictEqual({
			GITHUB_TOKEN: env.GITHUB_TOKEN,
			github_token: env.github_token,
			GH_TOKEN: env.GH_TOKEN,
			gh_token: env.gh_token,
		}, isWindows ? {
			GITHUB_TOKEN: 'resolver-token',
			github_token: undefined,
			GH_TOKEN: undefined,
			gh_token: undefined,
		} : {
			GITHUB_TOKEN: 'debug-token',
			github_token: 'resolver-token',
			GH_TOKEN: 'debug-gh-token',
			gh_token: undefined,
		});
	});

	for (const { key, resolverKey, value } of [
		{ key: 'PATH', resolverKey: 'pAtH', value: 'resolver-path' },
		{ key: 'PATH', resolverKey: 'pAtH', value: '' },
		{ key: 'GH_TOKEN', resolverKey: 'gh_token', value: null },
	]) {
		(isWindows ? test : test.skip)(`preserves a mixed-case Windows ${key} override at the child-process boundary (${JSON.stringify(value)})`, async () => {
			const starter = createStarter();
			starter.setEnvironment({ [resolverKey]: value }, { [key]: 'debug-value' });
			disposables.add((await starter.start()).store);
			const child = spawnSync(process.execPath, ['-e', `process.stdout.write(JSON.stringify({ matches: process.env[${JSON.stringify(key)}] === ${value === null ? 'undefined' : JSON.stringify(value)}, keys: Object.keys(process.env).filter(key => key.toUpperCase() === ${JSON.stringify(key)}).length }))`], {
				env: { ...process.env, ...starter.environments[0], ELECTRON_RUN_AS_NODE: '1' },
				encoding: 'utf8',
				timeout: 10000,
			});

			assert.deepStrictEqual({
				status: child.status,
				error: child.error?.message,
				stderr: child.stderr,
				stdout: child.stdout,
			}, {
				status: 0,
				error: undefined,
				stderr: '',
				stdout: JSON.stringify({ matches: true, keys: value === null ? 0 : 1 }),
			});
		});
	}
});
