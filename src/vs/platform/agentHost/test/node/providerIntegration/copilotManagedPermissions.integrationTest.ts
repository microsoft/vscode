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
import { TestConfigurationService } from '../../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../log/common/log.js';
import { AgentNetworkDomainSettingId } from '../../../../networkFilter/common/settings.js';
import type { IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import { resolveManagedSettingsPermissions } from '../../../common/agentHostManagedSettings.js';
import { TERMINAL_AUTO_APPROVE_SETTING_ID } from '../../../common/agentHostSchema.js';
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

	for (const restriction of ['none', 'denied domain', 'terminal ask'] as const) {
		test(`${restriction} preserves unrelated approvals on create, cold resume, and removal`, async function () {
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
				})),
			});
			const matchingCommand = isWindows ? 'Write-Output' : 'echo';
			const configuration = new TestConfigurationService(restriction === 'denied domain' ? {
				[AgentNetworkDomainSettingId.NetworkFilter]: true,
				[AgentNetworkDomainSettingId.DeniedNetworkDomains]: ['blocked.example'],
			} : restriction === 'terminal ask' ? {
				[TERMINAL_AUTO_APPROVE_SETTING_ID]: { [matchingCommand]: false },
			} : {});
			store.add(configuration.onDidChangeConfigurationEmitter);
			const permissions = resolveManagedSettingsPermissions(configuration);
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
					// Reject network side effects, but observe their real permission requests.
					return { kind: request.kind === 'url' ? 'reject' : 'approve-once' };
				},
			};
			let session: CopilotSession | undefined;
			try {
				await writeFile(join(directory, 'input.txt'), 'input');
				await client.start();
				session = await client.createSession(config);
				// A synthetic local response creates persisted history for cold resume.
				await session.sendAndWait({ prompt: 'Reply ready.' }, 30_000);

				for (const phase of ['fresh', 'resumed', 'removed'] as const) {
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
					const shell = isWindows ? 'powershell' : 'bash';
					requests.length = 0;
					const shellResult = await session.rpc.tools.execute({
						name: shell,
						arguments: { command: isWindows ? 'Get-Location' : 'pwd', description: 'Read working directory' },
					});
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
						requests: [
							{ kind: 'shell', managedApprovalRequired: false },
							{ kind: 'read', managedApprovalRequired: false },
							{ kind: 'write', managedApprovalRequired: false },
							{ kind: 'url', managedApprovalRequired: false },
						],
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
						requests: [{ kind: 'shell', managedApprovalRequired: restriction === 'terminal ask' && phase !== 'removed' }],
					}, phase);
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
