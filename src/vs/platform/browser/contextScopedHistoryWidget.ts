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
import { ContextKeyExpr, IContextKey, IContextKeyService, IContextKeyServiceTarget, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/suggest';

export const HistoryNavigationWidgetContext = 'historyNavigationWidget';
const HistoryNavigationForwardsEnablementContext = 'historyNavigationForwardsEnabled';
const HistoryNavigationBackwardsEnablementContext = 'historyNavigationBackwardsEnabled';

function bindContextScopedWidget(contextKeyService: IContextKeyService, widget: IContextScopedWidget, contextKey: string): void {
	new RawContextKey<IContextScopedWidget>(contextKey, widget).bindTo(contextKeyService);
}

function createWidgetScopedContextKeyService(contextKeyService: IContextKeyService, widget: IContextScopedWidget): IContextKeyService {
	return contextKeyService.createScoped(widget.target);
}

function getContextScopedWidget<T extends IContextScopedWidget>(contextKeyService: IContextKeyService, contextKey: string): T | undefined {
	return contextKeyService.getContext(document.activeElement).getValue(contextKey);
}

interface IContextScopedWidget {
	readonly target: IContextKeyServiceTarget;
}

interface IContextScopedHistoryNavigationWidget extends IContextScopedWidget {
	historyNavigator: IHistoryNavigationWidget;
}

export interface IHistoryNavigationContext {
	scopedContextKeyService: IContextKeyService,
	historyNavigationForwardsEnablement: IContextKey<boolean>,
	historyNavigationBackwardsEnablement: IContextKey<boolean>,
}

export function createAndBindHistoryNavigationWidgetScopedContextKeyService(contextKeyService: IContextKeyService, widget: IContextScopedHistoryNavigationWidget): IHistoryNavigationContext {
	const scopedContextKeyService = createWidgetScopedContextKeyService(contextKeyService, widget);
	bindContextScopedWidget(scopedContextKeyService, widget, HistoryNavigationWidgetContext);
	const historyNavigationForwardsEnablement = new RawContextKey<boolean>(HistoryNavigationForwardsEnablementContext, true).bindTo(scopedContextKeyService);
	const historyNavigationBackwardsEnablement = new RawContextKey<boolean>(HistoryNavigationBackwardsEnablementContext, true).bindTo(scopedContextKeyService);
	return {
		scopedContextKeyService,
		historyNavigationForwardsEnablement,
		historyNavigationBackwardsEnablement,
	};
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

export class ContextScopedReplaceInput extends ReplaceInput {

	constructor(container: HTMLElement | null, contextViewProvider: IContextViewProvider | undefined, options: IReplaceInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService, showReplaceOptions: boolean = false
	) {
		super(container, contextViewProvider, showReplaceOptions, options);
		this._register(createAndBindHistoryNavigationWidgetScopedContextKeyService(contextKeyService, <IContextScopedHistoryNavigationWidget>{ target: this.inputBox.element, historyNavigator: this.inputBox }).scopedContextKeyService);
	}

}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'history.showPrevious',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(
		ContextKeyExpr.has(HistoryNavigationWidgetContext),
		ContextKeyExpr.equals(HistoryNavigationBackwardsEnablementContext, true),
		SuggestContext.Visible.isEqualTo(false),
	),
	primary: KeyCode.UpArrow,
	secondary: [KeyMod.Alt | KeyCode.UpArrow],
	handler: (accessor) => {
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
	when: ContextKeyExpr.and(
		ContextKeyExpr.has(HistoryNavigationWidgetContext),
		ContextKeyExpr.equals(HistoryNavigationForwardsEnablementContext, true),
		SuggestContext.Visible.isEqualTo(false),
	),
	primary: KeyCode.DownArrow,
	secondary: [KeyMod.Alt | KeyCode.DownArrow],
	handler: (accessor) => {
		const widget = getContextScopedWidget<IContextScopedHistoryNavigationWidget>(accessor.get(IContextKeyService), HistoryNavigationWidgetContext);
		if (widget) {
			const historyInputBox: IHistoryNavigationWidget = widget.historyNavigator;
			historyInputBox.showNextValue();
		}
	}
});
