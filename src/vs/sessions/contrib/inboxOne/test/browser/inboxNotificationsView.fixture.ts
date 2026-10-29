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
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatService, IChatToolInvocationSerialized } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatImageCarouselService } from '../../../../../workbench/contrib/chat/browser/chatImageCarouselService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ChatMarkdownAnchorService, IChatMarkdownAnchorService } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { ITerminalChatService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { fixtureResourceUri, readFixtureBinaryResource } from '../../../../../workbench/test/browser/componentFixtures/fixtureResourceLoader.js';
import { AbstractChatView } from '../../../../browser/parts/chatView.js';
import { IChat, ISession, SessionArtifactKind } from '../../../../services/sessions/common/session.js';
import { IChatViewFactory } from '../../../../services/chatView/browser/chatViewFactory.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { InboxNotificationsView } from '../../browser/inboxNotificationsView.js';
import { IInboxCanvasHostService, UnsupportedInboxCanvasHostService } from '../../browser/inboxCanvasHost.js';
import { IInboxDetailSummary, IInboxNotificationItem, IInboxNotificationsService, InboxNotificationActionKind, InboxNotificationKind, InboxNotificationPriority, InboxNotificationsSortMode } from '../../common/inboxNotificationsService.js';

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
	Questions: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: ctx => renderInbox(ctx, 1100) }),
	Narrow: defineComponentFixture({ render: ctx => renderInbox(ctx, 420) }),
	LongTitle: defineComponentFixture({ render: ctx => renderInbox(ctx, 360, 'longTitle') }),
	Confirmation: defineComponentFixture({ render: ctx => renderInbox(ctx, 1100, 'confirmation') }),
	Empty: defineComponentFixture({ render: ctx => renderInbox(ctx, 1100, 'empty') }),
	Evidence: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], deferPaint: true, virtualTime: { enabled: false }, render: ctx => renderInbox(ctx, 1300, 'evidence') }),
	EvidenceNarrow: defineComponentFixture({ deferPaint: true, virtualTime: { enabled: false }, render: ctx => renderInbox(ctx, 880, 'evidence') }),
});

async function renderInbox(ctx: ComponentFixtureContext, width: number, state?: 'longTitle' | 'confirmation' | 'empty' | 'evidence'): Promise<void> {
	const chat = upcastPartial<IChat>({
		resource: URI.parse('fixture:///search'),
		changes: constObservable([{ modifiedUri: URI.file('/workspace/search.ts'), originalUri: URI.parse('git:/workspace/search.ts'), insertions: 28, deletions: 6 }]),
	});
	const session = upcastPartial<ISession>({
		resource: URI.parse('fixture:///session'), sessionId: 'fixture', providerId: 'fixture',
		mainChat: constObservable(chat), chats: constObservable([chat]),
		capabilities: constObservable({ supportsMultipleChats: false }),
		artifacts: constObservable([
			{ id: 'wide', kind: SessionArtifactKind.File, label: 'Landscape sample (fixture)', uri: URI.file('/fixture/wide.png'), isArtifact: true },
			{ id: 'portrait', kind: SessionArtifactKind.File, label: 'Portrait sample (fixture)', uri: URI.file('/fixture/portrait.png'), isArtifact: true },
		]),
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
	const notifications = observableValue<readonly IInboxNotificationItem[]>('fixture.notifications', state === 'empty' ? [] : items.map((sourceItem, index) => {
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
	const service = new class extends mock<IInboxNotificationsService>() {
		override readonly notifications = notifications;
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
			reg.defineInstance(IAccessibleViewService, new class extends mock<IAccessibleViewService>() { }());
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() { }());
			reg.define(IInboxCanvasHostService, UnsupportedInboxCanvasHostService);
			reg.defineInstance(IChatImageCarouselService, new class extends mock<IChatImageCarouselService>() { override async openCarouselAtResource(): Promise<void> { } }());
			if (state === 'evidence') {
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
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() { }());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override getSession() { return state === 'evidence' ? session : undefined; }
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() { }());
			reg.defineInstance(IGitHubService, new class extends mock<IGitHubService>() { }());
			reg.defineInstance(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() { }());
			reg.defineInstance(IChatViewFactory, new class extends mock<IChatViewFactory>() {
				override createChatView(): AbstractChatView {
					return new class extends AbstractChatView {
						readonly kind = 'chat';
						constructor() {
							super();
							const input = document.createElement('textarea');
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

	ctx.container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = '820px';
	const view = ctx.disposableStore.add(instantiationService.createInstance(InboxNotificationsView, undefined, undefined));
	view.render(ctx.container);
	view.layout(width, 820);
	ctx.container.querySelector<HTMLElement>('.inbox-notifications-item')?.click();
	if (state === 'evidence') {
		await waitForFixtureCondition(() => !!ctx.container.querySelector('.inbox-notifications-detail-body > .inbox-notifications-detail-evidence:first-child:not([hidden])'), 'Expected agent interpretation at the top of the detail pane');
		await waitForFixtureCondition(() => [...ctx.container.querySelectorAll<HTMLImageElement>('.inbox-evidence img')].filter(image => !!image.src).length === 2, 'Expected both recorded image previews');
		await Promise.all([...ctx.container.querySelectorAll<HTMLImageElement>('.inbox-evidence img')].map(image => image.decode()));
		await waitForFixtureCondition(() => !ctx.container.querySelector('.inbox-notifications-toolbar-spinner:not(.hidden)'), 'Expected Inbox startup state to settle');
	}
}
