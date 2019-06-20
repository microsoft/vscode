/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { StatusbarAlignment, IStatusbarService, IStatusbarEntryAccessor } from 'vs/platform/statusbar/common/statusbar';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IKeymapService, areKeyboardLayoutsEqual, parseKeyboardLayout } from 'vs/workbench/services/keybinding/common/keymapService';
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
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { VSBuffer } from 'vs/base/common/buffer';
import { IEditor } from 'vs/workbench/common/editor';

export class KeyboardLayoutPickerContribution extends Disposable implements IWorkbenchContribution {
	private readonly pickerElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IKeymapService private readonly keymapService: IKeymapService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();

		let layout = this.keymapService.getCurrentKeyboardLayout();
		if (layout) {
			let layoutInfo = parseKeyboardLayout(layout);
			this.pickerElement.value = this.statusbarService.addEntry(
				{
					text: `Layout: ${layoutInfo.label}`,
					// tooltip: nls.localize('keyboard.layout.tooltip', "If you are not using a Screen Reader, please change the setting `editor.accessibilitySupport` to \"off\"."),
					command: KEYBOARD_LAYOUT_OPEN_PICKER
				},
				'status.editor.screenReaderMode',
				nls.localize('status.editor.screenReaderMode', "Screen Reader Mode"),
				StatusbarAlignment.RIGHT
			);
		}

		this._register(keymapService.onDidChangeKeyboardMapper(() => {
			let layout = this.keymapService.getCurrentKeyboardLayout();
			let layoutInfo = parseKeyboardLayout(layout);

			if (this.pickerElement.value) {
				this.pickerElement.value.update({
					text: `Layout: ${layoutInfo.label}`,
					command: KEYBOARD_LAYOUT_OPEN_PICKER
				});
			} else {
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
			}
		}));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(KeyboardLayoutPickerContribution, LifecyclePhase.Starting);


export class KeyboardLayoutPickerAction extends Action {
	static readonly ID = KEYBOARD_LAYOUT_OPEN_PICKER;
	static readonly LABEL = nls.localize('keyboard.chooseLayout', "Change keyboard layout");

	private static DEFAULT_CONTENT: string = [
		`// ${nls.localize('displayLanguage', 'Defines the keyboard layout used in VS Code in the browser environment.')}`,
		`// ${nls.localize('doc', 'See {0} for how to generate keyboard layout information.', 'https://go.microsoft.com/fwlink/?LinkId=761051')}`,
		``,
		`// Once you have the keyboard layout info, please paste it below.`,
		'\n'
	].join('\n');

	constructor(
		actionId: string,
		actionLabel: string,
		@IFileService private readonly fileService: IFileService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IKeymapService private readonly keymapService: IKeymapService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(actionId, actionLabel);

		this.enabled = isWeb;
	}

	async run(): Promise<void> {
		let layouts = this.keymapService.getAllKeyboardLayouts();
		let currentLayout = this.keymapService.getCurrentKeyboardLayout();
		let layoutConfig = this.configurationService.getValue('keyboard.layout');
		let isAutoDetect = layoutConfig === 'autodetect';

		const picks: QuickPickInput[] = layouts.map(layout => {
			const picked = !isAutoDetect && areKeyboardLayoutsEqual(currentLayout, layout);
			const layoutInfo = parseKeyboardLayout(layout);
			return {
				label: layoutInfo.label,
				id: (<any>layout).text || (<any>layout).lang || (<any>layout).layout,
				description: layoutInfo.description + (picked ? ' (Current selection)' : ''),
				picked: !isAutoDetect && areKeyboardLayoutsEqual(currentLayout, layout)
			};
		});

		if (picks.length > 0) {
			const platform = isMacintosh ? 'Mac' : isWindows ? 'Win' : 'Linux';
			picks.unshift({ type: 'separator', label: nls.localize('layoutPicks', "Keyboard Layouts ({0})", platform) });
		}

		let configureKeyboardLayout: IQuickPickItem = { label: nls.localize('configureKeyboardLayout', "Configure Keyboard Layout") };

		picks.unshift(configureKeyboardLayout);

		// Offer to "Auto Detect"
		const autoDetectMode: IQuickPickItem = {
			label: nls.localize('autoDetect', "Auto Detect"),
			description: isAutoDetect ? `(Current: ${(<any>currentLayout).text || (<any>currentLayout).lang || (<any>currentLayout).layout})` : undefined,
			picked: isAutoDetect ? true : undefined
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
			const file = this.environmentService.keyboardLayoutResource;

			await this.fileService.resolve(file).then(undefined, (error) => {
				return this.fileService.createFile(file, VSBuffer.fromString(KeyboardLayoutPickerAction.DEFAULT_CONTENT));
			}).then((stat): Promise<IEditor | null> | null => {
				if (!stat) {
					return null;
				}
				return this.editorService.openEditor({
					resource: stat.resource,
					mode: 'jsonc'
				});
			}, (error) => {
				throw new Error(nls.localize('fail.createSettings', "Unable to create '{0}' ({1}).", file.toString(), error));
			});

			return Promise.resolve();
		}

		this.configurationService.updateValue('keyboard.layout', pick.label);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(KeyboardLayoutPickerAction, KeyboardLayoutPickerAction.ID, KeyboardLayoutPickerAction.LABEL, {}), 'Change Language Mode');
