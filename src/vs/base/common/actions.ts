/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';

export interface ITelemetryData {
	from?: string;
	target?: string;
	[key: string]: any;
}

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

export interface IActionRunner extends IDisposable {
	run(action: IAction, context?: any): TPromise<any>;
	onDidRun: Event<IRunEvent>;
	onDidBeforeRun: Event<IRunEvent>;
}

export interface IActionItem {
	actionRunner: IActionRunner;
	setActionContext(context: any): void;
	render(element: any /* HTMLElement */): void;
	isEnabled(): boolean;
	focus(): void;
	blur(): void;
	dispose(): void;
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

	public run(event?: any, data?: ITelemetryData): TPromise<any> {
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

export class ActionRunner implements IActionRunner {

	private _onDidBeforeRun = new Emitter<IRunEvent>();
	private _onDidRun = new Emitter<IRunEvent>();

	public get onDidRun(): Event<IRunEvent> {
		return this._onDidRun.event;
	}

	public get onDidBeforeRun(): Event<IRunEvent> {
		return this._onDidBeforeRun.event;
	}

	public run(action: IAction, context?: any): TPromise<any> {
		if (!action.enabled) {
			return TPromise.as(null);
		}

		this._onDidBeforeRun.fire({ action: action });

		return this.runAction(action, context).then((result: any) => {
			this._onDidRun.fire({ action: action, result: result });
		}, (error: any) => {
			this._onDidRun.fire({ action: action, error: error });
		});
	}

	protected runAction(action: IAction, context?: any): TPromise<any> {
		const res = context ? action.run(context) : action.run();

		if (TPromise.is(res)) {
			return res;
		}

		return TPromise.wrap(res);
	}

	public dispose(): void {
		this._onDidBeforeRun.dispose();
		this._onDidRun.dispose();
	}
}
