/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { equals } from '../../../../base/common/objects.js';
import { PolicyTag } from '../../../../base/common/policy.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition } from '../../../../platform/policy/common/policy.js';
import { IDefaultAccountService } from '../../accounts/common/defaultAccount.js';

interface IAccountPolicy {
	readonly chatPreviewFeaturesEnabled: boolean;
	readonly mcpEnabled: boolean;
}

export class AccountPolicyService extends AbstractPolicyService implements IPolicyService {
	private accountPolicy: IAccountPolicy = {
		chatPreviewFeaturesEnabled: true,
		mcpEnabled: true
	};
	constructor(
		@ILogService private readonly logService: ILogService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService
	) {
		super();

		this.defaultAccountService.getDefaultAccount()
			.then(account => {
				this._update({
					chatPreviewFeaturesEnabled: account?.chat_preview_features_enabled ?? true,
					mcpEnabled: account?.mcp ?? true
				});
				this._register(this.defaultAccountService.onDidChangeDefaultAccount(
					account => this._update({
						chatPreviewFeaturesEnabled: account?.chat_preview_features_enabled ?? true,
						mcpEnabled: account?.mcp ?? true
					})
				));
			});
	}

	private _update(updatedPolicy: IAccountPolicy): void {
		if (!equals(this.accountPolicy, updatedPolicy)) {
			this.accountPolicy = updatedPolicy;
			this._updatePolicyDefinitions(this.policyDefinitions);
		}
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		this.logService.trace(`AccountPolicyService#_updatePolicyDefinitions: Got ${Object.keys(policyDefinitions).length} policy definitions`);
		const updated: string[] = [];

		const updateIfNeeded = (key: string, policy: PolicyDefinition, isFeatureEnabled: boolean): void => {
			if (isFeatureEnabled) {
				// Clear the policy if it is set
				if (this.policies.has(key)) {
					this.policies.delete(key);
					updated.push(key);
				}
			} else {
				// Enforce the defaultValue if not already set
				const updatedValue = policy.defaultValue === undefined ? false : policy.defaultValue;
				if (this.policies.get(key) !== updatedValue) {
					this.policies.set(key, updatedValue);
					updated.push(key);
				}
			}
		};

		const hasAllTags = (policy: PolicyDefinition, tags: PolicyTag[]): boolean | undefined => {
			return policy.tags && tags.every(tag => policy.tags!.includes(tag));
		};

		for (const key in policyDefinitions) {
			const policy = policyDefinitions[key];

			// Map chat preview features with ACCOUNT + PREVIEW tags
			if (hasAllTags(policy, [PolicyTag.Account, PolicyTag.Preview])) {
				updateIfNeeded(key, policy, this.accountPolicy?.chatPreviewFeaturesEnabled);
			}
			// Map MCP feature with MCP tag
			else if (hasAllTags(policy, [PolicyTag.Account, PolicyTag.MCP])) {
				updateIfNeeded(key, policy, this.accountPolicy?.mcpEnabled);
			}
		}

		if (updated.length) {
			this._onDidChange.fire(updated);
		}
	}
}
