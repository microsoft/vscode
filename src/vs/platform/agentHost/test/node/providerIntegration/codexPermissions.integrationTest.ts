/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { retry } from '../../../../../base/common/async.js';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostCodexAgentBinaryArgsEnvVar } from '../../../common/agentService.js';
import { CodexSessionConfigKey } from '../../../common/codexSessionConfigKeys.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { ActionType, type ChatToolCallReadyAction } from '../../../common/state/sessionActions.js';
import { buildDefaultChatUri, customizationId, CustomizationType, ROOT_STATE_URI, ToolCallCancellationReason, ToolCallConfirmationReason, type ClientPluginCustomization, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { CODEX_SDK_ROOT } from '../e2e/providers/codexTestConfiguration.js';
import { dispatchTurn } from '../providerIntegrationTestHelpers.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, type IServerHandle, startRealServer, stopServer, TestProtocolClient } from '../serverIntegrationTestHelpers.js';

const SKILL_MARKER = 'CODEX_ESCALATION_SKILL_DESCRIPTION';

interface IModelRequest {
	readonly path: string;
	readonly body: {
		readonly client_metadata?: Readonly<Record<string, string>>;
		readonly input?: readonly {
			readonly type?: string;
			readonly output?: string;
		}[];
	};
}

interface ICommand {
	readonly cmd: string;
	readonly escalated?: boolean;
}

function quoteShellArgument(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

suite('Agent Host Provider Integration — Codex Permissions', function () {
	this.timeout(120_000);
	ensureNoDisposablesAreLeakedInTestSuite();

	let server: IServerHandle | undefined;
	let client: TestProtocolClient | undefined;
	let testRoot: string | undefined;
	let sessionUri: string | undefined;
	let homeDir: string;
	let workspaceDir: string;
	let temporaryDir: string;

	setup(async function () {
		server = undefined;
		client = undefined;
		testRoot = undefined;
		sessionUri = undefined;
		if (!CODEX_SDK_ROOT || process.platform !== 'darwin') {
			this.skip();
		}
		testRoot = await mkdtemp(join(tmpdir(), 'codex-permissions-'));
		homeDir = join(testRoot, 'home');
		workspaceDir = join(testRoot, 'workspace');
		temporaryDir = join(testRoot, 'tmp');
		await Promise.all([homeDir, workspaceDir, temporaryDir].map(directory => mkdir(directory)));
	});

	teardown(async function () {
		this.timeout(60_000);
		try {
			if (client && sessionUri) {
				await client.call('disposeSession', { session: sessionUri }, 5000);
			}
		} finally {
			client?.close();
			try {
				if (server) {
					await stopServer(server);
				}
			} finally {
				if (testRoot) {
					await rm(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
				}
			}
		}
	});

	async function runCommands(commands: readonly ICommand[], config: Readonly<Record<string, string>>, options: { approve?: boolean; withSkill?: boolean } = {}) {
		const { approve = true, withSkill = false } = options;
		const customizations: ClientPluginCustomization[] = [];
		if (withSkill) {
			const pluginDir = join(homeDir, 'plugin');
			const skillDir = join(pluginDir, 'skills', 'permission-test');
			await Promise.all([mkdir(join(pluginDir, '.plugin'), { recursive: true }), mkdir(skillDir, { recursive: true })]);
			await Promise.all([
				writeFile(join(pluginDir, '.plugin', 'plugin.json'), JSON.stringify({ name: 'permission-test', version: '1.0.0' })),
				writeFile(join(skillDir, 'SKILL.md'), `---\nname: permission-test\ndescription: ${SKILL_MARKER}\n---\nThis is a permission test fixture.`),
			]);
			const pluginUri = URI.file(pluginDir).toString();
			customizations.push({ type: CustomizationType.Plugin, id: customizationId(pluginUri), uri: pluginUri as ProtocolURI, name: 'Permission Test', nonce: '1' });
		}
		const scenarioId = 'codex-permissions';
		const reviewScenarioId = 'codex-permissions-review';
		const s = server = await startRealServer({
			mockLlm: true,
			codexSdkRoot: CODEX_SDK_ROOT,
			homeDir,
			userDataDir: join(testRoot!, 'user-data'),
			env: {
				TMPDIR: temporaryDir,
				[AgentHostCodexAgentBinaryArgsEnvVar]: JSON.stringify(['-c', 'features.unified_exec=true']),
			},
			mockScenarios: [{
				id: scenarioId,
				definition: {
					type: 'multi-turn',
					turns: [...commands.map(command => ({
						kind: 'tool-calls',
						toolCalls: [{
							toolNamePattern: /^exec_command$/,
							arguments: {
								cmd: command.cmd,
								workdir: workspaceDir,
								login: false,
								sandbox_permissions: command.escalated ? 'require_escalated' : 'use_default',
								...(command.escalated ? { justification: `[scenario:${reviewScenarioId}] Access the test fixture outside the workspace.` } : {}),
							},
						}],
					})), { kind: 'content', chunks: [{ content: 'Done.', delayMs: 0 }] }],
				},
			}, {
				id: reviewScenarioId,
				definition: [{
					content: JSON.stringify({
						risk_level: approve ? 'low' : 'high',
						user_authorization: approve ? 'high' : 'low',
						outcome: approve ? 'allow' : 'deny',
						rationale: approve ? 'The test fixture access is authorized.' : 'The test fixture access is not authorized.',
					}),
					delayMs: 0,
				}],
			}],
		});
		const c = client = new TestProtocolClient(s.port);
		await c.connect();
		await c.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'codex-permissions' }, 30_000);
		await c.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: 'not-a-real-token' }, 30_000);
		sessionUri = URI.from({ scheme: 'codex', path: `/${generateUuid()}` }).toString();
		await c.call('createSession', {
			channel: sessionUri,
			provider: 'codex',
			workingDirectories: [URI.file(workspaceDir).toString()],
			config: { isolation: 'folder', ...config },
			activeClient: { clientId: 'codex-permissions', tools: [], customizations },
		}, 30_000);
		await c.call('subscribe', { channel: sessionUri });
		await c.call('subscribe', { channel: buildDefaultChatUri(sessionUri) });
		if (withSkill) {
			await retry(async () => {
				const session = await fetchSessionWithChat(c, sessionUri!);
				assert.ok(session.customizations?.some(customization => customization.type === CustomizationType.Plugin && customization.children?.some(child => child.type === CustomizationType.Skill)), 'the client skill must be loaded before testing escalation');
			}, 100, 100);
		}
		c.clearReceived();
		dispatchTurn(c, sessionUri, 'turn-permissions', `[scenario:${scenarioId}] Run the permission probes against the test fixtures.`, 1);
		if (commands.some(command => command.escalated) && config[CodexSessionConfigKey.PermissionsPreset] === 'default') {
			const ready = await c.waitForNotification(notification =>
				isActionNotification(notification, 'chat/toolCallReady') && !(getActionEnvelope(notification).action as ChatToolCallReadyAction).confirmed,
				30_000,
			);
			const envelope = getActionEnvelope(ready);
			const action = envelope.action;
			assert(action.type === ActionType.ChatToolCallReady);
			c.dispatch({
				channel: envelope.channel,
				clientSeq: 100,
				action: {
					type: ActionType.ChatToolCallConfirmed,
					turnId: action.turnId,
					toolCallId: action.toolCallId,
					...(approve
						? { approved: true as const, confirmed: ToolCallConfirmationReason.UserAction }
						: { approved: false as const, reason: ToolCallCancellationReason.Denied }),
				},
			});
		}
		await c.waitForNotification(notification =>
			isActionNotification(notification, 'chat/turnComplete') || isActionNotification(notification, 'chat/error'),
			90_000,
		);

		const requests = (s.mockLlm?.getRequests?.() ?? []) as readonly IModelRequest[];
		const input = requests.findLast(request => request.path.includes('/responses') && request.body.client_metadata?.['x-openai-subagent'] !== 'guardian')?.body.input ?? [];
		return {
			errors: c.receivedNotifications(notification => isActionNotification(notification, 'chat/error')).map(notification => getActionEnvelope(notification).action),
			autoReviewRequested: requests.some(request => request.body.client_metadata?.['x-openai-subagent'] === 'guardian'),
			skillAdvertised: requests.some(request => JSON.stringify(request.body).includes(SKILL_MARKER)),
			outputs: input.filter(item => item.type === 'function_call_output').map(item => item.output ?? ''),
		};
	}

	for (const preset of ['default', 'auto-review'] as const) {
		for (const withSkill of [false, true]) {
			test(`${preset}: approved escalation can read and write outside the workspace without changing later sandboxed commands${withSkill ? ' with skill read grants' : ''}`, async () => {
				const marker = 'CODEX_APPROVED_ESCALATION_READ';
				const externalFile = join(homeDir, 'escalation-probe.txt');
				const externalCopy = join(homeDir, 'approved-copy.txt');
				await writeFile(externalFile, marker);
				const cmd = `/bin/cat ${quoteShellArgument(externalFile)} && /bin/cp ${quoteShellArgument(externalFile)} ${quoteShellArgument(externalCopy)}`;
				const { outputs, ...result } = await runCommands([{ cmd }, { cmd, escalated: true }, { cmd }], { [CodexSessionConfigKey.PermissionsPreset]: preset }, { withSkill });
				assert.deepStrictEqual({
					...result,
					results: outputs.map(output => ({ read: output.includes(marker), denied: output.includes('Operation not permitted') })),
				}, {
					errors: [],
					autoReviewRequested: preset === 'auto-review',
					skillAdvertised: withSkill,
					results: [{ read: false, denied: true }, { read: true, denied: false }, { read: false, denied: true }],
				}, outputs.join('\n'));
				assert.strictEqual(await readFile(externalCopy, 'utf8'), marker);
			});
		}

		test(`${preset}: rejected escalation does not execute`, async () => {
			const target = join(homeDir, 'escalation-write.txt');
			await writeFile(target, 'unchanged');
			const { outputs, ...result } = await runCommands([{ cmd: `/bin/echo changed > ${quoteShellArgument(target)}`, escalated: true }], { [CodexSessionConfigKey.PermissionsPreset]: preset }, { approve: false });
			assert.deepStrictEqual({ ...result, contents: await readFile(target, 'utf8') }, {
				errors: [],
				autoReviewRequested: preset === 'auto-review',
				skillAdvertised: false,
				contents: 'unchanged',
			}, outputs.join('\n'));
		});
	}

	for (const [sandboxMode, workspaceAccess] of [['workspace-write', 'allowed'], ['read-only', 'denied']] as const) {
		test(`${sandboxMode}: ordinary commands preserve filesystem boundaries`, async () => {
			const directories = {
				workspace: workspaceDir,
				privateTemp: temporaryDir,
				git: join(workspaceDir, '.git'),
				agents: join(workspaceDir, '.agents'),
				codex: join(workspaceDir, '.codex'),
				home: homeDir,
			};
			await Promise.all(Object.values(directories).map(directory => mkdir(directory, { recursive: true })));
			const cmd = Object.entries(directories).map(([name, directory]) => {
				// The Codex launcher replaces TMPDIR with its own private directory.
				const target = name === 'privateTemp' ? '"$TMPDIR/write-probe"' : quoteShellArgument(join(directory, 'write-probe'));
				return `if /usr/bin/touch ${target}; then /usr/bin/printf '${name}=allowed\\n'; else /usr/bin/printf '${name}=denied\\n'; fi`;
			}).join('\n');
			const { outputs, ...result } = await runCommands([{ cmd }], {
				[CodexSessionConfigKey.SandboxMode]: sandboxMode,
				[CodexSessionConfigKey.ApprovalPolicy]: 'on-request',
			});
			assert.deepStrictEqual({
				...result,
				writes: outputs.flatMap(output => [...output.matchAll(/\b\w+=(?:allowed|denied)\b/g)].map(match => match[0])),
			}, {
				errors: [],
				autoReviewRequested: false,
				skillAdvertised: false,
				writes: [`workspace=${workspaceAccess}`, 'privateTemp=allowed', 'git=denied', 'agents=denied', 'codex=denied', 'home=denied'],
			}, outputs.join('\n'));
		});
	}
});
