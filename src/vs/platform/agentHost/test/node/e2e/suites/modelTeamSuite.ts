/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CopilotModelTeamConfigKey, CopilotModelTeamRememberedConfigKey } from '../../../../common/copilotModelTeam.js';
import { GetPersistentTeamStateExtensionMethod } from '../../../../common/agentHostExtensionProtocol.js';
import { ResolveSessionConfigResult, SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, ROOT_STATE_URI, RootState } from '../../../../common/state/sessionState.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { createRealSession } from '../harness/agentHostE2ETestHarness.js';
import { IAgentHostE2ETestContext, providerHostOnlyTest } from './e2eTestContext.js';

export function defineModelTeamTests(context: IAgentHostE2ETestContext): void {
	if (context.config.provider !== 'copilotcli') {
		return;
	}

	providerHostOnlyTest(context, 'persistent model teams: stock host configuration uses no inference', async () => {
		const workspace = join(process.cwd(), mkdtempSync('.agent-host-model-team-'));
		context.tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, context.config, 'model-team-config', context.createdSessions, URI.file(workspace));
		const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		const state = root.snapshot?.state as RootState | undefined;
		const model = state?.agents.find(agent => agent.provider === 'copilotcli')?.models.find(model => model.id !== 'auto');
		assert.ok(model, 'The Copilot catalog must contain a concrete helper model');
		const team = { worker: { id: model.id } };
		const resolved = await context.client.call<ResolveSessionConfigResult>('resolveSessionConfig', {
			provider: 'copilotcli', workingDirectory: URI.file(workspace).toString(),
			config: { [CopilotModelTeamConfigKey]: team },
		});
		assert.deepStrictEqual(resolved.values[CopilotModelTeamConfigKey], team);
		assert.deepStrictEqual({
			teamMutable: resolved.schema.properties[CopilotModelTeamConfigKey]?.sessionMutable,
			rememberedMutable: resolved.schema.properties[CopilotModelTeamRememberedConfigKey]?.sessionMutable,
			nativeCapability: resolved.schema.properties.copilotModelTeamSupport,
		}, { teamMutable: true, rememberedMutable: true, nativeCapability: undefined });

		for (const [index, value] of [team, {}].entries()) {
			context.client.clearReceived();
			context.client.dispatch({
				channel: sessionUri, clientSeq: index + 1,
				action: { type: ActionType.SessionConfigChanged, config: { [CopilotModelTeamConfigKey]: value } },
			});
			await context.client.waitForNotification(notification => isActionNotification(notification, ActionType.SessionConfigChanged)
				&& getActionEnvelope(notification).channel === sessionUri);
			const current = await fetchSessionWithChat(context.client, sessionUri);
			assert.deepStrictEqual(current.config?.values[CopilotModelTeamConfigKey], value);
			assert.strictEqual(await context.client.call(GetPersistentTeamStateExtensionMethod, { session: sessionUri, leadChat: buildDefaultChatUri(sessionUri) }) ?? undefined, undefined);
			assert.strictEqual(current.chats.length, 1, 'An unsent draft must not materialize teammate conversations');
		}
		await assert.rejects(context.client.call('resolveSessionConfig', {
			provider: 'copilotcli', workingDirectory: URI.file(workspace).toString(),
			config: { [CopilotModelTeamConfigKey]: { worker: { id: 'unavailable-team-model' } } },
		}), /unavailable|disabled by policy/);
		assert.deepStrictEqual(context.observedModelRequestBodies, []);
	});
}
