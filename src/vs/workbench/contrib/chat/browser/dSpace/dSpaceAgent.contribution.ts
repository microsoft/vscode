/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { DSpaceAgent } from './dSpaceAgent.js';

/**
 * Workbench contribution that registers the DSpace AI agent on startup
 */
export class DSpaceAgentContribution
	extends Disposable
	implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.dSpaceAgent';

	constructor(
		@IInstantiationService
		private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.logService.info(
			'[DSpaceAgentContribution] Registering DSpace AI agent...',
		);

		// Register the agent
		this._register(DSpaceAgent.registerAgent(this.instantiationService));

		this.logService.info(
			'[DSpaceAgentContribution] DSpace AI agent registered successfully',
		);
	}
}

// Register the contribution
registerWorkbenchContribution2(DSpaceAgentContribution.ID, DSpaceAgentContribution, WorkbenchPhase.BlockStartup);
