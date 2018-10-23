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
import { Event } from 'vs/base/common/event';
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

export class MenuId {

	private static ID = 1;

	static readonly EditorTitle = new MenuId();
	static readonly EditorTitleContext = new MenuId();
	static readonly EditorContext = new MenuId();
	static readonly EmptyEditorGroupContext = new MenuId();
	static readonly ExplorerContext = new MenuId();
	static readonly OpenEditorsContext = new MenuId();
	static readonly ProblemsPanelContext = new MenuId();
	static readonly DebugVariablesContext = new MenuId();
	static readonly DebugWatchContext = new MenuId();
	static readonly DebugCallStackContext = new MenuId();
	static readonly DebugBreakpointsContext = new MenuId();
	static readonly DebugConsoleContext = new MenuId();
	static readonly SCMTitle = new MenuId();
	static readonly SCMSourceControl = new MenuId();
	static readonly SCMResourceGroupContext = new MenuId();
	static readonly SCMResourceContext = new MenuId();
	static readonly SCMChangeContext = new MenuId();
	static readonly CommandPalette = new MenuId();
	static readonly ViewTitle = new MenuId();
	static readonly ViewItemContext = new MenuId();
	static readonly TouchBarContext = new MenuId();
	static readonly SearchContext = new MenuId();
	static readonly MenubarFileMenu = new MenuId();
	static readonly MenubarEditMenu = new MenuId();
	static readonly MenubarRecentMenu = new MenuId();
	static readonly MenubarSelectionMenu = new MenuId();
	static readonly MenubarViewMenu = new MenuId();
	static readonly MenubarAppearanceMenu = new MenuId();
	static readonly MenubarLayoutMenu = new MenuId();
	static readonly MenubarGoMenu = new MenuId();
	static readonly MenubarSwitchEditorMenu = new MenuId();
	static readonly MenubarSwitchGroupMenu = new MenuId();
	static readonly MenubarDebugMenu = new MenuId();
	static readonly MenubarNewBreakpointMenu = new MenuId();
	static readonly MenubarPreferencesMenu = new MenuId();
	static readonly MenubarHelpMenu = new MenuId();
	static readonly MenubarTerminalMenu = new MenuId();

	readonly id: string = String(MenuId.ID++);
}

export interface IMenuActionOptions {
	arg?: any;
	shouldForwardArgs?: boolean;
}

export interface IMenu extends IDisposable {
	onDidChange: Event<IMenu>;
	getActions(options?: IMenuActionOptions): [string, (MenuItemAction | SubmenuItemAction)[]][];
}

export const IMenuService = createDecorator<IMenuService>('menuService');

export interface IMenuService {

	_serviceBrand: any;

	createMenu(id: MenuId, scopedKeybindingService: IContextKeyService): IMenu;
}

export interface IMenuRegistry {
	addCommand(userCommand: ICommandAction): boolean;
	getCommand(id: string): ICommandAction;
	getCommands(): ICommandsMap;
	appendMenuItem(menu: MenuId, item: IMenuItem | ISubmenuItem): IDisposable;
	getMenuItems(loc: MenuId): (IMenuItem | ISubmenuItem)[];
}

export interface ICommandsMap {
	[id: string]: ICommandAction;
}

export const MenuRegistry: IMenuRegistry = new class implements IMenuRegistry {

	private _commands: { [id: string]: ICommandAction } = Object.create(null);

	private _menuItems: { [loc: string]: (IMenuItem | ISubmenuItem)[] } = Object.create(null);

	addCommand(command: ICommandAction): boolean {
		const old = this._commands[command.id];
		this._commands[command.id] = command;
		return old !== void 0;
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

	appendMenuItem({ id }: MenuId, item: IMenuItem | ISubmenuItem): IDisposable {
		let array = this._menuItems[id];
		if (!array) {
			this._menuItems[id] = array = [item];
		} else {
			array.push(item);
		}
		return {
			dispose() {
				const idx = array.indexOf(item);
				if (idx >= 0) {
					array.splice(idx, 1);
				}
			}
		};
	}

	getMenuItems({ id }: MenuId): (IMenuItem | ISubmenuItem)[] {
		const result = this._menuItems[id] || [];

		if (id === MenuId.CommandPalette.id) {
			// CommandPalette is special because it shows
			// all commands by default
			this._appendImplicitItems(result);
		}
		return result;
	}

	private _appendImplicitItems(result: (IMenuItem | ISubmenuItem)[]) {
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
