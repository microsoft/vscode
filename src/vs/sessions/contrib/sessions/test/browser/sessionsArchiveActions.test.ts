/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfirmation, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionItemArchiveState } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getSessionGroupSectionId, ISessionGroupsService, SessionGroupsService } from '../../../../../workbench/contrib/sessions/browser/sessionGroupsService.js';
import { ISessionSectionOrderService, SessionSectionOrderService } from '../../../../../workbench/services/sessions/browser/sessionSectionOrderService.js';
import { ARCHIVE_SESSION_COMMAND_ID, DELETE_SESSION_GROUP_WITH_UNDO_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { SessionComparisonService } from '../../../../../workbench/contrib/sessions/browser/sessionComparisonService.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { ISessionsListModelService, SessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionsNavigationService } from '../../../../../workbench/contrib/sessions/browser/sessionsNavigationService.js';
import { ISessionAttentionService } from '../../../../../workbench/contrib/sessions/common/sessionAttentionService.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { SessionsList } from '../../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { ISessionGroupItem, ISessionSection, SessionsGrouping, SessionsSorting } from '../../../../../workbench/contrib/sessions/browser/views/sessionsListCommon.js';
import { ISessionsListChange, ISessionsListUndoService } from '../../../../../workbench/contrib/sessions/browser/sessionsListUndoService.js';
import { getSessionsArchiveActionConstructors } from '../../../../../workbench/contrib/sessions/browser/views/sessionsListActions.js';
import { createListHarness, createTestSession } from './sessionsListTestUtils.js';
import '../../browser/views/sessionsViewActions.js';

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
		const state = { failArchive: '', failRestore: '', confirmed: true, launching: false, notices: 0, message: '', undo: async () => { }, undos: [] as (() => Promise<void>)[], started: [] as string[], onStart: () => { }, gate: Promise.resolve() };
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm() { return { confirmed: state.confirmed }; }
		});
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		const managementService = new class extends mock<ISessionsManagementService>() {
			override readonly archivedSessionItems = constObservable<IChatSessionItemArchiveState>({ available: false, state: 'loaded' });
			override readonly onDidChangeSessions = sessionsChanged.event;
			override readonly onDidArchiveSession = sessionArchived.event;
			override readonly onDidDeleteSession = Event.None;
			override readonly onDidDeleteChat = Event.None;
			override readonly onWillSendRequest = Event.None;
			override readonly onDidReplaceSession = Event.None;
			override readonly onDidReplaceNewDraftSession = Event.None;
			override readonly onDidStartSession = Event.None;
			override readonly onDidDiscardNewSession = Event.None;
			override readonly onDidAcceptNewSessionRequest = Event.None;
			override readonly onDidEndNewSessionRequest = Event.None;
			override readonly onDidMoveChat = Event.None;
			override getSessions() { return sessions.map(entry => entry.session); }
			override getInFlightNewSessionRequests() { return []; }
			override getSession(resource: URI) {
				return sessions.find(entry => entry.session.resource.toString() === resource.toString())?.session;
			}
			override async archiveSession(session: ISession) {
				state.started.push(session.sessionId);
				state.onStart();
				await state.gate;
				if (session.sessionId === state.failArchive) {
					throw new Error('archive failed');
				}
				archived.push(session.sessionId);
				sessions.find(entry => entry.session === session)!.isArchived.set(true, undefined);
				sessionArchived.fire(session);
			}
			override archiveSessions(targets: readonly ISession[]) {
				return Promise.allSettled(targets.map(session => this.archiveSession(session)));
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
		instantiationService.stub(ISessionAttentionService, upcastPartial<ISessionAttentionService>({ sessionAttention: constObservable(new Map()) }));
		const listModel = store.add(instantiationService.createInstance(SessionsListModelService));
		const membership = () => sessions
			.filter(entry => groupsService.getGroupOfSession(entry.session.sessionId))
			.map(entry => [entry.session.sessionId, groupsService.getGroupOfSession(entry.session.sessionId)]);
		instantiationService.stub(ISessionsListUndoService, upcastPartial<ISessionsListUndoService>({
			offerUndo: change => {
				state.message = change.message(change.count);
				state.undo = () => change.undo();
				state.undos.push(state.undo);
				state.notices++;
				return true;
			},
		}));
		/** `ownSessions` are a group's own sessions, while `targets` also include those of its subgroups. */
		const run = async (kind: 'workspace' | 'section' | 'group' = 'workspace', targets = sessions.map(entry => entry.session), ownSessions = targets) => {
			const actionId = kind === 'group' ? 'sessionsView.markAllInGroupAsDone' : 'sessionsView.sectionArchive';
			const action = getSessionsArchiveActionConstructors(wording).map(ctor => new ctor()).find(action => action.desc.id === actionId)!;
			const context = kind === 'group'
				? upcastPartial<ISessionGroupItem>({
					group, sessions: ownSessions, subtreeSessions: targets,
					comparison: withComparison ? { id: 'comparison', title: group.name, launching: state.launching, summary: () => '', configuration: '' } : undefined,
				})
				: { id: kind === 'workspace' ? 'workspace:test' : 'today', label: 'Section', sessions: targets } satisfies ISessionSection;
			return instantiationService.invokeFunction(accessor => action.run(accessor, context));
		};
		return { run, instantiationService, sessions, sessionsChanged, membership, groupsService, group, comparisonService, listModel, managementService, storageService, archived, restored, state };
	}

	test('marking a single session done offers Undo, which restores it to its group', async () => {
		const test = setup();
		const action = getSessionsArchiveActionConstructors(ChatSessionArchiveActionWording.MarkAsDone).map(ctor => new ctor()).find(action => action.desc.id === ARCHIVE_SESSION_COMMAND_ID)!;
		await test.instantiationService.invokeFunction(accessor => action.run(accessor, test.sessions[0].session));
		const afterArchive = { message: test.state.message, membership: test.membership() };
		await test.state.undo();
		assert.deepStrictEqual({ afterArchive, restored: test.restored, membership: test.membership() }, {
			afterArchive: { message: '1 marked done', membership: [['second', test.group.id]] },
			restored: ['first'],
			membership: [['first', test.group.id], ['second', test.group.id]],
		});
	});

	test('undoing one by one, latest first, archives that ended a comparison returns every session to the comparison', async () => {
		const test = setup(ChatSessionArchiveActionWording.MarkAsDone, true);
		const action = getSessionsArchiveActionConstructors(ChatSessionArchiveActionWording.MarkAsDone).map(ctor => new ctor()).find(action => action.desc.id === ARCHIVE_SESSION_COMMAND_ID)!;
		for (const { session } of test.sessions.slice(0, 2)) {
			await test.instantiationService.invokeFunction(accessor => action.run(accessor, session));
		}
		const groupDeleted = !test.groupsService.getGroup(test.group.id);
		for (const undo of [...test.state.undos].reverse()) {
			await undo();
		}
		const comparison = test.comparisonService.getComparison('comparison')!;
		assert.deepStrictEqual({ groupDeleted, archived: comparison.archivedAt !== undefined, membership: test.membership() }, {
			groupDeleted: true,
			archived: false,
			membership: [['first', comparison.groupId], ['second', comparison.groupId]],
		});
	});

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
						instantiationService.stub(IConfigurationService, new TestConfigurationService());
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

	test('archives a batch without waiting for each session in turn', async () => {
		const test = setup();
		const gate = new DeferredPromise<void>();
		const firstStarted = new DeferredPromise<void>();
		test.state.gate = gate.p;
		test.state.onStart = () => firstStarted.complete();
		const run = test.run();
		await firstStarted.p;
		const startedBeforeCompletion = [...test.state.started];
		gate.complete();
		await run;
		assert.deepStrictEqual({ startedBeforeCompletion, archived: test.archived, message: test.state.message }, { startedBeforeCompletion: ['first', 'second'], archived: ['first', 'second'], message: '2 marked done' });
	});

	test('a failed archive does not stop the rest of the batch', async () => {
		const test = setup();
		test.state.failArchive = 'first';
		await assert.rejects(test.run(), /archive failed/);
		await test.state.undo();
		assert.deepStrictEqual({ message: test.state.message, restored: test.restored }, { message: '1 marked done', restored: ['second'] });
	});

	test('a lone cancellation remains identifiable and successful archives stay undoable', async () => {
		const harness = setup();
		const cancellation = new CancellationError();
		const archiveSession = harness.managementService.archiveSession;
		harness.managementService.archiveSession = async session => {
			if (session.sessionId === 'second') {
				throw cancellation;
			}
			await archiveSession(session);
		};

		const error = await harness.run().catch(error => {
			if (!(error instanceof Error)) {
				throw error;
			}
			return error;
		});
		await harness.state.undo();

		assert.deepStrictEqual({
			isCancellation: isCancellationError(error),
			sameError: error === cancellation,
			message: harness.state.message,
			restored: harness.restored,
		}, {
			isCancellation: true, sameError: true,
			message: '1 marked done', restored: ['first'],
		});
	});

	test('multiple archive failures retain their causes with a concise summary', async () => {
		const harness = setup();
		const failure = new Error('archive failed');
		harness.managementService.archiveSession = async () => { throw failure; };

		const error = await harness.run().then(() => assert.fail('Expected archive failures'), error => {
			if (!(error instanceof AggregateError)) {
				throw error;
			}
			return error;
		});

		assert.deepStrictEqual({
			name: error.name,
			message: error.message,
			causes: error.errors,
			notices: harness.state.notices,
		}, {
			name: 'AggregateError',
			message: 'archive failed (2 errors in total)',
			causes: [failure, failure],
			notices: 0,
		});
	});

	test('a failed archive waits for a later success before reporting and offering Undo', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const harness = setup(ChatSessionArchiveActionWording.MarkAsDone, true);
		harness.state.failArchive = 'first';
		const archiveSession = harness.managementService.archiveSession;
		harness.managementService.archiveSession = async session => {
			if (session.sessionId === 'second') {
				await timeout(10);
			}
			await archiveSession(session);
		};

		await assert.rejects(harness.run('group'), /archive failed/);
		const afterArchive = { archived: [...harness.archived], message: harness.state.message, notices: harness.state.notices };
		await harness.state.undo();

		assert.deepStrictEqual({ afterArchive, restored: harness.restored, group: harness.groupsService.getGroup(harness.group.id)?.name }, {
			afterArchive: { archived: ['second'], message: '1 marked done', notices: 1 },
			restored: ['second'],
			group: 'Group',
		});
	}));

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

	test('Undo of deleting a comparison\'s group restores the comparison with its sessions', async () => {
		const test = setup(ChatSessionArchiveActionWording.MarkAsDone, true);
		const isArchived = () => test.comparisonService.getComparison('comparison')?.archivedAt !== undefined;
		await test.instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(DELETE_SESSION_GROUP_WITH_UNDO_COMMAND_ID)!.handler(accessor, test.group.id));
		const deleted = { message: test.state.message, archived: isArchived(), membership: test.membership() };
		await test.state.undo();
		assert.deepStrictEqual({ deleted, restored: { archived: isArchived(), membership: test.membership() } }, {
			deleted: { message: 'Group deleted', archived: true, membership: [] },
			restored: { archived: false, membership: [['first', test.group.id], ['second', test.group.id]] },
		});
	});
});

suite('Sessions - Delete group undo', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('deleting a group with subgroups offers Undo, which restores the groups, their order, and their sessions', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const storageService = store.add(new InMemoryStorageService());
		const sessions = ['ship', 'fix', 'other'].map(id => createTestSession(id).session);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override readonly onDidArchiveSession = Event.None;
			override readonly onDidDeleteSession = Event.None;
			override readonly onWillSendRequest = Event.None;
			override readonly onDidReplaceSession = Event.None;
			override readonly onDidReplaceNewDraftSession = Event.None;
			override readonly onDidStartSession = Event.None;
			override readonly onDidDiscardNewSession = Event.None;
			override readonly onDidAcceptNewSessionRequest = Event.None;
			override readonly onDidEndNewSessionRequest = Event.None;
			override readonly onDidMoveChat = Event.None;
			override getSessions() { return sessions; }
			override getInFlightNewSessionRequests() { return []; }
		});
		const orderService = store.add(new SessionSectionOrderService(storageService));
		instantiationService.stub(ISessionSectionOrderService, orderService);
		const groupsService = store.add(instantiationService.createInstance(SessionGroupsService));
		instantiationService.stub(ISessionGroupsService, groupsService);
		instantiationService.stub(ISessionComparisonService, upcastPartial<ISessionComparisonService>({ comparisons: constObservable([]) }));
		const notices: ISessionsListChange[] = [];
		instantiationService.stub(ISessionsListUndoService, upcastPartial<ISessionsListUndoService>({ offerUndo: change => { notices.push(change); return true; } }));
		const message = (change: ISessionsListChange | undefined) => change?.message(change.count);
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
		const singleGroupNotice = message(notices.pop());
		const sectionParent = groupsService.createGroup('Section parent');
		groupsService.moveSection('environment:local', sectionParent.id);
		deleteGroup(sectionParent.id);
		const sectionNotice = notices.pop()!;
		const releasedSection = groupsService.getGroupOfSection('environment:local');
		await sectionNotice.undo();
		const restoredSection = groupsService.getGroupOfSection('environment:local');
		deleteGroup(sectionParent.id);
		notices.pop();
		deleteGroup(release.id);
		// The sessions list drops the positions of deleted groups.
		orderService.retain(topLevelIds());
		const afterDelete = describe();
		await notices[0].undo();

		assert.deepStrictEqual({
			singleGroupNotice,
			sectionUndo: { message: message(sectionNotice), releasedSection, restoredSection },
			message: message(notices[0]),
			afterDelete,
			restored: describe(),
		}, {
			singleGroupNotice: 'Group deleted',
			sectionUndo: { message: 'Group deleted', releasedSection: undefined, restoredSection: sectionParent.id },
			message: '3 groups deleted',
			afterDelete: { groups: ['Other'], membership: { ship: null, fix: null, other: 'Other' } },
			restored: {
				groups: ['Release', '  Hotfixes', '  Docs', 'Other'],
				membership: { ship: 'Release', fix: 'Hotfixes', other: 'Other' },
			},
		});
	}));
});

suite('Sessions - Delete session undo', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('deleting sessions hides and closes them, and deletes them only once Undo is no longer offered', async () => {
		// Distinct creation times, newest first, keep the list's order from depending on how fast the sessions are created.
		const now = Date.now();
		const sessions = ['one', 'two', 'three'].map((id, index) => {
			const entry = createTestSession(id, { createdAt: new Date(now - index * 60_000) });
			entry.capabilities.set({ supportsMultipleChats: false, supportsDelete: true }, undefined);
			return entry.session;
		});
		const harness = createListHarness(store, [...sessions]);
		const deleted: string[] = [];
		harness.managementService.deleteSessions = async targets => {
			deleted.push(...targets.map(session => session.sessionId));
			harness.managementService.sessions = harness.managementService.sessions.filter(session => !targets.includes(session));
		};
		const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, harness.createContainer(), {
			grouping: () => SessionsGrouping.Workspace,
			sorting: () => SessionsSorting.Created,
			onSessionOpen: () => { },
		}));
		list.layout(300, 400);
		const confirmations: IConfirmation[] = [];
		const closed: string[] = [];
		const notices: ISessionsListChange[] = [];
		harness.instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm(confirmation: IConfirmation) {
				confirmations.push(confirmation);
				return { confirmed: true };
			}
		});
		harness.instantiationService.stub(ISessionsNavigationService, upcastPartial<ISessionsNavigationService>({
			closeSession: async session => { closed.push(session.sessionId); },
		}));
		harness.instantiationService.stub(ISessionsListUndoService, upcastPartial<ISessionsListUndoService>({ canOfferUndo: () => true, offerUndo: change => { notices.push(change); return true; } }));
		const deleteSessions = (targets: ISession[]) => harness.instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('sessionsViewPane.deleteSession')!.handler(accessor, targets));
		const visible = () => {
			list.refresh();
			return list.getVisibleSessions().map(session => session.sessionId);
		};

		await deleteSessions(sessions.slice(0, 2));
		const pending = { visible: visible(), closed: [...closed], deleted: [...deleted], message: notices[0].message(notices[0].count), kind: notices[0].kind, detail: confirmations[0].detail };
		await notices[0].undo();
		const undone = { visible: visible(), deleted: [...deleted] };
		await deleteSessions(sessions.slice(2));
		await notices[1].commit!();

		assert.deepStrictEqual({ pending, undone, committed: { visible: visible(), deleted } }, {
			pending: { visible: ['three'], closed: ['one', 'two'], deleted: [], message: '2 deleted', kind: 'deleteSessions', detail: undefined },
			undone: { visible: ['one', 'two', 'three'], deleted: [] },
			committed: { visible: ['one', 'two'], deleted: ['three'] },
		});
	});

	test('without Undo, such as in the web or without a visible Sessions view, deleting says it can\'t be undone and deletes right away', async () => {
		const sessions = ['one', 'two'].map(id => {
			const entry = createTestSession(id);
			entry.capabilities.set({ supportsMultipleChats: false, supportsDelete: true }, undefined);
			return entry.session;
		});
		// The harness's Undo service has no Sessions view to offer Undo in.
		const harness = createListHarness(store, [...sessions]);
		const deleted: string[] = [];
		harness.managementService.deleteSessions = async targets => { deleted.push(...targets.map(session => session.sessionId)); };
		const confirmations: IConfirmation[] = [];
		harness.instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm(confirmation: IConfirmation) {
				confirmations.push(confirmation);
				return { confirmed: true };
			}
		});
		const closed: string[] = [];
		harness.instantiationService.stub(ISessionsNavigationService, upcastPartial<ISessionsNavigationService>({
			closeSession: async session => { closed.push(session.sessionId); },
		}));

		await harness.instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('sessionsViewPane.deleteSession')!.handler(accessor, sessions));

		assert.deepStrictEqual({ detail: confirmations[0].detail, deleted, closed }, { detail: 'This action cannot be undone.', deleted: ['one', 'two'], closed: [] });
	});
});