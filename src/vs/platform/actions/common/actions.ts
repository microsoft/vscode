/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { SyncDescriptor0, createSyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IConstructorSignature2, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { URI, UriComponents } from 'vs/base/common/uri';

export interface ILocalizedString {
	value: string;
	original: string;
}

export interface IBaseCommandAction {
	id: string;
	title: string | ILocalizedString;
	category?: string | ILocalizedString;
}

export interface ICommandAction extends IBaseCommandAction {
	iconLocation?: { dark: URI; light?: URI; };
	precondition?: ContextKeyExpr;
	toggled?: ContextKeyExpr;
}

export interface ISerializableCommandAction extends IBaseCommandAction {
	iconLocation?: { dark: UriComponents; light?: UriComponents; };
}

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
	TouchBarContext,
	ViewItemContext,
	ViewTitle,
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

export interface IMenuRegistry {
	addCommand(userCommand: ICommandAction): IDisposable;
	getCommand(id: string): ICommandAction;
	getCommands(): ICommandsMap;
	appendMenuItem(menu: MenuId, item: IMenuItem | ISubmenuItem): IDisposable;
	getMenuItems(loc: MenuId): Array<IMenuItem | ISubmenuItem>;
	readonly onDidChangeMenu: Event<MenuId>;
}

export interface ICommandsMap {
	[id: string]: ICommandAction;
}

export const MenuRegistry: IMenuRegistry = new class implements IMenuRegistry {

	private readonly _commands: { [id: string]: ICommandAction } = Object.create(null);
	private readonly _menuItems: { [loc: string]: Array<IMenuItem | ISubmenuItem> } = Object.create(null);
	private readonly _onDidChangeMenu = new Emitter<MenuId>();

	readonly onDidChangeMenu: Event<MenuId> = this._onDidChangeMenu.event;

	addCommand(command: ICommandAction): IDisposable {
		this._commands[command.id] = command;
		return {
			dispose: () => delete this._commands[command.id]
		};
	}

	getCommand(id: string): ICommandAction {
		return this._commands[id];
	}

	getCommands(): ICommandsMap {
		const result: ICommandsMap = Object.create(null);
		for (const key in this._commands) {
			result[key] = this.getCommand(key);
		}
		return result;
	}

	appendMenuItem(id: MenuId, item: IMenuItem | ISubmenuItem): IDisposable {
		let array = this._menuItems[id];
		if (!array) {
			this._menuItems[id] = array = [item];
		} else {
			array.push(item);
		}
		this._onDidChangeMenu.fire(id);
		return {
			dispose: () => {
				const idx = array.indexOf(item);
				if (idx >= 0) {
					array.splice(idx, 1);
					this._onDidChangeMenu.fire(id);
				}
			}
		};
	}

	getMenuItems(id: MenuId): Array<IMenuItem | ISubmenuItem> {
		const result = this._menuItems[id] || [];

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
		for (let id in this._commands) {
			if (!set.has(id)) {
				result.push({ command: this._commands[id] });
			}
		}
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
	private _label: string;
	private _keybindings: IKeybindings | undefined;
	private _keybindingContext: ContextKeyExpr | undefined;
	private _keybindingWeight: number | undefined;

	constructor(ctor: IConstructorSignature2<string, string, Action>,
		id: string, label: string, keybindings?: IKeybindings, keybindingContext?: ContextKeyExpr, keybindingWeight?: number
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

	public get label(): string {
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
