/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { Direction, ISerializableView } from '../../../../../base/browser/ui/grid/grid.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { assert } from '../../../../../base/common/assert.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { autorun, constObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IChatWidgetFixtureHandle, renderChatWidget } from '../../../../../workbench/test/browser/componentFixtures/chat/chatWidget.fixture.js';
import { renderEditorTabsFixture } from '../../../../../workbench/test/browser/componentFixtures/editor/tabs.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { AgentsPartCard, getAgentsPartCardContentSize, getSidePaneBottomFrameInset } from '../../../../browser/parts/agentsPartCard.js';
import { AbstractChatView, ChatViewKind } from '../../../../browser/parts/chatView.js';
import { GRID_GAP_SASH_CLASS } from '../../../../browser/parts/gridGap.js';
import { ISessionsChatBackground } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import { IChatViewFactory } from '../../../../services/chatView/browser/chatViewFactory.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, IChat, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { createTestActiveSession } from '../../../../test/browser/sessionViewTestUtils.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../../common/layoutConstants.js';
import { SessionsChatTabsMode } from '../../../../common/sessionConfig.js';
import { createSessionsWorkbenchFixture } from './sessionsWorkbenchFixtureUtils.js';

import '../../../../browser/media/style.css';
import '../../../../browser/parts/media/editorPart.css';
import '../../browser/media/chatView.css';

class FixtureChatView extends AbstractChatView {
	private chat: IChat | undefined;
	private dimensions = { width: 0, height: 0 };
	private widget: IChatWidgetFixtureHandle | undefined;

	constructor(readonly kind: ChatViewKind, private readonly context: ComponentFixtureContext) {
		super();
	}

	override setChat(chat: IChat): void { this.chat = chat; }
	override setVisible(visible: boolean): void { this.widget?.listWidget.setVisible(visible); }
	override toJSON(): object { return {}; }
	override focus(): void {
		if (this.widget) {
			this.context.focus(this.widget.inputPart);
		}
	}

	async render(): Promise<void> {
		assert(this.chat !== undefined, 'Expected a bound chat');
		const { width, height } = this.dimensions;
		assert(width > 0 && height > 0, 'Expected a laid-out chat');
		await renderChatWidget({ ...this.context, container: this.element, disposableStore: this._store }, {
			width,
			height,
			useAuxiliaryBarWrapper: false,
			messages: [{
				user: `Review ${this.chat.title.get().toLowerCase()}.`,
				assistant: [{ kind: 'markdown', text: 'The implementation keeps the existing behavior. The focused tests pass.' }],
			}],
			onRendered: widget => {
				this.widget = widget;
				widget.inputPart.inputEditor.updateOptions({ cursorBlinking: 'solid' });
			},
		});
		this.element.style.backgroundColor = 'transparent';
		this.doLayout(width, height);
	}

	protected override doLayout(width: number, height: number): void {
		this.dimensions = { width, height };
		if (this.widget) {
			this.widget.inputPart.setMaxHeight(height / 2);
			this.widget.inputPart.layout(width);
			this.widget.listWidget.layout(Math.max(0, height - this.widget.inputPart.height.get()), width);
		}
	}
}

/** Cloud sessions keep the production chrome independent of local tasks, authentication, and network access. */
type MultipleChatsLayout = 'sideBySide' | 'stackedLeft' | 'bottomRight' | 'mixedRelated';

const SIDE_PANE_WIDTH = 360;
const BOTTOM_PANEL_HEIGHT = 240;
const FIXTURE_CHAT_BACKGROUND = {
	kind: 'image',
	backgroundImage: 'linear-gradient(135deg, color-mix(in srgb, var(--vscode-textLink-foreground) 18%, transparent), transparent 55%)',
	backgroundRepeat: 'repeat',
	backgroundSize: '96px 96px',
	backgroundPosition: 'left top',
} satisfies ISessionsChatBackground;

function createSidePaneFixture(context: ComponentFixtureContext, showTabs: 'multiple' | 'single'): { readonly view: ISerializableView; readonly connectedFrame: HTMLElement; readonly pillFrame: HTMLElement } {
	const element = $('.sessions-grid-side-pane-fixture');
	renderEditorTabsFixture({ ...context, container: element }, {
		modernUI: true,
		width: SIDE_PANE_WIDTH - AgentsPartCard.BORDER_WIDTH * 2,
		partOptions: { showTabs },
		editors: [{ resource: URI.file('/Changes'), icon: Codicon.diffMultiple, pinned: true, active: true }],
	});
	const editor = element.querySelector<HTMLElement>('.part.editor');
	const content = element.querySelector<HTMLElement>('.part.editor > .content');
	const frame = element.querySelector<HTMLElement>('.editor-group-container');
	const title = element.querySelector<HTMLElement>('.editor-group-container > .title');
	const editorContainer = element.querySelector<HTMLElement>('.editor-container');
	assert(editor !== null && content !== null && frame !== null && title !== null && editorContainer !== null, 'Expected a rendered connected side pane');
	editorContainer.textContent = '3 files changed';

	return {
		connectedFrame: frame,
		pillFrame: editor,
		view: {
			element,
			minimumWidth: 240,
			maximumWidth: Number.POSITIVE_INFINITY,
			minimumHeight: 200,
			maximumHeight: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: (width, height) => {
				element.style.width = `${width}px`;
				element.style.height = `${height}px`;
				editor.style.width = '100%';
				editor.style.height = '100%';
				const contentWidth = Math.max(0, width - AgentsPartCard.BORDER_WIDTH * 2);
				const contentHeight = Math.max(0, height - AgentsPartCard.BORDER_WIDTH * 2 - getSidePaneBottomFrameInset(context.container));
				content.style.width = `${contentWidth}px`;
				content.style.height = `${contentHeight}px`;
				frame.style.width = `${contentWidth}px`;
				frame.style.height = `${contentHeight}px`;
				editorContainer.style.height = `${Math.max(0, contentHeight - title.offsetHeight)}px`;
			},
			toJSON: () => ({}),
		},
	};
}

function createBottomPanelFixture(): { readonly view: ISerializableView; readonly frame: HTMLElement } {
	const element = $('.part.panel.basepanel.bottom.sessions-grid-bottom-panel-fixture');
	append(element, $('.content'));

	return {
		frame: element,
		view: {
			element,
			minimumWidth: 300,
			maximumWidth: Number.POSITIVE_INFINITY,
			minimumHeight: 77,
			maximumHeight: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: (_width, height) => {
				element.style.height = `calc(${height}px - var(--agents-floating-panel-gap) + var(--agents-session-frame-inset))`;
			},
			toJSON: () => ({}),
		},
	};
}

async function renderSessionsGrid(context: ComponentFixtureContext, options: { bottomPanel?: boolean; chatTabsMode?: SessionsChatTabsMode; compactDensity?: boolean; connectedEditorTabs?: boolean; customBackground?: boolean; direction?: 'rtl'; macWindowCorners?: boolean; maximized?: boolean; multipleChats?: MultipleChatsLayout; relatedChats?: boolean; sideBySide?: boolean; sidePaneShowTabs?: 'multiple' | 'single'; sidePanel?: boolean } = {}): Promise<void> {
	if (options.direction === 'rtl') {
		context.container.dir = 'rtl';
	}
	if (options.macWindowCorners) {
		context.container.classList.add('mac', 'macos-tahoe');
	}

	const workspace = constObservable<ISessionWorkspace>({
		uri: URI.parse('https://github.com/microsoft/vscode'),
		label: 'microsoft/vscode',
		icon: Codicon.repo,
		folders: [],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: true,
	});
	const titles = options.compactDensity ? ['Codicon count', 'Add Spanish README section'] : ['Grid layout', 'Session lifecycle', 'Keyboard navigation'];
	const multipleChatsIndex = options.compactDensity ? 1 : options.multipleChats === 'bottomRight' ? 2 : 0;
	const sessions = (options.sideBySide ? titles.slice(0, 2) : titles).map((title, index) => {
		const session = createTestActiveSession(`fixture-${index}`);
		const chat: IChat = { ...session.mainChat.get(), workspace, title: constObservable(title) };
		const sessionChats: readonly IChat[] = options.multipleChats && index === multipleChatsIndex
			? [chat, {
				...chat,
				resource: chat.resource.with({ path: '/regression-tests' }),
				title: constObservable('Regression tests'),
				origin: options.relatedChats || options.multipleChats === 'mixedRelated' ? { kind: ChatOriginKind.SideChat, parentChat: chat.resource } : undefined,
			}, ...(options.multipleChats === 'mixedRelated' ? [{
				...chat,
				resource: chat.resource.with({ path: '/documentation' }),
				title: constObservable('Documentation'),
			}] : [])]
			: [chat];
		return {
			...session,
			workspace,
			title: constObservable(title),
			sticky: observableValue(session, index === 0),
			mainChat: constObservable(chat),
			activeChat: observableValue(session, chat),
			chats: constObservable(sessionChats),
			openChats: constObservable(sessionChats),
			visibleChatTabs: constObservable(sessionChats),
			shouldShowChatTabs: constObservable(false),
		};
	});
	const [left, top, bottom] = sessions;
	const multipleChatsSession = options.multipleChats ? sessions[multipleChatsIndex] : undefined;
	const sessionsService = new class extends mock<ISessionsService>() {
		override readonly activeSession = observableValue<IActiveSession | undefined>(this, left);
		override readonly visibleSessions = observableValue<readonly IActiveSession[]>(this, sessions);
		override setActive(session: IActiveSession | undefined): void {
			this.activeSession.set(session, undefined);
		}
		override toggleSessionStickiness(session: ISession): void {
			const target = sessions.find(candidate => candidate.sessionId === session.sessionId);
			assert(target !== undefined);
			target.sticky.set(!target.sticky.get(), undefined);
		}
		override closeSession(session: ISession | undefined): void {
			const remaining = this.visibleSessions.get().filter(candidate => candidate !== session);
			transaction(tx => {
				this.visibleSessions.set(remaining, tx);
				if (this.activeSession.get() === session) {
					this.activeSession.set(remaining[0], tx);
				}
			});
		}
		override async openChat(session: ISession, resource: URI): Promise<void> {
			const target = sessions.find(candidate => candidate.sessionId === session.sessionId);
			const chat = target?.chats.get().find(candidate => candidate.resource.toString() === resource.toString());
			assert(target !== undefined && chat !== undefined, 'Expected an existing fixture chat');
			target.activeChat.set(chat, undefined);
		}
	}();
	const sidePaneShowTabs = options.sidePaneShowTabs ?? 'multiple';
	const sidePane = options.sidePanel ? createSidePaneFixture(context, sidePaneShowTabs) : undefined;
	const bottomPanel = options.bottomPanel ? createBottomPanelFixture() : undefined;
	const { part, grid, layout, instantiationService } = createSessionsWorkbenchFixture(context, 1440, 900, sessionsService, {
		sidePane: sidePane?.view,
		sidePaneWidth: SIDE_PANE_WIDTH,
		bottomPanel: bottomPanel?.view,
		bottomPanelHeight: BOTTOM_PANEL_HEIGHT,
		chatBackground: options.customBackground ? FIXTURE_CHAT_BACKGROUND : undefined,
		chatTabsMode: options.chatTabsMode,
		compactDensity: options.compactDensity,
		connectedEditorTabs: options.connectedEditorTabs,
		sidePaneShowTabs,
	});
	const chats: FixtureChatView[] = [];
	instantiationService.stub(IChatViewFactory, new class extends mock<IChatViewFactory>() {
		override createNewChatView(isNewChatInSession: boolean): AbstractChatView {
			return new FixtureChatView(isNewChatInSession ? 'newChatInSession' : 'newSession', context);
		}
		override createChatView(): AbstractChatView {
			const view = new FixtureChatView('chat', context);
			chats.push(view);
			return view;
		}
	}());
	const slots = options.compactDensity
		? [
			{ id: left.sessionId },
			{ id: top.sessionId, placement: { reference: left.sessionId, direction: Direction.Down } },
		]
		: [
			{ id: left.sessionId },
			{ id: top.sessionId },
			...(bottom ? [{ id: bottom.sessionId, placement: { reference: top.sessionId, direction: Direction.Down } }] : []),
		];
	context.disposableStore.add(autorun(reader => {
		const visible = sessionsService.visibleSessions.read(reader);
		part.updateVisibleSessions(visible, sessionsService.activeSession.read(reader), slots.filter(slot => visible.some(session => session.sessionId === slot.id)));
	}));
	layout();
	const sidePaneDivider = sidePane
		? Array.from(grid.element.querySelectorAll<HTMLElement>('.monaco-sash.vertical'))
			.find(sash => sash.closest('.monaco-grid-view') === grid.element)
		: undefined;
	if (sidePane) {
		assert(sidePaneDivider !== undefined, 'Expected a Sessions/side-pane divider');
		sidePaneDivider.classList.add('sessions-side-pane-divider');
	}
	const sidePaneFrame = sidePane
		? options.connectedEditorTabs !== false && sidePaneShowTabs === 'multiple' ? sidePane.connectedFrame : sidePane.pillFrame
		: undefined;
	if (bottom) {
		const sideBySideChats = options.multipleChats === 'sideBySide' || options.multipleChats === 'mixedRelated';
		part.resizeSession(left.sessionId, sideBySideChats ? Direction.Right : Direction.Left, sideBySideChats ? 180 : 120);
		part.resizeSession(top.sessionId, options.multipleChats === 'bottomRight' ? Direction.Up : Direction.Down, 40);
	}
	if (options.multipleChats === 'sideBySide') {
		assert(multipleChatsSession !== undefined, 'Expected a split-chat session');
		part.getSessionView(multipleChatsSession.sessionId)!.splitChatToSide(multipleChatsSession.chats.get()[1].resource);
		await Promise.resolve();
	} else if (options.multipleChats === 'stackedLeft') {
		assert(multipleChatsSession !== undefined, 'Expected a split-chat session');
		part.getSessionView(multipleChatsSession.sessionId)!.splitActiveChat('bottom');
		await Promise.resolve();
	} else if (options.multipleChats === 'bottomRight') {
		assert(multipleChatsSession !== undefined, 'Expected a split-chat session');
		part.getSessionView(multipleChatsSession.sessionId)!.splitActiveChat('bottom');
		await Promise.resolve();
	} else if (options.multipleChats === 'mixedRelated') {
		assert(multipleChatsSession !== undefined, 'Expected a split-chat session');
		const sessionView = part.getSessionView(multipleChatsSession.sessionId)!;
		sessionView.splitActiveChat('right');
		await Promise.resolve();
		await sessionsService.openChat(multipleChatsSession, multipleChatsSession.chats.get()[2].resource);
		sessionView.splitActiveChat('bottom');
		await Promise.resolve();
	}
	await Promise.all(chats.map(chat => chat.render()));
	if (options.multipleChats === 'sideBySide' && options.connectedEditorTabs !== false) {
		const activeTabs = [...context.container.querySelectorAll<HTMLElement>('.session-chat-tabs-bar .chat-composite-bar-tab.active:first-child:not(.connected-tab-hidden)')]
			.filter(tab => tab.getBoundingClientRect().width > 0);
		for (const tab of activeTabs) {
			const fill = tab.querySelector<HTMLElement>('.chat-composite-bar-tab-fill');
			const label = tab.querySelector<HTMLElement>('.chat-composite-bar-tab-label');
			const tabList = tab.parentElement;
			assert(fill !== null && label !== null && tabList !== null, 'Expected an active connected chat tab');
			const rtl = mainWindow.getComputedStyle(tab).direction === 'rtl';
			const shoulder = mainWindow.getComputedStyle(fill, rtl ? '::before' : '::after');
			const oppositeShoulder = mainWindow.getComputedStyle(fill, rtl ? '::after' : '::before');
			const fillBounds = fill.getBoundingClientRect();
			const tabListBounds = tabList.getBoundingClientRect();
			const availableSpace = rtl ? fillBounds.left - tabListBounds.left : tabListBounds.right - fillBounds.right;
			const labelRange = mainWindow.document.createRange();
			labelRange.selectNodeContents(label);
			const labelTextWidth = labelRange.getBoundingClientRect().width;
			const labelStyle = mainWindow.getComputedStyle(label);
			const labelBounds = label.getBoundingClientRect();
			const endPadding = Number.parseFloat(labelStyle.paddingInlineEnd);
			const startPadding = Number.parseFloat(labelStyle.paddingInlineStart);
			const labelTextBounds = labelRange.getBoundingClientRect();
			const tabsRow = tab.closest('.chat-composite-bar-tabs-row');
			assert(tabsRow !== null, 'Expected a connected chat tabs row');
			const connectedEdge = tab.querySelector<HTMLElement>('.tab-connected-edge');
			assert(connectedEdge !== null, 'Expected a connected chat tab edge');
			const connectedEdgeStyle = mainWindow.getComputedStyle(connectedEdge);
			const overflowEdge = tabsRow.querySelector<HTMLElement>('.tab-connected-overflow-edge.connected-tab-right-clipped');
			const overflowRight = overflowEdge?.querySelector<HTMLElement>('.tab-connected-overflow-right');
			const expectedLabelPadding = 0;
			const textStartBuffer = rtl ? labelBounds.right - labelTextBounds.right : labelTextBounds.left - labelBounds.left;
			const textEndBuffer = rtl ? labelTextBounds.left - labelBounds.left : labelBounds.right - labelTextBounds.right;
			assert(
				shoulder.content === '""'
				&& oppositeShoulder.content === 'none'
				&& availableSpace >= Number.parseFloat(shoulder.width) - 1 / 64
				&& startPadding === expectedLabelPadding
				&& endPadding === expectedLabelPadding
				&& label.getBoundingClientRect().width >= labelTextWidth + startPadding + endPadding - 1 / 64
				&& textStartBuffer >= startPadding - 1 / 64
				&& textEndBuffer >= endPadding - 1 / 64
				&& (!rtl || (
					mainWindow.getComputedStyle(fill).borderStartStartRadius !== '0px'
					&& connectedEdgeStyle.clipPath.startsWith('polygon(')
					&& connectedEdgeStyle.borderInlineStartWidth !== '0px'
					&& connectedEdgeStyle.borderInlineEndWidth !== '0px'
					&& overflowEdge !== null
					&& mainWindow.getComputedStyle(overflowEdge, '::after').display === 'none'
					&& overflowRight !== undefined && overflowRight !== null
					&& mainWindow.getComputedStyle(overflowRight).display === 'none'
					&& Math.abs(fillBounds.right - tabListBounds.right) < 1 / 64
					&& Math.abs(fill.getBoundingClientRect().bottom - tabsRow.getBoundingClientRect().bottom) < 1 / 64
				)),
				'Expected the active connected chat tab to fit its label, retain its shoulder border, and meet its inline-end edge without a terminal shoulder'
			);
		}
	}
	context.disposableStore.add(part.onDidFocusSession(id => sessionsService.setActive(sessions.find(session => session.sessionId === id))));
	if (options.maximized) {
		part.toggleMaximizeSession(left.sessionId);
	}
	const sizes = sessions.map(session => {
		const element = part.getSessionView(session.sessionId)!.element;
		return { width: element.offsetWidth, height: element.offsetHeight };
	});
	const expectedChatGroupCount = options.multipleChats ? options.multipleChats === 'mixedRelated' ? 3 : 2 : 0;
	const gridGapSashes = Array.from(context.container.querySelectorAll<HTMLElement>(`.${GRID_GAP_SASH_CLASS}`));
	const expectedGridGapSashes = options.compactDensity ? 0 : (options.maximized ? 0 : sessions.length - 1) + Math.max(0, expectedChatGroupCount - 1);
	assert(gridGapSashes.length === expectedGridGapSashes, 'Expected every session and split-chat gutter to have a gripper');
	for (const sash of gridGapSashes) {
		const grip = mainWindow.getComputedStyle(sash, '::after');
		const bounds = sash.getBoundingClientRect();
		assert(
			grip.content === '""'
			&& Math.abs(parseFloat(grip.left) - bounds.width / 2) < 0.01
			&& Math.abs(parseFloat(grip.top) - bounds.height / 2) < 0.01,
			'Expected every grid gripper to be centered on its sash'
		);
	}
	const sessionsCard = context.container.querySelector<HTMLElement>('.part.sessionspart.agents-part-card');
	assert(sessionsCard !== null, 'Expected a Sessions card');
	if (!options.compactDensity) {
		assert(mainWindow.getComputedStyle(sessionsCard).backgroundClip === 'padding-box', 'Expected no enclosing Sessions-group stroke');
	}
	if (options.compactDensity) {
		const sessionGrid = sessionsCard.querySelector<HTMLElement>('.session-grid');
		const separators = sessionGrid
			? [...sessionGrid.querySelectorAll<HTMLElement>('.monaco-split-view2.separator-border > .monaco-scrollable-element > .split-view-container > .split-view-view:not(:first-child)')]
			: [];
		const separatorColors = separators.map(separator => mainWindow.getComputedStyle(separator, '::before').backgroundColor);
		const rootSplit = sessionGrid?.querySelector<HTMLElement>(':scope > .monaco-grid-view > .monaco-grid-branch-node > .monaco-split-view2.vertical.separator-border');
		const rootSeparator = rootSplit?.querySelector<HTMLElement>(':scope > .monaco-scrollable-element > .split-view-container > .split-view-view:nth-child(2)');
		const rootSeparatorStyle = rootSeparator ? mainWindow.getComputedStyle(rootSeparator, '::before') : undefined;
		assert(
			sessionGrid !== null
			&& separators.length === sessions.length + Math.max(0, expectedChatGroupCount - 1) - 1
			&& separatorColors.every(color => color !== 'rgba(0, 0, 0, 0)')
			&& rootSeparatorStyle !== undefined
			&& rootSeparatorStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
			&& rootSeparatorStyle.height === '1px',
			'Expected the compact full-width session boundary and every nested chat boundary to retain a visible separator'
		);
	}
	if (options.customBackground) {
		const background = sessionsCard.querySelector<HTMLElement>('.sessions-chat-background');
		const leaves = [...sessionsCard.querySelectorAll<HTMLElement>('.session-grid-leaf')];
		const sessionViews = [...sessionsCard.querySelectorAll<HTMLElement>('.session-view')];
		assert(
			sessionsCard.classList.contains('has-chat-background')
			&& background !== null
			&& !background.hidden
			&& mainWindow.getComputedStyle(background).backgroundImage !== 'none'
			&& leaves.every(leaf => mainWindow.getComputedStyle(leaf).backgroundColor === 'rgba(0, 0, 0, 0)')
			&& sessionViews.every(view => mainWindow.getComputedStyle(view).backgroundColor === 'rgba(0, 0, 0, 0)'),
			'Expected the custom background to remain visible inside every gapped session panel'
		);
	}
	if (options.maximized) {
		const allocation = grid.getViewSize(part);
		const contentSize = getAgentsPartCardContentSize(allocation.width, allocation.height, false, false, false);
		assert(sizes[0].width === contentSize.width && sizes[0].height === contentSize.height && sizes.slice(1).every(size => size.width === 0 && size.height === 0), 'Expected only the maximized pane to be visible');
	} else if (options.sideBySide) {
		assert(sizes.length === 2 && sizes.every(size => size.width > 0 && size.height === sizes[0].height), 'Expected two full-height side-by-side sessions');
	} else if (options.compactDensity) {
		const sessionGrid = sessionsCard.querySelector<HTMLElement>('.session-grid');
		assert(sessionGrid !== null, 'Expected a compact session grid');
		assert(sizes.length === 2 && sizes.every(size => size.width === sessionGrid.offsetWidth) && sizes[0].height + sizes[1].height === sessionGrid.offsetHeight, 'Expected two flush full-width compact sessions');
	} else {
		assert(options.multipleChats === 'sideBySide' || options.multipleChats === 'mixedRelated' ? sizes[0].width > sizes[1].width : sizes[0].width < sizes[1].width, 'Expected the intended session widths');
		const intendedNestedSplit = options.multipleChats === 'bottomRight' ? sizes[1].height < sizes[2].height : sizes[1].height > sizes[2].height;
		assert(sizes[0].height === sizes[1].height + sizes[2].height + AGENTS_FLOATING_PANEL_GAP && intendedNestedSplit, 'Expected unequal nested splits with the configured session gap');
	}
	if (options.multipleChats) {
		assert(multipleChatsSession !== undefined, 'Expected a split-chat session');
		const splitSession = multipleChatsSession;
		const sessionView = part.getSessionView(splitSession.sessionId)!.element;
		const chatGroups = sessionView.querySelector<HTMLElement>('.chat-groups-view');
		const groups = [...sessionView.querySelectorAll<HTMLElement>('.chat-group-view')];
		const surfaces = [...sessionView.querySelectorAll<HTMLElement>('.chat-group-view-surface')];
		const surfaceFrames = surfaces.map(surface => mainWindow.getComputedStyle(surface, '::after'));
		const parentFrame = mainWindow.getComputedStyle(sessionView, '::after');
		const insetTotals = groups.map(group => {
			const style = mainWindow.getComputedStyle(group);
			return parseFloat(style.borderTopWidth) + parseFloat(style.borderRightWidth) + parseFloat(style.borderBottomWidth) + parseFloat(style.borderLeftWidth);
		});
		if (options.compactDensity) {
			assert(
				chatGroups !== null
				&& groups.length === expectedChatGroupCount
				&& groups.every(group => group.offsetWidth > 0)
				&& surfaces.length === expectedChatGroupCount
				&& insetTotals.every(total => total === 0)
				&& chatGroups.querySelectorAll(`.${GRID_GAP_SASH_CLASS}`).length === 0
				&& !sessionView.classList.contains('independent-chat-groups')
				&& parentFrame.content === 'none'
				&& surfaceFrames.every(frame => frame.content === 'none'),
				'Expected compact split chats to collapse their gaps and use shared one-stroke separators'
			);
		} else {
			assert(
				chatGroups !== null
				&& groups.length === expectedChatGroupCount
				&& groups.every(group => group.offsetWidth > 0)
				&& surfaces.length === expectedChatGroupCount
				&& insetTotals.every(total => total > 0)
				&& chatGroups.querySelectorAll(`.${GRID_GAP_SASH_CLASS}`).length === expectedChatGroupCount - 1
				&& chatGroups.querySelectorAll('.chat-groups-view-boundary-segment').length === 0
				&& sessionView.classList.contains('independent-chat-groups')
				&& parentFrame.content === 'none'
				&& surfaceFrames.every(frame => frame.content === '""' && frame.borderTopWidth === '1px' && frame.borderRadius !== '0px'),
				'Expected every split chat to own an independent framed surface, gap, and centered gripper'
			);
		}
	}
	if (options.macWindowCorners) {
		const bottomLeftSession = sessionsCard.querySelector<HTMLElement>('.session-view.session-grid-bottom-left.independent-chat-groups');
		const bottomLeftSurface = bottomLeftSession?.querySelector<HTMLElement>('.chat-group-view.chat-grid-bottom-left > .chat-group-view-surface');
		const bottomRightSession = sessionsCard.querySelector<HTMLElement>('.session-view.session-grid-bottom-right:not(.independent-chat-groups)');
		const bottomLeftFrame = bottomLeftSurface ? mainWindow.getComputedStyle(bottomLeftSurface, '::after') : undefined;
		const bottomRightFrame = bottomRightSession ? mainWindow.getComputedStyle(bottomRightSession, '::after') : undefined;
		assert(
			bottomLeftFrame?.borderBottomLeftRadius === '11px'
			&& bottomLeftFrame.borderBottomRightRadius === '7px'
			&& bottomRightFrame?.borderBottomRightRadius === '11px',
			'Expected only window-facing panel corners to follow the macOS frame radius'
		);
	}
	if (sidePane) {
		assert(sidePaneDivider !== undefined, 'Expected a Sessions/side-pane divider');
		const bounds = sessions.map(session => part.getSessionView(session.sessionId)!.element.getBoundingClientRect());
		const left = bounds.reduce((candidate, current) => current.left < candidate.left ? current : candidate);
		const right = bounds.reduce((candidate, current) => current.left > candidate.left ? current : candidate);
		const internalGap = right.left - left.right;
		const sidePaneBounds = sidePaneFrame!.getBoundingClientRect();
		const sideGap = sidePaneBounds.left - Math.max(...bounds.map(bound => bound.right));
		assert(Math.abs(internalGap - AGENTS_FLOATING_PANEL_GAP) < 0.01 && Math.abs(sideGap - internalGap) < 0.01, 'Expected the side pane and session panels to use the same visible gap');
		const dividerBounds = sidePaneDivider.getBoundingClientRect();
		const dividerCenter = (dividerBounds.left + dividerBounds.right) / 2;
		const sideGapCenter = (Math.max(...bounds.map(bound => bound.right)) + sidePaneBounds.left) / 2;
		const grip = mainWindow.getComputedStyle(sidePaneDivider, '::after');
		assert(Math.abs(dividerCenter - sideGapCenter) < 0.01 && grip.content === '""', 'Expected the side-pane gripper to be centered in the visible gap');
	}
	if (bottomPanel) {
		const bounds = sessions.map(session => part.getSessionView(session.sessionId)!.element.getBoundingClientRect());
		const sessionBottom = Math.max(...bounds.map(bound => bound.bottom));
		const panelBounds = bottomPanel.frame.getBoundingClientRect();
		const panelGap = panelBounds.top - sessionBottom;
		const panelGapCenter = (sessionBottom + panelBounds.top) / 2;
		const horizontalDividers = Array.from(grid.element.querySelectorAll<HTMLElement>('.monaco-sash.horizontal'))
			.filter(sash => sash.closest('.monaco-grid-view') === grid.element);
		assert(horizontalDividers.length > 0, 'Expected a bottom-panel divider');
		const panelDivider = horizontalDividers.reduce((candidate, sash) => {
			const candidateBounds = candidate.getBoundingClientRect();
			const sashBounds = sash.getBoundingClientRect();
			const candidateDistance = Math.abs((candidateBounds.top + candidateBounds.bottom) / 2 - panelGapCenter);
			const sashDistance = Math.abs((sashBounds.top + sashBounds.bottom) / 2 - panelGapCenter);
			return sashDistance < candidateDistance ? sash : candidate;
		});
		const dividerBounds = panelDivider.getBoundingClientRect();
		const dividerCenter = (dividerBounds.top + dividerBounds.bottom) / 2;
		const grip = mainWindow.getComputedStyle(panelDivider, '::after');
		assert(Math.abs(panelGap - AGENTS_FLOATING_PANEL_GAP) < 0.01, 'Expected the bottom panel and session panels to use the same visible gap');
		assert(Math.abs(dividerCenter - panelGapCenter) < 0.01 && grip.content === '""', 'Expected the bottom-panel gripper to be centered in the visible gap');
		if (sidePaneFrame) {
			const sidePanePanelGap = panelBounds.top - sidePaneFrame.getBoundingClientRect().bottom;
			assert(Math.abs(sidePanePanelGap - panelGap) < 0.01, 'Expected the bottom panel to use the same visible gap below Sessions and the side pane');
		}
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/grid/' }, {
	SideBySide: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Two full-height session panels sit side by side. Each has a session header, a completed conversation, a chat input, and a complete one-stroke panel border. The same floating-panel gap used elsewhere in the Agents window separates the bordered panels without an additional divider, a three-dot gripper is centered in the gap, and no frame surrounds the Sessions group.'],
		render: context => renderSessionsGrid(context, { sideBySide: true }),
	}),
	NestedSplits: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents workbench title bar sits above three session panels, with sidebars and panels hidden. A narrow full-height panel is on the left and two unequal-height panels are stacked on the right. Floating-panel gaps separate the sessions, each gap has a centered three-dot gripper, each session retains its complete one-stroke panel border, and no frame surrounds the Sessions group. Each panel has a session header, a completed conversation, and a chat input.'],
		render: context => renderSessionsGrid(context),
	}),
	CustomBackground: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A repeating custom background remains visible inside all three transparent session panels. The solid workbench-colored floating-panel gaps separate the complete panel frames, include centered three-dot grippers, and do not show the custom background through the gutters.'],
		render: context => renderSessionsGrid(context, { customBackground: true }),
	}),
	SidePanelGap: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The connected Changes side pane and all three fully bordered session panels use the same floating-panel gap. Every gap has a centered three-dot gripper, with no extra line or inset beside the side pane and no frame surrounding the Sessions group.'],
		render: context => renderSessionsGrid(context, { sidePanel: true }),
	}),
	SidePanelGapRtl: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents window renders right-to-left. The docked Changes tab keeps its leading icon inset and unobstructed tab actions, while the session cards, side pane, and panel frames remain intact.'],
		render: context => renderSessionsGrid(context, { direction: 'rtl', sidePanel: true }),
	}),
	SidePanelGapRtlNoFileIcons: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		fileIconTheme: 'none',
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents window renders right-to-left without file icons. The docked Changes tab retains its leading inset and unobstructed tab actions, while the session cards, side pane, and panel frames remain intact.'],
		render: context => renderSessionsGrid(context, { direction: 'rtl', sidePanel: true }),
	}),
	PillSidePanelGap: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The pill-tab Changes side pane and all three fully bordered session panels use the same floating-panel gap. Every gap has a centered three-dot gripper, with no extra line or off-ramp spacing beside the side pane and no frame surrounding the Sessions group.'],
		render: context => renderSessionsGrid(context, { connectedEditorTabs: false, sidePanel: true }),
	}),
	ConnectedSingleTabSidePanelGap: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The connected single-tab Changes side pane and all three fully bordered session panels use the same floating-panel gap. Every gap has a centered three-dot gripper, with no extra line or off-center spacing beside the side pane and no frame surrounding the Sessions group.'],
		render: context => renderSessionsGrid(context, { sidePaneShowTabs: 'single', sidePanel: true }),
	}),
	BottomPanelGap: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A fully bordered bottom panel sits below the three session panels. The same floating-panel gap separates the bottom panel from the session frames, and a three-dot gripper is centered vertically in that gap without an extra divider.'],
		render: context => renderSessionsGrid(context, { bottomPanel: true }),
	}),
	JustifiedPillSideAndBottomPanelGap: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A pill-tab Changes side pane sits beside three session panels above a justified bottom panel. One consistent floating-panel gap separates every frame horizontally and vertically, and each sash gripper is centered in its gap without an extra divider.'],
		render: context => renderSessionsGrid(context, { bottomPanel: true, connectedEditorTabs: false, sidePanel: true }),
	}),
	Maximized: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents workbench title bar and one fully bordered session panel are visible, with sidebars and panels hidden. Only the Grid layout session fills the available surface with its header, completed conversation, and chat input. No sibling panes, split sashes, or enclosing Sessions-group frame are visible.'],
		render: context => renderSessionsGrid(context, { maximized: true }),
	}),
	MultipleChats: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents workbench shows two standalone session panels and a wide split-chat area, with sidebars and panels hidden and no enclosing group frame. Grid layout and Regression tests each own a complete rounded frame, separated by the same floating-panel gap and centered three-dot gripper used between sessions. Each chat has its own tab strip, conversation, and input below one shared session header.'],
		render: context => renderSessionsGrid(context, { multipleChats: 'sideBySide' }),
	}),
	MacWindowCorners: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Two full-height session areas sit side by side in a macOS Agents window. The left session contains two independently framed chats stacked vertically, while the right session contains one chat. The lower-left chat panel and right session panel follow the nearest macOS window-corner curves; interior panel corners remain on the standard outer-surface radius. Consistent gaps and centered grippers separate the panels.'],
		render: context => renderSessionsGrid(context, { macWindowCorners: true, multipleChats: 'stackedLeft', sideBySide: true }),
	}),
	RelatedChats: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The wide left area contains a parent chat and related child chat as two independently rounded and fully bordered panels. The related child chat tab places its close action near the trailing edge with a compact inset, and its active shoulder connects to its own framed body. The same floating-panel gap used between unrelated sessions separates the chats, with a centered three-dot gripper and no enclosing parent-session frame.'],
		render: context => renderSessionsGrid(context, { multipleChats: 'sideBySide', relatedChats: true }),
	}),
	RelatedChatsRtl: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents workbench renders right-to-left with the parent and related child chat in independently rounded and fully bordered panels. Each connected chat tab retains its curved left shoulder and rounded terminal cap while its right edge flows into its own body border without an outward shoulder; the tab label remains fully visible. The related child chat close action and label follow RTL order, and the normal floating-panel gap and centered gripper separate the chats without an enclosing parent-session frame.'],
		render: context => renderSessionsGrid(context, { direction: 'rtl', multipleChats: 'sideBySide', relatedChats: true }),
	}),
	MixedRelatedChats: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The wide left area contains a parent chat on the right with two chats stacked on the left. All three chats own complete rounded frames, and every internal boundary uses the same floating-panel gap and centered three-dot gripper as unrelated session panels, with no enclosing parent-session frame.'],
		render: context => renderSessionsGrid(context, { multipleChats: 'mixedRelated' }),
	}),
	PillChatTabs: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents workbench uses pill-style chat tabs. The wide left area contains two independently rounded and fully bordered chat panels separated by a floating-panel gap and centered three-dot gripper, matching the unrelated session panels and without an enclosing split-session frame.'],
		render: context => renderSessionsGrid(context, { connectedEditorTabs: false, multipleChats: 'sideBySide' }),
	}),
	SingleChatPresentation: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The wide left area shows its parent and nested chat as two independent panels. Each chat owns a complete rounded frame, with the normal floating-panel gap and centered three-dot gripper between them and no enclosing split-session frame.'],
		render: context => renderSessionsGrid(context, { chatTabsMode: SessionsChatTabsMode.Single, multipleChats: 'sideBySide', relatedChats: true }),
	}),
	NestedChatGroups: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The bottom-right area contains two independently rounded and fully bordered chats stacked vertically. The normal floating-panel gap and centered three-dot gripper separate them, matching every unrelated session boundary, and no larger frame encloses the pair.'],
		render: context => renderSessionsGrid(context, { multipleChats: 'bottomRight' }),
	}),
	CompactNestedChatGroups: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The compact Agents workbench matches the reported layout: one session spans the full width above a second full-width session whose chat grid has two chats stacked on the left and one chat on the right. A continuous one-stroke horizontal divider separates the two sessions, and one-stroke horizontal and vertical dividers separate all three lower chats. There are no floating-panel gaps, rounded inner frames, or gripper dots.'],
		render: context => renderSessionsGrid(context, { compactDensity: true, connectedEditorTabs: false, multipleChats: 'mixedRelated' }),
	}),
});
