/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../nls.js';
import { Categories } from '../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../common/views.js';
import { IViewsService } from '../../services/views/common/viewsService.js';
import { IWorkbenchLayoutService, Parts } from '../../services/layout/browser/layoutService.js';
import type { ViewPane } from '../parts/views/viewPane.js';
import { INavigableViewContainer, IViewNavigationRequest, IViewNavigationSnapshot, resolveViewNavigationTarget, ViewNavigationLocation } from './viewNavigationModel.js';

/**
 * The workbench only exposes one active view container per location. Use
 * visibleViewDescriptors instead of activeViewDescriptors: an active view
 * can still be hidden by the user and must not be a focus destination.
 */
function getVisibleViewContainers(
	viewsService: IViewsService,
	descriptorService: IViewDescriptorService,
	layoutService: IWorkbenchLayoutService
): readonly INavigableViewContainer[] {
	const locations = [
		[ViewContainerLocation.Sidebar, 'sidebar', Parts.SIDEBAR_PART],
		[ViewContainerLocation.AuxiliaryBar, 'auxiliarybar', Parts.AUXILIARYBAR_PART],
		[ViewContainerLocation.Panel, 'panel', Parts.PANEL_PART]
	] as const;

	const containers: INavigableViewContainer[] = [];
	for (const [location, name, part] of locations) {
		// An active pane composite can outlive the visibility of its workbench part.
		// Do not navigate into a hidden sidebar or panel just because it remains active.
		if (!layoutService.isVisible(part)) {
			continue;
		}

		const container = viewsService.getVisibleViewContainer(location);
		if (!container) {
			continue;
		}

		const model = descriptorService.getViewContainerModel(container);
		containers.push({
			id: container.id,
			location: name,
			active: true,
			views: model.visibleViewDescriptors
				// A visible descriptor may not have a rendered pane (for example,
				// if rendering failed). A collapsed view without a visible header
				// cannot receive focus, and openView() would expand it unexpectedly.
				.filter(view => {
					if (!model.isCollapsed(view.id)) {
						return true;
					}
					const pane = viewsService.getActiveViewWithId<ViewPane>(view.id);
					const header = pane?.draggableElement;
					return !!pane?.headerVisible && !!header?.isConnected && header.tabIndex >= 0;
				})
				.map(view => ({
					id: view.id,
					visible: true,
					// A collapsed, rendered pane has a focusable header.
					collapsed: model.isCollapsed(view.id)
				}))
		});
	}

	return containers;
}

/**
 * Resolve view focus at invocation time, rather than caching it when a command
 * is registered. The user may have moved/reordered views since the last call.
 */
export async function focusNavigableView(
	viewsService: IViewsService,
	descriptorService: IViewDescriptorService,
	layoutService: IWorkbenchLayoutService,
	request: IViewNavigationRequest
): Promise<void> {
	const focusedView = viewsService.getFocusedView();
	const preferredContainerId = focusedView
		? descriptorService.getViewContainerByViewId(focusedView.id)?.id
		: undefined;

	const snapshot: IViewNavigationSnapshot = {
		containers: getVisibleViewContainers(viewsService, descriptorService, layoutService),
		focusedViewId: focusedView?.id,
		preferredContainerId,
		// When invoked from the editor, default to the primary sidebar.
		// The navigation model will fall back to another visible location.
		preferredLocation: 'sidebar'
	};

	const target = resolveViewNavigationTarget(snapshot, request);
	if (!target) {
		return;
	}

	// openView() expands collapsed panes as a side effect. Use the same
	// snapshot that selected the target rather than looking up its container
	// again: a view may be moving between containers during navigation.
	const targetView = snapshot.containers
		.find(container => container.id === target.containerId && container.location === target.location)
		?.views.find(view => view.id === target.viewId);
	if (targetView?.collapsed) {
		const pane = viewsService.getActiveViewWithId<ViewPane>(target.viewId);
		pane?.draggableElement?.focus();
		return;
	}

	await viewsService.openView(target.viewId, true);
}

function registerViewNavigationAction(
	id: string,
	title: ReturnType<typeof localize2>,
	request: IViewNavigationRequest
): void {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id,
				title,
				category: Categories.View,
				f1: true
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			await focusNavigableView(
				accessor.get(IViewsService),
				accessor.get(IViewDescriptorService),
				accessor.get(IWorkbenchLayoutService),
				request
			);
		}
	});
}

// These commands intentionally have no default keybindings. Reusing an existing
// shortcut could change established editor, terminal or tree navigation.
registerViewNavigationAction(
	'workbench.action.focusNextViewInContainer',
	localize2('focusNextViewInContainer', 'Focus Next View in Current Container'),
	{ direction: 'next', scope: 'container' }
);

registerViewNavigationAction(
	'workbench.action.focusPreviousViewInContainer',
	localize2('focusPreviousViewInContainer', 'Focus Previous View in Current Container'),
	{ direction: 'previous', scope: 'container' }
);

registerViewNavigationAction(
	'workbench.action.focusFirstViewInContainer',
	localize2('focusFirstViewInContainer', 'Focus First View in Current Container'),
	{ direction: 'first', scope: 'container' }
);

registerViewNavigationAction(
	'workbench.action.focusLastViewInContainer',
	localize2('focusLastViewInContainer', 'Focus Last View in Current Container'),
	{ direction: 'last', scope: 'container' }
);

registerViewNavigationAction(
	'workbench.action.focusNextVisibleView',
	localize2('focusNextVisibleView', 'Focus Next Visible View Across Containers'),
	{ direction: 'next', scope: 'workbench' }
);

registerViewNavigationAction(
	'workbench.action.focusPreviousVisibleView',
	localize2('focusPreviousVisibleView', 'Focus Previous Visible View Across Containers'),
	{ direction: 'previous', scope: 'workbench' }
);

registerViewNavigationAction(
	'workbench.action.focusNextExpandedViewInContainer',
	localize2('focusNextExpandedViewInContainer', 'Focus Next Expanded View in Current Container'),
	{ direction: 'next', scope: 'container', includeCollapsed: false }
);

registerViewNavigationAction(
	'workbench.action.focusPreviousExpandedViewInContainer',
	localize2('focusPreviousExpandedViewInContainer', 'Focus Previous Expanded View in Current Container'),
	{ direction: 'previous', scope: 'container', includeCollapsed: false }
);
