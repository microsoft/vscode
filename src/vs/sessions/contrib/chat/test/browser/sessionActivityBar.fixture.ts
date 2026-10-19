/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
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
import { AbstractChatView } from '../../../../browser/parts/chatView.js';
import { ChatViewSessionActivityBar } from '../../../../browser/parts/sessionActivityBar.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { AGENTS_CENTERED_CONTENT_MAX_WIDTH } from '../../../../common/layoutConstants.js';
import { SESSION_ACTIVITY_BAR_SETTING, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING } from '../../../../common/sessionConfig.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { FixtureContextViewService, FixtureKeybindingService, FixtureMenuService, fixtureBrowser, fixtureCanvas, fixtureChanges, fixtureFiles, fixtureTogglePanel, fixtureToggleSidePanel, IFixtureEntry } from '../../../../test/browser/addTabFixtureUtils.js';
import { ExternalSessionBanner } from '../../browser/externalSessionBanner.js';
import '../../browser/media/chatView.css';
import '../../../../browser/parts/media/chatCompositeBar.css';
import '../../../../browser/parts/media/chatGroupsView.css';
import '../../../../browser/parts/media/sessionView.css';
import '../../../../browser/parts/media/sessionsPart.css';

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
	/** Drags the strip down by this many pixels. */
	readonly dragBy?: number;
}

const workspaceChatEntries = [fixtureToggleSidePanel, fixtureChanges, fixtureFiles, fixtureBrowser, fixtureCanvas, fixtureTogglePanel];
const highContrastThemes: ['darkHighContrast', 'lightHighContrast'] = ['darkHighContrast', 'lightHighContrast'];

function activityBarFixture(options: IFixtureOptions, additionalThemes?: typeof highContrastThemes) {
	return defineComponentFixture({
		labels: { kind: 'screenshot' },
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
	ChatWithoutWorkspace: activityBarFixture({ entries: [fixtureToggleSidePanel, fixtureBrowser, fixtureCanvas, fixtureTogglePanel] }),
	WithoutLayoutActions: activityBarFixture({ entries: [fixtureChanges, fixtureFiles, fixtureBrowser, fixtureCanvas] }),
	Moved: activityBarFixture({ dragBy: 60 }),
	AtBottom: activityBarFixture({ dragBy: 2000 }),
	SubmenuOpen: activityBarFixture({ openSubmenu: true }, highContrastThemes),
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
	const entries = options.entries ?? workspaceChatEntries;
	container.style.width = `${width}px`;
	container.style.height = `${HEIGHT}px`;
	container.classList.add('agent-sessions-workbench');

	// The session view's DOM, so the header and chat take their production alignment.
	const part = append(container, $('.part.sessionspart'));
	// The activity bar only shows in the active session, so render that session's styling.
	const sessionView = append(part, $('.session-view.is-active'));
	sessionView.classList.toggle('grid-layout', !!options.split);
	sessionView.style.setProperty('--session-view-centered-content-max-width', `${AGENTS_CENTERED_CONTENT_MAX_WIDTH}px`);
	sessionView.style.setProperty('--session-view-background', 'var(--vscode-editor-background)');
	const groups = append(sessionView, $('.chat-groups-view'));
	groups.classList.toggle('single-group', !options.split);
	// Like `ChatGroupView` for the active group, whose header and timeline the session view keeps shown.
	const chatGroup = append(groups, $('.chat-group-view.active-group'));
	chatGroup.style.height = `${HEIGHT}px`;
	const bar = append(chatGroup, $('.chat-group-view-bar'));
	bar.style.height = `${HEADER_HEIGHT}px`;
	const header = append(bar, $('.chat-composite-bar.session-header-bar'));
	header.style.height = `${HEADER_HEIGHT}px`;
	append(append(header, $('.chat-composite-bar-header')), $('.chat-composite-bar-header-main')).textContent = 'Session Activity Bar';

	const menuService = new FixtureMenuService(entries);
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IMenuService, menuService);
			reg.defineInstance(IKeybindingService, new FixtureKeybindingService(entries));
			reg.defineInstance(IContextViewService, new FixtureContextViewService(container));
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
		},
	});
	menuService.commandService = instantiationService.get(ICommandService);

	const areaHeight = HEIGHT - HEADER_HEIGHT;
	const activityBar = disposableStore.add(instantiationService.createInstance(ChatViewSessionActivityBar, chatGroup));
	activityBar.layout(HEADER_HEIGHT, areaHeight);
	const reservedWidth = activityBar.reservedWidth.get();

	const view = disposableStore.add(new FixtureChatView());
	view.element.classList.add('chat-view-chat');
	chatGroup.appendChild(view.element);
	const widgetContainer = append(view.element, $('.chat-view-widget'));
	view.layout(width, areaHeight, HEADER_HEIGHT, 0, reservedWidth);

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
	// As in `ChatView`, content is inset by the reserved width on both sides.
	const contentWidth = Math.max(0, width - 2 * reservedWidth);
	// Mirrors `ChatWidget`, which caps its renderer to the centered band outside a multi-group grid.
	const rendererWidth = options.split ? contentWidth : Math.min(AGENTS_CENTERED_CONTENT_MAX_WIDTH, contentWidth);

	let renderedChat: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget({ ...context, container: widgetContainer }, {
		width,
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
