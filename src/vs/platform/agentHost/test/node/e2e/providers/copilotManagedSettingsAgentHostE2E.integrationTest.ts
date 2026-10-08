/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { DeferredPromise, retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../../../common/agent.js';
import { AgentHostWorkspaceTrustConfigKey } from '../../../../common/agentHostSchema.js';
import type { IAgentHostManagedSettingsDiagnostics } from '../../../../common/agentService.js';
import type { IAgentHostManagedSettingsPermissions } from '../../../../common/agentHostManagedSettings.js';
import { toClientPluginMcpDefaultCwdsMeta, toClientPluginStandaloneMeta } from '../../../../common/meta/clientPluginCustomizationMeta.js';
import { SessionConfigKey } from '../../../../common/sessionConfigKeys.js';
import type { ListSessionsResult, SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { CustomizationEnablementKind } from '../../../../common/state/protocol/state.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { buildChatUri, buildDefaultChatUri, customizationId, CustomizationLoadStatus, CustomizationType, MessageKind, ResponsePartKind, ROOT_STATE_URI, ToolCallCancellationReason, ToolCallConfirmationReason, type ClientPluginCustomization, type PluginCustomization, type SessionState } from '../../../../common/state/sessionState.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { AgentHostE2EServerLease, assertToolCallCompleteText, createRealSession, dispatchTurn, driveTurnToCompletion, removeTempDirs, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import type { CapiReplayProxy } from '../harness/capiReplayProxy.js';
import { assertExpectedFailure } from '../harness/expectedFailure.js';
import { createManagedPluginMarketplace, type IManagedPluginDefinition, type IManagedPluginMarketplace } from './copilotManagedPluginMarketplace.js';
import { COPILOT_CONFIG } from './copilotTestConfiguration.js';

const execFileAsync = promisify(execFile);
const managedPluginPreparationMetaKey = 'vscode.managedPluginPreparation';
const managedPluginInitializingActivity = 'Initializing chat using settings required by your organization admin…';
const managedPluginInstallingActivity = 'Installing plugins required by your organization admin…';
const managedPluginUpdatingActivity = 'Updating plugins required by your organization admin…';
const managedPluginActivityPrefixes = [
	managedPluginInitializingActivity,
	managedPluginInstallingActivity,
	managedPluginUpdatingActivity,
] as const;
const managedPluginLifecycleExpectedFailure = 'Copilot managed plugin lifecycle (SDK 1.0.18-preview.2)';
const managedPluginLifecycleUnavailable = 'Managed plugin lifecycle did not prepare the required plugin';
const repositoryPluginLifecycleUnavailable = 'Repository plugin preparation did not install the configured plugin';

interface IManagedPluginTestContext {
	client: TestProtocolClient;
	readonly lease: AgentHostE2EServerLease;
	readonly proxy: CapiReplayProxy;
	readonly root: string;
	readonly workspace: string;
	readonly createdSessions: string[];
	createMarketplace(name: string, plugins: readonly IManagedPluginDefinition[]): Promise<IManagedPluginMarketplace>;
}

interface IManagedPluginProjection {
	readonly activities: Array<string | undefined>;
	readonly preparation: Array<{ readonly turnId: string; readonly state: string; readonly content: string }>;
}

function managedPluginPolicy(marketplace: IManagedPluginMarketplace, pluginNames: readonly string[], forceRemoteSettingsRefresh: boolean): Readonly<Record<string, unknown>> {
	return {
		extraKnownMarketplaces: {
			[marketplace.name]: {
				source: {
					source: 'git',
					url: marketplace.sourceUrl,
					ref: 'main',
				},
			},
		},
		enabledPlugins: Object.fromEntries(pluginNames.map(pluginName => [marketplace.pluginSpec(pluginName), true])),
		forceRemoteSettingsRefresh,
	};
}

function holdManagedSettingsResponse(proxy: CapiReplayProxy, settings: Readonly<Record<string, unknown>>): { readonly requestStarted: Promise<void>; release(): void } {
	const requestStarted = new DeferredPromise<void>();
	const releaseResponse = new DeferredPromise<void>();
	proxy.setManagedSettings(settings, async () => {
		requestStarted.complete();
		await releaseResponse.p;
	});
	return {
		requestStarted: requestStarted.p,
		release: () => releaseResponse.complete(),
	};
}

async function runManagedPluginTest(
	testTitle: string,
	options: { readonly strict?: boolean; readonly expectedFailure?: boolean },
	run: (context: IManagedPluginTestContext) => Promise<void>,
): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), 'copilot-managed-plugins-'));
	const workspace = join(root, 'workspace');
	const managedSettingsPath = join(root, 'device-managed-settings.json');
	await mkdir(workspace, { recursive: true });
	await writeFile(managedSettingsPath, JSON.stringify(options.strict ? { forceRemoteSettingsRefresh: true } : {}));
	const lease = new AgentHostE2EServerLease(COPILOT_CONFIG, {
		env: {
			COPILOT_CACHE_HOME: join(root, 'cache'),
			COPILOT_MANAGED_SETTINGS_CACHE: '0',
			COPILOT_TEST_MANAGED_SETTINGS_FILE_PATH: managedSettingsPath,
		},
	});
	const createdSessions: string[] = [];
	const marketplaces: IManagedPluginMarketplace[] = [];
	let failed = false;
	let testError: Error | undefined;
	try {
		const { client, server } = await lease.acquire(testTitle, 'none');
		assert.ok(server.capiReplay);
		await run({
			client,
			lease,
			proxy: server.capiReplay,
			root,
			workspace,
			createdSessions,
			createMarketplace: async (name, plugins) => {
				const marketplace = await createManagedPluginMarketplace(root, name, plugins);
				marketplaces.push(marketplace);
				return marketplace;
			},
		});
		assert.deepStrictEqual(server.capiReplay.observedModelRequestBodies, []);
	} catch (error) {
		failed = options.expectedFailure !== true;
		if (failed) {
			lease.dumpRuntimeLogsOnFailure(testTitle);
		}
		testError = error instanceof Error ? error : new Error(String(error));
	}
	const cleanupErrors: Error[] = [];
	try {
		await lease.release(createdSessions, failed);
	} catch (error) {
		cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
	}
	try {
		await lease.dispose();
	} catch (error) {
		cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
	}
	const marketplaceResults = await Promise.allSettled(marketplaces.map(marketplace => marketplace.close()));
	cleanupErrors.push(...marketplaceResults.flatMap(result =>
		result.status === 'rejected' ? [result.reason instanceof Error ? result.reason : new Error(String(result.reason))] : []));
	try {
		await removeTempDirs([root]);
	} catch (error) {
		cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
	}
	if (testError || cleanupErrors.length > 0) {
		throw testError && cleanupErrors.length === 0
			? testError
			: new AggregateError(testError ? [testError, ...cleanupErrors] : cleanupErrors, 'Managed plugin E2E scenario failed');
	}
}

async function runExpectedManagedPluginTest(
	testTitle: string,
	options: { readonly strict?: boolean },
	run: (context: IManagedPluginTestContext) => Promise<void>,
): Promise<void> {
	await assertExpectedFailure(
		managedPluginLifecycleExpectedFailure,
		new RegExp(`^${managedPluginLifecycleUnavailable}$`),
		() => runManagedPluginTest(testTitle, { ...options, expectedFailure: true }, run),
	);
}

async function runExpectedRepositoryPluginTest(
	testTitle: string,
	run: (context: IManagedPluginTestContext) => Promise<void>,
): Promise<void> {
	await assertExpectedFailure(
		'Trusted repository plugin auto-installation (github/copilot-agent-runtime#25331)',
		new RegExp(`^${repositoryPluginLifecycleUnavailable}$`),
		() => runManagedPluginTest(testTitle, { expectedFailure: true }, run),
	);
}

function managedPluginProjection(client: TestProtocolClient, chat: string): IManagedPluginProjection {
	const projection: IManagedPluginProjection = { activities: [], preparation: [] };
	for (const notification of client.receivedNotifications(candidate =>
		isActionNotification(candidate, ActionType.ChatActivityChanged)
		|| isActionNotification(candidate, ActionType.ChatResponsePart)
	)) {
		const envelope = getActionEnvelope(notification);
		if (envelope.channel !== chat) {
			continue;
		}
		const action = envelope.action;
		if (action.type === ActionType.ChatActivityChanged) {
			const activity = action.activity;
			const isManagedActivity = activity !== undefined
				&& managedPluginActivityPrefixes.some(prefix => activity.startsWith(prefix));
			if ((isManagedActivity || (activity === undefined && projection.activities.length > 0))
				&& projection.activities.at(-1) !== activity) {
				projection.activities.push(activity);
			}
			continue;
		}
		if (action.type !== ActionType.ChatResponsePart || action.part.kind !== ResponsePartKind.SystemNotification) {
			continue;
		}
		const rawMeta = action.part._meta?.[managedPluginPreparationMetaKey];
		if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) {
			continue;
		}
		const state = (rawMeta as Record<string, unknown>).state;
		if (typeof state !== 'string') {
			continue;
		}
		projection.preparation.push({
			turnId: action.turnId,
			state,
			content: typeof action.part.content === 'string' ? action.part.content : action.part.content.markdown,
		});
	}
	return projection;
}

function managedPluginDefinition(name: string, version = '1.0.0', skillName = `${name}-skill`): IManagedPluginDefinition {
	return { name, version, skillName };
}

function activityFor(projection: IManagedPluginProjection, prefix: string): string | undefined {
	return projection.activities.find(activity => activity?.startsWith(prefix));
}

function assertManagedSkill(responseText: string, skillName: string): void {
	if (!responseText.includes(skillName)) {
		throw new Error(managedPluginLifecycleUnavailable);
	}
}

async function waitForInstallationStart(installationStarted: Promise<void>, turn: Promise<unknown>): Promise<void> {
	const outcome = await Promise.race([
		installationStarted.then(() => 'installation' as const),
		turn.then(() => 'turnComplete' as const),
	]);
	if (outcome !== 'installation') {
		throw new Error(managedPluginLifecycleUnavailable);
	}
}

function assertTurnHasNotCompleted(client: TestProtocolClient, chat: string, turnId: string): void {
	const terminal = client.receivedNotifications(notification =>
		(isActionNotification(notification, ActionType.ChatTurnComplete)
			|| isActionNotification(notification, ActionType.ChatError)
			|| isActionNotification(notification, ActionType.ChatTurnCancelled))
		&& getActionEnvelope(notification).channel === chat
		&& (getActionEnvelope(notification).action as { readonly turnId: string }).turnId === turnId,
	);
	assert.deepStrictEqual(terminal, []);
}

async function waitForTurnStarted(client: TestProtocolClient, chat: string, turnId: string): Promise<void> {
	await client.waitForNotification(notification =>
		isActionNotification(notification, ActionType.ChatTurnStarted)
		&& getActionEnvelope(notification).channel === chat
		&& (getActionEnvelope(notification).action as { readonly turnId: string }).turnId === turnId,
		30_000,
	);
}

async function waitForTurnComplete(client: TestProtocolClient, chat: string, turnId: string): Promise<void> {
	const terminal = await client.waitForNotification(notification =>
		(isActionNotification(notification, ActionType.ChatTurnComplete) || isActionNotification(notification, ActionType.ChatError))
		&& getActionEnvelope(notification).channel === chat
		&& (getActionEnvelope(notification).action as { readonly turnId: string }).turnId === turnId,
		90_000,
	);
	assert.strictEqual(getActionEnvelope(terminal).action.type, ActionType.ChatTurnComplete);
}

async function setRootConfig(client: TestProtocolClient, config: Readonly<Record<string, unknown>>, clientSeq: number): Promise<void> {
	client.dispatch({
		channel: ROOT_STATE_URI,
		clientSeq,
		action: { type: ActionType.RootConfigChanged, config },
	});
	const result = await client.waitForNotification(notification =>
		isActionNotification(notification, ActionType.RootConfigChanged)
		&& getActionEnvelope(notification).channel === ROOT_STATE_URI
		&& getActionEnvelope(notification).origin?.clientSeq === clientSeq,
	);
	assert.strictEqual(getActionEnvelope(result).rejectionReason, undefined);
}

async function createAdditionalCopilotSession(client: TestProtocolClient, trackingList: string[], workingDirectory: URI): Promise<string> {
	client.setWorkingDirectory(workingDirectory.fsPath);
	const sessionUri = URI.from({ scheme: COPILOT_CONFIG.scheme, path: `/${generateUuid()}` }).toString();
	await client.call('createSession', {
		channel: sessionUri,
		provider: COPILOT_CONFIG.provider,
		workingDirectories: [workingDirectory.toString()],
		config: { isolation: 'folder', ...COPILOT_CONFIG.sessionConfig },
	}, 30_000);
	trackingList.push(sessionUri);
	await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
	await client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
	client.clearReceived();
	return sessionUri;
}

suite('Agent Host E2E — Copilot managed-settings diagnostics', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('fetched server policy appears in sessionless diagnostics and channel layers', async function () {
		this.timeout(60_000);
		const directory = await mkdtemp(join(tmpdir(), 'copilot-policy-diagnostics-'));
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

suite('Agent Host E2E — Copilot managed plugin lifecycle', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('multiple lifecycle sessions share one initialized client', async function () {
		this.timeout(120_000);
		await runManagedPluginTest(this.test!.title, {}, async context => {
			context.proxy.setManagedSettings({});
			const workspace = URI.file(context.workspace);
			const firstSession = await createRealSession(context.client, COPILOT_CONFIG, 'managed-plugin-multi-session', context.createdSessions, workspace);
			const secondSession = await createAdditionalCopilotSession(context.client, context.createdSessions, workspace);
			const first = await driveTurnToCompletion(context.client, firstSession, 'turn-first-session', '/env', 1);
			const second = await driveTurnToCompletion(context.client, secondSession, 'turn-second-session', '/env', 1);
			assert.deepStrictEqual({
				first: /Skills|Environment/i.test(first.responseText),
				second: /Skills|Environment/i.test(second.responseText),
			}, {
				first: true,
				second: true,
			});
		});
	});

	test('non-strict missing plugin lets the first message continue and holds a later message on slow installation', async function () {
		this.timeout(180_000);
		await runExpectedManagedPluginTest(this.test!.title, {}, async context => {
			const plugin = managedPluginDefinition('non-strict-plugin', '1.0.0', 'non-strict-managed-skill');
			const marketplace = await context.createMarketplace('non-strict-marketplace', [plugin]);
			const installation = marketplace.holdNextRequest();
			const policy = holdManagedSettingsResponse(context.proxy, managedPluginPolicy(marketplace, [plugin.name], false));
			const session = await createRealSession(context.client, COPILOT_CONFIG, 'managed-plugin-non-strict', context.createdSessions, URI.file(context.workspace));
			const chat = buildDefaultChatUri(session);
			const firstTurn = driveTurnToCompletion(context.client, session, 'turn-before-policy', '/env', 1);
			await policy.requestStarted;
			const beforePolicy = await firstTurn;
			policy.release();
			const secondTurnId = 'turn-waits-for-install';
			const secondTurn = driveTurnToCompletion(context.client, session, secondTurnId, '/env', 2);
			await waitForTurnStarted(context.client, chat, secondTurnId);
			await waitForInstallationStart(installation.started, secondTurn);
			const installingWhileIdle = activityFor(managedPluginProjection(context.client, chat), managedPluginInstallingActivity);
			assertTurnHasNotCompleted(context.client, chat, secondTurnId);
			installation.release();
			const afterPolicy = await secondTurn;
			const projection = managedPluginProjection(context.client, chat);

			assert.deepStrictEqual({
				firstMessageContinuedWithoutPlugin: !beforePolicy.responseText.includes(plugin.skillName),
				installingActivityNamesPlugin: installingWhileIdle?.includes(marketplace.pluginSpec(plugin.name)) === true,
				laterMessageUsesPlugin: afterPolicy.responseText.includes(plugin.skillName),
				preparationStates: projection.preparation.map(entry => entry.state),
			}, {
				firstMessageContinuedWithoutPlugin: true,
				installingActivityNamesPlugin: true,
				laterMessageUsesPlugin: true,
				preparationStates: ['progress', 'complete'],
			});
		});
	});

	test('strict missing plugin holds the first message through slow policy and installation', async function () {
		this.timeout(180_000);
		await runExpectedManagedPluginTest(this.test!.title, { strict: true }, async context => {
			const plugin = managedPluginDefinition('strict-plugin', '1.0.0', 'strict-managed-skill');
			const marketplace = await context.createMarketplace('strict-marketplace', [plugin]);
			const installation = marketplace.holdNextRequest();
			const policy = holdManagedSettingsResponse(context.proxy, managedPluginPolicy(marketplace, [plugin.name], true));
			const session = await createRealSession(context.client, COPILOT_CONFIG, 'managed-plugin-strict', context.createdSessions, URI.file(context.workspace));
			const chat = buildDefaultChatUri(session);
			const turnId = 'turn-strict-install';
			const pendingTurn = driveTurnToCompletion(context.client, session, turnId, '/env', 1);
			await policy.requestStarted;
			assertTurnHasNotCompleted(context.client, chat, turnId);
			policy.release();
			await waitForInstallationStart(installation.started, pendingTurn);
			assertTurnHasNotCompleted(context.client, chat, turnId);
			const whileInstalling = managedPluginProjection(context.client, chat);
			installation.release();
			const result = await pendingTurn;
			const projection = managedPluginProjection(context.client, chat);

			assert.deepStrictEqual({
				initializing: activityFor(whileInstalling, managedPluginInitializingActivity) !== undefined,
				installingNamesPlugin: activityFor(whileInstalling, managedPluginInstallingActivity)?.includes(marketplace.pluginSpec(plugin.name)) === true,
				responseUsesPlugin: result.responseText.includes(plugin.skillName),
				preparation: projection.preparation,
			}, {
				initializing: true,
				installingNamesPlugin: true,
				responseUsesPlugin: true,
				preparation: [
					{ turnId, state: 'progress', content: '' },
					{ turnId, state: 'complete', content: '' },
				],
			});
		});
	});

	test('strict already-installed plugin waits only for policy and is reused without installation', async function () {
		this.timeout(180_000);
		await runExpectedManagedPluginTest(this.test!.title, { strict: true }, async context => {
			const plugin = managedPluginDefinition('strict-installed-plugin');
			const marketplace = await context.createMarketplace('strict-installed-marketplace', [plugin]);
			const settings = managedPluginPolicy(marketplace, [plugin.name], true);
			context.proxy.setManagedSettings(settings);
			const setupSession = await createRealSession(context.client, COPILOT_CONFIG, 'strict-installed-setup', context.createdSessions, URI.file(context.workspace));
			const setup = await driveTurnToCompletion(context.client, setupSession, 'turn-install-setup', '/env', 1);
			assertManagedSkill(setup.responseText, plugin.skillName);

			const policy = holdManagedSettingsResponse(context.proxy, settings);
			const reusedSession = await createAdditionalCopilotSession(context.client, context.createdSessions, URI.file(context.workspace));
			const chat = buildDefaultChatUri(reusedSession);
			const turnId = 'turn-reuse-installed';
			const pending = driveTurnToCompletion(context.client, reusedSession, turnId, '/env', 1);
			await policy.requestStarted;
			assertTurnHasNotCompleted(context.client, chat, turnId);
			policy.release();
			const result = await pending;
			const projection = managedPluginProjection(context.client, chat);

			assert.deepStrictEqual({
				responseUsesPlugin: result.responseText.includes(plugin.skillName),
				initializing: activityFor(projection, managedPluginInitializingActivity) !== undefined,
				installing: activityFor(projection, managedPluginInstallingActivity),
			}, {
				responseUsesPlugin: true,
				initializing: true,
				installing: undefined,
			});
		});
	});

	test('non-strict already-installed plugin never blocks or reinstalls while policy refreshes', async function () {
		this.timeout(180_000);
		await runExpectedManagedPluginTest(this.test!.title, {}, async context => {
			const plugin = managedPluginDefinition('non-strict-installed-plugin');
			const marketplace = await context.createMarketplace('non-strict-installed-marketplace', [plugin]);
			context.proxy.setManagedSettings(managedPluginPolicy(marketplace, [plugin.name], true));
			const setupSession = await createRealSession(context.client, COPILOT_CONFIG, 'non-strict-installed-setup', context.createdSessions, URI.file(context.workspace));
			const setup = await driveTurnToCompletion(context.client, setupSession, 'turn-install-setup', '/env', 1);
			assertManagedSkill(setup.responseText, plugin.skillName);

			const policy = holdManagedSettingsResponse(context.proxy, managedPluginPolicy(marketplace, [plugin.name], false));
			const reusedSession = await createAdditionalCopilotSession(context.client, context.createdSessions, URI.file(context.workspace));
			const first = driveTurnToCompletion(context.client, reusedSession, 'turn-refresh-pending', '/env', 1);
			await policy.requestStarted;
			const beforeRefresh = await first;
			policy.release();

			let nextClientSeq = 2;
			let afterRefresh: Awaited<ReturnType<typeof driveTurnToCompletion>> | undefined;
			let reinstallObserved = false;
			await retry(async () => {
				afterRefresh = await driveTurnToCompletion(context.client, reusedSession, `turn-after-refresh-${nextClientSeq}`, '/env', nextClientSeq++);
				reinstallObserved ||= activityFor(managedPluginProjection(context.client, buildDefaultChatUri(reusedSession)), managedPluginInstallingActivity) !== undefined;
				if (!afterRefresh.responseText.includes(plugin.skillName)) {
					throw new Error('Installed managed plugin is not active yet');
				}
			}, 100, 20);

			assert.deepStrictEqual({
				firstMessageContinued: /Skills|Environment/i.test(beforeRefresh.responseText),
				laterMessageUsesPlugin: afterRefresh?.responseText.includes(plugin.skillName),
				reinstallObserved,
			}, {
				firstMessageContinued: true,
				laterMessageUsesPlugin: true,
				reinstallObserved: false,
			});
		});
	});

	test('strict policy installs several missing plugins in one admission', async function () {
		this.timeout(180_000);
		await runExpectedManagedPluginTest(this.test!.title, { strict: true }, async context => {
			const plugins = [
				managedPluginDefinition('several-plugin-a'),
				managedPluginDefinition('several-plugin-b'),
				managedPluginDefinition('several-plugin-c'),
			];
			const marketplace = await context.createMarketplace('several-marketplace', plugins);
			context.proxy.setManagedSettings(managedPluginPolicy(marketplace, plugins.map(plugin => plugin.name), true));
			const session = await createRealSession(context.client, COPILOT_CONFIG, 'managed-plugin-several', context.createdSessions, URI.file(context.workspace));
			const result = await driveTurnToCompletion(context.client, session, 'turn-install-several', '/env', 1);
			assertManagedSkill(result.responseText, plugins[0].skillName);
			const installing = activityFor(managedPluginProjection(context.client, buildDefaultChatUri(session)), managedPluginInstallingActivity);

			assert.deepStrictEqual({
				skills: plugins.map(plugin => result.responseText.includes(plugin.skillName)),
				activitySpecs: plugins.map(plugin => installing?.includes(marketplace.pluginSpec(plugin.name)) === true),
			}, {
				skills: [true, true, true],
				activitySpecs: [true, true, true],
			});
		});
	});

	test('strict partially-installed policy prepares only the missing plugin', async function () {
		this.timeout(180_000);
		await runExpectedManagedPluginTest(this.test!.title, { strict: true }, async context => {
			const installed = managedPluginDefinition('partial-installed-plugin');
			const missing = managedPluginDefinition('partial-missing-plugin');
			const marketplace = await context.createMarketplace('partial-marketplace', [installed, missing]);
			context.proxy.setManagedSettings(managedPluginPolicy(marketplace, [installed.name], true));
			const setupSession = await createRealSession(context.client, COPILOT_CONFIG, 'managed-plugin-partial-setup', context.createdSessions, URI.file(context.workspace));
			const setup = await driveTurnToCompletion(context.client, setupSession, 'turn-install-one', '/env', 1);
			assertManagedSkill(setup.responseText, installed.skillName);

			context.proxy.setManagedSettings(managedPluginPolicy(marketplace, [installed.name, missing.name], true));
			const session = await createAdditionalCopilotSession(context.client, context.createdSessions, URI.file(context.workspace));
			const result = await driveTurnToCompletion(context.client, session, 'turn-install-missing', '/env', 1);
			const installing = activityFor(managedPluginProjection(context.client, buildDefaultChatUri(session)), managedPluginInstallingActivity);

			assert.deepStrictEqual({
				installedSkill: result.responseText.includes(installed.skillName),
				missingSkill: result.responseText.includes(missing.skillName),
				activityNamesInstalled: installing?.includes(marketplace.pluginSpec(installed.name)) === true,
				activityNamesMissing: installing?.includes(marketplace.pluginSpec(missing.name)) === true,
			}, {
				installedSkill: true,
				missingSkill: true,
				activityNamesInstalled: false,
				activityNamesMissing: true,
			});
		});
	});

	test('managed plugin installation failure warns and continues the same message', async function () {
		this.timeout(180_000);
		await runExpectedManagedPluginTest(this.test!.title, { strict: true }, async context => {
			const plugin = managedPluginDefinition('unavailable-plugin');
			const marketplace = await context.createMarketplace('unavailable-marketplace', [plugin]);
			marketplace.setUnavailable(true);
			context.proxy.setManagedSettings(managedPluginPolicy(marketplace, [plugin.name], true));
			const session = await createRealSession(context.client, COPILOT_CONFIG, 'managed-plugin-failure', context.createdSessions, URI.file(context.workspace));
			const chat = buildDefaultChatUri(session);
			const turnId = 'turn-install-failure';
			const result = await driveTurnToCompletion(context.client, session, turnId, '/env', 1);
			if (marketplace.requestCount === 0) {
				throw new Error(managedPluginLifecycleUnavailable);
			}
			const projection = managedPluginProjection(context.client, chat);
			const failure = projection.preparation.find(entry => entry.state === 'failure');

			assert.deepStrictEqual({
				messageContinued: /Skills|Environment/i.test(result.responseText),
				pluginUnavailable: !result.responseText.includes(plugin.skillName),
				installActivityShown: activityFor(projection, managedPluginInstallingActivity) !== undefined,
				failure: failure && {
					turnId: failure.turnId,
					namesPlugin: failure.content.includes(marketplace.pluginSpec(plugin.name)),
					continuesWithCurrentSetup: /Continuing with the current setup/i.test(failure.content),
				},
			}, {
				messageContinued: true,
				pluginUnavailable: true,
				installActivityShown: true,
				failure: {
					turnId,
					namesPlugin: true,
					continuesWithCurrentSetup: true,
				},
			});
		});
	});

	test('failed managed plugin installation retries on the next message and recovers', async function () {
		this.timeout(180_000);
		await runExpectedManagedPluginTest(this.test!.title, { strict: true }, async context => {
			const plugin = managedPluginDefinition('retry-plugin');
			const marketplace = await context.createMarketplace('retry-marketplace', [plugin]);
			marketplace.failNextRequest();
			context.proxy.setManagedSettings(managedPluginPolicy(marketplace, [plugin.name], true));
			const session = await createRealSession(context.client, COPILOT_CONFIG, 'managed-plugin-retry', context.createdSessions, URI.file(context.workspace));
			const chat = buildDefaultChatUri(session);
			const failed = await driveTurnToCompletion(context.client, session, 'turn-fails-once', '/env', 1);
			if (marketplace.requestCount === 0) {
				throw new Error(managedPluginLifecycleUnavailable);
			}
			const failedProjection = managedPluginProjection(context.client, chat);
			const recovered = await driveTurnToCompletion(context.client, session, 'turn-retries', '/env', 2);
			const recoveredProjection = managedPluginProjection(context.client, chat);

			assert.deepStrictEqual({
				firstContinuedWithoutPlugin: !failed.responseText.includes(plugin.skillName),
				firstWarned: failedProjection.preparation.some(entry => entry.state === 'failure'),
				retryUsesPlugin: recovered.responseText.includes(plugin.skillName),
				retryInstalled: activityFor(recoveredProjection, managedPluginInstallingActivity)?.includes(marketplace.pluginSpec(plugin.name)) === true,
			}, {
				firstContinuedWithoutPlugin: true,
				firstWarned: true,
				retryUsesPlugin: true,
				retryInstalled: true,
			});
		});
	});

	test('slow managed plugin update does not interrupt an active turn and applies before the next message', async function () {
		this.timeout(240_000);
		await runExpectedManagedPluginTest(this.test!.title, { strict: true }, async context => {
			const v1 = managedPluginDefinition('update-plugin', '1.0.0', 'managed-update-v1');
			const v2 = managedPluginDefinition('update-plugin', '2.0.0', 'managed-update-v2');
			const marketplace = await context.createMarketplace('update-marketplace', [v1]);
			const settings = managedPluginPolicy(marketplace, [v1.name], true);
			context.proxy.setManagedSettings(settings);
			const activeSession = await createRealSession(context.client, COPILOT_CONFIG, 'managed-plugin-update-active', context.createdSessions, URI.file(context.workspace));
			const activeChat = buildDefaultChatUri(activeSession);
			const installed = await driveTurnToCompletion(context.client, activeSession, 'turn-install-v1', '/env', 1);
			assertManagedSkill(installed.responseText, v1.skillName);

			const activeTurnId = 'turn-active-during-update';
			const activeMarker = join(context.workspace, 'active-turn.ready');
			const releaseMarker = join(context.workspace, 'active-turn.release');
			await writeFile(join(context.workspace, 'hold-turn.cjs'), [
				'const fs = require(\'fs\');',
				'fs.writeFileSync(\'active-turn.ready\', \'ready\');',
				'const complete = () => {',
				'  if (fs.existsSync(\'active-turn.release\')) {',
				'    watcher.close();',
				'    process.exit(0);',
				'  }',
				'};',
				'const watcher = fs.watch(\'.\', complete);',
				'complete();',
			].join('\n'));
			context.client.clearReceived();
			dispatchTurn(context.client, activeSession, activeTurnId, '!node hold-turn.cjs', 2);
			await retry(async () => {
				if (!existsSync(activeMarker)) {
					throw new Error('The held turn has not started');
				}
			}, 100, 300);

			await marketplace.publish([v2]);
			const update = marketplace.holdNextRequest();
			context.proxy.setManagedSettings(settings);
			const updateSession = await createAdditionalCopilotSession(context.client, context.createdSessions, URI.file(context.workspace));
			const updateChat = buildDefaultChatUri(updateSession);
			await update.started;
			const activeState = await fetchSessionWithChat(context.client, activeSession);
			assert.strictEqual(activeState.activeTurn?.id, activeTurnId);
			const updatingWhileActive = activityFor(managedPluginProjection(context.client, updateChat), managedPluginUpdatingActivity);

			const updateTurnId = 'turn-apply-update';
			const updatedTurn = driveTurnToCompletion(context.client, updateSession, updateTurnId, '/env', 1);
			await waitForTurnStarted(context.client, updateChat, updateTurnId);
			assertTurnHasNotCompleted(context.client, updateChat, updateTurnId);
			await writeFile(releaseMarker, 'release');
			await waitForTurnComplete(context.client, activeChat, activeTurnId);
			assertTurnHasNotCompleted(context.client, updateChat, updateTurnId);
			update.release();
			const updated = await updatedTurn;
			const projection = managedPluginProjection(context.client, updateChat);

			assert.deepStrictEqual({
				updateNamesPlugin: updatingWhileActive?.includes(marketplace.pluginSpec(v2.name)) === true,
				nextMessageUsesV2: updated.responseText.includes(v2.skillName),
				nextMessageStillUsesV1: updated.responseText.includes(v1.skillName),
				preparationStates: projection.preparation.map(entry => entry.state),
			}, {
				updateNamesPlugin: true,
				nextMessageUsesV2: true,
				nextMessageStillUsesV1: false,
				preparationStates: ['progress', 'complete'],
			});
		});
	});

	test('withdrawing a managed plugin requirement disables it after restart', async function () {
		this.timeout(240_000);
		await runExpectedManagedPluginTest(this.test!.title, { strict: true }, async context => {
			const plugin = managedPluginDefinition('enforcement-plugin', '1.0.0', 'managed-enforcement-skill');
			const marketplace = await context.createMarketplace('enforcement-marketplace', [plugin]);
			const requiredPolicy = holdManagedSettingsResponse(context.proxy, managedPluginPolicy(marketplace, [plugin.name], true));
			const requiredSession = await createRealSession(context.client, COPILOT_CONFIG, 'managed-plugin-required', context.createdSessions, URI.file(context.workspace));
			const requiredTurn = driveTurnToCompletion(context.client, requiredSession, 'turn-required', '/env', 1);
			await requiredPolicy.requestStarted;
			requiredPolicy.release();
			const required = await requiredTurn;
			assertManagedSkill(required.responseText, plugin.skillName);
			await context.client.call('disposeSession', { channel: requiredSession });
			context.createdSessions.splice(context.createdSessions.indexOf(requiredSession), 1);

			const withdrawnPolicy = holdManagedSettingsResponse(context.proxy, { forceRemoteSettingsRefresh: true });
			context.client = await context.lease.restart();
			const withdrawnSession = await createRealSession(context.client, COPILOT_CONFIG, 'managed-plugin-withdrawn', context.createdSessions, URI.file(context.workspace));
			const withdrawnTurn = driveTurnToCompletion(context.client, withdrawnSession, 'turn-withdrawn', '/env', 1);
			await withdrawnPolicy.requestStarted;
			withdrawnPolicy.release();
			const withdrawn = await withdrawnTurn;

			assert.deepStrictEqual({
				required: required.responseText.includes(plugin.skillName),
				withdrawn: withdrawn.responseText.includes(plugin.skillName),
			}, {
				required: true,
				withdrawn: false,
			});
		});
	});

	test('trusted repository plugin installs best-effort without managed-policy activity', async function () {
		this.timeout(180_000);
		await runExpectedRepositoryPluginTest(this.test!.title, async context => {
			const plugin = managedPluginDefinition('repository-plugin', '1.0.0', 'repository-plugin-skill');
			const marketplace = await context.createMarketplace('repository-marketplace', [plugin]);
			const settingsDirectory = join(context.workspace, '.github', 'copilot');
			await mkdir(settingsDirectory, { recursive: true });
			await writeFile(join(settingsDirectory, 'settings.json'), JSON.stringify({
				enabledPlugins: { [marketplace.pluginSpec(plugin.name)]: true },
				extraKnownMarketplaces: {
					[marketplace.name]: {
						source: { source: 'git', url: marketplace.sourceUrl, ref: 'main' },
					},
				},
			}));
			await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: context.workspace });
			await execFileAsync('git', ['config', 'user.name', 'Agent Host E2E'], { cwd: context.workspace });
			await execFileAsync('git', ['config', 'user.email', 'agent-host-e2e@example.invalid'], { cwd: context.workspace });
			await execFileAsync('git', ['add', '.'], { cwd: context.workspace });
			await execFileAsync('git', ['commit', '-q', '-m', 'Configure repository plugin'], { cwd: context.workspace });
			context.proxy.setManagedSettings({});
			const workspaceUri = URI.file(context.workspace);
			const session = await createRealSession(
				context.client,
				COPILOT_CONFIG,
				'repository-plugin-install',
				context.createdSessions,
				workspaceUri,
				async () => {
					await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
					await setRootConfig(context.client, {
						[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [workspaceUri.toString()] },
					}, 1);
				},
			);
			const first = await driveTurnToCompletion(context.client, session, 'turn-repository-first', '/env', 2);
			let nextClientSeq = 3;
			let installed: Awaited<ReturnType<typeof driveTurnToCompletion>> | undefined;
			let managedActivityObserved = false;
			await retry(async () => {
				installed = await driveTurnToCompletion(context.client, session, `turn-repository-${nextClientSeq}`, '/env', nextClientSeq++);
				const projection = managedPluginProjection(context.client, buildDefaultChatUri(session));
				managedActivityObserved ||= projection.activities.length > 0 || projection.preparation.length > 0;
				if (!installed.responseText.includes(plugin.skillName)) {
					throw new Error(repositoryPluginLifecycleUnavailable);
				}
			}, 100, 20);

			assert.deepStrictEqual({
				firstMessageContinued: /Skills|Environment/i.test(first.responseText),
				eventuallyUsesPlugin: installed?.responseText.includes(plugin.skillName),
				managedActivityObserved,
			}, {
				firstMessageContinued: true,
				eventuallyUsesPlugin: true,
				managedActivityObserved: false,
			});
		});
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
		workspace = await mkdtemp(join(tmpdir(), 'copilot-managed-ahp-'));
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
		const directory = await mkdtemp(join(tmpdir(), 'copilot-customization-lockdown-'));
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
