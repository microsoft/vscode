/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { OS } from '../../../../../base/common/platform.js';
import { ExtUri } from '../../../../../base/common/resources.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { createUSLayoutResolvedKeybinding } from '../../../../../platform/keybinding/test/common/keybindingsTestUtils.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMenu, IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
// eslint-disable-next-line local/code-import-patterns
import { IAgentHostFilterService } from '../../../../../sessions/services/agentHostFilter/common/agentHostFilter.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionGroup, ISessionGroupsService } from '../../../../../sessions/services/sessions/browser/sessionGroupsService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionSectionOrderService } from '../../../../../sessions/services/sessions/browser/sessionSectionOrderService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsListModelService } from '../../../../../sessions/services/sessions/browser/sessionsListModelService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsProvidersService } from '../../../../../sessions/services/sessions/browser/sessionsProvidersService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
// eslint-disable-next-line local/code-import-patterns
import { ICustomViewService } from '../../../../../sessions/services/customView/browser/customViewService.js';
// eslint-disable-next-line local/code-import-patterns
import { Menus } from '../../../../../sessions/browser/menus.js';
// eslint-disable-next-line local/code-import-patterns
import { IChat, ISession, ISessionChangesSummary, ISessionFolder, ISessionWorkspace, SessionStatus, ChatInteractivity } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession, ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionsGrouping, SessionsList, SessionsSorting } from '../../../../../sessions/contrib/sessions/browser/views/sessionsList.js';
// eslint-disable-next-line local/code-import-patterns
import { AUTOMATIONS_NEW_BADGE_STYLE_SETTING, type AutomationsNewBadgeStyle } from '../../../../../sessions/contrib/sessions/browser/automationsNewBadge.js';
// eslint-disable-next-line local/code-import-patterns
import { renderSessionsHeader } from '../../../../../sessions/contrib/sessions/browser/views/sessionsView.js';
// eslint-disable-next-line local/code-import-patterns
import { NEW_SESSION_BUTTON_STYLE_SETTING, NewSessionActionViewItemContribution, type NewSessionButtonStyle } from '../../../../../sessions/contrib/sessions/browser/sessionsActions.js';
// eslint-disable-next-line local/code-import-patterns
import { NEW_SESSION_ACTION_ID } from '../../../../../sessions/contrib/chat/common/constants.js';
// eslint-disable-next-line local/code-import-patterns
import { IsPhoneLayoutContext } from '../../../../../sessions/common/contextkeys.js';
import { AgentSessionApprovalKind, AgentSessionApprovalModel, IAgentSessionApprovalInfo } from '../../../../contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { IAgentSessionsService } from '../../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IAgentSession, IAgentSessionsModel } from '../../../../contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAutomationService } from '../../../../contrib/chat/common/automations/automationService.js';
import type { IAutomationRun } from '../../../../contrib/chat/common/automations/automation.js';
import { ChatAutomationsEnabledContext } from '../../../../contrib/chat/common/automations/automationsEnabled.js';
import { IChatService } from '../../../../contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { IVoicePlaybackService } from '../../../../contrib/chat/common/voicePlaybackService.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { TestProductService } from '../../../common/workbenchTestServices.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/contrib/sessions/browser/media/sessionsList.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/contrib/sessions/browser/media/sessionsViewPane.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/contrib/sessions/browser/media/newSessionActionViewItem.css';

class FixtureActionViewItemService extends Disposable implements IActionViewItemService {
	declare _serviceBrand: undefined;

	private readonly providers = new Map<string, IActionViewItemFactory>();
	private readonly changeEmitter = this._register(new Emitter<MenuId>());
	readonly onDidChange = this.changeEmitter.event;

	register(menu: MenuId, commandId: string | MenuId, provider: IActionViewItemFactory, event?: Event<unknown>): IDisposable {
		const key = `${menu.id}/${commandId instanceof MenuId ? commandId.id : commandId}`;
		this.providers.set(key, provider);
		const listener = event?.(() => this.changeEmitter.fire(menu));
		return toDisposable(() => {
			listener?.dispose();
			this.providers.delete(key);
		});
	}

	lookUp(menu: MenuId, commandId: string | MenuId): IActionViewItemFactory | undefined {
		return this.providers.get(`${menu.id}/${commandId instanceof MenuId ? commandId.id : commandId}`);
	}
}

interface IChatSpec {
	readonly id: string;
	readonly title: string;
	readonly status?: SessionStatus;
	/** Terminal command awaiting approval; renders an approval row with an Allow button on this chat's row. */
	readonly approvalCommand?: string;
}

interface ISessionSpec {
	readonly id: string;
	readonly title: string;
	readonly workspace?: string;
	readonly status?: SessionStatus;
	readonly mainChatStatus?: SessionStatus;
	readonly description?: string;
	readonly minutesAgo: number;
	readonly changesSummary?: ISessionChangesSummary;
	readonly group?: string;
	/** Nested (non-main) chats shown as child rows under the session. */
	readonly chats?: readonly IChatSpec[];
	/** Terminal command awaiting approval on the session's main chat (renders on the session row). */
	readonly mainApprovalCommand?: string;
}

function createWorkspace(label: string): ISessionWorkspace {
	const root = URI.file(`/home/user/projects/${label}`);
	const folder: ISessionFolder = { root, workingDirectory: root, name: label, description: undefined };
	return {
		uri: root,
		label,
		icon: Codicon.folder,
		folders: [folder],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

function createChat(sessionId: string, spec: IChatSpec, updatedAt: Date, approvals: Map<string, IAgentSessionApprovalInfo>): IChat {
	const resource = URI.parse(`vscode-session://session/${sessionId}/chat/${spec.id}`);
	if (spec.approvalCommand !== undefined) {
		approvals.set(resource.toString(), {
			approvalId: resource.toString(),
			kind: AgentSessionApprovalKind.Terminal,
			label: spec.approvalCommand,
			languageId: 'shellscript',
			since: updatedAt,
			confirm: () => { },
		});
	}
	return new class extends mock<IChat>() {
		override readonly resource = resource;
		override readonly title: IObservable<string> = constObservable(spec.title);
		override readonly updatedAt: IObservable<Date> = constObservable(updatedAt);
		override readonly status: IObservable<SessionStatus> = constObservable(spec.status ?? SessionStatus.Completed);
		override readonly interactivity: IObservable<ChatInteractivity> = constObservable(ChatInteractivity.Full);
	}();
}

function createSession(spec: ISessionSpec, approvals: Map<string, IAgentSessionApprovalInfo>): ISession {
	const updatedAt = new Date(Date.now() - spec.minutesAgo * 60 * 1000);
	const description: IMarkdownString | undefined = spec.description ? new MarkdownString(spec.description) : undefined;
	const mainChatResource = URI.parse(`vscode-session://session/${spec.id}/chat/main`);
	if (spec.mainApprovalCommand !== undefined) {
		approvals.set(mainChatResource.toString(), {
			approvalId: mainChatResource.toString(),
			kind: AgentSessionApprovalKind.Terminal,
			label: spec.mainApprovalCommand,
			languageId: 'shellscript',
			since: updatedAt,
			confirm: () => { },
		});
	}
	const mainChat = new class extends mock<IChat>() {
		override readonly resource = mainChatResource;
		override readonly status: IObservable<SessionStatus> = constObservable(spec.mainChatStatus ?? spec.status ?? SessionStatus.Completed);
		override readonly interactivity: IObservable<ChatInteractivity> = constObservable(ChatInteractivity.Full);
	}();
	const nestedChats = (spec.chats ?? []).map(chatSpec => createChat(spec.id, chatSpec, updatedAt, approvals));
	const chats: readonly IChat[] = [mainChat, ...nestedChats];
	return new class extends mock<ISession>() {
		override readonly sessionId = spec.id;
		override readonly resource = URI.parse(`vscode-session://session/${spec.id}`);
		override readonly providerId = 'local';
		override readonly sessionType = 'local';
		override readonly icon = Codicon.account;
		override readonly createdAt = updatedAt;
		override readonly title: IObservable<string> = constObservable(spec.title);
		override readonly updatedAt: IObservable<Date> = constObservable(updatedAt);
		override readonly status: IObservable<SessionStatus> = constObservable(spec.status ?? SessionStatus.Completed);
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(spec.workspace ? createWorkspace(spec.workspace) : undefined);
		override readonly isQuickChat: IObservable<boolean> = constObservable(!spec.workspace);
		override readonly isArchived: IObservable<boolean> = constObservable(false);
		override readonly isRead: IObservable<boolean> = constObservable(true);
		override readonly changes: IObservable<readonly never[]> = constObservable([]);
		override readonly changesSummary: IObservable<ISessionChangesSummary | undefined> = constObservable(spec.changesSummary);
		override readonly description: IObservable<IMarkdownString | undefined> = constObservable(description);
		override readonly chats: IObservable<readonly IChat[]> = constObservable(chats);
		override readonly mainChat: IObservable<IChat> = constObservable(mainChat);
		override readonly capabilities = constObservable({ supportsMultipleChats: nestedChats.length > 0 });
	}();
}

function createApprovalModel(approvals: Map<string, IAgentSessionApprovalInfo>): AgentSessionApprovalModel {
	return new class extends mock<AgentSessionApprovalModel>() {
		override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
			return constObservable(approvals.get(resource.toString()));
		}
	}();
}

interface IRenderOptions {
	readonly sessions: readonly ISessionSpec[];
	readonly groups?: readonly ISessionGroup[];
	readonly grouping?: SessionsGrouping;
	readonly width?: number;
	readonly phone?: boolean;
	readonly revealHierarchyGuides?: boolean;
	readonly showAutomations?: boolean;
	readonly automationRunStatus?: IAutomationRun['status'];
	readonly automationBadgeStyle?: AutomationsNewBadgeStyle;
	readonly newSessionButtonStyle?: NewSessionButtonStyle;
	readonly showFocusedToolbar?: boolean;
}

async function renderSessionsList(ctx: ComponentFixtureContext, options: IRenderOptions): Promise<void> {
	const { container, disposableStore } = ctx;
	const showHeader = options.showAutomations || options.newSessionButtonStyle !== undefined;
	const approvals = new Map<string, IAgentSessionApprovalInfo>();
	const sessions = options.sessions.map(spec => createSession(spec, approvals));
	const approvalModel = createApprovalModel(approvals);
	const groups = options.groups ?? [];
	const automationRuns = observableValue<readonly IAutomationRun[]>(disposableStore, []);
	const actionViewItemService = disposableStore.add(new FixtureActionViewItemService());
	const newSessionKeybinding = options.newSessionButtonStyle
		? createUSLayoutResolvedKeybinding(KeyMod.CtrlCmd | KeyCode.KeyN, OS)
		: undefined;
	if (options.newSessionButtonStyle && !newSessionKeybinding) {
		throw new Error('Expected the New Session keybinding to resolve.');
	}
	const membership = new Map<string, string>();
	for (const spec of options.sessions) {
		if (spec.group) {
			membership.set(spec.id, spec.group);
		}
	}

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IProductService, TestProductService);
			if (options.showFocusedToolbar) {
				const archiveAction = new class extends mock<MenuItemAction>() {
					override readonly id = 'sessions.fixture.archive';
					override readonly label = 'Archive';
					override readonly tooltip = 'Archive';
					override readonly class = ThemeIcon.asClassName(Codicon.archive);
					override readonly enabled = true;
					override async run(): Promise<void> { }
				}();
				reg.defineInstance(IMenuService, new class extends mock<IMenuService>() {
					override createMenu(): IMenu {
						return {
							onDidChange: Event.None,
							getActions: () => [['navigation', [archiveAction]]],
							dispose: () => { },
						};
					}
				}());
			}
			reg.define(IListService, ListService);
			if (newSessionKeybinding) {
				reg.defineInstance(IKeybindingService, new class extends MockKeybindingService {
					override lookupKeybinding(commandId: string) {
						return commandId === NEW_SESSION_ACTION_ID ? newSessionKeybinding : undefined;
					}

					override lookupKeybindings(commandId: string) {
						return commandId === NEW_SESSION_ACTION_ID ? [newSessionKeybinding] : [];
					}
				}());
			}
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() { }());
			reg.defineInstance(IChatService, new class extends mock<IChatService>() {
				override readonly chatModels: IObservable<Iterable<IChatModel>> = constObservable([]);
			}());
			reg.defineInstance(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
				override readonly model = new class extends mock<IAgentSessionsModel>() {
					override observeSession(): IObservable<IAgentSession | undefined> {
						return constObservable(undefined);
					}
				}();
			}());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = Event.None;
				override getSessions(): ISession[] { return [...sessions]; }
				override markRead(): Promise<void> { return Promise.resolve(); }
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> = constObservable([]);
				override readonly activeSession: IObservable<IActiveSession | undefined> = constObservable(undefined);
			}());
			reg.defineInstance(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
				override readonly onDidChange = Event.None;
				override isSessionPinned(): boolean { return false; }
				override migrateLegacyReadState(): void { }
				override getSortKey(session: ISession): number { return session.createdAt.getTime(); }
				override getStatusIcon(status: SessionStatus): ThemeIcon {
					switch (status) {
						case SessionStatus.InProgress:
							return { ...Codicon.sessionInProgress, color: themeColorFromId('textLink.foreground') };
						case SessionStatus.NeedsInput:
							return { ...Codicon.circleFilled, color: themeColorFromId('list.warningForeground') };
						default:
							return { ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
					}
				}
			}());
			reg.defineInstance(ISessionGroupsService, new class extends mock<ISessionGroupsService>() {
				override readonly onDidChange = Event.None;
				override getGroups(): ISessionGroup[] { return [...groups]; }
				override getGroup(groupId: string): ISessionGroup | undefined { return groups.find(group => group.id === groupId); }
				override getGroupOfSession(sessionId: string): string | undefined { return membership.get(sessionId); }
				override getSessionIdsInGroup(groupId: string): string[] {
					return [...membership].filter(([, id]) => id === groupId).map(([sessionId]) => sessionId);
				}
			}());
			reg.defineInstance(ISessionSectionOrderService, new class extends mock<ISessionSectionOrderService>() {
				override readonly onDidChange = Event.None;
				override resolveOrder(ids: readonly string[]) { return [...ids]; }
				override isPromoted() { return false; }
				override retain(): void { }
			}());
			reg.defineInstance(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
				override readonly onDidChange = Event.None;
				override readonly selectedHostId = undefined;
				override readonly selectedHost = undefined;
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return []; }
				override getProvider() { return undefined; }
			}());
			reg.defineInstance(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
				override readonly pendingResponseVersion: IObservable<number> = constObservable(0);
				override hasPendingResponse() { return false; }
			}());
			reg.defineInstance(IAutomationService, new class extends mock<IAutomationService>() {
				override readonly automations = constObservable([]);
				override readonly runs = automationRuns;
			}());
			reg.defineInstance(IWorkbenchAssignmentService, new class extends mock<IWorkbenchAssignmentService>() {
				override readonly onDidRefetchAssignments = Event.None;
				override async getTreatment<T extends string | number | boolean>(): Promise<T | undefined> { return undefined; }
			}());
			reg.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				override readonly extUri = new ExtUri(() => true);
			}());
			reg.defineInstance(ICustomViewService, new class extends mock<ICustomViewService>() {
				override readonly activeCustomView = constObservable(undefined);
			}());
		},
	});
	if (showHeader) {
		const contextKeyService = instantiationService.get(IContextKeyService);
		const newSessionAction = new MenuItemAction(
			{ id: NEW_SESSION_ACTION_ID, title: 'New Session' },
			undefined,
			undefined,
			undefined,
			undefined,
			contextKeyService,
			instantiationService.get(ICommandService),
		);
		instantiationService.stub(IActionViewItemService, actionViewItemService);
		instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(id: MenuId): IMenu {
				return {
					onDidChange: Event.None,
					getActions: () => id === Menus.SidebarSessionsHeader ? [['navigation', [newSessionAction]]] : [],
					dispose: () => { },
				};
			}
		}());
	}

	// Render terminal-approval labels as real (monospace) code blocks — otherwise
	// the markdown renderer emits empty code-block spans and the command is blank.
	(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration('editor', { fontFamily: 'monospace' });
	if (options.automationBadgeStyle) {
		await (instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(AUTOMATIONS_NEW_BADGE_STYLE_SETTING, options.automationBadgeStyle);
	}
	instantiationService.get(IMarkdownRendererService).setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));

	// Phone layout is driven by both a CSS class (visual) and a context key (row
	// height reservation in the tree delegate). Set both so the reserved row
	// height matches the rendered content.
	if (options.phone) {
		IsPhoneLayoutContext.bindTo(instantiationService.get(IContextKeyService)).set(true);
	}
	if (options.showAutomations) {
		ChatAutomationsEnabledContext.bindTo(instantiationService.get(IContextKeyService)).set(true);
	}

	const width = options.width ?? 340;
	container.style.width = `${width}px`;
	container.style.height = options.phone ? '260px' : '220px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
	if (options.phone) {
		container.classList.add('agent-sessions-workbench', 'phone-layout');
	}

	let listParent = container;
	if (showHeader) {
		container.classList.add('agent-sessions-viewpane', 'agent-sessions-section');
		const content = DOM.append(container, DOM.$('.agent-sessions-content'));
		disposableStore.add(instantiationService.createInstance(NewSessionActionViewItemContribution));
		renderSessionsHeader(content, false, instantiationService, instantiationService.get(IContextKeyService), disposableStore).toolbar?.refresh();
		listParent = content;
	}
	const listHost = DOM.append(listParent, DOM.$(showHeader ? '.agent-sessions-control-container' : 'div'));
	const list = disposableStore.add(instantiationService.createInstance(SessionsList, listHost, {
		grouping: () => options.grouping ?? SessionsGrouping.Workspace,
		sorting: () => SessionsSorting.Created,
		onSessionOpen: () => { },
		approvalModel,
	}));
	list.layout(options.phone ? 260 : showHeader ? 180 : 220, width);

	if (options.automationRunStatus) {
		automationRuns.set([{
			id: 'fixture-run',
			automationId: 'fixture-automation',
			status: options.automationRunStatus,
			trigger: 'schedule',
			startedAt: new Date().toISOString(),
			leaderWindowId: 1,
		}], undefined);
	}
	await Promise.resolve();
	if (options.newSessionButtonStyle) {
		const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		await configurationService.setUserConfiguration(NEW_SESSION_BUTTON_STYLE_SETTING, options.newSessionButtonStyle);
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([NEW_SESSION_BUTTON_STYLE_SETTING]),
			change: { keys: [NEW_SESSION_BUTTON_STYLE_SETTING], overrides: [] },
			affectsConfiguration: configuration => configuration === NEW_SESSION_BUTTON_STYLE_SETTING,
		});
	}
	if (showHeader && !container.querySelector('.agent-sessions-compact-new-button')) {
		const menu = instantiationService.get(IMenuService).createMenu(Menus.SidebarSessionsHeader, instantiationService.get(IContextKeyService));
		const actionCount = menu.getActions().flatMap(([, actions]) => actions).length;
		menu.dispose();
		const hasProvider = !!instantiationService.get(IActionViewItemService).lookUp(Menus.SidebarSessionsHeader, NEW_SESSION_ACTION_ID);
		throw new Error(`Expected the production New Session action; found ${actionCount} menu action(s), provider=${hasProvider}.`);
	}
	if (options.newSessionButtonStyle === 'lightweight' && !container.querySelector('.agent-sessions-compact-new-button.lightweight:not(.lightweight-keybinding-background)')) {
		throw new Error('Expected the rendered New Session action to react to the lightweight style setting.');
	}
	if (options.newSessionButtonStyle === 'lightweightWithKeybindingBackground' && !container.querySelector('.agent-sessions-compact-new-button.lightweight.lightweight-keybinding-background')) {
		throw new Error('Expected the rendered New Session action to react to the lightweight keybinding-background style setting.');
	}

	if (options.showFocusedToolbar) {
		return Promise.resolve().then(() => {
			const sessionRow = listHost.querySelector<HTMLElement>('.session-item')?.closest('.monaco-list-row');
			const toolbar = sessionRow?.querySelector<HTMLElement>('.session-title-toolbar');
			const actions = toolbar?.querySelector<HTMLElement>('.actions-container');
			if (!sessionRow || !toolbar || !actions) {
				throw new Error('Expected a session row toolbar.');
			}
			sessionRow.classList.add('focused');
			toolbar.style.display = 'block';
		});
	}

	if (options.revealHierarchyGuides) {
		const sessionItem = listHost.querySelector<HTMLElement>('.session-item');
		if (!sessionItem) {
			throw new Error('Expected a session row to reveal its hierarchy guides.');
		}
		sessionItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
	}
}

const GROUP: ISessionGroup = { id: 'group-1', name: 'Release work', createdAt: Date.now() };
const GROUPED_SESSIONS: readonly ISessionSpec[] = [
	{ id: 'a', title: 'Fix authentication redirect loop', workspace: 'vscode', minutesAgo: 12, group: GROUP.id, changesSummary: { files: 4, additions: 132, deletions: 18 } },
	{ id: 'b', title: 'Add reconnect backoff', workspace: 'agent-host-protocol', minutesAgo: 64, group: GROUP.id },
	{ id: 'c', title: 'Update onboarding copy', workspace: 'vscode-docs', minutesAgo: 180 },
];

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	SessionsList_CustomGroup: defineComponentFixture({
		render: ctx => renderSessionsList(ctx, { sessions: GROUPED_SESSIONS, groups: [GROUP] }),
	}),
	SessionsList_CustomGroup_LongWorkspaceNarrow: defineComponentFixture({
		render: ctx => renderSessionsList(ctx, {
			sessions: [
				{ id: 'a', title: 'Fix authentication redirect loop', workspace: 'an-extremely-long-workspace-name-that-must-truncate', minutesAgo: 12, group: GROUP.id, changesSummary: { files: 4, additions: 132, deletions: 18 } },
				...GROUPED_SESSIONS.slice(1),
			],
			groups: [GROUP],
			width: 260,
		}),
	}),
	SessionsList_NarrowHoverToolbar: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['A narrow session row truncates its long title and shows the Archive toolbar action fully inside the rounded row boundary.'],
		render: ctx => renderSessionsList(ctx, {
			sessions: [
				{ id: 'a', title: 'Review PR 333429: sessions fix normalize Windows workspace path casing', workspace: 'vscode', minutesAgo: 12, group: GROUP.id, changesSummary: { files: 4, additions: 104, deletions: 4 } },
			],
			groups: [GROUP],
			showFocusedToolbar: true,
			width: 260,
		}),
	}),
	SessionsList_CustomGroup_InProgress: defineComponentFixture({
		render: ctx => renderSessionsList(ctx, {
			sessions: [
				{ id: 'a', title: 'Fix authentication redirect loop', workspace: 'agent-host-protocol', minutesAgo: 1, group: GROUP.id, status: SessionStatus.InProgress, description: 'Running the integration suite' },
				...GROUPED_SESSIONS.slice(1),
			],
			groups: [GROUP],
			width: 260,
		}),
	}),
	SessionsList_PeerChatInProgress: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['An expanded session has a completed main chat and two nested peer chat rows. The session row and the active "Fix empty files restore" peer chat row both show blue in-progress icons, while the completed "Fix single-pane details layout" peer chat shows an inactive dot. The session details say "Working...".'],
		render: ctx => renderSessionsList(ctx, {
			sessions: [
				{
					id: 'a',
					title: 'Single-pane details behavior',
					workspace: 'vscode',
					minutesAgo: 0,
					status: SessionStatus.InProgress,
					mainChatStatus: SessionStatus.Completed,
					chats: [
						{ id: 'layout', title: 'Fix single-pane details layout' },
						{ id: 'restore', title: 'Fix empty files restore', status: SessionStatus.InProgress },
					],
				},
			],
			width: 620,
		}),
	}),
	SessionsList_WorkspaceSection: defineComponentFixture({
		render: ctx => renderSessionsList(ctx, {
			sessions: [{ id: 'c', title: 'Update onboarding copy', workspace: 'vscode-docs', minutesAgo: 180 }],
		}),
	}),
	SessionsList_AutomationsNewBadge: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Sessions header has an outlined New button. Directly below it, the Automations row has a smaller right-aligned outlined NEW capsule that reads as a non-interactive feature badge rather than a second button.'],
		render: ctx => renderSessionsList(ctx, {
			sessions: [],
			showAutomations: true,
		}),
	}),
	SessionsList_LightweightNewButton: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Sessions header has an outlined New button whose keyboard shortcut is plain inline text without a nested keycap or chip background. The shortcut shares the New label typography and uses compact platform-native chord notation.'],
		render: ctx => renderSessionsList(ctx, {
			sessions: [],
			newSessionButtonStyle: 'lightweight',
		}),
	}),
	SessionsList_LightweightNewButtonWithKeybindingBackground: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Sessions header has an outlined New button whose keyboard shortcut uses the same typography as the label and sits on a subtle grouped keybinding background.'],
		render: ctx => renderSessionsList(ctx, {
			sessions: [],
			newSessionButtonStyle: 'lightweightWithKeybindingBackground',
		}),
	}),
	SessionsList_AutomationsNewBadge_Accent: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Automations row has a compact right-aligned NEW pill using the prominent activity badge colors, while the larger outlined New button remains visually distinct in the Sessions header.'],
		render: ctx => renderSessionsList(ctx, {
			sessions: [],
			showAutomations: true,
			automationBadgeStyle: 'accent',
		}),
	}),
	SessionsList_AutomationsNewBadge_Soft: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Automations row has a compact right-aligned NEW pill with a subtle neutral fill, while the larger outlined New button remains visually distinct in the Sessions header.'],
		render: ctx => renderSessionsList(ctx, {
			sessions: [],
			showAutomations: true,
			automationBadgeStyle: 'soft',
		}),
	}),
	SessionsList_AutomationsNewBadge_Narrow: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['At the 170px minimum sidebar width, the Automations label remains readable and the outlined NEW capsule stays right-aligned without changing the row height.'],
		render: ctx => renderSessionsList(ctx, {
			sessions: [],
			showAutomations: true,
			width: 170,
		}),
	}),
	SessionsList_AutomationsNewBadge_Running: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The Automations row shows its running status icon and the outlined NEW capsule together without overlap or layout shift.'],
		render: ctx => renderSessionsList(ctx, {
			sessions: [],
			showAutomations: true,
			automationRunStatus: 'running',
		}),
	}),
	SessionsList_CustomGroup_Phone: defineComponentFixture({
		render: ctx => renderSessionsList(ctx, { sessions: GROUPED_SESSIONS, groups: [GROUP], phone: true, width: 340 }),
	}),
	// A session whose nested chats each surface their own pending approval on
	// their own row, plus an approval on the session's main chat (on the session
	// row). Exercises the per-chat approval rendering and row-height reservation.
	SessionsList_NestedChatApprovals: defineComponentFixture({
		render: ctx => renderSessionsList(ctx, {
			sessions: [
				{
					id: 'a',
					title: 'HTTP Client Retry Plan',
					workspace: 'vscode-tools',
					minutesAgo: 2,
					status: SessionStatus.NeedsInput,
					mainApprovalCommand: 'yarn workspace @vscode-tools/server build --watch',
					chats: [
						{ id: 'task-a', title: 'Task A', status: SessionStatus.NeedsInput, approvalCommand: 'yarn workspace @vscode-tools/server build' },
						{ id: 'task-b', title: 'Task B' },
						{ id: 'task-c', title: 'Task C', status: SessionStatus.NeedsInput, approvalCommand: 'npm run test:integration -- --grep "retry"' },
					],
				},
			],
			width: 340,
		}),
	}),
	SessionsList_NestedChatHierarchyGuides: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['An expanded session has two nested chat rows. A single vertical hierarchy guide runs continuously from below the parent session icon through the first child and ends in an L-shaped connector at the final child, with no gaps between rows.'],
		render: ctx => renderSessionsList(ctx, {
			sessions: [
				{
					id: 'a',
					title: 'HTTP Client Retry Plan',
					workspace: 'vscode-tools',
					minutesAgo: 2,
					chats: [
						{ id: 'task-a', title: 'Task A' },
						{ id: 'task-b', title: 'Task B' },
					],
				},
			],
			revealHierarchyGuides: true,
			width: 340,
		}),
	}),
	SessionsList_NestedChatApprovals_Phone: defineComponentFixture({
		render: ctx => renderSessionsList(ctx, {
			sessions: [
				{
					id: 'a',
					title: 'HTTP Client Retry Plan',
					workspace: 'vscode-tools',
					minutesAgo: 2,
					status: SessionStatus.NeedsInput,
					chats: [
						{ id: 'task-a', title: 'Task A', status: SessionStatus.NeedsInput, approvalCommand: 'yarn workspace @vscode-tools/server build' },
						{ id: 'task-b', title: 'Task B' },
					],
				},
			],
			phone: true,
			width: 340,
		}),
	}),
});
