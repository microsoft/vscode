/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { remoteAgentHostSessionTypeId } from '../../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { toAgentHostUri } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { getHostFolderForNewSession } from '../../../../browser/remoteAgentHost/remoteAgentHostChatContribution.js';
import { findSessionTypeForLink } from '../../../../browser/agentSessions/agentHost/newSessionLinkOpener.contribution.js';
import { ResolvedChatSessionsExtensionPoint } from '../../../../common/chatSessionsService.js';

suite('AgentHostNewSessionLinkOpenerContribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const contribution = (type: string, agentHostProviderId: string | undefined): ResolvedChatSessionsExtensionPoint => ({ type, name: type, displayName: type, description: '', agentHostProviderId, icon: undefined });

	test('chooses the linked agent of the linked host, preferring Copilot', () => {
		const contributions = [
			contribution('local', undefined),
			contribution('agent-host-claude', 'claude'),
			contribution('agent-host-copilotcli', 'copilotcli'),
			contribution(remoteAgentHostSessionTypeId('localhost__8124', 'claude'), 'claude'),
			contribution(remoteAgentHostSessionTypeId('localhost__8124', 'copilotcli'), 'copilotcli'),
			contribution(remoteAgentHostSessionTypeId('other', 'copilotcli'), 'copilotcli'),
		];
		const find = (connectionAuthority: string | undefined, agent?: string, candidates = contributions) => findSessionTypeForLink(candidates, { connectionAuthority, agent })?.type;
		assert.deepStrictEqual({
			remote: find('localhost__8124'),
			remoteAgent: find('localhost__8124', 'claude'),
			remoteWithoutCopilot: find('localhost__8124', undefined, contributions.slice(0, 4)),
			unknownRemote: find('unknown'),
			unknownAgent: find('localhost__8124', 'codex'),
			local: find(undefined),
			localAgent: find(undefined, 'claude'),
		}, {
			remote: 'remote-localhost__8124-copilotcli',
			remoteAgent: 'remote-localhost__8124-claude',
			remoteWithoutCopilot: 'remote-localhost__8124-claude',
			unknownRemote: undefined,
			unknownAgent: undefined,
			local: 'agent-host-copilotcli',
			localAgent: 'agent-host-claude',
		});
	});

	test('a new session requests its folder only when it lies on the session\'s host', () => {
		const authority = 'localhost__8124';
		const hostFolder = toAgentHostUri(URI.file('/repo'), authority);
		assert.deepStrictEqual([
			hostFolder,
			toAgentHostUri(URI.file('/repo'), 'other-host'),
			URI.file('/workspace'),
			undefined,
		].map(folder => getHostFolderForNewSession(folder, authority)?.toString() ?? null), [hostFolder.toString(), null, null, null]);
	});
});
