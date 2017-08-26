/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/editor/contrib/find/browser/simpleFindWidget';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService, IContextKey, RawContextKey } from 'vs/platform/contextkey/common/contextkey';

// This ContextKey is used to track if any simple find widgets have been instantiated and registered
// We then can use this as the primary precondition for all (Simple)Find commands
// The first key of contextKeys passed into registration is used to determine the current active client
export const KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE = new RawContextKey<boolean>('simpleFindWidgetInputActive', undefined);

export const ISimpleFindWidgetService = createDecorator<ISimpleFindWidgetService>('simpleFindWidgetService');

export interface ISimpleFindWidgetService {

	_serviceBrand: any;

	register(simpleFindWidget: SimpleFindWidget, contextKeys: (IContextKey<boolean>)[]): IDisposable;
	getSimpleFindWidgetCount(): number;
	getActiveSimpleFindWidget(): SimpleFindWidget;
	setFocusedSimpleFindWidgetInput(simpleFindWidget): void;
	getFocusedSimpleFindWidgetInput(): SimpleFindWidget;
	show(): void;
	hide(): void;
	find(previous: boolean): void;
	nextMatch(): void;
	previousMatch(): void;
}

export const SimpleFindWidgetInputFocusContext = new RawContextKey<boolean>('simpleFindWidgetInputFocus', false);


interface IRegisteredSimpleFindWidget {
	widget: SimpleFindWidget;
	contextKeys: (IContextKey<boolean>)[];
}

export class SimpleFindWidgetService implements ISimpleFindWidgetService {

	public _serviceBrand: any;
	private _activeContextKey: IContextKey<boolean>;
	private _focusedSimpleFindWidgetInput: SimpleFindWidget;
	private _simpleFindWidgets: IRegisteredSimpleFindWidget[];

	constructor(
		@IContextKeyService private _contextKeyService: IContextKeyService
	) {
		this._focusedSimpleFindWidgetInput = null;
		// Maintain instantiated SimpleFindWidgets list
		// When all widgets are disposed we reset the active context key
		this._simpleFindWidgets = [];
		this._activeContextKey = KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE.bindTo(this._contextKeyService);
	}

	public register(widget: SimpleFindWidget, contextKeys: (IContextKey<boolean>)[]): IDisposable {

		// Save registered simple widgets
		// Use first context key to track parent owner of widget
		const registeredSimpleFindWidget: IRegisteredSimpleFindWidget = { widget, contextKeys };
		this._simpleFindWidgets.push(registeredSimpleFindWidget);

		// Set ContextKey to track any active widget
		this._activeContextKey.set(true);

		const toDispose = [];

		// Remove SimpleFindWidget from list once disposed
		toDispose.push({
			dispose: () => {
				this._simpleFindWidgets.splice(this._simpleFindWidgets.indexOf(registeredSimpleFindWidget), 1);
				if (this._simpleFindWidgets.length === 0) {
					// No more instantiated/active widgets, reset ContextKey
					this._activeContextKey.reset();
				}
			}
		});

		return {
			dispose: () => dispose(toDispose)
		};
	}

	// Track Widget with focused input
	public setFocusedSimpleFindWidgetInput(simpleFindWidget): void {
		this._focusedSimpleFindWidgetInput = simpleFindWidget;
	}

	public getFocusedSimpleFindWidgetInput(): SimpleFindWidget {
		if (this._focusedSimpleFindWidgetInput === null) {
			// We may want to do something more here
		}
		return this._focusedSimpleFindWidgetInput;
	}

	public getSimpleFindWidgetCount(): number {
		return this._simpleFindWidgets.length;
	}

	// Get active widget using first registered context key or
	// if an input is focused, return that widget
	public getActiveSimpleFindWidget(): SimpleFindWidget {
		var activeSimpleFindWidget: SimpleFindWidget = null;
		var contextMatch = false;
		for (let i = 0; i < this._simpleFindWidgets.length; i++) {
			const contextKeys = this._simpleFindWidgets[i].contextKeys;
			for (let j = 0; j < contextKeys.length; j++) {
				contextMatch = contextKeys[j].get();
				if (!contextMatch || contextMatch === undefined) {
					break;
				}
			}
			if (contextMatch) {
				activeSimpleFindWidget = this._simpleFindWidgets[i].widget;
				break;
			}
		}
		return activeSimpleFindWidget;
	}

	public hide(): void {
		const activeSimpleFindWidget = this.getActiveSimpleFindWidget();
		if (!!activeSimpleFindWidget) {
			activeSimpleFindWidget.hide();
		}
	}

	public show(): void {
		const activeSimpleFindWidget = this.getActiveSimpleFindWidget();
		if (!!activeSimpleFindWidget) {
			activeSimpleFindWidget.reveal(true);
		}
	}

	public find(previous: boolean): void {
		// We allow the subclass to use its find function
		if (!!this._focusedSimpleFindWidgetInput) {
			this._focusedSimpleFindWidgetInput.find(previous);
			return;
		}
		const activeSimpleFindWidget = this.getActiveSimpleFindWidget();
		if (!!activeSimpleFindWidget) {
			activeSimpleFindWidget.find(previous);
		}
	}

	public nextMatch(): void {
		if (!!this._focusedSimpleFindWidgetInput) {
			this._focusedSimpleFindWidgetInput.find(false);
		}
	}

	public previousMatch(): void {
		if (!!this._focusedSimpleFindWidgetInput) {
			this._focusedSimpleFindWidgetInput.find(true);
		}
	}
}