/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IBannerService } from '../../../services/banner/browser/bannerService.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IPolicyParseError, IPolicyService } from '../../../../platform/policy/common/policy.js';


export class InvalidPolicyBannerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'invalidPolicyBannerContribution';
	private static readonly BANNER_ID = 'workbench.banner.policyError';

	constructor(
		@IBannerService private readonly bannerService: IBannerService,
		@IPolicyService private readonly policyService: IPolicyService,
	) {
		super();
		this.onPolicyParseErrors(this.policyService.getPolicyErrors());
		this._register(this.policyService.onDidParseErrors(errors => this.onPolicyParseErrors(errors)));
	}

	private onPolicyParseErrors(errors: readonly IPolicyParseError[] | undefined): void {
		if (errors && errors.length > 0) {
			this.showBanner(errors);
		} else {
			this.hideBanner();
		}
	}

	private showBanner(errors: readonly IPolicyParseError[]): void {
		let message: string;
		if (errors.length === 1) {
			message = localize(
				'invalidPolicyBanner.message.single',
				"An error occurred when applying policy '{0}'. Please contact your administrator.",
				errors[0][0]
			);
		} else {
			message = localize(
				'invalidPolicyBanner.message.multiple',
				"{0} errors occurred when applying policy. Please contact your administrator.",
				errors.length,
			);
		}

		// Show a banner with error details
		this.bannerService.show({
			id: InvalidPolicyBannerContribution.BANNER_ID,
			icon: Codicon.briefcase,
			message,
			actions: [
				{
					label: localize('invalidPolicyBanner.learnMore', "Learn More"),
					href: 'https://code.visualstudio.com/docs/setup/enterprise',
				}
			]
		});
	}

	private hideBanner(): void {
		this.bannerService.hide(InvalidPolicyBannerContribution.BANNER_ID);
	}
}
