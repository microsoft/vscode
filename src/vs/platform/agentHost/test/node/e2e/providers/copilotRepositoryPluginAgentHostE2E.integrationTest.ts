/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostWorkspaceTrustConfigKey } from '../../../../common/agentHostSchema.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, ROOT_STATE_URI } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification, type TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { AgentHostE2EServerLease, createRealSession, driveTurnToCompletion, initTestGitRepo, removeTempDirs } from '../harness/agentHostE2ETestHarness.js';
import { assertExpectedFailure } from '../harness/expectedFailure.js';
import { createTestDirectory } from '../harness/testDirectories.js';
import { createManagedPluginMarketplace, type IManagedPluginMarketplace } from './copilotManagedPluginMarketplace.js';
import { COPILOT_CONFIG } from './copilotTestConfiguration.js';

const execFileAsync = promisify(execFile);
const repositoryPluginUnavailable = 'Repository plugin preparation did not install the configured plugin';
const managedPluginActivityPrefixes = [
	'Initializing chat using settings required by your organization admin…',
	'Installing plugins required by your organization admin…',
	'Updating plugins required by your organization admin…',
] as const;

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

function hasManagedPluginActivity(client: TestProtocolClient, chat: string): boolean {
	return client.receivedNotifications(notification => {
		if (!isActionNotification(notification, ActionType.ChatActivityChanged)) {
			return false;
		}
		const envelope = getActionEnvelope(notification);
		if (envelope.action.type !== ActionType.ChatActivityChanged || envelope.action.activity === undefined) {
			return false;
		}
		const activity = envelope.action.activity;
		return envelope.channel === chat
			&& managedPluginActivityPrefixes.some(prefix => activity.startsWith(prefix));
	}).length > 0;
}

suite('Agent Host E2E — Copilot repository plugin preparation', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('trusted repository plugin installs best-effort without managed-policy activity', async function () {
		this.timeout(180_000);
		const root = createTestDirectory(join(tmpdir(), 'copilot-repository-plugin-'));
		const workspace = join(root, 'workspace');
		const createdSessions: string[] = [];
		let marketplace: IManagedPluginMarketplace | undefined;
		let lease: AgentHostE2EServerLease | undefined;
		let testError: Error | undefined;
		try {
			await mkdir(workspace, { recursive: true });
			const plugin = {
				name: 'repository-plugin',
				version: '1.0.0',
				skillName: 'repository-plugin-skill',
			};
			marketplace = await createManagedPluginMarketplace(root, 'repository-marketplace', [plugin]);
			const settingsDirectory = join(workspace, '.github', 'copilot');
			await mkdir(settingsDirectory, { recursive: true });
			await writeFile(join(settingsDirectory, 'settings.json'), JSON.stringify({
				enabledPlugins: { [marketplace.pluginSpec(plugin.name)]: true },
				extraKnownMarketplaces: {
					[marketplace.name]: {
						source: { source: 'git', url: marketplace.sourceUrl, ref: 'main' },
					},
				},
			}));
			initTestGitRepo(workspace);
			await execFileAsync('git', ['branch', '-M', 'main'], { cwd: workspace });
			await execFileAsync('git', ['add', '.'], { cwd: workspace });
			await execFileAsync('git', ['commit', '-q', '-m', 'Configure repository plugin'], { cwd: workspace });

			lease = new AgentHostE2EServerLease(COPILOT_CONFIG);
			const { client, server } = await lease.acquire(this.test!.title, 'none');
			const capiReplay = server.capiReplay;
			assert.ok(capiReplay);
			const workspaceUri = URI.file(workspace);
			const session = await createRealSession(
				client,
				COPILOT_CONFIG,
				'repository-plugin-install',
				createdSessions,
				workspaceUri,
				async () => {
					await client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
					await setRootConfig(client, {
						[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [workspaceUri.toString()] },
					}, 1);
				},
			);
			const chat = buildDefaultChatUri(session);
			const installation = marketplace.holdNextRequest();
			try {
				const firstTurn = driveTurnToCompletion(client, session, 'turn-repository-first', '/env', 2);
				const firstOutcome = await Promise.race([
					installation.started.then(() => ({ kind: 'installation' as const })),
					firstTurn.then(result => ({ kind: 'turn' as const, result })),
				]);
				const first = firstOutcome.kind === 'turn' ? firstOutcome.result : await firstTurn;
				assert.deepStrictEqual({
					firstMessageContinued: /Skills|Environment/i.test(first.responseText),
					managedActivityObserved: hasManagedPluginActivity(client, chat),
					modelRequests: capiReplay.observedModelRequestBodies.length,
				}, {
					firstMessageContinued: true,
					managedActivityObserved: false,
					modelRequests: 0,
				});
				installation.release();

				await assertExpectedFailure('github/copilot-agent-runtime#25331',
					new RegExp(`^${repositoryPluginUnavailable}$`),
					async () => {
						if (firstOutcome.kind === 'turn') {
							throw new Error(repositoryPluginUnavailable);
						}
						let nextClientSeq = 3;
						let installed: Awaited<ReturnType<typeof driveTurnToCompletion>> | undefined;
						await retry(async () => {
							installed = await driveTurnToCompletion(client, session, `turn-repository-${nextClientSeq}`, '/env', nextClientSeq++);
							if (!installed.responseText.includes(plugin.skillName)) {
								throw new Error(repositoryPluginUnavailable);
							}
						}, 100, 20);
						assert.deepStrictEqual({
							eventuallyUsesPlugin: installed?.responseText.includes(plugin.skillName),
							managedActivityObserved: hasManagedPluginActivity(client, chat),
							modelRequests: capiReplay.observedModelRequestBodies.length,
						}, {
							eventuallyUsesPlugin: true,
							managedActivityObserved: false,
							modelRequests: 0,
						});
					});
			} finally {
				installation.release();
			}
		} catch (error) {
			lease?.dumpRuntimeLogsOnFailure(this.test!.title);
			testError = error instanceof Error ? error : new Error(String(error));
		}
		const cleanupErrors: Error[] = [];
		try {
			await lease?.release(createdSessions, testError !== undefined);
		} catch (error) {
			cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
		}
		try {
			await lease?.dispose();
		} catch (error) {
			cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
		}
		try {
			await marketplace?.close();
		} catch (error) {
			cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
		}
		try {
			await removeTempDirs([root]);
		} catch (error) {
			cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
		}
		if (testError || cleanupErrors.length > 0) {
			throw testError && cleanupErrors.length === 0
				? testError
				: new AggregateError(testError ? [testError, ...cleanupErrors] : cleanupErrors, 'Repository plugin E2E scenario failed');
		}
	});
});
