/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { IAgentsModeService } from '../common/agentsMode.js';

/**
 * Keeps main's record of the window's Agents mode, which it restores the window in,
 * equal to the mode the window is in, however the mode changed.
 */
export class AgentsModeWindowStateContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsModeWindowState';

	constructor(
		@IAgentsModeService agentsModeService: IAgentsModeService,
		@INativeHostService nativeHostService: INativeHostService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
	) {
		super();

		const tellMain = (active: boolean) => nativeHostService.setWindowAgentsMode(active).catch(onUnexpectedError);

		// A window main started in the mode can't apply it, for example after the user turned the mode off
		if (!!environmentService.window.agentsMode !== agentsModeService.isActive) {
			tellMain(agentsModeService.isActive);
		}

		this._register(agentsModeService.onDidChange(active => tellMain(active)));
	}
}

registerWorkbenchContribution2(AgentsModeWindowStateContribution.ID, AgentsModeWindowStateContribution, WorkbenchPhase.BlockStartup);
