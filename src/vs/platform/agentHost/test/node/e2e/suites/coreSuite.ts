/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import type { RootState } from '../../../../common/state/protocol/state.js';
import type { RootAgentsChangedAction } from '../../../../common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../../../common/state/sessionState.js';
import {
	createRealSession,
	dispatchTurn,
	driveTurnToCompletion,
	resolveGitHubToken,
} from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineCoreTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, stableNewScenarioResponse } = context;
	const behaviorSnapshot = { profile: 'behavior' } as const;
	test('sends a simple message and receives a response', async function () {
		this.timeout(120_000);

		const workspaceDir = mkdtempSync(`${tmpdir()}/read-sdk-simple`);
		tempDirs.push(workspaceDir);

		const sessionUri = await createRealSession(context.client, config, `real-sdk-simple-${config.provider}`, createdSessions, URI.file(workspaceDir));
		dispatchTurn(context.client, sessionUri, 'turn-1', 'Say exactly "hello" and nothing else', 1);

		const complete = await context.client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
		const completeAction = getActionEnvelope(complete).action as { turnId: string };
		assert.strictEqual(completeAction.turnId, 'turn-1');

		const responseParts = context.client.receivedNotifications(n => isActionNotification(n, 'chat/responsePart'));
		assert.ok(responseParts.length > 0, 'should have received at least one response part');
	});

	test('listModels returns well-shaped model entries after authenticate', async function () {
		this.timeout(60_000);

		await context.client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-list-models-${config.provider}` }, 30_000);

		// Subscribe to root state *before* authenticating so we can observe
		// the agentsChanged action that carries the populated model list.
		const rootResult = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI }, 30_000);
		const initial = rootResult.snapshot!.state as RootState;
		const providerAgent = initial.agents.find(a => a.provider === config.provider);
		assert.ok(providerAgent, `Expected ${config.provider} agent in root state, got: ${initial.agents.map(a => a.provider).join(', ')}`);

		await context.client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

		// Models load asynchronously after the *first* authenticate against
		// the shared server. If a sibling test already authenticated, the
		// list is in the subscribe snapshot already; otherwise wait for the
		// `agentsChanged` action that populates them.
		let agent = providerAgent;
		if (agent.models.length === 0) {
			try {
				const notif = await context.client.waitForNotification(n => {
					if (!isActionNotification(n, 'root/agentsChanged')) {
						return false;
					}
					const action = getActionEnvelope(n).action as RootAgentsChangedAction;
					const a = action.agents.find(a => a.provider === config.provider);
					return !!a && a.models.length > 0;
				}, 30_000);
				const action = getActionEnvelope(notif).action as RootAgentsChangedAction;
				agent = action.agents.find(a => a.provider === config.provider)!;
			} catch (err) {
				// Surface every agentsChanged we did see so failures point
				// at the actual data instead of a bare timeout.
				const seen = context.client.receivedNotifications(n => isActionNotification(n, 'root/agentsChanged'))
					.map(n => {
						const a = getActionEnvelope(n).action as RootAgentsChangedAction;
						const entry = a.agents.find(x => x.provider === config.provider);
						return entry ? { modelCount: entry.models.length, modelIds: entry.models.map(m => m.id) } : { missing: true };
					});
				throw new Error(`${config.provider}: timed out waiting for agentsChanged with non-empty models. Observed agentsChanged: ${JSON.stringify(seen)}. Original error: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		assert.ok(agent.models.length > 0, 'Expected at least one model from listModels');

		for (const model of agent.models) {
			assert.strictEqual(typeof model.id, 'string', `model.id should be a string: ${JSON.stringify(model)}`);
			assert.ok(model.id.length > 0, `model.id should be non-empty: ${JSON.stringify(model)}`);
			assert.strictEqual(typeof model.name, 'string', `model.name should be a string: ${JSON.stringify(model)}`);
			assert.strictEqual(model.provider, config.provider, `model.provider should be ${config.provider}: ${JSON.stringify(model)}`);
			assert.ok(model.maxContextWindow === undefined || (typeof model.maxContextWindow === 'number' && model.maxContextWindow >= 0),
				`model.maxContextWindow should be undefined or a non-negative number: ${JSON.stringify(model)}`);
			assert.ok(model.supportsVision === undefined || typeof model.supportsVision === 'boolean',
				`model.supportsVision should be boolean or undefined: ${JSON.stringify(model)}`);
		}
	});

	(stableNewScenarioResponse ? test : test.skip)('retains context across consecutive turns', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-memory-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `coverage-memory-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const first = await driveTurnToCompletion(context.client, sessionUri, 'turn-memory-1', 'Remember the code word ORCHID. Reply exactly "ready".', 1);
		assert.match(first.responseText, /ready/i);

		context.client.beginAhpSnapshotRound();
		const second = await driveTurnToCompletion(context.client, sessionUri, 'turn-memory-2', 'What code word did I ask you to remember? Reply with only the code word.', 10);
		assert.match(second.responseText, /ORCHID/i);
		await assertRecordedAhpSnapshot(this.test!, context.client, behaviorSnapshot);
	});
}
