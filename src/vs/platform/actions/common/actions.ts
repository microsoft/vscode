/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { SyncDescriptor0, createSyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IConstructorSignature2, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindings, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService, ICommandHandler, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { URI, UriComponents } from 'vs/base/common/uri';

export interface ILocalizedString {
	value: string;
	original: string;
}

export interface ICommandAction {
	id: string;
	title: string | ILocalizedString;
	category?: string | ILocalizedString;
	iconLocation?: { dark: URI; light?: URI; };
	precondition?: ContextKeyExpr;
	toggled?: ContextKeyExpr;
}

type Serialized<T> = { [K in keyof T]: T[K] extends URI ? UriComponents : Serialized<T[K]> };

export type ISerializableCommandAction = Serialized<ICommandAction>;

export interface IMenuItem {
	command: ICommandAction;
	alt?: ICommandAction;
	when?: ContextKeyExpr;
	group?: 'navigation' | string;
	order?: number;
}

export interface ISubmenuItem {
	title: string | ILocalizedString;
	submenu: MenuId;
	when?: ContextKeyExpr;
	group?: 'navigation' | string;
	order?: number;
}

export function isIMenuItem(item: IMenuItem | ISubmenuItem): item is IMenuItem {
	return (item as IMenuItem).command !== undefined;
}

export function isISubmenuItem(item: IMenuItem | ISubmenuItem): item is ISubmenuItem {
	return (item as ISubmenuItem).submenu !== undefined;
}

export const enum MenuId {
	CommandPalette,
	DebugBreakpointsContext,
	DebugCallStackContext,
	DebugConsoleContext,
	DebugVariablesContext,
	DebugWatchContext,
	DebugToolBar,
	EditorContext,
	EditorTitle,
	EditorTitleContext,
	EmptyEditorGroupContext,
	ExplorerContext,
	MenubarAppearanceMenu,
	MenubarDebugMenu,
	MenubarEditMenu,
	MenubarFileMenu,
	MenubarGoMenu,
	MenubarHelpMenu,
	MenubarLayoutMenu,
	MenubarNewBreakpointMenu,
	MenubarPreferencesMenu,
	MenubarRecentMenu,
	MenubarSelectionMenu,
	MenubarSwitchEditorMenu,
	MenubarSwitchGroupMenu,
	MenubarTerminalMenu,
	MenubarViewMenu,
	OpenEditorsContext,
	ProblemsPanelContext,
	SCMChangeContext,
	SCMResourceContext,
	SCMResourceGroupContext,
	SCMSourceControl,
	SCMTitle,
	SearchContext,
	StatusBarWindowIndicatorMenu,
	TouchBarContext,
	ViewItemContext,
	ViewTitle,
	CommentThreadTitle,
	CommentThreadActions,
	CommentTitle,
	CommentActions,
	GlobalActivity
}

export interface IMenuActionOptions {
	arg?: any;
	shouldForwardArgs?: boolean;
}

export interface IMenu extends IDisposable {
	readonly onDidChange: Event<IMenu | undefined>;
	getActions(options?: IMenuActionOptions): [string, Array<MenuItemAction | SubmenuItemAction>][];
}

export const IMenuService = createDecorator<IMenuService>('menuService');

export interface IMenuService {

	_serviceBrand: any;

	createMenu(id: MenuId, scopedKeybindingService: IContextKeyService): IMenu;
}

export type ICommandsMap = Map<string, ICommandAction>;

export interface IMenuRegistry {
	addCommand(userCommand: ICommandAction): IDisposable;
	getCommand(id: string): ICommandAction | undefined;
	getCommands(): ICommandsMap;
	appendMenuItem(menu: MenuId, item: IMenuItem | ISubmenuItem): IDisposable;
	getMenuItems(loc: MenuId): Array<IMenuItem | ISubmenuItem>;
	readonly onDidChangeMenu: Event<MenuId>;
}

export const MenuRegistry: IMenuRegistry = new class implements IMenuRegistry {

	private readonly _commands = new Map<string, ICommandAction>();
	private readonly _menuItems = new Map<number, Array<IMenuItem | ISubmenuItem>>();
	private readonly _onDidChangeMenu = new Emitter<MenuId>();

	readonly onDidChangeMenu: Event<MenuId> = this._onDidChangeMenu.event;

	addCommand(command: ICommandAction): IDisposable {
		this._commands.set(command.id, command);
		this._onDidChangeMenu.fire(MenuId.CommandPalette);
		return {
			dispose: () => {
				if (this._commands.delete(command.id)) {
					this._onDidChangeMenu.fire(MenuId.CommandPalette);
				}
			}
		};
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
		let array = this._menuItems.get(id);
		if (!array) {
			array = [item];
			this._menuItems.set(id, array);
		} else {
			array.push(item);
		}
		this._onDidChangeMenu.fire(id);
		return {
			dispose: () => {
				const idx = array!.indexOf(item);
				if (idx >= 0) {
					array!.splice(idx, 1);
					this._onDidChangeMenu.fire(id);
				}
			}
		};
	}

	getMenuItems(id: MenuId): Array<IMenuItem | ISubmenuItem> {
		const result = (this._menuItems.get(id) || []).slice(0);

		if (id === MenuId.CommandPalette) {
			// CommandPalette is special because it shows
			// all commands by default
			this._appendImplicitItems(result);
		}
		return result;
	}

	private _appendImplicitItems(result: Array<IMenuItem | ISubmenuItem>) {
		const set = new Set<string>();

		const temp = result.filter(item => { return isIMenuItem(item); }) as IMenuItem[];

		for (const { command, alt } of temp) {
			set.add(command.id);
			if (alt) {
				set.add(alt.id);
			}
		}
		this._commands.forEach((command, id) => {
			if (!set.has(id)) {
				result.push({ command });
			}
		});
	}
};

export class ExecuteCommandAction extends Action {

	constructor(
		id: string,
		label: string,
		@ICommandService private readonly _commandService: ICommandService) {

		super(id, label);
	}

	run(...args: any[]): Promise<any> {
		return this._commandService.executeCommand(this.id, ...args);
	}
}

export class SubmenuItemAction extends Action {

	readonly item: ISubmenuItem;
	constructor(item: ISubmenuItem) {
		typeof item.title === 'string' ? super('', item.title, 'submenu') : super('', item.title.value, 'submenu');
		this.item = item;
	}
}

export class MenuItemAction extends ExecuteCommandAction {

	readonly item: ICommandAction;
	readonly alt: MenuItemAction | undefined;

	private _options: IMenuActionOptions;

	constructor(
		item: ICommandAction,
		alt: ICommandAction | undefined,
		options: IMenuActionOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService
	) {
		typeof item.title === 'string' ? super(item.id, item.title, commandService) : super(item.id, item.title.value, commandService);
		this._cssClass = undefined;
		this._enabled = !item.precondition || contextKeyService.contextMatchesRules(item.precondition);
		this._checked = Boolean(item.toggled && contextKeyService.contextMatchesRules(item.toggled));

		this._options = options || {};

		this.item = item;
		this.alt = alt ? new MenuItemAction(alt, undefined, this._options, contextKeyService, commandService) : undefined;
	}

	dispose(): void {
		if (this.alt) {
			this.alt.dispose();
		}
		super.dispose();
	}

	run(...args: any[]): Promise<any> {
		let runArgs: any[] = [];

		if (this._options.arg) {
			runArgs = [...runArgs, this._options.arg];
		}

		if (this._options.shouldForwardArgs) {
			runArgs = [...runArgs, ...args];
		}

		return super.run(...runArgs);
	}
}

export class SyncActionDescriptor {

	private _descriptor: SyncDescriptor0<Action>;

	private _id: string;
	private _label?: string;
	private _keybindings: IKeybindings | undefined;
	private _keybindingContext: ContextKeyExpr | undefined;
	private _keybindingWeight: number | undefined;

	constructor(ctor: IConstructorSignature2<string, string, Action>,
		id: string, label: string | undefined, keybindings?: IKeybindings, keybindingContext?: ContextKeyExpr, keybindingWeight?: number
	) {
		this._id = id;
		this._label = label;
		this._keybindings = keybindings;
		this._keybindingContext = keybindingContext;
		this._keybindingWeight = keybindingWeight;
		this._descriptor = createSyncDescriptor(ctor, this._id, this._label);
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

	public get keybindingContext(): ContextKeyExpr | undefined {
		return this._keybindingContext;
	}

	public get keybindingWeight(): number | undefined {
		return this._keybindingWeight;
	}
}


export interface IActionDescriptor {
	id: string;
	handler: ICommandHandler;

	// ICommandUI
	title?: ILocalizedString;
	category?: string;
	f1?: boolean;

	//
	menu?: {
		menuId: MenuId,
		when?: ContextKeyExpr;
		group?: string;
	};

	//
	keybinding?: {
		when?: ContextKeyExpr;
		weight?: number;
		keys: IKeybindings;
	};
}


export function registerAction(desc: IActionDescriptor) {

	const { id, handler, title, category, menu, keybinding } = desc;

	// 1) register as command
	CommandsRegistry.registerCommand(id, handler);

	// 2) menus
	if (menu && title) {
		let command = { id, title, category };
		let { menuId, when, group } = menu;
		MenuRegistry.appendMenuItem(menuId, {
			command,
			when,
			group
		});
	}

	// 3) keybindings
	if (keybinding) {
		let { when, weight, keys } = keybinding;
		KeybindingsRegistry.registerKeybindingRule({
			id,
			when,
			weight: weight || 0,
			primary: keys.primary,
			secondary: keys.secondary,
			linux: keys.linux,
			mac: keys.mac,
			win: keys.win
		});
	}
}
