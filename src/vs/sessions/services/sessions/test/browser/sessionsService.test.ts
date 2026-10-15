/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChat, ISession } from '../../common/session.js';
import { IActiveSession, ISendRequestSentEvent } from '../../common/sessionsManagement.js';
import { IOpenNewSessionOptions, SessionsService } from '../../browser/sessionsService.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';

suite('SessionsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('Inbox View schedules a return to the new-session composer after an active-chat follow-up', () => {
		const activeSession = upcastPartial<ISession>({ sessionId: 'active' });
		const otherSession = upcastPartial<ISession>({ sessionId: 'other' });
		const threadSession = upcastPartial<ISession>({ sessionId: 'thread' });
		const inboxViewEnabled = observableValue('inboxViewEnabled', true);
		const redirects: string[] = [];
		let sendFollowClears = 0;
		const host = {
			_sendFollow: { clear: () => sendFollowClears++ },
			sessionsListModelService: { inboxViewEnabled },
			threadsService: { isThread: (session: ISession) => session === threadSession },
			activeSession: { get: () => activeSession },
			_scheduleInboxRedirect: (sessionId: string) => redirects.push(sessionId),
		};
		const handleDidSendRequest = Reflect.get(SessionsService.prototype, '_handleDidSendRequest') as
			(this: typeof host, event: ISendRequestSentEvent) => void;
		const event = (session: ISession, isNewSession: boolean, isNewChat: boolean) => upcastPartial<ISendRequestSentEvent>({
			session,
			isNewSession,
			isNewChat,
		});

		handleDidSendRequest.call(host, event(activeSession, false, false));
		handleDidSendRequest.call(host, event(threadSession, false, false));
		handleDidSendRequest.call(host, event(activeSession, false, true));
		handleDidSendRequest.call(host, event(otherSession, false, false));
		inboxViewEnabled.set(false, undefined);
		handleDidSendRequest.call(host, event(activeSession, false, false));

		assert.deepStrictEqual({
			sendFollowClears,
			redirects,
		}, {
			sendFollowClears: 5,
			redirects: ['active'],
		});
	});

	test('Inbox redirect waits until the current input dispatch finishes', async () => {
		const activeSession = upcastPartial<ISession>({ sessionId: 'active' });
		const inboxViewEnabled = observableValue('inboxViewEnabled', true);
		const opened: (IOpenNewSessionOptions | undefined)[] = [];
		const host = {
			_inboxRedirect: disposables.add(new MutableDisposable()),
			sessionsListModelService: { inboxViewEnabled },
			activeSession: { get: () => activeSession },
			openNewSession: async (options?: IOpenNewSessionOptions) => {
				opened.push(options);
				return { session: undefined, trustDeclined: false };
			},
		};
		const scheduleInboxRedirect = Reflect.get(SessionsService.prototype, '_scheduleInboxRedirect') as
			(this: typeof host, sessionId: string) => void;

		scheduleInboxRedirect.call(host, activeSession.sessionId);
		const beforeTimer = [...opened];
		await timeout(1);

		assert.deepStrictEqual({ beforeTimer, opened }, {
			beforeTimer: [],
			opened: [{ cancelRestore: true }],
		});
	});

	for (const questionCount of [1, 2]) {
		test(`Inbox View redirects after answers to ${questionCount} question${questionCount === 1 ? '' : 's'} are submitted`, async () => {
			const chat = upcastPartial<IChat>({ resource: URI.parse('test-chat:/active') });
			const activeSession = upcastPartial<IActiveSession>({
				sessionId: 'active',
				activeChat: constObservable(chat),
			});
			const questions = Array.from({ length: questionCount }, (_, index) => ({
				id: `question-${index}`,
				title: `Choice ${index}`,
				message: `Choose ${index}`,
				type: 'text' as const,
			}));
			const carousel = new ChatQuestionCarouselData(questions, false);
			const model = {
				onDidChange: Event.None,
				getRequests: () => [{
					response: {
						response: { value: [carousel] },
					},
				}],
			};
			const redirects: string[] = [];
			const host = {
				chatService: {
					chatModels: constObservable([model]),
					getSession: () => model,
				},
				threadsService: { isThread: () => false },
				_scheduleInboxRedirect: (sessionId: string) => redirects.push(sessionId),
			};
			const watchQuestionCarouselCompletion = Reflect.get(SessionsService.prototype, '_watchQuestionCarouselCompletion') as
				(this: typeof host, session: IActiveSession) => IDisposable;
			const watcher = disposables.add(watchQuestionCarouselCompletion.call(host, activeSession));
			const answers = Object.fromEntries(questions.map(question => [question.id, 'Answer']));

			await carousel.completion.complete({ answers });
			await Promise.resolve();
			watcher.dispose();

			assert.deepStrictEqual(redirects, ['active']);
		});
	}
});
