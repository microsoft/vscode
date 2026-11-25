/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { UndoRedoService } from '../../../../../platform/undoRedo/common/undoRedoService.js';
import { ShutdownReason } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../test/common/workbenchTestServices.js';
import { ISessionsListChange, ISessionsListNotice, ISessionsListUndoPresenter, SessionsListUndoService } from '../../browser/sessionsListUndoService.js';

suite('SessionsListUndoService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface IShownNotice {
		readonly notice: ISessionsListNotice;
		readonly messages: string[];
		closed: boolean;
	}

	/** A service on the window's undo stack, with a sessions list whose notice shows one notice at a time, as the real one does. */
	function setup() {
		const lifecycleService = store.add(new TestLifecycleService());
		const errors: unknown[] = [];
		const undoRedoService = new UndoRedoService(new TestDialogService(), new TestNotificationService());
		const service = store.add(new SessionsListUndoService(
			undoRedoService,
			upcastPartial<INotificationService>({ error: error => { errors.push(error); } }),
			upcastPartial<IKeybindingService>({ lookupKeybinding: () => undefined }),
			lifecycleService,
		));
		const shown: IShownNotice[] = [];
		const close = (entry: IShownNotice) => {
			if (!entry.closed) {
				entry.closed = true;
				entry.notice.onDidClose?.();
			}
		};
		const presenter: ISessionsListUndoPresenter = {
			show: notice => {
				const previous = shown.at(-1);
				if (previous) {
					close(previous);
				}
				const entry: IShownNotice = { notice, messages: [notice.message], closed: false };
				shown.push(entry);
				return { update: message => { entry.messages.push(message); }, close: () => close(entry) };
			},
		};
		const registration = store.add(service.registerPresenter(presenter));
		const history = () => ({ canUndo: service.canUndo(), canRedo: service.canRedo() });
		return { service, lifecycleService, errors, shown, close, registration, history };
	}

	function change(kind: string, count: number, log: string[], id: string, overrides?: Partial<ISessionsListChange>): ISessionsListChange {
		return {
			kind,
			count,
			help: 'Help.',
			message: total => `${total} ${kind}`,
			undo: async () => { log.push(`undo ${id}`); },
			redo: async () => { log.push(`redo ${id}`); },
			...overrides,
		};
	}

	test('a change of the same kind joins the notice, whose Undo reverts both, latest first, and Redo makes them again', async () => {
		const test = setup();
		const log: string[] = [];
		test.service.offerUndo(change('marked done', 1, log, 'first'));
		test.service.offerUndo(change('marked done', 2, log, 'second'));
		await test.shown[0].notice.undo!();
		const undone = { closed: test.shown[0].closed, ...test.history() };
		await test.service.redo();
		await test.service.redo();
		assert.deepStrictEqual({ notices: test.shown.map(entry => entry.messages), undone, redone: test.history(), log }, {
			notices: [['1 marked done', '3 marked done'], ['1 marked done', '3 marked done']],
			undone: { closed: true, canUndo: false, canRedo: true },
			redone: { canUndo: true, canRedo: false },
			log: ['undo second', 'undo first', 'redo first', 'redo second'],
		});
	});

	test('Undo goes on past notices, which it updates, until a change that completed: the history ends there', async () => {
		const test = setup();
		const log: string[] = [];
		test.service.offerUndo(change('archived', 1, log, 'archive'));
		test.service.offerUndo(change('deleted', 2, log, 'delete', { commit: async () => { log.push('commit delete'); } }));
		test.service.offerUndo(change('groups deleted', 1, log, 'group'));
		test.service.offerUndo(change('groups deleted', 2, log, 'other group'));
		await test.service.undo();
		await test.service.undo();
		await test.service.undo();
		assert.deepStrictEqual({ notices: test.shown.map(entry => entry.messages), log, ...test.history() }, {
			notices: [['1 archived'], ['2 deleted'], ['1 groups deleted', '3 groups deleted', '1 groups deleted'], ['Can\'t undo "2 deleted" anymore']],
			log: ['commit delete', 'undo other group', 'undo group'],
			canUndo: false,
			canRedo: false,
		});
	});

	test('a conflict ends the history instead of undoing or redoing, and says why', async () => {
		const test = setup();
		const log: string[] = [];
		let conflict: boolean | undefined;
		const conflicting = change('archived', 1, log, 'conflicting', { conflicts: applied => conflict === applied });
		test.service.offerUndo(change('archived', 1, log, 'older'));
		test.service.offerUndo(conflicting);
		conflict = true;
		await test.service.undo();
		const afterUndo = { message: test.shown.at(-1)!.messages[0], ...test.history() };
		test.service.offerUndo(conflicting);
		conflict = undefined;
		await test.service.undo();
		conflict = false;
		await test.service.redo();
		assert.deepStrictEqual({ afterUndo, afterRedo: { message: test.shown.at(-1)!.messages[0], ...test.history() }, log }, {
			afterUndo: { message: 'Can\'t undo "1 archived": the sessions list changed since', canUndo: false, canRedo: false },
			afterRedo: { message: 'Can\'t redo "1 archived": the sessions list changed since', canUndo: false, canRedo: false },
			log: ['undo conflicting'],
		});
	});

	test('a provisional change completes once its notice no longer offers Undo, also when the list goes away, and right away without one', () => {
		const test = setup();
		const log: string[] = [];
		const provisional = (id: string) => change('deleted', 1, log, id, { commit: async () => { log.push(`commit ${id}`); } });
		test.service.offerUndo(provisional('expired'));
		test.close(test.shown[0]);
		test.service.offerUndo(provisional('shown'));
		test.registration.dispose();
		const offered = test.service.offerUndo(provisional('unshown'));
		assert.deepStrictEqual({ offered, closed: test.shown[1].closed, log }, { offered: false, closed: true, log: ['commit expired', 'commit shown', 'commit unshown'] });
	});

	test('closing the window completes what Undo was offered for and waits for it, and a failure is reported', async () => {
		const test = setup();
		const commit = new DeferredPromise<void>();
		const error = new Error('delete failed');
		test.service.offerUndo(change('deleted', 1, [], 'pending', { commit: () => commit.p }));
		test.lifecycleService.fireShutdown();
		let settled = false;
		Promise.all(test.lifecycleService.shutdownJoiners).then(() => settled = true);
		await timeout(0);
		const settledBeforeCommit = settled;
		await commit.error(error);
		await timeout(0);
		assert.deepStrictEqual({ closed: test.shown[0].closed, joiners: test.lifecycleService.shutdownJoiners.length, settledBeforeCommit, settled, errors: test.errors }, {
			closed: true, joiners: 1, settledBeforeCommit: false, settled: true, errors: [error],
		});
	});

	test('in the web, leaving the page ends Undo and asks to stay while what it was offered for completes; elsewhere, closing the window waits for it instead', async () => {
		const test = setup();
		const log: string[] = [];
		const commit = new DeferredPromise<void>();
		test.service.offerUndo(change('deleted', 1, log, 'pending', { commit: () => { log.push('commit pending'); return commit.p; } }));
		const leave = () => {
			let vetoed = false;
			test.lifecycleService.fireBeforeShutdown({ reason: ShutdownReason.QUIT, veto: value => { vetoed ||= value === true; }, finalVeto: () => { } });
			return vetoed;
		};

		const whileCompleting = leave();
		await commit.complete();
		await timeout(0);
		const completed = leave();

		assert.deepStrictEqual({ closed: test.shown[0].closed, log, whileCompleting, completed }, isWeb
			? { closed: true, log: ['commit pending'], whileCompleting: true, completed: false }
			: { closed: false, log: [], whileCompleting: false, completed: false });
	});
});
