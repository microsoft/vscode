/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogHandler, IDialogResult, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IDialogsModel, IDialogViewItem } from '../../../common/dialogs.js';
import { BrowserDialogHandler } from '../../../browser/parts/dialogs/dialogHandler.js';
import { NativeDialogHandler } from './dialogHandler.js';
import { DialogService } from '../../../services/dialogs/common/dialogService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { createNativeAboutDialogDetails } from '../../../../platform/dialogs/electron-browser/dialog.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';

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
		@IProductService private productService: IProductService,
		@IClipboardService clipboardService: IClipboardService,
		@INativeHostService private nativeHostService: INativeHostService,
		@IWorkbenchEnvironmentService private environmentService: IWorkbenchEnvironmentService,
		@IOpenerService openerService: IOpenerService,
		@IMarkdownRendererService markdownRendererService: IMarkdownRendererService,
	) {
		super();

		this.browserImpl = new Lazy(() => new BrowserDialogHandler(logService, layoutService, keybindingService, instantiationService, clipboardService, openerService, markdownRendererService));
		this.nativeImpl = new Lazy(() => new NativeDialogHandler(logService, nativeHostService, clipboardService));

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
					const aboutDialogDetails = createNativeAboutDialogDetails(this.productService, await this.nativeHostService.getOSProperties());

					if (this.useCustomDialog) {
						await this.browserImpl.value.about(aboutDialogDetails.title, aboutDialogDetails.details, aboutDialogDetails.detailsToCopy);
					} else {
						await this.nativeImpl.value.about(aboutDialogDetails.title, aboutDialogDetails.details, aboutDialogDetails.detailsToCopy);
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
		return this.configurationService.getValue('window.dialogStyle') === 'custom' ||
			// Use the custom dialog while driven so that the driver can interact with it
			!!this.environmentService.enableSmokeTestDriver;
	}
}

registerWorkbenchContribution2(
	DialogHandlerContribution.ID,
	DialogHandlerContribution,
	WorkbenchPhase.BlockStartup // Block to allow for dialogs to show before restore finished
);
