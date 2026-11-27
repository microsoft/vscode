/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItem } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ActionWithDropdownActionViewItem, IDropdownMenuActionViewItemOptions } from '../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
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
import { ACTION_ID_NEW_CHAT } from '../../../chat/browser/actions/chatActions.js';
import { NEW_CHAT_ICON_VARIANTS } from '../../../chat/browser/actions/chatNewActions.js';
import { localize } from '../../../../../nls.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ChatViewSessionsListHelpHint } from '../chatView/chatViewSessionsListAccessibilityHelp.js';
import { MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { $, reset } from '../../../../../base/browser/dom.js';
import { KeybindingLabel } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { OS } from '../../../../../base/common/platform.js';
import '../media/chatViewNewButton.css';

/** The class of the filled label buttons of action bars, such as the split buttons of the Extensions editor. */
const FILLED_LABEL_CLASS = 'filled-label';

/**
 * Runs the actions of the New menu, and reports a failure itself: the menu closes as the action starts and no longer listens
 * to its end, and the button may be gone by then too.
 */
class ChatViewNewMenuActionRunner extends ActionRunner {

	constructor(@INotificationService private readonly _notificationService: INotificationService) {
		super();
	}

	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		try {
			await action.run(context);
		} catch (error) {
			if (!isCancellationError(error)) {
				this._notificationService.error(error);
			}
		}
	}
}

/**
 * The "New" split button of the Chat view title for the New menu, the split button of the Extensions editor: "New", with the
 * keybinding of New Chat as the New button of the Agents window shows it, runs New Chat and the dropdown opens the New menu.
 * The title's toolbar knows it as the New menu itself, so that it can move it into its overflow menu, and asks it for the
 * width it needs.
 */
class ChatViewNewButtonActionViewItem extends ActionWithDropdownActionViewItem {

	private readonly _keybindingHint = $('span.chat-view-new-button-keybinding');
	private readonly _keybindingLabel = this._register(new KeybindingLabel(this._keybindingHint, OS, {
		disableTitle: true,
		keybindingLabelBackground: 'transparent',
		keybindingLabelForeground: 'inherit',
		keybindingLabelBorder: 'transparent',
		keybindingLabelBottomBorder: undefined,
		keybindingLabelShadow: undefined,
	}));

	constructor(
		newMenu: SubmenuItemAction,
		private readonly _newChat: MenuItemAction,
		options: IActionViewItemOptions | undefined,
		menuActionRunner: ChatViewNewMenuActionRunner,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(null, newMenu, {
			...options,
			icon: false,
			label: true,
			menuActionsOrProvider: { getActions: () => newMenu.actions },
			menuActionClassNames: [FILLED_LABEL_CLASS],
			menuActionRunner,
			filledSplitButton: true,
		}, contextMenuService);
		this._register(menuActionRunner);
		this._register(_keybindingService.onDidUpdateKeybindings(() => {
			this.updateLabel();
			this.updateTooltip();
		}));
	}

	/** The dropdown, created here after the first update, takes the title's context and New Chat's enablement. */
	override render(container: HTMLElement): void {
		super.render(container);
		this.dropdownMenuActionViewItem?.setActionContext(this._context);
		this.updateEnabled();
	}

	override setActionContext(context: unknown): void {
		super.setActionContext(context);
		this.dropdownMenuActionViewItem?.setActionContext(context);
	}

	/**
	 * The width the button needs, for the title to fit it. It is measured unshrunk and without the minimum width the title
	 * gave it from an earlier measure, as the title toolbar measures its items, so that it can need less than before.
	 */
	getMinimumWidth(): number | undefined {
		const element = this.element;
		if (!element) {
			return undefined;
		}
		const { minWidth, flexShrink } = element.style;
		try {
			element.style.minWidth = '0';
			element.style.flexShrink = '0';
			const width = element.getBoundingClientRect().width;
			return width ? Math.ceil(width) : undefined;
		} finally {
			element.style.minWidth = minWidth;
			element.style.flexShrink = flexShrink;
		}
	}

	/** "New" runs New Chat. */
	override getActionToRun(): IAction {
		return this._newChat;
	}

	protected override updateLabel(): void {
		if (this.label) {
			const keybinding = this.getKeybinding();
			this._keybindingLabel.set(keybinding);
			reset(this.label, localize('chatViewNewButton', "New"), ...(keybinding ? [this._keybindingHint] : []));
		}
	}

	/** The button is disabled when New Chat is, which is only when Chat is. */
	protected override updateEnabled(): void {
		const enabled = this._newChat.enabled;
		this.element?.classList.toggle('disabled', !enabled);
		this.label?.classList.toggle('disabled', !enabled);
		if (enabled) {
			this.label?.removeAttribute('aria-disabled');
		} else {
			this.label?.setAttribute('aria-disabled', 'true');
		}
		if (this.dropdownMenuActionViewItem) {
			this.dropdownMenuActionViewItem.action.enabled = enabled;
		}
	}

	protected override updateClass(): void {
		super.updateClass();
		this.label?.classList.add(FILLED_LABEL_CLASS);
	}

	/** New Chat with its keybinding. */
	protected override getTooltip(): string {
		const keybindingLabel = this.getKeybinding()?.getLabel();
		return keybindingLabel
			? localize('chatViewNewButtonTitle', "{0} ({1})", this._newChat.label, keybindingLabel)
			: this._newChat.label;
	}

	/** The keybinding of New Chat, or that of the canonical New Chat for its icon variants, which have none. */
	private getKeybinding(): ResolvedKeybinding | undefined {
		const id = this._newChat.id;
		const isIconVariant = NEW_CHAT_ICON_VARIANTS.some(variant => id === ACTION_ID_NEW_CHAT + variant.idSuffix);
		return this._keybindingService.lookupKeybinding(id) ?? (isIconVariant ? this._keybindingService.lookupKeybinding(ACTION_ID_NEW_CHAT) : undefined);
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
	/**
	 * The New menu shows as the "New" split button only in a title that fits it by the width it needs; other titles, which
	 * would cover or clip it, show it as the stock split button.
	 */
	createActionViewItem(action: IAction, options: IDropdownMenuActionViewItemOptions | undefined, titleFitsWidths: boolean): IActionViewItem | undefined {
		if (titleFitsWidths && action instanceof SubmenuItemAction && action.item.submenu === MenuId.ChatNewMenu) {
			const newChat = action.actions.find(action => action instanceof MenuItemAction && (action.id === ACTION_ID_NEW_CHAT || NEW_CHAT_ICON_VARIANTS.some(variant => action.id === ACTION_ID_NEW_CHAT + variant.idSuffix)));
			if (newChat instanceof MenuItemAction) {
				return this._instantiationService.createInstance(ChatViewNewButtonActionViewItem, action, newChat, options, this._instantiationService.createInstance(ChatViewNewMenuActionRunner));
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
