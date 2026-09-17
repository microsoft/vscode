/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, Dimension } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { SessionView } from '../../browser/parts/sessionView.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Event } from '../../../base/common/event.js';
import { observableValue } from '../../../base/common/observable.js';
import { mock } from '../../../base/test/common/mock.js';
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';
import { AbstractChatView, IChatViewOptions, ISelectWorkspaceOptions, WorkspaceSelectionResult } from '../../browser/parts/chatView.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ChatGroupView } from '../../browser/parts/chatGroupView.js';
import { ChatGroupsView } from '../../browser/parts/chatGroupsView.js';
import { URI } from '../../../base/common/uri.js';
import { IChatViewFactory } from '../../services/chatView/browser/chatViewFactory.js';
import { ISessionChangesStatsCache } from '../../services/sessions/common/sessionChangesStatsCache.js';
import { ISessionsListModelService } from '../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';

suite('Sessions - Session View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestNewSessionView extends AbstractChatView {
		readonly kind = 'newSession';
		disposed = false;

		protected override doLayout(): void { }
		override toJSON(): object { return {}; }
		override focus(): void { }
		override dispose(): void {
			this.disposed = true;
			super.dispose();
		}
	}

	test('forwards workspace selection to the actual standalone or active group view', () => {
		const folder = URI.file('/requested');
		const options: ISelectWorkspaceOptions = { providerId: 'provider', isDefault: true };
		const calls: { folder: URI; options?: ISelectWorkspaceOptions }[] = [];
		const target = disposables.add(new class extends TestNewSessionView {
			override selectWorkspace(folder: URI, options?: ISelectWorkspaceOptions): WorkspaceSelectionResult {
				calls.push({ folder, options });
				return 'preserved';
			}
		}());
		const missingPicker = disposables.add(new TestNewSessionView());
		const currentView = { value: undefined as AbstractChatView | undefined };
		const group: ChatGroupView = Object.assign(Object.create(ChatGroupView.prototype), { _currentView: currentView });
		const groups: ChatGroupsView = Object.assign(Object.create(ChatGroupsView.prototype), { _activeGroup: { view: group } });
		const standalone = { value: undefined as AbstractChatView | undefined };
		const sessionView: SessionView = Object.assign(Object.create(SessionView.prototype), { _standaloneView: standalone, _groupsView: groups });
		const results = [sessionView.selectWorkspace(folder, options)];
		currentView.value = missingPicker;
		results.push(sessionView.selectWorkspace(folder, options));
		currentView.value = target;
		results.push(sessionView.selectWorkspace(folder, options));
		currentView.value = missingPicker;
		standalone.value = target;
		results.push(sessionView.selectWorkspace(folder, options));
		assert.deepStrictEqual({ results, calls }, {
			results: ['notReady', 'notReady', 'preserved', 'preserved'],
			calls: [{ folder, options }, { folder, options }],
		});
	});

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

	test('lays out the header host and chat content at the full session width', () => {
		const element = document.createElement('div');
		const centeredContentContainer = document.createElement('div');
		const groupsLayout: number[] = [];
		const view: SessionView = Object.assign(Object.create(SessionView.prototype), {
			element,
			_isPartVisible: true,
			_isLeafVisible: true,
			_centeredContentContainer: centeredContentContainer,
			_bodyContainer: document.createElement('div'),
			_contentContainer: document.createElement('div'),
			_sidebarContainer: document.createElement('div'),
			_header: { visible: true, height: 35 },
			_groupsView: { layout: (...dimensions: number[]) => groupsLayout.push(...dimensions) },
			_standaloneView: { value: undefined },
		});

		view.layout(1200, 800, 10, 20);

		assert.deepStrictEqual({
			sessionSize: [element.style.width, element.style.height],
			headerHostSize: [centeredContentContainer.style.width, centeredContentContainer.style.height],
			groupsLayout,
		}, {
			sessionSize: ['1200px', '800px'],
			headerHostSize: ['1200px', '35px'],
			groupsLayout: [1200, 765, 45, 20],
		});
	});

	test('preserves the new-session composer while an uncreated draft is activated', () => {
		const createdViews: TestNewSessionView[] = [];
		const forwardedInstantiationServices: (IInstantiationService | undefined)[] = [];
		const shownSessions: Array<IActiveSession | undefined> = [];
		const contentContainer = document.createElement('div');
		const groupsElement = document.createElement('div');
		const isCreated = observableValue<boolean>('isCreated', false);
		const session = new class extends mock<IActiveSession>() {
			override readonly isCreated = isCreated;
		}();
		const standaloneView = disposables.add(new MutableDisposable<AbstractChatView>());
		const openSessionDisposables = disposables.add(new DisposableStore());
		const scopedInstantiationService = new class extends mock<IInstantiationService>() { }();
		const view: SessionView = Object.assign(Object.create(SessionView.prototype), {
			_hasOpenedSession: false,
			_currentSession: undefined,
			_sessionObs: observableValue<IActiveSession | undefined>('session', undefined),
			_openSessionDisposables: openSessionDisposables,
			_sidebarDisposables: disposables.add(new MutableDisposable<DisposableStore>()),
			_header: { setSession: () => { } },
			_groupsView: {
				element: groupsElement,
				setSession: (activeSession: IActiveSession | undefined) => shownSessions.push(activeSession),
			},
			_standaloneView: standaloneView,
			_scopedInstantiationService: scopedInstantiationService,
			_floatingToolbar: { setSession: () => { } },
			_contentContainer: contentContainer,
			_chatViewFactory: {
				createNewChatView: (_isNewChatInSession: boolean, _options: IChatViewOptions, instantiationService?: IInstantiationService) => {
					forwardedInstantiationServices.push(instantiationService);
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
			finalElement: contentContainer.firstElementChild,
			shownSessions,
			forwardedInstantiationServices,
		}, {
			createdViewCount: 1,
			preservedForDraft: true,
			disposedAfterCreation: true,
			finalElement: groupsElement,
			shownSessions: [undefined, undefined, session],
			forwardedInstantiationServices: [scopedInstantiationService],
		});
	});

	function createSidebarView() {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChatViewFactory, new class extends mock<IChatViewFactory>() {
			override createNewChatView() { return new TestNewSessionView(); }
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
		}());
		instantiationService.stub(ISessionChangesStatsCache, new class extends mock<ISessionChangesStatsCache>() { }());
		instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() { }());
		const container = append(mainWindow.document.body, $('div'));
		container.style.setProperty('--vscode-strokeThickness', '1px');
		container.style.setProperty('--vscode-widget-border', 'transparent');
		disposables.add(toDisposable(() => container.remove()));
		const view = disposables.add(instantiationService.createInstance(SessionView));
		container.appendChild(view.element);
		return view;
	}

	test('the sidebar reserves chat space and stacks without overlap below the width constraint', () => {
		const view = createSidebarView();
		view.openSession(undefined, {});
		const layouts: Dimension[] = [];
		const registration = disposables.add(view.showSidebar({
			render: container => {
				append(container, $('button', undefined, 'Sidebar'));
				return toDisposable(() => { });
			},
			layout: dimension => layouts.push(dimension),
			onHide: () => { },
		}));
		const sizes = [1200, 640, 639, 200].map(width => {
			view.layout(width, 600, 0, 0);
			const chat = view.element.querySelector<HTMLElement>('.session-view-content')!;
			const sidebar = view.element.querySelector<HTMLElement>('.session-view-sidebar')!;
			const chatBounds = chat.getBoundingClientRect();
			const sidebarBounds = sidebar.getBoundingClientRect();
			return {
				chat: [chat.clientWidth, chat.clientHeight],
				sidebar: [sidebar.offsetWidth, sidebar.offsetHeight],
				noOverlap: chatBounds.right <= sidebarBounds.left || chatBounds.bottom <= sidebarBounds.top,
				withinView: sidebarBounds.right <= view.element.getBoundingClientRect().right,
			};
		});
		registration.dispose();
		assert.deepStrictEqual({
			sizes,
			layouts: layouts.map(dimension => [dimension.width, dimension.height]),
			closed: [view.element.querySelector<HTMLElement>('.session-view-content')!.clientWidth, view.element.querySelector<HTMLElement>('.session-view-sidebar')!.style.display],
		}, {
			sizes: [
				{ chat: [840, 600], sidebar: [360, 600], noOverlap: true, withinView: true },
				{ chat: [360, 600], sidebar: [280, 600], noOverlap: true, withinView: true },
				{ chat: [639, 300], sidebar: [639, 300], noOverlap: true, withinView: true },
				{ chat: [200, 300], sidebar: [200, 300], noOverlap: true, withinView: true },
			],
			layouts: [[359, 600], [279, 600], [639, 299], [200, 299]],
			closed: [200, 'none'],
		});
	});

	test('sidebar replacement, view rebinding, and disposal each release their content once', () => {
		const view = createSidebarView();
		const closed: string[] = [];
		const released: string[] = [];
		const show = (id: string) => disposables.add(view.showSidebar({
			render: container => {
				append(container, $('button', undefined, id));
				return toDisposable(() => released.push(id));
			},
			layout: () => { },
			onHide: () => closed.push(id),
		}));
		const first = show('first');
		show('second');
		first.dispose();
		const preservedReplacement = view.element.querySelector('.session-view-sidebar')?.textContent;
		view.openSession(undefined, {});
		show('third');
		view.dispose();
		assert.deepStrictEqual({ preservedReplacement, closed, released }, {
			preservedReplacement: 'second', closed: ['first', 'second', 'third'], released: ['first', 'second', 'third'],
		});
	});

	test('a hidden view catches the sidebar up on reveal without negative content dimensions', () => {
		const view = createSidebarView();
		view.openSession(undefined, {});
		const layouts: Dimension[] = [];
		disposables.add(view.showSidebar({
			render: () => toDisposable(() => { }),
			layout: dimension => layouts.push(dimension),
			onHide: () => { },
		}));
		view.layout(900, 600, 0, 0);
		view.setVisible(false);
		view.layout(300, 100, 0, 0);
		const whileHidden = layouts.length;
		view.setVisible(true);
		assert.deepStrictEqual({ whileHidden, layouts: layouts.map(dimension => [dimension.width, dimension.height]) }, {
			whileHidden: 1, layouts: [[359, 600], [300, 49]],
		});
	});
});
