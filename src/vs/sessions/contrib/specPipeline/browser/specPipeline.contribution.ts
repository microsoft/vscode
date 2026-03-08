/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IViewContainersRegistry, ViewContainerLocation, IViewsRegistry, Extensions as ViewContainerExtensions, WindowVisibility } from '../../../../workbench/common/views.js';
import { ISpecPipelineService } from '../common/specPipeline.js';
import { SpecPipelineService } from './specPipelineService.js';
import { SPEC_PIPELINE_VIEW_CONTAINER_ID, SPEC_PIPELINE_VIEW_ID, SpecPipelineViewPane, SpecPipelineViewPaneContainer } from './specPipelineView.js';

// Register the spec pipeline service
registerSingleton(ISpecPipelineService, SpecPipelineService, InstantiationType.Delayed);

// Register the view icon
const specPipelineViewIcon = registerIcon('spec-pipeline-view-icon', Codicon.checklist, localize2('specPipelineViewIcon', 'View icon for the Spec Pipeline view.').value);

// Register the view container
const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);

const specPipelineViewContainer = viewContainersRegistry.registerViewContainer({
	id: SPEC_PIPELINE_VIEW_CONTAINER_ID,
	title: localize2('specPipeline', 'Spec Pipeline'),
	ctorDescriptor: new SyncDescriptor(SpecPipelineViewPaneContainer),
	icon: specPipelineViewIcon,
	order: 20,
	hideIfEmpty: false,
	windowVisibility: WindowVisibility.Sessions
}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: true });

// Register the view
const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

viewsRegistry.registerViews([{
	id: SPEC_PIPELINE_VIEW_ID,
	name: localize2('specPipeline', 'Spec Pipeline'),
	containerIcon: specPipelineViewIcon,
	ctorDescriptor: new SyncDescriptor(SpecPipelineViewPane),
	canToggleVisibility: true,
	canMoveView: true,
	weight: 100,
	order: 1,
	windowVisibility: WindowVisibility.Sessions
}], specPipelineViewContainer);
