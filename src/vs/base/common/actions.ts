/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import { IEventEmitter, EventEmitter } from 'vs/base/common/eventEmitter';
import {IDisposable} from 'vs/base/common/lifecycle';
import * as Events from 'vs/base/common/events';

export interface IAction extends IDisposable {
	id: string;
	label: string;
	tooltip: string;
	class: string;
	enabled: boolean;
	checked: boolean;
	run(event?: any): TPromise<any>;
}

export interface IActionRunner extends IEventEmitter {
	run(action: IAction, context?: any): TPromise<any>;
}

export interface IActionItem extends IEventEmitter {
	actionRunner: IActionRunner;
	setActionContext(context: any): void;
	render(element: any /* HTMLElement */): void;
	isEnabled(): boolean;
	focus(): void;
	blur(): void;
	dispose(): void;
}

/**
 * Checks if the provided object is compatible
 * with the IAction interface.
 * @param thing an object
 */
export function isAction(thing: any): thing is IAction {
	if (!thing) {
		return false;
	} else if (thing instanceof Action) {
		return true;
	} else if (typeof thing.id !== 'string') {
		return false;
	} else if (typeof thing.label !== 'string') {
		return false;
	} else if (typeof thing.class !== 'string') {
		return false;
	} else if (typeof thing.enabled !== 'boolean') {
		return false;
	} else if (typeof thing.checked !== 'boolean') {
		return false;
	} else if (typeof thing.run !== 'function') {
		return false;
	} else {
		return true;
	}
}

export interface IActionCallback {
	(event: any): TPromise<any>;
}

export interface IActionProvider {
	getAction(id: string): IAction;
}

export class Action extends EventEmitter implements IAction {

	static LABEL: string = 'label';
	static TOOLTIP: string = 'tooltip';
	static CLASS: string = 'class';
	static ENABLED: string = 'enabled';
	static CHECKED: string = 'checked';

	protected _id: string;
	protected _label: string;
	protected _tooltip: string;
	protected _cssClass: string;
	protected _enabled: boolean;
	protected _checked: boolean;
	protected _actionCallback: IActionCallback;
	protected _order: number;

	constructor(id: string, label: string = '', cssClass: string = '', enabled: boolean = true, actionCallback: IActionCallback = null) {
		super();

		this._id = id;
		this._label = label;
		this._cssClass = cssClass;
		this._enabled = enabled;
		this._actionCallback = actionCallback;
	}

	public get id(): string {
		return this._id;
	}

	public get label(): string {
		return this._label;
	}

	public set label(value: string) {
		this._setLabel(value);
	}

	protected _setLabel(value: string): void {
		if (this._label !== value) {
			this._label = value;
			this.emit(Action.LABEL, { source: this });
		}
	}

	public get tooltip(): string {
		return this._tooltip;
	}

	public set tooltip(value: string) {
		this._setTooltip(value);
	}

	protected _setTooltip(value: string): void {
		if (this._tooltip !== value) {
			this._tooltip = value;
			this.emit(Action.TOOLTIP, { source: this });
		}
	}

	public get class(): string {
		return this._cssClass;
	}

	public set class(value: string) {
		this._setClass(value);
	}

	protected _setClass(value: string): void {
		if (this._cssClass !== value) {
			this._cssClass = value;
			this.emit(Action.CLASS, { source: this });
		}
	}

	public get enabled(): boolean {
		return this._enabled;
	}

	public set enabled(value: boolean) {
		this._setEnabled(value);
	}

	protected _setEnabled(value: boolean): void {
		if (this._enabled !== value) {
			this._enabled = value;
			this.emit(Action.ENABLED, { source: this });
		}
	}

	public get checked(): boolean {
		return this._checked;
	}

	public set checked(value: boolean) {
		this._setChecked(value);
	}

	protected _setChecked(value: boolean): void {
		if (this._checked !== value) {
			this._checked = value;
			this.emit(Action.CHECKED, { source: this });
		}
	}

	public get order(): number {
		return this._order;
	}

	public set order(value: number) {
		this._order = value;
	}

	public run(event?: any): TPromise<any> {
		if (this._actionCallback !== null) {
			return this._actionCallback(event);
		} else {
			return TPromise.as(true);
		}
	}
}

export interface IRunEvent {
	action: IAction;
	result?: any;
	error?: any;
}

export class ActionRunner extends EventEmitter implements IActionRunner {

	public run(action: IAction, context?: any): TPromise<any> {
		if (!action.enabled) {
			return TPromise.as(null);
		}

		this.emit(Events.EventType.BEFORE_RUN, { action: action });

		return TPromise.as(action.run(context)).then((result: any) => {
			this.emit(Events.EventType.RUN, <IRunEvent>{ action: action, result: result });
		}, (error: any) => {
			this.emit(Events.EventType.RUN, <IRunEvent>{ action: action, error: error });
		});
	}
}
