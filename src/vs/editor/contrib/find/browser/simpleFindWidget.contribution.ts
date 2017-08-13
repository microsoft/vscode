/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import * as nls from 'vs/nls';
import { Command } from 'vs/editor/common/editorCommonExtensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
// import { Widget } from 'vs/base/browser/ui/widget';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
// import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';

// import * as dom from 'vs/base/browser/dom';
// import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
// import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
// import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
// import { registerThemingParticipant, ITheme } from 'vs/platform/theme/common/themeService';
// import { inputBackground, inputActiveOptionBorder, inputForeground, inputBorder, inputValidationInfoBackground, inputValidationInfoBorder, inputValidationWarningBackground, inputValidationWarningBorder, inputValidationErrorBackground, inputValidationErrorBorder, editorWidgetBackground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
// import { HistoryNavigator } from 'vs/base/common/history';
// import { SimpleButton } from './findWidget';
// import { Delayer } from 'vs/base/common/async';

import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ISimpleFindWidgetService, KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE } from 'vs/editor/contrib/find/browser/simpleFindWidgetService';
import { SimpleFindWidget, KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_INPUT_FOCUSED } from 'vs/editor/contrib/find/browser/simpleFindWidget';


/*
export abstract class SimpleFindAction extends Action {

		// public abstract runCommand(accessor: ServicesAccessor, args: any): void;

		protected getSimpleFindWidget(accessor: ServicesAccessor): SimpleFindWidget {
			const activeSimpleFindWidget = accessor.get(ISimpleFindWidgetService).getActiveSimpleFindWidget() as SimpleFindWidget;
			// if (activeEditor.isWebviewEditor) {				// return activeEditor;
			// }
			return activeSimpleFindWidget;
		}

		protected getFocusedSimpleFindWidgetInput(accessor: ServicesAccessor): SimpleFindWidget {
			const activeSimpleFindWidgetInput = accessor.get(ISimpleFindWidgetService).getFocusedSimpleFindWidgetInput() as SimpleFindWidget;
			if (activeSimpleFindWidgetInput) {				// return activeEditor;
				console.debug('active focused input');
				return activeSimpleFindWidgetInput;
			}
			return null;
		}
	}
 */
export abstract class SimpleFindCommand extends Command {

	public abstract runCommand(accessor: ServicesAccessor, args: any): void;

	protected getSimpleFindWidget(accessor: ServicesAccessor): SimpleFindWidget {
		const activeSimpleFindWidget = accessor.get(ISimpleFindWidgetService).getActiveSimpleFindWidget() as SimpleFindWidget;
		// if (activeEditor.isWebviewEditor) {				// return activeEditor;
		// }
		return activeSimpleFindWidget;
	}

	protected getFocusedSimpleFindWidgetInput(accessor: ServicesAccessor): SimpleFindWidget {
		const activeSimpleFindWidgetInput = accessor.get(ISimpleFindWidgetService).getFocusedSimpleFindWidgetInput() as SimpleFindWidget;
		if (activeSimpleFindWidgetInput) {				// return activeEditor;
			console.debug('active focused input');
			return activeSimpleFindWidgetInput;
		}
		return null;
	}
}


class HistoryNextSimpleFindCommand extends SimpleFindCommand {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		console.debug('command');
		const simpleFindWidget = this.getFocusedSimpleFindWidgetInput(accessor);

		if (simpleFindWidget) {
			console.debug('next simple service');
			simpleFindWidget.showNextFindTerm();
		}
	}
}
const historyNextSimpleFindCommand = new HistoryNextSimpleFindCommand({
	id: 'editor.action.simplefind.nextHistory',
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_INPUT_FOCUSED,
	kbOpts: {
		// primary: KeyMod.CtrlCmd | KeyCode.F11,
		primary: KeyMod.Alt | KeyCode.DownArrow,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3] }
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(historyNextSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class HistoryPreviousSimpleFindCommand extends SimpleFindCommand {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		const simpleFindWidget = this.getFocusedSimpleFindWidgetInput(accessor);

		if (simpleFindWidget) {
			console.debug('previous simple service');
			simpleFindWidget.showPreviousFindTerm();
		}
	}
}
const historyPreviousSimpleFindCommand = new HistoryPreviousSimpleFindCommand({
	id: 'editor.action.simplefind.previousHistory',
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_INPUT_FOCUSED,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.UpArrow,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3] }
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(historyPreviousSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

export class HideWidgetSimpleFindCommand extends SimpleFindCommand {
	public static ID = 'editor.action.simplefind.hide';

	public runCommand(accessor: ServicesAccessor, args: any): void {
		console.debug('test command');
		// accessor.get(ISimpleFindWidgetService).getSimpleFindWidgetCount();
		accessor.get(ISimpleFindWidgetService).hide();

		// }
	}
}
const hideWidgetSimpleFindCommand = new HideWidgetSimpleFindCommand({
	id: 'editor.action.simplefind.hide',
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE,
	kbOpts: {
		primary: KeyCode.Escape,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3] }
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(hideWidgetSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

export class ShowWidgetSimpleFindCommand extends SimpleFindCommand {
	public static ID = 'editor.action.simplefind.show';

	public runCommand(accessor: ServicesAccessor, args: any): void {
		console.debug('test command');
		// accessor.get(ISimpleFindWidgetService).getSimpleFindWidgetCount();
		accessor.get(ISimpleFindWidgetService).show();

		// }
	}
}
const showWidgetSimpleFindCommand = new ShowWidgetSimpleFindCommand({
	id: 'editor.action.simplefind.show',
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE,
	kbOpts: {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_F,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3] }
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(showWidgetSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

export class FindNextSimpleFindCommand extends SimpleFindCommand {
	public static ID = 'editor.action.simplefind.nextMatch';

	public runCommand(accessor: ServicesAccessor, args: any): void {

		accessor.get(ISimpleFindWidgetService).find(false);
	}
}
const findNextSimpleFindCommand = new FindNextSimpleFindCommand({
	id: 'editor.action.simplefind.nextMatch',
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE,
	kbOpts: {
		primary: KeyCode.F3,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3] }
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(findNextSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

export class FindPreviousSimpleFindCommand extends SimpleFindCommand {
	public static ID = 'editor.action.simplefind.previousMatch';

	public runCommand(accessor: ServicesAccessor, args: any): void {
		accessor.get(ISimpleFindWidgetService).find(true);
	}
}
const findPreviousSimpleFindCommand = new FindPreviousSimpleFindCommand({
	id: 'editor.action.simplefind.previousMatch',
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE,
	kbOpts: {
		primary: KeyMod.Shift | KeyCode.F3,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3] }
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(findPreviousSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

// cleidigh test
class TestSimpleFindCommand extends SimpleFindCommand {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		console.debug('test command');
		accessor.get(ISimpleFindWidgetService).find(false);

	}
}
const testSimpleFindCommand = new TestSimpleFindCommand({
	id: 'editor.action.simplefind.test',
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE,
	kbOpts: {
		primary: KeyMod.CtrlCmd | KeyCode.F12,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3] }
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(testSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

/*

export class PreviousMatchSimpleFindAction extends SimpleFindAction {

		public static ID = 'workbench.action.simpleFind.previousMatch';
		public static LABEL = nls.localize('workbench.action.simpleFind.previousMatchFindWidget', "Terminal: Find Previous Match");

		constructor(
			id: string, label: string,
			@ISimpleFindWidgetService private _simpleFindWidgetService: ISimpleFindWidgetService
		) {
			super(id, label);
		}

		public run(): TPromise<any> {
			console.debug('previous action');
			return TPromise.as(this._simpleFindWidgetService.find(true));
		}
	}

const category = nls.localize('simpleFindCategory', "SimpleFind");
let actionRegistry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);

actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(PreviousMatchSimpleFindAction, PreviousMatchSimpleFindAction.ID, PreviousMatchSimpleFindAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.F11,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G, secondary: [KeyMod.Shift | KeyCode.F3] }
}, KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE), 'Find Previous', category);
 */