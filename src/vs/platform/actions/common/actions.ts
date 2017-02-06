/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { SyncDescriptor0, createSyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IConstructorSignature2, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindings } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IDisposable } from 'vs/base/common/lifecycle';
import Event from 'vs/base/common/event';

export interface ICommandAction {
	id: string;
	title: string;
	category?: string;
	iconClass?: string;
}

export interface IMenu extends IDisposable {
	onDidChange: Event<IMenu>;
	getActions(arg?: any): [string, MenuItemAction[]][];
}

export interface IMenuItem {
	command: ICommandAction;
	alt?: ICommandAction;
	when?: ContextKeyExpr;
	group?: 'navigation' | string;
	order?: number;
}

export class MenuId {

	static readonly EditorTitle = new MenuId('1');
	static readonly EditorTitleContext = new MenuId('2');
	static readonly EditorContext = new MenuId('3');
	static readonly ExplorerContext = new MenuId('4');
	static readonly ProblemsPanelContext = new MenuId('5');
	static readonly DebugVariablesContext = new MenuId('6');
	static readonly DebugWatchContext = new MenuId('7');
	static readonly DebugCallStackContext = new MenuId('8');
	static readonly DebugBreakpointsContext = new MenuId('9');
	static readonly DebugConsoleContext = new MenuId('10');
	static readonly SCMTitle = new MenuId('11');
	static readonly SCMResourceGroupContext = new MenuId('12');
	static readonly SCMResourceContext = new MenuId('13');

	constructor(private _id: string) {

	}

	get id(): string {
		return this._id;
	}
}

export const IMenuService = createDecorator<IMenuService>('menuService');

export interface IMenuService {

	_serviceBrand: any;

	createMenu(id: MenuId, scopedKeybindingService: IContextKeyService): IMenu;

	getCommandActions(): ICommandAction[];
}

export interface IMenuRegistry {
	commands: { [id: string]: ICommandAction };
	addCommand(userCommand: ICommandAction): boolean;
	getCommand(id: string): ICommandAction;
	appendMenuItem(menu: MenuId, item: IMenuItem): IDisposable;
	getMenuItems(loc: MenuId): IMenuItem[];
}

export const MenuRegistry: IMenuRegistry = new class {

	commands: { [id: string]: ICommandAction } = Object.create(null);

	menuItems: { [loc: string]: IMenuItem[] } = Object.create(null);

	addCommand(command: ICommandAction): boolean {
		const old = this.commands[command.id];
		this.commands[command.id] = command;
		return old !== void 0;
	}

	getCommand(id: string): ICommandAction {
		return this.commands[id];
	}

	appendMenuItem({id}: MenuId, item: IMenuItem): IDisposable {
		let array = this.menuItems[id];
		if (!array) {
			this.menuItems[id] = array = [item];
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

	getMenuItems({id}: MenuId): IMenuItem[] {
		return this.menuItems[id] || [];
	}
};

export class ExecuteCommandAction extends Action {

	constructor(
		id: string,
		label: string,
		@ICommandService private _commandService: ICommandService) {

		super(id, label);
	}

	run(...args: any[]): TPromise<any> {
		return this._commandService.executeCommand(this.id, ...args);
	}
}

export class MenuItemAction extends ExecuteCommandAction {

	private _arg: any;

	readonly item: ICommandAction;
	readonly alt: MenuItemAction;

	constructor(
		item: ICommandAction,
		alt: ICommandAction,
		arg: any,
		@ICommandService commandService: ICommandService
	) {
		super(item.id, item.title, commandService);
		this._cssClass = item.iconClass;
		this._enabled = true;
		this._arg = arg;

		this.item = item;
		this.alt = alt ? new MenuItemAction(alt, undefined, arg, commandService) : undefined;
	}

	run(): TPromise<any> {
		return super.run(this._arg);
	}
}

export class SyncActionDescriptor {

	private _descriptor: SyncDescriptor0<Action>;

	private _id: string;
	private _label: string;
	private _keybindings: IKeybindings;
	private _keybindingContext: ContextKeyExpr;
	private _keybindingWeight: number;

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

	public get keybindings(): IKeybindings {
		return this._keybindings;
	}

	public get keybindingContext(): ContextKeyExpr {
		return this._keybindingContext;
	}

	public get keybindingWeight(): number {
		return this._keybindingWeight;
	}
}