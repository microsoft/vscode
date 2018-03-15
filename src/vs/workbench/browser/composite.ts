/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Dimension, Builder } from 'vs/base/browser/builder';
import { IAction, IActionRunner, ActionRunner } from 'vs/base/common/actions';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { Component } from 'vs/workbench/common/component';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IComposite } from 'vs/workbench/common/composite';
import { IEditorControl } from 'vs/platform/editor/common/editor';
import { Event, Emitter } from 'vs/base/common/event';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConstructorSignature0, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import DOM = require('vs/base/browser/dom');
import { IDisposable } from 'vs/base/common/lifecycle';

/**
 * Composites are layed out in the sidebar and panel part of the workbench. At a time only one composite
 * can be open in the sidebar, and only one composite can be open in the panel.
 * Each composite has a minimized representation that is good enough to provide some
 * information about the state of the composite data.
 * The workbench will keep a composite alive after it has been created and show/hide it based on
 * user interaction. The lifecycle of a composite goes in the order create(), setVisible(true|false),
 * layout(), focus(), dispose(). During use of the workbench, a composite will often receive a setVisible,
 * layout and focus call, but only one create and dispose call.
 */
export abstract class Composite extends Component implements IComposite {
	private readonly _onTitleAreaUpdate: Emitter<void>;
	private readonly _onDidFocus: Emitter<void>;

	private _focusTracker?: DOM.IFocusTracker;
	private _focusListenerDisposable?: IDisposable;

	private visible: boolean;
	private parent: Builder;

	protected actionRunner: IActionRunner;

	/**
	 * Create a new composite with the given ID and context.
	 */
	constructor(
		id: string,
		private _telemetryService: ITelemetryService,
		themeService: IThemeService
	) {
		super(id, themeService);

		this.visible = false;
		this._onTitleAreaUpdate = new Emitter<void>();
		this._onDidFocus = new Emitter<void>();
	}

	public getTitle(): string {
		return null;
	}

	protected get telemetryService(): ITelemetryService {
		return this._telemetryService;
	}

	public get onTitleAreaUpdate(): Event<void> {
		return this._onTitleAreaUpdate.event;
	}

	/**
	 * Note: Clients should not call this method, the workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Called to create this composite on the provided builder. This method is only
	 * called once during the lifetime of the workbench.
	 * Note that DOM-dependent calculations should be performed from the setVisible()
	 * call. Only then the composite will be part of the DOM.
	 */
	public create(parent: Builder): TPromise<void> {
		this.parent = parent;

		return TPromise.as(null);
	}

	public updateStyles(): void {
		super.updateStyles();
	}

	/**
	 * Returns the container this composite is being build in.
	 */
	public getContainer(): Builder {
		return this.parent;
	}

	public get onDidFocus(): Event<any> {
		this._focusTracker = DOM.trackFocus(this.getContainer().getHTMLElement());
		this._focusListenerDisposable = this._focusTracker.onDidFocus(() => {
			this._onDidFocus.fire();
		});
		return this._onDidFocus.event;
	}

	/**
	 * Note: Clients should not call this method, the workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Called to indicate that the composite has become visible or hidden. This method
	 * is called more than once during workbench lifecycle depending on the user interaction.
	 * The composite will be on-DOM if visible is set to true and off-DOM otherwise.
	 *
	 * The returned promise is complete when the composite is visible. As such it is valid
	 * to do a long running operation from this call. Typically this operation should be
	 * fast though because setVisible might be called many times during a session.
	 */
	public setVisible(visible: boolean): TPromise<void> {
		this.visible = visible;

		return TPromise.as(null);
	}

	/**
	 * Called when this composite should receive keyboard focus.
	 */
	public focus(): void {
		// Subclasses can implement
	}

	/**
	 * Layout the contents of this composite using the provided dimensions.
	 */
	public abstract layout(dimension: Dimension): void;

	/**
	 * Returns an array of actions to show in the action bar of the composite.
	 */
	public getActions(): IAction[] {
		return [];
	}

	/**
	 * Returns an array of actions to show in the action bar of the composite
	 * in a less prominent way then action from getActions.
	 */
	public getSecondaryActions(): IAction[] {
		return [];
	}

	/**
	 * Returns an array of actions to show in the context menu of the composite
	 */
	public getContextMenuActions(): IAction[] {
		return [];
	}

	/**
	 * For any of the actions returned by this composite, provide an IActionItem in
	 * cases where the implementor of the composite wants to override the presentation
	 * of an action. Returns null to indicate that the action is not rendered through
	 * an action item.
	 */
	public getActionItem(action: IAction): IActionItem {
		return null;
	}

	/**
	 * Returns the instance of IActionRunner to use with this composite for the
	 * composite tool bar.
	 */
	public getActionRunner(): IActionRunner {
		if (!this.actionRunner) {
			this.actionRunner = new ActionRunner();
		}

		return this.actionRunner;
	}

	/**
	 * Method for composite implementors to indicate to the composite container that the title or the actions
	 * of the composite have changed. Calling this method will cause the container to ask for title (getTitle())
	 * and actions (getActions(), getSecondaryActions()) if the composite is visible or the next time the composite
	 * gets visible.
	 */
	protected updateTitleArea(): void {
		this._onTitleAreaUpdate.fire();
	}

	/**
	 * Returns true if this composite is currently visible and false otherwise.
	 */
	public isVisible(): boolean {
		return this.visible;
	}

	/**
	 * Returns the underlying composite control or null if it is not accessible.
	 */
	public getControl(): IEditorControl {
		return null;
	}

	public dispose(): void {
		this._onTitleAreaUpdate.dispose();
		this._onDidFocus.dispose();

		if (this._focusTracker) {
			this._focusTracker.dispose();
		}

		if (this._focusListenerDisposable) {
			this._focusListenerDisposable.dispose();
		}

		super.dispose();
	}
}

/**
 * A composite descriptor is a leightweight descriptor of a composite in the workbench.
 */
export abstract class CompositeDescriptor<T extends Composite> {
	public id: string;
	public name: string;
	public cssClass: string;
	public order: number;
	public keybindingId: string;
	public enabled: boolean;

	private ctor: IConstructorSignature0<T>;

	constructor(ctor: IConstructorSignature0<T>, id: string, name: string, cssClass?: string, order?: number, keybindingId?: string, ) {
		this.ctor = ctor;
		this.id = id;
		this.name = name;
		this.cssClass = cssClass;
		this.order = order;
		this.enabled = true;
		this.keybindingId = keybindingId;
	}

	public instantiate(instantiationService: IInstantiationService): T {
		return instantiationService.createInstance(this.ctor);
	}
}

export abstract class CompositeRegistry<T extends Composite> {
	private composites: CompositeDescriptor<T>[];

	constructor() {
		this.composites = [];
	}

	protected registerComposite(descriptor: CompositeDescriptor<T>): void {
		if (this.compositeById(descriptor.id) !== null) {
			return;
		}

		this.composites.push(descriptor);
	}

	public getComposite(id: string): CompositeDescriptor<T> {
		return this.compositeById(id);
	}

	protected getComposites(): CompositeDescriptor<T>[] {
		return this.composites.slice(0);
	}

	private compositeById(id: string): CompositeDescriptor<T> {
		for (let i = 0; i < this.composites.length; i++) {
			if (this.composites[i].id === id) {
				return this.composites[i];
			}
		}

		return null;
	}
}
