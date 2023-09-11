/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { MenuId, Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingsRegistry, KeybindingWeight, IKeybindingRule } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, ItemActivation } from 'vs/platform/quickinput/common/quickInput';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { inQuickPickContext, defaultQuickAccessContext, getQuickNavigateHandler } from 'vs/workbench/browser/quickaccess';
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
	primary: 0,
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
	handler: getQuickNavigateHandler(quickAccessNavigateNextInFilePickerId, true),
	when: defaultQuickAccessContext,
	primary: globalQuickAccessKeybinding.primary,
	secondary: globalQuickAccessKeybinding.secondary,
	mac: globalQuickAccessKeybinding.mac
});

const quickAccessNavigatePreviousInFilePickerId = 'workbench.action.quickOpenNavigatePreviousInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickAccessNavigatePreviousInFilePickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickAccessNavigatePreviousInFilePickerId, false),
	when: defaultQuickAccessContext,
	primary: globalQuickAccessKeybinding.primary | KeyMod.Shift,
	secondary: [globalQuickAccessKeybinding.secondary[0] | KeyMod.Shift],
	mac: {
		primary: globalQuickAccessKeybinding.mac.primary | KeyMod.Shift,
		secondary: undefined
	}
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
			title: {
				value: localize('quickOpen', "Go to File..."),
				original: 'Go to File...'
			},
			description: {
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

		quickInputService.navigate(this.next, quickNavigate);
	}
}

class QuickAccessNavigateNextAction extends BaseQuickAccessNavigateAction {

	constructor() {
		super('workbench.action.quickOpenNavigateNext', { value: localize('quickNavigateNext', "Navigate Next in Quick Open"), original: 'Navigate Next in Quick Open' }, true, true);
	}
}

class QuickAccessNavigatePreviousAction extends BaseQuickAccessNavigateAction {

	constructor() {
		super('workbench.action.quickOpenNavigatePrevious', { value: localize('quickNavigatePrevious', "Navigate Previous in Quick Open"), original: 'Navigate Previous in Quick Open' }, false, true);
	}
}

class QuickAccessSelectNextAction extends BaseQuickAccessNavigateAction {

	constructor() {
		super(
			'workbench.action.quickOpenSelectNext',
			{ value: localize('quickSelectNext', "Select Next in Quick Open"), original: 'Select Next in Quick Open' },
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
			{ value: localize('quickSelectPrevious', "Select Previous in Quick Open"), original: 'Select Previous in Quick Open' },
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
