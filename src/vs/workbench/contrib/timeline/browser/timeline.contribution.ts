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
			default: false //product.quality !== 'stable'
		},
	}
});

if (product.quality !== 'stable') {
	Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([new TimelinePaneDescriptor()], VIEW_CONTAINER);
}

registerSingleton(ITimelineService, TimelineService, true);
