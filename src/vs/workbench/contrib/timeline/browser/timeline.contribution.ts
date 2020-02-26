/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IViewsRegistry, IViewDescriptor, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { VIEW_CONTAINER } from 'vs/workbench/contrib/files/browser/explorerViewlet';
import { ITimelineService } from 'vs/workbench/contrib/timeline/common/timeline';
import { TimelineService } from 'vs/workbench/contrib/timeline/common/timelineService';
import { TimelinePane } from './timelinePane';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { ICommandHandler, CommandsRegistry } from 'vs/platform/commands/common/commands';
import product from 'vs/platform/product/common/product';

export class TimelinePaneDescriptor implements IViewDescriptor {
	readonly id = TimelinePane.ID;
	readonly name = TimelinePane.TITLE;
	readonly ctorDescriptor = new SyncDescriptor(TimelinePane);
	readonly when = ContextKeyExpr.equals('config.timeline.showView', true);
	readonly order = 2;
	readonly weight = 30;
	readonly collapsed = true;
	readonly canToggleVisibility = true;
	readonly hideByDefault = false;
	readonly canMoveView = true;

	focusCommand = { id: 'timeline.focus' };
}

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'timeline',
	order: 1001,
	title: localize('timelineConfigurationTitle', "Timeline"),
	type: 'object',
	properties: {
		'timeline.showView': {
			type: 'boolean',
			description: localize('timeline.showView', "Experimental: When enabled, shows a Timeline view in the Explorer sidebar."),
			default: product.quality !== 'stable'
		},
		'timeline.excludeSources': {
			type: 'array',
			description: localize('timeline.excludeSources', "Experimental: An array of Timeline sources that should be excluded from the Timeline view"),
			default: null
		},
	}
});

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([new TimelinePaneDescriptor()], VIEW_CONTAINER);

namespace TimelineViewRefreshAction {

	export const ID = 'timeline.refresh';
	export const LABEL = localize('timeline.refreshView', "Refresh");

	export function handler(): ICommandHandler {
		return (accessor, arg) => {
			const service = accessor.get(ITimelineService);
			return service.reset();
		};
	}
}

CommandsRegistry.registerCommand(TimelineViewRefreshAction.ID, TimelineViewRefreshAction.handler());

// namespace TimelineViewRefreshHardAction {

// 	export const ID = 'timeline.refreshHard';
// 	export const LABEL = localize('timeline.refreshHard', "Refresh (Hard)");

// 	export function handler(fetch?: 'all' | 'more'): ICommandHandler {
// 		return (accessor, arg) => {
// 			const service = accessor.get(ITimelineService);
// 			return service.refresh(fetch);
// 		};
// 	}
// }

// CommandsRegistry.registerCommand(TimelineViewRefreshAction.ID, TimelineViewRefreshAction.handler());

// namespace TimelineViewLoadMoreAction {

// 	export const ID = 'timeline.loadMore';
// 	export const LABEL = localize('timeline.loadMoreInView', "Load More");

// 	export function handler(): ICommandHandler {
// 		return (accessor, arg) => {
// 			const service = accessor.get(ITimelineService);
// 			return service.refresh('more');
// 		};
// 	}
// }

// CommandsRegistry.registerCommand(TimelineViewLoadMoreAction.ID, TimelineViewLoadMoreAction.handler());

// namespace TimelineViewLoadAllAction {

// 	export const ID = 'timeline.loadAll';
// 	export const LABEL = localize('timeline.loadAllInView', "Load All");

// 	export function handler(): ICommandHandler {
// 		return (accessor, arg) => {
// 			const service = accessor.get(ITimelineService);
// 			return service.refresh('all');
// 		};
// 	}
// }

// CommandsRegistry.registerCommand(TimelineViewLoadAllAction.ID, TimelineViewLoadAllAction.handler());

MenuRegistry.appendMenuItem(MenuId.TimelineTitle, ({
	group: 'navigation',
	order: 1,
	command: {
		id: TimelineViewRefreshAction.ID,
		title: TimelineViewRefreshAction.LABEL,
		icon: { id: 'codicon/refresh' }
	}
}));

// MenuRegistry.appendMenuItem(MenuId.TimelineTitle, ({
// 	group: 'navigation',
// 	order: 2,
// 	command: {
// 		id: TimelineViewLoadMoreAction.ID,
// 		title: TimelineViewLoadMoreAction.LABEL,
// 		icon: { id: 'codicon/unfold' }
// 	},
// 	alt: {
// 		id: TimelineViewLoadAllAction.ID,
// 		title: TimelineViewLoadAllAction.LABEL,
// 		icon: { id: 'codicon/unfold' }

// 	}
// }));

registerSingleton(ITimelineService, TimelineService, true);
