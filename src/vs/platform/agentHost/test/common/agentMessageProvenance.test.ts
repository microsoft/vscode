/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { resolveAgentMessageProvenance } from '../../common/agentMessageProvenance.js';
import { AgentHostArtifactRunInitiatorMetaKey, AgentHostArtifactRunMetaKey } from '../../common/meta/agentHostArtifactIntegrationMeta.js';
import { toAgentMergeMessageMeta } from '../../common/meta/agentMergeMessageMeta.js';
import { toAgentMessageDelegationMeta } from '../../common/meta/agentMessageDelegationMeta.js';
import { SessionOriginKind, type SessionOrigin } from '../../common/state/protocol/channels-session/state.js';
import { MessageKind, type Message } from '../../common/state/sessionState.js';

suite('Agent Message Provenance', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('gives a message the authority of its author and never a person\'s when the author is unknown', () => {
		const automation: SessionOrigin = { kind: SessionOriginKind.Automation, automation: 'ahp-automation:/nightly', run: 'ahp-automation-run:/run-1' };
		const message = (kind: MessageKind, _meta?: Record<string, unknown>): Message => ({ text: 'Do the work', origin: { kind }, ...(_meta ? { _meta } : {}) });
		const artifactRun = (initiator: string) => ({ [AgentHostArtifactRunMetaKey]: 'run-1', [AgentHostArtifactRunInitiatorMetaKey]: initiator });
		const coordinator = toAgentMessageDelegationMeta({ sourceSession: 'copilot:/coordinator', sourceChat: 'copilot:/coordinator/chat', sourceTurnId: 'turn-1' });

		assert.deepStrictEqual({
			person: resolveAgentMessageProvenance(message(MessageKind.User), undefined),
			personInAutomationSession: resolveAgentMessageProvenance(message(MessageKind.User), automation),
			automationRun: resolveAgentMessageProvenance(message(MessageKind.Automation), automation),
			automationWithoutIdentity: resolveAgentMessageProvenance(message(MessageKind.Automation), undefined),
			agentMerge: resolveAgentMessageProvenance(message(MessageKind.SystemNotification, toAgentMergeMessageMeta()), undefined),
			hostNotification: resolveAgentMessageProvenance(message(MessageKind.SystemNotification), automation),
			artifactActionAPersonChose: resolveAgentMessageProvenance(message(MessageKind.SystemNotification, artifactRun('user')), undefined),
			artifactAutomation: resolveAgentMessageProvenance(message(MessageKind.SystemNotification, artifactRun('automation')), undefined),
			coordinator: resolveAgentMessageProvenance(message(MessageKind.Agent, coordinator), undefined),
			coordinatorAgain: resolveAgentMessageProvenance(message(MessageKind.Agent, toAgentMessageDelegationMeta({ sourceSession: 'copilot:/coordinator', sourceChat: 'copilot:/coordinator/chat', sourceTurnId: 'turn-2', messageId: 'message-2' })), undefined),
			peer: resolveAgentMessageProvenance(message(MessageKind.Agent, toAgentMessageDelegationMeta({ sourceSession: 'copilot:/coordinator', sourceChat: 'copilot:/coordinator/peer' })), undefined),
			agentKnownBySessionOnly: resolveAgentMessageProvenance(message(MessageKind.Agent, toAgentMessageDelegationMeta({ sourceSession: 'copilot:/other' })), undefined),
			agentWithoutIdentity: resolveAgentMessageProvenance(message(MessageKind.Agent), undefined),
			toolWithoutIdentity: resolveAgentMessageProvenance(message(MessageKind.Tool), undefined),
		}, {
			person: { kind: 'user' },
			personInAutomationSession: { kind: 'user' },
			automationRun: { kind: 'automation', id: 'ahp-automation:/nightly' },
			automationWithoutIdentity: { kind: 'system' },
			agentMerge: { kind: 'automation', id: 'vscode.agentMerge' },
			hostNotification: { kind: 'system' },
			artifactActionAPersonChose: { kind: 'user' },
			artifactAutomation: { kind: 'system' },
			coordinator: { kind: 'agent', id: 'copilot:/coordinator/chat' },
			coordinatorAgain: { kind: 'agent', id: 'copilot:/coordinator/chat' },
			peer: { kind: 'agent', id: 'copilot:/coordinator/peer' },
			agentKnownBySessionOnly: { kind: 'agent', id: 'copilot:/other' },
			agentWithoutIdentity: { kind: 'system' },
			toolWithoutIdentity: { kind: 'system' },
		});
	});
});
