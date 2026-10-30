/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getClientArea } from '../../base/browser/dom.js';
import { mainWindow } from '../../base/browser/window.js';
import { isMobile, isWeb } from '../../base/common/platform.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../platform/log/common/log.js';
import { MobileWorkbench } from './mobileWorkbench.js';
import { DesktopWorkbench } from './desktopWorkbench.js';
import { AgentWorkbenchLayout, IWorkbenchOptions, Workbench } from './workbench.js';

export function getSessionsWorkbenchLayout(viewportWidth: number, platform = { isWeb, isMobile }): AgentWorkbenchLayout {
	return platform.isWeb && platform.isMobile && viewportWidth < 640 ? AgentWorkbenchLayout.Mobile : AgentWorkbenchLayout.Desktop;
}

/**
 * Creates the Agents window workbench. Non-phone windows always use the
 * desktop variant; phones use the dedicated mobile workbench.
 */
export function createSessionsWorkbench(parent: HTMLElement, options: IWorkbenchOptions | undefined, serviceCollection: ServiceCollection, logService: ILogService): Workbench {
	const layout = getSessionsWorkbenchLayout(getClientArea(mainWindow.document.body).width);
	return layout === AgentWorkbenchLayout.Mobile
		? new MobileWorkbench(parent, options, serviceCollection, logService)
		: new DesktopWorkbench(parent, options, serviceCollection, logService);
}
