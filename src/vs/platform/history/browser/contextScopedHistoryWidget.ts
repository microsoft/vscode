/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHistoryNavigationWidget } from '../../../base/browser/history.js';
import { IContextViewProvider } from '../../../base/browser/ui/contextview/contextview.js';
import { FindInput, IFindInputOptions } from '../../../base/browser/ui/findinput/findInput.js';
import { IReplaceInputOptions, ReplaceInput } from '../../../base/browser/ui/findinput/replaceInput.js';
import { HistoryInputBox, IHistoryInputOptions } from '../../../base/browser/ui/inputbox/inputBox.js';
import { KeyCode, KeyMod } from '../../../base/common/keyCodes.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../keybinding/common/keybindingsRegistry.js';
import { localize } from '../../../nls.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { isActiveElement } from '../../../base/browser/dom.js';

export const historyNavigationVisible = new RawContextKey<boolean>('suggestWidgetVisible', false, localize('suggestWidgetVisible', "Whether suggestion are visible"));

const HistoryNavigationWidgetFocusContext = 'historyNavigationWidgetFocus';
const HistoryNavigationForwardsEnablementContext = 'historyNavigationForwardsEnabled';
const HistoryNavigationBackwardsEnablementContext = 'historyNavigationBackwardsEnabled';

export interface IHistoryNavigationContext extends IDisposable {
	historyNavigationForwardsEnablement: IContextKey<boolean>;
	historyNavigationBackwardsEnablement: IContextKey<boolean>;
}

let lastFocusedWidget: IHistoryNavigationWidget | undefined = undefined;
const widgets: IHistoryNavigationWidget[] = [];

export function registerAndCreateHistoryNavigationContext(scopedContextKeyService: IContextKeyService, widget: IHistoryNavigationWidget): IHistoryNavigationContext {
	if (widgets.includes(widget)) {
		throw new Error('Cannot register the same widget multiple times');
	}

	widgets.push(widget);
	const disposableStore = new DisposableStore();
	const historyNavigationWidgetFocus = new RawContextKey<boolean>(HistoryNavigationWidgetFocusContext, false).bindTo(scopedContextKeyService);
	const historyNavigationForwardsEnablement = new RawContextKey<boolean>(HistoryNavigationForwardsEnablementContext, true).bindTo(scopedContextKeyService);
	const historyNavigationBackwardsEnablement = new RawContextKey<boolean>(HistoryNavigationBackwardsEnablementContext, true).bindTo(scopedContextKeyService);

	const onDidFocus = () => {
		historyNavigationWidgetFocus.set(true);
		lastFocusedWidget = widget;
	};

	const onDidBlur = () => {
		historyNavigationWidgetFocus.set(false);
		if (lastFocusedWidget === widget) {
			lastFocusedWidget = undefined;
		}
	};

	// Check for currently being focused
	if (isActiveElement(widget.element)) {
		onDidFocus();
	}

	disposableStore.add(widget.onDidFocus(() => onDidFocus()));
	disposableStore.add(widget.onDidBlur(() => onDidBlur()));
	disposableStore.add(toDisposable(() => {
		widgets.splice(widgets.indexOf(widget), 1);
		onDidBlur();
	}));

	return {
		historyNavigationForwardsEnablement,
		historyNavigationBackwardsEnablement,
		dispose() {
			disposableStore.dispose();
		}
	};
}

export class ContextScopedHistoryInputBox extends HistoryInputBox {

	constructor(container: HTMLElement, contextViewProvider: IContextViewProvider | undefined, options: IHistoryInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(container, contextViewProvider, options);
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		this._register(registerAndCreateHistoryNavigationContext(scopedContextKeyService, this));
	}

}

export class ContextScopedFindInput extends FindInput {

	constructor(container: HTMLElement | null, contextViewProvider: IContextViewProvider, options: IFindInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(container, contextViewProvider, options);
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.inputBox.element));
		this._register(registerAndCreateHistoryNavigationContext(scopedContextKeyService, this.inputBox));
	}
}

export class ContextScopedReplaceInput extends ReplaceInput {

	constructor(container: HTMLElement | null, contextViewProvider: IContextViewProvider | undefined, options: IReplaceInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService, showReplaceOptions: boolean = false
	) {
		super(container, contextViewProvider, showReplaceOptions, options);
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.inputBox.element));
		this._register(registerAndCreateHistoryNavigationContext(scopedContextKeyService, this.inputBox));
	}

}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'history.showPrevious',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(
		ContextKeyExpr.has(HistoryNavigationWidgetFocusContext),
		ContextKeyExpr.equals(HistoryNavigationBackwardsEnablementContext, true),
		ContextKeyExpr.not('isComposing'),
		historyNavigationVisible.isEqualTo(false),
	),
	primary: KeyCode.UpArrow,
	secondary: [KeyMod.Alt | KeyCode.UpArrow],
	handler: (accessor) => {
		lastFocusedWidget?.showPreviousValue();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'history.showNext',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(
		ContextKeyExpr.has(HistoryNavigationWidgetFocusContext),
		ContextKeyExpr.equals(HistoryNavigationForwardsEnablementContext, true),
		ContextKeyExpr.not('isComposing'),
		historyNavigationVisible.isEqualTo(false),
	),
	primary: KeyCode.DownArrow,
	secondary: [KeyMod.Alt | KeyCode.DownArrow],
	handler: (accessor) => {
		lastFocusedWidget?.showNextValue();
	}
});
