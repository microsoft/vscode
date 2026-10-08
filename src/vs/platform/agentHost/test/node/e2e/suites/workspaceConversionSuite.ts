/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { AgentHostGlobalAutoApproveEnabledConfigKey } from '../../../../common/agentHostSchema.js';
import { SessionServerToolName } from '../../../../common/serverToolNames.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, readSessionWorkspaceless, ROOT_STATE_URI, type SessionState } from '../../../../common/state/sessionState.js';
import { driveChatTurnToCompletion, getMarkdownResponseText, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';
import { createTestDirectory } from '../harness/testDirectories.js';

export function defineWorkspaceConversionTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider === 'claude') {
		return;
	}
	const { config } = context;

	test('workspace conversion: first prompt converts a workspaceless session', async function () {
		this.timeout(180_000);
		const workspace = createTestDirectory(join(tmpdir(), 'ahp-workspace-conversion-'));
		context.tempDirs.push(workspace);
		context.client.setWorkingDirectory(workspace);
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `workspace-conversion-${config.provider}`,
		});
		await context.client.call('authenticate', {
			channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: config.githubToken ?? resolveGitHubToken(),
		});
		await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		context.client.clearReceived();
		context.client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq: 1,
			action: {
				type: ActionType.RootConfigChanged,
				config: { [AgentHostGlobalAutoApproveEnabledConfigKey]: true },
			},
		});
		await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.RootConfigChanged)
			&& getActionEnvelope(notification).channel === ROOT_STATE_URI
			&& getActionEnvelope(notification).origin?.clientSeq === 1,
		);
		const session = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', {
			channel: session, provider: config.provider, config: config.sessionConfig,
		});
		context.createdSessions.push(session);
		const initialSession = await context.client.call<SubscribeResult>('subscribe', { channel: session });
		const initialSetWorkspace = (initialSession.snapshot!.state as SessionState).serverTools?.find(tool => tool.name === SessionServerToolName.SetWorkspace);
		assert.ok(initialSetWorkspace, 'workspaceless session should advertise set_workspace');
		const chat = buildDefaultChatUri(session);
		await context.client.call<SubscribeResult>('subscribe', { channel: chat });
		context.client.clearReceived();
		context.client.dispatch({
			channel: session,
			clientSeq: 1,
			action: {
				type: ActionType.SessionConfigChanged,
				config: {
					...(config.inputRequestMode ? { mode: config.inputRequestMode } : {}),
				},
			},
		});
		await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.SessionConfigChanged)
			&& getActionEnvelope(notification).channel === session,
		);

		const turnId = 'turn-workspace-conversion';
		const workspaceUri = URI.file(workspace).toString();
		const turn = await driveChatTurnToCompletion(
			context.client,
			chat,
			turnId,
			`First use the available user-input tool exactly once to ask which workspace setup to use, with one choice: "${workspaceUri} directly without isolation". After I answer, call set_workspace with that workspace and isolation false as the turn's final tool call. Never run a shell command. When the host automatically continues after attaching the workspace, do not inspect, read, or modify it and do not call another tool; reply exactly "converted".`,
			2,
		);
		await context.client.waitForNotification(notification => {
			if (!isActionNotification(notification, ActionType.SessionWorkingDirectoryReplaced)
				|| getActionEnvelope(notification).channel !== session) {
				return false;
			}
			return (getActionEnvelope(notification).action as { replacement: string }).replacement === workspaceUri;
		}, 90_000);
		await context.client.waitForNotification(notification => {
			if (!isActionNotification(notification, ActionType.ChatTurnComplete)
				|| getActionEnvelope(notification).channel !== chat) {
				return false;
			}
			return (getActionEnvelope(notification).action as { turnId: string }).turnId !== turnId;
		}, 90_000);

		const setWorkspaceCalled = context.client.receivedNotifications(notification => {
			if (!isActionNotification(notification, ActionType.ChatToolCallStart)
				|| getActionEnvelope(notification).channel !== chat) {
				return false;
			}
			const action = getActionEnvelope(notification).action as { turnId: string; toolName: string };
			return action.turnId === turnId && action.toolName === SessionServerToolName.SetWorkspace;
		}).length > 0;
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: session });
		const state = result.snapshot!.state as SessionState;
		assert.deepStrictEqual({
			sawWorkspaceQuestion: turn.sawInputRequest,
			setWorkspaceCalled,
			workspaceless: readSessionWorkspaceless(state._meta),
			workingDirectories: state.workingDirectories,
			canChangeWorkspace: state.serverTools?.some(tool => tool.name === SessionServerToolName.SetWorkspace),
			mentionsConversion: getMarkdownResponseText(context.client).toLowerCase().includes('converted'),
		}, {
			sawWorkspaceQuestion: true,
			setWorkspaceCalled: true,
			workspaceless: false,
			workingDirectories: [workspaceUri],
			canChangeWorkspace: true,
			mentionsConversion: true,
		});
		context.client.clearReceived();
		context.client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq: 2,
			action: {
				type: ActionType.RootConfigChanged,
				config: { [AgentHostGlobalAutoApproveEnabledConfigKey]: false },
			},
		});
		await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.RootConfigChanged)
			&& getActionEnvelope(notification).channel === ROOT_STATE_URI
			&& getActionEnvelope(notification).origin?.clientSeq === 2,
		);
	});
}
