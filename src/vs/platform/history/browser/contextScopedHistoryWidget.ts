/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHistoryNavigationWidget } from 'vs/base/browser/history';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { FindInput, IFindInputOptions } from 'vs/base/browser/ui/findinput/findInput';
import { IReplaceInputOptions, ReplaceInput } from 'vs/base/browser/ui/findinput/replaceInput';
import { HistoryInputBox, IHistoryInputOptions } from 'vs/base/browser/ui/inputbox/inputBox';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { localize } from 'vs/nls';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';

export const historyNavigationVisible = new RawContextKey<boolean>('suggestWidgetVisible', false, localize('suggestWidgetVisible', "Whether suggestion are visible"));

const HistoryNavigationWidgetFocusContext = 'historyNavigationWidgetFocus';
const HistoryNavigationForwardsEnablementContext = 'historyNavigationForwardsEnabled';
const HistoryNavigationBackwardsEnablementContext = 'historyNavigationBackwardsEnabled';

export interface IHistoryNavigationContext extends IDisposable {
	scopedContextKeyService: IContextKeyService;
	historyNavigationForwardsEnablement: IContextKey<boolean>;
	historyNavigationBackwardsEnablement: IContextKey<boolean>;
}

let lastFocusedWidget: IHistoryNavigationWidget | undefined = undefined;
const widgets: IHistoryNavigationWidget[] = [];

export function registerAndCreateHistoryNavigationContext(contextKeyService: IContextKeyService, widget: IHistoryNavigationWidget): IHistoryNavigationContext {
	if (widgets.includes(widget)) {
		throw new Error('Cannot register the same widget multiple times');
	}

	widgets.push(widget);
	const disposableStore = new DisposableStore();
	const scopedContextKeyService = disposableStore.add(contextKeyService.createScoped(widget.element));
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
	if (widget.element === document.activeElement) {
		onDidFocus();
	}

	disposableStore.add(widget.onDidFocus(() => onDidFocus()));
	disposableStore.add(widget.onDidBlur(() => onDidBlur()));
	disposableStore.add(toDisposable(() => {
		widgets.splice(widgets.indexOf(widget), 1);
		onDidBlur();
	}));

	return {
		scopedContextKeyService,
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
		this._register(registerAndCreateHistoryNavigationContext(contextKeyService, this));
	}

}

export class ContextScopedFindInput extends FindInput {

	constructor(container: HTMLElement | null, contextViewProvider: IContextViewProvider, options: IFindInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(container, contextViewProvider, options);
		this._register(registerAndCreateHistoryNavigationContext(contextKeyService, this.inputBox));
	}
}

export class ContextScopedReplaceInput extends ReplaceInput {

	constructor(container: HTMLElement | null, contextViewProvider: IContextViewProvider | undefined, options: IReplaceInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService, showReplaceOptions: boolean = false
	) {
		super(container, contextViewProvider, showReplaceOptions, options);
		this._register(registerAndCreateHistoryNavigationContext(contextKeyService, this.inputBox));
	}

}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'history.showPrevious',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(
		ContextKeyExpr.has(HistoryNavigationWidgetFocusContext),
		ContextKeyExpr.equals(HistoryNavigationBackwardsEnablementContext, true),
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
		historyNavigationVisible.isEqualTo(false),
	),
	primary: KeyCode.DownArrow,
	secondary: [KeyMod.Alt | KeyCode.DownArrow],
	handler: (accessor) => {
		lastFocusedWidget?.showNextValue();
	}
});
