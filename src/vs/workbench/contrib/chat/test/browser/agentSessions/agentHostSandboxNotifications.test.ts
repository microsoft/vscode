/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { withSessionSandboxState } from '../../../../../../platform/agentHost/common/meta/agentSandboxStateMeta.js';
import { ActionType, type ActionEnvelope } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { AgentHostSandboxNotifications } from '../../../browser/agentSessions/agentHost/agentHostSandboxNotifications.js';

suite('AgentHostSandboxNotifications', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports each failure only to its originating client, without a retry action', () => {
		const actions = store.add(new Emitter<ActionEnvelope>());
		const messages: string[] = [];
		const logs: string[] = [];
		const messagesAtRollback: string[][] = [];
		const connection = new class extends mock<IAgentConnection>() {
			override readonly clientId = 'local-client';
			override readonly onDidAction = actions.event;
		}();
		store.add(new AgentHostSandboxNotifications(
			new class extends mock<IAgentHostConnectionsService>() {
				override readonly onDidChangeConnections = Event.None;
				override readonly connections = [{ authority: 'remote', address: 'remote', name: 'Remote', isAmbient: false, connection }];
			}(),
			new class extends NullLogService {
				override error(_message: string, detail: string): void { logs.push(detail); }
			}(),
			new class extends mock<INotificationService>() {
				override error(message: string | Error): void { messages.push(String(message)); }
			}(),
		));
		store.add(actions.event(envelope => {
			if (envelope.action.type === ActionType.SessionConfigChanged) {
				messagesAtRollback.push([...messages]);
			}
		}));
		const fire = (clientId: string, clientSeq: number, error = true) => actions.fire({
			channel: 'custom-host://sessions/one',
			serverSeq: clientSeq,
			origin: undefined,
			action: {
				type: ActionType.SessionMetaChanged,
				_meta: withSessionSandboxState(undefined, { enabled: true, ...(error ? { error: { clientId, clientSeq, message: 'SDK rejected update' } } : {}) }),
			},
		});
		fire('another-client', 1);
		fire('local-client', 2, false);
		fire('local-client', 3);
		actions.fire({
			channel: 'custom-host://sessions/one',
			serverSeq: 4,
			origin: undefined,
			action: { type: ActionType.SessionConfigChanged, config: { sandboxEnabled: 'on' } },
		});
		fire('local-client', 3);
		fire('local-client', 4);
		assert.deepStrictEqual({ messages, logs, messagesAtRollback }, {
			messages: Array(2).fill('Could not change terminal sandboxing. Try the action again. SDK rejected update'),
			logs: Array(2).fill('SDK rejected update'),
			messagesAtRollback: [['Could not change terminal sandboxing. Try the action again. SDK rejected update']],
		});
	});
});
