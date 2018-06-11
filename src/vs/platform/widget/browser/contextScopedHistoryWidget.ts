/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IContextKeyService, ContextKeyDefinedExpr, ContextKeyExpr, ContextKeyAndExpr, ContextKeyEqualsExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { HistoryInputBox, IHistoryInputOptions } from 'vs/base/browser/ui/inputbox/inputBox';
import { FindInput, IFindInputOptions } from 'vs/base/browser/ui/findinput/findInput';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IContextScopedWidget, getContextScopedWidget, createWidgetScopedContextKeyService } from 'vs/platform/widget/common/contextScopedWidget';
import { IHistoryNavigationWidget } from 'vs/base/browser/history';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';

export const HistoryNavigationWidgetContext = 'historyNavigationWidget';
export const HistoryNavigationEnablementContext = 'historyNavigationEnabled';

export interface IContextScopedHistoryNavigationWidget extends IContextScopedWidget {

	historyNavigator: IHistoryNavigationWidget;

}

export function createHistoryNavigationWidgetScopedContextKeyService(contextKeyService: IContextKeyService, widget: IContextScopedHistoryNavigationWidget): IContextKeyService {
	const scopedContextKeyService = createWidgetScopedContextKeyService(contextKeyService, widget, HistoryNavigationWidgetContext);
	const enablementContext = new RawContextKey<boolean>(HistoryNavigationEnablementContext, true);
	enablementContext.bindTo(scopedContextKeyService);
	return scopedContextKeyService;
}

export class ContextScopedHistoryInputBox extends HistoryInputBox {

	constructor(container: HTMLElement, contextViewProvider: IContextViewProvider, options: IHistoryInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(container, contextViewProvider, options);
		this._register(createHistoryNavigationWidgetScopedContextKeyService(contextKeyService, <IContextScopedHistoryNavigationWidget>{ target: this.element, historyNavigator: this }));
	}

}

export class ContextScopedFindInput extends FindInput {

	constructor(container: HTMLElement, contextViewProvider: IContextViewProvider, options: IFindInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(container, contextViewProvider, options);
		this._register(createHistoryNavigationWidgetScopedContextKeyService(contextKeyService, <IContextScopedHistoryNavigationWidget>{ target: this.inputBox.element, historyNavigator: this.inputBox }));
	}

}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'history.showPrevious',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(new ContextKeyDefinedExpr(HistoryNavigationWidgetContext), new ContextKeyEqualsExpr(HistoryNavigationEnablementContext, true)),
	primary: KeyCode.UpArrow,
	secondary: [KeyMod.Alt | KeyCode.UpArrow],
	handler: (accessor, arg2) => {
		const historyInputBox: IHistoryNavigationWidget = getContextScopedWidget<IContextScopedHistoryNavigationWidget>(accessor.get(IContextKeyService), HistoryNavigationWidgetContext).historyNavigator;
		historyInputBox.showPreviousValue();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'history.showNext',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: new ContextKeyAndExpr([new ContextKeyDefinedExpr(HistoryNavigationWidgetContext), new ContextKeyEqualsExpr(HistoryNavigationEnablementContext, true)]),
	primary: KeyCode.DownArrow,
	secondary: [KeyMod.Alt | KeyCode.DownArrow],
	handler: (accessor, arg2) => {
		const historyInputBox: IHistoryNavigationWidget = getContextScopedWidget<IContextScopedHistoryNavigationWidget>(accessor.get(IContextKeyService), HistoryNavigationWidgetContext).historyNavigator;
		historyInputBox.showNextValue();
	}
});