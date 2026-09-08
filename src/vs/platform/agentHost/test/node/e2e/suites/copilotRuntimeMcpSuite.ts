/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { CustomizationEnablementKind, McpServerStatus } from '../../../../common/state/protocol/state.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, customizationId, CustomizationType, ROOT_STATE_URI, type ClientPluginCustomization, type McpServerCustomization, type PluginCustomization, type SessionState } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { createRealSession, driveTurnToCompletion, resolveGitHubToken, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const nodeRequire = createRequire(import.meta.url);
const imageData = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP4z8BAEiJN9aiGUQ1DSgMAkPn/Afnh+ngAAAAASUVORK5CYII=';
const invalidImageData = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const imageOmittedNote = '[MCP image omitted because its data was invalid or its MIME type unsupported]';

export function defineCopilotRuntimeMcpTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	async function createPluginSession(includeImages = false) {
		const root = mkdtempSync(join(tmpdir(), 'ahp-runtime-mcp-'));
		const workspace = join(root, 'workspace');
		const plugin = join(root, 'plugin');
		context.tempDirs.push(root);
		mkdirSync(workspace);
		mkdirSync(plugin);
		execFileSync('git', ['init', '--quiet', workspace]);
		mkdirSync(join(plugin, '.plugin'));
		mkdirSync(join(plugin, 'skills', 'runtime-reference'), { recursive: true });
		writeFileSync(join(plugin, '.plugin', 'plugin.json'), JSON.stringify({ name: 'runtime-mcp' }));
		writeFileSync(join(plugin, 'reference.txt'), 'HOST_PLUGIN_REFERENCE_OK');
		writeFileSync(join(plugin, 'skills', 'runtime-reference', 'SKILL.md'), [
			'---',
			'name: runtime-reference',
			'description: Read the plugin reference',
			'---',
			'Read the plugin reference using view. Derive its absolute path by replacing the exact suffix "/skills/runtime-reference" of this skill base directory with "/reference.txt". Preserve every other directory component, including the numeric version directory. Reply with the exact file contents.',
		].join('\n'));

		const calls = join(workspace, 'mcp-calls.jsonl');
		writeFileSync(calls, '');
		const script = join(plugin, 'probe.cjs');
		writeFileSync(script, [
			`const { appendFileSync } = require("fs");`,
			`const { Server } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/server/index.js'))});`,
			`const { StdioServerTransport } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js'))});`,
			`const { CallToolRequestSchema, ListToolsRequestSchema } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/types.js'))});`,
			'const server = new Server({ name: "runtime-probe", version: "1.0.0" }, { capabilities: { tools: {} } });',
			'server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{',
			'  name: "runtime_probe", description: "Returns MCP_PROBE followed by the tag",',
			'  inputSchema: { type: "object", properties: { tag: { type: "string" } }, required: ["tag"] },',
			'  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }',
			'}] }));',
			'server.setRequestHandler(CallToolRequestSchema, async request => {',
			'  const tag = request.params.arguments.tag;',
			`  appendFileSync(${JSON.stringify(calls)}, JSON.stringify(tag) + "\\n");`,
			`  return { content: [{ type: "text", text: \`MCP_PROBE:\${tag}\` }, ...${JSON.stringify(includeImages ? [
				{ type: 'image', data: imageData, mimeType: 'image/png' },
				{ type: 'image', data: invalidImageData, mimeType: 'image/png' }, // GIF bytes with a mismatched MIME type.
			] : [])}] };`,
			'});',
			'server.connect(new StdioServerTransport());',
		].join('\n'));
		const serverConfig = { command: process.execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: '1' }, tools: ['*'] };
		writeFileSync(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { 'runtime-probe': serverConfig } }));
		const pluginUri = URI.file(plugin).toString();
		const clientId = 'runtime-mcp-client';
		const sessionUri = await createRealSession(context.client, context.config, clientId, context.createdSessions, URI.file(workspace));
		const customization: ClientPluginCustomization = {
			type: CustomizationType.Plugin,
			id: customizationId(pluginUri),
			uri: pluginUri,
			name: 'runtime-mcp',
			nonce: '1',
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
		};
		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: { type: ActionType.SessionActiveClientSet, activeClient: { clientId, tools: [], customizations: [customization] } },
		});
		await retry(async () => {
			const state = await pluginState(sessionUri, pluginUri);
			assert.ok(state.children?.some(child => child.type === CustomizationType.McpServer));
		}, 100, 100);
		return { sessionUri, pluginUri, workspace, calls, customization };
	}

	async function restartPluginSession(session: Awaited<ReturnType<typeof createPluginSession>>): Promise<void> {
		await context.restartServer();
		context.client.setWorkingDirectory(session.workspace);
		const clientId = 'runtime-mcp-resumed-client';
		await context.client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId }, 30_000);
		await context.client.call('authenticate', {
			channel: ROOT_STATE_URI,
			resource: 'https://api.github.com',
			token: context.config.githubToken ?? resolveGitHubToken(),
		}, 30_000);
		await context.client.call<SubscribeResult>('subscribe', { channel: session.sessionUri });
		await context.client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(session.sessionUri) });
		context.client.dispatch({
			channel: session.sessionUri,
			clientSeq: 1,
			action: { type: ActionType.SessionActiveClientSet, activeClient: { clientId, tools: [], customizations: [session.customization] } },
		});
		await retry(async () => {
			const plugin = await pluginState(session.sessionUri, session.pluginUri);
			assert.strictEqual(plugin.clientId, clientId);
			assert.ok(plugin.children?.some(child => child.type === CustomizationType.McpServer));
		}, 100, 100);
	}

	async function pluginState(sessionUri: string, pluginUri: string): Promise<PluginCustomization> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		const plugin = (result.snapshot!.state as SessionState).customizations?.find((item): item is PluginCustomization =>
			item.type === CustomizationType.Plugin && item.uri === pluginUri);
		assert.ok(plugin);
		return plugin;
	}

	async function serverState(sessionUri: string, pluginUri: string): Promise<McpServerCustomization> {
		const plugin = await pluginState(sessionUri, pluginUri);
		const server = plugin.children?.find((child): child is McpServerCustomization => child.type === CustomizationType.McpServer);
		assert.ok(server);
		return server;
	}

	function probeResults(sessionUri: string): string[] {
		return context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallComplete')).flatMap(notification => {
			const { channel, action } = getActionEnvelope(notification);
			return channel === buildDefaultChatUri(sessionUri) && action.type === ActionType.ChatToolCallComplete
				? [textFromContent(action.result.content ?? [])].filter(text => text.startsWith('MCP_PROBE:'))
				: [];
		});
	}

	test('runtime MCP: invalid sibling images are omitted before model requests and cold resume', async function () {
		this.timeout(240_000);
		const session = await createPluginSession(true);
		const result = await driveTurnToCompletion(context.client, session.sessionUri, 'mixed-images',
			'Call runtime_probe exactly once with tag "images", then reply exactly MCP_IMAGES_READY. Do not call any other tools.', 2);
		const request = context.observedModelRequestBodies.at(-1)!;
		const modelRequest: {
			messages: { content: { type: string; content?: string | { type: string; source?: { type: string; media_type: string; data: string } }[] }[] }[];
		} = JSON.parse(request);
		const imageSources = modelRequest.messages.flatMap(message => message.content)
			.filter(block => block.type === 'tool_result')
			.flatMap(block => Array.isArray(block.content) ? block.content : [])
			.filter(block => block.type === 'image')
			.map(block => block.source);
		const completions = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallComplete))
			.flatMap(notification => {
				const { channel, action } = getActionEnvelope(notification);
				return channel === buildDefaultChatUri(session.sessionUri) && action.type === ActionType.ChatToolCallComplete
					? [action.result.success] : [];
			});
		assert.deepStrictEqual({
			response: result.responseText.trim(),
			calls: readFileSync(session.calls, 'utf8'),
			toolCompletions: completions,
			textReachedModel: request.includes('MCP_PROBE:images'),
			imageSources,
			invalidImageReachedModel: request.includes(invalidImageData),
			omissionNotes: request.split(imageOmittedNote).length - 1,
		}, {
			response: 'MCP_IMAGES_READY',
			calls: '"images"\n',
			toolCompletions: [true],
			textReachedModel: true,
			imageSources: [{ type: 'base64', media_type: 'image/png', data: imageData }],
			invalidImageReachedModel: false,
			omissionNotes: 1,
		});

		await restartPluginSession(session);
		const resumedRequestIndex = context.observedModelRequestBodies.length;
		const resumed = await driveTurnToCompletion(context.client, session.sessionUri, 'mixed-images-resumed',
			'Reply exactly MCP_IMAGES_RESUMED. Do not call tools.', 2);
		const resumedRequests = context.observedModelRequestBodies.slice(resumedRequestIndex);
		assert.deepStrictEqual({
			response: resumed.responseText.trim(),
			requestCount: resumedRequests.length,
			historyReachedModel: resumedRequests[0]?.includes('MCP_PROBE:images'),
			invalidImageReachedModel: resumedRequests.some(body => body.includes(invalidImageData)),
			calls: readFileSync(session.calls, 'utf8'),
		}, {
			response: 'MCP_IMAGES_RESUMED',
			requestCount: 1,
			historyReachedModel: true,
			invalidImageReachedModel: false,
			calls: '"images"\n',
		});
	});

	test('runtime MCP: plugin tools remain callable after a built-in subagent', async function () {
		this.timeout(240_000);
		const { sessionUri, calls } = await createPluginSession();
		await driveTurnToCompletion(context.client, sessionUri, 'probe-before-child', 'Call runtime_probe exactly once with tag "before", then reply with its exact result.', 2);
		assert.deepStrictEqual(probeResults(sessionUri), ['MCP_PROBE:before']);
		await driveTurnToCompletion(context.client, sessionUri, 'builtin-child',
			'Call task exactly once with {"name":"probe-child","description":"Reply without tools","agent_type":"general-purpose","mode":"sync","prompt":"Reply exactly CHILD_READY. Do not call tools."}. After it finishes reply exactly PARENT_READY.', 10);
		assert.ok(context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart')).some(notification => {
			const action = getActionEnvelope(notification).action;
			return action.type === ActionType.ChatToolCallStart && action.toolName === 'task';
		}));
		assert.ok(context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallComplete')).some(notification => {
			const action = getActionEnvelope(notification).action;
			return action.type === ActionType.ChatToolCallComplete && textFromContent(action.result.content ?? []).includes('CHILD_READY');
		}));
		await driveTurnToCompletion(context.client, sessionUri, 'probe-after-child', 'Call runtime_probe exactly once with tag "after", then reply with its exact result.', 20);
		assert.deepStrictEqual({ results: probeResults(sessionUri), calls: readFileSync(calls, 'utf8') }, {
			results: ['MCP_PROBE:after'], calls: '"before"\n"after"\n',
		});
	});

	test('runtime MCP: tools execute after their server is stopped and restarted', async function () {
		this.timeout(180_000);
		const { sessionUri, pluginUri, calls } = await createPluginSession();
		await driveTurnToCompletion(context.client, sessionUri, 'probe-before-restart', 'Call runtime_probe exactly once with tag "before", then reply with its exact result.', 2);
		assert.deepStrictEqual(probeResults(sessionUri), ['MCP_PROBE:before']);
		const server = await serverState(sessionUri, pluginUri);
		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 10,
			action: { type: ActionType.SessionMcpServerStopRequested, id: server.id },
		});
		await retry(async () => assert.strictEqual((await serverState(sessionUri, pluginUri)).state.kind, McpServerStatus.Stopped), 100, 100);
		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 11,
			action: { type: ActionType.SessionMcpServerStartRequested, id: server.id },
		});
		await retry(async () => assert.strictEqual((await serverState(sessionUri, pluginUri)).state.kind, McpServerStatus.Ready), 100, 100);
		await driveTurnToCompletion(context.client, sessionUri, 'probe-after-restart', 'Call runtime_probe exactly once with tag "after", then reply with its exact result.', 20);
		assert.deepStrictEqual({ results: probeResults(sessionUri), calls: readFileSync(calls, 'utf8') }, {
			results: ['MCP_PROBE:after'], calls: '"before"\n"after"\n',
		});
	});

	test('runtime MCP: host plugin supporting files are readable without approval', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createPluginSession();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'plugin-reference',
			'Invoke the runtime-reference skill exactly once, follow its instructions to read the plugin reference file, then reply with its exact contents.', 2);
		assert.deepStrictEqual({ confirmation: result.sawPendingConfirmation, response: result.responseText.trim() }, {
			confirmation: false, response: 'HOST_PLUGIN_REFERENCE_OK',
		});
		assert.ok(context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallComplete')).some(notification => {
			const action = getActionEnvelope(notification).action;
			return action.type === ActionType.ChatToolCallComplete && textFromContent(action.result.content ?? []) === 'HOST_PLUGIN_REFERENCE_OK';
		}));
	});
}
