/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { toAction } from '../../../../../base/common/actions.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { autorun, constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { PromptTimelineRulerRail } from '../../../../../workbench/contrib/chat/browser/promptTimeline/promptTimelineRulerRail.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import type { IChatWidgetFixtureHandle, IFixtureMessage } from '../../../../../workbench/test/browser/componentFixtures/chat/chatWidget.fixture.js';
import { AbstractChatView } from '../../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { ChatViewSessionActivityBar } from '../../../../../workbench/contrib/sessions/browser/parts/sessionActivityBar.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { AgentWorkbenchLayout } from '../../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { AGENTS_CENTERED_CONTENT_MAX_WIDTH, AGENTS_FLOATING_PANEL_GAP } from '../../../../../workbench/contrib/sessions/common/layoutConstants.js';
import { registerSessionActivityBarExternalHost, SessionActivityBarColumn, setSessionActivityBarSize } from '../../../../../workbench/browser/parts/sessions/sessionActivityBarHost.js';
import { MenuActivityBarSize } from '../../../../../workbench/browser/parts/activitybar/menuActivityBar.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { Direction } from '../../../../../base/browser/ui/grid/grid.js';
import { IPartGridView, PartGrid } from '../../../../../workbench/browser/parts/partGrid/partGrid.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { SESSION_ACTIVITY_BAR_SETTING, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { ISessionActivityBarActivityService, SessionActivityBarActivityService } from '../../../../../workbench/contrib/sessions/common/sessionActivityBarActivityService.js';
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { IconBadge } from '../../../../../workbench/services/activity/common/activity.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { FixtureContextViewService, FixtureKeybindingService, FixtureMenuService, fixtureBrowser, fixtureCanvas, fixtureChanges, fixtureFiles, fixtureTerminal, fixtureTogglePanel, fixtureToggleSidePanel, IFixtureEntry } from '../../../../test/browser/addTabFixtureUtils.js';
import { SessionActivityBarGroup } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { OPEN_PULL_REQUEST_ACTION_ID } from '../../../../../workbench/contrib/sessions/common/github/types.js';
import { ExternalSessionBanner } from '../../../../../workbench/contrib/sessions/browser/chat/externalSessionBanner.js';
import '../../../../../workbench/contrib/sessions/browser/chat/media/chatView.css';
import '../../../../../workbench/contrib/sessions/browser/parts/media/chatCompositeBar.css';
import '../../../../../workbench/contrib/sessions/browser/parts/media/chatGroupsView.css';
import '../../../../../workbench/contrib/sessions/browser/parts/media/sessionView.css';
import '../../../../../workbench/browser/parts/sessions/media/sessionsPart.css';
import '../../../../../workbench/contrib/sessions/browser/parts/media/sessionsGridContent.css';
import '../../../chatWindow/browser/media/chatWindow.css';

interface IFixtureOptions {
	readonly entries?: readonly IFixtureEntry[];
	/** Width of the chat; the session header and transcript center within it. Defaults to 640. */
	readonly width?: number;
	/** The `sessions.showSessionActivityBar` setting. Defaults to `true`. */
	readonly enabled?: boolean;
	/** Renders the chat as one group of a multi-group grid, whose content is not capped to the centered band. */
	readonly split?: boolean;
	/** Shows the ruler prompt timeline beside the transcript. */
	readonly rulerTimeline?: boolean;
	/** Shows the external-session banner above the chat. */
	readonly externalBanner?: boolean;
	readonly openSubmenu?: boolean;
	/**
	 * Renders the chat as the card of a chat window, with the strip in the window's column beside it, as the chat window
	 * shows it in every layout, in the given Layout Density.
	 */
	readonly chatWindowColumn?: 'default' | 'compact';
	/** The size chosen for the Session Activity Bar, which it shows at in a column of its own. Compact unless chosen. */
	readonly size?: MenuActivityBarSize;
	/** Badges the Changes entry, as new changes do. */
	readonly newChanges?: boolean;
	readonly githubReferenceCount?: number;
	readonly githubChecked?: boolean;
	/** Drags the floating strip down by this many pixels by its grip. */
	readonly dragBy?: number;
}

// The tab entries share the side panel toggle's group; the terminal shares the panel toggle's.
const sidePanelGroup = (entries: readonly IFixtureEntry[]) => entries.map(entry => ({ ...entry, group: SessionActivityBarGroup.SidePanel }));
const workspaceChatEntries = [fixtureToggleSidePanel, ...sidePanelGroup([fixtureChanges, fixtureFiles, fixtureBrowser, fixtureCanvas]), fixtureTerminal, fixtureTogglePanel];
const highContrastThemes: ['darkHighContrast', 'lightHighContrast'] = ['darkHighContrast', 'lightHighContrast'];

function activityBarFixture(options: IFixtureOptions, additionalThemes?: typeof highContrastThemes) {
	return defineComponentFixture({
		// Keep the flaky submenu fixture available for manual exploration only.
		labels: { kind: options.openSubmenu ? 'animated' : 'screenshot' },
		// The transcript settles through native resize and scroll callbacks.
		virtualTime: { enabled: false },
		additionalThemes,
		render: context => renderActivityBar(context, options),
	});
}

export default defineThemedFixtureGroup({ path: 'sessions/sessionActivityBar/' }, {
	// Chat widths: the content gives up the activity bar's room only while the centered band would reach the strip.
	Narrow: activityBarFixture({ width: 480 }),
	WorkspaceChat: activityBarFixture({}, highContrastThemes),
	NearlyWide: activityBarFixture({ width: 1000 }),
	Wide: activityBarFixture({ width: 1280 }),
	// Disabled, the content uses the full width, for comparison with the cases above.
	NarrowActivityBarDisabled: activityBarFixture({ width: 480, enabled: false }),
	WideActivityBarDisabled: activityBarFixture({ width: 1280, enabled: false }),
	SplitGroup: activityBarFixture({ split: true }),
	RulerTimeline: activityBarFixture({ rulerTimeline: true }, highContrastThemes),
	RulerTimelineWide: activityBarFixture({ width: 1280, rulerTimeline: true }),
	ExternalSessionBanner: activityBarFixture({ externalBanner: true }),
	ExternalSessionBannerWide: activityBarFixture({ width: 1280, externalBanner: true }),
	ChatWithoutWorkspace: activityBarFixture({ entries: [fixtureToggleSidePanel, ...sidePanelGroup([fixtureBrowser, fixtureCanvas]), fixtureTerminal, fixtureTogglePanel] }),
	WithoutLayoutActions: activityBarFixture({ entries: [...sidePanelGroup([fixtureChanges, fixtureFiles, fixtureBrowser, fixtureCanvas]), fixtureTerminal] }),
	SubmenuOpen: activityBarFixture({ openSubmenu: true }, highContrastThemes),
	NewChanges: activityBarFixture({ newChanges: true }, highContrastThemes),
	GitHubReferences: activityBarFixture({ githubReferenceCount: 1 }, highContrastThemes),
	MultipleGitHubReferences: activityBarFixture({ githubReferenceCount: 2 }, highContrastThemes),
	CheckedGitHubReferences: activityBarFixture({ githubReferenceCount: 2, githubChecked: true }, highContrastThemes),
	Moved: activityBarFixture({ dragBy: 60 }),
	AtBottom: activityBarFixture({ dragBy: 2000 }),
	// A chat window: the strip in a column of its own beside the chat's card, as the main window's, at the compact size unless the normal one is chosen.
	ChatWindowColumn: activityBarFixture({ chatWindowColumn: 'default' }, highContrastThemes),
	ChatWindowColumnCompact: activityBarFixture({ chatWindowColumn: 'compact' }, highContrastThemes),
	ChatWindowColumnNormalSize: activityBarFixture({ chatWindowColumn: 'default', size: MenuActivityBarSize.Normal }),
	ChatWindowColumnNormalSizeCompact: activityBarFixture({ chatWindowColumn: 'compact', size: MenuActivityBarSize.Normal }),
	ChatWindowColumnNewChanges: activityBarFixture({ chatWindowColumn: 'default', newChanges: true }),
	ChatWindowColumnWithoutLayoutActions: activityBarFixture({ chatWindowColumn: 'default', entries: [...sidePanelGroup([fixtureChanges, fixtureFiles, fixtureBrowser, fixtureCanvas]), fixtureTerminal] }),
});

const HEIGHT = 500;
const HEADER_HEIGHT = 35;

const conversation: readonly IFixtureMessage[] = [{
	user: 'Keep the Session Activity Bar clear of the conversation.',
	assistant: [{
		kind: 'markdown', text: [
			'The conversation stays centered with the header and only moves aside where the activity bar would cover it.',
			'```ts\nconst viewport = { scrollbar: "at the outer edge" };\n```',
			...Array.from({ length: 14 }, () => 'The activity bar has its own space beside the conversation while the transcript scrolls underneath the header.'),
		].join('\n\n')
	}],
}];

const timelineConversation: readonly IFixtureMessage[] = ['Add a settings page', 'Validate the new settings', 'Document the settings', 'Fix the failing test'].map(user => ({
	user,
	assistant: [{
		kind: 'markdown',
		text: Array.from({ length: 4 }, () => `Working on "${user.toLowerCase()}": the change is reviewed beside the conversation and the timeline marks each prompt.`).join('\n\n'),
	}],
}));

/** A chat view without a hosted widget, so the fixture lays out the real view element and its activity bar reservation. */
class FixtureChatView extends AbstractChatView {
	readonly kind = 'chat';
	protected doLayout(): void { }
	toJSON(): object { return {}; }
	focus(): void { }
}

async function renderActivityBar(context: ComponentFixtureContext, options: IFixtureOptions): Promise<void> {
	const { container, disposableStore, theme } = context;
	const { renderChatWidget } = await import('../../../../../workbench/test/browser/componentFixtures/chat/chatWidget.fixture.js');
	const width = options.width ?? 640;
	const githubEntries: readonly IFixtureEntry[] = options.githubReferenceCount ? [
		{ id: OPEN_PULL_REQUEST_ACTION_ID, title: 'Open Pull Request', icon: Codicon.gitPullRequest, group: SessionActivityBarGroup.SidePanel },
	] : [];
	const entries = [...(options.entries ?? workspaceChatEntries), ...githubEntries];
	container.style.width = `${width}px`;
	container.style.height = `${HEIGHT}px`;
	container.classList.add('agent-sessions-workbench');
	const size = options.size ?? MenuActivityBarSize.Compact;
	const chatWindow = options.chatWindowColumn && createChatWindowFrame(context, options.chatWindowColumn, size);
	const storage = disposableStore.add(new InMemoryStorageService());
	setSessionActivityBarSize(storage, size);

	// The session view's DOM, so the header and chat take their production alignment.
	const part = append(chatWindow?.chat ?? container, $('.part.sessionspart'));
	// The activity bar only shows in the active session, so render that session's styling.
	const sessionView = append(part, $('.session-view.is-active'));
	sessionView.classList.toggle('grid-layout', !!options.split);
	sessionView.style.setProperty('--session-view-centered-content-max-width', `${AGENTS_CENTERED_CONTENT_MAX_WIDTH}px`);
	sessionView.style.setProperty('--session-view-background', 'var(--vscode-editor-background)');
	const groups = append(sessionView, $('.chat-groups-view'));
	groups.classList.toggle('single-group', !options.split);
	// Like `ChatGroupView` for the active group, whose header and timeline the session view keeps shown.
	const chatGroup = append(groups, $('.chat-group-view.active-group'));
	const bar = append(chatGroup, $('.chat-group-view-bar'));
	bar.style.height = `${HEADER_HEIGHT}px`;
	const header = append(bar, $('.chat-composite-bar.session-header-bar'));
	header.style.height = `${HEADER_HEIGHT}px`;
	append(append(header, $('.chat-composite-bar-header')), $('.chat-composite-bar-header-main')).textContent = 'Session Activity Bar';

	const menuService = new FixtureMenuService(entries);
	const activityService = disposableStore.add(new SessionActivityBarActivityService());
	if (options.newChanges) {
		disposableStore.add(activityService.showActivity(fixtureChanges.id, { badge: new IconBadge(Codicon.circleFilled, () => 'New changes') }));
	}
	const contextViewService = new FixtureContextViewService(container);
	disposableStore.add(toDisposable(() => contextViewService.hideContextView()));
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IMenuService, menuService);
			reg.defineInstance(ISessionActivityBarActivityService, activityService);
			reg.defineInstance(IKeybindingService, new FixtureKeybindingService(entries));
			reg.defineInstance(IContextViewService, contextViewService);
			reg.defineInstance(IConfigurationService, new TestConfigurationService({
				[SESSION_ACTIVITY_BAR_SETTING]: options.enabled ?? true,
				[SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING]: true,
			}));
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly nameShort = 'Code - OSS';
			});
			reg.defineInstance(IAgentWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() {
				override readonly agentWorkbenchLayout = AgentWorkbenchLayout.Desktop;
				override readonly mainContainer = container;
				override readonly onDidLayoutMainContainer = Event.None;
			});
			reg.defineInstance(IEditorGroupsService, new class extends mock<IEditorGroupsService>() { }());
			reg.defineInstance(IStorageService, storage);
		},
	});
	menuService.commandService = instantiationService.get(ICommandService);
	// The chat window's grid lays the chat out before it renders.
	const chatSize = chatWindow?.mount(instantiationService) ?? { width, height: HEIGHT };
	const chatHeight = chatSize.height;
	chatGroup.style.height = `${chatHeight}px`;

	const areaHeight = chatHeight - HEADER_HEIGHT;
	const activityBar = disposableStore.add(instantiationService.createInstance(ChatViewSessionActivityBar, chatGroup));
	activityBar.setChatActions(constObservable(githubEntries.map(entry => toAction({
		id: entry.id,
		label: options.githubReferenceCount === 1 ? `${entry.title} #42: Improve the activity bar` : `${entry.title} (${options.githubReferenceCount})`,
		class: ThemeIcon.asClassName(entry.icon),
		checked: options.githubChecked,
		run: () => { },
	}))));
	activityBar.layout(HEADER_HEIGHT, areaHeight);
	// As the chat group lays it out: to the left of the strip's column.
	const chatWidth = Math.max(0, chatSize.width - activityBar.reservedWidth.get());

	const view = disposableStore.add(new FixtureChatView());
	view.element.classList.add('chat-view-chat');
	chatGroup.appendChild(view.element);
	const widgetContainer = append(view.element, $('.chat-view-widget'));
	view.layout(chatWidth, areaHeight, HEADER_HEIGHT, 0);

	if (options.externalBanner) {
		const banner = disposableStore.add(instantiationService.createInstance(ExternalSessionBanner, view.element, {}));
		view.element.insertBefore(banner.domNode, widgetContainer);
		banner.setSession(new class extends mock<ISession>() {
			override readonly resource = URI.parse('test://external-session');
			override readonly sessionType = 'codex';
			override readonly isExternal = constObservable(true);
			override readonly updatedAt = constObservable(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
		});
	}
	// As in `ChatView`, only the external-session banner precedes the widget in normal flow.
	const widgetHeight = areaHeight - widgetContainer.offsetTop;
	// Mirrors `ChatWidget`, which caps its renderer to the centered band outside a multi-group grid.
	const rendererWidth = options.split ? chatWidth : Math.min(AGENTS_CENTERED_CONTENT_MAX_WIDTH, chatWidth);

	let renderedChat: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget({ ...context, container: widgetContainer }, {
		width: chatWidth,
		height: widgetHeight,
		contentHorizontalPadding: 48,
		useAuxiliaryBarWrapper: false,
		messages: options.rulerTimeline ? timelineConversation : conversation,
		onRendered: handle => {
			renderedChat = handle;
			const { inputPart, listWidget } = handle;
			if (options.rulerTimeline) {
				// Reserve the ruler's room before the transcript settles, as mounting the timeline does.
				widgetContainer.querySelector('.interactive-session')!.classList.add('prompt-timeline-host', 'prompt-timeline-with-rail');
			}
			inputPart.layout(rendererWidth);
			disposableStore.add(autorun(reader => {
				const listHeight = Math.max(0, widgetHeight - inputPart.height.read(reader));
				listWidget.layout(listHeight, rendererWidth);
			}));
		},
	});
	await waitForFixtureCondition(() => !!view.element.querySelector('.interactive-item-container.interactive-response .rendered-markdown'), 'The chat response did not render');
	const { listWidget } = renderedChat!;
	let previousHeight = -1;
	let stableFrames = 0;
	await waitForFixtureCondition(() => {
		const height = listWidget.contentHeight;
		stableFrames = height === previousHeight ? stableFrames + 1 : 0;
		previousHeight = height;
		return height > listWidget.renderHeight + 100 && stableFrames >= 3;
	}, 'The overflowing transcript did not settle');
	listWidget.scrollTop = 100;
	await waitForFixtureCondition(() => listWidget.scrollTop === 100, 'The transcript did not scroll');
	if (options.rulerTimeline) {
		await mountRulerTimeline(context, renderedChat!, widgetContainer);
	}
	activityBar.setActive(true);
	const element = activityBar.element!;

	if (options.dragBy) {
		const handle = element.querySelector<HTMLElement>('.session-activity-bar-drag-handle')!;
		const pointer = { pointerId: 1, button: 0, buttons: 1, bubbles: true, clientX: 0 };
		handle.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientY: 0 }));
		handle.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientY: options.dragBy }));
		handle.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0, clientY: options.dragBy }));
	}

	if (options.openSubmenu) {
		const submenuEntry = element.querySelector<HTMLElement>('.action-label[aria-haspopup="menu"]');
		submenuEntry?.dispatchEvent(new MouseEvent('mouseenter'));
		await waitForFixtureCondition(() => !!container.querySelector('.fixture-context-view .monaco-menu .action-item'), 'The hovered Canvas entry did not open its submenu');
	}
}

/**
 * The grid of a chat window around the chat, on the real part grid, whose cards clip what they show: the chat's card and,
 * right beside it, the strip's column, as wide as the main window's, which the chat window's strip host takes at full
 * size, laid out with the chat window's gap and outer insets (none at the top, where the title row is).
 */
function createChatWindowFrame({ container, disposableStore }: ComponentFixtureContext, density: 'default' | 'compact', size: MenuActivityBarSize): { readonly chat: HTMLElement; mount(instantiationService: IInstantiationService): { readonly width: number; readonly height: number } } {
	const gap = density === 'compact' ? 0 : AGENTS_FLOATING_PANEL_GAP;
	container.classList.toggle('modern-ui-compact', density === 'compact');
	const frame = append(container, $('.agents-chat-window'));
	frame.style.cssText = 'width: 100%; height: 100%;';
	const chat = $('.fixture-chat-window-chat');
	chat.style.cssText = 'position: relative; width: 100%; height: 100%;';
	const strip = $('.chat-window-strip.session-activity-bar-host');
	disposableStore.add(registerSessionActivityBarExternalHost(frame, { element: strip, active: constObservable(true), fullSize: true, setOccupied: () => { } }));
	const column = disposableStore.add(new SessionActivityBarColumn(constObservable(true)));
	column.setLayout(gap, density === 'compact', size);
	let chatSize = { width: 0, height: 0 };
	const view = (element: HTMLElement, width: number | undefined, onLayout?: (width: number, height: number) => void): IPartGridView => ({
		element,
		minimumWidth: width ?? 0,
		maximumWidth: width ?? Number.POSITIVE_INFINITY,
		minimumHeight: 0,
		maximumHeight: Number.POSITIVE_INFINITY,
		onDidChange: Event.None,
		layout: (w, h) => onLayout?.(w, h),
	});
	return {
		chat,
		mount: instantiationService => {
			const grid = disposableStore.add(instantiationService.createInstance(PartGrid, frame));
			grid.addView('chat', view(chat, undefined, (w, h) => chatSize = { width: w, height: h }));
			grid.addView('strip', view(strip, column.minimumWidth), { edge: Direction.Right }, column.minimumWidth, { edgeChrome: Direction.Right, keepsNoGap: true });
			grid.setGap(gap);
			grid.setOuterInsets({ top: 0, right: gap, bottom: gap, left: gap });
			grid.layout(container.clientWidth, container.clientHeight);
			return chatSize;
		},
	};
}

/**
 * Mounts the ruler prompt timeline on the chat as its widget contribution does. The fixture's chat is
 * composed without a `ChatWidget`, so the rail receives the transcript's prompts and scroll layout here.
 */
async function mountRulerTimeline({ disposableStore }: ComponentFixtureContext, { model, listWidget, inputPart }: IChatWidgetFixtureHandle, widgetContainer: HTMLElement): Promise<void> {
	const session = widgetContainer.querySelector<HTMLElement>('.interactive-session')!;
	const rail = disposableStore.add(new PromptTimelineRulerRail());
	session.appendChild(rail.domNode);
	rail.domNode.style.setProperty('--prompt-timeline-bottom', `${inputPart.height.get()}px`);

	const requests = model.getRequests();
	const step = listWidget.contentHeight / requests.length;
	rail.setTicks(requests.map((request, index) => ({
		requestId: request.id,
		allRequestIds: [request.id],
		text: request.message.text,
		timestamp: request.timestamp,
		count: 1,
		ariaLabel: request.message.text,
		stat: index % 2 === 0 ? { added: 24, removed: 6, fileCount: 2 } : undefined,
	})));
	rail.setActive(requests[0].id);
	rail.setScrollLayout({
		marks: requests.map((request, index) => ({ requestId: request.id, top: index * step })),
		total: listWidget.contentHeight,
		scrollTop: listWidget.scrollTop,
		scrollHeight: listWidget.contentHeight,
		viewportHeight: listWidget.renderHeight,
	});
	rail.setHostWidth(session.clientWidth);

	const marks = [...rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-ruler-mark')];
	await waitForFixtureCondition(() => marks.length === requests.length && marks.every(mark => mark.style.top !== ''), 'The prompt timeline marks were not laid out');
	// Reveal the marks as hovering the timeline does; at rest they stay hidden.
	const lane = rail.domNode.querySelector<HTMLElement>('.prompt-timeline-ruler-marks')!;
	const bounds = lane.getBoundingClientRect();
	lane.dispatchEvent(new MouseEvent('mouseenter', { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 }));
	await waitForFixtureCondition(() => rail.domNode.classList.contains('engaged'), 'The prompt timeline did not reveal its marks');
}
