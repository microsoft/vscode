/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { McpServerStatus } from '../../../../common/state/protocol/state.js';
import { ActionType, type ChatToolCallCompleteAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, customizationId, CustomizationType, type ClientPluginCustomization, type McpServerCustomization, type PluginCustomization, type SessionState } from '../../../../common/state/sessionState.js';
import { createRealSession, driveTurnToCompletion, driveTurnWithCancelledInputToCompletion, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { providerHostOnlyTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

const nodeRequire = createRequire(import.meta.url);

interface IPluginSession {
	readonly sessionUri: string;
	readonly pluginUri: string;
	readonly clientId: string;
}

export function defineMcpPluginTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity') {
		return;
	}
	const { config, createdSessions, tempDirs } = context;
	if (config.provider === 'claude') {
		return;
	}

	async function createPluginSession(prefix: string): Promise<IPluginSession> {
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
		const mcpScript = join(plugin, 'probe-mcp.cjs');
		const mcpServerModule = nodeRequire.resolve('@modelcontextprotocol/sdk/server/index.js');
		const mcpStdioModule = nodeRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js');
		const mcpTypesModule = nodeRequire.resolve('@modelcontextprotocol/sdk/types.js');
		writeFileSync(join(plugin, manifestDirectory, 'plugin.json'), JSON.stringify({ name: 'E2E MCP Plugin' }));
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
			name: 'E2E MCP Plugin',
			nonce: '1',
			enabled: true,
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
		return { sessionUri, pluginUri, clientId };
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
			action: { type: ActionType.SessionCustomizationToggled, id: plugin.id, enabled: false },
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'session/customizationToggled')
			&& getActionEnvelope(n).channel === sessionUri,
			30_000,
		);
		assert.strictEqual((await pluginState(sessionUri, pluginUri)).enabled, false);

		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 11,
			action: { type: ActionType.SessionCustomizationToggled, id: plugin.id, enabled: true },
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'session/customizationToggled')
			&& getActionEnvelope(n).channel === sessionUri,
			30_000,
		);
		assert.strictEqual((await pluginState(sessionUri, pluginUri)).enabled, true);
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
