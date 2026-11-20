/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { NewChatWidget } from '../../../browser/chat/newChatWidget.js';
import { NewWorktreeChoice } from '../../../browser/chat/newWorktreeChoice.js';
import { INewSessionDraftHost, INewSessionTarget } from '../../../browser/parts/chatView.js';

interface IPendingPlacement {
	readonly folderUri: URI;
	readonly sessionId: string | undefined;
	readonly previousSessionId: string | undefined;
	readonly unavailableReported?: boolean;
	readonly isPreference?: boolean;
}

/** The members of the widget that these tests exercise, which are private. */
interface INewChatWidgetInternals {
	_setNewWorktreeByUser(newWorktree: NewWorktreeChoice, selected: boolean): Promise<boolean>;
	_applyRequestedWorktreePlacement(): void;
}

suite('NewChatWidget new worktree placement', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHost(initial: INewSessionTarget) {
		const requestedTarget = observableValue<INewSessionTarget | undefined>('requestedTarget', initial);
		const draftHost = upcastPartial<INewSessionDraftHost>({
			requestedTarget,
			setRequestedTarget: target => requestedTarget.set(target, undefined),
		});
		return { requestedTarget, draftHost };
	}

	function createWidget(fields: object) {
		const store = disposables.add(new DisposableStore());
		const widget = Object.assign(Object.create(NewChatWidget.prototype), { _store: store, _worktreeChoiceCount: 0 }, fields) as INewChatWidgetInternals;
		return { widget, store };
	}

	function choice(result: Promise<boolean>) {
		return upcastPartial<NewWorktreeChoice>({ setSelected: () => result });
	}

	const folder = URI.file('/repo');
	const picked = (target: INewSessionTarget | undefined) => ({ placement: target?.placement, isPreference: target?.placementIsPreference, folder: target?.folderUri?.path });

	test('a New Worktree choice that is rejected restores the placement it replaced', async () => {
		const { requestedTarget, draftHost } = createHost({ folderUri: folder, placement: 'worktree', placementIsPreference: true });
		const { widget } = createWidget({ _draftHost: draftHost });
		const result = new DeferredPromise<boolean>();

		const done = widget._setNewWorktreeByUser(choice(result.p), false);
		const during = picked(requestedTarget.get());
		await result.complete(false);
		await done;

		assert.deepStrictEqual({ during, after: picked(requestedTarget.get()) }, {
			during: { placement: undefined, isPreference: undefined, folder: '/repo' },
			after: { placement: 'worktree', isPreference: true, folder: '/repo' },
		});
	});

	test('a rejected New Worktree choice does not undo a retarget, a later choice, or a disposed composer', async () => {
		const retarget = createHost({ folderUri: folder, placement: 'worktree', placementIsPreference: true });
		const retargeting = createWidget({ _draftHost: retarget.draftHost });
		const retargetResult = new DeferredPromise<boolean>();
		const retargetDone = retargeting.widget._setNewWorktreeByUser(choice(retargetResult.p), false);
		retarget.requestedTarget.set({ folderUri: URI.file('/other') }, undefined);
		await retargetResult.complete(false);
		await retargetDone;

		const later = createHost({ folderUri: folder });
		const laterWidget = createWidget({ _draftHost: later.draftHost });
		const first = new DeferredPromise<boolean>();
		const firstDone = laterWidget.widget._setNewWorktreeByUser(choice(first.p), true);
		const laterDone = laterWidget.widget._setNewWorktreeByUser(choice(Promise.resolve(true)), false);
		await first.complete(false);
		await Promise.all([firstDone, laterDone]);

		const gone = createHost({ folderUri: folder });
		const goneWidget = createWidget({ _draftHost: gone.draftHost });
		const goneResult = new DeferredPromise<boolean>();
		const goneDone = goneWidget.widget._setNewWorktreeByUser(choice(goneResult.p), true);
		goneWidget.store.dispose();
		await goneResult.complete(false);
		await goneDone;

		assert.deepStrictEqual({ retargeted: picked(retarget.requestedTarget.get()), later: picked(later.requestedTarget.get()), disposed: picked(gone.requestedTarget.get()) }, {
			retargeted: { placement: undefined, isPreference: undefined, folder: '/other' },
			later: { placement: undefined, isPreference: undefined, folder: '/repo' },
			disposed: { placement: 'worktree', isPreference: undefined, folder: '/repo' },
		});
	});

	test('a rejected New Worktree choice restores only the placement when the model changed meanwhile', async () => {
		const { requestedTarget, draftHost } = createHost({ folderUri: folder, placement: 'worktree', placementIsPreference: true });
		const { widget } = createWidget({ _draftHost: draftHost });
		const result = new DeferredPromise<boolean>();

		const done = widget._setNewWorktreeByUser(choice(result.p), false);
		requestedTarget.set({ ...requestedTarget.get(), modelId: 'other-model' }, undefined);
		await result.complete(false);
		await done;

		assert.deepStrictEqual({ ...picked(requestedTarget.get()), modelId: requestedTarget.get()?.modelId }, { placement: 'worktree', isPreference: true, folder: '/repo', modelId: 'other-model' });
	});

	function createPlacementWidget(placement: IPendingPlacement, newWorktree: { isAvailable: boolean; isResolved: boolean }) {
		const warnings: string[] = [];
		const pending = observableValue<IPendingPlacement | undefined>('pending', placement);
		const session = upcastPartial<ISession>({ sessionId: 'draft', status: observableValue('status', SessionStatus.Untitled) });
		const { widget } = createWidget({
			_pendingWorktreePlacement: pending,
			_session: observableValue<ISession | undefined>('session', session) satisfies IObservable<ISession | undefined>,
			_newWorktree: upcastPartial<NewWorktreeChoice>({ isAvailable: () => newWorktree.isAvailable, isResolved: () => newWorktree.isResolved, setSelected: async () => true }),
			notificationService: upcastPartial<INotificationService>({ warn: message => { warnings.push(String(message)); } }),
		});
		return { widget, pending, warnings };
	}

	test('a remembered placement an agent cannot honour is dropped silently, an explicit one warns and keeps blocking, and one not yet resolved waits', () => {
		const base = { folderUri: folder, sessionId: 'draft', previousSessionId: undefined };
		const remembered = createPlacementWidget({ ...base, isPreference: true }, { isAvailable: false, isResolved: true });
		const explicit = createPlacementWidget(base, { isAvailable: false, isResolved: true });
		const unresolved = createPlacementWidget({ ...base, isPreference: true }, { isAvailable: false, isResolved: false });

		for (const { widget } of [remembered, explicit, unresolved]) {
			widget._applyRequestedWorktreePlacement();
		}

		assert.deepStrictEqual({
			remembered: { pending: remembered.pending.get(), warnings: remembered.warnings },
			explicit: { pending: !!explicit.pending.get()?.unavailableReported, warnings: explicit.warnings.length },
			unresolved: { pending: !!unresolved.pending.get(), warnings: unresolved.warnings },
		}, {
			remembered: { pending: undefined, warnings: [] },
			explicit: { pending: true, warnings: 1 },
			unresolved: { pending: true, warnings: [] },
		});
	});
});
