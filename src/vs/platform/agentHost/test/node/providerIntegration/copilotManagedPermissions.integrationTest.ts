/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CopilotClient, ToolSet, type CopilotSession, type ManagedSettingsPermissions, type PermissionRequest, type SessionConfig } from '@github/copilot-sdk';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { Emitter } from '../../../../../base/common/event.js';
import { join } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IConfigurationValue } from '../../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../log/common/log.js';
import { AgentNetworkDomainSettingId } from '../../../../networkFilter/common/settings.js';
import type { IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import { resolveManagedSettingsPermissions } from '../../../common/agentHostManagedSettings.js';
import { TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID } from '../../../common/agentHostSchema.js';
import { ByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService } from '../../../node/copilot/byokLmProxyService.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

type RuntimeToolResult = Awaited<ReturnType<CopilotSession['rpc']['tools']['execute']>>;

function resultType(result: RuntimeToolResult): string {
	assert.ok(typeof result !== 'string');
	return result.resultType;
}

suite('Agent Host Provider Integration - Copilot managed permissions', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('runtime independently enforces both approval-mode restrictions', async function () {
		this.timeout(60_000);
		const home = await mkdtemp(`${tmpdir()}/copilot-managed-modes-`);
		const client = new CopilotClient({
			mode: 'empty', baseDirectory: home, useLoggedInUser: false,
			env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(home, {
				PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
				COPILOT_TELEMETRY_ENABLED: 'false',
			})),
		});
		const results: boolean[][] = [];
		try {
			await client.start();
			const restrictions: ManagedSettingsPermissions[] = [
				{}, { disableBypassPermissionsMode: 'disable' }, { disableAssistedPermissionsMode: true },
				{ disableBypassPermissionsMode: 'disable', disableAssistedPermissionsMode: true },
			];
			for (const permissions of restrictions) {
				const session = await client.createSession({
					workingDirectory: home, enableManagedSettings: true,
					featureFlags: { AUTO_APPROVAL: true }, enableExperimentalMode: true,
					availableTools: [], managedSettings: { permissions },
					onPermissionRequest: async () => ({ kind: 'reject' }),
				});
				try {
					const modes: boolean[] = [];
					for (const mode of ['manual', 'assisted', 'allow-all'] as const) {
						const result = await session.rpc.permissions.setMode({ mode });
						modes.push(result.success && result.mode === mode);
					}
					results.push(modes);
				} finally {
					await session.disconnect();
				}
			}
			assert.deepStrictEqual(results, [[true, true, true], [true, true, false], [true, false, true], [true, false, false]]);
		} finally {
			await client.stop();
			await rm(home, { recursive: true, force: true });
		}
	});

	for (const restriction of ['none', 'denied domain', 'terminal ask', 'terminal approval policy'] as const) {
		const terminalApprovalPolicy = restriction === 'terminal approval policy';
		const approvalScope = terminalApprovalPolicy ? 'requires all shell approvals' : 'preserves unrelated approvals';
		test(`${restriction} ${approvalScope} on create, cold resume, and removal`, async function () {
			this.timeout(120_000);
			const directory = await mkdtemp(`${tmpdir()}/copilot-managed-permissions-`);
			const registry = new ByokLmBridgeRegistry();
			const models = store.add(new Emitter<IByokLmModelInfo[]>());
			store.add(registry.register('client', {
				onDidChangeModels: models.event,
				chat: async () => ({
					responseId: 'managed-permissions-response',
					output: [{ type: 'message', content: [{ type: 'text', text: 'ready' }] }],
				}),
			}));
			models.fire([{ vendor: 'test', id: 'test-model' }]);
			const proxy = store.add(new ByokLmProxyService(new NullLogService(), registry));
			const handle = store.add(await proxy.start());
			const client = new CopilotClient({
				mode: 'empty',
				baseDirectory: directory,
				useLoggedInUser: false,
				env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(directory, {
					PATH: process.env.PATH,
					SystemRoot: process.env.SystemRoot,
					WINDIR: process.env.WINDIR,
					ComSpec: process.env.ComSpec,
					PATHEXT: process.env.PATHEXT,
					COPILOT_TELEMETRY_ENABLED: 'false',
				})),
			});
			const matchingCommand = isWindows ? 'Write-Output' : 'echo';
			const configuration = new class extends TestConfigurationService {
				override inspect<T>(key: string): IConfigurationValue<T> {
					const inspected = super.inspect<T>(key);
					return terminalApprovalPolicy && key === TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID
						? { ...inspected, policyValue: inspected.value, userValue: undefined, userLocalValue: undefined }
						: inspected;
				}
			}(restriction === 'denied domain' ? {
				[AgentNetworkDomainSettingId.NetworkFilter]: true,
				[AgentNetworkDomainSettingId.DeniedNetworkDomains]: ['blocked.example'],
			} : terminalApprovalPolicy ? {
				[TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID]: false,
			} : {});
			store.add(configuration.onDidChangeConfigurationEmitter);
			const permissions = restriction === 'terminal ask'
				? { ask: [`Shell(${matchingCommand})`] }
				: resolveManagedSettingsPermissions(configuration);
			if (terminalApprovalPolicy) {
				assert.deepStrictEqual(permissions, { ask: ['Shell'] });
			}
			const requests: { kind: PermissionRequest['kind']; managedApprovalRequired: boolean }[] = [];
			const sessionId = `managed-permissions-${restriction.replaceAll(' ', '-')}`;
			const config: SessionConfig = {
				sessionId,
				workingDirectory: directory,
				availableTools: new ToolSet().addBuiltIn('*'),
				model: 'test-model',
				provider: {
					type: 'openai',
					wireApi: 'responses',
					baseUrl: handle.providerBaseUrl('test'),
					bearerToken: `${handle.nonce}.${sessionId}`,
				},
				managedSettings: { permissions },
				onPermissionRequest: request => {
					requests.push({ kind: request.kind, managedApprovalRequired: request.managedApprovalRequired === true });
					// Observe URL permissions without making external network requests.
					return { kind: request.kind === 'url' ? 'reject' : 'approve-once' };
				},
			};
			let session: CopilotSession | undefined;
			try {
				await writeFile(join(directory, 'input.txt'), 'input');
				await client.start();
				session = await client.createSession(config);
				await session.sendAndWait({ prompt: 'Reply ready.' }, 30_000);
				const shell = isWindows ? 'powershell' : 'bash';
				for (const phase of ['fresh', 'resumed', 'removed'] as const) {
					const terminalPolicyActive = terminalApprovalPolicy && phase !== 'removed';
					const managedShellApprovalRequired = (restriction === 'terminal ask' || terminalApprovalPolicy) && phase !== 'removed';
					if (phase !== 'fresh') {
						await session.disconnect();
						await client.stop();
						await client.start();
						session = await client.resumeSession(sessionId, {
							...config,
							managedSettings: phase === 'removed' ? undefined : config.managedSettings,
						});
					}
					await session.rpc.tools.initializeAndValidate();
					assert.strictEqual((await session.rpc.permissions.setMode({ mode: 'manual' })).success, true);
					requests.length = 0;
					const shellResult = await session.rpc.tools.execute({ name: shell, arguments: { command: isWindows ? 'Get-Location' : 'pwd', description: 'Read working directory' } });
					const readResult = await session.rpc.tools.execute({ name: 'view', arguments: { path: join(directory, 'input.txt') } });
					const outputPath = join(directory, `${phase}.txt`);
					const writeResult = await session.rpc.tools.execute({ name: 'create', arguments: { path: outputPath, file_text: phase } });
					const urlResult = await session.rpc.tools.execute({ name: 'web_fetch', arguments: { url: 'https://unmatched.invalid' } });
					assert.deepStrictEqual({
						results: [shellResult, readResult, writeResult, urlResult].map(resultType),
						written: await readFile(outputPath, 'utf8'),
						requests,
					}, {
						results: ['success', 'success', 'success', 'rejected'],
						written: phase,
						requests: ['shell', 'read', 'write', 'url'].map(kind => ({ kind, managedApprovalRequired: kind === 'shell' && terminalPolicyActive })),
					}, phase);

					requests.length = 0;
					const matching: RuntimeToolResult = restriction === 'denied domain'
						? await session.rpc.tools.execute({ name: 'web_fetch', arguments: { url: 'https://blocked.example' } })
						: await session.rpc.tools.execute({ name: shell, arguments: { command: `${matchingCommand} managed-probe`, description: 'Print managed probe' } });
					assert.deepStrictEqual({ result: resultType(matching), requests }, restriction === 'denied domain' ? {
						result: phase === 'removed' ? 'rejected' : 'denied',
						requests: phase === 'removed' ? [{ kind: 'url', managedApprovalRequired: false }] : [],
					} : {
						result: 'success',
						requests: [{ kind: 'shell', managedApprovalRequired: managedShellApprovalRequired }],
					}, phase);

					if (managedShellApprovalRequired) {
						for (const mode of ['allow-all', 'assisted'] as const) {
							assert.strictEqual((await session.rpc.permissions.setMode({ mode })).success, true);
							requests.length = 0;
							await session.rpc.tools.execute({ name: shell, arguments: { command: `${matchingCommand} managed-${mode}`, description: 'Print managed probe' } });
							assert.deepStrictEqual(requests, [{ kind: 'shell', managedApprovalRequired: true }], `${phase}: ${mode}`);
						}
					}

					assert.strictEqual((await session.rpc.permissions.setMode({ mode: 'allow-all' })).success, true);
					requests.length = 0;
					const unrestricted: RuntimeToolResult[] = [
						await session.rpc.tools.execute({ name: shell, arguments: { command: isWindows ? 'Get-Location' : 'pwd', description: 'Read working directory' } }),
						await session.rpc.tools.execute({ name: 'view', arguments: { path: join(directory, 'input.txt') } }),
						await session.rpc.tools.execute({ name: 'create', arguments: { path: join(directory, `${phase}-allow-all.txt`), file_text: phase } }),
					];
					assert.deepStrictEqual({ results: unrestricted.map(resultType), requests }, {
						results: ['success', 'success', 'success'],
						requests: terminalPolicyActive ? [{ kind: 'shell', managedApprovalRequired: true }] : [],
					}, `${phase}: unrelated allow-all requests`);
				}
			} finally {
				try {
					await session?.disconnect();
				} finally {
					try {
						await client.stop();
					} finally {
						await rm(directory, { recursive: true, force: true });
					}
				}
			}
		});
	}
});
