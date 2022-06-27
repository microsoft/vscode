/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWeb } from 'vs/base/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { PROFILES_ENABLEMENT_CONFIG, PROFILES_ENABLEMENT_CONFIG_SCHEMA } from 'vs/platform/userDataProfile/common/userDataProfile';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { UserDataProfilesWorkbenchContribution } from 'vs/workbench/contrib/userDataProfile/browser/userDataProfile';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import '../common/profileActions';
import '../common/userDataProfileActions';

if (!isWeb) {
	Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
		...workbenchConfigurationNodeBase,
		'properties': {
			[PROFILES_ENABLEMENT_CONFIG]: PROFILES_ENABLEMENT_CONFIG_SCHEMA
		}
	});
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UserDataProfilesWorkbenchContribution, LifecyclePhase.Ready);
