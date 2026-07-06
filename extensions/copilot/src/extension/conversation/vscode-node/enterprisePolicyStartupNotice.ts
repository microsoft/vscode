/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnterpriseManagedPolicyService } from '../../../platform/configuration/common/enterpriseManagedPolicyService';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IExtensionContribution } from '../../common/contributions';
import { showEnterprisePolicyModal } from './enterprisePolicyNotice';

/**
 * Surfaces the effective enterprise policy in a read-only modal dialog once when
 * chat activates, so the user is informed of the rules their administrator has
 * applied before they begin a session (including in the Agents/sessions window).
 *
 * This complements — and does not replace — the read-only in-chat policy notice
 * emitted at the top of a new conversation.
 */
export class EnterprisePolicyStartupNoticeContribution extends Disposable implements IExtensionContribution {
	readonly id = 'enterprisePolicyStartupNotice';

	constructor(
		@IEnterpriseManagedPolicyService private readonly enterpriseManagedPolicyService: IEnterpriseManagedPolicyService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		void this.showPolicyNotice();
	}

	private async showPolicyNotice(): Promise<void> {
		try {
			const policy = await this.enterpriseManagedPolicyService.getEffectiveEnterprisePolicy();
			await showEnterprisePolicyModal(policy);
		} catch (error) {
			// Surfacing the enterprise policy notice must never disrupt activation.
			this.logService.error(error, 'Failed to surface enterprise policy startup notice');
		}
	}
}
