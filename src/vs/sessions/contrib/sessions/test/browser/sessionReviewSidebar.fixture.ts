/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/sessionBoard.contribution.js';
import '../../../../../editor/contrib/placeholderText/browser/placeholderText.contribution.js';
import '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditor.contribution.js';
import { getWindow, isHTMLElement, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IInlineCompletionsService } from '../../../../../editor/browser/services/inlineCompletionsService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../../workbench/common/editor.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { toFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IPromptsService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { MockChatService } from '../../../../../workbench/contrib/chat/test/common/chatService/mockChatService.js';
import { ChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatRequestTextPart } from '../../../../../workbench/contrib/chat/common/requestParser/chatParserTypes.js';
import { ChatAgentService, IChatAgentService } from '../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { IChatDebugService } from '../../../../../workbench/contrib/chat/common/chatDebugService.js';
import { IChatGoalSummaryService } from '../../../../../workbench/contrib/chat/browser/chatGoalSummaryService.js';
import { ChatLayoutService } from '../../../../../workbench/contrib/chat/browser/widget/chatLayoutService.js';
import { IChatTipService } from '../../../../../workbench/contrib/chat/browser/chatTipService.js';
import { IChatLayoutService } from '../../../../../workbench/contrib/chat/common/widget/chatLayoutService.js';
import { ILanguageModelToolsService } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { MultiDiffEditorInput } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem, MultiDiffSourceResolverService } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { EditorService } from '../../../../../workbench/services/editor/browser/editorService.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService, MODAL_GROUP } from '../../../../../workbench/services/editor/common/editorService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { createEditorParts, TestLayoutService, TestLifecycleService, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ILifecycleService } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { IChatViewFactory } from '../../../../services/chatView/browser/chatViewFactory.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionOpenTelemetryService } from '../../../../services/sessions/browser/sessionOpenTelemetryService.js';
import { ISessionsChatBackgroundService } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import { SessionReviewHasSelectionContext, SessionReviewVisibleContext, SessionsBoardVisibleContext } from '../../../../common/contextkeys.js';
import { ISessionInputDraft, ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionReviewService } from '../../../../services/sessions/browser/sessionReviewService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionReviewSection } from '../../../../services/sessions/common/sessionReview.js';
import { SessionArtifactKind } from '../../../../services/sessions/common/session.js';
import { createNewChatInputFixtureServices } from '../../../chat/test/browser/newChatInput.fixture.js';
import { ChatView } from '../../../chat/browser/chatView.js';
import { ISessionsChatViewStateService, SessionsChatViewStateService } from '../../../chat/browser/chatViewStateService.js';
import { ISessionChatPillsDebugService } from '../../../chat/browser/sessionChatInputToolbarDebug.js';
import { ISessionArchiveNudgeService } from '../../../chat/browser/sessionArchiveNudge.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestReviewThreadsModel } from '../../../github/browser/models/githubPullRequestReviewThreadsModel.js';
import { PullRequestReviewEditorInput } from '../../../github/browser/pullRequestReviewEditor.js';
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubPullRequestState, IGitHubPullRequest, IGitHubCICheck } from '../../../github/common/types.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { SessionReviewSidebar } from '../../browser/sessionReviewSidebar.js';
import { SessionReviewComposer } from '../../browser/sessionReviewComposer.js';
import { SessionReviewEditorInput } from '../../browser/sessionReviewEditor.js';

interface IReviewFixtureOptions {
	readonly width?: number;
	readonly height?: number;
	readonly result?: boolean;
	readonly longDraft?: boolean;
	readonly resize?: boolean;
	readonly conversation?: boolean;
	readonly empty?: boolean;
	readonly changes?: boolean;
	readonly pullRequest?: boolean;
	readonly exerciseNavigation?: boolean;
	readonly manyReferences?: boolean;
}

async function renderReview(context: ComponentFixtureContext, options: IReviewFixtureOptions = {}): Promise<void> {
	const { container } = context;
	const disposableStore = new DisposableStore();
	let closeNativeModal: (() => Promise<boolean>) | undefined;
	context.disposableStore.add(toDisposable(() => {
		if (closeNativeModal) {
			void closeNativeModal().then(() => disposableStore.dispose(), error => {
				console.error(error);
				disposableStore.dispose();
			});
		} else {
			disposableStore.dispose();
		}
	}));
	const width = options.width ?? 1000;
	const height = options.height ?? 700;
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	container.classList.add('agent-sessions-workbench');
	const resource = URI.file('/project/src/permissions.ts');
	const pullRequest = { owner: 'microsoft', repo: 'vscode', number: 42, uri: URI.parse('https://github.com/microsoft/vscode/pull/42') };
	const original = makeSession(URI.parse('fixture:/review'));
	const model: ILanguageModelChatMetadataAndIdentifier = {
		identifier: 'fixture/auto',
		metadata: {
			extension: new ExtensionIdentifier('fixture.sessions'), id: 'auto', name: 'Auto', vendor: 'fixture', version: '1',
			family: 'fixture', maxInputTokens: 128000, maxOutputTokens: 8192,
			isDefaultForLocation: {},
		},
	};
	const chat = { ...original.activeChat.get(), modelId: constObservable(model.identifier) };
	const session = {
		...original,
		title: constObservable('Audit extension permissions'),
		activeChat: constObservable(chat),
		mainChat: constObservable(chat),
		chats: constObservable([chat]),
		modelId: chat.modelId,
		changesSummary: options.changes ? constObservable({ files: 1, additions: 3, deletions: 1 }) : undefined,
		artifacts: constObservable(options.empty ? [] : [
			{ id: 'review-notes', kind: SessionArtifactKind.File, label: 'Review notes.md', uri: URI.file('/project/review-notes.md'), isArtifact: true },
			{ id: 'permissions', kind: SessionArtifactKind.File, label: 'permissions.ts', uri: resource, isArtifact: false },
			...(options.pullRequest ? [{ id: 'pull-request', kind: SessionArtifactKind.PullRequest, label: 'Preserve permission prompts', link: pullRequest.uri, isArtifact: true }] : []),
		]),
		workspace: constObservable({
			uri: URI.file('/project'), label: 'microsoft/vscode', icon: Codicon.repo,
			folders: [{ root: URI.file('/project'), workingDirectory: URI.file('/project'), name: 'vscode', description: undefined }],
			requiresWorkspaceTrust: false, isVirtualWorkspace: false,
		}),
	};
	const section = observableValue('section', options.conversation ? SessionReviewSection.Conversation : options.changes ? SessionReviewSection.Changes : options.pullRequest ? SessionReviewSection.PullRequest : SessionReviewSection.Artifacts);
	const draft = observableValue<ISessionInputDraft>('draft', {
		inputText: options.longDraft ? 'Keep the confirmation behavior consistent across every entry point.\n'.repeat(12) : '',
		attachments: options.manyReferences
			? Array.from({ length: 12 }, (_, index) => toFileVariableEntry(URI.file(`/project/src/permissions-${index}.ts`)))
			: options.result ? [toFileVariableEntry(resource)] : [],
	});
	const selection = observableValue('selection', options.pullRequest ? { resource: pullRequest.uri, label: 'Preserve permission prompts' } : options.result || options.changes ? { resource, label: 'src/permissions.ts' } : undefined);
	let navigate: ((section: SessionReviewSection) => Promise<void>) | undefined;
	let pendingNavigation = Promise.resolve();
	const provider: ISessionsProvider = new class extends mock<ISessionsProvider>() {
		override readonly id = session.providerId;
		override readonly label = 'Copilot';
		override readonly icon = Codicon.copilot;
		override readonly onDidChangeModels = Event.None;
		override getModelsSnapshot() { return { models: [model], modelTarget: 'fixture', desiredModelResolution: { kind: 'available' as const, model } }; }
		override getModelPickerOptions() { return { useGroupedModelPicker: true, showFeatured: false, showUnavailableFeatured: false, showManageModelsAction: false }; }
		override getSessionTypes() { return []; }
	}();
	const traces: string[] = [];
	const log = disposableStore.add(new class extends NullLogService {
		override error(...args: unknown[]): void { console.error(...args.map(argument => argument instanceof Error ? argument.stack?.split('\n').slice(0, 5).join('\n') ?? argument.message : argument)); }
		override trace(message: string): void { if (message.startsWith('[ChatView]')) { traces.push(message); } }
	}());
	const instantiation = createNewChatInputFixtureServices({ ...context, disposableStore }, {
		additionalServices: registration => {
			registration.defineInstance(ILogService, log);
			registration.define(IContextKeyService, ContextKeyService);
			registration.define(IMenuService, MenuService);
			registration.definePartialInstance(IWorkbenchLayoutService, {
				mainContainer: container,
				mainContainerDimension: { width, height },
				getContainer: () => container,
			});
			registration.definePartialInstance(ISessionsService, {
				activeSession: constObservable(session),
				sessionReview: section.map(section => ({ sessionResource: session.resource, section })),
				visibleSessions: constObservable([session]),
				openSessionReview: async (_session, target) => {
					section.set(target, undefined);
					pendingNavigation = navigate?.(target) ?? Promise.resolve();
					await pendingNavigation;
				},
				setSessionReviewSection: target => {
					section.set(target, undefined);
					pendingNavigation = navigate?.(target) ?? Promise.resolve();
				},
			});
			registration.definePartialInstance(ISessionsManagementService, {
				onDidChangeSessionTypes: Event.None,
				getSessionTypesForFolder: () => [],
			});
			registration.definePartialInstance(ISessionsProvidersService, {
				onDidChangeProviders: Event.None,
				getProvider: <T extends ISessionsProvider>() => provider as T,
				getProviders: () => [provider],
			});
			registration.definePartialInstance(ISessionReviewService, {
				section,
				selection,
				send: async () => true,
				discuss: () => {
					const selected = selection.get();
					if (!selected) { throw new Error('A fixture result must be selected before adding it to the reply'); }
					draft.set({ ...draft.get(), attachments: [toFileVariableEntry(selected.resource)] }, undefined);
				},
			});
			registration.definePartialInstance(ISessionInputDraftService, { getDraft: () => draft, setDraft: (_resource, value) => draft.set(value, undefined) });
			registration.definePartialInstance(ISessionChangesStatsCache, { get: () => undefined });
			if (options.conversation) {
				registration.define(IChatService, class extends MockChatService {
					override async acquireOrLoadSession(resource: URI) {
						const model = this.getSession(resource);
						if (!model) { throw new Error('Missing fixture conversation'); }
						return { object: model, dispose: () => { } };
					}
				});
				registration.define(ILifecycleService, TestLifecycleService);
				registration.define(IChatAgentService, ChatAgentService);
				registration.define(IChatLayoutService, ChatLayoutService);
				registration.definePartialInstance(IChatDebugService, { onDidAddEvent: Event.None, getEvents: () => [] });
				registration.definePartialInstance(IChatGoalSummaryService, {});
				registration.definePartialInstance(IChatTipService, {
					onDidDismissTip: Event.None, onDidNavigateTip: Event.None, onDidHideTip: Event.None, onDidDisableTips: Event.None,
					getWelcomeTip: () => undefined, resetSession: () => { }, hasMultipleTips: () => false,
				});
				registration.definePartialInstance(ILanguageModelToolsService, {
					onDidChangeTools: Event.None, onDidPrepareToolCallBecomeUnresponsive: Event.None, onDidInvokeTool: Event.None,
					getTools: () => [], observeTools: () => constObservable([]), getToolSetsForModel: () => [],
				});
				registration.define(ISessionsChatViewStateService, SessionsChatViewStateService);
				registration.definePartialInstance(ISessionChatPillsDebugService, { register: () => Disposable.None, clear: () => { } });
				registration.definePartialInstance(ISessionOpenTelemetryService, { modelBound: () => { }, modelUnbound: () => { }, modelBindFailed: () => { throw new Error('Native fixture conversation failed to bind'); } });
				registration.definePartialInstance(ISessionsChatBackgroundService, { onDidChangeBackground: Event.None, getBackground: () => undefined });
				registration.definePartialInstance(ISessionsPartService, {});
				registration.definePartialInstance(ISessionArchiveNudgeService, {});
				registration.definePartialInstance(IGitHubService, {});
				registration.definePartialInstance(ISessionChangesService, { activeSessionUncommittedChangesCountObs: constObservable(undefined) });
				registration.definePartialInstance(IAgentWorkbenchLayoutService, {
					isSinglePaneLayoutEnabled: false, mainContainer: container, mainContainerDimension: { width, height },
					getContainer: () => container, onDidChangePartVisibility: Event.None, onDidChangeWindowMaximized: Event.None,
					isVisible: () => true,
				});
				registration.definePartialInstance(IAgentFeedbackService, {
					onDidChangeFeedback: Event.None, onDidChangeFeedbackVisibility: Event.None, onDidChangeFeedbackScope: Event.None,
					getFeedback: () => [],
				});
			}
		},
	});
	const commands = new class extends mock<ICommandService>() {
		override readonly onWillExecuteCommand = Event.None;
		override readonly onDidExecuteCommand = Event.None;
		override async executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T | undefined> {
			const command = CommandsRegistry.getCommand(id);
			if (!command || !id.startsWith('sessions.review.')) { throw new Error(`The fixture cannot run command ${id}`); }
			await instantiation.invokeFunction(command.handler, ...args);
			return undefined;
		}
	}();
	instantiation.stub(ICommandService, commands);
	if (options.conversation) {
		instantiation.stub(IChatSessionsService, instantiation.get(IChatSessionsService), 'onDidChangeContentProviderSchemes', Event.None);
		instantiation.stub(IChatSessionsService, instantiation.get(IChatSessionsService), 'getChatSessionContribution', () => undefined);
		instantiation.stub(IChatSessionsService, instantiation.get(IChatSessionsService), 'sessionSupportsFork', () => false);
		instantiation.stub(IChatSessionsService, instantiation.get(IChatSessionsService), 'sessionSupportsRename', () => false);
		instantiation.stub(IPromptsService, instantiation.get(IPromptsService), 'listAgentInstructions', async () => []);
		const configuration = instantiation.get(IConfigurationService);
		if (configuration instanceof TestConfigurationService) {
			configuration.setUserConfiguration('chat', { editor: { fontSize: 13, fontFamily: 'default', fontWeight: 'default', lineHeight: 0, wordWrap: 'off' } });
			configuration.setUserConfiguration('editor', { fontFamily: 'monospace', fontLigatures: false });
		}
		const model = disposableStore.add(instantiation.createInstance(ChatModel, undefined, {
			initialLocation: ChatAgentLocation.Chat, canUseTools: true, resource: chat.resource,
		}));
		const service = instantiation.get(IChatService);
		if (!(service instanceof MockChatService)) { throw new Error('Expected fixture chat service'); }
		service.addSession(model);
		const text = 'Keep extension permission checks consistent across the editor and review views.';
		const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)] }, { variables: [] }, 0);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Updated the permission check to use the shared policy helper.\n\n- Existing approvals stay unchanged.\n- Read-only chats cannot send requests.\n- Keyboard focus returns to the selected session.\n\nThe change is ready to review in **Changes**. I also recorded a short review note in **Artifacts**.') });
		request.response?.complete();
	}
	const keys = instantiation.get(IContextKeyService);
	ChatContextKeys.enabled.bindTo(keys).set(true);
	IsSessionsWindowContext.bindTo(keys).set(true);
	SessionsBoardVisibleContext.bindTo(keys).set(true);
	SessionReviewVisibleContext.bindTo(keys).set(true);
	SessionReviewHasSelectionContext.bindTo(keys).set(!!options.result || !!options.changes || !!options.pullRequest);
	{
		container.style.position = 'relative';
		const nativeDisposables = disposableStore.add(new DisposableStore());
		const editors = workbenchInstantiationService(undefined, nativeDisposables);
		editors.stub(ILogService, log);
		const layoutService = new TestLayoutService();
		layoutService.mainContainer = container;
		layoutService.activeContainer = container;
		layoutService.containers = [container];
		layoutService.mainContainerDimension = { width, height };
		const layoutChanged = nativeDisposables.add(new Emitter<{ readonly width: number; readonly height: number }>());
		layoutService.onDidLayoutMainContainer = layoutChanged.event;
		editors.stub(IWorkbenchLayoutService, layoutService);
		editors.stub(IContextKeyService, keys);
		editors.stub(IThemeService, instantiation.get(IThemeService));
		editors.stub(ISessionsService, instantiation.get(ISessionsService));
		editors.stub(IChatViewFactory, {
			createChatView: scope => {
				if (!options.conversation) { throw new Error('Artifact review must not load the conversation'); }
				const context = scope?.invokeFunction(accessor => accessor.get(IContextKeyService)) ?? keys;
				const scoped = nativeDisposables.add(instantiation.createChild(new ServiceCollection([IContextKeyService, context])));
				return scoped.createInstance(ChatView);
			}
		});
		editors.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(editors, nativeDisposables);
		closeNativeModal = () => parts.activeModalEditorPart?.close() ?? Promise.resolve(true);
		editors.stub(IEditorGroupsService, parts);
		const editorService = nativeDisposables.add(editors.createInstance(EditorService, undefined));
		editors.stub(IEditorService, editorService);
		navigate = async target => {
			const input = nativeDisposables.add(new SessionReviewEditorInput(session.resource, target));
			await editorService.openEditor(input, { pinned: true }, MODAL_GROUP);
		};
		if (options.pullRequest) {
			const details = new class extends mock<GitHubPullRequestModel>() {
				override readonly pullRequest = constObservable<IGitHubPullRequest>({
					number: 42, title: 'Preserve permission prompts across review views',
					body: 'Uses the shared permission policy in the editor and the session review.\n\n### What changed\n- Keep existing approvals when opening results.\n- Preserve keyboard focus when returning to the board.\n- Add a regression test for read-only sessions.',
					state: GitHubPullRequestState.Open, author: { login: 'octocat', avatarUrl: '' },
					headRef: 'session-review-permissions', baseRef: 'main', headSha: 'fixture-head', isDraft: false,
					createdAt: '2026-09-10T12:00:00Z', updatedAt: '2026-09-10T14:00:00Z', mergedAt: undefined,
					mergeable: true, mergeableState: 'clean',
				});
				override readonly reviews = constObservable([]);
				override async refresh(): Promise<void> { }
			}();
			const threads = new class extends mock<GitHubPullRequestReviewThreadsModel>() {
				override readonly reviewThreads = constObservable([]);
				override readonly hasLoaded = constObservable(true);
				override readonly initialRefreshCompleted = constObservable(true);
				override async refresh(): Promise<void> { }
			}();
			const checks = new class extends mock<GitHubPullRequestCIModel>() {
				override readonly checks = constObservable<readonly IGitHubCICheck[]>([
					{ id: 1, name: 'Unit tests', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success, startedAt: undefined, completedAt: undefined, detailsUrl: undefined },
					{ id: 2, name: 'Screenshots', status: GitHubCheckStatus.InProgress, conclusion: undefined, startedAt: undefined, completedAt: undefined, detailsUrl: undefined },
				]);
				override async refresh(): Promise<void> { }
			}();
			editors.stub(IGitHubService, {
				createPullRequestModelReference: () => ({ object: details, dispose: () => { } }),
				createPullRequestReviewThreadsModelReference: () => ({ object: threads, dispose: () => { } }),
				createPullRequestCIModelReference: () => ({ object: checks, dispose: () => { } }),
			});
		}
		await parts.createModalEditorPart({
			maximized: true,
			sidebar: {
				placement: 'left',
				sidebarWidth: 240,
				sidebarHidden: false,
				render: (parent, layout, context) => {
					if (!isHTMLElement(parent)) { throw new Error('Expected a native modal sidebar container'); }
					const scoped: IInstantiationService = nativeDisposables.add(instantiation.createChild(new ServiceCollection([IContextKeyService, context])));
					return scoped.createInstance(SessionReviewSidebar, parent, layout, session);
				},
			},
			contentFooter: {
				height: 220,
				render: (parent, layout, context) => {
					if (!isHTMLElement(parent)) { throw new Error('Expected a native modal content footer container'); }
					const scoped: IInstantiationService = nativeDisposables.add(instantiation.createChild(new ServiceCollection([IContextKeyService, context])));
					return scoped.createInstance(SessionReviewComposer, parent, layout, session);
				},
			},
		});
		if (options.changes) {
			editors.stub(IMultiDiffSourceResolverService, new MultiDiffSourceResolverService());
			editors.stub(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
			editors.stub(ITextModelService, instantiation.get(ITextModelService));
			editors.stub(IUserInteractionService, instantiation.get(IUserInteractionService));
			editors.stub(ICommandService, instantiation.get(ICommandService));
			editors.stub(IDefaultAccountService, instantiation.get(IDefaultAccountService));
			editors.stub(IInlineCompletionsService, instantiation.get(IInlineCompletionsService));
			editors.stub(IAgentFeedbackService, {
				onDidChangeNavigation: Event.None, onDidChangeFeedback: Event.None, onDidChangeFeedbackScope: Event.None,
				onDidChangeFeedbackVisibility: Event.None, getFeedbackSessionResource: () => undefined,
			});
			instantiation.stub(IMultiDiffSourceResolverService, new MultiDiffSourceResolverService());
			instantiation.stub(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
			instantiation.stub(ITextFileService, editors.get(ITextFileService));
			instantiation.stub(ITextResourceConfigurationService, editors.get(ITextResourceConfigurationService));
			const models = instantiation.get(IModelService);
			const original = disposableStore.add(models.createModel('export function canRunTool() {\n\treturn true;\n}\n', null, URI.parse('inmemory:/project/src/permissions.ts?base')));
			const modified = disposableStore.add(models.createModel('import { isApproved } from \"./policy.js\";\n\nexport function canRunTool() {\n\treturn isApproved();\n}\n', null, URI.parse('inmemory:/project/src/permissions.ts?working')));
			const input = nativeDisposables.add(instantiation.createInstance(MultiDiffEditorInput, URI.parse('fixture-diff:/permissions'), 'Session Changes', [
				new MultiDiffEditorItem(original.uri, modified.uri, resource),
			], true));
			await editorService.openEditor(input, { pinned: true }, MODAL_GROUP);
		} else {
			const input = nativeDisposables.add(options.pullRequest ? new PullRequestReviewEditorInput(pullRequest) : new SessionReviewEditorInput(session.resource, section.get()));
			await editorService.openEditor(input, { pinned: true }, MODAL_GROUP);
		}
		if (options.resize) {
			const input = container.querySelector('.session-review-composer .monaco-editor');
			draft.set({ inputText: 'Keep this reply while I inspect another result.', attachments: [toFileVariableEntry(resource)] }, undefined);
			section.set(SessionReviewSection.Artifacts, undefined);
			const actions = container.querySelectorAll<HTMLElement>('.session-review-sections .action-label');
			actions[0].focus();
			actions[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
			if (getWindow(container).document.activeElement !== actions[1]) {
				throw new Error('The vertical review toolbar must navigate with the Down Arrow key.');
			}
			for (const dimension of [{ width: 800, height: 300 }, { width: 390, height: 300 }, { width, height }]) {
				container.style.width = `${dimension.width}px`;
				container.style.height = `${dimension.height}px`;
				layoutService.mainContainerDimension = dimension;
				layoutChanged.fire(dimension);
				await new Promise<void>(resolve => disposableStore.add(scheduleAtNextAnimationFrame(getWindow(container), () => resolve())));
				if (container.querySelector('.session-review-composer .monaco-editor') !== input) {
					throw new Error('Changing review sections or modal size must not recreate the reply editor.');
				}
				if (draft.get().inputText !== 'Keep this reply while I inspect another result.' || draft.get().attachments.length !== 1) {
					throw new Error('Changing review sections or modal size must preserve the reply and its reference.');
				}
				if (getWindow(container).document.activeElement?.querySelector('.session-review-action-name')?.textContent !== 'Artifacts') {
					throw new Error('Resizing must retain keyboard focus on the same review section.');
				}
			}
		}
	}
	await new Promise<void>(resolve => disposableStore.add(scheduleAtNextAnimationFrame(getWindow(container), () => resolve())));
	if (options.exerciseNavigation) {
		const input = container.querySelector('.session-review-composer .monaco-editor');
		draft.set({ inputText: 'Keep the existing approvals.', attachments: [toFileVariableEntry(resource)] }, undefined);
		await commands.executeCommand('sessions.review.artifacts', session);
		await pendingNavigation;
		await commands.executeCommand('sessions.review.conversation', session);
		await pendingNavigation;
		await new Promise<void>(resolve => disposableStore.add(scheduleAtNextAnimationFrame(getWindow(container), () => resolve())));
		if (container.querySelector('.session-review-composer .monaco-editor') !== input || draft.get().inputText !== 'Keep the existing approvals.' || draft.get().attachments.length !== 1) {
			throw new Error('Review navigation must preserve the native reply editor and its draft references.');
		}
	}
	if (options.conversation && !container.querySelector('.chat-view[data-bound-chat-resource]')) {
		throw new Error(`The native review transcript did not bind: ${traces.join('; ')}`);
	}
	if (options.changes && !container.querySelector('.multiDiffEditor')) {
		throw new Error('The changes fixture must render the native multi-file diff editor.');
	}
	if (options.pullRequest && container.querySelectorAll('.pull-request-review-toolbar .action-label').length !== 2) {
		throw new Error('Completing the native PR editor open must retain its Open on GitHub and Retry actions.');
	}

	const input = container.querySelector<HTMLElement>('.session-review-composer .sessions-chat-editor');
	const inputRectangle = input?.getBoundingClientRect();
	const host = container.getBoundingClientRect();
	if (!inputRectangle || inputRectangle.height < 40 || inputRectangle.width < 100 || inputRectangle.bottom > host.bottom || inputRectangle.top < host.top) {
		throw new Error('Session review must keep the real native reply editor visible and within the supplied layout bounds.');
	}
	if (container.querySelector<HTMLElement>('.session-review-composer')?.style.top) {
		throw new Error('An embedded reply must not apply the welcome composer centering offset to its host.');
	}
	if (container.querySelector('.session-review-navigation .action-label.codicon, .session-review-selected-actions .action-label.codicon')) {
		throw new Error('Review action labels must not render text in the icon font.');
	}
	const footer = container.querySelector<HTMLElement>('.modal-editor-content-footer');
	const editor = footer?.parentElement?.querySelector<HTMLElement>(':scope > .content');
	const sidebar = container.querySelector<HTMLElement>('.modal-editor-sidebar');
	if (!footer || !editor || !sidebar || !footer.querySelector('.session-review-composer') || sidebar.querySelector('.session-review-composer')) {
		throw new Error('Only the native content footer may host the review composer; the sidebar is navigation only.');
	}
	const footerRect = footer.getBoundingClientRect();
	const editorRect = editor.getBoundingClientRect();
	const sidebarRect = sidebar.getBoundingClientRect();
	if (footerRect.left !== editorRect.left || footerRect.width !== editorRect.width || footerRect.top < editorRect.bottom || sidebarRect.right > footerRect.left) {
		throw new Error('The native reply footer must stay below the editor content column, with navigation on its left.');
	}
	if (container.querySelectorAll('.session-review-composer').length !== 1) {
		throw new Error('Changing native review editors must never create a second reply composer.');
	}
	const selectedSection = container.querySelector<HTMLElement>('.session-review-sections .action-label.checked');
	const selectedStyle = selectedSection && getWindow(container).getComputedStyle(selectedSection);
	if (!selectedStyle || selectedStyle.backgroundColor === 'rgba(0, 0, 0, 0)' && selectedStyle.outlineColor === 'rgba(0, 0, 0, 0)') {
		throw new Error('The currently selected review section must have a visible selection treatment.');
	}
}

const expectedVisualDescriptions = [
	'The session title and a readable selected section establish the review context. Back to Board is separate from result actions.',
	'One native reply editor stays below the editor content column, with a named chat target, explicit Add to Reply action, attachments, and send controls.',
	'Navigation stays on the left at every size; the footer scrolls independently when the window is short.',
];

export default defineThemedFixtureGroup({ path: 'sessions/SessionReview/', labels: { kind: 'screenshot' } }, {
	Conversation: defineComponentFixture({ render: context => renderReview(context, { conversation: true }), expectedVisualDescriptions, additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	Result: defineComponentFixture({ render: context => renderReview(context, { result: true }), expectedVisualDescriptions }),
	Bottom: defineComponentFixture({ render: context => renderReview(context, { width: 800, height: 300, result: true }), expectedVisualDescriptions }),
	Narrow: defineComponentFixture({ render: context => renderReview(context, { width: 360, height: 300, result: true }), expectedVisualDescriptions }),
	LongReply: defineComponentFixture({ render: context => renderReview(context, { longDraft: true, result: true }), expectedVisualDescriptions }),
	NativeWorkspace: defineComponentFixture({ render: context => renderReview(context), expectedVisualDescriptions }),
	NativeNarrowWorkspace: defineComponentFixture({ render: context => renderReview(context, { width: 390 }), expectedVisualDescriptions }),
	NativeConversation: defineComponentFixture({ render: context => renderReview(context, { conversation: true }), expectedVisualDescriptions }),
	NativeChanges: defineComponentFixture({ render: context => renderReview(context, { changes: true }), expectedVisualDescriptions }),
	NativePullRequest: defineComponentFixture({ render: context => renderReview(context, { pullRequest: true }), expectedVisualDescriptions }),
	NativeJourney: defineComponentFixture({ render: context => renderReview(context, { conversation: true, exerciseNavigation: true }), expectedVisualDescriptions }),
	ShortWindow: defineComponentFixture({ render: context => renderReview(context, { height: 260, result: true, longDraft: true }), expectedVisualDescriptions }),
	ManyReferences: defineComponentFixture({ render: context => renderReview(context, { result: true, manyReferences: true }), expectedVisualDescriptions }),
	EmptyArtifacts: defineComponentFixture({ render: context => renderReview(context, { empty: true }), expectedVisualDescriptions }),
	ResizeAndSwitch: defineComponentFixture({ render: context => renderReview(context, { resize: true, result: true }), expectedVisualDescriptions }),
});
