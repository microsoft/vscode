/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from './event.js';
import { Disposable, IDisposable } from './lifecycle.js';
import * as nls from '../../nls.js';

export interface ITelemetryData {
	readonly from?: string;
	readonly target?: string;
	[key: string]: unknown;
}

export type WorkbenchActionExecutedClassification = {
	id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the action that was run.' };
	from: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the component the action was run from.' };
	detail?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Optional details about how the action was run, e.g which keybinding was used.' };
	owner: 'bpasero';
	comment: 'Provides insight into actions that are executed within the workbench.';
};

export type WorkbenchActionExecutedEvent = {
	id: string;
	from: string;
	detail?: string;
};

export interface IAction {
	readonly id: string;
	label: string;
	tooltip: string;
	class: string | undefined;
	enabled: boolean;
	checked?: boolean;
	run(...args: unknown[]): unknown;
}

export interface IActionRunner extends IDisposable {
	readonly onDidRun: Event<IRunEvent>;
	readonly onWillRun: Event<IRunEvent>;

	run(action: IAction, context?: unknown): unknown;
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
	protected _checked?: boolean;
	protected readonly _actionCallback?: (event?: unknown) => unknown;

	constructor(id: string, label: string = '', cssClass: string = '', enabled: boolean = true, actionCallback?: (event?: unknown) => unknown) {
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

	get checked(): boolean | undefined {
		return this._checked;
	}

	set checked(value: boolean | undefined) {
		this._setChecked(value);
	}

	protected _setChecked(value: boolean | undefined): void {
		if (this._checked !== value) {
			this._checked = value;
			this._onDidChange.fire({ checked: value });
		}
	}

	async run(event?: unknown, data?: ITelemetryData): Promise<void> {
		if (this._actionCallback) {
			await this._actionCallback(event);
		}
	}
}

export interface IRunEvent {
	readonly action: IAction;
	readonly error?: Error;
}

export class ActionRunner extends Disposable implements IActionRunner {

	private readonly _onWillRun = this._register(new Emitter<IRunEvent>());
	readonly onWillRun = this._onWillRun.event;

	private readonly _onDidRun = this._register(new Emitter<IRunEvent>());
	readonly onDidRun = this._onDidRun.event;

	async run(action: IAction, context?: unknown): Promise<void> {
		if (!action.enabled) {
			return;
		}

		this._onWillRun.fire({ action });

		let error: Error | undefined = undefined;
		try {
			await this.runAction(action, context);
		} catch (e) {
			error = e;
		}

		this._onDidRun.fire({ action, error });
	}

	protected async runAction(action: IAction, context?: unknown): Promise<void> {
		await action.run(context);
	}
}

export class Separator implements IAction {

	/**
	 * Joins all non-empty lists of actions with separators.
	 */
	public static join(...actionLists: readonly IAction[][]) {
		let out: IAction[] = [];
		for (const list of actionLists) {
			if (!list.length) {
				// skip
			} else if (out.length) {
				out = [...out, new Separator(), ...list];
			} else {
				out = list;
			}
		}

		return out;
	}

	static readonly ID = 'vs.actions.separator';

	readonly id: string = Separator.ID;

	readonly label: string = '';
	readonly tooltip: string = '';
	readonly class: string = 'separator';
	readonly enabled: boolean = false;
	readonly checked: boolean = false;
	async run() { }
}

export class SubmenuAction implements IAction {

	readonly id: string;
	readonly label: string;
	readonly class: string | undefined;
	readonly tooltip: string = '';
	readonly enabled: boolean = true;
	readonly checked: undefined = undefined;

	private readonly _actions: readonly IAction[];
	get actions(): readonly IAction[] { return this._actions; }

	constructor(id: string, label: string, actions: readonly IAction[], cssClass?: string) {
		this.id = id;
		this.label = label;
		this.class = cssClass;
		this._actions = actions;
	}

	async run(): Promise<void> { }
}

export class EmptySubmenuAction extends Action {

	static readonly ID = 'vs.actions.empty';

	constructor() {
		super(EmptySubmenuAction.ID, nls.localize('submenu.empty', '(empty)'), undefined, false);
	}
}

export function toAction(props: { id: string; label: string; tooltip?: string; enabled?: boolean; checked?: boolean; class?: string; run: Function }): IAction {
	return {
		id: props.id,
		label: props.label,
		tooltip: props.tooltip ?? props.label,
		class: props.class,
		enabled: props.enabled ?? true,
		checked: props.checked,
		run: async (...args: unknown[]) => props.run(...args),
	};
}
