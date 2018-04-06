/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import { StatusbarAlignment, IStatusbarRegistry, Extensions, StatusbarItemDescriptor } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { FeedbackStatusbarItem } from 'vs/workbench/parts/feedback/electron-browser/feedbackStatusbarItem';
import { localize } from 'vs/nls';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';

// Register Statusbar item
Registry.as<IStatusbarRegistry>(Extensions.Statusbar).registerStatusbarItem(new StatusbarItemDescriptor(
	FeedbackStatusbarItem,
	StatusbarAlignment.RIGHT,
	-100 /* towards the end of the right hand side */
));

// Configuration: Workbench
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	'id': 'workbench',
	'order': 7,
	'title': localize('workbenchConfigurationTitle', "Workbench"),
	'type': 'object',
	'properties': {
		'workbench.statusBar.feedback.visible': {
			'type': 'boolean',
			'default': true,
			'description': localize('feedbackVisibility', "Controls the visibility of the Twitter feedback (smiley) in the status bar at the bottom of the workbench.")
		}
	}
});