/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IBrowserViewOwner } from '../../../../../platform/browserView/common/browserView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditorWillOpenEvent } from '../../../../../workbench/common/editor.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { focusedSessionHostServiceOf } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IFocusedSessionHostService } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { SessionBrowserViewController } from '../../browser/sessionBrowserView.js';

suite('SessionBrowserViewController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	type TestSession = ISession & { readonly isArchived: ISettableObservable<boolean> };

	function session(id: string): TestSession {
		const chat = upcastPartial<IChat>({ resource: URI.parse(`chat:/${id}`) });
		return upcastPartial<TestSession>({
			sessionId: id,
			resource: URI.parse(`session:/${id}`),
			isArchived: observableValue(`isArchived:${id}`, false),
			mainChat: constObservable(chat),
			chats: constObservable([chat]),
		});
	}

	/** A controller for `sessions`, with the focus on `focused`, and the browser pages the window knows. */
	function createController(sessions: TestSession[], focused: TestSession) {
		const known = new Map<string, BrowserEditorInput>();
		const onDidChangeSessions = store.add(new Emitter<ISessionsChangeEvent>());
		const onWillOpenEditor = store.add(new Emitter<IEditorWillOpenEvent>());
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			getKnownBrowserViews: () => known,
			registerContextualFilter: () => Disposable.None,
			registerOpenHandler: () => Disposable.None,
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: onDidChangeSessions.event,
			getSessionForChatResource: resource => {
				const owning = sessions.find(candidate => isEqual(candidate.mainChat.get().resource, resource));
				return owning && { session: owning, chat: owning.mainChat.get() };
			},
			getSession: resource => sessions.find(candidate => isEqual(candidate.resource, resource)),
		}));
		instantiationService.stub(IFocusedSessionHostService, focusedSessionHostServiceOf(constObservable({ session: focused, chat: focused.mainChat.get() })));
		instantiationService.stub(IBrowserViewWorkbenchService, browserViewService);
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ onWillOpenEditor: onWillOpenEditor.event }));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ onDidAddGroup: Event.None }));
		store.add(instantiationService.createInstance(SessionBrowserViewController));

		return {
			/** A live page that the window knows, such as one a window reload re-adopted. */
			page: (id: string, owner: IBrowserViewOwner) => {
				const input = new BrowserEditorInput({ id }, async () => { throw new Error('unused'); }, upcastPartial<IThemeService>({}), NullTelemetryService, browserViewService);
				input.model = upcastPartial<IBrowserViewModel>({
					id, owner, dispose: () => { },
					onWillDispose: Event.None, onDidClose: Event.None, onDidChangeTitle: Event.None, onDidChangeFavicon: Event.None, onDidChangeLoadingState: Event.None, onDidNavigate: Event.None,
				});
				Event.once(input.onWillDispose)(() => known.delete(id));
				known.set(id, input);
				return input;
			},
			open: (input: BrowserEditorInput) => onWillOpenEditor.fire({ editor: input, groupId: 0 }),
			archive: (archived: TestSession) => {
				archived.isArchived.set(true, undefined);
				onDidChangeSessions.fire({ added: [], removed: [], changed: [archived] });
			},
			change: (changed: TestSession) => onDidChangeSessions.fire({ added: [], removed: [], changed: [changed] }),
			remove: (removed: TestSession) => {
				sessions.splice(sessions.indexOf(removed), 1);
				onDidChangeSessions.fire({ added: [], removed: [removed], changed: [] });
			},
			alive: () => [...known.keys()].sort(),
			dispose: () => [...known.values()].forEach(input => input.dispose(true)),
		};
	}

	test('closes the pages of a session as it is archived or removed, also pages that never had an editor here, such as those its agents opened in the background or that a window reload re-adopted', () => {
		const a = session('a');
		const b = session('b');
		const c = session('c');
		const controller = createController([a, b, c], b);

		controller.page('agentA', { type: 'agent', sessionId: 'chat:/a' });
		controller.page('agentC', { type: 'agent', sessionId: 'chat:/c' });
		// Opened while another session has focus, the page still belongs to the session of its agent
		controller.open(controller.page('agentAShownInB', { type: 'agent', sessionId: 'chat:/a' }));
		controller.open(controller.page('userB', { type: 'user' }));

		const alive: Record<string, string[]> = {};
		controller.archive(b);
		alive.archivedB = controller.alive();
		// Only archiving a session closes the pages opened in it, not later changes to the archived session
		controller.open(controller.page('userBAfterArchiving', { type: 'user' }));
		controller.change(b);
		alive.changedArchivedB = controller.alive();
		controller.archive(a);
		alive.archivedA = controller.alive();
		controller.remove(c);
		alive.removedC = controller.alive();
		controller.dispose();

		assert.deepStrictEqual(alive, {
			archivedB: ['agentA', 'agentAShownInB', 'agentC'],
			changedArchivedB: ['agentA', 'agentAShownInB', 'agentC', 'userBAfterArchiving'],
			archivedA: ['agentC', 'userBAfterArchiving'],
			removedC: ['userBAfterArchiving'],
		});
	});
});
