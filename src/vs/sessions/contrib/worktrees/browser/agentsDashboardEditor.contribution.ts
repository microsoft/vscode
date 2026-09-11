/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './agentsDashboardAccessibility.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { localize } from '../../../../nls.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { AGENTS_DASHBOARD_CUSTOM_VIEW_ID } from '../common/agentsDashboard.js';
import { AgentsDashboardCustomView } from './agentsDashboardEditor.js';

/**
 * Registers the Agents Dashboard custom view.
 */
class AgentsDashboardCustomViewContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentsDashboardCustomView';

	constructor(
		@ICustomViewService customViewService: ICustomViewService,
	) {
		super();

		this._register(customViewService.registerCustomView({
			id: AGENTS_DASHBOARD_CUSTOM_VIEW_ID,
			ctor: new SyncDescriptor(AgentsDashboardCustomView),
			hideHeader: true,
			commandCenterTitle: localize('agentsDashboard.commandCenterTitle', "Manage Sessions"),
		}));
	}
}

registerWorkbenchContribution2(AgentsDashboardCustomViewContribution.ID, AgentsDashboardCustomViewContribution, WorkbenchPhase.BlockRestore);
