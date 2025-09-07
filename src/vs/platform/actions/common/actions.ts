/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, SubmenuAction } from '../../../base/common/actions.js';
import { Event, MicrotaskEmitter } from '../../../base/common/event.js';
import { DisposableStore, dispose, IDisposable, markAsSingleton, toDisposable } from '../../../base/common/lifecycle.js';
import { LinkedList } from '../../../base/common/linkedList.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { ICommandAction, ICommandActionTitle, Icon, ILocalizedString } from '../../action/common/action.js';
import { Categories } from '../../action/common/actionCommonCategories.js';
import { CommandsRegistry, ICommandService } from '../../commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../contextkey/common/contextkey.js';
import { createDecorator, ServicesAccessor } from '../../instantiation/common/instantiation.js';
import { IKeybindingRule, KeybindingsRegistry } from '../../keybinding/common/keybindingsRegistry.js';

export interface IMenuItem {
	command: ICommandAction;
	alt?: ICommandAction;
	/**
	 * Menu item is hidden if this expression returns false.
	 */
	when?: ContextKeyExpression;
	group?: 'navigation' | string;
	order?: number;
	isHiddenByDefault?: boolean;
}

export interface ISubmenuItem {
	title: string | ICommandActionTitle;
	submenu: MenuId;
	icon?: Icon;
	when?: ContextKeyExpression;
	group?: 'navigation' | string;
	order?: number;
	isSelection?: boolean;
	rememberDefaultAction?: boolean;	// for dropdown menu: if true the last executed action is remembered as the default action
}

export function isIMenuItem(item: any): item is IMenuItem {
	return (item as IMenuItem).command !== undefined;
}

export function isISubmenuItem(item: any): item is ISubmenuItem {
	return (item as ISubmenuItem).submenu !== undefined;
}

export class MenuId {

	private static readonly _instances = new Map<string, MenuId>();

	static readonly CommandPalette = new MenuId('CommandPalette');
	static readonly DebugBreakpointsContext = new MenuId('DebugBreakpointsContext');
	static readonly DebugCallStackContext = new MenuId('DebugCallStackContext');
	static readonly DebugConsoleContext = new MenuId('DebugConsoleContext');
	static readonly DebugVariablesContext = new MenuId('DebugVariablesContext');
	static readonly NotebookVariablesContext = new MenuId('NotebookVariablesContext');
	static readonly DebugHoverContext = new MenuId('DebugHoverContext');
	static readonly DebugWatchContext = new MenuId('DebugWatchContext');
	static readonly DebugToolBar = new MenuId('DebugToolBar');
	static readonly DebugToolBarStop = new MenuId('DebugToolBarStop');
	static readonly DebugDisassemblyContext = new MenuId('DebugDisassemblyContext');
	static readonly DebugCallStackToolbar = new MenuId('DebugCallStackToolbar');
	static readonly DebugCreateConfiguration = new MenuId('DebugCreateConfiguration');
	static readonly EditorContext = new MenuId('EditorContext');
	static readonly SimpleEditorContext = new MenuId('SimpleEditorContext');
	static readonly EditorContent = new MenuId('EditorContent');
	static readonly EditorLineNumberContext = new MenuId('EditorLineNumberContext');
	static readonly EditorContextCopy = new MenuId('EditorContextCopy');
	static readonly EditorContextPeek = new MenuId('EditorContextPeek');
	static readonly EditorContextShare = new MenuId('EditorContextShare');
	static readonly EditorTitle = new MenuId('EditorTitle');
	static readonly CompactWindowEditorTitle = new MenuId('CompactWindowEditorTitle');
	static readonly EditorTitleRun = new MenuId('EditorTitleRun');
	static readonly EditorTitleContext = new MenuId('EditorTitleContext');
	static readonly EditorTitleContextShare = new MenuId('EditorTitleContextShare');
	static readonly EmptyEditorGroup = new MenuId('EmptyEditorGroup');
	static readonly EmptyEditorGroupContext = new MenuId('EmptyEditorGroupContext');
	static readonly EditorTabsBarContext = new MenuId('EditorTabsBarContext');
	static readonly EditorTabsBarShowTabsSubmenu = new MenuId('EditorTabsBarShowTabsSubmenu');
	static readonly EditorTabsBarShowTabsZenModeSubmenu = new MenuId('EditorTabsBarShowTabsZenModeSubmenu');
	static readonly EditorActionsPositionSubmenu = new MenuId('EditorActionsPositionSubmenu');
	static readonly EditorSplitMoveSubmenu = new MenuId('EditorSplitMoveSubmenu');
	static readonly ExplorerContext = new MenuId('ExplorerContext');
	static readonly ExplorerContextShare = new MenuId('ExplorerContextShare');
	static readonly ExtensionContext = new MenuId('ExtensionContext');
	static readonly ExtensionEditorContextMenu = new MenuId('ExtensionEditorContextMenu');
	static readonly GlobalActivity = new MenuId('GlobalActivity');
	static readonly CommandCenter = new MenuId('CommandCenter');
	static readonly CommandCenterCenter = new MenuId('CommandCenterCenter');
	static readonly LayoutControlMenuSubmenu = new MenuId('LayoutControlMenuSubmenu');
	static readonly LayoutControlMenu = new MenuId('LayoutControlMenu');
	static readonly MenubarMainMenu = new MenuId('MenubarMainMenu');
	static readonly MenubarAppearanceMenu = new MenuId('MenubarAppearanceMenu');
	static readonly MenubarDebugMenu = new MenuId('MenubarDebugMenu');
	static readonly MenubarEditMenu = new MenuId('MenubarEditMenu');
	static readonly MenubarCopy = new MenuId('MenubarCopy');
	static readonly MenubarFileMenu = new MenuId('MenubarFileMenu');
	static readonly MenubarGoMenu = new MenuId('MenubarGoMenu');
	static readonly MenubarHelpMenu = new MenuId('MenubarHelpMenu');
	static readonly MenubarLayoutMenu = new MenuId('MenubarLayoutMenu');
	static readonly MenubarNewBreakpointMenu = new MenuId('MenubarNewBreakpointMenu');
	static readonly PanelAlignmentMenu = new MenuId('PanelAlignmentMenu');
	static readonly PanelPositionMenu = new MenuId('PanelPositionMenu');
	static readonly ActivityBarPositionMenu = new MenuId('ActivityBarPositionMenu');
	static readonly MenubarPreferencesMenu = new MenuId('MenubarPreferencesMenu');
	static readonly MenubarRecentMenu = new MenuId('MenubarRecentMenu');
	static readonly MenubarSelectionMenu = new MenuId('MenubarSelectionMenu');
	static readonly MenubarShare = new MenuId('MenubarShare');
	static readonly MenubarSwitchEditorMenu = new MenuId('MenubarSwitchEditorMenu');
	static readonly MenubarSwitchGroupMenu = new MenuId('MenubarSwitchGroupMenu');
	static readonly MenubarTerminalMenu = new MenuId('MenubarTerminalMenu');
	static readonly MenubarTerminalSuggestStatusMenu = new MenuId('MenubarTerminalSuggestStatusMenu');
	static readonly MenubarViewMenu = new MenuId('MenubarViewMenu');
	static readonly MenubarHomeMenu = new MenuId('MenubarHomeMenu');
	static readonly OpenEditorsContext = new MenuId('OpenEditorsContext');
	static readonly OpenEditorsContextShare = new MenuId('OpenEditorsContextShare');
	static readonly ProblemsPanelContext = new MenuId('ProblemsPanelContext');
	static readonly SCMInputBox = new MenuId('SCMInputBox');
	static readonly SCMChangeContext = new MenuId('SCMChangeContext');
	static readonly SCMResourceContext = new MenuId('SCMResourceContext');
	static readonly SCMResourceContextShare = new MenuId('SCMResourceContextShare');
	static readonly SCMResourceFolderContext = new MenuId('SCMResourceFolderContext');
	static readonly SCMResourceGroupContext = new MenuId('SCMResourceGroupContext');
	static readonly SCMSourceControl = new MenuId('SCMSourceControl');
	static readonly SCMSourceControlInline = new MenuId('SCMSourceControlInline');
	static readonly SCMSourceControlTitle = new MenuId('SCMSourceControlTitle');
	static readonly SCMHistoryTitle = new MenuId('SCMHistoryTitle');
	static readonly SCMHistoryItemContext = new MenuId('SCMHistoryItemContext');
	static readonly SCMHistoryItemChangeContext = new MenuId('SCMHistoryItemChangeContext');
	static readonly SCMHistoryItemHover = new MenuId('SCMHistoryItemHover');
	static readonly SCMHistoryItemRefContext = new MenuId('SCMHistoryItemRefContext');
	static readonly SCMQuickDiffDecorations = new MenuId('SCMQuickDiffDecorations');
	static readonly SCMTitle = new MenuId('SCMTitle');
	static readonly SearchContext = new MenuId('SearchContext');
	static readonly SearchActionMenu = new MenuId('SearchActionContext');
	static readonly StatusBarWindowIndicatorMenu = new MenuId('StatusBarWindowIndicatorMenu');
	static readonly StatusBarRemoteIndicatorMenu = new MenuId('StatusBarRemoteIndicatorMenu');
	static readonly StickyScrollContext = new MenuId('StickyScrollContext');
	static readonly TestItem = new MenuId('TestItem');
	static readonly TestItemGutter = new MenuId('TestItemGutter');
	static readonly TestProfilesContext = new MenuId('TestProfilesContext');
	static readonly TestMessageContext = new MenuId('TestMessageContext');
	static readonly TestMessageContent = new MenuId('TestMessageContent');
	static readonly TestPeekElement = new MenuId('TestPeekElement');
	static readonly TestPeekTitle = new MenuId('TestPeekTitle');
	static readonly TestCallStack = new MenuId('TestCallStack');
	static readonly TestCoverageFilterItem = new MenuId('TestCoverageFilterItem');
	static readonly TouchBarContext = new MenuId('TouchBarContext');
	static readonly TitleBar = new MenuId('TitleBar');
	static readonly TitleBarContext = new MenuId('TitleBarContext');
	static readonly TitleBarTitleContext = new MenuId('TitleBarTitleContext');
	static readonly TunnelContext = new MenuId('TunnelContext');
	static readonly TunnelPrivacy = new MenuId('TunnelPrivacy');
	static readonly TunnelProtocol = new MenuId('TunnelProtocol');
	static readonly TunnelPortInline = new MenuId('TunnelInline');
	static readonly TunnelTitle = new MenuId('TunnelTitle');
	static readonly TunnelLocalAddressInline = new MenuId('TunnelLocalAddressInline');
	static readonly TunnelOriginInline = new MenuId('TunnelOriginInline');
	static readonly ViewItemContext = new MenuId('ViewItemContext');
	static readonly ViewContainerTitle = new MenuId('ViewContainerTitle');
	static readonly ViewContainerTitleContext = new MenuId('ViewContainerTitleContext');
	static readonly ViewTitle = new MenuId('ViewTitle');
	static readonly ViewTitleContext = new MenuId('ViewTitleContext');
	static readonly CommentEditorActions = new MenuId('CommentEditorActions');
	static readonly CommentThreadTitle = new MenuId('CommentThreadTitle');
	static readonly CommentThreadActions = new MenuId('CommentThreadActions');
	static readonly CommentThreadAdditionalActions = new MenuId('CommentThreadAdditionalActions');
	static readonly CommentThreadTitleContext = new MenuId('CommentThreadTitleContext');
	static readonly CommentThreadCommentContext = new MenuId('CommentThreadCommentContext');
	static readonly CommentTitle = new MenuId('CommentTitle');
	static readonly CommentActions = new MenuId('CommentActions');
	static readonly CommentsViewThreadActions = new MenuId('CommentsViewThreadActions');
	static readonly InteractiveToolbar = new MenuId('InteractiveToolbar');
	static readonly InteractiveCellTitle = new MenuId('InteractiveCellTitle');
	static readonly InteractiveCellDelete = new MenuId('InteractiveCellDelete');
	static readonly InteractiveCellExecute = new MenuId('InteractiveCellExecute');
	static readonly InteractiveInputExecute = new MenuId('InteractiveInputExecute');
	static readonly InteractiveInputConfig = new MenuId('InteractiveInputConfig');
	static readonly ReplInputExecute = new MenuId('ReplInputExecute');
	static readonly IssueReporter = new MenuId('IssueReporter');
	static readonly NotebookToolbar = new MenuId('NotebookToolbar');
	static readonly NotebookToolbarContext = new MenuId('NotebookToolbarContext');
	static readonly NotebookStickyScrollContext = new MenuId('NotebookStickyScrollContext');
	static readonly NotebookCellTitle = new MenuId('NotebookCellTitle');
	static readonly NotebookCellDelete = new MenuId('NotebookCellDelete');
	static readonly NotebookCellInsert = new MenuId('NotebookCellInsert');
	static readonly NotebookCellBetween = new MenuId('NotebookCellBetween');
	static readonly NotebookCellListTop = new MenuId('NotebookCellTop');
	static readonly NotebookCellExecute = new MenuId('NotebookCellExecute');
	static readonly NotebookCellExecuteGoTo = new MenuId('NotebookCellExecuteGoTo');
	static readonly NotebookCellExecutePrimary = new MenuId('NotebookCellExecutePrimary');
	static readonly NotebookDiffCellInputTitle = new MenuId('NotebookDiffCellInputTitle');
	static readonly NotebookDiffDocumentMetadata = new MenuId('NotebookDiffDocumentMetadata');
	static readonly NotebookDiffCellMetadataTitle = new MenuId('NotebookDiffCellMetadataTitle');
	static readonly NotebookDiffCellOutputsTitle = new MenuId('NotebookDiffCellOutputsTitle');
	static readonly NotebookOutputToolbar = new MenuId('NotebookOutputToolbar');
	static readonly NotebookOutlineFilter = new MenuId('NotebookOutlineFilter');
	static readonly NotebookOutlineActionMenu = new MenuId('NotebookOutlineActionMenu');
	static readonly NotebookEditorLayoutConfigure = new MenuId('NotebookEditorLayoutConfigure');
	static readonly NotebookKernelSource = new MenuId('NotebookKernelSource');
	static readonly BulkEditTitle = new MenuId('BulkEditTitle');
	static readonly BulkEditContext = new MenuId('BulkEditContext');
	static readonly TimelineItemContext = new MenuId('TimelineItemContext');
	static readonly TimelineTitle = new MenuId('TimelineTitle');
	static readonly TimelineTitleContext = new MenuId('TimelineTitleContext');
	static readonly TimelineFilterSubMenu = new MenuId('TimelineFilterSubMenu');
	static readonly AccountsContext = new MenuId('AccountsContext');
	static readonly SidebarTitle = new MenuId('SidebarTitle');
	static readonly PanelTitle = new MenuId('PanelTitle');
	static readonly AuxiliaryBarTitle = new MenuId('AuxiliaryBarTitle');
	static readonly TerminalInstanceContext = new MenuId('TerminalInstanceContext');
	static readonly TerminalEditorInstanceContext = new MenuId('TerminalEditorInstanceContext');
	static readonly TerminalNewDropdownContext = new MenuId('TerminalNewDropdownContext');
	static readonly TerminalTabContext = new MenuId('TerminalTabContext');
	static readonly TerminalTabEmptyAreaContext = new MenuId('TerminalTabEmptyAreaContext');
	static readonly TerminalStickyScrollContext = new MenuId('TerminalStickyScrollContext');
	static readonly WebviewContext = new MenuId('WebviewContext');
	static readonly InlineCompletionsActions = new MenuId('InlineCompletionsActions');
	static readonly InlineEditsActions = new MenuId('InlineEditsActions');
	static readonly NewFile = new MenuId('NewFile');
	static readonly MergeInput1Toolbar = new MenuId('MergeToolbar1Toolbar');
	static readonly MergeInput2Toolbar = new MenuId('MergeToolbar2Toolbar');
	static readonly MergeBaseToolbar = new MenuId('MergeBaseToolbar');
	static readonly MergeInputResultToolbar = new MenuId('MergeToolbarResultToolbar');
	static readonly InlineSuggestionToolbar = new MenuId('InlineSuggestionToolbar');
	static readonly InlineEditToolbar = new MenuId('InlineEditToolbar');
	static readonly ChatContext = new MenuId('ChatContext');
	static readonly ChatCodeBlock = new MenuId('ChatCodeblock');
	static readonly ChatCompareBlock = new MenuId('ChatCompareBlock');
	static readonly ChatMessageTitle = new MenuId('ChatMessageTitle');
	static readonly ChatMessageFooter = new MenuId('ChatMessageFooter');
	static readonly ChatExecute = new MenuId('ChatExecute');
	static readonly ChatExecuteSecondary = new MenuId('ChatExecuteSecondary');
	static readonly ChatInput = new MenuId('ChatInput');
	static readonly ChatInputSide = new MenuId('ChatInputSide');
	static readonly ChatModePicker = new MenuId('ChatModePicker');
	static readonly ChatEditingWidgetToolbar = new MenuId('ChatEditingWidgetToolbar');
	static readonly ChatEditingEditorContent = new MenuId('ChatEditingEditorContent');
	static readonly ChatEditingEditorHunk = new MenuId('ChatEditingEditorHunk');
	static readonly ChatEditingDeletedNotebookCell = new MenuId('ChatEditingDeletedNotebookCell');
	static readonly ChatInputAttachmentToolbar = new MenuId('ChatInputAttachmentToolbar');
	static readonly ChatEditingWidgetModifiedFilesToolbar = new MenuId('ChatEditingWidgetModifiedFilesToolbar');
	static readonly ChatInputResourceAttachmentContext = new MenuId('ChatInputResourceAttachmentContext');
	static readonly ChatInputSymbolAttachmentContext = new MenuId('ChatInputSymbolAttachmentContext');
	static readonly ChatInlineResourceAnchorContext = new MenuId('ChatInlineResourceAnchorContext');
	static readonly ChatInlineSymbolAnchorContext = new MenuId('ChatInlineSymbolAnchorContext');
	static readonly ChatMessageCheckpoint: MenuId = new MenuId('ChatMessageCheckpoint');
	static readonly ChatMessageRestoreCheckpoint: MenuId = new MenuId('ChatMessageRestoreCheckpoint');
	static readonly ChatEditingCodeBlockContext = new MenuId('ChatEditingCodeBlockContext');
	static readonly ChatTitleBarMenu = new MenuId('ChatTitleBarMenu');
	static readonly ChatAttachmentsContext = new MenuId('ChatAttachmentsContext');
	static readonly ChatToolOutputResourceToolbar = new MenuId('ChatToolOutputResourceToolbar');
	static readonly ChatTextEditorMenu = new MenuId('ChatTextEditorMenu');
	static readonly ChatToolOutputResourceContext = new MenuId('ChatToolOutputResourceContext');
	static readonly ChatMultiDiffContext = new MenuId('ChatMultiDiffContext');
	static readonly ChatSessionsMenu = new MenuId('ChatSessionsMenu');
	static readonly ChatConfirmationMenu = new MenuId('ChatConfirmationMenu');
	static readonly AccessibleView = new MenuId('AccessibleView');
	static readonly MultiDiffEditorFileToolbar = new MenuId('MultiDiffEditorFileToolbar');
	static readonly DiffEditorHunkToolbar = new MenuId('DiffEditorHunkToolbar');
	static readonly DiffEditorSelectionToolbar = new MenuId('DiffEditorSelectionToolbar');


	/**
	 * Create or reuse a `MenuId` with the given identifier
	 */
	static for(identifier: string): MenuId {
		return MenuId._instances.get(identifier) ?? new MenuId(identifier);
	}

	readonly id: string;

	/**
	 * Create a new `MenuId` with the unique identifier. Will throw if a menu
	 * with the identifier already exists, use `MenuId.for(ident)` or a unique
	 * identifier
	 */
	constructor(identifier: string) {
		if (MenuId._instances.has(identifier)) {
			throw new TypeError(`MenuId with identifier '${identifier}' already exists. Use MenuId.for(ident) or a unique identifier`);
		}
		MenuId._instances.set(identifier, this);
		this.id = identifier;
	}
}

export interface IMenuActionOptions {
	arg?: any;
	shouldForwardArgs?: boolean;
	renderShortTitle?: boolean;
}

export interface IMenuChangeEvent {
	readonly menu: IMenu;
	readonly isStructuralChange: boolean;
	readonly isToggleChange: boolean;
	readonly isEnablementChange: boolean;
}

export interface IMenu extends IDisposable {
	readonly onDidChange: Event<IMenuChangeEvent>;
	getActions(options?: IMenuActionOptions): [string, Array<MenuItemAction | SubmenuItemAction>][];
}

export interface IMenuData {
	contexts: ReadonlySet<string>;
	actions: [string, Array<MenuItemAction | SubmenuItemAction>][];
}

export const IMenuService = createDecorator<IMenuService>('menuService');

export interface IMenuCreateOptions {
	emitEventsForSubmenuChanges?: boolean;
	eventDebounceDelay?: number;
}

export interface IMenuService {

	readonly _serviceBrand: undefined;

	/**
	 * Consider using getMenuActions if you don't need to listen to events.
	 *
	 * Create a new menu for the given menu identifier. A menu sends events when it's entries
	 * have changed (placement, enablement, checked-state). By default it does not send events for
	 * submenu entries. That is more expensive and must be explicitly enabled with the
	 * `emitEventsForSubmenuChanges` flag.
	 */
	createMenu(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuCreateOptions): IMenu;

	/**
	 * Creates a new menu, gets the actions, and then disposes of the menu.
	 */
	getMenuActions(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuActionOptions): [string, Array<MenuItemAction | SubmenuItemAction>][];

	/**
	 * Gets the names of the contexts that this menu listens on.
	 */
	getMenuContexts(id: MenuId): ReadonlySet<string>;

	/**
	 * Reset **all** menu item hidden states.
	 */
	resetHiddenStates(): void;

	/**
	 * Reset the menu's hidden states.
	 */
	resetHiddenStates(menuIds: readonly MenuId[] | undefined): void;
}

type ICommandsMap = Map<string, ICommandAction>;

export interface IMenuRegistryChangeEvent {
	has(id: MenuId): boolean;
}

class MenuRegistryChangeEvent {

	private static _all = new Map<MenuId, MenuRegistryChangeEvent>();

	static for(id: MenuId): MenuRegistryChangeEvent {
		let value = this._all.get(id);
		if (!value) {
			value = new MenuRegistryChangeEvent(id);
			this._all.set(id, value);
		}
		return value;
	}

	static merge(events: IMenuRegistryChangeEvent[]): IMenuRegistryChangeEvent {
		const ids = new Set<MenuId>();
		for (const item of events) {
			if (item instanceof MenuRegistryChangeEvent) {
				ids.add(item.id);
			}
		}
		return ids;
	}

	readonly has: (id: MenuId) => boolean;

	private constructor(private readonly id: MenuId) {
		this.has = candidate => candidate === id;
	}
}

export interface IMenuRegistry {
	readonly onDidChangeMenu: Event<IMenuRegistryChangeEvent>;
	addCommand(userCommand: ICommandAction): IDisposable;
	getCommand(id: string): ICommandAction | undefined;
	getCommands(): ICommandsMap;

	/**
	 * @deprecated Use `appendMenuItem` or most likely use `registerAction2` instead. There should be no strong
	 * reason to use this directly.
	 */
	appendMenuItems(items: Iterable<{ id: MenuId; item: IMenuItem | ISubmenuItem }>): IDisposable;
	appendMenuItem(menu: MenuId, item: IMenuItem | ISubmenuItem): IDisposable;
	getMenuItems(loc: MenuId): Array<IMenuItem | ISubmenuItem>;
}

export const MenuRegistry: IMenuRegistry = new class implements IMenuRegistry {

	private readonly _commands = new Map<string, ICommandAction>();
	private readonly _menuItems = new Map<MenuId, LinkedList<IMenuItem | ISubmenuItem>>();
	private readonly _onDidChangeMenu = new MicrotaskEmitter<IMenuRegistryChangeEvent>({
		merge: MenuRegistryChangeEvent.merge
	});

	readonly onDidChangeMenu: Event<IMenuRegistryChangeEvent> = this._onDidChangeMenu.event;

	addCommand(command: ICommandAction): IDisposable {
		this._commands.set(command.id, command);
		this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(MenuId.CommandPalette));

		return markAsSingleton(toDisposable(() => {
			if (this._commands.delete(command.id)) {
				this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(MenuId.CommandPalette));
			}
		}));
	}

	getCommand(id: string): ICommandAction | undefined {
		return this._commands.get(id);
	}

	getCommands(): ICommandsMap {
		const map = new Map<string, ICommandAction>();
		this._commands.forEach((value, key) => map.set(key, value));
		return map;
	}

	appendMenuItem(id: MenuId, item: IMenuItem | ISubmenuItem): IDisposable {
		let list = this._menuItems.get(id);
		if (!list) {
			list = new LinkedList();
			this._menuItems.set(id, list);
		}
		const rm = list.push(item);
		this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(id));
		return markAsSingleton(toDisposable(() => {
			rm();
			this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(id));
		}));
	}

	appendMenuItems(items: Iterable<{ id: MenuId; item: IMenuItem | ISubmenuItem }>): IDisposable {
		const result = new DisposableStore();
		for (const { id, item } of items) {
			result.add(this.appendMenuItem(id, item));
		}
		return result;
	}

	getMenuItems(id: MenuId): Array<IMenuItem | ISubmenuItem> {
		let result: Array<IMenuItem | ISubmenuItem>;
		if (this._menuItems.has(id)) {
			result = [...this._menuItems.get(id)!];
		} else {
			result = [];
		}
		if (id === MenuId.CommandPalette) {
			// CommandPalette is special because it shows
			// all commands by default
			this._appendImplicitItems(result);
		}
		return result;
	}

	private _appendImplicitItems(result: Array<IMenuItem | ISubmenuItem>) {
		const set = new Set<string>();

		for (const item of result) {
			if (isIMenuItem(item)) {
				set.add(item.command.id);
				if (item.alt) {
					set.add(item.alt.id);
				}
			}
		}
		this._commands.forEach((command, id) => {
			if (!set.has(id)) {
				result.push({ command });
			}
		});
	}
};

export class SubmenuItemAction extends SubmenuAction {

	constructor(
		readonly item: ISubmenuItem,
		readonly hideActions: IMenuItemHide | undefined,
		actions: readonly IAction[],
	) {
		super(`submenuitem.${item.submenu.id}`, typeof item.title === 'string' ? item.title : item.title.value, actions, 'submenu');
	}
}

export interface IMenuItemHide {
	readonly isHidden: boolean;
	readonly hide: IAction;
	readonly toggle: IAction;
}

// implements IAction, does NOT extend Action, so that no one
// subscribes to events of Action or modified properties
export class MenuItemAction implements IAction {

	static label(action: ICommandAction, options?: IMenuActionOptions): string {
		return options?.renderShortTitle && action.shortTitle
			? (typeof action.shortTitle === 'string' ? action.shortTitle : action.shortTitle.value)
			: (typeof action.title === 'string' ? action.title : action.title.value);
	}

	readonly item: ICommandAction;
	readonly alt: MenuItemAction | undefined;

	private readonly _options: IMenuActionOptions | undefined;

	readonly id: string;
	readonly label: string;
	readonly tooltip: string;
	readonly class: string | undefined;
	readonly enabled: boolean;
	readonly checked?: boolean;

	constructor(
		item: ICommandAction,
		alt: ICommandAction | undefined,
		options: IMenuActionOptions | undefined,
		readonly hideActions: IMenuItemHide | undefined,
		readonly menuKeybinding: IAction | undefined,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private _commandService: ICommandService
	) {
		this.id = item.id;
		this.label = MenuItemAction.label(item, options);
		this.tooltip = (typeof item.tooltip === 'string' ? item.tooltip : item.tooltip?.value) ?? '';
		this.enabled = !item.precondition || contextKeyService.contextMatchesRules(item.precondition);
		this.checked = undefined;

		let icon: ThemeIcon | undefined;

		if (item.toggled) {
			const toggled = ((item.toggled as { condition: ContextKeyExpression }).condition ? item.toggled : { condition: item.toggled }) as {
				condition: ContextKeyExpression; icon?: Icon; tooltip?: string | ILocalizedString; title?: string | ILocalizedString;
			};
			this.checked = contextKeyService.contextMatchesRules(toggled.condition);
			if (this.checked && toggled.tooltip) {
				this.tooltip = typeof toggled.tooltip === 'string' ? toggled.tooltip : toggled.tooltip.value;
			}

			if (this.checked && ThemeIcon.isThemeIcon(toggled.icon)) {
				icon = toggled.icon;
			}

			if (this.checked && toggled.title) {
				this.label = typeof toggled.title === 'string' ? toggled.title : toggled.title.value;
			}
		}

		if (!icon) {
			icon = ThemeIcon.isThemeIcon(item.icon) ? item.icon : undefined;
		}

		this.item = item;
		this.alt = alt ? new MenuItemAction(alt, undefined, options, hideActions, undefined, contextKeyService, _commandService) : undefined;
		this._options = options;
		this.class = icon && ThemeIcon.asClassName(icon);

	}

	run(...args: any[]): Promise<void> {
		let runArgs: any[] = [];

		if (this._options?.arg) {
			runArgs = [...runArgs, this._options.arg];
		}

		if (this._options?.shouldForwardArgs) {
			runArgs = [...runArgs, ...args];
		}

		return this._commandService.executeCommand(this.id, ...runArgs);
	}
}

//#region --- IAction2

type OneOrN<T> = T | T[];

interface IAction2CommonOptions extends ICommandAction {
	/**
	 * One or many menu items.
	 */
	menu?: OneOrN<{ id: MenuId; precondition?: null } & Omit<IMenuItem, 'command'>>;

	/**
	 * One keybinding.
	 */
	keybinding?: OneOrN<Omit<IKeybindingRule, 'id'>>;
}

interface IBaseAction2Options extends IAction2CommonOptions {

	/**
	 * This type is used when an action is not going to show up in the command palette.
	 * In that case, it's able to use a string for the `title` and `category` properties.
	 */
	f1?: false;
}

export interface ICommandPaletteOptions extends IAction2CommonOptions {

	/**
	 * The title of the command that will be displayed in the command palette after the category.
	 *  This overrides {@link ICommandAction.title} to ensure a string isn't used so that the title
	 *  includes the localized value and the original value for users using language packs.
	 */
	title: ICommandActionTitle;

	/**
	 * The category of the command that will be displayed in the command palette before the title suffixed.
	 * with a colon This overrides {@link ICommandAction.title} to ensure a string isn't used so that
	 * the title includes the localized value and the original value for users using language packs.
	 */
	category?: keyof typeof Categories | ILocalizedString;

	/**
	 * Shorthand to add this command to the command palette. Note: this is not the only way to declare that
	 * a command should be in the command palette... however, enforcing ILocalizedString in the other scenarios
	 * is much more challenging and this gets us most of the way there.
	 */
	f1: true;
}

export type IAction2Options = ICommandPaletteOptions | IBaseAction2Options;

export interface IAction2F1RequiredOptions {
	title: ICommandActionTitle;
	category?: keyof typeof Categories | ILocalizedString;
}

export abstract class Action2 {
	constructor(readonly desc: Readonly<IAction2Options>) { }
	abstract run(accessor: ServicesAccessor, ...args: any[]): void;
}

export function registerAction2(ctor: { new(): Action2 }): IDisposable {
	const disposables: IDisposable[] = []; // not using `DisposableStore` to reduce startup perf cost
	const action = new ctor();

	const { f1, menu, keybinding, ...command } = action.desc;

	if (CommandsRegistry.getCommand(command.id)) {
		throw new Error(`Cannot register two commands with the same id: ${command.id}`);
	}

	// command
	disposables.push(CommandsRegistry.registerCommand({
		id: command.id,
		handler: (accessor, ...args) => action.run(accessor, ...args),
		metadata: command.metadata ?? { description: action.desc.title }
	}));

	// menu
	if (Array.isArray(menu)) {
		for (const item of menu) {
			disposables.push(MenuRegistry.appendMenuItem(item.id, { command: { ...command, precondition: item.precondition === null ? undefined : command.precondition }, ...item }));
		}

	} else if (menu) {
		disposables.push(MenuRegistry.appendMenuItem(menu.id, { command: { ...command, precondition: menu.precondition === null ? undefined : command.precondition }, ...menu }));
	}
	if (f1) {
		disposables.push(MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command, when: command.precondition }));
		disposables.push(MenuRegistry.addCommand(command));
	}

	// keybinding
	if (Array.isArray(keybinding)) {
		for (const item of keybinding) {
			disposables.push(KeybindingsRegistry.registerKeybindingRule({
				...item,
				id: command.id,
				when: command.precondition ? ContextKeyExpr.and(command.precondition, item.when) : item.when
			}));
		}
	} else if (keybinding) {
		disposables.push(KeybindingsRegistry.registerKeybindingRule({
			...keybinding,
			id: command.id,
			when: command.precondition ? ContextKeyExpr.and(command.precondition, keybinding.when) : keybinding.when
		}));
	}

	return {
		dispose() {
			dispose(disposables);
		}
	};
}
//#endregion
