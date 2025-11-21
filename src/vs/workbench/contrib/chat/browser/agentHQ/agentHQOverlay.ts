/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentHQOverlay.css';
import { $, append, addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IChatService } from '../../common/chatService.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IChatWidgetService } from '../chat.js';
import { AgentSessionsViewModel, IAgentSessionViewModel, IAgentSessionsViewModel } from '../agentSessions/agentSessionViewModel.js';
import { AgentSessionRenderer, AgentSessionsAccessibilityProvider, AgentSessionsCompressionDelegate, AgentSessionsDataSource, AgentSessionsDragAndDrop, AgentSessionsIdentityProvider, AgentSessionsKeyboardNavigationLabelProvider, AgentSessionsListDelegate, AgentSessionsSorter } from '../agentSessions/agentSessionsViewer.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { localize } from '../../../../../nls.js';
import { ITreeContextMenuEvent } from '../../../../../base/browser/ui/tree/tree.js';
import { getSessionItemContextOverlay } from '../chatSessions/common.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { IMarshalledChatSessionContext } from '../actions/chatSessionActions.js';
import { distinct } from '../../../../../base/common/arrays.js';
import { getFlatActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { IAgentHQService } from './agentHQService.js';

export class AgentHQOverlay extends Disposable {

	private container: HTMLElement | undefined;
	private overlay: HTMLElement | undefined;
	private widget: HTMLElement | undefined;
	private listContainer: HTMLElement | undefined;
	private list: WorkbenchCompressibleAsyncDataTree<IAgentSessionsViewModel, IAgentSessionViewModel, FuzzyScore> | undefined;
	private sessionsViewModel: IAgentSessionsViewModel | undefined;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose: Event<void> = this._onDidClose.event;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IThemeService private readonly themeService: IThemeService,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ICommandService private readonly commandService: ICommandService,
		@IProgressService private readonly progressService: IProgressService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IChatService private readonly chatService: IChatService,
		@IMenuService private readonly menuService: IMenuService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();
	}

	show(): void {
		if (this.container) {
			return; // already showing
		}

		// Create overlay backdrop
		this.container = $('.agent-hq-overlay-container');
		this.overlay = append(this.container, $('.agent-hq-overlay'));

		// Create centered widget
		this.widget = append(this.container, $('.agent-hq-widget'));

		// Add title
		const title = append(this.widget, $('.agent-hq-title'));
		title.textContent = localize('agentHQ.title', "Agent Sessions");

		// Create list container
		this.listContainer = append(this.widget, $('.agent-hq-list-container'));

		// Append to layout
		append(this.layoutService.activeContainer, this.container);

		// Create list
		this.createList();

		// Register listeners
		this.registerListeners();

		// Show with animation
		requestAnimationFrame(() => {
			if (this.container) {
				this.container.classList.add('visible');
			}
		});
	}

	hide(): void {
		if (!this.container) {
			return;
		}

		// Remove visible class for animation
		this.container.classList.remove('visible');

		// Wait for animation to complete
		setTimeout(() => {
			if (this.container && this.container.parentElement) {
				this.container.parentElement.removeChild(this.container);
			}
			this.container = undefined;
			this.overlay = undefined;
			this.widget = undefined;
			this.listContainer = undefined;
			this.list?.dispose();
			this.list = undefined;
			this._onDidClose.fire();
		}, 200); // Match CSS transition duration
	}

	private createList(): void {
		if (!this.listContainer) {
			return;
		}

		this.list = this._register(this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree,
			'AgentHQOverlay',
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
				paddingBottom: AgentSessionsListDelegate.ITEM_HEIGHT,
				twistieAdditionalCssClass: () => 'force-no-twistie',
			}
		)) as WorkbenchCompressibleAsyncDataTree<IAgentSessionsViewModel, IAgentSessionViewModel, FuzzyScore>;

		this.createViewModel();
	}

	private createViewModel(): void {
		const sessionsViewModel = this.sessionsViewModel = this._register(this.instantiationService.createInstance(AgentSessionsViewModel, { filterMenuId: MenuId.AgentSessionsFilterSubMenu }));
		this.list?.setInput(sessionsViewModel);

		this._register(sessionsViewModel.onDidChangeSessions(() => {
			this.list?.updateChildren();
		}));

		const didResolveDisposable = this._register(new MutableDisposable());
		this._register(sessionsViewModel.onWillResolve(() => {
			const didResolve = new DeferredPromise<void>();
			didResolveDisposable.value = Event.once(sessionsViewModel.onDidResolve)(() => didResolve.complete());

			this.progressService.withProgress(
				{
					location: this.layoutService.activeContainer,
					title: localize('agentHQ.refreshing', 'Refreshing agent sessions...'),
					delay: 500
				},
				() => didResolve.p
			);
		}));
	}

	private registerListeners(): void {
		if (!this.container || !this.overlay || !this.list) {
			return;
		}

		// Close on overlay click (background)
		this._register(addDisposableListener(this.overlay, EventType.CLICK, () => {
			this.hide();
		}));

		// Close on Escape key
		this._register(addDisposableListener(this.container, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this.hide();
			}
		}));

		// Open session on click
		this._register(this.list.onDidOpen(e => {
			const session = e.element;
			if (session) {
				this.openAgentSession(session, e.sideBySide);
				this.hide();
			}
		}));

		// Context menu
		this._register(this.list.onContextMenu((e) => {
			this.showContextMenu(e);
		}));
	}

	private async openAgentSession(session: IAgentSessionViewModel, sideBySide?: boolean): Promise<void> {
		const options = {
			preserveFocus: false,
			ignoreInView: true,
		};

		// Update most recent session (get the service via instantiation)
		const agentHQService = this.instantiationService.invokeFunction(accessor => accessor.get(IAgentHQService));
		agentHQService.setMostRecentSession(session);

		await this.chatSessionsService.activateChatSessionItemProvider(session.providerType);

		const group = sideBySide ? SIDE_GROUP : undefined;
		await this.chatWidgetService.openSession(session.resource, group, options);
	}

	private async showContextMenu({ element: session, anchor }: ITreeContextMenuEvent<IAgentSessionViewModel>): Promise<void> {
		if (!session) {
			return;
		}

		const provider = await this.chatSessionsService.activateChatSessionItemProvider(session.providerType);
		const contextOverlay = getSessionItemContextOverlay(session, provider, this.chatWidgetService, this.chatService, this.editorGroupsService);
		contextOverlay.push([ChatContextKeys.isCombinedSessionViewer.key, true]);
		const menu = this.menuService.createMenu(MenuId.ChatSessionsMenu, this.contextKeyService.createOverlay(contextOverlay));

		const marshalledSession: IMarshalledChatSessionContext = { session, $mid: MarshalledId.ChatSessionContext };
		this.contextMenuService.showContextMenu({
			getActions: () => distinct(getFlatActionBarActions(menu.getActions({ arg: marshalledSession, shouldForwardArgs: true })), action => action.id),
			getAnchor: () => anchor,
			getActionsContext: () => marshalledSession,
		});

		menu.dispose();
	}
}
