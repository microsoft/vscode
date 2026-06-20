/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatScrollbarPromptMarkerClickBehavior } from '../../../common/constants.js';
import { IChatRequestViewModel, IChatResponseViewModel } from '../../../common/model/chatViewModel.js';
import { applyScrollbarPromptMarkerClickBehavior, getFocusedScrollbarPromptMarkerRequestId, getScrollbarPromptMarkerRequests } from '../../../browser/actions/chatPromptNavigationActions.js';

suite('Chat scrollbar prompt marker helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function request(id: string, attempt: number, messageText: string, timestamp: number, isSystemInitiated = false): IChatRequestViewModel {
		return {
			id,
			sessionResource: undefined as never,
			dataId: id,
			username: 'User',
			message: undefined as never,
			messageText,
			attempt,
			variables: [],
			currentRenderedHeight: undefined,
			isComplete: true,
			isCompleteAddedRequest: false,
			slashCommand: undefined,
			agentOrSlashCommandDetected: false,
			shouldBeRemovedOnSend: undefined as never,
			shouldBeBlocked: undefined as never,
			timestamp,
			isSystemInitiated,
		} as IChatRequestViewModel;
	}

	function response(requestId: string): IChatResponseViewModel {
		return {
			id: `${requestId}-response`,
			sessionResource: undefined as never,
			model: undefined as never,
			dataId: `${requestId}-response`,
			session: undefined as never,
			username: 'Assistant',
			agentOrSlashCommandDetected: false,
			response: undefined as never,
			usedContext: undefined,
			contentReferences: [],
			codeCitations: [],
			progressMessages: [],
			isComplete: true,
			isCanceled: false,
			isStale: false,
			vote: undefined,
			requestId,
			replyFollowups: undefined,
			errorDetails: undefined,
			result: undefined,
			contentUpdateTimings: undefined,
			confirmationAdjustedTimestamp: undefined as never,
			usageObs: undefined as never,
			completionTokenCountObs: undefined as never,
			isCompleteAddedRequest: false,
			currentRenderedHeight: undefined,
			setVote: () => { },
			setEditApplied: () => { },
			vulnerabilitiesListExpanded: false,
			shouldBeRemovedOnSend: undefined as never,
			shouldBeBlocked: undefined as never,
		} as IChatResponseViewModel;
	}

	test('getScrollbarPromptMarkerRequests keeps the latest logical prompt and drops system initiated requests', () => {
		const items = [
			request('request-1', 0, 'hello', 1),
			response('request-1'),
			request('request-2', 1, 'hello', 2),
			request('request-3', 0, 'system', 3, true),
			request('request-4', 0, 'world', 4),
		];

		assert.deepStrictEqual(getScrollbarPromptMarkerRequests(items).map(item => item.id), ['request-2', 'request-4']);
	});

	test('getFocusedScrollbarPromptMarkerRequestId maps request and response focus to the request id', () => {
		assert.strictEqual(getFocusedScrollbarPromptMarkerRequestId(request('request-1', 0, 'hello', 1)), 'request-1');
		assert.strictEqual(getFocusedScrollbarPromptMarkerRequestId(response('request-2')), 'request-2');
		assert.strictEqual(getFocusedScrollbarPromptMarkerRequestId(undefined), undefined);
	});

	test('applyScrollbarPromptMarkerClickBehavior reveals or reveals and focuses', () => {
		const calls: string[] = [];
		const target = {
			reveal: (item: IChatRequestViewModel) => calls.push(`reveal:${item.id}`),
			focusItem: (item: IChatRequestViewModel) => calls.push(`focus:${item.id}`),
		};

		const item = request('request-1', 0, 'hello', 1);

		applyScrollbarPromptMarkerClickBehavior(target, item, ChatScrollbarPromptMarkerClickBehavior.RevealAndFocus);
		assert.deepStrictEqual(calls, ['reveal:request-1', 'focus:request-1']);

		calls.length = 0;
		applyScrollbarPromptMarkerClickBehavior(target, item, ChatScrollbarPromptMarkerClickBehavior.Reveal);
		assert.deepStrictEqual(calls, ['reveal:request-1']);
	});
});
