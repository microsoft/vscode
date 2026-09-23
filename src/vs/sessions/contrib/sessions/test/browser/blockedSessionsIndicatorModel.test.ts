/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AgentSessionApprovalKind, AgentSessionApprovalModel, agentSessionApprovalId, IAgentSessionApprovalInfo } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { IChat, ISession, SessionRemoteConnectionStatus, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { BlockedSessionReason, BlockedSessions, IBlockedSession } from '../../../blockedSessions/browser/blockedSessions.js';
import { BlockedSessionsCIFixModel } from '../../browser/blockedSessionsCIFixModel.js';
import { BlockedSessionsIndicatorModel, RequiresInputKind } from '../../browser/blockedSessionsIndicatorModel.js';

suite('BlockedSessionsIndicatorModel', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const storageKey = 'sessions.blockedIndicator.ignoredOccurrences';

	function createModel(options?: { quality?: string; storageService?: InMemoryStorageService; logService?: NullLogService }) {
		const storageService = options?.storageService ?? store.add(new InMemoryStorageService());
		const sessionsManagementService = new TestSessionsManagementService(store.add(new Emitter<ISessionsChangeEvent>()));
		const blockedModel = new TestBlockedSessions(sessionsManagementService);
		const approvalModel = new TestApprovalModel();
		const ciFixModel = new TestCIFixModel();
		const sessionsService = new TestSessionsService();
		const productService = { quality: options?.quality ?? 'insider' } as unknown as IProductService;
		const instantiationService = new class extends mock<IInstantiationService>() { }();
		const model = store.add(new BlockedSessionsIndicatorModel(
			approvalModel as unknown as AgentSessionApprovalModel,
			blockedModel as unknown as BlockedSessions,
			ciFixModel as unknown as BlockedSessionsCIFixModel,
			sessionsService as unknown as ISessionsService,
			instantiationService,
			productService,
			options?.logService ?? new NullLogService(),
			storageService,
			sessionsManagementService,
		));
		// Keep the derived live so it recomputes on visibility/dismissal changes.
		store.add(autorun(reader => { model.blockedSessions.read(reader); }));
		return { model, blockedModel, approvalModel, ciFixModel, sessionsService, storageService, sessionsManagementService };
	}

	function blockedIds(model: BlockedSessionsIndicatorModel): string[] {
		return model.blockedSessions.get().map(entry => entry.session.sessionId);
	}

	test('excludes visible sessions from the blocked set', () => {
		const { model, blockedModel, sessionsService } = createModel();
		const s1 = new TestSession('s1');
		const s2 = new TestSession('s2');
		blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
		sessionsService.setVisible([s1]);
		assert.deepStrictEqual(blockedIds(model), ['s2']);
	});

	test('excludes sessions whose CI fix is being submitted', () => {
		const { model, blockedModel, ciFixModel } = createModel();
		const s1 = new TestSession('s1');
		const s2 = new TestSession('s2');
		blockedModel.setBlocked([failingCI(s1), failingCI(s2)]);
		assert.deepStrictEqual(blockedIds(model), ['s1', 's2']);
		ciFixModel.setHidden(['s1']);
		assert.deepStrictEqual(blockedIds(model), ['s2']);
	});

	test('blinks when a new, not-yet-visible session becomes blocked', () => {
		const { model, blockedModel } = createModel();
		blockedModel.setBlocked([needsInput(new TestSession('s1'))]);
		assert.strictEqual(model.consumePendingBlink(), true);
	});

	test('does not blink when a new block is already visible', () => {
		const { model, blockedModel, sessionsService } = createModel();
		const s1 = new TestSession('s1');
		sessionsService.setVisible([s1]);
		blockedModel.setBlocked([needsInput(s1)]);
		assert.strictEqual(model.consumePendingBlink(), false);
	});

	test('acknowledges a blocked session when it becomes visible', () => {
		const { model, blockedModel, sessionsService } = createModel();
		const s1 = new TestSession('s1');
		blockedModel.setBlocked([needsInput(s1)]);
		assert.strictEqual(model.consumePendingBlink(), true);

		sessionsService.setVisible([s1]);
		assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });

		sessionsService.setVisible([]);
		assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });
	});

	test('keeps an approval acknowledged when its chat model reloads', () => {
		const { model, blockedModel, approvalModel, sessionsService } = createModel();
		const s1 = new TestSession('s1');
		approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, new Date(1000), 'tool-call-1'));
		blockedModel.setBlocked([needsInput(s1)]);
		sessionsService.setVisible([s1]);
		sessionsService.setVisible([]);

		approvalModel.setApproval(s1.resource, undefined);
		approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, new Date(2000), 'tool-call-1'));
		const afterReload = blockedIds(model);
		approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, new Date(3000), 'tool-call-2'));

		assert.deepStrictEqual({ afterReload, afterNewApproval: blockedIds(model) }, { afterReload: [], afterNewApproval: ['s1'] });
	});

	test('blinks again when an additional, not-yet-visible session becomes blocked', () => {
		const { model, blockedModel } = createModel();
		const s1 = new TestSession('s1');
		const s2 = new TestSession('s2');
		blockedModel.setBlocked([needsInput(s1)]);
		assert.strictEqual(model.consumePendingBlink(), true);
		blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
		assert.strictEqual(model.consumePendingBlink(), true);
	});

	test('does not blink when a queued block becomes visible before the blink plays', () => {
		// Simulates a blink queued while the pill is suppressed (e.g. the transient
		// "Approved N sessions" state): if the session becomes visible before the pill
		// shows, the queued blink must not fire on the later render.
		const { model, blockedModel, sessionsService } = createModel();
		const s1 = new TestSession('s1');
		blockedModel.setBlocked([needsInput(s1)]);
		// Blink is queued but NOT consumed yet (pill suppressed); the session then
		// becomes visible before the pill renders.
		sessionsService.setVisible([s1]);
		assert.strictEqual(model.consumePendingBlink(), false);
	});

	test('does not blink when a queued block becomes visible then remains acknowledged', () => {
		const { model, blockedModel, sessionsService } = createModel();
		const s1 = new TestSession('s1');
		blockedModel.setBlocked([needsInput(s1)]);
		sessionsService.setVisible([s1]);
		sessionsService.setVisible([]);
		assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });
	});

	test('does not blink when a queued block unblocks before the blink plays', () => {
		const { model, blockedModel } = createModel();
		const s1 = new TestSession('s1');
		blockedModel.setBlocked([needsInput(s1)]);
		// The session stops being blocked before the queued blink is consumed.
		blockedModel.setBlocked([]);
		assert.strictEqual(model.consumePendingBlink(), false);
	});

	test('consumePendingBlink clears the pending blink', () => {
		const { model, blockedModel } = createModel();
		blockedModel.setBlocked([needsInput(new TestSession('s1'))]);
		assert.deepStrictEqual([model.consumePendingBlink(), model.consumePendingBlink()], [true, false]);
	});

	test('reports a homogeneous requires-input kind', () => {
		const { model, blockedModel, approvalModel } = createModel();
		const s1 = new TestSession('s1');
		const s2 = new TestSession('s2');
		approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal));
		approvalModel.setApproval(s2.resource, approval(AgentSessionApprovalKind.Terminal));
		blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
		assert.strictEqual(model.requiresInputKind.get(), RequiresInputKind.TerminalApproval);
	});

	test('reports no kind for a mix of reasons', () => {
		const { model, blockedModel, approvalModel } = createModel();
		const s1 = new TestSession('s1');
		const s2 = new TestSession('s2');
		approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal));
		approvalModel.setApproval(s2.resource, approval(AgentSessionApprovalKind.Question));
		blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
		assert.strictEqual(model.requiresInputKind.get(), undefined);
	});

	test('classifies failing-CI reason', () => {
		const { model, blockedModel } = createModel();
		const ci = new TestSession('ci');
		blockedModel.setBlocked([failingCI(ci)]);
		assert.strictEqual(model.requiresInputKind.get(), RequiresInputKind.FailingCI);
	});

	test('builds the requires-input label per kind and count', () => {
		const { model } = createModel();
		assert.deepStrictEqual({
			terminalOne: model.getRequiresInputLabel(1, RequiresInputKind.TerminalApproval),
			terminalMany: model.getRequiresInputLabel(3, RequiresInputKind.TerminalApproval),
			questionOne: model.getRequiresInputLabel(1, RequiresInputKind.Question),
			failingCIMany: model.getRequiresInputLabel(2, RequiresInputKind.FailingCI),
			genericOne: model.getRequiresInputLabel(1, undefined),
			genericMany: model.getRequiresInputLabel(4, undefined),
		}, {
			terminalOne: '1 session requires terminal approval',
			terminalMany: '3 sessions require terminal approval',
			questionOne: '1 session has a question',
			failingCIMany: '2 sessions are failing CI',
			genericOne: '1 session requires input',
			genericMany: '4 sessions require input',
		});
	});

	test('dismissing an approval hides the session until a distinct approval appears', () => {
		const { model, blockedModel, approvalModel } = createModel();
		const s1 = new TestSession('s1');
		const first = approval(AgentSessionApprovalKind.Terminal, new Date(1000));
		approvalModel.setApproval(s1.resource, first);
		blockedModel.setBlocked([needsInput(s1)]);
		assert.deepStrictEqual(blockedIds(model), ['s1']);

		// The user allows the pending approval — the session drops out immediately.
		model.dismissApproval({ session: s1 as unknown as ISession, approvalId: agentSessionApprovalId(first) });
		assert.deepStrictEqual(blockedIds(model), []);

		// A new, distinct approval re-surfaces the session.
		approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, new Date(2000)));
		assert.deepStrictEqual(blockedIds(model), ['s1']);
	});

	test('ignores the current input-needed occurrence until the session blocks again', () => {
		const { model, blockedModel } = createModel();
		const s1 = new TestSession('s1');
		blockedModel.setBlocked([needsInput(s1)]);
		model.ignoreSession(s1 as unknown as ISession);
		assert.deepStrictEqual(blockedIds(model), []);

		blockedModel.setBlocked([]);
		blockedModel.setBlocked([needsInput(s1)]);
		assert.deepStrictEqual(blockedIds(model), ['s1']);
	});

	test('ignores only the current CI failure occurrence', () => {
		const { model, blockedModel } = createModel();
		const s1 = new TestSession('s1');
		blockedModel.setBlocked([failingCI(s1, 'sha1')]);
		model.ignoreSession(s1 as unknown as ISession);
		assert.deepStrictEqual(blockedIds(model), []);

		blockedModel.setBlocked([failingCI(s1, 'sha2')]);
		assert.deepStrictEqual(blockedIds(model), ['s1']);
	});

	test('keeps an ignored CI failure ignored when the session drops out of the blocked set', () => {
		// The raw blocked set drops a session whenever its pull request / CI data is
		// momentarily unavailable (e.g. while those models reload). Nothing changed
		// about the failure, so the acknowledgement must survive that gap.
		const { model, blockedModel } = createModel();
		const s1 = new TestSession('s1');
		blockedModel.setBlocked([failingCI(s1, 'sha1')]);
		model.ignoreSession(s1 as unknown as ISession);

		blockedModel.setBlocked([]);
		blockedModel.setBlocked([failingCI(s1, 'sha1')]);

		assert.deepStrictEqual(blockedIds(model), []);
	});

	test('ignores all currently surfaced blocked sessions', () => {
		const { model, blockedModel } = createModel();
		const input = new TestSession('input');
		const ci = new TestSession('ci');
		blockedModel.setBlocked([needsInput(input), failingCI(ci, 'sha1')]);
		model.ignoreAllSessions();
		const ignored = blockedIds(model);

		blockedModel.setBlocked([]);
		blockedModel.setBlocked([needsInput(input), failingCI(ci, 'sha2')]);

		assert.deepStrictEqual({ ignored, afterNewOccurrences: blockedIds(model) }, { ignored: [], afterNewOccurrences: ['input', 'ci'] });
	});

	test('restores ignored occurrences before sessions and approvals finish loading', () => {
		const first = createModel();
		const input = new TestSession('input');
		const ci = new TestSession('ci');
		first.approvalModel.setApproval(input.resource, approval(AgentSessionApprovalKind.Terminal, new Date(1000), 'tool-call-1'));
		first.blockedModel.setBlocked([needsInput(input), failingCI(ci, 'sha1')]);
		first.model.ignoreAllSessions();
		first.model.dispose();

		const restored = createModel({ storageService: first.storageService });
		const storedWhileLoading = restored.storageService.getObject(storageKey, StorageScope.PROFILE);
		restored.sessionsManagementService.setSessions([input, ci]);
		restored.blockedModel.setBlocked([needsInput(input), failingCI(ci, 'sha1')]);
		const beforeApproval = blockedIds(restored.model);
		restored.approvalModel.setApproval(input.resource, approval(AgentSessionApprovalKind.Terminal, new Date(2000), 'tool-call-1'));
		const afterApproval = { blocked: blockedIds(restored.model), blink: restored.model.consumePendingBlink() };
		restored.approvalModel.setApproval(input.resource, approval(AgentSessionApprovalKind.Terminal, new Date(3000), 'tool-call-2'));
		restored.blockedModel.setBlocked([needsInput(input), failingCI(ci, 'sha2')]);

		assert.deepStrictEqual({
			storedWhileLoading,
			beforeApproval,
			afterApproval,
			newOccurrences: blockedIds(restored.model),
			storedAfterNewOccurrences: restored.storageService.get(storageKey, StorageScope.PROFILE),
		}, {
			storedWhileLoading: [
				['input', { occurrenceId: 'needsInput:approval:tool-call-1', reason: BlockedSessionReason.NeedsInput }],
				['ci', { occurrenceId: 'failingCI:sha1', reason: BlockedSessionReason.FailingCI }],
			],
			beforeApproval: [],
			afterApproval: { blocked: [], blink: false },
			newOccurrences: ['input', 'ci'],
			storedAfterNewOccurrences: undefined,
		});
	});

	for (const acknowledge of ['ignore', 'view', 'approve'] as const) {
		test(`persists ${acknowledge} acknowledgements across reload`, () => {
			const first = createModel();
			const session = new TestSession('input');
			const pendingApproval = approval(AgentSessionApprovalKind.Terminal, new Date(1000), 'tool-call');
			first.approvalModel.setApproval(session.resource, pendingApproval);
			first.blockedModel.setBlocked([needsInput(session)]);
			switch (acknowledge) {
				case 'ignore':
					first.model.ignoreSession(session);
					break;
				case 'view':
					first.sessionsService.setVisible([session]);
					first.sessionsService.setVisible([]);
					break;
				case 'approve':
					first.model.dismissApproval({ session, approvalId: agentSessionApprovalId(pendingApproval) });
					break;
			}
			first.model.dispose();
			const restored = createModel({ storageService: first.storageService });
			restored.blockedModel.setBlocked([needsInput(session)]);
			restored.approvalModel.setApproval(session.resource, pendingApproval);

			assert.deepStrictEqual({ blocked: blockedIds(restored.model), blink: restored.model.consumePendingBlink() }, { blocked: [], blink: false });
		});
	}

	test('keeps restored input ignores while a provider is temporarily absent', () => {
		const first = createModel();
		const session = new TestSession('input');
		first.blockedModel.setBlocked([needsInput(session)]);
		first.model.ignoreSession(session);
		first.model.dispose();
		const restored = createModel({ storageService: first.storageService });
		restored.blockedModel.setBlocked([needsInput(session)]);
		transaction(tx => {
			restored.sessionsManagementService.setSessions([]);
			restored.blockedModel.blockedSessionsWithReasons.set([], tx);
			restored.blockedModel.blockedSessions.set([], tx);
		});
		restored.blockedModel.setBlocked([needsInput(session)]);
		const afterReconnect = blockedIds(restored.model);
		restored.blockedModel.setBlocked([]);
		restored.blockedModel.setBlocked([needsInput(session)]);

		assert.deepStrictEqual({ afterReconnect, afterNewInput: blockedIds(restored.model) }, { afterReconnect: [], afterNewInput: ['input'] });
	});

	for (const initialStatus of [SessionStatus.Completed, SessionStatus.Error]) {
		test(`retains restored input acknowledgements while a fresh facade initially reports ${initialStatus}`, () => {
			const first = createModel();
			const input = new TestSession('input');
			first.blockedModel.setBlocked([needsInput(input)]);
			first.model.ignoreSession(input);
			first.model.dispose();

			const restored = createModel({ storageService: first.storageService });
			const cached = new TestSession('input');
			cached.status.set(initialStatus, undefined);
			restored.sessionsManagementService.setSessions([cached]);
			const beforeHydration = restored.storageService.getObject(storageKey, StorageScope.PROFILE);
			restored.blockedModel.setBlocked([needsInput(cached)]);
			const afterHydration = blockedIds(restored.model);
			restored.blockedModel.setBlocked([]);
			restored.blockedModel.setBlocked([needsInput(cached)]);

			assert.deepStrictEqual({ beforeHydration, afterHydration, afterNewInput: blockedIds(restored.model) }, {
				beforeHydration: [['input', { occurrenceId: 'needsInput', reason: BlockedSessionReason.NeedsInput }]],
				afterHydration: [],
				afterNewInput: ['input'],
			});
		});
	}

	for (const replaceFacade of [false, true]) {
		test(`retains input acknowledgements across disconnect with a ${replaceFacade ? 'replacement' : 'reused'} facade`, () => {
			const { model, blockedModel, sessionsManagementService, storageService } = createModel();
			const input = new TestSession('input');
			blockedModel.setBlocked([needsInput(input)]);
			model.ignoreSession(input);

			const reconnecting = replaceFacade ? new TestSession('input') : input;
			transaction(tx => {
				reconnecting.remoteConnectionStatus.set({ kind: 'reconnecting' }, tx);
				reconnecting.status.set(SessionStatus.Error, tx);
				sessionsManagementService.setSessions([reconnecting]);
				blockedModel.blockedSessionsWithReasons.set([], tx);
				blockedModel.blockedSessions.set([], tx);
			});
			const whileDisconnected = storageService.getObject(storageKey, StorageScope.PROFILE);
			transaction(tx => {
				reconnecting.status.set(SessionStatus.Completed, tx);
				reconnecting.remoteConnectionStatus.set({ kind: 'connected' }, tx);
			});
			blockedModel.setBlocked([needsInput(reconnecting)]);

			assert.deepStrictEqual({ whileDisconnected, afterReconnect: blockedIds(model), blink: model.consumePendingBlink() }, {
				whileDisconnected: [['input', { occurrenceId: 'needsInput', reason: BlockedSessionReason.NeedsInput }]],
				afterReconnect: [],
				blink: false,
			});
		});
	}

	test('reconciles interleaved window acknowledgements, new occurrences, and archive removals', () => {
		const first = createModel();
		const second = createModel({ storageService: first.storageService });
		const sessions = ['a', 'b', 'c'].map(id => new TestSession(id));
		first.blockedModel.setBlocked(sessions.map(session => failingCI(session)));
		second.blockedModel.setBlocked(sessions.map(session => failingCI(session)));

		first.model.ignoreSession(sessions[0]);
		second.model.ignoreSession(sessions[1]);
		first.model.ignoreSession(sessions[2]);
		const afterIgnores = [blockedIds(first.model), blockedIds(second.model)];
		transaction(() => {
			first.blockedModel.setBlocked([failingCI(sessions[0], 'new-sha'), failingCI(sessions[1]), failingCI(sessions[2])]);
			second.blockedModel.setBlocked([failingCI(sessions[0], 'new-sha'), failingCI(sessions[1]), failingCI(sessions[2])]);
		});
		second.model.ignoreSession(sessions[0]);
		sessions[1].isArchived.set(true, undefined);

		assert.deepStrictEqual({ afterIgnores, stored: first.storageService.getObject(storageKey, StorageScope.PROFILE) }, {
			afterIgnores: [[], []],
			stored: [
				['c', { occurrenceId: 'failingCI:sha', reason: BlockedSessionReason.FailingCI }],
				['a', { occurrenceId: 'failingCI:new-sha', reason: BlockedSessionReason.FailingCI }],
			],
		});
	});

	test('does not write external storage updates back or resurrect removed acknowledgements', () => {
		const { model, blockedModel, storageService } = createModel();
		const sessions = ['a', 'b', 'c'].map(id => new TestSession(id));
		blockedModel.setBlocked(sessions.map(session => failingCI(session)));
		model.ignoreSession(sessions[0]);
		let changes = 0;
		const listenerStore = store.add(new DisposableStore());
		listenerStore.add(storageService.onDidChangeValue(StorageScope.PROFILE, storageKey, listenerStore)(() => changes++));
		storageService.storeAll([{
			key: storageKey,
			value: JSON.stringify([['b', { occurrenceId: 'failingCI:sha', reason: BlockedSessionReason.FailingCI }]]),
			scope: StorageScope.PROFILE,
			target: StorageTarget.MACHINE,
		}], true);
		const afterExternalUpdate = { blocked: blockedIds(model), changes };
		model.ignoreSession(sessions[2]);

		assert.deepStrictEqual({ afterExternalUpdate, stored: storageService.getObject(storageKey, StorageScope.PROFILE) }, {
			afterExternalUpdate: { blocked: ['a', 'c'], changes: 1 },
			stored: [
				['b', { occurrenceId: 'failingCI:sha', reason: BlockedSessionReason.FailingCI }],
				['c', { occurrenceId: 'failingCI:sha', reason: BlockedSessionReason.FailingCI }],
			],
		});
	});

	for (const hasSavedIgnores of [false, true]) {
		test(`replaces acknowledgements on a profile storage switch ${hasSavedIgnores ? 'with' : 'without'} saved ignores`, () => {
			const { model, blockedModel, storageService } = createModel();
			const sessions = Array.from({ length: 52 }, (_, i) => new TestSession(`ci-${i}`));
			blockedModel.setBlocked(sessions.map(session => failingCI(session)));
			for (const session of sessions.slice(0, 51)) {
				model.ignoreSession(session);
			}
			const saved = [['ci-51', { occurrenceId: 'failingCI:sha', reason: BlockedSessionReason.FailingCI }]];
			storageService.storeAll([{
				key: storageKey,
				value: hasSavedIgnores ? JSON.stringify(saved) : undefined,
				scope: StorageScope.PROFILE,
				target: StorageTarget.MACHINE,
			}], true);
			const afterSwitch = blockedIds(model);
			model.ignoreSession(sessions[0]);

			assert.deepStrictEqual({ afterSwitch, stored: storageService.getObject(storageKey, StorageScope.PROFILE) }, {
				afterSwitch: sessions.slice(0, hasSavedIgnores ? 51 : 52).map(session => session.sessionId),
				stored: [
					...(hasSavedIgnores ? saved : []),
					['ci-0', { occurrenceId: 'failingCI:sha', reason: BlockedSessionReason.FailingCI }],
				],
			});
		});
	}

	for (const archiveBeforeReload of [false, true]) {
		test(`removes archived sessions from storage ${archiveBeforeReload ? 'during restoration' : 'when archived'}`, () => {
			const first = createModel();
			const input = new TestSession('input');
			const ci = new TestSession('ci');
			const retained = new TestSession('retained');
			first.blockedModel.setBlocked([needsInput(input), failingCI(ci), failingCI(retained)]);
			first.model.ignoreAllSessions();
			first.model.dispose();
			if (archiveBeforeReload) {
				input.isArchived.set(true, undefined);
				ci.isArchived.set(true, undefined);
			}
			const restored = createModel({ storageService: first.storageService });
			restored.sessionsManagementService.setSessions([input, ci, retained]);
			restored.blockedModel.setBlocked([failingCI(retained)]);
			input.isArchived.set(true, undefined);
			ci.isArchived.set(true, undefined);
			const storedAfterArchive = restored.storageService.getObject(storageKey, StorageScope.PROFILE);
			input.isArchived.set(false, undefined);
			ci.isArchived.set(false, undefined);
			restored.blockedModel.setBlocked([needsInput(input), failingCI(ci), failingCI(retained)]);

			assert.deepStrictEqual({ storedAfterArchive, afterUnarchive: blockedIds(restored.model) }, {
				storedAfterArchive: [['retained', { occurrenceId: 'failingCI:sha', reason: BlockedSessionReason.FailingCI }]],
				afterUnarchive: ['input', 'ci'],
			});
		});
	}

	test('removes the storage key when the last ignored session is archived', () => {
		const { model, blockedModel, storageService } = createModel();
		const session = new TestSession('ci');
		blockedModel.setBlocked([failingCI(session)]);
		model.ignoreSession(session);
		blockedModel.setBlocked([]);
		session.isArchived.set(true, undefined);

		assert.strictEqual(storageService.get(storageKey, StorageScope.PROFILE), undefined);
	});

	for (const ignoreAll of [false, true]) {
		test(`stores only the latest 50 ignored sessions with ${ignoreAll ? 'ignore all' : 'individual ignores'}`, () => {
			const first = createModel();
			const sessions = Array.from({ length: 51 }, (_, i) => new TestSession(`ci-${i}`));
			first.blockedModel.setBlocked(sessions.map(session => failingCI(session)));
			if (ignoreAll) {
				first.model.ignoreAllSessions();
			} else {
				for (const session of sessions) {
					first.model.ignoreSession(session);
				}
			}
			const beforeReload = blockedIds(first.model);
			const stored = first.storageService.getObject(storageKey, StorageScope.PROFILE);
			first.model.dispose();
			const restored = createModel({ storageService: first.storageService });
			restored.blockedModel.setBlocked(sessions.map(session => failingCI(session)));

			assert.deepStrictEqual({ beforeReload, stored, afterReload: blockedIds(restored.model) }, {
				beforeReload: [],
				stored: sessions.slice(1).map(session => [session.sessionId, { occurrenceId: 'failingCI:sha', reason: BlockedSessionReason.FailingCI }]),
				afterReload: ['ci-0'],
			});
		});
	}

	test('refreshes acknowledgement order when a session is ignored again', () => {
		const { model, blockedModel, storageService } = createModel();
		const sessions = Array.from({ length: 51 }, (_, i) => new TestSession(`ci-${i}`));
		blockedModel.setBlocked(sessions.map(session => failingCI(session)));
		for (const session of sessions.slice(0, 50)) {
			model.ignoreSession(session);
		}
		model.ignoreSession(sessions[0]);
		model.ignoreSession(sessions[50]);

		assert.deepStrictEqual(storageService.getObject(storageKey, StorageScope.PROFILE),
			[...sessions.slice(2, 50), sessions[0], sessions[50]].map(session => [session.sessionId, { occurrenceId: 'failingCI:sha', reason: BlockedSessionReason.FailingCI }]));
	});

	test('deduplicates and bounds restored history to the latest 50 sessions', () => {
		const storageService = store.add(new InMemoryStorageService());
		const sessions = Array.from({ length: 51 }, (_, i) => new TestSession(`ci-${i}`));
		const entries = sessions.map(session => [session.sessionId, { occurrenceId: 'failingCI:sha', reason: BlockedSessionReason.FailingCI }]);
		storageService.store(storageKey, JSON.stringify([...entries, entries[0]]), StorageScope.PROFILE, StorageTarget.MACHINE);
		const { model, blockedModel } = createModel({ storageService });
		blockedModel.setBlocked(sessions.map(session => failingCI(session)));

		assert.deepStrictEqual({ blocked: blockedIds(model), stored: storageService.getObject(storageKey, StorageScope.PROFILE) }, {
			blocked: ['ci-1'],
			stored: [...entries.slice(2), entries[0]],
		});
	});

	for (const invalid of ['{', '{}', '[null]', '[["ci", null]]', '[["ci", {"occurrenceId": 1, "reason": "failingCI"}]]', '[["ci", {"occurrenceId": "sha", "reason": "invalid"}]]']) {
		test(`logs and recovers from invalid persisted state: ${invalid}`, () => {
			const storageService = store.add(new InMemoryStorageService());
			storageService.store(storageKey, invalid, StorageScope.PROFILE, StorageTarget.MACHINE);
			const warnings: string[] = [];
			const logService = new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			};
			const { model, blockedModel } = createModel({ storageService, logService });
			const session = new TestSession('ci');
			blockedModel.setBlocked([failingCI(session)]);
			model.ignoreSession(session);

			assert.deepStrictEqual({
				warnings,
				blocked: blockedIds(model),
				stored: storageService.getObject(storageKey, StorageScope.PROFILE),
			}, {
				warnings: ['[BlockedSessionsIndicator] Failed to load ignored occurrences'],
				blocked: [],
				stored: [['ci', { occurrenceId: 'failingCI:sha', reason: BlockedSessionReason.FailingCI }]],
			});
		});
	}

	test('reports nothing and never blinks when disabled (stable quality)', () => {
		const { model, blockedModel } = createModel({ quality: 'stable' });
		blockedModel.setBlocked([needsInput(new TestSession('s1'))]);
		assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });
	});
});

function needsInput(session: TestSession): IBlockedSession {
	return { session: session as unknown as ISession, reason: BlockedSessionReason.NeedsInput, occurrenceId: BlockedSessionReason.NeedsInput };
}

function failingCI(session: TestSession, headSha: string = 'sha'): IBlockedSession {
	return { session: session as unknown as ISession, reason: BlockedSessionReason.FailingCI, occurrenceId: `${BlockedSessionReason.FailingCI}:${headSha}` };
}

function approval(kind: AgentSessionApprovalKind, since: Date = new Date(), approvalId: string = `${kind}:${since.getTime()}`): IAgentSessionApprovalInfo {
	return { approvalId, kind, label: 'npm run build', languageId: undefined, since, confirm: () => { } };
}

class TestSession extends mock<ISession>() {
	override readonly resource: URI;
	override readonly chats: IObservable<readonly IChat[]>;
	override readonly isArchived = observableValue('isArchived', false);
	override readonly status = observableValue('status', SessionStatus.Completed);
	override readonly remoteConnectionStatus = observableValue<SessionRemoteConnectionStatus>('remoteConnectionStatus', { kind: 'connected' });

	constructor(override readonly sessionId: string) {
		super();
		this.resource = URI.parse(`test-session:/${sessionId}`);
		this.chats = constObservable([upcastPartial<IChat>({ resource: this.resource })]);
	}
}

class TestSessionsManagementService extends mock<ISessionsManagementService>() {
	private _sessions: ISession[] = [];
	override readonly onDidChangeSessions;

	constructor(private readonly _onDidChangeSessions: Emitter<ISessionsChangeEvent>) {
		super();
		this.onDidChangeSessions = _onDidChangeSessions.event;
	}

	override getSessions(): ISession[] {
		return this._sessions;
	}

	setSessions(sessions: readonly ISession[]): void {
		this._sessions = [...sessions];
		this._onDidChangeSessions.fire({ added: sessions, removed: [], changed: [] });
	}
}

class TestBlockedSessions {
	readonly blockedSessionsWithReasons = observableValue<readonly IBlockedSession[]>('withReasons', []);
	readonly blockedSessions = observableValue<readonly ISession[]>('blocked', []);

	constructor(private readonly _sessionsManagementService: TestSessionsManagementService) { }

	setBlocked(blocked: readonly IBlockedSession[]): void {
		transaction(tx => {
			const sessions = new Map(this._sessionsManagementService.getSessions().map(session => [session.sessionId, session]));
			for (const entry of this.blockedSessionsWithReasons.get()) {
				if (entry.session instanceof TestSession) {
					entry.session.status.set(SessionStatus.Completed, tx);
				}
			}
			for (const entry of blocked) {
				sessions.set(entry.session.sessionId, entry.session);
				if (entry.session instanceof TestSession) {
					entry.session.status.set(entry.reason === BlockedSessionReason.NeedsInput ? SessionStatus.NeedsInput : SessionStatus.Completed, tx);
				}
			}
			this._sessionsManagementService.setSessions([...sessions.values()]);
			this.blockedSessionsWithReasons.set(blocked, tx);
			this.blockedSessions.set(blocked.map(entry => entry.session), tx);
		});
	}
}

class TestApprovalModel {
	private readonly _approvals = new Map<string, ISettableObservable<IAgentSessionApprovalInfo | undefined>>();

	getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
		return this._obs(resource.toString());
	}

	setApproval(resource: URI, info: IAgentSessionApprovalInfo | undefined): void {
		this._obs(resource.toString()).set(info, undefined);
	}

	private _obs(key: string): ISettableObservable<IAgentSessionApprovalInfo | undefined> {
		let obs = this._approvals.get(key);
		if (!obs) {
			obs = observableValue<IAgentSessionApprovalInfo | undefined>(`approval.${key}`, undefined);
			this._approvals.set(key, obs);
		}
		return obs;
	}
}

class TestCIFixModel {
	readonly hiddenSessions = observableValue<ReadonlySet<string>>('ciFixHidden', new Set());

	setHidden(sessionIds: readonly string[]): void {
		this.hiddenSessions.set(new Set(sessionIds), undefined);
	}
}

class TestSessionsService {
	readonly visibleSessions = observableValue<readonly (IActiveSession | undefined)[]>('visible', []);

	setVisible(sessions: readonly TestSession[]): void {
		this.visibleSessions.set(sessions as unknown as readonly IActiveSession[], undefined);
	}
}
