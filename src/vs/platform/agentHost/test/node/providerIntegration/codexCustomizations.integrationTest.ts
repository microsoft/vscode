/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent Host integration tests using the real Codex App Server and a synthetic local LLM.
 */

import assert from 'assert';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ActionType, type RootAgentsChangedAction } from '../../../common/state/sessionActions.js';
import { AgentHostCodexEnabledConfigKey } from '../../../common/agentHostSchema.js';
import { CodexSessionConfigKey } from '../../../common/codexSessionConfigKeys.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../../common/agent.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { type SubscribeResult } from '../../../common/state/protocol/commands.js';
import { buildDefaultChatUri, customizationId, CustomizationType, MessageKind, ROOT_STATE_URI, type ClientPluginCustomization, type DirectoryCustomization, type PluginCustomization, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, type IServerHandle, startRealServer, stopServer, TestProtocolClient } from '../serverIntegrationTestHelpers.js';
import { CODEX_SDK_ROOT } from '../e2e/providers/codexTestConfiguration.js';
import { driveTurnToCompletion } from '../e2e/harness/agentHostE2ETestHarness.js';

const AGENT_MARKER = 'CODEX_CUSTOM_AGENT_INSTRUCTION_MARKER';
const WORKSPACE_AGENT_MARKER = 'CODEX_WORKSPACE_AGENT_INSTRUCTION_MARKER';
const RULE_MARKER = 'CODEX_PLUGIN_RULE_MARKER';
const SKILL_MARKER = 'CODEX_PLUGIN_SKILL_DESCRIPTION_MARKER';
const SKILL_BODY_MARKER = 'CODEX_CLIENT_SKILL_BODY_READ_SUCCEEDED';
const NATIVE_SKILL_MARKER = 'CODEX_NATIVE_SKILL_DESCRIPTION_MARKER';
const MCP_MARKER = 'CODEX_PLUGIN_MCP_TOOL_MARKER';
const nodeRequire = createRequire(import.meta.url);

interface ICapturedRequest {
	readonly path: string;
	readonly body: unknown;
}

function developerInputText(body: unknown): string {
	const input = (body as { readonly input?: unknown } | undefined)?.input;
	return Array.isArray(input)
		? JSON.stringify(input.filter(item => item && typeof item === 'object' && (item as { readonly role?: unknown }).role === 'developer'))
		: '';
}

async function waitForParsedPlugin(client: TestProtocolClient, sessionUri: string, pluginUri: string): Promise<PluginCustomization> {
	const deadline = Date.now() + 60_000;
	let lastPlugin: PluginCustomization | undefined;
	while (Date.now() < deadline) {
		const session = await fetchSessionWithChat(client, sessionUri);
		const plugin = session.customizations?.find((customization): customization is PluginCustomization =>
			customization.type === CustomizationType.Plugin
			&& customization.uri === pluginUri
		);
		lastPlugin = plugin;
		if (plugin && (plugin.children?.length ?? 0) > 0) {
			return plugin;
		}
		await new Promise<void>(resolve => setTimeout(resolve, 100));
	}
	throw new Error(`Timed out waiting for parsed plugin ${pluginUri}; last state: ${JSON.stringify(lastPlugin)}`);
}

async function waitForWorkspaceAgent(client: TestProtocolClient, sessionUri: string, agentUri: string): Promise<DirectoryCustomization> {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		const session = await fetchSessionWithChat(client, sessionUri);
		const directory = session.customizations?.find((customization): customization is DirectoryCustomization =>
			customization.type === CustomizationType.Directory
			&& customization.contents === CustomizationType.Agent
			&& customization.children?.some(child => child.type === CustomizationType.Agent && child.uri === agentUri) === true
		);
		if (directory) {
			return directory;
		}
		await new Promise<void>(resolve => setTimeout(resolve, 100));
	}
	throw new Error(`Timed out waiting for workspace agent ${agentUri}`);
}

suite('Agent Host Provider Integration — Codex Customizations', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	let userHomeDir: string;
	let skillCommand = '';
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	suiteSetup(async function () {
		this.timeout(120_000);
		if (!CODEX_SDK_ROOT) {
			this.skip();
		}
		userHomeDir = await mkdtemp(join(process.cwd(), '.build', 'codex-customizations-home-'));
		const codexHomeDir = join(userHomeDir, '.codex');
		await mkdir(codexHomeDir, { recursive: true });
		const nativeSkillDirectory = join(userHomeDir, '.agents', 'skills', 'native-skill');
		await mkdir(nativeSkillDirectory, { recursive: true });
		await writeFile(join(nativeSkillDirectory, 'SKILL.md'), `---\nname: native-skill\ndescription: ${NATIVE_SKILL_MARKER}\n---\nUse this native skill when requested.`);
		server = await startRealServer({
			mockLlm: true,
			codexSdkRoot: CODEX_SDK_ROOT,
			codexHomeDir,
			homeDir: userHomeDir,
			userDataDir: join(userHomeDir, 'user-data'),
			mockScenarios: [{
				id: 'codex-client-skill-access',
				definition: {
					type: 'multi-turn',
					turns: [
						{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^(shell|exec_command)$/, arguments: () => ({ command: ['/bin/sh', '-c', skillCommand], cmd: skillCommand, max_output_tokens: 1500 }) }] },
						{ kind: 'content', chunks: [{ content: 'Skill access checked.', delayMs: 0 }] },
					],
				},
			}],
		});
	});

	suiteTeardown(async function () {
		this.timeout(60_000);
		await stopServer(server);
		await rm(userHomeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
	});

	setup(async function () {
		this.timeout(120_000);
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(async function () {
		for (const session of createdSessions) {
			try {
				await client.call('disposeSession', { session }, 5000);
			} catch { /* best-effort */ }
		}
		createdSessions.length = 0;
		client.close();

		for (const dir of tempDirs) {
			try {
				await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch { /* best-effort */ }
		}
		tempDirs.length = 0;
	});

	test('client plugin agents, instructions, skills, and MCP reach Codex', async function () {
		this.timeout(180_000);

		const workspaceDir = await mkdtemp(join(tmpdir(), 'codex-customizations-workspace-'));
		const pluginDir = await mkdtemp(join(tmpdir(), 'codex-customizations-plugin-'));
		tempDirs.push(workspaceDir, pluginDir);

		const agentFile = join(pluginDir, 'agents', 'reviewer.agent.md');
		const skillFile = join(pluginDir, 'skills', 'customization-skill', 'SKILL.md');
		const instructionFile = join(pluginDir, 'rules', 'customization.instructions.md');
		const mcpScript = join(pluginDir, 'customization-mcp.cjs');
		const mcpConfigFile = join(pluginDir, '.mcp.json');
		const pluginUri = URI.file(pluginDir).toString();

		await Promise.all([
			mkdir(join(pluginDir, '.plugin'), { recursive: true }),
			mkdir(join(pluginDir, 'agents'), { recursive: true }),
			mkdir(join(pluginDir, 'skills', 'customization-skill'), { recursive: true }),
			mkdir(join(pluginDir, 'rules'), { recursive: true }),
		]);

		const mcpServerModule = nodeRequire.resolve('@modelcontextprotocol/sdk/server/index.js');
		const mcpStdioModule = nodeRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js');
		const mcpTypesModule = nodeRequire.resolve('@modelcontextprotocol/sdk/types.js');
		await Promise.all([
			writeFile(join(pluginDir, '.plugin', 'plugin.json'), JSON.stringify({ name: 'Codex Customizations Test Plugin' })),
			writeFile(agentFile, [
				'---',
				'name: Codex Custom Reviewer',
				'description: Reviews changes using the integration-test policy.',
				'---',
				`Always follow ${AGENT_MARKER}.`,
			].join('\n')),
			writeFile(instructionFile, [
				'---',
				'name: Codex Integration Rule',
				'applyTo:',
				'  - "**/*"',
				'---',
				`Always follow ${RULE_MARKER}.`,
			].join('\n')),
			writeFile(skillFile, [
				'---',
				'name: customization-skill',
				`description: ${SKILL_MARKER}`,
				'---',
				'Use this skill when validating Codex customization propagation.',
			].join('\n')),
			writeFile(mcpScript, [
				`const { Server } = require(${JSON.stringify(mcpServerModule)});`,
				`const { StdioServerTransport } = require(${JSON.stringify(mcpStdioModule)});`,
				`const { CallToolRequestSchema, ListToolsRequestSchema } = require(${JSON.stringify(mcpTypesModule)});`,
				`const server = new Server({ name: "codex-customization-test", version: "1.0.0" }, { capabilities: { tools: {} } });`,
				`server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "customization_probe", description: ${JSON.stringify(MCP_MARKER)}, inputSchema: { type: "object", properties: {} } }] }));`,
				`server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: "text", text: "customization MCP response" }] }));`,
				'void server.connect(new StdioServerTransport());',
			].join('\n')),
			writeFile(mcpConfigFile, JSON.stringify({
				mcpServers: {
					customization_test: {
						command: process.execPath,
						args: [mcpScript],
						env: { ELECTRON_RUN_AS_NODE: '1' },
					},
				},
			})),
		]);

		const clientId = 'codex-customizations-client';
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId }, 30_000);
		await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: 'not-a-real-token' }, 30_000);
		const pluginCustomization: ClientPluginCustomization = {
			type: CustomizationType.Plugin,
			id: customizationId(pluginUri),
			uri: pluginUri as ProtocolURI,
			name: 'Codex Customizations Test Plugin',
			nonce: '1',
		};

		const sessionUri = URI.from({ scheme: 'codex', path: `/${generateUuid()}` }).toString();
		await client.call('createSession', {
			channel: sessionUri,
			provider: 'codex',
			workingDirectories: [URI.file(workspaceDir).toString()],
			config: { isolation: 'folder' },
			activeClient: {
				clientId,
				tools: [],
				customizations: [pluginCustomization],
			},
		}, 30_000);
		createdSessions.push(sessionUri);
		await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		await client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
		client.clearReceived();

		const parsedPlugin = await waitForParsedPlugin(client, sessionUri, pluginUri);
		assert.deepStrictEqual(
			new Set(parsedPlugin.children?.map(child => child.type)),
			new Set([CustomizationType.Agent, CustomizationType.Rule, CustomizationType.Skill, CustomizationType.McpServer]),
		);

		const turnId = 'turn-codex-customizations';
		client.dispatch({
			channel: buildDefaultChatUri(sessionUri),
			clientSeq: 1,
			action: {
				type: ActionType.ChatTurnStarted,
				turnId,
				startedAt: '2026-08-04T00:00:00.000Z',
				message: {
					text: 'Reply with exactly CODEX_CUSTOMIZATIONS_OK.',
					origin: { kind: MessageKind.User },
					agent: { uri: URI.file(agentFile).toString() },
				},
			},
		});
		await client.waitForNotification(notification =>
			isActionNotification(notification, 'chat/turnComplete')
			&& getActionEnvelope(notification).channel === buildDefaultChatUri(sessionUri)
			&& (getActionEnvelope(notification).action as { turnId?: string }).turnId === turnId,
			120_000,
		);
		assert.deepStrictEqual(client.receivedNotifications(notification => isActionNotification(notification, 'chat/error')), [], 'Codex must complete the turn without errors');
		const rolloutRoot = join(userHomeDir, '.codex', 'sessions');
		const rolloutFiles = (await readdir(rolloutRoot, { recursive: true })).filter(file => file.endsWith('.jsonl'));
		const rolloutContents = await Promise.all(rolloutFiles.map(file => readFile(join(rolloutRoot, file), 'utf8')));
		assert.ok(rolloutContents.some(content => content.includes('CODEX_CUSTOMIZATIONS_OK')), 'Codex test rollouts must be written under the isolated test home');

		const requests = (server.mockLlm?.getRequests?.() ?? []) as readonly ICapturedRequest[];
		const responsesRequest = [...requests].reverse().find(request => request.path.includes('/responses'));
		assert.ok(responsesRequest, `expected a Codex /responses request; got paths: ${requests.map(request => request.path).join(', ')}`);
		const requestText = JSON.stringify(responsesRequest.body);
		const developerText = developerInputText(responsesRequest.body);
		assert.ok(developerText.includes(AGENT_MARKER), 'selected custom-agent instructions must reach the Codex developer message');
		assert.ok(developerText.includes(RULE_MARKER), 'plugin instructions must reach the Codex developer message');
		assert.ok(requestText.includes(SKILL_MARKER), 'plugin skills must be advertised in the Codex model request');
		assert.ok(requestText.includes(MCP_MARKER), 'plugin MCP tools must be advertised in the Codex model request');
	});

	test('client skill additions and removals after the first turn stay isolated from other sessions', async function () {
		this.timeout(180_000);
		const workspaceDir = await mkdtemp(join(tmpdir(), 'codex-skill-updates-workspace-'));
		const otherWorkspaceDir = await mkdtemp(join(tmpdir(), 'codex-skill-updates-other-workspace-'));
		const pluginDir = await mkdtemp(join(tmpdir(), 'codex-skill-updates-plugin-'));
		tempDirs.push(workspaceDir, otherWorkspaceDir, pluginDir);
		await mkdir(join(pluginDir, '.plugin'), { recursive: true });
		await mkdir(join(pluginDir, 'skills', 'client-skill'), { recursive: true });
		await writeFile(join(pluginDir, '.plugin', 'plugin.json'), JSON.stringify({ name: 'skill-updates', version: '1.0.0' }));
		await writeFile(join(pluginDir, 'skills', 'client-skill', 'SKILL.md'), `---\nname: client-skill\ndescription: ${SKILL_MARKER}\n---\n${SKILL_BODY_MARKER}`);
		const pluginUri = URI.file(pluginDir).toString();
		const pluginCustomization: ClientPluginCustomization = {
			type: CustomizationType.Plugin,
			id: customizationId(pluginUri),
			uri: pluginUri as ProtocolURI,
			name: 'Skill Updates',
			nonce: '1',
		};
		const clientId = 'codex-skill-updates-client';
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId }, 30_000);
		await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: 'not-a-real-token' }, 30_000);
		const sessions: string[] = [];
		for (const directory of [workspaceDir, otherWorkspaceDir]) {
			const sessionUri = URI.from({ scheme: 'codex', path: `/${generateUuid()}` }).toString();
			await client.call('createSession', {
				channel: sessionUri,
				provider: 'codex',
				workingDirectories: [URI.file(directory).toString()],
				config: { isolation: 'folder' },
				activeClient: { clientId, tools: [], customizations: [] },
			}, 30_000);
			createdSessions.push(sessionUri);
			sessions.push(sessionUri);
			await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			await client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
		}
		const [sessionUri, otherSessionUri] = sessions;
		const latestCatalog = (request: ICapturedRequest): string => developerInputText(request.body).match(/<client_skills>[\s\S]*?<\/client_skills>/g)?.at(-1) ?? '';
		let clientSeq = 1;
		const send = async (session: string, turnId: string, command?: string): Promise<ICapturedRequest> => {
			const requestCount = server.mockLlm?.getRequests?.().length ?? 0;
			skillCommand = command ?? '';
			await driveTurnToCompletion(client, session, turnId, command ? '[scenario:codex-client-skill-access] Check skill file access.' : 'Reply exactly READY.', clientSeq++);
			const requests = (server.mockLlm?.getRequests?.() ?? []) as readonly ICapturedRequest[];
			const request = requests.slice(requestCount).reverse().find(request => request.path.includes('/responses'));
			assert.ok(request, 'each turn must make a fresh Codex model request');
			assert.ok(JSON.stringify(request.body).includes(NATIVE_SKILL_MARKER), 'native user skills must remain available');
			return request;
		};
		const toolOutput = (request: ICapturedRequest): string => {
			const body = request.body as { readonly input: readonly { readonly type?: string; readonly output?: string }[] };
			const output = body.input.filter(item => item.type === 'function_call_output').at(-1)?.output;
			assert.ok(output, 'the native shell must return a tool result');
			return output;
		};
		const updateSkills = (customizations: ClientPluginCustomization[]) => {
			client.clearReceived();
			client.dispatch({
				channel: sessionUri,
				clientSeq: clientSeq++,
				action: { type: ActionType.SessionActiveClientSet, activeClient: { clientId, tools: [], customizations } },
			});
		};

		const first = await send(sessionUri, 'before-skill-addition');
		assert.ok(!JSON.stringify(first.body).includes(SKILL_MARKER));
		updateSkills([pluginCustomization]);
		const parsedPlugin = await waitForParsedPlugin(client, sessionUri, pluginUri);
		const added = await send(sessionUri, 'after-skill-addition');
		assert.strictEqual(latestCatalog(added).split(SKILL_MARKER).length - 1, 1, 'the added skill must be advertised once');
		const skill = parsedPlugin.children?.find(child => child.type === CustomizationType.Skill);
		assert.ok(skill);
		assert.ok(latestCatalog(added).includes(JSON.stringify(URI.parse(skill.uri).fsPath).slice(1, -1)), 'the catalog must point to the synced skill file');
		const skillFile = URI.parse(skill.uri).fsPath;
		const readSkillCommand = `cat ${JSON.stringify(skillFile)}`;
		if (process.platform !== 'win32') {
			const unrelatedFile = join(userHomeDir, 'unrelated.txt');
			const workspaceFile = join(workspaceDir, 'skill-access.txt');
			await writeFile(unrelatedFile, 'UNRELATED_FILE_MUST_NOT_BE_READ');
			const access = await send(sessionUri, 'read-active-skill', [
				readSkillCommand,
				`cat ${JSON.stringify(unrelatedFile)}`,
				`printf unexpected > ${JSON.stringify(skillFile)}`,
				`printf workspace-write-allowed > ${JSON.stringify(workspaceFile)}`,
			].join('; '));
			assert.ok(toolOutput(access).includes(SKILL_BODY_MARKER), 'the active skill must be readable outside the workspace and temp directory');
			assert.ok(!toolOutput(access).includes('UNRELATED_FILE_MUST_NOT_BE_READ'), 'unrelated files must stay unreadable');
			assert.ok((await readFile(skillFile, 'utf8')).includes(SKILL_BODY_MARKER), 'skill read access must not grant write access');
			assert.strictEqual(await readFile(workspaceFile, 'utf8'), 'workspace-write-allowed', 'workspace permissions must be preserved');
			client.clearReceived();
			client.dispatch({ channel: sessionUri, clientSeq: clientSeq++, action: { type: ActionType.SessionConfigChanged, config: { [CodexSessionConfigKey.NetworkAccessEnabled]: true } } });
			await client.waitForNotification(notification => isActionNotification(notification, ActionType.SessionConfigChanged), 60_000);
			const changedPermissions = await send(sessionUri, 'read-skill-after-permission-change', readSkillCommand);
			assert.ok(toolOutput(changedPermissions).includes(SKILL_BODY_MARKER), 'changing the permission profile must preserve active skill read access');
		}

		const other = await send(otherSessionUri, 'other-session-without-client-skills', process.platform !== 'win32' ? readSkillCommand : undefined);
		assert.ok(!JSON.stringify(other.body).includes(SKILL_MARKER), 'client skills must not leak into another workspace');
		const otherState = await fetchSessionWithChat(client, otherSessionUri);
		assert.ok(!JSON.stringify(otherState.customizations).includes('client-skill'), 'client skills must not leak into the native customization catalog');
		if (process.platform !== 'win32') {
			assert.ok(!toolOutput(other).includes(SKILL_BODY_MARKER), 'other sessions must not inherit skill read access');
		}

		updateSkills([]);
		await client.waitForNotification(notification => {
			if (!isActionNotification(notification, 'session/customizationRemoved')) {
				return false;
			}
			const envelope = getActionEnvelope(notification);
			return envelope.channel === sessionUri
				&& envelope.action.type === ActionType.SessionCustomizationRemoved
				&& envelope.action.id === pluginCustomization.id;
		}, 60_000);
		const removed = await send(sessionUri, 'after-skill-removal', process.platform !== 'win32' ? readSkillCommand : undefined);
		assert.ok(latestCatalog(removed).includes('No client skills are currently available.'), 'removal must explicitly clear the current catalog');
		assert.ok(!latestCatalog(removed).includes(SKILL_MARKER), 'removed skills must not remain in the current catalog');
		if (process.platform !== 'win32') {
			assert.ok((await readFile(skillFile, 'utf8')).includes(SKILL_BODY_MARKER), 'the cached skill must still exist for the revocation check');
			assert.ok(!toolOutput(removed).includes(SKILL_BODY_MARKER), 'removing a skill must revoke its read access');
		}
	});

	test('workspace agent is exposed and selected without client customization sync', async function () {
		this.timeout(180_000);

		const workspaceDir = await mkdtemp(join(tmpdir(), 'codex-workspace-agent-'));
		tempDirs.push(workspaceDir);
		const agentsDir = join(workspaceDir, '.github', 'agents');
		const agentFile = join(agentsDir, 'workspace-reviewer.agent.md');
		const agentUri = URI.file(agentFile).toString();
		await mkdir(agentsDir, { recursive: true });
		await writeFile(agentFile, [
			'---',
			'name: Workspace Reviewer',
			'description: Reviews this workspace.',
			'---',
			`Always follow ${WORKSPACE_AGENT_MARKER}.`,
		].join('\n'));

		const clientId = 'codex-workspace-agent-client';
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId }, 30_000);
		await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: 'not-a-real-token' }, 30_000);
		const sessionUri = URI.from({ scheme: 'codex', path: `/${generateUuid()}` }).toString();
		await client.call('createSession', {
			channel: sessionUri,
			provider: 'codex',
			workingDirectories: [URI.file(workspaceDir).toString()],
			config: { isolation: 'folder' },
			activeClient: { clientId, tools: [], customizations: [] },
		}, 30_000);
		createdSessions.push(sessionUri);
		await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		await client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
		client.clearReceived();

		const directory = await waitForWorkspaceAgent(client, sessionUri, agentUri);
		assert.deepStrictEqual(directory.children?.map(child => ({ type: child.type, name: child.name, uri: child.uri })), [{
			type: CustomizationType.Agent,
			name: 'Workspace Reviewer',
			uri: agentUri,
		}]);

		const turnId = 'turn-codex-workspace-agent';
		client.dispatch({
			channel: buildDefaultChatUri(sessionUri),
			clientSeq: 1,
			action: {
				type: ActionType.ChatTurnStarted,
				turnId,
				startedAt: '2026-08-13T00:00:00.000Z',
				message: {
					text: 'Reply with exactly CODEX_WORKSPACE_AGENT_OK.',
					origin: { kind: MessageKind.User },
					agent: { uri: agentUri },
				},
			},
		});
		await client.waitForNotification(notification =>
			isActionNotification(notification, 'chat/turnComplete')
			&& getActionEnvelope(notification).channel === buildDefaultChatUri(sessionUri)
			&& (getActionEnvelope(notification).action as { turnId?: string }).turnId === turnId,
			120_000,
		);

		const requests = (server.mockLlm?.getRequests?.() ?? []) as readonly ICapturedRequest[];
		const responsesRequest = [...requests].reverse().find(request => request.path.includes('/responses'));
		assert.ok(responsesRequest, `expected a Codex /responses request; got paths: ${requests.map(request => request.path).join(', ')}`);
		assert.ok(developerInputText(responsesRequest.body).includes(WORKSPACE_AGENT_MARKER), 'selected workspace-agent instructions must reach the Codex developer message');
	});

	test('standalone host registers Codex after runtime enablement', async function () {
		this.timeout(120_000);
		const runtimeHomeDir = await mkdtemp(join(tmpdir(), 'codex-runtime-enablement-home-'));
		const workspaceDir = await mkdtemp(join(tmpdir(), 'codex-runtime-enablement-'));
		const runtimeCodexHomeDir = join(runtimeHomeDir, '.codex');
		await mkdir(runtimeCodexHomeDir, { recursive: true });
		const runtimeServer = await startRealServer({
			mockLlm: true,
			codexSdkRoot: CODEX_SDK_ROOT,
			codexHomeDir: runtimeCodexHomeDir,
			codexAgentEnabled: false,
			homeDir: runtimeHomeDir,
			userDataDir: join(runtimeHomeDir, 'user-data'),
		});
		const runtimeClient = new TestProtocolClient(runtimeServer.port);
		try {
			await runtimeClient.connect();
			await runtimeClient.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'codex-runtime-enablement-client' }, 30_000);
			await runtimeClient.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
			runtimeClient.clearReceived();
			runtimeClient.dispatch({
				channel: ROOT_STATE_URI,
				clientSeq: 1,
				action: { type: ActionType.RootConfigChanged, config: { [AgentHostCodexEnabledConfigKey]: true } },
			});
			await runtimeClient.waitForNotification(notification =>
				isActionNotification(notification, ActionType.RootConfigChanged)
				&& (getActionEnvelope(notification).action as { readonly config?: Readonly<Record<string, boolean>> }).config?.[AgentHostCodexEnabledConfigKey] === true,
				30_000,
			);
			await runtimeClient.waitForNotification(notification =>
				isActionNotification(notification, ActionType.RootAgentsChanged)
				&& (getActionEnvelope(notification).action as RootAgentsChangedAction).agents.some(agent => agent.provider === 'codex'),
				30_000,
			);
			await runtimeClient.call('authenticate', { channel: ROOT_STATE_URI, resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: 'not-a-real-token' }, 30_000);

			const sessionUri = URI.from({ scheme: 'codex', path: `/${generateUuid()}` }).toString();
			await runtimeClient.call('createSession', {
				channel: sessionUri,
				provider: 'codex',
				workingDirectories: [URI.file(workspaceDir).toString()],
				config: { isolation: 'folder' },
			}, 30_000);
		} finally {
			runtimeClient.close();
			await stopServer(runtimeServer);
			await Promise.all([
				rm(runtimeHomeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
				rm(workspaceDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
			]);
		}
	});
});
