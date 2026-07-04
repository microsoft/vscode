/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMobile, isWeb } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { LayoutController, RESPONSIVE_SIDEBAR_SETTING } from './desktopSessionLayoutController.js';
import { MobileLayoutController } from './mobileSessionLayoutController.js';
import { DOCK_DETAIL_PANEL_SETTING } from '../../../common/sessionConfig.js';

// Contribute the layout controller for the current platform. The web bundle
// serves both the web desktop and the web phone layouts, so the choice is made
// at runtime; the native desktop bundle always uses the desktop controller.
// Registered at `BlockRestore` so the controller is in place before the window
// restores its UI, getting the side-pane layout right without a visible flash.
if (isWeb && isMobile) {
	registerWorkbenchContribution2(MobileLayoutController.ID, MobileLayoutController, WorkbenchPhase.BlockRestore);
} else {
	registerWorkbenchContribution2(LayoutController.ID, LayoutController, WorkbenchPhase.BlockRestore);
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[RESPONSIVE_SIDEBAR_SETTING]: {
			type: 'boolean',
			markdownDescription: localize('sessions.layout.autoCollapseSessionsSidebar', "Controls whether the sessions sidebar is automatically collapsed in a narrow Agents window while both the editor and the side panel are open, and shown again once either of them closes."),
			default: product.quality !== 'stable',
			tags: ['experimental'],
		},
		[DOCK_DETAIL_PANEL_SETTING]: {
			type: 'boolean',
			markdownDescription: localize('sessions.layout.singlePaneDetailPanel', "Controls whether the Agents window docks the detail panel inside the editor so a single editor tab bar spans across the editor and the detail panel. Requires a window reload to take effect."),
			default: false,
			tags: ['experimental'],
		},
	},
});
