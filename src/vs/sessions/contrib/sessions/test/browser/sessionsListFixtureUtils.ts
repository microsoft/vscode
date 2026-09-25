/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { OS } from '../../../../../base/common/platform.js';
import { ExtUri, isEqual } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuActionOptions, IMenuCreateOptions, IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, getChatSessionArchiveActionPresentation, getChatSessionArchiveActionWording, IChatSessionArchiveActionPresentation } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { createUSLayoutResolvedKeybinding } from '../../../../../platform/keybinding/test/common/keybindingsTestUtils.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { AgentSessionApprovalKind, AgentSessionApprovalModel, IAgentSessionApprovalInfo } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import type { IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IVoicePlaybackService } from '../../../../../workbench/contrib/chat/common/voicePlaybackService.js';
import { IWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/common/assignmentService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ComponentFixtureContext, ComponentFixtureOptions, createEditorServices, defineComponentFixture, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { TestProductService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { Menus } from '../../../../browser/menus.js';
import { IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { ISessionGroupsService, SessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionsListModelService, SessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionSectionOrderService, SessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsWindowUsageService } from '../../../../services/sessions/browser/sessionsWindowUsageService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { buildTestSession, ITestChatSpec, ITestSession, ITestSessionSpec } from '../../../../services/sessions/test/common/testSessionBuilder.js';
import { BlockedSessionReason, BlockedSessions } from '../../../blockedSessions/browser/blockedSessions.js';
import { NEW_SESSION_ACTION_ID } from '../../../chat/common/constants.js';
import { NEW_SESSION_BUTTON_STYLE_SETTING, NEW_SESSION_BUTTON_STYLE_TREATMENT, NewSessionActionViewItemContribution, type NewSessionButtonStyle } from '../../browser/sessionsActions.js';
import { SessionChatItem, SessionsGrouping, SessionsList, SessionsListItemReference, SessionsSorting } from '../../browser/views/sessionsList.js';
import { renderSessionsHeader } from '../../browser/views/sessionsView.js';
import { SessionsArchiveActionsContribution } from '../../browser/views/sessionsViewActions.js';
import { TestSessionsList } from './testSessionsList.js';

import '../../browser/media/sessionsList.css';
import '../../browser/media/sessionsViewPane.css';
import '../../browser/media/newSessionActionViewItem.css';

//#region State

/** A peer chat of a {@link ISessionsListFixtureSession}. */
export interface ISessionsListFixtureChat extends ITestChatSpec {
	/** Terminal command awaiting approval, shown on the chat row. */
	readonly approvalCommand?: string;
}

/** A session in the list, described as plain data. */
export interface ISessionsListFixtureSession extends ITestSessionSpec {
	readonly chats?: readonly ISessionsListFixtureChat[];
	/** Pinned to the sidebar's Pinned section. */
	readonly pinned?: boolean;
	/** The session's view is pinned in the sessions grid. */
	readonly sticky?: boolean;
	readonly hasFailingCI?: boolean;
	/** Terminal command awaiting approval on the main chat, shown on the session row. */
	readonly approvalCommand?: string;
}

/** A custom group. Groups render in the order they are listed. */
export interface ISessionsListFixtureGroup {
	/** Fixture-local id used by row references. */
	readonly id: string;
	readonly name: string;
	/** Ids of the member sessions. */
	readonly sessions?: readonly string[];
}

/**
 * Addresses a row by the fixture data it renders: a session, one of its chats,
 * a custom group, a workspace section, or any section by id (such as `pinned`,
 * `quickchats`, `external`, `archived`, `recent`, or `older`).
 */
export type SessionsListFixtureRow =
	| { readonly session: string; readonly chat?: string }
	| { readonly group: string }
	| { readonly workspace: string }
	| { readonly section: string };

/** How the list presents its rows. */
export interface ISessionsListFixtureView {
	readonly grouping?: SessionsGrouping;
	readonly sorting?: SessionsSorting;
	readonly compact?: boolean;
	readonly phone?: boolean;
	readonly width?: number;
	readonly height?: number;
	/** Rows to collapse, or `'all'` for every section. */
	readonly collapsed?: 'all' | readonly SessionsListFixtureRow[];
	/** Rows to expand, such as the Pinned section, which starts collapsed. */
	readonly expanded?: readonly SessionsListFixtureRow[];
	/** Defaults to whether any session is archived. */
	readonly showArchived?: boolean;
	readonly showEmptyGroups?: boolean;
	readonly reducedMotion?: boolean;
}

/** Pointer and keyboard state, applied after the list renders. */
export interface ISessionsListFixtureInteraction {
	readonly selected?: readonly SessionsListFixtureRow[];
	/** The row with keyboard focus. */
	readonly focused?: SessionsListFixtureRow;
	/** Whether the list owns DOM focus. Defaults to `true` when {@link focused} is set. */
	readonly listFocused?: boolean;
	/** The row under the pointer, rendered with the `.hovered` row class. */
	readonly hovered?: SessionsListFixtureRow;
	/** The session, chat, or group row showing its inline rename editor. */
	readonly renaming?: SessionsListFixtureRow;
	/** Creates a group from these sessions and shows its name editor, like Create Group. */
	readonly createGroupFrom?: readonly string[];
}

/** The Sessions header above the list. */
export interface ISessionsListFixtureHeader {
	/** Applied as a setting change after the header renders. */
	readonly newSessionButtonStyle?: NewSessionButtonStyle;
	/** Applied through the experiment treatment. */
	readonly newSessionButtonTreatment?: NewSessionButtonStyle;
	readonly automations?: boolean;
	readonly automationRunStatus?: IAutomationRun['status'];
	/** Shows Automations and Customizations as navigation rows above the Sessions header. */
	readonly navigationShortcuts?: boolean;
	/** Count shown on the Customizations navigation row. */
	readonly customizationsCount?: number;
	/** Shows the Customizations navigation row's migrations-available indicator. */
	readonly customizationMigrationsAvailable?: boolean;
}

/** Everything a sessions list fixture renders. */
export interface ISessionsListFixtureState {
	readonly sessions: readonly ISessionsListFixtureSession[];
	readonly groups?: readonly ISessionsListFixtureGroup[];
	readonly view?: ISessionsListFixtureView;
	readonly interaction?: ISessionsListFixtureInteraction;
	/** Renders the Sessions header above the list. */
	readonly header?: ISessionsListFixtureHeader;
	/** Configuration values by setting id. */
	readonly settings?: Readonly<Record<string, unknown>>;
	/** Room around the list, e.g. for an onboarding callout. */
	readonly frame?: { readonly width: number; readonly height: number };
}

/** A rendered sessions list fixture. */
export interface ISessionsListFixture {
	readonly list: TestSessionsList;
	readonly container: HTMLElement;
	readonly listHost: HTMLElement;
	readonly instantiationService: TestInstantiationService;
	/** Built sessions by fixture id, with handles to change their state. */
	readonly sessions: ReadonlyMap<string, ITestSession>;
	resolve(row: SessionsListFixtureRow): SessionsListItemReference;
}

/** Defines a themed fixture that renders the given state. */
export function defineSessionsListFixture(
	state: ISessionsListFixtureState,
	options: Omit<ComponentFixtureOptions, 'render'> & { readonly afterRender?: (fixture: ISessionsListFixture, context: ComponentFixtureContext) => void | Promise<void> } = {},
): ReturnType<typeof defineComponentFixture> {
	const { afterRender, ...fixtureOptions } = options;
	return defineComponentFixture({
		...fixtureOptions,
		render: async context => {
			const fixture = await renderSessionsListFixture(context, state);
			await afterRender?.(fixture, context);
		},
	});
}

//#endregion

//#region Services

/** Production timers settle within this delay, e.g. the 50ms menu debounce and next-frame list updates. */
const SETTLE_DELAY = 100;

/** The sessions list still reads this Copilot-internal service (#320480); fixtures stub it by id instead of importing it. */
const IFixtureAgentSessionsService = createDecorator<object>('agentSessions');

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

type MenuActionGroups = [string, Array<MenuItemAction | SubmenuItemAction>][];

/** The wording the shared archive action registrations use; each fixture's menus show its own wording. */
const REGISTERED_ARCHIVE_WORDING = ChatSessionArchiveActionWording.Archive;

/**
 * Production menus, plus the header's New Session action, which the fixture
 * bundle does not register. Archive actions show in this fixture's wording.
 */
class SessionsListFixtureMenuService extends MenuService {
	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(commandService, keybindingService, storageService);
	}

	override createMenu(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuCreateOptions): IMenu {
		if (id === Menus.SidebarSessionsHeader) {
			const newSession = new MenuItemAction({ id: NEW_SESSION_ACTION_ID, title: 'New Session' }, undefined, undefined, undefined, undefined, contextKeyService, this.commandService);
			return { onDidChange: Event.None, getActions: () => [['navigation', [newSession]]], dispose: () => { } };
		}
		const menu = super.createMenu(id, contextKeyService, options);
		return {
			onDidChange: menu.onDidChange,
			getActions: actionOptions => this.applyArchiveWording(menu.getActions(actionOptions), contextKeyService, actionOptions),
			dispose: () => menu.dispose(),
		};
	}

	override getMenuActions(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuActionOptions): MenuActionGroups {
		return this.applyArchiveWording(super.getMenuActions(id, contextKeyService, options), contextKeyService, options);
	}

	/**
	 * Shows the shared archive action registrations in this fixture's wording.
	 * Production actions take their title and icon from the wording's
	 * presentation, so the registered presentation's title identifies them.
	 */
	private applyArchiveWording(groups: MenuActionGroups, contextKeyService: IContextKeyService, options: IMenuActionOptions | undefined): MenuActionGroups {
		const wording = getChatSessionArchiveActionWording(this.configurationService);
		if (wording === REGISTERED_ARCHIVE_WORDING) {
			return groups;
		}
		const registered = getChatSessionArchiveActionPresentation(REGISTERED_ARCHIVE_WORDING);
		const presentation = getChatSessionArchiveActionPresentation(wording);
		const kinds = Object.keys(registered) as (keyof IChatSessionArchiveActionPresentation)[];
		return groups.map(([group, actions]) => [group, actions.map(action => {
			if (!(action instanceof MenuItemAction)) {
				return action;
			}
			const kind = kinds.find(kind => registered[kind].title === action.item.title);
			if (!kind) {
				return action;
			}
			const { title, icon } = presentation[kind];
			return new MenuItemAction({ ...action.item, title, icon }, action.alt?.item, options, action.hideActions, action.menuKeybinding, contextKeyService, this.commandService);
		})]);
	}
}

/** A live sessions catalog: renames, archiving, and read state update the rendered sessions. */
class FixtureSessionsManagementService extends mock<ISessionsManagementService>() {
	private readonly store = new DisposableStore();
	private readonly changeEmitter = this.store.add(new Emitter<ISessionsChangeEvent>());
	private readonly archiveEmitter = this.store.add(new Emitter<ISession>());
	private readonly unarchiveEmitter = this.store.add(new Emitter<ISession>());
	override readonly onDidChangeSessions = this.changeEmitter.event;
	override readonly onDidArchiveSession = this.archiveEmitter.event;
	override readonly onDidUnarchiveSession = this.unarchiveEmitter.event;
	override readonly onDidChangeSessionTypes = Event.None;
	override readonly onDidStartSession = Event.None;
	override readonly onWillSendRequest = Event.None;
	override readonly onDidSendRequest = Event.None;
	override readonly onDidDeleteSession = Event.None;
	override readonly onDidDeleteChat = Event.None;
	override readonly onDidRenameChat = Event.None;
	override readonly onDidRenameSession = Event.None;
	override readonly onDidReplaceSession = Event.None;
	override readonly onDidDiscardNewSession = Event.None;
	override readonly onDidReplaceNewDraftSession = Event.None;

	constructor(private readonly sessions: ReadonlyMap<string, ITestSession>) {
		super();
	}

	override getSessions(): ISession[] {
		return [...this.sessions.values()].map(session => session.session);
	}

	override getSession(resource: URI): ISession | undefined {
		return this.find(resource)?.session;
	}

	override async markRead(session: ISession): Promise<void> {
		this.find(session.resource)?.isRead.set(true, undefined);
	}

	override async markUnread(session: ISession): Promise<void> {
		this.find(session.resource)?.isRead.set(false, undefined);
	}

	override async markAllRead(sessions: readonly ISession[]): Promise<void> {
		for (const session of sessions) {
			await this.markRead(session);
		}
	}

	override async renameSession(session: ISession, title: string): Promise<void> {
		this.find(session.resource)?.title.set(title, undefined);
	}

	override async renameChat(session: ISession, chatUri: URI, title: string): Promise<void> {
		const chats = this.find(session.resource)?.chats.values() ?? [];
		[...chats].find(chat => isEqual(chat.chat.resource, chatUri))?.title.set(title, undefined);
	}

	override async archiveSession(session: ISession): Promise<void> {
		this.find(session.resource)?.isArchived.set(true, undefined);
		this.archiveEmitter.fire(session);
		this.changeEmitter.fire({ added: [], removed: [], changed: [session] });
	}

	override async unarchiveSession(session: ISession): Promise<void> {
		this.find(session.resource)?.isArchived.set(false, undefined);
		this.unarchiveEmitter.fire(session);
		this.changeEmitter.fire({ added: [], removed: [], changed: [session] });
	}

	override async cancelCurrentRequest(): Promise<void> { }

	override async importSession(): Promise<void> { }

	dispose(): void {
		this.store.dispose();
	}

	private find(resource: URI): ITestSession | undefined {
		return [...this.sessions.values()].find(session => isEqual(session.session.resource, resource));
	}
}

let archiveActions: { readonly contribution: SessionsArchiveActionsContribution; refs: number } | undefined;

/**
 * Registers the production archive actions while any fixture is mounted. Both
 * wordings share command ids, so they are registered once and never switched:
 * {@link SessionsListFixtureMenuService} shows them in each fixture's wording,
 * which keeps concurrently mounted fixtures independent.
 */
function acquireArchiveActions(): IDisposable {
	archiveActions ??= {
		contribution: new SessionsArchiveActionsContribution(new TestConfigurationService({ [ChatSessionArchiveActionWordingSettingId]: REGISTERED_ARCHIVE_WORDING })),
		refs: 0,
	};
	const acquired = archiveActions;
	acquired.refs++;
	return toDisposable(() => {
		if (--acquired.refs === 0) {
			acquired.contribution.dispose();
			archiveActions = undefined;
		}
	});
}

function collectApprovals(state: ISessionsListFixtureState, sessions: ReadonlyMap<string, ITestSession>): Map<string, IAgentSessionApprovalInfo> {
	const approvals = new Map<string, IAgentSessionApprovalInfo>();
	const add = (resource: URI, command: string, since: Date) => approvals.set(resource.toString(), {
		approvalId: resource.toString(),
		kind: AgentSessionApprovalKind.Terminal,
		label: command,
		languageId: 'shellscript',
		since,
		confirm: () => { },
	});
	for (const spec of state.sessions) {
		const session = sessions.get(spec.id)!;
		const since = session.session.updatedAt.get();
		if (spec.approvalCommand !== undefined) {
			add(session.mainChat.chat.resource, spec.approvalCommand, since);
		}
		for (const chat of spec.chats ?? []) {
			if (chat.approvalCommand !== undefined) {
				add(session.chats.get(chat.id)!.chat.resource, chat.approvalCommand, since);
			}
		}
	}
	return approvals;
}

//#endregion

//#region Rendering

/**
 * Renders the production sessions list for the given state. Sessions, groups,
 * and pins flow through the real list-state services and toolbars show the
 * production actions, so a fixture only describes data and interaction.
 */
export async function renderSessionsListFixture(context: ComponentFixtureContext, state: ISessionsListFixtureState): Promise<ISessionsListFixture> {
	const { container, disposableStore } = context;
	const view = state.view ?? {};
	const header = state.header;
	const interaction = state.interaction ?? {};

	const sessions = new Map(state.sessions.map(spec => [spec.id, buildTestSession(spec)] as const));
	const getSession = (id: string): ITestSession => {
		const session = sessions.get(id);
		if (!session) {
			throw new Error(`Unknown fixture session '${id}'.`);
		}
		return session;
	};
	const approvals = collectApprovals(state, sessions);
	const approvalModel = new class extends mock<AgentSessionApprovalModel>() {
		override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
			return constObservable(approvals.get(resource.toString()));
		}
	}();
	const visibleSessions = state.sessions.filter(spec => spec.sticky).map(spec => new class extends mock<IActiveSession>() {
		override readonly sessionId = spec.id;
		override readonly sticky: IObservable<boolean> = constObservable(true);
	}());
	const automationRuns = observableValue<readonly IAutomationRun[]>('fixtureAutomationRuns', []);
	const newSessionButtonStyle = header?.newSessionButtonStyle ?? header?.newSessionButtonTreatment;
	const newSessionKeybinding = newSessionButtonStyle ? createUSLayoutResolvedKeybinding(KeyMod.CtrlCmd | KeyCode.KeyN, OS) : undefined;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IContextKeyService, ContextKeyService);
			reg.define(IMenuService, SessionsListFixtureMenuService);
			reg.defineInstance(IActionViewItemService, new FixtureActionViewItemService());
			reg.define(IListService, ListService);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(IProductService, TestProductService);
			reg.defineInstance(ISessionsManagementService, new FixtureSessionsManagementService(sessions));
			reg.define(ISessionsListModelService, SessionsListModelService);
			reg.define(ISessionGroupsService, SessionGroupsService);
			reg.define(ISessionSectionOrderService, SessionSectionOrderService);
			const reducedMotion = view.reducedMotion;
			if (reducedMotion !== undefined) {
				reg.defineInstance(IAccessibilityService, new class extends TestAccessibilityService {
					override isMotionReduced(): boolean { return reducedMotion; }
				}());
			}
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
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() {
				override readonly onDidActiveEditorChange = Event.None;
				override readonly activeEditor = undefined;
			}());
			reg.defineInstance(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() { }());
			reg.defineInstance(IChatService, new class extends mock<IChatService>() {
				override readonly chatModels: IObservable<Iterable<IChatModel>> = constObservable([]);
			}());
			reg.defineInstance(IFixtureAgentSessionsService, {
				model: { observeSession: () => constObservable(undefined) },
			});
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> = constObservable(visibleSessions);
				override readonly activeSession: IObservable<IActiveSession | undefined> = constObservable(undefined);
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
			reg.defineInstance(ISessionsWindowUsageService, new class extends mock<ISessionsWindowUsageService>() {
				override readonly hadPriorWindowOpen = true;
				override readonly windowOpenCount = 2;
			}());
			reg.defineInstance(ILifecycleService, new class extends mock<ILifecycleService>() {
				override phase = LifecyclePhase.Eventually;
				override when(): Promise<void> { return Promise.resolve(); }
			}());
			reg.defineInstance(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
				override readonly pendingResponseVersion: IObservable<number> = constObservable(0);
				override hasPendingResponse() { return false; }
			}());
			reg.defineInstance(IAutomationService, new class extends mock<IAutomationService>() {
				override readonly automations = constObservable([]);
				override readonly runs = automationRuns;
				override readonly catalogueState = constObservable('ready' as const);
			}());
			reg.defineInstance(IWorkbenchAssignmentService, new class extends mock<IWorkbenchAssignmentService>() {
				override readonly onDidRefetchAssignments = Event.None;
				override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
					return name === NEW_SESSION_BUTTON_STYLE_TREATMENT ? header?.newSessionButtonTreatment as T | undefined : undefined;
				}
			}());
			reg.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				override readonly extUri = new ExtUri(() => true);
			}());
			reg.defineInstance(ICustomViewService, new class extends mock<ICustomViewService>() {
				override readonly activeCustomView = constObservable(undefined);
				override hideCustomView(): void { }
			}());
		},
	});

	const failingCISessions = state.sessions.filter(spec => spec.hasFailingCI).map(spec => getSession(spec.id).session);
	instantiationService.stubInstance(BlockedSessions, new class extends mock<BlockedSessions>() {
		override readonly blockedSessionsWithReasons = constObservable(failingCISessions.map(session => ({ session, reason: BlockedSessionReason.FailingCI, occurrenceId: 'failingCI:fixture' })));
		override dispose = Disposable.None.dispose;
	}());

	const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	// Render terminal-approval labels as real (monospace) code blocks; otherwise the command is blank.
	await configurationService.setUserConfiguration('editor', { fontFamily: 'monospace' });
	for (const [key, value] of Object.entries(state.settings ?? {})) {
		await configurationService.setUserConfiguration(key, value);
	}
	disposableStore.add(acquireArchiveActions());
	instantiationService.get(IMarkdownRendererService).setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));

	const contextKeyService = instantiationService.get(IContextKeyService);
	ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
	// Phone layout drives both the visual CSS class and the tree delegate's row heights.
	if (view.phone) {
		IsPhoneLayoutContext.bindTo(contextKeyService).set(true);
	}
	if (header?.automations || header?.navigationShortcuts) {
		ChatAutomationsEnabledContext.bindTo(contextKeyService).set(true);
	}

	const groupIds = seedListState(instantiationService, state, getSession);
	const resolve = (row: SessionsListFixtureRow): SessionsListItemReference => {
		if (hasKey(row, { group: true })) {
			const groupId = groupIds.get(row.group);
			if (!groupId) {
				throw new Error(`Unknown fixture group '${row.group}'.`);
			}
			return { group: groupId };
		}
		if (hasKey(row, { workspace: true })) {
			return { section: `workspace:${row.workspace}` };
		}
		if (hasKey(row, { section: true })) {
			return { section: row.section };
		}
		const session = getSession(row.session);
		if (row.chat === undefined) {
			return { session: session.session.resource };
		}
		const chat = session.chats.get(row.chat);
		if (!chat) {
			throw new Error(`Unknown chat '${row.chat}' of fixture session '${row.session}'.`);
		}
		return { session: session.session.resource, chat: chat.chat.resource };
	};

	const width = view.width ?? 340;
	const height = view.height ?? (view.phone ? 260 : header && !header.navigationShortcuts ? 180 : 220);
	container.style.width = `${state.frame?.width ?? width}px`;
	container.style.height = `${state.frame?.height ?? view.height ?? (view.phone ? 260 : 220)}px`;
	container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
	if (state.frame) {
		container.style.position = 'relative';
	}
	if (view.phone) {
		container.classList.add('agent-sessions-workbench', 'phone-layout');
	}

	let listParent = container;
	let createSessionsHeader: ((container: HTMLElement, disposables: DisposableStore) => HTMLElement) | undefined;
	if (header) {
		container.classList.add('agent-sessions-viewpane', 'agent-sessions-section');
		const content = DOM.append(container, DOM.$('.agent-sessions-content'));
		const sessionsHeaderContainer = DOM.append(content, DOM.$('.agent-sessions-header-container'));
		disposableStore.add(instantiationService.createInstance(NewSessionActionViewItemContribution));
		const renderedHeader = renderSessionsHeader(sessionsHeaderContainer, false, instantiationService, contextKeyService, disposableStore);
		renderedHeader.toolbar?.refresh();
		// Like the Sessions view, render the header inside the tree when the navigation rows lead it.
		createSessionsHeader = (headerContainer, disposables) => {
			const treeHeader = renderSessionsHeader(headerContainer, false, instantiationService, contextKeyService, disposables);
			treeHeader.toolbar?.refresh();
			return treeHeader.row;
		};
		if (header.navigationShortcuts) {
			DOM.hide(renderedHeader.row);
		}
		listParent = content;
	}
	const listHost = DOM.append(listParent, DOM.$(header ? '.agent-sessions-control-container' : 'div'));
	if (state.frame) {
		listHost.style.width = `${width}px`;
	}

	const list = disposableStore.add(instantiationService.createInstance(TestSessionsList, listHost, {
		grouping: () => view.grouping ?? SessionsGrouping.Workspace,
		sorting: () => view.sorting ?? SessionsSorting.Created,
		compact: () => view.compact ?? false,
		showNavigationShortcuts: () => header?.navigationShortcuts ?? false,
		customizationsCount: constObservable(header?.customizationsCount ?? 0),
		customizationMigrationsAvailable: constObservable(header?.customizationMigrationsAvailable ?? false),
		createSessionsHeader,
		onSessionOpen: () => { },
		approvalModel,
	}));
	if (view.showArchived ?? state.sessions.some(spec => spec.isArchived)) {
		list.setExcludeArchived(false);
	}
	if (view.showEmptyGroups !== undefined) {
		list.setShowEmptyGroups(view.showEmptyGroups);
	}
	list.layout(height, width);
	if (view.collapsed === 'all') {
		list.collapseAllSections();
	} else {
		for (const row of view.collapsed ?? []) {
			setCollapsed(list, resolve(row), true);
		}
	}
	for (const row of view.expanded ?? []) {
		setCollapsed(list, resolve(row), false);
	}

	if (header) {
		await renderHeaderState(list, container, instantiationService, header, automationRuns);
	}

	await timeout(SETTLE_DELAY);
	applyInteraction(context, list, interaction, resolve, getSession, groupIds);
	await timeout(SETTLE_DELAY);

	return { list, container, listHost, instantiationService, sessions, resolve };
}

/** Seeds pins, groups, and group order through the list-state services, returning real group ids by fixture id. */
function seedListState(instantiationService: TestInstantiationService, state: ISessionsListFixtureState, getSession: (id: string) => ITestSession): Map<string, string> {
	const listModelService = instantiationService.get(ISessionsListModelService);
	for (const spec of state.sessions) {
		if (spec.pinned) {
			listModelService.pinSession(getSession(spec.id).session);
		}
	}

	const groupsService = instantiationService.get(ISessionGroupsService);
	const groupIds = new Map<string, string>();
	for (const group of state.groups ?? []) {
		const created = groupsService.createGroup(group.name, (group.sessions ?? []).map(id => getSession(id).session.sessionId));
		groupIds.set(group.id, created.id);
	}
	// Groups created together share a timestamp, so persist the listed order explicitly.
	const orderIds = [...groupIds.values()].map(id => `group:${id}`);
	if (orderIds.length > 1) {
		const sectionOrderService = instantiationService.get(ISessionSectionOrderService);
		sectionOrderService.reorder(orderIds, orderIds[1], orderIds[0], 'after');
	}
	return groupIds;
}

function setCollapsed(list: TestSessionsList, item: SessionsListItemReference, collapsed: boolean): void {
	if (!list.setItemCollapsed(item, collapsed)) {
		throw new Error(`Expected a collapsible row for ${JSON.stringify(item)}.`);
	}
}

async function renderHeaderState(list: SessionsList, container: HTMLElement, instantiationService: TestInstantiationService, header: ISessionsListFixtureHeader, automationRuns: ISettableObservable<readonly IAutomationRun[]>): Promise<void> {
	if (header.automations) {
		await list.resetAutomationsNewBadge();
	}
	if (header.automationRunStatus) {
		automationRuns.set([{
			id: 'fixture-run',
			automationId: 'fixture-automation',
			status: header.automationRunStatus,
			trigger: 'schedule',
			startedAt: new Date().toISOString(),
		}], undefined);
	}
	await Promise.resolve();
	if (header.newSessionButtonStyle) {
		const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		await configurationService.setUserConfiguration(NEW_SESSION_BUTTON_STYLE_SETTING, header.newSessionButtonStyle);
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([NEW_SESSION_BUTTON_STYLE_SETTING]),
			change: { keys: [NEW_SESSION_BUTTON_STYLE_SETTING], overrides: [] },
			affectsConfiguration: configuration => configuration === NEW_SESSION_BUTTON_STYLE_SETTING,
		});
	}
	if (!container.querySelector('.agent-sessions-compact-new-button')) {
		throw new Error('Expected the production New Session action in the Sessions header.');
	}
	const style = header.newSessionButtonStyle ?? header.newSessionButtonTreatment;
	if (style === 'lightweight' && !container.querySelector('.agent-sessions-compact-new-button.lightweight:not(.lightweight-keybinding-background)')) {
		throw new Error('Expected the New Session action to render the lightweight style.');
	}
	if (style === 'lightweightWithKeybindingBackground' && !container.querySelector('.agent-sessions-compact-new-button.lightweight.lightweight-keybinding-background')) {
		throw new Error('Expected the New Session action to render the lightweight keybinding-background style.');
	}
}

function applyInteraction(context: ComponentFixtureContext, list: TestSessionsList, interaction: ISessionsListFixtureInteraction, resolve: (row: SessionsListFixtureRow) => SessionsListItemReference, getSession: (id: string) => ITestSession, groupIds: ReadonlyMap<string, string>): void {
	if (interaction.selected && !list.setSelectedItems(interaction.selected.map(resolve))) {
		throw new Error(`Expected selectable session or chat rows for ${JSON.stringify(interaction.selected)}.`);
	}
	if (interaction.focused && !list.setFocusedItem(resolve(interaction.focused))) {
		throw new Error(`Expected a row to focus for ${JSON.stringify(interaction.focused)}.`);
	}
	if (interaction.listFocused ?? (interaction.focused !== undefined)) {
		context.focus(list);
	}
	if (interaction.hovered) {
		simulateHover(list, resolve(interaction.hovered), context.disposableStore);
	}
	if (interaction.createGroupFrom) {
		list.createGroupFromSessions(interaction.createGroupFrom.map(id => getSession(id).session));
		if (!list.element.querySelector('.session-group-input input')) {
			throw new Error('Expected the new group to show its name editor.');
		}
	}
	if (interaction.renaming) {
		startRename(list, interaction.renaming, getSession, groupIds);
	}
}

function startRename(list: SessionsList, row: SessionsListFixtureRow, getSession: (id: string) => ITestSession, groupIds: ReadonlyMap<string, string>): void {
	if (hasKey(row, { group: true })) {
		const groupId = groupIds.get(row.group);
		if (!groupId) {
			throw new Error(`Unknown fixture group '${row.group}'.`);
		}
		list.beginRenameGroup(groupId);
		if (!list.element.querySelector('.session-group-input input')) {
			throw new Error(`Expected group '${row.group}' to show its name editor.`);
		}
		return;
	}
	if (!hasKey(row, { session: true })) {
		throw new Error('Only session, chat, and group rows can be renamed.');
	}
	const session = getSession(row.session);
	const chat = row.chat === undefined ? undefined : session.chats.get(row.chat);
	const started = chat
		? list.beginRenameChat(new SessionChatItem(session.session, chat.chat))
		: list.beginRenameSession(session.session);
	if (!started || !list.element.querySelector('.session-inline-rename-input input')) {
		throw new Error(`Expected ${JSON.stringify(row)} to show its inline rename editor.`);
	}
}

/**
 * Renders pointer hover on a row: the `.hovered` class stands in for CSS
 * `:hover`, and a `mouseover` drives the list's own hover tracking. Reapplied
 * after list updates, which can recycle row elements.
 */
function simulateHover(list: TestSessionsList, item: SessionsListItemReference, store: DisposableStore): void {
	let hoveredRow: HTMLElement | undefined;
	const apply = () => {
		const row = list.getItemRow(item);
		if (row === hoveredRow) {
			return;
		}
		hoveredRow?.classList.remove('hovered');
		hoveredRow = row;
		row?.classList.add('hovered');
		row?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
	};
	list.revealItem(item);
	apply();
	if (!hoveredRow) {
		throw new Error(`Expected a rendered row to hover for ${JSON.stringify(item)}.`);
	}
	store.add(list.onDidUpdate(apply));
	store.add(toDisposable(() => hoveredRow?.classList.remove('hovered')));
}

//#endregion
