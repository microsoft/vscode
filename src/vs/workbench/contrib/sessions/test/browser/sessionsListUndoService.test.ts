/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
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

	/** A service with a sessions list whose notice shows one notice at a time, as the real one does. */
	function setup() {
		const lifecycleService = store.add(new TestLifecycleService());
		const errors: unknown[] = [];
		const service = store.add(new SessionsListUndoService(upcastPartial<INotificationService>({ error: error => { errors.push(error); } }), lifecycleService));
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
		return { service, lifecycleService, errors, shown, close, registration };
	}

	function change(kind: string, count: number, log: string[], id: string, overrides?: Partial<ISessionsListChange>): ISessionsListChange {
		return {
			kind,
			count,
			help: 'Help.',
			message: total => `${total} ${kind}`,
			undo: async () => { log.push(`undo ${id}`); },
			commit: async () => { log.push(`commit ${id}`); },
			...overrides,
		};
	}

	test('a change of the same kind joins the notice, which counts both, and Undo reverts both, latest first', async () => {
		const test = setup();
		const log: string[] = [];
		test.service.offerUndo(change('marked done', 1, log, 'first'));
		test.service.offerUndo(change('marked done', 2, log, 'second'));
		await test.shown[0].notice.undo!();
		test.close(test.shown[0]);
		assert.deepStrictEqual({ notices: test.shown.map(entry => entry.messages), log }, {
			notices: [['1 marked done', '3 marked done']],
			log: ['undo second', 'undo first'],
		});
	});

	test('a change of another kind, or one made while undoing, replaces the notice, which completes the changes it offered', async () => {
		const test = setup();
		const log: string[] = [];
		const undoing = new DeferredPromise<void>();
		test.service.offerUndo(change('deleted', 1, log, 'replaced'));
		test.service.offerUndo(change('groups deleted', 1, log, 'group'));
		test.service.offerUndo(change('deleted', 1, log, 'undone', { undo: () => undoing.p }));
		const undo = test.shown[2].notice.undo!();
		test.service.offerUndo(change('deleted', 1, log, 'expired'));
		await undoing.complete();
		await undo;
		test.close(test.shown[3]);
		assert.deepStrictEqual({ notices: test.shown.map(entry => entry.messages[0]), log }, {
			notices: ['1 deleted', '1 groups deleted', '1 deleted', '1 deleted'],
			log: ['commit replaced', 'commit group', 'commit expired'],
		});
	});

	test('a failed undo can be retried, unless its notice was replaced meanwhile, which completes the change', async () => {
		const test = setup();
		const log: string[] = [];
		const error = new Error('restore failed');
		let attempts = 0;
		test.service.offerUndo(change('archived', 1, log, 'first'));
		test.service.offerUndo(change('archived', 1, log, 'flaky', {
			undo: async () => {
				if (++attempts === 1) {
					throw error;
				}
				log.push('undo flaky');
			},
		}));
		const failedAttempt = await test.shown[0].notice.undo!().catch(reason => reason);
		await test.shown[0].notice.undo!();
		const failing = new DeferredPromise<void>();
		test.service.offerUndo(change('deleted', 1, log, 'failing', { undo: () => failing.p }));
		const replacedAttempt = test.shown[1].notice.undo!().catch(reason => reason);
		test.service.offerUndo(change('groups deleted', 1, log, 'other'));
		await failing.error(error);
		assert.deepStrictEqual({ failedAttempt, replacedAttempt: await replacedAttempt, log }, {
			failedAttempt: error,
			replacedAttempt: error,
			log: ['undo flaky', 'undo first', 'commit failing'],
		});
	});

	test('removing the sessions list completes what it offered to undo, and without a list a change completes right away', () => {
		const test = setup();
		const log: string[] = [];
		test.service.offerUndo(change('deleted', 1, log, 'shown'));
		test.registration.dispose();
		const offered = test.service.offerUndo(change('deleted', 1, log, 'unshown'));
		assert.deepStrictEqual({ offered, closed: test.shown[0].closed, log }, { offered: false, closed: true, log: ['commit shown', 'commit unshown'] });
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
