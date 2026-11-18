/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewsRegistry, IViewDescriptor, Extensions as ViewExtensions } from '../../../common/views.js';
import { VIEW_CONTAINER } from '../../files/browser/explorerViewlet.js';
import { ITimelineService, TimelinePaneId } from '../common/timeline.js';
import { TimelineHasProviderContext } from '../common/timelineService.js';
import { TimelinePane } from './timelinePane.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ISubmenuItem, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ICommandHandler, CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { getResourceForCommand } from '../../files/browser/files.js';

const timelineViewIcon = registerIcon('timeline-view-icon', Codicon.history, localize('timelineViewIcon', 'View icon of the timeline view.'));
const timelineOpenIcon = registerIcon('timeline-open', Codicon.history, localize('timelineOpenIcon', 'Icon for the open timeline action.'));

export class TimelinePaneDescriptor implements IViewDescriptor {
	readonly id = TimelinePaneId;
	readonly name: ILocalizedString = TimelinePane.TITLE;
	readonly containerIcon = timelineViewIcon;
	readonly ctorDescriptor = new SyncDescriptor(TimelinePane);
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
		'timeline.pageSize': {
			type: ['number', 'null'],
			default: 50,
			markdownDescription: localize('timeline.pageSize', "The number of items to show in the Timeline view by default and when loading more items. Setting to `null` will automatically choose a page size based on the visible area of the Timeline view."),
		},
		'timeline.pageOnScroll': {
			type: 'boolean',
			default: true,
			description: localize('timeline.pageOnScroll', "Controls whether the Timeline view will load the next page of items when you scroll to the end of the list."),
		},
	}
});

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([new TimelinePaneDescriptor()], VIEW_CONTAINER);

namespace OpenTimelineAction {

	export const ID = 'files.openTimeline';
	export const LABEL = localize('files.openTimeline', "Open Timeline");

	export function handler(): ICommandHandler {
		return async (accessor, arg) => {
			const timelineService = accessor.get(ITimelineService);
			const viewsService = accessor.get(IViewsService);

			// Fall back to the focused explorer item or active editor when invoked without a resource (e.g. from a keybinding)
			const uri = getResourceForCommand(arg, accessor.get(IEditorService), accessor.get(IListService));
			if (uri) {
				await timelineService.setUri(uri);
			} else {
				await viewsService.openView(TimelinePaneId, true);
			}
		};
	}
}

CommandsRegistry.registerCommand(OpenTimelineAction.ID, OpenTimelineAction.handler());

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, ({
	group: '4_timeline',
	order: 1,
	command: {
		id: OpenTimelineAction.ID,
		title: OpenTimelineAction.LABEL,
		icon: timelineOpenIcon
	},
	when: ContextKeyExpr.and(ResourceContextKey.HasResource, TimelineHasProviderContext)
}));

const timelineFilter = registerIcon('timeline-filter', Codicon.filter, localize('timelineFilter', 'Icon for the filter timeline action.'));

MenuRegistry.appendMenuItem(MenuId.TimelineTitle, {
	submenu: MenuId.TimelineFilterSubMenu,
	title: localize('filterTimeline', "Filter Timeline"),
	group: 'navigation',
	order: 100,
	icon: timelineFilter
} satisfies ISubmenuItem);
