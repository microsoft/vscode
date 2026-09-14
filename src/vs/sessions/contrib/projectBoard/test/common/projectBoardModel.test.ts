/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ProjectBoardModel } from '../../common/projectBoardModel.js';

suite('ProjectBoardModel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('PB-02 renders individual visible chats with stable identity', () => {
		const first = createChat('first', ChatInteractivity.Full);
		const second = createChat('second', ChatInteractivity.ReadOnly);
		const hidden = createChat('hidden', ChatInteractivity.Hidden);
		const session = createSession(first, second, hidden);
		const model = new ProjectBoardModel();

		model.updateSessions([session]);

		assert.deepStrictEqual(model.cards.map(card => [card.title, card.sessionTitle]), [
			['first', 'Shared session'],
			['second', 'Shared session'],
		]);
		assert.notStrictEqual(model.cards[0].id, model.cards[1].id);
	});

	test('PB-03 moves exactly one card between Unassigned and a cell', () => {
		const first = createChat('first', ChatInteractivity.Full);
		const second = createChat('second', ChatInteractivity.Full);
		const model = new ProjectBoardModel();
		model.updateSessions([createSession(first, second)]);

		model.moveCard(model.cards[0].id, { rowId: 'general', columnId: 'p0' });

		assert.deepStrictEqual({
			unassigned: model.getUnassignedCards().map(card => card.title),
			p0: model.getCards('general', 'p0').map(card => card.title),
		}, {
			unassigned: ['second'],
			p0: ['first'],
		});

		model.moveCard(model.cards[0].id, undefined);
		assert.deepStrictEqual(model.getUnassignedCards().map(card => card.title), ['first', 'second']);
	});

	test('PB-04 updates live state without changing placement or read state', () => {
		const first = createChat('first', ChatInteractivity.Full);
		const second = createChat('second', ChatInteractivity.Full);
		const session = createSession(first, second);
		const model = new ProjectBoardModel();
		model.updateSessions([session]);
		model.moveCard(model.cards[0].id, { rowId: 'general', columnId: 'p1' });

		first.status.set(SessionStatus.NeedsInput, undefined);
		model.updateSessions([session]);

		assert.deepStrictEqual(model.cards.map(card => ({
			title: card.title,
			status: card.status,
			isRead: card.isRead,
			placement: model.getPlacement(card.id),
		})), [
			{
				title: 'first',
				status: SessionStatus.NeedsInput,
				isRead: false,
				placement: { rowId: 'general', columnId: 'p1' },
			},
			{
				title: 'second',
				status: SessionStatus.Completed,
				isRead: false,
				placement: undefined,
			},
		]);
	});
});

interface ITestChat extends IChat {
	readonly status: ISettableObservable<SessionStatus>;
}

function createChat(id: string, interactivity: ChatInteractivity): ITestChat {
	return new class extends mock<IChat>() {
		override readonly resource = URI.parse(`test-chat:session#${id}`);
		override readonly title = observableValue(`title-${id}`, id);
		override readonly status = observableValue<SessionStatus>(`status-${id}`, SessionStatus.Completed);
		override readonly isRead = observableValue(`read-${id}`, false);
		override readonly interactivity = observableValue(`interactivity-${id}`, interactivity);
		override readonly description = observableValue(`description-${id}`, undefined);
	}();
}

function createSession(...chats: IChat[]): ISession {
	return new class extends mock<ISession>() {
		override readonly providerId = 'test-provider';
		override readonly resource = URI.parse('test-session:shared');
		override readonly title = observableValue('session-title', 'Shared session');
		override readonly chats = observableValue<readonly IChat[]>('session-chats', chats);
	}();
}
