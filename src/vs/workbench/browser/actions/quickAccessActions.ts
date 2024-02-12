/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from 'vs/nls';
import { MenuId, Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingsRegistry, KeybindingWeight, IKeybindingRule } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, ItemActivation, QuickInputListFocus } from 'vs/platform/quickinput/common/quickInput';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { inQuickPickContext, getQuickNavigateHandler } from 'vs/workbench/browser/quickaccess';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { AnythingQuickAccessProviderRunOptions } from 'vs/platform/quickinput/common/quickAccess';
import { Codicon } from 'vs/base/common/codicons';

//#region Quick access management commands and keys

const globalQuickAccessKeybinding = {
	primary: KeyMod.CtrlCmd | KeyCode.KeyP,
	secondary: [KeyMod.CtrlCmd | KeyCode.KeyE],
	mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyP, secondary: undefined }
};

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.closeQuickOpen',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickPickContext,
	primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape],
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		return quickInputService.cancel();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.acceptSelectedQuickOpenItem',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickPickContext,
	primary: KeyCode.RightArrow,
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		return quickInputService.accept();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.alternativeAcceptSelectedQuickOpenItem',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickPickContext,
	primary: 0,
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		return quickInputService.accept({ ctrlCmd: true, alt: false });
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.focusQuickOpen',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickPickContext,
	primary: 0,
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.focus();
	}
});

const quickAccessNavigateNextInFilePickerId = 'workbench.action.quickOpenNavigateNextInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickAccessNavigateNextInFilePickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickAccessNavigateNextInFilePickerId, QuickInputListFocus.Next),
	when: inQuickPickContext,
	primary: globalQuickAccessKeybinding.primary,
	secondary: [...globalQuickAccessKeybinding.secondary, KeyCode.DownArrow],
	mac: globalQuickAccessKeybinding.mac
});

const quickAccessNavigatePreviousInFilePickerId = 'workbench.action.quickOpenNavigatePreviousInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickAccessNavigatePreviousInFilePickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickAccessNavigatePreviousInFilePickerId, QuickInputListFocus.Previous),
	when: inQuickPickContext,
	primary: globalQuickAccessKeybinding.primary | KeyMod.Shift,
	secondary: [globalQuickAccessKeybinding.secondary[0] | KeyMod.Shift, KeyCode.UpArrow],
	mac: {
		primary: globalQuickAccessKeybinding.mac.primary | KeyMod.Shift,
		secondary: undefined
	}
});

const quickAccessNavigateFirstInFilePickerId = 'workbench.action.quickOpenNavigateFirstInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickAccessNavigateFirstInFilePickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickAccessNavigateFirstInFilePickerId, QuickInputListFocus.First),
	when: inQuickPickContext,
	primary: KeyCode.Home,
});

const quickAccessNavigateLastInFilePickerId = 'workbench.action.quickOpenNavigateLastInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickAccessNavigateLastInFilePickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickAccessNavigateLastInFilePickerId, QuickInputListFocus.Last),
	when: inQuickPickContext,
	primary: KeyCode.End,
});

const quickAccessNavigateNextPageInFilePickerId = 'workbench.action.quickOpenNavigateNextPageInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickAccessNavigateNextPageInFilePickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickAccessNavigateNextPageInFilePickerId, QuickInputListFocus.NextPage),
	when: inQuickPickContext,
	primary: KeyCode.PageDown,
});

const quickAccessNavigatePreviousPageInFilePickerId = 'workbench.action.quickOpenNavigatePreviousPageInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickAccessNavigatePreviousPageInFilePickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickAccessNavigatePreviousPageInFilePickerId, QuickInputListFocus.PreviousPage),
	when: inQuickPickContext,
	primary: KeyCode.PageUp,
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.quickPickManyToggle',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickPickContext,
	primary: 0,
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.toggle();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.quickInputBack',
	weight: KeybindingWeight.WorkbenchContrib + 50,
	when: inQuickPickContext,
	primary: 0,
	win: { primary: KeyMod.Alt | KeyCode.LeftArrow },
	mac: { primary: KeyMod.WinCtrl | KeyCode.Minus },
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Minus },
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.back();
	}
});

registerAction2(class QuickAccessAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.quickOpen',
			title: localize2('quickOpen', "Go to File..."),
			metadata: {
				description: `Quick access`,
				args: [{
					name: 'prefix',
					schema: {
						'type': 'string'
					}
				}]
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: globalQuickAccessKeybinding.primary,
				secondary: globalQuickAccessKeybinding.secondary,
				mac: globalQuickAccessKeybinding.mac
			},
			f1: true
		});
	}

	run(accessor: ServicesAccessor, prefix: undefined): void {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.quickAccess.show(typeof prefix === 'string' ? prefix : undefined, { preserveValue: typeof prefix === 'string' /* preserve as is if provided */ });
	}
});

registerAction2(class QuickAccessAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.quickOpenWithModes',
			title: localize('quickOpenWithModes', "Quick Open"),
			icon: Codicon.search,
			menu: {
				id: MenuId.CommandCenterCenter,
				order: 100
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.quickAccess.show(undefined, {
			preserveValue: true,
			providerOptions: {
				includeHelp: true,
				from: 'commandCenter',
			} as AnythingQuickAccessProviderRunOptions
		});
	}
});

CommandsRegistry.registerCommand('workbench.action.quickOpenPreviousEditor', async accessor => {
	const quickInputService = accessor.get(IQuickInputService);

	quickInputService.quickAccess.show('', { itemActivation: ItemActivation.SECOND });
});

//#endregion

//#region Workbench actions

class BaseQuickAccessNavigateAction extends Action2 {

	constructor(
		private id: string,
		title: ILocalizedString,
		private next: boolean,
		private quickNavigate: boolean,
		keybinding?: Omit<IKeybindingRule, 'id'>
	) {
		super({ id, title, f1: true, keybinding });
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const keybindingService = accessor.get(IKeybindingService);
		const quickInputService = accessor.get(IQuickInputService);

		const keys = keybindingService.lookupKeybindings(this.id);
		const quickNavigate = this.quickNavigate ? { keybindings: keys } : undefined;

		quickInputService.navigate(this.next ? QuickInputListFocus.Next : QuickInputListFocus.Previous, quickNavigate);
	}
}

class QuickAccessNavigateNextAction extends BaseQuickAccessNavigateAction {

	constructor() {
		super('workbench.action.quickOpenNavigateNext', localize2('quickNavigateNext', 'Navigate Next in Quick Open'), true, true);
	}
}

class QuickAccessNavigatePreviousAction extends BaseQuickAccessNavigateAction {

	constructor() {
		super('workbench.action.quickOpenNavigatePrevious', localize2('quickNavigatePrevious', 'Navigate Previous in Quick Open'), false, true);
	}
}

class QuickAccessSelectNextAction extends BaseQuickAccessNavigateAction {

	constructor() {
		super(
			'workbench.action.quickOpenSelectNext',
			localize2('quickSelectNext', 'Select Next in Quick Open'),
			true,
			false,
			{
				weight: KeybindingWeight.WorkbenchContrib + 50,
				when: inQuickPickContext,
				primary: 0,
				mac: { primary: KeyMod.WinCtrl | KeyCode.KeyN }
			}
		);
	}
}

class QuickAccessSelectPreviousAction extends BaseQuickAccessNavigateAction {

	constructor() {
		super(
			'workbench.action.quickOpenSelectPrevious',
			localize2('quickSelectPrevious', 'Select Previous in Quick Open'),
			false,
			false,
			{
				weight: KeybindingWeight.WorkbenchContrib + 50,
				when: inQuickPickContext,
				primary: 0,
				mac: { primary: KeyMod.WinCtrl | KeyCode.KeyP }
			}
		);
	}
}

registerAction2(QuickAccessSelectNextAction);
registerAction2(QuickAccessSelectPreviousAction);
registerAction2(QuickAccessNavigateNextAction);
registerAction2(QuickAccessNavigatePreviousAction);

//#endregion
