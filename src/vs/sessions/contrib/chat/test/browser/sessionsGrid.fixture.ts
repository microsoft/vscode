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
type MultipleChatsLayout = 'sideBySide' | 'bottomRight' | 'mixedRelated';

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

async function renderSessionsGrid(context: ComponentFixtureContext, options: { bottomPanel?: boolean; chatTabsMode?: SessionsChatTabsMode; connectedEditorTabs?: boolean; customBackground?: boolean; maximized?: boolean; multipleChats?: MultipleChatsLayout; relatedChats?: boolean; sideBySide?: boolean; sidePaneShowTabs?: 'multiple' | 'single'; sidePanel?: boolean } = {}): Promise<void> {
	const workspace = constObservable<ISessionWorkspace>({
		uri: URI.parse('https://github.com/microsoft/vscode'),
		label: 'microsoft/vscode',
		icon: Codicon.repo,
		folders: [],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: true,
	});
	const titles = ['Grid layout', 'Session lifecycle', 'Keyboard navigation'];
	const sessions = (options.sideBySide ? titles.slice(0, 2) : titles).map((title, index) => {
		const session = createTestActiveSession(`fixture-${index}`);
		const chat: IChat = { ...session.mainChat.get(), workspace, title: constObservable(title) };
		const multipleChatsIndex = options.multipleChats === 'bottomRight' ? 2 : 0;
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
	const slots = [
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
		part.resizeSession(top.sessionId, Direction.Down, 40);
	}
	if (options.multipleChats === 'sideBySide') {
		part.getSessionView(left.sessionId)!.splitChatToSide(left.chats.get()[1].resource);
		await Promise.resolve();
	} else if (options.multipleChats === 'bottomRight') {
		assert(bottom !== undefined, 'Expected a bottom-right session');
		part.getSessionView(bottom.sessionId)!.splitActiveChat('bottom');
		await Promise.resolve();
	} else if (options.multipleChats === 'mixedRelated') {
		const sessionView = part.getSessionView(left.sessionId)!;
		sessionView.splitActiveChat('right');
		await Promise.resolve();
		await sessionsService.openChat(left, left.chats.get()[2].resource);
		sessionView.splitActiveChat('bottom');
		await Promise.resolve();
	}
	await Promise.all(chats.map(chat => chat.render()));
	context.disposableStore.add(part.onDidFocusSession(id => sessionsService.setActive(sessions.find(session => session.sessionId === id))));
	if (options.maximized) {
		part.toggleMaximizeSession(left.sessionId);
	}
	const sizes = sessions.map(session => {
		const element = part.getSessionView(session.sessionId)!.element;
		return { width: element.offsetWidth, height: element.offsetHeight };
	});
	const gridGapSashes = Array.from(context.container.querySelectorAll<HTMLElement>(`.${GRID_GAP_SASH_CLASS}`));
	const expectedGridGapSashes = options.maximized ? 0 : sessions.length - 1;
	assert(gridGapSashes.length === expectedGridGapSashes, 'Expected only session gutters to have grippers');
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
	assert(mainWindow.getComputedStyle(sessionsCard).backgroundClip === 'padding-box', 'Expected no enclosing Sessions-group stroke');
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
	} else {
		assert(options.multipleChats === 'sideBySide' || options.multipleChats === 'mixedRelated' ? sizes[0].width > sizes[1].width : sizes[0].width < sizes[1].width, 'Expected the intended session widths');
		assert(sizes[0].height === sizes[1].height + sizes[2].height + AGENTS_FLOATING_PANEL_GAP && sizes[1].height > sizes[2].height, 'Expected unequal nested splits with the configured session gap');
	}
	if (options.multipleChats) {
		const splitSession = options.multipleChats === 'bottomRight' ? bottom! : left;
		const groups = part.getSessionView(splitSession.sessionId)!.element.querySelectorAll<HTMLElement>('.chat-group-view');
		const expectedGroups = options.multipleChats === 'mixedRelated' ? 3 : 2;
		assert(groups.length === expectedGroups && [...groups].every(group => group.offsetWidth > 0), 'Expected every split chat group to be visible within one session');
		if (options.multipleChats === 'mixedRelated') {
			const chatGroups = part.getSessionView(splitSession.sessionId)!.element;
			assert(
				chatGroups.querySelectorAll(`.${GRID_GAP_SASH_CLASS}`).length === 0
				&& chatGroups.querySelectorAll('.chat-groups-view-boundary-segment').length === 0
				&& chatGroups.querySelectorAll('.monaco-split-view2').length === chatGroups.querySelectorAll('.monaco-split-view2.separator-border').length,
				'Expected every nested chat boundary to be only a one-stroke divider'
			);
		} else {
			const first = mainWindow.getComputedStyle(groups[0]);
			const second = mainWindow.getComputedStyle(groups[1]);
			const sharedGap = options.multipleChats === 'sideBySide'
				? parseFloat(first.borderRightWidth) + parseFloat(second.borderLeftWidth)
				: parseFloat(first.borderBottomWidth) + parseFloat(second.borderTopWidth);
			assert(sharedGap === 0, 'Expected split chats to remain flush in every tab presentation');
		}
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
		expectedVisualDescriptions: ['The Agents workbench shows three fully bordered session panels separated by floating-panel gaps, with sidebars and panels hidden and no enclosing Sessions-group frame. The wide left session contains two flush side-by-side chats, Grid layout and Regression tests, separated only by a single themed divider with no internal gap or gripper. Each chat has its own tab strip, conversation, and input below one shared session header.'],
		render: context => renderSessionsGrid(context, { multipleChats: 'sideBySide' }),
	}),
	RelatedChats: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents workbench shows three fully bordered session panels separated by floating-panel gaps. The wide left session contains a parent chat and related child chat side by side as one continuous session surface, separated by a single themed divider without an internal gap or gripper. The outer session gaps retain their centered grippers.'],
		render: context => renderSessionsGrid(context, { multipleChats: 'sideBySide', relatedChats: true }),
	}),
	MixedRelatedChats: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The wide left session contains a parent chat on the right with two chats stacked on the left. Every internal chat boundary is flush and rendered as a single themed divider, without internal gaps or grippers. Only the outer gaps between separate session panels retain grippers.'],
		render: context => renderSessionsGrid(context, { multipleChats: 'mixedRelated' }),
	}),
	PillChatTabs: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents workbench uses pill-style chat tabs while keeping three individually framed session panels separated by floating-panel gaps. The wide left session contains two flush side-by-side chats with pill tabs, separated only by a single themed divider without an internal gripper, and no frame surrounds the Sessions group.'],
		render: context => renderSessionsGrid(context, { connectedEditorTabs: false, multipleChats: 'sideBySide' }),
	}),
	SingleChatPresentation: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The wide left session shows its parent and nested chat side by side as one continuous session surface. A single divider separates those chats without a floating-panel gap or gripper, while the outer session panels retain their normal gaps and centered grippers.'],
		render: context => renderSessionsGrid(context, { chatTabsMode: SessionsChatTabsMode.Single, multipleChats: 'sideBySide', relatedChats: true }),
	}),
	NestedChatGroups: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents workbench shows three fully bordered sessions in a nested grid without an enclosing Sessions-group frame. The bottom-right session contains two flush vertically stacked chats separated only by a single themed divider without an internal gap or gripper. The gaps between separate session panels retain their centered grippers.'],
		render: context => renderSessionsGrid(context, { multipleChats: 'bottomRight' }),
	}),
});
