/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition } from '../../../../platform/policy/common/policy.js';
import { DefaultAccountService, IDefaultAccountService } from '../../accounts/common/defaultAccount.js';

export class AccountPolicyService extends AbstractPolicyService implements IPolicyService {
	private chatPreviewFeaturesEnabled: boolean = true;
	constructor(
		@ILogService private readonly logService: ILogService,
		@IDefaultAccountService private readonly defaultAccountService: DefaultAccountService
	) {
		super();
		this._register(this.defaultAccountService.onDidChangeDefaultAccount((account) => {
			if (!account) {
				return;
			}
			this.chatPreviewFeaturesEnabled = (account.chat_preview_features_enabled === undefined) || account.chat_preview_features_enabled;
			this._updatePolicyDefinitions(this.policyDefinitions);
		}));
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		this.logService.trace(`AccountPolicyService#_updatePolicyDefinitions: Got ${Object.keys(policyDefinitions).length} policy definitions`);

		const update: string[] = [];
		for (const key in policyDefinitions) {
			const policy = policyDefinitions[key];
			if (policy.previewFeature) {
				if (this.chatPreviewFeaturesEnabled) {
					this.policies.delete(key);
					continue;
				}
				const defaultValue = policy.defaultValue;
				const updatedValue = defaultValue === undefined ? false : defaultValue;
				if (this.policies.get(key) === updatedValue) {
					continue;
				}
				this.policies.set(key, updatedValue);
				update.push(key);
			}
		}
		this._onDidChange.fire(update);
	}
}
