/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { IDialogHandler, IDialogResult, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { IDialogsModel, IDialogViewItem } from '../../../../workbench/common/dialogs.js';
import { createBrowserAboutDialogDetails } from '../../../../workbench/browser/parts/dialogs/dialog.js';
import { DialogService } from '../../../../workbench/services/dialogs/common/dialogService.js';
import { MobileAwareDialogHandler } from './mobileAwareDialogHandler.js';

/**
 * Agents-window variant of the workbench `DialogHandlerContribution` that
 * drains the shared {@link IDialogsModel} through a {@link MobileAwareDialogHandler},
 * so every confirmation / prompt renders as a bottom sheet on phone layout.
 *
 * Registered in place of the standard web dialog-handler contribution (which
 * the Agents window does not import), so only one handler drains the model.
 */
export class MobileDialogHandlerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.mobileDialogHandler';

	private readonly model: IDialogsModel;
	private readonly impl: Lazy<IDialogHandler>;

	private currentDialog: IDialogViewItem | undefined;

	constructor(
		@IDialogService private dialogService: IDialogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService private productService: IProductService,
	) {
		super();

		this.impl = new Lazy(() => instantiationService.createInstance(MobileAwareDialogHandler));
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
				if (this.currentDialog.args.confirmArgs) {
					const args = this.currentDialog.args.confirmArgs;
					result = await this.impl.value.confirm(args.confirmation);
				} else if (this.currentDialog.args.inputArgs) {
					const args = this.currentDialog.args.inputArgs;
					result = await this.impl.value.input(args.input);
				} else if (this.currentDialog.args.promptArgs) {
					const args = this.currentDialog.args.promptArgs;
					result = await this.impl.value.prompt(args.prompt);
				} else {
					const aboutDialogDetails = createBrowserAboutDialogDetails(this.productService);
					await this.impl.value.about(aboutDialogDetails.title, aboutDialogDetails.details, aboutDialogDetails.detailsToCopy);
				}
			} catch (error) {
				result = error;
			}

			this.currentDialog.close(result);
			this.currentDialog = undefined;
		}
	}
}

registerWorkbenchContribution2(
	MobileDialogHandlerContribution.ID,
	MobileDialogHandlerContribution,
	WorkbenchPhase.BlockStartup // Block to allow for dialogs to show before restore finished
);
