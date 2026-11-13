/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { registerWindow } from '../../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { constObservable, IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate.js';
import { SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { getIconRegistry } from '../../../../../platform/theme/common/iconRegistry.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IOpenSessionOptions, ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionEditorWorkingSetService, SessionEditorWorkingSetService } from '../../../layout/common/sessionEditorWorkingSet.js';
import { SessionsTitleBarWidget } from '../../browser/sessionsTitleBarWidget.js';
import { ISessionHost, ISessionHostService, SessionHostKind } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISessionGridPane } from '../../../../../workbench/services/sessions/browser/sessionGridPane.js';
import { IChatWindow, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IInstantiationService, ServiceIdentifier, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/browser/environmentService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { BlockedSessionsIndicatorModel } from '../../browser/blockedSessionsIndicatorModel.js';
import { SessionActionFeedback } from '../../browser/sessionActionFeedback.js';
import { TestContextViewService } from '../../../../test/browser/testContextViewService.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { BlockedSessionReason, IBlockedSession } from '../../../../../workbench/contrib/sessions/browser/blockedSessions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IApprovedSession } from '../../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { SHOW_SESSIONS_PICKER_COMMAND_ID } from '../../browser/sessionsActions.js';

suite('SessionsTitleBarWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const getCommandCenterTitle = Reflect.get(SessionsTitleBarWidget.prototype, '_getCommandCenterTitle') as (this: SessionsTitleBarWidget) => string | undefined;
	const renderActiveSession = Reflect.get(SessionsTitleBarWidget.prototype, '_renderActiveSession') as (this: SessionsTitleBarWidget) => void;
	const openBlockedSession = Reflect.get(SessionsTitleBarWidget.prototype, '_openBlockedSession') as (this: SessionsTitleBarWidget, resource: URI, preserveFocus: boolean, sideBySide: boolean) => void;

	class TestCommandCenterList extends Disposable {
		readonly onDidChangeContentHeight = Event.None;
		private readonly _onDidApproveSession = this._register(new Emitter<IApprovedSession>());
		readonly onDidApproveSession = this._onDidApproveSession.event;
		readonly sessions: ISession[] = [];
		readonly element: HTMLElement;
		readonly activeSession: IObservable<ISession | undefined>;
		focusCount = 0;
		widthUpdateCount = 0;

		constructor(
			container: HTMLElement,
			private readonly options: {
				readonly activeSession: IObservable<ISession | undefined>;
				readonly onDidChangeSessionHoverVisibility: (visible: boolean) => void;
			},
		) {
			super();
			this.activeSession = options.activeSession;
			this.element = container.ownerDocument.createElement('div');
			this.element.classList.add('agent-sessions-command-center-list');
			this.element.tabIndex = -1;
			container.append(this.element);
			this._register(toDisposable(() => this.element.remove()));
		}

		setSessions(sessions: readonly ISession[]): void {
			this.sessions.splice(0, this.sessions.length, ...sessions);
		}

		setWidth(): void {
			this.widthUpdateCount++;
		}

		focus(): void {
			this.focusCount++;
			this.element.focus();
		}

		setSessionHoverVisible(visible: boolean): void {
			this.options.onDidChangeSessionHoverVisibility(visible);
		}

		approveSession(session: ISession): void {
			this._onDidApproveSession.fire({ session, approvalId: 'approval' });
		}
	}

	function createInteractionHarness(motionReduced = false, targetWindow: Window = mainWindow) {
		const previewStatus = observableValue('previewStatus', SessionStatus.Completed);
		const previewArchived = observableValue('previewArchived', false);
		const previewRead = observableValue('previewRead', true);
		const previewSession = upcastPartial<ISession>({
			sessionId: 'preview',
			resource: URI.parse('test:/preview'),
			status: previewStatus,
			isArchived: previewArchived,
			isRead: previewRead,
		});
		const ordinarySession = upcastPartial<ISession>({
			sessionId: 'ordinary',
			resource: URI.parse('test:/ordinary'),
			status: constObservable(SessionStatus.Completed),
			isArchived: constObservable(false),
			isRead: constObservable(true),
		});
		const blockedEntry: IBlockedSession = {
			session: previewSession,
			reason: BlockedSessionReason.NeedsInput,
			occurrenceId: 'needsInput',
		};
		const blockedSessions = observableValue<readonly IBlockedSession[]>('blockedSessions', []);
		const unacknowledgedBlockedSessions = observableValue<readonly IBlockedSession[]>('unacknowledgedBlockedSessions', []);
		const reminderSessions = observableValue<readonly IBlockedSession[]>('reminderSessions', []);
		const attentionSessionCount = observableValue('attentionSessionCount', 0);
		const activeSession = observableValue<ISession | undefined>('activeSession', undefined);
		const recentlyOpened = { recent: [previewSession, ordinarySession] as ISession[], other: [] as ISession[] };
		const lists: TestCommandCenterList[] = [];
		const commands: string[] = [];
		const dismissedApprovals: IApprovedSession[] = [];
		const sessionsChanged = disposables.add(new Emitter<ISessionsChangeEvent>());
		const sessionActionFeedback = disposables.add(new SessionActionFeedback());
		const instantiationService = upcastPartial<IInstantiationService>({});
		Reflect.set(instantiationService, 'createInstance', (_ctor: object, container: HTMLElement, options: { readonly activeSession: IObservable<ISession | undefined>; readonly onDidChangeSessionHoverVisibility: (visible: boolean) => void }) => {
			const list = new TestCommandCenterList(container, options);
			lists.push(list);
			return list;
		});
		const contextViewService = new TestContextViewService();
		const layoutContainer = targetWindow.document.createElement('div');
		targetWindow.document.body.append(layoutContainer);
		disposables.add(toDisposable(() => layoutContainer.remove()));
		const onDidLayoutContainer = disposables.add(new Emitter<{ readonly container: HTMLElement; readonly dimension: { readonly width: number; readonly height: number } }>());
		const onDidShowContextMenu = disposables.add(new Emitter<void>());
		const onDidHideContextMenu = disposables.add(new Emitter<void>());
		const hoverState = { hideCount: 0 };
		const hoverService = upcastPartial<IHoverService>({
			hideHover: () => hoverState.hideCount++,
			setupDelayedHover: () => Disposable.None,
			setupManagedHover: () => ({ ...Disposable.None, show: () => { }, hide: () => { }, update: () => { } }),
		});
		const widget = disposables.add(new SessionsTitleBarWidget(
			new SubmenuItemAction({
				submenu: AgentsWindowMenus.TitleBarSessionTitle,
				title: 'Show Sessions',
			}, undefined, []),
			undefined,
			sessionActionFeedback,
			upcastPartial<BlockedSessionsIndicatorModel>({
				onDidRequestBlink: Event.None,
				blockedSessions,
				unacknowledgedBlockedSessions,
				reminderSessions,
				attentionSessionCount,
				requiresInputKind: constObservable(undefined),
				consumePendingBlink: () => false,
				getRequiresInputLabel: count => `${count} session requires input`,
				dismissApproval: approved => dismissedApprovals.push(approved),
			}),
			upcastPartial<ISessionsManagementService>({
				onDidChangeSessions: sessionsChanged.event,
				onDidChangeSessionTypes: Event.None,
			}),
			upcastPartial<ISessionsService>({
				activePane: constObservable(upcastPartial<ISessionGridPane>({ session: activeSession })),
				getRecentlyOpenedSessions: () => recentlyOpened,
				openSession: async () => { },
			}),
			upcastPartial<ISessionHost>({
				kind: SessionHostKind.MainWindow,
				session: constObservable(undefined),
				chat: constObservable(undefined),
			}),
			upcastPartial<ISessionsProvidersService>({
				onDidChangeProviders: Event.None,
			}),
			upcastPartial<ICommandService>({
				executeCommand: async commandId => { commands.push(commandId); },
			}),
			contextViewService,
			upcastPartial<IWorkbenchLayoutService>({
				getContainer: () => layoutContainer,
				onDidLayoutContainer: onDidLayoutContainer.event,
			}),
			instantiationService,
			new MockContextKeyService(),
			upcastPartial<IQuickInputService>({
				onShow: Event.None,
			}),
			hoverService,
			upcastPartial<IBrowserWorkbenchEnvironmentService>({}),
			upcastPartial<IChatWindowService>({}),
			upcastPartial<IAccessibilityService>({
				isMotionReduced: () => motionReduced,
			}),
			upcastPartial<IContextMenuService>({
				onDidShowContextMenu: onDidShowContextMenu.event,
				onDidHideContextMenu: onDidHideContextMenu.event,
			}),
		));
		const container = targetWindow.document.createElement('div');
		targetWindow.document.body.append(container);
		disposables.add(toDisposable(() => container.remove()));
		widget.render(container);
		return { activeSession, attentionSessionCount, blockedEntry, blockedSessions, commands, container, contextViewService, dismissedApprovals, hoverState, layoutContainer, lists, onDidHideContextMenu, onDidLayoutContainer, onDidShowContextMenu, ordinarySession, previewArchived, previewRead, previewSession, previewStatus, recentlyOpened, reminderSessions, sessionActionFeedback, sessionsChanged, unacknowledgedBlockedSessions };
	}

	test('shows the initial attention notification, dismisses it in the blocked session, and reminds from another session', () => {
		const { attentionSessionCount, blockedEntry, blockedSessions, container, reminderSessions, unacknowledgedBlockedSessions } = createInteractionHarness();

		transaction(tx => {
			blockedSessions.set([blockedEntry], tx);
			unacknowledgedBlockedSessions.set([blockedEntry], tx);
			attentionSessionCount.set(1, tx);
		});
		const initialNotification = {
			ariaLabel: container.getAttribute('aria-label'),
			fullAttention: container.classList.contains('agent-sessions-titlebar-requires-input'),
			markerCount: container.querySelectorAll('.agent-sessions-titlebar-attention-reminder').length,
			text: container.textContent,
		};

		transaction(tx => {
			blockedSessions.set([], tx);
			unacknowledgedBlockedSessions.set([], tx);
		});
		const visible = {
			ariaLabel: container.getAttribute('aria-label'),
			fullAttention: container.classList.contains('agent-sessions-titlebar-requires-input'),
			markerCount: container.querySelectorAll('.agent-sessions-titlebar-attention-reminder').length,
			text: container.textContent,
		};

		transaction(tx => {
			blockedSessions.set([blockedEntry], tx);
			reminderSessions.set([blockedEntry], tx);
			attentionSessionCount.set(1, tx);
		});
		const reminder = {
			ariaLabel: container.getAttribute('aria-label'),
			fullAttention: container.classList.contains('agent-sessions-titlebar-requires-input'),
			markerCount: container.querySelectorAll('.agent-sessions-titlebar-attention-reminder').length,
			visibleCount: container.querySelector('.agent-sessions-titlebar-attention-reminder-count')?.textContent,
			usesSessionAttentionIcon: !!container.querySelector('.agent-sessions-titlebar-attention-reminder .codicon-sessions-session-attention-reminder'),
			sessionAttentionIconDefault: getIconRegistry().getIcon('sessions-session-attention-reminder')?.defaults,
		};

		transaction(tx => {
			attentionSessionCount.set(2, tx);
		});
		const reminderIncludingActiveSession = {
			ariaLabel: container.getAttribute('aria-label'),
			markerCount: container.querySelectorAll('.agent-sessions-titlebar-attention-reminder').length,
			visibleCount: container.querySelector('.agent-sessions-titlebar-attention-reminder-count')?.textContent,
		};

		assert.deepStrictEqual({ initialNotification, visible, reminder, reminderIncludingActiveSession }, {
			initialNotification: {
				ariaLabel: '1 session requires input',
				fullAttention: true,
				markerCount: 0,
				text: '1 session requires input',
			},
			visible: {
				ariaLabel: 'Show Sessions',
				fullAttention: false,
				markerCount: 0,
				text: '',
			},
			reminder: {
				ariaLabel: 'Show Sessions. Another session still requires attention',
				fullAttention: false,
				markerCount: 1,
				visibleCount: undefined,
				usesSessionAttentionIcon: true,
				sessionAttentionIconDefault: Codicon.reportQuestion,
			},
			reminderIncludingActiveSession: {
				ariaLabel: 'Show Sessions. 2 sessions still require attention',
				markerCount: 1,
				visibleCount: '2',
			},
		});
	});

	test('shows only blocked sessions for the initial alert and the full session list for a reminder', () => {
		const { blockedEntry, blockedSessions, container, lists, reminderSessions, unacknowledgedBlockedSessions } = createInteractionHarness(true);

		transaction(tx => {
			blockedSessions.set([blockedEntry], tx);
			unacknowledgedBlockedSessions.set([blockedEntry], tx);
		});
		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!.click();
		const initialAlertSessions = lists.at(-1)?.sessions.map(session => session.sessionId);
		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!.click();

		transaction(tx => {
			unacknowledgedBlockedSessions.set([], tx);
			reminderSessions.set([blockedEntry], tx);
		});
		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!.click();
		const reminderSessionsList = lists.at(-1)?.sessions.map(session => session.sessionId);

		assert.deepStrictEqual({ initialAlertSessions, reminderSessionsList }, {
			initialAlertSessions: ['preview'],
			reminderSessionsList: ['preview', 'ordinary'],
		});
	});

	test('switches an open dropdown between blocked and full session modes', () => {
		const { blockedEntry, blockedSessions, container, contextViewService, lists, reminderSessions, unacknowledgedBlockedSessions } = createInteractionHarness();

		transaction(tx => {
			blockedSessions.set([blockedEntry], tx);
			unacknowledgedBlockedSessions.set([blockedEntry], tx);
		});
		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!.click();
		const contextViewContainer = contextViewService.container;
		const initial = {
			sessions: lists[0].sessions.map(session => session.sessionId),
			focusCount: lists[0].focusCount,
		};

		transaction(tx => {
			blockedSessions.set([], tx);
			unacknowledgedBlockedSessions.set([], tx);
			reminderSessions.set([], tx);
		});
		const reminder = {
			sameContextView: contextViewService.container === contextViewContainer,
			sessions: lists[1].sessions.map(session => session.sessionId),
			focusCount: lists[1].focusCount,
		};

		transaction(tx => {
			blockedSessions.set([blockedEntry], tx);
			unacknowledgedBlockedSessions.set([blockedEntry], tx);
			reminderSessions.set([], tx);
		});
		const renewedAlert = {
			sameContextView: contextViewService.container === contextViewContainer,
			sessions: lists[2].sessions.map(session => session.sessionId),
			focusCount: lists[2].focusCount,
		};

		assert.deepStrictEqual({ initial, reminder, renewedAlert }, {
			initial: { sessions: ['preview'], focusCount: 1 },
			reminder: { sameContextView: true, sessions: ['preview', 'ordinary'], focusCount: 1 },
			renewedAlert: { sameContextView: true, sessions: ['preview'], focusCount: 1 },
		});
	});

	test('restores focus only within the command center window', () => {
		const iframe = mainWindow.document.body.appendChild(mainWindow.document.createElement('iframe'));
		disposables.add(toDisposable(() => iframe.remove()));
		const auxiliaryWindow = iframe.contentWindow!;
		ensureCodeWindow(auxiliaryWindow, 4242);
		disposables.add(registerWindow(auxiliaryWindow));
		const { container } = createInteractionHarness(true, auxiliaryWindow);
		const auxiliaryFocusTarget = auxiliaryWindow.document.body.appendChild(auxiliaryWindow.document.createElement('button'));
		const mainFocusTarget = mainWindow.document.body.appendChild(mainWindow.document.createElement('button'));
		disposables.add(toDisposable(() => {
			auxiliaryFocusTarget.remove();
			mainFocusTarget.remove();
		}));
		auxiliaryFocusTarget.focus();
		mainFocusTarget.focus();

		container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!.click();

		assert.deepStrictEqual({
			focusStayedInAuxiliaryWindow: mainWindow.document.activeElement === iframe,
			auxiliaryActiveElement: auxiliaryWindow.document.activeElement?.tagName,
			mainWindowFocusRestored: mainWindow.document.activeElement === mainFocusTarget,
		}, {
			focusStayedInAuxiliaryWindow: true,
			auxiliaryActiveElement: 'BODY',
			mainWindowFocusRestored: false,
		});
	});

	test('does not replace an open context menu with a hover preview', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { container, contextViewService, lists, onDidHideContextMenu, onDidShowContextMenu } = createInteractionHarness();
		const contextMenu = contextViewService.showContextView({
			getAnchor: () => container,
			render: () => Disposable.None,
		});
		const contextMenuContainer = contextViewService.container;
		onDidShowContextMenu.fire();

		container.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(100);
		const whileMenuOpen = {
			sameContextView: contextViewService.container === contextMenuContainer,
			sessionListCount: lists.length,
		};

		contextMenu.close();
		onDidHideContextMenu.fire();
		container.dispatchEvent(new MouseEvent('mouseleave'));
		container.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(50);
		const afterNextEntry = {
			sessionListCount: lists.length,
			hasContextView: !!contextViewService.container,
		};

		assert.deepStrictEqual({ whileMenuOpen, afterNextEntry }, {
			whileMenuOpen: { sameContextView: true, sessionListCount: 0 },
			afterNextEntry: { sessionListCount: 1, hasContextView: true },
		});
	}));

	test('opens the searchable picker only for explicit activation when the preview is empty', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { commands, container, contextViewService, lists, recentlyOpened, sessionsChanged } = createInteractionHarness();
		recentlyOpened.recent.splice(0);
		sessionsChanged.fire({ added: [], removed: [], changed: [] });

		container.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(100);
		const afterHover = { commands: [...commands], listCount: lists.length, contextViewOpen: !!contextViewService.container };
		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!.click();
		container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		container.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));

		assert.deepStrictEqual({
			afterHover,
			afterExplicitActivation: { commands, listCount: lists.length, contextViewOpen: !!contextViewService.container },
		}, {
			afterHover: { commands: [], listCount: 0, contextViewOpen: false },
			afterExplicitActivation: {
				commands: [
					SHOW_SESSIONS_PICKER_COMMAND_ID,
					SHOW_SESSIONS_PICKER_COMMAND_ID,
					SHOW_SESSIONS_PICKER_COMMAND_ID,
				],
				listCount: 0,
				contextViewOpen: false,
			},
		});
	}));

	test('hosts and relayouts the dropdown in the command center window container', () => {
		const { container, contextViewService, layoutContainer, lists, onDidLayoutContainer } = createInteractionHarness();
		const otherContainer = mainWindow.document.createElement('div');
		mainWindow.document.body.append(otherContainer);
		disposables.add(toDisposable(() => otherContainer.remove()));

		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!.click();
		onDidLayoutContainer.fire({ container: otherContainer, dimension: { width: 100, height: 100 } });
		const afterOtherLayout = lists[0].widthUpdateCount;
		onDidLayoutContainer.fire({ container: layoutContainer, dimension: { width: 200, height: 200 } });

		assert.deepStrictEqual({
			host: contextViewService.container?.parentElement,
			afterOtherLayout,
			afterOwnLayout: lists[0].widthUpdateCount,
		}, {
			host: layoutContainer,
			afterOtherLayout: 0,
			afterOwnLayout: 1,
		});
	});

	test('marks the active session in the command-center list', () => {
		const { activeSession, container, lists, ordinarySession } = createInteractionHarness();
		activeSession.set(ordinarySession, undefined);

		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!.click();

		assert.strictEqual(lists.at(-1)?.activeSession.get()?.sessionId, 'ordinary');
	});

	test('keeps the active session in a capped command-center preview', () => {
		const { activeSession, container, lists, recentlyOpened } = createInteractionHarness();
		const sessions = Array.from({ length: 9 }, (_, index) => upcastPartial<ISession>({
			sessionId: `session-${index + 1}`,
			resource: URI.parse(`test:/session-${index + 1}`),
			status: constObservable(SessionStatus.Completed),
			isArchived: constObservable(false),
			isRead: constObservable(true),
		}));
		recentlyOpened.recent.splice(0, recentlyOpened.recent.length, ...sessions);
		activeSession.set(sessions[8], undefined);

		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!.click();

		assert.deepStrictEqual(lists[0].sessions.map(session => session.sessionId), [
			'session-1',
			'session-2',
			'session-3',
			'session-4',
			'session-5',
			'session-6',
			'session-7',
			'session-9',
		]);
	});

	test('reactively reorders and filters an open command-center preview', () => {
		const { container, lists, recentlyOpened, sessionsChanged } = createInteractionHarness();
		const status = observableValue('reactiveStatus', SessionStatus.Completed);
		const isRead = observableValue('reactiveRead', true);
		const isArchived = observableValue('reactiveArchived', false);
		const first = upcastPartial<ISession>({
			sessionId: 'first',
			resource: URI.parse('test:/first'),
			status: constObservable(SessionStatus.Completed),
			isArchived: constObservable(false),
			isRead: constObservable(true),
		});
		const reactive = upcastPartial<ISession>({
			sessionId: 'reactive',
			resource: URI.parse('test:/reactive'),
			status,
			isArchived,
			isRead,
		});
		recentlyOpened.recent.splice(0, recentlyOpened.recent.length, first, reactive);
		sessionsChanged.fire({ added: [], removed: [], changed: [] });

		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!.click();
		const snapshot = () => lists[0].sessions.map(session => session.sessionId);
		const initial = snapshot();
		isRead.set(false, undefined);
		const unread = snapshot();
		isArchived.set(true, undefined);
		const archived = snapshot();
		transaction(tx => {
			isArchived.set(false, tx);
			isRead.set(true, tx);
			status.set(SessionStatus.NeedsInput, tx);
		});

		assert.deepStrictEqual({
			initial,
			unread,
			archived,
			needsInput: snapshot(),
			listCount: lists.length,
		}, {
			initial: ['first', 'reactive'],
			unread: ['reactive', 'first'],
			archived: ['first'],
			needsInput: ['reactive', 'first'],
			listCount: 1,
		});
	});

	test('handles approvals from the ordinary command-center preview', () => {
		const { blockedEntry, blockedSessions, container, dismissedApprovals, lists, previewSession, reminderSessions, sessionActionFeedback } = createInteractionHarness();
		transaction(tx => {
			blockedSessions.set([blockedEntry], tx);
			reminderSessions.set([blockedEntry], tx);
		});
		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!.click();

		lists[0].approveSession(previewSession);

		assert.deepStrictEqual({
			dismissed: dismissedApprovals.map(approved => ({ sessionId: approved.session.sessionId, approvalId: approved.approvalId })),
			approvedCount: sessionActionFeedback.approvedCount.get(),
		}, {
			dismissed: [{ sessionId: 'preview', approvalId: 'approval' }],
			approvedCount: 1,
		});
	});

	test('hover previews sessions without moving focus and closes after the pointer leaves both surfaces', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { container, contextViewService, hoverState, lists } = createInteractionHarness();
		const state = () => ({
			open: !!contextViewService.container,
			expanded: container.getAttribute('aria-expanded'),
			highlighted: container.classList.contains('agent-sessions-titlebar-dropdown-open'),
			hideHoverCount: hoverState.hideCount,
			focusCount: lists.at(-1)?.focusCount,
		});

		const initial = {
			...state(),
			hasPopup: container.getAttribute('aria-haspopup'),
		};
		container.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(49);
		const beforeDelay = state();
		await timeout(1);
		const preview = state();

		container.dispatchEvent(new MouseEvent('mouseleave'));
		contextViewService.container!.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(500);
		const overList = state();

		contextViewService.container!.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(199);
		const duringCloseDelay = state();
		await timeout(1);
		const closing = {
			...state(),
			closing: lists[0].element.classList.contains('agent-sessions-command-center-list-closing'),
		};
		await timeout(99);
		const duringCloseAnimation = state();
		await timeout(1);
		const closed = state();

		assert.deepStrictEqual({ initial, beforeDelay, preview, overList, duringCloseDelay, closing, duringCloseAnimation, closed }, {
			initial: { open: false, expanded: 'false', highlighted: false, hideHoverCount: 0, focusCount: undefined, hasPopup: 'tree' },
			beforeDelay: { open: false, expanded: 'false', highlighted: false, hideHoverCount: 0, focusCount: undefined },
			preview: { open: true, expanded: 'true', highlighted: true, hideHoverCount: 1, focusCount: 0 },
			overList: { open: true, expanded: 'true', highlighted: true, hideHoverCount: 1, focusCount: 0 },
			duringCloseDelay: { open: true, expanded: 'true', highlighted: true, hideHoverCount: 1, focusCount: 0 },
			closing: { open: true, expanded: 'true', highlighted: true, hideHoverCount: 1, focusCount: 0, closing: true },
			duringCloseAnimation: { open: true, expanded: 'true', highlighted: true, hideHoverCount: 1, focusCount: 0 },
			closed: { open: false, expanded: 'false', highlighted: false, hideHoverCount: 1, focusCount: 0 },
		});
	}));

	test('hover preview stays open while a session summary hover is visible', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { container, contextViewService, lists } = createInteractionHarness();

		container.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(50);
		container.dispatchEvent(new MouseEvent('mouseleave'));
		contextViewService.container!.dispatchEvent(new MouseEvent('mouseleave'));
		lists[0].setSessionHoverVisible(true);
		await timeout(500);
		const overSummary = !!contextViewService.container;

		lists[0].setSessionHoverVisible(false);
		await timeout(301);

		assert.deepStrictEqual({
			overSummary,
			closed: !contextViewService.container,
		}, {
			overSummary: true,
			closed: true,
		});
	}));

	test('click pins a hover preview and a second click closes it', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { container, contextViewService, lists } = createInteractionHarness();
		const pill = container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!;

		container.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(50);
		pill.click();
		container.dispatchEvent(new MouseEvent('mouseleave'));
		contextViewService.container!.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(500);
		const pinned = {
			open: !!contextViewService.container,
			expanded: container.getAttribute('aria-expanded'),
			focusCount: lists[0].focusCount,
		};

		pill.click();
		const closing = {
			open: !!contextViewService.container,
			expanded: container.getAttribute('aria-expanded'),
			closing: lists[0].element.classList.contains('agent-sessions-command-center-list-closing'),
		};
		await timeout(100);

		assert.deepStrictEqual({
			pinned,
			closing,
			closed: {
				open: !!contextViewService.container,
				expanded: container.getAttribute('aria-expanded'),
			},
		}, {
			pinned: { open: true, expanded: 'true', focusCount: 1 },
			closing: { open: true, expanded: 'true', closing: true },
			closed: { open: false, expanded: 'false' },
		});
	}));

	test('clicking outside closes a pinned dropdown', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { container, contextViewService, lists } = createInteractionHarness();
		const pill = container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!;
		const outside = mainWindow.document.createElement('button');
		mainWindow.document.body.append(outside);
		disposables.add(toDisposable(() => outside.remove()));
		const dispatchContextViewClick = (target: HTMLElement) => {
			target.addEventListener('click', event => {
				contextViewService.delegate?.onDOMEvent?.(new StandardMouseEvent(mainWindow, event), target);
			}, { once: true });
			target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
		};

		pill.click();
		dispatchContextViewClick(lists[0].element);
		const afterInsideClick = {
			open: !!contextViewService.container,
			closing: lists[0].element.classList.contains('agent-sessions-command-center-list-closing'),
		};

		dispatchContextViewClick(outside);
		const afterOutsideClick = {
			open: !!contextViewService.container,
			closing: lists[0].element.classList.contains('agent-sessions-command-center-list-closing'),
		};
		await timeout(100);

		assert.deepStrictEqual({
			afterInsideClick,
			afterOutsideClick,
			closed: !contextViewService.container,
		}, {
			afterInsideClick: { open: true, closing: false },
			afterOutsideClick: { open: true, closing: true },
			closed: true,
		});
	}));

	test('re-entering the command center cancels the closing animation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { container, contextViewService, lists } = createInteractionHarness();

		container.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(50);
		container.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(200);
		const closing = lists[0].element.classList.contains('agent-sessions-command-center-list-closing');

		container.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(100);

		assert.deepStrictEqual({
			closing,
			reopened: {
				open: !!contextViewService.container,
				expanded: container.getAttribute('aria-expanded'),
				closing: lists[0].element.classList.contains('agent-sessions-command-center-list-closing'),
			},
		}, {
			closing: true,
			reopened: { open: true, expanded: 'true', closing: false },
		});
	}));

	test('keyboard activation pins a preview during its closing animation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { container, contextViewService, lists } = createInteractionHarness();

		container.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(50);
		container.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(200);
		const closing = lists[0].element.classList.contains('agent-sessions-command-center-list-closing');

		container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		await timeout(100);

		assert.deepStrictEqual({
			closing,
			pinned: {
				open: !!contextViewService.container,
				expanded: container.getAttribute('aria-expanded'),
				closing: lists[0].element.classList.contains('agent-sessions-command-center-list-closing'),
				focusCount: lists[0].focusCount,
			},
		}, {
			closing: true,
			pinned: {
				open: true,
				expanded: 'true',
				closing: false,
				focusCount: 1,
			},
		});
	}));

	test('reduced motion closes the dropdown immediately', () => {
		const { container, contextViewService, lists } = createInteractionHarness(true);
		const pill = container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')!;

		pill.click();
		pill.click();

		assert.deepStrictEqual({
			open: !!contextViewService.container,
			expanded: container.getAttribute('aria-expanded'),
			closing: lists[0].element.classList.contains('agent-sessions-command-center-list-closing'),
		}, {
			open: false,
			expanded: 'false',
			closing: false,
		});
	});

	test('keyboard activation opens a focused persistent sessions list', () => {
		const { container, contextViewService, lists } = createInteractionHarness();

		container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

		assert.deepStrictEqual({
			open: !!contextViewService.container,
			expanded: container.getAttribute('aria-expanded'),
			focusCount: lists[0].focusCount,
		}, {
			open: true,
			expanded: 'true',
			focusCount: 1,
		});
	});

	test('Alt-clicking a blocked session requests its main chat to the side', () => {
		const widget = Object.create(SessionsTitleBarWidget.prototype) as SessionsTitleBarWidget;
		const resource = URI.parse('test:///blocked');
		const session = upcastPartial<ISession>({ sessionId: 'blocked', resource });
		const options: IOpenSessionOptions[] = [];
		Reflect.set(widget, 'sessionsManagementService', upcastPartial<ISessionsManagementService>({
			getSession: () => session,
		}));
		Reflect.set(widget, 'sessionsService', upcastPartial<ISessionsService>({
			openSessionToSide: async (_session, openOptions) => {
				if (openOptions) {
					options.push(openOptions);
				}
			},
		}));

		openBlockedSession.call(widget, resource, true, true);

		assert.deepStrictEqual(options, [{ preserveFocus: true, source: 'sessionsList', forceMainChat: true }]);
	});

	test('in a chat window, a blocked session opens in that window, as a tab or beside its active chat, not in the main window', async () => {
		const widget = Object.create(SessionsTitleBarWidget.prototype) as SessionsTitleBarWidget;
		const resource = URI.parse('test:/blocked');
		const session = upcastPartial<ISession>({ sessionId: 'blocked', resource });
		const chatWindow = upcastPartial<IChatWindow>({ windowId: 7, chat: constObservable(URI.parse('test:/active')) });
		const opened: unknown[] = [];
		const pending: Promise<unknown>[] = [];
		const sessionsService = upcastPartial<ISessionsService>({
			slotPanes: constObservable([]),
			openSession: async () => { opened.push('main window'); },
			openSessionToSide: async () => { opened.push('main window to the side'); },
		});
		// The main window shows another session: no editors of its own go along
		const services = new Map<ServiceIdentifier<unknown>, unknown>([
			[IChatWindowService, upcastPartial<IChatWindowService>({ open: async (chat, options) => { opened.push({ chat: chat.toString(), window: options?.window === chatWindow, preserveFocus: options?.preserveFocus, beside: options?.beside?.toString(), moveFrom: options?.editors?.moveFrom }); return undefined; } })],
			[ISessionsService, sessionsService],
			[IEditorGroupsService, upcastPartial<IEditorGroupsService>({})],
			[IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({})],
			[ISessionHostService, upcastPartial<ISessionHostService>({ getHostOfWindow: () => upcastPartial<ISessionHost>({ session: constObservable(undefined), chat: constObservable(undefined) }) })],
			[ISessionEditorWorkingSetService, new SessionEditorWorkingSetService()],
		]);
		const accessor: ServicesAccessor = { get: <T>(id: ServiceIdentifier<T>) => services.get(id) as T };
		Reflect.set(widget, '_windowHost', upcastPartial<ISessionHost>({ kind: SessionHostKind.ChatWindow, parent: undefined, windowId: constObservable(7) }));
		Reflect.set(widget, 'chatWindowService', upcastPartial<IChatWindowService>({ getWindow: windowId => windowId === 7 ? chatWindow : undefined }));
		Reflect.set(widget, 'sessionsManagementService', upcastPartial<ISessionsManagementService>({ getSession: () => session }));
		Reflect.set(widget, 'sessionsService', sessionsService);
		Reflect.set(widget, 'instantiationService', upcastPartial<IInstantiationService>({
			invokeFunction: (<R>(fn: (accessor: ServicesAccessor) => R) => { const result = fn(accessor); pending.push(Promise.resolve(result)); return result; }) as IInstantiationService['invokeFunction'],
		}));

		openBlockedSession.call(widget, resource, false, false);
		openBlockedSession.call(widget, resource, true, true);
		await Promise.all(pending);

		assert.deepStrictEqual(opened, [
			{ chat: 'test:/blocked', window: true, preserveFocus: false, beside: undefined, moveFrom: [] },
			{ chat: 'test:/blocked', window: true, preserveFocus: true, beside: 'test:/active', moveFrom: [] },
		]);
	});

	test('uses only the workspace context in the command center', () => {
		const widget = Object.create(SessionsTitleBarWidget.prototype) as SessionsTitleBarWidget;
		Reflect.set(widget, '_workspaceInfo', { label: 'vscode-tools' });
		Reflect.set(widget, '_windowHost', upcastPartial<ISessionHost>({ session: constObservable(undefined) }));
		Reflect.set(widget, '_isQuickChat', false);
		Reflect.set(widget, '_sessionTitle', undefined);
		const workspaceTitle = getCommandCenterTitle.call(widget);
		Reflect.set(widget, '_sessionTitle', 'Custom context');
		const customContextTitle = getCommandCenterTitle.call(widget);
		Reflect.set(widget, '_sessionTitle', undefined);
		Reflect.set(widget, '_workspaceInfo', undefined);
		Reflect.set(widget, '_isQuickChat', true);
		const quickChatTitle = getCommandCenterTitle.call(widget);
		Reflect.set(widget, '_isQuickChat', false);
		const emptyTitle = getCommandCenterTitle.call(widget);

		assert.deepStrictEqual({ workspaceTitle, customContextTitle, quickChatTitle, emptyTitle }, {
			workspaceTitle: 'vscode-tools',
			customContextTitle: 'Custom context',
			quickChatTitle: 'No workspace',
			emptyTitle: undefined,
		});
	});

	test('renders worktree branch context in the command center', () => {
		const container = mainWindow.document.createElement('div');
		const dynamicDisposables = disposables.add(new DisposableStore());
		const widget = Object.create(SessionsTitleBarWidget.prototype) as SessionsTitleBarWidget;
		Reflect.set(widget, '_container', container);
		Reflect.set(widget, '_dynamicDisposables', dynamicDisposables);
		Reflect.set(widget, '_workspaceInfo', {
			label: 'vscode',
			icon: Codicon.worktreeCompact,
			workingDirectoryPath: '/src/vscode.worktrees/feature',
			branch: 'feature/session-branch',
			worktreePending: false,
		});
		Reflect.set(widget, '_isQuickChat', false);
		Reflect.set(widget, '_sessionTitle', undefined);
		const hoverDelegate: IHoverDelegate = { placement: 'element', delay: 500, showHover: () => undefined };
		const hovers: { target: HTMLElement; content: () => string | undefined; sharedDelegate: boolean }[] = [];
		Reflect.set(widget, 'options', { hoverDelegate });
		Reflect.set(widget, 'hoverService', upcastPartial<IHoverService>({
			setupManagedHover: (delegate, target, content) => {
				hovers.push({
					target,
					content: typeof content === 'function' ? content as () => string | undefined : () => typeof content === 'string' ? content : undefined,
					sharedDelegate: delegate === hoverDelegate,
				});
				return { ...Disposable.None, show: () => { }, hide: () => { }, update: () => { } };
			},
		}));

		renderActiveSession.call(widget);
		const workspaceHover = hovers.find(hover => hover.target.classList.contains('agent-sessions-titlebar-workspace'))!;
		const branchHover = hovers.find(hover => hover.target.classList.contains('agent-sessions-titlebar-branch'))!;
		Object.defineProperties(workspaceHover.target, {
			clientWidth: { configurable: true, value: 100 },
			scrollWidth: { configurable: true, value: 100 },
		});
		Object.defineProperties(branchHover.target, {
			clientWidth: { configurable: true, value: 80 },
			scrollWidth: { configurable: true, value: 160 },
		});

		assert.deepStrictEqual({
			ariaLabel: container.getAttribute('aria-label'),
			text: container.textContent,
			separators: container.querySelectorAll('.agent-sessions-titlebar-separator').length,
			workspaceIcon: !!container.querySelector('.codicon-worktree-compact'),
			branchIcon: !!container.querySelector('.codicon-git-branch-compact'),
			branch: container.querySelector('.agent-sessions-titlebar-branch')?.textContent,
			hovers: hovers.map(hover => ({ content: hover.content(), sharedDelegate: hover.sharedDelegate })),
			nativeTitles: container.querySelectorAll('[title]').length,
		}, {
			ariaLabel: 'Show Sessions: vscode, branch feature/session-branch',
			text: 'vscode·feature/session-branch',
			separators: 1,
			workspaceIcon: true,
			branchIcon: true,
			branch: 'feature/session-branch',
			hovers: [
				{ content: undefined, sharedDelegate: true },
				{ content: 'feature/session-branch', sharedDelegate: true },
			],
			nativeTitles: 0,
		});
	});
});
