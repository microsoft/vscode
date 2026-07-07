/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import {
	Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation
} from '../../../common/views.js';
import { IRos2WorkspaceService } from '../common/ros2WorkspaceService.js';
import { Ros2WorkspaceService } from './ros2WorkspaceService.js';
import { Ros2PackageExplorerView } from './ros2PackageExplorerView.js';
import { IndexRos2WorkspaceAction, registerRoboAgentActions } from './ros2WorkspaceActions.js';

// --- Service ---------------------------------------------------------------

registerSingleton(IRos2WorkspaceService, Ros2WorkspaceService, InstantiationType.Delayed);

// --- Activity bar container + view -----------------------------------------

const roboAgentViewIcon = registerIcon('roboagent-view-icon', Codicon.circuitBoard, localize('roboagent.viewIcon', "View icon of the RoboAgent ROS2 view."));

const VIEW_CONTAINER_ID = 'workbench.view.roboagent';

const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: VIEW_CONTAINER_ID,
	title: localize2('roboagent.ros2', "ROS2"),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	icon: roboAgentViewIcon,
	order: 6,
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar);

const packageExplorerDescriptor: IViewDescriptor = {
	id: Ros2PackageExplorerView.ID,
	name: localize2('roboagent.packageExplorer', "Package Explorer"),
	containerIcon: roboAgentViewIcon,
	ctorDescriptor: new SyncDescriptor(Ros2PackageExplorerView),
	canToggleVisibility: true,
	canMoveView: true,
	order: 1,
};

const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
viewsRegistry.registerViews([packageExplorerDescriptor], viewContainer);

// Empty-state welcome content (shown when no ROS2 packages are indexed).
viewsRegistry.registerViewWelcomeContent(Ros2PackageExplorerView.ID, {
	content: localize('roboagent.noPackages', "No ROS2 packages found in this workspace yet.\nOpen a colcon workspace (a folder containing package.xml manifests) to see its architecture."),
});
viewsRegistry.registerViewWelcomeContent(Ros2PackageExplorerView.ID, {
	content: `[${localize('roboagent.indexNow', "Index ROS2 Workspace")}](command:${IndexRos2WorkspaceAction.ID})`,
	order: 10,
});

// --- Commands / actions ----------------------------------------------------

registerRoboAgentActions();

// --- Startup bootstrap: index the workspace once restored ------------------

class Ros2IndexBootstrap implements IWorkbenchContribution {
	static readonly ID = 'roboagent.ros2IndexBootstrap';

	constructor(@IRos2WorkspaceService ros2WorkspaceService: IRos2WorkspaceService) {
		// Fire and forget; the view reacts to onDidChangeGraph.
		ros2WorkspaceService.indexWorkspace();
	}
}

registerWorkbenchContribution2(Ros2IndexBootstrap.ID, Ros2IndexBootstrap, WorkbenchPhase.AfterRestored);
