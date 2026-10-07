/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { IAction, SubmenuAction } from '../../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, ImmortalReference, toDisposable, type IReference } from '../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { dirname } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../../platform/agentHost/common/agentHostFileSystemService.js';
import { createAgentHostResourceUriMapper, identityAgentHostResourceUriMapper, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ISessionArtifact, SessionArtifactType, withSessionArtifacts } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { AgentHostArtifactRemovalCapabilityMetaKey } from '../../../../../../platform/agentHost/common/meta/agentHostArtifactRemovalMeta.js';
import { toCopilotBackgroundShellMeta } from '../../../../../../platform/agentHost/common/meta/copilotBackgroundWorkMeta.js';
import { BackgroundWorkKind, type BackgroundShellWork } from '../../../../../../platform/agentHost/common/state/protocol/channels-chat/state.js';
import { buildDefaultChatUri, buildSubagentChatUri, Changeset, ChangesetState, ChangesetStatus, ChatOriginKind, ChatState, ChatSummary, ComponentToState, CustomizationType, ResponsePartKind, SessionState, SessionStatus, StateComponents, ToolCallConfirmationReason, ToolCallStatus, Turn, withSessionGitHubState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../../platform/clipboard/test/common/testClipboardService.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IGitHubClient, IGitHubService } from '../../../../../../platform/github/common/githubService.js';
import { IWorkbenchGitHubService } from '../../../../../services/github/common/githubService.js';
import { PullRequestSnapshot } from '../../../../../../platform/github/common/githubPullRequestService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { BrowserEditorInput } from '../../../../browserView/common/browserEditorInput.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';
import { IEditorService, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../../common/constants.js';
import { IChatWidgetService, type IChatWidgetViewModelChangeEvent } from '../../../browser/chat.js';
import { getSubagentEditorResource } from '../../../browser/widget/chatContentParts/chatSubagentOpenChat.js';
import { AgentHostSessionInputPills, getAgentHostSessionBrowserOwnerIds, getAgentHostSessionPillMetadata, resolveAgentHostChangeset } from '../../../browser/agentSessions/agentHost/agentHostSessionInputPills.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { ISessionChatPillVisibilityService, SESSION_CHAT_PILL_KINDS, SessionChatPillKind, SessionChatPillVisibility } from '../../../common/sessionChatPills.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { createSessionPullRequestPillData } from '../../../browser/sessionPullRequestPill.js';
import { chatPersistentContentVisibleClass, ChatWidget } from '../../../browser/widget/chatWidget.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { ChatViewModel } from '../../../common/model/chatViewModel.js';

class StaticAgentConnection extends mock<IAgentConnection>() {
	override resourceUris = identityAgentHostResourceUriMapper;
	readonly requested: Array<{ kind: StateComponents; resource: URI }> = [];
	readonly released: URI[] = [];
	readonly removeSessionArtifactCalls: { readonly session: URI; readonly artifactId: string }[] = [];
	override readonly initializeResult;
	removeSessionArtifactError: Error | undefined;
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
		return instantiationService;
	};
	const createRichGitHubService = (disposed: string[], options?: {
		readonly credentialState?: { fail: boolean; calls: number };
		readonly pullRequestSnapshots?: Map<number, ReturnType<typeof observableValue<PullRequestSnapshot>>>;
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
				subscribeIssue: ref => upcastPartial({
					resource: {
						ref,
						state: constObservable({
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
						}),
					},
					update: () => { },
					refresh: async () => { },
					dispose: () => disposed.push(`issue:${ref.number}`),
				}),
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

	function createActivityPills(initialSession: SessionState, initialChat?: ChatState, gitHubService?: IGitHubService, connectionAuthority = 'local', workbenchGitHubService?: IWorkbenchGitHubService) {
		const instantiationService = createInstantiationService();
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
		connection.resourceUris = createAgentHostResourceUriMapper(connectionAuthority);
		const sessionResource = URI.parse('agent-host-test:/session');
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		const viewModelChanged = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		let viewModel = upcastPartial<ChatViewModel>({ sessionResource });
		let inputFocused = false;
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: viewModelChanged.event,
			get viewModel() { return viewModel; },
			setPersistentContentHeight: () => { },
			focusInput: () => { inputFocused = true; },
		});
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			onDidChangeSessionResolution: Event.None,
			resolveSessionResource: () => ({ connection, connectionAuthority, backendSession: URI.parse('vendor:/sessions/42') }),
		}));
		instantiationService.stub(IBrowserViewWorkbenchService, upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		}));
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, noProvisionalSessions);
		instantiationService.stub(INotificationService, notificationService);
		const commands: { readonly id: string; readonly args: readonly unknown[] }[] = [];
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
		let dropdownItems: readonly { readonly label: string | undefined; readonly description: string | undefined; readonly hover: IActionListItem<object>['hover']; select(): void }[] = [];
		let hideDropdown = () => { };
		const toDropdownItems = <T>(items: readonly IActionListItem<T>[], delegate?: IActionListDelegate<T>) => items.map(item => ({
			label: item.label,
			description: item.ariaDescription,
			hover: item.hover,
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
		const pills = store.add(instantiationService.createInstance(AgentHostSessionInputPills, widget, false));
		return {
			instantiationService, connection, sessionResource, persistentContent, visibility, commands, pills,
			labels: () => [...persistentContent.querySelectorAll('.chat-pill-label')].map(label => label.textContent),
			dropdownItems: () => dropdownItems,
			dropdown: (label: string) => {
				const button = [...persistentContent.querySelectorAll<HTMLElement>('.chat-dropdown-pill-button')].find(button => button.textContent?.includes(label));
				assert.ok(button, `Missing ${label} pill`);
				button.click();
				return dropdownItems;
			},
			menu: () => {
				const row = persistentContent.querySelector<HTMLElement>('.chat-pills-row-content');
				assert.ok(row);
				row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
				return menuActions;
			},
			showChat: (resource: string) => {
				const previousSessionResource = viewModel.sessionResource;
				const query = new URLSearchParams();
				query.set(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, resource);
				viewModel = upcastPartial<ChatViewModel>({ sessionResource: sessionResource.with({ query: query.toString() }) });
				viewModelChanged.fire({ previousSessionResource, currentSessionResource: viewModel.sessionResource });
			},
			inputFocused: () => inputFocused,
		};
	}

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
		harness.dropdown('Running');
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
			singleLabels: ['Running'],
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
			siblingLabels: ['Other chat worker'],
			subagentLabels: [],
			inputFocusedAfterRemoval: true,
			releasedSubscriptions: true,
		});
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

	test('resolves rich GitHub reference metadata only after hover intent', async () => {
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
		const entry = activity.dropdown('Reference').find(item => item.label?.includes('pull request #2'));
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
			afterHover: 2,
			resolvedLabel: 'Live pull request 2',
			preservedHover: true,
			className: 'sessions-pr-hover compact',
			text: 'microsoft/vscodeon Sep 1Live pull request 2 #2OpenLive pull request bodymain←feature@pr-author opened this pull request',
			labels: ['1 Reference'],
		});
	});

	test('uses reference URLs as labels when GitHub metadata fails', async () => {
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
		assert.deepStrictEqual(activity.dropdownItems().filter(item => item.label?.startsWith('https://')).map(item => ({
			label: item.label, description: item.description,
		})), links.map(label => ({ label, description: undefined })));
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
				hoverClassName: 'sessions-pr-hover compact',
				hoverText: 'microsoft/vscodeon Sep 1Live pull request 332982 #332982OpenLive pull request bodymain←feature@pr-author opened this pull request',
				actionLabels: [
					'Copy Pull Request URL',
					'Remove Artifact Chat: unify Agent Host status pills across chat surfaces from Session',
					'Copy Pull Request URL',
					'Remove Artifact sessions: preserve recorded issue titles in pills from Session',
				],
			},
			issue: {
				label: 'Live issue title',
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
		const updatedHover = activity.dropdownItems().find(item => item.label === 'Updated PR title')!.hover!;
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
			whileOpen,
			reopenedTitle: reopened.querySelector('.sessions-pr-hover-title')?.getAttribute('title'),
			reopenedHead: reopened.querySelector('.sessions-pr-hover-branches')?.textContent,
		}, {
			whileOpen: {
				sameRoot: true, sameControl: true, focusPreserved: true,
				title: 'Live pull request 332982', head: 'main←feature',
			},
			reopenedTitle: 'Updated PR title', reopenedHead: 'main←updated-branch',
		});
	});

	test('resolves the configured session changeset and ignores templated entries', () => {
		const backendSession = URI.parse('ahp-session:/session');
		const changesets: readonly Changeset[] = [
			{ label: 'Last Turn', uriTemplate: 'changeset/turn/{turnId}', changeKind: ChangesetKind.Turn },
			{ label: 'Session Changes', uriTemplate: 'changeset/session', changeKind: ChangesetKind.Session },
			{ label: 'Branch Changes', uriTemplate: 'changeset/branch', changeKind: ChangesetKind.Branch },
		];

		assert.deepStrictEqual({
			preferred: resolveAgentHostChangeset(backendSession, changesets, ChangesetKind.Session),
			fallback: resolveAgentHostChangeset(backendSession, changesets.slice(0, 2), ChangesetKind.Branch),
			turnOnly: resolveAgentHostChangeset(backendSession, changesets.slice(0, 1), ChangesetKind.Session),
		}, {
			preferred: {
				changeset: changesets[1],
				resource: URI.parse('ahp-session:/session/changeset/session'),
			},
			fallback: {
				changeset: changesets[1],
				resource: URI.parse('ahp-session:/session/changeset/session'),
			},
			turnOnly: undefined,
		});
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

		const before = getAgentHostSessionBrowserOwnerIds(sessionResource, stateWithoutChild);
		const after = getAgentHostSessionBrowserOwnerIds(sessionResource, stateWithChild);

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

		assert.deepStrictEqual([...getAgentHostSessionBrowserOwnerIds(sessionResource, state)], [
			sessionResource.toString(),
			sessionResource.with({ fragment: childChat, query: query.toString() }).toString(),
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
		));
		const pills = () => Array.from(persistentContent.querySelectorAll('.chat-pill-label')).map(label => label.textContent);
		const running = pills();
		connection.setState(StateComponents.Chat, upcastPartial<ChatState>({ backgroundWork: [] }));

		assert.deepStrictEqual({ running, finished: pills() }, { running: ['1 Background Shell'], finished: [] });
	});
});
