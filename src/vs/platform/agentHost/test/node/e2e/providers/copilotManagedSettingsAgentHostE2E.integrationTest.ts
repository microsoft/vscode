/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../../../common/agent.js';
import type { IAgentHostManagedSettingsDiagnostics } from '../../../../common/agentService.js';
import type { IAgentHostManagedSettingsPermissions } from '../../../../common/agentHostManagedSettings.js';
import { toClientPluginMcpDefaultCwdsMeta, toClientPluginStandaloneMeta } from '../../../../common/meta/clientPluginCustomizationMeta.js';
import { SessionConfigKey } from '../../../../common/sessionConfigKeys.js';
import type { ListSessionsResult, SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { CustomizationEnablementKind } from '../../../../common/state/protocol/state.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { buildChatUri, buildDefaultChatUri, customizationId, CustomizationLoadStatus, CustomizationType, MessageKind, ROOT_STATE_URI, ToolCallCancellationReason, ToolCallConfirmationReason, type ClientPluginCustomization, type PluginCustomization, type SessionState } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification, TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { AgentHostE2EServerLease, assertToolCallCompleteText, createRealSession, driveTurnToCompletion, removeTempDirs, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { COPILOT_CONFIG } from './copilotTestConfiguration.js';
import { createTestDirectory } from '../harness/testDirectories.js';

suite('Agent Host E2E — Copilot managed-settings diagnostics', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('fetched server policy appears in sessionless diagnostics and channel layers', async function () {
		this.timeout(60_000);
		const directory = createTestDirectory(join(tmpdir(), 'copilot-policy-diagnostics-'));
		const lease = new AgentHostE2EServerLease(COPILOT_CONFIG, {
			env: {
				COPILOT_CACHE_HOME: join(directory, 'cache'),
				COPILOT_MANAGED_SETTINGS_CACHE: '0',
			},
		});
		try {
			const { client, server } = await lease.acquire(this.test!.title, 'none');
			assert.ok(server.capiReplay);
			const policy = { permissions: { disableBypassPermissionsMode: 'disable' } };
			server.capiReplay.setManagedSettings(policy);
			await client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: 'server-policy-diagnostics',
			});
			await client.call('subscribe', { channel: ROOT_STATE_URI });
			await client.call('authenticate', {
				channel: ROOT_STATE_URI,
				resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
				token: resolveGitHubToken(),
			});
			// Authentication schedules runtime startup; the model catalog confirms a completed sessionless RPC.
			await client.waitForNotification(n => {
				if (!isActionNotification(n, ActionType.RootAgentsChanged)) {
					return false;
				}
				const action = getActionEnvelope(n).action;
				return action.type === ActionType.RootAgentsChanged
					&& action.agents.some(agent => agent.provider === COPILOT_CONFIG.provider && agent.models.length > 0);
			});
			const previousRequests = server.capiReplay.managedSettingsRequestCount;
			const diagnostics = await client.call<readonly IAgentHostManagedSettingsDiagnostics[]>('getManagedSettingsDiagnostics');
			const provider = diagnostics.find(entry => entry.provider === COPILOT_CONFIG.provider);
			assert.ok(provider);
			assert.strictEqual(provider.error, undefined);
			const snapshot = provider.snapshot;
			assert.ok(snapshot);
			assert.ok(snapshot.account);
			assert.strictEqual(snapshot.serverManaged, true);
			assert.ok(snapshot.source === 'server' || snapshot.source === 'mixed');
			assert.ok(snapshot.managedKeys.includes('permissions'));
			assert.strictEqual(snapshot.bypassPermissionsDisabled, true);
			assert.ok(snapshot.settings && typeof snapshot.settings === 'object');
			assert.deepStrictEqual(Object.entries(snapshot.settings).find(([key]) => key === 'permissions')?.[1], policy.permissions);
			assert.deepStrictEqual(snapshot.layers?.find(layer => layer.source === 'server')?.settings, policy);
			assert.deepStrictEqual(snapshot.diagnostics, []);
			assert.ok(server.capiReplay.managedSettingsRequestCount > previousRequests, 'The diagnostic must fetch server policy, not just report an injected client setting');
			assert.deepStrictEqual(server.capiReplay.observedModelRequestBodies, []);
			const sessions = await client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
			assert.deepStrictEqual(sessions.items, []);
		} catch (error) {
			lease.dumpRuntimeLogsOnFailure(this.test!.title);
			throw error;
		} finally {
			try {
				await lease.release([], this.test?.state === 'failed');
			} finally {
				try {
					await lease.dispose();
				} finally {
					await removeTempDirs([directory]);
				}
			}
		}
	});
});

suite('Agent Host E2E — Copilot managed permissions over AHP', function () {
	ensureNoDisposablesAreLeakedInTestSuite();
	let client: TestProtocolClient;
	let lease: AgentHostE2EServerLease;
	let workspace: string;
	let clientSeq: number;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	setup(async function () {
		this.timeout(60_000);
		workspace = createTestDirectory(join(tmpdir(), 'copilot-managed-ahp-'));
		tempDirs.push(workspace);
		await writeFile(join(workspace, 'input.txt'), 'MANAGED_READ_CONTENT');
		clientSeq = 1;
		lease = new AgentHostE2EServerLease(COPILOT_CONFIG);
		({ client } = await lease.acquire(this.currentTest!.title));
	});

	teardown(async function () {
		this.timeout(120_000);
		try {
			if (this.currentTest?.state === 'failed') {
				lease.dumpRuntimeLogsOnFailure(this.currentTest.title);
			}
			await lease.release(createdSessions, this.currentTest?.state === 'failed');
		} finally {
			try {
				await lease.dispose();
			} finally {
				await removeTempDirs(tempDirs);
			}
		}
	});

	async function contribute(permissions: IAgentHostManagedSettingsPermissions): Promise<void> {
		client.notify('setClientManagedSettingsPermissions', { permissions });
		await client.call('listSessions', { channel: ROOT_STATE_URI });
	}

	async function createSession(permissions: IAgentHostManagedSettingsPermissions, mode = 'autoApprove'): Promise<string> {
		return createRealSession(client, {
			...COPILOT_CONFIG,
			sessionConfig: { [SessionConfigKey.AutoApprove]: mode },
		}, 'managed-permissions-ahp', createdSessions, URI.file(workspace), () => contribute(permissions));
	}

	async function fileTurn(chat: string, turnId: string, operation: 'read' | 'write', approval: 'approve' | 'deny' | 'none' | 'blocked', filename = `${turnId}.txt`): Promise<void> {
		const prompt = operation === 'read'
			? 'Use view exactly once to read input.txt anew, even if you read it before. Do not use a shell. If denied, stop and reply denied.'
			: `Use create exactly once to create ${filename} containing exactly MANAGED_WRITE_CONTENT. Do not use a shell. If denied, stop and reply denied without retrying or using another tool.`;
		client.dispatch({
			channel: chat,
			clientSeq: clientSeq++,
			action: { type: ActionType.ChatTurnStarted, turnId, startedAt: new Date().toISOString(), message: { text: prompt, origin: { kind: MessageKind.User } } },
		});
		let afterServerSeq = 0;
		let confirmations = 0;
		while (true) {
			const notification = await client.waitForNotification(notification => {
				if (!isActionNotification(notification, ActionType.ChatToolCallReady)
					&& !isActionNotification(notification, ActionType.ChatTurnComplete)
					&& !isActionNotification(notification, ActionType.ChatError)) {
					return false;
				}
				const envelope = getActionEnvelope(notification);
				const action = envelope.action;
				return envelope.channel === chat && envelope.serverSeq > afterServerSeq
					&& (action.type === ActionType.ChatToolCallReady || action.type === ActionType.ChatTurnComplete || action.type === ActionType.ChatError)
					&& action.turnId === turnId;
			}, 90_000);
			const envelope = getActionEnvelope(notification);
			afterServerSeq = envelope.serverSeq;
			const action = envelope.action;
			if (action.type === ActionType.ChatError) {
				throw new Error(`Managed permission turn failed: ${action.part.error.errorType}: ${action.part.error.message}`);
			}
			if (action.type === ActionType.ChatTurnComplete) {
				break;
			}
			assert.ok(action.type === ActionType.ChatToolCallReady);
			if (action.confirmed) {
				continue;
			}
			confirmations++;
			assert.ok(approval === 'approve' || approval === 'deny', 'Removed asks and managed denials must not require confirmation');
			assert.deepStrictEqual(action.options?.map(option => option.id), ['allow-once', 'skip']);
			if (operation === 'write') {
				assert.strictEqual(existsSync(join(workspace, filename)), false, 'The file must not be written before human approval');
			}
			client.dispatch({
				channel: chat,
				clientSeq: clientSeq++,
				action: approval === 'approve'
					? { type: ActionType.ChatToolCallConfirmed, turnId, toolCallId: action.toolCallId, approved: true, confirmed: ToolCallConfirmationReason.UserAction, selectedOptionId: 'allow-once' }
					: { type: ActionType.ChatToolCallConfirmed, turnId, toolCallId: action.toolCallId, approved: false, reason: ToolCallCancellationReason.Denied, selectedOptionId: 'skip' },
			});
		}
		assert.strictEqual(confirmations, approval === 'approve' || approval === 'deny' ? 1 : 0);
		if (approval === 'blocked') {
			if (operation === 'write') {
				assert.strictEqual(existsSync(join(workspace, filename)), false);
			}
			assertToolCallCompleteText(client, { channel: chat, turnId, toolNames: [operation === 'read' ? 'view' : 'create'], expected: [/denied|blocked|policy/i], success: false });
		} else if (approval === 'deny') {
			assert.strictEqual(existsSync(join(workspace, filename)), false);
		} else if (operation === 'write') {
			assert.strictEqual(await readFile(join(workspace, filename), 'utf8'), 'MANAGED_WRITE_CONTENT');
			assertToolCallCompleteText(client, { channel: chat, turnId, toolNames: ['create'], expected: [], success: true });
		} else {
			assertToolCallCompleteText(client, { channel: chat, turnId, toolNames: ['view'], expected: [/MANAGED_READ_CONTENT/], success: true });
		}
	}

	for (const mode of ['autoApprove', 'assisted']) {
		test(`managed read approval remains one-time under ${mode}`, async function () {
			this.timeout(180_000);
			const session = await createSession({ ask: ['Read'] }, mode);
			const chat = buildDefaultChatUri(session);
			await fileTurn(chat, 'managed-read-first', 'read', 'approve');
			await fileTurn(chat, 'managed-read-second', 'read', 'approve');
		});

		test(`managed write approval remains one-time under ${mode}`, async function () {
			this.timeout(180_000);
			const session = await createSession({ ask: ['Write'] }, mode);
			const chat = buildDefaultChatUri(session);
			await fileTurn(chat, 'managed-write-first', 'write', 'approve');
			await fileTurn(chat, 'managed-write-second', 'write', 'approve');
		});

		test(`managed write denial prevents mutation under ${mode}`, async function () {
			this.timeout(180_000);
			const session = await createSession({ ask: ['Write'] }, mode);
			await fileTurn(buildDefaultChatUri(session), 'managed-write-denied', 'write', 'deny');
		});
	}

	for (const operation of ['read', 'write'] as const) {
		test(`managed ${operation} denial blocks the native tool under Allow All`, async function () {
			this.timeout(180_000);
			const session = await createSession({ deny: [operation === 'read' ? 'Read' : 'Write'] });
			await fileTurn(buildDefaultChatUri(session), `managed-${operation}-blocked`, operation, 'blocked');
		});
	}

	test('removing managed asks refreshes both default and peer chats before their next turn', async function () {
		this.timeout(180_000);
		const session = await createSession({ ask: ['Write'] });
		const defaultChat = buildDefaultChatUri(session);
		const peer = buildChatUri(session, 'managed-peer');
		await client.call('createChat', { channel: session, chat: peer });
		await client.call<SubscribeResult>('subscribe', { channel: peer });
		await fileTurn(defaultChat, 'managed-default-before', 'write', 'approve');
		await fileTurn(peer, 'managed-peer-before', 'write', 'approve');
		await contribute({});
		await fileTurn(defaultChat, 'managed-default-after', 'write', 'none');
		await fileTurn(peer, 'managed-peer-after', 'write', 'none');
	});

	test('adding managed asks refreshes both materialized default and peer chats', async function () {
		this.timeout(180_000);
		const session = await createSession({});
		const defaultChat = buildDefaultChatUri(session);
		const peer = buildChatUri(session, 'managed-peer');
		await client.call('createChat', { channel: session, chat: peer });
		await client.call<SubscribeResult>('subscribe', { channel: peer });
		await fileTurn(defaultChat, 'unmanaged-default-before', 'write', 'none');
		await fileTurn(peer, 'unmanaged-peer-before', 'write', 'none');
		await contribute({ ask: ['Write'] });
		await fileTurn(defaultChat, 'new-managed-default', 'write', 'approve');
		await fileTurn(peer, 'new-managed-peer', 'write', 'approve');
	});

	test('cold host resume reapplies the current managed ask contribution', async function () {
		this.timeout(180_000);
		const session = await createSession({ ask: ['Write'] });
		await fileTurn(buildDefaultChatUri(session), 'managed-before-restart', 'write', 'approve');
		client = await lease.restart();
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'managed-resumed-client' });
		await client.call('authenticate', { channel: ROOT_STATE_URI, resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: resolveGitHubToken() });
		await contribute({ ask: ['Write'] });
		await client.call('subscribe', { channel: session });
		await client.call('subscribe', { channel: buildDefaultChatUri(session) });
		clientSeq = 1;
		await fileTurn(buildDefaultChatUri(session), 'managed-after-restart', 'write', 'approve');
	});

	test('cold host resume does not persist a removed managed ask contribution', async function () {
		this.timeout(180_000);
		const session = await createSession({ ask: ['Write'] });
		await fileTurn(buildDefaultChatUri(session), 'managed-before-clear', 'write', 'approve');
		client = await lease.restart();
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'managed-cleared-client' });
		await client.call('authenticate', { channel: ROOT_STATE_URI, resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: resolveGitHubToken() });
		await contribute({});
		await client.call('subscribe', { channel: session });
		await client.call('subscribe', { channel: buildDefaultChatUri(session) });
		clientSeq = 1;
		await fileTurn(buildDefaultChatUri(session), 'managed-after-clear', 'write', 'none');
	});
});

suite('Agent Host E2E — Copilot customization lockdown', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	interface ILockdownFixture {
		readonly workspace: string;
		readonly plugin: ClientPluginCustomization;
		readonly standalone: ClientPluginCustomization;
	}

	interface IRuntimeCustomizations {
		readonly pluginSkill: boolean;
		readonly standaloneSkill: boolean;
		readonly standaloneServer: boolean;
	}

	async function createFixture(directory: string): Promise<ILockdownFixture> {
		const workspace = join(directory, 'workspace');
		const pluginDirectory = join(directory, 'plugin');
		const standaloneDirectory = join(directory, 'standalone');
		for (const folder of [
			workspace,
			join(pluginDirectory, '.plugin'),
			join(pluginDirectory, 'skills', 'lockdown-plugin-skill'),
			join(standaloneDirectory, '.plugin'),
			join(standaloneDirectory, 'skills', 'lockdown-standalone-skill'),
		]) {
			await mkdir(folder, { recursive: true });
		}
		await writeFile(join(pluginDirectory, '.plugin', 'plugin.json'), JSON.stringify({ name: 'Lockdown Plugin' }));
		await writeFile(join(pluginDirectory, 'skills', 'lockdown-plugin-skill', 'SKILL.md'), '---\nname: lockdown-plugin-skill\ndescription: Skill from a genuine plugin\n---\nPlugin skill.');
		await writeFile(join(standaloneDirectory, '.plugin', 'plugin.json'), JSON.stringify({ name: 'Standalone Customizations' }));
		await writeFile(join(standaloneDirectory, 'skills', 'lockdown-standalone-skill', 'SKILL.md'), '---\nname: lockdown-standalone-skill\ndescription: Skill from a configured user location\n---\nStandalone skill.');
		const serverScript = join(standaloneDirectory, 'probe-mcp.cjs');
		await writeFile(serverScript, [
			'const readline = require("readline");',
			'readline.createInterface({ input: process.stdin }).on("line", line => {',
			'  let request;',
			'  try { request = JSON.parse(line); } catch { return; }',
			'  if (request.id === undefined) { return; }',
			'  const result = request.method === "initialize"',
			'    ? { protocolVersion: (request.params && request.params.protocolVersion) || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "lockdown-standalone-server", version: "1.0.0" } }',
			'    : request.method === "tools/list" ? { tools: [] } : {};',
			'  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\\n");',
			'});',
		].join('\n'));
		await writeFile(join(standaloneDirectory, '.mcp.json'), JSON.stringify({
			mcpServers: {
				'lockdown-standalone-server': { command: process.execPath, args: [serverScript], env: { ELECTRON_RUN_AS_NODE: '1' } },
			},
		}));
		const toCustomization = (folder: string, name: string, meta?: Record<string, unknown>): ClientPluginCustomization => {
			const uri = URI.file(folder).toString();
			return {
				type: CustomizationType.Plugin,
				id: customizationId(uri),
				uri,
				name,
				nonce: '1',
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
				...(meta ? { _meta: meta } : {}),
			};
		};
		return {
			workspace,
			plugin: toCustomization(pluginDirectory, 'Lockdown Plugin'),
			// Mirrors the standalone bundle VS Code publishes for user and workspace customizations.
			standalone: toCustomization(standaloneDirectory, 'Standalone Customizations', {
				...toClientPluginStandaloneMeta(),
				...toClientPluginMcpDefaultCwdsMeta({ 'lockdown-standalone-server': null }),
			}),
		};
	}

	async function publishCustomizations(client: TestProtocolClient, clientId: string, sessionUri: string, fixture: ILockdownFixture, clientSeq: number): Promise<void> {
		client.dispatch({
			channel: sessionUri,
			clientSeq,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: { clientId, tools: [], customizations: [fixture.plugin, fixture.standalone] },
			},
		});
		await retry(async () => {
			const result = await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			const customizations = (result.snapshot!.state as SessionState).customizations ?? [];
			for (const expected of [fixture.plugin, fixture.standalone]) {
				const plugin = customizations.find((customization): customization is PluginCustomization =>
					customization.type === CustomizationType.Plugin && customization.uri === expected.uri);
				if (plugin?.load?.kind !== CustomizationLoadStatus.Loaded) {
					throw new Error(`${expected.name} has not loaded`);
				}
			}
		}, 100, 300);
	}

	/** Reads which probe customizations the runtime loaded from its own `/env` report, without a model request. */
	async function runtimeCustomizations(client: TestProtocolClient, sessionUri: string, turnId: string, clientSeq: number): Promise<IRuntimeCustomizations> {
		const { responseText } = await driveTurnToCompletion(client, sessionUri, turnId, '/env', clientSeq);
		assert.match(responseText, /Skills/);
		return {
			pluginSkill: responseText.includes('lockdown-plugin-skill'),
			standaloneSkill: responseText.includes('lockdown-standalone-skill'),
			standaloneServer: responseText.includes('lockdown-standalone-server'),
		};
	}

	async function createReadySession(client: TestProtocolClient, clientId: string, workspace: string, createdSessions: string[]): Promise<string> {
		return createRealSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workspace), async () => {
			// A freshly started host opens Copilot sessions only after the runtime publishes its model catalog.
			await client.waitForNotification(n => {
				if (!isActionNotification(n, ActionType.RootAgentsChanged)) {
					return false;
				}
				const action = getActionEnvelope(n).action;
				return action.type === ActionType.RootAgentsChanged
					&& action.agents.some(agent => agent.provider === COPILOT_CONFIG.provider && agent.models.length > 0);
			});
		}, async () => {
			await client.call('subscribe', { channel: ROOT_STATE_URI });
		});
	}

	test('runtime lockdown blocks standalone client customizations until the policy is removed', async function () {
		this.timeout(240_000);
		const directory = createTestDirectory(join(tmpdir(), 'copilot-customization-lockdown-'));
		const lease = new AgentHostE2EServerLease(COPILOT_CONFIG, {
			env: {
				COPILOT_CACHE_HOME: join(directory, 'cache'),
				COPILOT_MANAGED_SETTINGS_CACHE: '0',
			},
		});
		const createdSessions: string[] = [];
		try {
			const fixture = await createFixture(directory);
			const { client, server } = await lease.acquire(this.test!.title, 'none');
			assert.ok(server.capiReplay);
			server.capiReplay.setManagedSettings({ strictPluginOnlyCustomization: ['skills', 'agents', 'mcp'] });

			const lockedSession = await createReadySession(client, 'lockdown-locked', fixture.workspace, createdSessions);
			await publishCustomizations(client, 'lockdown-locked', lockedSession, fixture, 1);
			const locked = await runtimeCustomizations(client, lockedSession, 'turn-locked', 2);
			// A command-only session has no provider transcript to restore after a restart, so release it first.
			await client.call('disposeSession', { channel: lockedSession });
			createdSessions.splice(createdSessions.indexOf(lockedSession), 1);

			server.capiReplay.setManagedSettings({});
			const restarted = await lease.restart();
			const unlockedSession = await createReadySession(restarted, 'lockdown-unlocked', fixture.workspace, createdSessions);
			await publishCustomizations(restarted, 'lockdown-unlocked', unlockedSession, fixture, 1);
			const unlocked = await runtimeCustomizations(restarted, unlockedSession, 'turn-unlocked', 2);

			assert.deepStrictEqual({ locked, unlocked }, {
				locked: { pluginSkill: true, standaloneSkill: false, standaloneServer: false },
				unlocked: { pluginSkill: true, standaloneSkill: true, standaloneServer: true },
			});
		} catch (error) {
			lease.dumpRuntimeLogsOnFailure(this.test!.title);
			throw error;
		} finally {
			try {
				await lease.release(createdSessions, this.test?.state === 'failed');
			} finally {
				try {
					await lease.dispose();
				} finally {
					await removeTempDirs([directory]);
				}
			}
		}
	});
});
