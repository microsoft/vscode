/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKeyService, ContextKeyDefinedExpr, ContextKeyExpr, ContextKeyAndExpr, ContextKeyEqualsExpr, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { HistoryInputBox, IHistoryInputOptions } from 'vs/base/browser/ui/inputbox/inputBox';
import { FindInput, IFindInputOptions } from 'vs/base/browser/ui/findinput/findInput';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IContextScopedWidget, getContextScopedWidget, createWidgetScopedContextKeyService, bindContextScopedWidget } from 'vs/platform/widget/common/contextScopedWidget';
import { IHistoryNavigationWidget } from 'vs/base/browser/history';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';

export const HistoryNavigationWidgetContext = 'historyNavigationWidget';
export const HistoryNavigationEnablementContext = 'historyNavigationEnabled';

export interface IContextScopedHistoryNavigationWidget extends IContextScopedWidget {

	historyNavigator: IHistoryNavigationWidget;

}

export function createAndBindHistoryNavigationWidgetScopedContextKeyService(contextKeyService: IContextKeyService, widget: IContextScopedHistoryNavigationWidget): { scopedContextKeyService: IContextKeyService, historyNavigationEnablement: IContextKey<boolean> } {
	const scopedContextKeyService = createWidgetScopedContextKeyService(contextKeyService, widget);
	bindContextScopedWidget(scopedContextKeyService, widget, HistoryNavigationWidgetContext);
	const historyNavigationEnablement = new RawContextKey<boolean>(HistoryNavigationEnablementContext, true).bindTo(scopedContextKeyService);
	return { scopedContextKeyService, historyNavigationEnablement };
}

export class ContextScopedHistoryInputBox extends HistoryInputBox {

	constructor(container: HTMLElement, contextViewProvider: IContextViewProvider | undefined, options: IHistoryInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(container, contextViewProvider, options);
		this._register(createAndBindHistoryNavigationWidgetScopedContextKeyService(contextKeyService, <IContextScopedHistoryNavigationWidget>{ target: this.element, historyNavigator: this }).scopedContextKeyService);
	}

}

export class ContextScopedFindInput extends FindInput {

	constructor(container: HTMLElement | null, contextViewProvider: IContextViewProvider, options: IFindInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService, showFindOptions: boolean = false
	) {
		super(container, contextViewProvider, showFindOptions, options);
		this._register(createAndBindHistoryNavigationWidgetScopedContextKeyService(contextKeyService, <IContextScopedHistoryNavigationWidget>{ target: this.inputBox.element, historyNavigator: this.inputBox }).scopedContextKeyService);
	}

}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'history.showPrevious',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(new ContextKeyDefinedExpr(HistoryNavigationWidgetContext), new ContextKeyEqualsExpr(HistoryNavigationEnablementContext, true)),
	primary: KeyCode.UpArrow,
	secondary: [KeyMod.Alt | KeyCode.UpArrow],
	handler: (accessor, arg2) => {
		const widget = getContextScopedWidget<IContextScopedHistoryNavigationWidget>(accessor.get(IContextKeyService), HistoryNavigationWidgetContext);
		if (widget) {
			const historyInputBox: IHistoryNavigationWidget = widget.historyNavigator;
			historyInputBox.showPreviousValue();
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'history.showNext',
	weight: KeybindingWeight.WorkbenchContrib,
	when: new ContextKeyAndExpr([new ContextKeyDefinedExpr(HistoryNavigationWidgetContext), new ContextKeyEqualsExpr(HistoryNavigationEnablementContext, true)]),
	primary: KeyCode.DownArrow,
	secondary: [KeyMod.Alt | KeyCode.DownArrow],
	handler: (accessor, arg2) => {
		const widget = getContextScopedWidget<IContextScopedHistoryNavigationWidget>(accessor.get(IContextKeyService), HistoryNavigationWidgetContext);
		if (widget) {
			const historyInputBox: IHistoryNavigationWidget = widget.historyNavigator;
			historyInputBox.showNextValue();
		}
	}
});
