/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ConfigurationService as BaseConfigurationService } from '../../../../platform/configuration/common/configurationService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { APPLICATION_SCOPES, APPLY_ALL_PROFILES_SETTING, IWorkbenchConfigurationService, RestrictedSettings } from '../../../../workbench/services/configuration/common/configuration.js';

// Import to register contributions
import '../../../../workbench/services/configuration/browser/configurationService.js';

export class ConfigurationService extends BaseConfigurationService implements IWorkbenchConfigurationService {
	readonly restrictedSettings: RestrictedSettings = { default: [] };
	readonly onDidChangeRestrictedSettings = Event.None;
	async whenRemoteConfigurationLoaded(): Promise<void> { }
	isSettingAppliedForAllProfiles(key: string): boolean {
		const scope = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()[key]?.scope;
		if (scope && APPLICATION_SCOPES.includes(scope)) {
			return true;
		}
		const allProfilesSettings = this.getValue<string[]>(APPLY_ALL_PROFILES_SETTING) ?? [];
		return Array.isArray(allProfilesSettings) && allProfilesSettings.includes(key);
	}
}
