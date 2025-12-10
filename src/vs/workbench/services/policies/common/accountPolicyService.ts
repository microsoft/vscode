/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { IDefaultAccount } from '../../../../base/common/defaultAccount.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition } from '../../../../platform/policy/common/policy.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';


export class AccountPolicyService extends AbstractPolicyService implements IPolicyService {

	private account: IDefaultAccount | null = null;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService
	) {
		super();

		this.defaultAccountService.getDefaultAccount()
			.then(account => {
				this.account = account;
				this._updatePolicyDefinitions(this.policyDefinitions);
				this._register(this.defaultAccountService.onDidChangeDefaultAccount(account => {
					this.account = account;
					this._updatePolicyDefinitions(this.policyDefinitions);
				}));
			});
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		this.logService.trace(`AccountPolicyService#_updatePolicyDefinitions: Got ${Object.keys(policyDefinitions).length} policy definitions`);
		const updated: string[] = [];

		for (const key in policyDefinitions) {
			const policy = policyDefinitions[key];
			const policyValue = this.account && policy.value ? policy.value(this.account) : undefined;
			if (policyValue !== undefined) {
				if (this.policies.get(key) !== policyValue) {
					this.policies.set(key, policyValue);
					updated.push(key);
				}
			} else {
				if (this.policies.delete(key)) {
					updated.push(key);
				}
			}
		}

		if (updated.length) {
			this._onDidChange.fire(updated);
		}
	}
}
