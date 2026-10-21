/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentWorkbenchLayout, Workbench } from './workbench.js';

export class MobileWorkbench extends Workbench {
	override get agentWorkbenchLayout(): AgentWorkbenchLayout {
		return AgentWorkbenchLayout.Mobile;
	}
}
