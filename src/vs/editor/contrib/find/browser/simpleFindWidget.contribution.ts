/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from 'vs/editor/common/editorCommonExtensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ISimpleFindWidgetService, KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE } from 'vs/editor/contrib/find/browser/simpleFindWidgetService';
import { SimpleFindWidget, KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_INPUT_FOCUSED } from 'vs/editor/contrib/find/browser/simpleFindWidget';

export const SIMPLE_FIND_IDS = {
	ShowWidgetSimpleFindCommand: 'simpleFind.show',
	HideWidgetSimpleFindCommand: 'simpleFind.hide',
	HistoryNextSimpleFindCommand: 'simpleFind.nextHistory',
	HistoryPreviousSimpleFindCommand: 'simpleFind.previousHistory',
	FindNextSimpleFindCommand: 'simpleFind.nextMatch',
	FindPreviousSimpleFindCommand: 'simpleFind.previousMatch'
};


// This probably should be converted to actions
export abstract class SimpleFindCommand extends Command {

	public abstract runCommand(accessor: ServicesAccessor, args: any): void;

	protected getSimpleFindWidget(accessor: ServicesAccessor): SimpleFindWidget {
		const activeSimpleFindWidget = accessor.get(ISimpleFindWidgetService).getActiveSimpleFindWidget() as SimpleFindWidget;
		if (activeSimpleFindWidget) {
			return activeSimpleFindWidget;
		}
		return activeSimpleFindWidget;
	}

	protected getFocusedSimpleFindWidgetInput(accessor: ServicesAccessor): SimpleFindWidget {
		const activeSimpleFindWidgetInput = accessor.get(ISimpleFindWidgetService).getFocusedSimpleFindWidgetInput() as SimpleFindWidget;
		if (activeSimpleFindWidgetInput) {
			return activeSimpleFindWidgetInput;
		}
		return null;
	}
}

// These commands may be more appropriate as workbench ids , left them as editor for now

export class ShowWidgetSimpleFindCommand extends SimpleFindCommand {
	public static ID = SIMPLE_FIND_IDS.ShowWidgetSimpleFindCommand;

	public runCommand(accessor: ServicesAccessor, args: any): void {
		accessor.get(ISimpleFindWidgetService).show();
	}
}
const showWidgetSimpleFindCommand = new ShowWidgetSimpleFindCommand({
	id: SIMPLE_FIND_IDS.ShowWidgetSimpleFindCommand,
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE,
	kbOpts: {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_F,
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(showWidgetSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

export class HideWidgetSimpleFindCommand extends SimpleFindCommand {
	public static ID = SIMPLE_FIND_IDS.HideWidgetSimpleFindCommand;

	public runCommand(accessor: ServicesAccessor, args: any): void {
		accessor.get(ISimpleFindWidgetService).hide();
	}
}
const hideWidgetSimpleFindCommand = new HideWidgetSimpleFindCommand({
	id: SIMPLE_FIND_IDS.HideWidgetSimpleFindCommand,
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE,
	kbOpts: {
		primary: KeyCode.Escape,
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(hideWidgetSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class HistoryNextSimpleFindCommand extends SimpleFindCommand {
	public static ID = SIMPLE_FIND_IDS.HistoryNextSimpleFindCommand;

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const simpleFindWidget = this.getFocusedSimpleFindWidgetInput(accessor);

		if (simpleFindWidget) {
			simpleFindWidget.showNextFindTerm();
		}
	}
}
const historyNextSimpleFindCommand = new HistoryNextSimpleFindCommand({
	id: SIMPLE_FIND_IDS.HistoryNextSimpleFindCommand,
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_INPUT_FOCUSED,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.DownArrow,
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(historyNextSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class HistoryPreviousSimpleFindCommand extends SimpleFindCommand {
	public static ID = SIMPLE_FIND_IDS.HistoryPreviousSimpleFindCommand;

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const simpleFindWidget = this.getFocusedSimpleFindWidgetInput(accessor);

		if (simpleFindWidget) {
			simpleFindWidget.showPreviousFindTerm();
		}
	}
}
const historyPreviousSimpleFindCommand = new HistoryPreviousSimpleFindCommand({
	id: SIMPLE_FIND_IDS.HistoryPreviousSimpleFindCommand,
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_INPUT_FOCUSED,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.UpArrow,
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(historyPreviousSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

export class FindNextSimpleFindCommand extends SimpleFindCommand {
	public static ID = SIMPLE_FIND_IDS.FindNextSimpleFindCommand;

	public runCommand(accessor: ServicesAccessor, args: any): void {
		accessor.get(ISimpleFindWidgetService).find(false);
	}
}
const findNextSimpleFindCommand = new FindNextSimpleFindCommand({
	id: SIMPLE_FIND_IDS.FindNextSimpleFindCommand,
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE,
	kbOpts: {
		primary: KeyCode.F3,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3] }
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(findNextSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

export class FindPreviousSimpleFindCommand extends SimpleFindCommand {
	public static ID = SIMPLE_FIND_IDS.FindPreviousSimpleFindCommand;

	public runCommand(accessor: ServicesAccessor, args: any): void {
		accessor.get(ISimpleFindWidgetService).find(true);
	}
}
const findPreviousSimpleFindCommand = new FindPreviousSimpleFindCommand({
	id: SIMPLE_FIND_IDS.FindPreviousSimpleFindCommand,
	precondition: KEYBINDING_CONTEXT_SIMPLE_FIND_WIDGET_ACTIVE,
	kbOpts: {
		primary: KeyMod.Shift | KeyCode.F3,
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G, secondary: [KeyMod.Shift | KeyCode.F3] }
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(findPreviousSimpleFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));
