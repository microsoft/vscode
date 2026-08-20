/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CompletionItemKind, type CompletionsResult, type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { CustomizationEnablementKind, McpServerStatus } from '../../../../common/state/protocol/state.js';
import { ActionType, type ChatToolCallCompleteAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, ChatInputAnswerState, ChatInputAnswerValueKind, customizationId, CustomizationType, ResponsePartKind, ROOT_STATE_URI, type ChatInputAnswer, type ChatInputRequest, type ClientPluginCustomization, type McpServerCustomization, type PluginCustomization, type SessionState } from '../../../../common/state/sessionState.js';
import { createRealSession, driveTurnToCompletion, driveTurnWithAnswersToCompletion, driveTurnWithCancelledInputToCompletion, resolveGitHubToken, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { providerHostOnlyTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

const nodeRequire = createRequire(import.meta.url);

interface IPluginSession {
	readonly sessionUri: string;
	readonly pluginUri: string;
	readonly clientId: string;
	readonly workspace: string;
	readonly hookLog?: string;
}

interface IPluginSessionOptions {
	readonly hookType?: 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit' | 'SessionStart' | 'SessionEnd';
	readonly hookExitCode?: number;
	readonly hookStdout?: string;
	readonly pluginName?: string;
}

export function defineMcpPluginTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity') {
		return;
	}
	const { config, createdSessions, tempDirs } = context;
	if (config.provider === 'claude') {
		return;
	}

	async function createPluginSession(prefix: string, options: IPluginSessionOptions = {}): Promise<IPluginSession> {
		const workspace = mkdtempSync(join(tmpdir(), `ahp-mcp-workspace-${prefix}-`));
		const plugin = mkdtempSync(join(tmpdir(), `ahp-mcp-plugin-${prefix}-`));
		tempDirs.push(workspace, plugin);
		const manifestDirectory = config.provider === 'claude' ? '.claude-plugin' : '.plugin';
		for (const directory of [
			join(plugin, manifestDirectory),
			join(plugin, 'agents'),
			join(plugin, 'rules'),
			join(plugin, 'skills', 'probe-skill'),
		]) {
			mkdirSync(directory, { recursive: true });
		}
		let hookLog: string | undefined;
		if (options.hookType) {
			const hooksDirectory = join(plugin, 'hooks');
			mkdirSync(hooksDirectory, { recursive: true });
			hookLog = join(plugin, 'hook.log');
			const hookScript = join(plugin, 'record-hook.cjs');
			writeFileSync(hookScript, [
				'const fs = require("fs");',
				'const [log, tag, exitCode, stdout] = process.argv.slice(2);',
				'let input = "";',
				'process.stdin.setEncoding("utf8");',
				'process.stdin.on("data", chunk => input += chunk);',
				'process.stdin.on("end", () => {',
				'  fs.appendFileSync(log, `${tag}:${input}\\n`);',
				'  if (stdout) { process.stdout.write(stdout); }',
				'  process.exit(Number(exitCode));',
				'});',
			].join('\n'));
			const command = [process.execPath, hookScript, hookLog, options.hookType, String(options.hookExitCode ?? 0), options.hookStdout ?? '']
				.map(value => JSON.stringify(value))
				.join(' ');
			writeFileSync(join(hooksDirectory, 'hooks.json'), JSON.stringify({
				hooks: {
					[options.hookType]: [{ hooks: [{ type: 'command', command }] }],
				},
			}));
		}
		const mcpScript = join(plugin, 'probe-mcp.cjs');
		const mcpServerModule = nodeRequire.resolve('@modelcontextprotocol/sdk/server/index.js');
		const mcpStdioModule = nodeRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js');
		const mcpTypesModule = nodeRequire.resolve('@modelcontextprotocol/sdk/types.js');
		const pluginName = options.pluginName ?? 'E2E MCP Plugin';
		writeFileSync(join(plugin, manifestDirectory, 'plugin.json'), JSON.stringify({ name: pluginName }));
		writeFileSync(join(plugin, 'agents', 'probe.agent.md'), '---\nname: Probe Agent\ndescription: Uses the probe MCP server\n---\nUse the probe tool when asked.');
		writeFileSync(join(plugin, 'rules', 'probe.instructions.md'), '---\napplyTo:\n  - "**/*"\n---\nPrefer the customization_probe tool.');
		writeFileSync(join(plugin, 'skills', 'probe-skill', 'SKILL.md'), '---\nname: probe-skill\ndescription: Uses the customization probe\n---\nCall customization_probe.');
		writeFileSync(mcpScript, [
			`const { Server } = require(${JSON.stringify(mcpServerModule)});`,
			`const { StdioServerTransport } = require(${JSON.stringify(mcpStdioModule)});`,
			`const { CallToolRequestSchema, ListToolsRequestSchema } = require(${JSON.stringify(mcpTypesModule)});`,
			`const server = new Server({ name: "e2e-mcp-plugin", version: "1.0.0" }, { capabilities: { tools: {} } });`,
			`server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [`,
			`  { name: "customization_probe", description: "Returns MCP_PLUGIN_RESULT", inputSchema: { type: "object", properties: {} } },`,
			`  { name: "customization_elicit_form", description: "Asks for structured values and returns them", inputSchema: { type: "object", properties: {} } },`,
			`  { name: "customization_elicit_extended", description: "Asks for text, number, and multiple selections", inputSchema: { type: "object", properties: {} } },`,
			`  { name: "customization_elicit_coercion", description: "Asks for values that can be represented by different AHP answer kinds", inputSchema: { type: "object", properties: {} } },`,
			`  { name: "customization_elicit_url", description: "Asks the user to approve opening a URL", inputSchema: { type: "object", properties: {} } },`,
			`  { name: "customization_sample", description: "Samples a nested model response", inputSchema: { type: "object", properties: {} } },`,
			`] }));`,
			`server.setRequestHandler(CallToolRequestSchema, async request => {`,
			`  if (request.params.name === "customization_elicit_form") {`,
			`    const result = await server.elicitInput({ mode: "form", message: "Choose values", requestedSchema: {`,
			`      type: "object",`,
			`      properties: {`,
			`        choice: { type: "string", title: "Choice", enum: ["Apple", "Banana"], default: "Apple" },`,
			`        count: { type: "integer", title: "Count", minimum: 1, maximum: 5, default: 3 },`,
			`        confirmed: { type: "boolean", title: "Confirmed", default: true },`,
			`      },`,
			`      required: ["choice", "count", "confirmed"],`,
			`    } });`,
			`    const value = result.content || {};`,
			`    return { content: [{ type: "text", text: \`ELICIT_FORM:\${result.action}:\${value.choice}:\${value.count}:\${value.confirmed}\` }] };`,
			`  }`,
			`  if (request.params.name === "customization_elicit_url") {`,
			`    const result = await server.elicitInput({ mode: "url", message: "Open the documentation", url: "https://example.com/docs", elicitationId: "e2e-url" });`,
			`    return { content: [{ type: "text", text: \`ELICIT_URL:\${result.action}\` }] };`,
			`  }`,
			`  if (request.params.name === "customization_elicit_coercion") {`,
			`    const result = await server.elicitInput({ mode: "form", message: "Provide coercion values", requestedSchema: {`,
			`      type: "object",`,
			`      properties: {`,
			`        enabled: { type: "boolean", title: "Enabled" },`,
			`        ratio: { type: "number", title: "Ratio" },`,
			`        colors: { type: "array", title: "Colors", items: { type: "string", enum: ["Red", "Blue"] } },`,
			`        choice: { type: "string", title: "Choice", enum: ["Apple", "Banana"] },`,
			`      },`,
			`      required: ["enabled", "ratio", "colors", "choice"],`,
			`    } });`,
			`    const value = result.content || {};`,
			`    return { content: [{ type: "text", text: \`COERCION:\${typeof value.enabled}:\${value.enabled}:\${typeof value.ratio}:\${value.ratio}:\${Array.isArray(value.colors) ? "array" : typeof value.colors}:\${(value.colors || []).join("+")}:\${typeof value.choice}:\${value.choice}\` }] };`,
			`  }`,
			`  if (request.params.name === "customization_elicit_extended") {`,
			`    const result = await server.elicitInput({ mode: "form", message: "Provide extended values", requestedSchema: {`,
			`      type: "object",`,
			`      properties: {`,
			`        note: { type: "string", title: "Note", default: "sample" },`,
			`        ratio: { type: "number", title: "Ratio", minimum: 0, maximum: 10, default: 2.5 },`,
			`        colors: { type: "array", title: "Colors", items: { type: "string", enum: ["Red", "Blue"] }, default: ["Red"] },`,
			`      },`,
			`      required: ["note", "ratio", "colors"],`,
			`    } });`,
			`    const value = result.content || {};`,
			`    return { content: [{ type: "text", text: \`ELICIT_EXTENDED:\${result.action}:\${value.note}:\${value.ratio}:\${(value.colors || []).join("+")}\` }] };`,
			`  }`,
			`  if (request.params.name === "customization_sample") {`,
			`    const result = await server.createMessage({ messages: [{ role: "user", content: { type: "text", text: "Reply exactly MCP_SAMPLE_INNER" } }], maxTokens: 32 });`,
			`    const blocks = Array.isArray(result.content) ? result.content : [result.content];`,
			`    const text = blocks.filter(block => block && block.type === "text").map(block => block.text).join("");`,
			`    return { content: [{ type: "text", text: \`MCP_SAMPLE:\${text}\` }] };`,
			`  }`,
			`  return { content: [{ type: "text", text: "MCP_PLUGIN_RESULT" }] };`,
			`});`,
			'void server.connect(new StdioServerTransport());',
		].join('\n'));
		writeFileSync(join(plugin, '.mcp.json'), JSON.stringify({
			mcpServers: {
				customization_probe_server: {
					command: process.execPath,
					args: [mcpScript],
					env: { ELECTRON_RUN_AS_NODE: '1' },
				},
			},
		}));
		const pluginUri = URI.file(plugin).toString();
		const clientId = `mcp-plugin-${prefix}-${config.provider}`;
		const sessionUri = await createRealSession(context.client, config, clientId, createdSessions, URI.file(workspace));
		const customization: ClientPluginCustomization = {
			type: CustomizationType.Plugin,
			id: customizationId(pluginUri),
			uri: pluginUri,
			name: pluginName,
			nonce: '1',
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
		};
		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: { clientId, tools: [], customizations: [customization] },
			},
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'session/activeClientSet') && getActionEnvelope(n).channel === sessionUri,
			30_000,
		);
		return { sessionUri, pluginUri, clientId, workspace, hookLog };
	}

	async function pluginState(sessionUri: string, pluginUri: string): Promise<PluginCustomization> {
		return retry(async () => {
			const result = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			const plugin = (result.snapshot!.state as SessionState).customizations?.find((customization): customization is PluginCustomization =>
				customization.type === CustomizationType.Plugin && customization.uri === pluginUri);
			if (!plugin || !plugin.children?.some(child => child.type === CustomizationType.McpServer)) {
				throw new Error('Plugin customizations are not ready');
			}
			return plugin;
		}, 100, 100);
	}

	async function mcpServerState(sessionUri: string, pluginUri: string): Promise<McpServerCustomization> {
		const plugin = await pluginState(sessionUri, pluginUri);
		const server = plugin.children?.find((child): child is McpServerCustomization => child.type === CustomizationType.McpServer);
		assert.ok(server);
		return server;
	}

	function toolResultTexts(sessionUri: string, turnId: string): readonly string[] {
		return context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallComplete'))
			.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallCompleteAction }))
			.filter(({ envelope, action }) => envelope.channel === buildDefaultChatUri(sessionUri) && action.turnId === turnId)
			.map(({ action }) => textFromContent(action.result.content ?? []));
	}

	async function waitForHook(hookLog: string | undefined, hookType: NonNullable<IPluginSessionOptions['hookType']>): Promise<string> {
		assert.ok(hookLog);
		return retry(async () => {
			if (!existsSync(hookLog)) {
				throw new Error(`${hookType} hook has not run`);
			}

			const content = readFileSync(hookLog, 'utf8');
			if (!content.includes(`${hookType}:`)) {
				throw new Error(`${hookType} hook has not recorded input`);
			}
			return content;
		}, 100, 100);
	}

	async function driveCoercionTurn(
		sessionUri: string,
		turnId: string,
		answers: (request: ChatInputRequest) => Record<string, ChatInputAnswer>,
	): Promise<void> {
		await driveTurnWithAnswersToCompletion(
			context.client,
			sessionUri,
			turnId,
			'Call customization_elicit_coercion exactly once, then reply with only its exact result.',
			2,
			answers,
		);
	}

	providerHostOnlyTest(context, 'client plugin exposes agent rule skill and MCP server customizations', async function () {
		const { sessionUri, pluginUri } = await createPluginSession('catalog');
		const plugin = await pluginState(sessionUri, pluginUri);

		assert.deepStrictEqual(
			new Set(plugin.children?.map(child => child.type)),
			new Set([CustomizationType.Agent, CustomizationType.Rule, CustomizationType.Skill, CustomizationType.McpServer]),
		);
	});

	providerHostOnlyTest(context, 'client plugin can be disabled and enabled through AHP', async function () {
		const { sessionUri, pluginUri } = await createPluginSession('toggle');
		const plugin = await pluginState(sessionUri, pluginUri);

		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 10,
			action: { type: ActionType.SessionCustomizationToggled, id: plugin.id, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] },
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'session/customizationToggled')
			&& getActionEnvelope(n).channel === sessionUri,
			30_000,
		);
		assert.deepStrictEqual((await pluginState(sessionUri, pluginUri)).enablement, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);

		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 11,
			action: { type: ActionType.SessionCustomizationToggled, id: plugin.id, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }] },
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'session/customizationToggled')
			&& getActionEnvelope(n).channel === sessionUri,
			30_000,
		);
		assert.deepStrictEqual((await pluginState(sessionUri, pluginUri)).enablement, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);
	});

	providerHostOnlyTest(context, 'removing the active client removes its plugin customization', async function () {
		const { sessionUri, pluginUri, clientId } = await createPluginSession('remove');
		const plugin = await pluginState(sessionUri, pluginUri);
		context.client.clearReceived();

		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 10,
			action: { type: ActionType.SessionActiveClientRemoved, clientId },
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'session/activeClientRemoved')
			&& getActionEnvelope(n).channel === sessionUri,
			30_000,
		);
		await retry(async () => {
			const result = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			const customizations = (result.snapshot!.state as SessionState).customizations ?? [];
			if (customizations.some(customization => customization.id === plugin.id)) {
				throw new Error('Plugin customization has not been removed');
			}
		}, 100, 100);
	}, config.provider !== 'codex');

	const modelBackedEnabled = config.provider === 'copilotcli';
	if (modelBackedEnabled) {
		// Copilot plugin hooks do not execute on Windows, although the same plugin's skill and MCP server work.
		const pluginHookTest = context.isWindows ? test.skip : test;

		// The skill executes when named explicitly, but the completions command currently returns no item for it.
		(context.runKnownIssueTests ? test : test.skip)('plugin skill is included in leading slash completions', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri } = await createPluginSession('skill-completion-leading', { pluginName: 'e2e-probe' });
			await pluginState(sessionUri, pluginUri);
			await driveTurnToCompletion(context.client, sessionUri, 'turn-skill-completion-leading', 'Reply exactly "ready".', 2);

			const completions = await context.client.call<CompletionsResult>('completions', {
				channel: buildDefaultChatUri(sessionUri),
				kind: CompletionItemKind.UserMessage,
				text: '/E2E',
				offset: 4,
			});

			assert.ok(completions.items.some(item => item.insertText.includes('probe-skill')));
		});

		(context.runKnownIssueTests ? test : test.skip)('plugin skill is included in whitespace slash completions without runtime commands', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri } = await createPluginSession('skill-completion-whitespace', { pluginName: 'e2e-probe' });
			await pluginState(sessionUri, pluginUri);
			await driveTurnToCompletion(context.client, sessionUri, 'turn-skill-completion-whitespace', 'Reply exactly "ready".', 2);

			const completions = await context.client.call<CompletionsResult>('completions', {
				channel: buildDefaultChatUri(sessionUri),
				kind: CompletionItemKind.UserMessage,
				text: 'Use /E2E',
				offset: 8,
			});

			assert.ok(completions.items.some(item => item.insertText.includes('probe-skill')));
		});

		test('plugin skill invocation is routed through the provider skill lifecycle', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri } = await createPluginSession('skill-invocation');
			await pluginState(sessionUri, pluginUri);
			const turnId = 'turn-skill-invocation';
			await driveTurnToCompletion(context.client, sessionUri, turnId, 'Invoke the probe-skill skill exactly once, follow its instructions, then reply with only the customization probe result.', 2);

			assert.ok(toolResultTexts(sessionUri, turnId).includes('MCP_PLUGIN_RESULT'));
		});

		(context.runKnownIssueTests ? test : test.skip)('plugin skill lifecycle is reconstructed after a host restart', async function () {
			this.timeout(240_000);
			const { sessionUri, pluginUri, workspace } = await createPluginSession('skill-history-restart');
			await pluginState(sessionUri, pluginUri);
			const turnId = 'turn-skill-history-restart';
			await driveTurnToCompletion(context.client, sessionUri, turnId, 'Invoke the probe-skill skill exactly once, follow its instructions, then reply with only the customization probe result.', 2);
			const before = await fetchSessionWithChat(context.client, sessionUri);
			const beforeToolNames = before.turns.find(turn => turn.id === turnId)?.responseParts
				.filter(part => part.kind === ResponsePartKind.ToolCall)
				.map(part => part.toolCall.toolName) ?? [];

			await context.restartServer();
			context.client.setWorkingDirectory(workspace);
			await context.client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: 'skill-history-restart-client',
			}, 30_000);
			await context.client.call('authenticate', {
				channel: ROOT_STATE_URI,
				resource: 'https://api.github.com',
				token: config.githubToken ?? resolveGitHubToken(),
			}, 30_000);
			await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			const restored = await fetchSessionWithChat(context.client, sessionUri);
			const restoredToolNames = restored.turns.find(turn => turn.id === turnId)?.responseParts
				.filter(part => part.kind === ResponsePartKind.ToolCall)
				.map(part => part.toolCall.toolName) ?? [];

			assert.deepStrictEqual(restoredToolNames, beforeToolNames);
		});

		pluginHookTest('plugin SessionStart hook runs when the provider materializes', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri, hookLog } = await createPluginSession('hook-session-start', { hookType: 'SessionStart' });
			await pluginState(sessionUri, pluginUri);
			await driveTurnToCompletion(context.client, sessionUri, 'turn-hook-session-start', 'Reply exactly "ready".', 2);

			await waitForHook(hookLog, 'SessionStart');
		});

		pluginHookTest('plugin UserPromptSubmit hook receives the submitted prompt', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri, hookLog } = await createPluginSession('hook-user-prompt', { hookType: 'UserPromptSubmit' });
			await pluginState(sessionUri, pluginUri);
			await driveTurnToCompletion(context.client, sessionUri, 'turn-hook-user-prompt', 'Reply exactly "HOOK_PROMPT_READY".', 2);
			const hookContent = await waitForHook(hookLog, 'UserPromptSubmit');

			assert.ok(hookContent.includes('HOOK_PROMPT_READY'));
		});

		pluginHookTest('plugin PreToolUse hook runs before an MCP tool', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri, hookLog } = await createPluginSession('hook-pre-tool', { hookType: 'PreToolUse' });
			await pluginState(sessionUri, pluginUri);
			await driveTurnToCompletion(context.client, sessionUri, 'turn-hook-pre-tool', 'Call customization_probe exactly once, then reply with only its exact result.', 2);
			const hookContent = await waitForHook(hookLog, 'PreToolUse');

			assert.ok(hookContent.includes('customization_probe'));
		});

		pluginHookTest('plugin PostToolUse hook runs after an MCP tool result', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri, hookLog } = await createPluginSession('hook-post-tool', { hookType: 'PostToolUse' });
			await pluginState(sessionUri, pluginUri);
			await driveTurnToCompletion(context.client, sessionUri, 'turn-hook-post-tool', 'Call customization_probe exactly once, then reply with only its exact result.', 2);
			const hookContent = await waitForHook(hookLog, 'PostToolUse');

			assert.ok(hookContent.includes('MCP_PLUGIN_RESULT'));
		});

		pluginHookTest('plugin SessionEnd hook runs when the session is disposed', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri, hookLog } = await createPluginSession('hook-session-end', { hookType: 'SessionEnd' });
			await pluginState(sessionUri, pluginUri);
			await driveTurnToCompletion(context.client, sessionUri, 'turn-hook-session-end', 'Reply exactly "ready".', 2);

			await context.client.call('disposeSession', { channel: sessionUri }, 30_000);
			createdSessions.splice(createdSessions.indexOf(sessionUri), 1);
			await waitForHook(hookLog, 'SessionEnd');
		});

		pluginHookTest('failing plugin hook is non-fatal to the provider turn', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri, hookLog } = await createPluginSession('hook-failure', { hookType: 'UserPromptSubmit', hookExitCode: 7 });
			await pluginState(sessionUri, pluginUri);
			const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-hook-failure', 'Reply exactly "HOOK_FAILURE_SURVIVED".', 2);

			await waitForHook(hookLog, 'UserPromptSubmit');
			assert.strictEqual(result.responseText.trim(), 'HOOK_FAILURE_SURVIVED');
		});

		pluginHookTest('non-JSON plugin hook output is ignored without failing the provider turn', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri, hookLog } = await createPluginSession('hook-non-json', { hookType: 'PostToolUse', hookStdout: 'not-json' });
			await pluginState(sessionUri, pluginUri);
			const turnId = 'turn-hook-non-json';
			const result = await driveTurnToCompletion(context.client, sessionUri, turnId, 'Call customization_probe exactly once, then reply with only its exact result.', 2);

			await waitForHook(hookLog, 'PostToolUse');
			assert.ok(result.responseText.includes('MCP_PLUGIN_RESULT'));
		});

		test('plugin MCP tool executes and returns its result to the model', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri } = await createPluginSession('tool');
			await pluginState(sessionUri, pluginUri);

			await driveTurnToCompletion(
				context.client,
				sessionUri,
				'turn-mcp-plugin-tool',
				'Call customization_probe exactly once, then reply with only its exact result.',
				2,
			);

			assert.ok(toolResultTexts(sessionUri, 'turn-mcp-plugin-tool').includes('MCP_PLUGIN_RESULT'));
		});

		test('plugin MCP server can be stopped and restarted through AHP', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri } = await createPluginSession('lifecycle');
			await pluginState(sessionUri, pluginUri);
			await driveTurnToCompletion(context.client, sessionUri, 'turn-mcp-plugin-ready', 'Reply exactly "ready".', 2);
			const ready = await retry(async () => {
				const server = await mcpServerState(sessionUri, pluginUri);
				if (server.state.kind !== McpServerStatus.Ready) {
					throw new Error(`MCP server is ${server.state.kind}`);
				}
				return server;
			}, 100, 100);

			context.client.dispatch({
				channel: sessionUri,
				clientSeq: 10,
				action: { type: ActionType.SessionMcpServerStopRequested, id: ready.id },
			});
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'session/mcpServerStopRequested')
				&& getActionEnvelope(n).channel === sessionUri,
				30_000,
			);
			await retry(async () => {
				assert.strictEqual((await mcpServerState(sessionUri, pluginUri)).state.kind, McpServerStatus.Stopped);
			}, 100, 100);

			context.client.dispatch({
				channel: sessionUri,
				clientSeq: 11,
				action: { type: ActionType.SessionMcpServerStartRequested, id: ready.id },
			});
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'session/mcpServerStartRequested')
				&& getActionEnvelope(n).channel === sessionUri,
				30_000,
			);
			await retry(async () => {
				assert.strictEqual((await mcpServerState(sessionUri, pluginUri)).state.kind, McpServerStatus.Ready);
			}, 100, 100);
		});

		test('plugin MCP form elicitation round-trips structured answers', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri } = await createPluginSession('elicit-form');
			await pluginState(sessionUri, pluginUri);

			const result = await driveTurnToCompletion(
				context.client,
				sessionUri,
				'turn-mcp-elicit-form',
				'Call customization_elicit_form exactly once, then reply with only its exact result.',
				2,
			);

			assert.ok(result.sawInputRequest);
			assert.ok(toolResultTexts(sessionUri, 'turn-mcp-elicit-form').includes('ELICIT_FORM:accept:Apple:3:true'));
		});

		test('plugin MCP URL elicitation round-trips acceptance', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri } = await createPluginSession('elicit-url');
			await pluginState(sessionUri, pluginUri);

			const result = await driveTurnToCompletion(
				context.client,
				sessionUri,
				'turn-mcp-elicit-url',
				'Call customization_elicit_url exactly once, then reply with only its exact result.',
				2,
			);

			assert.ok(result.sawInputRequest);
			assert.ok(toolResultTexts(sessionUri, 'turn-mcp-elicit-url').includes('ELICIT_URL:accept'));
		});

		test('plugin MCP extended form round-trips text number and multi-select answers', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri } = await createPluginSession('elicit-extended');
			await pluginState(sessionUri, pluginUri);

			const result = await driveTurnToCompletion(
				context.client,
				sessionUri,
				'turn-mcp-elicit-extended',
				'Call customization_elicit_extended exactly once, then reply with only its exact result.',
				2,
			);

			assert.ok(result.sawInputRequest);
			assert.ok(toolResultTexts(sessionUri, 'turn-mcp-elicit-extended').includes('ELICIT_EXTENDED:accept:sample:2.5:Red'));
		});

		test('plugin MCP form coerces text answers to boolean number and array values', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri } = await createPluginSession('elicit-coercion-text');
			await pluginState(sessionUri, pluginUri);
			const turnId = 'turn-mcp-elicit-coercion-text';
			await driveCoercionTurn(sessionUri, turnId, request => Object.fromEntries(request.questions!.map(question => {
				const value = question.id === 'enabled' ? 'false'
					: question.id === 'ratio' ? '4.5'
						: question.id === 'colors' ? 'Blue'
							: 'Banana';
				return [question.id, {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Text, value },
				} satisfies ChatInputAnswer];
			})));

			assert.ok(toolResultTexts(sessionUri, turnId).includes('COERCION:boolean:false:number:4.5:array:Blue:string:Banana'));
		});

		test('plugin MCP form combines selected and freeform array answers', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri } = await createPluginSession('elicit-coercion-selected');
			await pluginState(sessionUri, pluginUri);
			const turnId = 'turn-mcp-elicit-coercion-selected';
			await driveCoercionTurn(sessionUri, turnId, request => Object.fromEntries(request.questions!.map(question => {
				let answer: ChatInputAnswer;
				if (question.id === 'enabled') {
					answer = { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Boolean, value: true } };
				} else if (question.id === 'ratio') {
					answer = { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Number, value: 2.5 } };
				} else if (question.id === 'colors') {
					answer = { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ['Red'], freeformValues: ['Blue'] } };
				} else {
					answer = { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: 'Apple' } };
				}
				return [question.id, answer];
			})));

			assert.ok(toolResultTexts(sessionUri, turnId).includes('COERCION:boolean:true:number:2.5:array:Red+Blue:string:Apple'));
		});

		test('plugin MCP form elicitation cancellation returns to the model', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri } = await createPluginSession('elicit-cancel');
			await pluginState(sessionUri, pluginUri);

			const result = await driveTurnWithCancelledInputToCompletion(
				context.client,
				sessionUri,
				'turn-mcp-elicit-cancel',
				'Call customization_elicit_form exactly once. If the elicitation is cancelled, reply exactly "elicitation cancelled".',
				2,
			);

			assert.ok(result.sawInputRequest);
			assert.ok(toolResultTexts(sessionUri, 'turn-mcp-elicit-cancel').some(text => text.startsWith('ELICIT_FORM:cancel')));
			assert.ok(result.responseText.trim().endsWith('elicitation cancelled'));
		});

		test('plugin MCP sampling cancellation returns to the model', async function () {
			this.timeout(180_000);
			const { sessionUri, pluginUri } = await createPluginSession('sampling');
			await pluginState(sessionUri, pluginUri);

			const result = await driveTurnToCompletion(
				context.client,
				sessionUri,
				'turn-mcp-sampling',
				'Call customization_sample exactly once. If sampling is cancelled, reply exactly "sampling cancelled".',
				2,
			);

			assert.ok(toolResultTexts(sessionUri, 'turn-mcp-sampling').some(text => text.includes('MCP_SAMPLE:The user cancelled the request.')));
			assert.ok(result.responseText.trim().endsWith('sampling cancelled'));
		});
	}
}
