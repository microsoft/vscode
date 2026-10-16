/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { SessionView } from '../../browser/parts/sessionView.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { constObservable, disposableObservableValue, observableValue } from '../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { ISessionPreparationProgress } from '../../services/sessions/common/session.js';
import { AbstractChatView, ChatViewKind, IChatViewOptions, ISelectWorkspaceOptions, WorkspaceSelectionResult } from '../../browser/parts/chatView.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ChatGroupView } from '../../browser/parts/chatGroupView.js';
import { ChatGroupsView } from '../../browser/parts/chatGroupsView.js';
import { GRID_GAP_SASH_CLASS } from '../../browser/parts/gridGap.js';
import { URI } from '../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationChangeEvent } from '../../../platform/configuration/common/configuration.js';
import { SESSION_TOOLBAR_SETTING, SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../../common/sessionConfig.js';
import { mainWindow } from '../../../base/browser/window.js';
import { createSessionViewTestServices, createTestActiveSession } from './sessionViewTestUtils.js';
import { TestLayoutService, TestMenuService, workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { IWorkbenchLayoutService } from '../../../workbench/services/layout/browser/layoutService.js';
import { AgentWorkbenchLayout } from '../../browser/workbench.js';
import { IMenu, IMenuService, MenuId, MenuItemAction } from '../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { Menus } from '../../browser/menus.js';

suite('Sessions - Session View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestNewSessionView extends AbstractChatView {
		disposed = false;

		constructor(readonly kind: ChatViewKind = 'newSession') {
			super();
		}

		protected override doLayout(): void { }
		override toJSON(): object { return {}; }
		override focus(): void {
			this.element.tabIndex = -1;
			this.element.focus();
		}
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
		const standalone = observableValue<AbstractChatView | undefined>('standalone', undefined);
		const sessionView: SessionView = Object.assign(Object.create(SessionView.prototype), { _standaloneView: standalone, _preparationView: constObservable(undefined), _groupsView: groups });
		const results = [sessionView.selectWorkspace(folder, options)];
		currentView.value = missingPicker;
		results.push(sessionView.selectWorkspace(folder, options));
		currentView.value = target;
		results.push(sessionView.selectWorkspace(folder, options));
		currentView.value = missingPicker;
		standalone.set(target, undefined);
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
			_isVisibleObs: observableValue('visible', true),
			_lastLayout: undefined,
			_groupsView: { setSessionVisible: (visible: boolean) => forwarded.push(visible) },
			_standaloneView: { get: () => undefined },
			_preparationView: constObservable(undefined),
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

	test('quiets inactive chat chrome without changing its layout and reveals it for hover or keyboard focus', () => {
		const workbench = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.monaco-reduce-motion'));
		disposables.add(toDisposable(() => workbench.remove()));
		const part = append(workbench, $('.part.sessionspart'));
		const session = append(part, $('.session-view.is-active'));
		const content = append(session, $('.session-view-content'));
		const group = append(content, $('.chat-group-view.active-group'));
		const surface = append(group, $('.chat-group-view-surface'));
		const header = append(surface, $('.chat-composite-bar.session-header-bar'));
		const action = append(header, $('button'));
		const chat = append(surface, $('.interactive-session'));
		const timeline = append(chat, $('.prompt-timeline-rail'));
		const input = append(chat, $('.interactive-input-part'));
		const persistentContent = append(input, $('.chat-input-persistent-content'));
		const pills = append(persistentContent, $('.chat-pills'));
		const banner = append(persistentContent, $('.session-input-banner'));
		workbench.style.setProperty('--session-view-background', 'rgb(32, 32, 32)');
		workbench.style.setProperty('--vscode-inactiveSessionView-background', 'rgb(16, 16, 16)');
		header.style.height = '32px';
		pills.style.height = '22px';

		const readChrome = () => ({
			headerOpacity: mainWindow.getComputedStyle(header).opacity,
			headerHeight: header.getBoundingClientRect().height,
			timelineVisibility: mainWindow.getComputedStyle(timeline).visibility,
			pillsVisibility: mainWindow.getComputedStyle(pills).visibility,
			pillsHeight: pills.getBoundingClientRect().height,
			bannerVisibility: mainWindow.getComputedStyle(banner).visibility,
		});
		const visible = { headerOpacity: '1', headerHeight: 32, timelineVisibility: 'visible', pillsVisibility: 'visible', pillsHeight: 22, bannerVisibility: 'visible' };
		const quiet = { ...visible, headerOpacity: '0', timelineVisibility: 'hidden', pillsVisibility: 'hidden' };
		const states = [readChrome()];
		session.classList.remove('is-active');
		states.push(readChrome());
		session.classList.add('hovered');
		group.classList.add('hovered');
		states.push(readChrome());
		session.classList.remove('hovered');
		group.classList.remove('hovered');
		action.focus();
		states.push(readChrome());
		action.blur();
		session.classList.add('is-active');
		group.classList.remove('active-group');
		states.push(readChrome());
		group.classList.add('hovered');
		states.push(readChrome());
		group.classList.remove('hovered');
		action.focus();
		states.push(readChrome());
		action.blur();
		states.push(readChrome());
		workbench.classList.add('session-comparison-grid-active');
		states.push(readChrome());
		workbench.classList.remove('session-comparison-grid-active');
		group.classList.add('active-group');
		states.push(readChrome());

		assert.deepStrictEqual(states, [visible, quiet, visible, visible, quiet, visible, visible, quiet, visible, visible]);
	});

	test('reveals only the targeted chat group while retaining session-wide outer header reveal', () => {
		const workbench = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.monaco-reduce-motion'));
		disposables.add(toDisposable(() => workbench.remove()));
		const part = append(workbench, $('.part.sessionspart'));
		const session = append(part, $('.session-view'));
		const headerHost = append(session, $('.session-view-centered-content'));
		const outerHeader = append(headerHost, $('.chat-composite-bar.session-header-bar'));
		const outerAction = append(outerHeader, $('button'));
		const content = append(session, $('.session-view-content'));
		const groups = [true, false].map(active => {
			const group = append(content, $(active ? '.chat-group-view.active-group' : '.chat-group-view'));
			const surface = append(group, $('.chat-group-view-surface'));
			const header = append(surface, $('.chat-composite-bar.session-header-bar'));
			const action = append(header, $('button'));
			const chat = append(surface, $('.interactive-session'));
			const list = append(chat, $('.interactive-list'));
			const transcriptAction = append(list, $('.monaco-button'));
			const timeline = append(chat, $('.prompt-timeline-rail'));
			const persistentContent = append(chat, $('.chat-input-persistent-content'));
			const pills = append(persistentContent, $('.chat-pills'));
			return { group, header, action, list, transcriptAction, timeline, pills };
		});
		const readState = () => ({
			outerHeaderOpacity: mainWindow.getComputedStyle(outerHeader).opacity,
			groups: groups.map(({ header, list, transcriptAction, timeline, pills }) => {
				const transcriptOpacity = Number.parseFloat(mainWindow.getComputedStyle(list).opacity);
				return {
					headerOpacity: mainWindow.getComputedStyle(header).opacity,
					timelineVisibility: mainWindow.getComputedStyle(timeline).visibility,
					pillsVisibility: mainWindow.getComputedStyle(pills).visibility,
					transcriptOpacity,
					bubbleOpacity: mainWindow.getComputedStyle(list).getPropertyValue('--session-view-bubble-background-opacity').trim(),
					effectiveActionOpacity: Math.round(transcriptOpacity * Number.parseFloat(mainWindow.getComputedStyle(transcriptAction).opacity) * 1000) / 1000,
				};
			}),
		});
		const quiet = { headerOpacity: '0', timelineVisibility: 'hidden', pillsVisibility: 'hidden', transcriptOpacity: 0.85, bubbleOpacity: '0', effectiveActionOpacity: 0.6 };
		const revealed = { ...quiet, headerOpacity: '1', timelineVisibility: 'visible', pillsVisibility: 'visible', transcriptOpacity: 1, bubbleOpacity: '0.75' };
		const active = { ...revealed, bubbleOpacity: '1', effectiveActionOpacity: 1 };
		for (const theme of ['vs', 'vs-dark']) {
			workbench.classList.add(theme);
			for (const sessionActive of [false, true]) {
				session.classList.toggle('is-active', sessionActive);
				const remembered = sessionActive ? active : quiet;
				const states = [readState()];
				session.classList.add('hovered');
				states.push(readState());
				groups[1].group.classList.add('hovered');
				states.push(readState());
				groups[1].group.classList.remove('hovered');
				groups[0].group.classList.add('hovered');
				states.push(readState());
				groups[0].group.classList.remove('hovered');
				session.classList.remove('hovered');
				groups[1].action.focus();
				states.push(readState());
				groups[0].action.focus();
				states.push(readState());
				outerAction.focus();
				states.push(readState());
				outerAction.blur();
				workbench.classList.add('session-comparison-grid-active');
				states.push(readState());
				workbench.classList.remove('session-comparison-grid-active');

				assert.deepStrictEqual(states, [
					{ outerHeaderOpacity: sessionActive ? '1' : '0', groups: [remembered, quiet] },
					{ outerHeaderOpacity: '1', groups: [remembered, quiet] },
					{ outerHeaderOpacity: '1', groups: [remembered, revealed] },
					{ outerHeaderOpacity: '1', groups: [sessionActive ? active : revealed, quiet] },
					{ outerHeaderOpacity: '1', groups: [remembered, revealed] },
					{ outerHeaderOpacity: '1', groups: [sessionActive ? active : revealed, quiet] },
					{ outerHeaderOpacity: '1', groups: [remembered, quiet] },
					{ outerHeaderOpacity: '1', groups: [active, active] },
				], `${theme}, active session: ${sessionActive}`);
			}
			workbench.classList.remove(theme);
		}
	});

	test('retains session-wide hover and focus reveal for standalone chats', () => {
		const workbench = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.monaco-reduce-motion'));
		disposables.add(toDisposable(() => workbench.remove()));
		const session = append(workbench, $('.session-view'));
		const headerHost = append(session, $('.session-view-centered-content'));
		const header = append(headerHost, $('.chat-composite-bar.session-header-bar'));
		const action = append(header, $('button'));
		const content = append(session, $('.session-view-content'));
		const view = append(content, $('.chat-view'));
		const chat = append(view, $('.interactive-session'));
		const list = append(chat, $('.interactive-list'));
		const timeline = append(chat, $('.prompt-timeline-rail'));
		const persistentContent = append(chat, $('.chat-input-persistent-content'));
		const pills = append(persistentContent, $('.chat-pills'));
		const readState = () => ({
			headerOpacity: mainWindow.getComputedStyle(header).opacity,
			transcriptOpacity: mainWindow.getComputedStyle(list).opacity,
			timelineVisibility: mainWindow.getComputedStyle(timeline).visibility,
			pillsVisibility: mainWindow.getComputedStyle(pills).visibility,
		});
		const states = [readState()];
		session.classList.add('hovered');
		states.push(readState());
		session.classList.remove('hovered');
		action.focus();
		states.push(readState());
		action.blur();
		states.push(readState());
		session.classList.add('is-active');
		states.push(readState());
		const quiet = { headerOpacity: '0', transcriptOpacity: '0.85', timelineVisibility: 'hidden', pillsVisibility: 'hidden' };
		const revealed = { headerOpacity: '1', transcriptOpacity: '1', timelineVisibility: 'visible', pillsVisibility: 'visible' };
		assert.deepStrictEqual(states, [quiet, revealed, revealed, quiet, revealed]);
	});

	test('recesses custom chat backgrounds below content and uses solid surfaces in high contrast', () => {
		const workbench = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		const part = append(workbench, $('.part.sessionspart.has-chat-background'));
		const session = append(part, $('.session-view.is-active'));
		const headerHost = append(session, $('.session-view-centered-content'));
		const header = append(headerHost, $('.chat-composite-bar.session-header-bar'));
		const action = append(header, $('button'));
		const content = append(session, $('.session-view-content'));
		const group = append(content, $('.chat-group-view.active-group'));
		const surface = append(group, $('.chat-group-view-surface'));
		const replica = append(surface, $('.sessions-chat-background-replica-viewport'));
		workbench.style.setProperty('--vscode-inactiveSessionView-background', 'rgb(0, 0, 0)');
		workbench.style.setProperty('--session-view-background', 'rgb(32, 32, 32)');
		const readVeil = (element: HTMLElement, pseudo = '::before') => {
			const style = mainWindow.getComputedStyle(element, pseudo);
			return { content: style.content, color: style.backgroundColor, pointerEvents: style.pointerEvents };
		};
		const active = readVeil(session);
		session.classList.remove('is-active');
		const inactive = readVeil(session);
		const inactiveReplica = readVeil(replica, '::after');
		const contentBackground = mainWindow.getComputedStyle(content).backgroundColor;
		const inactiveVeil = { content: '""', color: 'color(srgb 0 0 0 / 0.75)', pointerEvents: 'none' };
		const readHeader = () => ({
			hostPosition: mainWindow.getComputedStyle(headerHost).position,
			hostZIndex: mainWindow.getComputedStyle(headerHost).zIndex,
			veilZIndex: mainWindow.getComputedStyle(session, '::before').zIndex,
			opacity: mainWindow.getComputedStyle(header).opacity,
		});
		session.classList.add('hovered');
		const hoveredHeader = readHeader();
		session.classList.remove('hovered');
		const highContrast = [];
		for (const theme of ['hc-black', 'hc-light']) {
			workbench.classList.add(theme);
			action.focus();
			highContrast.push({ veil: readVeil(session), header: readHeader() });
			action.blur();
			workbench.classList.remove(theme);
		}
		session.classList.add('is-active');
		group.classList.remove('active-group');
		const splitInactive = readVeil(group);
		group.classList.add('active-group');

		assert.deepStrictEqual({
			active: active.content,
			inactive,
			inactiveReplica,
			contentBackground,
			hoveredHeader,
			highContrast,
			splitInactive,
			restored: readVeil(group).content,
		}, {
			active: 'none',
			inactive: inactiveVeil,
			inactiveReplica: inactiveVeil,
			contentBackground: 'rgba(0, 0, 0, 0)',
			hoveredHeader: { hostPosition: 'relative', hostZIndex: 'auto', veilZIndex: 'auto', opacity: '1' },
			highContrast: [
				{ veil: { content: '""', color: 'rgb(0, 0, 0)', pointerEvents: 'none' }, header: { hostPosition: 'relative', hostZIndex: 'auto', veilZIndex: 'auto', opacity: '1' } },
				{ veil: { content: '""', color: 'rgb(0, 0, 0)', pointerEvents: 'none' }, header: { hostPosition: 'relative', hostZIndex: 'auto', veilZIndex: 'auto', opacity: '1' } },
			],
			splitInactive: inactiveVeil,
			restored: 'none',
		});
	});

	test('keeps the inactive title hit target stable throughout reveal', () => {
		const workbench = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.monaco-enable-motion'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.cssText = 'position: fixed; top: 0; left: 0; width: 300px; height: 100px; z-index: 1000;';
		const session = append(workbench, $('.session-view'));
		const headerHost = append(session, $('.session-view-centered-content'));
		const header = append(headerHost, $('.chat-composite-bar.session-header-bar'));
		header.style.height = '32px';
		const title = append(header, $('button', undefined, 'Chat title'));
		const bounds = title.getBoundingClientRect();
		const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
		const hiddenTarget = mainWindow.document.elementFromPoint(point.x, point.y);
		const hiddenStyle = mainWindow.getComputedStyle(header);
		const hidden = { opacity: hiddenStyle.opacity, pointerEvents: hiddenStyle.pointerEvents, transitionDuration: hiddenStyle.transitionDuration };
		session.classList.add('is-active');
		const revealedTarget = mainWindow.document.elementFromPoint(point.x, point.y);
		session.classList.remove('is-active');

		assert.deepStrictEqual({
			hidden,
			stableTarget: hiddenTarget === title && revealedTarget === title && mainWindow.document.elementFromPoint(point.x, point.y) === title,
		}, {
			hidden: { opacity: '0', pointerEvents: 'auto', transitionDuration: '0s' },
			stableTarget: true,
		});
	});

	test('exposes active state to shared editor tab presentation', () => {
		const element = document.createElement('div');
		element.classList.add('modern-ui-editor-tab-group');
		const view: SessionView = Object.assign(Object.create(SessionView.prototype), {
			_isActive: true,
			element,
			themeService: { getColorTheme: () => ({ getColor: () => undefined }) },
			_groupsView: { setSessionActive: () => { } },
			_standaloneView: { get: () => undefined },
			_preparationView: constObservable(undefined),
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
			_header: { visible: true, height: 35 },
			_groupsView: { layout: (...dimensions: number[]) => groupsLayout.push(...dimensions) },
			_standaloneView: { get: () => undefined },
			_preparationView: constObservable(undefined),
		});

		view.layout(1200, 800, 10, 20);

		assert.deepStrictEqual({
			sessionSize: [element.style.width, element.style.height],
			headerHostSize: [centeredContentContainer.style.width, centeredContentContainer.style.height],
			groupsLayout,
		}, {
			sessionSize: ['1200px', '800px'],
			headerHostSize: ['1200px', '35px'],
			groupsLayout: [1200, 765, 45, 20, 0],
		});
	});

	test('deduplicates effective child sizes while respecting header and visibility changes', () => {
		const layouts: number[][] = [];
		const header = { visible: true, height: 35 };
		const element = document.createElement('div');
		const centeredContentContainer = document.createElement('div');
		const view: SessionView = Object.assign(Object.create(SessionView.prototype), {
			element,
			_isPartVisible: true,
			_isLeafVisible: true,
			_isVisibleObs: observableValue('visible', true),
			_centeredContentContainer: centeredContentContainer,
			_header: header,
			_groupsView: {
				layout: (...dimensions: number[]) => layouts.push(dimensions),
				setSessionVisible: () => { },
			},
			_standaloneView: { get: () => undefined },
			_preparationView: constObservable(undefined),
		});
		view.layoutContainer(1200, 800, 10, 20);
		const beforeContents = { calls: layouts.length, headerWidth: centeredContentContainer.style.width };
		view.layoutContents();
		view.layout(1200, 800, 10, 20);
		header.height = 45;
		view.layoutContents();
		view.setVisible(false);
		view.layout(1000, 700, 30, 40);
		view.setVisible(true);
		view.layoutContents();
		header.visible = false;
		view.layoutContents();
		view.layout(1000, 0, 30, 40);
		view.layout(1000, 700, 30, 40);
		assert.deepStrictEqual({ beforeContents, layouts }, {
			beforeContents: { calls: 0, headerWidth: '1200px' },
			layouts: [
				[1200, 765, 45, 20, 0],
				[1200, 755, 55, 20, 0],
				[1000, 655, 75, 40, 0],
				[1000, 700, 30, 40, 0],
				[1000, 700, 30, 40, 0],
			],
		});
	});

	test('preserves the new-session composer while an uncreated draft is activated', () => {
		const createdViews: TestNewSessionView[] = [];
		const forwardedInstantiationServices: (IInstantiationService | undefined)[] = [];
		const forwardedOptions: IChatViewOptions[] = [];
		const hostVisible = observableValue('hostVisible', true);
		const shownSessions: Array<IActiveSession | undefined> = [];
		const contentContainer = document.createElement('div');
		mainWindow.document.body.appendChild(contentContainer);
		disposables.add(toDisposable(() => contentContainer.remove()));
		const groupsElement = document.createElement('div');
		const groupsInput = document.createElement('textarea');
		groupsElement.appendChild(groupsInput);
		const isCreated = observableValue<boolean>('isCreated', false);
		const requestInProgress = observableValue('requestInProgress', false);
		const preparationProgress = observableValue<ISessionPreparationProgress | undefined>('preparationProgress', undefined);
		const session = new class extends mock<IActiveSession>() {
			override readonly isCreated = isCreated;
			override readonly isNewSessionRequestInProgress = requestInProgress;
			override readonly preparationProgress = preparationProgress;
			override readonly mainChat = observableValue('mainChat', createTestActiveSession('draft').mainChat.get());
		}();
		const preparationViews: TestNewSessionView[] = [];
		const standaloneView = disposables.add(disposableObservableValue<AbstractChatView | undefined>('standalone', undefined));
		const openSessionDisposables = disposables.add(new DisposableStore());
		const scopedInstantiationService = new class extends mock<IInstantiationService>() { }();
		const view: SessionView = Object.assign(Object.create(SessionView.prototype), {
			_hasOpenedSession: false,
			_currentSession: undefined,
			_sessionObs: observableValue<IActiveSession | undefined>('session', undefined),
			_isVisibleObs: hostVisible,
			_openSessionDisposables: openSessionDisposables,
			_header: { setSession: () => { } },
			_groupsView: {
				element: groupsElement,
				setSession: (activeSession: IActiveSession | undefined) => shownSessions.push(activeSession),
				focus: () => groupsInput.focus(),
			},
			_standaloneView: standaloneView,
			_preparationView: observableValue<AbstractChatView | undefined>('preparation', undefined),
			_scopedInstantiationService: scopedInstantiationService,
			_floatingToolbar: { setSession: () => { } },
			_contentContainer: contentContainer,
			_chatViewFactory: {
				createChatView: () => {
					const created = new TestNewSessionView('chat');
					preparationViews.push(created);
					return created;
				},
				createNewChatView: (_isNewChatInSession: boolean, options: IChatViewOptions, instantiationService?: IInstantiationService) => {
					forwardedOptions.push(options);
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
		view.focus();
		requestInProgress.set(true, undefined);
		const withoutPreparation = {
			retainedComposer: contentContainer.firstElementChild === initialElement,
			preparationViewCount: preparationViews.length,
			focused: mainWindow.document.activeElement === initialElement,
		};
		preparationProgress.set({ message: 'Preparing', cancel: () => { } }, undefined);
		preparationProgress.set({ message: 'Starting', cancel: () => { } }, undefined);
		const duringPreparation = {
			showsChat: contentContainer.firstElementChild === preparationViews[0].element,
			preparationViewCount: preparationViews.length,
			composerDisposed: createdViews[0].disposed,
			focused: mainWindow.document.activeElement === preparationViews[0].element,
			hostVisible: forwardedOptions[0].hostVisible?.get(),
		};
		requestInProgress.set(false, undefined);
		const afterCancellation = {
			restoredComposer: contentContainer.firstElementChild === initialElement,
			progressDisposed: preparationViews[0].disposed,
			focused: mainWindow.document.activeElement === initialElement,
		};
		requestInProgress.set(true, undefined);
		isCreated.set(true, undefined);

		assert.deepStrictEqual({
			createdViewCount: createdViews.length,
			preservedForDraft: draftElement === initialElement,
			withoutPreparation,
			duringPreparation,
			afterCancellation,
			preparationViewsDisposed: preparationViews.every(view => view.disposed),
			disposedAfterCreation: createdViews[0].disposed,
			finalElement: contentContainer.firstElementChild,
			focusedAfterCreation: mainWindow.document.activeElement === groupsInput,
			shownSessions,
			forwardedInstantiationServices,
			sameHostVisibility: forwardedOptions[0].hostVisible === hostVisible,
		}, {
			createdViewCount: 1,
			preservedForDraft: true,
			withoutPreparation: { retainedComposer: true, preparationViewCount: 0, focused: true },
			duringPreparation: { showsChat: true, preparationViewCount: 1, composerDisposed: false, focused: true, hostVisible: true },
			afterCancellation: { restoredComposer: true, progressDisposed: true, focused: true },
			preparationViewsDisposed: true,
			disposedAfterCreation: true,
			finalElement: groupsElement,
			focusedAfterCreation: true,
			shownSessions: [undefined, undefined, session],
			forwardedInstantiationServices: [scopedInstantiationService],
			sameHostVisibility: true,
		});
	});

	test('preserves external focus when creation replaces the preparation view', () => {
		const store = disposables.add(new DisposableStore());
		const { instantiationService, chatViews } = createSessionViewTestServices(store);
		const requestInProgress = observableValue('requestInProgress', false);
		const preparationProgress = observableValue<ISessionPreparationProgress | undefined>('preparationProgress', undefined);
		const session = createTestActiveSession('draft', false, {
			isNewSessionRequestInProgress: requestInProgress,
			preparationProgress,
		});
		const view = store.add(instantiationService.createInstance(SessionView));
		const externalControl = document.createElement('button');
		mainWindow.document.body.append(view.element, externalControl);
		store.add(toDisposable(() => {
			view.element.remove();
			externalControl.remove();
		}));

		view.openSession(session, {});
		view.focus();
		requestInProgress.set(true, undefined);
		preparationProgress.set({ message: 'Preparing', cancel: () => { } }, undefined);
		const preparationView = chatViews.at(-1)!;
		const showedPreparationView = view.element.contains(preparationView.element);
		externalControl.focus();
		session.isCreated.set(true, undefined);
		const createdView = chatViews.at(-1)!;

		assert.deepStrictEqual({
			showedPreparationView,
			preparationViewDisposed: preparationView.disposed,
			showsCreatedSession: createdView !== preparationView && view.element.contains(createdView.element),
			externalFocusPreserved: mainWindow.document.activeElement === externalControl,
		}, {
			showedPreparationView: true,
			preparationViewDisposed: true,
			showsCreatedSession: true,
			externalFocusPreserved: true,
		});
	});

	test('shows the session toolbar of the standalone new-session view only while its session is active, with room reserved beside the chat', () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkbenchLayoutService, new class extends TestLayoutService {
			readonly agentWorkbenchLayout = AgentWorkbenchLayout.Desktop;
		}());
		// Give the Session Toolbar an entry, as the desktop Add Tab actions do.
		instantiationService.stub(IMenuService, new class extends TestMenuService {
			override createMenu(id: MenuId, contextKeyService: IContextKeyService): IMenu {
				const menu = super.createMenu(id, contextKeyService);
				return id === Menus.SessionToolbar
					? { ...menu, getActions: () => [['navigation', [instantiationService.createInstance(MenuItemAction, { id: 'test.browser', title: 'Browser' }, undefined, undefined, undefined, undefined)]]] }
					: menu;
			}
		}());
		const { configurationService, chatViews } = createSessionViewTestServices(store, instantiationService);
		const setToolbarEnabled = (enabled: boolean) => {
			configurationService.setUserConfiguration(SESSION_TOOLBAR_SETTING, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([SESSION_TOOLBAR_SETTING]), affectsConfiguration: (key: string) => key === SESSION_TOOLBAR_SETTING }));
		};
		setToolbarEnabled(true);
		const chatLayout = () => ({
			width: chatViews.at(-1)?.layouts.at(-1)?.width,
			contentInset: chatViews.at(-1)?.element.style.getPropertyValue('--session-toolbar-reserved-width'),
			headerWidth: view.element.querySelector<HTMLElement>('.session-view-centered-content')?.style.width,
		});
		const session = createTestActiveSession('draft', false);
		const view = store.add(instantiationService.createInstance(SessionView));
		mainWindow.document.body.appendChild(view.element);
		store.add(toDisposable(() => view.element.remove()));
		const activeToolbars = () => ({
			standalone: !!view.element.querySelector(':scope > .session-toolbar:not(.inactive)'),
			group: !!view.element.querySelector('.chat-group-view > .session-toolbar:not(.inactive)'),
		});

		view.layout(1000, 600, 0, 0);
		view.openSession(session, {});
		const draft = { ...activeToolbars(), chatLayout: chatLayout() };
		view.layout(1000, 600, 0, 0);
		const repeatedLayout = chatLayout();
		view.setActive(false);
		const inactiveSession = { ...activeToolbars(), chatLayout: chatLayout() };
		view.setActive(true);
		setToolbarEnabled(false);
		const disabledChatLayout = chatLayout();
		setToolbarEnabled(true);
		session.isCreated.set(true, undefined);
		const created = { ...activeToolbars(), chatLayout: chatLayout() };

		assert.deepStrictEqual({ draft, repeatedLayout, inactiveSession, disabledChatLayout, created }, {
			draft: { standalone: true, group: false, chatLayout: { width: 1000, contentInset: '38px', headerWidth: '1000px' } },
			repeatedLayout: { width: 1000, contentInset: '38px', headerWidth: '1000px' },
			inactiveSession: { standalone: false, group: false, chatLayout: { width: 1000, contentInset: '38px', headerWidth: '1000px' } },
			disabledChatLayout: { width: 1000, contentInset: '0px', headerWidth: '1000px' },
			created: { standalone: false, group: true, chatLayout: { width: 1000, contentInset: '38px', headerWidth: '1000px' } },
		});
	});

	test('updates header replacement when chat tab presentation changes', async () => {
		const store = disposables.add(new DisposableStore());
		const { instantiationService, configurationService } = createSessionViewTestServices(store);
		const session = createTestActiveSession('session');

		const view = store.add(instantiationService.createInstance(SessionView));
		mainWindow.document.body.appendChild(view.element);
		store.add({ dispose: () => view.element.remove() });
		view.openSession(session, {});

		const getState = () => ({
			headerDisplay: view.element.querySelector<HTMLElement>('.session-header-bar')?.style.display,
			tabBarDisplay: view.element.querySelector<HTMLElement>('.chat-groups-view .session-chat-tabs-bar')?.style.display,
			tabsReplaceHeader: view.element.classList.contains('tabs-replace-header'),
		});
		const setChatTabsMode = async (mode: SessionsChatTabsMode) => {
			await configurationService.setUserConfiguration(SESSIONS_CHAT_TABS_SETTING, mode);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([SESSIONS_CHAT_TABS_SETTING]),
				change: { keys: [SESSIONS_CHAT_TABS_SETTING], overrides: [] },
				affectsConfiguration: key => key === SESSIONS_CHAT_TABS_SETTING,
			});
		};

		const multiple = getState();
		await setChatTabsMode(SessionsChatTabsMode.Single);
		const single = getState();
		const groupsView = Reflect.get(view, '_groupsView') as { _setGroupCount(count: number): void };
		groupsView._setGroupCount(2);
		const singleSideBySide = getState();
		groupsView._setGroupCount(1);
		await setChatTabsMode(SessionsChatTabsMode.Multiple);

		assert.deepStrictEqual({
			multiple,
			single,
			singleSideBySide,
			restoredMultiple: getState(),
		}, {
			multiple: { headerDisplay: 'none', tabBarDisplay: '', tabsReplaceHeader: true },
			single: { headerDisplay: '', tabBarDisplay: 'none', tabsReplaceHeader: false },
			singleSideBySide: { headerDisplay: 'none', tabBarDisplay: 'none', tabsReplaceHeader: false },
			restoredMultiple: { headerDisplay: 'none', tabBarDisplay: '', tabsReplaceHeader: true },
		});
	});

	test('forwards the session grid gap to split chats', async () => {
		const store = disposables.add(new DisposableStore());
		const { instantiationService } = createSessionViewTestServices(store);
		const session = createTestActiveSession('split-gap', true, { chatCount: 2 });
		const view = store.add(instantiationService.createInstance(SessionView));
		mainWindow.document.body.appendChild(view.element);
		store.add(toDisposable(() => view.element.remove()));
		view.openSession(session, {});
		view.layoutContainer(800, 600, 0, 0);
		view.layoutContents(4);

		const chats = session.chats.get();
		await view.openChatToSide(chats[1].resource, chats[0].resource);

		const snapshot = () => ({
			hasGaps: view.element.querySelector('.chat-groups-view')?.classList.contains('chat-groups-view-has-gaps'),
			independentChatGroups: view.element.classList.contains('independent-chat-groups'),
			gapSashes: view.element.querySelectorAll(`.${GRID_GAP_SASH_CLASS}`).length,
		});
		const defaultDensity = snapshot();
		view.layoutContents(0);
		const compactDensity = snapshot();
		view.layoutContents(4);

		assert.deepStrictEqual({ defaultDensity, compactDensity, restoredDefaultDensity: snapshot() }, {
			defaultDensity: { hasGaps: true, independentChatGroups: true, gapSashes: 1 },
			compactDensity: { hasGaps: false, independentChatGroups: false, gapSashes: 0 },
			restoredDefaultDensity: { hasGaps: true, independentChatGroups: true, gapSashes: 1 },
		});
	});
});
