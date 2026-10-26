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
import { INavigableViewContainer, IViewNavigationRequest, IViewNavigationSnapshot, resolveViewNavigationTarget, ViewNavigationLocation } from './viewNavigationModel.js';

/**
 * The workbench only exposes one active view container per location. Use
 * visibleViewDescriptors instead of activeViewDescriptors: an active view
 * can still be hidden by the user and must not be a focus destination.
 */
function getVisibleViewContainers(
	viewsService: IViewsService,
	descriptorService: IViewDescriptorService
): readonly INavigableViewContainer[] {
	const locations: readonly [ViewContainerLocation, ViewNavigationLocation][] = [
		[ViewContainerLocation.Sidebar, 'sidebar'],
		[ViewContainerLocation.AuxiliaryBar, 'auxiliarybar'],
		[ViewContainerLocation.Panel, 'panel']
	];

	const containers: INavigableViewContainer[] = [];
	for (const [location, name] of locations) {
		const container = viewsService.getVisibleViewContainer(location);
		if (!container) {
			continue;
		}

		const model = descriptorService.getViewContainerModel(container);
		containers.push({
			id: container.id,
			location: name,
			active: true,
			views: model.visibleViewDescriptors.map(view => ({
				id: view.id,
				visible: true,
				// Collapsed panes have a focusable header and are intentionally
				// kept in the normal navigation sequence.
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
	request: IViewNavigationRequest
): Promise<void> {
	const focusedView = viewsService.getFocusedView();
	const preferredContainerId = focusedView
		? descriptorService.getViewContainerByViewId(focusedView.id)?.id
		: undefined;

	const snapshot: IViewNavigationSnapshot = {
		containers: getVisibleViewContainers(viewsService, descriptorService),
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
