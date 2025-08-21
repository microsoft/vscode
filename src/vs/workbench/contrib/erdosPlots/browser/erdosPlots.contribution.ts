/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ErdosPlotsViewPane } from './erdosPlotsView.js';
import { ErdosPlotsService } from './erdosPlotsService.js';
import { IErdosPlotsService, ERDOS_PLOTS_VIEW_ID } from '../../../services/erdosPlots/common/erdosPlots.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from '../../../common/contributions.js';
import { Extensions as ViewContainerExtensions, IViewsRegistry } from '../../../common/views.js';

import { ViewContainerLocation, ViewContainer, IViewContainersRegistry } from '../../../common/views.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';

// Register the Erdos plots service.
registerSingleton(IErdosPlotsService, ErdosPlotsService, InstantiationType.Delayed);

// The Erdos plots view icon.
const erdosPlotViewIcon = registerIcon('erdos-plot-view-icon', Codicon.graph, nls.localize('erdosPlotViewIcon', 'View icon of the Erdos plot view.'));

// Create the Erdos plots view container.
const ERDOS_PLOTS_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.auxiliaryBar.erdosPlotsContainer',
	title: {
		value: nls.localize('erdos.plots.container', "Plots"),
		original: 'Plots'
	},
	icon: erdosPlotViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.auxiliaryBar.erdosPlotsContainer', {
		mergeViewWithContainerWhenSingleView: true
	}]),
	storageId: 'workbench.auxiliaryBar.erdosPlotsContainer',
	hideIfEmpty: false,
	order: 2,
}, ViewContainerLocation.AuxiliaryBar, {
	doNotRegisterOpenCommand: true,
	isDefault: false
});

// Register the Erdos plots view.
Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews(
	[
		{
			id: ERDOS_PLOTS_VIEW_ID,
			name: {
				value: nls.localize('erdos.plots', "Plots"),
				original: 'Plots'
			},
			ctorDescriptor: new SyncDescriptor(ErdosPlotsViewPane),
			collapsed: false,
			canToggleVisibility: true,
			hideByDefault: false,
			canMoveView: true,
			containerIcon: erdosPlotViewIcon,
			openCommandActionDescriptor: {
				id: 'workbench.action.erdos.togglePlots',
				mnemonicTitle: nls.localize({ key: 'miTogglePlots', comment: ['&& denotes a mnemonic'] }, "&&Plots"),
				keybindings: {},
				order: 1,
			}
		}
	],
	ERDOS_PLOTS_CONTAINER
);

class ErdosPlotsContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IErdosPlotsService erdosPlotsService: IErdosPlotsService,
	) {
		super();
		this.registerActions();
	}

	private registerActions(): void {
		// TODO: Register plot actions when they are implemented
	}
}

// Register the workbench contribution.
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	ErdosPlotsContribution,
	LifecyclePhase.Restored
);
