/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentHostChatContributions, ITurnEnd } from '../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageKind, SessionStatus, TurnState } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostTurnService } from '../../node/agentHostTurnService.js';

suite('AgentHostTurnService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness() {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const turnEnds: ITurnEnd[] = [];
		const contributions = new class extends mock<IAgentHostChatContributions>() {
			override turnEnd(turn: ITurnEnd): void {
				turnEnds.push(turn);
			}
		}();
		const instantiationService = new class extends mock<IInstantiationService>() { }();
		const service = new AgentHostTurnService(stateManager, contributions, instantiationService);
		const session = URI.parse('copilot:/deferred-turn');
		const chat = URI.parse(buildDefaultChatUri(session));
		stateManager.createSession({
			resource: session.toString(),
			provider: 'copilot',
			title: 'Deferred turn',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		return { service, stateManager, session, chat, turnEnds };
	}

	test('keeps a deferred turn active until it is failed', () => {
		const harness = createHarness();
		const message = { text: 'Setting up workspace', origin: { kind: MessageKind.SystemNotification } } as const;

		const deferred = harness.service.beginDeferredTurnMessage(harness.chat, message);
		const active = harness.stateManager.getChatState(harness.chat.toString());
		const failed = harness.service.failDeferredTurnMessage(harness.chat, deferred, {
			errorType: 'workspaceConversionFailed',
			message: 'Workspace setup failed',
		});
		const ended = harness.stateManager.getChatState(harness.chat.toString());
		const endedTurn = ended?.turns.at(-1);

		assert.deepStrictEqual({
			activeTurnId: active?.activeTurn?.id,
			activeMessage: active?.activeTurn?.message,
			activeStatus: active?.status,
			failed,
			endedTurn: endedTurn && {
				id: endedTurn.id,
				message: endedTurn.message,
				responseParts: endedTurn.responseParts,
				state: endedTurn.state,
			},
			turnEnds: harness.turnEnds,
		}, {
			activeTurnId: deferred.turnId,
			activeMessage: message,
			activeStatus: SessionStatus.InProgress,
			failed: true,
			endedTurn: {
				id: deferred.turnId,
				message,
				responseParts: [{
					kind: 'error',
					error: {
						errorType: 'workspaceConversionFailed',
						message: 'Workspace setup failed',
					},
				}],
				state: TurnState.Error,
			},
			turnEnds: [{
				session: harness.session.toString(),
				channel: harness.chat.toString(),
				turnId: deferred.turnId,
				reason: {
					kind: 'error',
					error: {
						errorType: 'workspaceConversionFailed',
						message: 'Workspace setup failed',
					},
					resumable: false,
				},
			}],
		});
	});

	test('does not continue a deferred turn after cancellation', () => {
		const harness = createHarness();
		const deferred = harness.service.beginDeferredTurnMessage(harness.chat, {
			text: 'Setting up workspace',
			origin: { kind: MessageKind.SystemNotification },
		});
		harness.stateManager.dispatchServerAction(harness.chat.toString(), {
			type: ActionType.ChatTurnCancelled,
			turnId: deferred.turnId,
			duration: 1,
		});

		const continued = harness.service.continueDeferredTurnMessage(harness.chat, deferred, {
			text: 'Continue the task',
			origin: { kind: MessageKind.SystemNotification },
		});
		const replacement = harness.service.beginDeferredTurnMessage(harness.chat, {
			text: 'Replacement turn',
			origin: { kind: MessageKind.SystemNotification },
		});

		assert.deepStrictEqual({
			continued,
			activeTurnId: harness.stateManager.getActiveTurnId(harness.chat.toString()),
		}, {
			continued: false,
			activeTurnId: replacement.turnId,
		});
	});
});
