/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatInteractivity, ChatOriginKind, IChat, IChatOrigin, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
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

	test('PB-03 unplaced child chats follow the parent without rewriting their placements', () => {
		const first = createChat('first', ChatInteractivity.Full);
		const second = createChat('second', ChatInteractivity.Full);
		const model = new ProjectBoardModel();
		model.updateSessions([createSession(first, second)]);

		model.moveCard(model.cards[0].id, { rowId: 'general', columnId: 'p0' });

		assert.deepStrictEqual({
			unassigned: model.getUnassignedCards().map(card => card.title),
			p0: model.getCards('general', 'p0').map(card => card.title),
		}, {
			unassigned: [],
			p0: ['first'],
		});
		assert.deepStrictEqual(model.getChildCards(model.cards[0].id).map(card => card.title), ['second']);

		model.moveCard(model.cards[0].id, undefined);
		assert.deepStrictEqual(model.getUnassignedCards().map(card => card.title), ['first']);
	});

	test('shows explicitly placed parents and their children when sessions are not auto-included', () => {
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
		assert.deepStrictEqual(model.getChildCards(model.cards[0].id).map(card => card.title), ['second']);
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
				placement: { rowId: 'general', columnId: 'p1' },
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
			cards: { placed: ['first'], unassigned: [] },
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
		const sessions = [unknown, first, second].map(chat => createSession(chat));
		const model = new ProjectBoardModel();
		model.updateSessions(sessions);
		const id = (title: string) => model.cards.find(card => card.title === title)!.id;
		model.setPromptRecency(id('first'), 1000);
		model.setPromptRecency(id('second'), 2000);
		const titles = () => model.getUnassignedCards().map(card => card.title);
		assert.deepStrictEqual(titles(), ['second', 'first', 'unknown']);
		first.status.set(SessionStatus.InProgress, undefined);
		first.updatedAt.set(new Date(3000), undefined);
		first.isRead.set(true, undefined);
		model.updateSessions(sessions);
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

	test('explicit child placement detaches it and clearing placement rejoins the parent', () => {
		const model = new ProjectBoardModel();
		model.updateSessions([createSession(createChat('parent', ChatInteractivity.Full), createChat('child', ChatInteractivity.Full))]);
		const [parent, child] = model.cards;
		model.moveCard(parent.id, { rowId: 'general', columnId: 'p0' });
		model.moveCard(child.id, { rowId: 'general', columnId: 'p1' });
		assert.deepStrictEqual({
			parent: model.getParentCard(child.id), children: model.getChildCards(parent.id),
			detached: model.getCards('general', 'p1').map(card => card.id),
		}, { parent: undefined, children: [], detached: [child.id] });
		model.moveCard(child.id, undefined);
		assert.deepStrictEqual({
			parent: model.getParentCard(child.id)?.id, children: model.getChildCards(parent.id).map(card => card.id),
			placement: model.getPlacement(child.id),
		}, { parent: parent.id, children: [child.id], placement: { rowId: 'general', columnId: 'p0' } });
		model.moveCard(parent.id, undefined);
		assert.strictEqual(model.getPlacement(child.id), undefined);
	});

	test('only co-located children are grouped, with independent per-board placements', () => {
		const session = createSession(createChat('parent', ChatInteractivity.Full), createChat('child', ChatInteractivity.Full));
		const first = new ProjectBoardModel();
		const second = new ProjectBoardModel();
		for (const model of [first, second]) {
			model.updateSessions([session]);
		}
		const [parent, child] = first.cards;
		first.moveCard(parent.id, { rowId: 'general', columnId: 'p0' });
		first.moveCard(child.id, { rowId: 'general', columnId: 'p0' });
		assert.strictEqual(first.getParentCard(child.id)?.id, parent.id);
		first.moveCard(parent.id, { rowId: 'general', columnId: 'p1' });
		assert.deepStrictEqual({
			detached: first.getParentCard(child.id), child: first.getPlacement(child.id),
			otherBoardParent: second.getParentCard(child.id)?.id, otherBoardPlacement: second.getPlacement(child.id),
		}, { detached: undefined, child: { rowId: 'general', columnId: 'p0' }, otherBoardParent: parent.id, otherBoardPlacement: undefined });
	});

	test('archive filtering and a missing parent never swallow visible children', () => {
		const parent = createChat('parent', ChatInteractivity.Full);
		const child = createChat('child', ChatInteractivity.Full);
		const session = createSession(parent, child);
		const model = new ProjectBoardModel();
		model.updateSessions([session]);
		const parentId = model.cards[0].id;
		parent.isArchived.set(true, undefined);
		model.updateSessions([session]);
		assert.deepStrictEqual({
			roots: model.getUnassignedCards().map(card => card.title),
			withArchived: model.getUnassignedCards(true).map(card => card.title),
			children: model.getChildCards(parentId, true).map(card => card.title),
		}, { roots: ['child'], withArchived: ['parent'], children: ['child'] });
		session.chats.set([child], undefined);
		model.updateSessions([session]);
		assert.deepStrictEqual(model.getUnassignedCards(true).map(card => card.title), ['child']);
	});

	test('children reuse native list eligibility and retain their own recency and read state', () => {
		const parent = createChat('parent', ChatInteractivity.Full);
		const first = createChat('first', ChatInteractivity.Full);
		const second = createChat('second', ChatInteractivity.ReadOnly);
		const tool = createChat('tool', ChatInteractivity.ReadOnly, { kind: ChatOriginKind.Tool, parentChat: parent.resource });
		const side = createChat('side', ChatInteractivity.Full, { kind: ChatOriginKind.SideChat, parentChat: parent.resource });
		const hidden = createChat('hidden', ChatInteractivity.Hidden);
		const model = new ProjectBoardModel();
		model.updateSessions([createSession(parent, first, second, tool, side, hidden)]);
		const parentId = model.cards[0].id;
		model.setPromptRecency(model.cards.find(card => card.chat === second)!.id, 100);
		assert.deepStrictEqual({
			roots: model.getUnassignedCards().map(card => card.title),
			children: model.getChildCards(parentId).map(card => [card.title, card.readOnly, card.isRead]),
		}, { roots: ['parent', 'side', 'tool'], children: [['second', true, false], ['first', false, false]] });
	});
});

interface ITestChat extends IChat {
	readonly status: ISettableObservable<SessionStatus>;
	readonly isArchived: ISettableObservable<boolean>;
	readonly updatedAt: ISettableObservable<Date>;
	readonly isRead: ISettableObservable<boolean>;
}

function createChat(id: string, interactivity: ChatInteractivity, origin?: IChatOrigin): ITestChat {
	return new class extends mock<IChat>() {
		override readonly origin = origin;
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
		override readonly resource = URI.parse(`test-session:${chats[0].resource.fragment}`);
		override readonly title = observableValue('session-title', 'Shared session');
		override readonly chats = observableValue<readonly IChat[]>('session-chats', chats);
		override readonly mainChat = observableValue('mainChat', chats[0]);
		override readonly isArchived = observableValue('archived', false);
	}();
}
