/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { VoiceToolDispatchService } from '../../../browser/voiceClient/voiceToolDispatchService.js';
import { ElicitationState, IChatService } from '../../../common/chatService/chatService.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { ChatElicitationRequestPart } from '../../../common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { derivePendingId, IVoiceToolCall } from '../../../common/voiceClient/voiceClientService.js';

suite('VoiceToolDispatchService - respondToSession', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('agent-session://test/one');
	const requestId = 'req-1';

	function serviceFor(part: object): VoiceToolDispatchService {
		const model = new class extends mock<IChatModel>() {
			override getRequests() {
				return [{ id: requestId, response: { response: { value: [part] } } }] as unknown as ReturnType<IChatModel['getRequests']>;
			}
		};
		const agentSessionsService = new class extends mock<IAgentSessionsService>() {
			override get model(): IAgentSessionsModel {
				return { sessions: [{ isArchived: () => false, resource: sessionResource }] } as IAgentSessionsModel;
			}
		};
		const chatService = new class extends mock<IChatService>() {
			override getSession() {
				return model as IChatModel;
			}
		};
		return new VoiceToolDispatchService(
			agentSessionsService,
			chatService,
			new class extends mock<ILanguageModelToolsService>() { },
			new class extends mock<IChatWidgetService>() { },
		);
	}

	function approvalCall(part: object, type: 'approve' | 'reject'): IVoiceToolCall {
		return {
			name: 'respond_to_session',
			args: {
				coding_session_id: sessionResource.toString(),
				request_id: requestId,
				pending_id: derivePendingId(requestId, part),
				response: { type },
			},
		} as unknown as IVoiceToolCall;
	}

	// An elicitation's handler decides the outcome, so "I asked to accept" and
	// "it accepted" are different facts. Reporting the first is how the assistant
	// ends up saying "Okay, approved" for something the agent declined.

	test('reports success when the accept actually took', async () => {
		const part = new ChatElicitationRequestPart('t', 'm', '', 'Ok', 'No',
			async () => ElicitationState.Accepted,
			async () => ElicitationState.Rejected);

		const result = await serviceFor(part).respondToSession(approvalCall(part, 'approve'));

		assert.strictEqual(result.ok, true);
	});

	test('reports failure when accepting settled as a decline', async () => {
		// Opening an authorization URL can fail, which settles the request as
		// Rejected even though the user asked to approve it.
		const part = new ChatElicitationRequestPart('t', 'm', '', 'Ok', 'No',
			async () => ElicitationState.Rejected,
			async () => ElicitationState.Rejected);

		const result = await serviceFor(part).respondToSession(approvalCall(part, 'approve'));

		assert.strictEqual(result.ok, false);
	});

	test('reports success when the reject actually took', async () => {
		const part = new ChatElicitationRequestPart('t', 'm', '', 'Ok', 'No',
			async () => ElicitationState.Accepted,
			async () => ElicitationState.Rejected);

		const result = await serviceFor(part).respondToSession(approvalCall(part, 'reject'));

		assert.strictEqual(result.ok, true);
	});

	test('refuses a pending id that was never published for this part', async () => {
		// `peekPendingId` never mints, so an id from a part that has since been
		// spliced out of the response cannot resolve to whatever took its place.
		const part = new ChatElicitationRequestPart('t', 'm', '', 'Ok', 'No',
			async () => ElicitationState.Accepted);
		const call = approvalCall(part, 'approve');
		(call.args as Record<string, unknown>)['pending_id'] = `${requestId}#p999999`;

		const result = await serviceFor(part).respondToSession(call);

		assert.deepStrictEqual(result, { ok: false, reason: 'stale_pending' });
	});
});
