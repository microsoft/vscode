/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from '../../../../../base/common/path.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { AgentHostCodexAgentBinaryArgsEnvVar } from '../../../common/agentService.js';
import { AgentHostCodexMultiRootEnabledConfigKey } from '../../../common/agentHostSchema.js';
import { CodexSessionConfigKey, type CodexPermissionsPreset } from '../../../common/codexSessionConfigKeys.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { buildDefaultChatUri, customizationId, CustomizationType, MessageKind, ROOT_STATE_URI, type ClientPluginCustomization, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { CustomizationEnablementKind } from '../../../common/state/protocol/state.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { CODEX_SDK_ROOT } from '../e2e/providers/codexTestConfiguration.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, type IServerHandle, startRealServer, stopServer, TestProtocolClient } from '../serverIntegrationTestHelpers.js';

interface ICapturedRequest {
	readonly path: string;
	readonly body: { readonly input?: readonly { readonly type?: string; readonly output?: string }[] };
}

function quoteShellArgument(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function readProbe(name: string, path: string): string {
	return `/bin/cat ${quoteShellArgument(path)} >/dev/null 2>&1; printf '${name}=%s\\n' "$?"`;
}

suite('Agent Host Provider Integration — Codex Sandbox', function () {
	let fixtureRoot: string;
	let userHome: string;
	let codexHome: string;
	let workspace: string;
	let secondaryWorkspace: string;
	let clientPluginDirectory: string;
	let pluginCommand: string;
	let server: IServerHandle | undefined;
	let client: TestProtocolClient;
	let clientId: string;
	let clientSeq: number;
	const sessions: string[] = [];

	suiteSetup(async function () {
		this.timeout(120_000);
		// Exercise Seatbelt itself; Windows uses a different baseline and the
		// packaged Linux execution path has separate platform coverage.
		if (!CODEX_SDK_ROOT || !isMacintosh) {
			this.skip();
		}
		fixtureRoot = await mkdtemp(join(tmpdir(), 'codex-sandbox-'));
		userHome = join(fixtureRoot, 'home');
		codexHome = join(userHome, '.codex');
		workspace = join(fixtureRoot, 'workspace');
		secondaryWorkspace = join(fixtureRoot, 'secondary-workspace');
		const nestedWorkingDirectory = join(workspace, 'nested');
		const workspaceSkillDirectory = join(workspace, 'tool-skill');
		clientPluginDirectory = join(fixtureRoot, 'client-plugin');
		const skillDirectory = join(codexHome, 'skills', 'sandbox-probe');
		const skillFile = join(skillDirectory, 'SKILL.md');
		const referenceFile = join(skillDirectory, 'references', 'guide.txt');
		const privateFile = join(codexHome, 'private.txt');
		const workspaceFile = join(workspace, 'result.txt');
		const pluginSkillFile = join(clientPluginDirectory, 'skills', 'plugin-probe', 'SKILL.md');
		const pluginReferenceFile = join(clientPluginDirectory, 'shared', 'guide.txt');
		const cachedPluginDirectory = join(codexHome, 'plugins', 'cache', 'local', 'sandbox-plugin', '1.0.0');
		const cachedSkillDirectory = join(cachedPluginDirectory, 'skills', 'cache-probe');
		const cachedSkillFile = join(cachedSkillDirectory, 'SKILL.md');
		const cachedReferenceFile = join(cachedSkillDirectory, 'guide.txt');
		await Promise.all([
			mkdir(join(skillDirectory, 'references'), { recursive: true }),
			mkdir(workspace, { recursive: true }),
			mkdir(nestedWorkingDirectory, { recursive: true }),
			mkdir(secondaryWorkspace, { recursive: true }),
			mkdir(workspaceSkillDirectory, { recursive: true }),
			mkdir(join(clientPluginDirectory, '.plugin'), { recursive: true }),
			mkdir(join(clientPluginDirectory, 'skills', 'plugin-probe'), { recursive: true }),
			mkdir(join(clientPluginDirectory, 'shared'), { recursive: true }),
			mkdir(join(cachedPluginDirectory, '.codex-plugin'), { recursive: true }),
			mkdir(cachedSkillDirectory, { recursive: true }),
		]);
		await Promise.all([
			writeFile(skillFile, '---\nname: sandbox-probe\ndescription: CODEX_SANDBOX_SKILL_MARKER\n---\nRead references/guide.txt.\n'),
			writeFile(referenceFile, 'Skill reference fixture.'),
			writeFile(privateFile, 'Unrelated private fixture.'),
			writeFile(join(clientPluginDirectory, '.plugin', 'plugin.json'), JSON.stringify({ name: 'Sandbox Plugin' })),
			writeFile(pluginSkillFile, '---\nname: plugin-probe\ndescription: CODEX_SANDBOX_PLUGIN_MARKER\n---\nRead ../../shared/guide.txt.\n'),
			writeFile(pluginReferenceFile, 'Plugin reference fixture.'),
			writeFile(join(codexHome, 'config.toml'), '[plugins."sandbox-plugin@local"]\nenabled = true\n'),
			writeFile(join(cachedPluginDirectory, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'sandbox-plugin', version: '1.0.0' })),
			writeFile(cachedSkillFile, '---\nname: cache-probe\ndescription: CODEX_SANDBOX_CACHE_MARKER\n---\nRead guide.txt.\n'),
			writeFile(cachedReferenceFile, 'Cached plugin reference fixture.'),
			writeFile(join(workspace, 'parent.txt'), 'Primary workspace fixture.'),
			writeFile(join(secondaryWorkspace, 'root.txt'), 'Secondary workspace fixture.'),
			writeFile(join(workspaceSkillDirectory, 'SKILL.md'), '---\nname: workspace-probe\ndescription: CODEX_SANDBOX_WORKSPACE_SKILL_MARKER\n---\nRead guide.txt.\n'),
			writeFile(join(workspaceSkillDirectory, 'guide.txt'), 'Workspace skill fixture.'),
		]);
		await symlink(workspaceSkillDirectory, join(codexHome, 'skills', 'workspace-probe'));
		const commands = {
			'codex-sandbox-skills': [
				readProbe('skill_read', skillFile),
				readProbe('reference_read', referenceFile),
				readProbe('private_read', privateFile),
				`(printf changed >> ${quoteShellArgument(referenceFile)}) 2>/dev/null; printf 'skill_write=%s\\n' "$?"`,
				`printf written > ${quoteShellArgument(workspaceFile)}; printf 'workspace_write=%s\\n' "$?"`,
			].join('\n'),
			'codex-sandbox-plugin': '',
			'codex-sandbox-cache': [
				readProbe('cached_skill_read', cachedSkillFile),
				readProbe('cached_reference_read', cachedReferenceFile),
				readProbe('private_read', privateFile),
			].join('\n'),
			'codex-sandbox-workspaces': [
				readProbe('parent_read', '../parent.txt'),
				readProbe('secondary_read', join(secondaryWorkspace, 'root.txt')),
				`printf written >> ${quoteShellArgument(join(workspaceSkillDirectory, 'guide.txt'))}; printf 'workspace_skill_write=%s\\n' "$?"`,
				`printf written > ${quoteShellArgument(join(secondaryWorkspace, 'result.txt'))}; printf 'secondary_write=%s\\n' "$?"`,
				readProbe('private_read', privateFile),
			].join('\n'),
		};
		server = await startRealServer({
			mockLlm: true,
			codexSdkRoot: CODEX_SDK_ROOT,
			codexHomeDir: codexHome,
			homeDir: userHome,
			userDataDir: join(userHome, 'user-data'),
			env: { [AgentHostCodexAgentBinaryArgsEnvVar]: JSON.stringify(['-c', 'features.unified_exec=true']) },
			mockScenarios: Object.entries(commands).map(([id, command]) => ({
				id,
				definition: {
					type: 'multi-turn',
					turns: [
						{
							kind: 'tool-calls',
							toolCalls: [{
								toolNamePattern: /^exec_command$/,
								arguments: () => ({
									cmd: id === 'codex-sandbox-plugin' ? pluginCommand : command,
									workdir: id === 'codex-sandbox-workspaces' ? nestedWorkingDirectory : workspace,
									shell: '/bin/sh', login: false, yield_time_ms: 1000, max_output_tokens: 1000,
								}),
							}],
						},
						{ kind: 'content', chunks: [{ content: 'Sandbox probe complete.', delayMs: 0 }] },
					],
				},
			})),
		});
	});

	suiteTeardown(async function () {
		this.timeout(60_000);
		if (server) {
			await stopServer(server);
		}
		if (fixtureRoot) {
			await rm(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		}
	});

	setup(async function () {
		this.timeout(30_000);
		assert.ok(server);
		client = new TestProtocolClient(server.port);
		clientId = generateUuid();
		clientSeq = 0;
		await client.connect();
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId });
		await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: 'not-a-real-token' }, 30_000);
	});

	teardown(async () => {
		try {
			for (const session of sessions.splice(0)) {
				await client.call('disposeSession', { session });
			}
		} finally {
			client.close();
		}
	});

	async function createSession(plugins: ClientPluginCustomization[] = [], preset: CodexPermissionsPreset = 'auto-review', workingDirectories: readonly string[] = [workspace]): Promise<string> {
		const session = URI.from({ scheme: 'codex', path: `/${generateUuid()}` }).toString();
		await client.call('createSession', {
			channel: session,
			provider: 'codex',
			workingDirectories: workingDirectories.map(path => URI.file(path).toString()),
			config: { isolation: 'folder', [CodexSessionConfigKey.PermissionsPreset]: preset },
			activeClient: { clientId, tools: [], customizations: plugins },
		}, 30_000);
		sessions.push(session);
		await client.call('subscribe', { channel: session });
		await client.call('subscribe', { channel: buildDefaultChatUri(session) });
		return session;
	}

	async function probe(session: string, scenario: string) {
		const requestOffset = server!.mockLlm?.getRequests?.().length ?? 0;
		const chat = buildDefaultChatUri(session);
		const turnId = generateUuid();
		client.dispatch({
			channel: chat,
			clientSeq: ++clientSeq,
			action: {
				type: ActionType.ChatTurnStarted,
				turnId,
				startedAt: new Date().toISOString(),
				message: { text: `[scenario:${scenario}] Run the sandbox probe.`, origin: { kind: MessageKind.User } },
			},
		});
		await client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.ChatTurnComplete)
			&& getActionEnvelope(notification).channel === chat
			&& (getActionEnvelope(notification).action as { turnId?: string }).turnId === turnId,
			60_000,
		);
		// Observe the real command result delivered to the model, independently
		// of the mock model's final reply and the host's tool display formatting.
		const requests = (server!.mockLlm?.getRequests?.() ?? []).slice(requestOffset) as readonly ICapturedRequest[];
		const responses = requests.filter(request => request.path.includes('/responses'));
		const output = responses.flatMap(request => request.body.input ?? [])
			.filter(item => item.type === 'function_call_output')
			.map(item => item.output ?? '').at(-1) ?? '';
		return {
			requestText: JSON.stringify(responses),
			output: output || JSON.stringify(client.receivedNotifications(notification =>
				isActionNotification(notification, ActionType.ChatError) && getActionEnvelope(notification).channel === chat)),
			access: Array.from(output.matchAll(/^\w+=\d+$/gm), match => match[0]),
		};
	}

	test('Auto-Review reads discovered skill resources without granting private reads or customization writes', async function () {
		this.timeout(90_000);
		const session = await createSession();
		const result = await probe(session, 'codex-sandbox-skills');
		assert.deepStrictEqual({
			skillDiscovered: result.requestText.includes('CODEX_SANDBOX_SKILL_MARKER'),
			access: result.access,
		}, {
			skillDiscovered: true,
			access: ['skill_read=0', 'reference_read=0', 'private_read=1', 'skill_write=1', 'workspace_write=0'],
		}, result.output);
	});

	test('reads cached Codex plugin skills and their references', async function () {
		this.timeout(90_000);
		const session = await createSession();
		const result = await probe(session, 'codex-sandbox-cache');
		assert.deepStrictEqual({
			pluginDiscovered: result.requestText.includes('CODEX_SANDBOX_CACHE_MARKER'),
			access: result.access,
		}, {
			pluginDiscovered: true,
			access: ['cached_skill_read=0', 'cached_reference_read=0', 'private_read=1'],
		}, result.output);
	});

	test('permission changes reload the sandbox without losing discovered read access', async function () {
		this.timeout(90_000);
		const session = await createSession([], 'full-access');
		const fullAccess = await probe(session, 'codex-sandbox-skills');
		client.dispatch({
			channel: session,
			clientSeq: ++clientSeq,
			action: { type: ActionType.SessionConfigChanged, config: { [CodexSessionConfigKey.PermissionsPreset]: 'auto-review' } },
		});
		await client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.SessionConfigChanged) && getActionEnvelope(notification).channel === session,
		);
		const autoReview = await probe(session, 'codex-sandbox-skills');
		client.clearReceived();
		client.dispatch({
			channel: session,
			clientSeq: ++clientSeq,
			action: {
				type: ActionType.SessionConfigChanged,
				replace: true,
				config: { isolation: 'folder', [CodexSessionConfigKey.SandboxMode]: 'read-only' },
			},
		});
		await client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.SessionConfigChanged) && getActionEnvelope(notification).channel === session,
		);
		const readOnly = await probe(session, 'codex-sandbox-skills');
		assert.deepStrictEqual({
			fullAccess: fullAccess.access,
			autoReview: autoReview.access,
			readOnly: readOnly.access,
		}, {
			fullAccess: ['skill_read=0', 'reference_read=0', 'private_read=0', 'skill_write=0', 'workspace_write=0'],
			autoReview: ['skill_read=0', 'reference_read=0', 'private_read=1', 'skill_write=1', 'workspace_write=0'],
			readOnly: ['skill_read=0', 'reference_read=0', 'private_read=1', 'skill_write=1', 'workspace_write=1'],
		}, JSON.stringify({ autoReview: autoReview.output, readOnly: readOnly.output }));
	});

	test('keeps every workspace root accessible from a nested cwd without downgrading a workspace skill', async function () {
		this.timeout(90_000);
		await client.call('subscribe', { channel: ROOT_STATE_URI });
		client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq: ++clientSeq,
			action: { type: ActionType.RootConfigChanged, config: { [AgentHostCodexMultiRootEnabledConfigKey]: true } },
		});
		await client.waitForNotification(notification => isActionNotification(notification, ActionType.RootConfigChanged));
		const session = await createSession([], 'auto-review', [workspace, secondaryWorkspace]);
		const result = await probe(session, 'codex-sandbox-workspaces');
		assert.deepStrictEqual({
			skillDiscovered: result.requestText.includes('CODEX_SANDBOX_WORKSPACE_SKILL_MARKER'),
			access: result.access,
		}, {
			skillDiscovered: true,
			access: ['parent_read=0', 'secondary_read=0', 'workspace_skill_write=0', 'secondary_write=0', 'private_read=1'],
		}, result.output);
	});

	test('reads enabled client plugin resources without granting a disabled session access', async function () {
		this.timeout(90_000);
		const pluginUri = URI.file(clientPluginDirectory).toString();
		const plugin: ClientPluginCustomization = {
			type: CustomizationType.Plugin,
			id: customizationId(pluginUri),
			uri: pluginUri as ProtocolURI,
			name: 'Sandbox Plugin',
			nonce: '1',
		};
		const enabledSession = await createSession([plugin]);
		const state = await fetchSessionWithChat(client, enabledSession);
		const publishedPlugin = state.customizations?.find(customization => customization.id === plugin.id);
		assert.ok(publishedPlugin?.type === CustomizationType.Plugin);
		const skill = publishedPlugin.children?.find(child => child.type === CustomizationType.Skill && child.name === 'plugin-probe');
		assert.ok(skill, 'the synchronized plugin must publish its skill path');
		const skillPath = URI.parse(skill.uri).fsPath;
		pluginCommand = [
			readProbe('plugin_skill_read', skillPath),
			readProbe('plugin_reference_read', join(dirname(skillPath), '..', '..', 'shared', 'guide.txt')),
		].join('\n');
		const enabled = await probe(enabledSession, 'codex-sandbox-plugin');
		// Keep the enabled session alive so its filesystem grants cannot leak
		// into another session where the same plugin is disabled.
		const disabledSession = await createSession([{
			...plugin,
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		}]);
		const disabled = await probe(disabledSession, 'codex-sandbox-plugin');
		client.dispatch({
			channel: enabledSession,
			clientSeq: ++clientSeq,
			action: {
				type: ActionType.SessionCustomizationToggled,
				id: plugin.id,
				enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
			},
		});
		await client.waitForNotification(notification => {
			if (!isActionNotification(notification, ActionType.SessionCustomizationUpdated)) {
				return false;
			}
			const { channel, action } = getActionEnvelope(notification);
			return channel === enabledSession && action.type === ActionType.SessionCustomizationUpdated
				&& action.customization.type === CustomizationType.Plugin && action.customization.id === plugin.id
				&& action.customization.enablement?.some(entry => entry.kind === CustomizationEnablementKind.Session && !entry.enabled) === true;
		});
		const disabledAfterUse = await probe(enabledSession, 'codex-sandbox-plugin');
		assert.deepStrictEqual({
			pluginDiscovered: enabled.requestText.includes('CODEX_SANDBOX_PLUGIN_MARKER'),
			enabled: enabled.access,
			disabled: disabled.access,
			disabledAfterUse: disabledAfterUse.access,
		}, {
			pluginDiscovered: true,
			enabled: ['plugin_skill_read=0', 'plugin_reference_read=0'],
			disabled: ['plugin_skill_read=1', 'plugin_reference_read=1'],
			disabledAfterUse: ['plugin_skill_read=1', 'plugin_reference_read=1'],
		}, JSON.stringify({ enabled: enabled.output, disabled: disabled.output, disabledAfterUse: disabledAfterUse.output }));
	});
});
