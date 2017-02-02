/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/platform';
import { WelcomePageContribution, WelcomePageAction } from 'vs/workbench/parts/welcome/page/electron-browser/welcomePage';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { isWelcomePageEnabled } from 'vs/platform/telemetry/common/telemetryUtils';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		'id': 'workbench',
		'order': 7,
		'title': localize('workbenchConfigurationTitle', "Workbench"),
		'properties': {
			'workbench.welcome.enabled': {
				'type': 'boolean',
				'default': isWelcomePageEnabled(),
				'description': localize('welcomePage.enabled', "When enabled, will show the Welcome experience on startup.")
			},
		}
	});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WelcomePageContribution);

Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(WelcomePageAction, WelcomePageAction.ID, WelcomePageAction.LABEL), 'Help: Welcome', localize('help', "Help"));
