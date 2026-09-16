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
import { IProjectBoardConfiguration } from '../../common/projectBoardConfiguration.js';
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

	test('shows only explicitly placed cards when sessions are not auto-included', () => {
		const first = createChat('first', ChatInteractivity.Full);
		const second = createChat('second', ChatInteractivity.Full);
		const model = new ProjectBoardModel();
		model.updateSessions([createSession(first, second)]);
		const configuration: IProjectBoardConfiguration = {
			version: 1,
			rows: [{ id: 'general', label: 'General' }],
			columns: [{ id: 'p0', label: 'P0' }],
			placements: [{ cardId: model.cards[0].id, rowId: 'general', columnId: 'p0' }],
			autoIncludeSessions: false,
		};

		model.updateConfiguration(configuration);

		assert.deepStrictEqual({
			unassigned: model.getUnassignedCards().map(card => card.title),
			placed: model.getCards('general', 'p0').map(card => card.title),
			allCards: model.cards.map(card => card.title),
		}, {
			unassigned: [],
			placed: ['first'],
			allCards: ['first', 'second'],
		});
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

	test('session list presents one session and keeps new chats with its occupied cell', () => {
		const first = createChat('first', ChatInteractivity.Full);
		const second = createChat('second', ChatInteractivity.Full);
		const session = createSession(first, second);
		const model = new ProjectBoardModel();
		model.updateSessions([session]);
		const firstId = model.cards[0].id;
		const configuration: IProjectBoardConfiguration = {
			version: 1,
			rows: [{ id: 'general', label: 'General' }],
			columns: [{ id: 'p0', label: 'P0' }, { id: 'p1', label: 'P1' }],
			placements: [{ cardId: firstId, rowId: 'general', columnId: 'p0' }],
			autoIncludeSessions: true,
			display: { showStateDuration: false, showCredits: false, showSessionList: true },
		};
		model.updateConfiguration(configuration);
		const list = { placed: model.getCards('general', 'p0').map(card => card.sessionTitle), unassigned: model.getUnassignedCards().length };
		model.updateConfiguration({ ...configuration, display: undefined });
		assert.deepStrictEqual({
			list,
			cards: { placed: model.getCards('general', 'p0').map(card => card.title), unassigned: model.getUnassignedCards().map(card => card.title) },
		}, {
			list: { placed: ['Shared session'], unassigned: 0 },
			cards: { placed: ['first'], unassigned: ['second'] },
		});
	});

	test('conflicting chat placements are unassigned only when auto-inclusion is enabled', () => {
		const model = new ProjectBoardModel();
		model.updateSessions([createSession(createChat('first', ChatInteractivity.Full), createChat('second', ChatInteractivity.Full))]);
		const configuration: IProjectBoardConfiguration = {
			version: 1,
			rows: [{ id: 'general', label: 'General' }],
			columns: [{ id: 'p0', label: 'P0' }, { id: 'p1', label: 'P1' }],
			placements: model.cards.map((card, index) => ({ cardId: card.id, rowId: 'general', columnId: `p${index}` })),
			autoIncludeSessions: true,
			display: { showStateDuration: false, showCredits: false, showSessionList: true },
		};
		const counts = () => [model.getUnassignedCards().length, model.getCards('general', 'p0').length, model.getCards('general', 'p1').length];
		model.updateConfiguration(configuration);
		const autoIncluded = counts();
		model.updateConfiguration({ ...configuration, autoIncludeSessions: false });
		const explicitlyIncluded = counts();
		model.updateConfiguration({ ...configuration, display: undefined });
		assert.deepStrictEqual({ autoIncluded, explicitlyIncluded, originalCards: counts() }, {
			autoIncluded: [1, 0, 0], explicitlyIncluded: [0, 0, 0], originalCards: [0, 1, 1],
		});
	});

	test('PB-09 archived chats and archived owners hide without losing placements', () => {
		const chat = createChat('archivable', ChatInteractivity.Full);
		const session = createSession(chat);
		const model = new ProjectBoardModel();
		model.updateSessions([session]);
		const id = model.cards[0].id;
		model.moveCard(id, { rowId: 'general', columnId: 'p0' });
		for (const archived of [chat.isArchived, session.isArchived]) {
			archived.set(true, undefined);
			model.updateSessions([session]);
			assert.deepStrictEqual({
				visible: model.getCards('general', 'p0').length,
				placement: model.getPlacement(id),
			}, { visible: 0, placement: { rowId: 'general', columnId: 'p0' } });
			archived.set(false, undefined);
			model.updateSessions([session]);
			assert.strictEqual(model.getCards('general', 'p0')[0].id, id);
		}
	});

	test('PB-07 submitted prompt time, not agent output or visits, controls order with stable unknown ties', () => {
		const first = createChat('first', ChatInteractivity.Full);
		const second = createChat('second', ChatInteractivity.Full);
		const unknown = createChat('unknown', ChatInteractivity.Full);
		const session = createSession(unknown, first, second);
		const model = new ProjectBoardModel();
		model.updateSessions([session]);
		const id = (title: string) => model.cards.find(card => card.title === title)!.id;
		model.setPromptRecency(id('first'), 1000);
		model.setPromptRecency(id('second'), 2000);
		const titles = () => model.getUnassignedCards().map(card => card.title);
		assert.deepStrictEqual(titles(), ['second', 'first', 'unknown']);
		first.status.set(SessionStatus.InProgress, undefined);
		first.updatedAt.set(new Date(3000), undefined);
		first.isRead.set(true, undefined);
		model.updateSessions([session]);
		assert.deepStrictEqual(titles(), ['second', 'first', 'unknown']);
		model.setSortingDeferred(true);
		model.setPromptRecency(id('first'), 5000);
		assert.deepStrictEqual(titles(), ['second', 'first', 'unknown']);
		model.setSortingDeferred(false);
		assert.deepStrictEqual(titles(), ['first', 'second', 'unknown']);
		model.setPromptRecency(id('first'), undefined);
		model.setPromptRecency(id('second'), undefined);
		assert.deepStrictEqual(titles(), ['first', 'second', 'unknown']);
	});
});

interface ITestChat extends IChat {
	readonly status: ISettableObservable<SessionStatus>;
	readonly isArchived: ISettableObservable<boolean>;
	readonly updatedAt: ISettableObservable<Date>;
	readonly isRead: ISettableObservable<boolean>;
}

function createChat(id: string, interactivity: ChatInteractivity): ITestChat {
	return new class extends mock<IChat>() {
		override readonly resource = URI.parse(`test-chat:session#${id}`);
		override readonly title = observableValue(`title-${id}`, id);
		override readonly status = observableValue<SessionStatus>(`status-${id}`, SessionStatus.Completed);
		override readonly isRead = observableValue(`read-${id}`, false);
		override readonly updatedAt = observableValue(`updated-${id}`, new Date(0));
		override readonly isArchived = observableValue(`archived-${id}`, false);
		override readonly interactivity = observableValue(`interactivity-${id}`, interactivity);
		override readonly description = observableValue(`description-${id}`, undefined);
	}();
}

function createSession(...chats: IChat[]) {
	return new class extends mock<ISession>() {
		override readonly providerId = 'test-provider';
		override readonly resource = URI.parse('test-session:shared');
		override readonly title = observableValue('session-title', 'Shared session');
		override readonly chats = observableValue<readonly IChat[]>('session-chats', chats);
		override readonly isArchived = observableValue('archived', false);
	}();
}
