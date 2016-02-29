/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import {IEventEmitter} from 'vs/base/common/eventEmitter';
import {Dimension, Builder} from 'vs/base/browser/builder';
import {IAction, IActionRunner, ActionRunner} from 'vs/base/common/actions';
import {IActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {WorkbenchComponent} from 'vs/workbench/common/component';
import {CompositeEvent} from 'vs/workbench/common/events';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {IComposite} from 'vs/workbench/common/composite';
import {ISelection, Selection} from 'vs/platform/selection/common/selection';

/**
 * Internal composite events to communicate with composite container.
 */
export const EventType = {
	INTERNAL_COMPOSITE_TITLE_AREA_UPDATE: 'internalCompositeTitleAreaUpdate'
};

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
export abstract class Composite extends WorkbenchComponent implements IComposite {
	private _telemetryData: any = {};
	private visible: boolean;
	private parent: Builder;

	protected actionRunner: IActionRunner;

	/**
	 * Create a new composite with the given ID and context.
	 */
	constructor(id: string, @ITelemetryService private _telemetryService: ITelemetryService) {
		super(id);

		this.visible = false;
	}

	public getTitle(): string {
		return null;
	}

	public get telemetryService(): ITelemetryService {
		return this._telemetryService;
	}

	public get telemetryData(): any {
		return this._telemetryData;
	}

	/**
	 * Note: Clients should not call this method, the monaco workbench calls this
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

	/**
	 * Returns the container this composite is being build in.
	 */
	public getContainer(): Builder {
		return this.parent;
	}

	/**
	 * Note: Clients should not call this method, the monaco workbench calls this
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

		// Reset telemetry data when composite becomes visible
		if (visible) {
			this._telemetryData = {};
			this._telemetryData.startTime = new Date();
		}

		// Send telemetry data when composite hides
		else {
			this._telemetryData.timeSpent = (Date.now() - this._telemetryData.startTime) / 1000;
			delete this._telemetryData.startTime;

			// Only submit telemetry data when not running from an integration test
			if (this._telemetryService && this._telemetryService.publicLog) {
				let eventName: string = 'compositeShown';
				this._telemetryData.composite = this.getId();
				this._telemetryService.publicLog(eventName, this._telemetryData);
			}
		}

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
		this.emit(EventType.INTERNAL_COMPOSITE_TITLE_AREA_UPDATE, new CompositeEvent(this.getId()));
	}

	/**
	 * Returns an array of elements that are selected in the composite.
	 */
	public getSelection(): ISelection {
		return Selection.EMPTY;
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
	public getControl(): IEventEmitter {
		return null;
	}
}

/**
 * A composite descriptor is a leightweight descriptor of a composite in the monaco workbench.
 */
export abstract class CompositeDescriptor<T extends Composite> extends AsyncDescriptor<T> {
	public id: string;
	public name: string;
	public cssClass: string;
	public order: number;

	constructor(moduleId: string, ctorName: string, id: string, name: string, cssClass?: string, order?: number) {
		super(moduleId, ctorName);

		this.id = id;
		this.name = name;
		this.cssClass = cssClass;
		this.order = order;
	}
}

export abstract class CompositeRegistry<T extends Composite> {
	private composits: CompositeDescriptor<T>[];

	constructor() {
		this.composits = [];
	}

	protected registerComposite(descriptor: CompositeDescriptor<T>): void {
		if (this.compositById(descriptor.id) !== null) {
			return;
		}

		this.composits.push(descriptor);
	}

	public getComposite(id: string): CompositeDescriptor<T> {
		return this.compositById(id);
	}

	protected getComposits(): CompositeDescriptor<T>[] {
		return this.composits.slice(0);
	}

	protected setComposits(compositsToSet: CompositeDescriptor<T>[]): void {
		this.composits = compositsToSet;
	}

	private compositById(id: string): CompositeDescriptor<T> {
		for (let i = 0; i < this.composits.length; i++) {
			if (this.composits[i].id === id) {
				return this.composits[i];
			}
		}

		return null;
	}
}
