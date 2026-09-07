/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { AgentHostConfigKey } from '../../../../common/agentHostCustomizationConfig.js';
import { AgentHostAutoReplyEnabledConfigKey } from '../../../../common/agentHostSchema.js';
import { buildUncommittedChangesetUri } from '../../../../common/changesetUri.js';
import { CopilotCliConfigKey } from '../../../../common/copilotCliConfig.js';
import { CompletionItemKind, type CompletionsResult, type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType, type ChatErrorAction, type ChatToolCallCompleteAction, type ChatToolCallContentChangedAction, type ChatToolCallReadyAction, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageKind, ResponsePartKind, ROOT_STATE_URI, ToolCallStatus, ToolResultContentType, type ChangesetState, type SessionState } from '../../../../common/state/sessionState.js';
import type { TerminalCommandPart, TerminalState } from '../../../../common/state/protocol/channels-terminal/state.js';
import { assertToolCallCompleteText, createRealSession, dispatchTurn, driveTurnToCompletion, getMarkdownResponseText, initTestGitRepo, resolveGitHubToken, terminalResourceFromContent } from '../harness/agentHostE2ETestHarness.js';
import { expandShellToolName } from '../harness/shellToolNames.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const nodeRequire = createRequire(import.meta.url);

function startedToolNames(context: IAgentHostE2ETestContext, turnId: string): string[] {
	return context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
		.map(n => getActionEnvelope(n).action as ChatToolCallStartAction)
		.filter(action => action.turnId === turnId)
		.map(action => action.toolName);
}

export function defineCopilotCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}
	const { config, createdSessions, tempDirs } = context;

	async function initialize(clientId: string, workingDirectory: string): Promise<void> {
		context.client.setWorkingDirectory(workingDirectory);
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId,
		}, 30_000);
		await context.client.call('authenticate', {
			channel: ROOT_STATE_URI,
			resource: 'https://api.github.com',
			token: config.githubToken ?? resolveGitHubToken(),
		}, 30_000);
	}

	async function createWorkspacelessSession(prefix: string): Promise<string> {
		const clientWorkingDirectory = mkdtempSync(join(tmpdir(), `ahp-${prefix}-client-`));
		tempDirs.push(clientWorkingDirectory);
		await initialize(`${prefix}-client`, clientWorkingDirectory);
		const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', {
			channel: sessionUri,
			provider: config.provider,
			config: { isolation: 'folder' },
		}, 30_000);
		createdSessions.push(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		await context.client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
		context.client.clearReceived();
		return sessionUri;
	}

	async function createWorkspaceSession(prefix: string, beforeCreateSession?: () => Promise<void>): Promise<{ sessionUri: string; workspace: string }> {
		const workspace = mkdtempSync(join(tmpdir(), `ahp-${prefix}-`));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `${prefix}-client`, createdSessions, URI.file(workspace), beforeCreateSession);
		return { sessionUri, workspace };
	}

	async function setRootConfig(config: Record<string, unknown>, clientSeq: number): Promise<void> {
		await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		context.client.clearReceived();
		context.client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq,
			action: { type: ActionType.RootConfigChanged, config },
		});
		await context.client.waitForNotification(n => {
			if (!isActionNotification(n, ActionType.RootConfigChanged)) {
				return false;
			}
			const action = getActionEnvelope(n).action as { readonly config?: Readonly<Record<string, unknown>> };
			return Object.entries(config).every(([key, value]) => JSON.stringify(action.config?.[key]) === JSON.stringify(value));
		}, 30_000);
	}

	async function driveToolSearchTurn(sessionUri: string, turnId: string, toolSearchResult: string): Promise<{ toolNames: string[]; responseText: string }> {
		const chatUri = buildDefaultChatUri(sessionUri);
		const starts = new Map<string, string>();
		const seen = new Set<object>();
		let clientSeq = 10;
		context.client.clearReceived();
		context.client.dispatch({
			channel: chatUri,
			clientSeq: 1,
			action: {
				type: ActionType.ChatTurnStarted,
				turnId,
				startedAt: new Date().toISOString(),
				message: {
					text: 'Search for the get_magic_word tool before using it. Call get_magic_word exactly once, then reply with only its result.',
					origin: { kind: MessageKind.User },
					model: { id: 'gpt-5.6-sol' },
				},
			},
		});

		while (true) {
			const notification = await context.client.waitForNotification(n => {
				if (seen.has(n as object) || getActionEnvelope(n).channel !== chatUri) {
					return false;
				}
				return isActionNotification(n, 'chat/toolCallStart')
					|| isActionNotification(n, 'chat/toolCallReady')
					|| isActionNotification(n, 'chat/turnComplete')
					|| isActionNotification(n, 'chat/error');
			}, 90_000);
			seen.add(notification as object);
			if (isActionNotification(notification, 'chat/error')) {
				const action = getActionEnvelope(notification).action as ChatErrorAction;
				throw new Error(`Tool-search turn failed: ${action.part.error.errorType}: ${action.part.error.message}`);
			}
			if (isActionNotification(notification, 'chat/toolCallStart')) {
				const action = getActionEnvelope(notification).action as ChatToolCallStartAction;
				if (action.turnId === turnId) {
					starts.set(action.toolCallId, action.toolName);
				}
				continue;
			}
			if (isActionNotification(notification, 'chat/toolCallReady')) {
				const action = getActionEnvelope(notification).action as ChatToolCallReadyAction;
				const toolName = starts.get(action.toolCallId);
				if (!toolName) {
					continue;
				}
				const isSearch = toolName === 'toolSearch' || toolName === 'tool_search_tool';
				context.client.dispatch({
					channel: chatUri,
					clientSeq: clientSeq++,
					action: {
						type: ActionType.ChatToolCallComplete,
						turnId,
						toolCallId: action.toolCallId,
						result: {
							success: true,
							pastTenseMessage: isSearch ? 'Searched tools' : 'Got the magic word',
							content: [{
								type: ToolResultContentType.Text,
								text: isSearch ? toolSearchResult : 'MAGIC_WORD',
							}],
						},
					},
				});
				continue;
			}
			break;
		}
		return { toolNames: [...starts.values()], responseText: getMarkdownResponseText(context.client) };
	}

	// Windows retains the provider scratch directory after session disposal.
	(context.isWindows ? test.skip : test)('workspaceless session uses and cleans up a provider scratch directory', async function () {
		this.timeout(180_000);
		const sessionUri = await createWorkspacelessSession('workspaceless-scratch');
		await driveTurnToCompletion(context.client, sessionUri, 'turn-workspaceless-scratch', 'Reply exactly "ready".', 1);
		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		const state = subscribed.snapshot!.state as SessionState;
		const scratchDirectory = state.workingDirectories?.[0] ? URI.parse(state.workingDirectories[0]).fsPath : undefined;
		assert.ok(scratchDirectory && existsSync(scratchDirectory));

		await context.client.call('disposeSession', { channel: sessionUri }, 30_000);
		createdSessions.splice(createdSessions.indexOf(sessionUri), 1);
		await retry(async () => assert.strictEqual(existsSync(scratchDirectory), false), 50, 20);
	});

	test('root auto-reply completes provider input without a client response', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createWorkspaceSession('auto-reply');
		try {
			await setRootConfig({ [AgentHostAutoReplyEnabledConfigKey]: true }, 100);
			context.client.clearReceived();
			dispatchTurn(context.client, sessionUri, 'turn-auto-reply', 'Call ask_user exactly once to ask "Which option?" with choices "Alpha" and "Beta". If the answer says the user is unavailable, reply exactly "AUTO_REPLIED".', 1);
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'chat/turnComplete')
				&& (getActionEnvelope(n).action as { readonly turnId: string }).turnId === 'turn-auto-reply',
				90_000,
			);
			assert.strictEqual(getMarkdownResponseText(context.client).trim(), 'AUTO_REPLIED');
		} finally {
			await setRootConfig({ [AgentHostAutoReplyEnabledConfigKey]: false }, 101);
		}
	});

	(context.runKnownIssueTests ? test : test.skip)('config slash completions reflect the current Copilot session mode', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createWorkspaceSession('config-slash-completions');
		await driveTurnToCompletion(context.client, sessionUri, 'turn-config-slash-ready', 'Reply exactly "ready".', 1);
		const chatUri = buildDefaultChatUri(sessionUri);
		const before = await context.client.call<CompletionsResult>('completions', {
			channel: chatUri,
			kind: CompletionItemKind.UserMessage,
			text: '/autopilot',
			offset: 10,
		});

		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 10,
			action: {
				type: ActionType.SessionConfigChanged,
				config: { mode: 'autopilot' },
			},
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, ActionType.SessionConfigChanged)
			&& getActionEnvelope(n).channel === sessionUri,
			30_000,
		);
		const after = await context.client.call<CompletionsResult>('completions', {
			channel: chatUri,
			kind: CompletionItemKind.UserMessage,
			text: '/autopilot',
			offset: 10,
		});

		assert.deepStrictEqual({
			before: before.items.map(item => item.attachment.label).filter(label => label.startsWith('/autopilot')),
			after: after.items.map(item => item.attachment.label).filter(label => label.startsWith('/autopilot')),
		}, {
			before: ['/autopilot', '/autopilot on'],
			after: ['/autopilot', '/autopilot off'],
		});
	});

	test('goal config slash command switches to plan mode and forwards the remaining prompt', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createWorkspaceSession('goal-config-slash');
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-goal-config-slash', '/goal Reply exactly "GOAL_MODE". Do not use tools.', 1);
		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		const state = subscribed.snapshot!.state as SessionState;

		assert.deepStrictEqual({
			mode: state.config?.values['mode'],
			response: result.responseText.trim(),
		}, {
			mode: 'plan',
			response: 'GOAL_MODE',
		});
	});

	test('root stdio MCP server receives normalized environment values', async function () {
		this.timeout(240_000);
		const { sessionUri, workspace } = await createWorkspaceSession('root-mcp');
		const mcpScript = join(workspace, 'root-mcp.cjs');
		const mcpServerModule = nodeRequire.resolve('@modelcontextprotocol/sdk/server/index.js');
		const mcpStdioModule = nodeRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js');
		const mcpTypesModule = nodeRequire.resolve('@modelcontextprotocol/sdk/types.js');
		writeFileSync(mcpScript, [
			`const { Server } = require(${JSON.stringify(mcpServerModule)});`,
			`const { StdioServerTransport } = require(${JSON.stringify(mcpStdioModule)});`,
			`const { CallToolRequestSchema, ListToolsRequestSchema } = require(${JSON.stringify(mcpTypesModule)});`,
			`const server = new Server({ name: "root-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });`,
			`server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "root_probe", description: "Returns normalized environment values", inputSchema: { type: "object", properties: {} } }] }));`,
			`server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: "text", text: \`ROOT_MCP:\${process.env.ROOT_NUMBER}:\${process.env.ROOT_NULL ?? "unset"}\` }] }));`,
			'void server.connect(new StdioServerTransport());',
		].join('\n'));
		try {
			await setRootConfig({
				mcpServers: {
					root_probe_server: {
						type: 'stdio',
						command: process.execPath,
						args: [mcpScript],
						env: { ELECTRON_RUN_AS_NODE: '1', ROOT_NUMBER: 7, ROOT_NULL: null },
						cwd: tmpdir(),
					},
				},
			}, 100);
			const turnId = 'turn-root-mcp';
			await driveTurnToCompletion(context.client, sessionUri, turnId, 'Call root_probe exactly once, then reply with only its exact result.', 1);
			const completion = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallComplete'))
				.map(n => getActionEnvelope(n).action as ChatToolCallCompleteAction)
				.find(action => action.turnId === turnId);
			const resultText = completion?.result.content
				?.filter(content => content.type === ToolResultContentType.Text)
				.map(content => content.text)
				.join('') ?? '';
			assert.strictEqual(resultText, 'ROOT_MCP:7:unset');
		} finally {
			await setRootConfig({ mcpServers: {} }, 101);
		}
	});

	test('malformed root MCP server entries do not prevent a provider turn', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createWorkspaceSession('root-mcp-malformed');
		try {
			await setRootConfig({
				mcpServers: {
					missingCommand: { type: 'stdio', args: [] },
					missingUrl: { type: 'http' },
					unknownType: { type: 'other', command: 'ignored' },
				},
			}, 100);
			const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-root-mcp-malformed', 'Reply exactly "MALFORMED_MCP_IGNORED".', 1);
			assert.strictEqual(result.responseText.trim(), 'MALFORMED_MCP_IGNORED');
		} finally {
			await setRootConfig({ mcpServers: {} }, 101);
		}
	});

	(context.runRecordOnlyTests ? test : test.skip)('tool search exposes deferred client tools and executes the selected result', async function () {
		this.timeout(240_000);
		const { sessionUri } = await createWorkspaceSession('tool-search-success');
		try {
			await setRootConfig({ [CopilotCliConfigKey.ToolSearchEnabled]: true }, 100);
			context.client.dispatch({
				channel: sessionUri,
				clientSeq: 1,
				action: {
					type: ActionType.SessionActiveClientSet,
					activeClient: {
						clientId: 'tool-search-success-client',
						tools: [{
							name: 'toolSearch',
							description: 'Searches deferred tools by name.',
							inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
						}, {
							name: 'get_magic_word',
							description: 'Returns the magic word.',
							inputSchema: { type: 'object', properties: {} },
						}],
					},
				},
			});
			await context.client.waitForNotification(n => isActionNotification(n, ActionType.SessionActiveClientSet), 30_000);

			const result = await driveToolSearchTurn(sessionUri, 'turn-tool-search-success', '["get_magic_word"]');
			assert.deepStrictEqual({
				hasSearch: result.toolNames.some(name => name === 'toolSearch' || name === 'tool_search_tool'),
				hasMagicWord: result.toolNames.includes('get_magic_word'),
				response: result.responseText.trim(),
			}, {
				hasSearch: true,
				hasMagicWord: true,
				response: 'MAGIC_WORD',
			});
		} finally {
			await setRootConfig({ [CopilotCliConfigKey.ToolSearchEnabled]: false }, 101);
		}
	});

	(context.runRecordOnlyTests ? test : test.skip)('tool search tolerates a malformed client result without activating a deferred tool', async function () {
		this.timeout(240_000);
		const { sessionUri } = await createWorkspaceSession('tool-search-malformed');
		try {
			await setRootConfig({ [CopilotCliConfigKey.ToolSearchEnabled]: true }, 100);
			context.client.dispatch({
				channel: sessionUri,
				clientSeq: 1,
				action: {
					type: ActionType.SessionActiveClientSet,
					activeClient: {
						clientId: 'tool-search-malformed-client',
						tools: [{
							name: 'toolSearch',
							description: 'Searches deferred tools by name.',
							inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
						}, {
							name: 'get_magic_word',
							description: 'Returns the magic word.',
							inputSchema: { type: 'object', properties: {} },
						}],
					},
				},
			});
			await context.client.waitForNotification(n => isActionNotification(n, ActionType.SessionActiveClientSet), 30_000);

			const result = await driveToolSearchTurn(sessionUri, 'turn-tool-search-malformed', 'not-json');
			assert.deepStrictEqual({
				hasSearch: result.toolNames.some(name => name === 'toolSearch' || name === 'tool_search_tool'),
				hasMagicWord: result.toolNames.includes('get_magic_word'),
			}, {
				hasSearch: true,
				hasMagicWord: false,
			});
		} finally {
			await setRootConfig({ [CopilotCliConfigKey.ToolSearchEnabled]: false }, 101);
		}
	});

	test('view range returns only the requested workspace lines', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createWorkspaceSession('view-range');
		writeFileSync(join(workspace, 'range.txt'), 'RANGE_ONE\nRANGE_TWO\nRANGE_THREE\nRANGE_FOUR\nRANGE_FIVE\n');
		const turnId = 'turn-view-range';
		await driveTurnToCompletion(context.client, sessionUri, turnId, 'Use view exactly once with view_range [2, 4] to read range.txt. Do not run a shell command. Then reply exactly "done".', 1);
		const viewStart = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
			.map(n => getActionEnvelope(n).action as ChatToolCallStartAction)
			.find(action => action.turnId === turnId && action.toolName === 'view');
		const viewCompletion = viewStart && context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallComplete'))
			.map(n => getActionEnvelope(n).action as ChatToolCallCompleteAction)
			.find(action => action.toolCallId === viewStart.toolCallId);
		const resultText = viewCompletion?.result.content
			?.filter(content => content.type === ToolResultContentType.Text)
			.map(content => content.text)
			.join('') ?? '';

		assert.deepStrictEqual({
			hasFirst: resultText.includes('RANGE_ONE'),
			hasSecond: resultText.includes('RANGE_TWO'),
			hasFourth: resultText.includes('RANGE_FOUR'),
			hasFifth: resultText.includes('RANGE_FIVE'),
		}, {
			hasFirst: false,
			hasSecond: true,
			hasFourth: true,
			hasFifth: false,
		});
	});

	test('grep searches workspace content through the provider tool', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createWorkspaceSession('grep-tool');
		writeFileSync(join(workspace, 'needle.txt'), 'COPILOT_E2E_NEEDLE\n');
		const turnId = 'turn-grep-tool';
		await driveTurnToCompletion(context.client, sessionUri, turnId, 'Use grep exactly once to find COPILOT_E2E_NEEDLE in the workspace, then reply exactly "found".', 1);

		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri),
			turnId,
			toolNames: ['grep'],
			workspace,
			expected: [/needle\.txt/],
		});
	});

	test('glob finds a nested workspace file through the provider tool', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createWorkspaceSession('glob-tool');
		mkdirSync(join(workspace, 'nested'));
		writeFileSync(join(workspace, 'nested', 'glob-target.unique'), 'target\n');
		const turnId = 'turn-glob-tool';
		await driveTurnToCompletion(context.client, sessionUri, turnId, 'Use glob exactly once to find files matching **/*.unique, then reply exactly "found".', 1);

		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri),
			turnId,
			toolNames: ['glob'],
			workspace,
			expected: [/nested\/glob-target\.unique/],
		});
	});

	test('shell failure preserves the real nonzero exit code', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createWorkspaceSession('shell-exit-code');
		const turnId = 'turn-shell-exit-code';
		await driveTurnToCompletion(context.client, sessionUri, turnId, 'Run exactly `node -e "process.exit(7)"` with bash, then reply exactly "failed as expected".', 1);
		const shellStart = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
			.map(n => getActionEnvelope(n).action as ChatToolCallStartAction)
			.find(action => action.turnId === turnId && action.toolName === expandShellToolName('${shell}'));
		const shellCompletion = shellStart && context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallComplete'))
			.map(n => getActionEnvelope(n).action as ChatToolCallCompleteAction)
			.find(action => action.toolCallId === shellStart.toolCallId);
		const terminalResult = shellCompletion?.result.content?.find(content => content.type === ToolResultContentType.Terminal)?.result;

		assert.deepStrictEqual({
			success: shellCompletion?.result.success,
			exitCode: terminalResult?.exitCode,
		}, {
			success: true,
			exitCode: 7,
		});
	});

	(context.runRecordOnlyTests ? test : test.skip)('managed shell can be read and stopped after asynchronous execution', async function () {
		this.timeout(240_000);
		const { sessionUri } = await createWorkspaceSession('managed-shell-read-stop');
		const turnId = 'turn-managed-shell-read-stop';
		await driveTurnToCompletion(context.client, sessionUri, turnId, 'Start `echo MANAGED_SHELL_VALUE` asynchronously with bash, read that shell with read_bash, stop it with stop_bash, then reply exactly "done".', 1);
		const toolNames = startedToolNames(context, turnId);

		assert.ok(toolNames.includes('bash') && toolNames.includes('read_bash') && toolNames.includes('stop_bash'));
	});

	(context.runRecordOnlyTests ? test : test.skip)('managed shell sessions can be listed after asynchronous execution', async function () {
		this.timeout(240_000);
		const { sessionUri } = await createWorkspaceSession('managed-shell-list');
		const turnId = 'turn-managed-shell-list';
		await driveTurnToCompletion(context.client, sessionUri, turnId, 'Start `echo LISTED_SHELL_VALUE` asynchronously with bash, call list_bash, stop the shell with stop_bash, then reply exactly "done".', 1);
		const toolNames = startedToolNames(context, turnId);

		assert.ok(toolNames.includes('bash') && toolNames.includes('list_bash') && toolNames.includes('stop_bash'));
	});

	(context.runRecordOnlyTests ? test : test.skip)('custom terminal tool manages an asynchronous shell lifecycle', async function () {
		this.timeout(240_000);
		const { sessionUri } = await createWorkspaceSession('custom-terminal-lifecycle');
		try {
			await setRootConfig({ [CopilotCliConfigKey.EnableCustomTerminalTool]: true }, 100);
			const turnId = 'turn-custom-terminal-lifecycle';
			await driveTurnToCompletion(context.client, sessionUri, turnId, 'Start `echo CUSTOM_TERMINAL_VALUE` asynchronously with bash, read it with read_bash, list shells with list_bash, stop it with stop_bash, then reply exactly "done".', 1);
			const toolNames = startedToolNames(context, turnId);
			assert.ok(toolNames.includes('bash') && toolNames.includes('read_bash') && toolNames.includes('list_bash') && toolNames.includes('stop_bash'));
		} finally {
			await setRootConfig({ [CopilotCliConfigKey.EnableCustomTerminalTool]: false }, 101);
		}
	});

	// Windows publishes the terminal but omits the completed command metadata.
	(context.isWindows ? test.skip : test)('custom terminal tool preserves a nonzero shell exit code', async function () {
		this.timeout(180_000);
		const deterministicShellConfig = context.isWindows ? {} : { [AgentHostConfigKey.DefaultShell]: '/bin/bash' };
		try {
			const { sessionUri } = await createWorkspaceSession('custom-terminal-exit-code', () => setRootConfig({
				[CopilotCliConfigKey.EnableCustomTerminalTool]: true,
				...deterministicShellConfig,
			}, 100));
			const turnId = 'turn-custom-terminal-exit-code';
			await driveTurnToCompletion(context.client, sessionUri, turnId, 'Run exactly `node -e "process.exit(9)"` with bash, then reply exactly "failed as expected".', 1);
			const shellStart = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
				.map(n => getActionEnvelope(n).action as ChatToolCallStartAction)
				.find(action => action.turnId === turnId && action.toolName === expandShellToolName('${shell}'));
			const shellCompletion = shellStart && context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallComplete'))
				.map(n => getActionEnvelope(n).action as ChatToolCallCompleteAction)
				.find(action => action.toolCallId === shellStart.toolCallId);
			const terminalUri = shellCompletion?.result.content?.find(content => content.type === ToolResultContentType.Terminal)?.resource
				?? (shellStart && context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallContentChanged'))
					.map(n => getActionEnvelope(n).action as ChatToolCallContentChangedAction)
					.filter(action => action.toolCallId === shellStart.toolCallId)
					.map(action => terminalResourceFromContent(action.content))
					.find(resource => resource !== undefined));
			assert.ok(terminalUri);
			const terminal = await context.client.call<SubscribeResult>('subscribe', { channel: terminalUri });
			const terminalState = terminal.snapshot!.state as TerminalState;
			const command = terminalState.content.find((part): part is TerminalCommandPart => part.type === 'command' && part.commandLine.includes('process.exit(9)'));
			assert.deepStrictEqual({
				supportsCommandDetection: terminalState.supportsCommandDetection,
				isComplete: command?.isComplete,
				exitCode: command?.exitCode,
			}, {
				supportsCommandDetection: true,
				isComplete: true,
				exitCode: 9,
			});
		} finally {
			await setRootConfig({
				[CopilotCliConfigKey.EnableCustomTerminalTool]: false,
				...(context.isWindows ? {} : { [AgentHostConfigKey.DefaultShell]: '' }),
			}, 101);
		}
	});

	// Windows loses the persisted provider session during restart, so the host cannot reconstruct its tool history.
	(!context.isWindows || context.runKnownIssueTests ? test : test.skip)('tool-rich provider history is reconstructed after a host restart', async function () {
		this.timeout(240_000);
		const { sessionUri, workspace } = await createWorkspaceSession('tool-history-restart');
		writeFileSync(join(workspace, 'history.txt'), 'before\n');
		const turnId = 'turn-tool-history-restart';
		await driveTurnToCompletion(context.client, sessionUri, turnId, 'Use edit exactly once to replace before with after in history.txt. Do not run a shell command. Then reply exactly "history-ready".', 1);
		const before = await fetchSessionWithChat(context.client, sessionUri);

		await context.restartServer();
		await initialize('tool-history-restart-client', workspace);
		await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		const restored = await fetchSessionWithChat(context.client, sessionUri);

		const beforeToolCalls = before.turns.flatMap(turn => turn.responseParts).filter(part => part.kind === ResponsePartKind.ToolCall).length;
		assert.ok(beforeToolCalls > 0);
		assert.deepStrictEqual({
			restoredToolCalls: restored.turns.flatMap(turn => turn.responseParts).filter(part => part.kind === ResponsePartKind.ToolCall).length,
			content: readFileSync(join(workspace, 'history.txt'), 'utf8'),
		}, {
			restoredToolCalls: beforeToolCalls,
			content: 'after\n',
		});
	});

	(context.runKnownIssueTests ? test : test.skip)('shell failure metadata is reconstructed after a host restart', async function () {
		this.timeout(240_000);
		const { sessionUri, workspace } = await createWorkspaceSession('shell-history-restart');
		const turnId = 'turn-shell-history-restart';
		await driveTurnToCompletion(context.client, sessionUri, turnId, 'Run exactly `node -e "process.exit(5)"` with bash, then reply exactly "failed as expected".', 1);
		const before = await fetchSessionWithChat(context.client, sessionUri);
		const beforeToolCall = before.turns.find(turn => turn.id === turnId)?.responseParts
			.find(part => part.kind === ResponsePartKind.ToolCall);
		assert.ok(beforeToolCall?.kind === ResponsePartKind.ToolCall);

		await context.restartServer();
		await initialize('shell-history-restart-client', workspace);
		await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		const restored = await fetchSessionWithChat(context.client, sessionUri);
		const restoredToolCall = restored.turns.find(turn => turn.id === turnId)?.responseParts
			.find(part => part.kind === ResponsePartKind.ToolCall);
		const beforeSuccess = beforeToolCall.toolCall.status === ToolCallStatus.Completed ? beforeToolCall.toolCall.success : undefined;
		const restoredSuccess = restoredToolCall?.kind === ResponsePartKind.ToolCall && restoredToolCall.toolCall.status === ToolCallStatus.Completed ? restoredToolCall.toolCall.success : undefined;

		assert.deepStrictEqual({
			toolName: restoredToolCall?.kind === ResponsePartKind.ToolCall ? restoredToolCall.toolCall.toolName : undefined,
			status: restoredToolCall?.kind === ResponsePartKind.ToolCall ? restoredToolCall.toolCall.status : undefined,
			success: restoredSuccess,
		}, {
			toolName: beforeToolCall.toolCall.toolName,
			status: beforeToolCall.toolCall.status,
			success: beforeSuccess,
		});
	});

	test('commit changeset operation generates a message and commits mixed changes', async function () {
		this.timeout(240_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-changeset-commit-'));
		tempDirs.push(workspace);
		initTestGitRepo(workspace);
		writeFileSync(join(workspace, 'edited.txt'), 'before\n');
		writeFileSync(join(workspace, 'deleted.txt'), 'delete me\n');
		writeFileSync(join(workspace, 'renamed-before.txt'), 'rename me\n');
		execSync('git add . && git commit -q -m "seed"', { cwd: workspace });
		writeFileSync(join(workspace, 'edited.txt'), 'after\n');
		writeFileSync(join(workspace, 'created.txt'), 'created\n');
		execSync('git rm -q deleted.txt && git mv renamed-before.txt renamed-after.txt', { cwd: workspace });
		const sessionUri = await createRealSession(context.client, config, 'changeset-commit-client', createdSessions, URI.file(workspace));
		const authControl = await driveTurnToCompletion(context.client, sessionUri, 'turn-changeset-commit-auth-control', 'Reply exactly "AUTHENTICATED".', 1);
		assert.strictEqual(authControl.responseText.trim(), 'AUTHENTICATED');
		const changesetUri = buildUncommittedChangesetUri(sessionUri);
		await retry(async () => {
			const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: changesetUri });
			const state = subscribed.snapshot!.state as ChangesetState;
			if (state.files.length < 4 || !state.operations?.some(operation => operation.id === 'commit')) {
				throw new Error('Mixed uncommitted changes are not ready');
			}
		}, 100, 100);

		const result = await context.client.call<{ readonly message?: { readonly markdown?: string } }>('invokeChangesetOperation', {
			channel: changesetUri,
			operationId: 'commit',
		}, 120_000);

		assert.deepStrictEqual({
			clean: execSync('git status --porcelain', { cwd: workspace, encoding: 'utf8' }),
			commitCount: Number(execSync('git rev-list --count HEAD', { cwd: workspace, encoding: 'utf8' }).trim()),
			message: result.message?.markdown?.includes('Committed changes with message:') ?? false,
		}, {
			clean: '',
			commitCount: 2,
			message: true,
		});
	});
}
