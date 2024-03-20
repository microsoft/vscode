/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDialogHandler, IDialogResult, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/common/native';
import { IProductService } from 'vs/platform/product/common/productService';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { IDialogsModel, IDialogViewItem } from 'vs/workbench/common/dialogs';
import { BrowserDialogHandler } from 'vs/workbench/browser/parts/dialogs/dialogHandler';
import { NativeDialogHandler } from 'vs/workbench/electron-sandbox/parts/dialogs/dialogHandler';
import { DialogService } from 'vs/workbench/services/dialogs/common/dialogService';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Lazy } from 'vs/base/common/lazy';

export class DialogHandlerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.dialogHandler';

	private nativeImpl: Lazy<IDialogHandler>;
	private browserImpl: Lazy<IDialogHandler>;

	private model: IDialogsModel;
	private currentDialog: IDialogViewItem | undefined;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IDialogService private dialogService: IDialogService,
		@ILogService logService: ILogService,
		@ILayoutService layoutService: ILayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService productService: IProductService,
		@IClipboardService clipboardService: IClipboardService,
		@INativeHostService nativeHostService: INativeHostService
	) {
		super();

		this.browserImpl = new Lazy(() => new BrowserDialogHandler(logService, layoutService, keybindingService, instantiationService, productService, clipboardService));
		this.nativeImpl = new Lazy(() => new NativeDialogHandler(logService, nativeHostService, productService, clipboardService));

		this.model = (this.dialogService as DialogService).model;

		this._register(this.model.onWillShowDialog(() => {
			if (!this.currentDialog) {
				this.processDialogs();
			}
		}));

		this.processDialogs();
	}

	private async processDialogs(): Promise<void> {
		while (this.model.dialogs.length) {
			this.currentDialog = this.model.dialogs[0];

			let result: IDialogResult | Error | undefined = undefined;
			try {

				// Confirm
				if (this.currentDialog.args.confirmArgs) {
					const args = this.currentDialog.args.confirmArgs;
					result = (this.useCustomDialog || args?.confirmation.custom) ?
						await this.browserImpl.value.confirm(args.confirmation) :
						await this.nativeImpl.value.confirm(args.confirmation);
				}

				// Input (custom only)
				else if (this.currentDialog.args.inputArgs) {
					const args = this.currentDialog.args.inputArgs;
					result = await this.browserImpl.value.input(args.input);
				}

				// Prompt
				else if (this.currentDialog.args.promptArgs) {
					const args = this.currentDialog.args.promptArgs;
					result = (this.useCustomDialog || args?.prompt.custom) ?
						await this.browserImpl.value.prompt(args.prompt) :
						await this.nativeImpl.value.prompt(args.prompt);
				}

				// About
				else {
					if (this.useCustomDialog) {
						await this.browserImpl.value.about();
					} else {
						await this.nativeImpl.value.about();
					}
				}
			} catch (error) {
				result = error;
			}

			this.currentDialog.close(result);
			this.currentDialog = undefined;
		}
	}

	private get useCustomDialog(): boolean {
		return this.configurationService.getValue('window.dialogStyle') === 'custom';
	}
}

registerWorkbenchContribution2(
	DialogHandlerContribution.ID,
	DialogHandlerContribution,
	WorkbenchPhase.BlockStartup // Block to allow for dialogs to show before restore finished
);
