/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItem } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { IDropdownMenuActionViewItemOptions } from '../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { ActionRunner, IAction } from '../../../../../base/common/actions.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { IListStyles } from '../../../../../base/browser/ui/list/listWidget.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStyleOverride } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAgentSession } from '../../../chat/browser/agentSessions/agentSessionsModel.js';
import { IChatViewSessionsList, IChatViewSessionsListControl, IChatViewSessionsListProvider } from '../../../chat/browser/widgetHosts/viewPane/chatViewSessionsList.js';
import { SessionsView } from '../views/sessionsView.js';
import { createEditorWindowSessionsScope, createEditorWindowSessionsView } from './editorWindowSessionsList.js';
import { ChatViewId } from '../../../chat/browser/chat.js';
import { localize } from '../../../../../nls.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ChatViewSessionsListHelpHint } from '../chatView/chatViewSessionsListAccessibilityHelp.js';
import { MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { CompactButtonActionViewItem, ICompactButtonDropdown } from '../widgets/compactButtonActionViewItem.js';

/**
 * Runs the actions of the New menu with the context of the title, and reports a failure itself: a menu that closes as
 * the action starts no longer listens to its end, and the button may be gone by then too.
 */
class ChatViewNewMenuActionRunner extends ActionRunner {

	constructor(
		private readonly _getContext: () => unknown,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
	}

	protected override async runAction(action: IAction): Promise<void> {
		try {
			await action.run(this._getContext());
		} catch (error) {
			if (!isCancellationError(error)) {
				this._notificationService.error(error);
			}
		}
	}
}

/**
 * The compact "New" button of the Agents window for the New menu, with the menu as its joined dropdown part. The button runs
 * New Chat. The title's toolbar knows it as the New menu itself, so that it gives it the room of a split button and can
 * move it into its overflow menu.
 */
class ChatViewNewButtonActionViewItem extends CompactButtonActionViewItem {

	private readonly _menuActionRunner: ChatViewNewMenuActionRunner;

	constructor(
		newMenu: SubmenuItemAction,
		private readonly _newChat: MenuItemAction,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(newMenu, keybindingService, hoverService, contextKeyService);
		this._menuActionRunner = this._register(instantiationService.createInstance(ChatViewNewMenuActionRunner, () => this._context));
	}

	protected override get commandId(): string {
		return this._newChat.id;
	}

	protected override get label(): string {
		return localize('chatViewNewButton', "New");
	}

	protected override get dropdown(): ICompactButtonDropdown {
		return { contextMenuProvider: this._contextMenuService, actions: (this.action as SubmenuItemAction).actions, actionRunner: this._menuActionRunner };
	}

	/** New Chat, whose precondition was evaluated in the context of the title. */
	protected override get primaryEnabled(): boolean {
		return this._newChat.enabled;
	}

	protected override getHoverContent(keybindingLabel: string | undefined): string {
		return keybindingLabel
			? localize('chatViewNewButtonTitle', "{0} ({1})", this._newChat.label, keybindingLabel)
			: this._newChat.label;
	}

	protected override getAriaLabel(keybindingAriaLabel: string | undefined): string {
		return keybindingAriaLabel
			? localize('chatViewNewButtonAriaLabel', "{0} ({1})", this._newChat.label, keybindingAriaLabel)
			: this._newChat.label;
	}

	/** New Chat, with the context of the title. */
	protected override runAction(_event: MouseEvent | undefined): void {
		void this.actionRunner.run(this._newChat, this._context);
	}
}

/** The shared sessions list of an editor window, embedded in the Chat view, as the Chat view acts on it. */
export class ChatViewSessionsListControl implements IChatViewSessionsListControl {

	constructor(
		private readonly _view: SessionsView,
		private readonly _helpHint: IDisposable | undefined,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	setVisible(visible: boolean): void { this._view.setVisible(visible); }
	layout(height: number, width: number): void {
		this._view.orthogonalSize = width;
		this._view.layout(height);
	}
	focus(): void { this._view.focus(); }
	scrollToTop(): void { this._view.focus(); }
	refresh(): void { this._view.sessionsControl?.refresh(); }
	async update(): Promise<boolean> {
		this._view.sessionsControl?.update();
		return true;
	}
	/** Reveals the session of `resource`, which the Chat view gives as the chat it shows, such as a peer chat of a session. */
	reveal(resource: URI): boolean {
		const sessionResource = this._sessionsManagementService.getSessionForChatResource(resource)?.session.resource ?? resource;
		return this._view.sessionsControl?.reveal(sessionResource) ?? false;
	}
	clearFocus(): void { this._view.sessionsControl?.clearFocus(); }
	hasFocusOrSelection(): boolean { return this._view.sessionsControl?.hasFocusOrSelection() ?? false; }
	/** The sessions of the Chat view's own list that have focus: none of those here. */
	getFocus(): IAgentSession[] { return []; }
	openFind(): void { this._view.openFind(); }
	createActionViewItem(action: IAction, options?: IDropdownMenuActionViewItemOptions): IActionViewItem | undefined {
		// New Chat of the title as the compact "New" button, whose dropdown part is the New menu
		if (action instanceof SubmenuItemAction && action.item.submenu === MenuId.ChatNewMenu) {
			const newChat = action.actions.find(action => action instanceof MenuItemAction);
			if (newChat) {
				return this._instantiationService.createInstance(ChatViewNewButtonActionViewItem, action, newChat);
			}
		}
		return this._view.createActionViewItem(action, options);
	}
	dispose(): void {
		this._helpHint?.dispose();
		this._view.dispose();
	}
}

/**
 * Gives the Chat view the sessions of the Agents window as its sessions list. Its sessions open where the window presents them:
 * in the Chat view, or in the chat part while the Chat view shows only the sessions. The Chat view keeps its own chat input, for
 * new chats and the chats it shows.
 */
export class ChatViewSessionsListProvider implements IChatViewSessionsListProvider {

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	create(container: HTMLElement, instantiationService: IInstantiationService, _options: { readonly overrideStyles: IStyleOverride<IListStyles> }): IChatViewSessionsList {
		// The Sessions view of an editor window, as the Agents viewlet shows it, with the actions of its header in the title of the
		// Chat view: embedded in the Chat view, whose id it takes, and found by the actions of the list through the locator it registers with.
		// It offers Inbox, which it remembers apart from the Agents window
		const view = instantiationService.createInstance(createEditorWindowSessionsView(createEditorWindowSessionsScope(this, this._workspaceContextService), 'title', true), {
			id: ChatViewId,
			title: localize('chatViewSessions.title', "Sessions"),
			expanded: true,
		});
		view.headerVisible = false;
		view.render();
		container.appendChild(view.element);
		view.setVisible(true);
		// How to open the list's accessibility help, which screen readers tell in the list
		const sessionsList = view.sessionsControl;
		const helpHint = sessionsList && instantiationService.createInstance(ChatViewSessionsListHelpHint, sessionsList);
		return {
			control: instantiationService.createInstance(ChatViewSessionsListControl, view, helpHint),
			hasHeader: true,
		};
	}
}
