/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../platform/mcp/common/mcpManagement.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { mcpDiscoveryRegistry } from '../common/discovery/mcpDiscovery.js';

export class McpDiscovery extends Disposable implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.mcp.discovery';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();

		const mcpAccessValue = observableConfigValue(mcpAccessConfig, McpAccessValue.All, configurationService);
		const orgPolicySatisfied = observableFromEvent(chatEntitlementService.onDidChangeEntitlement, () => chatEntitlementService.orgPolicySatisfied);
		const store = this._register(new DisposableStore());

		this._register(autorun(reader => {
			store.clear();
			const value = mcpAccessValue.read(reader);
			if (value === McpAccessValue.None) {
				return;
			}
			if (!orgPolicySatisfied.read(reader)) {
				return;
			}
			for (const descriptor of mcpDiscoveryRegistry.getAll()) {
				const mcpDiscovery = instantiationService.createInstance(descriptor);
				if (value === McpAccessValue.Registry && !mcpDiscovery.fromGallery) {
					mcpDiscovery.dispose();
					continue;
				}
				store.add(mcpDiscovery);
				mcpDiscovery.start();
			}
		}));
	}
}
