/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewContainerExtensions, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';

// CSS imports
import './components/shared.css';

// Import services and components
import { EnvironmentService } from './services/environmentService.js';
import { 
	IErdosEnvironmentService,
	ERDOS_ENVIRONMENT_VIEW_CONTAINER_ID,
	ERDOS_PYTHON_ENVIRONMENTS_VIEW_ID,
	ERDOS_R_PACKAGES_VIEW_ID,
	ERDOS_PYTHON_PACKAGES_VIEW_ID
} from '../common/environmentTypes.js';
import { PythonEnvironmentsView } from './views/pythonEnvironmentsView.js';
import { RPackagesView, PythonPackagesView } from './views/packagesView.js';


// Register the environment view icon
const environmentViewIcon = registerIcon(
	'erdos-environment-view-icon',
	Codicon.layers,
	localize('erdosEnvironmentViewIcon', 'View icon of the Erdos environment view.')
);

/**
 * Erdos Environment Contribution
 * Registers the environment service and initializes the environment functionality
 */
class ErdosEnvironmentContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.erdosEnvironment';

	constructor(
		@IErdosEnvironmentService environmentService: IErdosEnvironmentService
	) {
		super();
		// Service is automatically initialized when injected
	}
}

// Register View Container - Creates the "Environment" pane in AuxiliaryBar (right sidebar)
const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: ERDOS_ENVIRONMENT_VIEW_CONTAINER_ID,
	title: {
		value: localize('erdos.environment', "Environment"),
		original: 'Environment'
	},
	icon: environmentViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ERDOS_ENVIRONMENT_VIEW_CONTAINER_ID, {
		mergeViewWithContainerWhenSingleView: false
	}]),
	storageId: ERDOS_ENVIRONMENT_VIEW_CONTAINER_ID,
	hideIfEmpty: true,
	order: 4 // Position after Databases (3)
}, ViewContainerLocation.AuxiliaryBar, {
	doNotRegisterOpenCommand: false,
	isDefault: false
});

// Register Views - PythonEnvironmentsView, RPackagesView, and PythonPackagesView inside the pane
Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: ERDOS_PYTHON_ENVIRONMENTS_VIEW_ID,
	name: {
		value: localize('erdos.environment.pythonEnvironments', "Python Environments"),
		original: 'Python Environments'
	},
	containerIcon: environmentViewIcon,
	canMoveView: true,
	canToggleVisibility: true,
	ctorDescriptor: new SyncDescriptor(PythonEnvironmentsView),
	order: 1,
	weight: 40
}, {
	id: ERDOS_R_PACKAGES_VIEW_ID,
	name: {
		value: localize('erdos.environment.rPackages', "R Packages"),
		original: 'R Packages'
	},
	containerIcon: environmentViewIcon,
	canMoveView: true,
	canToggleVisibility: true,
	ctorDescriptor: new SyncDescriptor(RPackagesView),
	order: 2,
	weight: 30
}, {
	id: ERDOS_PYTHON_PACKAGES_VIEW_ID,
	name: {
		value: localize('erdos.environment.pythonPackages', "Python Packages"),
		original: 'Python Packages'
	},
	containerIcon: environmentViewIcon,
	canMoveView: true,
	canToggleVisibility: true,
	ctorDescriptor: new SyncDescriptor(PythonPackagesView),
	order: 3,
	weight: 30
}], VIEW_CONTAINER);

// Register the Environment Service as a singleton
registerSingleton(IErdosEnvironmentService, EnvironmentService, InstantiationType.Delayed);

// Register the workbench contribution - using same lifecycle phase as Plots
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	ErdosEnvironmentContribution,
	LifecyclePhase.Restored
);

