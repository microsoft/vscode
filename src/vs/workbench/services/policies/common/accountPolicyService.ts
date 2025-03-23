/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition } from '../../../../platform/policy/common/policy.js';
import { DefaultAccountService, IDefaultAccountService } from '../../accounts/common/defaultAccount.js';

export class AccountPolicyService extends AbstractPolicyService implements IPolicyService {
	// private editorPreviewFeaturesEnabled: boolean = false;
	constructor(
		@ILogService private readonly logService: ILogService,
		@IDefaultAccountService private readonly defaultAccountService: DefaultAccountService
	) {
		super();
		this._register(this.defaultAccountService.onDidChangeDefaultAccount((account) => {
			this.logService.info(`account?=${account?.sessionId} previewFeatures=${account?.chat_preview_features_enabled}`);
			// this.editorPreviewFeaturesEnabled = !!account?.editor_preview_features_enabled;
		}));
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		this.logService.info(`AccountPolicyService#_updatePolicyDefinitions: Got ${Object.keys(policyDefinitions).length} policy definitions`);
		// if (this.editorPreviewFeaturesEnabled) {
		// 	return;
		// }

		const update: string[] = [];
		for (const key in policyDefinitions) {
			this.logService.info(`AccountPolicyService#_updatePolicyDefinitions: key=${key} policyDefinition=${JSON.stringify(policyDefinitions[key])}`);
			if (key.startsWith('Copilot')) {
				this.policies.set(key, true);
				update.push(key);
			}
		}

		this._onDidChange.fire(update);
	}
}
