/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { remoteAgentHostSessionTypeId } from '../../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { toAgentHostUri } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentHostSessionWorkingDirectoryResolver } from '../../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
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

	test('a requested working directory overrides the host choosing until it is released', () => {
		const resolver = new AgentHostSessionWorkingDirectoryResolver();
		const sessionType = remoteAgentHostSessionTypeId('localhost__8124', 'copilotcli');
		const session = URI.from({ scheme: sessionType, path: '/untitled-1' });
		const folder = toAgentHostUri(URI.file('/repo'), 'localhost__8124');
		const registration = resolver.registerResolver(sessionType, () => null);
		const request = resolver.requestWorkingDirectory(session, folder);
		const requested = resolver.resolveRequested(session)?.toString();
		request.dispose();
		const released = resolver.resolveRequested(session);
		registration.dispose();
		assert.deepStrictEqual({ requested, released }, { requested: folder.toString(), released: null });
	});
});
