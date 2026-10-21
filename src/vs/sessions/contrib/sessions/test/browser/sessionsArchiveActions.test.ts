/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { getSessionGroupSectionId, ISessionGroupsService, SessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionSectionOrderService, SessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { DELETE_SESSION_GROUP_WITH_UNDO_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { SessionComparisonService } from '../../../../services/sessions/browser/sessionComparisonService.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { ISessionsListModelService, SessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionGroupItem, ISessionSection, SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { ISessionsListNotice, SessionsListNotification } from '../../browser/views/sessionsListNotification.js';
import { SessionsView } from '../../browser/views/sessionsView.js';
import { getSessionsArchiveActionConstructors } from '../../browser/views/sessionsViewActions.js';
import { createListHarness, createTestSession } from './sessionsListTestUtils.js';

suite('Sessions - Bulk archive undo', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(wording = ChatSessionArchiveActionWording.MarkAsDone, withComparison = false) {
		const instantiationService = store.add(new TestInstantiationService());
		const now = Date.now();
		const sessions = ['first', 'second', 'alreadyDone'].map((resourceId, index) => {
			const entry = createTestSession(resourceId);
			return {
				...entry,
				session: {
					...entry.session,
					createdAt: new Date(now - (index + 1) * 60_000),
					updatedAt: constObservable(new Date(now - (3 - index) * 60_000)),
				},
			};
		});
		sessions[2].isArchived.set(true, undefined);
		const storageService = store.add(new InMemoryStorageService());
		const sessionsChanged = store.add(new Emitter<ISessionsChangeEvent>());
		const sessionArchived = store.add(new Emitter<ISession>());
		const archived: string[] = [];
		const restored: string[] = [];
		const state = { failArchive: '', failRestore: '', confirmed: true, launching: false, notices: 0, message: '', undo: async () => { } };
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm() { return { confirmed: state.confirmed }; }
		});
		instantiationService.stub(IStorageService, storageService);
		const managementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = sessionsChanged.event;
			override readonly onDidArchiveSession = sessionArchived.event;
			override readonly onDidDeleteSession = Event.None;
			override readonly onWillSendRequest = Event.None;
			override readonly onDidReplaceSession = Event.None;
			override readonly onDidReplaceNewDraftSession = Event.None;
			override readonly onDidStartSession = Event.None;
			override readonly onDidDiscardNewSession = Event.None;
			override getSessions() { return sessions.map(entry => entry.session); }
			override getInFlightNewSessionRequests() { return []; }
			override getSession(resource: URI) {
				return sessions.find(entry => entry.session.resource.toString() === resource.toString())?.session;
			}
			override async archiveSession(session: ISession) {
				if (session.sessionId === state.failArchive) {
					throw new Error('archive failed');
				}
				archived.push(session.sessionId);
				sessions.find(entry => entry.session === session)!.isArchived.set(true, undefined);
				sessionArchived.fire(session);
			}
			override async unarchiveSession(session: ISession) {
				if (session.sessionId === state.failRestore) {
					throw new Error('restore failed');
				}
				restored.push(session.sessionId);
				sessions.find(entry => entry.session === session)!.isArchived.set(false, undefined);
				sessionsChanged.fire({ added: [], removed: [], changed: [session] });
			}
		};
		instantiationService.stub(ISessionsManagementService, managementService);
		instantiationService.stub(ISessionSectionOrderService, store.add(new SessionSectionOrderService(storageService)));
		const groupsService = store.add(instantiationService.createInstance(SessionGroupsService));
		instantiationService.stub(ISessionGroupsService, groupsService);
		const group = groupsService.createGroup('Group', ['first', 'second']);
		if (withComparison) {
			const comparison: ISessionComparison = {
				id: 'comparison', groupId: group.id, title: group.name, createdAt: now,
				workspace: URI.file('/workspace'), prompt: 'Compare attempts',
				participants: sessions.slice(0, 2).map(({ session }) => ({
					id: session.sessionId, role: SessionComparisonParticipantRole.Attempt,
					harness: { providerId: session.providerId, sessionTypeId: session.sessionType, label: session.title.get() },
					sessionResource: session.resource,
				})),
			};
			storageService.store('sessions.comparisons', JSON.stringify([{
				...comparison,
				version: 1,
				workspace: comparison.workspace?.toString(),
				participants: comparison.participants.map(participant => ({ ...participant, sessionResource: participant.sessionResource?.toString() })),
			}]), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		const comparisonService = store.add(new SessionComparisonService(
			managementService, groupsService, storageService, new NullLogService(),
			upcastPartial<IChatService>({ getSession: () => undefined }), new NullTelemetryServiceShape(),
		));
		instantiationService.stub(ISessionComparisonService, comparisonService);
		const listModel = store.add(instantiationService.createInstance(SessionsListModelService));
		const membership = () => sessions
			.filter(entry => groupsService.getGroupOfSession(entry.session.sessionId))
			.map(entry => [entry.session.sessionId, groupsService.getGroupOfSession(entry.session.sessionId)]);
		const notification = new class extends mock<SessionsListNotification>() {
			override show(notice: ISessionsListNotice) {
				state.message = notice.message;
				state.undo = () => notice.undo();
				state.notices++;
			}
		};
		instantiationService.stub(IViewsService, new class extends mock<IViewsService>() {
			override getViewWithId<T>() { return upcastPartial<SessionsView>({ listNotification: notification }) as T; }
		});
		/** `ownSessions` are a group's own sessions, while `targets` also include those of its subgroups. */
		const run = async (kind: 'workspace' | 'section' | 'group' = 'workspace', targets = sessions.map(entry => entry.session), ownSessions = targets) => {
			const actionId = kind === 'group' ? 'sessionsView.markAllInGroupAsDone' : 'sessionsView.sectionArchive';
			const action = getSessionsArchiveActionConstructors(wording).map(ctor => new ctor()).find(action => action.desc.id === actionId)!;
			const context = kind === 'group'
				? upcastPartial<ISessionGroupItem>({
					group, sessions: ownSessions, subtreeSessions: targets,
					comparison: withComparison ? { id: 'comparison', title: group.name, launching: state.launching, summary: () => '' } : undefined,
				})
				: { id: kind === 'workspace' ? 'workspace:test' : 'today', label: 'Section', sessions: targets } satisfies ISessionSection;
			return instantiationService.invokeFunction(accessor => action.run(accessor, context));
		};
		return { run, sessions, sessionsChanged, membership, groupsService, group, comparisonService, listModel, managementService, storageService, archived, restored, state };
	}

	for (const kind of ['group', 'section'] as const) {
		test(`standard ${kind} action removes a completed comparison group and Undo restores it`, async () => {
			const test = setup(ChatSessionArchiveActionWording.MarkAsDone, true);
			await test.run(kind);
			const afterArchive = {
				groups: test.groupsService.getGroups().length,
				archived: test.comparisonService.getComparison('comparison')?.archivedAt !== undefined,
				message: test.state.message,
			};
			await test.state.undo();
			const comparison = test.comparisonService.getComparison('comparison')!;
			assert.deepStrictEqual({
				afterArchive,
				groups: test.groupsService.getGroups().map(group => group.name),
				membership: test.membership().map(([sessionId, groupId]) => [sessionId, groupId === comparison.groupId]),
				archived: comparison.archivedAt !== undefined,
			}, {
				afterArchive: { groups: 0, archived: true, message: '2 marked done' },
				groups: ['Group'],
				membership: [['first', true], ['second', true]],
				archived: false,
			});
		});
	}

	test('a partial comparison archive keeps its group and remains undoable', async () => {
		const test = setup(ChatSessionArchiveActionWording.MarkAsDone, true);
		test.state.failArchive = 'second';
		await assert.rejects(test.run('group'), /archive failed/);
		await test.state.undo();
		assert.deepStrictEqual({
			group: test.groupsService.getGroup(test.group.id)?.name,
			membership: test.membership(),
			archived: test.comparisonService.getComparison('comparison')?.archivedAt !== undefined,
		}, {
			group: 'Group', membership: [['first', test.group.id], ['second', test.group.id]], archived: false,
		});
	});

	test('marking every session done preserves a manually created group', async () => {
		const test = setup();
		await test.run('group');
		assert.deepStrictEqual({
			groups: test.groupsService.getGroups(),
			members: test.groupsService.getSessionIdsInGroup(test.group.id),
			archived: test.archived,
		}, {
			groups: [test.group],
			members: [],
			archived: ['first', 'second'],
		});
	});

	test('a group\'s Mark All as Done includes the sessions of its subgroups', async () => {
		const test = setup();
		await test.run('group', test.sessions.slice(0, 2).map(entry => entry.session), []);
		assert.deepStrictEqual({ archived: test.archived, message: test.state.message }, { archived: ['first', 'second'], message: '2 marked done' });
	});

	test('comparison cleanup does not delete an unrelated empty manual group', async () => {
		const test = setup(ChatSessionArchiveActionWording.MarkAsDone, true);
		const manualGroup = test.groupsService.createGroup('Manual group');
		await test.run('group');
		assert.deepStrictEqual(test.groupsService.getGroups(), [manualGroup]);
	});

	test('marking a comparison done includes participants outside the visible group rows', async () => {
		const test = setup(ChatSessionArchiveActionWording.MarkAsDone, true);
		await test.run('group', [test.sessions[0].session]);
		assert.deepStrictEqual({
			groups: test.groupsService.getGroups(),
			membership: test.membership(),
			archived: test.archived,
			comparisonArchived: test.comparisonService.getComparison('comparison')?.archivedAt !== undefined,
		}, {
			groups: [],
			membership: [],
			archived: ['first', 'second'],
			comparisonArchived: true,
		});
	});

	test('cannot mark a comparison done while its attempts are launching', async () => {
		const test = setup(ChatSessionArchiveActionWording.MarkAsDone, true);
		test.state.launching = true;
		await test.run('group');
		assert.deepStrictEqual({ archived: test.archived, notices: test.state.notices }, { archived: [], notices: 0 });
	});

	for (const independentlyRestored of [1, 2]) {
		for (const regrouped of [false, true]) {
			test(`comparison Undo preserves ${independentlyRestored} independently restored ${regrouped ? 'regrouped' : 'ungrouped'} sessions`, async () => {
				const test = setup(ChatSessionArchiveActionWording.MarkAsDone, true);
				await test.run('group');
				for (const entry of test.sessions.slice(0, independentlyRestored)) {
					await test.managementService.unarchiveSession(entry.session);
				}
				const manualGroup = regrouped ? test.groupsService.createGroup('Manual group', ['first']) : undefined;
				await test.state.undo();
				test.sessionsChanged.fire({ added: [], removed: [], changed: test.sessions.map(entry => entry.session) });
				const comparison = test.comparisonService.getComparison('comparison')!;
				assert.deepStrictEqual({
					comparisonRestored: comparison.archivedAt === undefined && !!test.groupsService.getGroup(comparison.groupId),
					membership: test.membership(),
					restored: test.restored,
				}, {
					comparisonRestored: true,
					membership: [
						...(manualGroup ? [['first', manualGroup.id]] : []),
						...(independentlyRestored === 1 ? [['second', comparison.groupId]] : []),
					],
					restored: ['first', 'second'],
				});
			});
		}
	}

	for (const kind of ['workspace', 'section', 'group'] as const) {
		test(`undo restores only newly archived sessions and their groups from a ${kind}`, async () => {
			const test = setup();
			await test.run(kind);
			const afterArchive = { message: test.state.message, membership: test.membership() };
			await test.state.undo();
			assert.deepStrictEqual({
				afterArchive,
				archived: test.archived,
				restored: test.restored,
				membership: test.membership(),
				isArchived: test.sessions.map(entry => entry.isArchived.get()),
			}, {
				afterArchive: { message: '2 marked done', membership: [] },
				archived: ['first', 'second'],
				restored: ['first', 'second'],
				membership: [['first', test.group.id], ['second', test.group.id]],
				isArchived: [false, false, true],
			});
		});
	}

	for (const kind of ['workspace', 'section', 'group', 'pinned'] as const) {
		for (const sorting of [SessionsSorting.Created, SessionsSorting.Updated]) {
			for (const manual of [false, true]) {
				test(`undo restores ${manual ? 'manual' : 'natural'} ${sorting} order and placement in a ${kind}`, async () => {
					const test = setup();
					const targets = test.sessions.slice(0, 2).map(entry => entry.session);
					const neighbor = createTestSession('neighbor');
					test.sessions.push(neighbor);
					if (kind === 'workspace' || kind === 'section') {
						for (const session of targets) {
							test.groupsService.removeFromGroup(session.sessionId);
						}
					} else if (kind === 'pinned') {
						for (const session of targets) {
							test.listModel.pinSession(session);
						}
						test.listModel.pinSession(neighbor.session);
					}
					if (manual) {
						test.listModel.applySortChanges(sorting, new Map([
							['second', Date.now() + 120_000],
							['first', Date.now() - 120_000],
						]), []);
					}

					const harness = createListHarness(store, test.managementService.getSessions(), instantiationService => {
						instantiationService.stub(IStorageService, test.storageService);
						instantiationService.stub(ISessionsManagementService, test.managementService);
						instantiationService.stub(ISessionGroupsService, test.groupsService);
						instantiationService.stub(ISessionsListModelService, test.listModel);
					});
					const container = harness.createContainer();
					const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
						grouping: () => kind === 'section' ? SessionsGrouping.Date : SessionsGrouping.Workspace,
						sorting: () => sorting,
						onSessionOpen: () => { },
					}));
					list.setExcludeArchived(true);
					list.update(true);
					list.layout(300, 400);
					if (kind === 'pinned') {
						[...container.querySelectorAll<HTMLElement>('.session-section-label')].find(label => label.textContent === 'Pinned')!.click();
					}
					const snapshot = () => list.getVisibleSessions().map(session => ({
						id: session.sessionId,
						group: list.getRenderedSessionGroup(session)?.id,
						pinned: test.listModel.isSessionPinned(session),
					}));
					const before = snapshot();
					assert.strictEqual(before.length, 3);
					await test.run(kind === 'pinned' ? 'section' : kind, targets);
					list.update(true);
					const archived = snapshot();
					await test.state.undo();
					list.update(true);

					assert.deepStrictEqual({ archived, restored: snapshot() }, {
						archived: [{ id: 'neighbor', group: undefined, pinned: kind === 'pinned' }],
						restored: before,
					});
				});
			}
		}
	}

	test('respects archive wording', async () => {
		const test = setup(ChatSessionArchiveActionWording.Archive);
		await test.run();
		assert.strictEqual(test.state.message, '2 archived');
	});

	test('does not notify or archive when confirmation is cancelled', async () => {
		const test = setup();
		test.state.confirmed = false;
		await test.run();
		assert.deepStrictEqual({ archived: test.archived, notices: test.state.notices }, { archived: [], notices: 0 });
	});

	test('partial archive failure reports the error and leaves successful sessions undoable', async () => {
		const test = setup();
		test.state.failArchive = 'second';
		await assert.rejects(test.run(), /archive failed/);
		await test.state.undo();
		assert.deepStrictEqual({ message: test.state.message, restored: test.restored }, { message: '1 marked done', restored: ['first'] });
	});

	test('undo can retry a partial restore failure without restoring successful sessions twice', async () => {
		const test = setup();
		await test.run();
		test.state.failRestore = 'second';
		await assert.rejects(test.state.undo(), /restore failed/);
		test.state.failRestore = '';
		await test.state.undo();
		assert.deepStrictEqual(test.restored, ['first', 'second']);
	});

	for (const failRestore of ['first', 'second']) {
		test(`comparison Undo retries after ${failRestore} fails and session state refreshes`, async () => {
			const test = setup(ChatSessionArchiveActionWording.MarkAsDone, true);
			await test.run('group');
			test.state.failRestore = failRestore;
			await assert.rejects(test.state.undo(), /restore failed/);
			const firstRestoredGroupId = test.comparisonService.getComparison('comparison')!.groupId;
			test.sessionsChanged.fire({ added: [], removed: [], changed: test.sessions.map(entry => entry.session) });
			test.state.failRestore = '';
			await test.state.undo();
			const comparison = test.comparisonService.getComparison('comparison')!;
			assert.deepStrictEqual({
				groups: test.groupsService.getGroups().map(group => group.id),
				restored: test.restored,
				membership: test.membership(),
				archived: comparison.archivedAt !== undefined,
				retainedGroup: firstRestoredGroupId === comparison.groupId,
			}, {
				groups: [comparison.groupId],
				restored: ['first', 'second'],
				membership: [['first', comparison.groupId], ['second', comparison.groupId]],
				archived: false,
				retainedGroup: failRestore === 'second',
			});
		});
	}

	test('undo does not recreate deleted groups or move independently restored sessions', async () => {
		const test = setup();
		await test.run();
		test.groupsService.deleteGroup(test.group.id);
		test.sessions[0].isArchived.set(false, undefined);
		const newGroup = test.groupsService.createGroup('New Group', ['first']);
		await test.state.undo();
		assert.deepStrictEqual({ restored: test.restored, membership: test.membership() }, { restored: ['second'], membership: [['first', newGroup.id]] });
	});

	test('undo skips sessions deleted after archiving', async () => {
		const test = setup();
		await test.run();
		test.sessions.splice(0, 1);
		await test.state.undo();
		assert.deepStrictEqual(test.restored, ['second']);
	});
});

suite('Sessions - Delete group undo', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('deleting a group with subgroups offers Undo, which restores the groups, their order, and their sessions', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const storageService = store.add(new InMemoryStorageService());
		const sessions = ['ship', 'fix', 'other'].map(id => createTestSession(id).session);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override readonly onDidArchiveSession = Event.None;
			override readonly onDidDeleteSession = Event.None;
			override readonly onWillSendRequest = Event.None;
			override readonly onDidReplaceSession = Event.None;
			override readonly onDidReplaceNewDraftSession = Event.None;
			override readonly onDidStartSession = Event.None;
			override readonly onDidDiscardNewSession = Event.None;
			override getSessions() { return sessions; }
			override getInFlightNewSessionRequests() { return []; }
		});
		const orderService = store.add(new SessionSectionOrderService(storageService));
		instantiationService.stub(ISessionSectionOrderService, orderService);
		const groupsService = store.add(instantiationService.createInstance(SessionGroupsService));
		instantiationService.stub(ISessionGroupsService, groupsService);
		const notices: ISessionsListNotice[] = [];
		const notification = new class extends mock<SessionsListNotification>() {
			override show(notice: ISessionsListNotice) { notices.push(notice); }
		};
		instantiationService.stub(IViewsService, new class extends mock<IViewsService>() {
			override getViewWithId<T>() { return upcastPartial<SessionsView>({ listNotification: notification }) as T; }
		});
		// Groups are newest first by default, so Other would come before Release, and Docs before Hotfixes.
		const release = groupsService.createGroup('Release', ['ship']);
		const hotfixes = groupsService.createGroup('Hotfixes', ['fix'], release.id);
		await timeout(1);
		const docs = groupsService.createGroup('Docs', [], release.id);
		await timeout(1);
		const lone = groupsService.createGroup('Lone');
		await timeout(1);
		const other = groupsService.createGroup('Other', ['other']);
		const topLevelIds = () => groupsService.getTree().getSubgroups(undefined).map(group => getSessionGroupSectionId(group.id));
		// The user moved Release above Other, and Hotfixes above Docs.
		orderService.reorder(topLevelIds(), getSessionGroupSectionId(release.id), getSessionGroupSectionId(other.id), 'before');
		groupsService.moveGroup(hotfixes.id, release.id, { siblingId: docs.id, position: 'before' });
		const deleteGroup = (groupId: string) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(DELETE_SESSION_GROUP_WITH_UNDO_COMMAND_ID)!.handler(accessor, groupId));
		const outline = (parentId?: string, indent = ''): string[] => groupsService.getTree().getSubgroups(parentId).flatMap(group => [`${indent}${group.name}`, ...outline(group.id, `${indent}  `)]);
		const describe = () => ({
			groups: outline(),
			membership: Object.fromEntries(sessions.map(session => [session.sessionId, groupsService.getGroup(groupsService.getGroupOfSession(session.sessionId) ?? '')?.name ?? null])),
		});

		deleteGroup(lone.id);
		const noticesForSingleGroup = notices.length;
		deleteGroup(release.id);
		// The sessions list drops the positions of deleted groups.
		orderService.retain(topLevelIds());
		const afterDelete = describe();
		await notices[0].undo();

		assert.deepStrictEqual({ noticesForSingleGroup, message: notices[0].message, afterDelete, restored: describe() }, {
			noticesForSingleGroup: 0,
			message: '3 groups deleted',
			afterDelete: { groups: ['Other'], membership: { ship: null, fix: null, other: 'Other' } },
			restored: {
				groups: ['Release', '  Hotfixes', '  Docs', 'Other'],
				membership: { ship: 'Release', fix: 'Hotfixes', other: 'Other' },
			},
		});
	}));
});
