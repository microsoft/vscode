/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMobile, isWeb } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { LayoutController, RESPONSIVE_SIDEBAR_SETTING } from './desktopSessionLayoutController.js';
import { MobileLayoutController } from './mobileSessionLayoutController.js';
import { DOCK_DETAIL_PANEL_SETTING } from '../../../common/sessionConfig.js';
import { SinglePaneLayoutController } from './singlePaneLayoutController.js';

class SessionsLayoutContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsLayoutContribution';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		if (isWeb && isMobile) {
			this._register(instantiationService.createInstance(MobileLayoutController));
			return;
		}

		if (configurationService.getValue<boolean>(DOCK_DETAIL_PANEL_SETTING)) {
			this._register(instantiationService.createInstance(SinglePaneLayoutController));
			return;
		}

		this._register(instantiationService.createInstance(LayoutController));
	}
}

registerWorkbenchContribution2(SessionsLayoutContribution.ID, SessionsLayoutContribution, WorkbenchPhase.BlockRestore);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[RESPONSIVE_SIDEBAR_SETTING]: {
			type: 'boolean',
			markdownDescription: localize('sessions.layout.autoCollapseSessionsSidebar', "Controls whether the sessions sidebar is automatically collapsed in a narrow Agents window while both the editor and the side panel are open, and shown again once either of them closes."),
			default: product.quality !== 'stable',
			tags: ['experimental'],
			experiment: { mode: 'auto' }
		},
		[DOCK_DETAIL_PANEL_SETTING]: {
			type: 'boolean',
			markdownDescription: localize('sessions.layout.singlePaneDetailPanel', "Controls whether the Agents window docks the detail panel inside the editor so a single editor tab bar spans across the editor and the detail panel. Requires a window reload to take effect."),
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' }
		},
	},
});
