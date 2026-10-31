/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatService, IChatToolInvocationSerialized } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatSideChatService } from '../../../../../workbench/contrib/chat/common/chatSideChatService.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { IChatImageCarouselService } from '../../../../../workbench/contrib/chat/browser/chatImageCarouselService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ChatMarkdownAnchorService, IChatMarkdownAnchorService } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { ITerminalChatService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { fixtureResourceUri, readFixtureBinaryResource } from '../../../../../workbench/test/browser/componentFixtures/fixtureResourceLoader.js';
import { AbstractChatView } from '../../../../browser/parts/chatView.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { IChat, ISession, SessionArtifactKind } from '../../../../services/sessions/common/session.js';
import { IChatViewFactory } from '../../../../services/chatView/browser/chatViewFactory.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { InboxNotificationsView } from '../../browser/inboxNotificationsView.js';
import { IInboxCanvasHostService, UnsupportedInboxCanvasHostService } from '../../browser/inboxCanvasHost.js';
import { IInboxDetailSummary, IInboxNotificationItem, IInboxNotificationsService, IInboxSessionRow, InboxNotificationActionKind, InboxNotificationKind, InboxNotificationPriority, InboxNotificationsSortMode, InboxTab } from '../../common/inboxNotificationsService.js';

const actions = [
	{ id: 'open', label: 'Open Session', kind: InboxNotificationActionKind.OpenSession },
	{ id: 'done', label: '$(check)', ariaLabel: 'Mark as Done', kind: InboxNotificationActionKind.MarkDone },
];

const items: readonly IInboxNotificationItem[] = [
	{
		id: 'question', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now,
		title: 'Add workspace search', description: 'Search is wired up. Choose how results should open before I finish the keyboard flow.',
		repositoryLabel: 'acme/workbench', timestamp: 0, actions,
		needsInputPart: {
			kind: 'questionCarousel', chatResource: URI.parse('fixture:///search'), requestId: 'request', allowSkip: true,
			questions: [{
				id: 'behavior', type: 'singleSelect', title: 'Result navigation',
				message: 'How should a selected search result open?',
				description: 'This will also apply when navigating with the keyboard.',
				options: [
					{ id: 'preview', label: 'Preview in the current editor', value: 'preview' },
					{ id: 'tab', label: 'Always open a new tab', value: 'tab' },
					{ id: 'side', label: 'Open beside the current editor', value: 'side' },
				],
				allowFreeformInput: true,
			}],
		},
	},
	{
		id: 'review', kind: InboxNotificationKind.ReviewComments, priority: InboxNotificationPriority.Now,
		title: 'Handle cancelled requests', description: 'Two review comments need attention before this is ready to merge.',
		repositoryLabel: 'acme/api', timestamp: 0, actions,
	},
	{
		id: 'completed', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
		title: 'Improve keyboard navigation', description: 'Focus now follows the active pane. All 24 targeted tests pass.',
		repositoryLabel: 'acme/workbench', timestamp: 0, actions,
	},
];

export default defineThemedFixtureGroup({ path: 'sessions/inbox/' }, {
	Collapsed: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: ctx => renderInbox(ctx, 1100, 'collapsed') }),
	Hovered: defineComponentFixture({ render: ctx => renderInbox(ctx, 1100, 'hovered') }),
	Working: defineComponentFixture({ render: ctx => renderInbox(ctx, 1100, InboxTab.Working) }),
	ReadyToMerge: defineComponentFixture({ render: ctx => renderInbox(ctx, 1100, InboxTab.ReadyToMerge) }),
	OnHold: defineComponentFixture({ render: ctx => renderInbox(ctx, 1100, InboxTab.OnHold) }),
	Done: defineComponentFixture({ render: ctx => renderInbox(ctx, 1100, InboxTab.Done) }),
	Short: defineComponentFixture({ render: ctx => renderInbox(ctx, 900, 'short') }),
	Questions: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: ctx => renderInbox(ctx, 1100) }),
	Narrow: defineComponentFixture({ render: ctx => renderInbox(ctx, 420) }),
	LongTitle: defineComponentFixture({ render: ctx => renderInbox(ctx, 360, 'longTitle') }),
	Confirmation: defineComponentFixture({ render: ctx => renderInbox(ctx, 1100, 'confirmation') }),
	ToolConfirmation: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: ctx => renderInbox(ctx, 1100, 'toolConfirmation') }),
	ToolConfirmationNarrow: defineComponentFixture({ render: ctx => renderInbox(ctx, 420, 'toolConfirmation') }),
	TextQuestion: defineComponentFixture({ render: ctx => renderInbox(ctx, 1100, 'textQuestion') }),
	Empty: defineComponentFixture({ render: ctx => renderInbox(ctx, 1100, 'empty') }),
	Evidence: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], deferPaint: true, virtualTime: { enabled: false }, render: ctx => renderInbox(ctx, 1300, 'evidence') }),
	EvidenceNarrow: defineComponentFixture({ deferPaint: true, virtualTime: { enabled: false }, render: ctx => renderInbox(ctx, 880, 'evidence') }),
	MergedPullRequests: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: ctx => renderInbox(ctx, 560, 'merged') }),
	MergedPullRequestsNarrow: defineComponentFixture({ render: ctx => renderInbox(ctx, 360, 'merged') }),
	MergedPullRequestsExpanded: defineComponentFixture({ render: ctx => renderInbox(ctx, 560, 'mergedExpanded') }),
});

async function renderInbox(ctx: ComponentFixtureContext, width: number, state?: 'longTitle' | 'confirmation' | 'toolConfirmation' | 'textQuestion' | 'empty' | 'evidence' | 'merged' | 'mergedExpanded' | 'collapsed' | 'hovered' | 'short' | InboxTab): Promise<void> {
	const merged = state === 'merged' || state === 'mergedExpanded';
	const chat = upcastPartial<IChat>({
		resource: URI.parse('fixture:///search'),
		changes: constObservable([{ modifiedUri: URI.file('/workspace/search.ts'), originalUri: URI.parse('git:/workspace/search.ts'), insertions: 28, deletions: 6 }]),
	});
	const session = upcastPartial<ISession>({
		resource: URI.parse('fixture:///session'), sessionId: 'fixture', providerId: merged ? 'local-agent-host' : 'fixture',
		title: constObservable('Session with merged pull requests'), workspace: constObservable(undefined),
		mainChat: constObservable(chat), chats: constObservable([chat]),
		capabilities: constObservable({ supportsMultipleChats: false }),
		artifacts: constObservable(state === 'evidence' ? [
			{ id: 'wide', kind: SessionArtifactKind.File, label: 'Landscape sample (fixture)', uri: URI.file('/fixture/wide.png'), isArtifact: true },
			{ id: 'portrait', kind: SessionArtifactKind.File, label: 'Portrait sample (fixture)', uri: URI.file('/fixture/portrait.png'), isArtifact: true },
		] : []),
	});
	const command: IChatToolInvocationSerialized = {
		kind: 'toolInvocationSerialized', toolId: 'terminal', toolCallId: 'verification', source: undefined, presentation: undefined,
		invocationMessage: 'Run targeted tests', originMessage: undefined, pastTenseMessage: undefined, isConfirmed: true, isComplete: true,
		toolSpecificData: { kind: 'terminal', language: 'shell', commandLine: { original: 'npm test -- --grep search' }, terminalCommandState: { exitCode: 1 }, terminalCommandOutput: { text: 'Fixture output:\n23 passing\n1 failing: restores focus after cancellation' } },
	};
	const model = upcastPartial<IChatModel>({
		onDidChange: Event.None,
		getRequests: () => [upcastPartial<IChatRequestModel>({
			id: 'request',
			response: upcastPartial<IChatResponseModel>({ onDidChange: Event.None, response: upcastPartial<IChatResponseModel['response']>({ value: [command] }) }),
		})],
	});
	const imageBytes = new Map<string, VSBuffer>();
	if (state === 'evidence') {
		for (const [name, asset] of [['wide', 'image-hover-wide'], ['portrait', 'image-hover-portrait']]) {
			imageBytes.set(`/fixture/${name}.png`, VSBuffer.wrap(new Uint8Array(await readFixtureBinaryResource(fixtureResourceUri(`src/vs/workbench/test/browser/componentFixtures/chat/media/${asset}.png`)))));
		}
	}
	const sourceItems: readonly IInboxNotificationItem[] = merged ? [7, 3, 1].map(count => ({
		id: `merged-${count}`, kind: InboxNotificationKind.PullRequestMerged, priority: InboxNotificationPriority.Later,
		title: `${count} Pull Requests Merged`, description: 'Archive or delete this session when you are done.',
		repositoryLabel: 'acme/workbench', timestamp: 0,
		sessionResource: session.resource,
		actions: [
			{ id: 'archive', label: 'Archive Session', kind: InboxNotificationActionKind.ArchiveSession },
			{ id: 'delete', label: 'Delete Session', kind: InboxNotificationActionKind.DeleteSession },
			...actions,
		],
		pullRequestStates: Array.from({ length: count }, (_, index) => ({
			label: `acme/${index === 0 ? 'a-repository-with-a-long-name-for-workspace-customizations' : 'workbench'}#${1000 + index}`,
			repositoryLabel: 'acme/workbench', statusLabel: 'Merged', icon: { id: 'git-pull-request-done' },
			pullRequestUri: URI.parse(`https://github.com/acme/workbench/pull/${1000 + index}`),
		})),
	})) : items;
	const notifications = observableValue<readonly IInboxNotificationItem[]>('fixture.notifications', state === 'empty' ? [] : sourceItems.map((sourceItem, index) => {
		const item = { ...sourceItem, timestamp: Date.now() };
		if (index !== 0) {
			return item;
		}
		if (state === 'evidence') {
			return { ...item, sessionResource: session.resource };
		}
		if (state === 'longTitle') {
			return { ...item, title: 'Improve keyboard navigation and accessibility across all workspace search results' };
		}
		if (state === 'confirmation') {
			return {
				...item, kind: InboxNotificationKind.ConfirmationRequested,
				title: 'Update the workspace index', description: 'The index is ready to rebuild with the new search configuration.',
				needsInputPart: {
					kind: 'confirmation', chatResource: URI.parse('fixture:///search'), requestId: 'request',
					title: 'Rebuild the search index?', message: 'This updates the local index. No source files will be changed.',
					data: {}, buttons: ['Rebuild Index', 'Cancel'],
				},
			};
		}
		if (state === 'toolConfirmation') {
			return {
				...item, title: 'Review the terminal command', description: '',
				needsInputPart: {
					kind: 'toolConfirmation', chatResource: URI.parse('fixture:///search'), requestId: 'request', toolCallId: 'tool',
					confirmationKind: 'execution', title: 'Run in terminal: Print numbers 1 through 30', message: 'Print numbers 1 through 30',
					commandLine: 'seq 1 30', commandLanguage: 'sh',
					buttons: [
						{ id: 'once', label: 'Allow Once', kind: 'approve', useUserActionReason: true, group: 0 },
						{ id: 'session', label: 'Allow Command in This Session', kind: 'approve', useUserActionReason: true, group: 1 },
						{ id: 'always', label: 'Always Allow Exact Command', kind: 'approve', useUserActionReason: true, group: 2 },
						{ id: 'skip', label: 'Skip', kind: 'deny', useUserActionReason: true },
					],
				},
			};
		}
		if (state === 'textQuestion') {
			const message = 'What kind of weather do you enjoy most?';
			return {
				...item, title: 'Choose your favorite weather', description: message,
				needsInputPart: {
					kind: 'questionCarousel', chatResource: URI.parse('fixture:///search'), requestId: 'request', allowSkip: true, message,
					questions: [{ id: 'weather', type: 'text', title: 'Your favorite weather', detailedMessage: 'For example, sunny and warm, cool and breezy, or snowy.' }],
				},
			};
		}
		return item;
	}));
	const summaries = new Map<string, IInboxDetailSummary>([
		['question', {
			status: 'The search implementation is ready. Result navigation is the last decision before final validation.',
			decisions: ['Results use the existing editor service and preserve the current selection.'],
			evidence: [{ text: 'Keyboard navigation tests cover selection and focus restoration.', artifact: { kind: 'file', label: 'search.test.ts', uri: URI.file('/workspace/search.test.ts') } }],
		}],
		['completed', { status: items[2].description, decisions: [], evidence: [] }],
	]);
	const rows = observableValue<readonly IInboxSessionRow[]>('fixture.rows', [
		...notifications.get().map((item, index) => ({
			...item, tab: InboxTab.ReadyForYou, sessionTitle: item.title, occurrence: item.id, notifications: [item],
			title: index === 0 && (state === 'toolConfirmation' || state === 'textQuestion') ? item.title
				: ['Choose how search results should open', 'Address two review comments', 'Review the keyboard navigation changes'][index] ?? item.title,
			hasImages: index === 0,
		})),
		...(state === 'empty' || merged ? [] : ([InboxTab.Working, InboxTab.ReadyToMerge, InboxTab.OnHold, InboxTab.Done] as const).map((tab): IInboxSessionRow => ({
			id: tab, tab, title: { working: 'Implementing search results', readyToMerge: 'Merge the search improvements', onHold: 'Resume the accessibility review', done: 'Keyboard navigation reviewed' }[tab],
			kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later, description: '',
			sessionTitle: 'Improve workspace search', occurrence: tab, notifications: [], hasImages: false, timestamp: Date.now(), actions: [],
		}))),
	]);
	const service = new class extends mock<IInboxNotificationsService>() {
		override readonly notifications = notifications;
		override readonly sessionRows = rows;
		override setSessionOnHold(row: IInboxSessionRow, hold: boolean): void {
			rows.set(rows.get().map(candidate => candidate.id === row.id ? { ...candidate, tab: hold ? InboxTab.OnHold : InboxTab.ReadyForYou } : candidate), undefined);
		}
		override markSessionDone(row: IInboxSessionRow): void {
			rows.set(rows.get().map(candidate => candidate.id === row.id ? { ...candidate, tab: InboxTab.Done } : candidate), undefined);
		}
		override readonly dismissedNotifications = constObservable([]);
		override readonly previews = constObservable(new Map<string, string>());
		override readonly detailSummaries = constObservable(summaries);
		override readonly sortMode = observableValue('fixture.sortMode', InboxNotificationsSortMode.Priority);
		override readonly isLoading = constObservable(false);
		override setSortMode(mode: InboxNotificationsSortMode): void { this.sortMode.set(mode, undefined); }
		override requestPreview(): void { }
		override requestDetailSummary(): void { }
		override getInteractionTelemetryContext() { return { agentSessionId: 'none', providerId: 'none' }; }
		override dismissNotification(id: string): void { notifications.set(notifications.get().filter(item => item.id !== id), undefined); }
	}();
	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.define(IChatMarkdownAnchorService, ChatMarkdownAnchorService);
			reg.defineInstance(IInboxNotificationsService, service);
			reg.defineInstance(IChatService, new class extends mock<IChatService>() {
				override readonly onDidCreateModel = Event.None;
				override getSession() { return state === 'evidence' ? model : undefined; }
			}());
			reg.definePartialInstance(IChatSideChatService, {
				canAskInSideChat: () => true,
				askInSideChat: async () => { },
			});
			reg.defineInstance(IAccessibleViewService, new class extends mock<IAccessibleViewService>() { }());
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() { }());
			reg.define(IInboxCanvasHostService, UnsupportedInboxCanvasHostService);
			reg.defineInstance(IChatImageCarouselService, new class extends mock<IChatImageCarouselService>() { override async openCarouselAtResource(): Promise<void> { } }());
			if (state === 'evidence' || merged) {
				reg.defineInstance(IFileService, new class extends mock<IFileService>() {
					override async readFile(resource: URI): Promise<IFileContent> {
						const value = imageBytes.get(resource.path);
						if (!value) {
							throw new Error(`Unknown fixture image: ${resource.path}`);
						}
						return upcastPartial<IFileContent>({ value });
					}
				}());
			}
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly navigationRequest = constObservable(undefined);
				override async openNewSession() { return { session: undefined, trustDeclined: false }; }
			}());
			reg.defineInstance(IAgentWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() {
				override isVisible(): boolean { return false; }
			}());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override getSession() { return state === 'evidence' || merged ? session : undefined; }
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() { override getProvider() { return undefined; } }());
			reg.defineInstance(IGitHubService, new class extends mock<IGitHubService>() { }());
			reg.defineInstance(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() { }());
			reg.defineInstance(IChatViewFactory, new class extends mock<IChatViewFactory>() {
				override createNewChatView(): AbstractChatView {
					const view = this.createChatView();
					const input = view.element.querySelector('textarea')!;
					input.value = '';
					input.placeholder = 'Describe a new task';
					input.setAttribute('aria-label', 'Fixture new session input');
					return view;
				}
				override createChatView(): AbstractChatView {
					return new class extends AbstractChatView {
						readonly kind = 'chat';
						override get inputContentElement(): HTMLElement { return this.input; }
						private readonly input = document.createElement('textarea');
						constructor() {
							super();
							const input = this.input;
							input.setAttribute('aria-label', 'Fixture reply');
							input.value = 'Unsent Inbox draft';
							this.element.appendChild(input);
						}
						override setChat(): void { }
						protected override doLayout(): void { }
						override toJSON() { return {}; }
						override focus(): void { }
					}();
				}
			}());
			reg.defineInstance(ITerminalChatService, new class extends mock<ITerminalChatService>() { }());
		},
	});
	const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	await configurationService.setUserConfiguration('editor', { fontFamily: 'monospace' });
	instantiationService.get(IMarkdownRendererService).setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));

	ctx.container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	ctx.container.style.width = `${width}px`;
	const height = state === 'short' ? 360 : 820;
	ctx.container.style.height = `${height}px`;
	const view = ctx.disposableStore.add(instantiationService.createInstance(InboxNotificationsView, undefined, undefined));
	view.render(ctx.container);
	view.layout(width, height);
	await view.openNewSession();
	const workflowTab = [InboxTab.Working, InboxTab.ReadyToMerge, InboxTab.OnHold, InboxTab.Done].find(tab => tab === state);
	if (workflowTab) {
		const index = [InboxTab.ReadyForYou, InboxTab.Working, InboxTab.ReadyToMerge, InboxTab.OnHold, InboxTab.Done].indexOf(workflowTab);
		ctx.container.querySelectorAll<HTMLElement>('[role="tab"]')[index].click();
	} else if (state !== 'collapsed' && state !== 'hovered') {
		ctx.container.querySelector<HTMLElement>('.inbox-notifications-item')?.click();
	}
	if (state === 'hovered') {
		ctx.container.querySelector('.inbox-notifications-item')?.classList.add('hovered');
	}
	if (state === 'mergedExpanded') {
		ctx.container.querySelector<HTMLElement>('.inbox-notifications-item-pr-toggle')!.click();
	}
	if (state === 'toolConfirmation') {
		await waitForFixtureCondition(() => ctx.container.querySelector('.monaco-tokenized-source')?.textContent === 'seq 1 30', 'Expected the complete terminal command');
	}
	if (state === 'evidence') {
		await waitForFixtureCondition(() => !!ctx.container.querySelector('.inbox-notifications-detail-evidence:not([hidden])'), 'Expected agent interpretation in the detail pane');
		await waitForFixtureCondition(() => [...ctx.container.querySelectorAll<HTMLImageElement>('.inbox-evidence img')].filter(image => !!image.src).length === 2, 'Expected both recorded image previews');
		await Promise.all([...ctx.container.querySelectorAll<HTMLImageElement>('.inbox-evidence img')].map(image => image.decode()));
		await waitForFixtureCondition(() => !ctx.container.querySelector('.inbox-notifications-toolbar-spinner:not(.hidden)'), 'Expected Inbox startup state to settle');
	}
}
