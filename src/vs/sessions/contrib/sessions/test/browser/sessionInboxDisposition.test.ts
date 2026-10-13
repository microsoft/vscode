/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel, IResponse } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { SessionInboxDisposition } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { getReadyToMergeTransition, hasPendingSessionQuestion, IReadyToMergeLifecycleSnapshot, ReadyToMergeTransition } from '../../browser/sessionInboxDisposition.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Session Inbox disposition', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const state = {
		disposition: SessionInboxDisposition.ReadyToMerge,
		updatedAt: 100,
		pullRequestKeys: ['owner/repo#1'],
	};
	const snapshot = (overrides: Partial<IReadyToMergeLifecycleSnapshot> = {}): IReadyToMergeLifecycleSnapshot => ({
		isArchived: false,
		hasPendingQuestion: false,
		pullRequests: [{ key: 'owner/repo#1', state: 'open' }],
		...overrides,
	});

	test('keeps Ready to Merge sessions deferred unless they ask a question or merge', () => {
		assert.deepStrictEqual({
			open: getReadyToMergeTransition(state, snapshot()),
			unresolved: getReadyToMergeTransition(state, snapshot({ pullRequests: [{ key: 'owner/repo#1', state: undefined }] })),
			merged: getReadyToMergeTransition(state, snapshot({ pullRequests: [{ key: 'owner/repo#1', state: 'merged' }] })),
			askUser: getReadyToMergeTransition(state, snapshot({ hasPendingQuestion: true })),
			closed: getReadyToMergeTransition(state, snapshot({ pullRequests: [{ key: 'owner/repo#1', state: 'closed' }] })),
			newPullRequest: getReadyToMergeTransition(state, snapshot({ pullRequests: [{ key: 'owner/repo#1', state: 'open' }, { key: 'owner/repo#2', state: 'open' }] })),
			missingPullRequest: getReadyToMergeTransition(state, snapshot({ pullRequests: [] })),
		}, {
			open: ReadyToMergeTransition.None,
			unresolved: ReadyToMergeTransition.None,
			merged: ReadyToMergeTransition.MarkDone,
			askUser: ReadyToMergeTransition.MoveToInbox,
			closed: ReadyToMergeTransition.None,
			newPullRequest: ReadyToMergeTransition.None,
			missingPullRequest: ReadyToMergeTransition.None,
		});
	});

	test('detects only an unused Ask User question carousel', async () => {
		const chat = upcastPartial<IChat>({ resource: URI.parse('test-chat:/ready') });
		const session = upcastPartial<ISession>({ mainChat: constObservable(chat), chats: constObservable([chat]) });
		const carousel = new ChatQuestionCarouselData([{ id: 'q1', title: 'Choice', message: 'Choose', type: 'text' }], false);
		const model = upcastPartial<IChatModel>({
			getRequests: () => [upcastPartial<IChatRequestModel>({
				response: upcastPartial<IChatResponseModel>({
					response: upcastPartial<IResponse>({ value: [carousel] }),
				}),
			})],
		});
		const chatService = new class extends mock<IChatService>() {
			override getSession() {
				return model;
			}
		}();

		const pending = hasPendingSessionQuestion(session, chatService, undefined);
		carousel.dismiss({ q1: 'Answer' });
		const answered = hasPendingSessionQuestion(session, chatService, undefined);

		assert.deepStrictEqual({ pending, answered }, { pending: true, answered: false });
	});
});
