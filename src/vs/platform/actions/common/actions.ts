/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Actions = require('vs/base/common/actions');
import WinJS = require('vs/base/common/winjs.base');
import Assert = require('vs/base/common/assert');
import Descriptors = require('vs/platform/instantiation/common/descriptors');
import Instantiation = require('vs/platform/instantiation/common/instantiation');
import {KbExpr, IKeybindings, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IDisposable} from 'vs/base/common/lifecycle';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';

export interface CommandAction {
	id: string;
	title: string;
	category?: string;
	iconClass?: string;
}

export interface IMenu extends IDisposable {
	onDidChange: Event<IMenu>;
	getActions(): [string, Actions.IAction[]][];
}

export interface IMenuItem {
	command: CommandAction;
	alt?: CommandAction;
	when?: KbExpr;
	group?: string;
}

export enum MenuId {
	EditorTitle = 1,
	EditorContext = 2,
	ExplorerContext = 3
}

export const IMenuService = createDecorator<IMenuService>('menuService');

export interface IMenuService {

	serviceId: any;

	createMenu(id: MenuId, scopedKeybindingService: IKeybindingService): IMenu;

	getCommandActions(): CommandAction[];
}

export class MenuItemAction extends Actions.Action {

	private static _getMenuItemId(item: IMenuItem): string {
		let result = item.command.id;
		if (item.alt) {
			result += `||${item.alt.id}`;
		}
		return result;
	}

	private _resource: URI;

	constructor(
		private _item: IMenuItem,
		@IKeybindingService private _keybindingService: IKeybindingService
	) {
		super(MenuItemAction._getMenuItemId(_item), _item.command.title);

		this.order = 100000; //TODO@Ben order is menu item property, not an action property
	}

	set resource(value: URI) {
		this._resource = value;
	}

	get resource() {
		return this._resource;
	}

	get item(): IMenuItem {
		return this._item;
	}

	get command() {
		return this._item.command;
	}

	get altCommand() {
		return this._item.alt;
	}

	run(alt: boolean) {
		const {id} = alt === true && this._item.alt || this._item.command;
		return this._keybindingService.executeCommand(id, this._resource);
	}
}


export class ExecuteCommandAction extends Actions.Action {

	constructor(
		id: string,
		label: string,
		@IKeybindingService private _keybindingService: IKeybindingService) {

		super(id, label);
	}

	run(...args: any[]): WinJS.TPromise<any> {
		return this._keybindingService.executeCommand(this.id, ...args);
	}
}

export class SyncActionDescriptor {

	private _descriptor: Descriptors.SyncDescriptor0<Actions.Action>;

	private _id: string;
	private _label: string;
	private _keybindings: IKeybindings;
	private _keybindingContext: KbExpr;
	private _keybindingWeight: number;

	constructor(ctor: Instantiation.IConstructorSignature2<string, string, Actions.Action>,
		id: string, label: string, keybindings?: IKeybindings, keybindingContext?: KbExpr, keybindingWeight?: number
	) {
		this._id = id;
		this._label = label;
		this._keybindings = keybindings;
		this._keybindingContext = keybindingContext;
		this._keybindingWeight = keybindingWeight;
		this._descriptor = Descriptors.createSyncDescriptor(ctor, this._id, this._label);
	}

	public get syncDescriptor(): Descriptors.SyncDescriptor0<Actions.Action> {
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

	public get keybindingContext(): KbExpr {
		return this._keybindingContext;
	}

	public get keybindingWeight(): number {
		return this._keybindingWeight;
	}
}

/**
 * A proxy for an action that needs to load code in order to confunction. Can be used from contributions to defer
 * module loading up to the point until the run method is being executed.
 */
export class DeferredAction extends Actions.Action {
	private _cachedAction: Actions.IAction;
	private _emitterUnbind: IDisposable;

	constructor(private _instantiationService: Instantiation.IInstantiationService, private _descriptor: Descriptors.AsyncDescriptor0<Actions.Action>,
		id: string, label = '', cssClass = '', enabled = true) {

		super(id, label, cssClass, enabled);
	}

	public get cachedAction(): Actions.IAction {
		return this._cachedAction;
	}

	public set cachedAction(action: Actions.IAction) {
		this._cachedAction = action;
	}

	public get id(): string {
		if (this._cachedAction instanceof Actions.Action) {
			return this._cachedAction.id;
		}

		return this._id;
	}

	public get label(): string {
		if (this._cachedAction instanceof Actions.Action) {
			return this._cachedAction.label;
		}

		return this._label;
	}

	public set label(value: string) {
		if (this._cachedAction instanceof Actions.Action) {
			this._cachedAction.label = value;
		} else {
			this._setLabel(value);
		}
	}

	public get class(): string {
		if (this._cachedAction instanceof Actions.Action) {
			return this._cachedAction.class;
		}

		return this._cssClass;
	}

	public set class(value: string) {
		if (this._cachedAction instanceof Actions.Action) {
			this._cachedAction.class = value;
		} else {
			this._setClass(value);
		}
	}

	public get enabled(): boolean {
		if (this._cachedAction instanceof Actions.Action) {
			return this._cachedAction.enabled;
		}
		return this._enabled;
	}

	public set enabled(value: boolean) {
		if (this._cachedAction instanceof Actions.Action) {
			this._cachedAction.enabled = value;
		} else {
			this._setEnabled(value);
		}
	}

	public get order(): number {
		if (this._cachedAction instanceof Actions.Action) {
			return (<Actions.Action>this._cachedAction).order;
		}
		return this._order;
	}

	public set order(order: number) {
		if (this._cachedAction instanceof Actions.Action) {
			(<Actions.Action>this._cachedAction).order = order;
		} else {
			this._order = order;
		}
	}

	public run(event?: any): WinJS.Promise {
		if (this._cachedAction) {
			return this._cachedAction.run(event);
		}
		return this._createAction().then((action: Actions.IAction) => {
			return action.run(event);
		});
	}

	private _createAction(): WinJS.TPromise<Actions.IAction> {
		let promise = WinJS.TPromise.as(undefined);
		return promise.then(() => {
			return this._instantiationService.createInstance(this._descriptor);

		}).then((action) => {
			Assert.ok(action instanceof Actions.Action, 'Action must be an instanceof Base Action');
			this._cachedAction = action;

			// Pipe events from the instantated action through this deferred action
			this._emitterUnbind = this.addEmitter2(<Actions.Action>this._cachedAction);

			return action;
		});
	}

	public dispose(): void {
		if (this._emitterUnbind) {
			this._emitterUnbind.dispose();
		}
		if (this._cachedAction) {
			this._cachedAction.dispose();
		}
		super.dispose();
	}
}