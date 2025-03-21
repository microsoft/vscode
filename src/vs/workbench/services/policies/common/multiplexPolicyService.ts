/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition } from '../../../../platform/policy/common/policy.js';

export class MultiplexPolicyService extends AbstractPolicyService implements IPolicyService {

	constructor(
		private readonly policyServices: ReadonlyArray<IPolicyService>
	) {
		super();
	}
	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		await Promise.all(this.policyServices.map(service => service.updatePolicyDefinitions(policyDefinitions)));
	}
}
