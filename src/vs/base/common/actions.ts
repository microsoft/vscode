/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, combinedDisposable, Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';

export interface ITelemetryData {
	from?: string;
	target?: string;
	[key: string]: any;
}

export interface IAction extends IDisposable {
	id: string;
	label: string;
	tooltip: string;
	class: string | undefined;
	enabled: boolean;
	checked: boolean;
	radio: boolean;
	run(event?: any): Promise<any>;
}

export interface IActionRunner extends IDisposable {
	run(action: IAction, context?: any): Promise<any>;
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
	readonly onDidChange: Event<IActionChangeEvent> = this._onDidChange.event;

	protected _id: string;
	protected _label: string;
	protected _tooltip: string;
	protected _cssClass: string | undefined;
	protected _enabled: boolean;
	protected _checked: boolean;
	protected _radio: boolean;
	protected _actionCallback?: (event?: any) => Promise<any>;

	constructor(id: string, label: string = '', cssClass: string = '', enabled: boolean = true, actionCallback?: (event?: any) => Promise<any>) {
		this._id = id;
		this._label = label;
		this._cssClass = cssClass;
		this._enabled = enabled;
		this._actionCallback = actionCallback;
	}

	get id(): string {
		return this._id;
	}

	get label(): string {
		return this._label;
	}

	set label(value: string) {
		this._setLabel(value);
	}

	protected _setLabel(value: string): void {
		if (this._label !== value) {
			this._label = value;
			this._onDidChange.fire({ label: value });
		}
	}

	get tooltip(): string {
		return this._tooltip;
	}

	set tooltip(value: string) {
		this._setTooltip(value);
	}

	protected _setTooltip(value: string): void {
		if (this._tooltip !== value) {
			this._tooltip = value;
			this._onDidChange.fire({ tooltip: value });
		}
	}

	get class(): string | undefined {
		return this._cssClass;
	}

	set class(value: string | undefined) {
		this._setClass(value);
	}

	protected _setClass(value: string | undefined): void {
		if (this._cssClass !== value) {
			this._cssClass = value;
			this._onDidChange.fire({ class: value });
		}
	}

	get enabled(): boolean {
		return this._enabled;
	}

	set enabled(value: boolean) {
		this._setEnabled(value);
	}

	protected _setEnabled(value: boolean): void {
		if (this._enabled !== value) {
			this._enabled = value;
			this._onDidChange.fire({ enabled: value });
		}
	}

	get checked(): boolean {
		return this._checked;
	}

	set checked(value: boolean) {
		this._setChecked(value);
	}

	get radio(): boolean {
		return this._radio;
	}

	set radio(value: boolean) {
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

	run(event?: any, _data?: ITelemetryData): Promise<any> {
		if (this._actionCallback) {
			return this._actionCallback(event);
		}

		return Promise.resolve(true);
	}

	dispose() {
		this._onDidChange.dispose();
	}
}

export interface IRunEvent {
	action: IAction;
	result?: any;
	error?: any;
}

export class ActionRunner extends Disposable implements IActionRunner {

	private _onDidBeforeRun = this._register(new Emitter<IRunEvent>());
	readonly onDidBeforeRun: Event<IRunEvent> = this._onDidBeforeRun.event;

	private _onDidRun = this._register(new Emitter<IRunEvent>());
	readonly onDidRun: Event<IRunEvent> = this._onDidRun.event;

	run(action: IAction, context?: any): Promise<any> {
		if (!action.enabled) {
			return Promise.resolve(null);
		}

		this._onDidBeforeRun.fire({ action: action });

		return this.runAction(action, context).then((result: any) => {
			this._onDidRun.fire({ action: action, result: result });
		}, (error: any) => {
			this._onDidRun.fire({ action: action, error: error });
		});
	}

	protected runAction(action: IAction, context?: any): Promise<any> {
		const res = context ? action.run(context) : action.run();
		return Promise.resolve(res);
	}
}

export class RadioGroup extends Disposable {

	constructor(readonly actions: Action[]) {
		super();

		this._register(combinedDisposable(actions.map(action => {
			return action.onDidChange(e => {
				if (e.checked && action.checked) {
					for (const candidate of actions) {
						if (candidate !== action) {
							candidate.checked = false;
						}
					}
				}
			});
		})));
	}
}
