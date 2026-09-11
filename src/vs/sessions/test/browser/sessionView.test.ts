/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SessionView } from '../../browser/parts/sessionView.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { URI } from '../../../base/common/uri.js';
import type { IChat } from '../../services/sessions/common/session.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { AbstractChatView } from '../../browser/parts/chatView.js';

suite('Sessions - Session View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestNewSessionView extends AbstractChatView {
		readonly kind = 'newSession';
		disposed = false;
		readonly transferredDrafts: string[] = [];

		protected override doLayout(): void { }
		override toJSON(): object { return {}; }
		override focus(): void { }
		override preserveInputForChat(resource: URI): void { this.transferredDrafts.push(resource.toString()); }
		override dispose(): void {
			this.disposed = true;
			super.dispose();
		}
	}

	test('forwards effective visibility (part and grid leaf) to the hosted chat view', () => {
		const forwarded: boolean[] = [];
		// Created from the prototype so the internal visibility helpers are present.
		const view: SessionView = Object.assign(Object.create(SessionView.prototype), {
			_isPartVisible: true,
			_isLeafVisible: true,
			_lastLayout: undefined,
			_groupsView: { setSessionVisible: (visible: boolean) => forwarded.push(visible) },
			_standaloneView: { value: undefined },
		});

		// A sibling session is maximized, hiding this leaf.
		view.setVisible(false);
		// The whole sessions part is hidden while the leaf is still hidden.
		view.setPartVisible(false);
		// Leaving the maximized state must not reveal the chat while the part is hidden.
		view.setVisible(true);
		// Showing the part again reveals the chat.
		view.setPartVisible(true);

		assert.deepStrictEqual(forwarded, [false, true]);
	});

	test('exposes active state to shared editor tab presentation', () => {
		const element = document.createElement('div');
		element.classList.add('modern-ui-editor-tab-group');
		const view: SessionView = Object.assign(Object.create(SessionView.prototype), {
			_isActive: true,
			element,
			themeService: { getColorTheme: () => ({ getColor: () => undefined }) },
			_groupsView: { setSessionActive: () => { } },
			_standaloneView: { value: undefined },
		});

		view.setActive(false);
		const inactiveClassName = element.className;
		view.setActive(true);

		assert.deepStrictEqual({
			inactiveClassName,
			activeClassName: element.className,
		}, {
			inactiveClassName: 'modern-ui-editor-tab-group',
			activeClassName: 'modern-ui-editor-tab-group modern-ui-editor-tab-group-active',
		});
	});

	test('preserves the new-session composer while an uncreated draft is activated', () => {
		const createdViews: TestNewSessionView[] = [];
		const shownSessions: Array<IActiveSession | undefined> = [];
		const contentContainer = document.createElement('div');
		const groupsElement = document.createElement('div');
		const isCreated = observableValue<boolean>('isCreated', false);
		const session = new class extends mock<IActiveSession>() {
			override readonly isCreated = isCreated;
			override readonly resource = URI.parse('test:/canvas-first');
			override readonly activeChat = constObservable(upcastPartial<IChat>({ resource: URI.parse('test:/canvas-first') }));
		}();
		const standaloneView = disposables.add(new MutableDisposable<AbstractChatView>());
		const openSessionDisposables = disposables.add(new DisposableStore());
		const view: SessionView = Object.assign(Object.create(SessionView.prototype), {
			_hasOpenedSession: false,
			_currentSession: undefined,
			_sessionObs: observableValue<IActiveSession | undefined>('session', undefined),
			_openSessionDisposables: openSessionDisposables,
			_header: { setSession: () => { } },
			_groupsView: {
				element: groupsElement,
				setSession: (activeSession: IActiveSession | undefined) => shownSessions.push(activeSession),
			},
			_standaloneView: standaloneView,
			_floatingToolbar: { setSession: () => { } },
			_contentContainer: contentContainer,
			_chatViewFactory: {
				createNewChatView: () => {
					const created = new TestNewSessionView();
					createdViews.push(created);
					return created;
				},
			},
			_isActive: true,
			_isPartVisible: true,
			_isLeafVisible: true,
			_lastLayout: undefined,
			_handleContextKeys: () => ({ dispose: () => { } }),
		});

		view.openSession(undefined, {});
		const initialElement = contentContainer.firstElementChild;
		view.openSession(session, {});
		const draftElement = contentContainer.firstElementChild;
		isCreated.set(true, undefined);

		assert.deepStrictEqual({
			createdViewCount: createdViews.length,
			preservedForDraft: draftElement === initialElement,
			disposedAfterCreation: createdViews[0].disposed,
			transferredDrafts: createdViews[0].transferredDrafts,
			finalElement: contentContainer.firstElementChild,
			shownSessions,
		}, {
			createdViewCount: 1,
			preservedForDraft: true,
			disposedAfterCreation: true,
			transferredDrafts: ['test:/canvas-first'],
			finalElement: groupsElement,
			shownSessions: [undefined, undefined, session],
		});
	});
});
