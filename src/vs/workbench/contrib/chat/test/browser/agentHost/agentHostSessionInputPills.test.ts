/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { IAction, SubmenuAction } from '../../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { combinedDisposable, Disposable, ImmortalReference, toDisposable, type IReference } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { basename, dirname } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../../platform/agentHost/common/agentHostFileSystemService.js';
import { createAgentHostResourceUriMapper, IAgentHostResourceUriMapper, identityAgentHostResourceUriMapper, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { CanvasesEnabledSettingId, IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ChangesetKind, DefaultChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ISessionArtifact, SessionArtifactType, withSessionArtifacts } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { AgentHostArtifactRemovalCapabilityMetaKey } from '../../../../../../platform/agentHost/common/meta/agentHostArtifactRemovalMeta.js';
import { toCopilotBackgroundShellMeta } from '../../../../../../platform/agentHost/common/meta/copilotBackgroundWorkMeta.js';
import { BackgroundWorkKind, type BackgroundShellWork } from '../../../../../../platform/agentHost/common/state/protocol/channels-chat/state.js';
import { buildDefaultChatUri, buildSubagentChatUri, Changeset, ChangesetOperation, ChangesetOperationScope, ChangesetOperationStatus, ChangesetOperationTargetKind, ChangesetState, ChangesetStatus, ChatOriginKind, ChatState, ChatSummary, ChildCustomization, ComponentToState, Customization, CustomizationType, ResponsePartKind, SessionLifecycle, SessionState, SessionStatus, StateComponents, ToolCallConfirmationReason, ToolCallStatus, Turn, withSessionGitHubState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../../../../../../platform/agentHost/common/state/protocol/channels-changeset/commands.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestClipboardService } from '../../../../../../platform/clipboard/test/common/testClipboardService.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService, ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IConfirmation, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IGitHubClient, IGitHubService } from '../../../../../../platform/github/common/githubService.js';
import { GitHubIssue } from '../../../../../../platform/github/common/githubQueryService.js';
import { IWorkbenchGitHubService } from '../../../../../services/github/common/githubService.js';
import { FragmentState, PullRequestSnapshot } from '../../../../../../platform/github/common/githubPullRequestService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { BrowserEditorInput } from '../../../../browserView/common/browserEditorInput.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';
import { ICanvas, ICanvasContext, REVEAL_CANVAS_COMMAND_ID } from '../../../../canvases/common/canvas.js';
import { IEditorService, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { isResourceMultiDiffEditorInput, IUntypedEditorInput } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, ChatConfiguration } from '../../../common/constants.js';
import { IChatImageCarouselService } from '../../../browser/chatImageCarouselService.js';
import { IArtifactSourceGroup, IChatArtifacts, IChatArtifactsService } from '../../../common/tools/chatArtifactsService.js';
import { IChatWidgetService, type IChatWidgetViewModelChangeEvent } from '../../../browser/chat.js';
import { getSubagentEditorResource } from '../../../browser/widget/chatContentParts/chatSubagentOpenChat.js';
import { AgentHostSessionInputPills, getAgentHostSessionBrowserOwnerIds, getAgentHostSessionPillMetadata, resolveAgentHostChangeset } from '../../../browser/agentSessions/agentHost/agentHostSessionInputPills.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { ISessionChatPillVisibilityService, SESSION_CHAT_PILL_KINDS, SessionChatPillKind, SessionChatPillVisibility } from '../../../common/sessionChatPills.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { createSessionPullRequestPillData } from '../../../browser/sessionPullRequestPill.js';
import { chatPersistentContentVisibleClass, ChatWidget } from '../../../browser/widget/chatWidget.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import type { IChatSessionWorkingSetKeep, IChatSessionWorkingSetUndo } from '../../../browser/widget/input/chatSessionWorkingSet.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { ChatViewModel } from '../../../common/model/chatViewModel.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { getChatSessionType, LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { TestCustomizationJobScheduler } from '../../common/testCustomizationJobScheduler.js';
import { createCustomizationIndexObservable, CustomizationIndex, CustomizationRefKind } from '../../../common/agentHostSessionCustomizations.js';

class StaticAgentConnection extends mock<IAgentConnection>() {
	override resourceUris = identityAgentHostResourceUriMapper;
	readonly requested: Array<{ kind: StateComponents; resource: URI }> = [];
	readonly released: URI[] = [];
	readonly removeSessionArtifactCalls: { readonly session: URI; readonly artifactId: string }[] = [];
	readonly invokedChangesetOperations: InvokeChangesetOperationParams[] = [];
	override readonly initializeResult;
	removeSessionArtifactError: Error | undefined;
	invokeChangesetOperationError: ((params: InvokeChangesetOperationParams) => Error | undefined) | undefined;
	private readonly emitters = new Map<StateComponents, Emitter<unknown>>();

	constructor(private readonly values: ReadonlyMap<StateComponents, SessionState | ChatState | ChangesetState>, supportsArtifactRemoval = false) {
		super();
		this.initializeResult = constObservable<InitializeResult | undefined>(supportsArtifactRemoval ? upcastPartial<InitializeResult>({
			_meta: { [AgentHostArtifactRemovalCapabilityMetaKey]: true },
		}) : undefined);
	}

	override getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
		this.requested.push({ kind, resource });
		let emitter = this.emitters.get(kind);
		if (!emitter) {
			emitter = new Emitter<unknown>();
			this.emitters.set(kind, emitter);
		}
		const values = this.values;
		return {
			object: {
				get value() { return values.get(kind) as ComponentToState[T]; },
				get verifiedValue() { return values.get(kind) as ComponentToState[T]; },
				onDidChange: emitter.event as Event<ComponentToState[T]>,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			},
			dispose: () => { this.released.push(resource); },
		};
	}

	setState(kind: StateComponents, value: SessionState | ChatState | ChangesetState): void {
		(this.values as Map<StateComponents, SessionState | ChatState | ChangesetState>).set(kind, value);
		this.emitters.get(kind)?.fire(value);
	}

	override async removeSessionArtifact(session: URI, artifactId: string): Promise<void> {
		this.removeSessionArtifactCalls.push({ session, artifactId });
		if (this.removeSessionArtifactError) {
			throw this.removeSessionArtifactError;
		}
	}

	override async invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult> {
		this.invokedChangesetOperations.push(params);
		const error = this.invokeChangesetOperationError?.(params);
		if (error) {
			throw error;
		}
		return {};
	}
}

class TestOpenerService extends mock<IOpenerService>() {
	readonly opened: { readonly resource: URI; readonly options: Parameters<IOpenerService['open']>[1] }[] = [];

	override async open(resource: URI | string, options?: Parameters<IOpenerService['open']>[1]): Promise<boolean> {
		this.opened.push({
			resource: typeof resource === 'string' ? URI.parse(resource) : resource,
			options,
		});
		return true;
	}
}

suite('AgentHostSessionInputPills', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const noProvisionalSessions = upcastPartial<IAgentHostUntitledProvisionalSessionService>({
		onDidChange: Event.None,
		get: () => undefined,
	});
	const notificationService = upcastPartial<INotificationService>({ error: () => { } });
	const labelService = upcastPartial<ILabelService>({
		getUriLabel: (resource, options) => options?.relative ? resource.path.replace(/^\/repo\/?/, '') : resource.fsPath,
	});
	const createInstantiationService = () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkbenchGitHubService, upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: () => new Promise(() => { }),
		}));
		instantiationService.stub(IChatArtifactsService, upcastPartial<IChatArtifactsService>({
			getArtifacts: () => upcastPartial<IChatArtifacts>({ artifactGroups: constObservable([]) }),
		}));
		instantiationService.stub(IChatImageCarouselService, upcastPartial<IChatImageCarouselService>({}));
		return instantiationService;
	};
	const createRichGitHubService = (disposed: string[], options?: {
		readonly credentialState?: { fail: boolean; calls: number };
		readonly pullRequestSnapshots?: Map<number, ReturnType<typeof observableValue<PullRequestSnapshot>>>;
		readonly issueStates?: Map<number, ReturnType<typeof observableValue<FragmentState<GitHubIssue>>>>;
		readonly leases?: { acquired: number; released: number };
	}) => {
		const client = upcastPartial<IGitHubClient>({
			credentials: upcastPartial<IGitHubClient['credentials']>({
				onDidInvalidate: Event.None,
				getCredential: async signal => {
					if (options?.credentialState) {
						options.credentialState.calls++;
						if (options.credentialState.fail) {
							throw new Error('offline');
						}
					}
					return {
						account: { host: 'api.github.com', accountId: 'test' },
						token: 'token',
						generation: 1,
						signal,
					};
				},
			}),
			query: upcastPartial<IGitHubClient['query']>({
				subscribeIssue: ref => {
					const state = observableValue<FragmentState<GitHubIssue>>(`issue.${ref.number}`, {
						status: 'ready',
						complete: true,
						value: {
							number: ref.number,
							title: 'Live issue title',
							body: 'Live issue body',
							url: `https://github.com/${ref.owner}/${ref.repo}/issues/${ref.number}`,
							state: 'closed',
							stateReason: 'completed',
							author: { login: 'issue-author' },
							assignees: [],
							labels: [],
							createdAt: '2026-09-01T12:00:00Z',
							updatedAt: '2026-09-02T00:00:00Z',
						},
					});
					options?.issueStates?.set(ref.number, state);
					return upcastPartial({
						resource: { ref, state },
						update: () => { },
						refresh: async () => { },
						dispose: () => disposed.push(`issue:${ref.number}`),
					});
				},
			}),
			pullRequests: upcastPartial<IGitHubClient['pullRequests']>({
				subscribePullRequest: (ref): ReturnType<IGitHubClient['pullRequests']['subscribePullRequest']> => {
					const snapshot = observableValue<PullRequestSnapshot>(`pullRequestSnapshot.${ref.number}`, upcastPartial<PullRequestSnapshot>({
						core: {
							status: 'ready',
							complete: true,
							value: {
								repositoryNameWithOwner: `${ref.owner}/${ref.repo}`,
								number: ref.number,
								title: `Live pull request ${ref.number}`,
								body: 'Live pull request body',
								url: `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
								state: ref.number === 335387 ? 'merged' : 'open',
								draft: false,
								headSha: 'head',
								headRef: 'feature',
								baseSha: 'base',
								baseRef: 'main',
								author: { login: 'pr-author' },
								createdAt: '2026-09-01T12:00:00Z',
							},
						},
						checks: {
							status: 'ready',
							complete: true,
							value: { headSha: 'head', checks: [], requirednessComplete: true, expectedSuites: [], expectedSuitesComplete: true },
						},
					}));
					options?.pullRequestSnapshots?.set(ref.number, snapshot);
					return upcastPartial({
						resource: upcastPartial({
							ref,
							snapshot,
						}),
						update: () => { },
						refresh: async () => { },
						dispose: () => disposed.push(`pullRequest:${ref.number}`),
					});
				},
			}),
		});
		return upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: async () => {
				if (!options?.leases) {
					return new ImmortalReference(client);
				}
				const leases = options.leases;
				leases.acquired++;
				const release = toDisposable(() => leases.released++);
				return { object: client, dispose: () => release.dispose() };
			},
		});
	};

	function createActivityPills(initialSession: SessionState, initialChat?: ChatState, gitHubService?: IGitHubService, connectionAuthority = 'local', workbenchGitHubService?: IWorkbenchGitHubService, transcript?: { service: IChatArtifactsService; local?: boolean }, options?: { sessionResource?: URI; configurationService?: IConfigurationService; defaultChangesetKind?: DefaultChangesetKind; dialogService?: IDialogService; notificationService?: INotificationService; supportsSessionWorkingSet?: boolean; getUriLabel?: ILabelService['getUriLabel']; workingSetUndo?: boolean; openerService?: IOpenerService; resourceUris?: IAgentHostResourceUriMapper }) {
		const instantiationService = createInstantiationService();
		if (options?.configurationService) {
			instantiationService.stub(IConfigurationService, options.configurationService);
		}
		if (options?.dialogService) {
			instantiationService.stub(IDialogService, options.dialogService);
		}
		if (options?.openerService) {
			instantiationService.stub(IOpenerService, options.openerService);
		}
		if (options?.getUriLabel) {
			instantiationService.stub(ILabelService, 'getUriLabel', options.getUriLabel);
		}
		if (transcript) {
			instantiationService.stub(IChatArtifactsService, transcript.service);
		}
		if (gitHubService) {
			instantiationService.stub(IGitHubService, gitHubService);
		}
		if (workbenchGitHubService) {
			instantiationService.stub(IWorkbenchGitHubService, workbenchGitHubService);
		}
		const states = new Map<StateComponents, SessionState | ChatState>([[StateComponents.Session, initialSession]]);
		if (initialChat) {
			states.set(StateComponents.Chat, initialChat);
		}
		const connection = new StaticAgentConnection(states);
		connection.resourceUris = options?.resourceUris ?? createAgentHostResourceUriMapper(connectionAuthority);
		const sessionResource = options?.sessionResource ?? URI.parse('agent-host-test:/session');
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		const viewModelChanged = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		let viewModel = upcastPartial<ChatViewModel>({ sessionResource });
		let inputFocused = false;
		let workingSetChanges: readonly IEditSessionEntryDiff[] | undefined;
		let workingSetUndo: IChatSessionWorkingSetUndo | undefined;
		let workingSetKeep: IChatSessionWorkingSetKeep | undefined;
		let workingSetRegistrations = 0;
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
				supportsSessionWorkingSet: options?.supportsSessionWorkingSet ?? true,
				registerSessionFileChanges: (changes, undo, keep) => {
					workingSetRegistrations++;
					return combinedDisposable(
						autorun(reader => {
							workingSetChanges = changes.read(reader);
							workingSetUndo = undo?.read(reader);
							workingSetKeep = keep?.read(reader);
						}),
						toDisposable(() => {
							workingSetChanges = undefined;
							workingSetUndo = undefined;
							workingSetKeep = undefined;
						}),
					);
				},
			}),
			onDidChangeViewModel: viewModelChanged.event,
			get viewModel() { return viewModel; },
			setPersistentContentHeight: () => { },
			focusInput: () => { inputFocused = true; },
		});
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const sessionResolutionChanged = store.add(new Emitter<void>());
		let currentAuthority = connectionAuthority;
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			onDidChangeSessionResolution: sessionResolutionChanged.event,
			resolveSessionResource: resource => transcript?.local || getChatSessionType(resource) === SessionType.Local ? undefined : ({ connection, connectionAuthority: currentAuthority, backendSession: URI.parse('vendor:/sessions/42'), defaultChangesetKind: options?.defaultChangesetKind }),
		}));
		instantiationService.stub(IBrowserViewWorkbenchService, upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		}));
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, noProvisionalSessions);
		instantiationService.stub(INotificationService, options?.notificationService ?? notificationService);
		const commands: { readonly id: string; readonly args: readonly unknown[] }[] = [];
		const openedImages: Parameters<IChatImageCarouselService['openCarouselAtResource']>[] = [];
		instantiationService.stub(IChatImageCarouselService, {
			openCarouselAtResource: async (...args) => { openedImages.push(args); },
		});
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (id, ...args) => {
				commands.push({
					id,
					args: args.map(arg => {
						if (arg && typeof arg === 'object') {
							const revealUri: unknown = Reflect.get(arg, 'revealUri');
							if (URI.isUri(revealUri)) {
								return { ...arg, revealUri: revealUri.toString() };
							}
						}
						return arg;
					}),
				});
				return undefined;
			},
		}));
		let dropdownItems: readonly { readonly label: string | undefined; readonly badge: string | undefined; readonly leading: boolean | undefined; readonly description: string | undefined; readonly icon: ThemeIcon | undefined; readonly hover: IActionListItem<object>['hover']; readonly toolbarActions: readonly IAction[]; select(): void }[] = [];
		let hideDropdown = () => { };
		const toDropdownItems = <T>(items: readonly IActionListItem<T>[], delegate?: IActionListDelegate<T>) => items.map(item => ({
			label: item.label,
			badge: item.badge,
			leading: item.badgeBeforeLabel,
			description: item.ariaDescription,
			icon: item.group?.icon,
			hover: item.hover,
			toolbarActions: item.toolbarActions ?? [],
			select: () => {
				if (item.item) {
					delegate?.onSelect(item.item);
				}
			},
		}));
		instantiationService.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
			isVisible: false,
			show: (_user, _supportsPreview, items, delegate) => {
				hideDropdown = () => delegate.onHide();
				dropdownItems = toDropdownItems(items, delegate);
			},
			updateItems: items => { dropdownItems = toDropdownItems(items); },
			hide: () => hideDropdown(),
		}));
		let menuActions: readonly IAction[] = [];
		instantiationService.stub(IContextMenuService, {
			showContextMenu: delegate => {
				assert.ok(delegate.getActions);
				menuActions = delegate.getActions();
			},
		});
		const customizationScheduler = new TestCustomizationJobScheduler();
		class TestAgentHostSessionInputPills extends AgentHostSessionInputPills {
			protected override createCustomizationScheduler() {
				return customizationScheduler;
			}
			protected override get workingSetUndoEnabled() {
				return !!options?.workingSetUndo;
			}
		}
		const pills = store.add(instantiationService.createInstance(TestAgentHostSessionInputPills, widget, false));
		return {
			instantiationService, connection, sessionResource, persistentContent, customizationScheduler, visibility, commands, pills, openedImages,
			workingSetChanges: () => workingSetChanges,
			workingSetUndo: () => workingSetUndo,
			workingSetKeep: () => workingSetKeep,
			workingSetRegistrations: () => workingSetRegistrations,
			setWorkingSetEnabled: async (enabled: boolean) => {
				const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
				await configurationService.setUserConfiguration(ChatConfiguration.EditorWorkingSetEnabled, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
					affectsConfiguration: key => key === ChatConfiguration.EditorWorkingSetEnabled,
				}));
			},
			switchHost: (authority: string) => {
				currentAuthority = authority;
				connection.resourceUris = createAgentHostResourceUriMapper(authority);
				sessionResolutionChanged.fire();
			},
			labels: () => {
				customizationScheduler.flush();
				return [...persistentContent.querySelectorAll('.chat-pill-label')].map(label => label.textContent);
			},
			dropdownItems: () => dropdownItems,
			dropdown: (label: string) => {
				customizationScheduler.flush();
				const button = [...persistentContent.querySelectorAll<HTMLElement>('.chat-dropdown-pill-button')].find(button => button.textContent?.includes(label));
				assert.ok(button, `Missing ${label} pill`);
				button.click();
				return dropdownItems;
			},
			menu: (target?: Element | null) => {
				const element = target ?? persistentContent.querySelector<HTMLElement>('.chat-pills-row-content');
				assert.ok(element);
				element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
				return menuActions;
			},
			showChat: (resource: string) => {
				const previousSessionResource = viewModel.sessionResource;
				const query = new URLSearchParams();
				query.set(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, resource);
				viewModel = upcastPartial<ChatViewModel>({ sessionResource: sessionResource.with({ query: query.toString() }) });
				viewModelChanged.fire({ previousSessionResource, currentSessionResource: viewModel.sessionResource });
			},
			showSession: (resource: URI) => {
				const previousSessionResource = viewModel.sessionResource;
				viewModel = upcastPartial<ChatViewModel>({ sessionResource: resource });
				viewModelChanged.fire({ previousSessionResource, currentSessionResource: resource });
			},
			showModel: (model: IChatModel) => {
				viewModel = upcastPartial<ChatViewModel>({ sessionResource: viewModel.sessionResource, model });
				viewModelChanged.fire({ previousSessionResource: viewModel.sessionResource, currentSessionResource: viewModel.sessionResource });
			},
			inputFocused: () => inputFocused,
		};
	}

	for (const provider of ['claude', 'codex']) {
		for (const remote of [false, true]) {
			for (const initiallyBlocked of [false, true]) {
				test(`policy-disabled ${provider} input pills suspend local provider access (remote=${remote}, cold=${initiallyBlocked})`, async () => {
					const setting = `chat.agentHost.${provider}Agent.enabled`;
					const configurationService = new class extends TestConfigurationService {
						blocked = initiallyBlocked;
						override inspect<T>(key: string) {
							const value = super.inspect<T>(key);
							return { ...value, policyValue: key === setting && this.blocked ? value.value : undefined };
						}
					}({ [setting]: !initiallyBlocked });
					store.add(configurationService.onDidChangeConfigurationEmitter);
					const defaultChat = buildDefaultChatUri('vendor:/sessions/42');
					const session: SessionState = {
						provider, title: 'Saved', status: SessionStatus.Idle,
						lifecycle: SessionLifecycle.Ready, activeClients: [], chats: [], defaultChat,
						changesets: [{ label: 'Branch Changes', uriTemplate: 'changeset/branch', changeKind: ChangesetKind.Branch }],
					};
					const chat: ChatState = {
						resource: defaultChat, title: 'Saved', status: SessionStatus.Idle,
						modifiedAt: new Date(0).toISOString(), turns: [],
					};
					const sessionResource = URI.parse(`${remote ? 'remote-host' : 'agent-host'}-${provider}:/policy`);
					const rig = createActivityPills(session, chat, undefined, remote ? 'remote-host' : 'local', undefined, undefined, { sessionResource, configurationService });
					const snapshot = () => ({ active: rig.connection.requested.length - rig.connection.released.length, everSubscribed: rig.connection.requested.length > 0 });
					const opened = snapshot();
					const requestsBeforeBlock = rig.connection.requested.length;
					const setPolicy = async (blocked: boolean) => {
						configurationService.blocked = blocked;
						await configurationService.setUserConfiguration(setting, !blocked);
						configurationService.onDidChangeConfigurationEmitter.fire({
							source: ConfigurationTarget.USER,
							affectedKeys: new Set([setting]),
							change: { keys: [setting], overrides: [] },
							affectsConfiguration: key => key === setting,
						});
					};
					await setPolicy(true);
					const blocked = snapshot();
					const requestsWhileBlocked = rig.connection.requested.length - requestsBeforeBlock;
					await setPolicy(false);
					assert.deepStrictEqual({
						opened, blocked, requestsWhileBlocked, recovered: snapshot(),
						kinds: [...new Set(rig.connection.requested.map(request => request.kind))].sort(),
					}, {
						opened: { active: remote || !initiallyBlocked ? 3 : 0, everSubscribed: remote || !initiallyBlocked },
						blocked: { active: remote ? 3 : 0, everSubscribed: remote || !initiallyBlocked },
						requestsWhileBlocked: 0,
						recovered: { active: 3, everSubscribed: true },
						kinds: [StateComponents.Session, StateComponents.Chat, StateComponents.Changeset],
					});
				});
			}
		}
	}

	for (const local of [false, true]) {
		test(`generated images use the shared editor artifacts pill (${local ? 'local chat' : 'remote agent host'})`, async () => {
			const uri = URI.parse('vscode-agent-host://remote/generated/image?version=1');
			const name = 'generated-image-a1b2c3d4e5f6.jpg';
			const artifactGroups = observableValue<readonly IArtifactSourceGroup[]>('artifacts', []);
			const service = upcastPartial<IChatArtifactsService>({
				getArtifacts: session => upcastPartial<IChatArtifacts>({
					artifactGroups: session.path === '/session' ? artifactGroups : constObservable([]),
				}),
			});
			const harness = createActivityPills(upcastPartial<SessionState>({ defaultChat: 'vendor-chat:/main', chats: [] }), undefined, undefined, 'remote', undefined, { service, local });
			const before = harness.persistentContent.querySelectorAll('.chat-pill-button').length;
			artifactGroups.set([{
				source: { kind: 'rules' }, artifacts: [{
					uri: uri.toString(), label: name, fileName: name, generatedImageMimeType: 'image/jpeg', groupName: 'Generated Images', type: 'screenshot',
				}]
			}], undefined);
			const button = harness.persistentContent.querySelector<HTMLElement>('.chat-resource-pill-button');
			assert.ok(button);
			button.click();
			await timeout(0);
			const single = {
				label: button.textContent,
				legacyList: harness.persistentContent.querySelector('.chat-artifacts-widget'),
				opened: harness.openedImages.map(([resource, , options]) => ({ uri: resource.toString(), session: options?.sessionResource?.toString() })),
			};
			artifactGroups.set([{
				source: { kind: 'rules' }, artifacts: [0, 1].map(index => ({
					uri: uri.with({ path: `/generated/image-${index}` }).toString(), label: `generated-${index}.jpg`, fileName: `generated-${index}.jpg`,
					generatedImageMimeType: 'image/jpeg', groupName: 'Generated Images', type: 'screenshot',
				}))
			}], undefined);
			const multiple = harness.dropdown('2 Artifacts').map(item => item.label);
			harness.visibility.hide(SessionChatPillKind.Artifacts);
			const hidden = harness.persistentContent.querySelectorAll('.chat-pill-button').length;
			harness.visibility.toggle(SessionChatPillKind.Artifacts);
			harness.showSession(URI.parse('another-chat:/empty'));
			assert.deepStrictEqual({
				before, single, multiple, hidden,
				afterSwitch: harness.persistentContent.querySelectorAll('.chat-pill-button').length,
			}, {
				before: 0,
				single: { label: name, legacyList: null, opened: [{ uri: uri.toString(), session: harness.sessionResource.toString() }] },
				multiple: ['Generated Images', 'generated-0.jpg', 'generated-1.jpg'],
				hidden: 0, afterSwitch: 0,
			});
		});
	}

	test('legacy artifact rules join the editor pill only when their setting is enabled', async () => {
		const service = upcastPartial<IChatArtifactsService>({
			getArtifacts: () => upcastPartial<IChatArtifacts>({
				artifactGroups: constObservable([{ source: { kind: 'rules' }, artifacts: [{ uri: 'file:///plan.md', label: 'Plan', type: 'plan' }] }]),
			}),
		});
		const harness = createActivityPills(upcastPartial<SessionState>({ defaultChat: 'vendor-chat:/main', chats: [] }), undefined, undefined, 'local', undefined, { service, local: true });
		const configuration = harness.instantiationService.get(IConfigurationService);
		assert.ok(configuration instanceof TestConfigurationService);
		const before = harness.persistentContent.querySelectorAll('.chat-pill-button').length;
		await configuration.setUserConfiguration(ChatConfiguration.ArtifactsEnabled, true);
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === ChatConfiguration.ArtifactsEnabled }));
		const enabled = harness.persistentContent.querySelector('.chat-resource-pill-button')?.textContent;
		await configuration.setUserConfiguration(ChatConfiguration.ArtifactsEnabled, false);
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === ChatConfiguration.ArtifactsEnabled }));
		assert.deepStrictEqual({ before, enabled, after: harness.persistentContent.querySelectorAll('.chat-pill-button').length }, { before: 0, enabled: 'Plan', after: 0 });
	});

	for (const opaque of [false, true]) {
		test(`subagent chats retain their transcript artifact pill without session metadata (${opaque ? 'host-advertised' : 'canonical'} identity)`, async () => {
			const backendSession = URI.parse('vendor:/sessions/42');
			const mainChat = opaque ? 'vendor-chat:/conversations/main' : buildDefaultChatUri(backendSession);
			const childChat = opaque ? 'vendor-chat:/workers/image-child' : buildSubagentChatUri(backendSession, 'image-child');
			const emptyChat = opaque ? 'vendor-chat:/workers/empty-child' : buildSubagentChatUri(backendSession, 'empty-child');
			const artifactGroups = observableValue<readonly IArtifactSourceGroup[]>('child artifacts', []);
			const imageUri = URI.parse('vscode-agent-host://remote/generated/child-image?version=1');
			const service = upcastPartial<IChatArtifactsService>({
				getArtifacts: resource => upcastPartial<IChatArtifacts>({
					artifactGroups: new URLSearchParams(resource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM) === childChat
						|| (!opaque && resource.fragment === 'subagent/image-child') ? artifactGroups : constObservable([]),
				}),
			});
			const harness = createActivityPills(upcastPartial<SessionState>({
				defaultChat: mainChat,
				chats: [childChat, emptyChat].map(resource => ({
					resource, title: resource === childChat ? 'Images' : 'Empty', status: SessionStatus.Idle,
					modifiedAt: '2026-10-09T00:00:00.000Z',
					origin: { kind: ChatOriginKind.Tool, chat: mainChat, toolCallId: resource },
				})),
				_meta: withSessionArtifacts(undefined, [
					{ id: 'parent-file', label: 'Session file', uri: 'file:///session.md', type: SessionArtifactType.File, isArtifact: true },
					{ id: 'parent-reference', label: 'Session reference', uri: 'file:///reference.md', type: SessionArtifactType.File, isArtifact: false },
				]),
			}), undefined, undefined, 'remote', undefined, { service });
			const parentLabels = harness.labels();
			harness.showChat(childChat);
			const emptyChildHidden = harness.persistentContent.querySelector('.agent-host-session-input-pills')?.classList.contains('hidden');
			artifactGroups.set([{
				source: { kind: 'rules' }, artifacts: [
					{ label: 'child-image.jpg', uri: imageUri.toString(), type: 'screenshot', generatedImageMimeType: 'image/jpeg', groupName: 'Generated Images' },
					{ label: 'Child plan', uri: 'file:///child-plan.md', type: 'plan' },
				],
			}], undefined);
			const generatedOnly = [...harness.persistentContent.querySelectorAll('.chat-pill-button')].map(button => button.textContent);
			harness.persistentContent.querySelector<HTMLElement>('.chat-resource-pill-button')?.click();
			await timeout(0);
			const configuration = harness.instantiationService.get(IConfigurationService);
			assert.ok(configuration instanceof TestConfigurationService);
			await configuration.setUserConfiguration(ChatConfiguration.ArtifactsEnabled, true);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === ChatConfiguration.ArtifactsEnabled }));
			const childArtifacts = harness.dropdown('2 Artifacts').map(item => item.label).filter(Boolean);
			const offeredKinds = harness.menu().filter(action => action.id.startsWith('chatInputPills.toggle.')).map(action => action.id);
			harness.visibility.hide(SessionChatPillKind.Artifacts);
			const hiddenByUser = harness.persistentContent.querySelectorAll('.chat-pill-button').length;
			harness.visibility.toggle(SessionChatPillKind.Artifacts);
			harness.showChat(emptyChat);
			const siblingHidden = harness.persistentContent.querySelector('.agent-host-session-input-pills')?.classList.contains('hidden');
			harness.showSession(harness.sessionResource);
			const parentRestored = harness.labels();
			if (opaque) {
				harness.showChat(childChat);
			} else {
				harness.showSession(harness.sessionResource.with({ fragment: 'subagent/image-child' }));
			}
			const childRestored = harness.dropdown('2 Artifacts').map(item => item.label).filter(Boolean);
			const query = new URLSearchParams();
			query.set(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, childChat);
			assert.deepStrictEqual({
				emptyChildHidden, generatedOnly, childArtifacts, offeredKinds, hiddenByUser, siblingHidden, parentRestored, childRestored,
				opened: harness.openedImages.map(([uri, , options]) => ({ uri: uri.toString(), session: options?.sessionResource?.toString() })),
			}, {
				emptyChildHidden: true, generatedOnly: ['child-image.jpg'],
				childArtifacts: ['Generated Images', 'child-image.jpg', 'Files', 'Child plan'],
				offeredKinds: ['chatInputPills.toggle.artifacts'], hiddenByUser: 0, siblingHidden: true, parentRestored: parentLabels,
				childRestored: ['Generated Images', 'child-image.jpg', 'Files', 'Child plan'],
				opened: [{ uri: imageUri.toString(), session: harness.sessionResource.with({ query: query.toString() }).toString() }],
			});
		});
	}

	test('generated image presentation replaces a duplicate recorded remote file in the same pill', () => {
		const remoteUri = URI.parse('vendor-file://workspace/generated/image.jpeg?version=1');
		const uri = toAgentHostUri(remoteUri, 'remote');
		const name = 'generated-image-a1b2c3d4e5f6.jpg';
		const service = upcastPartial<IChatArtifactsService>({
			getArtifacts: () => upcastPartial<IChatArtifacts>({
				artifactGroups: constObservable([{
					source: { kind: 'rules' }, artifacts: [{
						label: name, fileName: name, uri: uri.toString(), type: 'screenshot', generatedImageMimeType: 'image/jpeg', groupName: 'Generated Images',
					}]
				}]),
			}),
		});
		const harness = createActivityPills(upcastPartial<SessionState>({
			defaultChat: 'vendor-chat:/main', chats: [],
			_meta: withSessionArtifacts(undefined, [{ id: 'recorded', label: 'Old name', uri: remoteUri.toString(), type: SessionArtifactType.File, isArtifact: true }]),
		}), undefined, undefined, 'remote', undefined, { service });
		assert.deepStrictEqual({
			resources: [...harness.persistentContent.querySelectorAll('.chat-resource-pill-button')].map(button => button.textContent),
			collections: harness.persistentContent.querySelectorAll('.chat-dropdown-pill-button').length,
		}, { resources: [name], collections: 0 });
	});

	test('opens file artifacts through the connection that owns them', () => {
		const artifact = URI.file('/home/user/videos/walkthrough.mp4');
		const openArtifact = (connectionAuthority: string, resourceUris: IAgentHostResourceUriMapper) => {
			const openerService = new TestOpenerService();
			const harness = createActivityPills(upcastPartial<SessionState>({
				defaultChat: 'vendor-chat:/main', chats: [],
				_meta: withSessionArtifacts(undefined, [{ id: 'video', label: 'Walkthrough', uri: artifact.toString(), type: SessionArtifactType.File, isArtifact: true }]),
			}), undefined, undefined, connectionAuthority, undefined, undefined, { openerService, resourceUris });
			// A single artifact pill opens its resource synchronously when clicked
			harness.persistentContent.querySelector<HTMLElement>('.chat-resource-pill-button')?.click();
			return openerService.opened.map(({ resource }) => resource.toString());
		};

		assert.deepStrictEqual({
			localWindow: openArtifact('local', identityAgentHostResourceUriMapper),
			// The ambient host of a remote window resolves as `local` but runs on the remote
			remoteWindow: openArtifact('local', createAgentHostResourceUriMapper('ambient-remote')),
			remoteHost: openArtifact('remote', createAgentHostResourceUriMapper('remote')),
		}, {
			localWindow: [artifact.toString()],
			remoteWindow: [toAgentHostUri(artifact, 'ambient-remote').toString()],
			remoteHost: [toAgentHostUri(artifact, 'remote').toString()],
		});
	});

	test('opens single subagent input pills and every dropdown entry to the side', async () => {
		const mainChat = 'vendor-chat:/conversations/main';
		const children: ChatSummary[] = [
			{ title: 'Running', status: SessionStatus.InProgress },
			{ title: 'Waiting', status: SessionStatus.InputNeeded },
			{ title: 'Completed', status: SessionStatus.Idle },
		].map(({ title, status }) => ({
			resource: `vendor-chat:/workers/${title}`,
			title,
			status,
			modifiedAt: '2026-09-01T00:00:00.000Z',
			origin: { kind: ChatOriginKind.Tool, chat: mainChat, toolCallId: title },
		}));
		const session = upcastPartial<SessionState>({ defaultChat: mainChat, chats: [children[0]] });
		const harness = createActivityPills(session);
		const opened: Parameters<IChatWidgetService['openSession']>[] = [];
		harness.instantiationService.stub(IChatWidgetService, {
			openSession: async (...args) => {
				opened.push(args);
				return undefined;
			},
		});
		const executeCommand: ICommandService['executeCommand'] = async (id, ...args) => {
			const command = CommandsRegistry.getCommand(id);
			assert.ok(command);
			await harness.instantiationService.invokeFunction(command.handler, ...args);
			return undefined;
		};
		harness.instantiationService.stub(ICommandService, harness.instantiationService.get(ICommandService), 'executeCommand', executeCommand);
		harness.visibility.toggle(SessionChatPillKind.Subagents);
		const singleLabels = harness.labels();
		const singleEntry = harness.dropdown('1 Subagent').find(item => item.label === children[0].title);
		assert.ok(singleEntry);
		singleEntry.select();
		await timeout(0);
		harness.connection.setState(StateComponents.Session, { ...session, chats: children });
		const multipleLabels = harness.labels();
		for (const child of children) {
			const entry = harness.dropdown('3 Subagents').find(item => item.label === child.title);
			assert.ok(entry);
			entry.select();
			await timeout(0);
		}

		assert.deepStrictEqual({ singleLabels, multipleLabels, opened }, {
			singleLabels: ['1 Subagent'],
			multipleLabels: ['3 Subagents'],
			opened: [children[0], ...children].map(child => [
				getSubagentEditorResource({ chatResource: child.resource, parentSessionResource: harness.sessionResource.toString() }),
				SIDE_GROUP,
				{ pinned: true, revealIfOpened: true, title: { preferred: child.title } },
			]),
		});
	});

	test('offers sourced shared kinds and live subagents for host-advertised chat identities', async () => {
		const mainChat = 'vendor-chat:/conversations/main';
		const otherChat = 'vendor-chat:/conversations/other';
		const child = (id: string, status: SessionStatus, parent = mainChat): ChatSummary => ({
			resource: `vendor-chat:/workers/${id}`,
			title: id,
			status,
			modifiedAt: '2026-09-01T00:00:00.000Z',
			origin: { kind: ChatOriginKind.Tool, chat: parent, toolCallId: id },
		});
		const session = upcastPartial<SessionState>({
			defaultChat: mainChat,
			chats: [
				child('Running', SessionStatus.InProgress | SessionStatus.IsRead),
				child('Completed', SessionStatus.Idle),
				child('Waiting', SessionStatus.InputNeeded),
				child('Other chat worker', SessionStatus.InProgress, otherChat),
				child('Nested worker', SessionStatus.InProgress, 'vendor-chat:/workers/Running'),
				{ ...child('Fork', SessionStatus.InProgress), origin: { kind: ChatOriginKind.User } },
			],
		});
		const harness = createActivityPills(session);
		const hiddenByDefault = harness.labels();
		const menu = harness.menu();
		await menu.find(action => action.id === 'chatInputPills.toggle.subagents')?.run();
		const labels = harness.labels();
		const dropdown = harness.dropdown('3 Subagents');
		dropdown.find(item => item.label === 'Waiting')?.select();
		await timeout(0);
		const options = harness.menu().find(action => action instanceof SubmenuAction && action.label === 'Subagent Options');
		assert.ok(options instanceof SubmenuAction);
		await options.actions.find(action => action.label === 'Show In Progress')?.run();
		const activeLabels = harness.labels();
		const updatedSession = {
			...session,
			chats: session.chats.map(chat => ({ ...chat, status: SessionStatus.Idle })),
		};
		harness.connection.setState(StateComponents.Session, updatedSession);
		const filteredLabels = harness.labels();
		const recovery = harness.menu().find(action => action instanceof SubmenuAction && action.label === 'Subagent Options');
		assert.ok(recovery instanceof SubmenuAction);
		await recovery.actions.find(action => action.label === 'Show All')?.run();
		const restoredLabels = harness.labels();
		harness.showChat(otherChat);
		const siblingLabels = harness.labels();
		harness.showChat('vendor-chat:/workers/Running');
		const subagentLabels = harness.labels();
		harness.showChat(mainChat);
		harness.persistentContent.querySelector<HTMLElement>('.chat-dropdown-pill-button')?.focus();
		harness.connection.setState(StateComponents.Session, { ...session, chats: [] });
		await timeout(0);
		harness.pills.dispose();

		assert.deepStrictEqual({
			hiddenByDefault,
			offeredKinds: menu.filter(action => action.id.startsWith('chatInputPills.toggle.')).map(action => action.id.slice('chatInputPills.toggle.'.length)).sort(),
			labels,
			dropdown: dropdown.map(item => item.label).filter(Boolean),
			commands: harness.commands,
			activeLabels,
			filteredLabels,
			restoredLabels,
			siblingLabels,
			subagentLabels,
			inputFocusedAfterRemoval: harness.inputFocused(),
			releasedSubscriptions: harness.connection.released.length === harness.connection.requested.length,
		}, {
			hiddenByDefault: [],
			offeredKinds: SESSION_CHAT_PILL_KINDS.filter(kind => kind !== SessionChatPillKind.Changes && kind !== SessionChatPillKind.Canvases).sort(),
			labels: ['3 Subagents'],
			dropdown: ['Subagents: In Progress', 'Waiting', 'Running', 'Subagents: Completed', 'Completed'],
			commands: [{
				id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID,
				args: [{ chatResource: 'vendor-chat:/workers/Waiting', parentSessionResource: harness.sessionResource.toString(), title: 'Waiting' }],
			}],
			activeLabels: ['2 Subagents'],
			filteredLabels: [],
			restoredLabels: ['3 Subagents'],
			siblingLabels: ['1 Subagent'],
			subagentLabels: [],
			inputFocusedAfterRemoval: true,
			releasedSubscriptions: true,
		});
	});

	test('shows the chat\'s live canvases, reveals the selected canvas, and closes a canvas from its row', async () => {
		const harness = createActivityPills(upcastPartial<SessionState>({ defaultChat: 'vendor-chat:/main', chats: [] }));
		const configuration = harness.instantiationService.get(IConfigurationService);
		assert.ok(configuration instanceof TestConfigurationService);
		const canvas = (id: string, title: string, source?: string): ICanvas => ({
			resource: URI.parse(`agent-host-canvas:/${id}`),
			instanceId: id,
			title,
			source: source ? URI.parse(source) : undefined,
		});
		const preview = canvas('preview', 'Preview', 'https://example.test/preview');
		const pending = canvas('pending', 'Pending');
		const dashboard = canvas('dashboard', 'Dashboard', 'https://example.test/dashboard');
		const owner = { providerId: 'local/copilotcli', session: URI.parse('ahp-session:/42'), chat: URI.parse('ahp-session:/42/chats/main') };
		const canvases = observableValue<readonly ICanvas[] | undefined>('canvases', [preview, pending]);
		const closed: string[] = [];
		const closeCanvas = async (closing: ICanvas) => { closed.push(closing.resource.toString()); };
		harness.showModel(upcastPartial<IChatModel>({ canvasContext: constObservable<ICanvasContext | undefined>({ owner, canvases, closeCanvas }) }));
		const disabled = harness.labels();
		await configuration.setUserConfiguration(CanvasesEnabledSettingId, true);
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === CanvasesEnabledSettingId }));
		const single = {
			labels: harness.labels(),
			ariaLabel: harness.persistentContent.querySelector('.chat-dropdown-pill-button')?.getAttribute('aria-label'),
			closeLabel: harness.persistentContent.querySelector('.chat-pill-promoted-action')?.getAttribute('aria-label'),
			closeInContextMenu: harness.menu(harness.persistentContent.querySelector('.chat-dropdown-pill-button')).some(action => action.label === 'Close Canvas Preview'),
		};
		harness.persistentContent.querySelector<HTMLElement>('.chat-pill-promoted-action')?.click();
		const offersToggle = harness.menu().some(action => action.id === 'chatInputPills.toggle.canvases');
		canvases.set([preview, pending, dashboard], undefined);
		const summarizedClose = harness.persistentContent.querySelector('.chat-pill-promoted-action');
		const dropdown = harness.dropdown('2 Canvases');
		dropdown.find(item => item.label === dashboard.title)?.select();
		await dropdown.find(item => item.label === dashboard.title)?.toolbarActions[0]?.run();
		harness.showModel(upcastPartial<IChatModel>({}));

		assert.deepStrictEqual({
			disabled,
			single,
			offersToggle,
			summarizedClose,
			dropdown: dropdown.map(item => item.label).filter(Boolean),
			closeActions: dropdown.flatMap(item => item.toolbarActions.map(action => action.label)),
			commands: harness.commands,
			closed,
			withoutCanvasContext: harness.labels(),
		}, {
			disabled: [],
			single: { labels: ['Preview'], ariaLabel: 'Open canvas Preview', closeLabel: 'Close Canvas Preview', closeInContextMenu: true },
			offersToggle: true,
			summarizedClose: null,
			dropdown: ['Canvases', 'Preview', 'Dashboard'],
			closeActions: ['Close Canvas Preview', 'Close Canvas Dashboard'],
			commands: [{ id: REVEAL_CANVAS_COMMAND_ID, args: [{ ...owner, canvas: dashboard.resource }] }],
			closed: [preview.resource.toString(), dashboard.resource.toString()],
			withoutCanvasContext: [],
		});
	});

	test('does not repeat customization path resolution for equivalent pill inputs', () => {
		const createCustomizations = (enabled = true, reverse = false): readonly Customization[] => [{
			id: 'directory',
			type: CustomizationType.Directory,
			uri: URI.file('/repo/.github').toString(),
			name: 'Customizations',
			enabled,
			contents: CustomizationType.Hook,
			writable: true,
			children: [
				...(reverse ? [{ id: 'unused-hook', type: CustomizationType.Hook, uri: URI.file('/repo/.github/hooks/unused.md').toString(), name: 'unused' } as const] : []),
				{ id: 'hook', type: CustomizationType.Hook, uri: URI.file('/repo/.github/hooks/pre.md').toString(), name: 'pre-commit' },
				...(!reverse ? [{ id: 'unused-hook', type: CustomizationType.Hook, uri: URI.file('/repo/.github/hooks/unused.md').toString(), name: 'unused' } as const] : []),
			],
		}];
		const customizations = observableValue<readonly Customization[] | undefined>('customizations', createCustomizations());
		const roots = observableValue<readonly URI[]>('roots', [URI.file('/repo')]);
		let indexCreations = 0;
		let uncachedPathResolutions = 0;
		class CountingCustomizationIndex extends CustomizationIndex {
			protected override _resolvePathUncached(token: string) {
				uncachedPathResolutions++;
				return super._resolvePathUncached(token);
			}
		}
		const index = createCustomizationIndexObservable(
			undefined,
			customizations,
			roots,
			constObservable(uri => uri),
			{
				createIndex: (items, workspaceRoots, mapHostUri, previous) => {
					indexCreations++;
					return new CountingCustomizationIndex(items, workspaceRoots, mapHostUri, previous);
				},
			},
		);
		const observed: Array<string | undefined> = [];
		const observer = store.add(autorun(reader => {
			observed.push(index.read(reader).resolve({ kind: CustomizationRefKind.Path, value: '.github/hooks/pre.md' })?.id);
		}));

		for (let i = 0; i < 5; i++) {
			customizations.set(createCustomizations(), undefined);
			roots.set([URI.file('/repo')], undefined);
		}
		customizations.set(createCustomizations(false), undefined);
		customizations.set(createCustomizations(false, true), undefined);
		roots.set([URI.file('/other')], undefined);
		observer.dispose();

		assert.deepStrictEqual({
			indexCreations,
			uncachedPathResolutions,
			observed,
		}, {
			indexCreations: 4,
			uncachedPathResolutions: 2,
			observed: ['hook', 'hook', 'hook', undefined],
		});
	});

	function createCustomizationIndexHarness(scope?: ISettableObservable<string>) {
		const createCustomizations = (reverse: boolean): readonly Customization[] => {
			const hooks: ChildCustomization[] = [
				{ id: 'hook', type: CustomizationType.Hook, uri: URI.file('/repo/.github/hooks/pre.md').toString(), name: 'pre-commit' },
				{ id: 'other-hook', type: CustomizationType.Hook, uri: URI.file('/repo/.github/hooks/post.md').toString(), name: 'post-commit' },
			];
			return [{
				id: 'directory',
				type: CustomizationType.Directory,
				uri: URI.file('/repo/.github').toString(),
				name: 'Customizations',
				enabled: true,
				contents: CustomizationType.Hook,
				writable: true,
				children: reverse ? [...hooks].reverse() : hooks,
			}];
		};
		const customizations = observableValue<readonly Customization[] | undefined>('customizations', createCustomizations(false));
		let uncachedPathResolutions = 0;
		class CountingCustomizationIndex extends CustomizationIndex {
			protected override _resolvePathUncached(token: string) {
				uncachedPathResolutions++;
				return super._resolvePathUncached(token);
			}
		}
		const index = createCustomizationIndexObservable(
			undefined,
			customizations,
			constObservable([URI.file('/repo')]),
			constObservable(uri => uri),
			{
				createIndex: (items, workspaceRoots, mapHostUri, previous) => new CountingCustomizationIndex(items, workspaceRoots, mapHostUri, previous),
				scope,
			},
		);
		let reversed = false;
		let tokens: readonly string[] = [];
		store.add(autorun(reader => {
			const current = index.read(reader);
			for (const token of tokens) {
				current.resolve({ kind: CustomizationRefKind.Path, value: token });
			}
		}));
		return {
			/** Rebuilds the index with equivalent entries and looks up the given tokens. */
			rebuild: (...lookups: string[]) => {
				tokens = lookups;
				reversed = !reversed;
				customizations.set(createCustomizations(reversed), undefined);
			},
			uncachedPathResolutions: () => uncachedPathResolutions,
		};
	}

	test('carries paths that were not looked up on an intermediate index rebuild', () => {
		const harness = createCustomizationIndexHarness();
		harness.rebuild('.github/hooks/pre.md');
		harness.rebuild('.github/hooks/post.md');
		const afterCarry = harness.uncachedPathResolutions();
		harness.rebuild('.github/hooks/pre.md');

		// Turns are revisited lazily, so `pre.md` must survive an index that never looked it up.
		assert.deepStrictEqual({ afterCarry, final: harness.uncachedPathResolutions() }, { afterCarry: 2, final: 2 });
	});

	test('reuses customization path resolutions across rebuilds while they keep being looked up', () => {
		const harness = createCustomizationIndexHarness();
		for (let i = 0; i < 4; i++) {
			harness.rebuild('.github/hooks/pre.md');
		}

		assert.strictEqual(harness.uncachedPathResolutions(), 1);
	});

	test('drops customization path resolutions when the scope changes', () => {
		const scope = observableValue('scope', 'session-a');
		const harness = createCustomizationIndexHarness(scope);
		harness.rebuild('.github/hooks/pre.md');
		harness.rebuild('.github/hooks/pre.md');
		const sameScope = harness.uncachedPathResolutions();
		scope.set('session-b', undefined);
		harness.rebuild('.github/hooks/pre.md');

		assert.deepStrictEqual({ sameScope, afterScopeChange: harness.uncachedPathResolutions() }, { sameScope: 1, afterScopeChange: 2 });
	});

	test('pills pick up customizations added after a path was already resolved as unknown', async () => {
		const chatResource = 'vendor-chat:/conversations/main';
		const hookUri = URI.file('/repo/.github/instructions/late.instructions.md');
		const customizations = (items: ChildCustomization[]): SessionState => upcastPartial<SessionState>({
			defaultChat: chatResource,
			chats: [],
			workingDirectories: [URI.file('/repo').toString()],
			customizations: [{
				id: 'rules',
				type: CustomizationType.Directory,
				name: 'Rules',
				uri: URI.file('/repo/.github').toString(),
				enabled: true,
				contents: CustomizationType.Rule,
				writable: true,
				children: items,
			}],
		});
		const chat = upcastPartial<ChatState>({
			resource: chatResource,
			turns: [upcastPartial<Turn>({
				id: 'turn',
				responseParts: [{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						toolCallId: 'tool',
						toolName: 'read',
						displayName: 'read',
						status: ToolCallStatus.Completed,
						confirmed: ToolCallConfirmationReason.NotNeeded,
						invocationMessage: 'read',
						pastTenseMessage: 'read',
						success: true,
						toolInput: '{"path":".github/instructions/late.instructions.md"}',
					},
				}],
			})],
		});
		const harness = createActivityPills(customizations([]), chat);
		harness.visibility.toggle(SessionChatPillKind.Customizations);
		const before = harness.labels();
		harness.connection.setState(StateComponents.Session, customizations([{ id: 'late', type: CustomizationType.Rule, name: 'late', uri: hookUri.toString() }]));
		await timeout(0);

		assert.deepStrictEqual({ before, after: harness.labels() }, { before: [], after: ['1 Customization'] });
	});

	test('pills drop cached customization paths when the host URI mapping changes', async () => {
		const chatResource = 'vendor-chat:/conversations/main';
		const skillUri = URI.file('/repo/.github/skills/host/SKILL.md');
		const session = upcastPartial<SessionState>({
			defaultChat: chatResource,
			chats: [],
			workingDirectories: [URI.file('/repo').toString()],
			customizations: [{
				id: 'skills',
				type: CustomizationType.Directory,
				name: 'Skills',
				uri: dirname(dirname(skillUri)).toString(),
				enabled: true,
				contents: CustomizationType.Skill,
				writable: false,
				children: [{ id: 'host', type: CustomizationType.Skill, name: 'host', uri: skillUri.toString() }],
			}],
		});
		const chat = upcastPartial<ChatState>({
			resource: chatResource,
			turns: [upcastPartial<Turn>({
				id: 'turn',
				responseParts: [{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						toolCallId: 'tool',
						toolName: 'view',
						displayName: 'view',
						status: ToolCallStatus.Completed,
						confirmed: ToolCallConfirmationReason.NotNeeded,
						invocationMessage: 'view',
						pastTenseMessage: 'view',
						success: true,
						toolInput: '{"path":".github/skills/host/SKILL.md"}',
					},
				}],
			})],
		});
		const harness = createActivityPills(session, chat, undefined, 'host-a');
		harness.visibility.toggle(SessionChatPillKind.Customizations);
		harness.dropdown('1 Customization').find(item => item.label === 'host')?.select();
		harness.switchHost('host-b');
		harness.dropdown('1 Customization').find(item => item.label === 'host')?.select();
		await timeout(0);

		assert.deepStrictEqual(harness.commands.map(command => (command.args[0] as { revealUri: string }).revealUri), [
			toAgentHostUri(skillUri, 'host-a').toString(),
			toAgentHostUri(skillUri, 'host-b').toString(),
		]);
	});

	test('shows only used customizations and resets parsing when navigating between chats', async () => {
		const mainChat = 'vendor-chat:/conversations/main';
		const otherChat = 'vendor-chat:/conversations/other';
		const skillUri = URI.file('/repo/.github/skills/review/SKILL.md');
		const instructionUri = URI.file('/repo/.github/instructions/tests.instructions.md');
		const session = upcastPartial<SessionState>({
			defaultChat: mainChat,
			chats: [],
			workingDirectories: [URI.file('/repo').toString()],
			customizations: [{
				id: 'skills',
				type: CustomizationType.Directory,
				name: 'Skills',
				uri: URI.file('/repo/.github').toString(),
				enabled: true,
				contents: CustomizationType.Skill,
				writable: true,
				children: [
					{ id: 'review', type: CustomizationType.Skill, name: 'review', uri: skillUri.toString() },
					{ id: 'tests', type: CustomizationType.Rule, name: 'writing-tests', uri: instructionUri.toString() },
					{ id: 'unused', type: CustomizationType.Skill, name: 'unused', uri: URI.file('/repo/.github/skills/unused/SKILL.md').toString() },
				],
			}],
		});
		const chatState = (resource: string, toolName: string, toolInput: string) => upcastPartial<ChatState>({
			resource,
			turns: [upcastPartial<Turn>({
				id: 'shared-turn-id',
				responseParts: [{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						toolCallId: 'tool',
						toolName,
						displayName: toolName,
						status: ToolCallStatus.Completed,
						confirmed: ToolCallConfirmationReason.NotNeeded,
						invocationMessage: toolName,
						pastTenseMessage: toolName,
						success: true,
						toolInput,
					},
				}],
			})],
		});
		const harness = createActivityPills(session, chatState(mainChat, 'skill', '{"skill":"review"}'));
		const hiddenByDefault = harness.labels();
		harness.visibility.toggle(SessionChatPillKind.Customizations);
		const initialLabels = harness.labels();
		const skillDropdown = harness.dropdown('1 Customization');
		skillDropdown.find(item => item.label === 'review')?.select();
		await timeout(0);
		harness.connection.setState(StateComponents.Chat, chatState(otherChat, 'read', '{"path":".github/instructions/tests.instructions.md"}'));
		harness.showChat(otherChat);
		const instructionDropdown = harness.dropdown('1 Customization');
		instructionDropdown.find(item => item.label === 'writing-tests')?.select();
		await timeout(0);

		assert.deepStrictEqual({
			hiddenByDefault,
			initialLabels,
			skillDropdown: skillDropdown.map(item => ({ label: item.label, description: item.description })),
			instructionDropdown: instructionDropdown.map(item => ({ label: item.label, description: item.description })),
			commands: harness.commands,
		}, {
			hiddenByDefault: [],
			initialLabels: ['1 Customization'],
			skillDropdown: [
				{ label: 'Skills', description: undefined },
				{ label: 'review', description: '.github/skills/review/SKILL.md' },
			],
			instructionDropdown: [
				{ label: 'Instructions', description: undefined },
				{ label: 'writing-tests', description: '.github/instructions/tests.instructions.md' },
			],
			commands: [
				{ id: AICustomizationManagementCommands.OpenEditor, args: [{ section: AICustomizationManagementSection.Skills, revealUri: skillUri.toString() }] },
				{ id: AICustomizationManagementCommands.OpenEditor, args: [{ section: AICustomizationManagementSection.Instructions, revealUri: instructionUri.toString() }] },
			],
		});
	});

	test('reveals remote host customizations without remapping client or synced resources', async () => {
		const chatResource = 'vendor-chat:/conversations/main';
		const hostUri = URI.file('/repo/.github/skills/host/SKILL.md');
		const clientUri = URI.file('/client/skills/client/SKILL.md');
		const syncedUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/bundle/skills/synced/SKILL.md' });
		const skills = [
			{ id: 'host', uri: hostUri, clientId: undefined },
			{ id: 'client', uri: clientUri, clientId: 'test-client' },
			{ id: 'synced', uri: syncedUri, clientId: undefined },
		];
		const session = upcastPartial<SessionState>({
			defaultChat: chatResource,
			chats: [],
			workingDirectories: [URI.file('/repo').toString()],
			customizations: skills.map(skill => ({
				id: `${skill.id}-container`,
				type: CustomizationType.Directory,
				name: skill.id,
				uri: dirname(skill.uri).toString(),
				clientId: skill.clientId,
				enabled: true,
				contents: CustomizationType.Skill,
				writable: false,
				children: [{ id: skill.id, type: CustomizationType.Skill, name: skill.id, uri: skill.uri.toString() }],
			})),
		});
		const chat = upcastPartial<ChatState>({
			resource: chatResource,
			turns: [upcastPartial<Turn>({
				id: 'turn',
				responseParts: skills.map(skill => ({
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						toolCallId: skill.id,
						toolName: skill.id === 'host' ? 'view' : 'skill',
						displayName: skill.id,
						status: ToolCallStatus.Completed,
						confirmed: ToolCallConfirmationReason.NotNeeded,
						invocationMessage: skill.id,
						pastTenseMessage: skill.id,
						success: true,
						toolInput: JSON.stringify(skill.id === 'host' ? { path: '.github/skills/host/SKILL.md' } : { skill: skill.id }),
					},
				})),
			})],
		});
		const harness = createActivityPills(session, chat, undefined, 'remote-server');
		harness.visibility.toggle(SessionChatPillKind.Customizations);
		// Selecting the chat only schedules customization resolution; nothing is resolved until it runs.
		const beforeFlush = { pending: harness.customizationScheduler.pendingCount > 0, pill: harness.persistentContent.textContent?.includes('Customizations') };
		assert.deepStrictEqual(beforeFlush, { pending: true, pill: false });
		const entries = harness.dropdown('3 Customizations').filter(item => item.description !== undefined);
		for (const entry of entries) {
			entry.select();
		}
		await timeout(0);

		assert.deepStrictEqual({
			entries: entries.map(entry => ({ label: entry.label, description: entry.description })),
			commands: harness.commands,
		}, {
			entries: [
				{ label: 'host', description: '.github/skills/host/SKILL.md' },
				{ label: 'client', description: clientUri.fsPath },
				{ label: 'synced', description: syncedUri.toString(true) },
			],
			commands: [toAgentHostUri(hostUri, 'remote-server'), clientUri, syncedUri].map(uri => ({
				id: AICustomizationManagementCommands.OpenEditor,
				args: [{ section: AICustomizationManagementSection.Skills, revealUri: uri.toString() }],
			})),
		});
	});

	test('matches the Agents Window aggregate issue status icon', async () => {
		const harness = createActivityPills(upcastPartial<SessionState>({
			defaultChat: 'vendor-chat:/conversations/main',
			chats: [],
			_meta: withSessionArtifacts(undefined, [1, 2].map(number => ({
				id: `issue-${number}`,
				type: SessionArtifactType.Issue,
				label: `Issue ${number}`,
				link: `https://github.com/microsoft/vscode/issues/${number}`,
				isGitHub: true,
				isArtifact: true,
			}))),
		}), undefined, createRichGitHubService([]));
		const icon = () => harness.persistentContent.querySelector<HTMLElement>('.chat-pill-icon');
		const pending = { open: icon()?.classList.contains('codicon-issue-opened'), color: icon()?.style.color };
		await timeout(0);

		assert.deepStrictEqual({
			pending,
			labels: harness.labels(),
			closed: icon()?.classList.contains('codicon-issue-closed'),
			color: icon()?.style.color,
		}, {
			pending: { open: true, color: 'var(--vscode-charts-green)' },
			labels: ['2 Issues'],
			closed: true,
			color: 'var(--vscode-charts-purple)',
		});
	});

	test('Back to an untitled draft does not subscribe to its UI identity', () => {
		const instantiationService = createInstantiationService();
		const connection = new StaticAgentConnection(new Map());
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeSessionResolution: Event.None,
			resolveSessionResource: resource => ({
				connection,
				connectionAuthority: 'local',
				backendSession: resource.with({ scheme: 'copilotcli' }),
			}),
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const [clipboardService, configurationService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
			accessor.get(IOpenerService),
		] as const);
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		const sessionResource = URI.parse('agent-host-copilotcli:/migrated');
		let viewModel = upcastPartial<ChatViewModel>({ sessionResource });
		const viewModelChanged = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: viewModelChanged.event,
			get viewModel() { return viewModel; },
			setPersistentContentHeight: () => { },
		});
		const provisionalChanged = store.add(new Emitter<URI>());
		let provisionalBackend: URI | undefined;
		const provisionalSessions = upcastPartial<IAgentHostUntitledProvisionalSessionService>({
			onDidChange: provisionalChanged.event,
			get: () => provisionalBackend,
		});
		store.add(new AgentHostSessionInputPills(
			widget, false, connectionsService, browserViewService, clipboardService,
			configurationService, editorService, instantiationService, openerService, visibility,
			provisionalSessions,
			labelService,
			notificationService,
			instantiationService.get(ICommandService),
			instantiationService.get(IDialogService),
		));
		const draft = URI.parse('agent-host-copilotcli:/untitled-draft');
		viewModel = upcastPartial<ChatViewModel>({ sessionResource: draft });
		viewModelChanged.fire({ previousSessionResource: sessionResource, currentSessionResource: draft });

		const requested = () => [...new Set(connection.requested.map(request => request.resource.toString()))];
		const beforeProvisioning = requested();
		const releasedOnBack = connection.released.some(resource => resource.toString() === 'copilotcli:/migrated');
		provisionalBackend = URI.parse('copilotcli:/provisional');
		provisionalChanged.fire(draft);
		const afterProvisioning = requested();
		provisionalBackend = URI.parse('copilotcli:/replacement');
		provisionalChanged.fire(draft);
		const afterReplacement = requested();
		provisionalBackend = undefined;
		provisionalChanged.fire(draft);
		const releasedOnRetirement = connection.released.some(resource => resource.toString() === 'copilotcli:/replacement');
		viewModel = upcastPartial<ChatViewModel>({ sessionResource });
		viewModelChanged.fire({ previousSessionResource: draft, currentSessionResource: sessionResource });

		assert.deepStrictEqual({
			beforeProvisioning,
			releasedOnBack,
			afterProvisioning,
			afterReplacement,
			releasedOnRetirement,
			lastSubscription: connection.requested.at(-1)?.resource.toString(),
			invalidDraftSubscriptions: requested().filter(resource => resource.includes('untitled-')),
		}, {
			beforeProvisioning: ['copilotcli:/migrated'],
			releasedOnBack: true,
			afterProvisioning: ['copilotcli:/migrated', 'copilotcli:/provisional'],
			afterReplacement: ['copilotcli:/migrated', 'copilotcli:/provisional', 'copilotcli:/replacement'],
			releasedOnRetirement: true,
			lastSubscription: 'copilotcli:/migrated',
			invalidDraftSubscriptions: [],
		});
	});

	test('partitions GitHub links, artifacts, and references without duplication', () => {
		const entries: readonly ISessionArtifact[] = [
			{ id: 'created-pr', type: SessionArtifactType.PullRequest, label: 'Created PR', link: 'https://github.com/microsoft/vscode/pull/2', isGitHub: true, isArtifact: true },
			{ id: 'untitled-pr', type: SessionArtifactType.PullRequest, label: '', link: 'https://github.com/microsoft/vscode/pull/3', isGitHub: true, isArtifact: true },
			{ id: 'duplicate-pr', type: SessionArtifactType.PullRequest, label: 'Existing PR', link: 'https://github.com/microsoft/vscode/pull/1/', isGitHub: true, isArtifact: false },
			{ id: 'pr-reference', type: SessionArtifactType.PullRequest, label: 'Related PR', link: 'https://github.com/microsoft/vscode/pull/4', isGitHub: true, isArtifact: false },
			{ id: 'created-issue', type: SessionArtifactType.Issue, label: 'Created Issue', link: 'https://github.com/microsoft/vscode/issues/3', isGitHub: true, isArtifact: true },
			{ id: 'issue-reference', type: SessionArtifactType.Issue, label: 'Related Issue', link: 'https://github.com/microsoft/vscode/issues/4', isGitHub: true, isArtifact: false },
			{ id: 'website', type: SessionArtifactType.Website, label: 'Preview', link: 'https://example.com', isArtifact: true },
			{ id: 'resource', type: SessionArtifactType.Resource, label: 'Docs', uri: 'https://example.com/docs', isArtifact: false },
		];
		const meta = withSessionGitHubState(
			withSessionArtifacts(undefined, entries),
			'file:///repo',
			{
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
			},
		);

		const metadata = getAgentHostSessionPillMetadata(meta, 'file:///repo');

		assert.deepStrictEqual({
			pullRequestUrls: metadata.pullRequestUrls,
			pullRequestTitles: [...metadata.pullRequestTitles],
			pullRequestArtifactIds: [...metadata.pullRequestArtifacts].map(([link, artifact]) => [link, artifact.id]),
			issueUrls: metadata.issueUrls,
			issueTitles: [...metadata.issueTitles],
			issueArtifactIds: [...metadata.issueArtifacts].map(([link, artifact]) => [link, artifact.id]),
			artifactIds: metadata.artifacts.map(artifact => artifact.id),
			referenceIds: metadata.references.map(reference => reference.id),
		}, {
			pullRequestUrls: [
				'https://github.com/microsoft/vscode/pull/3',
				'https://github.com/microsoft/vscode/pull/2',
				'https://github.com/microsoft/vscode/pull/1',
			],
			pullRequestTitles: [['https://github.com/microsoft/vscode/pull/2', 'Created PR']],
			pullRequestArtifactIds: [
				['https://github.com/microsoft/vscode/pull/3', 'untitled-pr'],
				['https://github.com/microsoft/vscode/pull/2', 'created-pr'],
			],
			issueUrls: ['https://github.com/microsoft/vscode/issues/3'],
			issueTitles: [['https://github.com/microsoft/vscode/issues/3', 'Created Issue']],
			issueArtifactIds: [['https://github.com/microsoft/vscode/issues/3', 'created-issue']],
			artifactIds: ['website'],
			// Only artifacts are promoted; references stay listed newest first, even when the pull request pill shows their link.
			referenceIds: ['resource', 'issue-reference', 'pr-reference', 'duplicate-pr'],
		});
	});

	test('uses the same ID-first rows in editor PR, issue, and reference collections', async () => {
		const artifacts: ISessionArtifact[] = [
			...[2, 3].map(number => ({
				id: `pr-${number}`, type: SessionArtifactType.PullRequest, label: 'Recorded PR', isArtifact: true, isGitHub: true,
				link: `https://github.com/microsoft/vscode/pull/${number}`,
			})),
			...[4, 5].map(number => ({
				id: `issue-${number}`, type: SessionArtifactType.Issue, label: 'Recorded issue', isArtifact: true, isGitHub: true,
				link: `https://github.com/microsoft/vscode/issues/${number}`,
			})),
			{ id: 'pr-reference', type: SessionArtifactType.PullRequest, label: 'Recorded PR', isArtifact: false, isGitHub: true, link: 'https://github.com/microsoft/vscode/pull/2' },
			{ id: 'issue-reference', type: SessionArtifactType.Issue, label: 'Recorded issue', isArtifact: false, isGitHub: true, link: 'https://github.com/microsoft/vscode/issues/4' },
		];
		const activity = createActivityPills(upcastPartial<SessionState>({
			defaultChat: 'vendor:/sessions/42/chats/main', chats: [],
			_meta: withSessionArtifacts(undefined, artifacts),
		}), undefined, undefined, 'local', createRichGitHubService([]));
		await timeout(0);
		const row = (entry: ReturnType<typeof activity.dropdownItems>[number]) => ({ label: entry.label, badge: entry.badge, leading: entry.leading });
		const pr = activity.dropdown('Pull Requests').find(entry => entry.badge === '#2')!;
		activity.instantiationService.get(IActionWidgetService).hide();
		const issue = activity.dropdown('Issues').find(entry => entry.badge === '#4')!;
		activity.instantiationService.get(IActionWidgetService).hide();
		activity.dropdown('References');
		await timeout(0);
		const references = activity.dropdownItems();
		assert.deepStrictEqual({
			pullRequest: [pr, references.find(entry => entry.badge === '#2')!].map(row),
			issue: [issue, references.find(entry => entry.badge === '#4')!].map(row),
		}, {
			pullRequest: Array.from({ length: 2 }, () => ({ label: 'Live pull request 2', badge: '#2', leading: true })),
			issue: Array.from({ length: 2 }, () => ({ label: 'Live issue title', badge: '#4', leading: true })),
		});
	});

	test('sizes editor commit fallbacks by whether rich details can resolve', () => {
		const activity = createActivityPills(upcastPartial<SessionState>({
			defaultChat: 'vendor:/sessions/42/chats/main', chats: [],
			_meta: withSessionArtifacts(undefined, [
				{ id: 'github', type: SessionArtifactType.Commit, label: 'GitHub commit', isArtifact: false, link: 'https://github.com/microsoft/vscode/commit/abc123' },
				{ id: 'other', type: SessionArtifactType.Commit, label: 'Other commit', isArtifact: false, link: 'https://example.com/commit/abc123' },
			]),
		}));
		const entries = activity.dropdown('References').filter(entry => entry.hover);

		assert.deepStrictEqual(entries.map(entry => {
			const content = typeof entry.hover?.content === 'function' ? entry.hover.content() : undefined;
			return { label: entry.label, text: content?.textContent, contentSized: content?.classList.contains('content-sized') };
		}).sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '')), [
			{ label: 'GitHub commit', text: 'https://github.com/microsoft/vscode/commit/abc123', contentSized: false },
			{ label: 'Other commit', text: 'https://example.com/commit/abc123', contentSized: true },
		]);
	});

	test('updates a dedicated editor issue hover status in place while keeping its title and focus', async () => {
		const issueStates = new Map<number, ReturnType<typeof observableValue<FragmentState<GitHubIssue>>>>();
		const activity = createActivityPills(upcastPartial<SessionState>({
			defaultChat: 'vendor:/sessions/42/chats/main', chats: [],
			_meta: withSessionArtifacts(undefined, [4, 5].map(number => ({
				id: `issue-${number}`, type: SessionArtifactType.Issue, label: 'Recorded issue', isArtifact: true, isGitHub: true,
				link: `https://github.com/microsoft/vscode/issues/${number}`,
			}))),
		}), undefined, undefined, 'local', createRichGitHubService([], { issueStates }));
		await timeout(0);
		const state = issueStates.get(4);
		assert.ok(state?.get().value);
		state.set({ ...state.get(), value: { ...state.get().value!, state: 'open', stateReason: undefined } }, undefined);
		await timeout(0);
		const first = activity.dropdown('Issues').find(item => item.badge === '#4')!.hover!;
		assert.ok(typeof first.content === 'function');
		const element = first.content();
		assert.ok(element instanceof HTMLElement);
		document.body.appendChild(element);
		store.add(toDisposable(() => element.remove()));
		const control = first.getTabbableElements?.()[1]!;
		control.focus();
		state.set({
			...state.get(), value: { ...state.get().value!, title: 'Renamed issue', state: 'closed', stateReason: 'completed' },
		}, undefined);
		await timeout(0);
		const updated = activity.dropdownItems().find(item => item.badge === '#4')!.hover!;
		assert.deepStrictEqual({
			sameDescriptor: first === updated,
			sameControl: updated.getTabbableElements?.()[1] === control,
			focusPreserved: document.activeElement === control,
			title: element.querySelector('.sessions-issue-hover-title')?.getAttribute('title'),
			status: element.querySelector('.sessions-issue-hover-status-label')?.textContent,
			statusKind: element.querySelector<HTMLElement>('.sessions-issue-hover-status')?.dataset.state,
		}, {
			sameDescriptor: true, sameControl: true, focusPreserved: true,
			title: 'Live issue title', status: 'Closed', statusKind: 'closed',
		});
	});

	test('promotes rich GitHub reference details on hover intent using the existing client lease', async () => {
		const credentialState = { fail: false, calls: 0 };
		const activity = createActivityPills({
			defaultChat: 'vendor:/sessions/42/chats/main',
			chats: [],
			_meta: withSessionArtifacts(undefined, [{
				id: 'reference',
				type: SessionArtifactType.PullRequest,
				label: 'Related pull request',
				link: 'https://github.com/microsoft/vscode/pull/2',
				isGitHub: true,
				isArtifact: false,
			}]),
		} as unknown as SessionState, undefined, undefined, 'local', createRichGitHubService([], { credentialState }));
		await timeout(0);

		const beforeHover = credentialState.calls;
		const entry = activity.dropdown('Reference').find(item => item.label === 'Related pull request');
		const content = entry?.hover?.content;
		const hoverElement = typeof content === 'function' ? content() : undefined;
		await timeout(0);
		const resolvedEntry = activity.dropdownItems().find(item => item.label === 'Live pull request 2');
		const resolvedContent = resolvedEntry?.hover?.content;

		assert.deepStrictEqual({
			beforeHover,
			afterHover: credentialState.calls,
			resolvedLabel: resolvedEntry?.label,
			preservedHover: typeof resolvedContent === 'function' && resolvedContent() === hoverElement,
			className: hoverElement?.className,
			text: hoverElement?.textContent,
			labels: activity.labels(),
		}, {
			beforeHover: 0,
			afterHover: 1,
			resolvedLabel: 'Live pull request 2',
			preservedHover: true,
			className: 'chat-pill-hover-content sessions-pr-hover compact',
			text: 'microsoft/vscodeon Sep 1Live pull request 2 #2OpenLive pull request bodymain←feature@pr-author opened this pull request',
			labels: ['1 Reference'],
		});
	});

	test('updates cold reference status icons when metadata resolves and keeps them on reopening', async () => {
		const activity = createActivityPills(upcastPartial<SessionState>({
			defaultChat: 'vendor:/sessions/42/chats/main', chats: [],
			_meta: withSessionArtifacts(undefined, [
				{ id: 'pr', type: SessionArtifactType.PullRequest, label: 'Pull Request', link: 'https://github.com/microsoft/vscode/pull/335387', isGitHub: true, isArtifact: false },
				{ id: 'issue', type: SessionArtifactType.Issue, label: 'Issue', link: 'https://github.com/microsoft/vscode/issues/4', isGitHub: true, isArtifact: false },
			]),
		}), undefined, undefined, 'local', createRichGitHubService([]));
		const rows = () => activity.dropdownItems().filter(entry => entry.badge).map(entry => ({
			badge: entry.badge, label: entry.label, icon: entry.icon?.id, color: entry.icon?.color?.id,
		}));
		activity.dropdown('References');
		const cold = rows();
		await timeout(0);
		const resolved = rows();
		activity.instantiationService.get(IActionWidgetService).hide();
		activity.dropdown('References');
		const reopened = rows();
		const expected = [
			{ badge: '#335387', label: 'Live pull request 335387', icon: 'git-pull-request-done', color: 'charts.purple' },
			{ badge: '#4', label: 'Live issue title', icon: 'issue-closed', color: 'charts.purple' },
		];
		assert.deepStrictEqual({ cold, resolved, reopened }, {
			cold: [
				{ badge: '#335387', label: 'Pull Request', icon: 'git-pull-request', color: undefined },
				{ badge: '#4', label: 'Issue', icon: 'issues', color: undefined },
			],
			resolved: expected,
			reopened: expected,
		});
	});

	test('keeps recorded reference labels when GitHub metadata fails', async () => {
		const links = ['https://github.com/microsoft/vscode/pull/1', 'https://github.com/microsoft/vscode/issues/2'];
		const activity = createActivityPills(upcastPartial<SessionState>({
			defaultChat: 'vendor:/sessions/42/chats/main',
			chats: [],
			_meta: withSessionArtifacts(undefined, links.map((link, index) => ({
				id: `reference-${index}`, type: index === 0 ? SessionArtifactType.PullRequest : SessionArtifactType.Issue,
				label: 'Related item', link, isGitHub: true, isArtifact: false,
			}))),
		}), undefined, undefined, 'local', createRichGitHubService([], { credentialState: { fail: true, calls: 0 } }));
		activity.dropdown('Reference');
		await timeout(0);
		assert.deepStrictEqual(activity.dropdownItems().filter(item => item.label === 'Related item').map(item => ({
			label: item.label, description: item.description,
		})), links.map(description => ({ label: 'Related item', description })));
	});

	test('warms new reference titles before dropdown or hover intent', async () => {
		const credentialState = { fail: false, calls: 0 };
		const reference = (id: string): ISessionArtifact => ({
			id, type: SessionArtifactType.PullRequest, label: `Recorded PR ${id}`,
			link: `https://github.com/microsoft/vscode/pull/${id}`, isGitHub: true, isArtifact: false,
		});
		const session = upcastPartial<SessionState>({
			defaultChat: 'vendor:/sessions/42/chats/main', chats: [],
			_meta: withSessionArtifacts(undefined, [reference('1')]),
		});
		const activity = createActivityPills(session, undefined, undefined, 'local', createRichGitHubService([], { credentialState }));
		await timeout(0);
		const initial = credentialState.calls;
		activity.connection.setState(StateComponents.Session, { ...session, _meta: withSessionArtifacts(undefined, [reference('1'), reference('2')]) });
		await timeout(0);
		const warmed = credentialState.calls;
		const entries = activity.dropdown('References');
		assert.deepStrictEqual({ initial, warmed, labels: entries.filter(entry => entry.label?.includes('PR') || entry.label?.includes('pull request')).map(entry => entry.label) }, {
			initial: 0, warmed: 1, labels: ['Live pull request 2', 'Recorded PR 1'],
		});
	});

	test('lists each pill newest first, within the section it belongs to', () => {
		const entries: readonly ISessionArtifact[] = [
			{ id: 'old-website', type: SessionArtifactType.Website, label: 'Old Preview', link: 'https://example.com/old', isArtifact: true },
			{ id: 'old-reference', type: SessionArtifactType.Resource, label: 'Old Docs', uri: 'https://example.com/old-docs', isArtifact: false },
			{ id: 'old-pr', type: SessionArtifactType.PullRequest, label: 'Old PR', link: 'https://github.com/microsoft/vscode/pull/1', isGitHub: true, isArtifact: true },
			{ id: 'old-issue', type: SessionArtifactType.Issue, label: 'Old Issue', link: 'https://github.com/microsoft/vscode/issues/1', isGitHub: true, isArtifact: true },
			{ id: 'new-website', type: SessionArtifactType.Website, label: 'New Preview', link: 'https://example.com/new', isArtifact: true },
			{ id: 'new-reference', type: SessionArtifactType.Resource, label: 'New Docs', uri: 'https://example.com/new-docs', isArtifact: false },
			{ id: 'new-pr', type: SessionArtifactType.PullRequest, label: 'New PR', link: 'https://github.com/microsoft/vscode/pull/2', isGitHub: true, isArtifact: true },
			{ id: 'new-issue', type: SessionArtifactType.Issue, label: 'New Issue', link: 'https://github.com/microsoft/vscode/issues/2', isGitHub: true, isArtifact: true },
		];

		const metadata = getAgentHostSessionPillMetadata(withSessionArtifacts(undefined, entries), undefined);

		assert.deepStrictEqual({
			pullRequestUrls: metadata.pullRequestUrls,
			pullRequestTitles: [...metadata.pullRequestTitles],
			pullRequestArtifactIds: [...metadata.pullRequestArtifacts].map(([link, artifact]) => [link, artifact.id]),
			issueUrls: metadata.issueUrls,
			issueTitles: [...metadata.issueTitles],
			issueArtifactIds: [...metadata.issueArtifacts].map(([link, artifact]) => [link, artifact.id]),
			artifactIds: metadata.artifacts.map(artifact => artifact.id),
			referenceIds: metadata.references.map(reference => reference.id),
		}, {
			pullRequestUrls: [
				'https://github.com/microsoft/vscode/pull/2',
				'https://github.com/microsoft/vscode/pull/1',
			],
			pullRequestTitles: [
				['https://github.com/microsoft/vscode/pull/2', 'New PR'],
				['https://github.com/microsoft/vscode/pull/1', 'Old PR'],
			],
			pullRequestArtifactIds: [
				['https://github.com/microsoft/vscode/pull/2', 'new-pr'],
				['https://github.com/microsoft/vscode/pull/1', 'old-pr'],
			],
			issueUrls: [
				'https://github.com/microsoft/vscode/issues/2',
				'https://github.com/microsoft/vscode/issues/1',
			],
			issueTitles: [
				['https://github.com/microsoft/vscode/issues/2', 'New Issue'],
				['https://github.com/microsoft/vscode/issues/1', 'Old Issue'],
			],
			issueArtifactIds: [
				['https://github.com/microsoft/vscode/issues/2', 'new-issue'],
				['https://github.com/microsoft/vscode/issues/1', 'old-issue'],
			],
			artifactIds: ['new-website', 'old-website'],
			referenceIds: ['new-reference', 'old-reference'],
		});
	});

	test('keeps the newest artifact and title for duplicate GitHub links', () => {
		const pullRequestUrl = 'https://github.com/microsoft/vscode/pull/1';
		const issueUrl = 'https://github.com/microsoft/vscode/issues/2';
		const entries: readonly ISessionArtifact[] = [
			{ id: 'old-pr', type: SessionArtifactType.PullRequest, label: 'Old PR', link: pullRequestUrl, isGitHub: true, isArtifact: true },
			{ id: 'old-issue', type: SessionArtifactType.Issue, label: 'Old Issue', link: issueUrl, isGitHub: true, isArtifact: true },
			{ id: 'new-pr', type: SessionArtifactType.PullRequest, label: 'New PR', link: `${pullRequestUrl}/`, isGitHub: true, isArtifact: true },
			{ id: 'new-issue', type: SessionArtifactType.Issue, label: 'New Issue', link: `${issueUrl}/`, isGitHub: true, isArtifact: true },
		];
		const metadata = getAgentHostSessionPillMetadata(withSessionArtifacts(undefined, entries), undefined);

		assert.deepStrictEqual({
			pullRequestUrls: metadata.pullRequestUrls,
			pullRequestTitle: metadata.pullRequestTitles.get(pullRequestUrl),
			pullRequestArtifactId: metadata.pullRequestArtifacts.get(pullRequestUrl)?.id,
			issueUrls: metadata.issueUrls,
			issueTitle: metadata.issueTitles.get(issueUrl),
			issueArtifactId: metadata.issueArtifacts.get(issueUrl)?.id,
		}, {
			pullRequestUrls: [`${pullRequestUrl}/`],
			pullRequestTitle: 'New PR',
			pullRequestArtifactId: 'new-pr',
			issueUrls: [`${issueUrl}/`],
			issueTitle: 'New Issue',
			issueArtifactId: 'new-issue',
		});
	});

	test('renders rich GitHub metadata in editor session pills', async () => {
		const instantiationService = createInstantiationService();
		const disposedSubscriptions: string[] = [];
		const credentialState = { fail: false, calls: 0 };
		const leases = { acquired: 0, released: 0 };
		const pullRequestSnapshots = new Map<number, ReturnType<typeof observableValue<PullRequestSnapshot>>>();
		instantiationService.stub(IWorkbenchGitHubService, createRichGitHubService(disposedSubscriptions, { credentialState, pullRequestSnapshots, leases }));
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const issueUrl = 'https://github.com/microsoft/vscode/issues/335383';
		const firstPullRequestUrl = 'https://github.com/microsoft/vscode/pull/335387';
		const secondPullRequestUrl = 'https://github.com/microsoft/vscode/pull/332982';
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: buildDefaultChatUri(backendSession),
				chats: [],
				_meta: withSessionArtifacts(undefined, [
					{
						id: 'issue',
						type: SessionArtifactType.Issue,
						label: 'Agent Window issue pill discards the recorded issue title',
						link: issueUrl,
						isGitHub: true,
						isArtifact: true,
					},
					{
						id: 'first-pr',
						type: SessionArtifactType.PullRequest,
						label: 'sessions: preserve recorded issue titles in pills',
						link: firstPullRequestUrl,
						isGitHub: true,
						isArtifact: true,
					},
					{
						id: 'second-pr',
						type: SessionArtifactType.PullRequest,
						label: 'Chat: unify Agent Host status pills across chat surfaces',
						link: secondPullRequestUrl,
						isGitHub: true,
						isArtifact: true,
					},
				]),
			} as unknown as SessionState],
		]), true);
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<ChatViewModel>({ sessionResource }),
			setPersistentContentHeight: () => { },
		});
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: Event.None,
			onDidChangeSessionResolution: Event.None,
			connections: [],
			resolveSessionResource: () => ({ connection, connectionAuthority: 'local', backendSession }),
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		let dropdownItems: readonly IActionListItem<object>[] = [];
		instantiationService.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
			isVisible: false,
			show: (_user, _supportsPreview, items) => {
				dropdownItems = items as readonly IActionListItem<object>[];
			},
			hide: () => { },
			updateItems: items => {
				dropdownItems = items as readonly IActionListItem<object>[];
			},
			focusItemById: () => { },
		}));
		const [clipboardService, configurationService, editorService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
		] as const);
		const openerService = new TestOpenerService();

		const pills = store.add(new AgentHostSessionInputPills(
			widget,
			false,
			connectionsService,
			browserViewService,
			clipboardService,
			configurationService,
			editorService,
			instantiationService,
			openerService,
			visibility,
			noProvisionalSessions,
			labelService,
			notificationService,
			instantiationService.get(ICommandService),
			instantiationService.get(IDialogService),
		));
		await timeout(0);

		const buttons = [...persistentContent.querySelectorAll<HTMLElement>('.chat-dropdown-pill-button')];
		const [pullRequestButton, issueButton] = buttons;
		const pullRequestSnapshot = pullRequestSnapshots.get(332982)!;
		const currentSnapshot = pullRequestSnapshot.get();
		pullRequestSnapshot.set({
			...currentSnapshot,
			checks: {
				status: 'ready',
				complete: true,
				value: {
					headSha: 'head',
					checks: [{ id: 'check', type: 'checkRun', name: 'Build', status: 'COMPLETED', conclusion: 'SUCCESS' }],
					requirednessComplete: true,
					expectedSuites: [],
					expectedSuitesComplete: true,
				},
			},
		}, undefined);
		await timeout(0);
		pullRequestButton?.click();
		const checksDescription = dropdownItems.find(item => item.item && (item.item as { id?: string }).id?.endsWith('/332982'))?.ariaDescription;
		pullRequestSnapshot.set({
			...pullRequestSnapshot.get(),
			core: {
				...pullRequestSnapshot.get().core,
				value: {
					...pullRequestSnapshot.get().core.value!,
					headSha: 'new-head',
				},
			},
		}, undefined);
		await timeout(0);
		const staleChecksDescription = dropdownItems.find(item => item.item && (item.item as { id?: string }).id?.endsWith('/332982'))?.ariaDescription;
		const pullRequestDropdownItems = dropdownItems;
		const pullRequestHoverItem = pullRequestDropdownItems.find(item => typeof item.hover?.content === 'function');
		const pullRequestHover = pullRequestHoverItem?.hover?.content;
		const pullRequestHoverElement = typeof pullRequestHover === 'function' ? pullRequestHover() : undefined;
		if (pullRequestHoverElement instanceof HTMLElement) {
			document.body.appendChild(pullRequestHoverElement);
			store.add(toDisposable(() => pullRequestHoverElement.remove()));
		}
		const focusedControl = pullRequestHoverItem?.hover?.getTabbableElements?.()[0];
		focusedControl?.focus();
		const refreshedPullRequestHoverElement = typeof pullRequestHover === 'function' ? pullRequestHover() : undefined;
		const refreshedFocusedControl = pullRequestHoverItem?.hover?.getTabbableElements?.()[0];
		const pullRequestHoverCache = Reflect.get(Reflect.get(pills, '_pullRequestHoverCache'), '_entries') as ReadonlyMap<string, object>;
		const cachedHoverCount = pullRequestHoverCache.size;
		const gitHubReferenceResolver = Reflect.get(pills, '_gitHubReferenceResolver') as {
			getIssue(target: { owner: string; repo: string; number: number }): IObservable<{ title: string } | undefined>;
			getPullRequest(target: { owner: string; repo: string; number: number }): void;
			retain(issues: readonly { owner: string; repo: string; number: number }[], pullRequests: readonly { owner: string; repo: string; number: number }[]): void;
		};
		credentialState.fail = true;
		const recoveredIssue = gitHubReferenceResolver.getIssue({ owner: 'microsoft', repo: 'vscode', number: 999 });
		await timeout(0);
		credentialState.fail = false;
		gitHubReferenceResolver.getIssue({ owner: 'microsoft', repo: 'vscode', number: 999 });
		await timeout(0);
		issueButton?.click();
		const removePullRequest = pullRequestDropdownItems.flatMap(item => item.toolbarActions ?? []).find(action => action.label.startsWith('Remove '));
		await removePullRequest?.run();
		const presentation = {
			pullRequests: {
				label: pullRequestButton?.querySelector('.chat-pill-label')?.textContent,
				ariaLabel: pullRequestButton?.getAttribute('aria-label'),
				dropdownLabels: pullRequestDropdownItems.map(item => item.label ?? ''),
				hoverClassName: pullRequestHoverElement instanceof HTMLElement ? pullRequestHoverElement.className : undefined,
				hoverText: pullRequestHoverElement instanceof HTMLElement ? pullRequestHoverElement.textContent : undefined,
				actionLabels: pullRequestDropdownItems.flatMap(item => item.toolbarActions ?? []).map(action => action.label),
			},
			issue: {
				label: issueButton?.querySelector('.chat-pill-label')?.textContent,
				ariaLabel: issueButton?.getAttribute('aria-label'),
				ariaDescription: issueButton?.getAttribute('aria-description'),
				closed: issueButton?.querySelector('.chat-pill-icon')?.classList.contains('codicon-issue-closed'),
				color: issueButton?.querySelector<HTMLElement>('.chat-pill-icon')?.style.color,
			},
			opened: openerService.opened.map(({ resource, options }) => ({ resource: resource.toString(true), options })),
			removed: connection.removeSessionArtifactCalls.map(({ session, artifactId }) => ({ session: session.toString(), artifactId })),
		};
		connection.setState(StateComponents.Session, {
			defaultChat: buildDefaultChatUri(backendSession),
			chats: [],
			_meta: withSessionArtifacts(undefined, []),
		} as unknown as SessionState);
		await timeout(0);

		assert.deepStrictEqual({
			...presentation,
			disposedSubscriptions: disposedSubscriptions.sort(),
			cachedHoverCount,
			retainedHoverCount: pullRequestHoverCache.size,
			checksDescription,
			staleChecksDescription,
			credentialRecovery: {
				calls: credentialState.calls,
				title: recoveredIssue.get()?.title,
			},
			hoverRefresh: {
				rootPreserved: refreshedPullRequestHoverElement === pullRequestHoverElement,
				controlReplaced: refreshedFocusedControl !== focusedControl,
				focusPreserved: document.activeElement === refreshedFocusedControl,
			},
		}, {
			pullRequests: {
				label: '2 Pull Requests',
				ariaLabel: 'Show 2 pull requests',
				dropdownLabels: [
					'Pull Requests',
					'Live pull request 332982',
					'Live pull request 335387',
				],
				hoverClassName: 'chat-pill-hover-content sessions-pr-hover compact',
				hoverText: 'microsoft/vscodeon Sep 1Live pull request 332982 #332982OpenLive pull request bodymain←feature@pr-author opened this pull request',
				actionLabels: [
					'Copy Pull Request URL',
					'Remove Artifact Chat: unify Agent Host status pills across chat surfaces from Session',
					'Copy Pull Request URL',
					'Remove Artifact sessions: preserve recorded issue titles in pills from Session',
				],
			},
			issue: {
				label: '#335383',
				ariaLabel: 'Open Issue #335383: Live issue title',
				ariaDescription: `Closed. ${issueUrl}`,
				closed: true,
				color: 'var(--vscode-charts-purple)',
			},
			opened: [{
				resource: issueUrl,
				options: { openExternal: true, allowContributedOpeners: true, fromUserGesture: true },
			}],
			removed: [{ session: backendSession.toString(), artifactId: 'second-pr' }],
			disposedSubscriptions: ['issue:335383', 'issue:999', 'pullRequest:332982', 'pullRequest:335387'],
			cachedHoverCount: 2,
			retainedHoverCount: 0,
			checksDescription: `Open. Checks passed. ${secondPullRequestUrl}`,
			staleChecksDescription: `Open. ${secondPullRequestUrl}`,
			credentialRecovery: {
				calls: 5,
				title: 'Live issue title',
			},
			hoverRefresh: {
				rootPreserved: true,
				controlReplaced: false,
				focusPreserved: true,
			},
		});

		gitHubReferenceResolver.getIssue({ owner: 'microsoft', repo: 'vscode', number: 1000 });
		gitHubReferenceResolver.getPullRequest({ owner: 'microsoft', repo: 'vscode', number: 1001 });
		gitHubReferenceResolver.retain([], []);
		await timeout(0);
		assert.deepStrictEqual({ leases, credentialCalls: credentialState.calls }, {
			leases: { acquired: 7, released: 7 }, credentialCalls: 5,
		});
	});

	test('keeps an editor PR dropdown hover frozen through metadata updates and refreshes it on reopening', async () => {
		const snapshots = new Map<number, ReturnType<typeof observableValue<PullRequestSnapshot>>>();
		const artifacts = [335387, 332982].map(number => ({
			id: `pr-${number}`, type: SessionArtifactType.PullRequest, label: `Recorded PR ${number}`,
			link: `https://github.com/microsoft/vscode/pull/${number}`, isGitHub: true, isArtifact: true,
		}));
		const activity = createActivityPills(upcastPartial<SessionState>({
			defaultChat: 'vendor:/sessions/42/chat/main', chats: [],
			_meta: withSessionArtifacts(undefined, artifacts),
		}), undefined, undefined, 'local', createRichGitHubService([], { pullRequestSnapshots: snapshots }));
		await timeout(0);
		activity.persistentContent.querySelector<HTMLElement>('.chat-dropdown-pill-button')!.click();
		const firstHover = activity.dropdownItems().find(item => item.label === 'Live pull request 332982')!.hover!;
		const firstContent = firstHover.content;
		assert.ok(typeof firstContent === 'function');
		const element = firstContent();
		assert.ok(element instanceof HTMLElement);
		document.body.appendChild(element);
		store.add(toDisposable(() => element.remove()));
		const focusedControl = firstHover.getTabbableElements?.()[0];
		focusedControl?.focus();
		const snapshot = snapshots.get(332982)!;
		snapshot.set({
			...snapshot.get(),
			core: {
				...snapshot.get().core,
				value: { ...snapshot.get().core.value!, title: 'Updated PR title', headRef: 'updated-branch' },
			},
		}, undefined);
		await timeout(0);
		const updatedItem = activity.dropdownItems().find(item => item.badge === '#332982')!;
		const updatedHover = updatedItem.hover!;
		const updatedContent = updatedHover.content;
		assert.ok(typeof updatedContent === 'function');
		const whileOpen = {
			sameRoot: updatedContent() === element,
			sameControl: updatedHover.getTabbableElements?.()[0] === focusedControl,
			focusPreserved: document.activeElement === focusedControl,
			title: element.querySelector('.sessions-pr-hover-title')?.getAttribute('title'),
			head: element.querySelector('.sessions-pr-hover-branches')?.textContent,
		};
		element.remove();
		const reopened = updatedContent();
		assert.ok(reopened instanceof HTMLElement);

		assert.deepStrictEqual({
			rowLabelWhileOpen: updatedItem.label,
			whileOpen,
			reopenedTitle: reopened.querySelector('.sessions-pr-hover-title')?.getAttribute('title'),
			reopenedHead: reopened.querySelector('.sessions-pr-hover-branches')?.textContent,
		}, {
			rowLabelWhileOpen: 'Live pull request 332982',
			whileOpen: {
				sameRoot: true, sameControl: true, focusPreserved: true,
				title: 'Live pull request 332982', head: 'main←feature',
			},
			reopenedTitle: 'Updated PR title', reopenedHead: 'main←updated-branch',
		});
	});

	test('resolves Session Changes by default, honors a configured changeset, and ignores templated entries', () => {
		const backendSession = URI.parse('ahp-session:/session');
		const changesets: readonly Changeset[] = [
			{ label: 'Last Turn', uriTemplate: 'changeset/turn/{turnId}', changeKind: ChangesetKind.Turn },
			{ label: 'Session Changes', uriTemplate: 'changeset/session', changeKind: ChangesetKind.Session },
			{ label: 'Branch Changes', uriTemplate: 'changeset/branch', changeKind: ChangesetKind.Branch },
		];

		assert.deepStrictEqual({
			default: resolveAgentHostChangeset(backendSession, changesets),
			configured: resolveAgentHostChangeset(backendSession, changesets, ChangesetKind.Branch),
			fallback: resolveAgentHostChangeset(backendSession, changesets.slice(0, 2), ChangesetKind.Branch),
			turnOnly: resolveAgentHostChangeset(backendSession, changesets.slice(0, 1), ChangesetKind.Session),
		}, {
			default: {
				changeset: changesets[1],
				resource: URI.parse('ahp-session:/session/changeset/session'),
			},
			configured: {
				changeset: changesets[2],
				resource: URI.parse('ahp-session:/session/changeset/branch'),
			},
			fallback: {
				changeset: changesets[1],
				resource: URI.parse('ahp-session:/session/changeset/session'),
			},
			turnOnly: undefined,
		});
	});

	for (const { label, changeKind, editorTitle } of [
		{ label: 'Session', changeKind: ChangesetKind.Session, editorTitle: 'Session Changes' },
		{ label: 'Branch', changeKind: ChangesetKind.Branch, editorTitle: 'Branch Changes' },
		{ label: 'Uncommitted', changeKind: ChangesetKind.Uncommitted, editorTitle: 'Uncommitted Changes' },
		{ label: 'Branch Changes', changeKind: ChangesetKind.Branch, editorTitle: 'Branch Changes' },
		{ label: 'Review Edits', changeKind: ChangesetKind.Session, editorTitle: 'Review Edits' },
		{ label: 'Feature Review', changeKind: ChangesetKind.Branch, editorTitle: 'Feature Review' },
		{ label: 'Session', changeKind: 'review', editorTitle: 'Session' },
	]) {
		test(`preserves the ${editorTitle} editor title for the ${changeKind} changeset labeled ${label}`, async () => {
			const instantiationService = createInstantiationService();
			const sessionResource = URI.parse('agent-host-copilot:/session');
			const backendSession = URI.parse('copilot:/session');
			const backendChat = URI.parse(buildDefaultChatUri(backendSession));
			const changeset: Changeset = { label, changeKind, uriTemplate: 'vendor-diff:/opaque/changes' };
			const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChatState | ChangesetState>([
				[StateComponents.Session, {
					defaultChat: backendChat.toString(),
					chats: [],
					changesets: changeKind === ChangesetKind.Session ? [changeset] : [],
				} as unknown as SessionState],
				[StateComponents.Chat, {
					changesets: changeKind === ChangesetKind.Session ? [
						{ label: 'Branch', uriTemplate: 'changeset/branch', changeKind: ChangesetKind.Branch },
						{ label: 'Uncommitted', uriTemplate: 'changeset/uncommitted', changeKind: ChangesetKind.Uncommitted },
						{ label: 'This Turn', uriTemplate: 'changeset/turn/{turnId}', changeKind: ChangesetKind.Turn },
					] : [changeset],
				} as unknown as ChatState],
				[StateComponents.Changeset, {
					status: ChangesetStatus.Ready,
					files: [{
						id: 'change',
						edit: {
							after: { uri: URI.file('/changed.ts').toString(), content: { uri: 'git-blob://after' } },
							diff: { added: 3, removed: 1 },
						},
					}],
				} as unknown as ChangesetState],
			]));
			const persistentContent = document.createElement('div');
			document.body.appendChild(persistentContent);
			store.add(toDisposable(() => persistentContent.remove()));
			const widget = upcastPartial<ChatWidget>({
				inputPart: upcastPartial<ChatInputPart>({
					persistentContentContainerElement: persistentContent,
					registerChatPetHorizontalPlatformProvider: () => Disposable.None,
				}),
				onDidChangeViewModel: Event.None,
				viewModel: upcastPartial<ChatViewModel>({ sessionResource }),
				setPersistentContentHeight: () => { },
			});
			const connectionsService = upcastPartial<IAgentHostConnectionsService>({
				onDidChangeConnections: Event.None,
				onDidChangeSessionResolution: Event.None,
				connections: [],
				resolveSessionResource: () => ({ connection, connectionAuthority: 'local', backendSession }),
			});
			const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
				onDidChangeBrowserViews: Event.None,
				getKnownBrowserViews: () => new Map(),
			});
			const opened: { readonly label: string | undefined; readonly files: readonly (string | undefined)[] }[] = [];
			const editorService = upcastPartial<IEditorService>({
				openEditor: async (input: EditorInput | IUntypedEditorInput) => {
					if (isResourceMultiDiffEditorInput(input)) {
						opened.push({ label: input.label, files: input.resources?.map(resource => resource.goToFileResource?.toString()) ?? [] });
					}
					return undefined;
				},
			});
			const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
			instantiationService.stub(ISessionChatPillVisibilityService, visibility);
			const [clipboardService, configurationService, openerService] = instantiationService.invokeFunction(accessor => [
				accessor.get(IClipboardService),
				accessor.get(IConfigurationService),
				accessor.get(IOpenerService),
			] as const);

			store.add(new AgentHostSessionInputPills(
				widget,
				false,
				connectionsService,
				browserViewService,
				clipboardService,
				configurationService,
				editorService,
				instantiationService,
				openerService,
				visibility,
				noProvisionalSessions,
				labelService,
				notificationService,
				instantiationService.get(ICommandService),
				instantiationService.get(IDialogService),
			));
			const button = persistentContent.querySelector<HTMLElement>('.chat-changes-pill-button');
			button?.click();
			await timeout(0);

			assert.deepStrictEqual({
				ariaLabel: button?.getAttribute('aria-label'),
				changesetSubscriptions: [...new Set(connection.requested.filter(request => request.kind === StateComponents.Changeset).map(request => request.resource.toString()))],
				opened,
			}, {
				ariaLabel: `${label}: 1 File, +3, -1`,
				changesetSubscriptions: [changeset.uriTemplate],
				opened: [{ label: editorTitle, files: [toAgentHostUri(URI.file('/changed.ts'), 'local').toString()] }],
			});
		});
	}

	test('replaces the Changes pill with live session changes and restores it when disabled', async () => {
		const sessionChangesUri = 'vendor-diff:/opaque/session-changes';
		const harness = createActivityPills(upcastPartial<SessionState>({
			provider: 'copilotcli',
			defaultChat: 'vendor-chat:/opaque/main',
			chats: [],
			changesets: [{ label: 'Session Changes', uriTemplate: sessionChangesUri, changeKind: ChangesetKind.Session }],
		}), upcastPartial<ChatState>({
			changesets: [{ label: 'Branch Changes', uriTemplate: 'vendor-diff:/opaque/branch-changes', changeKind: ChangesetKind.Branch }],
			turns: [],
		}), undefined, 'remote-test', undefined, undefined, { defaultChangesetKind: ChangesetKind.Branch });
		const configurationService = harness.instantiationService.get(IConfigurationService) as TestConfigurationService;
		const setEnabled = async (enabled: boolean) => {
			await configurationService.setUserConfiguration(ChatConfiguration.EditorWorkingSetEnabled, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectsConfiguration: key => key === ChatConfiguration.EditorWorkingSetEnabled,
			}));
		};
		const first: ChangesetState['files'][number] = {
			id: 'earlier',
			edit: {
				before: { uri: 'file:///repo/earlier.ts', content: { uri: 'snapshot:/initial/earlier.ts' } },
				after: { uri: 'file:///repo/earlier.ts', content: { uri: 'snapshot:/current/earlier.ts' } },
				diff: { added: 3, removed: 1 },
			},
		};
		const second: ChangesetState['files'][number] = {
			id: 'latest',
			edit: {
				after: { uri: 'file:///repo/latest.ts', content: { uri: 'snapshot:/current/latest.ts' } },
				diff: { added: 5, removed: 0 },
			},
		};
		const setFiles = (files: ChangesetState['files']) => harness.connection.setState(StateComponents.Changeset, upcastPartial<ChangesetState>({ status: ChangesetStatus.Ready, files }));
		const readState = () => ({
			pill: !!harness.persistentContent.querySelector('.chat-changes-pill-button'),
			files: harness.workingSetChanges()?.map(diff => basename(diff.modifiedURI)),
		});
		setFiles([first]);
		const states = [readState()];
		harness.instantiationService.stub(IConfigurationService, 'updateValue', async (key: string, value: boolean) => {
			assert.strictEqual(key, ChatConfiguration.EditorWorkingSetEnabled);
			assert.strictEqual(typeof value, 'boolean');
			await setEnabled(value === true);
		});
		const showWorkingSet = harness.menu(harness.persistentContent.querySelector('.chat-changes-pill-button')).find(action => action.label === 'Show Working Set');
		assert.ok(showWorkingSet);
		await showWorkingSet.run();
		states.push(readState());
		setFiles([first, second]);
		states.push(readState());
		harness.showSession(harness.sessionResource.with({ query: 'view=main' }));
		await setEnabled(false);
		states.push(readState());
		await setEnabled(true);
		states.push(readState());
		setFiles([]);
		states.push(readState());

		assert.deepStrictEqual({
			states,
			usesAdvertisedSessionChanges: harness.connection.requested.some(request => request.kind === StateComponents.Changeset && request.resource.toString() === sessionChangesUri),
			workingSetRegistrations: harness.workingSetRegistrations(),
		}, {
			states: [
				{ pill: true, files: undefined },
				{ pill: false, files: ['earlier.ts'] },
				{ pill: false, files: ['earlier.ts', 'latest.ts'] },
				{ pill: true, files: undefined },
				{ pill: false, files: ['earlier.ts', 'latest.ts'] },
				{ pill: false, files: [] },
			],
			usesAdvertisedSessionChanges: true,
			workingSetRegistrations: 2,
		});
	});

	test('keeps the Changes pill and its changeset where the input cannot show the working set, like in the Agents window', async () => {
		const sessionChangesUri = 'vendor-diff:/opaque/session-changes';
		const harness = createActivityPills(upcastPartial<SessionState>({
			provider: 'copilotcli',
			defaultChat: 'vendor-chat:/opaque/main',
			chats: [],
			changesets: [{ label: 'Session Changes', uriTemplate: sessionChangesUri, changeKind: ChangesetKind.Session }],
		}), upcastPartial<ChatState>({
			changesets: [{ label: 'Branch Changes', uriTemplate: 'vendor-diff:/opaque/branch-changes', changeKind: ChangesetKind.Branch }],
			turns: [],
		}), undefined, 'remote-test', undefined, undefined, { defaultChangesetKind: ChangesetKind.Branch, supportsSessionWorkingSet: false });
		harness.connection.setState(StateComponents.Changeset, upcastPartial<ChangesetState>({
			status: ChangesetStatus.Ready,
			files: [{
				id: 'file',
				edit: {
					after: { uri: 'file:///repo/file.ts', content: { uri: 'snapshot:/after/file.ts' } },
					diff: { added: 3, removed: 1 },
				},
			}],
		}));
		await harness.setWorkingSetEnabled(true);

		assert.deepStrictEqual({
			pill: !!harness.persistentContent.querySelector('.chat-changes-pill-button'),
			usesSessionChanges: harness.connection.requested.some(request => request.kind === StateComponents.Changeset && request.resource.toString() === sessionChangesUri),
			workingSetRegistrations: harness.workingSetRegistrations(),
		}, {
			pill: true,
			usesSessionChanges: false,
			workingSetRegistrations: 0,
		});
	});

	for (const parameterizedSessionChanges of [false, true]) {
		test(`preserves the advertised Changes pill without a static Session changeset (parameterized: ${parameterizedSessionChanges})`, async () => {
			const branchChanges: Changeset = { label: 'Branch Changes', uriTemplate: 'vendor-diff:/branch', changeKind: ChangesetKind.Branch };
			const uncommittedChanges: Changeset = { label: 'Uncommitted Changes', uriTemplate: 'vendor-diff:/uncommitted', changeKind: ChangesetKind.Uncommitted };
			const expectedChangeset = parameterizedSessionChanges ? uncommittedChanges : branchChanges;
			const harness = createActivityPills(upcastPartial<SessionState>({
				provider: 'copilotcli',
				defaultChat: 'vendor-chat:/main',
				chats: [],
				changesets: parameterizedSessionChanges ? [{ label: 'Session Changes', uriTemplate: 'vendor-diff:/session/{turnId}', changeKind: ChangesetKind.Session }] : undefined,
			}), upcastPartial<ChatState>({
				changesets: parameterizedSessionChanges ? [branchChanges, uncommittedChanges] : [branchChanges],
				turns: [],
			}), undefined, 'remote-test', undefined, undefined, { defaultChangesetKind: expectedChangeset.changeKind === ChangesetKind.Uncommitted ? ChangesetKind.Uncommitted : ChangesetKind.Session });
			harness.connection.setState(StateComponents.Changeset, upcastPartial<ChangesetState>({
				status: ChangesetStatus.Ready,
				files: [{
					id: 'file',
					edit: {
						after: { uri: 'file:///repo/file.ts', content: { uri: 'snapshot:/after/file.ts' } },
						diff: { added: 3, removed: 1 },
					},
				}],
			}));
			const readState = () => ({
				pill: harness.persistentContent.querySelector('.chat-changes-pill-button')?.getAttribute('aria-label'),
				workingSet: harness.workingSetChanges(),
				registrations: harness.workingSetRegistrations(),
				changeset: harness.connection.requested.filter(request => request.kind === StateComponents.Changeset).at(-1)?.resource.toString(),
			});
			const before = readState();
			await harness.setWorkingSetEnabled(true);
			assert.deepStrictEqual({ before, after: readState() }, {
				before: { pill: `${expectedChangeset.label}: 1 File, +3, -1`, workingSet: undefined, registrations: 0, changeset: expectedChangeset.uriTemplate },
				after: { pill: `${expectedChangeset.label}: 1 File, +3, -1`, workingSet: undefined, registrations: 0, changeset: expectedChangeset.uriTemplate },
			});
		});
	}

	test('replaces the pill only while the host advertises Session changes', async () => {
		const session = upcastPartial<SessionState>({ provider: 'copilot', defaultChat: 'vendor-chat:/main', chats: [], changesets: [] });
		const harness = createActivityPills(session, upcastPartial<ChatState>({
			changesets: [{ label: 'Branch Changes', uriTemplate: 'vendor-diff:/branch', changeKind: ChangesetKind.Branch }],
			turns: [],
		}));
		harness.connection.setState(StateComponents.Changeset, upcastPartial<ChangesetState>({
			status: ChangesetStatus.Ready,
			files: [{ id: 'file', edit: { after: { uri: 'file:///repo/file.ts', content: { uri: 'snapshot:/file.ts' } }, diff: { added: 1, removed: 0 } } }],
		}));
		await harness.setWorkingSetEnabled(true);
		const readState = () => ({
			pill: !!harness.persistentContent.querySelector('.chat-changes-pill-button'),
			workingSet: harness.workingSetChanges()?.length,
			changeset: harness.connection.requested.filter(request => request.kind === StateComponents.Changeset).at(-1)?.resource.toString(),
		});
		const states = [readState()];
		harness.connection.setState(StateComponents.Session, {
			...session,
			changesets: [{ label: 'Session Changes', uriTemplate: 'vendor-diff:/session', changeKind: ChangesetKind.Session }],
		});
		states.push(readState());
		harness.connection.setState(StateComponents.Session, session);
		states.push(readState());
		assert.deepStrictEqual(states, [
			{ pill: true, workingSet: undefined, changeset: 'vendor-diff:/branch' },
			{ pill: false, workingSet: 1, changeset: 'vendor-diff:/session' },
			{ pill: true, workingSet: undefined, changeset: 'vendor-diff:/branch' },
		]);
	});

	function createNewSessionPills() {
		const creating = upcastPartial<SessionState>({ provider: 'copilotcli', lifecycle: SessionLifecycle.Creating, defaultChat: 'vendor-chat:/main', chats: [], changesets: [] });
		const harness = createActivityPills(creating, upcastPartial<ChatState>({
			changesets: [{ label: 'Uncommitted Changes', uriTemplate: 'vendor-diff:/uncommitted', changeKind: ChangesetKind.Uncommitted }],
			turns: [],
		}));
		harness.connection.setState(StateComponents.Changeset, upcastPartial<ChangesetState>({
			status: ChangesetStatus.Ready,
			files: [{ id: 'file', edit: { after: { uri: 'file:///repo/file.ts', content: { uri: 'snapshot:/file.ts' } }, diff: { added: 1, removed: 0 } } }],
		}));
		const readState = () => {
			const changesets = harness.connection.requested.filter(request => request.kind === StateComponents.Changeset).map(request => request.resource.toString());
			for (const released of harness.connection.released) {
				const index = changesets.indexOf(released.toString());
				if (index !== -1) {
					changesets.splice(index, 1);
				}
			}
			return {
				pill: !!harness.persistentContent.querySelector('.chat-changes-pill-button'),
				workingSet: harness.workingSetChanges()?.length,
				changesets,
			};
		};
		// Hosts mark the session ready before they replace the catalogue it had while being created.
		const ready: SessionState = { ...creating, lifecycle: SessionLifecycle.Ready };
		return { harness, readState, ready };
	}

	test('leaves out the Changes pill while a new session is created and becomes ready, until its working set takes over', () => runWithFakedTimers({}, async () => {
		const { harness, readState, ready } = createNewSessionPills();
		const states = [readState()];
		await harness.setWorkingSetEnabled(true);
		states.push(readState());
		harness.connection.setState(StateComponents.Session, ready);
		states.push(readState());
		harness.connection.setState(StateComponents.Session, {
			...ready,
			changesets: [
				{ label: 'Session Changes', uriTemplate: 'vendor-diff:/session', changeKind: ChangesetKind.Session },
				{ label: 'Working Set', uriTemplate: 'vendor-diff:/working-set', changeKind: ChangesetKind.WorkingSet },
			],
		});
		states.push(readState());
		await timeout(10_000);
		states.push(readState());
		assert.deepStrictEqual(states, [
			{ pill: true, workingSet: undefined, changesets: ['vendor-diff:/uncommitted'] },
			{ pill: false, workingSet: undefined, changesets: [] },
			{ pill: false, workingSet: undefined, changesets: [] },
			{ pill: false, workingSet: 1, changesets: ['vendor-diff:/working-set'] },
			{ pill: false, workingSet: 1, changesets: ['vendor-diff:/working-set'] },
		]);
	}));

	for (const replacesCatalogue of [false, true]) {
		test(`shows the Changes pill of a new session once it's ready on hosts without a working set (replaces catalogue: ${replacesCatalogue})`, () => runWithFakedTimers({}, async () => {
			const { harness, readState, ready } = createNewSessionPills();
			await harness.setWorkingSetEnabled(true);
			const states = [readState()];
			harness.connection.setState(StateComponents.Session, replacesCatalogue ? { ...ready, changesets: [] } : ready);
			states.push(readState());
			await timeout(10_000);
			states.push(readState());
			const pending = { pill: false, workingSet: undefined, changesets: [] };
			const shown = { pill: true, workingSet: undefined, changesets: ['vendor-diff:/uncommitted'] };
			assert.deepStrictEqual(states, [pending, replacesCatalogue ? shown : pending, shown]);
		}));
	}

	function createWorkingSetUndoPills(options?: { dialogService?: IDialogService; notificationService?: INotificationService; workingSetUndo?: boolean }) {
		const harness = createActivityPills(upcastPartial<SessionState>({
			provider: 'copilotcli',
			defaultChat: 'vendor-chat:/opaque/main',
			chats: [],
			changesets: [{ label: 'Session Changes', uriTemplate: 'vendor-diff:/opaque/session-changes', changeKind: ChangesetKind.Session }],
		}), upcastPartial<ChatState>({
			changesets: [{ label: 'Branch Changes', uriTemplate: 'vendor-diff:/opaque/branch-changes', changeKind: ChangesetKind.Branch }],
			turns: [],
		}), undefined, 'remote-test', undefined, undefined, { ...options, getUriLabel: labelService.getUriLabel, workingSetUndo: options?.workingSetUndo ?? true });
		const setOperations = (operations: ChangesetOperation[] | undefined, fileNames = ['file.ts']) => harness.connection.setState(StateComponents.Changeset, upcastPartial<ChangesetState>({
			status: ChangesetStatus.Ready,
			files: fileNames.map(fileName => ({
				id: fileName,
				edit: {
					before: { uri: `file:///repo/${fileName}`, content: { uri: `snapshot:/before/${fileName}` } },
					after: { uri: `file:///repo/${fileName}`, content: { uri: `snapshot:/after/${fileName}` } },
					diff: { added: 2, removed: 1 },
				},
			})),
			operations,
		}));
		/** Sets the files of Session Changes, each with the snapshot its latest edit left. */
		const setFiles = (files: readonly (readonly [fileName: string, snapshot: string])[], status = ChangesetStatus.Ready) => harness.connection.setState(StateComponents.Changeset, upcastPartial<ChangesetState>({
			status,
			files: files.map(([fileName, snapshot]) => ({
				id: fileName,
				edit: {
					before: { uri: `file:///repo/${fileName}`, content: { uri: `snapshot:/before/${fileName}` } },
					after: { uri: `file:///repo/${fileName}`, content: { uri: `snapshot:/${snapshot}/${fileName}` } },
					diff: { added: 2, removed: 1 },
				},
			})),
			operations: [discardChanges(ChangesetOperationStatus.Idle)],
		}));
		return { harness, setOperations, setFiles };
	}

	const discardChanges = (status: ChangesetOperationStatus, scopes = [ChangesetOperationScope.Resource]): ChangesetOperation => ({
		id: 'discard-changes',
		label: 'Discard Changes',
		confirmation: 'Discard the session\'s changes to \'{0}\'?',
		scopes,
		status,
	});

	test('does not offer working-set Undo while it is switched off, even when the host can discard changes', async () => {
		const { harness, setOperations } = createWorkingSetUndoPills({ workingSetUndo: false });
		setOperations([discardChanges(ChangesetOperationStatus.Idle)]);
		await harness.setWorkingSetEnabled(true);
		assert.deepStrictEqual({
			files: harness.workingSetChanges()?.map(diff => basename(diff.modifiedURI)),
			undo: harness.workingSetUndo(),
		}, {
			files: ['file.ts'],
			undo: undefined,
		});
	});

	test('offers working-set Undo only while the host advertises file-level Discard Changes for Session changes', async () => {
		const { harness, setOperations } = createWorkingSetUndoPills();
		setOperations(undefined);
		await harness.setWorkingSetEnabled(true);
		const readState = () => harness.workingSetUndo()?.enabled.get();
		const states = [readState()];
		for (const operations of [
			[discardChanges(ChangesetOperationStatus.Idle)],
			[discardChanges(ChangesetOperationStatus.Running)],
			[discardChanges(ChangesetOperationStatus.Disabled)],
			[discardChanges(ChangesetOperationStatus.Error)],
			[discardChanges(ChangesetOperationStatus.Idle, [ChangesetOperationScope.Changeset])],
			[{ ...discardChanges(ChangesetOperationStatus.Idle), id: 'commit' }],
		]) {
			setOperations(operations);
			states.push(readState());
		}
		await harness.setWorkingSetEnabled(false);
		setOperations([discardChanges(ChangesetOperationStatus.Idle)]);
		states.push(readState());

		assert.deepStrictEqual(states, [undefined, true, false, false, true, undefined, undefined, undefined]);
	});

	test('undoes a working-set file with the host operation after its confirmation', async () => {
		const confirmations: { readonly message: string; readonly primaryButton: string | undefined }[] = [];
		const errors: string[] = [];
		let confirmed = false;
		const { harness, setOperations } = createWorkingSetUndoPills({
			dialogService: upcastPartial<IDialogService>({
				confirm: async confirmation => {
					confirmations.push({ message: confirmation.message, primaryButton: confirmation.primaryButton });
					return { confirmed };
				},
			}),
			notificationService: upcastPartial<INotificationService>({ error: message => { errors.push(String(message)); } }),
		});
		setOperations([discardChanges(ChangesetOperationStatus.Idle)]);
		await harness.setWorkingSetEnabled(true);
		const undo = harness.workingSetUndo();
		const [diff] = harness.workingSetChanges() ?? [];
		assert.ok(undo && diff);
		const results = [await undo.undo([diff], false)];
		confirmed = true;
		results.push(await undo.undo([diff], false));
		harness.connection.invokeChangesetOperationError = () => new Error('The file changed.');
		results.push(await undo.undo([diff], false));

		const invoked = { channel: 'vendor-diff:/opaque/session-changes', operationId: 'discard-changes', target: { kind: ChangesetOperationTargetKind.Resource, resource: 'file:///repo/file.ts' } };
		assert.deepStrictEqual({ results, confirmations, invoked: harness.connection.invokedChangesetOperations, errors }, {
			results: [false, true, false],
			confirmations: Array.from({ length: 3 }, () => ({ message: 'Discard the session\'s changes to \'file.ts\'?', primaryButton: 'Discard Changes' })),
			invoked: [invoked, invoked],
			errors: ['Could not undo changes to file.ts: The file changed.'],
		});
	});

	test('undoes every working-set file after one confirmation and reports the files it could not undo together', async () => {
		const confirmations: { readonly message: string; readonly detail: IConfirmation['detail'] }[] = [];
		const errors: string[] = [];
		const { harness, setOperations } = createWorkingSetUndoPills({
			dialogService: upcastPartial<IDialogService>({
				confirm: async confirmation => {
					confirmations.push({ message: confirmation.message, detail: confirmation.detail });
					return { confirmed: true };
				},
			}),
			notificationService: upcastPartial<INotificationService>({ error: message => { errors.push(String(message)); } }),
		});
		setOperations([discardChanges(ChangesetOperationStatus.Idle)], ['a.ts', 'b.ts', 'c.ts']);
		await harness.setWorkingSetEnabled(true);
		const undo = harness.workingSetUndo();
		const diffs = harness.workingSetChanges() ?? [];
		assert.ok(undo);
		harness.connection.invokeChangesetOperationError = params => params.target?.resource === 'file:///repo/a.ts' ? undefined : new Error(`${basename(URI.parse(params.target!.resource))} changed.`);
		const someUndone = await undo.undo(diffs, true);
		harness.connection.invokeChangesetOperationError = () => new Error('The turn is running.');
		const noneUndone = await undo.undo(diffs, true);

		assert.deepStrictEqual({
			results: [someUndone, noneUndone],
			confirmations,
			invoked: harness.connection.invokedChangesetOperations.map(params => params.target?.resource),
			errors,
		}, {
			results: [true, false],
			// The host's confirmation names one file, so several are counted there and listed in the detail.
			confirmations: Array.from({ length: 2 }, () => ({ message: 'Discard the session\'s changes to \'3 files\'?', detail: 'a.ts\nb.ts\nc.ts\n' })),
			invoked: Array.from({ length: 2 }, () => ['file:///repo/a.ts', 'file:///repo/b.ts', 'file:///repo/c.ts']).flat(),
			errors: [
				'Could not undo changes to b.ts, c.ts: b.ts changed. c.ts changed.',
				'Could not undo changes to a.ts, b.ts, c.ts: The turn is running.',
			],
		});
	});

	test('leaves alone the files whose changes differ from the confirmed ones when undoing every file', async () => {
		const errors: string[] = [];
		const { harness, setOperations, setFiles } = createWorkingSetUndoPills({
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
			notificationService: upcastPartial<INotificationService>({ error: message => { errors.push(String(message)); } }),
		});
		setOperations([discardChanges(ChangesetOperationStatus.Idle)], ['a.ts', 'b.ts', 'c.ts']);
		await harness.setWorkingSetEnabled(true);
		const undo = harness.workingSetUndo();
		const diffs = harness.workingSetChanges() ?? [];
		assert.ok(undo);
		harness.connection.invokeChangesetOperationError = params => {
			if (params.target?.resource === 'file:///repo/a.ts') {
				// While a.ts is undone, a turn edits c.ts again and the session's changes to b.ts go away.
				setFiles([['a.ts', 'after'], ['c.ts', 'edited']]);
			}
			return undefined;
		};
		const result = await undo.undo(diffs, true);

		assert.deepStrictEqual({
			result,
			invoked: harness.connection.invokedChangesetOperations.map(params => params.target?.resource),
			errors,
		}, {
			result: true,
			invoked: ['file:///repo/a.ts'],
			errors: ['Could not undo changes to c.ts: \'c.ts\' changed after the undo was confirmed.'],
		});
	});

	test('checks each file it undoes only once Session Changes finish updating', async () => {
		const errors: string[] = [];
		let onConfirm = () => { };
		const { harness, setOperations, setFiles } = createWorkingSetUndoPills({
			dialogService: upcastPartial<IDialogService>({
				confirm: async () => {
					onConfirm();
					return { confirmed: true };
				},
			}),
			notificationService: upcastPartial<INotificationService>({ error: message => { errors.push(String(message)); } }),
		});
		setOperations([discardChanges(ChangesetOperationStatus.Idle)], ['a.ts', 'b.ts', 'c.ts']);
		await harness.setWorkingSetEnabled(true);
		const undo = harness.workingSetUndo();
		const diffs = harness.workingSetChanges() ?? [];
		assert.ok(undo);
		// While the confirmation is open, a turn edits b.ts; until Session Changes update, they still show its old snapshot.
		onConfirm = () => setFiles([['a.ts', 'after'], ['b.ts', 'after'], ['c.ts', 'after']], ChangesetStatus.Recomputing);
		harness.connection.invokeChangesetOperationError = params => {
			if (params.target?.resource === 'file:///repo/a.ts') {
				// Undoing a.ts updates Session Changes again, while another turn edits c.ts.
				setFiles([['b.ts', 'edited'], ['c.ts', 'after']], ChangesetStatus.Recomputing);
			}
			return undefined;
		};
		const undoing = undo.undo(diffs, true);
		await timeout(0);
		const invokedWhileUpdating = [harness.connection.invokedChangesetOperations.length];
		setFiles([['a.ts', 'after'], ['b.ts', 'edited'], ['c.ts', 'after']]);
		await timeout(0);
		invokedWhileUpdating.push(harness.connection.invokedChangesetOperations.length);
		setFiles([['b.ts', 'edited'], ['c.ts', 'edited']]);
		const result = await undoing;

		assert.deepStrictEqual({
			invokedWhileUpdating,
			result,
			invoked: harness.connection.invokedChangesetOperations.map(params => params.target?.resource),
			errors,
		}, {
			invokedWhileUpdating: [0, 1],
			result: true,
			invoked: ['file:///repo/a.ts'],
			errors: ['Could not undo changes to b.ts, c.ts: \'b.ts\' changed after the undo was confirmed. \'c.ts\' changed after the undo was confirmed.'],
		});
	});

	test('keeps Undo available for other Session Changes while an undo runs', async () => {
		const { harness, setOperations } = createWorkingSetUndoPills({
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
		});
		setOperations([discardChanges(ChangesetOperationStatus.Idle)]);
		await harness.setWorkingSetEnabled(true);
		const undo = harness.workingSetUndo();
		const [diff] = harness.workingSetChanges() ?? [];
		assert.ok(undo && diff);
		const invocation = new DeferredPromise<void>();
		harness.connection.invokeChangesetOperation = async () => {
			await invocation.p;
			return {};
		};
		const undoing = undo.undo([diff], false);
		await timeout(0);
		const states = [harness.workingSetUndo()?.enabled.get()];
		// Another session's changes come from another channel.
		harness.connection.setState(StateComponents.Session, upcastPartial<SessionState>({
			provider: 'copilotcli',
			defaultChat: 'vendor-chat:/opaque/main',
			chats: [],
			changesets: [{ label: 'Session Changes', uriTemplate: 'vendor-diff:/opaque/other-session-changes', changeKind: ChangesetKind.Session }],
		}));
		states.push(harness.workingSetUndo()?.enabled.get());
		invocation.complete();
		states.push(await undoing);

		assert.deepStrictEqual(states, [false, true, true]);
	});

	test('keeps the working set\'s changes when only the status or operations of Session Changes change', async () => {
		const { harness } = createWorkingSetUndoPills();
		const files: ChangesetState['files'] = [{
			id: 'file.ts',
			edit: {
				after: { uri: 'file:///repo/file.ts', content: { uri: 'snapshot:/after/file.ts' } },
				diff: { added: 2, removed: 1 },
			},
		}];
		const setState = (status: ChangesetStatus, operationStatus: ChangesetOperationStatus, changesetFiles = files) => harness.connection.setState(StateComponents.Changeset, upcastPartial<ChangesetState>({
			status,
			files: changesetFiles,
			operations: [discardChanges(operationStatus)],
		}));
		setState(ChangesetStatus.Ready, ChangesetOperationStatus.Idle);
		await harness.setWorkingSetEnabled(true);
		const initial = harness.workingSetChanges();
		setState(ChangesetStatus.Ready, ChangesetOperationStatus.Running);
		setState(ChangesetStatus.Recomputing, ChangesetOperationStatus.Disabled);
		const afterStatusChanges = harness.workingSetChanges();
		setState(ChangesetStatus.Ready, ChangesetOperationStatus.Idle, [...files]);

		assert.deepStrictEqual({
			files: initial?.map(diff => basename(diff.modifiedURI)),
			keptAcrossStatusChanges: afterStatusChanges === initial,
			rebuiltForNewFiles: harness.workingSetChanges() !== initial,
		}, {
			files: ['file.ts'],
			keptAcrossStatusChanges: true,
			rebuiltForNewFiles: true,
		});
	});

	function createSessionWorkingSetPills() {
		const errors: string[] = [];
		const confirmations: Pick<IConfirmation, 'title' | 'message' | 'primaryButton' | 'type'>[] = [];
		let confirmed = false;
		const session = upcastPartial<SessionState>({
			provider: 'copilotcli',
			defaultChat: 'vendor-chat:/opaque/main',
			chats: [],
			changesets: [
				{ label: 'Session Changes', uriTemplate: 'vendor-diff:/opaque/session-changes', changeKind: ChangesetKind.Session },
				{ label: 'Working Set', uriTemplate: 'vendor-diff:/opaque/working-set', changeKind: ChangesetKind.WorkingSet },
			],
		});
		const harness = createActivityPills(session, upcastPartial<ChatState>({
			changesets: [{ label: 'Branch Changes', uriTemplate: 'vendor-diff:/opaque/branch-changes', changeKind: ChangesetKind.Branch }],
			turns: [],
		}), undefined, 'remote-test', undefined, undefined, {
			getUriLabel: labelService.getUriLabel,
			dialogService: upcastPartial<IDialogService>({
				confirm: async ({ title, message, primaryButton, type }) => {
					confirmations.push({ title, message, primaryButton, type });
					return { confirmed };
				},
			}),
			notificationService: upcastPartial<INotificationService>({ error: message => { errors.push(String(message)); } }),
		});
		const setOperations = (operations: ChangesetOperation[], nonce?: string) => harness.connection.setState(StateComponents.Changeset, upcastPartial<ChangesetState>({
			status: ChangesetStatus.Ready,
			files: [{
				id: 'file.ts',
				...(nonce !== undefined ? { nonce } : {}),
				edit: {
					before: { uri: 'file:///repo/file.ts', content: { uri: 'snapshot:/before/file.ts' } },
					after: { uri: 'file:///repo/file.ts', content: { uri: 'snapshot:/after/file.ts' } },
					diff: { added: 2, removed: 1 },
				},
			}],
			operations,
		}));
		const readState = () => ({
			changeset: harness.connection.requested.filter(request => request.kind === StateComponents.Changeset).at(-1)?.resource.toString(),
			files: harness.workingSetChanges()?.map(diff => basename(diff.modifiedURI)),
			keep: harness.workingSetKeep()?.enabled.get(),
			undo: harness.workingSetUndo()?.enabled.get(),
		});
		const readInvoked = () => harness.connection.invokedChangesetOperations.map(params => `${params.operationId} ${params.channel} ${params.target?.resource}`);
		return { harness, session, errors, confirmations, setConfirmed: (value: boolean) => { confirmed = value; }, setOperations, readState, readInvoked };
	}

	const acceptChanges = (status: ChangesetOperationStatus, confirmation?: string): ChangesetOperation => ({ id: 'accept-changes', label: 'Accept Changes', scopes: [ChangesetOperationScope.Resource], status, ...(confirmation ? { confirmation } : {}) });
	// Like undoing a file in the editing session's working set, the host doesn't ask to confirm discarding a Working Set file.
	const discardWorkingSetChanges = (status: ChangesetOperationStatus): ChangesetOperation => ({ id: 'discard-changes', label: 'Discard Changes', scopes: [ChangesetOperationScope.Resource], status });

	for (const nonce of [undefined, 'opaque-file-nonce']) {
		test(`echoes an optional file nonce for working-set Keep and Undo (nonce=${nonce})`, async () => {
			const { harness, setOperations, errors } = createSessionWorkingSetPills();
			setOperations([acceptChanges(ChangesetOperationStatus.Idle), discardWorkingSetChanges(ChangesetOperationStatus.Idle)], nonce);
			await harness.setWorkingSetEnabled(true);
			const keep = harness.workingSetKeep();
			const undo = harness.workingSetUndo();
			const [diff] = harness.workingSetChanges() ?? [];
			assert.ok(keep && undo && diff);
			const results = [await keep.keep([diff], false), await undo.undo([diff], false)];

			assert.deepStrictEqual({ results, requests: harness.connection.invokedChangesetOperations, errors }, {
				results: [true, true],
				requests: ['accept-changes', 'discard-changes'].map(operationId => ({
					channel: 'vendor-diff:/opaque/working-set',
					operationId,
					target: { kind: ChangesetOperationTargetKind.Resource, resource: 'file:///repo/file.ts', ...(nonce !== undefined ? { nonce } : {}) },
				})),
				errors: [],
			});
		});
	}

	test('does not replace a displayed nonce with a newer one on unchanged content URIs', async () => {
		const { harness, setOperations, errors } = createSessionWorkingSetPills();
		setOperations([acceptChanges(ChangesetOperationStatus.Idle)], 'first');
		await harness.setWorkingSetEnabled(true);
		const keep = harness.workingSetKeep();
		const [before] = harness.workingSetChanges() ?? [];
		assert.ok(keep && before);
		setOperations([acceptChanges(ChangesetOperationStatus.Idle)], 'second');
		const [after] = harness.workingSetChanges() ?? [];
		assert.ok(after);
		const results = [await keep.keep([before], false), await keep.keep([after], false)];

		assert.deepStrictEqual({ results, nonces: harness.connection.invokedChangesetOperations.map(params => params.target?.nonce), errors: errors.length }, {
			results: [false, true], nonces: ['second'], errors: 1,
		});
	});

	test('shows the session\'s Working Set instead of Session Changes, keeping and undoing its files with the host operations', async () => {
		const { harness, session, errors, confirmations, setConfirmed, setOperations, readState, readInvoked } = createSessionWorkingSetPills();
		setOperations([acceptChanges(ChangesetOperationStatus.Idle), discardWorkingSetChanges(ChangesetOperationStatus.Idle)]);
		await harness.setWorkingSetEnabled(true);
		const idle = readState();
		const keep = harness.workingSetKeep();
		const undo = harness.workingSetUndo();
		const [diff] = harness.workingSetChanges() ?? [];
		assert.ok(keep && undo && diff);
		// Undoing a file isn't confirmed; undoing all files is, like Undo All Edits in the editing session's working set.
		const results = [await keep.keep([diff], false), await undo.undo([diff], false), await undo.undo([diff], true)];
		setConfirmed(true);
		results.push(await undo.undo([diff], true));
		setOperations([acceptChanges(ChangesetOperationStatus.Disabled), discardWorkingSetChanges(ChangesetOperationStatus.Disabled)]);
		const whileTurnRuns = readState();
		// Without Accept Changes, Keep is disabled rather than hiding files in the workbench, which the host wouldn't know about.
		setOperations([discardWorkingSetChanges(ChangesetOperationStatus.Idle)]);
		const withoutAcceptChanges = readState();
		// Hosts without a Working Set show Session Changes, whose changes the workbench keeps.
		harness.connection.setState(StateComponents.Session, { ...session, changesets: [session.changesets![0]] });

		const undoAllConfirmation = { title: 'Undo all edits?', message: 'This will undo changes made in file.ts. Do you want to proceed?', primaryButton: 'Yes', type: 'info' as const };
		assert.deepStrictEqual({
			idle,
			results,
			confirmations,
			invoked: readInvoked(),
			whileTurnRuns,
			withoutAcceptChanges,
			withoutWorkingSet: readState(),
			errors,
		}, {
			idle: { changeset: 'vendor-diff:/opaque/working-set', files: ['file.ts'], keep: true, undo: true },
			results: [true, true, false, true],
			confirmations: [undoAllConfirmation, undoAllConfirmation],
			invoked: [
				'accept-changes vendor-diff:/opaque/working-set file:///repo/file.ts',
				'discard-changes vendor-diff:/opaque/working-set file:///repo/file.ts',
				'discard-changes vendor-diff:/opaque/working-set file:///repo/file.ts',
			],
			whileTurnRuns: { changeset: 'vendor-diff:/opaque/working-set', files: ['file.ts'], keep: false, undo: false },
			withoutAcceptChanges: { changeset: 'vendor-diff:/opaque/working-set', files: ['file.ts'], keep: false, undo: true },
			withoutWorkingSet: { changeset: 'vendor-diff:/opaque/session-changes', files: ['file.ts'], keep: undefined, undo: undefined },
			errors: [],
		});
	});

	test('keeps Working Set files only after the host\'s confirmation, when it has one', async () => {
		const { harness, errors, confirmations, setConfirmed, setOperations, readInvoked } = createSessionWorkingSetPills();
		setOperations([acceptChanges(ChangesetOperationStatus.Idle, 'Accept the changes to \'{0}\'?'), discardWorkingSetChanges(ChangesetOperationStatus.Idle)]);
		await harness.setWorkingSetEnabled(true);
		const keep = harness.workingSetKeep();
		const [diff] = harness.workingSetChanges() ?? [];
		assert.ok(keep && diff);
		const results = [await keep.keep([diff], false)];
		setConfirmed(true);
		results.push(await keep.keep([diff], false));
		// Changes accepted outside of the working set, as by staging them with Git, aren't confirmed, so they're left alone.
		results.push(await keep.keep([diff], true));

		const acceptConfirmation = { title: undefined, message: 'Accept the changes to \'file.ts\'?', primaryButton: 'Accept Changes', type: 'warning' as const };
		assert.deepStrictEqual({ results, confirmations, invoked: readInvoked(), errors }, {
			results: [false, true, false],
			confirmations: [acceptConfirmation, acceptConfirmation],
			invoked: ['accept-changes vendor-diff:/opaque/working-set file:///repo/file.ts'],
			errors: [],
		});
	});

	test('keeps changes staged with Git after a Keep in progress, but not while the host can\'t accept them', async () => {
		const { harness, errors, readInvoked } = createSessionWorkingSetPills();
		const file = (name: string) => ({
			id: name,
			edit: {
				before: { uri: `file:///repo/${name}`, content: { uri: `snapshot:/before/${name}` } },
				after: { uri: `file:///repo/${name}`, content: { uri: `snapshot:/after/${name}` } },
				diff: { added: 2, removed: 1 },
			},
		});
		const setFiles = (status: ChangesetOperationStatus) => harness.connection.setState(StateComponents.Changeset, upcastPartial<ChangesetState>({
			status: ChangesetStatus.Ready,
			files: [file('a.ts'), file('b.ts')],
			operations: [acceptChanges(status), discardWorkingSetChanges(status)],
		}));
		setFiles(ChangesetOperationStatus.Idle);
		await harness.setWorkingSetEnabled(true);
		const keep = harness.workingSetKeep();
		const [a, b] = harness.workingSetChanges() ?? [];
		assert.ok(keep && a && b);
		const firstAccepted = new DeferredPromise<void>();
		const invoke = harness.connection.invokeChangesetOperation.bind(harness.connection);
		harness.connection.invokeChangesetOperation = async params => {
			const result = await invoke(params);
			if (params.target?.resource === 'file:///repo/a.ts') {
				await firstAccepted.p;
			}
			return result;
		};

		const keepA = keep.keep([a], false);
		await timeout(0);
		const enabledWhileKeeping = keep.enabled.get();
		// Staging `b` with Git while `a` is being kept waits for it, rather than being dropped like a disabled Keep.
		const keepB = keep.keep([b], true);
		await timeout(0);
		const invokedWhileKeeping = readInvoked();
		await firstAccepted.complete();
		const results = [await keepA, await keepB];
		const invokedAfterwards = readInvoked();
		// While a turn runs, the host can't accept changes, so changes staged with Git are left alone.
		setFiles(ChangesetOperationStatus.Disabled);
		results.push(await keep.keep([a], true));

		assert.deepStrictEqual({ enabledWhileKeeping, invokedWhileKeeping, invokedAfterwards, results, invoked: readInvoked(), errors }, {
			enabledWhileKeeping: false,
			invokedWhileKeeping: ['accept-changes vendor-diff:/opaque/working-set file:///repo/a.ts'],
			invokedAfterwards: [
				'accept-changes vendor-diff:/opaque/working-set file:///repo/a.ts',
				'accept-changes vendor-diff:/opaque/working-set file:///repo/b.ts',
			],
			results: [true, true, false],
			invoked: invokedAfterwards,
			errors: [],
		});
	});

	for (const provider of ['copilot', 'copilotcli', 'claude', 'codex', 'other', undefined]) {
		for (const connectionAuthority of ['local', 'remote-test']) {
			test(`only replaces the Changes pill for Copilot (${provider}, ${connectionAuthority})`, async () => {
				const branchChanges = 'vendor-diff:/branch';
				const sessionChanges = 'vendor-diff:/session';
				const harness = createActivityPills(upcastPartial<SessionState>({
					provider,
					defaultChat: 'vendor-chat:/main',
					chats: [],
					changesets: [{ label: 'Session Changes', uriTemplate: sessionChanges, changeKind: ChangesetKind.Session }],
				}), upcastPartial<ChatState>({
					changesets: [{ label: 'Branch Changes', uriTemplate: branchChanges, changeKind: ChangesetKind.Branch }],
					turns: [],
				}), undefined, connectionAuthority, undefined, undefined, { defaultChangesetKind: ChangesetKind.Branch });
				harness.connection.setState(StateComponents.Changeset, upcastPartial<ChangesetState>({
					status: ChangesetStatus.Ready,
					files: [{
						id: 'file',
						edit: {
							before: { uri: 'file:///repo/file.ts', content: { uri: 'snapshot:/before/file.ts' } },
							after: { uri: 'file:///repo/file.ts', content: { uri: 'snapshot:/after/file.ts' } },
							diff: { added: 2, removed: 1 },
						},
					}],
				}));
				await harness.setWorkingSetEnabled(true);
				const copilot = provider === 'copilot' || provider === 'copilotcli';
				assert.deepStrictEqual({
					pill: !!harness.persistentContent.querySelector('.chat-changes-pill-button'),
					workingSet: harness.workingSetChanges()?.length,
					registrations: harness.workingSetRegistrations(),
					changeset: harness.connection.requested.filter(request => request.kind === StateComponents.Changeset).at(-1)?.resource.toString(),
				}, {
					pill: !copilot,
					workingSet: copilot ? 1 : undefined,
					registrations: copilot ? 1 : 0,
					changeset: copilot ? sessionChanges : branchChanges,
				});
			});
		}
	}

	test('updates eligibility when provider metadata arrives and when switching to Local', async () => {
		const session = upcastPartial<SessionState>({
			defaultChat: 'vendor-chat:/main',
			chats: [],
			changesets: [{ label: 'Session Changes', uriTemplate: 'vendor-diff:/session', changeKind: ChangesetKind.Session }],
		});
		const harness = createActivityPills(session, upcastPartial<ChatState>({ changesets: [], turns: [] }));
		harness.connection.setState(StateComponents.Changeset, upcastPartial<ChangesetState>({
			status: ChangesetStatus.Ready,
			files: [{
				id: 'file',
				edit: {
					after: { uri: 'file:///repo/file.ts', content: { uri: 'snapshot:/file.ts' } },
					diff: { added: 1, removed: 0 },
				},
			}],
		}));
		await harness.setWorkingSetEnabled(true);
		const readState = () => ({
			pill: !!harness.persistentContent.querySelector('.chat-changes-pill-button'),
			workingSet: harness.workingSetChanges()?.length,
		});
		const states = [readState()];
		harness.connection.setState(StateComponents.Session, { ...session, provider: 'copilot' });
		states.push(readState());
		harness.showSession(LocalChatSessionUri.forSession('local'));
		states.push(readState());
		harness.showSession(harness.sessionResource);
		states.push(readState());
		harness.connection.setState(StateComponents.Session, { ...session, provider: 'claude' });
		states.push(readState());
		assert.deepStrictEqual(states, [
			{ pill: true, workingSet: undefined },
			{ pill: false, workingSet: 1 },
			{ pill: false, workingSet: undefined },
			{ pill: false, workingSet: 1 },
			{ pill: true, workingSet: undefined },
		]);
	});

	test('includes browsers owned by direct tool-origin child chats', () => {
		const sessionResource = URI.parse('vscode-chat-session://agent-host/session');
		const backendSession = URI.parse('ahp-session://host/session');
		const parentChat = buildDefaultChatUri(backendSession);
		const childChat = buildSubagentChatUri(backendSession, 'tool-1');
		const unrelatedChildChat = buildSubagentChatUri(backendSession, 'tool-2');
		const childChatId = 'subagent/tool-1';
		const stateWithoutChild = {
			defaultChat: parentChat,
			chats: [],
		} as unknown as SessionState;
		const stateWithChild = {
			defaultChat: parentChat,
			chats: [{
				resource: childChat,
				origin: { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId: 'tool-1' },
			}, {
				resource: unrelatedChildChat,
				origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(URI.parse('ahp-session://host/other')), toolCallId: 'tool-2' },
			}],
		} as unknown as SessionState;
		const explicitQuery = new URLSearchParams();
		explicitQuery.set(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, childChat);
		const canonicalChildResource = sessionResource.with({ fragment: childChatId, query: null });
		const explicitChildResource = sessionResource.with({ fragment: childChatId, query: explicitQuery.toString() });
		const opaqueChildResource = sessionResource.with({ fragment: childChat, query: explicitQuery.toString() });

		const before = getAgentHostSessionBrowserOwnerIds(sessionResource, stateWithoutChild, stateWithoutChild.defaultChat);
		const after = getAgentHostSessionBrowserOwnerIds(sessionResource, stateWithChild, stateWithChild.defaultChat);

		assert.deepStrictEqual({
			before: [...before],
			after: [...after],
			hasCanonicalChild: after.has(canonicalChildResource.toString()),
			hasExplicitChild: after.has(explicitChildResource.toString()),
			hasUnrelatedChild: after.has(sessionResource.with({ fragment: 'subagent/tool-2', query: null }).toString()),
		}, {
			before: [sessionResource.toString()],
			after: [
				sessionResource.toString(),
				opaqueChildResource.toString(),
				canonicalChildResource.toString(),
				explicitChildResource.toString(),
			],
			hasCanonicalChild: true,
			hasExplicitChild: true,
			hasUnrelatedChild: false,
		});
	});

	test('includes browsers owned by opaque tool-origin chat URIs', () => {
		const sessionResource = URI.parse('remote-server-agent:/session');
		const parentChat = 'vendor-chat:/conversations/main';
		const childChat = 'vendor-chat:/workers/Waiting?revision=1#result';
		const query = new URLSearchParams({ [CHAT_SUBAGENT_RESOURCE_QUERY_PARAM]: childChat });
		const state = upcastPartial<SessionState>({
			defaultChat: parentChat,
			chats: [upcastPartial<ChatSummary>({
				resource: childChat,
				origin: { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId: 'delegate' },
			})],
		});

		assert.deepStrictEqual([...getAgentHostSessionBrowserOwnerIds(sessionResource, state, state.defaultChat)], [
			sessionResource.toString(),
			sessionResource.with({ fragment: childChat, query: query.toString() }).toString(),
			sessionResource.with({ fragment: childChat }).toString(),
		]);
	});

	test('does not render pills for a Local chat input', () => {
		const instantiationService = createInstantiationService();
		const sessionResource = URI.parse('vscode-chat-session://local/session');
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		let persistentContentHeight: number | undefined;
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<ChatViewModel>({ sessionResource }),
			setPersistentContentHeight: height => persistentContentHeight = height,
		});
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: Event.None,
			onDidChangeSessionResolution: Event.None,
			connections: [],
			resolveSessionResource: () => undefined,
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const [clipboardService, configurationService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
			accessor.get(IOpenerService),
		] as const);

		store.add(new AgentHostSessionInputPills(
			widget,
			false,
			connectionsService,
			browserViewService,
			clipboardService,
			configurationService,
			editorService,
			instantiationService,
			openerService,
			visibility,
			noProvisionalSessions,
			labelService,
			notificationService,
			instantiationService.get(ICommandService),
			instantiationService.get(IDialogService),
		));
		const row = persistentContent.querySelector<HTMLElement>('.agent-host-session-input-pills');

		assert.deepStrictEqual({
			hidden: row?.classList.contains('hidden'),
			pillCount: row?.querySelectorAll('.chat-pill-item').length,
			persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
			persistentContentHeight,
		}, {
			hidden: true,
			pillCount: 0,
			persistentContentVisible: false,
			persistentContentHeight: undefined,
		});
	});

	test('uses cached recomputing files in floating persistent content from a legacy session catalogue', () => {
		const instantiationService = createInstantiationService();
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const backendChat = URI.parse(buildDefaultChatUri(backendSession));
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChatState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: backendChat.toString(),
				chats: [],
				changesets: [{ label: 'Branch Changes', uriTemplate: 'changeset/branch', changeKind: ChangesetKind.Branch }],
			} as unknown as SessionState],
			[StateComponents.Chat, {} as ChatState],
			[StateComponents.Changeset, {
				status: ChangesetStatus.Computing,
				files: [],
			} as unknown as ChangesetState],
		]));
		const cachedFiles: ChangesetState['files'] = [{
			id: 'change',
			edit: {
				after: { uri: URI.file('/changed.ts').toString(), content: { uri: 'git-blob://after' } },
				diff: { added: 3, removed: 1 },
			},
		}];
		const otherConnection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChatState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: backendChat.toString(),
				chats: [],
				changesets: [{ label: 'Branch Changes', uriTemplate: 'changeset/branch', changeKind: ChangesetKind.Branch }],
			} as unknown as SessionState],
			[StateComponents.Chat, {} as ChatState],
			[StateComponents.Changeset, {
				status: ChangesetStatus.Computing,
				files: [],
			} as unknown as ChangesetState],
		]));
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		let persistentContentHeight: number | undefined;
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<ChatViewModel>({ sessionResource }),
			setPersistentContentHeight: height => persistentContentHeight = height,
		});
		const resolutionChanged = new Emitter<void>();
		let currentConnection = connection;
		let connectionAuthority = 'local';
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: Event.None,
			onDidChangeSessionResolution: resolutionChanged.event,
			connections: [],
			resolveSessionResource: () => ({
				connection: currentConnection,
				connectionAuthority,
				backendSession,
				defaultChangesetKind: ChangesetKind.Branch,
			}),
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const [clipboardService, configurationService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
			accessor.get(IOpenerService),
		] as const);

		store.add(new AgentHostSessionInputPills(
			widget,
			false,
			connectionsService,
			browserViewService,
			clipboardService,
			configurationService,
			editorService,
			instantiationService,
			openerService,
			visibility,
			noProvisionalSessions,
			labelService,
			notificationService,
			instantiationService.get(ICommandService),
			instantiationService.get(IDialogService),
		));
		const row = persistentContent.querySelector<HTMLElement>('.agent-host-session-input-pills');
		const initial = {
			hidden: row?.classList.contains('hidden'),
			persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
			persistentContentHeight,
		};
		connection.setState(StateComponents.Changeset, {
			status: ChangesetStatus.Recomputing,
			files: cachedFiles,
		} as ChangesetState);
		const button = row?.querySelector('.chat-pill-button');
		const recomputing = {
			hidden: row?.classList.contains('hidden'),
			label: row?.querySelector('.changes-stats-files')?.textContent,
			persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
			persistentContentHeight,
		};
		connection.setState(StateComponents.Changeset, {
			status: ChangesetStatus.Computing,
			files: [],
		} as ChangesetState);
		const computing = {
			hidden: row?.classList.contains('hidden'),
			buttonPreserved: row?.querySelector('.chat-pill-button') === button,
			persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
			persistentContentHeight,
		};
		connection.setState(StateComponents.Changeset, {
			status: ChangesetStatus.Ready,
			files: [],
		} as ChangesetState);
		const readyEmpty = {
			hidden: row?.classList.contains('hidden'),
			persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
			persistentContentHeight,
		};
		connection.setState(StateComponents.Changeset, {
			status: ChangesetStatus.Ready,
			files: cachedFiles,
		} as ChangesetState);
		connection.setState(StateComponents.Changeset, {
			status: ChangesetStatus.Computing,
			files: [],
		} as ChangesetState);
		currentConnection = otherConnection;
		connectionAuthority = 'remote';
		resolutionChanged.fire();

		assert.deepStrictEqual({
			initial,
			recomputing,
			computing,
			readyEmpty,
			otherConnection: {
				hidden: row?.classList.contains('hidden'),
				persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
				persistentContentHeight,
			},
			subscriptions: [...new Map(connection.requested.map(request => {
				const value = { kind: request.kind, resource: request.resource.toString() };
				return [`${value.kind}:${value.resource}`, value];
			})).values()],
		}, {
			initial: {
				hidden: true,
				persistentContentVisible: false,
				persistentContentHeight: undefined,
			},
			recomputing: {
				hidden: false,
				label: '1 File',
				persistentContentVisible: true,
				persistentContentHeight: 28,
			},
			computing: {
				hidden: false,
				buttonPreserved: true,
				persistentContentVisible: true,
				persistentContentHeight: 28,
			},
			readyEmpty: {
				hidden: true,
				persistentContentVisible: false,
				persistentContentHeight: undefined,
			},
			otherConnection: {
				hidden: true,
				persistentContentVisible: false,
				persistentContentHeight: undefined,
			},
			subscriptions: [{
				kind: StateComponents.Session,
				resource: 'copilot:/session',
			}, {
				kind: StateComponents.Chat,
				resource: backendChat.toString(),
			}, {
				kind: StateComponents.Changeset,
				resource: `${backendSession.toString()}/changeset/branch`,
			}],
		});
	});

	test('matches the Agents Window pull request summary presentation', async () => {
		const instantiationService = createInstantiationService();
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: buildDefaultChatUri(backendSession),
				chats: [],
				workingDirectories: ['file:///repo'],
				_meta: withSessionGitHubState(undefined, 'file:///repo', {
					pullRequestUrls: [
						'https://github.com/microsoft/vscode/pull/1',
						'https://github.com/microsoft/vscode/pull/2',
						'https://github.com/microsoft/vscode/pull/3',
					],
					// Only pull request #1 is merged; the other entries must retain their open state.
					pullRequestState: 'merged',
					pullRequestStateUrl: 'https://github.com/microsoft/vscode/pull/1',
				}),
			} as unknown as SessionState],
		]));
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<ChatViewModel>({ sessionResource }),
			setPersistentContentHeight: () => { },
		});
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: Event.None,
			onDidChangeSessionResolution: Event.None,
			connections: [{ authority: 'local', address: undefined, name: 'Local', isAmbient: true, connection }],
			resolveSessionResource: () => ({ connection, connectionAuthority: 'local', backendSession }),
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		const filterActions = createSessionPullRequestPillData(constObservable([]), visibility.pullRequests).getContextMenuActions();
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const [clipboardService, configurationService, editorService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
		] as const);
		const openerService = new TestOpenerService();

		store.add(new AgentHostSessionInputPills(
			widget,
			false,
			connectionsService,
			browserViewService,
			clipboardService,
			configurationService,
			editorService,
			instantiationService,
			openerService,
			visibility,
			noProvisionalSessions,
			labelService,
			notificationService,
			instantiationService.get(ICommandService),
			instantiationService.get(IDialogService),
		));
		const button = persistentContent.querySelector<HTMLElement>('.chat-dropdown-pill-button');
		const icon = button?.querySelector<HTMLElement>('.chat-pill-icon');
		const multiple = {
			button,
			label: button?.querySelector('.chat-pill-label')?.textContent,
			iconClass: icon?.classList.contains('codicon-git-pull-request'),
			iconColor: icon?.style.color,
			hasChevron: button?.querySelector('.chat-pill-chevron') !== null,
		};
		await filterActions[1].run();
		const filteredLabel = persistentContent.querySelector('.chat-pill-label')?.textContent;
		await filterActions[0].run();
		connection.setState(StateComponents.Session, {
			defaultChat: buildDefaultChatUri(backendSession),
			chats: [],
			workingDirectories: ['file:///repo'],
			_meta: withSessionGitHubState(undefined, 'file:///repo', {
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
				pullRequestState: 'merged',
				pullRequestStateUrl: 'https://github.com/microsoft/vscode/pull/1',
			}),
		} as unknown as SessionState);
		const singleButton = persistentContent.querySelector<HTMLElement>('.chat-dropdown-pill-button');
		const singleIcon = singleButton?.querySelector<HTMLElement>('.chat-pill-icon');
		const single = {
			buttonPreserved: singleButton === multiple.button,
			label: singleButton?.querySelector('.chat-pill-label')?.textContent,
			iconClass: singleIcon?.classList.contains('codicon-git-pull-request-done'),
			iconColor: singleIcon?.style.color,
			hasChevron: singleButton?.querySelector('.chat-pill-chevron') !== null,
		};
		singleButton?.click();
		await filterActions[1].run();

		assert.deepStrictEqual({
			multiple,
			filteredLabel,
			single,
			opened: openerService.opened.map(({ resource, options }) => ({ resource: resource.toString(true), options })),
			filteredOnly: persistentContent.querySelector('.chat-dropdown-pill-button'),
			canConfigure: persistentContent.querySelector('.chat-pills-row')?.classList.contains('empty'),
		}, {
			multiple: {
				button,
				label: '3 Pull Requests',
				iconClass: true,
				iconColor: 'var(--vscode-charts-green)',
				hasChevron: true,
			},
			filteredLabel: '2 Pull Requests',
			single: {
				buttonPreserved: true,
				label: '#1',
				iconClass: true,
				iconColor: 'var(--vscode-charts-purple)',
				hasChevron: false,
			},
			opened: [{
				resource: 'https://github.com/microsoft/vscode/pull/1',
				options: { openExternal: true, allowContributedOpeners: true, fromUserGesture: true },
			}],
			filteredOnly: null,
			canConfigure: true,
		});
	});

	test('offers canonical copy actions for generic references while Browsers is hidden', async () => {
		const instantiationService = createInstantiationService();
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const website = URI.parse('https://example.com/preview');
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: buildDefaultChatUri(backendSession),
				chats: [],
				_meta: withSessionArtifacts(undefined, [
					{
						id: 'preview',
						type: SessionArtifactType.Website,
						label: 'Preview',
						link: website.toString(),
						isArtifact: false,
					},
					{
						id: 'file',
						type: SessionArtifactType.File,
						label: 'README',
						uri: 'file:///repo/README.md',
						isArtifact: false,
					},
					{
						id: 'resource',
						type: SessionArtifactType.Resource,
						label: 'Chat settings',
						uri: 'vscode://settings/chat',
						isArtifact: false,
					},
					{
						id: 'commit',
						type: SessionArtifactType.Commit,
						label: 'Commit',
						link: 'https://github.com/microsoft/vscode/commit/abc123',
						commitHash: 'abc123',
						isArtifact: false,
					},
				]),
			} as unknown as SessionState],
		]), true);
		const browserModel = upcastPartial<IBrowserViewModel>({
			owner: { type: 'agent', sessionId: sessionResource.toString() },
		});
		const browser = new class extends mock<BrowserEditorInput>() {
			override get id(): string { return 'preview-browser'; }
			override get model(): IBrowserViewModel { return browserModel; }
			override get url(): string { return website.toString(); }
			override get title(): string { return 'Preview'; }
			override readonly onDidChangeLabel = Event.None;
		}();
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<ChatViewModel>({ sessionResource }),
			setPersistentContentHeight: () => { },
		});
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: Event.None,
			onDidChangeSessionResolution: Event.None,
			connections: [],
			resolveSessionResource: () => ({ connection, connectionAuthority: 'local', backendSession }),
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map([[browser.id, browser]]),
		});
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		visibility.hide(SessionChatPillKind.Browsers);
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		let dropdownActions: readonly IAction[] = [];
		let dropdownFooterActionLabels: readonly string[] = [];
		instantiationService.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
			isVisible: false,
			show: (_user, _supportsPreview, items) => {
				dropdownActions = items.flatMap(item => item.toolbarActions ?? []);
				dropdownFooterActionLabels = items.flatMap(item => item.hover?.actions?.map(action => action.label) ?? []);
			},
			hide: () => { },
			updateItems: () => { },
			focusItemById: () => { },
		}));
		const clipboardService = new TestClipboardService();
		const [configurationService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
			accessor.get(IOpenerService),
		] as const);

		const errors: string[] = [];
		store.add(new AgentHostSessionInputPills(
			widget,
			false,
			connectionsService,
			browserViewService,
			clipboardService,
			configurationService,
			editorService,
			instantiationService,
			openerService,
			visibility,
			noProvisionalSessions,
			labelService,
			upcastPartial<INotificationService>({ error: error => errors.push(String(error)) }),
			instantiationService.get(ICommandService),
			instantiationService.get(IDialogService),
		));
		persistentContent.querySelector<HTMLElement>('.chat-dropdown-pill-button')?.click();
		const copied: string[] = [];
		for (const action of dropdownActions.filter(action => action.label.startsWith('Copy '))) {
			await action.run();
			copied.push(await clipboardService.readText());
		}
		connection.removeSessionArtifactError = new Error('write failed');
		await dropdownActions.find(action => action.label === 'Remove Reference Preview from Session')?.run();

		assert.deepStrictEqual({
			pills: Array.from(persistentContent.querySelectorAll('.chat-pill-label')).map(label => label.textContent),
			empty: persistentContent.querySelector('.agent-host-session-input-pills')?.classList.contains('empty'),
			dropdownActionLabels: dropdownActions.map(action => action.label),
			dropdownFooterActionLabels,
			copied,
			removeCalls: connection.removeSessionArtifactCalls.map(({ session, artifactId }) => ({ session: session.toString(), artifactId })),
			errors,
		}, {
			pills: ['4 References'],
			empty: false,
			dropdownActionLabels: [
				'Copy Commit URL',
				'Remove Reference Commit from Session',
				'Copy Website URL',
				'Remove Reference Preview from Session',
				'Copy Path',
				'Remove Reference README from Session',
				'Copy URI',
				'Remove Reference Chat settings from Session',
			],
			dropdownFooterActionLabels: ['Copy Hash', 'Copy Relative Path'],
			copied: [
				'https://github.com/microsoft/vscode/commit/abc123',
				website.toString(true),
				URI.parse('file:///repo/README.md').fsPath,
				'vscode://settings/chat',
			],
			removeCalls: [{ session: backendSession.toString(), artifactId: 'preview' }],
			errors: ['Could not remove Preview from this session: write failed'],
		});
	});

	test('hides the session pills in a subagent chat', () => {
		const instantiationService = createInstantiationService();
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const defaultChat = buildDefaultChatUri(backendSession);
		const subagentChat = buildSubagentChatUri(backendSession, 'tool-1');
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat,
				chats: [{
					resource: subagentChat,
					title: 'Subagent',
					status: SessionStatus.InProgress,
					origin: { kind: ChatOriginKind.Tool, chat: defaultChat, toolCallId: 'tool-1' },
				}],
				_meta: withSessionArtifacts(undefined, [{
					id: 'preview',
					type: SessionArtifactType.Website,
					label: 'Preview',
					link: 'https://example.com/preview',
					isArtifact: true,
				}]),
			} as unknown as SessionState],
		]));
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: Event.None,
			onDidChangeSessionResolution: Event.None,
			connections: [],
			resolveSessionResource: () => ({ connection, connectionAuthority: 'local', backendSession }),
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const [clipboardService, configurationService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
			accessor.get(IOpenerService),
		] as const);
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		let persistentContentHeight: number | undefined;
		// The chat editor keeps one pills instance while its widget navigates
		// between the session and one of its subagent chats.
		let viewModel = upcastPartial<ChatViewModel>({ sessionResource });
		const viewModelChanged = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: viewModelChanged.event,
			get viewModel() { return viewModel; },
			setPersistentContentHeight: height => persistentContentHeight = height,
		});
		store.add(new AgentHostSessionInputPills(
			widget,
			false,
			connectionsService,
			browserViewService,
			clipboardService,
			configurationService,
			editorService,
			instantiationService,
			openerService,
			visibility,
			noProvisionalSessions,
			labelService,
			notificationService,
			instantiationService.get(ICommandService),
			instantiationService.get(IDialogService),
		));
		const showChat = (resource: URI) => {
			const previousSessionResource = viewModel.sessionResource;
			viewModel = upcastPartial<ChatViewModel>({ sessionResource: resource });
			viewModelChanged.fire({ previousSessionResource, currentSessionResource: resource });
			return {
				pills: Array.from(persistentContent.querySelectorAll('.chat-pill-label')).map(label => label.textContent),
				hidden: persistentContent.querySelector('.agent-host-session-input-pills')?.classList.contains('hidden'),
				persistentContentHeight,
			};
		};
		const explicitQuery = new URLSearchParams();
		explicitQuery.set(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, subagentChat);

		assert.deepStrictEqual({
			session: showChat(sessionResource),
			// The subagent editor addresses its chat by query parameter, and by
			// fragment alone once the session state resolves the chat id.
			explicitSubagent: showChat(sessionResource.with({ fragment: 'subagent/tool-1', query: explicitQuery.toString() })),
			canonicalSubagent: showChat(sessionResource.with({ fragment: 'subagent/tool-1' })),
			backToSession: showChat(sessionResource),
		}, {
			session: { pills: ['1 Artifact'], hidden: false, persistentContentHeight: 28 },
			explicitSubagent: { pills: [], hidden: true, persistentContentHeight: undefined },
			canonicalSubagent: { pills: [], hidden: true, persistentContentHeight: undefined },
			backToSession: { pills: ['1 Artifact'], hidden: false, persistentContentHeight: 28 },
		});
	});

	test('shows the chat\'s background shells until they finish', () => {
		const instantiationService = createInstantiationService();
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const shell: BackgroundShellWork = {
			kind: BackgroundWorkKind.Shell, id: 'shell:dev-server', label: 'Start dev server', command: 'npm run dev',
			startedAt: new Date(0).toISOString(), _meta: toCopilotBackgroundShellMeta('dev-server', 'detached'),
		};
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChatState>([
			[StateComponents.Session, upcastPartial<SessionState>({ defaultChat: buildDefaultChatUri(backendSession), chats: [] })],
			[StateComponents.Chat, upcastPartial<ChatState>({ backgroundWork: [shell] })],
		]));
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: Event.None,
			onDidChangeSessionResolution: Event.None,
			connections: [],
			resolveSessionResource: () => ({ connection, connectionAuthority: 'local', backendSession }),
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const [clipboardService, configurationService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
			accessor.get(IOpenerService),
		] as const);
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<ChatViewModel>({ sessionResource }),
			setPersistentContentHeight: () => { },
		});
		store.add(new AgentHostSessionInputPills(
			widget,
			false,
			connectionsService,
			browserViewService,
			clipboardService,
			configurationService,
			editorService,
			instantiationService,
			openerService,
			visibility,
			noProvisionalSessions,
			labelService,
			notificationService,
			instantiationService.get(ICommandService),
			instantiationService.get(IDialogService),
		));
		const pills = () => Array.from(persistentContent.querySelectorAll('.chat-pill-label')).map(label => label.textContent);
		const running = pills();
		connection.setState(StateComponents.Chat, upcastPartial<ChatState>({ backgroundWork: [] }));

		assert.deepStrictEqual({ running, finished: pills() }, { running: ['1 Background Shell'], finished: [] });
	});
});
