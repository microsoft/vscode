/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/editor/contrib/find/browser/simpleFindWidget';
// import * as nls from 'vs/nls';
// import { Widget } from 'vs/base/browser/ui/widget';
// import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
// import * as dom from 'vs/base/browser/dom';
// import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
// import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
// import { inputBackground, inputActiveOptionBorder, inputForeground, inputBorder, inputValidationInfoBackground, inputValidationInfoBorder, inputValidationWarningBackground, inputValidationWarningBorder, inputValidationErrorBackground, inputValidationErrorBorder, editorWidgetBackground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
// import { HistoryNavigator } from 'vs/base/common/history';
// import { SimpleButton } from './findWidget';
// import { Delayer } from 'vs/base/common/async';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService, IContextKey, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
// import { RunOnceScheduler } from 'vs/base/common/async';

export const KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE = new RawContextKey<boolean>('simpleFindWidgetInputActive', undefined);

export const ISimpleFindWidgetService = createDecorator<ISimpleFindWidgetService>('simpleFindWidgetService');

export interface ISimpleFindWidgetService {

	_serviceBrand: any;

	register(simpleFindWidget: SimpleFindWidget, extraContextKeys?: (IContextKey<boolean>)[]): IDisposable;
	getSimpleFindWidgetCount(): number;
	getFindInputDOM(): number;
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
	extraContextKeys?: (IContextKey<boolean>)[];
}

export class SimpleFindWidgetService implements ISimpleFindWidgetService {

	public _serviceBrand: any;
	private _activeContextKey: IContextKey<boolean>;
	private focusedSimpleFindWidgetInput: SimpleFindWidget;
	private simpleFindWidgets: IRegisteredSimpleFindWidget[];

	// private listFocusContext: IContextKey<boolean>;

	// private focusChangeScheduler: RunOnceScheduler;

	constructor(
		@IContextKeyService private _contextKeyService: IContextKeyService
	) {
		console.debug('simple find widget service');
		// this.listFocusContext = SimpleFindWidgetInputFocusContext.bindTo(contextKeyService);
		this.focusedSimpleFindWidgetInput = null;
		this.simpleFindWidgets = [];

		this._activeContextKey = KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE.bindTo(this._contextKeyService);

		// this.focusChangeScheduler = new RunOnceScheduler(() => this.onFocusChange(), 50 /* delay until the focus/blur dust settles */);
	}

	public register(widget: SimpleFindWidget, extraContextKeys?: (IContextKey<boolean>)[]): IDisposable {



		// Keep in our lists list
		const registeredSimpleFindWidget: IRegisteredSimpleFindWidget = { widget, extraContextKeys };
		this.simpleFindWidgets.push(registeredSimpleFindWidget);
		console.debug('register SFW ' + this.simpleFindWidgets.length);
		this._activeContextKey.set(true);

		const toDispose = [
			// widget.onDOMFocus(() => this.focusChangeScheduler.schedule()),
			// widget.onDOMBlur(() => this.focusChangeScheduler.schedule())
		];

		// Remove list once disposed
		toDispose.push({
			dispose: () => {
				this.simpleFindWidgets.splice(this.simpleFindWidgets.indexOf(registeredSimpleFindWidget), 1);
				if (this.simpleFindWidgets.length === 0) {
					this._activeContextKey.reset();
					console.debug('no active SFW');
				}
				console.debug('dispose SFW');
			}
		});

		return {
			dispose: () => dispose(toDispose)
		};
	}

	public setFocusedSimpleFindWidgetInput(simpleFindWidget): void {
		this.focusedSimpleFindWidgetInput = simpleFindWidget;
		console.debug('FindHimfocus');
	}

	public getFocusedSimpleFindWidgetInput(): SimpleFindWidget {
		if (this.focusedSimpleFindWidgetInput === null) {
			console.debug('is null');
		}
		return this.focusedSimpleFindWidgetInput;
	}
	public getSimpleFindWidgetCount(): number {
		return this.simpleFindWidgets.length;
	}

	public getFindInputDOM(): number {

		return 0;
	}

	public getActiveSimpleFindWidget(): SimpleFindWidget {
		var activeSimpleFindWidget: SimpleFindWidget = null;
		var contextMatch = false;
		for (let i = 0; i < this.simpleFindWidgets.length; i++) {
			console.debug('Loop ' + i);
			const contextKeys = this.simpleFindWidgets[i].extraContextKeys;
			for (let j = 0; j < contextKeys.length; j++) {
				contextMatch = contextKeys[j].get();
				console.debug('active context ' + contextMatch + '  ' + contextKeys.length);
				if (!contextMatch || contextMatch === undefined) {
					break;
				}
			}
			if (contextMatch) {

				activeSimpleFindWidget = this.simpleFindWidgets[i].widget;
				console.debug('simple find widget : ' + activeSimpleFindWidget);
				break;
			}

		}
		// this._contextKeyService.getContext();
		return activeSimpleFindWidget;
	}

	public hide(): void {
		const activeSimpleFindWidget = this.getActiveSimpleFindWidget();
		if (!!activeSimpleFindWidget) {
			console.debug('service hide');
			activeSimpleFindWidget.hide();
		}
	}

	public show(): void {
		const activeSimpleFindWidget = this.getActiveSimpleFindWidget();
		if (!!activeSimpleFindWidget) {
			console.debug('service show');
			activeSimpleFindWidget.reveal(true);
		}
	}

	public find(previous: boolean): void {
		// We have several possible states
		if (!!this.focusedSimpleFindWidgetInput) {
			this.focusedSimpleFindWidgetInput.baseFind(previous);
			return;
		}

		const activeSimpleFindWidget = this.getActiveSimpleFindWidget();
		if (!!activeSimpleFindWidget) {
			console.debug('service Find');
			activeSimpleFindWidget.baseFind(previous);
		}
	}

	public nextMatch(): void {
		// We have several possible states
		if (!!this.focusedSimpleFindWidgetInput) {
			this.focusedSimpleFindWidgetInput.baseFind(false);
		}
	}

	public previousMatch(): void {
		if (!!this.focusedSimpleFindWidgetInput) {
			this.focusedSimpleFindWidgetInput.baseFind(true);
		}
	}
}