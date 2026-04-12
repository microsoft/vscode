/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ViewExtensions } from '../../../common/views.js';
import { VIEW_CONTAINER } from '../../files/browser/explorerViewlet.js';
import { ITimelineService, TimelinePaneId } from '../common/timeline.js';
import { TimelineHasProviderContext, TimelineService } from '../common/timelineService.js';
import { TimelinePane } from './timelinePane.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ExplorerFolderContext } from '../../files/common/files.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { URI } from '../../../../base/common/uri.js';
const timelineViewIcon = registerIcon('timeline-view-icon', Codicon.history, localize('timelineViewIcon', 'View icon of the timeline view.'));
const timelineOpenIcon = registerIcon('timeline-open', Codicon.history, localize('timelineOpenIcon', 'Icon for the open timeline action.'));
export class TimelinePaneDescriptor {
    constructor() {
        this.id = TimelinePaneId;
        this.name = TimelinePane.TITLE;
        this.containerIcon = timelineViewIcon;
        this.ctorDescriptor = new SyncDescriptor(TimelinePane);
        this.order = 2;
        this.weight = 30;
        this.collapsed = true;
        this.canToggleVisibility = true;
        this.hideByDefault = false;
        this.canMoveView = true;
        this.when = TimelineHasProviderContext;
        this.focusCommand = { id: 'timeline.focus' };
    }
}
// Configuration
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
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
Registry.as(ViewExtensions.ViewsRegistry).registerViews([new TimelinePaneDescriptor()], VIEW_CONTAINER);
var OpenTimelineAction;
(function (OpenTimelineAction) {
    OpenTimelineAction.ID = 'files.openTimeline';
    OpenTimelineAction.LABEL = localize('files.openTimeline', "Open Timeline");
    function handler() {
        return (accessor, arg) => {
            const service = accessor.get(ITimelineService);
            if (URI.isUri(arg)) {
                return service.setUri(arg);
            }
        };
    }
    OpenTimelineAction.handler = handler;
})(OpenTimelineAction || (OpenTimelineAction = {}));
CommandsRegistry.registerCommand(OpenTimelineAction.ID, OpenTimelineAction.handler());
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, ({
    group: '4_timeline',
    order: 1,
    command: {
        id: OpenTimelineAction.ID,
        title: OpenTimelineAction.LABEL,
        icon: timelineOpenIcon
    },
    when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource, TimelineHasProviderContext)
}));
const timelineFilter = registerIcon('timeline-filter', Codicon.filter, localize('timelineFilter', 'Icon for the filter timeline action.'));
MenuRegistry.appendMenuItem(MenuId.TimelineTitle, {
    submenu: MenuId.TimelineFilterSubMenu,
    title: localize('filterTimeline', "Filter Timeline"),
    group: 'navigation',
    order: 100,
    icon: timelineFilter
});
registerSingleton(ITimelineService, TimelineService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGltZWxpbmUuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGltZWxpbmUvYnJvd3Nlci90aW1lbGluZS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRixPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBbUMsVUFBVSxJQUFJLGNBQWMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3pHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDekUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzNGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNqRCxPQUFPLEVBQTBCLFVBQVUsSUFBSSx1QkFBdUIsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQ25KLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQWdCLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNwRyxPQUFPLEVBQW1CLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDckcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDcEUsT0FBTyxFQUFF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