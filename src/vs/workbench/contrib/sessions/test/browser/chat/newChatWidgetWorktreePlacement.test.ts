/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableSignal, observableValue } from '../../../../../../base/common/observable.js';
import { Event } from '../../../../../../base/common/event.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { URI } from '../../../../../../base/common/uri.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISession, ISessionWorkspace, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { NewChatWidget } from '../../../browser/chat/newChatWidget.js';
import { NewWorktreeChoice } from '../../../browser/chat/newWorktreeChoice.js';
import { INewSessionDraftHost, INewSessionTarget } from '../../../browser/parts/chatView.js';
import { IChatSubmitRequest } from '../../../../chat/browser/chatSubmitRequestHandlerService.js';
import { INewSessionWorktreeSendChoiceProvider, INewSessionWorktreeSendChoiceService } from '../../../browser/chat/newSessionWorktreeSendChoice.js';
import { IWorkspacePickerNewWorktreeOption } from '../../../browser/chat/sessionWorkspacePicker.js';
import { IPreferredSessionType } from '../../../browser/chat/sessionTypePicker.js';
import { INewSessionComposerService } from '../../../browser/newSessionComposerService.js';

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
	_createNewWorktreeCheckboxVisible(newWorktree: NewWorktreeChoice, allowedFolders: IObservable<readonly URI[]>): IObservable<boolean>;
	_getPickerNewWorktree(newWorktree: NewWorktreeChoice): IWorkspacePickerNewWorktreeOption;
	_handleWorktreeSendChoice(request: IChatSubmitRequest): Promise<boolean>;
	_selectSessionType(folderUri: URI | undefined, pick: IPreferredSessionType | undefined): Promise<void>;
	_onUserWorkspaceSelection(): void;
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

	/** A composer on draft `a` of `folder`, where picking an agent installs its draft, named by its type, at once, and settles once its gate opens. */
	function createSessionTypeWidget(chosenForA: boolean) {
		const draft = (sessionId: string) => upcastPartial<ISession>({ sessionId, status: constObservable(SessionStatus.Untitled), workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [upcastPartial<ISessionWorkspace['folders'][number]>({ root: folder })] })) });
		const session = observableValue<ISession | undefined>('session', draft('a'));
		const pending = observableValue<IPendingPlacement | undefined>('pending', undefined);
		const agent = { resolved: false, available: false };
		const selections: boolean[] = [];
		const gates = new Map<string, Promise<void>>();
		const chosen = () => chosenForA && session.get()?.sessionId === 'a';
		const { widget } = createWidget({
			_session: session,
			_pendingWorktreePlacement: pending,
			_savedDraftTargetUnavailable: observableValue('savedDraftTargetUnavailable', false),
			_newWorktree: upcastPartial<NewWorktreeChoice>({ isUserChosen: chosen, isSelected: chosen, isAvailable: () => agent.available, isResolved: () => agent.resolved, setSelected: async selected => { selections.push(selected); return true; } }),
			_onWorkspaceSelected: async (_folderUri: URI, pick: IPreferredSessionType) => {
				const next = draft(pick.sessionTypeId);
				session.set(next, undefined);
				await gates.get(pick.sessionTypeId);
				return { session: next, trustDeclined: false };
			},
			configurationService: new TestConfigurationService({ 'chat.editorWindow.enableWorktree': true }),
			uriIdentityService: upcastPartial<IUriIdentityService>({ extUri }),
			newSessionComposerService: upcastPartial<INewSessionComposerService>({ notifyUserWorkspaceSelection: () => { } }),
		});
		const switchTo = (sessionTypeId: string) => widget._selectSessionType(folder, { providerId: 'agents', sessionTypeId });
		const resolve = (available: boolean) => {
			agent.resolved = true;
			agent.available = available;
			widget._applyRequestedWorktreePlacement();
			return { selections, pending: pending.get() };
		};
		return { widget, pending, gates, switchTo, resolve };
	}

	test('a New Worktree chosen for a draft stays for the draft of another picked agent, where that agent can work in one', async () => {
		const kept = createSessionTypeWidget(true);
		await kept.switchTo('b');
		const bound = kept.pending.get();

		const cannotIsolate = createSessionTypeWidget(true);
		await cannotIsolate.switchTo('b');

		const notChosen = createSessionTypeWidget(false);
		await notChosen.switchTo('b');

		// Another agent is picked before the draft of the first one settles
		const twice = createSessionTypeWidget(true);
		const firstSettles = new DeferredPromise<void>();
		twice.gates.set('b', firstSettles.p);
		const first = twice.switchTo('b');
		await twice.switchTo('c');
		await firstSettles.complete();
		await first;
		const twiceBound = twice.pending.get();

		const workspacePicked = createSessionTypeWidget(true);
		await workspacePicked.switchTo('b');
		workspacePicked.widget._onUserWorkspaceSelection();

		assert.deepStrictEqual({
			bound,
			kept: kept.resolve(true),
			cannotIsolate: cannotIsolate.resolve(false),
			notChosen: notChosen.resolve(true),
			twiceBound,
			twice: twice.resolve(true),
			workspacePicked: workspacePicked.resolve(true),
		}, {
			bound: { folderUri: folder, sessionId: 'b', previousSessionId: 'a', isPreference: true },
			kept: { selections: [true], pending: undefined },
			cannotIsolate: { selections: [], pending: undefined },
			notChosen: { selections: [], pending: undefined },
			twiceBound: { folderUri: folder, sessionId: 'c', previousSessionId: 'b', isPreference: true },
			twice: { selections: [true], pending: undefined },
			workspacePicked: { selections: [], pending: undefined },
		});
	});
});

suite('NewChatWidget New Worktree offer', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = URI.file('/repo');

	/** What an editor window's composer, restricted to `folder`, offers of New Worktree with worktree support on or off. */
	async function offers(worktreeSupport: boolean) {
		const store = disposables.add(new DisposableStore());
		let asked = 0;
		const provider = upcastPartial<INewSessionWorktreeSendChoiceProvider>({ requestSendChoice: async () => { asked++; return undefined; }, isRecentChatInFolder: () => true });
		const session = upcastPartial<ISession>({ sessionId: 'draft', resource: URI.parse('agent-host-copilot:/untitled-draft'), status: constObservable(SessionStatus.Untitled), workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [upcastPartial<ISessionWorkspace['folders'][number]>({ root: folder })] })), isQuickChat: constObservable(false) });
		const newWorktree = upcastPartial<NewWorktreeChoice>({ isAvailable: () => true, isSelected: () => false, isUserChosen: () => false });
		const widget = Object.assign(Object.create(NewChatWidget.prototype), {
			_store: store,
			_session: constObservable(session),
			_draftHost: upcastPartial<INewSessionDraftHost>({ getFolderPresentation: () => undefined }),
			_environmentWorkspaceChanged: observableSignal('environmentWorkspaceChanged'),
			_newWorktree: newWorktree,
			_newWorktreeCheckboxVisible: constObservable(false),
			_askingWorktreeOnSend: new Set<string>(),
			_pendingWorktreePlacement: constObservable(undefined),
			_getWorktreeSendChoiceControl: () => upcastPartial<HTMLElement>({}),
			_isRecentChatInFolder: () => true,
			worktreeSendChoiceService: upcastPartial<INewSessionWorktreeSendChoiceService>({ provider: constObservable(provider) }),
			contextKeyService: upcastPartial<IContextKeyService>({ onDidChangeContext: Event.None, contextMatchesRules: () => true }),
			configurationService: new TestConfigurationService({ 'chat.editorWindow.enableWorktree': worktreeSupport, 'chat.viewSessions.sessionsList.enabled': false }),
		}) as INewChatWidgetInternals;
		const checkbox = widget._createNewWorktreeCheckboxVisible(newWorktree, constObservable([folder])).get();
		const inPicker = widget._getPickerNewWorktree(newWorktree).isAvailable();
		await widget._handleWorktreeSendChoice(upcastPartial<IChatSubmitRequest>({ sessionResource: session.resource }));
		return { checkbox, inPicker, askedOnSend: asked > 0 };
	}

	test('offers New Worktree, as a checkbox, in the folder picker or as the send choice, only with worktree support on', async () => {
		assert.deepStrictEqual({ off: await offers(false), on: await offers(true) }, {
			off: { checkbox: false, inPicker: false, askedOnSend: false },
			on: { checkbox: true, inPicker: true, askedOnSend: true },
		});
	});
});
