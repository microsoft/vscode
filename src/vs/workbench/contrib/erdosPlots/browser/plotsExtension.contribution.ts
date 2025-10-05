/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { PlotsViewPane } from './ui/panes/plotsViewPane.js';
import { PlotsOrchestrator } from './core/plotsOrchestrator.js';
import { IErdosPlotsService, ERDOS_PLOTS_VIEW_ID } from '../common/erdosPlotsService.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from '../../../common/contributions.js';
import { Extensions as ViewContainerExtensions, IViewsRegistry } from '../../../common/views.js';
import { initializeCommandRegistry } from './actions/commandRegistration.js';
import { ViewContainerLocation, ViewContainer, IViewContainersRegistry } from '../../../common/views.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { PlotHistoryViewPane } from './ui/panes/plotHistoryViewPane.js';

registerSingleton(IErdosPlotsService, PlotsOrchestrator, InstantiationType.Delayed);

const PLOTS_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.auxiliaryBar.erdosPlotsContainer',
	title: {
		value: nls.localize('erdos.plots.container', "Plots"),
		original: 'Plots'
	},
	alwaysUseContainerInfo: true,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.auxiliaryBar.erdosPlotsContainer', {
		mergeViewWithContainerWhenSingleView: false
	}]),
	storageId: 'workbench.auxiliaryBar.erdosPlotsContainer',
	hideIfEmpty: false,
	order: 1,
}, ViewContainerLocation.AuxiliaryBar, {
	doNotRegisterOpenCommand: true,
	isDefault: false
});

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews(
	[
		{
			id: ERDOS_PLOTS_VIEW_ID,
			name: {
				value: nls.localize('erdos.plots.current', "Plots"),
				original: 'Plots'
			},
			ctorDescriptor: new SyncDescriptor(PlotsViewPane),
			collapsed: false,
			canToggleVisibility: true,
			hideByDefault: false,
			canMoveView: true,
			order: 1,
			weight: 60
		},
		{
			id: 'workbench.panel.erdosPlotsHistory',
			name: {
				value: nls.localize('erdos.plots.history', "Plot History"),
				original: 'Plot History'
			},
			ctorDescriptor: new SyncDescriptor(PlotHistoryViewPane),
			collapsed: false,
			canToggleVisibility: true,
			hideByDefault: false,
			canMoveView: true,
			order: 2,
			weight: 40
		}
	],
	PLOTS_CONTAINER
);

class PlotsExtensionContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IErdosPlotsService plotsOrchestrator: IErdosPlotsService,
	) {
		super();
		this._initializeCommands();
	}

	private _initializeCommands(): void {
		initializeCommandRegistry();
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	PlotsExtensionContribution,
	LifecyclePhase.Restored
);

