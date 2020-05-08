/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { minSize, maxSize } from 'vs/base/browser/ui/sash/sash';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { SashSizeController } from 'vs/workbench/contrib/sash/browser/sash';

// Sash size contribution
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(SashSizeController, LifecyclePhase.Starting);

// Sash size configuration contribution
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		...workbenchConfigurationNodeBase,
		'properties': {
			'workbench.sash.size': {
				'type': 'number',
				'default': minSize,
				'minimum': minSize,
				'maximum': maxSize,
				'description': localize('sashSize', "Controls the size of the sash.")
			},
		}
	});
