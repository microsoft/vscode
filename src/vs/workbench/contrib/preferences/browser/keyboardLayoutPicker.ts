/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { StatusbarAlignment, IStatusbarService, IStatusbarEntryAccessor } from 'vs/platform/statusbar/common/statusbar';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IKeymapService } from 'vs/workbench/services/keybinding/common/keymapService';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KEYBOARD_LAYOUT_OPEN_PICKER } from 'vs/workbench/contrib/preferences/common/preferences';
import { Action } from 'vs/base/common/actions';
import { isWeb, isMacintosh, isWindows } from 'vs/base/common/platform';
import { QuickPickInput, IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class KeyboardLayoutPickerContribution extends Disposable implements IWorkbenchContribution {
	private readonly pickerElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IKeymapService private readonly keymapService: IKeymapService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();

		let layout = this.keymapService.getCurrentKeyboardLayout();
		let layoutInfo = (<any>layout).text || (<any>layout).lang || (<any>layout).model;
		this.pickerElement.value = this.statusbarService.addEntry(
			{
				text: `Layout: ${layoutInfo}`,
				// tooltip: nls.localize('keyboard.layout.tooltip', "If you are not using a Screen Reader, please change the setting `editor.accessibilitySupport` to \"off\"."),
				command: KEYBOARD_LAYOUT_OPEN_PICKER
			},
			'status.editor.screenReaderMode',
			nls.localize('status.editor.screenReaderMode', "Screen Reader Mode"),
			StatusbarAlignment.RIGHT
		);

		this._register(keymapService.onDidChangeKeyboardMapper(() => {
			if (this.pickerElement.value) {
				let layout = this.keymapService.getCurrentKeyboardLayout();
				let layoutInfo = (<any>layout).text || (<any>layout).lang || (<any>layout).model;

				this.pickerElement.value.update({
					text: `Layout: ${layoutInfo}`
				});
			}
		}));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(KeyboardLayoutPickerContribution, LifecyclePhase.Starting);


export class KeyboardLayoutPickerAction extends Action {
	static readonly ID = KEYBOARD_LAYOUT_OPEN_PICKER;
	static readonly LABEL = nls.localize('keyboard.chooseLayout', "Change keyboard layout");

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IKeymapService private readonly keymapService: IKeymapService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(actionId, actionLabel);

		this.enabled = isWeb;
	}

	async run(): Promise<void> {
		let layouts = this.keymapService.getAllKeyboardLayouts();

		const picks: QuickPickInput[] = layouts.map(layout => {
			return {
				label: (<any>layout).text || (<any>layout).lang || (<any>layout).layout,
				description: (<any>layout).id || undefined
			};
		});

		if (picks.length > 0) {
			const platform = isMacintosh ? 'Mac' : isWindows ? 'Win' : 'Linux';
			picks.unshift({ type: 'separator', label: nls.localize('layoutPicks', "Keyboard Layouts ({0})", platform) });
		}

		let configureKeyboardLayout: IQuickPickItem = { label: nls.localize('configureKeyboardLayout', "Configure KeyboardLayout") };

		picks.unshift(configureKeyboardLayout);

		// Offer to "Auto Detect"
		const autoDetectMode: IQuickPickItem = {
			label: nls.localize('autoDetect', "Auto Detect")
		};

		picks.unshift(autoDetectMode);

		const pick = await this.quickInputService.pick(picks, { placeHolder: nls.localize('pickKeyboardLayout', "Select Keyboard Layout"), matchOnDescription: true });
		if (!pick) {
			return;
		}

		if (pick === autoDetectMode) {
			// set keymap service to auto mode
			this.configurationService.updateValue('keyboard.layout', 'autodetect');
			return;
		}

		if (pick === configureKeyboardLayout) {
			return;
		}

		this.configurationService.updateValue('keyboard.layout', pick.label);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(KeyboardLayoutPickerAction, KeyboardLayoutPickerAction.ID, KeyboardLayoutPickerAction.LABEL, { }), 'Change Language Mode');
