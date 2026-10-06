/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CopilotClient, ToolSet, type CopilotSession, type PermissionRequest, type SessionConfig } from '@github/copilot-sdk';
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
import { AgentSandboxEnabledValue } from '../../../../sandbox/common/settings.js';
import type { IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import { resolveManagedSettingsPermissions } from '../../../common/agentHostManagedSettings.js';
import { TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID } from '../../../common/agentHostSchema.js';
import { ByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { AgentHostManagedSettingsService } from '../../../node/agentHostManagedSettingsService.js';
import { ByokLmProxyService } from '../../../node/copilot/byokLmProxyService.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { projectCopilotSandboxPolicy } from '../../../node/copilot/copilotSandboxPolicy.js';
import { applySandboxConfig } from '../../../node/copilot/copilotSessionLauncher.js';
import { buildSandboxConfigForSdk } from '../../../node/copilot/sandboxConfigForSdk.js';
import type { ISessionSandboxPolicy } from '../../../node/sessionSandbox.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

type RuntimeToolResult = Awaited<ReturnType<CopilotSession['rpc']['tools']['execute']>>;

function resultType(result: RuntimeToolResult): string {
	assert.ok(typeof result !== 'string');
	return result.resultType;
}

suite('Agent Host Provider Integration - Copilot managed permissions', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const restriction of ['none', 'denied domain', 'limitTo', 'bridged limitTo', 'disjoint limitTo', 'terminal ask', 'terminal approval policy'] as const) {
		const terminalApprovalPolicy = restriction === 'terminal approval policy';
		const bridgedBoundary = restriction === 'bridged limitTo' || restriction === 'disjoint limitTo';
		const domainRestriction = restriction === 'denied domain' || restriction === 'limitTo' || bridgedBoundary;
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
					return (terminalApprovalPolicy && key === TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID) || (bridgedBoundary && (key === AgentNetworkDomainSettingId.NetworkFilter || key === AgentNetworkDomainSettingId.AllowedNetworkDomains))
						? { ...inspected, policyValue: inspected.value, userValue: undefined, userLocalValue: undefined }
						: inspected;
				}
			}(restriction === 'denied domain' ? {
				[AgentNetworkDomainSettingId.NetworkFilter]: true,
				[AgentNetworkDomainSettingId.DeniedNetworkDomains]: ['blocked.example'],
			} : bridgedBoundary ? {
				[AgentNetworkDomainSettingId.NetworkFilter]: true,
				[AgentNetworkDomainSettingId.AllowedNetworkDomains]: ['*.unmatched.invalid'],
			} : terminalApprovalPolicy ? {
				[TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID]: false,
			} : {});
			store.add(configuration.onDidChangeConfigurationEmitter);
			const managedSettings = store.add(new AgentHostManagedSettingsService());
			managedSettings.setClientPermissions('first', restriction === 'terminal ask'
				? { ask: [`Shell(${matchingCommand})`] }
				: restriction === 'limitTo'
					? { limitTo: ['Domain(unmatched.invalid)'] }
					: resolveManagedSettingsPermissions(configuration, new NullLogService()));
			if (bridgedBoundary) {
				managedSettings.setClientPermissions('second', { limitTo: [restriction === 'disjoint limitTo' ? 'Domain(other.invalid)' : 'Domain(unmatched.invalid)'] });
			}
			const permissions = managedSettings.permissions;
			if (bridgedBoundary) {
				assert.deepStrictEqual(permissions, { limitTo: restriction === 'disjoint limitTo' ? [] : ['Domain(unmatched.invalid)'] });
			}
			if (terminalApprovalPolicy) {
				assert.deepStrictEqual(permissions, { ask: ['Shell'] });
			}
			const requests: { kind: PermissionRequest['kind']; managedApprovalRequired: boolean }[] = [];
			const sessionId = `managed-permissions-${restriction.replaceAll(' ', '-')}`;
			let resolvedPolicy: ISessionSandboxPolicy | undefined;
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
				onEvent: event => {
					if (event.type === 'session.managed_settings_resolved' && !event.agentId) {
						resolvedPolicy = projectCopilotSandboxPolicy(event.data, sessionId, new NullLogService());
					}
				},
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
					const denyAll = restriction === 'disjoint limitTo' && phase !== 'removed';
					const terminalPolicyActive = terminalApprovalPolicy && phase !== 'removed';
					const managedShellApprovalRequired = (restriction === 'terminal ask' || terminalApprovalPolicy) && phase !== 'removed';
					if (phase !== 'fresh') {
						await session.disconnect();
						await client.stop();
						await client.start();
						resolvedPolicy = undefined;
						session = await client.resumeSession(sessionId, {
							...config,
							managedSettings: phase === 'removed' ? undefined : config.managedSettings,
						});
					}
					await session.rpc.tools.initializeAndValidate();
					assert.ok(resolvedPolicy, `${phase}: authoritative policy snapshot`);
					let preferenceSandboxConfig: ReturnType<typeof buildSandboxConfigForSdk>;
					if ((restriction === 'limitTo' || bridgedBoundary) && phase !== 'removed') {
						assert.strictEqual(resolvedPolicy.enabled, true);
						assert.strictEqual(resolvedPolicy.allowBypass, false);
						const sandboxConfig = buildSandboxConfigForSdk(process.platform, {
							enabled: AgentSandboxEnabledValue.On,
							allowUnsandboxedCommands: resolvedPolicy.allowBypass,
							allowNetwork: resolvedPolicy.allowOutbound,
							allowLocalNetwork: resolvedPolicy.allowLocalNetwork,
						});
						assert.ok(sandboxConfig);
						const warnings: string[] = [];
						const log = new class extends NullLogService {
							override warn(message: string): void { warnings.push(message); }
						}();
						const applied = await applySandboxConfig(session, sandboxConfig, sessionId, log);
						// The runtime rejects replacing its nonempty host floor with an
						// options document that omits that floor. Keep its existing sandbox.
						assert.strictEqual(applied, denyAll, `${phase}: preserve runtime domain floor`);
						assert.deepStrictEqual(warnings.map(message => message.includes('conflicts with managed policy')), denyAll ? [] : [true]);
						preferenceSandboxConfig = sandboxConfig;
					}
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
						results: ['success', 'success', 'success', denyAll ? 'denied' : 'rejected'],
						written: phase,
						requests: ['shell', 'read', 'write', ...denyAll ? [] : ['url']].map(kind => ({ kind, managedApprovalRequired: kind === 'shell' && terminalPolicyActive })),
					}, phase);

					if ((restriction === 'limitTo' || bridgedBoundary) && phase !== 'removed') {
						requests.length = 0;
						const hostOnly = await session.rpc.tools.execute({ name: 'web_fetch', arguments: { url: 'http://unmatched.invalid:8443/path' } });
						assert.deepStrictEqual({ result: resultType(hostOnly), requests }, denyAll
							? { result: 'denied', requests: [] }
							: { result: 'rejected', requests: [{ kind: 'url', managedApprovalRequired: false }] });
					}

					requests.length = 0;
					const matching: RuntimeToolResult = domainRestriction
						? await session.rpc.tools.execute({ name: 'web_fetch', arguments: { url: 'https://blocked.example' } })
						: await session.rpc.tools.execute({ name: shell, arguments: { command: `${matchingCommand} managed-probe`, description: 'Print managed probe' } });
					assert.deepStrictEqual({ result: resultType(matching), requests }, domainRestriction ? {
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
					if (domainRestriction && phase !== 'removed') {
						requests.length = 0;
						const blocked = await session.rpc.tools.execute({ name: 'web_fetch', arguments: { url: 'https://blocked.example' } });
						assert.deepStrictEqual({ result: resultType(blocked), requests }, { result: 'denied', requests: [] }, `${phase}: outside domain in Allow All`);
					}
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

					if (preferenceSandboxConfig) {
						assert.strictEqual((await session.rpc.permissions.setMode({ mode: 'manual' })).success, true);
						for (const sandboxConfigSource of ['never_configured', 'user_enabled', 'user_disabled'] as const) {
							const updated = await session.rpc.options.update({ sandboxConfig: preferenceSandboxConfig, sandboxConfigSource });
							requests.length = 0;
							const outside = await session.rpc.tools.execute({ name: 'web_fetch', arguments: { url: 'https://outside.invalid' } });
							const inside = await session.rpc.tools.execute({ name: 'web_fetch', arguments: { url: 'http://unmatched.invalid:8443/path' } });
							assert.deepStrictEqual({
								updated: updated.success,
								results: [outside, inside].map(resultType),
								requests,
							}, {
								updated: true,
								results: ['denied', denyAll ? 'denied' : 'rejected'],
								requests: denyAll ? [] : [{ kind: 'url', managedApprovalRequired: false }],
							}, `${phase}: ${sandboxConfigSource} preserves the runtime domain floor`);
						}
						await assert.rejects(session.rpc.options.update({
							sandboxConfig: { enabled: false },
							sandboxConfigSource: 'session_disabled',
						}), /Sandbox configuration update violates managed policy/);
					}
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
