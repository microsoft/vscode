/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action, IAction, Separator, SubmenuAction } from 'vs/base/common/actions';
import { CSSIcon } from 'vs/base/common/codicons';
import { Event, MicrotaskEmitter } from 'vs/base/common/event';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { ICommandAction, ICommandActionTitle, Icon, ILocalizedString } from 'vs/platform/action/common/action';
import { CommandsRegistry, ICommandHandlerDescription, ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor, SyncDescriptor0 } from 'vs/platform/instantiation/common/descriptors';
import { BrandedService, createDecorator, IConstructorSignature, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingRule, IKeybindings, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';

export interface IMenuItem {
	command: ICommandAction;
	alt?: ICommandAction;
	when?: ContextKeyExpression;
	group?: 'navigation' | string;
	order?: number;
}

export interface ISubmenuItem {
	title: string | ICommandActionTitle;
	submenu: MenuId;
	icon?: Icon;
	when?: ContextKeyExpression;
	group?: 'navigation' | string;
	order?: number;
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
	static readonly DebugWatchContext = new MenuId('DebugWatchContext');
	static readonly DebugToolBar = new MenuId('DebugToolBar');
	static readonly DebugToolBarStop = new MenuId('DebugToolBarStop');
	static readonly EditorContext = new MenuId('EditorContext');
	static readonly SimpleEditorContext = new MenuId('SimpleEditorContext');
	static readonly EditorContent = new MenuId('EditorContent');
	static readonly EditorContextCopy = new MenuId('EditorContextCopy');
	static readonly EditorContextPeek = new MenuId('EditorContextPeek');
	static readonly EditorContextShare = new MenuId('EditorContextShare');
	static readonly EditorTitle = new MenuId('EditorTitle');
	static readonly EditorTitleRun = new MenuId('EditorTitleRun');
	static readonly EditorTitleContext = new MenuId('EditorTitleContext');
	static readonly EmptyEditorGroup = new MenuId('EmptyEditorGroup');
	static readonly EmptyEditorGroupContext = new MenuId('EmptyEditorGroupContext');
	static readonly ExplorerContext = new MenuId('ExplorerContext');
	static readonly ExtensionContext = new MenuId('ExtensionContext');
	static readonly GlobalActivity = new MenuId('GlobalActivity');
	static readonly CommandCenter = new MenuId('CommandCenter');
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
	static readonly MenubarPanelAlignmentMenu = new MenuId('MenubarPanelAlignmentMenu');
	static readonly MenubarPanelPositionMenu = new MenuId('MenubarPanelPositionMenu');
	static readonly MenubarPreferencesMenu = new MenuId('MenubarPreferencesMenu');
	static readonly MenubarRecentMenu = new MenuId('MenubarRecentMenu');
	static readonly MenubarSelectionMenu = new MenuId('MenubarSelectionMenu');
	static readonly MenubarShare = new MenuId('MenubarShare');
	static readonly MenubarSwitchEditorMenu = new MenuId('MenubarSwitchEditorMenu');
	static readonly MenubarSwitchGroupMenu = new MenuId('MenubarSwitchGroupMenu');
	static readonly MenubarTerminalMenu = new MenuId('MenubarTerminalMenu');
	static readonly MenubarViewMenu = new MenuId('MenubarViewMenu');
	static readonly MenubarHomeMenu = new MenuId('MenubarHomeMenu');
	static readonly OpenEditorsContext = new MenuId('OpenEditorsContext');
	static readonly ProblemsPanelContext = new MenuId('ProblemsPanelContext');
	static readonly SCMChangeContext = new MenuId('SCMChangeContext');
	static readonly SCMResourceContext = new MenuId('SCMResourceContext');
	static readonly SCMResourceFolderContext = new MenuId('SCMResourceFolderContext');
	static readonly SCMResourceGroupContext = new MenuId('SCMResourceGroupContext');
	static readonly SCMSourceControl = new MenuId('SCMSourceControl');
	static readonly SCMTitle = new MenuId('SCMTitle');
	static readonly SearchContext = new MenuId('SearchContext');
	static readonly StatusBarWindowIndicatorMenu = new MenuId('StatusBarWindowIndicatorMenu');
	static readonly StatusBarRemoteIndicatorMenu = new MenuId('StatusBarRemoteIndicatorMenu');
	static readonly TestItem = new MenuId('TestItem');
	static readonly TestItemGutter = new MenuId('TestItemGutter');
	static readonly TestPeekElement = new MenuId('TestPeekElement');
	static readonly TestPeekTitle = new MenuId('TestPeekTitle');
	static readonly TouchBarContext = new MenuId('TouchBarContext');
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
	static readonly CommentThreadTitle = new MenuId('CommentThreadTitle');
	static readonly CommentThreadActions = new MenuId('CommentThreadActions');
	static readonly CommentThreadTitleContext = new MenuId('CommentThreadTitleContext');
	static readonly CommentThreadCommentContext = new MenuId('CommentThreadCommentContext');
	static readonly CommentTitle = new MenuId('CommentTitle');
	static readonly CommentActions = new MenuId('CommentActions');
	static readonly InteractiveToolbar = new MenuId('InteractiveToolbar');
	static readonly InteractiveCellTitle = new MenuId('InteractiveCellTitle');
	static readonly InteractiveCellDelete = new MenuId('InteractiveCellDelete');
	static readonly InteractiveCellExecute = new MenuId('InteractiveCellExecute');
	static readonly InteractiveInputExecute = new MenuId('InteractiveInputExecute');
	static readonly NotebookToolbar = new MenuId('NotebookToolbar');
	static readonly NotebookCellTitle = new MenuId('NotebookCellTitle');
	static readonly NotebookCellDelete = new MenuId('NotebookCellDelete');
	static readonly NotebookCellInsert = new MenuId('NotebookCellInsert');
	static readonly NotebookCellBetween = new MenuId('NotebookCellBetween');
	static readonly NotebookCellListTop = new MenuId('NotebookCellTop');
	static readonly NotebookCellExecute = new MenuId('NotebookCellExecute');
	static readonly NotebookCellExecutePrimary = new MenuId('NotebookCellExecutePrimary');
	static readonly NotebookDiffCellInputTitle = new MenuId('NotebookDiffCellInputTitle');
	static readonly NotebookDiffCellMetadataTitle = new MenuId('NotebookDiffCellMetadataTitle');
	static readonly NotebookDiffCellOutputsTitle = new MenuId('NotebookDiffCellOutputsTitle');
	static readonly NotebookOutputToolbar = new MenuId('NotebookOutputToolbar');
	static readonly NotebookEditorLayoutConfigure = new MenuId('NotebookEditorLayoutConfigure');
	static readonly NotebookKernelSource = new MenuId('NotebookKernelSource');
	static readonly BulkEditTitle = new MenuId('BulkEditTitle');
	static readonly BulkEditContext = new MenuId('BulkEditContext');
	static readonly TimelineItemContext = new MenuId('TimelineItemContext');
	static readonly TimelineTitle = new MenuId('TimelineTitle');
	static readonly TimelineTitleContext = new MenuId('TimelineTitleContext');
	static readonly TimelineFilterSubMenu = new MenuId('TimelineFilterSubMenu');
	static readonly AccountsContext = new MenuId('AccountsContext');
	static readonly PanelTitle = new MenuId('PanelTitle');
	static readonly AuxiliaryBarTitle = new MenuId('AuxiliaryBarTitle');
	static readonly TerminalInstanceContext = new MenuId('TerminalInstanceContext');
	static readonly TerminalEditorInstanceContext = new MenuId('TerminalEditorInstanceContext');
	static readonly TerminalNewDropdownContext = new MenuId('TerminalNewDropdownContext');
	static readonly TerminalTabContext = new MenuId('TerminalTabContext');
	static readonly TerminalTabEmptyAreaContext = new MenuId('TerminalTabEmptyAreaContext');
	static readonly TerminalInlineTabContext = new MenuId('TerminalInlineTabContext');
	static readonly WebviewContext = new MenuId('WebviewContext');
	static readonly InlineCompletionsActions = new MenuId('InlineCompletionsActions');
	static readonly NewFile = new MenuId('NewFile');
	static readonly MergeInput1Toolbar = new MenuId('MergeToolbar1Toolbar');
	static readonly MergeInput2Toolbar = new MenuId('MergeToolbar2Toolbar');
	static readonly MergeInputResultToolbar = new MenuId('MergeToolbarResultToolbar');

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

export interface IMenu extends IDisposable {
	readonly onDidChange: Event<IMenu>;
	getActions(options?: IMenuActionOptions): [string, Array<MenuItemAction | SubmenuItemAction>][];
}

export const IMenuService = createDecorator<IMenuService>('menuService');

export interface IMenuCreateOptions {
	emitEventsForSubmenuChanges?: boolean;
	eventDebounceDelay?: number;
}

export interface IMenuService {

	readonly _serviceBrand: undefined;

	/**
	 * Create a new menu for the given menu identifier. A menu sends events when it's entries
	 * have changed (placement, enablement, checked-state). By default it does not send events for
	 * submenu entries. That is more expensive and must be explicitly enabled with the
	 * `emitEventsForSubmenuChanges` flag.
	 */
	createMenu(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuCreateOptions): IMenu;

	/**
	 * Reset **all** menu item hidden states.
	 */
	resetHiddenStates(): void;
}

export type ICommandsMap = Map<string, ICommandAction>;

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

		return toDisposable(() => {
			if (this._commands.delete(command.id)) {
				this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(MenuId.CommandPalette));
			}
		});
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
		return toDisposable(rm);
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
		private readonly _menuService: IMenuService,
		private readonly _contextKeyService: IContextKeyService,
		private readonly _options?: IMenuActionOptions
	) {
		super(`submenuitem.${item.submenu.id}`, typeof item.title === 'string' ? item.title : item.title.value, [], 'submenu');
	}

	override get actions(): readonly IAction[] {
		const result: IAction[] = [];
		const menu = this._menuService.createMenu(this.item.submenu, this._contextKeyService);
		const groups = menu.getActions(this._options);
		menu.dispose();
		for (const [, actions] of groups) {
			if (actions.length > 0) {
				result.push(...actions);
				result.push(new Separator());
			}
		}
		if (result.length) {
			result.pop(); // remove last separator
		}
		return result;
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
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private _commandService: ICommandService
	) {
		this.id = item.id;
		this.label = options?.renderShortTitle && item.shortTitle
			? (typeof item.shortTitle === 'string' ? item.shortTitle : item.shortTitle.value)
			: (typeof item.title === 'string' ? item.title : item.title.value);
		this.tooltip = (typeof item.tooltip === 'string' ? item.tooltip : item.tooltip?.value) ?? '';
		this.enabled = !item.precondition || contextKeyService.contextMatchesRules(item.precondition);
		this.checked = undefined;

		if (item.toggled) {
			const toggled = ((item.toggled as { condition: ContextKeyExpression }).condition ? item.toggled : { condition: item.toggled }) as {
				condition: ContextKeyExpression; icon?: Icon; tooltip?: string | ILocalizedString; title?: string | ILocalizedString;
			};
			this.checked = contextKeyService.contextMatchesRules(toggled.condition);
			if (this.checked && toggled.tooltip) {
				this.tooltip = typeof toggled.tooltip === 'string' ? toggled.tooltip : toggled.tooltip.value;
			}

			if (toggled.title) {
				this.label = typeof toggled.title === 'string' ? toggled.title : toggled.title.value;
			}
		}

		this.item = item;
		this.alt = alt ? new MenuItemAction(alt, undefined, options, hideActions, contextKeyService, _commandService) : undefined;
		this._options = options;
		if (ThemeIcon.isThemeIcon(item.icon)) {
			this.class = CSSIcon.asClassName(item.icon);
		}
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

/**
 * @deprecated Use {@link registerAction2} instead.
 */
export class SyncActionDescriptor {

	private readonly _descriptor: SyncDescriptor0<Action>;

	private readonly _id: string;
	private readonly _label?: string;
	private readonly _keybindings: IKeybindings | undefined;
	private readonly _keybindingContext: ContextKeyExpression | undefined;
	private readonly _keybindingWeight: number | undefined;

	public static create<Services extends BrandedService[]>(ctor: { new(id: string, label: string, ...services: Services): Action },
		id: string, label: string | undefined, keybindings?: IKeybindings, keybindingContext?: ContextKeyExpression, keybindingWeight?: number
	): SyncActionDescriptor {
		return new SyncActionDescriptor(ctor as IConstructorSignature<Action, [string, string | undefined]>, id, label, keybindings, keybindingContext, keybindingWeight);
	}

	public static from<Services extends BrandedService[]>(
		ctor: {
			new(id: string, label: string, ...services: Services): Action;
			readonly ID: string;
			readonly LABEL: string;
		},
		keybindings?: IKeybindings, keybindingContext?: ContextKeyExpression, keybindingWeight?: number
	): SyncActionDescriptor {
		return SyncActionDescriptor.create(ctor, ctor.ID, ctor.LABEL, keybindings, keybindingContext, keybindingWeight);
	}

	private constructor(ctor: IConstructorSignature<Action, [string, string | undefined]>,
		id: string, label: string | undefined, keybindings?: IKeybindings, keybindingContext?: ContextKeyExpression, keybindingWeight?: number
	) {
		this._id = id;
		this._label = label;
		this._keybindings = keybindings;
		this._keybindingContext = keybindingContext;
		this._keybindingWeight = keybindingWeight;
		this._descriptor = new SyncDescriptor(ctor, [this._id, this._label]);
	}

	public get syncDescriptor(): SyncDescriptor0<Action> {
		return this._descriptor;
	}

	public get id(): string {
		return this._id;
	}

	public get label(): string | undefined {
		return this._label;
	}

	public get keybindings(): IKeybindings | undefined {
		return this._keybindings;
	}

	public get keybindingContext(): ContextKeyExpression | undefined {
		return this._keybindingContext;
	}

	public get keybindingWeight(): number | undefined {
		return this._keybindingWeight;
	}
}

//#region --- IAction2

type OneOrN<T> = T | T[];

export interface IAction2Options extends ICommandAction {

	/**
	 * Shorthand to add this command to the command palette
	 */
	f1?: boolean;

	/**
	 * One or many menu items.
	 */
	menu?: OneOrN<{ id: MenuId } & Omit<IMenuItem, 'command'>>;

	/**
	 * One keybinding.
	 */
	keybinding?: OneOrN<Omit<IKeybindingRule, 'id'>>;

	/**
	 * Metadata about this command, used for API commands or when
	 * showing keybindings that have no other UX.
	 */
	description?: ICommandHandlerDescription;
}

export abstract class Action2 {
	constructor(readonly desc: Readonly<IAction2Options>) { }
	abstract run(accessor: ServicesAccessor, ...args: any[]): void;
}

export function registerAction2(ctor: { new(): Action2 }): IDisposable {
	const disposables = new DisposableStore();
	const action = new ctor();

	const { f1, menu, keybinding, description, ...command } = action.desc;

	// command
	disposables.add(CommandsRegistry.registerCommand({
		id: command.id,
		handler: (accessor, ...args) => action.run(accessor, ...args),
		description: description,
	}));

	// menu
	if (Array.isArray(menu)) {
		for (const item of menu) {
			disposables.add(MenuRegistry.appendMenuItem(item.id, { command, ...item }));
		}

	} else if (menu) {
		disposables.add(MenuRegistry.appendMenuItem(menu.id, { command, ...menu }));
	}
	if (f1) {
		disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command, when: command.precondition }));
		disposables.add(MenuRegistry.addCommand(command));
	}

	// keybinding
	if (Array.isArray(keybinding)) {
		for (const item of keybinding) {
			disposables.add(KeybindingsRegistry.registerKeybindingRule({
				...item,
				id: command.id,
				when: command.precondition ? ContextKeyExpr.and(command.precondition, item.when) : item.when
			}));
		}
	} else if (keybinding) {
		disposables.add(KeybindingsRegistry.registerKeybindingRule({
			...keybinding,
			id: command.id,
			when: command.precondition ? ContextKeyExpr.and(command.precondition, keybinding.when) : keybinding.when
		}));
	}

	return disposables;
}
//#endregion
