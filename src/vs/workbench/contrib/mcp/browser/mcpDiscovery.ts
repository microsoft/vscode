/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { mcpDiscoveryRegistry } from '../common/discovery/mcpDiscovery.js';

export class McpDiscovery extends Disposable implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.mcp.discovery';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		for (const discovery of mcpDiscoveryRegistry.getAll()) {
			const inst = this._register(instantiationService.createInstance(discovery));
			inst.start();
		}
	}
}
