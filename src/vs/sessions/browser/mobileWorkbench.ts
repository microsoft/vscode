/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Workbench } from './workbench.js';
import { AgentWorkbenchLayout } from '../../workbench/services/sessions/browser/sessionsHostLayoutService.js';

export class MobileWorkbench extends Workbench {
	override get agentWorkbenchLayout(): AgentWorkbenchLayout {
		return AgentWorkbenchLayout.Mobile;
	}
}
