/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, ItemActivation } from 'vs/platform/quickinput/common/quickInput';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Action } from 'vs/base/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { inQuickOpenContext, defaultQuickOpenContext, getQuickNavigateHandler } from 'vs/workbench/browser/quickopen';

//#region Quick open management commands and keys

const globalQuickOpenKeybinding = {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_P,
	secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E],
	mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_P, secondary: undefined }
};

const QUICKOPEN_ACTION_ID = 'workbench.action.quickOpen';

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: { id: QUICKOPEN_ACTION_ID, title: { value: localize('quickOpen', "Go to File..."), original: 'Go to File...' } }
});

KeybindingsRegistry.registerKeybindingRule({
	id: QUICKOPEN_ACTION_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: undefined,
	primary: globalQuickOpenKeybinding.primary,
	secondary: globalQuickOpenKeybinding.secondary,
	mac: globalQuickOpenKeybinding.mac
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.closeQuickOpen',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickOpenContext,
	primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape],
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		return quickInputService.cancel();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.acceptSelectedQuickOpenItem',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickOpenContext,
	primary: 0,
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		return quickInputService.accept();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.alternativeAcceptSelectedQuickOpenItem',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickOpenContext,
	primary: 0,
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		return quickInputService.accept({ ctrlCmd: true, alt: false });
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.focusQuickOpen',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickOpenContext,
	primary: 0,
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.focus();
	}
});

const quickOpenNavigateNextInFilePickerId = 'workbench.action.quickOpenNavigateNextInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigateNextInFilePickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickOpenNavigateNextInFilePickerId, true),
	when: defaultQuickOpenContext,
	primary: globalQuickOpenKeybinding.primary,
	secondary: globalQuickOpenKeybinding.secondary,
	mac: globalQuickOpenKeybinding.mac
});

const quickOpenNavigatePreviousInFilePickerId = 'workbench.action.quickOpenNavigatePreviousInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigatePreviousInFilePickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickOpenNavigatePreviousInFilePickerId, false),
	when: defaultQuickOpenContext,
	primary: globalQuickOpenKeybinding.primary | KeyMod.Shift,
	secondary: [globalQuickOpenKeybinding.secondary[0] | KeyMod.Shift],
	mac: {
		primary: globalQuickOpenKeybinding.mac.primary | KeyMod.Shift,
		secondary: undefined
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.quickPickManyToggle',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickOpenContext,
	primary: 0,
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.toggle();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.quickInputBack',
	weight: KeybindingWeight.WorkbenchContrib + 50,
	when: inQuickOpenContext,
	primary: 0,
	win: { primary: KeyMod.Alt | KeyCode.LeftArrow },
	mac: { primary: KeyMod.WinCtrl | KeyCode.US_MINUS },
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.US_MINUS },
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.back();
	}
});

CommandsRegistry.registerCommand({
	id: QUICKOPEN_ACTION_ID,
	handler: async function (accessor: ServicesAccessor, prefix: unknown) {
		const quickInputService = accessor.get(IQuickInputService);

		quickInputService.quickAccess.show(typeof prefix === 'string' ? prefix : undefined);
	},
	description: {
		description: `Quick open`,
		args: [{
			name: 'prefix',
			schema: {
				'type': 'string'
			}
		}]
	}
});

CommandsRegistry.registerCommand('workbench.action.quickOpenPreviousEditor', async function (accessor: ServicesAccessor, prefix: string | null = null) {
	const quickInputService = accessor.get(IQuickInputService);

	quickInputService.quickAccess.show('', { itemActivation: ItemActivation.SECOND });
});

//#endregion

//#region Workbench actions

export class BaseQuickOpenNavigateAction extends Action {

	constructor(
		id: string,
		label: string,
		private next: boolean,
		private quickNavigate: boolean,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	async run(): Promise<void> {
		const keys = this.keybindingService.lookupKeybindings(this.id);
		const quickNavigate = this.quickNavigate ? { keybindings: keys } : undefined;

		this.quickInputService.navigate(this.next, quickNavigate);
	}
}

export class QuickOpenNavigateNextAction extends BaseQuickOpenNavigateAction {

	static readonly ID = 'workbench.action.quickOpenNavigateNext';
	static readonly LABEL = localize('quickNavigateNext', "Navigate Next in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, true, true, quickInputService, keybindingService);
	}
}

class QuickOpenNavigatePreviousAction extends BaseQuickOpenNavigateAction {

	static readonly ID = 'workbench.action.quickOpenNavigatePrevious';
	static readonly LABEL = localize('quickNavigatePrevious', "Navigate Previous in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, false, true, quickInputService, keybindingService);
	}
}

class QuickOpenSelectNextAction extends BaseQuickOpenNavigateAction {

	static readonly ID = 'workbench.action.quickOpenSelectNext';
	static readonly LABEL = localize('quickSelectNext', "Select Next in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, true, false, quickInputService, keybindingService);
	}
}

class QuickOpenSelectPreviousAction extends BaseQuickOpenNavigateAction {

	static readonly ID = 'workbench.action.quickOpenSelectPrevious';
	static readonly LABEL = localize('quickSelectPrevious', "Select Previous in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, false, false, quickInputService, keybindingService);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(SyncActionDescriptor.create(QuickOpenSelectNextAction, QuickOpenSelectNextAction.ID, QuickOpenSelectNextAction.LABEL, { primary: 0, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_N } }, inQuickOpenContext, KeybindingWeight.WorkbenchContrib + 50), 'Select Next in Quick Open');
registry.registerWorkbenchAction(SyncActionDescriptor.create(QuickOpenSelectPreviousAction, QuickOpenSelectPreviousAction.ID, QuickOpenSelectPreviousAction.LABEL, { primary: 0, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_P } }, inQuickOpenContext, KeybindingWeight.WorkbenchContrib + 50), 'Select Previous in Quick Open');
registry.registerWorkbenchAction(SyncActionDescriptor.create(QuickOpenNavigateNextAction, QuickOpenNavigateNextAction.ID, QuickOpenNavigateNextAction.LABEL), 'Navigate Next in Quick Open');
registry.registerWorkbenchAction(SyncActionDescriptor.create(QuickOpenNavigatePreviousAction, QuickOpenNavigatePreviousAction.ID, QuickOpenNavigatePreviousAction.LABEL), 'Navigate Previous in Quick Open');

//#endregion
