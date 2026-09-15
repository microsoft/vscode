/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/sessionBoard.contribution.js';
import { $, DisposableResizeObserver, getWindow } from '../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { registerChatFixtureServices } from '../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SessionsBoardVisibleContext } from '../../../../common/contextkeys.js';
import { ISessionInputDraft, ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionReviewService } from '../../../../services/sessions/browser/sessionReviewService.js';
import { ISessionsBoardService, SessionsBoardService } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { readSessionWorkSummary } from '../../../../services/sessions/common/sessionWorkSummary.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { ISessionCardBoardState, SessionCardBoard } from '../../browser/views/sessionCardBoard.js';
import { addWorkCardRequest, SessionWorkCardTestChatService } from './sessionWorkCardContentTestUtils.js';

type Scenario = 'compact' | 'wide' | 'reordered' | 'preview' | 'narrow' | 'small';

async function renderBoard(context: ComponentFixtureContext, scenario: Scenario): Promise<void> {
	const { container, disposableStore, theme, fileIconTheme } = context;
	const width = scenario === 'narrow' ? 740 : scenario === 'small' ? 380 : 1100;
	container.classList.add('monaco-workbench', 'agent-sessions-workbench', 'wrapping-card-prototype');
	container.style.width = `min(${width}px, 100vw)`;
	container.style.height = 'min(740px, 100vh)';
	container.style.padding = '16px';
	container.style.boxSizing = 'border-box';
	container.style.background = 'var(--vscode-sideBar-background)';
	const header = $('.wrapping-card-prototype-header');
	header.style.display = 'flex';
	header.style.alignItems = 'center';
	header.style.gap = '12px';
	header.style.marginBottom = '16px';
	const title = $('h2');
	title.textContent = 'Release readiness';
	title.style.fontSize = 'var(--vscode-fontSize-heading2)';
	title.style.fontWeight = 'var(--vscode-fontWeight-semiBold)';
	title.style.margin = '0';
	const caption = $('span');
	caption.textContent = 'Prototype - sample sessions';
	caption.style.color = 'var(--vscode-descriptionForeground)';
	caption.style.fontSize = 'var(--vscode-fontSize-body2)';
	caption.style.flex = '1';
	caption.style.minWidth = '0';
	caption.style.overflow = 'hidden';
	caption.style.whiteSpace = 'nowrap';
	caption.style.textOverflow = 'ellipsis';
	const toolbarContainer = $('div');
	header.append(title, caption, toolbarContainer);
	const help = $('div');
	help.hidden = true;
	help.style.padding = '12px';
	help.style.marginBottom = '12px';
	help.style.color = 'var(--vscode-descriptionForeground)';
	help.style.fontSize = 'var(--vscode-fontSize-label1)';
	help.setAttribute('role', 'note');
	const scrollContent = $('div');
	scrollContent.style.boxSizing = 'border-box';
	scrollContent.style.paddingRight = '12px';
	const scrollable = disposableStore.add(new DomScrollableElement(scrollContent, {
		horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto, useShadows: true,
	}));
	container.append(header, help, scrollable.getDomNode());

	const chatService = new SessionWorkCardTestChatService(disposableStore);
	const drafts = new ResourceMap<ISettableObservable<ISessionInputDraft>>();
	const getDraft = (resource: URI) => {
		let draft = drafts.get(resource);
		if (!draft) {
			draft = observableValue<ISessionInputDraft>('prototypeDraft', { inputText: '', attachments: [] });
			drafts.set(resource, draft);
		}
		return draft;
	};
	const instantiation = createEditorServices(disposableStore, {
		colorTheme: theme,
		fileIconTheme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.defineInstance(IChatService, chatService);
			reg.define(ISessionsBoardService, SessionsBoardService);
			reg.definePartialInstance(ISessionInputDraftService, { getDraft, setDraft: (resource, draft) => getDraft(resource).set(draft, undefined) });
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly visibleSessions = constObservable([]);
				override async canOpenSession(): Promise<boolean> { return true; }
			}());
			reg.definePartialInstance(IChatEntitlementService, { sentiment: { hidden: false } });
			reg.definePartialInstance(ISessionReviewService, {
				send: async (_session, chat, query) => {
					const model = chatService.getSession(chat.resource);
					if (!(model instanceof ChatModel)) { throw new Error('Missing prototype chat model'); }
					const request = addWorkCardRequest(model, query, [{ kind: 'markdownContent', content: new MarkdownString('Prototype reply received. No agent or external service was called.') }]);
					request.response?.complete();
					return true;
				},
			});
		},
	});
	const configuration = instantiation.get(IConfigurationService) as TestConfigurationService;
	disposableStore.add(instantiation.get(IHoverService).setupDelayedHover(caption, { content: 'Prototype - sample sessions' }));
	configuration.setUserConfiguration('chat', { editor: { fontSize: 13, fontFamily: 'default', fontWeight: 'default', lineHeight: 0, wordWrap: 'on' } });
	configuration.setUserConfiguration('editor', { fontFamily: 'monospace', fontLigatures: false, bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false } });
	configuration.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
	configuration.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, true);
	const contextKeys = instantiation.get(IContextKeyService);
	ChatContextKeys.enabled.bindTo(contextKeys).set(true);
	IsSessionsWindowContext.bindTo(contextKeys).set(true);
	SessionsBoardVisibleContext.bindTo(contextKeys).set(true);
	const specifications = [
		{ title: 'Fix authentication after reload', status: SessionStatus.Completed, body: 'The session now reconnects without losing the draft.\n\n- Existing approvals keep their scope.\n- The reply remains attached to its chat.\n- Reconnect and reload tests pass.' },
		{ title: 'Confirm the retry policy', status: SessionStatus.NeedsInput, body: '' },
		{ title: 'Keep long session titles readable while resizing the workspace', status: SessionStatus.InProgress, body: 'Checking the narrow layout and keyboard navigation.' },
		{ title: 'Update loading states', status: SessionStatus.InProgress, body: 'The loading state now distinguishes connecting from waiting for input.' },
		{ title: 'Review endpoint changes', status: SessionStatus.Completed, body: 'Added a `GET /hello` endpoint.\n\n```ts\nreturn { message: \"Hello World!\" };\n```\n\nThe response and route tests are ready to review.' },
		{ title: 'Investigate the failing check', status: SessionStatus.Error, body: 'The test runner could not connect to its local fixture. No workspace changes were made.' },
	];
	const entries = specifications.map((specification, index) => {
		const resource = URI.parse(`card-prototype:/session-${index}`);
		const model = disposableStore.add(instantiation.createInstance(ChatModel, undefined, {
			initialLocation: ChatAgentLocation.Chat, canUseTools: true, resource, disableBackgroundKeepAlive: true,
		}));
		chatService.addSession(model);
		const currentStatus = observableValue('status', specification.status);
		const original = makeSession(resource, { status: specification.status });
		const title = constObservable(specification.title);
		const chat = { ...original.mainChat.get(), title, status: currentStatus, lastTurnEnd: constObservable(new Date(1705320000000)) };
		const session = { ...original, title, status: currentStatus, mainChat: constObservable(chat), chats: constObservable([chat]), activeChat: constObservable(chat) };
		if (index === 1) {
			const question = new ChatQuestionCarouselData([
				{
					id: 'policy', type: 'singleSelect', title: 'How should reconnect retries work?', options: [
						{ id: 'bounded', label: 'Retry three times', value: 'bounded' },
						{ id: 'manual', label: 'Wait for me', value: 'manual' },
					]
				},
			], true, 'prototype-retry');
			const request = addWorkCardRequest(model, 'Choose the retry behavior.', [question]);
			disposableStore.add(chatService.onDidReceiveQuestionCarouselAnswer(event => {
				if (event.requestId === request.id) {
					currentStatus.set(SessionStatus.Completed, undefined);
					request.response?.complete();
				}
			}));
		} else {
			addWorkCardRequest(model, specification.title, [{ kind: 'markdownContent', content: new MarkdownString(specification.body) }]).response?.complete();
		}
		return {
			session,
			get summary() { return readSessionWorkSummary(session, {}, { now: 1705406400000, inactivityDays: 30, active: false, pinned: false }); },
			get description() {
				switch (currentStatus.get()) {
					case SessionStatus.NeedsInput: return 'Waiting for your choice';
					case SessionStatus.InProgress: return 'Work is in progress';
					case SessionStatus.Error: return 'Work needs inspection';
					default: return 'Results available for review';
				}
			},
			pinned: false, archive: false,
		};
	});
	getDraft(entries[0].session.mainChat.get().resource).set({ inputText: 'Keep the existing behavior.', attachments: [] }, undefined);
	const ids = entries.map(entry => entry.session.sessionId);
	const initialState: ISessionCardBoardState = {
		order: scenario === 'reordered' ? [ids[4], ids[1], ids[0], ids[2], ids[3], ids[5]] : ids,
		sizes: scenario === 'wide' ? [{ id: ids[0], columnSpan: 2, height: 360 }] : [],
	};
	const board = disposableStore.add(instantiation.createInstance(SessionCardBoard, entries, {
		initialState,
		scrollBy: delta => scrollable.setScrollPosition({ scrollTop: scrollable.getScrollPosition().scrollTop + delta }),
	}));
	disposableStore.add(instantiation.get(ISessionsBoardService).registerView(board));
	scrollContent.appendChild(board.element);
	const layout = () => {
		const height = Math.max(0, container.clientHeight - 32 - header.offsetHeight - 16 - (help.hidden ? 0 : help.offsetHeight + 12));
		scrollable.getDomNode().style.height = `${height}px`;
		scrollContent.style.height = `${height}px`;
		board.layout(Math.max(0, container.clientWidth - 44), height);
		scrollable.scanDomNode();
		board.setViewport(scrollable.getScrollPosition().scrollTop, height);
	};
	disposableStore.add(board.onDidChangeHeight(() => scrollable.scanDomNode()));
	disposableStore.add(scrollable.onScroll(event => board.setViewport(event.scrollTop, event.height)));
	const toolbar = disposableStore.add(instantiation.createInstance(WorkbenchToolBar, toolbarContainer, {}));
	const reset = disposableStore.add(new Action('prototype.reset', 'Reset Layout', ThemeIcon.asClassName(Codicon.discard), true, () => board.resetLayout()));
	const toggleHelp = disposableStore.add(new Action('prototype.help', 'Keyboard Help', ThemeIcon.asClassName(Codicon.question), true, () => {
		help.hidden = !help.hidden;
		help.textContent = board.getAccessibilityHelp();
		layout();
	}));
	toolbar.setActions([reset, toggleHelp]);
	const resizeObserver = disposableStore.add(new DisposableResizeObserver('wrappingCardPrototype', layout, getWindow(container)));
	disposableStore.add(resizeObserver.observe(container));
	layout();
	await Promise.resolve();
	await Promise.resolve();
	if (scenario === 'preview') {
		board.beginReorder(ids[0]);
		board.previewReorder(width - 40, board.layoutInfo.height + 4);
	}
}

const expectedVisualDescriptions = [
	'A native prototype with one Release readiness heading and six sample session cards, not a tree of full-width rows.',
	'Compact cards share columns; a taller native pending question has neighbors beside and below it.',
	'Each card owns its focus border, resize edges, and reply width. No full-width selection band extends past a narrow card.',
	'The board has only one outer scrollbar. Native history appears above the reply only in enlarged cards.',
];

const interactiveOptions = { expectedVisualDescriptions, virtualTime: { enabled: false } };

export default defineThemedFixtureGroup({ path: 'sessions/WrappingCardPrototype/' }, {
	Compact: defineComponentFixture({ ...interactiveOptions, render: context => renderBoard(context, 'compact'), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	WideConversation: defineComponentFixture({ ...interactiveOptions, render: context => renderBoard(context, 'wide') }),
	Reordered: defineComponentFixture({ ...interactiveOptions, render: context => renderBoard(context, 'reordered') }),
	DropPreview: defineComponentFixture({ ...interactiveOptions, render: context => renderBoard(context, 'preview') }),
	Narrow: defineComponentFixture({ ...interactiveOptions, render: context => renderBoard(context, 'narrow') }),
	SingleColumn: defineComponentFixture({ ...interactiveOptions, render: context => renderBoard(context, 'small') }),
});
