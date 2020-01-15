/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IViewsRegistry, IViewDescriptor, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { VIEW_CONTAINER } from 'vs/workbench/contrib/files/browser/explorerViewlet';
import { ITimelineService } from 'vs/workbench/contrib/timeline/common/timeline';
import { TimelineService } from 'vs/workbench/contrib/timeline/common/timelineService';
import { TimelinePane } from './timelinePane';

export class TimelinePaneDescriptor implements IViewDescriptor {
	readonly id = TimelinePane.ID;
	readonly name = TimelinePane.TITLE;
	readonly ctorDescriptor = new SyncDescriptor(TimelinePane);
	readonly canToggleVisibility = true;
	readonly hideByDefault = false;
	readonly collapsed = true;
	readonly order = 2;
	readonly weight = 30;
	focusCommand = { id: 'timeline.focus' };
}

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([new TimelinePaneDescriptor()], VIEW_CONTAINER);

registerSingleton(ITimelineService, TimelineService, true);
