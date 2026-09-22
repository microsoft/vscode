/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IURLHandler, IURLService } from '../../../../platform/url/common/url.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IOnboardingTryoutService, parseExternalOnboardingTryoutUri, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../common/onboardingTryout.js';

export class OnboardingTryoutUrlHandler extends Disposable implements IWorkbenchContribution, IURLHandler {
	static readonly ID = 'workbench.contrib.onboardingTryoutUrlHandler';

	private pendingConfirmation: Promise<boolean> | undefined;

	constructor(
		@IURLService urlService: IURLService,
		@IOnboardingTryoutService private readonly tryoutService: IOnboardingTryoutService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@IProductService private readonly productService: IProductService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async handleURL(uri: URI): Promise<boolean> {
		const id = parseExternalOnboardingTryoutUri(uri, this.productService.urlProtocol);
		if (!id) {
			return false;
		}
		if (this.pendingConfirmation) {
			return true;
		}

		const confirmation = this.confirmExternalTryout(id);
		this.pendingConfirmation = confirmation;
		let confirmed: boolean;
		try {
			confirmed = await confirmation;
		} finally {
			if (this.pendingConfirmation === confirmation) {
				this.pendingConfirmation = undefined;
			}
		}
		if (confirmed) {
			await this.commandService.executeCommand(RUN_ONBOARDING_TRYOUT_COMMAND_ID, id);
		}
		return true;
	}

	private async confirmExternalTryout(id: string): Promise<boolean> {
		await this.hostService.focus(mainWindow);

		const scenario = this.tryoutService.getTryout(id);
		if (!scenario || scenario.tryout.allowExternalLaunch === false || this.tryoutService.getAvailability(id).kind === 'hidden') {
			await this.dialogService.info(
				localize('onboarding.tryout.external.unavailable.title', "Feature example unavailable"),
				localize('onboarding.tryout.external.unavailable.detail', "This external link does not identify a feature example available in this version of {0}.", this.productService.nameLong),
			);
			return false;
		}

		const { confirmed } = await this.dialogService.confirm({
			type: 'question',
			message: localize('onboarding.tryout.external.confirm.title', "Open '{0}'?", scenario.tryout.title),
			detail: localize('onboarding.tryout.external.confirm.detail', "An external link requested this feature example in {0}.\n\n{1}\n\nOnly continue if you initiated this request.", this.productService.nameLong, scenario.tryout.description),
			primaryButton: localize({ key: 'onboarding.tryout.external.confirm.open', comment: ['&& denotes a mnemonic'] }, "&&Open Example"),
		});
		return confirmed;
	}
}

registerWorkbenchContribution2(OnboardingTryoutUrlHandler.ID, OnboardingTryoutUrlHandler, WorkbenchPhase.BlockRestore);
