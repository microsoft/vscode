/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { buildDefaultChatUri, readSessionWorkspaceless, ROOT_STATE_URI, type SessionState } from '../../../../common/state/sessionState.js';
import { driveChatTurnToCompletion, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineWorkspaceConversionTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider === 'claude') {
		return;
	}
	const { config } = context;

	// The conversion-capable providers currently omit set_workspace from this session's tools.
	(context.runKnownIssueTests ? test : test.skip)('workspace conversion: a workspaceless session advertises its attachment tool', async function () {
		this.timeout(120_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-workspace-conversion-'));
		context.tempDirs.push(workspace);
		context.client.setWorkingDirectory(workspace);
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `workspace-conversion-${config.provider}`,
		});
		await context.client.call('authenticate', {
			channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: config.githubToken ?? resolveGitHubToken(),
		});
		const session = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', {
			channel: session, provider: config.provider, workingDirectories: [], config: config.sessionConfig,
		});
		context.createdSessions.push(session);
		await context.client.call<SubscribeResult>('subscribe', { channel: session });
		const chat = buildDefaultChatUri(session);
		await context.client.call<SubscribeResult>('subscribe', { channel: chat });
		await driveChatTurnToCompletion(context.client, chat, 'scratch-ready', 'Reply exactly "ready".', 1);
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: session });
		const state = result.snapshot!.state as SessionState;
		assert.deepStrictEqual({
			workspaceless: readSessionWorkspaceless(state._meta),
			canAttachWorkspace: state.serverTools?.some(tool => tool.name === 'set_workspace'),
		}, { workspaceless: true, canAttachWorkspace: true });
	});
}
