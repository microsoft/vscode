/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { ListDragOverEffectPosition, ListDragOverEffectType } from '../../../../../base/browser/ui/list/list.js';
import { ElementsDragAndDropData, ExternalElementsDragAndDropData, NativeDragAndDropData } from '../../../../../base/browser/ui/list/listView.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { DraggedSessionIdentifier, SessionsDataTransfers } from '../../../../browser/dnd.js';
import { ISessionGroupsService, SessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionWorkDragAndDrop } from '../../browser/views/sessionWorkDragAndDrop.js';
import { createTestSession } from './sessionsListTestUtils.js';

interface IWorkItem {
	readonly session?: ISession;
	readonly collection?: string;
}

class TestSessionGroupsService extends SessionGroupsService {
	readonly additions: { readonly sessions: string[]; readonly group: string }[] = [];
	error: Error | undefined;

	override addToGroup(sessionIdOrIds: string | Iterable<string>, groupId: string): void {
		if (this.error) {
			throw this.error;
		}
		const sessions = typeof sessionIdOrIds === 'string' ? [sessionIdOrIds] : [...sessionIdOrIds];
		this.additions.push({ sessions, group: groupId });
		super.addToGroup(sessions, groupId);
	}
}

suite('SessionWorkDragAndDrop', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();

	teardown(() => transfer.clearData(DraggedSessionIdentifier.prototype));

	function createDragAndDrop(initialSessions: ISession[]) {
		const sessions = [...initialSessions];
		const instantiation = store.add(new TestInstantiationService());
		const management = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override readonly onDidDeleteSession = Event.None;
			override readonly onDidArchiveSession = Event.None;
			override readonly onWillSendRequest = Event.None;
			override readonly onDidReplaceSession = Event.None;
			override readonly onDidStartSession = Event.None;
			override readonly onDidDiscardNewSession = Event.None;
			override getSessions(): ISession[] { return sessions; }
			override getSession(resource: URI): ISession | undefined { return sessions.find(session => isEqual(session.resource, resource)); }
		}();
		const groups = store.add(new TestSessionGroupsService(store.add(new InMemoryStorageService()), management));
		const errors: (string | Error)[] = [];
		let acquisitions = 0;
		instantiation.stub(ISessionsManagementService, management);
		instantiation.stub(ISessionGroupsService, groups);
		instantiation.stub(INotificationService, { error: error => errors.push(...Array.isArray(error) ? error : [error]) });
		instantiation.stub(IChatService, { acquireOrLoadSession: async () => { acquisitions++; throw new Error('Dragging must not acquire chat models'); } });
		const dnd = store.add(instantiation.createInstance(SessionWorkDragAndDrop<IWorkItem>, item => item.session, item => item.collection));
		const group = groups.createGroup('Release');
		return { dnd, groups, group, errors, sessions, instantiation, acquisitions: () => acquisitions };
	}

	function dragEvent(type: string, dataTransfer = new DataTransfer()): DragEvent {
		return new DragEvent(type, { dataTransfer, cancelable: true });
	}

	function nativeEvent(session: ISession): DragEvent {
		const dataTransfer = new DataTransfer();
		dataTransfer.setData(SessionsDataTransfers.SESSION, JSON.stringify({ sessionId: session.sessionId, resource: session.resource.toString() }));
		return dragEvent('drop', dataTransfer);
	}

	test('only nonarchived session rows are drag sources', () => {
		const session = createTestSession('Session');
		const archived = createTestSession('Archived', { isArchived: true });
		const { dnd, group } = createDragAndDrop([session.session, archived.session]);
		assert.deepStrictEqual([
			dnd.getDragURI({ session: session.session }), dnd.getDragURI({ session: archived.session }),
			dnd.getDragURI({ collection: group.id }), dnd.getDragURI({}),
			dnd.getDragLabel([{ session: session.session }, { session: session.session }]),
		], [session.session.resource.toString(), null, null, null, 'Session']);
	});

	test('publishes deduplicated native identifiers in selection order and retains the old single-session payload', () => {
		const first = createTestSession('First').session;
		const second = createTestSession('Second').session;
		const { dnd } = createDragAndDrop([first, second]);
		const event = dragEvent('dragstart');
		const elements = [{ session: second }, { session: first }, { session: second }, {}];
		dnd.onDragStart(new ElementsDragAndDropData(elements), event);
		assert.deepStrictEqual({
			identifiers: transfer.getData(DraggedSessionIdentifier.prototype),
			native: JSON.parse(event.dataTransfer!.getData(SessionsDataTransfers.SESSION)),
			label: dnd.getDragLabel(elements),
		}, {
			identifiers: [new DraggedSessionIdentifier(second.sessionId, second.resource), new DraggedSessionIdentifier(first.sessionId, first.resource)],
			native: { sessionId: second.sessionId, resource: second.resource.toString() },
			label: '2 sessions',
		});
	});

	test('moves each selected session once through the membership service without changing provider metadata or loading chats', () => {
		const first = createTestSession('First').session;
		const second = createTestSession('Second').session;
		const { dnd, groups, group, acquisitions, errors } = createDragAndDrop([first, second]);
		const oldGroup = groups.createGroup('Old', [first.sessionId, second.sessionId]);
		const data = new ElementsDragAndDropData([{ session: second }, { session: first }, { session: second }]);
		const before = [first, second].map(session => [session.createdAt, session.updatedAt.get(), session.isArchived.get()]);
		const target = { collection: group.id };
		const reaction = dnd.onDragOver(data, target, 0, undefined, dragEvent('dragover'));
		dnd.drop(data, target, 0, undefined, dragEvent('drop'));
		assert.deepStrictEqual({
			reaction, additions: groups.additions, oldMembers: groups.getSessionIdsInGroup(oldGroup.id),
			membership: [second, first].map(session => groups.getGroupOfSession(session.sessionId)),
			metadata: [first, second].map(session => [session.createdAt, session.updatedAt.get(), session.isArchived.get()]),
			acquisitions: acquisitions(), errors,
		}, {
			reaction: { accept: true, effect: { type: ListDragOverEffectType.Move, position: ListDragOverEffectPosition.Over }, autoExpand: true },
			additions: [{ sessions: [second.sessionId, first.sessionId], group: group.id }], oldMembers: [],
			membership: [group.id, group.id], metadata: before, acquisitions: 0, errors: [],
		});
	});

	test('external trees consume the shared transfer rather than interpreting foreign row objects', () => {
		const first = createTestSession('First').session;
		const second = createTestSession('Second').session;
		const { dnd, instantiation, groups, group, acquisitions } = createDragAndDrop([first, second]);
		const destination = store.add(instantiation.createInstance(SessionWorkDragAndDrop<{ readonly collection: string }>,
			() => { throw new Error('External elements must not be interpreted as destination rows'); }, item => item.collection));
		const event = dragEvent('dragstart');
		dnd.onDragStart(new ElementsDragAndDropData([{ session: second }, { session: first }]), event);
		const external = new ExternalElementsDragAndDropData([{ foreignTreeNode: true }]);
		const target = { collection: group.id };
		const reaction = destination.onDragOver(external, target, 0, undefined, dragEvent('dragover', event.dataTransfer!));
		destination.drop(external, target, 0, undefined, dragEvent('drop', event.dataTransfer!));
		assert.deepStrictEqual({
			accepted: typeof reaction !== 'boolean' && reaction.accept,
			additions: groups.additions, members: groups.getSessionIdsInGroup(group.id), acquisitions: acquisitions(),
			transfer: transfer.hasData(DraggedSessionIdentifier.prototype),
		}, {
			accepted: true, additions: [{ sessions: [second.sessionId, first.sessionId], group: group.id }],
			members: [second.sessionId, first.sessionId], acquisitions: 0, transfer: false,
		});
	});

	test('accepts the old Sessions list single-session payload and announces a successful move', () => {
		const session = createTestSession('Session').session;
		const { dnd, group, groups, errors } = createDragAndDrop([session]);
		const container = $('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		setARIAContainer(container);
		const event = nativeEvent(session);
		const data = new NativeDragAndDropData();
		const reaction = dnd.onDragOver(data, { collection: group.id }, 0, undefined, event);
		dnd.drop(data, { collection: group.id }, 0, undefined, event);
		assert.deepStrictEqual({
			accepted: typeof reaction !== 'boolean' && reaction.accept,
			additions: groups.additions, announcement: container.textContent, errors,
		}, { accepted: true, additions: [{ sessions: [session.sessionId], group: group.id }], announcement: 'Moved Session to Release.', errors: [] });
	});

	test('old Sessions list multiselection retains transfer order rather than the first serialized session only', () => {
		const first = createTestSession('First').session;
		const second = createTestSession('Second').session;
		const { dnd, groups, group } = createDragAndDrop([first, second]);
		transfer.setData([
			new DraggedSessionIdentifier(second.sessionId, second.resource), new DraggedSessionIdentifier(first.sessionId, first.resource),
			new DraggedSessionIdentifier(second.sessionId, second.resource),
		], DraggedSessionIdentifier.prototype);
		dnd.drop(new ExternalElementsDragAndDropData([first, second]), { collection: group.id }, 0, undefined, nativeEvent(second));
		assert.deepStrictEqual(groups.additions, [{ sessions: [second.sessionId, first.sessionId], group: group.id }]);
	});

	test('wrapping boards use the same validation and ordered membership mutation as the sidebar', () => {
		const first = createTestSession('First').session;
		const second = createTestSession('Second').session;
		const { dnd, groups, group, acquisitions, errors } = createDragAndDrop([first, second]);
		transfer.setData([
			new DraggedSessionIdentifier(second.sessionId, second.resource),
			new DraggedSessionIdentifier(first.sessionId, first.resource),
			new DraggedSessionIdentifier(second.sessionId, second.resource),
		], DraggedSessionIdentifier.prototype);
		const event = nativeEvent(second);
		const accepted = dnd.canDropIntoCollection(group.id, event);
		const automatic = dnd.canDropIntoCollection('needsInput', event);
		const moved = dnd.dropIntoCollection(group.id, event);
		assert.deepStrictEqual({
			accepted, automatic, moved: moved?.map(session => session.sessionId),
			additions: groups.additions, acquisitions: acquisitions(), errors,
			transfer: transfer.hasData(DraggedSessionIdentifier.prototype),
		}, {
			accepted: true, automatic: false, moved: [second.sessionId, first.sessionId],
			additions: [{ sessions: [second.sessionId, first.sessionId], group: group.id }],
			acquisitions: 0, errors: [], transfer: false,
		});
	});

	test('automatic, fixed, missing, and absent targets cannot change collection membership', () => {
		const session = createTestSession('Session').session;
		const { dnd, groups, errors } = createDragAndDrop([session]);
		const data = new ElementsDragAndDropData([{ session }]);
		const targets: (IWorkItem | undefined)[] = [{}, { collection: 'needsInput' }, { collection: 'archived' }, { collection: 'deleted' }, undefined];
		const reactions = targets.map(target => {
			const reaction = dnd.onDragOver(data, target, 0, undefined, dragEvent('dragover'));
			dnd.drop(data, target, 0, undefined, dragEvent('drop'));
			return reaction;
		});
		assert.deepStrictEqual({ reactions, additions: groups.additions, errors: errors.length }, {
			reactions: [false, false, false, false, false], additions: [], errors: 5,
		});
	});

	test('rejects the entire selection when any current source is archived', () => {
		const first = createTestSession('First').session;
		const archived = createTestSession('Archived', { isArchived: true });
		const { dnd, groups, group, errors } = createDragAndDrop([first, archived.session]);
		const data = new ElementsDragAndDropData([{ session: first }, { session: archived.session }]);
		const reaction = dnd.onDragOver(data, { collection: group.id }, 0, undefined, dragEvent('dragover'));
		dnd.drop(data, { collection: group.id }, 0, undefined, dragEvent('drop'));
		assert.deepStrictEqual({ reaction, additions: groups.additions, archived: archived.isArchived.get(), errors: errors.length }, {
			reaction: false, additions: [], archived: true, errors: 1,
		});
	});

	test('rechecks source availability and archive state after drag over', () => {
		const results = ['archived', 'removed', 'replaced'].map(change => {
			const source = createTestSession(`Session-${change}`);
			const { dnd, groups, group, sessions, errors } = createDragAndDrop([source.session]);
			const data = new ElementsDragAndDropData([{ session: source.session }]);
			const target = { collection: group.id };
			dnd.onDragOver(data, target, 0, undefined, dragEvent('dragover'));
			if (change === 'archived') {
				source.isArchived.set(true, undefined);
			} else if (change === 'removed') {
				sessions.splice(0);
			} else {
				sessions[0] = { ...source.session, sessionId: 'replacement' };
			}
			dnd.drop(data, target, 0, undefined, dragEvent('drop'));
			return { additions: groups.additions, errors: errors.length };
		});
		assert.deepStrictEqual(results, [{ additions: [], errors: 1 }, { additions: [], errors: 1 }, { additions: [], errors: 1 }]);
	});

	test('rechecks a deleted target and clears the transfer without recreating the group', () => {
		const session = createTestSession('Session').session;
		const { dnd, groups, group, errors } = createDragAndDrop([session]);
		const data = new ElementsDragAndDropData([{ session }]);
		dnd.onDragStart(data, dragEvent('dragstart'));
		dnd.onDragOver(data, { collection: group.id }, 0, undefined, dragEvent('dragover'));
		groups.deleteGroup(group.id);
		dnd.drop(data, { collection: group.id }, 0, undefined, dragEvent('drop'));
		assert.deepStrictEqual({
			additions: groups.additions, target: groups.getGroup(group.id), errors: errors.length,
			transfer: transfer.hasData(DraggedSessionIdentifier.prototype),
		}, { additions: [], target: undefined, errors: 1, transfer: false });
	});

	test('invalid local identifiers never fall back to an otherwise valid native payload', () => {
		const session = createTestSession('Session').session;
		const { dnd, groups, group, errors } = createDragAndDrop([session]);
		transfer.setData([new DraggedSessionIdentifier('missing', session.resource)], DraggedSessionIdentifier.prototype);
		const data = new NativeDragAndDropData();
		const event = nativeEvent(session);
		const reaction = dnd.onDragOver(data, { collection: group.id }, 0, undefined, event);
		dnd.drop(data, { collection: group.id }, 0, undefined, event);
		assert.deepStrictEqual({ reaction, additions: groups.additions, errors: errors.length }, { reaction: false, additions: [], errors: 1 });
	});

	for (const payload of ['', '{', 'null', '[]', '{"sessionId":"Session"}', '{"sessionId":2,"resource":"test-session://Session"}', '{"sessionId":"Session","resource":"relative/path"}']) {
		test(`rejects invalid native payload ${JSON.stringify(payload)}`, () => {
			const session = createTestSession('Session').session;
			const { dnd, groups, group, errors } = createDragAndDrop([session]);
			const event = dragEvent('drop');
			event.dataTransfer!.setData(SessionsDataTransfers.SESSION, payload);
			dnd.drop(new NativeDragAndDropData(), { collection: group.id }, 0, undefined, event);
			assert.deepStrictEqual({ additions: groups.additions, errors: errors.length }, { additions: [], errors: 1 });
		});
	}

	test('unrelated external data and sessions already in the collection are rejected', () => {
		const session = createTestSession('Session').session;
		const { dnd, groups, group } = createDragAndDrop([session]);
		const unrelated = dnd.onDragOver(new ExternalElementsDragAndDropData([{ session }]), { collection: group.id }, 0, undefined, dragEvent('dragover'));
		groups.addToGroup(session.sessionId, group.id);
		const unchanged = dnd.onDragOver(new ElementsDragAndDropData([{ session }]), { collection: group.id }, 0, undefined, dragEvent('dragover'));
		assert.deepStrictEqual({ unrelated, unchanged }, { unrelated: false, unchanged: false });
	});

	test('reports membership errors and clears drag state', () => {
		const session = createTestSession('Session').session;
		const { dnd, groups, group, errors } = createDragAndDrop([session]);
		const data = new ElementsDragAndDropData([{ session }]);
		dnd.onDragStart(data, dragEvent('dragstart'));
		const error = new Error('Cannot persist collection membership');
		groups.error = error;
		dnd.drop(data, { collection: group.id }, 0, undefined, dragEvent('drop'));
		assert.deepStrictEqual({
			errors, membership: groups.getGroupOfSession(session.sessionId), transfer: transfer.hasData(DraggedSessionIdentifier.prototype),
		}, { errors: [error], membership: undefined, transfer: false });
	});

	test('ending a drag clears its transfer and disposing an unrelated target does not clear the source', () => {
		const session = createTestSession('Session').session;
		const { dnd, instantiation } = createDragAndDrop([session]);
		const destination = store.add(instantiation.createInstance(SessionWorkDragAndDrop<IWorkItem>, () => undefined, item => item.collection));
		dnd.onDragStart(new ElementsDragAndDropData([{ session }]), dragEvent('dragstart'));
		destination.dispose();
		const afterTargetDisposal = transfer.hasData(DraggedSessionIdentifier.prototype);
		dnd.onDragEnd();
		const afterEnd = transfer.hasData(DraggedSessionIdentifier.prototype);
		dnd.onDragStart(new ElementsDragAndDropData([{ session }]), dragEvent('dragstart'));
		dnd.dispose();
		assert.deepStrictEqual({ afterTargetDisposal, afterEnd, afterSourceDisposal: transfer.hasData(DraggedSessionIdentifier.prototype) }, {
			afterTargetDisposal: true, afterEnd: false, afterSourceDisposal: false,
		});
	});
});
