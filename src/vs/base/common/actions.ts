/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';

export interface ITelemetryData {
	readonly from?: string;
	readonly target?: string;
	[key: string]: any;
}

export type WorkbenchActionExecutedClassification = {
	id: { classification: 'SystemMetaData', purpose: 'FeatureInsight'; };
	from: { classification: 'SystemMetaData', purpose: 'FeatureInsight'; };
};

export type WorkbenchActionExecutedEvent = {
	id: string;
	from: string;
};

export interface IAction extends IDisposable {
	readonly id: string;
	label: string;
	tooltip: string;
	class: string | undefined;
	enabled: boolean;
	checked: boolean;
	run(event?: any): Promise<any>;
}

export interface IActionRunner extends IDisposable {
	run(action: IAction, context?: any): Promise<any>;
	readonly onDidRun: Event<IRunEvent>;
	readonly onBeforeRun: Event<IRunEvent>;
}

export interface IActionViewItem extends IDisposable {
	actionRunner: IActionRunner;
	setActionContext(context: any): void;
	render(element: any /* HTMLElement */): void;
	isEnabled(): boolean;
	focus(fromRight?: boolean): void; // TODO@isidorn what is this?
	blur(): void;
}

export interface IActionViewItemProvider {
	(action: IAction): IActionViewItem | undefined;
}

export interface IActionChangeEvent {
	readonly label?: string;
	readonly tooltip?: string;
	readonly class?: string;
	readonly enabled?: boolean;
	readonly checked?: boolean;
}

export class Action extends Disposable implements IAction {

	protected _onDidChange = this._register(new Emitter<IActionChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	protected readonly _id: string;
	protected _label: string;
	protected _tooltip: string | undefined;
	protected _cssClass: string | undefined;
	protected _enabled: boolean = true;
	protected _checked: boolean = false;
	protected readonly _actionCallback?: (event?: any) => Promise<any>;

	constructor(id: string, label: string = '', cssClass: string = '', enabled: boolean = true, actionCallback?: (event?: any) => Promise<any>) {
		super();
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

	private _setLabel(value: string): void {
		if (this._label !== value) {
			this._label = value;
			this._onDidChange.fire({ label: value });
		}
	}

	get tooltip(): string {
		return this._tooltip || '';
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

	protected _setChecked(value: boolean): void {
		if (this._checked !== value) {
			this._checked = value;
			this._onDidChange.fire({ checked: value });
		}
	}

	run(event?: any, _data?: ITelemetryData): Promise<any> {
		if (this._actionCallback) {
			return this._actionCallback(event);
		}

		return Promise.resolve(true);
	}
}

export interface IRunEvent {
	readonly action: IAction;
	readonly result?: any;
	readonly error?: any;
}

export class ActionRunner extends Disposable implements IActionRunner {

	private _onBeforeRun = this._register(new Emitter<IRunEvent>());
	readonly onBeforeRun = this._onBeforeRun.event;

	private _onDidRun = this._register(new Emitter<IRunEvent>());
	readonly onDidRun = this._onDidRun.event;

	async run(action: IAction, context?: any): Promise<any> {
		if (!action.enabled) {
			return Promise.resolve(null);
		}

		this._onBeforeRun.fire({ action: action });

		try {
			const result = await this.runAction(action, context);
			this._onDidRun.fire({ action: action, result: result });
		} catch (error) {
			this._onDidRun.fire({ action: action, error: error });
		}
	}

	protected runAction(action: IAction, context?: any): Promise<any> {
		const res = context ? action.run(context) : action.run();
		return Promise.resolve(res);
	}
}

export class Separator extends Action {

	static readonly ID = 'vs.actions.separator';

	constructor(label?: string) {
		super(Separator.ID, label, label ? 'separator text' : 'separator');
		this.checked = false;
		this.enabled = false;
	}
}

export class SubmenuAction implements IAction {

	readonly id: string;
	readonly label: string;
	readonly class: string | undefined;
	readonly tooltip: string = '';
	readonly enabled: boolean = true;
	readonly checked: boolean = false;

	private readonly _actions: readonly IAction[];

	constructor(id: string, label: string, actions: readonly IAction[], cssClass?: string) {
		this.id = id;
		this.label = label;
		this.class = cssClass;
		this._actions = actions;
	}

	dispose(): void {
		// there is NOTHING to dispose and the SubmenuAction should
		// never have anything to dispose as it is a convenience type
		// to bridge into the rendering world.
	}

	get actions(): readonly IAction[] {
		return this._actions;
	}

	async run(): Promise<any> { }
}

export class EmptySubmenuAction extends Action {
	static readonly ID = 'vs.actions.empty';
	constructor() {
		super(EmptySubmenuAction.ID, nls.localize('submenu.empty', '(empty)'), undefined, false);
	}
}

export function toAction(props: { id: string, label: string, enabled?: boolean, checked?: boolean, run: Function; }): IAction {
	return {
		id: props.id,
		label: props.label,
		class: undefined,
		enabled: props.enabled ?? true,
		checked: props.checked ?? false,
		run: async () => props.run(),
		tooltip: props.label,
		dispose: () => { }
	};
}
