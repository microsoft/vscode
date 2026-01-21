/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Import the desktop workbench - this includes all services and contributions for desktop
import './workbench.desktop.main.js';
import { AgentWindow } from './contrib/agent/browser/agentWindow.js';

import { main as agentMain } from './electron-browser/agent.main.js';
import type { INativeWindowConfiguration } from '../platform/window/common/window.js';

export interface IAgentMain {
	main(configuration: INativeWindowConfiguration): Promise<void>;
}

export function main(configuration: INativeWindowConfiguration): Promise<void> {
	return agentMain(configuration, AgentWindow);
}
