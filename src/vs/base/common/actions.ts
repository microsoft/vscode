/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IEventEmitter, EventEmitter } from 'vs/base/common/eventEmitter';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as Events from 'vs/base/common/events';
import Event, { Emitter } from 'vs/base/common/event';

export interface IAction extends IDisposable {
	id: string;
	label: string;
	tooltip: string;
	class: string;
	enabled: boolean;
	checked: boolean;
	radio: boolean;
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

export interface IActionChangeEvent {
	label?: string;
	tooltip?: string;
	class?: string;
	enabled?: boolean;
	checked?: boolean;
	radio?: boolean;
}

export class Action implements IAction {

	protected _onDidChange = new Emitter<IActionChangeEvent>();
	protected _id: string;
	protected _label: string;
	protected _tooltip: string;
	protected _cssClass: string;
	protected _enabled: boolean;
	protected _checked: boolean;
	protected _radio: boolean;
	protected _order: number;
	protected _actionCallback: (event?: any) => TPromise<any>;

	constructor(id: string, label: string = '', cssClass: string = '', enabled: boolean = true, actionCallback?: (event?: any) => TPromise<any>) {
		this._id = id;
		this._label = label;
		this._cssClass = cssClass;
		this._enabled = enabled;
		this._actionCallback = actionCallback;
	}

	public dispose() {
		this._onDidChange.dispose();
	}

	public get onDidChange(): Event<IActionChangeEvent> {
		return this._onDidChange.event;
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
			this._onDidChange.fire({ label: value });
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
			this._onDidChange.fire({ tooltip: value });
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
			this._onDidChange.fire({ class: value });
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
			this._onDidChange.fire({ enabled: value });
		}
	}

	public get checked(): boolean {
		return this._checked;
	}

	public set checked(value: boolean) {
		this._setChecked(value);
	}

	public get radio(): boolean {
		return this._radio;
	}

	public set radio(value: boolean) {
		this._setRadio(value);
	}

	protected _setChecked(value: boolean): void {
		if (this._checked !== value) {
			this._checked = value;
			this._onDidChange.fire({ checked: value });
		}
	}

	protected _setRadio(value: boolean): void {
		if (this._radio !== value) {
			this._radio = value;
			this._onDidChange.fire({ radio: value });
		}
	}

	public get order(): number {
		return this._order;
	}

	public set order(value: number) {
		this._order = value;
	}

	public run(event?: any): TPromise<any> {
		if (this._actionCallback !== void 0) {
			return this._actionCallback(event);
		}
		return TPromise.as(true);
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
