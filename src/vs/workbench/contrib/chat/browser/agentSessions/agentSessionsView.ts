/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsessionsview.css';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { IViewPaneOptions, ViewAction, ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, Extensions as ViewExtensions, ViewContainerLocation, IViewsRegistry, IViewDescriptor, IViewDescriptorService } from '../../../../common/views.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IOpenEvent, WorkbenchCompressibleAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { $, append } from '../../../../../base/browser/dom.js';
import { AgentSessionsViewModel, IAgentSessionViewModel, IAgentSessionsViewModel, isLocalAgentSessionItem } from './agentSessionViewModel.js';
import { AgentSessionRenderer, AgentSessionsAccessibilityProvider, AgentSessionsCompressionDelegate, AgentSessionsDataSource, AgentSessionsDragAndDrop, AgentSessionsIdentityProvider, AgentSessionsKeyboardNavigationLabelProvider, AgentSessionsListDelegate, AgentSessionsSorter } from './agentSessionsViewer.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { IAction, Separator, toAction } from '../../../../../base/common/actions.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { IMenuService, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { findExistingChatEditorByUri, getSessionItemContextOverlay, NEW_CHAT_SESSION_ACTION_ID } from '../chatSessions/common.js';
import { ACTION_ID_OPEN_CHAT } from '../actions/chatActions.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { assertReturnsDefined, upcast } from '../../../../../base/common/types.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { ITreeContextMenuEvent } from '../../../../../base/browser/ui/tree/tree.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { getActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IChatService } from '../../common/chatService.js';
import { IChatWidgetService } from '../chat.js';
import { AGENT_SESSIONS_VIEW_ID, AGENT_SESSIONS_VIEW_CONTAINER_ID, AgentSessionProviders } from './agentSessions.js';
import { TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';

export class AgentSessionsView extends ViewPane {

	private sessionsViewModel: IAgentSessionsViewModel | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ICommandService private readonly commandService: ICommandService,
		@IProgressService private readonly progressService: IProgressService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IChatService private readonly chatService: IChatService,
		@IMenuService private readonly menuService: IMenuService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.registerActions();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		container.classList.add('agent-sessions-view');

		// New Session
		this.createNewSessionButton(container);

		// Sessions List
		this.createList(container);

		this.registerListeners();
	}

	private registerListeners(): void {
		const list = assertReturnsDefined(this.list);

		// Sessions List
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (!visible || this.sessionsViewModel) {
				return;
			}

			if (!this.sessionsViewModel) {
				this.createViewModel();
			} else {
				this.list?.updateChildren();
			}
		}));

		this._register(list.onDidOpen(e => {
			this.openAgentSession(e);
		}));

		this._register(list.onMouseDblClick(({ element }) => {
			if (element === null) {
				this.commandService.executeCommand(ACTION_ID_OPEN_CHAT);
			}
		}));

		this._register(list.onContextMenu((e) => {
			this.showContextMenu(e);
		}));
	}

	private async openAgentSession(e: IOpenEvent<IAgentSessionViewModel | undefined>) {
		const session = e.element;
		if (!session) {
			return;
		}

		const existingSessionEditor = findExistingChatEditorByUri(session.resource, this.editorGroupsService);
		if (existingSessionEditor) {
			await existingSessionEditor.group.openEditor(existingSessionEditor.editor, e.editorOptions);
			return;
		}

		let sessionOptions: IChatEditorOptions;
		if (isLocalAgentSessionItem(session)) {
			sessionOptions = {};
		} else {
			sessionOptions = { title: { preferred: session.label } };
		}

		sessionOptions.ignoreInView = true;

		await this.editorService.openEditor({
			resource: session.resource,
			options: upcast<IEditorOptions, IChatEditorOptions>({
				...sessionOptions,
				title: { preferred: session.label },
				...e.editorOptions
			})
		});
	}

	private showContextMenu({ element: session, anchor }: ITreeContextMenuEvent<IAgentSessionViewModel>): void {
		if (!session) {
			return;
		}

		const menu = this.menuService.createMenu(MenuId.ChatSessionsMenu, this.contextKeyService.createOverlay(getSessionItemContextOverlay(
			{
				id: session.resource.toString(),
				...session
			},
			session.provider,
			this.chatWidgetService,
			this.chatService,
			this.editorGroupsService
		)));

		const marshalledSession = { session, $mid: MarshalledId.ChatSessionContext };
		const { secondary } = getActionBarActions(menu.getActions({ arg: marshalledSession, shouldForwardArgs: true }), 'inline'); this.contextMenuService.showContextMenu({
			getActions: () => secondary,
			getAnchor: () => anchor,
			getActionsContext: () => marshalledSession,
		});

		menu.dispose();
	}

	private registerActions(): void {

		this._register(registerAction2(class extends ViewAction<AgentSessionsView> {
			constructor() {
				super({
					id: 'agentSessionsView.refresh',
					title: localize2('refresh', "Refresh Agent Sessions"),
					icon: Codicon.refresh,
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', AGENT_SESSIONS_VIEW_ID),
						group: 'navigation',
						order: 1
					},
					viewId: AGENT_SESSIONS_VIEW_ID
				});
			}
			runInView(accessor: ServicesAccessor, view: AgentSessionsView): void {
				view.sessionsViewModel?.resolve(undefined);
			}
		}));

		this._register(registerAction2(class extends ViewAction<AgentSessionsView> {
			constructor() {
				super({
					id: 'agentSessionsView.find',
					title: localize2('find', "Find Agent Session"),
					icon: Codicon.search,
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', AGENT_SESSIONS_VIEW_ID),
						group: 'navigation',
						order: 2
					},
					viewId: AGENT_SESSIONS_VIEW_ID
				});
			}
			runInView(accessor: ServicesAccessor, view: AgentSessionsView): void {
				view.list?.openFind();
			}
		}));
	}

	//#region New Session Controls

	private newSessionContainer: HTMLElement | undefined;

	private createNewSessionButton(container: HTMLElement): void {
		this.newSessionContainer = append(container, $('.agent-sessions-new-session-container'));

		const newSessionButton = this._register(new ButtonWithDropdown(this.newSessionContainer, {
			title: localize('agentSessions.newSession', "New Session"),
			ariaLabel: localize('agentSessions.newSessionAriaLabel', "New Session"),
			contextMenuProvider: this.contextMenuService,
			actions: {
				getActions: () => {
					return this.getNewSessionActions();
				}
			},
			addPrimaryActionToDropdown: false,
			...defaultButtonStyles,
		}));

		newSessionButton.label = localize('agentSessions.newSession', "New Session");

		this._register(newSessionButton.onDidClick(() => this.commandService.executeCommand(ACTION_ID_OPEN_CHAT)));
	}

	private getNewSessionActions(): IAction[] {
		const actions: IAction[] = [];

		// Default action
		actions.push(toAction({
			id: 'newChatSession.default',
			label: localize('newChatSessionDefault', "New Local Session"),
			run: () => this.commandService.executeCommand(ACTION_ID_OPEN_CHAT)
		}));

		// Background (CLI)
		actions.push(toAction({
			id: 'newChatSessionFromProvider.background',
			label: localize('newBackgroundSession', "New Background Session"),
			run: () => this.commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${AgentSessionProviders.Background}`)
		}));

		// Cloud
		actions.push(toAction({
			id: 'newChatSessionFromProvider.cloud',
			label: localize('newCloudSession', "New Cloud Session"),
			run: () => this.commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${AgentSessionProviders.Cloud}`)
		}));

		let addedSeparator = false;
		for (const provider of this.chatSessionsService.getAllChatSessionContributions()) {
			if (provider.type === AgentSessionProviders.Background || provider.type === AgentSessionProviders.Cloud) {
				continue; // already added above
			}

			if (!addedSeparator) {
				actions.push(new Separator());
				addedSeparator = true;
			}

			const menuActions = this.menuService.getMenuActions(MenuId.ChatSessionsCreateSubMenu, this.scopedContextKeyService.createOverlay([
				[ChatContextKeys.sessionType.key, provider.type]
			]));

			const primaryActions = getActionBarActions(menuActions, () => true).primary;

			// Prefer provider creation actions...
			if (primaryActions.length > 0) {
				actions.push(...primaryActions);
			}

			// ...over our generic one
			else {
				actions.push(toAction({
					id: `newChatSessionFromProvider.${provider.type}`,
					label: localize('newChatSessionFromProvider', "New {0}", provider.displayName),
					run: () => this.commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${provider.type}`)
				}));
			}
		}

		// Install more
		actions.push(new Separator());
		actions.push(toAction({
			id: 'install-extensions',
			label: localize('chatSessions.installExtensions', "Install Chat Extensions..."),
			run: () => this.commandService.executeCommand('chat.sessions.gettingStarted')
		}));

		return actions;
	}

	//#endregion

	//#region Sessions List

	private listContainer: HTMLElement | undefined;
	private list: WorkbenchCompressibleAsyncDataTree<IAgentSessionsViewModel, IAgentSessionViewModel, FuzzyScore> | undefined;

	private createList(container: HTMLElement): void {
		this.listContainer = append(container, $('.agent-sessions-viewer'));

		this.list = this._register(this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree,
			'AgentSessionsView',
			this.listContainer,
			new AgentSessionsListDelegate(),
			new AgentSessionsCompressionDelegate(),
			[
				this.instantiationService.createInstance(AgentSessionRenderer)
			],
			new AgentSessionsDataSource(),
			{
				accessibilityProvider: new AgentSessionsAccessibilityProvider(),
				dnd: this.instantiationService.createInstance(AgentSessionsDragAndDrop),
				identityProvider: new AgentSessionsIdentityProvider(),
				horizontalScrolling: false,
				multipleSelectionSupport: false,
				findWidgetEnabled: true,
				defaultFindMode: TreeFindMode.Filter,
				keyboardNavigationLabelProvider: new AgentSessionsKeyboardNavigationLabelProvider(),
				sorter: new AgentSessionsSorter(),
				paddingBottom: AgentSessionsListDelegate.ITEM_HEIGHT
			}
		)) as WorkbenchCompressibleAsyncDataTree<IAgentSessionsViewModel, IAgentSessionViewModel, FuzzyScore>;
	}

	private createViewModel(): void {
		const sessionsViewModel = this.sessionsViewModel = this._register(this.instantiationService.createInstance(AgentSessionsViewModel));
		this.list?.setInput(sessionsViewModel);

		this._register(sessionsViewModel.onDidChangeSessions(() => {
			if (this.isBodyVisible()) {
				this.list?.updateChildren();
			}
		}));

		const didResolveDisposable = this._register(new MutableDisposable());
		this._register(sessionsViewModel.onWillResolve(() => {
			const didResolve = new DeferredPromise<void>();
			didResolveDisposable.value = Event.once(sessionsViewModel.onDidResolve)(() => didResolve.complete());

			this.progressService.withProgress(
				{
					location: this.id,
					title: localize('agentSessions.refreshing', 'Refreshing agent sessions...'),
					delay: 500
				},
				() => didResolve.p
			);
		}));
	}

	//#endregion

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		let treeHeight = height;
		treeHeight -= this.newSessionContainer?.offsetHeight ?? 0;

		this.list?.layout(treeHeight, width);
	}

	override focus(): void {
		super.focus();

		if (this.list?.getFocus().length) {
			this.list.domFocus();
		}
	}
}

//#region View Registration

const chatAgentsIcon = registerIcon('chat-sessions-icon', Codicon.commentDiscussionSparkle, 'Icon for Agent Sessions View');

const AGENT_SESSIONS_VIEW_TITLE = localize2('agentSessions.view.label', "Agent Sessions");

const agentSessionsViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: AGENT_SESSIONS_VIEW_CONTAINER_ID,
	title: AGENT_SESSIONS_VIEW_TITLE,
	icon: chatAgentsIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [AGENT_SESSIONS_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: AGENT_SESSIONS_VIEW_CONTAINER_ID,
	hideIfEmpty: true,
	order: 6,
}, ViewContainerLocation.AuxiliaryBar);

const agentSessionsViewDescriptor: IViewDescriptor = {
	id: AGENT_SESSIONS_VIEW_ID,
	containerIcon: chatAgentsIcon,
	containerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
	singleViewPaneContainerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
	name: AGENT_SESSIONS_VIEW_TITLE,
	canToggleVisibility: false,
	canMoveView: true,
	openCommandActionDescriptor: {
		id: AGENT_SESSIONS_VIEW_ID,
		title: AGENT_SESSIONS_VIEW_TITLE
	},
	ctorDescriptor: new SyncDescriptor(AgentSessionsView),
	when: ContextKeyExpr.and(
		ChatContextKeys.Setup.hidden.negate(),
		ChatContextKeys.Setup.disabled.negate(),
		ContextKeyExpr.equals(`config.${ChatConfiguration.AgentSessionsViewLocation}`, 'single-view'),
	)
};
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([agentSessionsViewDescriptor], agentSessionsViewContainer);

//#endregion
