/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { mcpDiscoveryRegistry } from '../common/discovery/mcpDiscovery.js';
import { mcpEnabledSection } from '../common/mcpConfiguration.js';

export class McpDiscovery extends Disposable implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.mcp.discovery';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		const enabled = observableConfigValue(mcpEnabledSection, true, configurationService);
		const store = this._register(new DisposableStore());

		this._register(autorun(reader => {
			if (enabled.read(reader)) {
				for (const discovery of mcpDiscoveryRegistry.getAll()) {
					const inst = store.add(instantiationService.createInstance(discovery));
					inst.start();
				}
			} else {
				store.clear();
			}
		}));
	}
}
